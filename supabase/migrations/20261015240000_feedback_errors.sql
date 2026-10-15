-- Action_Plan.md section 5 (carried over): a tester feedback channel and error monitoring.
--
-- One table holds both: what a person writes (an idea, a problem, a question) and what the
-- browser caught (an uncaught error or a failed render, reported by the page itself). Nothing
-- reads the table directly: every write is a function, the list is for holders of
-- «عرض صحة النظام وسجل الإعدادات» (settings.view), and marking is for «تعديل الإعدادات العامة»
-- (settings.manage). There is no background worker and no outside service: errors are the site's
-- own, kept in the site's database.
--
-- An error report is scrubbed here, not trusted from the browser: the address loses its query and
-- fragment, an e-mail address and a long token-like string in the message are replaced, the text is
-- cut. Equal errors (same message and place) are one row with a counter, so a loop cannot fill the
-- table, and the whole channel is rate limited (20 notes a day per person, 100 new errors an hour).

create table public.feedback_reports (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('idea', 'problem', 'question', 'error')),
  author text,
  page text check (page is null or char_length(page) <= 120),
  body text not null check (char_length(body) between 1 and 2000),
  place text check (place is null or char_length(place) <= 300),
  digest text check (digest is null or char_length(digest) = 32),
  count int not null default 1 check (count >= 1),
  state text not null default 'new' check (state in ('new', 'seen', 'done')),
  created_at timestamptz not null default now(),
  last_at timestamptz not null default now(),
  handled_by text,
  handled_at timestamptz
);
create index feedback_reports_state_idx on public.feedback_reports (state, last_at desc);
create unique index feedback_reports_error_digest_idx on public.feedback_reports (digest) where kind = 'error' and state <> 'done';
alter table public.feedback_reports enable row level security;
-- No policy on purpose: the table is reached only through the functions below.

-- The address of a page without what a person typed in it.
create function public.feedback_clean_page(p_page text) returns text
language sql immutable set search_path = ''
as $$
  select case when p_page ~ '^/' then left(split_part(split_part(p_page, '?', 1), '#', 1), 120) end
$$;

-- An error line without addresses, long tokens or query strings.
create function public.feedback_scrub(p_text text, p_max int) returns text
language sql immutable set search_path = ''
as $$
  select left(regexp_replace(regexp_replace(regexp_replace(coalesce(p_text, ''),
      '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', '[بريد]', 'g'),
      '[A-Za-z0-9_-]{32,}', '[رمز]', 'g'),
      '\?[^\s)]*', '', 'g'), p_max)
$$;

-- A person's note. Returns its id.
create function public.feedback_submit(p_kind text, p_page text, p_body text) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare me text := public.current_email(); v_id uuid; v_body text := btrim(coalesce(p_body, ''));
begin
  if me is null or not public.is_approved() then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if p_kind not in ('idea', 'problem', 'question') then raise exception 'KIND_INVALID' using errcode = 'P0001'; end if;
  if char_length(v_body) = 0 then raise exception 'TEXT_REQUIRED' using errcode = 'P0001'; end if;
  if char_length(v_body) > 2000 then raise exception 'TEXT_TOO_LONG' using errcode = 'P0001'; end if;
  if (select count(*) from public.feedback_reports r
       where r.author = me and r.kind <> 'error' and r.created_at > now() - interval '1 day') >= 20 then
    raise exception 'FEEDBACK_LIMIT' using errcode = 'P0001';
  end if;
  insert into public.feedback_reports (kind, author, page, body)
  values (p_kind, me, public.feedback_clean_page(p_page), v_body) returning id into v_id;
  return v_id;
end
$$;

-- What the browser caught. Silent: it returns nothing and never raises for the caller's sake.
create function public.error_report(p_page text, p_message text, p_where text) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  me text := public.current_email(); v_msg text := public.feedback_scrub(p_message, 300);
  v_where text := public.feedback_scrub(p_where, 300); v_digest text;
begin
  if me is null or not public.is_approved() or btrim(v_msg) = '' then return; end if;
  v_digest := md5(v_msg || '|' || v_where);
  update public.feedback_reports set count = count + 1, last_at = now(), state = case when state = 'seen' then 'new' else state end
    where kind = 'error' and digest = v_digest and state <> 'done';
  if found then return; end if;
  if (select count(*) from public.feedback_reports r where r.kind = 'error' and r.created_at > now() - interval '1 hour') >= 100 then
    return;
  end if;
  insert into public.feedback_reports (kind, author, page, body, place, digest)
  values ('error', me, public.feedback_clean_page(p_page), v_msg, nullif(v_where, ''), v_digest);
end
$$;

-- The inbox, newest first. For holders of settings.view.
create function public.feedback_list(p_limit int default 200) returns table (
  id uuid, kind text, author text, author_name text, page text, body text, place text,
  count int, state text, created_at timestamptz, last_at timestamptz, handled_by text, handled_at timestamptz
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.has_capability('settings.view', null) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  return query
    select r.id, r.kind, r.author, a.display_name, r.page, r.body, r.place, r.count, r.state, r.created_at, r.last_at, r.handled_by, r.handled_at
      from public.feedback_reports r left join public.accounts a on a.email = r.author
     order by (r.state = 'new') desc, r.last_at desc
     limit greatest(1, least(coalesce(p_limit, 200), 500));
end
$$;

-- new | seen | done. For holders of settings.manage.
create function public.feedback_mark(p_id uuid, p_state text) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.has_capability('settings.manage', null) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if p_state not in ('new', 'seen', 'done') then raise exception 'STATE_INVALID' using errcode = 'P0001'; end if;
  update public.feedback_reports
     set state = p_state, handled_by = case when p_state = 'new' then null else public.current_email() end,
         handled_at = case when p_state = 'new' then null else now() end
   where id = p_id;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
end
$$;

revoke all on function public.feedback_clean_page(text), public.feedback_scrub(text, int) from public, anon, authenticated;
revoke all on function public.feedback_submit(text, text, text), public.error_report(text, text, text),
  public.feedback_list(int), public.feedback_mark(uuid, text) from public, anon;
grant execute on function public.feedback_submit(text, text, text), public.error_report(text, text, text),
  public.feedback_list(int), public.feedback_mark(uuid, text) to authenticated;

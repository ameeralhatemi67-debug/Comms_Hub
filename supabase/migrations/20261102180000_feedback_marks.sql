-- Marks on a note (MVP_draft.md section 69, owner directive of 2026-11-02): what a tester points at, saved as data.
--
-- A note gains its severity, up to three marks, an outline of the screen and its context, all on the note's own row:
-- no picture, no file and nothing in Drive. An outline is rectangles and numbers with no words, so it shows where things
-- were and nothing of what they said. Nothing is trusted from the browser: every part is rebuilt here from the fields it
-- may hold, and on the mail pages (mail and messaging, which stay private from administrators) a mark keeps only the
-- word for what it is and the open window's title is dropped.
--
-- A note's author reads their own notes (feedback_mine) and hears when one is handled, through the «للعلم» tier, which is
-- never pushed. Equal notes can be merged into one and separated again; a merged note keeps its own row and text, and
-- follows the state of the note it joined. The daily limit rises from 20 to 50 for the test week.

alter table public.feedback_reports
  add column severity text check (severity in ('blocking', 'annoying', 'cosmetic')),
  add column marks jsonb check (marks is null or octet_length(marks::text) <= 1500),
  add column outline jsonb check (outline is null or octet_length(outline::text) <= 6000),
  add column context jsonb check (context is null or octet_length(context::text) <= 2000),
  add column duplicate_of uuid references public.feedback_reports (id) on delete set null,
  add constraint feedback_reports_severity_kind check (severity is null or kind = 'problem');
create index feedback_reports_author_idx on public.feedback_reports (author, created_at desc) where kind <> 'error';
create index feedback_reports_duplicate_idx on public.feedback_reports (duplicate_of) where duplicate_of is not null;

-- Pages whose content is private from administrators. Held equal to PRIVATE_PATHS in src/lib/feedback/marks.ts by a test.
create function public.feedback_private_page(p_page text) returns boolean
language sql immutable set search_path = ''
as $$ select coalesce(p_page ~ '^/mail(/|$)', false) $$;

-- Up to three marks, each rebuilt from its own fields. Anything malformed is dropped, because a note must never fail for
-- its marks. Positions are thousandths of the screen.
create function public.feedback_clean_marks(p_marks jsonb, p_private boolean) returns jsonb
language plpgsql immutable set search_path = ''
as $$
declare v jsonb; v_out jsonb := '[]'::jsonb; v_el text;
begin
  if p_marks is null or jsonb_typeof(p_marks) <> 'array' then return null; end if;
  for v in select e from jsonb_array_elements(p_marks) with ordinality as t(e, o) order by o loop
    exit when jsonb_array_length(v_out) >= 3;
    continue when jsonb_typeof(v) <> 'object' or coalesce(v ->> 't', '') not in ('p', 'b')
      or coalesce(v ->> 'x', '') !~ '^\d{1,4}$' or coalesce(v ->> 'y', '') !~ '^\d{1,4}$'
      or coalesce(v ->> 'w', '') !~ '^\d{1,4}$' or coalesce(v ->> 'h', '') !~ '^\d{1,4}$';
    v_el := public.feedback_scrub(v ->> 'el', 80);
    v_out := v_out || jsonb_build_object(
      't', v ->> 't',
      'x', least((v ->> 'x')::int, 1000),
      'y', least((v ->> 'y')::int, 1000),
      'w', case when v ->> 't' = 'p' then 0 else least((v ->> 'w')::int, 1000) end,
      'h', case when v ->> 't' = 'p' then 0 else least((v ->> 'h')::int, 1000) end,
      'el', case when p_private then split_part(v_el, ' «', 1) else v_el end,
      'sel', left(regexp_replace(coalesce(v ->> 'sel', ''), '[^A-Za-z0-9_. >-]', '', 'g'), 200));
  end loop;
  return nullif(v_out, '[]'::jsonb);
end
$$;

-- The screen as rectangles: its size and at most 140 lines of five whole numbers (x, y, width, height, kind). No words can
-- pass through this. An outline that is not exactly this is dropped whole.
create function public.feedback_clean_outline(p_outline jsonb) returns jsonb
language plpgsql immutable set search_path = ''
as $$
declare v jsonb; v_r jsonb := '[]'::jsonb;
begin
  if p_outline is null or jsonb_typeof(p_outline) <> 'object' or jsonb_typeof(p_outline -> 'r') is distinct from 'array' then return null; end if;
  if coalesce(p_outline ->> 'w', '') !~ '^[1-9]\d{0,4}$' or coalesce(p_outline ->> 'h', '') !~ '^[1-9]\d{0,4}$' then return null; end if;
  if jsonb_array_length(p_outline -> 'r') > 140 then return null; end if;
  for v in select e from jsonb_array_elements(p_outline -> 'r') as t(e) loop
    if jsonb_typeof(v) <> 'array' or jsonb_array_length(v) <> 5 then return null; end if;
    if exists (select 1 from jsonb_array_elements(v) as n(e) where jsonb_typeof(n.e) <> 'number' or n.e #>> '{}' !~ '^\d{1,5}$') then return null; end if;
    v_r := v_r || jsonb_build_array(v);
  end loop;
  return jsonb_build_object('w', (p_outline ->> 'w')::int, 'h', (p_outline ->> 'h')::int, 'r', v_r);
end
$$;

-- The note's surroundings. The role comes from the account, never from the browser; the rest is kept only if it has the
-- shape it should. The window's title and the errors can hold words, so they are scrubbed like an error report.
create function public.feedback_clean_context(p_context jsonb, p_role text, p_private boolean) returns jsonb
language plpgsql immutable set search_path = ''
as $$
declare
  c jsonb := case when jsonb_typeof(p_context) = 'object' then p_context else '{}'::jsonb end;
  v_out jsonb := jsonb_strip_nulls(jsonb_build_object('role', p_role));
  v_title text := btrim(public.feedback_scrub(c ->> 'dialog', 80));
  v_errors jsonb;
begin
  if c ->> 'viewAs' ~ '^[a-z_]{1,24}$' then v_out := v_out || jsonb_build_object('viewAs', c ->> 'viewAs'); end if;
  if c ->> 'build' ~ '^[a-z0-9]{1,12}$' then v_out := v_out || jsonb_build_object('build', c ->> 'build'); end if;
  if c ->> 'app' in ('web', 'desktop', 'android', 'ios') then v_out := v_out || jsonb_build_object('app', c ->> 'app'); end if;
  if c ->> 'appVersion' ~ '^\d{1,4}\.\d{1,4}\.\d{1,4}$' then v_out := v_out || jsonb_build_object('appVersion', c ->> 'appVersion'); end if;
  if c ->> 'w' ~ '^\d{1,5}$' then v_out := v_out || jsonb_build_object('w', (c ->> 'w')::int); end if;
  if c ->> 'h' ~ '^\d{1,5}$' then v_out := v_out || jsonb_build_object('h', (c ->> 'h')::int); end if;
  if c ->> 'dpr' ~ '^\d{1,2}(\.\d{1,2})?$' then v_out := v_out || jsonb_build_object('dpr', (c ->> 'dpr')::numeric); end if;
  if c ->> 'theme' in ('light', 'dark') then v_out := v_out || jsonb_build_object('theme', c ->> 'theme'); end if;
  if not p_private and v_title <> '' then v_out := v_out || jsonb_build_object('dialog', v_title); end if;
  if jsonb_typeof(c -> 'errors') = 'array' then
    select jsonb_agg(public.feedback_scrub(x.e, 200)) into v_errors
      from (select e from jsonb_array_elements_text(c -> 'errors') with ordinality as t(e, o) order by o limit 3) x;
    if v_errors is not null then v_out := v_out || jsonb_build_object('errors', v_errors); end if;
  end if;
  return v_out;
end
$$;

-- A person's note, with what they marked. The old three-argument call keeps working while the site is being deployed.
drop function public.feedback_submit(text, text, text);
create function public.feedback_submit(
  p_kind text, p_page text, p_body text,
  p_severity text default null, p_marks jsonb default null, p_outline jsonb default null, p_context jsonb default null
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  me text := public.current_email(); v_id uuid; v_body text := btrim(coalesce(p_body, ''));
  v_page text := public.feedback_clean_page(p_page); v_private boolean := public.feedback_private_page(v_page);
  v_role text; v_marks jsonb; v_severity text;
begin
  if me is null or not public.is_approved() then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if p_kind not in ('idea', 'problem', 'question') then raise exception 'KIND_INVALID' using errcode = 'P0001'; end if;
  if char_length(v_body) = 0 then raise exception 'TEXT_REQUIRED' using errcode = 'P0001'; end if;
  if char_length(v_body) > 2000 then raise exception 'TEXT_TOO_LONG' using errcode = 'P0001'; end if;
  if p_severity is not null and p_severity not in ('blocking', 'annoying', 'cosmetic') then raise exception 'SEVERITY_INVALID' using errcode = 'P0001'; end if;
  if (select count(*) from public.feedback_reports r
       where r.author = me and r.kind <> 'error' and r.created_at > now() - interval '1 day') >= 50 then
    raise exception 'FEEDBACK_LIMIT' using errcode = 'P0001';
  end if;
  v_severity := case when p_kind = 'problem' then coalesce(p_severity, 'annoying') end;
  v_marks := public.feedback_clean_marks(p_marks, v_private);
  select a.role into v_role from public.accounts a where a.email = me;
  insert into public.feedback_reports (kind, author, page, body, severity, marks, outline, context)
  values (p_kind, me, v_page, v_body, v_severity, v_marks,
          case when v_marks is not null then public.feedback_clean_outline(p_outline) end,
          public.feedback_clean_context(p_context, v_role, v_private))
  returning id into v_id;
  return v_id;
end
$$;

-- The inbox now carries the new fields, and merged notes, which the page lists under the note they joined.
drop function public.feedback_list(int);
create function public.feedback_list(p_limit int default 200) returns table (
  id uuid, kind text, author text, author_name text, page text, body text, place text,
  count int, state text, created_at timestamptz, last_at timestamptz, handled_by text, handled_at timestamptz,
  severity text, marks jsonb, outline jsonb, context jsonb, duplicate_of uuid
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.has_capability('settings.view', null) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  return query
    select r.id, r.kind, r.author, a.display_name, r.page, r.body, r.place, r.count, r.state, r.created_at, r.last_at, r.handled_by, r.handled_at,
           r.severity, r.marks, r.outline, r.context, r.duplicate_of
      from public.feedback_reports r left join public.accounts a on a.email = r.author
     order by (r.state = 'new') desc, r.last_at desc
     limit greatest(1, least(coalesce(p_limit, 200), 500));
end
$$;

-- A person's own notes and how far each has gone.
create function public.feedback_mine(p_limit int default 50) returns table (
  id uuid, kind text, severity text, page text, body text, state text, created_at timestamptz, handled_at timestamptz
)
language plpgsql stable security definer set search_path = ''
as $$
declare me text := public.current_email();
begin
  if me is null or not public.is_approved() then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  return query
    select r.id, r.kind, r.severity, r.page, r.body, r.state, r.created_at, r.handled_at
      from public.feedback_reports r
     where r.author = me and r.kind <> 'error'
     order by r.created_at desc
     limit greatest(1, least(coalesce(p_limit, 50), 200));
end
$$;

-- Tells a note's author it was handled. work_notify already skips the person who did it.
create function public.feedback_tell(p_author text, p_body text) returns void
language sql security definer set search_path = ''
as $$
  select public.work_notify(p_author, 'info', 'عولجت ملاحظتك: «' || left(btrim(p_body), 60) || '»', jsonb_build_object('page', 'profile'))
$$;

-- new | seen | done, for a note and everything merged into it. For holders of settings.manage.
create or replace function public.feedback_mark(p_id uuid, p_state text) returns void
language plpgsql security definer set search_path = ''
as $$
declare r record;
begin
  if not public.has_capability('settings.manage', null) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if p_state not in ('new', 'seen', 'done') then raise exception 'STATE_INVALID' using errcode = 'P0001'; end if;
  if (select x.duplicate_of from public.feedback_reports x where x.id = p_id) is not null then raise exception 'MERGED' using errcode = 'P0001'; end if;
  update public.feedback_reports
     set state = p_state, handled_by = case when p_state = 'new' then null else public.current_email() end,
         handled_at = case when p_state = 'new' then null else now() end
   where id = p_id or duplicate_of = p_id;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  if p_state = 'done' then
    for r in select x.author, x.body from public.feedback_reports x where (x.id = p_id or x.duplicate_of = p_id) and x.kind <> 'error' loop
      perform public.feedback_tell(r.author, r.body);
    end loop;
  end if;
end
$$;

-- Merges one note into another, or separates it again when p_into is null. Errors have their own counter and never merge.
-- What was merged into a note goes with it, so a merge is always one level deep.
create function public.feedback_merge(p_id uuid, p_into uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare s public.feedback_reports; t public.feedback_reports; r record;
begin
  if not public.has_capability('settings.manage', null) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  select * into s from public.feedback_reports x where x.id = p_id for update;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  if s.kind = 'error' then raise exception 'MERGE_INVALID' using errcode = 'P0001'; end if;
  if s.duplicate_of is not null then
    update public.feedback_reports x set count = greatest(1, x.count - s.count) where x.id = s.duplicate_of;
    update public.feedback_reports x set duplicate_of = null where x.id = s.id;
  end if;
  if p_into is null then return; end if;
  select * into t from public.feedback_reports x where x.id = p_into for update;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  if t.kind = 'error' or t.id = s.id or t.duplicate_of is not null then raise exception 'MERGE_INVALID' using errcode = 'P0001'; end if;
  update public.feedback_reports x set count = x.count + s.count, last_at = greatest(x.last_at, s.last_at) where x.id = t.id;
  update public.feedback_reports x
     set duplicate_of = t.id, count = 1, state = t.state, handled_by = t.handled_by, handled_at = t.handled_at
   where x.id = s.id or x.duplicate_of = s.id;
  if t.state = 'done' then
    perform public.feedback_tell(s.author, s.body);
  end if;
end
$$;

revoke all on function public.feedback_private_page(text), public.feedback_clean_marks(jsonb, boolean), public.feedback_clean_outline(jsonb),
  public.feedback_clean_context(jsonb, text, boolean), public.feedback_tell(text, text) from public, anon, authenticated;
revoke all on function public.feedback_submit(text, text, text, text, jsonb, jsonb, jsonb), public.feedback_list(int), public.feedback_mine(int),
  public.feedback_merge(uuid, uuid) from public, anon;
grant execute on function public.feedback_submit(text, text, text, text, jsonb, jsonb, jsonb), public.feedback_list(int), public.feedback_mine(int),
  public.feedback_merge(uuid, uuid) to authenticated;

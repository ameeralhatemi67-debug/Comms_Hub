-- X's link route (owner directive of 2026-11-25; MVP_draft.md section 81). X's own API is paid, so an X account may also be used by
-- hand-off: the site prepares the post (the text, the files, a link that opens X's composer with the text filled in) and the person
-- posts it on X themselves, then gives the post's link. Nothing is sent to X from here, and no token or key is involved.
--
--   * `platform_accounts.route`: 'api' (today's accounts, connected or simulated) or 'link'. Only an X account may be 'link'.
--   * `account_add_link`: adds an X account for the link route. It needs only a name and the handle: no sign-in, and no authorisation
--     that runs out (`authorized_until` stays null).
--   * «نشر الآن» and the due run: a link account is not simulated. Its result is `{ok:false, pending:true, route:'link'}` and the work
--     is «جارٍ النشر» (PUBLISHING) until every link account has been confirmed. The publishers of those accounts are told.
--   * `work_link_confirm`: the publisher says the post is up and gives its link, or says it was not posted. The link must be a post
--     of that account's own handle (x.com or twitter.com, /<handle>/status/<id>) and may be used once. The work then becomes
--     PUBLISHED, PARTIAL or FAILED as before, and a retry sends the failed accounts again.
--   * Approval does not change: the work was approved with its accounts before it reached «نشر الآن».
-- Everything else of publishing is unchanged, and it is still a simulation for every account that is not on the link route.
-- Checked on a private database by supabase/tests/x_link_route_rules.sql (qa/x-link-route-rules.json).

alter table public.platform_accounts
  add column route text not null default 'api' check (route in ('api','link'));
alter table public.platform_accounts
  add constraint platform_accounts_link_only_x check (route = 'api' or platform = 'x');

-- ---------------------------------------------------------------------------
-- 1. A post's link: [handle, id], or null. The same pattern is in src/lib/work/x-link.ts (tests/x-link.test.mjs holds them equal).
-- ---------------------------------------------------------------------------
create function public.x_post_parse(p_url text) returns text[]
language sql immutable set search_path = ''
as $$ select regexp_match(btrim(coalesce(p_url, '')),
  '^https?://(?:www\.|mobile\.)?(?:x|twitter)\.com/([A-Za-z0-9_]{1,15})/status/([0-9]{5,25})(?:[/?#].*)?$', 'i') $$;

-- ---------------------------------------------------------------------------
-- 2. Adding an X account for the link route
-- ---------------------------------------------------------------------------
create function public.account_add_link(p_label text, p_handle text, p_publishers text[]) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare me text := public.current_email(); v_pub text[]; v_handle text; v_id uuid;
begin
  if not public.account_manager() then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if char_length(btrim(coalesce(p_label, ''))) not between 1 and 60 then raise exception 'LABEL_REQUIRED' using errcode = 'P0001'; end if;
  v_handle := regexp_replace(btrim(coalesce(p_handle, '')), '^@', '');
  if v_handle !~ '^[A-Za-z0-9_]{1,15}$' then raise exception 'HANDLE_INVALID' using errcode = 'P0001'; end if;
  v_handle := '@' || v_handle;
  select coalesce(array_agg(distinct x.e), '{}') into v_pub
    from unnest(coalesce(p_publishers, '{}'::text[])) x(e) join public.accounts c on c.email = x.e and c.role <> 'member';
  if cardinality(v_pub) = 0 then raise exception 'PUBLISHER_REQUIRED' using errcode = 'P0001'; end if;
  if exists (select 1 from public.platform_accounts x where x.platform = 'x' and lower(x.handle) = lower(v_handle)) then
    raise exception 'HANDLE_TAKEN' using errcode = 'P0001';
  end if;
  insert into public.platform_accounts (platform, label, handle, purpose, authorized_until, publishers, mode, route, added_by)
  values ('x', btrim(p_label), v_handle, null, null, v_pub, 'ask', 'link', me)
  returning id into v_id;
  perform public.work_notify_many(v_pub, 'info', public.work_name(me) || ' أضاف حساب «' || public.work_account_name(v_id)
    || '» للنشر بالرابط وجعلك ممن ينشر عليه.', jsonb_build_object('page','accounts'));
  return v_id;
end
$$;

-- ---------------------------------------------------------------------------
-- 3. The run: a link account waits for its publisher
-- ---------------------------------------------------------------------------
-- As in 20261105230000_work_youtube_choices.sql, with one more branch: an account on the link route that could be sent to is not
-- simulated, it is waiting. The work stays «جارٍ النشر» while any account waits.
create or replace function public.work_run_publish(p_work text, p_channels uuid[], p_when timestamptz, p_label text) returns text
language plpgsql security definer set search_path = ''
as $$
declare w public.works; c uuid; ok boolean; over boolean; res jsonb; good text[] := '{}'; bad text[] := '{}'; okn int; pend int; st text;
  v_plat text; v_route text; v_priv text; v_narrow text[] := '{}'; v_wait text[] := '{}'; v_wait_pub text[] := '{}'; v_pubs text[];
begin
  select * into w from public.works where id = p_work for update;
  res := w.results;
  foreach c in array p_channels loop
    select a.active and (a.authorized_until is null or a.authorized_until > p_when), a.platform, a.route, a.publishers
      into ok, v_plat, v_route, v_pubs from public.platform_accounts a where a.id = c;
    ok := coalesce(ok, false);
    over := ok and cardinality(public.work_copy_errors(p_work, c)) > 0;
    if over then ok := false; end if;
    -- A link account goes no further than its hand-off: the post is made on X by a person.
    if ok and v_route = 'link' then
      res := res || jsonb_build_object(c::text, jsonb_build_object('ok', false, 'pending', true, 'route', 'link', 'at', p_when, 'why', 'بانتظار نشرك على X'));
      v_wait := v_wait || public.work_account_name(c);
      v_wait_pub := v_wait_pub || coalesce(v_pubs, '{}'::text[]);
      continue;
    end if;
    -- A YouTube account: what it was asked, a scheduled one public at its time, a work from before the choice public.
    v_priv := case when v_plat = 'youtube' then
      case coalesce(w.pub_options->>c::text, 'public') when 'scheduled' then 'public' else coalesce(w.pub_options->>c::text, 'public') end end;
    res := res || jsonb_build_object(c::text, jsonb_build_object('ok', ok, 'at', p_when,
      'why', case when ok then null when over then 'النسخة تتجاوز حد المنصة' else 'التفويض منتهٍ' end)
      || case when v_priv is not null then jsonb_build_object('privacy', v_priv) else '{}'::jsonb end);
    if ok then
      good := good || (public.work_account_name(c) || case when v_priv in ('unlisted','private') then ' (' || public.yt_privacy_ar(v_priv) || ')' else '' end);
      if v_priv in ('unlisted','private') then v_narrow := v_narrow || (public.work_account_name(c) || ': ' || public.yt_privacy_ar(v_priv)); end if;
    else
      bad := bad || public.work_account_name(c);
    end if;
  end loop;
  select count(*) filter (where coalesce((res->x::text->>'ok')::boolean, false)),
         count(*) filter (where coalesce((res->x::text->>'pending')::boolean, false))
    into okn, pend from unnest(w.channels) x;
  st := case when pend > 0 then 'PUBLISHING' when okn = cardinality(w.channels) then 'PUBLISHED' when okn > 0 then 'PARTIAL' else 'FAILED' end;
  update public.works set results = res, status = st, pub_at = p_when, sched_at = coalesce(sched_at, p_when),
      confirm_pending = false, updated_at = now()
    where id = p_work;
  perform public.work_log_add(p_work, 'publish', p_label || ': '
    || case when cardinality(good) > 0 then 'نجح ' || array_to_string(good, '، ') else '' end
    || case when cardinality(good) > 0 and cardinality(bad) > 0 then '، و' else '' end
    || case when cardinality(bad) > 0 then 'فشل ' || array_to_string(bad, '، ') else '' end
    || case when cardinality(v_wait) > 0 then case when cardinality(good) + cardinality(bad) > 0 then '، و' else '' end
         || 'بانتظار النشر بالرابط ' || array_to_string(v_wait, '، ') else '' end,
    jsonb_build_object('status', st, 'simulated', cardinality(v_wait) < cardinality(p_channels)));
  perform public.work_notify_many(array[w.assignee] || public.work_writers(p_work), case when st = 'PUBLISHED' then 'info' else 'attention' end,
    '«' || w.title || '»: ' || public.work_status_ar(st) || '.'
      || case when cardinality(v_narrow) > 0 then ' ' || array_to_string(v_narrow, '، ') || '.' else '' end
      || case when cardinality(v_wait) > 0 then ' بانتظار النشر بالرابط: ' || array_to_string(v_wait, '، ') || '.' else '' end,
    public.work_go(p_work));
  if cardinality(v_wait) > 0 then
    perform public.work_notify_many(v_wait_pub, 'attention', '«' || w.title || '» ينتظر نشرك على X بالرابط: ' || array_to_string(v_wait, '، ') || '.', public.work_go(p_work));
  end if;
  perform public.work_sync_assets(p_work);
  return st;
end
$$;

-- ---------------------------------------------------------------------------
-- 4. The publisher says it was posted, with the post's link, or that it was not
-- ---------------------------------------------------------------------------
create function public.work_link_confirm(p_work text, p_account uuid, p_url text, p_ok boolean) returns text
language plpgsql security definer set search_path = ''
as $$
declare w public.works; a public.platform_accounts; m text[]; v_url text; res jsonb; okn int; pend int; st text; nm text;
begin
  select * into w from public.works where id = p_work for update;
  if not found or w.closed_at is not null or not public.work_may_publish(p_work) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  select * into a from public.platform_accounts where id = p_account;
  if not found or a.route <> 'link' or not (p_account = any (w.channels)) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if w.status <> 'PUBLISHING' or not coalesce((w.results->p_account::text->>'pending')::boolean, false) then
    raise exception 'STATUS_DENIED' using errcode = 'P0001';
  end if;
  nm := public.work_account_name(p_account);
  res := w.results;
  if coalesce(p_ok, true) then
    m := public.x_post_parse(p_url);
    if m is null then raise exception 'POST_LINK_INVALID' using errcode = 'P0001'; end if;
    if lower(m[1]) <> lower(regexp_replace(coalesce(a.handle, ''), '^@', '')) then raise exception 'POST_LINK_OTHER_ACCOUNT' using errcode = 'P0001'; end if;
    v_url := 'https://x.com/' || m[1] || '/status/' || m[2];
    if exists (select 1 from public.works x, jsonb_each(x.results) e where e.value->>'url' = v_url) then
      raise exception 'POST_LINK_USED' using errcode = 'P0001';
    end if;
    res := res || jsonb_build_object(p_account::text, jsonb_build_object('ok', true, 'at', now(), 'route', 'link', 'url', v_url));
  else
    res := res || jsonb_build_object(p_account::text, jsonb_build_object('ok', false, 'at', now(), 'route', 'link', 'why', 'لم يُنشر بالرابط'));
  end if;
  select count(*) filter (where coalesce((res->x::text->>'ok')::boolean, false)),
         count(*) filter (where coalesce((res->x::text->>'pending')::boolean, false))
    into okn, pend from unnest(w.channels) x;
  st := case when pend > 0 then 'PUBLISHING' when okn = cardinality(w.channels) then 'PUBLISHED' when okn > 0 then 'PARTIAL' else 'FAILED' end;
  update public.works set results = res, status = st, pub_at = case when st = 'PUBLISHING' then pub_at else now() end, updated_at = now()
    where id = p_work;
  perform public.work_log_add(p_work, 'publish',
    case when coalesce(p_ok, true) then 'نُشر بالرابط على ' || nm || ': ' || v_url else 'لم يُنشر بالرابط على ' || nm end,
    jsonb_build_object('status', st, 'simulated', false));
  if st <> 'PUBLISHING' then
    perform public.work_notify_many(array[w.assignee] || public.work_writers(p_work), case when st = 'PUBLISHED' then 'info' else 'attention' end,
      '«' || w.title || '»: ' || public.work_status_ar(st) || '.', public.work_go(p_work));
    perform public.work_sync_assets(p_work);
  end if;
  return st;
end
$$;

-- ---------------------------------------------------------------------------
-- 5. A work that waits for its publisher keeps its accounts
-- ---------------------------------------------------------------------------
-- An account that is part of a work «جارٍ النشر» cannot be stopped or deleted: the work would lose the account it waits on.
create or replace function public.account_busy(p_id uuid) returns text[]
language sql stable security definer set search_path = ''
as $$
  select coalesce(array_agg(w.id order by w.no), '{}') from public.works w
  where p_id = any (w.channels) and w.closed_at is null and w.status in ('APPROVED','SCHEDULED','IN_REVIEW','PUBLISHING')
$$;

-- ---------------------------------------------------------------------------
-- 6. Privileges
-- ---------------------------------------------------------------------------
revoke all on function public.x_post_parse(text), public.account_add_link(text, text, text[]),
  public.work_link_confirm(text, uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.account_add_link(text, text, text[]) to authenticated;
grant execute on function public.work_link_confirm(text, uuid, text, boolean) to authenticated;

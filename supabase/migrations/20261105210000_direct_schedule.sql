-- «مجدول» for an Instagram direct post (Director_Notes_Plan.md N-2 with answer Q3, owner directive of 2026-11-05; MVP_draft.md
-- section 76.5). Meta's API publishes at the moment it is called, so something must call it at the time, and the site has no timer.
--
--   * Waiting. The director, or the Admin, schedules a Story, a picture post or a Reel 10 minutes to 30 days ahead. The file is
--     already where Meta will fetch it from: a device file in Drive's «تجارب النشر» (checked as for a test), a library video where
--     it is. The post waits as `waiting`, with its caption and alt text (no page reads them), and may be cancelled until then.
--   * Firing. When its time has come, the next call to /api/platforms/due fires it: the WhatsApp bridge computer's loop (answer
--     Q3, every minute), or, when that computer is off, Home opened by anyone signed in, said as late. The site's server, with its
--     own key and no person's session, claims up to three due posts at a time (a two-minute lease), reads each account's token
--     from the vault (written to the account's events, like any use), makes Meta's container from a temporary address, and on a
--     later call publishes it once Meta has the file. A post left more than a day past its time is given up.
--   * The server acts for the post's own author and for nothing else: the fire functions touch only a scheduled Instagram direct
--     post, and only once it is due. They cannot start, change or schedule anything.
--   * Nothing is hidden. Published, it is written to «سجل النشاط» under its author and told «للعلم» to the account's publishers,
--     the assistants and the author, with how late it went out. A failure is told to its author for attention.

alter table public.platform_tests drop constraint platform_tests_state_check;
alter table public.platform_tests
  add constraint platform_tests_state_check check (state in ('uploading','waiting','published','failed','deleted'));
alter table public.platform_tests
  add column caption text check (caption is null or char_length(caption) <= 2200),
  add column alt text check (alt is null or char_length(alt) <= 1000),
  add column fire_lease timestamptz,
  add column fired_at timestamptz;
alter table public.platform_tests drop constraint platform_tests_scheduled_kind;
alter table public.platform_tests
  add constraint platform_tests_scheduled_kind check (case
    when kind = 'fb_silent' then scheduled_for is not null
    when kind = 'video' then scheduled_for is null or privacy = 'private'
    when kind in ('story_image','story_video','image','reel') then scheduled_for is null or purpose = 'direct'
    else scheduled_for is null end),
  add constraint platform_tests_waiting check (state <> 'waiting'
    or (purpose = 'direct' and scheduled_for is not null and kind in ('story_image','story_video','image','reel')));
create index platform_tests_due_idx on public.platform_tests (scheduled_for) where state in ('waiting','uploading') and purpose = 'direct';
-- The caption and alt text stay the server's: no page reads them back.
grant select (fired_at) on public.platform_tests to authenticated;

-- ---------------------------------------------------------------------------
-- 1. Starting: an Instagram direct post may carry a time
-- ---------------------------------------------------------------------------
create or replace function public.platform_test_start(p_account uuid, p jsonb) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  me text := public.current_email(); a public.platform_accounts; v_id uuid;
  v_title text := btrim(coalesce(p->>'title', '')); v_source text := nullif(p->>'source', '');
  v_kind text := coalesce(nullif(p->>'kind', ''), 'video'); v_privacy text := nullif(p->>'privacy', '');
  v_mime text := nullif(p->>'mime', ''); v_link text := nullif(btrim(coalesce(p->>'link', '')), '');
  v_purpose text := coalesce(nullif(p->>'purpose', ''), 'test');
  v_size bigint; v_version int; v_asset uuid; v_feed boolean; v_when timestamptz; v_notify boolean; v_bad boolean;
  v_text boolean; v_cap int;
begin
  if me is null or not public.platform_test_may(p_account) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if v_purpose not in ('test','direct') then raise exception 'TEST_INVALID' using errcode = 'P0001'; end if;
  if v_purpose = 'direct' and not public.has_capability('publish.direct') then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  select * into a from public.platform_accounts where id = p_account for update;
  if not a.active then raise exception 'ACCOUNT_OFF' using errcode = 'P0001'; end if;
  if a.conn_state <> 'connected' or a.integration_id is null or a.external_id is null then raise exception 'NOT_CONNECTED' using errcode = 'P0001'; end if;
  begin
    v_size := (p->>'size')::bigint;
    v_version := nullif(p->>'version', '')::int;
    v_asset := nullif(p->>'asset', '')::uuid;
    v_feed := (p->>'share_to_feed')::boolean;
    v_when := nullif(p->>'scheduled_for', '')::timestamptz;
    v_notify := (p->>'notify')::boolean;
  exception when others then raise exception 'TEST_INVALID' using errcode = 'P0001';
  end;
  v_text := v_kind in ('fb_silent','fb_text');
  v_bad := char_length(v_title) not between 1 and 100 or v_title ~ '[<>]'
    or (v_link is not null and v_kind <> 'fb_text')
    or (v_when is not null and v_kind not in ('fb_silent','video') and not (v_purpose = 'direct' and a.platform = 'instagram'))
    or (v_notify is not null and (v_purpose <> 'direct' or a.platform <> 'youtube'));
  if v_text then
    v_bad := v_bad or v_source is not null or v_size is not null or v_mime is not null or v_asset is not null;
  else
    v_bad := v_bad or v_source is null or v_source not in ('device','library') or v_size is null or v_size < 1 or v_mime is null
      or (v_source = 'library') <> (v_asset is not null and v_version is not null);
  end if;
  if a.platform = 'youtube' then
    -- «مجدول» is private until its time; a public or unlisted video has no time.
    v_bad := v_bad or v_kind <> 'video' or coalesce(v_privacy, '') not in ('private','public','unlisted') or v_feed is not null
      or v_size > 1073741824 or v_mime !~ '^video/[a-z0-9.+-]{1,60}$'
      or (v_when is not null and v_privacy <> 'private');
  elsif a.platform = 'instagram' then
    v_bad := v_bad or v_kind not in ('story_image','story_video','image','reel') or v_privacy is not null
      or (v_feed is not null and v_kind <> 'reel')
      or (v_kind in ('story_image','image') and (v_mime <> 'image/jpeg' or v_size > 8388608 or v_source <> 'device'))
      or (v_kind in ('story_video','reel') and (v_mime not in ('video/mp4','video/quicktime') or v_size > 104857600));
  else
    -- A Facebook Page takes tests only: its direct posts are «قريباً».
    v_bad := v_bad or v_purpose = 'direct'
      or v_kind not in ('fb_silent','fb_text','fb_photo','fb_reel') or v_privacy is not null or v_feed is not null
      or (v_kind = 'fb_silent' and (v_when is null or v_when < now() + interval '10 minutes' or v_when > now() + interval '30 days'))
      or (v_link is not null and (char_length(v_link) > 2000 or v_link !~ '^https://[^\s<>"]+$'))
      or (v_kind = 'fb_photo' and (v_mime <> 'image/jpeg' or v_size > 4194304 or v_source <> 'device'))
      or (v_kind = 'fb_reel' and (v_mime not in ('video/mp4','video/quicktime') or v_size > 104857600));
  end if;
  if v_bad then raise exception 'TEST_INVALID' using errcode = 'P0001'; end if;
  -- A scheduled YouTube video: 30 days for a test and 180 for a direct post. A scheduled Instagram direct post: 30 days.
  if a.platform = 'youtube' and v_when is not null and (v_when < now() + interval '10 minutes'
      or v_when > now() + case when v_purpose = 'direct' then interval '180 days' else interval '30 days' end) then
    raise exception 'SCHEDULE_INVALID' using errcode = 'P0001';
  end if;
  if a.platform = 'instagram' and v_when is not null and (v_when < now() + interval '10 minutes' or v_when > now() + interval '30 days') then
    raise exception 'SCHEDULE_INVALID' using errcode = 'P0001';
  end if;
  -- One upload at a time: this person's open one on this account, and anyone's older than a day, are closed. An Instagram post
  -- being fired at its time is not an upload of this person's, and is left alone.
  update public.platform_tests set state = 'failed', error = 'ABANDONED', upload_url = null, link_hash = null, link_until = null, done_at = now()
    where account_id = p_account and state = 'uploading' and (created_by = me or created_at < now() - interval '1 day')
      and not (purpose = 'direct' and scheduled_for is not null and kind in ('story_image','story_video','image','reel') and fired_at is not null);
  v_cap := case when v_purpose = 'direct' then 20 else 10 end;
  if (select count(*) from public.platform_tests
      where account_id = p_account and purpose = v_purpose and state <> 'failed' and created_at > now() - interval '1 day') >= v_cap then
    raise exception 'TEST_LIMIT' using errcode = 'P0001';
  end if;
  insert into public.platform_tests (account_id, kind, privacy, title, source, asset_id, asset_version, size, mime, share_to_feed, link,
      scheduled_for, purpose, notify, created_by)
  values (p_account, v_kind, v_privacy, v_title, v_source, v_asset, case when v_source = 'library' then v_version end, v_size, v_mime,
          case when v_kind = 'reel' then coalesce(v_feed, false) end, v_link, v_when, v_purpose,
          case when v_purpose = 'direct' and a.platform = 'youtube' then coalesce(v_notify, v_privacy = 'public' or v_when is not null) end, me)
  returning id into v_id;
  return v_id;
end
$$;

-- The server's view of a post now says what it is for and when it is due.
create or replace function public.platform_test_get(p_key text, p_test uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare me text := public.current_email(); t public.platform_tests; a public.platform_accounts; v_mine boolean;
begin
  if not public.mail_key_ok(p_key) or me is null then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  select * into t from public.platform_tests where id = p_test;
  if not found or not public.platform_test_may(t.account_id) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  select * into a from public.platform_accounts where id = t.account_id;
  v_mine := t.created_by = me;
  return jsonb_build_object('id', t.id, 'account', t.account_id, 'platform', a.platform, 'integration', a.integration_id,
    'external_id', a.external_id, 'handle', a.handle, 'state', t.state, 'mine', v_mine, 'kind', t.kind, 'title', t.title,
    'size', t.size, 'mime', t.mime, 'source', t.source, 'asset', t.asset_id, 'version', t.asset_version, 'video', t.video_id,
    'container', t.container_id, 'share_to_feed', t.share_to_feed, 'temp_ref', t.temp_ref, 'created_at', t.created_at,
    'purpose', t.purpose, 'scheduled_for', t.scheduled_for, 'fired', t.fired_at is not null,
    'url', case when v_mine and t.state = 'uploading' and t.created_at > now() - interval '1 day' then t.upload_url end);
end
$$;

-- ---------------------------------------------------------------------------
-- 2. The page: a scheduled post waits; a holder of publish.direct may cancel it
-- ---------------------------------------------------------------------------
-- A post being fired at its time is the server's, no longer its author's upload to give up.
create or replace function public.platform_test_failed(p_key text, p_test uuid, p_error text) returns void
language plpgsql security definer set search_path = ''
as $$
declare me text := public.current_email();
begin
  if not public.mail_key_ok(p_key) or me is null then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  update public.platform_tests set state = 'failed', upload_url = null, link_hash = null, link_until = null, done_at = now(),
      error = case when p_error ~ '^[A-Z_]{2,40}$' then p_error else 'PLATFORM_ERROR' end
    where id = p_test and created_by = me and state = 'uploading' and fired_at is null;
  if not found then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
end
$$;

-- Its author's server, once the file is where Meta will fetch it from. The account's publishers and the assistants are told it
-- is scheduled; «سجل النشاط» records it when it goes out.
create function public.direct_wait(p_key text, p_test uuid, p_caption text, p_alt text) returns void
language plpgsql security definer set search_path = ''
as $$
declare me text := public.current_email(); t public.platform_tests; w jsonb; v_to text[];
begin
  if not public.mail_key_ok(p_key) or me is null or not public.has_capability('publish.direct') then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if char_length(coalesce(p_caption, '')) > 2200 or char_length(coalesce(p_alt, '')) > 1000 then raise exception 'TEST_INVALID' using errcode = 'P0001'; end if;
  update public.platform_tests set state = 'waiting', caption = nullif(p_caption, ''), alt = nullif(p_alt, ''),
      upload_url = null, link_hash = null, link_until = null, container_id = null, fire_lease = null
    where id = p_test and created_by = me and state = 'uploading' and purpose = 'direct' and scheduled_for is not null
      and kind in ('story_image','story_video','image','reel') and fired_at is null
      and (source = 'library' or temp_ref is not null) and public.platform_test_may(account_id)
    returning * into t;
  if not found then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  w := public.direct_words(t);
  select coalesce(a.publishers, '{}') || coalesce((select array_agg(x.email) from public.accounts x where x.role = 'assistant'), '{}')
    into v_to from public.platform_accounts a where a.id = t.account_id;
  perform public.work_notify_many(v_to, 'info',
    'جُدول نشر مباشر «' || (w->>'name') || '» على ' || (w->>'platform') || ' · ' || (w->>'account') || ' (' || (w->>'shown') || ')، ويُنشر في '
      || public.work_when(t.scheduled_for) || '.',
    jsonb_build_object('page', 'accounts'));
end
$$;

-- Cancelled before its time; the server sends its temporary copy to Drive's trash. Returns that copy's reference.
create function public.direct_cancel(p_key text, p_test uuid) returns text
language plpgsql security definer set search_path = ''
as $$
declare me text := public.current_email(); t public.platform_tests;
begin
  if not public.mail_key_ok(p_key) or me is null or not public.has_capability('publish.direct') then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  update public.platform_tests set state = 'failed', error = 'CANCELLED', done_at = now(), fire_lease = null
    where id = p_test and state = 'waiting' and purpose = 'direct' and public.platform_test_may(account_id)
    returning * into t;
  if not found then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  return t.temp_ref;
end
$$;

-- ---------------------------------------------------------------------------
-- 3. What it says when it goes out, or fails
-- ---------------------------------------------------------------------------
-- As before, and now: written under its author when no one is signed in (the bridge fired it), told to its author too when it
-- was scheduled, and with how late it went out.
create or replace function public.direct_announce(t public.platform_tests, p_type text) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  w jsonb := public.direct_words(t); v_folder uuid; v_to text[]; v_late int;
  v_sched boolean := t.scheduled_for is not null and t.kind in ('story_image','story_video','image','reel');
begin
  if p_type = 'direct' and v_sched and t.done_at > t.scheduled_for + interval '5 minutes' then
    v_late := ceil(extract(epoch from (t.done_at - t.scheduled_for)) / 60);
    w := w || jsonb_build_object('late', v_late);
  end if;
  select folder_id into v_folder from public.media_files where id = t.asset_id;
  insert into public.activity_log (actor_email, type, asset_id, folder_id, task_id, data)
  values (coalesce(public.current_email(), t.created_by), p_type, t.asset_id, v_folder, null, w);
  select coalesce(a.publishers, '{}') || coalesce((select array_agg(x.email) from public.accounts x where x.role = 'assistant'), '{}')
      || case when v_sched then array[t.created_by] else '{}'::text[] end
    into v_to from public.platform_accounts a where a.id = t.account_id;
  perform public.work_notify_many(v_to, 'info',
    case when p_type = 'direct_off'
      then 'حُذف منشور مباشر «' || (w->>'name') || '» من ' || (w->>'platform') || ' · ' || (w->>'account') || '.'
      when w->>'shown' = 'مجدول'
      then 'جُدول نشر مباشر «' || (w->>'name') || '» على ' || (w->>'platform') || ' · ' || (w->>'account') || '، ويصبح عاماً في موعده.'
      when v_late is not null
      then 'نُشر متأخراً ' || v_late || ' دقيقة عن موعده «' || (w->>'name') || '» على ' || (w->>'platform') || ' · ' || (w->>'account') || ' (' || (w->>'shown') || ').'
      when v_sched
      then 'نُشر في موعده «' || (w->>'name') || '» على ' || (w->>'platform') || ' · ' || (w->>'account') || ' (' || (w->>'shown') || ').'
      else 'نُشر مباشرة «' || (w->>'name') || '» على ' || (w->>'platform') || ' · ' || (w->>'account') || ' (' || (w->>'shown') || ').' end,
    jsonb_build_object('page', 'accounts'));
end
$$;

-- A scheduled post that could not go out: closed, its address ended, and its author told, for attention.
create function public.direct_fail(t public.platform_tests, p_error text) returns void
language plpgsql security definer set search_path = ''
as $$
declare w jsonb := public.direct_words(t);
begin
  update public.platform_tests set state = 'failed', error = case when p_error ~ '^[A-Z_]{2,40}$' then p_error else 'PLATFORM_ERROR' end,
      upload_url = null, link_hash = null, link_until = null, fire_lease = null, done_at = now()
    where id = t.id;
  perform public.work_notify(t.created_by, 'attention',
    'تعذّر نشر «' || (w->>'name') || '» المجدول على ' || (w->>'platform') || ' · ' || (w->>'account') || '. افتح «نشر مباشر» لترى السبب.',
    jsonb_build_object('page', 'accounts'));
end
$$;

-- ---------------------------------------------------------------------------
-- 4. Firing: the site's server, with its own key and no person's session
-- ---------------------------------------------------------------------------
-- Up to three due posts, each leased for two minutes and handed back with what the server needs, the account's token included.
-- A post left more than a day past its time, or on an account that is off or not connected, is closed and its author told.
create function public.direct_fire_claim(p_key text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare r public.platform_tests; a public.platform_accounts; i public.integrations; v_tok text; v_out jsonb := '[]'::jsonb;
begin
  if not public.mail_key_ok(p_key) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  for r in select * from public.platform_tests
      where purpose = 'direct' and kind in ('story_image','story_video','image','reel') and scheduled_for is not null
        and state in ('waiting','uploading') and scheduled_for < now() - interval '1 day'
        and (state = 'waiting' or fired_at is not null)
      for update skip locked loop
    perform public.direct_fail(r, 'OVERDUE');
  end loop;
  for r in select * from public.platform_tests
      where purpose = 'direct' and kind in ('story_image','story_video','image','reel') and scheduled_for is not null
        and ((state = 'waiting' and scheduled_for <= now()) or (state = 'uploading' and fired_at is not null))
        and (fire_lease is null or fire_lease < now())
      order by scheduled_for limit 3
      for update skip locked loop
    select * into a from public.platform_accounts where id = r.account_id;
    if not a.active then perform public.direct_fail(r, 'ACCOUNT_OFF'); continue; end if;
    if a.conn_state <> 'connected' or a.integration_id is null or a.external_id is null then perform public.direct_fail(r, 'NOT_CONNECTED'); continue; end if;
    select * into i from public.integrations where id = a.integration_id and deleted_at is null;
    v_tok := (select s.decrypted_secret from vault.decrypted_secrets s where s.id = i.secret_id);
    if v_tok is null then perform public.direct_fail(r, 'NOT_CONNECTED'); continue; end if;
    insert into public.integration_events (integration_id, actor, kind, data)
    values (i.id, r.created_by, 'secret_used', jsonb_build_object('purpose', 'نشر مجدول على إنستغرام', 'pending', false));
    update public.platform_tests set state = 'uploading', fire_lease = now() + interval '2 minutes', fired_at = coalesce(fired_at, now())
      where id = r.id;
    v_out := v_out || jsonb_build_array(jsonb_build_object('id', r.id, 'step', case when r.container_id is null then 'send' else 'advance' end,
      'kind', r.kind, 'mime', r.mime, 'size', r.size, 'source', r.source, 'temp_ref', r.temp_ref, 'external_id', a.external_id,
      'caption', coalesce(r.caption, ''), 'alt', coalesce(r.alt, ''), 'share_to_feed', coalesce(r.share_to_feed, false),
      'container', r.container_id, 'fired_at', coalesce(r.fired_at, now()), 'token', v_tok));
  end loop;
  return v_out;
end
$$;

-- A claimed post: true while its lease lasts.
create function public.direct_fire_held(p_test uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.platform_tests t where t.id = p_test and t.purpose = 'direct' and t.state = 'uploading'
    and t.scheduled_for is not null and t.fired_at is not null and t.fire_lease > now()
    and t.kind in ('story_image','story_video','image','reel'))
$$;

-- Its temporary address (a hash and an end at most an hour away; null ends it), and Meta's container.
create function public.direct_fire_link(p_key text, p_test uuid, p_hash text, p_until timestamptz) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.mail_key_ok(p_key) or not public.direct_fire_held(p_test) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if p_hash is not null and (p_hash !~ '^[0-9a-f]{64}$' or p_until is null or p_until <= now() or p_until > now() + interval '1 hour') then
    raise exception 'TEST_INVALID' using errcode = 'P0001';
  end if;
  update public.platform_tests set link_hash = p_hash, link_until = case when p_hash is null then null else p_until end where id = p_test;
end
$$;

create function public.direct_fire_container(p_key text, p_test uuid, p_container text) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.mail_key_ok(p_key) or not public.direct_fire_held(p_test) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if p_container is null or p_container !~ '^[0-9]{6,30}$' then raise exception 'TEST_INVALID' using errcode = 'P0001'; end if;
  update public.platform_tests set container_id = p_container where id = p_test and container_id is null;
  if not found then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
end
$$;

-- Published: recorded only on the account's own Instagram, then announced. Anything else fails it.
create function public.direct_fire_done(p_key text, p_test uuid, p_post text, p_owner text, p_url text) returns text
language plpgsql security definer set search_path = ''
as $$
declare t public.platform_tests; v_ext text;
begin
  if not public.mail_key_ok(p_key) or not public.direct_fire_held(p_test) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  select * into t from public.platform_tests where id = p_test for update;
  select external_id into v_ext from public.platform_accounts where id = t.account_id;
  if p_owner is distinct from v_ext or p_post is null or p_post !~ '^[A-Za-z0-9_-]{6,60}$' then
    perform public.direct_fail(t, 'CHANNEL_MISMATCH');
    return 'failed';
  end if;
  update public.platform_tests set state = 'published', video_id = p_post, link_hash = null, link_until = null, fire_lease = null, done_at = now(),
      post_url = case when char_length(p_url) <= 300 and p_url like 'https://www.instagram.com/%' then p_url end
    where id = t.id
    returning * into t;
  perform public.direct_announce(t, 'direct');
  return 'published';
end
$$;

-- Meta is still preparing it: the lease ends, so the next call asks again.
create function public.direct_fire_release(p_key text, p_test uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.mail_key_ok(p_key) or not public.direct_fire_held(p_test) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  update public.platform_tests set fire_lease = null where id = p_test;
end
$$;

create function public.direct_fire_failed(p_key text, p_test uuid, p_error text) returns void
language plpgsql security definer set search_path = ''
as $$
declare t public.platform_tests;
begin
  if not public.mail_key_ok(p_key) or not public.direct_fire_held(p_test) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  select * into t from public.platform_tests where id = p_test for update;
  perform public.direct_fail(t, p_error);
end
$$;

-- ---------------------------------------------------------------------------
-- 5. Privileges
-- ---------------------------------------------------------------------------
revoke all on function public.direct_wait(text, uuid, text, text), public.direct_cancel(text, uuid), public.direct_fail(public.platform_tests, text),
  public.direct_fire_claim(text), public.direct_fire_held(uuid), public.direct_fire_link(text, uuid, text, timestamptz),
  public.direct_fire_container(text, uuid, text), public.direct_fire_done(text, uuid, text, text, text),
  public.direct_fire_release(text, uuid), public.direct_fire_failed(text, uuid, text) from public, anon, authenticated;
grant execute on function public.direct_wait(text, uuid, text, text), public.direct_cancel(text, uuid) to authenticated;
-- The bridge computer fires without a session, as Meta fetches without one: the server key is the whole gate.
grant execute on function public.direct_fire_claim(text), public.direct_fire_link(text, uuid, text, timestamptz),
  public.direct_fire_container(text, uuid, text), public.direct_fire_done(text, uuid, text, text, text),
  public.direct_fire_release(text, uuid), public.direct_fire_failed(text, uuid, text) to anon, authenticated;

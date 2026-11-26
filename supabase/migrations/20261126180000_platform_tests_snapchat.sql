-- «تجربة النشر» on a Snapchat Public Profile (Snapchat_Test_Plan.md), by owner request of 2026-11-26. The tests' table and rules
-- (*platform_tests*) grow to hold a Snapchat account connected for real (*snapchat_connection*). From Snap's Public Profile API as read
-- on 2026-11-26 (the whole API is allowlist only, so none of it has yet met a real Snap answer):
--   * Three kinds, all one video. `snap_silent` is the default post: a Spotlight scheduled ahead (Snap's `go_live_timestamp`), read
--     back and deleted at once. `scheduled_for` keeps its date, so a check whose delete failed says when the post would go live, as
--     the Facebook silent check does. That Snap shows a scheduled Spotlight to nobody before its time is read from one line of its
--     documentation and is not proven. `snap_spotlight` posts a Spotlight now; `snap_story` posts a Story now, which Snap gives no
--     id for and cannot delete: it ends by itself after 24 hours. The account check (`snap_check`) reads and writes no row.
--   * The file is an MP4 of at most 30 MiB (Snap takes a part of 32 MB, and the encryption adds padding), from the device or the
--     library. The server encrypts it with a key it derives and keeps nowhere; the key is never a column.
--   * Snap names a Spotlight by an id of letters, digits, `-` and `_` (58 characters), kept as `video_id`; a Story has none, so a
--     published Story may have no id, as a TikTok post may. The media object Snap makes for the file (a UUID) is kept as `container_id`.
--   * The Story cannot be deleted from here, and the database does not pretend it can: the server refuses it (SN_NO_DELETE) and the
--     page says so. A test of this platform is never a direct post (`purpose` is 'test').
-- Who may test, the server key, the one upload at a time and the daily limit are as for the other platforms. Only `platform_test_may`,
-- `platform_test_start` and `platform_test_done` need new words: `platform_test_get`, `platform_test_container`, `platform_test_failed`
-- and `platform_test_deleted` mean the same for these kinds. No new table, no new secret and no key is stored. Every statement here can
-- be run again.

-- A function redefined below is built on the one the TikTok migration left; it stops here, not half-changed, if that is not what it finds.
do $$
declare d text;
begin
  select pg_get_functiondef('public.platform_test_start(uuid,jsonb)'::regprocedure) into d;
  if d not like '%''tt_draft'',''tt_post''%' then raise exception 'MIGRATION_ASSUMPTION: platform_test_start is not the TikTok version'; end if;
  select pg_get_functiondef('public.platform_test_done(text,uuid,text,text,text,text,timestamptz)'::regprocedure) into d;
  if d not like '%v_tiktok%' then raise exception 'MIGRATION_ASSUMPTION: platform_test_done is not the TikTok version'; end if;
  select pg_get_functiondef('public.platform_test_may(uuid)'::regprocedure) into d;
  if d not like '%''tiktok''%' then raise exception 'MIGRATION_ASSUMPTION: platform_test_may is not the TikTok version'; end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.platform_tests'::regclass and conname = 'platform_tests_published_id') then
    raise exception 'MIGRATION_ASSUMPTION: platform_tests_published_id is missing';
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 1. The table: three more kinds, an MP4 of at most 30 MiB, a Story that may have no id, a time for the silent check only
-- ---------------------------------------------------------------------------
-- `privacy` needs no change: `platform_tests_privacy_kind` already says it is empty for every kind but a video and a TikTok post.
-- `container_id` needs none either: a UUID fits `platform_tests_container_id_check`, and `post_url` is not used.
alter table public.platform_tests
  drop constraint if exists platform_tests_kind_check,
  drop constraint if exists platform_tests_mime_check,
  drop constraint if exists platform_tests_kind_size,
  drop constraint if exists platform_tests_kind_source,
  drop constraint if exists platform_tests_published_id,
  drop constraint if exists platform_tests_scheduled_kind,
  drop constraint if exists platform_tests_snap_test_only;
alter table public.platform_tests
  add constraint platform_tests_kind_check check (kind in ('video','story_image','story_video','image','reel','fb_silent','fb_text','fb_photo','fb_reel',
    'tt_draft','tt_post','snap_silent','snap_spotlight','snap_story')),
  add constraint platform_tests_mime_check check (case
    when kind in ('fb_silent','fb_text') then mime is null
    when kind in ('story_image','image','fb_photo') then mime = 'image/jpeg'
    when kind in ('story_video','reel','fb_reel','tt_draft','tt_post') then mime in ('video/mp4','video/quicktime')
    when kind in ('snap_silent','snap_spotlight','snap_story') then mime = 'video/mp4'
    else mime ~ '^video/[a-z0-9.+-]{1,60}$' end),
  add constraint platform_tests_kind_size check (kind in ('video','fb_silent','fb_text')
    or (kind in ('story_image','image') and size <= 8388608)
    or (kind = 'fb_photo' and size <= 4194304)
    or (kind in ('story_video','reel','fb_reel','tt_draft','tt_post') and size <= 104857600)
    or (kind in ('snap_silent','snap_spotlight','snap_story') and size <= 31457280)),
  add constraint platform_tests_kind_source check (source is null or source = 'device'
    or kind in ('video','story_video','reel','fb_reel','tt_draft','tt_post','snap_silent','snap_spotlight','snap_story')),
  -- A published row named its post; a TikTok draft or post and a Snap Story may have none.
  add constraint platform_tests_published_id check (state <> 'published' or video_id is not null or kind in ('tt_draft','tt_post','snap_story')),
  -- Only the silent check has a time (its Spotlight's go-live), and a test of Snapchat is never a direct post.
  add constraint platform_tests_scheduled_kind check (case
    when kind = 'fb_silent' then scheduled_for is not null
    when kind = 'snap_silent' then scheduled_for is not null
    when kind = 'video' then scheduled_for is null or privacy = 'private'
    when kind in ('story_image','story_video','image','reel') then scheduled_for is null or purpose = 'direct'
    else scheduled_for is null end),
  add constraint platform_tests_snap_test_only check (kind not in ('snap_silent','snap_spotlight','snap_story') or purpose = 'test');

-- ---------------------------------------------------------------------------
-- 2. Who may test: a Snapchat profile connected for real too
-- ---------------------------------------------------------------------------
create or replace function public.platform_test_may(p_account uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.platform_accounts a
    where a.id = p_account and a.platform in ('youtube','instagram','facebook','tiktok','snapchat') and a.conn_kind = 'oauth'
      and (public.platform_conn_manage() or (public.work_publisher() and public.current_email() = any (a.publishers))))
$$;

-- ---------------------------------------------------------------------------
-- 3. Starting: a Snapchat silent check, Spotlight or Story
-- ---------------------------------------------------------------------------
-- p: as before, and for Snapchat {kind ('snap_silent' | 'snap_spotlight' | 'snap_story'), title (the Spotlight's description, at most 100
-- characters), source, asset, version, size, mime ('video/mp4'), scheduled_for (the silent check's only)}.
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
    or (v_when is not null and v_kind not in ('fb_silent','video','snap_silent') and not (v_purpose = 'direct' and a.platform = 'instagram'))
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
  elsif a.platform = 'tiktok' then
    -- A draft has no privacy: its owner chooses it in TikTok. A post has the one the person chose.
    v_bad := v_bad or v_kind not in ('tt_draft','tt_post') or v_feed is not null or v_when is not null
      or (v_kind = 'tt_draft' and v_privacy is not null)
      or (v_kind = 'tt_post' and coalesce(v_privacy, '') not in ('private','public','friends','followers'))
      or v_mime not in ('video/mp4','video/quicktime') or v_size > 104857600;
  elsif a.platform = 'snapchat' then
    -- One MP4 of at most 30 MiB, from the device or the library, never a direct post and with no privacy of its own. Only the
    -- silent check has a time, and it must have one (its window is checked below, so the page can name it).
    v_bad := v_bad or v_purpose = 'direct'
      or v_kind not in ('snap_silent','snap_spotlight','snap_story') or v_privacy is not null or v_feed is not null
      or v_mime <> 'video/mp4' or v_size > 31457280
      or (v_kind = 'snap_silent' and v_when is null);
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
  -- A Snap silent check's go-live: at least an hour ahead, and within Snap's 30 days with a day to spare.
  if a.platform = 'snapchat' and v_when is not null and (v_when < now() + interval '1 hour' or v_when > now() + interval '29 days') then
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

-- ---------------------------------------------------------------------------
-- 4. Arrived: a Snap Story may have no id of its own, a Spotlight has one
-- ---------------------------------------------------------------------------
-- The Public Profile's id is the account's `external_id`, as a channel's or a Page's is: a post recorded for any other is not this
-- account's, so it can never be deleted from here.
create or replace function public.platform_test_done(p_key text, p_test uuid, p_video text, p_channel text, p_privacy text, p_url text default null,
    p_publish_at timestamptz default null) returns text
language plpgsql security definer set search_path = ''
as $$
declare me text := public.current_email(); t public.platform_tests; v_ext text; v_tiktok boolean; v_noid boolean;
begin
  if not public.mail_key_ok(p_key) or me is null then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  select * into t from public.platform_tests where id = p_test for update;
  if not found or t.created_by <> me or t.state <> 'uploading' or not public.platform_test_may(t.account_id) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  v_tiktok := t.kind in ('tt_draft','tt_post');
  -- A TikTok draft or post and a Snap Story may arrive with no id of their own; every other kind needs one.
  v_noid := v_tiktok or t.kind = 'snap_story';
  select external_id into v_ext from public.platform_accounts where id = t.account_id;
  if p_channel is distinct from v_ext
      or (p_video is null and not v_noid)
      or (p_video is not null and (p_video !~ '^[A-Za-z0-9_-]{6,60}$' or t.kind = 'tt_draft')) then
    update public.platform_tests set state = 'failed', error = 'CHANNEL_MISMATCH', upload_url = null, link_hash = null, link_until = null,
        done_at = now() where id = t.id;
    return 'failed';
  end if;
  update public.platform_tests set state = 'published', video_id = p_video, upload_url = null, link_hash = null, link_until = null,
      done_at = now(),
      shown_privacy = case when t.kind = 'video' and p_privacy in ('private','public','unlisted') then p_privacy end,
      shown_publish_at = case when t.kind = 'video' then p_publish_at end,
      post_url = case when t.kind <> 'video' and char_length(p_url) <= 300
        and (p_url like 'https://www.instagram.com/%' or p_url like 'https://www.facebook.com/%' or p_url like 'https://www.tiktok.com/%')
        then p_url end
    where id = t.id
    returning * into t;
  if t.purpose = 'direct' then perform public.direct_announce(t, 'direct'); end if;
  return 'published';
end
$$;

-- ---------------------------------------------------------------------------
-- 5. Privileges: as before
-- ---------------------------------------------------------------------------
revoke all on function public.platform_test_may(uuid), public.platform_test_start(uuid, jsonb),
  public.platform_test_done(text, uuid, text, text, text, text, timestamptz) from public, anon;
grant execute on function public.platform_test_may(uuid), public.platform_test_start(uuid, jsonb),
  public.platform_test_done(text, uuid, text, text, text, text, timestamptz) to authenticated;

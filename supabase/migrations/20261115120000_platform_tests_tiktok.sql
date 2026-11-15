-- «تجربة النشر» and «نشر مباشر» on a TikTok account (MVP_draft.md section 79), by owner directive of 2026-11-15. The tests'
-- table and rules (*platform_tests*) grow to hold a TikTok account. From TikTok's Content Posting API as read on 2026-11-15:
--   * Two kinds. `tt_draft` sends the video to the account's TikTok inbox (video.upload): nothing is shown until the account's
--     owner finishes and posts it in the TikTok app, so it is the quiet default. `tt_post` posts it directly (video.publish) with
--     the privacy the person chose from those TikTok offered for the account: `public` (PUBLIC_TO_EVERYONE), `friends`
--     (MUTUAL_FOLLOW_FRIENDS), `followers` (FOLLOWER_OF_CREATOR) or `private` (SELF_ONLY). Until TikTok audits the app, TikTok
--     itself allows only `private`, and only on an account that is private at the time.
--   * TikTok fetches the file from the temporary address the Instagram test made (PULL_FROM_URL, under the site's verified
--     URL prefix): MP4 or MOV, at most 100 MB, as for an Instagram Reel.
--   * TikTok names an upload by its `publish_id` (letters, digits, `_`, `.`, `~`, `-`, at most 64), kept in `container_id`. A
--     post's own id comes only when it is public and passed moderation, so `video_id` may stay empty; a draft never has one.
--   * TikTok's API cannot delete a post, schedule one, or cancel one sent as a file. A TikTok test or direct post is removed in
--     the TikTok app; the site never claims otherwise.
-- Who may test, the server key, the daily limits and «سجل النشاط» for a direct post are as for the other platforms.

alter table public.platform_tests drop constraint platform_tests_kind_check;
alter table public.platform_tests
  add constraint platform_tests_kind_check check (kind in ('video','story_image','story_video','image','reel','fb_silent','fb_text','fb_photo','fb_reel','tt_draft','tt_post'));
alter table public.platform_tests drop constraint platform_tests_privacy_check;
alter table public.platform_tests drop constraint platform_tests_privacy_kind;
alter table public.platform_tests
  add constraint platform_tests_privacy_check check (privacy is null or privacy in ('private','public','unlisted','friends','followers')),
  add constraint platform_tests_privacy_kind check (case
    when kind = 'video' then privacy in ('private','public','unlisted')
    when kind = 'tt_post' then privacy in ('private','public','friends','followers')
    else privacy is null end);
alter table public.platform_tests drop constraint platform_tests_mime_check;
alter table public.platform_tests drop constraint platform_tests_kind_size;
alter table public.platform_tests drop constraint platform_tests_kind_source;
alter table public.platform_tests drop constraint platform_tests_post_url_check;
alter table public.platform_tests drop constraint platform_tests_container_id_check;
-- A published row named its post; a TikTok draft never has one, and a TikTok post has one only once it is public.
-- It was made without a name; it is found by what it says, so the name the database gave it does not matter.
do $$
declare c text;
begin
  for c in select conname from pg_constraint where conrelid = 'public.platform_tests'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%state <> ''published''::text%video_id IS NOT NULL%' loop
    execute format('alter table public.platform_tests drop constraint %I', c);
  end loop;
end
$$;
alter table public.platform_tests
  add constraint platform_tests_published_id check (state <> 'published' or video_id is not null or kind in ('tt_draft','tt_post'));
alter table public.platform_tests
  add constraint platform_tests_mime_check check (case
    when kind in ('fb_silent','fb_text') then mime is null
    when kind in ('story_image','image','fb_photo') then mime = 'image/jpeg'
    when kind in ('story_video','reel','fb_reel','tt_draft','tt_post') then mime in ('video/mp4','video/quicktime')
    else mime ~ '^video/[a-z0-9.+-]{1,60}$' end),
  add constraint platform_tests_kind_size check (kind in ('video','fb_silent','fb_text')
    or (kind in ('story_image','image') and size <= 8388608)
    or (kind = 'fb_photo' and size <= 4194304)
    or (kind in ('story_video','reel','fb_reel','tt_draft','tt_post') and size <= 104857600)),
  add constraint platform_tests_kind_source check (source is null or source = 'device'
    or kind in ('video','story_video','reel','fb_reel','tt_draft','tt_post')),
  add constraint platform_tests_post_url_check check (post_url is null or (char_length(post_url) <= 300
    and (post_url like 'https://www.instagram.com/%' or post_url like 'https://www.facebook.com/%' or post_url like 'https://www.tiktok.com/%'))),
  add constraint platform_tests_container_id_check check (container_id is null or container_id ~ '^[A-Za-z0-9_.~-]{6,64}$');

-- ---------------------------------------------------------------------------
-- 1. Who may test: a TikTok account connected for real too
-- ---------------------------------------------------------------------------
create or replace function public.platform_test_may(p_account uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.platform_accounts a
    where a.id = p_account and a.platform in ('youtube','instagram','facebook','tiktok') and a.conn_kind = 'oauth'
      and (public.platform_conn_manage() or (public.work_publisher() and public.current_email() = any (a.publishers))))
$$;

-- ---------------------------------------------------------------------------
-- 2. Starting: a TikTok draft or post, as a test or a direct post
-- ---------------------------------------------------------------------------
-- p: as before, and for TikTok {kind ('tt_draft' | 'tt_post'), privacy (a post's only), title, source, asset, version, size,
-- mime, purpose}.
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
  elsif a.platform = 'tiktok' then
    -- A draft has no privacy: its owner chooses it in TikTok. A post has the one the person chose.
    v_bad := v_bad or v_kind not in ('tt_draft','tt_post') or v_feed is not null or v_when is not null
      or (v_kind = 'tt_draft' and v_privacy is not null)
      or (v_kind = 'tt_post' and coalesce(v_privacy, '') not in ('private','public','friends','followers'))
      or v_mime not in ('video/mp4','video/quicktime') or v_size > 104857600;
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

-- ---------------------------------------------------------------------------
-- 3. TikTok's name for the upload, kept as the container
-- ---------------------------------------------------------------------------
create or replace function public.platform_test_container(p_key text, p_test uuid, p_container text) returns void
language plpgsql security definer set search_path = ''
as $$
declare me text := public.current_email();
begin
  if not public.mail_key_ok(p_key) or me is null then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if p_container is null or p_container !~ '^[A-Za-z0-9_.~-]{6,64}$' then raise exception 'TEST_INVALID' using errcode = 'P0001'; end if;
  update public.platform_tests set container_id = p_container
    where id = p_test and created_by = me and state = 'uploading' and kind <> 'video' and container_id is null
      and public.platform_test_may(account_id);
  if not found then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 4. Arrived: a TikTok draft or post may have no post id of its own
-- ---------------------------------------------------------------------------
create or replace function public.platform_test_done(p_key text, p_test uuid, p_video text, p_channel text, p_privacy text, p_url text default null,
    p_publish_at timestamptz default null) returns text
language plpgsql security definer set search_path = ''
as $$
declare me text := public.current_email(); t public.platform_tests; v_ext text; v_tiktok boolean;
begin
  if not public.mail_key_ok(p_key) or me is null then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  select * into t from public.platform_tests where id = p_test for update;
  if not found or t.created_by <> me or t.state <> 'uploading' or not public.platform_test_may(t.account_id) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  v_tiktok := t.kind in ('tt_draft','tt_post');
  select external_id into v_ext from public.platform_accounts where id = t.account_id;
  if p_channel is distinct from v_ext
      or (p_video is null and not v_tiktok)
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
-- 5. What a TikTok direct post says in «سجل النشاط» and to the account's publishers
-- ---------------------------------------------------------------------------
create or replace function public.direct_words(t public.platform_tests) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'name', t.title,
    'platform', coalesce(p.label_ar, a.platform),
    'account', a.label,
    'shown', case
      when t.kind = 'video' and t.scheduled_for is not null and t.shown_publish_at is not null then 'مجدول'
      when t.kind = 'video' then case coalesce(t.shown_privacy, t.privacy) when 'public' then 'عام' when 'unlisted' then 'غير مدرج' else 'خاص' end
      when t.kind in ('story_image','story_video') then 'قصة'
      when t.kind = 'image' then 'منشور صورة'
      when t.kind = 'reel' then 'ريلز'
      when t.kind = 'tt_draft' then 'مسودة في صندوق الحساب على TikTok'
      when t.kind = 'tt_post' then case t.privacy when 'public' then 'للجميع' when 'friends' then 'للأصدقاء' when 'followers' then 'للمتابعين'
        else 'لي فقط' end
      else '' end,
    'publish_at', t.shown_publish_at,
    'video', t.video_id,
    'link', t.post_url)
  from public.platform_accounts a left join public.platforms p on p.key = a.platform
  where a.id = t.account_id
$$;

revoke all on function public.direct_words(public.platform_tests) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. The server's view of a post also says the privacy it was started with, so a TikTok post goes out as it was recorded
-- ---------------------------------------------------------------------------
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
    'purpose', t.purpose, 'scheduled_for', t.scheduled_for, 'fired', t.fired_at is not null, 'privacy', t.privacy,
    'url', case when v_mine and t.state = 'uploading' and t.created_at > now() - interval '1 day' then t.upload_url end);
end
$$;

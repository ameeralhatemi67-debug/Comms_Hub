-- «تجربة النشر» on a YouTube channel offers YouTube's four choices: «خاص», «غير مدرج», «عام» and «مجدول» (Director_Notes_Plan.md
-- N-3 step 1, owner directive of 2026-11-05; MVP_draft.md section 71.2 as revised that day). Until now a test was private or
-- public, and «غير مدرج» was refused on purpose. What changes:
--   * `privacy` may be 'unlisted': the video is off the channel and out of search, and plays for anyone who has its link.
--   * «مجدول» is not a fourth privacy. It is YouTube's own: a private video with a `publishAt`, which YouTube itself makes public
--     at that time, whether or not the site is open (YouTube Data API, videos resource, status.publishAt, read 2026-11-05: it can
--     be set only on a private video that was never published, and a time already past publishes at once). The asked time is
--     kept in `scheduled_for`, which the Facebook silent check already uses; a scheduled test is private by definition.
--   * The window is the site's own rule for a test, not YouTube's: at least 10 minutes ahead and at most 30 days, so a test is
--     not forgotten and made public months later. A time outside it is refused as SCHEDULE_INVALID.
--   * `shown_publish_at` keeps the time YouTube says it will publish at, read back with the video like `shown_privacy`, so the
--     page says so when YouTube kept the video private with no time.
-- Nothing else changes: who may test, the server key, the daily limit, and that a test never notifies subscribers.

alter table public.platform_tests drop constraint platform_tests_privacy_check;
alter table public.platform_tests
  add constraint platform_tests_privacy_check check (privacy is null or privacy in ('private','public','unlisted'));
alter table public.platform_tests drop constraint platform_tests_scheduled_kind;
alter table public.platform_tests
  add constraint platform_tests_scheduled_kind check (case
    when kind = 'fb_silent' then scheduled_for is not null
    when kind = 'video' then scheduled_for is null or privacy = 'private'
    else scheduled_for is null end),
  add column shown_publish_at timestamptz,
  add constraint platform_tests_shown_publish_kind check (shown_publish_at is null or kind = 'video');

grant select (shown_publish_at) on public.platform_tests to authenticated;

-- ---------------------------------------------------------------------------
-- 1. Starting a test: a YouTube test may be unlisted, or private with a time
-- ---------------------------------------------------------------------------
-- p: {privacy, title, source, asset, version, size, mime, scheduled_for} for YouTube; {kind, title, source, asset, version, size,
-- mime, share_to_feed} for Instagram; {kind, title, link, scheduled_for, source, asset, version, size, mime} for a Page.
create or replace function public.platform_test_start(p_account uuid, p jsonb) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  me text := public.current_email(); a public.platform_accounts; v_id uuid;
  v_title text := btrim(coalesce(p->>'title', '')); v_source text := nullif(p->>'source', '');
  v_kind text := coalesce(nullif(p->>'kind', ''), 'video'); v_privacy text := nullif(p->>'privacy', '');
  v_mime text := nullif(p->>'mime', ''); v_link text := nullif(btrim(coalesce(p->>'link', '')), '');
  v_size bigint; v_version int; v_asset uuid; v_feed boolean; v_when timestamptz; v_bad boolean;
  v_text boolean;
begin
  if me is null or not public.platform_test_may(p_account) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  select * into a from public.platform_accounts where id = p_account for update;
  if not a.active then raise exception 'ACCOUNT_OFF' using errcode = 'P0001'; end if;
  if a.conn_state <> 'connected' or a.integration_id is null or a.external_id is null then raise exception 'NOT_CONNECTED' using errcode = 'P0001'; end if;
  begin
    v_size := (p->>'size')::bigint;
    v_version := nullif(p->>'version', '')::int;
    v_asset := nullif(p->>'asset', '')::uuid;
    v_feed := (p->>'share_to_feed')::boolean;
    v_when := nullif(p->>'scheduled_for', '')::timestamptz;
  exception when others then raise exception 'TEST_INVALID' using errcode = 'P0001';
  end;
  v_text := v_kind in ('fb_silent','fb_text');
  v_bad := char_length(v_title) not between 1 and 100 or v_title ~ '[<>]'
    or (v_link is not null and v_kind <> 'fb_text') or (v_when is not null and v_kind not in ('fb_silent','video'));
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
    v_bad := v_bad or v_kind not in ('fb_silent','fb_text','fb_photo','fb_reel') or v_privacy is not null or v_feed is not null
      or (v_kind = 'fb_silent' and (v_when is null or v_when < now() + interval '10 minutes' or v_when > now() + interval '30 days'))
      or (v_link is not null and (char_length(v_link) > 2000 or v_link !~ '^https://[^\s<>"]+$'))
      or (v_kind = 'fb_photo' and (v_mime <> 'image/jpeg' or v_size > 4194304 or v_source <> 'device'))
      or (v_kind = 'fb_reel' and (v_mime not in ('video/mp4','video/quicktime') or v_size > 104857600));
  end if;
  if v_bad then raise exception 'TEST_INVALID' using errcode = 'P0001'; end if;
  -- A scheduled YouTube test: the site's own window, said as its own refusal so the page can name it.
  if a.platform = 'youtube' and v_when is not null and (v_when < now() + interval '10 minutes' or v_when > now() + interval '30 days') then
    raise exception 'SCHEDULE_INVALID' using errcode = 'P0001';
  end if;
  -- One upload at a time: this person's open one on this account, and anyone's older than a day, are closed.
  update public.platform_tests set state = 'failed', error = 'ABANDONED', upload_url = null, link_hash = null, link_until = null, done_at = now()
    where account_id = p_account and state = 'uploading' and (created_by = me or created_at < now() - interval '1 day');
  if (select count(*) from public.platform_tests
      where account_id = p_account and state <> 'failed' and created_at > now() - interval '1 day') >= 10 then
    raise exception 'TEST_LIMIT' using errcode = 'P0001';
  end if;
  insert into public.platform_tests (account_id, kind, privacy, title, source, asset_id, asset_version, size, mime, share_to_feed, link,
      scheduled_for, created_by)
  values (p_account, v_kind, v_privacy, v_title, v_source, v_asset, case when v_source = 'library' then v_version end, v_size, v_mime,
          case when v_kind = 'reel' then coalesce(v_feed, false) end, v_link, v_when, me)
  returning id into v_id;
  return v_id;
end
$$;

-- ---------------------------------------------------------------------------
-- 2. The post: YouTube's publish time is kept beside the privacy it gave
-- ---------------------------------------------------------------------------
drop function public.platform_test_done(text, uuid, text, text, text, text);
create function public.platform_test_done(p_key text, p_test uuid, p_video text, p_channel text, p_privacy text, p_url text default null,
    p_publish_at timestamptz default null) returns text
language plpgsql security definer set search_path = ''
as $$
declare me text := public.current_email(); t public.platform_tests; v_ext text;
begin
  if not public.mail_key_ok(p_key) or me is null then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  select * into t from public.platform_tests where id = p_test for update;
  if not found or t.created_by <> me or t.state <> 'uploading' or not public.platform_test_may(t.account_id) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  select external_id into v_ext from public.platform_accounts where id = t.account_id;
  if p_channel is distinct from v_ext or p_video is null or p_video !~ '^[A-Za-z0-9_-]{6,60}$' then
    update public.platform_tests set state = 'failed', error = 'CHANNEL_MISMATCH', upload_url = null, link_hash = null, link_until = null,
        done_at = now() where id = t.id;
    return 'failed';
  end if;
  update public.platform_tests set state = 'published', video_id = p_video, upload_url = null, link_hash = null, link_until = null,
      done_at = now(),
      shown_privacy = case when t.kind = 'video' and p_privacy in ('private','public','unlisted') then p_privacy end,
      shown_publish_at = case when t.kind = 'video' then p_publish_at end,
      post_url = case when t.kind <> 'video' and char_length(p_url) <= 300
        and (p_url like 'https://www.instagram.com/%' or p_url like 'https://www.facebook.com/%') then p_url end
    where id = t.id;
  return 'published';
end
$$;

revoke all on function public.platform_test_done(text, uuid, text, text, text, text, timestamptz) from public, anon;
grant execute on function public.platform_test_done(text, uuid, text, text, text, text, timestamptz) to authenticated;

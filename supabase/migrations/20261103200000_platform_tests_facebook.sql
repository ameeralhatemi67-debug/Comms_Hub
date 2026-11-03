-- «تجربة النشر» on a Facebook Page (MVP_draft.md section 73, Facebook_Test_Plan.md), by owner directive of 2026-11-03. The
-- YouTube and Instagram tests' table and rules (*platform_tests*) grow to hold a Page. What differs:
--   * A silent check (`fb_silent`): a text post scheduled four weeks ahead, read back from the Page and deleted at once. It
--     proves that the Page's token can create, read and delete, and nothing is ever shown. `scheduled_for` keeps its date, so
--     a check whose delete failed says when the post would appear.
--   * A text post (`fb_text`, with an optional `link`) carries no file: its `source`, `size` and `mime` stay empty.
--   * A photo (`fb_photo`) is sent to Meta as a file through the site, at most 4 MB; a Reel (`fb_reel`) is fetched by Meta from
--     the temporary address the Instagram test made, at most 100 MB for a test.
--   * A Page post's id is the Page's id and the post's, joined by an underscore, so the post id may be longer.

alter table public.platform_tests drop constraint platform_tests_kind_check;
alter table public.platform_tests
  add constraint platform_tests_kind_check check (kind in ('video','story_image','story_video','image','reel','fb_silent','fb_text','fb_photo','fb_reel')),
  add column link text check (link is null or (char_length(link) <= 2000 and link ~ '^https://[^\s<>"]+$')),
  add column scheduled_for timestamptz;
alter table public.platform_tests alter column source drop not null, alter column size drop not null, alter column mime drop not null;
alter table public.platform_tests
  drop constraint platform_tests_mime_check,
  drop constraint platform_tests_kind_size,
  drop constraint platform_tests_kind_source,
  drop constraint platform_tests_video_id_check,
  drop constraint platform_tests_post_url_check;
alter table public.platform_tests
  add constraint platform_tests_mime_check check (case
    when kind in ('fb_silent','fb_text') then mime is null
    when kind in ('story_image','image','fb_photo') then mime = 'image/jpeg'
    when kind in ('story_video','reel','fb_reel') then mime in ('video/mp4','video/quicktime')
    else mime ~ '^video/[a-z0-9.+-]{1,60}$' end),
  add constraint platform_tests_no_file check ((kind in ('fb_silent','fb_text')) = (source is null and size is null)),
  add constraint platform_tests_kind_size check (kind in ('video','fb_silent','fb_text')
    or (kind in ('story_image','image') and size <= 8388608)
    or (kind = 'fb_photo' and size <= 4194304)
    or (kind in ('story_video','reel','fb_reel') and size <= 104857600)),
  add constraint platform_tests_kind_source check (source is null or source = 'device' or kind in ('video','story_video','reel','fb_reel')),
  add constraint platform_tests_video_id_check check (video_id is null or video_id ~ '^[A-Za-z0-9_-]{6,60}$'),
  add constraint platform_tests_post_url_check check (post_url is null or (char_length(post_url) <= 300
    and (post_url like 'https://www.instagram.com/%' or post_url like 'https://www.facebook.com/%'))),
  add constraint platform_tests_link_kind check (link is null or kind = 'fb_text'),
  add constraint platform_tests_scheduled_kind check ((kind = 'fb_silent') = (scheduled_for is not null));

grant select (link, scheduled_for) on public.platform_tests to authenticated;

-- ---------------------------------------------------------------------------
-- 1. Who may test: a YouTube channel, an Instagram account or a Facebook Page connected for real
-- ---------------------------------------------------------------------------
create or replace function public.platform_test_may(p_account uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.platform_accounts a
    where a.id = p_account and a.platform in ('youtube','instagram','facebook') and a.conn_kind = 'oauth'
      and (public.platform_conn_manage() or (public.work_publisher() and public.current_email() = any (a.publishers))))
$$;

-- ---------------------------------------------------------------------------
-- 2. Starting a test, by platform
-- ---------------------------------------------------------------------------
-- p: {privacy, title, source, asset, version, size, mime} for YouTube; {kind, title, source, asset, version, size, mime,
-- share_to_feed} for Instagram; {kind, title, link, scheduled_for, source, asset, version, size, mime} for a Page.
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
    or (v_link is not null and v_kind <> 'fb_text') or (v_when is not null and v_kind <> 'fb_silent');
  if v_text then
    v_bad := v_bad or v_source is not null or v_size is not null or v_mime is not null or v_asset is not null;
  else
    v_bad := v_bad or v_source is null or v_source not in ('device','library') or v_size is null or v_size < 1 or v_mime is null
      or (v_source = 'library') <> (v_asset is not null and v_version is not null);
  end if;
  if a.platform = 'youtube' then
    v_bad := v_bad or v_kind <> 'video' or coalesce(v_privacy, '') not in ('private','public') or v_feed is not null
      or v_size > 1073741824 or v_mime !~ '^video/[a-z0-9.+-]{1,60}$';
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
-- 3. The post: recorded only on the account's own Page; a Page's link kept
-- ---------------------------------------------------------------------------
create or replace function public.platform_test_done(p_key text, p_test uuid, p_video text, p_channel text, p_privacy text, p_url text default null) returns text
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
      post_url = case when t.kind <> 'video' and char_length(p_url) <= 300
        and (p_url like 'https://www.instagram.com/%' or p_url like 'https://www.facebook.com/%') then p_url end
    where id = t.id;
  return 'published';
end
$$;

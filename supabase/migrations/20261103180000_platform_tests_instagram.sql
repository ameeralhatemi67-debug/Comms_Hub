-- «تجربة النشر» on an Instagram account (MVP_draft.md section 72, Instagram_Test_Plan.md), by owner directive of 2026-11-03.
-- The YouTube test's table and rules (20261103120000_platform_tests.sql) grow to hold Instagram. What differs:
--   * Instagram has no private post, so `privacy` is YouTube's alone. The quiet choice there is a Story, gone after 24 hours.
--   * Meta fetches the file from a public address. The site serves it for a few minutes at an address made of 32 random
--     bytes, of which only the sha256 is kept (`link_hash`). `platform_test_fetch` answers that address with the server key
--     and no session, because Meta has none, and only while the test is still waiting for Meta.
--   * A file from the device first goes to the site's Drive folder «تجارب النشر» under a name the server chose
--     (`temp_ref`), never into the library, and is moved to Drive's trash once Meta has it.
--   * Publishing is two steps: a container Meta prepares (`container_id`), then the post. The open page drives them.
--   * Pictures are JPEG only and at most 8 MB; a Story video and, for a test, a Reel at most 100 MB. A library file may be
--     a video only: a picture is redrawn to JPEG in the browser and sent as a file from the device.

alter table public.platform_tests
  add column kind text not null default 'video' check (kind in ('video','story_image','story_video','image','reel')),
  add column container_id text check (container_id is null or container_id ~ '^[0-9]{6,30}$'),
  add column post_url text check (post_url is null or (char_length(post_url) <= 300 and post_url like 'https://www.instagram.com/%')),
  add column share_to_feed boolean,
  add column temp_ref text check (temp_ref is null or temp_ref ~ '^[A-Za-z0-9_-]{10,200}$'),
  add column link_hash text check (link_hash is null or link_hash ~ '^[0-9a-f]{64}$'),
  add column link_until timestamptz;
alter table public.platform_tests alter column privacy drop not null;
alter table public.platform_tests drop constraint platform_tests_mime_check;
alter table public.platform_tests
  add constraint platform_tests_mime_check check (case
    when kind in ('story_image','image') then mime = 'image/jpeg'
    when kind in ('story_video','reel') then mime in ('video/mp4','video/quicktime')
    else mime ~ '^video/[a-z0-9.+-]{1,60}$' end),
  add constraint platform_tests_privacy_kind check ((kind = 'video') = (privacy is not null)),
  add constraint platform_tests_kind_size check (kind = 'video'
    or (kind in ('story_image','image') and size <= 8388608)
    or (kind in ('story_video','reel') and size <= 104857600)),
  add constraint platform_tests_kind_source check (source = 'device' or kind in ('video','story_video','reel')),
  add constraint platform_tests_feed check (share_to_feed is null or kind = 'reel');
create unique index platform_tests_link_idx on public.platform_tests (link_hash) where link_hash is not null;

-- Pages read the new columns too, except the link's hash and the temporary copy's reference.
grant select (kind, container_id, post_url, share_to_feed) on public.platform_tests to authenticated;

-- ---------------------------------------------------------------------------
-- 1. Who may test: a YouTube channel or an Instagram account connected for real
-- ---------------------------------------------------------------------------
create or replace function public.platform_test_may(p_account uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.platform_accounts a
    where a.id = p_account and a.platform in ('youtube','instagram') and a.conn_kind = 'oauth'
      and (public.platform_conn_manage() or (public.work_publisher() and public.current_email() = any (a.publishers))))
$$;

-- ---------------------------------------------------------------------------
-- 2. Starting a test, by platform
-- ---------------------------------------------------------------------------
-- p: {privacy, title, source, asset, version, size, mime} for YouTube; {kind, title, source, asset, version, size, mime,
-- share_to_feed} for Instagram. The route read a library file's size and type under the person's own row level security.
create or replace function public.platform_test_start(p_account uuid, p jsonb) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  me text := public.current_email(); a public.platform_accounts; v_id uuid;
  v_title text := btrim(coalesce(p->>'title', '')); v_source text := p->>'source';
  v_kind text := coalesce(nullif(p->>'kind', ''), 'video'); v_privacy text := nullif(p->>'privacy', '');
  v_mime text := coalesce(p->>'mime', ''); v_size bigint; v_version int; v_asset uuid; v_feed boolean;
  v_bad boolean;
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
  exception when others then raise exception 'TEST_INVALID' using errcode = 'P0001';
  end;
  v_bad := v_source is null or v_source not in ('device','library')
    or char_length(v_title) not between 1 and 100 or v_title ~ '[<>]' or v_size is null or v_size < 1
    or (v_source = 'library') <> (v_asset is not null and v_version is not null);
  if a.platform = 'youtube' then
    v_bad := v_bad or v_kind <> 'video' or coalesce(v_privacy, '') not in ('private','public') or v_feed is not null
      or v_size > 1073741824 or v_mime !~ '^video/[a-z0-9.+-]{1,60}$';
  else
    v_bad := v_bad or v_kind not in ('story_image','story_video','image','reel') or v_privacy is not null
      or (v_feed is not null and v_kind <> 'reel')
      or (v_kind in ('story_image','image') and (v_mime <> 'image/jpeg' or v_size > 8388608 or v_source <> 'device'))
      or (v_kind in ('story_video','reel') and (v_mime not in ('video/mp4','video/quicktime') or v_size > 104857600));
  end if;
  if v_bad then raise exception 'TEST_INVALID' using errcode = 'P0001'; end if;
  -- One upload at a time: this person's open one on this account, and anyone's older than a day, are closed.
  update public.platform_tests set state = 'failed', error = 'ABANDONED', upload_url = null, link_hash = null, link_until = null, done_at = now()
    where account_id = p_account and state = 'uploading' and (created_by = me or created_at < now() - interval '1 day');
  if (select count(*) from public.platform_tests
      where account_id = p_account and state <> 'failed' and created_at > now() - interval '1 day') >= 10 then
    raise exception 'TEST_LIMIT' using errcode = 'P0001';
  end if;
  insert into public.platform_tests (account_id, kind, privacy, title, source, asset_id, asset_version, size, mime, share_to_feed, created_by)
  values (p_account, v_kind, v_privacy, v_title, v_source, v_asset, case when v_source = 'library' then v_version end, v_size, v_mime,
          case when v_kind = 'reel' then coalesce(v_feed, false) end, me)
  returning id into v_id;
  return v_id;
end
$$;

-- ---------------------------------------------------------------------------
-- 3. The site's server, step by step (server key)
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
    'url', case when v_mine and t.state = 'uploading' and t.created_at > now() - interval '1 day' then t.upload_url end);
end
$$;

-- The device file's copy in «تجارب النشر», once the server has checked its name, folder and size.
create function public.platform_test_temp(p_key text, p_test uuid, p_ref text) returns void
language plpgsql security definer set search_path = ''
as $$
declare me text := public.current_email();
begin
  if not public.mail_key_ok(p_key) or me is null then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if p_ref is null or p_ref !~ '^[A-Za-z0-9_-]{10,200}$' then raise exception 'TEST_INVALID' using errcode = 'P0001'; end if;
  update public.platform_tests set temp_ref = p_ref
    where id = p_test and created_by = me and state = 'uploading' and source = 'device' and kind <> 'video' and temp_ref is null
      and public.platform_test_may(account_id);
  if not found then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
end
$$;

-- The temporary address's hash and its end, at most an hour away; null ends it at once.
create function public.platform_test_link(p_key text, p_test uuid, p_hash text, p_until timestamptz) returns void
language plpgsql security definer set search_path = ''
as $$
declare me text := public.current_email();
begin
  if not public.mail_key_ok(p_key) or me is null then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if p_hash is not null and (p_hash !~ '^[0-9a-f]{64}$' or p_until is null or p_until <= now() or p_until > now() + interval '1 hour') then
    raise exception 'TEST_INVALID' using errcode = 'P0001';
  end if;
  update public.platform_tests set link_hash = p_hash, link_until = case when p_hash is null then null else p_until end
    where id = p_test and created_by = me and state = 'uploading' and kind <> 'video' and public.platform_test_may(account_id);
  if not found then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
end
$$;

-- The container Meta made for the test.
create function public.platform_test_container(p_key text, p_test uuid, p_container text) returns void
language plpgsql security definer set search_path = ''
as $$
declare me text := public.current_email();
begin
  if not public.mail_key_ok(p_key) or me is null then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if p_container is null or p_container !~ '^[0-9]{6,30}$' then raise exception 'TEST_INVALID' using errcode = 'P0001'; end if;
  update public.platform_tests set container_id = p_container
    where id = p_test and created_by = me and state = 'uploading' and kind <> 'video' and container_id is null
      and public.platform_test_may(account_id);
  if not found then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
end
$$;

-- The file behind a temporary address, for the site's server answering Meta. The server key alone, no session: Meta has
-- none. Only while the link lasts and the test still waits; the same nothing for a wrong, ended or used address.
create function public.platform_test_fetch(p_key text, p_hash text) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare t public.platform_tests; v_ref text;
begin
  if not public.mail_key_ok(p_key) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if p_hash is null or p_hash !~ '^[0-9a-f]{64}$' then return null; end if;
  select * into t from public.platform_tests where link_hash = p_hash and link_until > now() and state = 'uploading';
  if not found then return null; end if;
  if t.source = 'device' then
    v_ref := t.temp_ref;
  else
    v_ref := coalesce(
      (select v.drive_file_id from public.media_versions v where v.asset_id = t.asset_id and v.version = t.asset_version),
      (select f.drive_file_id from public.media_files f where f.id = t.asset_id and f.current_version = t.asset_version));
  end if;
  if v_ref is null then return null; end if;
  return jsonb_build_object('ref', v_ref, 'mime', t.mime, 'size', t.size);
end
$$;

-- The post's id, the account it is on and its address. A YouTube video keeps the privacy YouTube gave; an Instagram post
-- keeps its permalink. A post on any other account is not recorded as this one's, so it can never be deleted from here.
drop function public.platform_test_done(text, uuid, text, text, text);
create function public.platform_test_done(p_key text, p_test uuid, p_video text, p_channel text, p_privacy text, p_url text default null) returns text
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
  if p_channel is distinct from v_ext or p_video is null or p_video !~ '^[A-Za-z0-9_-]{6,20}$' then
    update public.platform_tests set state = 'failed', error = 'CHANNEL_MISMATCH', upload_url = null, link_hash = null, link_until = null,
        done_at = now() where id = t.id;
    return 'failed';
  end if;
  update public.platform_tests set state = 'published', video_id = p_video, upload_url = null, link_hash = null, link_until = null,
      done_at = now(),
      shown_privacy = case when t.kind = 'video' and p_privacy in ('private','public','unlisted') then p_privacy end,
      post_url = case when t.kind <> 'video' and p_url like 'https://www.instagram.com/%' and char_length(p_url) <= 300 then p_url end
    where id = t.id;
  return 'published';
end
$$;

-- An upload that stopped: refused, given up, or cancelled by the person who started it. Its address ends with it.
create or replace function public.platform_test_failed(p_key text, p_test uuid, p_error text) returns void
language plpgsql security definer set search_path = ''
as $$
declare me text := public.current_email();
begin
  if not public.mail_key_ok(p_key) or me is null then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  update public.platform_tests set state = 'failed', upload_url = null, link_hash = null, link_until = null, done_at = now(),
      error = case when p_error ~ '^[A-Z_]{2,40}$' then p_error else 'PLATFORM_ERROR' end
    where id = p_test and created_by = me and state = 'uploading';
  if not found then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 4. Privileges
-- ---------------------------------------------------------------------------
revoke all on function public.platform_test_temp(text, uuid, text), public.platform_test_link(text, uuid, text, timestamptz),
  public.platform_test_container(text, uuid, text), public.platform_test_fetch(text, text),
  public.platform_test_done(text, uuid, text, text, text, text) from public, anon;
grant execute on function public.platform_test_temp(text, uuid, text), public.platform_test_link(text, uuid, text, timestamptz),
  public.platform_test_container(text, uuid, text), public.platform_test_done(text, uuid, text, text, text, text) to authenticated;
-- Meta fetches without a session: the server key is the whole gate.
grant execute on function public.platform_test_fetch(text, text) to anon, authenticated;

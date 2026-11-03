-- «تجربة النشر» on a YouTube account's sheet (MVP_draft.md section 71), by owner directive of 2026-11-03: a short video
-- is really uploaded to the connected channel, to prove that publishing reaches it, and can be deleted again from the
-- same sheet. A test is not a work: no review, no approval, no schedule, and publishing works stays a simulation.
--
--   * Who: those who manage accounts (the director, the assistant, a holder of «إدارة المنصات وتطبيقاتها»;
--     administrators act as any role) and the account's own publishers. A test is not an approval.
--   * The page never holds a token or the upload's address. The site's server opens the upload at YouTube with the
--     account's token from the vault, keeps the address in `upload_url`, a column no page can read, and relays the
--     file in pieces. Every step after the start needs the server key, so it can only come from the site's server.
--   * Only what a test uploaded is deleted from here, by the id the server read back from YouTube, and only after the
--     server checked that the video is on this account's channel.
--   * Ten tests per account a day (YouTube allows the project 100 uploads a day), one upload at a time per person and
--     account. Nothing is scheduled: an upload left open is closed by the next start, or refused after a day.

create table public.platform_tests (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.platform_accounts(id) on delete cascade,
  privacy text not null check (privacy in ('private','public')),
  title text not null check (char_length(btrim(title)) between 1 and 100 and title !~ '[<>]'),
  source text not null check (source in ('device','library')),
  asset_id uuid references public.media_files(id) on delete set null,
  asset_version int check (asset_version is null or asset_version > 0),
  size bigint not null check (size between 1 and 1073741824),
  mime text not null check (mime ~ '^video/[a-z0-9.+-]{1,60}$'),
  state text not null default 'uploading' check (state in ('uploading','published','failed','deleted')),
  video_id text check (video_id is null or video_id ~ '^[A-Za-z0-9_-]{6,20}$'),
  shown_privacy text check (shown_privacy is null or shown_privacy in ('private','public','unlisted')),
  error text check (error is null or error ~ '^[A-Z_]{2,40}$'),
  upload_url text check (upload_url is null or (char_length(upload_url) <= 4096 and upload_url like 'https://www.googleapis.com/upload/youtube/v3/videos?%')),
  created_by text not null,
  created_at timestamptz not null default now(),
  done_at timestamptz,
  deleted_by text,
  deleted_at timestamptz,
  check ((source = 'library') = (asset_version is not null)),
  check (state <> 'published' or video_id is not null)
);
create index platform_tests_account_idx on public.platform_tests (account_id, created_at desc);
alter table public.platform_tests enable row level security;

-- ---------------------------------------------------------------------------
-- 1. Who may test an account
-- ---------------------------------------------------------------------------
create function public.platform_test_may(p_account uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.platform_accounts a
    where a.id = p_account and a.platform = 'youtube' and a.conn_kind = 'oauth'
      and (public.platform_conn_manage() or (public.work_publisher() and public.current_email() = any (a.publishers))))
$$;

create policy platform_tests_read on public.platform_tests for select to authenticated using (public.platform_test_may(account_id));
revoke all on public.platform_tests from public, anon, authenticated;
-- Every column but the upload's address.
grant select (id, account_id, privacy, title, source, asset_id, asset_version, size, mime, state, video_id, shown_privacy, error,
  created_by, created_at, done_at, deleted_by, deleted_at) on public.platform_tests to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Starting a test
-- ---------------------------------------------------------------------------
-- p: {privacy, title, source, asset, version, size, mime}. The route has read the library file's size and type under the
-- person's own row level security; the file stays where it is.
create function public.platform_test_start(p_account uuid, p jsonb) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  me text := public.current_email(); a public.platform_accounts; v_id uuid;
  v_title text := btrim(coalesce(p->>'title', '')); v_source text := p->>'source';
  v_size bigint; v_version int; v_asset uuid;
begin
  if me is null or not public.platform_test_may(p_account) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  select * into a from public.platform_accounts where id = p_account for update;
  if not a.active then raise exception 'ACCOUNT_OFF' using errcode = 'P0001'; end if;
  if a.conn_state <> 'connected' or a.integration_id is null or a.external_id is null then raise exception 'NOT_CONNECTED' using errcode = 'P0001'; end if;
  begin
    v_size := (p->>'size')::bigint;
    v_version := nullif(p->>'version', '')::int;
    v_asset := nullif(p->>'asset', '')::uuid;
  exception when others then raise exception 'TEST_INVALID' using errcode = 'P0001';
  end;
  if coalesce(p->>'privacy', '') not in ('private','public') or v_source is null or v_source not in ('device','library')
     or char_length(v_title) not between 1 and 100 or v_title ~ '[<>]'
     or v_size is null or v_size not between 1 and 1073741824
     or coalesce(p->>'mime', '') !~ '^video/[a-z0-9.+-]{1,60}$'
     or (v_source = 'library') <> (v_asset is not null and v_version is not null) then
    raise exception 'TEST_INVALID' using errcode = 'P0001';
  end if;
  -- One upload at a time: this person's open one on this account, and anyone's older than a day, are closed.
  update public.platform_tests set state = 'failed', error = 'ABANDONED', upload_url = null, done_at = now()
    where account_id = p_account and state = 'uploading' and (created_by = me or created_at < now() - interval '1 day');
  if (select count(*) from public.platform_tests
      where account_id = p_account and state <> 'failed' and created_at > now() - interval '1 day') >= 10 then
    raise exception 'TEST_LIMIT' using errcode = 'P0001';
  end if;
  insert into public.platform_tests (account_id, privacy, title, source, asset_id, asset_version, size, mime, created_by)
  values (p_account, p->>'privacy', v_title, v_source, v_asset, case when v_source = 'library' then v_version end, v_size, p->>'mime', me)
  returning id into v_id;
  return v_id;
end
$$;

-- ---------------------------------------------------------------------------
-- 3. The site's server, step by step (server key)
-- ---------------------------------------------------------------------------
-- What the server needs about a test. The upload's address only for the person who started it, while it is open and
-- younger than a day.
create function public.platform_test_get(p_key text, p_test uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare me text := public.current_email(); t public.platform_tests; a public.platform_accounts; v_mine boolean;
begin
  if not public.mail_key_ok(p_key) or me is null then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  select * into t from public.platform_tests where id = p_test;
  if not found or not public.platform_test_may(t.account_id) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  select * into a from public.platform_accounts where id = t.account_id;
  v_mine := t.created_by = me;
  return jsonb_build_object('id', t.id, 'account', t.account_id, 'integration', a.integration_id, 'external_id', a.external_id,
    'state', t.state, 'mine', v_mine, 'size', t.size, 'mime', t.mime, 'source', t.source, 'asset', t.asset_id, 'version', t.asset_version,
    'video', t.video_id,
    'url', case when v_mine and t.state = 'uploading' and t.created_at > now() - interval '1 day' then t.upload_url end);
end
$$;

-- The address YouTube gave for the upload, kept for the pieces that follow.
create function public.platform_test_session(p_key text, p_test uuid, p_url text) returns void
language plpgsql security definer set search_path = ''
as $$
declare me text := public.current_email();
begin
  if not public.mail_key_ok(p_key) or me is null then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if p_url is null or char_length(p_url) > 4096 or p_url not like 'https://www.googleapis.com/upload/youtube/v3/videos?%' then
    raise exception 'TEST_INVALID' using errcode = 'P0001';
  end if;
  update public.platform_tests set upload_url = p_url
    where id = p_test and created_by = me and state = 'uploading' and upload_url is null and public.platform_test_may(account_id);
  if not found then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
end
$$;

-- YouTube's answer to the last piece: the video's id, the channel it is on and the privacy it was given. A video on any
-- other channel is not recorded as this account's, so it can never be deleted from here.
create function public.platform_test_done(p_key text, p_test uuid, p_video text, p_channel text, p_privacy text) returns text
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
    update public.platform_tests set state = 'failed', error = 'CHANNEL_MISMATCH', upload_url = null, done_at = now() where id = t.id;
    return 'failed';
  end if;
  update public.platform_tests set state = 'published', video_id = p_video, upload_url = null, done_at = now(),
      shown_privacy = case when p_privacy in ('private','public','unlisted') then p_privacy end
    where id = t.id;
  return 'published';
end
$$;

-- An upload that stopped: refused by YouTube, given up, or cancelled by the person who started it.
create function public.platform_test_failed(p_key text, p_test uuid, p_error text) returns void
language plpgsql security definer set search_path = ''
as $$
declare me text := public.current_email();
begin
  if not public.mail_key_ok(p_key) or me is null then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  update public.platform_tests set state = 'failed', upload_url = null, done_at = now(),
      error = case when p_error ~ '^[A-Z_]{2,40}$' then p_error else 'PLATFORM_ERROR' end
    where id = p_test and created_by = me and state = 'uploading';
  if not found then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
end
$$;

-- YouTube said the video is gone (deleted now, or already gone). Anyone who may test the account may delete a test.
create function public.platform_test_deleted(p_key text, p_test uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare me text := public.current_email();
begin
  if not public.mail_key_ok(p_key) or me is null then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  update public.platform_tests set state = 'deleted', deleted_by = me, deleted_at = now()
    where id = p_test and state = 'published' and public.platform_test_may(account_id);
  if not found then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 4. Privileges
-- ---------------------------------------------------------------------------
revoke all on function public.platform_test_may(uuid), public.platform_test_start(uuid, jsonb), public.platform_test_get(text, uuid),
  public.platform_test_session(text, uuid, text), public.platform_test_done(text, uuid, text, text, text),
  public.platform_test_failed(text, uuid, text), public.platform_test_deleted(text, uuid) from public, anon;
grant execute on function public.platform_test_may(uuid), public.platform_test_start(uuid, jsonb), public.platform_test_get(text, uuid),
  public.platform_test_session(text, uuid, text), public.platform_test_done(text, uuid, text, text, text),
  public.platform_test_failed(text, uuid, text), public.platform_test_deleted(text, uuid) to authenticated;

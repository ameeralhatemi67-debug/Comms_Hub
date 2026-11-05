-- Thumbnails: a small picture for every stored file version, so a file is never shown as text alone (Director_Notes_Plan.md N-4,
-- owner directive of 2026-11-05, answer Q4: kept in the database; MVP_draft.md section 77).
--
--   * One row per library version (`asset_id`, `version`) or per file sent in mail or messaging (`mail_file_id`). Each goes
--     with its file: the foreign keys cascade.
--   * `ready` holds the picture: WebP, JPEG or PNG, 64 bytes to 48 KB, checked by its own first bytes. `none` says the
--     platform had no picture for this file, so the server does not ask Drive again for a day.
--   * Who sees a thumbnail is exactly who may see its file: a library file by its folder's level (media_my_level), a mail
--     or messaging file by mail_file() and chat_file(). Internal mail stays private from administrators, as the file does.
--   * Two ways in, both database functions:
--       thumb_save  the person who uploaded that version or file, from the picture their browser drew at upload. They may
--                   replace their own, or one the server made, never another person's.
--       thumb_keep  the site's server only (the server key), for the person who asked to see the file: Drive's own
--                   thumbnail of the file, or `none`. It never replaces a picture already there.
--   * A thumbnail can be made again, so it is not part of a backup (the allow-list never names this table), following
--     disscussios/storage_lifecycle_disaster_recovery.md: derivatives are regenerated, not protected.

create table public.file_thumbs (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid references public.media_files(id) on delete cascade,
  version int check (version is null or version >= 1),
  mail_file_id uuid references public.mail_files(id) on delete cascade,
  state text not null check (state in ('ready','none')),
  data bytea,
  mime text check (mime is null or mime in ('image/webp','image/jpeg','image/png')),
  source text not null check (source in ('browser','drive')),
  made_by text not null,
  made_at timestamptz not null default now(),
  check ((asset_id is not null and version is not null and mail_file_id is null) or (mail_file_id is not null and asset_id is null and version is null)),
  check ((state = 'ready') = (data is not null and mime is not null)),
  check (data is null or octet_length(data) between 64 and 49152),
  check (state = 'ready' or source = 'drive')
);
create unique index file_thumbs_asset_idx on public.file_thumbs (asset_id, version) where asset_id is not null;
create unique index file_thumbs_mail_idx on public.file_thumbs (mail_file_id) where mail_file_id is not null;
alter table public.file_thumbs enable row level security;

-- ---------------------------------------------------------------------------
-- 1. Who sees a thumbnail: who may see its file
-- ---------------------------------------------------------------------------
create function public.thumb_may_see(p_asset uuid, p_mail_file uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select case
    when p_asset is not null then exists (select 1 from public.media_files f where f.id = p_asset and public.media_my_level(f.folder_id) >= 1)
    when p_mail_file is not null then exists (select 1 from public.mail_file(p_mail_file)) or exists (select 1 from public.chat_file(p_mail_file))
    else false end
$$;

create policy file_thumbs_read on public.file_thumbs for select to authenticated
  using ((select public.thumb_may_see(asset_id, mail_file_id)));
revoke all on public.file_thumbs from public, anon, authenticated;
grant select (id, asset_id, version, mail_file_id, state, data, mime, source, made_at) on public.file_thumbs to authenticated;

-- A picture's bytes are what its type says: WebP, JPEG or PNG by their first bytes.
create function public.thumb_bytes_ok(p_data bytea, p_mime text) returns boolean
language sql immutable set search_path = ''
as $$
  select p_data is not null and octet_length(p_data) between 64 and 49152 and case p_mime
    when 'image/webp' then substring(p_data from 1 for 4) = '\x52494646'::bytea and substring(p_data from 9 for 4) = '\x57454250'::bytea
    when 'image/jpeg' then substring(p_data from 1 for 3) = '\xffd8ff'::bytea
    when 'image/png' then substring(p_data from 1 for 8) = '\x89504e470d0a1a0a'::bytea
    else false end
$$;

-- p_data is base64, as a page sends it.
create function public.thumb_decode(p_data text) returns bytea
language plpgsql immutable set search_path = ''
as $$
begin
  return decode(p_data, 'base64');
exception when others then
  raise exception 'THUMB_INVALID' using errcode = 'P0001';
end
$$;

-- ---------------------------------------------------------------------------
-- 2. The uploader's browser: the picture it drew at upload
-- ---------------------------------------------------------------------------
create function public.thumb_save(p_asset uuid, p_version int, p_mail_file uuid, p_data text, p_mime text) returns void
language plpgsql security definer set search_path = ''
as $$
declare me text := public.current_email(); v_bytes bytea; t public.file_thumbs;
begin
  if me is null then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if (p_asset is null) = (p_mail_file is null) or (p_asset is not null and p_version is null) then
    raise exception 'THUMB_INVALID' using errcode = 'P0001';
  end if;
  -- Only who uploaded that very version, or that file.
  if p_asset is not null and not exists (
      select 1 from public.media_versions v where v.asset_id = p_asset and v.version = p_version and v.uploaded_by = me) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  if p_mail_file is not null and not exists (select 1 from public.mail_files f where f.id = p_mail_file and f.uploaded_by = me) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  v_bytes := public.thumb_decode(coalesce(p_data, ''));
  if not public.thumb_bytes_ok(v_bytes, p_mime) then raise exception 'THUMB_INVALID' using errcode = 'P0001'; end if;
  select * into t from public.file_thumbs
    where (p_asset is not null and asset_id = p_asset and version = p_version) or (p_mail_file is not null and mail_file_id = p_mail_file)
    for update;
  if found then
    if t.source = 'browser' and t.made_by <> me then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
    update public.file_thumbs set state = 'ready', data = v_bytes, mime = p_mime, source = 'browser', made_by = me, made_at = now()
      where id = t.id;
  else
    insert into public.file_thumbs (asset_id, version, mail_file_id, state, data, mime, source, made_by)
    values (p_asset, case when p_asset is not null then p_version end, p_mail_file, 'ready', v_bytes, p_mime, 'browser', me);
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 3. The site's server: Drive's own thumbnail, or none, for a person who may see the file
-- ---------------------------------------------------------------------------
-- Returns 'kept', 'already' (a picture was there; nothing changed) or 'none'.
create function public.thumb_keep(p_key text, p_asset uuid, p_version int, p_mail_file uuid, p_data text, p_mime text) returns text
language plpgsql security definer set search_path = ''
as $$
declare me text := public.current_email(); v_bytes bytea; t public.file_thumbs;
begin
  if not public.mail_key_ok(p_key) or me is null then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if (p_asset is null) = (p_mail_file is null) or (p_asset is not null and p_version is null) then
    raise exception 'THUMB_INVALID' using errcode = 'P0001';
  end if;
  if not public.thumb_may_see(p_asset, p_mail_file) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if p_asset is not null and not exists (select 1 from public.media_versions v where v.asset_id = p_asset and v.version = p_version) then
    raise exception 'THUMB_INVALID' using errcode = 'P0001';
  end if;
  if p_data is not null then
    v_bytes := public.thumb_decode(p_data);
    if not public.thumb_bytes_ok(v_bytes, p_mime) then raise exception 'THUMB_INVALID' using errcode = 'P0001'; end if;
  end if;
  select * into t from public.file_thumbs
    where (p_asset is not null and asset_id = p_asset and version = p_version) or (p_mail_file is not null and mail_file_id = p_mail_file)
    for update;
  if found and t.state = 'ready' then return 'already'; end if;
  if found then
    update public.file_thumbs set state = case when v_bytes is null then 'none' else 'ready' end, data = v_bytes,
        mime = case when v_bytes is null then null else p_mime end, source = 'drive', made_by = me, made_at = now()
      where id = t.id;
  else
    insert into public.file_thumbs (asset_id, version, mail_file_id, state, data, mime, source, made_by)
    values (p_asset, case when p_asset is not null then p_version end, p_mail_file, case when v_bytes is null then 'none' else 'ready' end,
            v_bytes, case when v_bytes is null then null else p_mime end, 'drive', me);
  end if;
  return case when v_bytes is null then 'none' else 'kept' end;
end
$$;

-- ---------------------------------------------------------------------------
-- 4. Privileges
-- ---------------------------------------------------------------------------
revoke all on function public.thumb_may_see(uuid, uuid), public.thumb_bytes_ok(bytea, text), public.thumb_decode(text),
  public.thumb_save(uuid, int, uuid, text, text), public.thumb_keep(text, uuid, int, uuid, text, text) from public, anon;
grant execute on function public.thumb_may_see(uuid, uuid), public.thumb_bytes_ok(bytea, text), public.thumb_decode(text),
  public.thumb_save(uuid, int, uuid, text, text), public.thumb_keep(text, uuid, int, uuid, text, text) to authenticated;

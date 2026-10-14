-- Settings Step S2 (Settings_Integrations_Plan.md 6.1 and 6.2): where each stored file lives.
--
-- 1. storage_roles: which provider serves each role (library, mail, chat, backup). Today
--    every role points at Google Drive, the one provider; the backup role is empty.
-- 2. file_locations: one row per copy of a file at a provider, with its state and when it
--    was last verified. media_versions.drive_file_id and mail_files.drive_file_id stay as
--    they are (nothing reads file_locations to serve a file yet); a row here is made for
--    each of them, now and from now on, by trigger. No behaviour of any file changes.
-- 3. Reading: the state of one asset's versions for anyone who may see the asset; the
--    storage overview and a verification batch for those who manage storage. A check of a
--    file is made by the server (it asks the provider) and recorded with the server key, so
--    no signed-in person can write a state by hand.
-- 4. Moving, a second provider and backups are Steps S3 and S4; nothing here allows them.

-- ---------------------------------------------------------------------------
-- 1. Roles
-- ---------------------------------------------------------------------------
create table public.storage_roles (
  role text primary key check (role in ('library','mail','chat','backup')),
  integration_id uuid references public.integrations(id),
  updated_by text,
  updated_at timestamptz not null default now()
);
insert into public.storage_roles (role, integration_id, updated_by) values
  ('library', '00000000-0000-4000-8000-0000000000d1', 'installation'),
  ('mail',    '00000000-0000-4000-8000-0000000000d1', 'installation'),
  ('chat',    '00000000-0000-4000-8000-0000000000d1', 'installation'),
  ('backup',  null, 'installation');
alter table public.storage_roles enable row level security;
-- No policies: read through storage_overview().

-- ---------------------------------------------------------------------------
-- 2. Locations
-- ---------------------------------------------------------------------------
create table public.file_locations (
  id uuid primary key default gen_random_uuid(),
  integration_id uuid not null references public.integrations(id),
  -- What the file is: a version of a library asset, or a mail and messaging attachment.
  subject_kind text not null check (subject_kind in ('media_version','mail_file')),
  subject_id uuid not null,
  -- The provider's own reference (Drive's file id). Never a secret, never shown outside admin pages.
  ref text not null check (char_length(ref) between 1 and 300),
  role text not null default 'primary' check (role in ('primary','replica','backup')),
  state text not null default 'ok' check (state in ('ok','pending','failed','missing','retired')),
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  checksum text check (checksum is null or char_length(checksum) <= 128),
  verified_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index file_locations_ref_unique on public.file_locations (integration_id, ref);
create unique index file_locations_one_primary on public.file_locations (subject_kind, subject_id)
  where role = 'primary' and state <> 'retired';
create index file_locations_subject_idx on public.file_locations (subject_kind, subject_id);
create index file_locations_verify_idx on public.file_locations (verified_at nulls first, created_at) where state <> 'retired';
create index file_locations_integration_idx on public.file_locations (integration_id);
alter table public.file_locations enable row level security;
-- No policies: read through storage_asset_state() and storage_overview().

create function public.storage_integration_for(p_role text) returns uuid
language sql stable security definer set search_path = ''
as $$ select integration_id from public.storage_roles where role = p_role $$;

-- Backfill: every version and attachment already stored is at the Drive provider.
insert into public.file_locations (integration_id, subject_kind, subject_id, ref, size_bytes, created_at)
select public.storage_integration_for('library'), 'media_version', v.id, v.drive_file_id, v.size_bytes, v.created_at
from public.media_versions v
where public.storage_integration_for('library') is not null
on conflict do nothing;

insert into public.file_locations (integration_id, subject_kind, subject_id, ref, size_bytes, created_at)
select public.storage_integration_for('mail'), 'mail_file', f.id, f.drive_file_id, f.size_bytes, f.created_at
from public.mail_files f
where public.storage_integration_for('mail') is not null
on conflict do nothing;

-- Keeping it true from now on.
create function public.file_location_on_version() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.file_locations where subject_kind = 'media_version' and subject_id = old.id;
    return old;
  end if;
  if public.storage_integration_for('library') is not null then
    insert into public.file_locations (integration_id, subject_kind, subject_id, ref, size_bytes)
    values (public.storage_integration_for('library'), 'media_version', new.id, new.drive_file_id, new.size_bytes)
    on conflict do nothing;
  end if;
  return new;
end
$$;
create trigger media_versions_location after insert or delete on public.media_versions
  for each row execute function public.file_location_on_version();

create function public.file_location_on_mail_file() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.file_locations where subject_kind = 'mail_file' and subject_id = old.id;
    return old;
  end if;
  if public.storage_integration_for('mail') is not null then
    insert into public.file_locations (integration_id, subject_kind, subject_id, ref, size_bytes)
    values (public.storage_integration_for('mail'), 'mail_file', new.id, new.drive_file_id, new.size_bytes)
    on conflict do nothing;
  end if;
  return new;
end
$$;
create trigger mail_files_location after insert or delete on public.mail_files
  for each row execute function public.file_location_on_mail_file();

-- ---------------------------------------------------------------------------
-- 3. Events
-- ---------------------------------------------------------------------------
alter table public.integration_events drop constraint integration_events_kind_check;
alter table public.integration_events add constraint integration_events_kind_check
  check (kind in ('created','connected','health','secret_set','secret_committed','secret_discarded','secret_used',
                  'enabled','disabled','deleted','settings','storage_verified'));

-- ---------------------------------------------------------------------------
-- 4. Reading
-- ---------------------------------------------------------------------------
-- Where the versions of one asset live and whether that was checked, for anyone who may see it.
-- Provider names and states only: never a reference.
create function public.storage_asset_state(p_asset uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if public.media_asset_level(p_asset) < 1 then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
        'version', v.version, 'provider', i.label, 'type', i.type, 'role', l.role, 'state', l.state,
        'size_bytes', l.size_bytes, 'verified_at', l.verified_at) order by v.version desc, l.role)
    from public.media_versions v
    join public.file_locations l on l.subject_kind = 'media_version' and l.subject_id = v.id and l.state <> 'retired'
    join public.integrations i on i.id = l.integration_id
    where v.asset_id = p_asset), '[]'::jsonb);
end
$$;

-- The storage tab: providers with what they hold, the role map, and a consistency count.
create function public.storage_overview() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not (public.has_capability('settings.view', null) or public.has_capability('storage.manage', null)) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  return jsonb_build_object(
    'providers', coalesce((
      select jsonb_agg(jsonb_build_object(
          'id', i.id, 'type', i.type, 'label', i.label, 'state', i.state,
          'last_check_at', i.last_check_at, 'last_ok_at', i.last_ok_at, 'last_error', i.last_error,
          'account', i.config->>'account',
          'files', coalesce(s.files, 0), 'bytes', coalesce(s.bytes, 0),
          'library_files', coalesce(s.library_files, 0), 'mail_files', coalesce(s.mail_files, 0),
          'ok', coalesce(s.ok, 0), 'pending', coalesce(s.pending, 0), 'failed', coalesce(s.failed, 0), 'missing', coalesce(s.missing, 0),
          'unverified', coalesce(s.unverified, 0), 'last_verified_at', s.last_verified_at) order by i.created_at)
      from public.integrations i
      left join (
        select integration_id,
               count(*) files, coalesce(sum(size_bytes), 0) bytes,
               count(*) filter (where subject_kind = 'media_version') library_files,
               count(*) filter (where subject_kind = 'mail_file') mail_files,
               count(*) filter (where state = 'ok') ok, count(*) filter (where state = 'pending') pending,
               count(*) filter (where state = 'failed') failed, count(*) filter (where state = 'missing') missing,
               count(*) filter (where verified_at is null) unverified, max(verified_at) last_verified_at
        from public.file_locations where state <> 'retired' group by integration_id) s on s.integration_id = i.id
      where i.kind = 'storage' and i.deleted_at is null), '[]'::jsonb),
    'roles', coalesce((
      select jsonb_agg(jsonb_build_object('role', r.role, 'integration_id', r.integration_id, 'label', i.label)
        order by case r.role when 'library' then 1 when 'mail' then 2 when 'chat' then 3 else 4 end)
      from public.storage_roles r left join public.integrations i on i.id = r.integration_id), '[]'::jsonb),
    -- Files with no primary location: should always be zero.
    'unrecorded', (select count(*) from public.media_versions v
                    where not exists (select 1 from public.file_locations l where l.subject_kind = 'media_version' and l.subject_id = v.id and l.state <> 'retired'))
                 + (select count(*) from public.mail_files f
                    where not exists (select 1 from public.file_locations l where l.subject_kind = 'mail_file' and l.subject_id = f.id and l.state <> 'retired')),
    'can_manage', public.has_capability('storage.manage', null));
end
$$;

-- ---------------------------------------------------------------------------
-- 5. Verifying
-- ---------------------------------------------------------------------------
-- The next files to check, least recently checked first. Only a person who manages storage
-- may start a check; the server then asks the provider and records the answer with its key.
create function public.storage_verify_batch(p_limit int default 20) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.has_capability('storage.manage', null) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', x.id, 'ref', x.ref, 'type', x.type, 'size_bytes', x.size_bytes))
    from (
      select l.id, l.ref, i.type, l.size_bytes
      from public.file_locations l join public.integrations i on i.id = l.integration_id
      where l.state <> 'retired' and i.deleted_at is null
      order by l.verified_at nulls first, l.created_at
      limit least(greatest(coalesce(p_limit, 20), 1), 50)) x), '[]'::jsonb);
end
$$;

-- The server's record of what the provider said: [{id, state: ok|missing|failed}]. Only the
-- server key may write it, so no signed-in person can mark a file by hand.
create function public.storage_verify_mark(p_key text, p_actor text, p_results jsonb) returns int
language plpgsql security definer set search_path = ''
as $$
declare x jsonb; n int := 0; integ uuid; st text; per jsonb := '{}'::jsonb; cur jsonb;
begin
  if not public.mail_key_ok(p_key) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if jsonb_typeof(p_results) <> 'array' or jsonb_array_length(p_results) > 100 then
    raise exception 'BAD_RESULTS' using errcode = 'P0001';
  end if;
  for x in select e from jsonb_array_elements(p_results) e loop
    st := x->>'state';
    if st not in ('ok','missing','failed') then continue; end if;
    update public.file_locations
      set state = st, verified_at = now()
      where id = (x->>'id')::uuid and state <> 'retired'
      returning integration_id into integ;
    if integ is null then continue; end if;
    n := n + 1;
    cur := coalesce(per->(integ::text), jsonb_build_object('checked', 0, 'ok', 0, 'missing', 0, 'failed', 0));
    cur := jsonb_set(cur, '{checked}', to_jsonb((cur->>'checked')::int + 1));
    cur := jsonb_set(cur, array[st], to_jsonb((cur->>st)::int + 1));
    per := jsonb_set(per, array[integ::text], cur);
    integ := null;
  end loop;
  insert into public.integration_events (integration_id, actor, kind, data)
  select k::uuid, nullif(left(btrim(coalesce(p_actor, '')), 120), ''), 'storage_verified', v
  from jsonb_each(per) as t(k, v);
  return n;
end
$$;

-- ---------------------------------------------------------------------------
-- 6. Privileges
-- ---------------------------------------------------------------------------
revoke all on function public.storage_integration_for(text), public.file_location_on_version(), public.file_location_on_mail_file()
  from public, anon, authenticated;
revoke all on function public.storage_asset_state(uuid), public.storage_overview(), public.storage_verify_batch(int),
  public.storage_verify_mark(text, text, jsonb) from public, anon;
grant execute on function public.storage_asset_state(uuid), public.storage_overview(), public.storage_verify_batch(int) to authenticated;
-- The server's own call: the key decides, as for the vault and the mail routes.
grant execute on function public.storage_verify_mark(text, text, jsonb) to anon, authenticated;

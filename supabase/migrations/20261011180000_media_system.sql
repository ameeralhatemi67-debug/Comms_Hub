-- Media system: folders with per-folder permissions, pipeline stages, versions,
-- tasks, notes and an append-only activity log. The rules live here, in Postgres,
-- so no client (including the Hub's own pages) can step around them.
--
-- Levels: 0 none, 1 view, 2 edit, 3 create, 4 manage. A folder can be restricted
-- (does not inherit) or locked (read-only below manage).
-- Administrators act as any role (testing phase, recorded in progress.md).

-- ---------------------------------------------------------------------------
-- Folders and grants
-- ---------------------------------------------------------------------------
create table public.media_folders (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.media_folders(id) on delete restrict,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  -- null: the Hub's root folder in Drive (files uploaded before folders existed)
  drive_folder_id text,
  restricted boolean not null default false,
  locked boolean not null default false,
  lock_reason text check (lock_reason is null or char_length(lock_reason) <= 200),
  created_by text not null,
  created_at timestamptz not null default now()
);
create index media_folders_parent_idx on public.media_folders (parent_id);

create table public.media_grants (
  id uuid primary key default gen_random_uuid(),
  -- null folder: the defaults that apply at the top of the library
  folder_id uuid references public.media_folders(id) on delete cascade,
  subject_type text not null check (subject_type in ('role','person')),
  subject text not null,
  level int not null check (level between 0 and 4)
);
create unique index media_grants_unique on public.media_grants
  (coalesce(folder_id, '00000000-0000-0000-0000-000000000000'::uuid), subject_type, subject);

alter table public.media_folders enable row level security;
alter table public.media_grants enable row level security;

-- Where unfiled files live, and the top-level defaults.
insert into public.media_folders (id, parent_id, name, drive_folder_id, created_by)
values ('00000000-0000-0000-0000-0000000000a1', null, 'غير مصنّف', null, 'seed');
insert into public.media_grants (folder_id, subject_type, subject, level) values
  (null, 'role', 'director', 4),
  (null, 'role', 'assistant', 3);

-- ---------------------------------------------------------------------------
-- Assets: the existing media_files table grows into the asset record
-- ---------------------------------------------------------------------------
alter table public.media_files
  add column folder_id uuid references public.media_folders(id),
  add column stage text not null default 'draft'
    check (stage in ('draft','production','review','changes','rejected','ready','scheduled','published','partial','failed')),
  add column tags text[] not null default '{}' check (cardinality(tags) <= 20),
  add column work_ref text check (work_ref is null or char_length(work_ref) <= 40),
  add column current_version int not null default 1,
  add column approved_version int,
  add column channels text[] not null default '{}',
  add column copy jsonb not null default '{}'::jsonb,
  add column schedule jsonb,
  add column checklist jsonb not null default '{"copy":false,"rights":false,"sizes":false,"review":false}'::jsonb,
  add column dims text check (dims is null or char_length(dims) <= 60),
  add column duration text check (duration is null or char_length(duration) <= 12),
  add column updated_at timestamptz not null default now();

update public.media_files set folder_id = '00000000-0000-0000-0000-0000000000a1' where folder_id is null;
alter table public.media_files alter column folder_id set not null;
create index media_files_folder_idx on public.media_files (folder_id);

create table public.media_versions (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.media_files(id) on delete cascade,
  version int not null,
  drive_file_id text not null unique,
  size_bytes bigint not null check (size_bytes > 0),
  mime_type text not null,
  uploaded_by text not null,
  note text check (note is null or char_length(note) <= 200),
  created_at timestamptz not null default now(),
  unique (asset_id, version)
);
insert into public.media_versions (asset_id, version, drive_file_id, size_bytes, mime_type, uploaded_by, created_at)
select id, 1, drive_file_id, size_bytes, mime_type, uploaded_by, created_at from public.media_files;
alter table public.media_versions enable row level security;

create table public.media_tasks (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid references public.media_files(id) on delete cascade,
  what text not null check (char_length(btrim(what)) between 1 and 140),
  kind text not null default 'other' check (kind in ('copy','design','edit','review','publish','other')),
  assignee text not null,
  assigned_by text not null,
  due timestamptz not null,
  priority text not null default 'normal' check (priority in ('normal','urgent')),
  note text check (note is null or char_length(note) <= 500),
  status text not null default 'open' check (status in ('open','done')),
  created_at timestamptz not null default now(),
  done_at timestamptz
);
create index media_tasks_assignee_idx on public.media_tasks (assignee, status);
alter table public.media_tasks enable row level security;

create table public.media_notes (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.media_files(id) on delete cascade,
  author text not null,
  body text not null check (char_length(btrim(body)) between 1 and 500),
  timecode text check (timecode is null or timecode ~ '^[0-9]{1,2}:[0-5][0-9]$'),
  created_at timestamptz not null default now()
);
alter table public.media_notes enable row level security;

-- Append-only: the Hub's functions write it, nobody edits or deletes it.
create table public.activity_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor_email text not null,
  type text not null,
  asset_id uuid,
  folder_id uuid,
  task_id uuid,
  data jsonb not null default '{}'::jsonb
);
create index activity_log_at_idx on public.activity_log (at desc);
create index activity_log_asset_idx on public.activity_log (asset_id, at desc);
alter table public.activity_log enable row level security;

-- ---------------------------------------------------------------------------
-- Level resolution
-- ---------------------------------------------------------------------------
create function public.media_level(p_email text, p_folder uuid) returns int
language plpgsql stable security definer set search_path = ''
as $$
declare
  r text; cur uuid := p_folder; f public.media_folders; lvl int;
begin
  select a.role into r from public.accounts a where a.email = p_email;
  if r is null then return 0; end if;
  if r = 'admin' then return 4; end if;
  while cur is not null loop
    select * into f from public.media_folders where id = cur;
    if not found then return 0; end if;
    select g.level into lvl from public.media_grants g
      where g.folder_id = cur and g.subject_type = 'person' and g.subject = p_email;
    if found then return lvl; end if;
    select g.level into lvl from public.media_grants g
      where g.folder_id = cur and g.subject_type = 'role' and g.subject = r;
    if found then return lvl; end if;
    if f.restricted then return 0; end if;
    cur := f.parent_id;
  end loop;
  select g.level into lvl from public.media_grants g
    where g.folder_id is null and g.subject_type = 'person' and g.subject = p_email;
  if found then return lvl; end if;
  select g.level into lvl from public.media_grants g
    where g.folder_id is null and g.subject_type = 'role' and g.subject = r;
  if found then return lvl; end if;
  return 0;
end
$$;

create function public.media_my_level(p_folder uuid) returns int
language sql stable security definer set search_path = ''
as $$ select public.media_level(public.current_email(), p_folder) $$;

-- The nearest locked folder at or above this one.
create function public.media_locked_by(p_folder uuid) returns uuid
language plpgsql stable security definer set search_path = ''
as $$
declare cur uuid := p_folder; f public.media_folders;
begin
  while cur is not null loop
    select * into f from public.media_folders where id = cur;
    if not found then return null; end if;
    if f.locked then return f.id; end if;
    cur := f.parent_id;
  end loop;
  return null;
end
$$;

create function public.media_my_role() returns text
language sql stable security definer set search_path = ''
as $$ select a.role from public.accounts a where a.email = public.current_email() $$;

-- True when the caller holds one of these roles. Administrators act as any role.
create function public.media_acts(p_roles text[]) returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(public.media_my_role() = 'admin' or public.media_my_role() = any (p_roles), false)
$$;

create function public.media_is_descendant(p_child uuid, p_ancestor uuid) returns boolean
language plpgsql stable security definer set search_path = ''
as $$
declare cur uuid := p_child; f public.media_folders;
begin
  while cur is not null loop
    if cur = p_ancestor then return true; end if;
    select * into f from public.media_folders where id = cur;
    if not found then return false; end if;
    cur := f.parent_id;
  end loop;
  return false;
end
$$;

create function public.media_asset_level(p_asset uuid) returns int
language sql stable security definer set search_path = ''
as $$
  select coalesce((select public.media_my_level(m.folder_id) from public.media_files m where m.id = p_asset), 0)
$$;

-- The caller may add to this folder (upload, new folder): create level, and not
-- locked unless they manage it.
create function public.media_can_create(p_folder uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.media_my_level(p_folder) >= 3
     and (public.media_locked_by(p_folder) is null or public.media_my_level(p_folder) >= 4)
$$;

create function public.media_can_edit(p_folder uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.media_my_level(p_folder) >= 2
     and (public.media_locked_by(p_folder) is null or public.media_my_level(p_folder) >= 4)
$$;

create function public.media_can_delete(p_asset uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.media_files m
    where m.id = p_asset
      and public.media_my_level(m.folder_id) >= 4
      and not (m.approved_version is not null and m.stage in ('ready','scheduled','published'))
  )
$$;

-- The folders the caller can see, plus the parents that only lead to them.
create function public.media_tree()
returns table (id uuid, parent_id uuid, name text, restricted boolean, locked boolean,
               lock_reason text, level int, ghost boolean, locked_by uuid, created_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  with f as (
    select m.*, public.media_my_level(m.id) as lvl, public.media_locked_by(m.id) as lb
    from public.media_folders m
  )
  select f.id, f.parent_id, f.name, f.restricted, f.locked, f.lock_reason, f.lvl, false, f.lb, f.created_at
  from f where f.lvl > 0
  union all
  select a.id, a.parent_id, a.name, a.restricted, a.locked, a.lock_reason, 0, true, a.lb, a.created_at
  from f a
  where a.lvl = 0 and exists (
    select 1 from f d where d.lvl > 0 and d.id <> a.id and public.media_is_descendant(d.id, a.id)
  )
$$;

-- Names and roles of approved people, for avatars, the team list and the log.
create function public.media_people() returns table (email text, display_name text, role text)
language sql stable security definer set search_path = ''
as $$
  select a.email, a.display_name, a.role from public.accounts a
  where exists (select 1 from public.accounts me where me.email = public.current_email())
$$;

-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------
create policy folders_read on public.media_folders for select to authenticated
  using ((select public.media_my_level(id)) >= 1);
create policy folders_insert on public.media_folders for insert to authenticated
  with check ((select public.media_can_create(parent_id)) and created_by = (select public.current_email()));
create policy folders_update on public.media_folders for update to authenticated
  using ((select public.media_my_level(id)) >= 2) with check ((select public.media_my_level(id)) >= 2);
create policy folders_delete on public.media_folders for delete to authenticated
  using ((select public.media_my_level(id)) >= 4);

create policy grants_read on public.media_grants for select to authenticated
  using ((select public.media_my_level(folder_id)) >= 4);
create policy grants_write on public.media_grants for all to authenticated
  using ((select public.media_my_level(folder_id)) >= 4) with check ((select public.media_my_level(folder_id)) >= 4);

drop policy media_read on public.media_files;
drop policy media_insert on public.media_files;
drop policy media_delete on public.media_files;
create policy assets_read on public.media_files for select to authenticated
  using ((select public.media_my_level(folder_id)) >= 1);
create policy assets_insert on public.media_files for insert to authenticated
  with check ((select public.media_can_create(folder_id)) and uploaded_by = (select public.current_email()));
create policy assets_update on public.media_files for update to authenticated
  using ((select public.media_my_level(folder_id)) >= 1) with check ((select public.media_my_level(folder_id)) >= 1);
create policy assets_delete on public.media_files for delete to authenticated
  using ((select public.media_can_delete(id)));

create policy versions_read on public.media_versions for select to authenticated
  using ((select public.media_asset_level(asset_id)) >= 1);
create policy versions_insert on public.media_versions for insert to authenticated
  with check (uploaded_by = (select public.current_email())
              and (select public.media_acts(array['writer','designer','producer','assistant','director']))
              and exists (select 1 from public.media_files m where m.id = asset_id and public.media_can_create(m.folder_id)));

create policy tasks_read on public.media_tasks for select to authenticated
  using (assignee = (select public.current_email()) or assigned_by = (select public.current_email())
         or (select public.media_acts(array['director','assistant'])));
create policy tasks_insert on public.media_tasks for insert to authenticated
  with check (assigned_by = (select public.current_email())
              and (select public.media_acts(array['director','assistant','producer']))
              and (asset_id is null or (select public.media_asset_level(asset_id)) >= 1));
create policy tasks_update on public.media_tasks for update to authenticated
  using (assignee = (select public.current_email()) or (select public.media_acts(array['director','assistant'])))
  with check (assignee = (select public.current_email()) or (select public.media_acts(array['director','assistant'])));

create policy notes_read on public.media_notes for select to authenticated
  using ((select public.media_asset_level(asset_id)) >= 1);
create policy notes_insert on public.media_notes for insert to authenticated
  with check ((select public.media_asset_level(asset_id)) >= 1 and author = (select public.current_email()));

create policy log_read on public.activity_log for select to authenticated
  using ((select public.media_acts(array['director','assistant']))
         or actor_email = (select public.current_email())
         or (asset_id is not null and (select public.media_asset_level(asset_id)) >= 1));

-- ---------------------------------------------------------------------------
-- Logging helper
-- ---------------------------------------------------------------------------
create function public.media_log(p_type text, p_asset uuid, p_folder uuid, p_task uuid, p_data jsonb)
returns void language sql security definer set search_path = ''
as $$
  insert into public.activity_log (actor_email, type, asset_id, folder_id, task_id, data)
  values (coalesce(public.current_email(), 'system'), p_type, p_asset, p_folder, p_task, coalesce(p_data, '{}'::jsonb))
$$;

-- ---------------------------------------------------------------------------
-- Assets: guard and log
-- ---------------------------------------------------------------------------
create function public.media_files_guard() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  actor text := public.current_email();
  creative text[] := array['writer','designer','producer','assistant','director'];
  lvl_old int; lvl_new int; edit_ok boolean; asset_locked boolean; ok boolean;
begin
  if tg_op = 'INSERT' then
    if actor is null then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
    new.uploaded_by := actor;
    new.stage := 'draft'; new.current_version := 1; new.approved_version := null; new.schedule := null;
    return new;
  end if;

  if current_setting('app.media_internal', true) = '1' then return new; end if;
  if actor is null then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;

  lvl_old := public.media_level(actor, old.folder_id);
  edit_ok := lvl_old >= 2 and (public.media_locked_by(old.folder_id) is null or lvl_old >= 4);
  asset_locked := old.approved_version is not null and old.stage in ('ready','scheduled','published');

  if new.id is distinct from old.id or new.drive_file_id is distinct from old.drive_file_id
     or new.uploaded_by is distinct from old.uploaded_by or new.current_version is distinct from old.current_version
     or new.size_bytes is distinct from old.size_bytes or new.mime_type is distinct from old.mime_type
     or new.kind is distinct from old.kind or new.created_at is distinct from old.created_at then
    raise exception 'IMMUTABLE_COLUMN' using errcode = 'P0001';
  end if;

  if new.name is distinct from old.name and (not edit_ok or asset_locked) then
    raise exception 'NAME_LOCKED' using errcode = 'P0001';
  end if;
  if (new.tags is distinct from old.tags or new.work_ref is distinct from old.work_ref
      or new.channels is distinct from old.channels or new.dims is distinct from old.dims
      or new.duration is distinct from old.duration) and (not edit_ok or asset_locked) then
    raise exception 'EDIT_LOCKED' using errcode = 'P0001';
  end if;
  if new.folder_id is distinct from old.folder_id then
    lvl_new := public.media_level(actor, new.folder_id);
    if not edit_ok or asset_locked or lvl_new < 2
       or (public.media_locked_by(new.folder_id) is not null and lvl_new < 4) then
      raise exception 'MOVE_DENIED' using errcode = 'P0001';
    end if;
  end if;

  if new.copy is distinct from old.copy then
    if not (public.media_acts(array['writer','assistant','director','publisher']) and lvl_old >= 1) then
      raise exception 'COPY_DENIED' using errcode = 'P0001';
    end if;
    new.checklist := jsonb_set(new.checklist, '{copy}', to_jsonb(new.copy <> '{}'::jsonb));
  end if;

  if new.stage is distinct from old.stage then
    if old.stage = 'draft' and new.stage = 'production' then
      ok := public.media_acts(creative) and edit_ok;
    elsif new.stage = 'review' and old.stage in ('draft','production','changes') then
      ok := public.media_acts(creative) and edit_ok;
    elsif old.stage = 'review' and new.stage = 'ready' then
      ok := public.media_acts(array['director','assistant']) and lvl_old >= 1;
      new.approved_version := old.current_version;
      new.checklist := jsonb_set(new.checklist, '{review}', 'true'::jsonb);
    elsif old.stage = 'review' and new.stage = 'changes' then
      ok := public.media_acts(array['director','assistant']) and lvl_old >= 1;
    elsif old.stage = 'review' and new.stage = 'rejected' then
      ok := public.media_acts(array['director']) and lvl_old >= 1;
    elsif old.stage = 'rejected' and new.stage in ('draft','production') then
      ok := public.media_acts(creative) and edit_ok;
    elsif old.stage in ('ready','scheduled') and new.stage in ('scheduled','published','partial','failed') then
      ok := public.media_acts(array['publisher']) and lvl_old >= 1;
    elsif old.stage in ('partial','failed') and new.stage in ('scheduled','published','partial','failed') then
      ok := public.media_acts(array['publisher']) and lvl_old >= 1;
    else
      ok := false;
    end if;
    if not ok then raise exception 'STAGE_DENIED' using errcode = 'P0001'; end if;
    if new.stage = 'scheduled' and new.schedule is null then
      raise exception 'SCHEDULE_REQUIRED' using errcode = 'P0001';
    end if;
  elsif new.schedule is distinct from old.schedule then
    if not (public.media_acts(array['publisher']) and old.stage in ('ready','scheduled') and lvl_old >= 1) then
      raise exception 'STAGE_DENIED' using errcode = 'P0001';
    end if;
  end if;

  if new.approved_version is distinct from old.approved_version
     and not (old.stage = 'review' and new.stage = 'ready') then
    raise exception 'IMMUTABLE_COLUMN' using errcode = 'P0001';
  end if;

  -- The user-set checklist items (rights, sizes) follow the edit rule.
  if (new.checklist - 'copy' - 'review') is distinct from (old.checklist - 'copy' - 'review') and not edit_ok then
    raise exception 'EDIT_LOCKED' using errcode = 'P0001';
  end if;

  new.updated_at := now();
  return new;
end
$$;
create trigger media_files_guard_ins before insert on public.media_files
  for each row execute function public.media_files_guard();
create trigger media_files_guard_upd before update on public.media_files
  for each row execute function public.media_files_guard();

create function public.media_files_log() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare t text;
begin
  if tg_op = 'INSERT' then
    perform public.media_log('upload', new.id, new.folder_id, null,
      jsonb_build_object('name', new.name, 'size', new.size_bytes));
    insert into public.media_versions (asset_id, version, drive_file_id, size_bytes, mime_type, uploaded_by)
    values (new.id, 1, new.drive_file_id, new.size_bytes, new.mime_type, new.uploaded_by);
    return new;
  elsif tg_op = 'DELETE' then
    perform public.media_log('remove', old.id, old.folder_id, null, jsonb_build_object('name', old.name));
    return old;
  end if;
  if new.name is distinct from old.name then
    perform public.media_log('rename', new.id, new.folder_id, null,
      jsonb_build_object('before', old.name, 'after', new.name));
  end if;
  if new.folder_id is distinct from old.folder_id then
    perform public.media_log('move', new.id, new.folder_id, null, jsonb_build_object('name', new.name,
      'from', (select f.name from public.media_folders f where f.id = old.folder_id),
      'to', (select f.name from public.media_folders f where f.id = new.folder_id)));
  end if;
  if new.tags is distinct from old.tags then
    perform public.media_log('tag', new.id, new.folder_id, null,
      jsonb_build_object('name', new.name, 'before', to_jsonb(old.tags), 'after', to_jsonb(new.tags)));
  end if;
  if new.stage is distinct from old.stage then
    t := case new.stage when 'ready' then 'approve' when 'changes' then 'changes' when 'rejected' then 'reject'
           when 'scheduled' then 'schedule' when 'published' then 'publish' when 'partial' then 'publish'
           when 'failed' then 'publish' else 'stage' end;
    perform public.media_log(t, new.id, new.folder_id, null, jsonb_build_object('name', new.name,
      'from', old.stage, 'to', new.stage, 'version', coalesce(new.approved_version, new.current_version),
      'schedule', new.schedule));
  elsif new.schedule is distinct from old.schedule then
    perform public.media_log('schedule', new.id, new.folder_id, null,
      jsonb_build_object('name', new.name, 'schedule', new.schedule));
  end if;
  if new.copy is distinct from old.copy then
    perform public.media_log('copy', new.id, new.folder_id, null,
      jsonb_build_object('name', new.name, 'platforms', (select coalesce(jsonb_agg(k), '[]'::jsonb) from jsonb_object_keys(new.copy) k)));
  end if;
  return new;
end
$$;
create trigger media_files_log_trg after insert or update or delete on public.media_files
  for each row execute function public.media_files_log();

-- ---------------------------------------------------------------------------
-- Versions: a new version becomes the asset's current file
-- ---------------------------------------------------------------------------
create function public.media_versions_apply() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare a public.media_files;
begin
  if new.version = 1 then return new; end if;
  select * into a from public.media_files where id = new.asset_id;
  if not found then return new; end if;
  if new.version <> a.current_version + 1 then
    raise exception 'VERSION_ORDER' using errcode = 'P0001';
  end if;
  if a.stage = 'published' then
    raise exception 'STAGE_DENIED' using errcode = 'P0001';
  end if;
  perform set_config('app.media_internal', '1', true);
  update public.media_files set
      current_version = new.version, drive_file_id = new.drive_file_id,
      size_bytes = new.size_bytes, mime_type = new.mime_type,
      -- A change after review or approval goes back to review; the approved
      -- version stays recorded and stays the one that can be published.
      stage = case when a.stage in ('draft','production') then a.stage else 'review' end,
      updated_at = now()
    where id = new.asset_id;
  perform set_config('app.media_internal', '0', true);
  perform public.media_log('version', new.asset_id, a.folder_id, null,
    jsonb_build_object('name', a.name, 'version', new.version, 'note', new.note));
  return new;
end
$$;
create trigger media_versions_apply_trg after insert on public.media_versions
  for each row execute function public.media_versions_apply();

-- ---------------------------------------------------------------------------
-- Folders and grants: guard and log
-- ---------------------------------------------------------------------------
create function public.media_folders_guard() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare lvl int := public.media_my_level(old.id);
begin
  if new.id is distinct from old.id or new.created_by is distinct from old.created_by
     or new.parent_id is distinct from old.parent_id
     -- the Drive folder id is set once, right after the folder is created in Drive
     or (new.drive_folder_id is distinct from old.drive_folder_id
         and (old.drive_folder_id is not null or old.id = '00000000-0000-0000-0000-0000000000a1')) then
    raise exception 'IMMUTABLE_COLUMN' using errcode = 'P0001';
  end if;
  if new.name is distinct from old.name and not public.media_can_edit(old.id) then
    raise exception 'NAME_LOCKED' using errcode = 'P0001';
  end if;
  if (new.restricted is distinct from old.restricted or new.locked is distinct from old.locked
      or new.lock_reason is distinct from old.lock_reason) and lvl < 4 then
    raise exception 'MANAGE_REQUIRED' using errcode = 'P0001';
  end if;
  return new;
end
$$;
create trigger media_folders_guard_trg before update on public.media_folders
  for each row execute function public.media_folders_guard();

create function public.media_folders_log() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform public.media_log('folder', null, new.id, null, jsonb_build_object('name', new.name, 'parent',
      (select f.name from public.media_folders f where f.id = new.parent_id)));
  elsif tg_op = 'UPDATE' then
    if new.name is distinct from old.name then
      perform public.media_log('rename', null, new.id, null, jsonb_build_object('before', old.name, 'after', new.name, 'folder', true));
    end if;
    if new.locked is distinct from old.locked then
      perform public.media_log('lock', null, new.id, null, jsonb_build_object('name', new.name, 'locked', new.locked, 'reason', new.lock_reason));
    end if;
    if new.restricted is distinct from old.restricted then
      perform public.media_log('access', null, new.id, null, jsonb_build_object('name', new.name, 'restricted', new.restricted));
    end if;
  end if;
  return new;
end
$$;
create trigger media_folders_log_trg after insert or update on public.media_folders
  for each row execute function public.media_folders_log();

create function public.media_grants_log() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare r public.media_grants;
begin
  r := case when tg_op = 'DELETE' then old else new end;
  perform public.media_log('access', null, r.folder_id, null, jsonb_build_object(
    'name', (select f.name from public.media_folders f where f.id = r.folder_id),
    'subject_type', r.subject_type, 'subject', r.subject,
    'before', case when tg_op = 'INSERT' then null else old.level end,
    'after', case when tg_op = 'DELETE' then null else new.level end));
  return r;
end
$$;
create trigger media_grants_log_trg after insert or update or delete on public.media_grants
  for each row execute function public.media_grants_log();

-- ---------------------------------------------------------------------------
-- Tasks and notes: log
-- ---------------------------------------------------------------------------
create function public.media_tasks_log() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform public.media_log('assign', new.asset_id, null, new.id, jsonb_build_object(
      'what', new.what, 'assignee', new.assignee, 'due', new.due, 'priority', new.priority, 'kind', new.kind));
  elsif new.status = 'done' and old.status <> 'done' then
    perform public.media_log('done', new.asset_id, null, new.id, jsonb_build_object('what', new.what, 'assignee', new.assignee));
  end if;
  return new;
end
$$;
create function public.media_tasks_done_stamp() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.status = 'done' and old.status <> 'done' then new.done_at := now(); end if;
  if new.what is distinct from old.what or new.assignee is distinct from old.assignee
     or new.assigned_by is distinct from old.assigned_by or new.asset_id is distinct from old.asset_id then
    raise exception 'IMMUTABLE_COLUMN' using errcode = 'P0001';
  end if;
  return new;
end
$$;
create trigger media_tasks_stamp_trg before update on public.media_tasks
  for each row execute function public.media_tasks_done_stamp();
create trigger media_tasks_log_trg after insert or update on public.media_tasks
  for each row execute function public.media_tasks_log();

create function public.media_notes_log() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform public.media_log('note', new.asset_id, null, null, jsonb_build_object(
    'text', new.body, 'timecode', new.timecode,
    'name', (select m.name from public.media_files m where m.id = new.asset_id)));
  return new;
end
$$;
create trigger media_notes_log_trg after insert on public.media_notes
  for each row execute function public.media_notes_log();

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
revoke all on function public.media_level(text, uuid) from public, anon, authenticated;
revoke all on function public.media_is_descendant(uuid, uuid) from public, anon, authenticated;
revoke all on function public.media_log(text, uuid, uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.media_files_guard() from public, anon, authenticated;
revoke all on function public.media_files_log() from public, anon, authenticated;
revoke all on function public.media_versions_apply() from public, anon, authenticated;
revoke all on function public.media_folders_guard() from public, anon, authenticated;
revoke all on function public.media_folders_log() from public, anon, authenticated;
revoke all on function public.media_grants_log() from public, anon, authenticated;
revoke all on function public.media_tasks_log() from public, anon, authenticated;
revoke all on function public.media_tasks_done_stamp() from public, anon, authenticated;
revoke all on function public.media_notes_log() from public, anon, authenticated;

revoke all on function public.media_my_level(uuid) from public, anon;
revoke all on function public.media_locked_by(uuid) from public, anon;
revoke all on function public.media_my_role() from public, anon;
revoke all on function public.media_acts(text[]) from public, anon;
revoke all on function public.media_asset_level(uuid) from public, anon;
revoke all on function public.media_can_create(uuid) from public, anon;
revoke all on function public.media_can_edit(uuid) from public, anon;
revoke all on function public.media_can_delete(uuid) from public, anon;
revoke all on function public.media_tree() from public, anon;
revoke all on function public.media_people() from public, anon;
grant execute on function public.media_my_level(uuid) to authenticated;
grant execute on function public.media_locked_by(uuid) to authenticated;
grant execute on function public.media_my_role() to authenticated;
grant execute on function public.media_acts(text[]) to authenticated;
grant execute on function public.media_asset_level(uuid) to authenticated;
grant execute on function public.media_can_create(uuid) to authenticated;
grant execute on function public.media_can_edit(uuid) to authenticated;
grant execute on function public.media_can_delete(uuid) to authenticated;
grant execute on function public.media_tree() to authenticated;
grant execute on function public.media_people() to authenticated;

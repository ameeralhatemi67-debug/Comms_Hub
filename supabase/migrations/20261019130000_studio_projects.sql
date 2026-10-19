-- The studio, Phase 2: projects in the database (Studio_Build_Plan.md section 5, MVP_draft.md 62).
--
--   * studio_projects: one row per project, shared by everyone who may open the studio (studio_can(),
--     the fixed capability motion.studio with the page of «استوديو الحركة»).
--   * studio_revisions: revision 0 is the autosave slot, replaced on every autosave; revisions 1 and up
--     are explicit saves, appended and never changed or deleted (zero data loss). An explicit save
--     empties the autosave slot, whose content it already holds.
--   * studio_sources: the library file and version each kept revision uses, read by the database from
--     the document's `sources`, never sent separately by the client.
--   * studio_exports: which explicit revision produced which library version.
--
-- Row level security is on with read policies only; every write is a function below. One person
-- edits a project at a time: a lease of 90 seconds, renewed by the editor every 30, checked at use.
-- Nothing is scheduled: an expired lease is simply free. A new library source must be visible to
-- the person saving; a source already recorded for the project is kept even when it is not, so the
-- director can save a project the Admin built from a restricted folder.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.studio_projects (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  kind text not null check (kind in ('video','photo')),
  owner text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text not null,
  revision int not null default 1 check (revision >= 1),
  autosaved_at timestamptz,
  work_ref text references public.works(id) on delete set null,
  archived_at timestamptz,
  archived_by text,
  lease_holder text,
  lease_until timestamptz
);
create index studio_projects_updated_idx on public.studio_projects (updated_at desc);

create table public.studio_revisions (
  project_id uuid not null references public.studio_projects(id) on delete restrict,
  revision int not null check (revision >= 0),
  base int not null check (base >= 0),
  schema_version int not null check (schema_version >= 1),
  doc jsonb not null,
  bytes int not null,
  saved_by text not null,
  saved_at timestamptz not null default now(),
  note text check (note is null or char_length(note) <= 200),
  primary key (project_id, revision)
);

create table public.studio_sources (
  project_id uuid not null references public.studio_projects(id) on delete restrict,
  revision int not null check (revision >= 0),
  asset_id uuid not null,
  version int not null check (version >= 1),
  primary key (project_id, revision, asset_id, version)
);
create index studio_sources_asset_idx on public.studio_sources (asset_id, version);

create table public.studio_exports (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.studio_projects(id) on delete restrict,
  revision int not null check (revision >= 1),
  asset_id uuid not null,
  version int not null check (version >= 1),
  kind text not null check (kind in ('video','image')),
  created_by text not null,
  created_at timestamptz not null default now(),
  unique (asset_id, version)
);
create index studio_exports_project_idx on public.studio_exports (project_id);

alter table public.studio_projects enable row level security;
alter table public.studio_revisions enable row level security;
alter table public.studio_sources enable row level security;
alter table public.studio_exports enable row level security;

create policy studio_projects_read on public.studio_projects for select to authenticated using ((select public.studio_can()));
create policy studio_revisions_read on public.studio_revisions for select to authenticated using ((select public.studio_can()));
create policy studio_sources_read on public.studio_sources for select to authenticated using ((select public.studio_can()));
create policy studio_exports_read on public.studio_exports for select to authenticated using ((select public.studio_can()));

-- ---------------------------------------------------------------------------
-- The document check (src/lib/studio/schema.ts checkDoc mirrors it)
-- ---------------------------------------------------------------------------
-- The client stops at 1,000,000 bytes of compact JSON; Postgres prints jsonb with spaces, so the
-- database allows 1.5 MiB of its own printing.
create function public.studio_doc_check(p_doc jsonb, p_kind text) returns void
language plpgsql immutable set search_path = ''
as $$
declare s jsonb; ids text[] := '{}';
begin
  if p_doc is null or jsonb_typeof(p_doc) is distinct from 'object' then raise exception 'DOC_INVALID' using errcode = 'P0001'; end if;
  if octet_length(p_doc::text) > 1572864 then raise exception 'DOC_TOO_LARGE' using errcode = 'P0001'; end if;
  if jsonb_typeof(p_doc->'schema') is distinct from 'number' or (p_doc->>'schema') <> '1' then raise exception 'DOC_INVALID' using errcode = 'P0001'; end if;
  if p_doc->>'kind' is distinct from p_kind then raise exception 'DOC_INVALID' using errcode = 'P0001'; end if;
  if jsonb_typeof(p_doc->'sources') is distinct from 'array' then raise exception 'DOC_INVALID' using errcode = 'P0001'; end if;
  for s in select x from jsonb_array_elements(p_doc->'sources') x loop
    if jsonb_typeof(s) is distinct from 'object' or jsonb_typeof(s->'id') is distinct from 'string' or coalesce(s->>'id', '') = ''
       or (s->>'id') = any (ids) then
      raise exception 'DOC_INVALID' using errcode = 'P0001';
    end if;
    ids := ids || (s->>'id');
    if s->>'kind' = 'library' then
      if coalesce(s->>'asset', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         or jsonb_typeof(s->'version') is distinct from 'number' or (s->>'version') !~ '^[1-9][0-9]{0,8}$' then
        raise exception 'DOC_INVALID' using errcode = 'P0001';
      end if;
    elsif s->>'kind' is distinct from 'local' then
      raise exception 'DOC_INVALID' using errcode = 'P0001';
    end if;
  end loop;
  if p_kind = 'video' and (jsonb_typeof(p_doc->'video') is distinct from 'object' or jsonb_typeof(p_doc->'video'->'tracks') is distinct from 'array') then
    raise exception 'DOC_INVALID' using errcode = 'P0001';
  end if;
  if p_kind = 'photo' and (jsonb_typeof(p_doc->'photo') is distinct from 'object' or jsonb_typeof(p_doc->'photo'->'layers') is distinct from 'array') then
    raise exception 'DOC_INVALID' using errcode = 'P0001';
  end if;
end
$$;

-- New library sources must be visible to the caller and exist at that version; sources already
-- recorded for the project are carried over (p_project null: every source is new).
create function public.studio_sources_ok(p_project uuid, p_doc jsonb) returns void
language plpgsql stable security definer set search_path = ''
as $$
declare a uuid; v int;
begin
  for a, v in
    select distinct (s->>'asset')::uuid, (s->>'version')::int from jsonb_array_elements(p_doc->'sources') s where s->>'kind' = 'library'
  loop
    if p_project is not null and exists (select 1 from public.studio_sources x where x.project_id = p_project and x.asset_id = a and x.version = v) then
      continue;
    end if;
    if coalesce(public.media_asset_level(a), 0) < 1
       or not exists (select 1 from public.media_versions mv where mv.asset_id = a and mv.version = v) then
      raise exception 'SOURCE_DENIED' using errcode = 'P0001';
    end if;
  end loop;
end
$$;

create function public.studio_sources_record(p_project uuid, p_revision int, p_doc jsonb) returns void
language sql security definer set search_path = ''
as $$
  delete from public.studio_sources where project_id = p_project and revision = p_revision;
  insert into public.studio_sources (project_id, revision, asset_id, version)
  select distinct p_project, p_revision, (s->>'asset')::uuid, (s->>'version')::int
  from jsonb_array_elements(p_doc->'sources') s where s->>'kind' = 'library';
$$;

-- ---------------------------------------------------------------------------
-- Projects
-- ---------------------------------------------------------------------------
create function public.studio_project_create(p_title text, p_kind text, p_doc jsonb) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare me text := public.current_email(); pid uuid;
begin
  if not public.studio_can() then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if char_length(btrim(coalesce(p_title, ''))) not between 1 and 120 then raise exception 'TITLE_INVALID' using errcode = 'P0001'; end if;
  if p_kind not in ('video','photo') then raise exception 'DOC_INVALID' using errcode = 'P0001'; end if;
  perform public.studio_doc_check(p_doc, p_kind);
  perform public.studio_sources_ok(null, p_doc);
  insert into public.studio_projects (title, kind, owner, updated_by, revision, lease_holder, lease_until)
  values (btrim(p_title), p_kind, me, me, 1, me, now() + interval '90 seconds')
  returning id into pid;
  insert into public.studio_revisions (project_id, revision, base, schema_version, doc, bytes, saved_by)
  values (pid, 1, 0, (p_doc->>'schema')::int, p_doc, octet_length(p_doc::text), me);
  perform public.studio_sources_record(pid, 1, p_doc);
  return pid;
end
$$;

create function public.studio_project_rename(p_project uuid, p_title text) returns void
language plpgsql security definer set search_path = ''
as $$
declare me text := public.current_email();
begin
  if not public.studio_can() then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if char_length(btrim(coalesce(p_title, ''))) not between 1 and 120 then raise exception 'TITLE_INVALID' using errcode = 'P0001'; end if;
  update public.studio_projects set title = btrim(p_title), updated_at = now(), updated_by = me where id = p_project;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
end
$$;

-- Archive or bring back. Never a deletion. Refused while another person is editing.
create function public.studio_project_archive(p_project uuid, p_archive boolean) returns void
language plpgsql security definer set search_path = ''
as $$
declare me text := public.current_email(); p public.studio_projects;
begin
  if not public.studio_can() then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  select * into p from public.studio_projects where id = p_project for update;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  if p_archive and p.lease_holder is not null and p.lease_holder <> me and p.lease_until >= now() then
    raise exception 'IN_USE' using errcode = 'P0001';
  end if;
  update public.studio_projects
     set archived_at = case when p_archive then now() end, archived_by = case when p_archive then me end,
         lease_holder = case when p_archive then null else lease_holder end,
         lease_until = case when p_archive then null else lease_until end,
         updated_at = now(), updated_by = me
   where id = p_project;
end
$$;

-- The editing lease: taken when free, expired or already the caller's, or when p_take (a long press
-- in the interface); otherwise the holder is returned and nothing changes.
create function public.studio_lease(p_project uuid, p_take boolean default false) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare me text := public.current_email(); p public.studio_projects; was_other boolean;
begin
  if not public.studio_can() then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  select * into p from public.studio_projects where id = p_project for update;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  if p.archived_at is not null then raise exception 'ARCHIVED' using errcode = 'P0001'; end if;
  was_other := p.lease_holder is not null and p.lease_holder <> me and p.lease_until >= now();
  if not was_other or coalesce(p_take, false) then
    update public.studio_projects set lease_holder = me, lease_until = now() + interval '90 seconds' where id = p_project;
    return jsonb_build_object('mine', true, 'holder', me, 'until', now() + interval '90 seconds', 'taken_from', case when was_other then p.lease_holder end);
  end if;
  return jsonb_build_object('mine', false, 'holder', p.lease_holder,
    'holder_name', (select a.display_name from public.accounts a where a.email = p.lease_holder), 'until', p.lease_until);
end
$$;

create function public.studio_release(p_project uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.studio_can() then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  update public.studio_projects set lease_holder = null, lease_until = null
   where id = p_project and lease_holder = public.current_email();
end
$$;

-- A save: the autosave slot (p_explicit false) or a new numbered revision. The caller holds the
-- lease and saves on top of the latest numbered revision it knows (p_base).
create function public.studio_save(p_project uuid, p_base int, p_doc jsonb, p_explicit boolean, p_note text default null) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare me text := public.current_email(); p public.studio_projects; n int;
begin
  if not public.studio_can() then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  select * into p from public.studio_projects where id = p_project for update;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  if p.archived_at is not null then raise exception 'ARCHIVED' using errcode = 'P0001'; end if;
  if p.lease_holder is distinct from me or p.lease_until < now() then raise exception 'NO_LEASE' using errcode = 'P0001'; end if;
  if p.revision <> p_base then raise exception 'STALE_REVISION' using errcode = 'P0001'; end if;
  perform public.studio_doc_check(p_doc, p.kind);
  perform public.studio_sources_ok(p_project, p_doc);
  if coalesce(p_explicit, false) then
    n := p.revision + 1;
    insert into public.studio_revisions (project_id, revision, base, schema_version, doc, bytes, saved_by, note)
    values (p_project, n, p.revision, (p_doc->>'schema')::int, p_doc, octet_length(p_doc::text), me, nullif(btrim(coalesce(p_note, '')), ''));
    perform public.studio_sources_record(p_project, n, p_doc);
    delete from public.studio_sources where project_id = p_project and revision = 0;
    delete from public.studio_revisions where project_id = p_project and revision = 0;
    update public.studio_projects
       set revision = n, autosaved_at = null, updated_at = now(), updated_by = me, lease_until = now() + interval '90 seconds'
     where id = p_project;
    return jsonb_build_object('revision', n, 'explicit', true, 'saved_at', now());
  end if;
  insert into public.studio_revisions (project_id, revision, base, schema_version, doc, bytes, saved_by)
  values (p_project, 0, p.revision, (p_doc->>'schema')::int, p_doc, octet_length(p_doc::text), me)
  on conflict (project_id, revision) do update
     set base = excluded.base, schema_version = excluded.schema_version, doc = excluded.doc, bytes = excluded.bytes,
         saved_by = excluded.saved_by, saved_at = now(), note = null;
  perform public.studio_sources_record(p_project, 0, p_doc);
  update public.studio_projects set autosaved_at = now(), updated_at = now(), updated_by = me, lease_until = now() + interval '90 seconds'
   where id = p_project;
  return jsonb_build_object('revision', p.revision, 'explicit', false, 'saved_at', now());
end
$$;

-- A project's document: a numbered revision, or by default the latest state (the autosave slot when
-- there is one, which is always newer than the latest numbered revision).
create function public.studio_project_doc(p_project uuid, p_revision int default null) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare r public.studio_revisions; p public.studio_projects;
begin
  if not public.studio_can() then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  select * into p from public.studio_projects where id = p_project;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  if p_revision is null then
    select * into r from public.studio_revisions where project_id = p_project and revision = 0;
    if not found then select * into r from public.studio_revisions where project_id = p_project and revision = p.revision; end if;
  else
    if p_revision < 1 then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
    select * into r from public.studio_revisions where project_id = p_project and revision = p_revision;
    if not found then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  end if;
  return jsonb_build_object('project', p_project, 'kind', p.kind, 'title', p.title, 'revision', p.revision,
    'autosave', r.revision = 0, 'base', r.base, 'doc', r.doc, 'saved_at', r.saved_at, 'saved_by', r.saved_by,
    'saved_by_name', (select a.display_name from public.accounts a where a.email = r.saved_by));
end
$$;

-- The studio home: projects with the names of their owner, last editor and current editor.
create function public.studio_list(p_archived boolean default false) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.studio_can() then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', p.id, 'title', p.title, 'kind', p.kind, 'owner', p.owner,
      'owner_name', (select a.display_name from public.accounts a where a.email = p.owner),
      'created_at', p.created_at, 'updated_at', p.updated_at, 'updated_by', p.updated_by,
      'updated_by_name', (select a.display_name from public.accounts a where a.email = p.updated_by),
      'revision', p.revision, 'autosaved_at', p.autosaved_at, 'work_ref', p.work_ref, 'archived_at', p.archived_at,
      'editing', case when p.lease_until >= now() then p.lease_holder end,
      'editing_name', case when p.lease_until >= now() then (select a.display_name from public.accounts a where a.email = p.lease_holder) end,
      'exports', (select count(*) from public.studio_exports e where e.project_id = p.id),
      'thumb', (select e.asset_id from public.studio_exports e where e.project_id = p.id order by e.created_at desc limit 1)
    ) order by p.updated_at desc)
    from public.studio_projects p
    where (p.archived_at is not null) = coalesce(p_archived, false)), '[]'::jsonb);
end
$$;

-- An export the caller has just saved to the library, bound to the numbered revision it came from.
create function public.studio_export_record(p_project uuid, p_revision int, p_asset uuid, p_version int, p_kind text) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare me text := public.current_email(); eid uuid;
begin
  if not public.studio_can() then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if p_kind not in ('video','image') then raise exception 'DOC_INVALID' using errcode = 'P0001'; end if;
  if coalesce(p_revision, 0) < 1 or not exists (select 1 from public.studio_revisions where project_id = p_project and revision = p_revision) then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.media_versions mv where mv.asset_id = p_asset and mv.version = p_version and mv.uploaded_by = me) then
    raise exception 'EXPORT_NOT_YOURS' using errcode = 'P0001';
  end if;
  insert into public.studio_exports (project_id, revision, asset_id, version, kind, created_by)
  values (p_project, p_revision, p_asset, p_version, p_kind, me)
  on conflict (asset_id, version) do nothing
  returning id into eid;
  if eid is null then select id into eid from public.studio_exports where asset_id = p_asset and version = p_version; end if;
  return eid;
end
$$;

-- The work a project belongs to (null to clear). The work must be one the caller can see.
create function public.studio_project_link_work(p_project uuid, p_work text) returns void
language plpgsql security definer set search_path = ''
as $$
declare me text := public.current_email();
begin
  if not public.studio_can() then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if p_work is not null and not public.work_can_see(p_work) then raise exception 'WORK_DENIED' using errcode = 'P0001'; end if;
  update public.studio_projects set work_ref = p_work, updated_at = now(), updated_by = me where id = p_project;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Backups: the studio's records join the database export. A project document is not private to a
-- person; the lease columns are momentary and never leave. Revisions are read 25 rows at a time.
-- ---------------------------------------------------------------------------
create or replace function public.backup_table_list(p_kind text) returns jsonb
language sql immutable set search_path = ''
as $$
  select case p_kind
    when 'database' then jsonb_build_array(
      jsonb_build_object('table','works'), jsonb_build_object('table','work_texts'), jsonb_build_object('table','work_variants'),
      jsonb_build_object('table','work_stages'), jsonb_build_object('table','work_approvals'), jsonb_build_object('table','work_cycles'),
      jsonb_build_object('table','work_decisions'), jsonb_build_object('table','work_comments'), jsonb_build_object('table','work_flags'),
      jsonb_build_object('table','work_log'), jsonb_build_object('table','work_assets'), jsonb_build_object('table','work_projects'),
      jsonb_build_object('table','work_requests'), jsonb_build_object('table','projects'), jsonb_build_object('table','events'),
      jsonb_build_object('table','media_files'), jsonb_build_object('table','media_versions'), jsonb_build_object('table','media_folders'),
      jsonb_build_object('table','media_grants'), jsonb_build_object('table','media_notes'), jsonb_build_object('table','media_tasks'),
      jsonb_build_object('table','activity_log'), jsonb_build_object('table','file_locations'),
      jsonb_build_object('table','platform_accounts'), jsonb_build_object('table','integration_events'),
      jsonb_build_object('table','studio_projects', 'drop', jsonb_build_array('lease_holder','lease_until')),
      jsonb_build_object('table','studio_revisions', 'page', 25),
      jsonb_build_object('table','studio_sources'), jsonb_build_object('table','studio_exports'))
    when 'config' then jsonb_build_array(
      jsonb_build_object('table','capabilities'), jsonb_build_object('table','role_capabilities'),
      jsonb_build_object('table','member_capabilities'), jsonb_build_object('table','permission_presets'),
      jsonb_build_object('table','platforms'), jsonb_build_object('table','plan_templates'),
      jsonb_build_object('table','site_settings'), jsonb_build_object('table','storage_roles'),
      jsonb_build_object('table','accounts'), jsonb_build_object('table','mail_rules'), jsonb_build_object('table','backup_jobs'),
      jsonb_build_object('table','integrations', 'drop', jsonb_build_array('secret_id','pending_secret_id')))
    else '[]'::jsonb end
$$;

create or replace function public.backup_export_plan(p_kind text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare e jsonb; n bigint; out jsonb := '[]'::jsonb;
begin
  if not public.has_capability('backups.run', null) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if p_kind not in ('database','config') then raise exception 'BACKUP_BAD_KIND' using errcode = 'P0001'; end if;
  for e in select x from jsonb_array_elements(public.backup_table_list(p_kind)) x loop
    execute format('select count(*) from public.%I', e->>'table') into n;
    -- 'page' only where the list sets one (the export reads that many rows at a time).
    out := out || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('table', e->>'table', 'rows', n, 'page', e->'page')));
  end loop;
  return out;
end
$$;

-- ---------------------------------------------------------------------------
-- Who may call what
-- ---------------------------------------------------------------------------
revoke all on function public.studio_doc_check(jsonb, text) from public, anon;
revoke all on function public.studio_sources_ok(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.studio_sources_record(uuid, int, jsonb) from public, anon, authenticated;
revoke all on function public.studio_project_create(text, text, jsonb) from public, anon;
revoke all on function public.studio_project_rename(uuid, text) from public, anon;
revoke all on function public.studio_project_archive(uuid, boolean) from public, anon;
revoke all on function public.studio_lease(uuid, boolean) from public, anon;
revoke all on function public.studio_release(uuid) from public, anon;
revoke all on function public.studio_save(uuid, int, jsonb, boolean, text) from public, anon;
revoke all on function public.studio_project_doc(uuid, int) from public, anon;
revoke all on function public.studio_list(boolean) from public, anon;
revoke all on function public.studio_export_record(uuid, int, uuid, int, text) from public, anon;
revoke all on function public.studio_project_link_work(uuid, text) from public, anon;

grant execute on function public.studio_doc_check(jsonb, text) to authenticated;
grant execute on function public.studio_project_create(text, text, jsonb) to authenticated;
grant execute on function public.studio_project_rename(uuid, text) to authenticated;
grant execute on function public.studio_project_archive(uuid, boolean) to authenticated;
grant execute on function public.studio_lease(uuid, boolean) to authenticated;
grant execute on function public.studio_release(uuid) to authenticated;
grant execute on function public.studio_save(uuid, int, jsonb, boolean, text) to authenticated;
grant execute on function public.studio_project_doc(uuid, int) to authenticated;
grant execute on function public.studio_list(boolean) to authenticated;
grant execute on function public.studio_export_record(uuid, int, uuid, int, text) to authenticated;
grant execute on function public.studio_project_link_work(uuid, text) to authenticated;

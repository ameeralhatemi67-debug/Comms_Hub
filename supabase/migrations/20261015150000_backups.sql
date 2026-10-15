-- Settings Step S4 (Settings_Integrations_Plan.md 7, 11): backups, on top of the move engine.
--
--   * Files: a backup run is a set of move plans in mode `backup` (the engine's copy mode): each
--     stored file that has no verified copy at the backup provider is copied there, verified by
--     checksum, and recorded as a location with role `backup`. Incremental by construction: a file
--     already backed up is not planned again. The primary never changes.
--   * Database and configuration: an export of an allow-list of tables, built by the server from
--     functions that need «تشغيل النسخ الاحتياطي»; the file is kept at the backup provider (when one
--     is set) and handed to the person. Internal mail, messaging, private reminders, notifications,
--     phone numbers, upload sessions and every secret are not on the list: they stay private even
--     from administrators, and the provider's own backups cover them.
--   * Policy is data (backup_jobs): manual now, a warning age, a retention count. Nothing is
--     scheduled: the page shows the age of the last good backup and says when it is stale.
--   * A backup counts as verified only after a sample restore check: the server re-reads copies
--     from the backup provider and compares their checksum (files), or re-reads the export and
--     compares its sha256. An unverified backup is shown as unverified.
--   * Restore: a file whose primary is missing or failed is promoted to its verified backup copy
--     by a hold-confirmed action (no bytes move; a later move can bring it home). A database restore
--     is not offered from the site.

-- ---------------------------------------------------------------------------
-- 1. Events, and the engine's new mode
-- ---------------------------------------------------------------------------
alter table public.integration_events drop constraint integration_events_kind_check;
alter table public.integration_events add constraint integration_events_kind_check
  check (kind in ('created','connected','health','secret_set','secret_committed','secret_discarded','secret_used',
                  'enabled','disabled','deleted','settings','storage_verified',
                  'storage_move_planned','storage_move_started','storage_move_paused','storage_move_completed',
                  'storage_move_cancelled','storage_retired',
                  'backup_run','backup_verified','backup_restored','backup_policy','backup_target'));

alter table public.storage_moves drop constraint storage_moves_mode_check;
alter table public.storage_moves add constraint storage_moves_mode_check check (mode in ('move','copy','backup'));

-- ---------------------------------------------------------------------------
-- 2. Policy and runs
-- ---------------------------------------------------------------------------
create table public.backup_jobs (
  kind text primary key check (kind in ('files','database','config')),
  frequency text not null default 'manual' check (frequency in ('manual','daily','weekly')),
  retention_count int not null default 7 check (retention_count between 1 and 60),
  warn_days int not null default 7 check (warn_days between 1 and 365),
  enabled boolean not null default true,
  updated_by text,
  updated_at timestamptz not null default now()
);
insert into public.backup_jobs (kind, updated_by) values ('files', 'installation'), ('database', 'installation'), ('config', 'installation');
alter table public.backup_jobs enable row level security;

create table public.backup_runs (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('files','database','config')),
  state text not null default 'running' check (state in ('running','completed','partial','failed')),
  created_by text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  -- Rows (an export) or files (a copy run); the files that failed; bytes.
  items int not null default 0,
  failed int not null default 0,
  size_bytes bigint not null default 0,
  -- An export: where the file is kept, its reference there, and the sha256 of its bytes.
  integration_id uuid references public.integrations(id),
  ref text check (ref is null or char_length(ref) <= 300),
  checksum text check (checksum is null or char_length(checksum) <= 64),
  tables jsonb,
  -- A copy run: the move plans it made.
  move_ids uuid[] not null default '{}',
  verified_at timestamptz,
  verify_ok boolean,
  verify_note text check (verify_note is null or char_length(verify_note) <= 200),
  pruned_at timestamptz,
  note text check (note is null or char_length(note) <= 200)
);
create index backup_runs_kind_idx on public.backup_runs (kind, started_at desc);
create index backup_runs_integration_idx on public.backup_runs (integration_id);
alter table public.backup_runs enable row level security;
-- No policies on either table: read through backup_overview().

-- ---------------------------------------------------------------------------
-- 3. What an export holds
-- ---------------------------------------------------------------------------
-- [{table, drop: [columns that never leave]}] for a kind. The list is the privacy rule: nothing
-- private to a person, no phone number, no upload session, no secret.
create function public.backup_table_list(p_kind text) returns jsonb
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
      jsonb_build_object('table','platform_accounts'), jsonb_build_object('table','integration_events'))
    when 'config' then jsonb_build_array(
      jsonb_build_object('table','capabilities'), jsonb_build_object('table','role_capabilities'),
      jsonb_build_object('table','member_capabilities'), jsonb_build_object('table','permission_presets'),
      jsonb_build_object('table','platforms'), jsonb_build_object('table','plan_templates'),
      jsonb_build_object('table','site_settings'), jsonb_build_object('table','storage_roles'),
      jsonb_build_object('table','accounts'), jsonb_build_object('table','mail_rules'), jsonb_build_object('table','backup_jobs'),
      jsonb_build_object('table','integrations', 'drop', jsonb_build_array('secret_id','pending_secret_id')))
    else '[]'::jsonb end
$$;

-- ---------------------------------------------------------------------------
-- 4. The engine learns the backup mode
-- ---------------------------------------------------------------------------
create or replace function public.storage_move_plan(p_source uuid, p_dest uuid, p_scope jsonb, p_mode text, p_label text, p_hold_days int)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  me text := public.current_email(); s public.integrations; d public.integrations; mid uuid;
  sk text := p_scope->>'kind'; fid uuid; aids uuid[]; subject text; maxb bigint; hold int := coalesce(p_hold_days, 14);
  n int; total bigint; open_for_provider int;
begin
  if not public.has_capability('storage.migrate', null) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  select * into s from public.integrations where id = p_source and kind = 'storage' and deleted_at is null;
  if not found then raise exception 'INT_NOT_FOUND' using errcode = 'P0001'; end if;
  select * into d from public.integrations where id = p_dest and kind = 'storage' and deleted_at is null;
  if not found then raise exception 'INT_NOT_FOUND' using errcode = 'P0001'; end if;
  if s.id = d.id then raise exception 'MOVE_SAME_PROVIDER' using errcode = 'P0001'; end if;
  if s.state <> 'connected' or d.state <> 'connected' then raise exception 'MOVE_PROVIDER_NOT_READY' using errcode = 'P0001'; end if;
  if sk is null or sk not in ('library','mail') then raise exception 'MOVE_BAD_SCOPE' using errcode = 'P0001'; end if;
  if p_mode is null or p_mode not in ('move','copy','backup') then raise exception 'MOVE_BAD_MODE' using errcode = 'P0001'; end if;
  if p_mode = 'backup' then hold := 0; end if;
  if hold not between 0 and 365 then raise exception 'MOVE_BAD_HOLD' using errcode = 'P0001'; end if;
  if p_scope ? 'folder_id' and p_scope->>'folder_id' is not null then
    if sk <> 'library' then raise exception 'MOVE_BAD_SCOPE' using errcode = 'P0001'; end if;
    fid := (p_scope->>'folder_id')::uuid;
    if not exists (select 1 from public.media_folders where id = fid) then raise exception 'MOVE_BAD_SCOPE' using errcode = 'P0001'; end if;
  end if;
  if p_scope ? 'asset_ids' and jsonb_typeof(p_scope->'asset_ids') = 'array' then
    if sk <> 'library' then raise exception 'MOVE_BAD_SCOPE' using errcode = 'P0001'; end if;
    aids := array(select jsonb_array_elements_text(p_scope->'asset_ids')::uuid);
    if cardinality(aids) not between 1 and 500 then raise exception 'MOVE_BAD_SCOPE' using errcode = 'P0001'; end if;
  end if;
  select count(*) into open_for_provider from public.storage_moves m where m.state = 'planned' and m.created_by = me;
  if open_for_provider >= 10 then raise exception 'MOVE_TOO_MANY_PLANS' using errcode = 'P0001'; end if;

  subject := case sk when 'library' then 'media_version' else 'mail_file' end;
  maxb := case d.type when 's3_compatible' then 80000000000 else 5000000000000 end;

  insert into public.storage_moves (label, source_id, dest_id, mode, scope, hold_days, created_by)
  values (nullif(left(btrim(coalesce(p_label, '')), 80), ''), p_source, p_dest, p_mode,
          jsonb_strip_nulls(jsonb_build_object('kind', sk, 'folder_id', fid, 'asset_ids', to_jsonb(aids))), hold, me)
  returning id into mid;

  insert into public.storage_move_items (move_id, subject_kind, subject_id, source_location_id, size_bytes, approved, state, reason)
  with recursive tree(id) as (
    select fid where fid is not null
    union all select c.id from public.media_folders c join tree t on c.parent_id = t.id
  )
  select mid, l.subject_kind, l.subject_id, l.id, l.size_bytes,
         (l.subject_kind = 'media_version' and exists (
            select 1 from public.media_versions v join public.media_files f on f.id = v.asset_id
            where v.id = l.subject_id and f.approved_version = v.version)),
         case when l.state not in ('ok','pending') or coalesce(l.size_bytes, 0) > maxb then 'skipped' else 'pending' end,
         case when l.state not in ('ok','pending') then 'source_unhealthy' when coalesce(l.size_bytes, 0) > maxb then 'too_large' end
  from public.file_locations l
  where l.integration_id = p_source and l.role = 'primary' and l.state <> 'retired' and l.subject_kind = subject
    and (sk <> 'library' or (
          (fid is null or exists (select 1 from public.media_versions v join public.media_files f on f.id = v.asset_id
                                  where v.id = l.subject_id and f.folder_id in (select id from tree)))
      and (aids is null or exists (select 1 from public.media_versions v where v.id = l.subject_id and v.asset_id = any (aids)))))
    -- A backup is incremental: a file that already has a copy at the backup provider is not planned.
    and (p_mode <> 'backup' or not exists (
          select 1 from public.file_locations b
          where b.integration_id = p_dest and b.subject_kind = l.subject_kind and b.subject_id = l.subject_id
            and b.state in ('ok','pending')))
    and not exists (
      select 1 from public.storage_move_items i2 join public.storage_moves m2 on m2.id = i2.move_id
      where i2.subject_kind = l.subject_kind and i2.subject_id = l.subject_id and i2.move_id <> mid
        and m2.state in ('planned','running','paused') and i2.state in ('pending','copying','copied','verified'));

  select count(*) filter (where state = 'pending'), coalesce(sum(size_bytes) filter (where state = 'pending'), 0)
    into n, total from public.storage_move_items where move_id = mid;
  update public.storage_moves set files = n, bytes = total where id = mid;
  perform public.storage_move_event(mid, 'storage_move_planned',
    jsonb_build_object('files', n, 'bytes', total, 'mode', p_mode, 'source', s.label, 'scope', sk));
  return mid;
end
$$;

create or replace function public.storage_move_copied(p_key text, p_item uuid, p_ref text, p_size bigint, p_checksum text, p_remote text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare i public.storage_move_items; m public.storage_moves; sl public.file_locations; did uuid; r text;
begin
  if not public.mail_key_ok(p_key) or not public.has_capability('storage.migrate', null) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  select * into i from public.storage_move_items where id = p_item for update;
  if not found or i.state not in ('pending','copying') then raise exception 'MOVE_BAD_STATE' using errcode = 'P0001'; end if;
  select * into m from public.storage_moves where id = i.move_id;
  if m.state <> 'running' then raise exception 'MOVE_BAD_STATE' using errcode = 'P0001'; end if;
  if p_ref is null or char_length(p_ref) not between 1 and 300 or p_checksum !~ '^[0-9a-f]{32}$' then
    raise exception 'MOVE_BAD_RECORD' using errcode = 'P0001';
  end if;
  r := case when m.mode = 'backup' then 'backup' else 'replica' end;
  select * into sl from public.file_locations where id = i.source_location_id;
  if sl.checksum is not null and sl.checksum <> p_checksum then raise exception 'CHECKSUM_CONFLICT' using errcode = 'P0001'; end if;
  update public.file_locations set checksum = p_checksum where id = sl.id and checksum is null;

  insert into public.file_locations (integration_id, subject_kind, subject_id, ref, role, state, size_bytes, checksum, remote_checksum)
  values (m.dest_id, i.subject_kind, i.subject_id, p_ref, r, 'pending', p_size, p_checksum, left(p_remote, 140))
  on conflict (integration_id, ref) do update
    set subject_kind = excluded.subject_kind, subject_id = excluded.subject_id, role = excluded.role, state = 'pending',
        size_bytes = excluded.size_bytes, checksum = excluded.checksum, remote_checksum = excluded.remote_checksum, verified_at = null
    where public.file_locations.subject_kind = excluded.subject_kind and public.file_locations.subject_id = excluded.subject_id
  returning id into did;
  if did is null then raise exception 'MOVE_BAD_RECORD' using errcode = 'P0001'; end if;
  update public.storage_move_items set state = 'copied', dest_location_id = did, progress = null, checksum = p_checksum,
      bytes_done = coalesce(p_size, 0), claimed_until = null, updated_at = now()
    where id = p_item;
end
$$;

-- ---------------------------------------------------------------------------
-- 5. Policy and target
-- ---------------------------------------------------------------------------
create function public.backup_policy_set(p_kind text, p_frequency text, p_retention int, p_warn_days int, p_enabled boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.has_capability('backups.run', null) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if p_kind not in ('files','database','config') then raise exception 'BACKUP_BAD_KIND' using errcode = 'P0001'; end if;
  -- Nothing runs on a timer in the site: only a person starting a backup is supported until the agent computer exists.
  if coalesce(p_frequency, 'manual') <> 'manual' then raise exception 'BACKUP_NO_SCHEDULER' using errcode = 'P0001'; end if;
  if p_retention is null or p_retention not between 1 and 60 then raise exception 'BACKUP_BAD_POLICY' using errcode = 'P0001'; end if;
  if p_warn_days is null or p_warn_days not between 1 and 365 then raise exception 'BACKUP_BAD_POLICY' using errcode = 'P0001'; end if;
  update public.backup_jobs set frequency = 'manual', retention_count = p_retention, warn_days = p_warn_days,
      enabled = coalesce(p_enabled, enabled), updated_by = public.current_email(), updated_at = now()
    where kind = p_kind;
  insert into public.integration_events (integration_id, actor, kind, data)
  values (null, public.current_email(), 'backup_policy', jsonb_build_object('job', p_kind, 'retention', p_retention, 'warn_days', p_warn_days));
end
$$;

-- The provider that holds backups. It must be a connected storage provider other than the one that
-- serves the library: a backup in the same place as the original is not a backup.
create function public.backup_target_set(p_integration uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare i public.integrations;
begin
  if not public.has_capability('storage.manage', null) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if p_integration is not null then
    select * into i from public.integrations where id = p_integration and kind = 'storage' and deleted_at is null;
    if not found then raise exception 'INT_NOT_FOUND' using errcode = 'P0001'; end if;
    if i.state <> 'connected' then raise exception 'BACKUP_TARGET_NOT_READY' using errcode = 'P0001'; end if;
    if p_integration = public.storage_integration_for('library') then raise exception 'BACKUP_SAME_PROVIDER' using errcode = 'P0001'; end if;
  end if;
  update public.storage_roles set integration_id = p_integration, updated_by = public.current_email(), updated_at = now() where role = 'backup';
  insert into public.integration_events (integration_id, actor, kind, data)
  values (p_integration, public.current_email(), 'backup_target', jsonb_build_object('cleared', p_integration is null));
end
$$;

-- ---------------------------------------------------------------------------
-- 6. Overview
-- ---------------------------------------------------------------------------
create function public.backup_overview() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare tgt uuid; res jsonb;
begin
  if not (public.has_capability('backups.run', null) or public.has_capability('backups.restore', null)
          or public.has_capability('settings.view', null)) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  select integration_id into tgt from public.storage_roles where role = 'backup';
  res := jsonb_build_object(
    'jobs', coalesce((
      select jsonb_agg(jsonb_build_object(
          'kind', j.kind, 'frequency', j.frequency, 'retention_count', j.retention_count, 'warn_days', j.warn_days, 'enabled', j.enabled,
          'last_good', (select jsonb_build_object('id', r.id, 'at', r.finished_at, 'items', r.items, 'size_bytes', r.size_bytes,
                                                   'verified_at', r.verified_at, 'verify_ok', r.verify_ok, 'verify_note', r.verify_note,
                                                   'kept', r.ref is not null or j.kind = 'files')
                        from public.backup_runs r where r.kind = j.kind and r.state = 'completed' and r.pruned_at is null
                        order by r.finished_at desc limit 1),
          'last_run', (select jsonb_build_object('id', r.id, 'state', r.state, 'at', r.started_at, 'failed', r.failed)
                       from public.backup_runs r where r.kind = j.kind order by r.started_at desc limit 1),
          'stale', not exists (select 1 from public.backup_runs r where r.kind = j.kind and r.state = 'completed'
                               and r.finished_at > now() - make_interval(days => j.warn_days))) order by j.kind)
      from public.backup_jobs j), '[]'::jsonb),
    'target', (select jsonb_build_object('id', i.id, 'label', i.label, 'type', i.type, 'state', i.state)
               from public.integrations i where i.id = tgt and i.deleted_at is null),
    'candidates', coalesce((
      select jsonb_agg(jsonb_build_object('id', i.id, 'label', i.label, 'type', i.type, 'state', i.state) order by i.created_at)
      from public.integrations i
      where i.kind = 'storage' and i.deleted_at is null and i.state = 'connected' and i.id <> public.storage_integration_for('library')), '[]'::jsonb),
    'files', jsonb_build_object(
      'total', (select count(*) from public.media_versions) + (select count(*) from public.mail_files),
      'backed_up', (select count(distinct (l.subject_kind, l.subject_id)) from public.file_locations l
                    where l.role = 'backup' and l.state = 'ok' and l.verified_at is not null),
      'pending_copies', (select count(*) from public.file_locations l where l.role = 'backup' and l.state = 'pending'),
      'failed_copies', (select count(*) from public.file_locations l where l.role = 'backup' and l.state in ('failed','missing'))),
    'restorable', (select count(*) from public.file_locations p
                   where p.role = 'primary' and p.state in ('missing','failed')
                     and exists (select 1 from public.file_locations b where b.subject_kind = p.subject_kind and b.subject_id = p.subject_id
                                 and b.role = 'backup' and b.state = 'ok' and b.verified_at is not null)),
    'runs', coalesce((
      select jsonb_agg(jsonb_build_object('id', r.id, 'kind', r.kind, 'state', r.state, 'at', r.started_at, 'finished_at', r.finished_at,
                                          'items', r.items, 'failed', r.failed, 'size_bytes', r.size_bytes,
                                          'verified_at', r.verified_at, 'verify_ok', r.verify_ok, 'pruned', r.pruned_at is not null,
                                          'by', public.work_name(r.created_by)) order by r.started_at desc)
      from (select * from public.backup_runs order by started_at desc limit 12) r), '[]'::jsonb),
    'tables', jsonb_build_object(
      'database', (select jsonb_agg(e->>'table') from jsonb_array_elements(public.backup_table_list('database')) e),
      'config', (select jsonb_agg(e->>'table') from jsonb_array_elements(public.backup_table_list('config')) e)),
    'can_run', public.has_capability('backups.run', null),
    'can_restore', public.has_capability('backups.restore', null),
    'can_migrate', public.has_capability('storage.migrate', null),
    'can_manage', public.has_capability('storage.manage', null));
  return res;
end
$$;

-- Files whose primary copy is missing or failed and that have a verified backup: what a restore can do now.
-- Library files carry their name (an administrator sees the library); attachments are counted, not named.
create function public.backup_restorable() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.has_capability('backups.restore', null) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('kind', x.subject_kind, 'subject', x.subject_id, 'name', x.name, 'version', x.version,
                                        'size_bytes', x.size_bytes, 'state', x.state) order by x.name nulls last)
    from (
      select p.subject_kind, p.subject_id, p.size_bytes, p.state,
             case when p.subject_kind = 'media_version' then f.name end as name,
             case when p.subject_kind = 'media_version' then v.version end as version
      from public.file_locations p
      left join public.media_versions v on p.subject_kind = 'media_version' and v.id = p.subject_id
      left join public.media_files f on f.id = v.asset_id
      where p.role = 'primary' and p.state in ('missing','failed')
        and exists (select 1 from public.file_locations b where b.subject_kind = p.subject_kind and b.subject_id = p.subject_id
                    and b.role = 'backup' and b.state = 'ok' and b.verified_at is not null)
      limit 50) x), '[]'::jsonb);
end
$$;

-- ---------------------------------------------------------------------------
-- 7. Runs
-- ---------------------------------------------------------------------------
-- Starts a run. Files: makes one backup plan per provider that holds primaries without a backup
-- (library and attachments), each checked at the destination by the server before it starts.
-- Database and configuration: just the run; the server pages the export.
create function public.backup_run_begin(p_kind text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  me text := public.current_email(); rid uuid; tgt uuid; t public.integrations; src record; mid uuid; moves uuid[] := '{}';
  kinds text[] := array['library','mail']; k text; subject text; n int;
begin
  if not public.has_capability('backups.run', null) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if p_kind not in ('files','database','config') then raise exception 'BACKUP_BAD_KIND' using errcode = 'P0001'; end if;
  if not (select enabled from public.backup_jobs where kind = p_kind) then raise exception 'BACKUP_DISABLED' using errcode = 'P0001'; end if;
  if exists (select 1 from public.backup_runs r where r.kind = p_kind and r.state = 'running' and r.started_at > now() - interval '2 hours') then
    raise exception 'BACKUP_RUNNING' using errcode = 'P0001';
  end if;
  insert into public.backup_runs (kind, created_by) values (p_kind, me) returning id into rid;

  if p_kind = 'files' then
    if not public.has_capability('storage.migrate', null) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
    select integration_id into tgt from public.storage_roles where role = 'backup';
    if tgt is null then raise exception 'BACKUP_NO_TARGET' using errcode = 'P0001'; end if;
    select * into t from public.integrations where id = tgt and deleted_at is null;
    if not found or t.state <> 'connected' then raise exception 'BACKUP_TARGET_NOT_READY' using errcode = 'P0001'; end if;
    foreach k in array kinds loop
      subject := case k when 'library' then 'media_version' else 'mail_file' end;
      for src in
        select distinct l.integration_id from public.file_locations l
        where l.role = 'primary' and l.state in ('ok','pending') and l.subject_kind = subject and l.integration_id <> tgt
          and not exists (select 1 from public.file_locations b
                          where b.integration_id = tgt and b.subject_kind = l.subject_kind and b.subject_id = l.subject_id
                            and b.state in ('ok','pending'))
      loop
        mid := public.storage_move_plan(src.integration_id, tgt, jsonb_build_object('kind', k), 'backup', 'نسخ احتياطي', 0);
        select files into n from public.storage_moves where id = mid;
        if n > 0 then moves := moves || mid; else update public.storage_moves set state = 'cancelled', finished_at = now() where id = mid; end if;
      end loop;
    end loop;
    update public.backup_runs set move_ids = moves where id = rid;
    if cardinality(moves) = 0 then
      update public.backup_runs set state = 'completed', finished_at = now(), note = 'لا ملفات جديدة تحتاج نسخاً' where id = rid;
      insert into public.integration_events (integration_id, actor, kind, data)
      values (tgt, me, 'backup_run', jsonb_build_object('kind', 'files', 'items', 0, 'run', rid));
    end if;
  end if;
  return jsonb_build_object('run', rid, 'moves', to_jsonb(moves));
end
$$;

-- What an export would read: its tables and their row counts.
create function public.backup_export_plan(p_kind text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare e jsonb; n bigint; out jsonb := '[]'::jsonb;
begin
  if not public.has_capability('backups.run', null) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if p_kind not in ('database','config') then raise exception 'BACKUP_BAD_KIND' using errcode = 'P0001'; end if;
  for e in select x from jsonb_array_elements(public.backup_table_list(p_kind)) x loop
    execute format('select count(*) from public.%I', e->>'table') into n;
    out := out || jsonb_build_array(jsonb_build_object('table', e->>'table', 'rows', n));
  end loop;
  return out;
end
$$;

-- One page of one table of the list, as JSON rows, without the columns that never leave.
create function public.backup_export_page(p_kind text, p_table text, p_offset int, p_limit int) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare e jsonb; res jsonb; dropc text[];
begin
  if not public.has_capability('backups.run', null) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  select x into e from jsonb_array_elements(public.backup_table_list(p_kind)) x where x->>'table' = p_table;
  if e is null then raise exception 'BACKUP_BAD_TABLE' using errcode = 'P0001'; end if;
  dropc := coalesce(array(select jsonb_array_elements_text(e->'drop')), '{}');
  execute format('select coalesce(jsonb_agg(to_jsonb(t) - $1), ''[]''::jsonb) from (select * from public.%I order by ctid offset $2 limit $3) t', p_table)
    into res using dropc, greatest(coalesce(p_offset, 0), 0), least(greatest(coalesce(p_limit, 500), 1), 1000);
  return res;
end
$$;

-- The server's record of a finished export: where it is kept and its checksum. A run that
-- failed is recorded too, with the reason.
create function public.backup_run_finish(p_key text, p_run uuid, p_ok boolean, p_items int, p_size bigint, p_checksum text,
                                         p_integration uuid, p_ref text, p_tables jsonb, p_note text) returns void
language plpgsql security definer set search_path = ''
as $$
declare r public.backup_runs;
begin
  if not public.mail_key_ok(p_key) or not public.has_capability('backups.run', null) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  select * into r from public.backup_runs where id = p_run for update;
  if not found or r.state <> 'running' or r.kind = 'files' then raise exception 'BACKUP_BAD_STATE' using errcode = 'P0001'; end if;
  if coalesce(p_ok, false) and (p_checksum is null or p_checksum !~ '^[0-9a-f]{64}$') then raise exception 'BACKUP_BAD_RECORD' using errcode = 'P0001'; end if;
  update public.backup_runs set state = case when coalesce(p_ok, false) then 'completed' else 'failed' end, finished_at = now(),
      items = coalesce(p_items, 0), size_bytes = coalesce(p_size, 0), checksum = p_checksum,
      integration_id = p_integration, ref = left(p_ref, 300), tables = p_tables, note = left(p_note, 200),
      failed = case when coalesce(p_ok, false) then 0 else 1 end
    where id = p_run;
  insert into public.integration_events (integration_id, actor, kind, data)
  values (p_integration, public.current_email(), 'backup_run',
          jsonb_build_object('kind', r.kind, 'run', p_run, 'ok', coalesce(p_ok, false), 'items', coalesce(p_items, 0), 'bytes', coalesce(p_size, 0)));
end
$$;

-- A copy run is closed when every move plan it made has ended.
create function public.backup_run_close(p_run uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare r public.backup_runs; open_n int; ok_n int; bad_n int; bytes_n bigint; st text;
begin
  if not public.has_capability('backups.run', null) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  select * into r from public.backup_runs where id = p_run for update;
  if not found or r.kind <> 'files' then raise exception 'BACKUP_BAD_STATE' using errcode = 'P0001'; end if;
  if r.state <> 'running' then return jsonb_build_object('state', r.state, 'items', r.items, 'failed', r.failed); end if;
  select count(*) into open_n from public.storage_moves m where m.id = any (r.move_ids) and m.state in ('planned','running','paused');
  if open_n > 0 then raise exception 'BACKUP_NOT_DONE' using errcode = 'P0001'; end if;
  select count(*) filter (where i.state = 'verified'), count(*) filter (where i.state in ('failed','cancelled')),
         coalesce(sum(i.size_bytes) filter (where i.state = 'verified'), 0)
    into ok_n, bad_n, bytes_n
    from public.storage_move_items i where i.move_id = any (r.move_ids);
  st := case when bad_n > 0 then 'partial' else 'completed' end;
  update public.backup_runs set state = st, finished_at = now(), items = ok_n, failed = bad_n, size_bytes = bytes_n where id = p_run;
  insert into public.integration_events (integration_id, actor, kind, data)
  values ((select integration_id from public.storage_roles where role = 'backup'), public.current_email(), 'backup_run',
          jsonb_build_object('kind', 'files', 'run', p_run, 'ok', bad_n = 0, 'items', ok_n, 'failed', bad_n, 'bytes', bytes_n));
  return jsonb_build_object('state', st, 'items', ok_n, 'failed', bad_n);
end
$$;

-- ---------------------------------------------------------------------------
-- 8. Verifying: the sample restore check
-- ---------------------------------------------------------------------------
-- Backup copies to re-read: the longest since a check, small enough to read in one request.
create function public.backup_sample_claim(p_key text, p_limit int) returns jsonb
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.mail_key_ok(p_key) or not public.has_capability('backups.run', null) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', x.id, 'ref', x.ref, 'size', x.size_bytes, 'checksum', x.checksum,
                                        'integration', jsonb_build_object('id', x.iid, 'type', x.type, 'config', x.config)))
    from (
      select l.id, l.ref, l.size_bytes, l.checksum, i.id iid, i.type, i.config
      from public.file_locations l join public.integrations i on i.id = l.integration_id
      where l.role = 'backup' and l.state = 'ok' and l.checksum is not null and coalesce(l.size_bytes, 0) <= 104857600
        and i.deleted_at is null
      order by l.verified_at nulls first, l.created_at
      limit least(greatest(coalesce(p_limit, 3), 1), 10)) x), '[]'::jsonb);
end
$$;

-- results: [{id, ok}]. A copy that did not read back as recorded is marked failed. Records the
-- run's verification when one is named.
create function public.backup_sample_mark(p_key text, p_run uuid, p_results jsonb) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare x jsonb; good int := 0; bad int := 0;
begin
  if not public.mail_key_ok(p_key) or not public.has_capability('backups.run', null) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p_results) <> 'array' or jsonb_array_length(p_results) > 50 then raise exception 'BACKUP_BAD_RECORD' using errcode = 'P0001'; end if;
  for x in select e from jsonb_array_elements(p_results) e loop
    if coalesce((x->>'ok')::boolean, false) then
      update public.file_locations set verified_at = now() where id = (x->>'id')::uuid and role = 'backup' and state = 'ok';
      good := good + 1;
    else
      update public.file_locations set state = 'failed' where id = (x->>'id')::uuid and role = 'backup' and state = 'ok';
      bad := bad + 1;
    end if;
  end loop;
  if p_run is not null then
    update public.backup_runs set verified_at = now(), verify_ok = (bad = 0 and good > 0),
        verify_note = left(format('أُعيدت قراءة %s نسخة: %s سليمة، %s تعذّرت', good + bad, good, bad), 200)
      where id = p_run and kind = 'files';
  end if;
  insert into public.integration_events (integration_id, actor, kind, data)
  values ((select integration_id from public.storage_roles where role = 'backup'), public.current_email(), 'backup_verified',
          jsonb_build_object('kind', 'files', 'checked', good + bad, 'ok', good, 'failed', bad));
  return jsonb_build_object('ok', good, 'failed', bad);
end
$$;

-- An export read back from the backup provider: its sha256 against the one recorded.
create function public.backup_run_verify(p_key text, p_run uuid, p_ok boolean, p_note text) returns void
language plpgsql security definer set search_path = ''
as $$
declare r public.backup_runs;
begin
  if not public.mail_key_ok(p_key) or not public.has_capability('backups.run', null) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  select * into r from public.backup_runs where id = p_run for update;
  if not found or r.state <> 'completed' or r.kind = 'files' then raise exception 'BACKUP_BAD_STATE' using errcode = 'P0001'; end if;
  update public.backup_runs set verified_at = now(), verify_ok = coalesce(p_ok, false), verify_note = left(p_note, 200) where id = p_run;
  insert into public.integration_events (integration_id, actor, kind, data)
  values (r.integration_id, public.current_email(), 'backup_verified', jsonb_build_object('kind', r.kind, 'run', p_run, 'ok', coalesce(p_ok, false)));
end
$$;

-- ---------------------------------------------------------------------------
-- 9. Keeping only the last few exports
-- ---------------------------------------------------------------------------
create function public.backup_prune_claim(p_key text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.mail_key_ok(p_key) or not public.has_capability('backups.run', null) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', x.id, 'ref', x.ref, 'integration',
                     jsonb_build_object('id', i.id, 'type', i.type, 'config', i.config)))
    from (
      select r.id, r.ref, r.integration_id,
             row_number() over (partition by r.kind order by r.finished_at desc) rn, j.retention_count
      from public.backup_runs r join public.backup_jobs j on j.kind = r.kind
      where r.kind in ('database','config') and r.state = 'completed' and r.ref is not null and r.pruned_at is null) x
    join public.integrations i on i.id = x.integration_id
    where x.rn > x.retention_count), '[]'::jsonb);
end
$$;

create function public.backup_prune_mark(p_key text, p_ids uuid[]) returns int
language plpgsql security definer set search_path = ''
as $$
declare n int;
begin
  if not public.mail_key_ok(p_key) or not public.has_capability('backups.run', null) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  update public.backup_runs set pruned_at = now() where id = any (p_ids) and pruned_at is null and kind in ('database','config');
  get diagnostics n = row_count;
  return n;
end
$$;

-- ---------------------------------------------------------------------------
-- 10. Restoring a file from its backup
-- ---------------------------------------------------------------------------
-- The file's primary is gone or failed: its verified backup copy becomes the primary. No bytes
-- move; the library serves it from the backup provider, and a move can bring it home later.
create function public.backup_restore_file(p_kind text, p_subject uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare prim public.file_locations; b public.file_locations;
begin
  if not public.has_capability('backups.restore', null) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if p_kind not in ('media_version','mail_file') then raise exception 'BACKUP_BAD_KIND' using errcode = 'P0001'; end if;
  select * into prim from public.file_locations where subject_kind = p_kind and subject_id = p_subject and role = 'primary' and state <> 'retired' for update;
  if not found or prim.state not in ('missing','failed') then raise exception 'BACKUP_NOT_NEEDED' using errcode = 'P0001'; end if;
  select * into b from public.file_locations
    where subject_kind = p_kind and subject_id = p_subject and role = 'backup' and state = 'ok' and verified_at is not null
    order by verified_at desc limit 1 for update;
  if not found then raise exception 'BACKUP_NONE' using errcode = 'P0001'; end if;
  update public.file_locations set role = 'replica' where id = prim.id;
  update public.file_locations set role = 'primary' where id = b.id;
  insert into public.integration_events (integration_id, actor, kind, data)
  values (b.integration_id, public.current_email(), 'backup_restored', jsonb_build_object('kind', p_kind));
end
$$;

-- ---------------------------------------------------------------------------
-- 11. The general overview carries the age of the last backup
-- ---------------------------------------------------------------------------
create or replace function public.settings_overview() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.has_capability('settings.view', null) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  return jsonb_build_object(
    'library_files', (select count(*) from public.media_versions),
    'library_bytes', (select coalesce(sum(size_bytes), 0) from public.media_versions),
    'mail_files', (select count(*) from public.mail_files),
    'mail_bytes', (select coalesce(sum(size_bytes), 0) from public.mail_files),
    'integrations', (select coalesce(jsonb_object_agg(state, n), '{}'::jsonb) from (select state, count(*) n from public.integrations where deleted_at is null group by state) s),
    'whatsapp', (select jsonb_build_object('enabled', w.enabled, 'heartbeat_at', w.heartbeat_at) from public.system_whatsapp w where w.id = 1),
    'events_day', (select count(*) from public.integration_events where at > now() - interval '1 day'),
    'last_backup', (select max(finished_at) from public.backup_runs where state = 'completed'),
    'backup_stale', (select bool_or(not exists (select 1 from public.backup_runs r where r.kind = j.kind and r.state = 'completed'
                                                and r.finished_at > now() - make_interval(days => j.warn_days)))
                     from public.backup_jobs j where j.enabled));
end
$$;

-- ---------------------------------------------------------------------------
-- 12. Privileges
-- ---------------------------------------------------------------------------
revoke all on function public.backup_table_list(text) from public, anon, authenticated;
revoke all on function public.backup_policy_set(text, text, int, int, boolean), public.backup_target_set(uuid),
  public.backup_overview(), public.backup_restorable(), public.backup_run_begin(text), public.backup_export_plan(text),
  public.backup_export_page(text, text, int, int),
  public.backup_run_finish(text, uuid, boolean, int, bigint, text, uuid, text, jsonb, text), public.backup_run_close(uuid),
  public.backup_sample_claim(text, int), public.backup_sample_mark(text, uuid, jsonb),
  public.backup_run_verify(text, uuid, boolean, text), public.backup_prune_claim(text), public.backup_prune_mark(text, uuid[]),
  public.backup_restore_file(text, uuid), public.settings_overview() from public, anon;
grant execute on function public.backup_policy_set(text, text, int, int, boolean), public.backup_target_set(uuid),
  public.backup_overview(), public.backup_restorable(), public.backup_run_begin(text), public.backup_export_plan(text),
  public.backup_export_page(text, text, int, int),
  public.backup_run_finish(text, uuid, boolean, int, bigint, text, uuid, text, jsonb, text), public.backup_run_close(uuid),
  public.backup_sample_claim(text, int), public.backup_sample_mark(text, uuid, jsonb),
  public.backup_run_verify(text, uuid, boolean, text), public.backup_prune_claim(text), public.backup_prune_mark(text, uuid[]),
  public.backup_restore_file(text, uuid), public.settings_overview() to authenticated;

-- Settings Step S3 (Settings_Integrations_Plan.md 6.1 to 6.3, 11): a second storage provider
-- and the move engine. Applied after Step S2 (20261014140000_storage_locations.sql).
--
-- 1. Providers: an S3-compatible provider (Supabase Storage's S3 endpoint, Backblaze B2,
--    Cloudflare R2, MinIO, AWS) is a row of `integrations` (kind storage, type s3_compatible)
--    with its non-secret settings in `config` and its access key pair, as one secret, in the
--    Vault like every other secret. Added, edited and removed through functions that need
--    «إدارة مزودي التخزين»; the key pair goes in through the existing int_secret_set.
-- 2. The move engine: `storage_moves` (a plan, then a run) and `storage_move_items` (one per
--    stored copy). Plan with a dry-run report, start, pause, resume, cancel, retry, report.
--    The copy is resumable: the destination's partial state is kept on the item. Every record
--    of what a provider said needs the signed-in person's right «نقل الملفات بين مزودي
--    التخزين» AND the site's server key, so neither a browser nor a bare key can change a copy.
-- 3. Verify, switch, hold, retire: a copy becomes a destination replica (pending), is verified
--    (checksum, else size, and never size alone for an approved version), and only then does the
--    destination become primary and the source a replica. The source is kept for the hold
--    period the plan states and retired by a separate call that moves it to the provider's
--    recoverable trash; it is never deleted by the engine.
-- 4. Serving: `storage_serving` tells the server where the live copies of a file are, so the
--    library, mail and messaging routes keep serving through the file's own reference.
--    media_versions.drive_file_id and mail_files.drive_file_id stay as they were.
-- Nothing here is scheduled: the admin's open page drives a run, one batch at a time.

-- ---------------------------------------------------------------------------
-- 1. Events and the checksum a provider reports
-- ---------------------------------------------------------------------------
alter table public.integration_events drop constraint integration_events_kind_check;
alter table public.integration_events add constraint integration_events_kind_check
  check (kind in ('created','connected','health','secret_set','secret_committed','secret_discarded','secret_used',
                  'enabled','disabled','deleted','settings','storage_verified',
                  'storage_move_planned','storage_move_started','storage_move_paused','storage_move_completed',
                  'storage_move_cancelled','storage_retired'));

-- What the provider itself reports for a copy (an ETag or md5Checksum); `checksum` stays the md5
-- of the content. They differ for a multipart object, whose ETag is a composite.
alter table public.file_locations add column remote_checksum text
  check (remote_checksum is null or char_length(remote_checksum) <= 140);

-- ---------------------------------------------------------------------------
-- 2. The move tables
-- ---------------------------------------------------------------------------
create table public.storage_moves (
  id uuid primary key default gen_random_uuid(),
  label text check (label is null or char_length(label) <= 80),
  source_id uuid not null references public.integrations(id),
  dest_id uuid not null references public.integrations(id),
  mode text not null default 'move' check (mode in ('move','copy')),
  -- {kind: library|mail, folder_id?, asset_ids?}
  scope jsonb not null,
  state text not null default 'planned' check (state in ('planned','running','paused','completed','cancelled')),
  hold_days int not null default 14 check (hold_days between 0 and 365),
  hold_until timestamptz,
  files int not null default 0,
  bytes bigint not null default 0,
  -- What the server learned about the destination at plan time. Null free space: the provider
  -- does not say.
  dest_free bigint,
  dest_account text check (dest_account is null or char_length(dest_account) <= 200),
  dest_checked_at timestamptz,
  created_by text not null,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  check (source_id <> dest_id)
);
create index storage_moves_state_idx on public.storage_moves (state, created_at desc);
alter table public.storage_moves enable row level security;
-- No policies: read through storage_moves_overview() and storage_move_report().

create table public.storage_move_items (
  id uuid primary key default gen_random_uuid(),
  move_id uuid not null references public.storage_moves(id) on delete cascade,
  subject_kind text not null check (subject_kind in ('media_version','mail_file')),
  subject_id uuid not null,
  source_location_id uuid references public.file_locations(id) on delete set null,
  dest_location_id uuid references public.file_locations(id) on delete set null,
  size_bytes bigint,
  -- The version is the approved one of its asset: its checksum must match, size alone is not enough.
  approved boolean not null default false,
  state text not null default 'pending'
    check (state in ('pending','copying','copied','verified','switched','failed','skipped','cancelled')),
  -- Why it was skipped, or the code it failed with. Never a name, an address or a secret.
  reason text check (reason is null or char_length(reason) <= 60),
  verify_level text check (verify_level is null or verify_level in ('checksum','size')),
  attempts int not null default 0,
  bytes_done bigint not null default 0,
  checksum text check (checksum is null or char_length(checksum) <= 64),
  -- The destination's partial upload (an upload id, a session address) and the running hash.
  -- Server only: no function returns it to a browser.
  progress jsonb,
  claimed_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index storage_move_items_move_idx on public.storage_move_items (move_id, state);
create index storage_move_items_subject_idx on public.storage_move_items (subject_kind, subject_id);
create index storage_move_items_source_loc_idx on public.storage_move_items (source_location_id);
create index storage_move_items_dest_loc_idx on public.storage_move_items (dest_location_id);
alter table public.storage_move_items enable row level security;
-- No policies.

create index storage_moves_source_idx on public.storage_moves (source_id);
create index storage_moves_dest_idx on public.storage_moves (dest_id);

-- ---------------------------------------------------------------------------
-- 3. Internal helpers
-- ---------------------------------------------------------------------------
create function public.storage_move_event(p_move uuid, p_kind text, p_data jsonb) returns void
language sql security definer set search_path = ''
as $$
  insert into public.integration_events (integration_id, actor, kind, data)
  select m.dest_id, public.current_email(), p_kind, coalesce(p_data, '{}'::jsonb) || jsonb_build_object('move', m.id)
  from public.storage_moves m where m.id = p_move
$$;

-- The run is finished when nothing is left to do. Called by every function that finishes an item.
create function public.storage_move_settle(p_move uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare m public.storage_moves; open_items int; sw int; vf int; fl int; sk int; bytes_done bigint;
begin
  select * into m from public.storage_moves where id = p_move for update;
  if not found or m.state <> 'running' then return; end if;
  select count(*) into open_items from public.storage_move_items i
    where i.move_id = p_move and (i.state in ('pending','copying','copied') or (i.state = 'verified' and m.mode = 'move'));
  if open_items > 0 then return; end if;
  select count(*) filter (where state = 'switched'), count(*) filter (where state = 'verified'),
         count(*) filter (where state = 'failed'), count(*) filter (where state = 'skipped'),
         coalesce(sum(size_bytes) filter (where state in ('switched','verified')), 0)
    into sw, vf, fl, sk, bytes_done from public.storage_move_items where move_id = p_move;
  update public.storage_moves set state = 'completed', finished_at = now(),
      hold_until = case when sw + vf > 0 and m.mode = 'move' then now() + make_interval(days => m.hold_days) else null end
    where id = p_move;
  perform public.storage_move_event(p_move, 'storage_move_completed',
    jsonb_build_object('switched', sw, 'copied', vf, 'failed', fl, 'skipped', sk, 'bytes', bytes_done, 'mode', m.mode));
end
$$;

-- ---------------------------------------------------------------------------
-- 4. Providers (S3-compatible)
-- ---------------------------------------------------------------------------
-- Adds (p_id null) or edits an S3-compatible provider's non-secret settings. The key pair is
-- never accepted here: it goes through int_secret_set and the server's check.
create function public.storage_provider_save(p_id uuid, p_label text, p_config jsonb) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  me text := public.current_email(); i public.integrations; nid uuid;
  ep text := regexp_replace(btrim(coalesce(p_config->>'endpoint', '')), '/+$', '');
  bucket text := btrim(coalesce(p_config->>'bucket', ''));
  region text := btrim(coalesce(p_config->>'region', ''));
  prefix text := btrim(coalesce(p_config->>'prefix', ''), ' /');
  flavor text := coalesce(nullif(btrim(p_config->>'flavor'), ''), 'other');
  path_style boolean := coalesce((p_config->>'path_style')::boolean, true);
  cfg jsonb; lbl text := btrim(coalesce(p_label, ''));
begin
  if not public.has_capability('storage.manage', null) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if char_length(lbl) not between 1 and 60 then raise exception 'PROVIDER_LABEL' using errcode = 'P0001'; end if;
  -- https only, a host (and an optional path as Supabase's endpoint has), no credentials, no query.
  if ep !~ '^https://[A-Za-z0-9]([A-Za-z0-9.-]{0,120})(:[0-9]{2,5})?(/[A-Za-z0-9._~/-]{0,100})?$' then
    raise exception 'PROVIDER_ENDPOINT' using errcode = 'P0001';
  end if;
  -- No address that names this machine or a private network: the server will call this one.
  if ep ~ '^https://[0-9.]+(:|/|$)' or ep ~* 'localhost|\.local(:|/|$)|\.internal(:|/|$)|\.lan(:|/|$)' then
    raise exception 'PROVIDER_ENDPOINT' using errcode = 'P0001';
  end if;
  if bucket !~ '^[a-z0-9][a-z0-9._-]{1,61}[a-z0-9]$' then raise exception 'PROVIDER_BUCKET' using errcode = 'P0001'; end if;
  if region <> '' and region !~ '^[A-Za-z0-9-]{1,40}$' then raise exception 'PROVIDER_REGION' using errcode = 'P0001'; end if;
  if prefix <> '' and prefix !~ '^[A-Za-z0-9._-]+(/[A-Za-z0-9._-]+){0,3}$' then raise exception 'PROVIDER_PREFIX' using errcode = 'P0001'; end if;
  if flavor not in ('supabase','b2','r2','minio','aws','other') then raise exception 'PROVIDER_FLAVOR' using errcode = 'P0001'; end if;
  cfg := jsonb_build_object('endpoint', ep, 'bucket', bucket, 'region', case when region = '' then 'auto' else region end,
                            'prefix', prefix, 'path_style', path_style, 'flavor', flavor);
  if p_id is null then
    if (select count(*) from public.integrations where type = 's3_compatible' and deleted_at is null) >= 6 then
      raise exception 'PROVIDER_LIMIT' using errcode = 'P0001';
    end if;
    insert into public.integrations (kind, type, label, state, config, created_by)
    values ('storage', 's3_compatible', lbl, 'pending', cfg, me) returning id into nid;
    insert into public.integration_events (integration_id, actor, kind, data)
    values (nid, me, 'created', jsonb_build_object('type', 's3_compatible', 'flavor', flavor));
    return nid;
  end if;
  select * into i from public.integrations where id = p_id and kind = 'storage' and type = 's3_compatible' and deleted_at is null for update;
  if not found then raise exception 'INT_NOT_FOUND' using errcode = 'P0001'; end if;
  -- A provider that is the source or destination of an open move keeps its address until the move ends.
  if exists (select 1 from public.storage_moves m where m.state in ('planned','running','paused') and p_id in (m.source_id, m.dest_id))
     and (i.config - 'account') is distinct from cfg then
    raise exception 'PROVIDER_IN_MOVE' using errcode = 'P0001';
  end if;
  update public.integrations set label = lbl, config = (config - 'account') || cfg,
      -- A changed address means the last check no longer applies.
      state = case when state = 'disabled' then state when (i.config - 'account') is distinct from cfg then 'pending' else state end
    where id = p_id;
  insert into public.integration_events (integration_id, actor, kind, data)
  values (p_id, me, 'settings', jsonb_build_object('provider', true));
  return p_id;
end
$$;

-- Removes a provider nothing is stored at. It stays in the log; its secret is destroyed.
create function public.storage_provider_remove(p_id uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare i public.integrations;
begin
  if not public.has_capability('storage.manage', null) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  select * into i from public.integrations where id = p_id and kind = 'storage' and type = 's3_compatible' and deleted_at is null for update;
  if not found then raise exception 'INT_NOT_FOUND' using errcode = 'P0001'; end if;
  if exists (select 1 from public.file_locations l where l.integration_id = p_id and l.state <> 'retired') then
    raise exception 'PROVIDER_HOLDS_FILES' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.storage_moves m where m.state in ('planned','running','paused') and p_id in (m.source_id, m.dest_id))
     or exists (select 1 from public.storage_roles r where r.integration_id = p_id) then
    raise exception 'PROVIDER_IN_USE' using errcode = 'P0001';
  end if;
  if i.secret_id is not null then delete from vault.secrets where id = i.secret_id; end if;
  if i.pending_secret_id is not null then delete from vault.secrets where id = i.pending_secret_id; end if;
  update public.integrations set deleted_at = now(), state = 'disabled', secret_id = null, pending_secret_id = null, secret_tail = null
    where id = p_id;
  insert into public.integration_events (integration_id, actor, kind, data)
  values (p_id, public.current_email(), 'deleted', '{}'::jsonb);
end
$$;

-- As int_secret_use, for one integration by its id (a second provider of the same type exists).
create function public.int_secret_use_id(p_key text, p_id uuid, p_purpose text, p_pending boolean) returns text
language plpgsql security definer set search_path = ''
as $$
declare i public.integrations; sid uuid; v text;
begin
  if not public.mail_key_ok(p_key) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  select * into i from public.integrations where id = p_id and deleted_at is null and state <> 'disabled';
  if not found then return null; end if;
  sid := case when coalesce(p_pending, false) then i.pending_secret_id else i.secret_id end;
  if sid is null then return null; end if;
  select s.decrypted_secret into v from vault.decrypted_secrets s where s.id = sid;
  insert into public.integration_events (integration_id, actor, kind, data)
  values (i.id, public.current_email(), 'secret_used', jsonb_build_object('purpose', left(coalesce(p_purpose, ''), 60), 'pending', coalesce(p_pending, false)));
  return v;
end
$$;

-- A health result for one provider by id (as int_health, which finds it by type).
create function public.storage_provider_health(p_key text, p_id uuid, p_ok boolean, p_error text, p_config jsonb) returns void
language plpgsql security definer set search_path = ''
as $$
declare i public.integrations; next text;
begin
  if not public.mail_key_ok(p_key) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  select * into i from public.integrations where id = p_id and deleted_at is null for update;
  if not found or i.state = 'disabled' then return; end if;
  next := case when p_ok then 'connected' when p_error in ('NOT_CONNECTED','TOKEN_REFUSED','NO_SECRET') then 'needs_reconnect' else 'error' end;
  update public.integrations set state = next, last_check_at = now(),
      last_ok_at = case when p_ok then now() else last_ok_at end,
      last_error = case when p_ok then null else left(p_error, 200) end,
      config = config || coalesce(p_config, '{}'::jsonb)
    where id = i.id;
  if next <> i.state then
    insert into public.integration_events (integration_id, actor, kind, data)
    values (i.id, public.current_email(), 'health', jsonb_build_object('from', i.state, 'to', next, 'error', left(coalesce(p_error, ''), 60)));
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 5. The overview now carries what the provider cards need (never a secret)
-- ---------------------------------------------------------------------------
create or replace function public.storage_overview() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not (public.has_capability('settings.view', null) or public.has_capability('storage.manage', null)
          or public.has_capability('storage.migrate', null)) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  return jsonb_build_object(
    'providers', coalesce((
      select jsonb_agg(jsonb_build_object(
          'id', i.id, 'type', i.type, 'label', i.label, 'state', i.state,
          'last_check_at', i.last_check_at, 'last_ok_at', i.last_ok_at, 'last_error', i.last_error,
          'account', i.config->>'account',
          'config', (i.config - 'account'),
          'has_secret', i.secret_id is not null, 'secret_tail', i.secret_tail,
          'files', coalesce(s.files, 0), 'bytes', coalesce(s.bytes, 0),
          'library_files', coalesce(s.library_files, 0), 'mail_files', coalesce(s.mail_files, 0),
          'ok', coalesce(s.ok, 0), 'pending', coalesce(s.pending, 0), 'failed', coalesce(s.failed, 0), 'missing', coalesce(s.missing, 0),
          'replicas', coalesce(s.replicas, 0),
          'unverified', coalesce(s.unverified, 0), 'last_verified_at', s.last_verified_at) order by i.created_at)
      from public.integrations i
      left join (
        select integration_id,
               count(*) files, coalesce(sum(size_bytes), 0) bytes,
               count(*) filter (where subject_kind = 'media_version') library_files,
               count(*) filter (where subject_kind = 'mail_file') mail_files,
               count(*) filter (where state = 'ok') ok, count(*) filter (where state = 'pending') pending,
               count(*) filter (where state = 'failed') failed, count(*) filter (where state = 'missing') missing,
               count(*) filter (where role <> 'primary') replicas,
               count(*) filter (where verified_at is null) unverified, max(verified_at) last_verified_at
        from public.file_locations where state <> 'retired' group by integration_id) s on s.integration_id = i.id
      where i.kind = 'storage' and i.deleted_at is null), '[]'::jsonb),
    'roles', coalesce((
      select jsonb_agg(jsonb_build_object('role', r.role, 'integration_id', r.integration_id, 'label', i.label)
        order by case r.role when 'library' then 1 when 'mail' then 2 when 'chat' then 3 else 4 end)
      from public.storage_roles r left join public.integrations i on i.id = r.integration_id), '[]'::jsonb),
    'unrecorded', (select count(*) from public.media_versions v
                    where not exists (select 1 from public.file_locations l where l.subject_kind = 'media_version' and l.subject_id = v.id and l.state <> 'retired'))
                 + (select count(*) from public.mail_files f
                    where not exists (select 1 from public.file_locations l where l.subject_kind = 'mail_file' and l.subject_id = f.id and l.state <> 'retired')),
    'can_manage', public.has_capability('storage.manage', null),
    'can_migrate', public.has_capability('storage.migrate', null),
    'can_secrets', public.has_capability('integrations.secrets', null));
end
$$;

-- ---------------------------------------------------------------------------
-- 6. Planning (the dry run)
-- ---------------------------------------------------------------------------
-- Makes a plan: which primary copies at the source would move, which cannot and why. Nothing
-- is copied. The plan is `planned` until someone starts it.
create function public.storage_move_plan(p_source uuid, p_dest uuid, p_scope jsonb, p_mode text, p_label text, p_hold_days int)
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
  if p_mode is null or p_mode not in ('move','copy') then raise exception 'MOVE_BAD_MODE' using errcode = 'P0001'; end if;
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
  -- What this engine can write in one object: an S3 multipart upload is capped at 10000 parts of 8 MiB.
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
    -- A copy already in another open plan is not planned twice.
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

-- The server's record of what the destination can hold. Key and right, so a page cannot claim room.
create function public.storage_move_note(p_key text, p_id uuid, p_free bigint, p_account text) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.mail_key_ok(p_key) or not public.has_capability('storage.migrate', null) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  update public.storage_moves set dest_free = p_free, dest_account = left(p_account, 200), dest_checked_at = now()
    where id = p_id and state in ('planned','paused');
end
$$;

-- ---------------------------------------------------------------------------
-- 7. Reading
-- ---------------------------------------------------------------------------
create function public.storage_move_report(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare m public.storage_moves; s public.integrations; d public.integrations;
begin
  if not (public.has_capability('storage.migrate', null) or public.has_capability('storage.manage', null)) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  select * into m from public.storage_moves where id = p_id;
  if not found then raise exception 'MOVE_NOT_FOUND' using errcode = 'P0001'; end if;
  select * into s from public.integrations where id = m.source_id;
  select * into d from public.integrations where id = m.dest_id;
  return jsonb_build_object(
    'move', jsonb_build_object(
      'id', m.id, 'label', m.label, 'mode', m.mode, 'scope', m.scope, 'state', m.state,
      'hold_days', m.hold_days, 'hold_until', m.hold_until, 'files', m.files, 'bytes', m.bytes,
      'dest_free', m.dest_free, 'dest_account', m.dest_account, 'dest_checked_at', m.dest_checked_at,
      'created_by', m.created_by, 'created_by_name', public.work_name(m.created_by),
      'created_at', m.created_at, 'started_at', m.started_at, 'finished_at', m.finished_at,
      'source', jsonb_build_object('id', s.id, 'label', s.label, 'type', s.type),
      'dest', jsonb_build_object('id', d.id, 'label', d.label, 'type', d.type)),
    'counts', (select coalesce(jsonb_object_agg(state, n), '{}'::jsonb)
               from (select state, count(*) n from public.storage_move_items where move_id = p_id group by state) c),
    'bytes', jsonb_build_object(
      'planned', coalesce((select sum(size_bytes) from public.storage_move_items where move_id = p_id and state <> 'skipped'), 0),
      'done', coalesce((select sum(size_bytes) from public.storage_move_items
                        where move_id = p_id and (state = 'switched' or (state = 'verified' and m.mode = 'copy'))), 0),
      'partial', coalesce((select sum(bytes_done) from public.storage_move_items where move_id = p_id and state in ('copying','copied','verified')), 0)),
    'skipped', (select coalesce(jsonb_object_agg(reason, n), '{}'::jsonb)
                from (select coalesce(reason, 'unknown') reason, count(*) n from public.storage_move_items where move_id = p_id and state = 'skipped' group by 1) c),
    'failed', (select coalesce(jsonb_object_agg(reason, n), '{}'::jsonb)
               from (select coalesce(reason, 'unknown') reason, count(*) n from public.storage_move_items where move_id = p_id and state = 'failed' group by 1) c),
    'already_there', (select count(*) from public.storage_move_items i
                      where i.move_id = p_id and i.state = 'pending' and exists (
                        select 1 from public.file_locations dl where dl.integration_id = m.dest_id and dl.subject_kind = i.subject_kind
                          and dl.subject_id = i.subject_id and dl.state = 'ok')),
    'approved', (select count(*) from public.storage_move_items where move_id = p_id and approved and state <> 'skipped'),
    'verify', (select coalesce(jsonb_object_agg(verify_level, n), '{}'::jsonb)
               from (select verify_level, count(*) n from public.storage_move_items where move_id = p_id and verify_level is not null group by 1) c),
    -- The source copies kept as replicas, and whether the hold is over.
    'retirable', (select count(*) from public.storage_move_items i join public.file_locations l on l.id = i.source_location_id
                  where i.move_id = p_id and i.state = 'switched' and l.role = 'replica' and l.state <> 'retired'),
    'retired', (select count(*) from public.storage_move_items i join public.file_locations l on l.id = i.source_location_id
                where i.move_id = p_id and i.state = 'switched' and l.state = 'retired'),
    'hold_over', m.hold_until is not null and m.hold_until <= now(),
    'can_migrate', public.has_capability('storage.migrate', null));
end
$$;

create function public.storage_moves_overview() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not (public.has_capability('storage.migrate', null) or public.has_capability('storage.manage', null)) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
        'id', m.id, 'label', m.label, 'mode', m.mode, 'state', m.state, 'scope', m.scope,
        'files', m.files, 'bytes', m.bytes, 'hold_until', m.hold_until, 'created_at', m.created_at, 'finished_at', m.finished_at,
        'source', s.label, 'dest', d.label,
        'switched', coalesce(c.switched, 0), 'copied', coalesce(c.copied, 0), 'failed', coalesce(c.failed, 0),
        'skipped', coalesce(c.skipped, 0), 'open', coalesce(c.open, 0),
        'retirable', coalesce(r.retirable, 0)) order by m.created_at desc)
    from (select * from public.storage_moves order by created_at desc limit 15) m
    join public.integrations s on s.id = m.source_id
    join public.integrations d on d.id = m.dest_id
    left join lateral (
      select count(*) filter (where i.state = 'switched') switched, count(*) filter (where i.state = 'verified') copied,
             count(*) filter (where i.state = 'failed') failed, count(*) filter (where i.state = 'skipped') skipped,
             count(*) filter (where i.state in ('pending','copying','copied') or (i.state = 'verified' and m.mode = 'move')) open
      from public.storage_move_items i where i.move_id = m.id) c on true
    left join lateral (
      select count(*) retirable from public.storage_move_items i join public.file_locations l on l.id = i.source_location_id
      where i.move_id = m.id and i.state = 'switched' and l.role = 'replica' and l.state <> 'retired') r on true), '[]'::jsonb);
end
$$;

-- ---------------------------------------------------------------------------
-- 8. Running
-- ---------------------------------------------------------------------------
create function public.storage_move_start(p_id uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare m public.storage_moves; s public.integrations; d public.integrations;
begin
  if not public.has_capability('storage.migrate', null) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  select * into m from public.storage_moves where id = p_id for update;
  if not found then raise exception 'MOVE_NOT_FOUND' using errcode = 'P0001'; end if;
  if m.state not in ('planned','paused') then raise exception 'MOVE_BAD_STATE' using errcode = 'P0001'; end if;
  select * into s from public.integrations where id = m.source_id;
  select * into d from public.integrations where id = m.dest_id;
  if s.deleted_at is not null or d.deleted_at is not null or s.state = 'disabled' or d.state = 'disabled' then
    raise exception 'MOVE_PROVIDER_NOT_READY' using errcode = 'P0001';
  end if;
  if m.dest_checked_at is null then raise exception 'MOVE_NOT_CHECKED' using errcode = 'P0001'; end if;
  if m.dest_free is not null and m.bytes > m.dest_free then raise exception 'MOVE_NO_SPACE' using errcode = 'P0001'; end if;
  if exists (select 1 from public.storage_moves o where o.id <> p_id and o.state = 'running' and o.dest_id = m.dest_id and o.source_id = m.source_id) then
    raise exception 'MOVE_ALREADY_RUNNING' using errcode = 'P0001';
  end if;
  update public.storage_moves set state = 'running', started_at = coalesce(started_at, now()), finished_at = null where id = p_id;
  perform public.storage_move_event(p_id, 'storage_move_started', jsonb_build_object('resumed', m.state = 'paused'));
  perform public.storage_move_settle(p_id);
end
$$;

create function public.storage_move_pause(p_id uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare m public.storage_moves;
begin
  if not public.has_capability('storage.migrate', null) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  select * into m from public.storage_moves where id = p_id for update;
  if not found then raise exception 'MOVE_NOT_FOUND' using errcode = 'P0001'; end if;
  if m.state <> 'running' then raise exception 'MOVE_BAD_STATE' using errcode = 'P0001'; end if;
  update public.storage_moves set state = 'paused' where id = p_id;
  perform public.storage_move_event(p_id, 'storage_move_paused', '{}'::jsonb);
end
$$;

-- Cancels a plan or run. Files already switched stay where the move put them (in both places,
-- the source as a replica); nothing is deleted. Returns the partial uploads to abort at the
-- destination: [{sink, ...}], and the destination to abort them at.
create function public.storage_move_cancel(p_id uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare m public.storage_moves; d public.integrations; parts jsonb;
begin
  if not public.has_capability('storage.migrate', null) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  select * into m from public.storage_moves where id = p_id for update;
  if not found then raise exception 'MOVE_NOT_FOUND' using errcode = 'P0001'; end if;
  if m.state not in ('planned','running','paused') then raise exception 'MOVE_BAD_STATE' using errcode = 'P0001'; end if;
  select * into d from public.integrations where id = m.dest_id;
  select coalesce(jsonb_agg(i.progress->'sink'), '[]'::jsonb) into parts
    from public.storage_move_items i where i.move_id = p_id and i.progress is not null and i.state in ('pending','copying');
  update public.storage_move_items set state = 'cancelled', progress = null, claimed_until = null, updated_at = now()
    where move_id = p_id and state in ('pending','copying','copied','verified');
  update public.storage_moves set state = 'cancelled', finished_at = now() where id = p_id;
  perform public.storage_move_event(p_id, 'storage_move_cancelled', '{}'::jsonb);
  return jsonb_build_object('dest', jsonb_build_object('id', d.id, 'type', d.type, 'config', d.config), 'sinks', parts);
end
$$;

-- Failed items go back to pending. A finished run runs again.
create function public.storage_move_retry(p_id uuid) returns int
language plpgsql security definer set search_path = ''
as $$
declare m public.storage_moves; n int;
begin
  if not public.has_capability('storage.migrate', null) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  select * into m from public.storage_moves where id = p_id for update;
  if not found then raise exception 'MOVE_NOT_FOUND' using errcode = 'P0001'; end if;
  if m.state not in ('running','paused','completed') then raise exception 'MOVE_BAD_STATE' using errcode = 'P0001'; end if;
  update public.storage_move_items set state = 'pending', attempts = 0, reason = null, progress = null, claimed_until = null,
      bytes_done = 0, updated_at = now()
    where move_id = p_id and state = 'failed';
  get diagnostics n = row_count;
  if n > 0 and m.state = 'completed' then
    update public.storage_moves set state = 'running', finished_at = null, hold_until = null where id = p_id;
    perform public.storage_move_event(p_id, 'storage_move_started', jsonb_build_object('retry', n));
  end if;
  return n;
end
$$;

-- Hands the server the next items to work on, for a short lease so two open pages never
-- copy the same file at once. The result is for the server only: it carries provider
-- references and settings (no secret) and is never passed to a browser.
create function public.storage_move_claim(p_key text, p_id uuid, p_limit int) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare m public.storage_moves; s public.integrations; d public.integrations; picked uuid[];
begin
  if not public.mail_key_ok(p_key) or not public.has_capability('storage.migrate', null) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  select * into m from public.storage_moves where id = p_id;
  if not found then raise exception 'MOVE_NOT_FOUND' using errcode = 'P0001'; end if;
  if m.state <> 'running' then return jsonb_build_object('state', m.state, 'items', '[]'::jsonb); end if;
  select * into s from public.integrations where id = m.source_id;
  select * into d from public.integrations where id = m.dest_id;

  -- A copy that is no longer the file's primary (deleted, or moved by another plan) is not ours to move.
  update public.storage_move_items i set state = 'skipped', reason = 'source_changed', progress = null, claimed_until = null, updated_at = now()
    where i.move_id = p_id and i.state in ('pending','copying')
      and not exists (select 1 from public.file_locations l where l.id = i.source_location_id and l.role = 'primary' and l.state <> 'retired');

  perform public.storage_move_settle(p_id);
  select * into m from public.storage_moves where id = p_id;
  if m.state <> 'running' then return jsonb_build_object('state', m.state, 'items', '[]'::jsonb); end if;

  select coalesce(array_agg(x.id), '{}') into picked from (
    select i.id from public.storage_move_items i
    where i.move_id = p_id and (i.state in ('pending','copying','copied') or (i.state = 'verified' and m.mode = 'move'))
      and (i.claimed_until is null or i.claimed_until < now())
    order by i.created_at, i.id
    limit least(greatest(coalesce(p_limit, 3), 1), 10)
    for update skip locked) x;
  update public.storage_move_items set claimed_until = now() + interval '120 seconds', updated_at = now() where id = any (picked);

  return jsonb_build_object(
    'state', m.state, 'mode', m.mode,
    'source', jsonb_build_object('id', s.id, 'type', s.type, 'config', s.config),
    'dest', jsonb_build_object('id', d.id, 'type', d.type, 'config', d.config),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
          'id', i.id, 'state', i.state, 'kind', i.subject_kind, 'subject', i.subject_id, 'approved', i.approved,
          'size', coalesce(i.size_bytes, sl.size_bytes), 'attempts', i.attempts, 'progress', i.progress,
          'source_ref', sl.ref, 'source_checksum', sl.checksum,
          'name', case i.subject_kind
                    when 'media_version' then (select f.name from public.media_versions v join public.media_files f on f.id = v.asset_id where v.id = i.subject_id)
                    else (select mf.name from public.mail_files mf where mf.id = i.subject_id) end,
          'mime', case i.subject_kind
                    when 'media_version' then (select v.mime_type from public.media_versions v where v.id = i.subject_id)
                    else (select mf.mime_type from public.mail_files mf where mf.id = i.subject_id) end,
          'parent', case when i.subject_kind = 'media_version' then (
                      select fo.drive_folder_id from public.media_versions v
                        join public.media_files f on f.id = v.asset_id
                        join public.media_folders fo on fo.id = f.folder_id where v.id = i.subject_id) end,
          'dest_location', (select jsonb_build_object('id', dl.id, 'ref', dl.ref, 'state', dl.state, 'size', dl.size_bytes,
                              'checksum', dl.checksum, 'remote_checksum', dl.remote_checksum)
                            from public.file_locations dl
                            where dl.integration_id = m.dest_id and dl.subject_kind = i.subject_kind and dl.subject_id = i.subject_id
                              and dl.state <> 'retired' order by (dl.state = 'ok') desc limit 1)
        ) order by i.created_at, i.id)
      from public.storage_move_items i join public.file_locations sl on sl.id = i.source_location_id
      where i.id = any (picked)), '[]'::jsonb));
end
$$;

-- The partial state of a copy in progress (the destination's upload and the running hash).
create function public.storage_move_progress(p_key text, p_item uuid, p_progress jsonb, p_bytes bigint) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.mail_key_ok(p_key) or not public.has_capability('storage.migrate', null) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  update public.storage_move_items i set progress = p_progress, bytes_done = greatest(coalesce(p_bytes, 0), 0),
      state = case when i.state = 'pending' then 'copying' else i.state end,
      claimed_until = now() + interval '120 seconds', updated_at = now()
    where i.id = p_item and i.state in ('pending','copying')
      and exists (select 1 from public.storage_moves m where m.id = i.move_id and m.state = 'running');
end
$$;

-- All the bytes are at the destination: a pending replica is recorded. Not yet trusted.
create function public.storage_move_copied(p_key text, p_item uuid, p_ref text, p_size bigint, p_checksum text, p_remote text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare i public.storage_move_items; m public.storage_moves; sl public.file_locations; did uuid;
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
  select * into sl from public.file_locations where id = i.source_location_id;
  if sl.checksum is not null and sl.checksum <> p_checksum then raise exception 'CHECKSUM_CONFLICT' using errcode = 'P0001'; end if;
  update public.file_locations set checksum = p_checksum where id = sl.id and checksum is null;

  insert into public.file_locations (integration_id, subject_kind, subject_id, ref, role, state, size_bytes, checksum, remote_checksum)
  values (m.dest_id, i.subject_kind, i.subject_id, p_ref, 'replica', 'pending', p_size, p_checksum, left(p_remote, 140))
  on conflict (integration_id, ref) do update
    set subject_kind = excluded.subject_kind, subject_id = excluded.subject_id, role = 'replica', state = 'pending',
        size_bytes = excluded.size_bytes, checksum = excluded.checksum, remote_checksum = excluded.remote_checksum, verified_at = null
    where public.file_locations.subject_kind = excluded.subject_kind and public.file_locations.subject_id = excluded.subject_id
  returning id into did;
  if did is null then raise exception 'MOVE_BAD_RECORD' using errcode = 'P0001'; end if;
  update public.storage_move_items set state = 'copied', dest_location_id = did, progress = null, checksum = p_checksum,
      bytes_done = coalesce(p_size, 0), claimed_until = null, updated_at = now()
    where id = p_item;
end
$$;

-- A verified replica of this file already sits at the destination (for example the source of an
-- earlier move, still held): the item uses it instead of copying again. It is verified like
-- any other copy before it can be switched to.
create function public.storage_move_attach(p_key text, p_item uuid, p_location uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare i public.storage_move_items; m public.storage_moves; dl public.file_locations;
begin
  if not public.mail_key_ok(p_key) or not public.has_capability('storage.migrate', null) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  select * into i from public.storage_move_items where id = p_item for update;
  if not found or i.state <> 'pending' then raise exception 'MOVE_BAD_STATE' using errcode = 'P0001'; end if;
  select * into m from public.storage_moves where id = i.move_id;
  if m.state <> 'running' then raise exception 'MOVE_BAD_STATE' using errcode = 'P0001'; end if;
  select * into dl from public.file_locations where id = p_location and integration_id = m.dest_id
    and subject_kind = i.subject_kind and subject_id = i.subject_id and state = 'ok' and role <> 'primary';
  if not found or dl.checksum is null then raise exception 'MOVE_BAD_RECORD' using errcode = 'P0001'; end if;
  update public.storage_move_items set state = 'copied', dest_location_id = dl.id, checksum = dl.checksum,
      bytes_done = coalesce(dl.size_bytes, 0), claimed_until = null, updated_at = now()
    where id = p_item;
end
$$;

-- What the check of the destination copy found. Only an ok result makes the copy trustworthy.
create function public.storage_move_verified(p_key text, p_item uuid, p_ok boolean, p_level text, p_error text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare i public.storage_move_items; m public.storage_moves; ok boolean := coalesce(p_ok, false); err text := p_error; dl public.file_locations;
begin
  if not public.mail_key_ok(p_key) or not public.has_capability('storage.migrate', null) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  select * into i from public.storage_move_items where id = p_item for update;
  if not found or i.state <> 'copied' then raise exception 'MOVE_BAD_STATE' using errcode = 'P0001'; end if;
  select * into m from public.storage_moves where id = i.move_id;
  if m.state <> 'running' then raise exception 'MOVE_BAD_STATE' using errcode = 'P0001'; end if;
  select * into dl from public.file_locations where id = i.dest_location_id;
  if not found then raise exception 'MOVE_BAD_STATE' using errcode = 'P0001'; end if;
  if p_level not in ('checksum','size') then raise exception 'MOVE_BAD_RECORD' using errcode = 'P0001'; end if;
  -- An approved version is proven by its checksum before and after, or it does not move.
  if ok and i.approved and p_level <> 'checksum' then ok := false; err := 'APPROVED_NEEDS_CHECKSUM'; end if;
  if ok then
    update public.file_locations set state = 'ok', verified_at = now() where id = dl.id;
    update public.storage_move_items set state = 'verified', verify_level = p_level, claimed_until = null, updated_at = now() where id = p_item;
  else
    update public.file_locations set state = 'failed' where id = dl.id;
    update public.storage_move_items set state = 'failed', reason = left(coalesce(err, 'VERIFY_FAILED'), 60), verify_level = null,
        claimed_until = null, updated_at = now() where id = p_item;
  end if;
  perform public.storage_move_settle(i.move_id);
end
$$;

-- The destination becomes the primary and the source a replica, only for a verified copy.
create function public.storage_move_switch(p_key text, p_item uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare i public.storage_move_items; m public.storage_moves; sl public.file_locations; dl public.file_locations;
begin
  if not public.mail_key_ok(p_key) or not public.has_capability('storage.migrate', null) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  select * into i from public.storage_move_items where id = p_item for update;
  if not found or i.state <> 'verified' then raise exception 'MOVE_BAD_STATE' using errcode = 'P0001'; end if;
  select * into m from public.storage_moves where id = i.move_id;
  if m.state <> 'running' or m.mode <> 'move' then raise exception 'MOVE_BAD_STATE' using errcode = 'P0001'; end if;
  select * into sl from public.file_locations where id = i.source_location_id for update;
  select * into dl from public.file_locations where id = i.dest_location_id for update;
  if not found or dl.state <> 'ok' or dl.verified_at is null or dl.checksum is null then
    raise exception 'MOVE_NOT_VERIFIED' using errcode = 'P0001';
  end if;
  if sl.id is null or sl.role <> 'primary' or sl.state = 'retired' then
    update public.storage_move_items set state = 'skipped', reason = 'source_changed', claimed_until = null, updated_at = now() where id = p_item;
    perform public.storage_move_settle(i.move_id);
    return;
  end if;
  -- Sequential, not one statement: the partial unique index allows one primary per file.
  update public.file_locations set role = 'replica' where id = sl.id;
  update public.file_locations set role = 'primary' where id = dl.id;
  update public.storage_move_items set state = 'switched', claimed_until = null, updated_at = now() where id = p_item;
  perform public.storage_move_settle(i.move_id);
end
$$;

-- An attempt failed. Final failures are marked now; others are tried again, up to three times.
create function public.storage_move_fail(p_key text, p_item uuid, p_error text, p_final boolean) returns void
language plpgsql security definer set search_path = ''
as $$
declare i public.storage_move_items; goes_final boolean;
begin
  if not public.mail_key_ok(p_key) or not public.has_capability('storage.migrate', null) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  select * into i from public.storage_move_items where id = p_item for update;
  if not found or i.state not in ('pending','copying','copied','verified') then return; end if;
  goes_final := coalesce(p_final, false) or i.attempts + 1 >= 3;
  update public.storage_move_items set attempts = attempts + 1, claimed_until = null, updated_at = now(),
      reason = left(coalesce(p_error, 'FAILED'), 60),
      state = case when goes_final then 'failed' else state end,
      progress = case when goes_final then null else progress end
    where id = p_item;
  if goes_final and i.dest_location_id is not null then
    update public.file_locations set state = 'failed' where id = i.dest_location_id and role = 'replica' and state = 'pending';
  end if;
  if goes_final then perform public.storage_move_settle(i.move_id); end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 9. Holding and retiring the source
-- ---------------------------------------------------------------------------
-- Source copies of switched items that may be retired: replicas only, whose file has a verified
-- primary elsewhere, and only once the hold the plan stated is over.
create function public.storage_retire_claim(p_key text, p_id uuid, p_limit int) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare m public.storage_moves; s public.integrations;
begin
  if not public.mail_key_ok(p_key) or not public.has_capability('storage.migrate', null) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  select * into m from public.storage_moves where id = p_id;
  if not found then raise exception 'MOVE_NOT_FOUND' using errcode = 'P0001'; end if;
  if m.state <> 'completed' or m.mode <> 'move' then raise exception 'MOVE_BAD_STATE' using errcode = 'P0001'; end if;
  if m.hold_until is null or m.hold_until > now() then raise exception 'HOLD_NOT_OVER' using errcode = 'P0001'; end if;
  select * into s from public.integrations where id = m.source_id;
  return jsonb_build_object(
    'source', jsonb_build_object('id', s.id, 'type', s.type, 'config', s.config),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'ref', x.ref))
      from (
        select l.id, l.ref from public.storage_move_items i
          join public.file_locations l on l.id = i.source_location_id
        where i.move_id = p_id and i.state = 'switched' and l.role = 'replica' and l.state <> 'retired'
          and exists (select 1 from public.file_locations p
                      where p.subject_kind = l.subject_kind and p.subject_id = l.subject_id and p.role = 'primary'
                        and p.state = 'ok' and p.verified_at is not null)
        order by i.created_at, i.id
        limit least(greatest(coalesce(p_limit, 10), 1), 50)) x), '[]'::jsonb));
end
$$;

-- The server trashed these at the provider (recoverable); the copies are now retired.
create function public.storage_retire_mark(p_key text, p_id uuid, p_ids uuid[]) returns int
language plpgsql security definer set search_path = ''
as $$
declare m public.storage_moves; n int;
begin
  if not public.mail_key_ok(p_key) or not public.has_capability('storage.migrate', null) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  select * into m from public.storage_moves where id = p_id;
  if not found or m.state <> 'completed' or m.hold_until is null or m.hold_until > now() then
    raise exception 'HOLD_NOT_OVER' using errcode = 'P0001';
  end if;
  update public.file_locations l set state = 'retired'
    where l.id = any (p_ids) and l.role = 'replica' and l.state <> 'retired'
      and exists (select 1 from public.storage_move_items i where i.move_id = p_id and i.source_location_id = l.id and i.state = 'switched')
      and exists (select 1 from public.file_locations p
                  where p.subject_kind = l.subject_kind and p.subject_id = l.subject_id and p.role = 'primary'
                    and p.state = 'ok' and p.verified_at is not null);
  get diagnostics n = row_count;
  if n > 0 then
    insert into public.integration_events (integration_id, actor, kind, data)
    values (m.source_id, public.current_email(), 'storage_retired', jsonb_build_object('move', p_id, 'retired', n));
  end if;
  return n;
end
$$;

-- ---------------------------------------------------------------------------
-- 10. Serving
-- ---------------------------------------------------------------------------
-- The live copies of the file a provider reference belongs to, primary first, then verified
-- replicas. For the server only: it asks after it has decided the person may see the file.
-- The reference may be the legacy one (media_versions.drive_file_id) or any current one.
create function public.storage_serving(p_key text, p_ref text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare k text; sid uuid;
begin
  if not public.mail_key_ok(p_key) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if p_ref is null or char_length(p_ref) > 300 then return '[]'::jsonb; end if;
  select l.subject_kind, l.subject_id into k, sid from public.file_locations l where l.ref = p_ref
    order by (l.state <> 'retired') desc, l.created_at limit 1;
  if k is null then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
        'integration_id', i.id, 'type', i.type, 'config', i.config, 'ref', l.ref, 'role', l.role, 'state', l.state)
      order by (l.role = 'primary') desc, (l.state = 'ok') desc, l.created_at)
    from public.file_locations l join public.integrations i on i.id = l.integration_id
    where l.subject_kind = k and l.subject_id = sid and l.state <> 'retired'
      and i.deleted_at is null and i.state <> 'disabled'), '[]'::jsonb);
end
$$;

-- ---------------------------------------------------------------------------
-- 11. Privileges
-- ---------------------------------------------------------------------------
revoke all on function public.storage_move_event(uuid, text, jsonb), public.storage_move_settle(uuid) from public, anon, authenticated;
revoke all on function public.storage_provider_save(uuid, text, jsonb), public.storage_provider_remove(uuid),
  public.storage_move_plan(uuid, uuid, jsonb, text, text, int), public.storage_move_note(text, uuid, bigint, text),
  public.storage_move_report(uuid), public.storage_moves_overview(), public.storage_move_start(uuid),
  public.storage_move_pause(uuid), public.storage_move_cancel(uuid), public.storage_move_retry(uuid),
  public.storage_move_claim(text, uuid, int), public.storage_move_progress(text, uuid, jsonb, bigint),
  public.storage_move_copied(text, uuid, text, bigint, text, text), public.storage_move_attach(text, uuid, uuid), public.storage_move_verified(text, uuid, boolean, text, text),
  public.storage_move_switch(text, uuid), public.storage_move_fail(text, uuid, text, boolean),
  public.storage_retire_claim(text, uuid, int), public.storage_retire_mark(text, uuid, uuid[]),
  public.storage_serving(text, text), public.int_secret_use_id(text, uuid, text, boolean),
  public.storage_provider_health(text, uuid, boolean, text, jsonb), public.storage_overview() from public, anon;
grant execute on function public.storage_provider_save(uuid, text, jsonb), public.storage_provider_remove(uuid),
  public.storage_move_plan(uuid, uuid, jsonb, text, text, int), public.storage_move_note(text, uuid, bigint, text),
  public.storage_move_report(uuid), public.storage_moves_overview(), public.storage_move_start(uuid),
  public.storage_move_pause(uuid), public.storage_move_cancel(uuid), public.storage_move_retry(uuid),
  public.storage_move_claim(text, uuid, int), public.storage_move_progress(text, uuid, jsonb, bigint),
  public.storage_move_copied(text, uuid, text, bigint, text, text), public.storage_move_attach(text, uuid, uuid), public.storage_move_verified(text, uuid, boolean, text, text),
  public.storage_move_switch(text, uuid), public.storage_move_fail(text, uuid, text, boolean),
  public.storage_retire_claim(text, uuid, int), public.storage_retire_mark(text, uuid, uuid[]),
  public.storage_overview() to authenticated;
-- The server's own reads, which may run for a visitor of a review link: the key decides (as for the vault).
grant execute on function public.storage_serving(text, text), public.int_secret_use_id(text, uuid, text, boolean),
  public.storage_provider_health(text, uuid, boolean, text, jsonb) to anon, authenticated;

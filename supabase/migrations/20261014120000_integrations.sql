-- Settings and integrations, Step S1 (Settings_Integrations_Plan.md 4, 5; owner directive of
-- 2026-10-14): the integrations core, secrets in Supabase Vault, the event log, general
-- settings and their capabilities.
--
--   * Every connection is a row of `integrations` (storage, platform, messaging) with a state
--     (pending, connected, needs_reconnect, error, disabled) and an append-only event log.
--   * Secrets live in Vault. They go in through int_secret_set (a holder of
--     «integrations.secrets»), are kept pending until the site's server has checked them
--     (int_secret_commit), and come out only through int_secret_use, which needs the site's
--     server key (MAIL_SERVER_KEY, sha256 in mail_server_key) and records the use. No
--     function returns a secret to a browser; the tables have no read policy; the event log
--     never holds a value.
--   * Nothing here is scheduled: a health result is recorded when the site checks.

-- ---------------------------------------------------------------------------
-- Capabilities (the administrator's by default; grantable to leaders)
-- ---------------------------------------------------------------------------
alter table public.capabilities drop constraint capabilities_grp_check;
alter table public.capabilities add constraint capabilities_grp_check check (grp in ('pages','messaging','accounts','settings','fixed'));

insert into public.capabilities (key, grp, label_ar, grantable, scope_kind, min_rank, fixed_roles, why_ar, sort) values
  ('settings.view',        'settings', 'عرض صحة النظام وسجل الإعدادات',     true, 'none', 2, '{}', null, 50),
  ('settings.manage',      'settings', 'تعديل الإعدادات العامة للنظام',      true, 'none', 2, '{}', null, 51),
  ('storage.manage',       'settings', 'إدارة مزودي التخزين',                true, 'none', 2, '{}', null, 52),
  ('storage.migrate',      'settings', 'نقل الملفات بين مزودي التخزين',      true, 'none', 2, '{}', null, 53),
  ('backups.run',          'settings', 'تشغيل النسخ الاحتياطي',              true, 'none', 2, '{}', null, 54),
  ('backups.restore',      'settings', 'استعادة ملفات من نسخة احتياطية',     true, 'none', 2, '{}', null, 55),
  ('platforms.manage',     'settings', 'إدارة المنصات وتطبيقاتها',           true, 'none', 2, '{}', null, 56),
  ('integrations.secrets', 'settings', 'إدخال أسرار التكاملات وتجديدها',     true, 'none', 2, '{}', null, 57);

insert into public.role_capabilities (role, capability, allowed, updated_by)
select r, c.key, r = 'admin', 'installation'
from unnest(array['admin','director','assistant','writer','designer','producer','publisher','member']) r
cross join public.capabilities c
where c.grp = 'settings';

-- ---------------------------------------------------------------------------
-- The core
-- ---------------------------------------------------------------------------
create table public.integrations (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('storage','platform','messaging')),
  type text not null check (type ~ '^[a-z][a-z0-9_]{1,39}$'),
  label text not null check (char_length(btrim(label)) between 1 and 60),
  state text not null default 'pending' check (state in ('pending','connected','needs_reconnect','error','disabled')),
  -- Non-secret settings only (folder ids, regions, account shown to admins).
  config jsonb not null default '{}'::jsonb,
  secret_id uuid,
  secret_tail text check (secret_tail is null or char_length(secret_tail) <= 8),
  secret_set_at timestamptz,
  pending_secret_id uuid,
  last_check_at timestamptz,
  last_ok_at timestamptz,
  last_error text check (last_error is null or char_length(last_error) <= 200),
  created_by text,
  created_at timestamptz not null default now(),
  disabled_at timestamptz,
  deleted_at timestamptz
);
alter table public.integrations enable row level security;
-- No policies: read through int_list(), which never returns a secret reference.

-- The Google Drive account the Hub already uses (src/lib/drive/google.ts).
insert into public.integrations (id, kind, type, label, state, created_by)
values ('00000000-0000-4000-8000-0000000000d1', 'storage', 'google_drive', 'Google Drive', 'pending', 'installation');

create table public.integration_events (
  id bigserial primary key,
  at timestamptz not null default now(),
  integration_id uuid references public.integrations(id),
  actor text,
  kind text not null check (kind in ('created','connected','health','secret_set','secret_committed','secret_discarded','secret_used','enabled','disabled','deleted','settings')),
  -- Never a secret: states, purposes, error codes, who.
  data jsonb not null default '{}'::jsonb
);
create index integration_events_at_idx on public.integration_events (at desc);
create index integration_events_integration_idx on public.integration_events (integration_id, at desc);
alter table public.integration_events enable row level security;
create policy integration_events_read on public.integration_events for select to authenticated
  using ((select public.has_capability('settings.view', null)));

create function public.integration_events_frozen() returns trigger
language plpgsql set search_path = ''
as $$ begin raise exception 'APPEND_ONLY' using errcode = 'P0001'; end $$;
create trigger integration_events_frozen before update or delete on public.integration_events
  for each row execute function public.integration_events_frozen();

-- General settings, one row. Read by every approved person (the maintenance banner).
create table public.site_settings (
  id int primary key default 1 check (id = 1),
  maintenance_on boolean not null default false,
  maintenance_text text check (maintenance_text is null or char_length(maintenance_text) <= 200),
  upload_max_mb int not null default 5120 check (upload_max_mb between 1 and 5120),
  updated_by text,
  updated_at timestamptz not null default now()
);
insert into public.site_settings (id) values (1);
alter table public.site_settings enable row level security;
create policy site_settings_read on public.site_settings for select to authenticated
  using ((select public.is_approved()));

-- ---------------------------------------------------------------------------
-- Reading the core
-- ---------------------------------------------------------------------------
create function public.int_cap_for(p_kind text) returns text
language sql immutable set search_path = ''
as $$ select case p_kind when 'storage' then 'storage.manage' when 'platform' then 'platforms.manage' else 'settings.manage' end $$;

create function public.int_list() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.has_capability('settings.view', null) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', i.id, 'kind', i.kind, 'type', i.type, 'label', i.label, 'state', i.state, 'config', i.config,
      'has_secret', i.secret_id is not null, 'secret_tail', i.secret_tail, 'secret_set_at', i.secret_set_at,
      'pending', i.pending_secret_id is not null,
      'last_check_at', i.last_check_at, 'last_ok_at', i.last_ok_at, 'last_error', i.last_error,
      'created_at', i.created_at, 'disabled_at', i.disabled_at) order by i.kind, i.created_at)
    from public.integrations i where i.deleted_at is null), '[]'::jsonb);
end
$$;

create function public.int_events(p_limit int) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.has_capability('settings.view', null) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'at', e.at, 'kind', e.kind, 'actor', e.actor,
      'actor_name', case when e.actor is null then null else public.work_name(e.actor) end,
      'integration', i.label, 'data', e.data) order by e.at desc, e.id desc)
    from (select * from public.integration_events order by at desc, id desc limit least(greatest(coalesce(p_limit, 100), 1), 500)) e
    left join public.integrations i on i.id = e.integration_id), '[]'::jsonb);
end
$$;

-- ---------------------------------------------------------------------------
-- Secrets (Vault)
-- ---------------------------------------------------------------------------
-- Stores a new secret as pending. Returns only its masked tail. The server checks it, then
-- commits (int_secret_commit) or discards it; until then the old one stays in use.
create function public.int_secret_set(p_id uuid, p_secret text) returns text
language plpgsql security definer set search_path = ''
as $$
declare me text := public.current_email(); i public.integrations; sid uuid; tail text;
begin
  if not public.has_capability('integrations.secrets', null) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  select * into i from public.integrations where id = p_id and deleted_at is null for update;
  if not found then raise exception 'INT_NOT_FOUND' using errcode = 'P0001'; end if;
  if p_secret is null or char_length(p_secret) not between 8 and 8192 then raise exception 'SECRET_INVALID' using errcode = 'P0001'; end if;
  if i.pending_secret_id is not null then delete from vault.secrets where id = i.pending_secret_id; end if;
  sid := vault.create_secret(p_secret, 'integration:' || i.id || ':' || gen_random_uuid(), 'Comms Hub integration secret (pending)');
  tail := '••••' || right(p_secret, 4);
  update public.integrations set pending_secret_id = sid where id = p_id;
  insert into public.integration_events (integration_id, actor, kind, data) values (p_id, me, 'secret_set', jsonb_build_object('pending', true));
  return tail;
end
$$;

-- The only way out of the vault: for the site's server, with its key, for a stated purpose.
-- p_pending reads the pending secret (to check it before committing).
create function public.int_secret_use(p_key text, p_type text, p_purpose text, p_pending boolean) returns text
language plpgsql security definer set search_path = ''
as $$
declare i public.integrations; sid uuid; v text;
begin
  if not public.mail_key_ok(p_key) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  select * into i from public.integrations where type = p_type and deleted_at is null and state <> 'disabled' order by created_at limit 1;
  if not found then return null; end if;
  sid := case when coalesce(p_pending, false) then i.pending_secret_id else i.secret_id end;
  if sid is null then return null; end if;
  select s.decrypted_secret into v from vault.decrypted_secrets s where s.id = sid;
  insert into public.integration_events (integration_id, actor, kind, data)
  values (i.id, public.current_email(), 'secret_used', jsonb_build_object('purpose', left(coalesce(p_purpose, ''), 60), 'pending', coalesce(p_pending, false)));
  return v;
end
$$;

-- After the server's check: the pending secret replaces the current one, which is deleted.
create function public.int_secret_commit(p_key text, p_id uuid, p_tail text, p_config jsonb) returns void
language plpgsql security definer set search_path = ''
as $$
declare me text := public.current_email(); i public.integrations;
begin
  if not public.mail_key_ok(p_key) or not public.has_capability('integrations.secrets', null) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  select * into i from public.integrations where id = p_id for update;
  if not found or i.pending_secret_id is null then raise exception 'INT_NO_PENDING' using errcode = 'P0001'; end if;
  if i.secret_id is not null then delete from vault.secrets where id = i.secret_id; end if;
  update public.integrations set secret_id = i.pending_secret_id, pending_secret_id = null,
      secret_tail = left(p_tail, 8), secret_set_at = now(), state = 'connected', last_ok_at = now(), last_check_at = now(), last_error = null,
      config = config || coalesce(p_config, '{}'::jsonb)
    where id = p_id;
  insert into public.integration_events (integration_id, actor, kind, data)
  values (p_id, me, 'secret_committed', jsonb_build_object('replaced', i.secret_id is not null));
end
$$;

create function public.int_secret_discard(p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = ''
as $$
declare i public.integrations;
begin
  if not public.has_capability('integrations.secrets', null) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  select * into i from public.integrations where id = p_id for update;
  if not found then raise exception 'INT_NOT_FOUND' using errcode = 'P0001'; end if;
  if i.pending_secret_id is null then return; end if;
  delete from vault.secrets where id = i.pending_secret_id;
  update public.integrations set pending_secret_id = null where id = p_id;
  insert into public.integration_events (integration_id, actor, kind, data)
  values (p_id, public.current_email(), 'secret_discarded', jsonb_build_object('reason', left(coalesce(p_reason, ''), 120)));
end
$$;

-- ---------------------------------------------------------------------------
-- Health, state, settings
-- ---------------------------------------------------------------------------
-- The server records a check. Only a change of state is an event; every check updates the time.
create function public.int_health(p_key text, p_type text, p_ok boolean, p_error text, p_config jsonb) returns void
language plpgsql security definer set search_path = ''
as $$
declare i public.integrations; next text;
begin
  if not public.mail_key_ok(p_key) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  select * into i from public.integrations where type = p_type and deleted_at is null order by created_at limit 1 for update;
  if not found or i.state = 'disabled' then return; end if;
  next := case when p_ok then 'connected' when p_error in ('NOT_CONNECTED','TOKEN_REFUSED') then 'needs_reconnect' else 'error' end;
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

create function public.int_set_enabled(p_id uuid, p_on boolean) returns void
language plpgsql security definer set search_path = ''
as $$
declare i public.integrations;
begin
  select * into i from public.integrations where id = p_id and deleted_at is null for update;
  if not found then raise exception 'INT_NOT_FOUND' using errcode = 'P0001'; end if;
  if not public.has_capability(public.int_cap_for(i.kind), null) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  update public.integrations set state = case when p_on then 'pending' else 'disabled' end,
      disabled_at = case when p_on then null else now() end
    where id = p_id;
  insert into public.integration_events (integration_id, actor, kind, data)
  values (p_id, public.current_email(), case when p_on then 'enabled' else 'disabled' end, '{}'::jsonb);
end
$$;

create function public.settings_update(p jsonb) returns void
language plpgsql security definer set search_path = ''
as $$
declare before public.site_settings;
begin
  if not public.has_capability('settings.manage', null) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  select * into before from public.site_settings where id = 1;
  update public.site_settings set
      maintenance_on = coalesce((p->>'maintenance_on')::boolean, maintenance_on),
      maintenance_text = case when p ? 'maintenance_text' then nullif(btrim(p->>'maintenance_text'), '') else maintenance_text end,
      upload_max_mb = coalesce((p->>'upload_max_mb')::int, upload_max_mb),
      updated_by = public.current_email(), updated_at = now()
    where id = 1;
  insert into public.integration_events (integration_id, actor, kind, data)
  values (null, public.current_email(), 'settings', jsonb_strip_nulls(jsonb_build_object(
    'maintenance_on', case when p ? 'maintenance_on' and (p->>'maintenance_on')::boolean is distinct from before.maintenance_on then (p->>'maintenance_on')::boolean end,
    'upload_max_mb', case when p ? 'upload_max_mb' and (p->>'upload_max_mb')::int is distinct from before.upload_max_mb then (p->>'upload_max_mb')::int end,
    'maintenance_text', case when p ? 'maintenance_text' then true end)));
end
$$;

-- What the general tab counts, without any file name or secret.
create function public.settings_overview() returns jsonb
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
    'events_day', (select count(*) from public.integration_events where at > now() - interval '1 day'));
end
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke all on function public.int_cap_for(text), public.integration_events_frozen() from public, anon, authenticated;
revoke all on function public.int_list(), public.int_events(int), public.int_secret_set(uuid, text), public.int_secret_commit(text, uuid, text, jsonb),
  public.int_secret_discard(uuid, text), public.int_set_enabled(uuid, boolean), public.settings_update(jsonb), public.settings_overview(),
  public.int_secret_use(text, text, text, boolean), public.int_health(text, text, boolean, text, jsonb) from public, anon;
grant execute on function public.int_list(), public.int_events(int), public.int_secret_set(uuid, text), public.int_secret_commit(text, uuid, text, jsonb),
  public.int_secret_discard(uuid, text), public.int_set_enabled(uuid, boolean), public.settings_update(jsonb), public.settings_overview() to authenticated;
-- The server's own calls: the key decides. Callable without a sign-in, as the Drive routes may run without one.
grant execute on function public.int_secret_use(text, text, text, boolean), public.int_health(text, text, boolean, text, jsonb) to anon, authenticated;

alter publication supabase_realtime add table public.site_settings;

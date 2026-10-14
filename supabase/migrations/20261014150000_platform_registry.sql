-- Settings Step S5 (Settings_Integrations_Plan.md 8.1, 8.4, 8.5): the platform registry.
--
-- The list of platforms was repeated in check constraints and in four functions. It is now
-- one table, `platforms`, that the rest reads:
--   * platform_accounts.platform and work_variants.platform reference it (a foreign key
--     replaces the check), so a new platform is a row, not a migration;
--   * what a platform accepts is data: `accepts.video_only` replaces the YouTube rule in
--     work_youtube_ok (same refusal, same code), and the order of platform copies is `sort`;
--   * the existing four platforms and the shared mailbox are migrated as rows, with the same
--     labels and the same behaviour (the approval and work rule runs are re-run unchanged).
-- Publishing stays a simulation for every platform: `adapter` can only be 'simulated' until
-- an adapter is built. `publish_mode` is the planned path (auto, assisted, manual) and is
-- shown as such. `readiness` is the owner's tracker for the outside paperwork (developer
-- app, business verification, review), with a note and a dated log.
-- Writing the registry needs «إدارة المنصات وتطبيقاتها» (platforms.manage, the
-- administrator's by default); accounts are still managed by the people who manage them.

-- ---------------------------------------------------------------------------
-- 1. The registry
-- ---------------------------------------------------------------------------
create table public.platforms (
  key text primary key check (key ~ '^[a-z][a-z0-9_]{0,29}$'),
  label_ar text not null check (char_length(btrim(label_ar)) between 1 and 40),
  -- 'mail' is the department's shared mailbox: a fixed channel, not a social platform.
  kind text not null default 'social' check (kind in ('social','mail')),
  sort int not null default 100,
  -- What a copy for this platform must satisfy. Only video_only is enforced today;
  -- the limits are filled by the preview step and are information until then.
  accepts jsonb not null default '{}'::jsonb check (jsonb_typeof(accepts) = 'object'),
  -- How publishing really happens. Only the simulation exists.
  adapter text not null default 'simulated' check (adapter in ('simulated')),
  -- The planned path once an adapter exists: the site posts, the publisher confirms a prepared
  -- post, or the publisher does it by hand from a task.
  publish_mode text not null default 'assisted' check (publish_mode in ('auto','assisted','manual')),
  scheduling boolean not null default true,
  requires_review boolean not null default false,
  token_life_days int check (token_life_days is null or token_life_days between 1 and 3650),
  enabled boolean not null default true,
  builtin boolean not null default false,
  docs_url text check (docs_url is null or docs_url ~ '^https://[^[:space:]]{3,300}$'),
  -- The owner's tracker for what the platform asks outside the site.
  readiness text not null default 'not_started' check (readiness in ('not_started','preparing','submitted','approved','live')),
  readiness_note text check (readiness_note is null or char_length(readiness_note) <= 300),
  readiness_at timestamptz,
  readiness_by text,
  created_by text,
  created_at timestamptz not null default now()
);

insert into public.platforms (key, label_ar, kind, sort, accepts, publish_mode, requires_review, token_life_days, builtin, readiness, created_by) values
  ('instagram', 'إنستغرام', 'social', 1, '{"video_only": false}', 'auto', true,  60, true, 'not_started', 'installation'),
  ('x',         'X',        'social', 2, '{"video_only": false}', 'auto', false, 60, true, 'not_started', 'installation'),
  ('linkedin',  'لينكدإن',  'social', 3, '{"video_only": false}', 'auto', true,  60, true, 'not_started', 'installation'),
  ('youtube',   'يوتيوب',   'social', 4, '{"video_only": true}',  'auto', true,  60, true, 'not_started', 'installation'),
  ('mail',      'البريد',   'mail',   0, '{"video_only": false}', 'auto', false, null, true, 'live',       'installation');

alter table public.platforms enable row level security;
create policy platforms_read on public.platforms for select to authenticated
  using ((select public.is_approved()));

-- Append-only: who changed which platform, and what.
create table public.platform_events (
  id bigserial primary key,
  at timestamptz not null default now(),
  platform text not null,
  actor text,
  kind text not null check (kind in ('created','updated','enabled','disabled','readiness','deleted')),
  data jsonb not null default '{}'::jsonb
);
create index platform_events_platform_idx on public.platform_events (platform, at desc);
alter table public.platform_events enable row level security;
-- No policy: read through platform_log().

create function public.platform_events_frozen() returns trigger
language plpgsql set search_path = ''
as $$ begin raise exception 'APPEND_ONLY' using errcode = 'P0001'; end $$;
create trigger platform_events_frozen before update or delete on public.platform_events
  for each row execute function public.platform_events_frozen();

-- ---------------------------------------------------------------------------
-- 2. The checks become references
-- ---------------------------------------------------------------------------
alter table public.platform_accounts drop constraint platform_accounts_platform_check;
alter table public.platform_accounts add constraint platform_accounts_platform_fk
  foreign key (platform) references public.platforms(key) on update restrict on delete restrict;
alter table public.work_variants drop constraint work_variants_platform_check;
alter table public.work_variants add constraint work_variants_platform_fk
  foreign key (platform) references public.platforms(key) on update restrict on delete restrict;
create index work_variants_platform_idx on public.work_variants (platform);
create index platform_accounts_platform_idx on public.platform_accounts (platform);

-- ---------------------------------------------------------------------------
-- 3. The rules read the registry
-- ---------------------------------------------------------------------------
create or replace function public.work_platform_ar(p_platform text) returns text
language sql stable security definer set search_path = ''
as $$ select coalesce((select label_ar from public.platforms where key = p_platform), p_platform) $$;

-- A platform that takes video only: a work published there needs the video type or a video file.
-- (The function keeps its name and the refusal its code, so nothing that calls it changes.)
create or replace function public.work_youtube_ok(p_type text, p_channels uuid[], p_assets uuid[]) returns boolean
language sql stable security definer set search_path = ''
as $$
  select p_type = 'video'
      or not exists (select 1 from public.platform_accounts a join public.platforms pl on pl.key = a.platform
                     where a.id = any (p_channels) and coalesce((pl.accepts->>'video_only')::boolean, false))
      or exists (select 1 from public.media_files m where m.id = any (p_assets) and m.kind = 'video')
$$;

-- The three functions that carried the list in their bodies are patched from their live
-- definitions, so nothing else in them can drift. Each replacement must match exactly once.
do $patch$
declare
  d text;
  o text;
begin
  -- the order of platform copies
  d := pg_get_functiondef('public.work_parts(text)'::regprocedure);
  o := d;
  d := replace(d, $s$10 + array_position(array['instagram','x','linkedin','youtube'], v.platform)$s$,
                  $s$10 + coalesce((select pl.sort from public.platforms pl where pl.key = v.platform), 99)$s$);
  if d = o then raise exception 'PATCH_work_parts_NOT_APPLIED'; end if;
  execute d;

  -- which targets are a platform copy
  d := pg_get_functiondef('public.work_text_save(text,text,text,text)'::regprocedure);
  o := d;
  d := replace(d, $s$elsif p_target in ('instagram','x','linkedin','youtube') then$s$,
                  $s$elsif exists (select 1 from public.platforms pl where pl.key = p_target and pl.kind = 'social') then$s$);
  if d = o then raise exception 'PATCH_work_text_save_NOT_APPLIED'; end if;
  execute d;

  -- which platforms an account may be added for
  d := pg_get_functiondef('public.account_save(uuid,jsonb)'::regprocedure);
  o := d;
  d := replace(d, $s$if p->>'platform' not in ('instagram','x','linkedin','youtube') then$s$,
                  $s$if not exists (select 1 from public.platforms pl where pl.key = p->>'platform' and pl.kind = 'social' and pl.enabled) then$s$);
  if d = o then raise exception 'PATCH_account_save_NOT_APPLIED'; end if;
  execute d;
end
$patch$;

-- ---------------------------------------------------------------------------
-- 4. Managing the registry
-- ---------------------------------------------------------------------------
create function public.platform_require() returns text
language plpgsql stable security definer set search_path = ''
as $$
declare me text := public.current_email();
begin
  if me is null or not public.has_capability('platforms.manage', null) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  return me;
end
$$;

-- p: {label_ar, publish_mode, video_only, scheduling, requires_review, token_life_days, docs_url}
-- A new key makes an enabled=false row: it is not offered for accounts until it is switched on.
-- A built-in platform keeps its name and its key.
create function public.platform_save(p_key text, p jsonb) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  me text := public.platform_require(); k text := lower(btrim(coalesce(p_key, ''))); cur public.platforms;
  v_label text; v_mode text; v_url text; v_life int; v_accepts jsonb;
begin
  if k !~ '^[a-z][a-z0-9_]{0,29}$' then raise exception 'PLATFORM_KEY_INVALID' using errcode = 'P0001'; end if;
  select * into cur from public.platforms where key = k for update;
  v_label := btrim(coalesce(p->>'label_ar', ''));
  if cur.key is not null and cur.builtin then v_label := cur.label_ar; end if;
  if char_length(v_label) not between 1 and 40 then raise exception 'LABEL_REQUIRED' using errcode = 'P0001'; end if;
  v_mode := coalesce(nullif(p->>'publish_mode', ''), cur.publish_mode, 'assisted');
  if v_mode not in ('auto','assisted','manual') then raise exception 'MODE_INVALID' using errcode = 'P0001'; end if;
  v_url := nullif(btrim(coalesce(p->>'docs_url', '')), '');
  if v_url is not null and v_url !~ '^https://[^[:space:]]{3,300}$' then raise exception 'URL_INVALID' using errcode = 'P0001'; end if;
  v_life := nullif(p->>'token_life_days', '')::int;
  if v_life is not null and v_life not between 1 and 3650 then raise exception 'LIFE_INVALID' using errcode = 'P0001'; end if;
  v_accepts := coalesce(cur.accepts, '{}'::jsonb) || jsonb_build_object('video_only', coalesce((p->>'video_only')::boolean, coalesce((cur.accepts->>'video_only')::boolean, false)));

  if cur.key is null then
    insert into public.platforms (key, label_ar, kind, sort, accepts, publish_mode, scheduling, requires_review, token_life_days, enabled, docs_url, created_by)
    values (k, v_label, 'social', (select coalesce(max(sort), 4) + 1 from public.platforms), v_accepts, v_mode,
            coalesce((p->>'scheduling')::boolean, true), coalesce((p->>'requires_review')::boolean, false), v_life, false, v_url, me);
    insert into public.platform_events (platform, actor, kind, data) values (k, me, 'created', jsonb_build_object('label', v_label, 'mode', v_mode));
  else
    if cur.kind = 'mail' and (v_accepts->>'video_only')::boolean then raise exception 'PLATFORM_BUILTIN' using errcode = 'P0001'; end if;
    update public.platforms set label_ar = v_label, accepts = v_accepts, publish_mode = v_mode,
        scheduling = coalesce((p->>'scheduling')::boolean, scheduling),
        requires_review = coalesce((p->>'requires_review')::boolean, requires_review),
        token_life_days = case when p ? 'token_life_days' then v_life else token_life_days end,
        docs_url = case when p ? 'docs_url' then v_url else docs_url end
      where key = k;
    insert into public.platform_events (platform, actor, kind, data)
    values (k, me, 'updated', jsonb_strip_nulls(jsonb_build_object(
      'label', case when v_label is distinct from cur.label_ar then v_label end,
      'mode', case when v_mode is distinct from cur.publish_mode then v_mode end,
      'video_only', case when (v_accepts->>'video_only') is distinct from (cur.accepts->>'video_only') then (v_accepts->>'video_only')::boolean end)));
  end if;
  return k;
end
$$;

create function public.platform_set_enabled(p_key text, p_on boolean) returns void
language plpgsql security definer set search_path = ''
as $$
declare me text := public.platform_require(); cur public.platforms;
begin
  select * into cur from public.platforms where key = p_key for update;
  if not found then raise exception 'UNKNOWN_PLATFORM' using errcode = 'P0001'; end if;
  if cur.kind = 'mail' then raise exception 'PLATFORM_BUILTIN' using errcode = 'P0001'; end if;
  if not p_on and exists (select 1 from public.platform_accounts a where a.platform = p_key and a.active) then
    raise exception 'PLATFORM_IN_USE' using errcode = 'P0001';
  end if;
  if cur.enabled is distinct from p_on then
    update public.platforms set enabled = p_on where key = p_key;
    insert into public.platform_events (platform, actor, kind) values (p_key, me, case when p_on then 'enabled' else 'disabled' end);
  end if;
end
$$;

create function public.platform_set_readiness(p_key text, p_state text, p_note text default null) returns void
language plpgsql security definer set search_path = ''
as $$
declare me text := public.platform_require(); cur public.platforms; v_note text := nullif(left(btrim(coalesce(p_note, '')), 300), '');
begin
  if p_state not in ('not_started','preparing','submitted','approved','live') then raise exception 'READINESS_INVALID' using errcode = 'P0001'; end if;
  select * into cur from public.platforms where key = p_key for update;
  if not found then raise exception 'UNKNOWN_PLATFORM' using errcode = 'P0001'; end if;
  if cur.readiness = p_state and cur.readiness_note is not distinct from v_note then return; end if;
  update public.platforms set readiness = p_state, readiness_note = v_note, readiness_at = now(), readiness_by = me where key = p_key;
  insert into public.platform_events (platform, actor, kind, data)
  values (p_key, me, 'readiness', jsonb_build_object('from', cur.readiness, 'to', p_state, 'note', v_note));
end
$$;

-- What removing this platform would touch, for the confirmation dialog.
create function public.platform_impact(p_key text) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not (public.has_capability('platforms.manage', null) or public.has_capability('settings.view', null)) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  return jsonb_build_object(
    'accounts', (select count(*) from public.platform_accounts a where a.platform = p_key),
    'active_accounts', (select count(*) from public.platform_accounts a where a.platform = p_key and a.active),
    'open_works', (select count(*) from public.works w where w.closed_at is null
                    and exists (select 1 from public.platform_accounts a where a.id = any (w.channels) and a.platform = p_key)),
    'copies', (select count(*) from public.work_variants v where v.platform = p_key));
end
$$;

-- Only a platform nothing has ever used: no account (even a disabled one) and no copy. The
-- built-in ones stay. What was written about it stays in the log.
create function public.platform_delete(p_key text) returns void
language plpgsql security definer set search_path = ''
as $$
declare me text := public.platform_require(); cur public.platforms;
begin
  select * into cur from public.platforms where key = p_key for update;
  if not found then raise exception 'UNKNOWN_PLATFORM' using errcode = 'P0001'; end if;
  if cur.builtin then raise exception 'PLATFORM_BUILTIN' using errcode = 'P0001'; end if;
  if exists (select 1 from public.platform_accounts a where a.platform = p_key)
     or exists (select 1 from public.work_variants v where v.platform = p_key) then
    raise exception 'PLATFORM_IN_USE' using errcode = 'P0001';
  end if;
  delete from public.platforms where key = p_key;
  insert into public.platform_events (platform, actor, kind, data) values (p_key, me, 'deleted', jsonb_build_object('label', cur.label_ar));
end
$$;

create function public.platform_log(p_key text, p_limit int default 50) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not (public.has_capability('platforms.manage', null) or public.has_capability('settings.view', null)) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', e.id, 'at', e.at, 'kind', e.kind, 'actor', e.actor,
        'actor_name', case when e.actor is null then null else public.work_name(e.actor) end, 'data', e.data) order by e.at desc, e.id desc)
    from (select * from public.platform_events where platform = p_key order by at desc, id desc
          limit least(greatest(coalesce(p_limit, 50), 1), 200)) e), '[]'::jsonb);
end
$$;

-- ---------------------------------------------------------------------------
-- 5. Privileges
-- ---------------------------------------------------------------------------
revoke all on function public.platform_events_frozen(), public.platform_require() from public, anon, authenticated;
revoke all on function public.platform_save(text, jsonb), public.platform_set_enabled(text, boolean),
  public.platform_set_readiness(text, text, text), public.platform_impact(text), public.platform_delete(text),
  public.platform_log(text, int) from public, anon;
grant execute on function public.platform_save(text, jsonb), public.platform_set_enabled(text, boolean),
  public.platform_set_readiness(text, text, text), public.platform_impact(text), public.platform_delete(text),
  public.platform_log(text, int) to authenticated;
-- work_platform_ar and work_youtube_ok keep their privileges: CREATE OR REPLACE does not change them,
-- and work_youtube_ok stays internal (callable by no one through the API).

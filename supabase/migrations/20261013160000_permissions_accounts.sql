-- Permissions Step P2: the accounts page (Permissions_Plan.md, section 5).
--
-- 1. Section 5 widens «الحسابات»: it opens to anyone holding «فتح صفحة الحسابات», which
--    by default is the administrator, the director and the assistant (4.2). Step P1
--    installed the templates equal to the rules before (administrators only); this is the
--    deliberate change of section 5, logged as role-template events.
-- 2. Presets («حزم»): a saved bundle of grants with a duration, applied in one step.
-- 3. Realtime: the shell re-reads my_capabilities() when a grant about its person changes.
-- 4. Covering indexes for the capability foreign keys (performance advisor, Step P1).

create index member_capabilities_capability_idx on public.member_capabilities (capability);
create index role_capabilities_capability_idx on public.role_capabilities (capability);

-- ---------------------------------------------------------------------------
-- 1. The defaults of section 4.2 for the director and the assistant
-- ---------------------------------------------------------------------------
-- Director: view, grant, change roles, add and remove members, edit role templates.
-- Assistant: view and grant (over rank 1 only, enforced by the engine); changing roles and
-- adding or removing members stay off until granted (D-3).
with wanted(role, capability) as (values
  ('director','accounts.view'), ('director','permissions.grant'), ('director','roles.assign'),
  ('director','members.invite'), ('director','members.remove'), ('director','roles.templates.edit'),
  ('assistant','accounts.view'), ('assistant','permissions.grant')),
changed as (
  update public.role_capabilities rc set allowed = true, updated_by = 'Permissions_Plan.md 4.2', updated_at = now()
  from wanted w where rc.role = w.role and rc.capability = w.capability and not rc.allowed
  returning rc.role, rc.capability)
insert into public.permission_events (actor, subject, role, capability, kind, data)
select null, null, c.role, c.capability, 'role_default',
  jsonb_build_object('allowed', true, 'people', (select count(*) from public.accounts a where a.role = c.role),
                     'reason', 'Permissions_Plan.md, section 5: the accounts page opens to the director and the assistant')
from changed c;

-- ---------------------------------------------------------------------------
-- 2. Presets
-- ---------------------------------------------------------------------------
create table public.permission_presets (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  -- [{k: capability, mode: 'standing'|'timed'|'once', hours: 1..8784 (timed), uses: 1..20 (once)}]
  items jsonb not null check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) between 1 and 12),
  note text check (note is null or char_length(note) <= 200),
  created_by text not null,
  created_at timestamptz not null default now()
);
alter table public.permission_presets enable row level security;
create policy permission_presets_read on public.permission_presets for select to authenticated
  using ((select public.has_capability('permissions.grant')));

-- Saves a preset (a new one, or one's own; an administrator may edit any).
create function public.preset_save(p_id uuid, p_name text, p_items jsonb, p_note text default null) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare me text := public.current_email(); x jsonb; v_id uuid; c public.capabilities; owner text;
begin
  if me is null or not public.has_capability('permissions.grant') then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if char_length(btrim(coalesce(p_name, ''))) not between 1 and 80 then raise exception 'INVALID_NAME' using errcode = 'P0001'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 12 then raise exception 'BAD_PRESET' using errcode = 'P0001'; end if;
  for x in select e from jsonb_array_elements(p_items) e loop
    select * into c from public.capabilities where key = x->>'k';
    if not found then raise exception 'UNKNOWN_CAP' using errcode = 'P0001'; end if;
    if not c.grantable then raise exception 'CAP_FIXED' using errcode = 'P0001'; end if;
    if x->>'mode' not in ('standing','timed','once') then raise exception 'BAD_MODE' using errcode = 'P0001'; end if;
    if x->>'mode' = 'once' and c.scope_kind = 'page' then raise exception 'ONCE_NOT_FOR_PAGES' using errcode = 'P0001'; end if;
    if x->>'mode' = 'timed' and coalesce((x->>'hours')::int, 0) not between 1 and 8784 then raise exception 'BAD_UNTIL' using errcode = 'P0001'; end if;
    if x->>'mode' = 'once' and coalesce((x->>'uses')::int, 1) not between 1 and 20 then raise exception 'BAD_USES' using errcode = 'P0001'; end if;
  end loop;
  if p_id is null then
    insert into public.permission_presets (name, items, note, created_by)
    values (btrim(p_name), p_items, nullif(btrim(coalesce(p_note, '')), ''), me) returning id into v_id;
  else
    select created_by into owner from public.permission_presets where id = p_id for update;
    if owner is null then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
    if owner <> me and public.media_my_role() <> 'admin' then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
    update public.permission_presets set name = btrim(p_name), items = p_items, note = nullif(btrim(coalesce(p_note, '')), '') where id = p_id;
    v_id := p_id;
  end if;
  return v_id;
end
$$;

create function public.preset_delete(p_id uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare owner text;
begin
  select created_by into owner from public.permission_presets where id = p_id for update;
  if owner is null or not public.has_capability('permissions.grant')
     or (owner <> public.current_email() and public.media_my_role() <> 'admin') then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  delete from public.permission_presets where id = p_id;
end
$$;

-- Applies a preset to one person: each item through grant_capability, so every rule of
-- the engine applies; if one is refused, nothing is given. Returns how many were given.
create function public.preset_apply(p_email text, p_id uuid, p_reason text default null) returns int
language plpgsql security definer set search_path = ''
as $$
declare p public.permission_presets; x jsonb; n int := 0;
begin
  select * into p from public.permission_presets where id = p_id;
  if not found or not public.has_capability('permissions.grant') then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  for x in select e from jsonb_array_elements(p.items) e loop
    perform public.grant_capability(p_email, x->>'k', x->>'mode',
      case when x->>'mode' = 'timed' then now() + make_interval(hours => (x->>'hours')::int) end,
      case when x->>'mode' = 'once' then coalesce((x->>'uses')::int, 1) end,
      null, coalesce(nullif(btrim(coalesce(p_reason, '')), ''), '«' || p.name || '»'));
    n := n + 1;
  end loop;
  return n;
end
$$;

-- ---------------------------------------------------------------------------
-- 3. Realtime: row level security decides which changes reach which person
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.permission_events, public.member_capabilities, public.role_capabilities;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
revoke all on function public.preset_save(uuid, text, jsonb, text) from public, anon;
revoke all on function public.preset_delete(uuid) from public, anon;
revoke all on function public.preset_apply(text, uuid, text) from public, anon;
grant execute on function public.preset_save(uuid, text, jsonb, text) to authenticated;
grant execute on function public.preset_delete(uuid) to authenticated;
grant execute on function public.preset_apply(text, uuid, text) to authenticated;

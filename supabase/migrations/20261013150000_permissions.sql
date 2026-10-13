-- Permissions: role templates, standing, temporary and one-time grants, and their log
-- (Permissions_Plan.md, Step P1). Applied to the Supabase project "comms-hub".
--
-- A person's effective permission for a capability is resolved in layers, later wins:
--   1. the role template (role_capabilities), or for a page the account's own page list;
--   2. a standing override for this person: added (allow) or removed (deny);
--   3. a temporary grant, valid while expires_at > now() at the moment of use;
--   4. a one-time grant with uses left, optionally bound to one target;
--   5. fixed rules last, which only take away (rank, and «إنشاء» needs a creating role).
-- Capabilities fixed by the reference (approval, publishing, ...) are listed for the
-- person's card and never resolved from grants: their own functions decide them.
--
-- Installation changes nobody's behaviour: the role templates are seeded equal to the
-- rules of 2026-10-13, and each check moved here is answered as before for every role.
-- Every write is a function below; the tables have read policies only. Nothing sweeps:
-- time is checked when a capability is used, and an expiry is written to the log the
-- next time the person concerned loads a page (perm_note), dated when it happened.

-- ---------------------------------------------------------------------------
-- Ranks and names
-- ---------------------------------------------------------------------------
create function public.perm_rank(p_role text) returns int
language sql immutable set search_path = ''
as $$ select case when p_role is null then 0 when p_role = 'admin' then 4 when p_role = 'director' then 3 when p_role = 'assistant' then 2 else 1 end $$;

create function public.perm_role_ar(p_role text) returns text
language sql immutable set search_path = ''
as $$
  select case p_role
    when 'director' then 'مدير الاتصال المؤسسي' when 'assistant' then 'مساعد مدير الاتصال المؤسسي'
    when 'writer' then 'كاتب المحتوى' when 'designer' then 'المصمم' when 'producer' then 'المنتج الإعلامي'
    when 'publisher' then 'مسؤول النشر وإدارة الحسابات' when 'member' then 'عضو' when 'admin' then 'Admin' else '' end
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.capabilities (
  key text primary key check (key ~ '^[a-z][a-z0-9]*(\.[a-z0-9]+)+$'),
  grp text not null check (grp in ('pages','messaging','accounts','fixed')),
  label_ar text not null check (char_length(label_ar) between 1 and 80),
  grantable boolean not null,
  scope_kind text not null default 'none' check (scope_kind in ('none','page','room','work','folder')),
  min_rank int not null default 1 check (min_rank between 1 and 4),
  -- For a fixed capability: the roles that hold it, as the reference fixes it.
  fixed_roles text[] not null default '{}',
  -- For a fixed capability: why it cannot be granted, in words.
  why_ar text check (why_ar is null or char_length(why_ar) <= 200),
  sort int not null,
  check (grantable or why_ar is not null)
);

create table public.role_capabilities (
  role text not null check (role in ('director','assistant','writer','designer','producer','publisher','member','admin')),
  capability text not null references public.capabilities(key) on delete cascade,
  allowed boolean not null,
  updated_by text,
  updated_at timestamptz not null default now(),
  primary key (role, capability)
);

create table public.member_capabilities (
  id uuid primary key default gen_random_uuid(),
  email text not null references public.accounts(email) on delete cascade on update cascade,
  capability text not null references public.capabilities(key),
  effect text not null default 'allow' check (effect in ('allow','deny')),
  mode text not null check (mode in ('standing','timed','once')),
  expires_at timestamptz,
  uses_left int check (uses_left is null or uses_left >= 0),
  uses_total int check (uses_total is null or uses_total between 1 and 20),
  scope jsonb check (scope is null or jsonb_typeof(scope) = 'object'),
  reason text check (reason is null or char_length(reason) <= 300),
  request_id uuid,
  granted_by text not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by text,
  expired_noted boolean not null default false,
  soon_noted boolean not null default false,
  check ((mode = 'standing' and expires_at is null and uses_left is null and scope is null)
      or (mode = 'timed' and effect = 'allow' and expires_at is not null and uses_left is null)
      or (mode = 'once' and effect = 'allow' and uses_left is not null and uses_total is not null))
);
create unique index member_capabilities_one_standing on public.member_capabilities (email, capability)
  where mode = 'standing' and revoked_at is null;
create index member_capabilities_active_idx on public.member_capabilities (email, capability) where revoked_at is null;

-- Append-only: every grant, removal, use, expiry, role change and request.
create table public.permission_events (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor text,
  subject text,
  role text,
  capability text,
  kind text not null check (kind in ('grant','revoke','override','extend','use','expired','role_default',
    'role_assign','member_add','member_remove','account_edit','request','decide','withdraw')),
  data jsonb not null default '{}'::jsonb
);
create index permission_events_subject_idx on public.permission_events (subject, at desc);
create index permission_events_at_idx on public.permission_events (at desc);

alter table public.capabilities enable row level security;
alter table public.role_capabilities enable row level security;
alter table public.member_capabilities enable row level security;
alter table public.permission_events enable row level security;

-- The only exception: the table owner may remove events about throwaway test accounts
-- (@t.test, a domain that cannot exist), left by a rule run that had to commit.
create function public.permission_events_frozen() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and current_user = 'postgres' and old.subject like '%@t.test' then return old; end if;
  raise exception 'APPEND_ONLY' using errcode = 'P0001';
end
$$;
create trigger permission_events_frozen before update or delete on public.permission_events
  for each row execute function public.permission_events_frozen();

-- ---------------------------------------------------------------------------
-- The catalog (mirrored by src/lib/permissions.ts; tests/permissions.test.mjs keeps them equal)
-- ---------------------------------------------------------------------------
insert into public.capabilities (key, grp, label_ar, grantable, scope_kind, min_rank, fixed_roles, why_ar, sort) values
  ('page.work',        'pages', 'صفحة «العمل»',              true, 'page', 1, '{}', null, 10),
  ('page.create',      'pages', 'صفحة «إنشاء»',              true, 'page', 1, '{}', null, 11),
  ('page.approvals',   'pages', 'صفحة «الموافقات والنشر»',    true, 'page', 1, '{}', null, 12),
  ('page.calendar',    'pages', 'صفحة «التقويم»',             true, 'page', 1, '{}', null, 13),
  ('page.media',       'pages', 'صفحة «مكتبة الوسائط»',       true, 'page', 1, '{}', null, 14),
  ('page.tasks',       'pages', 'صفحة «المهام»',              true, 'page', 1, '{}', null, 15),
  ('page.activity',    'pages', 'صفحة «سجل النشاط»',          true, 'page', 1, '{}', null, 16),
  ('page.motion',      'pages', 'صفحة «استوديو الحركة»',      true, 'page', 1, '{}', null, 17),
  ('page.mail',        'pages', 'صفحة «البريد»',              true, 'page', 1, '{}', null, 18),
  ('page.ideas',       'pages', 'صفحة «الأفكار»',             true, 'page', 1, '{}', null, 19),
  ('page.analytics',   'pages', 'صفحة «التحليلات»',           true, 'page', 1, '{}', null, 20),
  ('page.monitoring',  'pages', 'صفحة «المراقبة»',            true, 'page', 1, '{}', null, 21),
  ('page.settings',    'pages', 'صفحة «الإعدادات»',           true, 'page', 1, '{}', null, 22),
  ('urgency.2',        'messaging', 'رسائل «مهم» (المستوى 2)',            true, 'none', 1, '{}', null, 30),
  ('urgency.3',        'messaging', 'رسائل «عاجل» (المستوى 3)',           false, 'none', 2, '{admin,director,assistant}',
     'المستوى الأعلى لمدير الاتصال ومساعده ومسؤول النظام فقط، حتى يبقى العاجل نادراً.', 31),
  ('whatsapp.push',    'messaging', 'إرسال رسالة إلى واتساب زميل',         true, 'room', 1, '{}', null, 32),
  ('mail.outside.send','messaging', 'بريد خارجي دون انتظار الاعتماد',      true, 'none', 1, '{}', null, 33),
  ('room.create',      'messaging', 'إنشاء قناة إعلانات في المراسلة',      true, 'none', 1, '{}', null, 34),
  ('accounts.view',    'accounts', 'فتح صفحة «الحسابات»',                  true, 'none', 1, '{}', null, 40),
  ('permissions.grant','accounts', 'منح الصلاحيات وسحبها',                 true, 'none', 2, '{}', null, 41),
  ('roles.assign',     'accounts', 'تغيير دور عضو',                         true, 'none', 2, '{}', null, 42),
  ('members.invite',   'accounts', 'إضافة الأعضاء وقبول طلبات الوصول',      true, 'none', 2, '{}', null, 43),
  ('members.remove',   'accounts', 'إزالة عضو',                             true, 'none', 2, '{}', null, 44),
  ('roles.templates.edit','accounts', 'تعديل صلاحيات الأدوار',             true, 'none', 2, '{}', null, 45),
  ('whatsapp.system.manage','accounts', 'إدارة رقم واتساب النظام',          true, 'none', 2, '{}', null, 46),
  ('work.approve',     'fixed', 'اعتماد جزء من عمل أو رفضه',            false, 'none', 2, '{admin,director,assistant}',
     'الاعتماد لمدير الاتصال ومساعده كما قرر المالك، وتفويضه ميزة لاحقة لها ضوابطها.', 60),
  ('work.publish',     'fixed', 'النشر والجدولة',                        false, 'none', 1, '{admin,publisher}',
     'النشر لمسؤول النشر وإدارة الحسابات، والاعتماد لا ينشر أبداً.', 61),
  ('media.approve',    'fixed', 'اعتماد إصدار ملف في المكتبة',           false, 'none', 2, '{admin,director,assistant}',
     'اعتماد الإصدار يقفله في كل عمل يدخل فيه، فهو لمراجعي المحتوى.', 62),
  ('approve.own',      'fixed', 'اعتماد ما أرسلته أو رفعته بنفسك',       false, 'none', 4, '{}',
     'لا يعتمد أحد ما أرسله أو رفعه، فصلاً بين من يصنع ومن يعتمد.', 63),
  ('role.switch',      'fixed', 'عرض النظام بصفة دور آخر',               false, 'none', 4, '{admin}',
     'لمسؤول النظام فقط، لاختبار الأدوار.', 64),
  ('account.protected','fixed', 'إزالة حساب مؤسس أو تغيير دوره',         false, 'none', 4, '{}',
     'حسابات المؤسسين محمية ولا تتغير من التطبيق.', 65);

-- Role templates equal to the rules of 2026-10-13. Pages are not in the templates:
-- a page is the account's own list (accounts.pages), as before.
insert into public.role_capabilities (role, capability, allowed, updated_by)
select r, c.key,
  case
    when c.key = 'whatsapp.push' then false                                   -- D-13: off until granted
    when r = 'admin' then true                                                -- the system authority
    when c.key in ('urgency.2','mail.outside.send','room.create') then r in ('director','assistant')
    else false
  end, 'seed'
from unnest(array['admin','director','assistant','writer','designer','producer','publisher','member']) r
cross join public.capabilities c
where c.grantable and c.scope_kind <> 'page';

-- ---------------------------------------------------------------------------
-- Resolution
-- ---------------------------------------------------------------------------
-- Does a grant's target fit the target of the action? A grant without a target fits any.
create function public.perm_scope_fits(p_grant jsonb, p_want jsonb) returns boolean
language sql immutable set search_path = ''
as $$ select p_grant is null or (p_want is not null and p_grant <@ p_want) $$;

-- The resolved permission of one person for one capability, with where it comes from:
-- {ok, src: role|page|added|removed|timed|once|fixed|rank|none, until, uses, id}.
create function public.perm_eval(p_email text, p_cap text, p_scope jsonb) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  r text; pages text[]; c public.capabilities; ok boolean; src text; v_until timestamptz := null;
  v_uses int := null; v_id uuid := null; g public.member_capabilities;
begin
  select a.role, a.pages into r, pages from public.accounts a where a.email = p_email;
  if r is null then return jsonb_build_object('ok', false, 'src', 'none'); end if;
  select * into c from public.capabilities where key = p_cap;
  if not found then return jsonb_build_object('ok', false, 'src', 'none'); end if;
  if not c.grantable then
    return jsonb_build_object('ok', r = any (c.fixed_roles), 'src', 'fixed');
  end if;

  -- 1. the role template, or the account's own page list
  if c.scope_kind = 'page' then
    ok := r = 'admin' or substr(p_cap, 6) = any (pages);
    src := case when ok then 'page' else 'none' end;
  else
    ok := coalesce((select rc.allowed from public.role_capabilities rc where rc.role = r and rc.capability = p_cap), false);
    src := case when ok then 'role' else 'none' end;
  end if;

  -- 2. a standing override for this person
  select * into g from public.member_capabilities m
    where m.email = p_email and m.capability = p_cap and m.mode = 'standing' and m.revoked_at is null;
  if found then
    ok := g.effect = 'allow';
    src := case when ok then 'added' else 'removed' end;
    v_id := g.id;
  end if;

  -- 3. a temporary grant, valid now
  select * into g from public.member_capabilities m
    where m.email = p_email and m.capability = p_cap and m.mode = 'timed' and m.revoked_at is null and m.expires_at > now()
    order by m.expires_at desc limit 1;
  if found and not ok then
    ok := true; src := 'timed'; v_until := g.expires_at; v_id := g.id;
  end if;

  -- 4. a one-time grant with uses left, for this target
  if not ok then
    select * into g from public.member_capabilities m
      where m.email = p_email and m.capability = p_cap and m.mode = 'once' and m.revoked_at is null
        and m.uses_left > 0 and (m.expires_at is null or m.expires_at > now())
        and public.perm_scope_fits(m.scope, p_scope)
      order by m.expires_at nulls last, m.created_at limit 1;
    if found then
      ok := true; src := 'once'; v_until := g.expires_at; v_uses := g.uses_left; v_id := g.id;
    end if;
  end if;

  -- 5. fixed rules, which only take away
  if ok and public.perm_rank(r) < c.min_rank then ok := false; src := 'rank'; end if;
  if ok and p_cap = 'page.create' and r not in ('admin','director','assistant','writer','designer','producer') then
    ok := false; src := 'fixed';
  end if;
  return jsonb_build_object('ok', ok, 'src', src, 'until', v_until, 'uses', v_uses, 'id', v_id);
end
$$;

-- May the signed-in person do this? Read only: safe in row level security.
create function public.has_capability(p_cap text, p_scope jsonb default null) returns boolean
language sql stable security definer set search_path = ''
as $$ select coalesce((public.perm_eval(public.current_email(), p_cap, p_scope)->>'ok')::boolean, false) $$;

-- As has_capability, and uses up one use of a one-time grant when that is what allows it.
-- Called inside the function that performs the action, so the use and the action share
-- one transaction. Two simultaneous calls cannot both use the last use: the update waits
-- for the other's row lock and then finds no use left.
create function public.use_capability(p_cap text, p_scope jsonb default null) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare me text := public.current_email(); e jsonb; left_now int; tries int := 0;
begin
  loop
    e := public.perm_eval(me, p_cap, p_scope);
    if not (e->>'ok')::boolean then return false; end if;
    if e->>'src' <> 'once' then return true; end if;
    update public.member_capabilities set uses_left = uses_left - 1
      where id = (e->>'id')::uuid and uses_left > 0 and revoked_at is null
      returning uses_left into left_now;
    if found then
      insert into public.permission_events (actor, subject, capability, kind, data)
      values (me, me, p_cap, 'use', jsonb_build_object('grant', e->>'id', 'left', left_now, 'scope', p_scope));
      return true;
    end if;
    tries := tries + 1;
    if tries >= 5 then return false; end if;
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- Who may manage whom (Permissions_Plan.md 4.2)
-- ---------------------------------------------------------------------------
-- An administrator manages everyone but themselves; anyone else only people of a lower
-- rank. Managing someone's permissions needs «منح الصلاحيات وسحبها».
create function public.perm_can_manage(p_target text) returns boolean
language plpgsql stable security definer set search_path = ''
as $$
declare me text := public.current_email(); mr text; tr text;
begin
  if me is null or p_target is null or me = p_target then return false; end if;
  select role into mr from public.accounts where email = me;
  select role into tr from public.accounts where email = p_target;
  if mr is null or tr is null or not public.has_capability('permissions.grant') then return false; end if;
  return mr = 'admin' or public.perm_rank(mr) > public.perm_rank(tr);
end
$$;

-- The same rule, raising the reason; returns the target's role. p_cap is what the
-- action needs (permissions.grant, roles.assign, members.remove, ...).
create function public.perm_require(p_target text, p_cap text) returns text
language plpgsql stable security definer set search_path = ''
as $$
declare me text := public.current_email(); mr text; tr text;
begin
  select role into mr from public.accounts where email = me;
  if me is null or mr is null then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  select role into tr from public.accounts where email = p_target;
  if tr is null then raise exception 'UNKNOWN_ACCOUNT' using errcode = 'P0001'; end if;
  if me = p_target then raise exception 'SELF_EDIT' using errcode = 'P0001'; end if;
  if not public.has_capability(p_cap) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if mr <> 'admin' and public.perm_rank(mr) <= public.perm_rank(tr) then
    raise exception 'NOT_MANAGEABLE' using errcode = 'P0001';
  end if;
  return tr;
end
$$;

-- May the signed-in person give this role? Never 'admin'; below their own rank unless they
-- are an administrator; an assistant only roles of rank 1 (D-11).
create function public.perm_role_ok(p_role text) returns void
language plpgsql stable security definer set search_path = ''
as $$
declare mr text := public.media_my_role();
begin
  if p_role = 'admin' then raise exception 'ADMIN_NOT_ASSIGNABLE' using errcode = 'P0001'; end if;
  if p_role is null or p_role not in ('director','assistant','writer','designer','producer','publisher','member') then
    raise exception 'UNKNOWN_ROLE' using errcode = 'P0001';
  end if;
  if mr <> 'admin' and public.perm_rank(p_role) >= public.perm_rank(mr) then
    raise exception 'ROLE_ABOVE' using errcode = 'P0001';
  end if;
end
$$;

-- Pages someone may give: only pages they hold themselves, unless they are an administrator.
create function public.perm_pages_ok(p_pages text[]) returns text[]
language plpgsql stable security definer set search_path = ''
as $$
declare me text := public.current_email(); p text; clean text[] := '{}';
begin
  foreach p in array coalesce(p_pages, '{}') loop
    if p not in ('work','create','approvals','calendar','media','tasks','activity','motion','mail','ideas','analytics','monitoring','settings') then
      continue;
    end if;
    if public.media_my_role() <> 'admin' and not public.has_capability('page.' || p) then
      raise exception 'NOT_HELD' using errcode = 'P0001';
    end if;
    if not p = any (clean) then clean := clean || p; end if;
  end loop;
  return clean;
end
$$;

create function public.perm_label(p_cap text) returns text
language sql stable security definer set search_path = ''
as $$ select coalesce((select label_ar from public.capabilities where key = p_cap), p_cap) $$;

create function public.perm_stamp(p_at timestamptz) returns text
language sql stable set search_path = ''
as $$ select to_char(p_at at time zone 'Asia/Riyadh', 'YYYY-MM-DD HH24:MI') $$;

create function public.perm_log(p_subject text, p_role text, p_cap text, p_kind text, p_data jsonb) returns void
language sql security definer set search_path = ''
as $$
  insert into public.permission_events (actor, subject, role, capability, kind, data)
  values (public.current_email(), p_subject, p_role, p_cap, p_kind, coalesce(p_data, '{}'::jsonb))
$$;

-- ---------------------------------------------------------------------------
-- Giving and taking
-- ---------------------------------------------------------------------------
-- A temporary or one-time grant, or a standing addition. Pages: standing goes into the
-- account's page list, temporary into a grant row; a page cannot be given once.
create function public.grant_capability(p_email text, p_cap text, p_mode text, p_until timestamptz,
  p_uses int, p_scope jsonb, p_reason text, p_request uuid default null) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  me text := public.current_email(); tr text; c public.capabilities; v_id uuid; v_scope jsonb := null;
  v_uses int := null; v_until timestamptz := p_until; msg text;
begin
  tr := public.perm_require(p_email, 'permissions.grant');
  select * into c from public.capabilities where key = p_cap;
  if not found then raise exception 'UNKNOWN_CAP' using errcode = 'P0001'; end if;
  if not c.grantable then raise exception 'CAP_FIXED' using errcode = 'P0001'; end if;
  if public.perm_rank(tr) < c.min_rank then raise exception 'CAP_RANK' using errcode = 'P0001'; end if;
  if p_cap = 'page.create' and tr not in ('director','assistant','writer','designer','producer') then
    raise exception 'PAGE_NEEDS_CREATE' using errcode = 'P0001';
  end if;
  if public.media_my_role() <> 'admin' and not public.has_capability(p_cap) then
    raise exception 'NOT_HELD' using errcode = 'P0001';
  end if;
  if p_mode not in ('standing','timed','once') then raise exception 'BAD_MODE' using errcode = 'P0001'; end if;
  if p_mode = 'once' and c.scope_kind = 'page' then raise exception 'ONCE_NOT_FOR_PAGES' using errcode = 'P0001'; end if;
  if p_mode = 'timed' and (v_until is null or v_until <= now() or v_until > now() + interval '366 days') then
    raise exception 'BAD_UNTIL' using errcode = 'P0001';
  end if;
  if p_mode = 'once' then
    v_uses := coalesce(p_uses, 1);
    if v_uses not between 1 and 20 then raise exception 'BAD_USES' using errcode = 'P0001'; end if;
    if v_until is not null and (v_until <= now() or v_until > now() + interval '366 days') then
      raise exception 'BAD_UNTIL' using errcode = 'P0001';
    end if;
    if p_scope is not null and p_scope <> '{}'::jsonb then
      if c.scope_kind = 'room' and (p_scope ?| array['room']) and (p_scope->>'room') ~ '^[0-9a-f-]{36}$' then
        v_scope := jsonb_build_object('room', p_scope->>'room');
      elsif c.scope_kind = 'work' and (p_scope->>'work') ~ '^CH-[0-9]{1,6}$' then
        v_scope := jsonb_build_object('work', p_scope->>'work');
      elsif c.scope_kind = 'folder' and (p_scope->>'folder') ~ '^[0-9a-f-]{36}$' then
        v_scope := jsonb_build_object('folder', p_scope->>'folder');
      else
        raise exception 'BAD_SCOPE' using errcode = 'P0001';
      end if;
    end if;
  elsif p_mode <> 'timed' then
    v_until := null;
  end if;

  if p_mode = 'standing' and c.scope_kind = 'page' then
    update public.accounts set pages = (select array_agg(distinct x) from unnest(pages || substr(p_cap, 6)) x)
      where email = p_email and not substr(p_cap, 6) = any (pages);
    v_id := null;
  elsif p_mode = 'standing' then
    update public.member_capabilities set revoked_at = now(), revoked_by = me
      where email = p_email and capability = p_cap and mode = 'standing' and revoked_at is null;
    insert into public.member_capabilities (email, capability, effect, mode, reason, request_id, granted_by)
    values (p_email, p_cap, 'allow', 'standing', nullif(left(btrim(coalesce(p_reason, '')), 300), ''), p_request, me)
    returning id into v_id;
  else
    insert into public.member_capabilities (email, capability, effect, mode, expires_at, uses_left, uses_total, scope, reason, request_id, granted_by)
    values (p_email, p_cap, 'allow', p_mode, v_until, v_uses, v_uses, v_scope,
            nullif(left(btrim(coalesce(p_reason, '')), 300), ''), p_request, me)
    returning id into v_id;
  end if;

  perform public.perm_log(p_email, null, p_cap, 'grant', jsonb_build_object('mode', p_mode, 'until', v_until,
    'uses', v_uses, 'scope', v_scope, 'reason', nullif(btrim(coalesce(p_reason, '')), ''), 'grant', v_id, 'request', p_request));
  msg := 'منحك ' || public.work_name(me) || ' صلاحية «' || c.label_ar || '»'
    || case p_mode when 'timed' then ' حتى ' || public.perm_stamp(v_until)
                   when 'once' then case when v_uses = 1 then ' لمرة واحدة' else ' لـ' || v_uses || ' مرات' end
                   else '' end || '.';
  perform public.work_notify(p_email, 'info', msg, jsonb_build_object('page', 'profile'));
  return v_id;
end
$$;

-- A standing override: 'allow' adds, 'deny' removes for this person, null clears it back to
-- the role. For a page, allow and deny change the account's page list.
create function public.set_member_override(p_email text, p_cap text, p_effect text, p_reason text default null) returns void
language plpgsql security definer set search_path = ''
as $$
declare me text := public.current_email(); tr text; c public.capabilities;
begin
  tr := public.perm_require(p_email, 'permissions.grant');
  select * into c from public.capabilities where key = p_cap;
  if not found then raise exception 'UNKNOWN_CAP' using errcode = 'P0001'; end if;
  if not c.grantable then raise exception 'CAP_FIXED' using errcode = 'P0001'; end if;
  if p_effect is not null and p_effect not in ('allow','deny') then raise exception 'BAD_MODE' using errcode = 'P0001'; end if;
  if p_effect = 'allow' then
    perform public.grant_capability(p_email, p_cap, 'standing', null, null, null, p_reason);
    return;
  end if;
  if c.scope_kind = 'page' then
    if p_effect = 'deny' then
      update public.accounts set pages = array_remove(pages, substr(p_cap, 6)) where email = p_email;
    end if;
  else
    update public.member_capabilities set revoked_at = now(), revoked_by = me
      where email = p_email and capability = p_cap and mode = 'standing' and revoked_at is null;
    if p_effect = 'deny' then
      insert into public.member_capabilities (email, capability, effect, mode, reason, granted_by)
      values (p_email, p_cap, 'deny', 'standing', nullif(left(btrim(coalesce(p_reason, '')), 300), ''), me);
    end if;
  end if;
  perform public.perm_log(p_email, null, p_cap, 'override', jsonb_build_object('effect', p_effect,
    'reason', nullif(btrim(coalesce(p_reason, '')), '')));
  if p_effect = 'deny' then
    perform public.work_notify(p_email, 'info', 'سحب ' || public.work_name(me) || ' منك صلاحية «' || c.label_ar || '».',
      jsonb_build_object('page', 'profile'));
  end if;
end
$$;

-- Ends one grant now.
create function public.revoke_capability(p_id uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare me text := public.current_email(); g public.member_capabilities;
begin
  select * into g from public.member_capabilities where id = p_id for update;
  if not found or g.revoked_at is not null then raise exception 'GRANT_NOT_ACTIVE' using errcode = 'P0001'; end if;
  perform public.perm_require(g.email, 'permissions.grant');
  update public.member_capabilities set revoked_at = now(), revoked_by = me where id = p_id;
  perform public.perm_log(g.email, null, g.capability, 'revoke', jsonb_build_object('grant', p_id, 'mode', g.mode, 'effect', g.effect));
  if g.effect = 'allow' then
    perform public.work_notify(g.email, 'info', 'أنهى ' || public.work_name(me) || ' صلاحيتك «' || public.perm_label(g.capability) || '».',
      jsonb_build_object('page', 'profile'));
  end if;
end
$$;

-- Ends every grant and override of a person now (the role and the page list stay).
create function public.revoke_all_capabilities(p_email text) returns int
language plpgsql security definer set search_path = ''
as $$
declare me text := public.current_email(); n int;
begin
  perform public.perm_require(p_email, 'permissions.grant');
  update public.member_capabilities set revoked_at = now(), revoked_by = me
    where email = p_email and revoked_at is null;
  get diagnostics n = row_count;
  if n > 0 then
    perform public.perm_log(p_email, null, null, 'revoke', jsonb_build_object('all', true, 'count', n));
    perform public.work_notify(p_email, 'info', 'أنهى ' || public.work_name(me) || ' كل الصلاحيات المضافة لك.', jsonb_build_object('page', 'profile'));
  end if;
  return n;
end
$$;

-- Moves the end of a temporary grant (later or sooner, still in the future).
create function public.extend_capability(p_id uuid, p_until timestamptz) returns void
language plpgsql security definer set search_path = ''
as $$
declare me text := public.current_email(); g public.member_capabilities;
begin
  select * into g from public.member_capabilities where id = p_id for update;
  if not found or g.revoked_at is not null or g.mode <> 'timed' then raise exception 'GRANT_NOT_ACTIVE' using errcode = 'P0001'; end if;
  perform public.perm_require(g.email, 'permissions.grant');
  if public.media_my_role() <> 'admin' and not public.has_capability(g.capability) then
    raise exception 'NOT_HELD' using errcode = 'P0001';
  end if;
  if p_until is null or p_until <= now() or p_until > now() + interval '366 days' then raise exception 'BAD_UNTIL' using errcode = 'P0001'; end if;
  update public.member_capabilities set expires_at = p_until, expired_noted = false, soon_noted = false where id = p_id;
  perform public.perm_log(g.email, null, g.capability, 'extend', jsonb_build_object('grant', p_id, 'from', g.expires_at, 'to', p_until));
  perform public.work_notify(g.email, 'info', 'صلاحيتك «' || public.perm_label(g.capability) || '» صارت حتى ' || public.perm_stamp(p_until) || '.',
    jsonb_build_object('page', 'profile'));
end
$$;

-- Switches one capability on or off for everyone of a role (D-1). Returns how many
-- people hold that role. An administrator's own template is not editable.
create function public.set_role_default(p_role text, p_cap text, p_allowed boolean) returns int
language plpgsql security definer set search_path = ''
as $$
declare me text := public.current_email(); mr text := public.media_my_role(); c public.capabilities; n int; was boolean;
begin
  if me is null or not public.has_capability('roles.templates.edit') then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if p_role = 'admin' or p_role not in ('director','assistant','writer','designer','producer','publisher','member') then
    raise exception 'ROLE_LOCKED' using errcode = 'P0001';
  end if;
  if mr <> 'admin' and public.perm_rank(p_role) >= public.perm_rank(mr) then raise exception 'ROLE_ABOVE' using errcode = 'P0001'; end if;
  select * into c from public.capabilities where key = p_cap;
  if not found then raise exception 'UNKNOWN_CAP' using errcode = 'P0001'; end if;
  if not c.grantable or c.scope_kind = 'page' then raise exception 'CAP_FIXED' using errcode = 'P0001'; end if;
  if p_allowed and public.perm_rank(p_role) < c.min_rank then raise exception 'CAP_RANK' using errcode = 'P0001'; end if;
  if p_allowed and mr <> 'admin' and not public.has_capability(p_cap) then raise exception 'NOT_HELD' using errcode = 'P0001'; end if;
  select allowed into was from public.role_capabilities where role = p_role and capability = p_cap;
  insert into public.role_capabilities (role, capability, allowed, updated_by, updated_at)
  values (p_role, p_cap, coalesce(p_allowed, false), me, now())
  on conflict (role, capability) do update set allowed = excluded.allowed, updated_by = me, updated_at = now();
  select count(*) into n from public.accounts where role = p_role;
  if was is distinct from coalesce(p_allowed, false) then
    perform public.perm_log(null, p_role, p_cap, 'role_default', jsonb_build_object('allowed', coalesce(p_allowed, false), 'people', n));
  end if;
  return n;
end
$$;

-- ---------------------------------------------------------------------------
-- Members: role, name and pages, add, remove (formerly administrators only)
-- ---------------------------------------------------------------------------
create function public.assign_role(p_email text, p_role text, p_pages text[] default null) returns void
language plpgsql security definer set search_path = ''
as $$
declare me text := public.current_email(); tr text; acc public.accounts;
begin
  tr := public.perm_require(p_email, 'roles.assign');
  select * into acc from public.accounts where email = p_email;
  if acc.protected then raise exception 'PROTECTED_ACCOUNT' using errcode = 'P0001'; end if;
  perform public.perm_role_ok(p_role);
  if p_pages is not null and not public.has_capability('permissions.grant') then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  update public.accounts set role = p_role,
      pages = case when p_pages is null then pages else public.perm_pages_ok(p_pages) end
    where email = p_email;
  if tr is distinct from p_role then
    perform public.perm_log(p_email, p_role, null, 'role_assign', jsonb_build_object('from', tr, 'to', p_role));
    perform public.work_notify(p_email, 'info', 'غيّر ' || public.work_name(me) || ' دورك إلى «' || public.perm_role_ar(p_role) || '».',
      jsonb_build_object('page', 'profile'));
  end if;
end
$$;

-- Name and page list of an account. Pages are the standing page layer: only pages the
-- editor holds may be added (an administrator holds them all).
create function public.account_update(p_email text, p_name text, p_pages text[]) returns void
language plpgsql security definer set search_path = ''
as $$
declare acc public.accounts; v_pages text[]; added text[]; removed text[];
begin
  perform public.perm_require(p_email, 'permissions.grant');
  select * into acc from public.accounts where email = p_email;
  if p_name is not null and char_length(btrim(p_name)) not between 1 and 80 then raise exception 'INVALID_NAME' using errcode = 'P0001'; end if;
  v_pages := case when p_pages is null then acc.pages else acc.pages end;
  if p_pages is not null then
    -- Pages being removed need no holding; pages being added are checked.
    added := array(select x from unnest(p_pages) x where not x = any (acc.pages));
    perform public.perm_pages_ok(added);
    v_pages := array(select x from unnest(array['work','create','approvals','calendar','media','tasks','activity','motion','mail','ideas','analytics','monitoring','settings']) x
                     where x = any (p_pages));
    removed := array(select x from unnest(acc.pages) x where not x = any (v_pages));
  end if;
  update public.accounts set display_name = coalesce(nullif(btrim(p_name), ''), display_name), pages = v_pages where email = p_email;
  if coalesce(cardinality(added), 0) + coalesce(cardinality(removed), 0) > 0 or (p_name is not null and btrim(p_name) <> acc.display_name) then
    perform public.perm_log(p_email, null, null, 'account_edit', jsonb_build_object('added', to_jsonb(added), 'removed', to_jsonb(removed),
      'name', case when p_name is not null and btrim(p_name) <> acc.display_name then btrim(p_name) end));
  end if;
end
$$;

create function public.account_remove(p_email text) returns void
language plpgsql security definer set search_path = ''
as $$
declare tr text; acc public.accounts;
begin
  tr := public.perm_require(p_email, 'members.remove');
  select * into acc from public.accounts where email = p_email;
  if acc.protected then raise exception 'PROTECTED_ACCOUNT' using errcode = 'P0001'; end if;
  delete from public.accounts where email = p_email;
  perform public.perm_log(p_email, tr, null, 'member_remove', jsonb_build_object('name', acc.display_name));
end
$$;

-- Adding and accepting: «إضافة الأعضاء وقبول طلبات الوصول», a role below the adder's
-- (any but Admin for an administrator), and only pages the adder holds.
create or replace function public.add_account(p_email text, p_name text, p_role text, p_pages text[]) returns void
language plpgsql security definer set search_path = ''
as $$
declare v_pages text[];
begin
  if not public.has_capability('members.invite') then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  perform public.perm_role_ok(p_role);
  v_pages := public.perm_pages_ok(p_pages);
  insert into public.accounts (email, display_name, role, pages, added_by)
  values (lower(btrim(p_email)), btrim(p_name), p_role, v_pages, public.current_email());
  update public.access_requests
    set status = 'approved', decided_by = public.current_email(), decided_at = now()
    where email = lower(btrim(p_email)) and status = 'pending';
  perform public.perm_log(lower(btrim(p_email)), p_role, null, 'member_add', jsonb_build_object('pages', to_jsonb(v_pages)));
end
$$;

create or replace function public.approve_request(p_id uuid, p_role text, p_pages text[]) returns void
language plpgsql security definer set search_path = ''
as $$
declare r public.access_requests; v_pages text[];
begin
  if not public.has_capability('members.invite') then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  perform public.perm_role_ok(p_role);
  v_pages := public.perm_pages_ok(p_pages);
  select * into r from public.access_requests where id = p_id and status = 'pending' for update;
  if not found then raise exception 'REQUEST_NOT_PENDING' using errcode = 'P0001'; end if;
  insert into public.accounts (email, display_name, role, pages, added_by)
  values (r.email, r.full_name, p_role, v_pages, public.current_email());
  update public.access_requests
    set status = 'approved', decided_by = public.current_email(), decided_at = now()
    where id = p_id;
  perform public.perm_log(r.email, p_role, null, 'member_add', jsonb_build_object('pages', to_jsonb(v_pages), 'access_request', p_id));
end
$$;

create or replace function public.reject_request(p_id uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.has_capability('members.invite') then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  update public.access_requests
    set status = 'rejected', decided_by = public.current_email(), decided_at = now()
    where id = p_id and status = 'pending';
end
$$;

-- is_admin() keeps its meaning (the account's role is admin) for the places that ask
-- exactly that: mail settings, the role switch.

-- ---------------------------------------------------------------------------
-- Reading
-- ---------------------------------------------------------------------------
-- Writes to the log the grants of a person that ended since they were last looked at
-- (dated when they ended), and tells the person once about a temporary grant that ends
-- within 24 hours. Runs when the person loads a page: there is no sweep job.
create function public.perm_note(p_email text) returns void
language plpgsql security definer set search_path = ''
as $$
declare g public.member_capabilities;
begin
  for g in select * from public.member_capabilities
    where email = p_email and revoked_at is null and not expired_noted and mode in ('timed','once')
      and (expires_at <= now() or (mode = 'once' and uses_left = 0))
    for update skip locked
  loop
    update public.member_capabilities set expired_noted = true where id = g.id;
    insert into public.permission_events (at, actor, subject, capability, kind, data)
    values (case when g.expires_at <= now() then g.expires_at else now() end, null, p_email, g.capability, 'expired',
            jsonb_build_object('grant', g.id, 'mode', g.mode, 'used_up', g.mode = 'once' and g.uses_left = 0));
  end loop;
  for g in select * from public.member_capabilities
    where email = p_email and revoked_at is null and not soon_noted and mode = 'timed'
      and expires_at > now() and expires_at <= now() + interval '24 hours'
    for update skip locked
  loop
    update public.member_capabilities set soon_noted = true where id = g.id;
    insert into public.notifications (recipient, tier, body, go)
    values (p_email, 'attention', 'تنتهي صلاحيتك «' || public.perm_label(g.capability) || '» المؤقتة في ' || public.perm_stamp(g.expires_at) || '.',
            jsonb_build_object('page', 'profile'));
  end loop;
end
$$;

-- The signed-in person's effective permissions, each with its source and end, and their
-- active grants. Read by the shell once per page and after a Realtime ping.
create function public.my_capabilities() returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare me text := public.current_email(); r text;
begin
  select role into r from public.accounts where email = me;
  if r is null then return null; end if;
  perform public.perm_note(me);
  return jsonb_build_object(
    'role', r,
    'caps', (select coalesce(jsonb_agg(public.perm_eval(me, c.key, null) || jsonb_build_object('k', c.key) order by c.sort), '[]'::jsonb)
             from public.capabilities c),
    'grants', (select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'k', m.capability, 'mode', m.mode, 'effect', m.effect,
                 'until', m.expires_at, 'uses', m.uses_left, 'total', m.uses_total, 'scope', m.scope, 'by', m.granted_by,
                 'at', m.created_at, 'reason', m.reason) order by m.created_at), '[]'::jsonb)
               from public.member_capabilities m
               where m.email = me and m.revoked_at is null
                 and (m.mode = 'standing' or (m.expires_at is null or m.expires_at > now()))
                 and (m.mode <> 'once' or m.uses_left > 0)));
end
$$;

-- A person's card: their resolved permissions with sources, their active grants and their
-- folder levels. For the person themselves, or someone who may manage them.
create function public.perm_card(p_email text) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare me text := public.current_email(); acc public.accounts;
begin
  select * into acc from public.accounts where email = p_email;
  if not found then raise exception 'UNKNOWN_ACCOUNT' using errcode = 'P0001'; end if;
  if me is distinct from p_email and not public.perm_can_manage(p_email) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  return jsonb_build_object(
    'email', acc.email, 'name', acc.display_name, 'role', acc.role, 'pages', to_jsonb(acc.pages), 'protected', acc.protected,
    'last_seen', acc.last_seen_at,
    'caps', (select coalesce(jsonb_agg(public.perm_eval(p_email, c.key, null) || jsonb_build_object('k', c.key) order by c.sort), '[]'::jsonb)
             from public.capabilities c),
    'grants', (select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'k', m.capability, 'mode', m.mode, 'effect', m.effect,
                 'until', m.expires_at, 'uses', m.uses_left, 'total', m.uses_total, 'scope', m.scope, 'by', m.granted_by,
                 'at', m.created_at, 'reason', m.reason) order by m.created_at), '[]'::jsonb)
               from public.member_capabilities m
               where m.email = p_email and m.revoked_at is null
                 and (m.mode = 'standing' or (m.expires_at is null or m.expires_at > now()))
                 and (m.mode <> 'once' or m.uses_left > 0)),
    'folders', (select coalesce(jsonb_agg(jsonb_build_object('folder', g.folder_id, 'name', f.name, 'level', g.level) order by f.name), '[]'::jsonb)
                from public.media_grants g left join public.media_folders f on f.id = g.folder_id
                where g.subject_type = 'person' and g.subject = p_email));
end
$$;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
create policy capabilities_read on public.capabilities for select to authenticated using ((select public.is_approved()));
create policy role_capabilities_read on public.role_capabilities for select to authenticated using ((select public.is_approved()));
create policy member_capabilities_read on public.member_capabilities for select to authenticated
  using (email = (select public.current_email()) or public.perm_can_manage(email));
create policy permission_events_read on public.permission_events for select to authenticated
  using (subject = (select public.current_email())
      or (subject is not null and public.perm_can_manage(subject))
      or (subject is null and (select public.has_capability('permissions.grant'))));

-- Accounts: read with «فتح صفحة الحسابات»; every write through the functions above.
drop policy accounts_read on public.accounts;
drop policy accounts_insert on public.accounts;
drop policy accounts_update on public.accounts;
drop policy accounts_delete on public.accounts;
create policy accounts_read on public.accounts for select to authenticated
  using (email = (select public.current_email()) or (select public.has_capability('accounts.view')));

drop policy requests_read on public.access_requests;
drop policy requests_update on public.access_requests;
drop policy requests_delete on public.access_requests;
create policy requests_read on public.access_requests for select to authenticated
  using ((select public.has_capability('members.invite')));

-- ---------------------------------------------------------------------------
-- Existing checks moved onto the engine, answering as before for every role
-- ---------------------------------------------------------------------------
-- Messaging: an urgent message is «عاجل», level 3 (fixed: admin, director, assistant).
-- An announcement channel needs «إنشاء قناة إعلانات» (director, assistant, admin by default).
do $$
declare src text;
begin
  src := pg_get_functiondef('public.chat_send(uuid,text,text,uuid,jsonb,boolean,boolean)'::regprocedure);
  if position('if coalesce(p_urgent, false) and not public.media_acts(array[''director'',''assistant'']) then' in src) = 0 then
    raise exception 'chat_send changed: review the permissions migration';
  end if;
  execute replace(src, 'if coalesce(p_urgent, false) and not public.media_acts(array[''director'',''assistant'']) then',
                       'if coalesce(p_urgent, false) and not public.has_capability(''urgency.3'') then');

  src := pg_get_functiondef('public.chat_create_room(text,text,text,text[],jsonb)'::regprocedure);
  if position('if p_type = ''channel'' and not public.media_acts(array[''director'',''assistant'']) then' in src) = 0 then
    raise exception 'chat_create_room changed: review the permissions migration';
  end if;
  -- A CASE, so a one-time grant is used only when a channel is created.
  execute replace(src, 'if p_type = ''channel'' and not public.media_acts(array[''director'',''assistant'']) then',
                       'if (case when p_type = ''channel'' then not public.use_capability(''room.create'') else false end) then');

  -- Mail: outside mail waits for approval unless the sender holds «بريد خارجي دون انتظار الاعتماد».
  src := pg_get_functiondef('public.mail_send(uuid,text,text[],text[],text[],text,uuid[],uuid[],jsonb,timestamptz,jsonb,boolean)'::regprocedure);
  -- A CASE, so a one-time grant is used only by mail that would otherwise be held.
  if position(E'gated := ext and not public.mail_approver()
           and (new_thread or t.assignee is distinct from me);' in src) = 0 then
    raise exception 'mail_send changed: review the permissions migration';
  end if;
  execute replace(src, E'gated := ext and not public.mail_approver()
           and (new_thread or t.assignee is distinct from me);',
    'gated := case when ext and (new_thread or t.assignee is distinct from me) then not public.use_capability(''mail.outside.send'') else false end;');
end $$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
revoke all on function public.perm_rank(text) from public, anon;
revoke all on function public.perm_role_ar(text) from public, anon;
revoke all on function public.perm_scope_fits(jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.perm_eval(text, text, jsonb) from public, anon, authenticated;
revoke all on function public.use_capability(text, jsonb) from public, anon, authenticated;
revoke all on function public.perm_require(text, text) from public, anon, authenticated;
revoke all on function public.perm_role_ok(text) from public, anon, authenticated;
revoke all on function public.perm_pages_ok(text[]) from public, anon, authenticated;
revoke all on function public.perm_label(text) from public, anon, authenticated;
revoke all on function public.perm_stamp(timestamptz) from public, anon, authenticated;
revoke all on function public.perm_log(text, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.perm_note(text) from public, anon, authenticated;
revoke all on function public.permission_events_frozen() from public, anon, authenticated;
revoke all on function public.has_capability(text, jsonb) from public, anon;
revoke all on function public.perm_can_manage(text) from public, anon;
revoke all on function public.my_capabilities() from public, anon;
revoke all on function public.perm_card(text) from public, anon;
revoke all on function public.grant_capability(text, text, text, timestamptz, int, jsonb, text, uuid) from public, anon;
revoke all on function public.set_member_override(text, text, text, text) from public, anon;
revoke all on function public.revoke_capability(uuid) from public, anon;
revoke all on function public.revoke_all_capabilities(text) from public, anon;
revoke all on function public.extend_capability(uuid, timestamptz) from public, anon;
revoke all on function public.set_role_default(text, text, boolean) from public, anon;
revoke all on function public.assign_role(text, text, text[]) from public, anon;
revoke all on function public.account_update(text, text, text[]) from public, anon;
revoke all on function public.account_remove(text) from public, anon;

grant execute on function public.perm_rank(text) to authenticated;
grant execute on function public.perm_role_ar(text) to authenticated;
grant execute on function public.has_capability(text, jsonb) to authenticated;
grant execute on function public.perm_can_manage(text) to authenticated;
grant execute on function public.my_capabilities() to authenticated;
grant execute on function public.perm_card(text) to authenticated;
grant execute on function public.grant_capability(text, text, text, timestamptz, int, jsonb, text, uuid) to authenticated;
grant execute on function public.set_member_override(text, text, text, text) to authenticated;
grant execute on function public.revoke_capability(uuid) to authenticated;
grant execute on function public.revoke_all_capabilities(text) to authenticated;
grant execute on function public.extend_capability(uuid, timestamptz) to authenticated;
grant execute on function public.set_role_default(text, text, boolean) to authenticated;
grant execute on function public.assign_role(text, text, text[]) to authenticated;
grant execute on function public.account_update(text, text, text[]) to authenticated;
grant execute on function public.account_remove(text) to authenticated;

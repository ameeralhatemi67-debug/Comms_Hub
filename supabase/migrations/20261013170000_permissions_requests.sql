-- Permissions Step P3: asking for a permission, and the connections (Permissions_Plan.md 6, 9).
--
-- One request object, four doors in: a locked control, messaging, mail and the requests
-- page all create the same permission_requests row through request_capability. A granter
-- decides with decide_permission_request: approving goes through grant_capability, so every
-- rule of the engine applies, and the granter may change the mode and length asked for.
-- Folder access stays the library's one mechanism (media_grants), now with an optional end.

-- ---------------------------------------------------------------------------
-- Requests
-- ---------------------------------------------------------------------------
create table public.permission_requests (
  id uuid primary key default gen_random_uuid(),
  requester text not null references public.accounts(email) on delete cascade on update cascade,
  capability text not null references public.capabilities(key),
  mode text not null check (mode in ('standing','timed','once')),
  hours int check (hours is null or hours between 1 and 8784),
  uses int check (uses is null or uses between 1 and 20),
  scope jsonb check (scope is null or jsonb_typeof(scope) = 'object'),
  reason text not null check (char_length(btrim(reason)) between 1 and 300),
  source text not null check (source in ('button','mail','chat','page')),
  source_ref text,
  status text not null default 'pending' check (status in ('pending','approved','declined','withdrawn')),
  created_at timestamptz not null default now(),
  decided_by text,
  decided_at timestamptz,
  decision_note text check (decision_note is null or char_length(decision_note) <= 300),
  grant_id uuid,
  check (mode <> 'timed' or hours is not null),
  check (mode <> 'once' or uses is not null)
);
-- One pending request per person per capability and target.
create unique index permission_requests_one_pending on public.permission_requests (requester, capability, coalesce(scope, '{}'::jsonb))
  where status = 'pending';
create index permission_requests_status_idx on public.permission_requests (status, created_at desc);
create index permission_requests_capability_idx on public.permission_requests (capability);
alter table public.permission_requests enable row level security;

-- May this person decide this request? Not their own; «منح الصلاحيات وسحبها»; a rank above
-- the requester (an administrator decides for anyone); and holding what is asked for.
create function public.perm_may_decide(p_email text, p_requester text, p_cap text) returns boolean
language plpgsql stable security definer set search_path = ''
as $$
declare mr text; tr text;
begin
  if p_email is null or p_email = p_requester then return false; end if;
  select role into mr from public.accounts where email = p_email;
  select role into tr from public.accounts where email = p_requester;
  if mr is null or tr is null then return false; end if;
  if not (public.perm_eval(p_email, 'permissions.grant', null)->>'ok')::boolean then return false; end if;
  if mr = 'admin' then return true; end if;
  return public.perm_rank(mr) > public.perm_rank(tr) and (public.perm_eval(p_email, p_cap, null)->>'ok')::boolean;
end
$$;

create policy permission_requests_read on public.permission_requests for select to authenticated
  using (requester = (select public.current_email()) or public.perm_can_manage(requester));

-- The requests the signed-in person may see, with whether they may decide each.
create function public.perm_requests() returns table (
  id uuid, requester text, requester_name text, requester_role text, capability text, label text, mode text, hours int, uses int, scope jsonb,
  reason text, source text, source_ref text, status text, created_at timestamptz, decided_by text, decided_at timestamptz,
  decision_note text, can_decide boolean)
language sql stable security definer set search_path = ''
as $$
  select q.id, q.requester, a.display_name, a.role, q.capability, c.label_ar, q.mode, q.hours, q.uses, q.scope, q.reason, q.source,
    q.source_ref, q.status, q.created_at, q.decided_by, q.decided_at, q.decision_note,
    q.status = 'pending' and public.perm_may_decide(public.current_email(), q.requester, q.capability)
  from public.permission_requests q
  join public.accounts a on a.email = q.requester
  join public.capabilities c on c.key = q.capability
  where q.requester = public.current_email() or public.perm_can_manage(q.requester)
  order by q.created_at desc
  limit 300
$$;

create function public.perm_how(p_mode text, p_hours int, p_uses int) returns text
language sql immutable set search_path = ''
as $$
  select case p_mode
    when 'standing' then ' دائمة'
    when 'timed' then case when p_hours % 168 = 0 then ' لمدة ' || (p_hours / 168) || ' أسبوع' when p_hours % 24 = 0 then ' لمدة ' || (p_hours / 24) || ' يوم' else ' لمدة ' || p_hours || ' ساعة' end
    when 'once' then case when coalesce(p_uses, 1) = 1 then ' لمرة واحدة' else ' لـ' || p_uses || ' مرات' end
    else '' end
$$;

-- Asks for a permission. Fixed rules cannot be asked for; nor what one already holds by role
-- or for good; nor twice at once. The people who may decide are told (tier «قرارك»).
create function public.request_capability(p_cap text, p_mode text, p_hours int, p_uses int, p_scope jsonb,
  p_reason text, p_source text, p_source_ref text default null) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare me text := public.current_email(); r text; c public.capabilities; e jsonb; v_scope jsonb := null; v_id uuid; g record;
begin
  select role into r from public.accounts where email = me;
  if me is null or r is null then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  select * into c from public.capabilities where key = p_cap;
  if not found then raise exception 'UNKNOWN_CAP' using errcode = 'P0001'; end if;
  if not c.grantable then raise exception 'CAP_FIXED' using errcode = 'P0001'; end if;
  if public.perm_rank(r) < c.min_rank then raise exception 'CAP_RANK' using errcode = 'P0001'; end if;
  if p_cap = 'page.create' and r not in ('director','assistant','writer','designer','producer') then
    raise exception 'PAGE_NEEDS_CREATE' using errcode = 'P0001';
  end if;
  if p_mode not in ('standing','timed','once') then raise exception 'BAD_MODE' using errcode = 'P0001'; end if;
  if p_mode = 'once' and c.scope_kind = 'page' then raise exception 'ONCE_NOT_FOR_PAGES' using errcode = 'P0001'; end if;
  if p_mode = 'timed' and coalesce(p_hours, 0) not between 1 and 8784 then raise exception 'BAD_UNTIL' using errcode = 'P0001'; end if;
  if p_mode = 'once' and coalesce(p_uses, 1) not between 1 and 20 then raise exception 'BAD_USES' using errcode = 'P0001'; end if;
  if p_source not in ('button','mail','chat','page') then raise exception 'BAD_SOURCE' using errcode = 'P0001'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) = 0 then raise exception 'REASON_REQUIRED' using errcode = 'P0001'; end if;
  if p_mode = 'once' and p_scope is not null and p_scope <> '{}'::jsonb then
    if c.scope_kind = 'room' and (p_scope->>'room') ~ '^[0-9a-f-]{36}$' then v_scope := jsonb_build_object('room', p_scope->>'room');
    elsif c.scope_kind = 'work' and (p_scope->>'work') ~ '^CH-[0-9]{1,6}$' then v_scope := jsonb_build_object('work', p_scope->>'work');
    elsif c.scope_kind = 'folder' and (p_scope->>'folder') ~ '^[0-9a-f-]{36}$' then v_scope := jsonb_build_object('folder', p_scope->>'folder');
    else raise exception 'BAD_SCOPE' using errcode = 'P0001';
    end if;
  end if;
  e := public.perm_eval(me, p_cap, v_scope);
  if (e->>'ok')::boolean and e->>'src' in ('role','added','page') then raise exception 'ALREADY_HELD' using errcode = 'P0001'; end if;
  if exists (select 1 from public.permission_requests q where q.requester = me and q.capability = p_cap
             and coalesce(q.scope, '{}'::jsonb) = coalesce(v_scope, '{}'::jsonb) and q.status = 'pending') then
    raise exception 'ALREADY_PENDING' using errcode = 'P0001';
  end if;
  insert into public.permission_requests (requester, capability, mode, hours, uses, scope, reason, source, source_ref)
  values (me, p_cap, p_mode, case when p_mode = 'timed' then p_hours end, case when p_mode = 'once' then coalesce(p_uses, 1) end,
          v_scope, left(btrim(p_reason), 300), p_source, left(p_source_ref, 100))
  returning id into v_id;
  perform public.perm_log(me, null, p_cap, 'request', jsonb_build_object('request', v_id, 'mode', p_mode,
    'until', null, 'hours', p_hours, 'uses', p_uses, 'scope', v_scope, 'source', p_source));
  for g in select a.email from public.accounts a where public.perm_may_decide(a.email, me, p_cap) loop
    perform public.work_notify(g.email, 'decide',
      'طلب ' || public.work_name(me) || ' صلاحية «' || c.label_ar || '»' || public.perm_how(p_mode, p_hours, p_uses) || ': «' || left(btrim(p_reason), 120) || '».',
      jsonb_build_object('page', 'requests', 'tab', 'perm'));
  end loop;
  return v_id;
end
$$;

-- The cards a request travels on (messaging and mail) follow its state.
create function public.perm_request_cards(p_id uuid, p_state text, p_by text) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  update public.chat_messages set data = data || jsonb_build_object('state', p_state, 'dby', p_by, 'dat', now())
    where kind = 'permission' and data->>'request_id' = p_id::text;
  update public.mail_messages set card = card || jsonb_build_object('state', p_state, 'dby', p_by, 'dat', now())
    where card->>'type' = 'permission' and card->>'request_id' = p_id::text;
end
$$;

-- Decides a request. Approving gives what was asked, or what the granter chose instead
-- (a person can ask for "permanent" and be given "one week"); declining needs a reason.
create function public.decide_permission_request(p_id uuid, p_approve boolean, p_mode text, p_until timestamptz,
  p_uses int, p_scope jsonb, p_note text) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare me text := public.current_email(); q public.permission_requests; gid uuid := null; v_mode text; v_until timestamptz; room uuid;
begin
  select * into q from public.permission_requests where id = p_id for update;
  if not found or q.status <> 'pending' then raise exception 'REQUEST_NOT_PENDING' using errcode = 'P0001'; end if;
  if q.requester = me then raise exception 'SELF_EDIT' using errcode = 'P0001'; end if;
  if not public.perm_may_decide(me, q.requester, q.capability) then
    perform public.perm_require(q.requester, 'permissions.grant');
    raise exception 'NOT_HELD' using errcode = 'P0001';
  end if;
  if coalesce(p_approve, false) then
    v_mode := coalesce(p_mode, q.mode);
    v_until := case when p_mode is not null then p_until when q.mode = 'timed' then now() + make_interval(hours => q.hours) end;
    gid := public.grant_capability(q.requester, q.capability, v_mode, v_until,
      case when v_mode = 'once' then coalesce(p_uses, q.uses, 1) end,
      case when v_mode = 'once' then coalesce(p_scope, q.scope) end,
      coalesce(nullif(btrim(coalesce(p_note, '')), ''), q.reason), q.id);
    update public.permission_requests set status = 'approved', decided_by = me, decided_at = now(),
        decision_note = nullif(left(btrim(coalesce(p_note, '')), 300), ''), grant_id = gid
      where id = p_id;
  else
    if char_length(btrim(coalesce(p_note, ''))) = 0 then raise exception 'NOTE_REQUIRED' using errcode = 'P0001'; end if;
    update public.permission_requests set status = 'declined', decided_by = me, decided_at = now(), decision_note = left(btrim(p_note), 300)
      where id = p_id;
    perform public.work_notify(q.requester, 'info',
      public.work_name(me) || ' لم يمنح طلبك «' || public.perm_label(q.capability) || '»: «' || left(btrim(p_note), 200) || '».',
      jsonb_build_object('page', 'requests', 'tab', 'perm'));
  end if;
  perform public.perm_log(q.requester, null, q.capability, 'decide', jsonb_build_object('request', p_id, 'approve', coalesce(p_approve, false),
    'mode', v_mode, 'until', v_until, 'uses', case when v_mode = 'once' then coalesce(p_uses, q.uses, 1) end, 'note', nullif(btrim(coalesce(p_note, '')), '')));
  perform public.perm_request_cards(p_id, case when coalesce(p_approve, false) then 'approved' else 'declined' end, me);
  -- Asked in a conversation: a line there says what was decided.
  if q.source = 'chat' and q.source_ref ~ '^[0-9a-f-]{36}$' then
    room := q.source_ref::uuid;
    if exists (select 1 from public.chat_rooms where id = room) then
      perform public.chat_sys(room, jsonb_build_object('e', 'perm', 'approve', coalesce(p_approve, false), 'who', q.requester,
        'label', public.perm_label(q.capability), 'how', case when coalesce(p_approve, false) then public.perm_how(v_mode,
          case when v_until is not null then greatest(1, ceil(extract(epoch from v_until - now()) / 3600)::int) end, coalesce(p_uses, q.uses)) end));
    end if;
  end if;
  return gid;
end
$$;

create function public.withdraw_permission_request(p_id uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare me text := public.current_email(); q public.permission_requests;
begin
  select * into q from public.permission_requests where id = p_id for update;
  if not found or q.status <> 'pending' or q.requester <> me then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  update public.permission_requests set status = 'withdrawn', decided_by = me, decided_at = now() where id = p_id;
  perform public.perm_log(me, null, q.capability, 'withdraw', jsonb_build_object('request', p_id));
  perform public.perm_request_cards(p_id, 'withdrawn', me);
end
$$;

-- ---------------------------------------------------------------------------
-- Door 2: messaging. A request card in the conversation with the chosen granter.
-- ---------------------------------------------------------------------------
alter table public.chat_messages drop constraint chat_messages_kind_check;
alter table public.chat_messages add constraint chat_messages_kind_check
  check (kind in ('text','voice','image','file','asset','work','poll','task','approval','sys','permission'));

create function public.chat_request_permission(p_to text, p_cap text, p_mode text, p_hours int, p_uses int, p_scope jsonb, p_reason text) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare me text := public.current_email(); room uuid; rid uuid; mid uuid;
begin
  if p_to is null or not public.perm_may_decide(p_to, me, p_cap) then raise exception 'NOT_A_GRANTER' using errcode = 'P0001'; end if;
  room := public.chat_open_dm(p_to);
  rid := public.request_capability(p_cap, p_mode, p_hours, p_uses, p_scope, p_reason, 'chat', room::text);
  insert into public.chat_messages (room_id, author, kind, body, data)
  values (room, me, 'permission', '', jsonb_build_object('request_id', rid, 'k', p_cap, 'label', public.perm_label(p_cap), 'mode', p_mode,
    'hours', case when p_mode = 'timed' then p_hours end, 'uses', case when p_mode = 'once' then coalesce(p_uses, 1) end,
    'reason', left(btrim(p_reason), 300), 'state', 'pending'))
  returning id into mid;
  update public.chat_rooms set last_at = now() where id = room;
  update public.chat_members set last_read_at = now() where room_id = room and email = me;
  return mid;
end
$$;

-- The people who may decide the signed-in person's request for a capability (for the
-- composer's list of granters). Names and roles only.
create function public.perm_granters(p_cap text) returns table (email text, display_name text, role text)
language sql stable security definer set search_path = ''
as $$
  select a.email, a.display_name, a.role from public.accounts a
  where public.perm_may_decide(a.email, public.current_email(), p_cap)
  order by public.perm_rank(a.role) desc, a.display_name
$$;

-- ---------------------------------------------------------------------------
-- Door 3: mail. A permission request card next to the existing ones (internal only).
-- ---------------------------------------------------------------------------
do $$
declare src text;
begin
  src := pg_get_functiondef('public.mail_send(uuid,text,text[],text[],text[],text,uuid[],uuid[],jsonb,timestamptz,jsonb,boolean)'::regprocedure);
  if position('  mid uuid; contact text; ctype text; askee text; due timestamptz;' in src) = 0
     or position('if p_send_at is not null and ctype in (''task'',''approval'',''progress'') then' in src) = 0
     or position(E'    else\n      raise exception ''BAD_CARD'' using errcode = ''P0001'';' in src) = 0
     or position(E'  returning id into mid;\n' in src) = 0 then
    raise exception 'mail_send changed: review the permissions requests migration';
  end if;
  src := replace(src, '  mid uuid; contact text; ctype text; askee text; due timestamptz;',
                      '  mid uuid; rid uuid; contact text; ctype text; askee text; due timestamptz;');
  src := replace(src, 'if p_send_at is not null and ctype in (''task'',''approval'',''progress'') then',
                      'if p_send_at is not null and ctype in (''task'',''approval'',''progress'',''permission'') then');
  src := replace(src, E'    else\n      raise exception ''BAD_CARD'' using errcode = ''P0001'';',
    E'    elsif ctype = ''permission'' then\n'
    || E'      rid := public.request_capability(p_card->>''k'', p_card->>''mode'', (p_card->>''hours'')::int, (p_card->>''uses'')::int, null, p_card->>''reason'', ''mail'', null);\n'
    || E'      card := jsonb_build_object(''type'',''permission'',''request_id'',rid,''k'',p_card->>''k'',''label'',public.perm_label(p_card->>''k''),\n'
    || E'              ''mode'',p_card->>''mode'',''hours'',(p_card->>''hours'')::int,''uses'',(p_card->>''uses'')::int,\n'
    || E'              ''reason'',left(btrim(coalesce(p_card->>''reason'','''')),300),''by'',me,''state'',''pending'');\n'
    || E'    else\n      raise exception ''BAD_CARD'' using errcode = ''P0001'';');
  src := replace(src, E'  returning id into mid;\n',
    E'  returning id into mid;\n  if ctype = ''permission'' then\n    update public.permission_requests set source_ref = mid::text where id = rid;\n  end if;\n');
  execute src;
end $$;

-- ---------------------------------------------------------------------------
-- Folder access for a time: media_grants stays the one mechanism (plan 4.3)
-- ---------------------------------------------------------------------------
alter table public.media_grants add column expires_at timestamptz;

do $$
declare src text;
begin
  -- A person's folder grant counts while it has not ended; then the role's level applies.
  src := pg_get_functiondef('public.media_level(text,uuid)'::regprocedure);
  if position('where g.folder_id = cur and g.subject_type = ''person'' and g.subject = p_email;' in src) = 0
     or position('where g.folder_id is null and g.subject_type = ''person'' and g.subject = p_email;' in src) = 0 then
    raise exception 'media_level changed: review the permissions requests migration';
  end if;
  src := replace(src, 'where g.folder_id = cur and g.subject_type = ''person'' and g.subject = p_email;',
    'where g.folder_id = cur and g.subject_type = ''person'' and g.subject = p_email and (g.expires_at is null or g.expires_at > now());');
  src := replace(src, 'where g.folder_id is null and g.subject_type = ''person'' and g.subject = p_email;',
    'where g.folder_id is null and g.subject_type = ''person'' and g.subject = p_email and (g.expires_at is null or g.expires_at > now());');
  execute src;

  -- Undo brings back a removed folder grant with its end, not as a permanent one.
  src := pg_get_functiondef('public.undo_apply(bigint,boolean)'::regprocedure);
  if position(E'insert into public.media_grants (id, folder_id, subject_type, subject, level)\n        values (s.row_id, (s.before->>''folder_id'')::uuid, s.before->>''subject_type'', s.before->>''subject'', (s.before->>''level'')::int);' in src) = 0 then
    raise exception 'undo_apply changed: review the permissions requests migration';
  end if;
  src := replace(src,
    E'insert into public.media_grants (id, folder_id, subject_type, subject, level)\n        values (s.row_id, (s.before->>''folder_id'')::uuid, s.before->>''subject_type'', s.before->>''subject'', (s.before->>''level'')::int);',
    E'insert into public.media_grants (id, folder_id, subject_type, subject, level, expires_at)\n        values (s.row_id, (s.before->>''folder_id'')::uuid, s.before->>''subject_type'', s.before->>''subject'', (s.before->>''level'')::int, (s.before->>''expires_at'')::timestamptz);');
  execute src;
end $$;

-- A folder access request decided with an end: the grant it adds lasts until then.
create function public.request_decide_folder(p_id uuid, p_approve boolean, p_note text, p_until timestamptz) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare q public.work_requests; had boolean; res jsonb;
begin
  select * into q from public.work_requests where id = p_id;
  if not found or q.kind <> 'access' then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if p_until is not null and (p_until <= now() or p_until > now() + interval '366 days') then raise exception 'BAD_UNTIL' using errcode = 'P0001'; end if;
  had := exists (select 1 from public.media_grants g where g.folder_id = q.folder_id and g.subject_type = 'person' and g.subject = q.requested_by);
  res := public.request_decide(p_id, p_approve, p_note, false);
  if coalesce(p_approve, false) and p_until is not null and not had then
    perform set_config('app.undo_internal', '1', true);
    update public.media_grants set expires_at = p_until
      where folder_id = q.folder_id and subject_type = 'person' and subject = q.requested_by;
    perform set_config('app.undo_internal', '0', true);
  end if;
  return res;
end
$$;

-- The card's folder list shows only grants that have not ended, with their end.
create or replace function public.perm_card(p_email text) returns jsonb
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
    'folders', (select coalesce(jsonb_agg(jsonb_build_object('folder', g.folder_id, 'name', f.name, 'level', g.level, 'until', g.expires_at) order by f.name), '[]'::jsonb)
                from public.media_grants g left join public.media_folders f on f.id = g.folder_id
                where g.subject_type = 'person' and g.subject = p_email and (g.expires_at is null or g.expires_at > now())),
    'requests', (select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'k', q.capability, 'mode', q.mode, 'hours', q.hours, 'uses', q.uses,
                   'reason', q.reason, 'at', q.created_at) order by q.created_at), '[]'::jsonb)
                 from public.permission_requests q where q.requester = p_email and q.status = 'pending'));
end
$$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
revoke all on function public.perm_may_decide(text, text, text) from public, anon, authenticated;
revoke all on function public.perm_how(text, int, int) from public, anon, authenticated;
revoke all on function public.perm_request_cards(uuid, text, text) from public, anon, authenticated;
revoke all on function public.perm_requests() from public, anon;
revoke all on function public.request_capability(text, text, int, int, jsonb, text, text, text) from public, anon;
revoke all on function public.decide_permission_request(uuid, boolean, text, timestamptz, int, jsonb, text) from public, anon;
revoke all on function public.withdraw_permission_request(uuid) from public, anon;
revoke all on function public.chat_request_permission(text, text, text, int, int, jsonb, text) from public, anon;
revoke all on function public.perm_granters(text) from public, anon;
revoke all on function public.request_decide_folder(uuid, boolean, text, timestamptz) from public, anon;
grant execute on function public.perm_requests() to authenticated;
grant execute on function public.request_capability(text, text, int, int, jsonb, text, text, text) to authenticated;
grant execute on function public.decide_permission_request(uuid, boolean, text, timestamptz, int, jsonb, text) to authenticated;
grant execute on function public.withdraw_permission_request(uuid) to authenticated;
grant execute on function public.chat_request_permission(text, text, text, int, int, jsonb, text) to authenticated;
grant execute on function public.perm_granters(text) to authenticated;
grant execute on function public.request_decide_folder(uuid, boolean, text, timestamptz) to authenticated;

-- Messaging (the «المراسلة» tab of the mail page) and personal profiles.
--
-- Messaging is everyday conversation beside the formal mail: direct chats, groups
-- (optionally tied to a campaign or a work item) and announcement channels. Cards
-- inside it act on the same records as the rest of the Hub through the same rules:
-- a task card creates a media_tasks row, an approval card moves an asset through the
-- media guard. Who sees a room: its members only, administrators included.
-- Every write is a function below; the tables have read policies only.
--
-- Profiles: how a person appears (picture, name line, colour, presence, mail
-- signature). The picture is a small square image resized in the browser and stored
-- here as a data URL (at most about 150 KB), so it needs no separate file service.

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  email text primary key references public.accounts(email) on delete cascade on update cascade,
  avatar text check (avatar is null or (avatar ~ '^data:image/(webp|jpeg|png);base64,' and char_length(avatar) <= 200000)),
  headline text check (headline is null or char_length(headline) <= 60),
  color text check (color is null or color in ('n1','n2','n3','n4','n5','n6')),
  presence text not null default 'online' check (presence in ('online','busy','shoot','dnd')),
  presence_note text check (presence_note is null or char_length(presence_note) <= 60),
  signature text check (signature is null or char_length(signature) <= 400),
  enter_sends boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy profiles_read on public.profiles for select to authenticated
  using ((select public.is_approved()));

-- One's own profile, and one's own display name (the only account field a person may change).
create function public.profile_update(p jsonb) returns void
language plpgsql security definer set search_path = ''
as $$
declare me text := public.current_email();
begin
  if me is null or not exists (select 1 from public.accounts a where a.email = me) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  if p ? 'display_name' then
    if char_length(btrim(coalesce(p->>'display_name', ''))) not between 1 and 80 then
      raise exception 'INVALID_NAME' using errcode = 'P0001';
    end if;
    update public.accounts set display_name = btrim(p->>'display_name') where email = me;
  end if;
  insert into public.profiles (email) values (me) on conflict (email) do nothing;
  update public.profiles set
      avatar = case when p ? 'avatar' then nullif(p->>'avatar', '') else avatar end,
      headline = case when p ? 'headline' then nullif(btrim(p->>'headline'), '') else headline end,
      color = case when p ? 'color' then nullif(p->>'color', '') else color end,
      presence = coalesce(p->>'presence', presence),
      presence_note = case when p ? 'presence_note' then nullif(btrim(p->>'presence_note'), '') else presence_note end,
      signature = case when p ? 'signature' then nullif(btrim(p->>'signature'), '') else signature end,
      enter_sends = coalesce((p->>'enter_sends')::boolean, enter_sends),
      updated_at = now()
    where email = me;
end
$$;

-- ---------------------------------------------------------------------------
-- Rooms, members, messages
-- ---------------------------------------------------------------------------
create table public.chat_rooms (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('dm','group','channel')),
  name text check (name is null or char_length(btrim(name)) between 1 and 60),
  description text check (description is null or char_length(description) <= 200),
  -- {type:'campaign'} | {type:'work', id:'CH-236', title} | {type:'asset', id:<uuid>}
  link jsonb,
  dm_key text unique,
  pinned_message uuid,
  created_by text not null,
  created_at timestamptz not null default now(),
  last_at timestamptz not null default now(),
  check ((type = 'dm') = (dm_key is not null)),
  check (type = 'dm' or name is not null)
);

create table public.chat_members (
  room_id uuid not null references public.chat_rooms(id) on delete cascade,
  email text not null,
  admin boolean not null default false,
  joined_at timestamptz not null default now(),
  last_read_at timestamptz not null default now(),
  muted boolean not null default false,
  pinned boolean not null default false,
  primary key (room_id, email)
);
create index chat_members_email_idx on public.chat_members (email);

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.chat_rooms(id) on delete cascade,
  author text not null,
  kind text not null check (kind in ('text','voice','image','file','asset','work','poll','task','approval','sys')),
  body text not null default '' check (char_length(body) <= 4000),
  reply_to uuid references public.chat_messages(id) on delete set null,
  forwarded boolean not null default false,
  urgent boolean not null default false,
  data jsonb,
  deleted boolean not null default false,
  edited_at timestamptz,
  created_at timestamptz not null default now()
);
create index chat_messages_room_idx on public.chat_messages (room_id, created_at);
create index chat_messages_task_idx on public.chat_messages ((data->>'task_id')) where data ? 'task_id';

create table public.chat_reactions (
  message_id uuid not null references public.chat_messages(id) on delete cascade,
  email text not null,
  kind text not null check (kind in ('check','eye','heart','flag','clock')),
  primary key (message_id, email, kind)
);
create table public.chat_votes (
  message_id uuid not null references public.chat_messages(id) on delete cascade,
  email text not null,
  option int not null check (option between 0 and 5),
  primary key (message_id, email, option)
);
create table public.chat_acks (
  message_id uuid not null references public.chat_messages(id) on delete cascade,
  email text not null,
  at timestamptz not null default now(),
  primary key (message_id, email)
);
create table public.chat_stars (
  message_id uuid not null references public.chat_messages(id) on delete cascade,
  email text not null,
  primary key (message_id, email)
);

alter table public.chat_rooms enable row level security;
alter table public.chat_members enable row level security;
alter table public.chat_messages enable row level security;
alter table public.chat_reactions enable row level security;
alter table public.chat_votes enable row level security;
alter table public.chat_acks enable row level security;
alter table public.chat_stars enable row level security;

create function public.chat_is_member(p_room uuid) returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.chat_members m where m.room_id = p_room and m.email = public.current_email()) $$;

create function public.chat_is_admin(p_room uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.chat_members m where m.room_id = p_room and m.email = public.current_email() and m.admin)
      or (public.media_my_role() = 'admin' and public.chat_is_member(p_room))
$$;

create function public.chat_msg_room(p_msg uuid) returns uuid
language sql stable security definer set search_path = ''
as $$ select room_id from public.chat_messages where id = p_msg $$;

create policy chat_rooms_read on public.chat_rooms for select to authenticated using ((select public.chat_is_member(id)));
create policy chat_members_read on public.chat_members for select to authenticated using ((select public.chat_is_member(room_id)));
create policy chat_messages_read on public.chat_messages for select to authenticated using ((select public.chat_is_member(room_id)));
create policy chat_reactions_read on public.chat_reactions for select to authenticated using ((select public.chat_is_member(public.chat_msg_room(message_id))));
create policy chat_votes_read on public.chat_votes for select to authenticated using ((select public.chat_is_member(public.chat_msg_room(message_id))));
create policy chat_acks_read on public.chat_acks for select to authenticated using ((select public.chat_is_member(public.chat_msg_room(message_id))));
create policy chat_stars_read on public.chat_stars for select to authenticated using (email = (select public.current_email()));

-- A timeline line in a room (noun-phrased in the interface).
create function public.chat_sys(p_room uuid, p_data jsonb) returns void
language sql security definer set search_path = ''
as $$
  insert into public.chat_messages (room_id, author, kind, data) values (p_room, coalesce(public.current_email(), 'system'), 'sys', p_data);
  update public.chat_rooms set last_at = now() where id = p_room;
$$;

-- ---------------------------------------------------------------------------
-- Rooms
-- ---------------------------------------------------------------------------
create function public.chat_open_dm(p_email text) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare me text := public.current_email(); k text; r uuid;
begin
  if me is null or p_email = me or not exists (select 1 from public.accounts a where a.email = me)
     or not exists (select 1 from public.accounts a where a.email = p_email) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  k := case when me < p_email then me || '|' || p_email else p_email || '|' || me end;
  select id into r from public.chat_rooms where dm_key = k;
  if r is null then
    insert into public.chat_rooms (type, dm_key, created_by) values ('dm', k, me) returning id into r;
    insert into public.chat_members (room_id, email, last_read_at) values (r, me, now()), (r, p_email, now() - interval '1 second');
  end if;
  return r;
end
$$;

create function public.chat_create_room(p_type text, p_name text, p_desc text, p_members text[], p_link jsonb) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare me text := public.current_email(); r uuid; e text; lk jsonb := null;
begin
  if me is null or p_type not in ('group','channel') or char_length(btrim(coalesce(p_name, ''))) not between 1 and 60 then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  if p_type = 'channel' and not public.media_acts(array['director','assistant']) then
    raise exception 'CHANNEL_ROLE' using errcode = 'P0001';
  end if;
  if cardinality(coalesce(p_members, '{}')) = 0 or cardinality(p_members) > 100 then
    raise exception 'NO_MEMBERS' using errcode = 'P0001';
  end if;
  if p_link is not null then
    if p_link->>'type' = 'campaign' then lk := jsonb_build_object('type','campaign');
    elsif p_link->>'type' = 'work' and p_link->>'id' ~ '^CH-[0-9]{1,6}$' then
      lk := jsonb_build_object('type','work','id',p_link->>'id','title',left(coalesce(p_link->>'title',''),140));
    end if;
  end if;
  insert into public.chat_rooms (type, name, description, link, created_by)
  values (p_type, btrim(p_name), nullif(btrim(coalesce(p_desc, '')), ''), lk, me) returning id into r;
  insert into public.chat_members (room_id, email, admin) values (r, me, true);
  foreach e in array p_members loop
    if e <> me and exists (select 1 from public.accounts a where a.email = e) then
      insert into public.chat_members (room_id, email, last_read_at) values (r, e, now() - interval '1 second') on conflict do nothing;
    end if;
  end loop;
  perform public.chat_sys(r, jsonb_build_object('e','created','type',p_type));
  return r;
end
$$;

create function public.chat_member(p_room uuid, p_email text, p_op text) returns void
language plpgsql security definer set search_path = ''
as $$
declare t text;
begin
  select type into t from public.chat_rooms where id = p_room;
  if t is null or t = 'dm' then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if p_op = 'leave' then
    if not public.chat_is_member(p_room) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
    perform public.chat_sys(p_room, jsonb_build_object('e','left','who',public.current_email()));
    delete from public.chat_members where room_id = p_room and email = public.current_email();
    return;
  end if;
  if not public.chat_is_admin(p_room) then raise exception 'ADMIN_ONLY' using errcode = 'P0001'; end if;
  if p_op = 'add' then
    if not exists (select 1 from public.accounts a where a.email = p_email) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
    insert into public.chat_members (room_id, email) values (p_room, p_email) on conflict do nothing;
    perform public.chat_sys(p_room, jsonb_build_object('e','added','who',p_email));
  elsif p_op = 'remove' then
    delete from public.chat_members where room_id = p_room and email = p_email and email <> public.current_email();
    perform public.chat_sys(p_room, jsonb_build_object('e','removed','who',p_email));
  elsif p_op = 'admin' then
    update public.chat_members set admin = not admin where room_id = p_room and email = p_email;
  else
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
end
$$;

-- One's own view of a room: read, mute, pin.
create function public.chat_state(p_room uuid, p_patch jsonb) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.chat_is_member(p_room) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  update public.chat_members set
      last_read_at = case when (p_patch->>'read')::boolean then now() else last_read_at end,
      muted = coalesce((p_patch->>'muted')::boolean, muted),
      pinned = coalesce((p_patch->>'pinned')::boolean, pinned)
    where room_id = p_room and email = public.current_email();
end
$$;

create function public.chat_pin(p_room uuid, p_msg uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare t text;
begin
  select type into t from public.chat_rooms where id = p_room;
  if not (public.chat_is_admin(p_room) or (t = 'dm' and public.chat_is_member(p_room))) then
    raise exception 'ADMIN_ONLY' using errcode = 'P0001';
  end if;
  if p_msg is not null and not exists (select 1 from public.chat_messages where id = p_msg and room_id = p_room) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  update public.chat_rooms set pinned_message = p_msg where id = p_room;
  if p_msg is not null then perform public.chat_sys(p_room, jsonb_build_object('e','pinned')); end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Messages
-- ---------------------------------------------------------------------------
create function public.chat_send(p_room uuid, p_kind text, p_body text, p_reply uuid, p_data jsonb, p_urgent boolean, p_forward boolean)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  me text := public.current_email(); t public.chat_rooms; d jsonb := null; a public.media_files;
  mid uuid; fid uuid; task uuid; opts jsonb; who text; due timestamptz;
begin
  select * into t from public.chat_rooms where id = p_room;
  if not found or not public.chat_is_member(p_room) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if t.type = 'channel' and not public.chat_is_admin(p_room) then raise exception 'CHANNEL_POST' using errcode = 'P0001'; end if;
  if coalesce(p_urgent, false) and not public.media_acts(array['director','assistant']) then
    raise exception 'URGENT_ROLE' using errcode = 'P0001';
  end if;
  if p_reply is not null and not exists (select 1 from public.chat_messages where id = p_reply and room_id = p_room) then
    p_reply := null;
  end if;

  if p_kind = 'text' then
    if char_length(btrim(coalesce(p_body, ''))) = 0 then raise exception 'EMPTY_MESSAGE' using errcode = 'P0001'; end if;
  elsif p_kind in ('voice','image','file') then
    fid := (p_data->>'file')::uuid;
    if not exists (select 1 from public.mail_files f where f.id = fid and f.uploaded_by = me)
       and not exists (select 1 from public.chat_messages x where x.data->>'file' = fid::text and public.chat_is_member(x.room_id)) then
      raise exception 'FILE_FORBIDDEN' using errcode = 'P0001';
    end if;
    d := jsonb_build_object('file', fid,
      'name', (select f.name from public.mail_files f where f.id = fid),
      'size', (select f.size_bytes from public.mail_files f where f.id = fid),
      'mime', (select f.mime_type from public.mail_files f where f.id = fid));
    if p_kind = 'voice' then
      d := d || jsonb_build_object('dur', least(greatest(coalesce((p_data->>'dur')::numeric, 1), 1), 600),
        'wave', coalesce((select jsonb_agg(least(greatest(v::int, 5), 100)) from (select jsonb_array_elements_text(p_data->'wave') v limit 48) w), '[]'::jsonb));
    end if;
  elsif p_kind in ('asset','approval') then
    select * into a from public.media_files where id = (p_data->>'asset_id')::uuid;
    if not found or public.media_level(me, a.folder_id) < 1 then raise exception 'REF_FORBIDDEN' using errcode = 'P0001'; end if;
    if p_kind = 'approval' and a.stage <> 'review' then raise exception 'NOT_IN_REVIEW' using errcode = 'P0001'; end if;
    d := jsonb_build_object('asset_id', a.id, 'name', a.name, 'version', a.current_version);
    if p_kind = 'approval' then d := d || jsonb_build_object('state','pending'); end if;
  elsif p_kind = 'work' then
    if p_data->>'id' !~ '^CH-[0-9]{1,6}$' then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
    d := jsonb_build_object('id', p_data->>'id', 'title', left(coalesce(p_data->>'title',''),140), 'status', left(coalesce(p_data->>'status',''),40));
  elsif p_kind = 'poll' then
    opts := (select jsonb_agg(left(btrim(v), 60)) from (select jsonb_array_elements_text(p_data->'options') v) o where btrim(v) <> '');
    if char_length(btrim(coalesce(p_data->>'q',''))) = 0 or jsonb_array_length(coalesce(opts,'[]'::jsonb)) not between 2 and 6 then
      raise exception 'POLL_INVALID' using errcode = 'P0001';
    end if;
    d := jsonb_build_object('q', left(btrim(p_data->>'q'),120), 'options', opts, 'multi', coalesce((p_data->>'multi')::boolean,false), 'closed', false);
  elsif p_kind = 'task' then
    if not public.media_acts(array['director','assistant','producer']) then raise exception 'TASK_ROLE' using errcode = 'P0001'; end if;
    who := p_data->>'assignee'; due := (p_data->>'due')::timestamptz;
    if who is null or who = me or not exists (select 1 from public.chat_members m where m.room_id = p_room and m.email = who) then
      raise exception 'TASK_ASSIGNEE' using errcode = 'P0001';
    end if;
    if char_length(btrim(coalesce(p_data->>'what',''))) not between 1 and 140 then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
    insert into public.media_tasks (what, kind, assignee, assigned_by, due, priority)
    values (btrim(p_data->>'what'), 'other', who, me, due, case when p_data->>'priority' = 'urgent' then 'urgent' else 'normal' end)
    returning id into task;
    d := jsonb_build_object('task_id', task, 'what', btrim(p_data->>'what'), 'assignee', who, 'due', due,
      'priority', case when p_data->>'priority' = 'urgent' then 'urgent' else 'normal' end, 'state','open','progress',0);
  else
    raise exception 'BAD_KIND' using errcode = 'P0001';
  end if;

  insert into public.chat_messages (room_id, author, kind, body, reply_to, forwarded, urgent, data)
  values (p_room, me, p_kind, left(coalesce(p_body,''), 4000), p_reply, coalesce(p_forward,false), coalesce(p_urgent,false), d)
  returning id into mid;
  update public.chat_rooms set last_at = now() where id = p_room;
  update public.chat_members set last_read_at = now() where room_id = p_room and email = me;
  if coalesce(p_urgent,false) then insert into public.chat_acks (message_id, email) values (mid, me); end if;
  return mid;
end
$$;

create function public.chat_edit(p_msg uuid, p_body text) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if char_length(btrim(coalesce(p_body,''))) = 0 then raise exception 'EMPTY_MESSAGE' using errcode = 'P0001'; end if;
  update public.chat_messages set body = left(btrim(p_body), 4000), edited_at = now()
    where id = p_msg and author = public.current_email() and kind = 'text' and not deleted
      and created_at > now() - interval '15 minutes';
  if not found then raise exception 'EDIT_WINDOW' using errcode = 'P0001'; end if;
end
$$;

create function public.chat_delete(p_msg uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  update public.chat_messages set deleted = true, body = '', data = case when kind in ('task','approval') then data else null end
    where id = p_msg and kind <> 'sys'
      and (author = public.current_email() or public.chat_is_admin(room_id));
  if not found then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  update public.chat_rooms set pinned_message = null where pinned_message = p_msg;
end
$$;

create function public.chat_toggle(p_msg uuid, p_what text, p_value text) returns void
language plpgsql security definer set search_path = ''
as $$
declare me text := public.current_email(); m public.chat_messages; o int;
begin
  select * into m from public.chat_messages where id = p_msg;
  if not found or not public.chat_is_member(m.room_id) or m.deleted then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if p_what = 'react' then
    if exists (select 1 from public.chat_reactions where message_id = p_msg and email = me and kind = p_value) then
      delete from public.chat_reactions where message_id = p_msg and email = me and kind = p_value;
    else insert into public.chat_reactions (message_id, email, kind) values (p_msg, me, p_value); end if;
  elsif p_what = 'star' then
    if exists (select 1 from public.chat_stars where message_id = p_msg and email = me) then
      delete from public.chat_stars where message_id = p_msg and email = me;
    else insert into public.chat_stars (message_id, email) values (p_msg, me); end if;
  elsif p_what = 'ack' then
    if not m.urgent then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
    insert into public.chat_acks (message_id, email) values (p_msg, me) on conflict do nothing;
  elsif p_what = 'vote' then
    o := p_value::int;
    if m.kind <> 'poll' or (m.data->>'closed')::boolean or o < 0 or o >= jsonb_array_length(m.data->'options') then
      raise exception 'FORBIDDEN' using errcode = 'P0001';
    end if;
    if exists (select 1 from public.chat_votes where message_id = p_msg and email = me and option = o) then
      delete from public.chat_votes where message_id = p_msg and email = me and option = o;
    else
      if not (m.data->>'multi')::boolean then delete from public.chat_votes where message_id = p_msg and email = me; end if;
      insert into public.chat_votes (message_id, email, option) values (p_msg, me, o);
    end if;
  elsif p_what = 'close' then
    if m.kind <> 'poll' or m.author <> me then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
    update public.chat_messages set data = data || '{"closed":true}'::jsonb where id = p_msg;
    perform public.chat_sys(m.room_id, jsonb_build_object('e','poll_closed','q',m.data->>'q'));
  else
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
end
$$;

-- Cards: the task and the approval act through the media rules.
create function public.chat_card(p_msg uuid, p_op text, p_value text) returns void
language plpgsql security definer set search_path = ''
as $$
declare me text := public.current_email(); m public.chat_messages; a public.media_files; k public.media_tasks;
begin
  select * into m from public.chat_messages where id = p_msg for update;
  if not found or not public.chat_is_member(m.room_id) or m.deleted then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if m.kind = 'approval' then
    if m.data->>'state' <> 'pending' then raise exception 'CARD_CLOSED' using errcode = 'P0001'; end if;
    select * into a from public.media_files where id = (m.data->>'asset_id')::uuid;
    if a.current_version <> (m.data->>'version')::int or a.stage <> 'review' then
      update public.chat_messages set data = data || jsonb_build_object('state','moved','stage',a.stage,'now',a.current_version) where id = p_msg;
      return;
    end if;
    if p_op not in ('approve','changes') then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
    if p_op = 'changes' and char_length(btrim(coalesce(p_value,''))) = 0 then raise exception 'NOTE_REQUIRED' using errcode = 'P0001'; end if;
    update public.media_files set stage = case when p_op = 'approve' then 'ready' else 'changes' end where id = a.id;
    if p_op = 'changes' then insert into public.media_notes (asset_id, author, body) values (a.id, me, left(btrim(p_value),500)); end if;
    update public.chat_messages set data = data || jsonb_build_object('state', case when p_op = 'approve' then 'approved' else 'changes' end,
        'dby', me, 'dat', now(), 'note', nullif(btrim(coalesce(p_value,'')),'')) where id = p_msg;
    perform public.chat_sys(m.room_id, jsonb_build_object('e','approval','op',p_op,'name',m.data->>'name','version',(m.data->>'version')::int));
  elsif m.kind = 'task' then
    select * into k from public.media_tasks where id = (m.data->>'task_id')::uuid for update;
    if not found then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
    if p_op = 'done' and k.assignee = me and k.status = 'open' then
      update public.media_tasks set status = 'done' where id = k.id;
      perform public.chat_sys(m.room_id, jsonb_build_object('e','done','what',k.what));
    elsif p_op = 'remind' and k.status = 'open' and (k.assigned_by = me or public.media_acts(array['director','assistant'])) then
      perform public.chat_sys(m.room_id, jsonb_build_object('e','remind','to',k.assignee,'what',k.what));
    else
      raise exception 'FORBIDDEN' using errcode = 'P0001';
    end if;
  else
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
end
$$;

-- Moving a conversation to formal mail leaves a line in the room.
create function public.chat_moved_to_mail(p_room uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.chat_is_member(p_room) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  perform public.chat_sys(p_room, jsonb_build_object('e','to_mail'));
end
$$;

-- A file in a chat message, for the file route: only for members of a room it is in.
create function public.chat_file(p_id uuid) returns table (drive_file_id text, name text, mime_type text, size_bytes bigint)
language sql stable security definer set search_path = ''
as $$
  select f.drive_file_id, f.name, f.mime_type, f.size_bytes from public.mail_files f
  where f.id = p_id and (f.uploaded_by = public.current_email() or exists (
    select 1 from public.chat_messages x where x.data->>'file' = p_id::text and not x.deleted and public.chat_is_member(x.room_id)))
$$;

-- Task cards in chat follow their task, like the ones in mail.
create or replace function public.mail_task_follow() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  update public.mail_messages set card = card || jsonb_build_object(
      'state', case when new.status = 'done' then 'done' else 'open' end,
      'progress', new.progress, 'due', new.due, 'priority', new.priority, 'dat', new.done_at)
    where card->>'task_id' = new.id::text;
  update public.chat_messages set data = data || jsonb_build_object(
      'state', case when new.status = 'done' then 'done' else 'open' end,
      'progress', new.progress, 'due', new.due, 'dat', new.done_at)
    where data->>'task_id' = new.id::text;
  return new;
end
$$;

-- ---------------------------------------------------------------------------
-- Live updates
-- ---------------------------------------------------------------------------
-- Profiles are not published: pictures are large, and the page reloads them itself.
alter publication supabase_realtime add table public.chat_messages, public.chat_members, public.chat_reactions,
  public.chat_votes, public.chat_acks, public.chat_rooms;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
revoke all on function public.chat_sys(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.chat_msg_room(uuid) from public, anon;
revoke all on function public.chat_is_member(uuid) from public, anon;
revoke all on function public.chat_is_admin(uuid) from public, anon;
revoke all on function public.profile_update(jsonb) from public, anon;
revoke all on function public.chat_open_dm(text) from public, anon;
revoke all on function public.chat_create_room(text, text, text, text[], jsonb) from public, anon;
revoke all on function public.chat_member(uuid, text, text) from public, anon;
revoke all on function public.chat_state(uuid, jsonb) from public, anon;
revoke all on function public.chat_pin(uuid, uuid) from public, anon;
revoke all on function public.chat_send(uuid, text, text, uuid, jsonb, boolean, boolean) from public, anon;
revoke all on function public.chat_edit(uuid, text) from public, anon;
revoke all on function public.chat_delete(uuid) from public, anon;
revoke all on function public.chat_toggle(uuid, text, text) from public, anon;
revoke all on function public.chat_card(uuid, text, text) from public, anon;
revoke all on function public.chat_moved_to_mail(uuid) from public, anon;
revoke all on function public.chat_file(uuid) from public, anon;

grant execute on function public.chat_msg_room(uuid) to authenticated;
grant execute on function public.chat_is_member(uuid) to authenticated;
grant execute on function public.chat_is_admin(uuid) to authenticated;
grant execute on function public.profile_update(jsonb) to authenticated;
grant execute on function public.chat_open_dm(text) to authenticated;
grant execute on function public.chat_create_room(text, text, text, text[], jsonb) to authenticated;
grant execute on function public.chat_member(uuid, text, text) to authenticated;
grant execute on function public.chat_state(uuid, jsonb) to authenticated;
grant execute on function public.chat_pin(uuid, uuid) to authenticated;
grant execute on function public.chat_send(uuid, text, text, uuid, jsonb, boolean, boolean) to authenticated;
grant execute on function public.chat_edit(uuid, text) to authenticated;
grant execute on function public.chat_delete(uuid) to authenticated;
grant execute on function public.chat_toggle(uuid, text, text) to authenticated;
grant execute on function public.chat_card(uuid, text, text) to authenticated;
grant execute on function public.chat_moved_to_mail(uuid) to authenticated;
grant execute on function public.chat_file(uuid) to authenticated;

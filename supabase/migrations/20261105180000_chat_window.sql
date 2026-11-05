-- The chat window, experimental (owner discussion of 2026-11-05): a floating window of mail and messaging that a person
-- turns on for themselves, with two kinds of room it fills by itself. Nothing changes for anyone until it is used: the
-- switch is off for everyone, and neither kind of room exists until somebody opens it.
--
--   * The switch. `profiles.chat_window`, off by default, set by profile_update like «Enter يرسل»: one's own profile only.
--   * «العام». One group room for every account, its link {"type":"all"}, at most one (a partial unique index). It is made
--     by the first person who opens it (chat_global_room), with every account as a member, and an account approved later
--     joins it by a trigger. Nobody leaves it, is added or is removed by hand (GLOBAL_ROOM), and nobody holds it as its
--     room administrator, since its creator is only whoever opened it first; the system's administrators keep what
--     chat_is_admin already gives them. Two people opening it at once get the same room: the second insert waits on the
--     index and finds the first.
--   * A work's own room. chat_work_room opens the group room of one work, its link {"type":"work","id":…,"auto":true}, at
--     most one a work (a partial unique index). Whoever may see the work and is involved in it, or is a leader, may open
--     it. Every opening adds whoever is involved now (the assignee, the creator, the people, every stage holder) and the
--     director and the assistant; nobody is ever removed. Nobody leaves it or is removed from it by hand (WORK_ROOM);
--     its room administrator may still add a guest and name another administrator, as in any group.
--   * Push. A member who muted «العام» still gets a push when a message mentions them, since everyone is in it and a
--     mute there is a mute of the crowd, not of the person. Every other room is pushed as before.
--   * chat_create_room already keeps only a campaign link or a work link without "auto", so neither kind of room can be
--     made through it. The check below fails this migration if that ever changes.

-- ---------------------------------------------------------------------------
-- The switch
-- ---------------------------------------------------------------------------
alter table public.profiles add column chat_window boolean not null default false;

create or replace function public.profile_update(p jsonb) returns void
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
      chat_window = coalesce((p->>'chat_window')::boolean, chat_window),
      updated_at = now()
    where email = me;
end
$$;

-- ---------------------------------------------------------------------------
-- «العام»
-- ---------------------------------------------------------------------------
create unique index chat_rooms_one_global on public.chat_rooms ((link->>'type')) where link->>'type' = 'all';

create function public.chat_global_room() returns uuid
language plpgsql security definer set search_path = ''
as $$
declare me text := public.current_email(); r uuid; fresh boolean := false;
begin
  if me is null or not exists (select 1 from public.accounts a where a.email = me) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  select id into r from public.chat_rooms where link->>'type' = 'all';
  if r is null then
    -- Someone else opening it at this moment holds the index: this insert waits, does nothing, and the room is theirs.
    insert into public.chat_rooms (type, name, link, created_by)
    values ('group', 'العام', '{"type":"all"}'::jsonb, me)
    on conflict ((link->>'type')) where link->>'type' = 'all' do nothing
    returning id into r;
    fresh := r is not null;
    if not fresh then select id into r from public.chat_rooms where link->>'type' = 'all'; end if;
  end if;
  insert into public.chat_members (room_id, email, last_read_at)
  select r, a.email, case when a.email = me then now() else now() - interval '1 second' end from public.accounts a
  on conflict do nothing;
  if fresh then perform public.chat_sys(r, '{"e":"created","type":"all"}'::jsonb); end if;
  return r;
end
$$;

-- An account approved after «العام» exists is in it from the start. Before anyone opens it, this does nothing.
create function public.chat_global_join() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.chat_members (room_id, email)
  select r.id, new.email from public.chat_rooms r where r.link->>'type' = 'all'
  on conflict do nothing;
  return null;
end
$$;
create trigger accounts_global_room after insert on public.accounts
  for each row execute function public.chat_global_join();

-- ---------------------------------------------------------------------------
-- A work's own room
-- ---------------------------------------------------------------------------
create unique index chat_rooms_one_work_room on public.chat_rooms ((link->>'id'))
  where link->>'type' = 'work' and link->>'auto' = 'true';

create function public.chat_work_room(p_work text) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare me text := public.current_email(); w public.works; r uuid; fresh boolean := false;
begin
  select * into w from public.works where id = p_work;
  if not found or me is null or not exists (select 1 from public.accounts a where a.email = me)
     or not public.work_can_see(p_work) or not (public.work_involved(p_work, me) or public.work_lead()) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  select id into r from public.chat_rooms where link->>'type' = 'work' and link->>'auto' = 'true' and link->>'id' = p_work;
  if r is null then
    insert into public.chat_rooms (type, name, link, created_by)
    values ('group', left(btrim(w.title), 60), jsonb_build_object('type','work','id',w.id,'title',left(w.title,140),'auto',true), me)
    on conflict ((link->>'id')) where link->>'type' = 'work' and link->>'auto' = 'true' do nothing
    returning id into r;
    fresh := r is not null;
    if not fresh then
      select id into r from public.chat_rooms where link->>'type' = 'work' and link->>'auto' = 'true' and link->>'id' = p_work;
    end if;
  end if;
  -- Whoever is involved now, and the leaders. Someone who stopped being involved stays.
  insert into public.chat_members (room_id, email, admin, last_read_at)
  select r, a.email, fresh and a.email = me, case when a.email = me then now() else now() - interval '1 second' end
  from public.accounts a
  where a.email = me or a.email = w.assignee or a.email = w.created_by or a.email = any (w.people)
     or exists (select 1 from public.work_stages s where s.work_id = p_work and s.who = a.email)
     or a.role in ('director', 'assistant')
  on conflict do nothing;
  if fresh then perform public.chat_sys(r, '{"e":"created","type":"work"}'::jsonb); end if;
  return r;
end
$$;

-- ---------------------------------------------------------------------------
-- Members: nobody joins or leaves these rooms by hand
-- ---------------------------------------------------------------------------
create or replace function public.chat_member(p_room uuid, p_email text, p_op text) returns void
language plpgsql security definer set search_path = ''
as $$
declare t text; lk jsonb;
begin
  select type, link into t, lk from public.chat_rooms where id = p_room;
  if t is null or t = 'dm' then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if lk->>'type' = 'all' then raise exception 'GLOBAL_ROOM' using errcode = 'P0001'; end if;
  if lk->>'type' = 'work' and lk->>'auto' = 'true' and p_op in ('leave', 'remove') then
    raise exception 'WORK_ROOM' using errcode = 'P0001';
  end if;
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

-- ---------------------------------------------------------------------------
-- Push: a mention in «العام» passes its mute
-- ---------------------------------------------------------------------------
create or replace function public.push_route_chat(p_msg uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare m public.chat_messages; t public.chat_rooms;
begin
  select * into m from public.chat_messages where id = p_msg;
  if not found or m.kind = 'sys' or m.deleted then return; end if;
  select * into t from public.chat_rooms where id = m.room_id;
  insert into public.push_outbox (device_id, kind, message_id, tier)
  select d.id, 'chat', m.id, x.tier
  from (
    select cm.email, case when m.urgency = 3 then 'decide' else 'attention' end as tier
    from public.chat_members cm
    where cm.room_id = m.room_id and cm.email <> m.author
      and (m.urgency = 3
           or (not cm.muted and (t.type = 'dm' or m.urgency > 0
               or (m.kind = 'text' and position('@' || public.work_name(cm.email) in m.body) > 0)))
           or (cm.muted and t.link->>'type' = 'all'
               and m.kind = 'text' and position('@' || public.work_name(cm.email) in m.body) > 0))
  ) x
  join public.devices d on d.email = x.email and d.removed_at is null and d.fcm_token is not null and x.tier = any (d.tiers)
  on conflict do nothing;
end
$$;

-- ---------------------------------------------------------------------------
-- chat_create_room keeps neither link
-- ---------------------------------------------------------------------------
do $$
declare src text := pg_get_functiondef('public.chat_create_room(text,text,text,text[],jsonb)'::regprocedure);
begin
  if position('if p_link->>''type'' = ''campaign'' then lk := jsonb_build_object(''type'',''campaign'');' in src) = 0
     or position('lk := jsonb_build_object(''type'',''work'',''id'',p_link->>''id'',''title'',left(coalesce(p_link->>''title'',''''),140));' in src) = 0
     or (length(src) - length(replace(src, 'lk := ', ''))) / length('lk := ') <> 2 then
    raise exception 'chat_create_room changed: review the chat window migration';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
revoke all on function public.chat_global_join() from public, anon, authenticated;
revoke all on function public.push_route_chat(uuid) from public, anon, authenticated;
revoke all on function public.profile_update(jsonb) from public, anon;
revoke all on function public.chat_member(uuid, text, text) from public, anon;
revoke all on function public.chat_global_room() from public, anon;
revoke all on function public.chat_work_room(text) from public, anon;
grant execute on function public.profile_update(jsonb) to authenticated;
grant execute on function public.chat_member(uuid, text, text) to authenticated;
grant execute on function public.chat_global_room() to authenticated;
grant execute on function public.chat_work_room(text) to authenticated;

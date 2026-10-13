-- Permissions Step P4: urgency 0 to 3 on messages (Permissions_Plan.md 7, D-4, D-10).
--
--   0 none (no mark)        anyone
--   1 «للانتباه»            anyone
--   2 «مهم»                 «رسائل «مهم» (المستوى 2)» (urgency.2: the leaders by default, grantable)
--   3 «عاجل»                fixed: administrator, director, assistant (urgency.3); acknowledged by each member
--
-- Existing urgent messages become level 3, exactly who could send them. chat_send takes the
-- level (p_urgency); the old boolean form stays for existing callers and means level 3. The
-- boolean column `urgent` is removed by the next migration, once nothing reads it.
-- Notices: level 1 and 2 are «انتباه» (2 marked «مهم»), level 3 is «قرارك» with the
-- acknowledgement as its action; a level 0 message makes no notice, as before. A member who
-- muted the conversation gets no notice for levels 1 and 2; level 3 always reaches them.

alter table public.chat_messages add column urgency smallint not null default 0 check (urgency between 0 and 3);
update public.chat_messages set urgency = 3 where urgent;

create function public.chat_urgency_ar(p_level int) returns text
language sql immutable set search_path = ''
as $$ select case p_level when 1 then 'للانتباه' when 2 then 'مهم' when 3 then 'عاجل' else '' end $$;

create function public.chat_send(p_room uuid, p_kind text, p_body text, p_reply uuid, p_data jsonb, p_urgency smallint, p_forward boolean)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  me text := public.current_email(); t public.chat_rooms; d jsonb := null; a public.media_files;
  mid uuid; fid uuid; task uuid; opts jsonb; who text; due timestamptz; v_u smallint := coalesce(p_urgency, 0); g record;
begin
  select * into t from public.chat_rooms where id = p_room;
  if not found or not public.chat_is_member(p_room) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if t.type = 'channel' and not public.chat_is_admin(p_room) then raise exception 'CHANNEL_POST' using errcode = 'P0001'; end if;
  if v_u not between 0 and 3 then raise exception 'BAD_URGENCY' using errcode = 'P0001'; end if;
  if v_u = 3 and not public.has_capability('urgency.3') then raise exception 'URGENT_ROLE' using errcode = 'P0001'; end if;
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

  -- Level 2 is a capability that may have been given once: used here, inside the send.
  if v_u = 2 and not public.use_capability('urgency.2') then raise exception 'URGENCY_2' using errcode = 'P0001'; end if;

  insert into public.chat_messages (room_id, author, kind, body, reply_to, forwarded, urgent, urgency, data)
  values (p_room, me, p_kind, left(coalesce(p_body,''), 4000), p_reply, coalesce(p_forward,false), v_u = 3, v_u, d)
  returning id into mid;
  update public.chat_rooms set last_at = now() where id = p_room;
  update public.chat_members set last_read_at = now() where room_id = p_room and email = me;
  if v_u = 3 then insert into public.chat_acks (message_id, email) values (mid, me); end if;

  -- Notices by level, to the members of this room only.
  if v_u > 0 then
    for g in select m.email, m.muted from public.chat_members m where m.room_id = p_room and m.email <> me loop
      if v_u = 3 or not g.muted then
        insert into public.notifications (recipient, tier, body, go)
        values (g.email, case when v_u = 3 then 'decide' else 'attention' end,
          '«' || public.chat_urgency_ar(v_u) || '» من ' || public.work_name(me)
            || case when t.type = 'dm' then '' else ' في «' || coalesce(t.name, '') || '»' end
            || case when v_u = 3 then '، ويطلب إقرارك بالاستلام' else '' end || ': '
            || left(case when p_kind = 'text' then btrim(coalesce(p_body, '')) else 'بطاقة' end, 80) || '.',
          jsonb_build_object('page', 'chat', 'id', p_room));
      end if;
    end loop;
  end if;
  return mid;
end
$$;

-- The boolean form: urgent means level 3, as before.
create or replace function public.chat_send(p_room uuid, p_kind text, p_body text, p_reply uuid, p_data jsonb, p_urgent boolean, p_forward boolean)
returns uuid
language sql security definer set search_path = ''
as $$ select public.chat_send(p_room, p_kind, p_body, p_reply, p_data, (case when coalesce(p_urgent, false) then 3 else 0 end)::smallint, p_forward) $$;

-- Acknowledgement belongs to level 3.
do $$
declare src text;
begin
  src := pg_get_functiondef('public.chat_toggle(uuid,text,text)'::regprocedure);
  if position('if not m.urgent then raise exception ''FORBIDDEN''' in src) = 0 then
    raise exception 'chat_toggle changed: review the urgency migration';
  end if;
  execute replace(src, 'if not m.urgent then raise exception ''FORBIDDEN''', 'if m.urgency < 3 then raise exception ''FORBIDDEN''');
end $$;

revoke all on function public.chat_urgency_ar(int) from public, anon, authenticated;
revoke all on function public.chat_send(uuid, text, text, uuid, jsonb, smallint, boolean) from public, anon;
grant execute on function public.chat_send(uuid, text, text, uuid, jsonb, smallint, boolean) to authenticated;

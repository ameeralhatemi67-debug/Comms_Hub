-- The chat window (migration 20261105180000_chat_window.sql, owner discussion of 2026-11-05), checked inside one
-- transaction that is rolled back at the end. Only throwaway accounts (@t.test) act; the device tokens are made-up strings
-- in the shape of an FCM token, and no real device or Firebase project is involved. One sign-in has no account: the guard
-- that keeps such sign-ins out is set aside for that one row, inside this transaction.
-- Covered: the switch on one's own profile; «العام» absent until opened, made once with every account in it, the same room
-- for the second caller, a missing account put back, an account approved later joined by the trigger, nobody leaving,
-- added or removed by hand, a second one refused by the index; a work's own room, opened only by whoever may see the work
-- and is involved in it or leads, its members, the same room on every opening with whoever became involved, nobody
-- removed, nobody leaving it by hand while its administrator still adds a guest, a restricted work; chat_create_room
-- keeping neither link; a mention in «العام» passing its mute while a plain message and another room's mute hold; who may
-- call what.
-- The last query lists only the checks that differ from the rule, and the total. Result: qa/chat-window-rules.json.
begin;
create temp table r(n serial, k text, v text, expect text);
create temp table v(k text primary key, val text);
grant all on r, v to public; grant usage on sequence r_n_seq to public;
insert into public.accounts (email, display_name, role, pages, protected) values
 ('adm@t.test','Adm','admin','{mail}',true),('dir@t.test','Dir','director','{mail}',false),('asst@t.test','Asst','assistant','{mail}',false),
 ('cre@t.test','Cre','writer','{mail}',false),('wri@t.test','Wri','writer','{mail}',false),('des@t.test','Des','designer','{mail}',false),
 ('pro@t.test','Pro','producer','{mail}',false),('pub@t.test','Pub','publisher','{mail}',false),('out@t.test','Out','writer','{mail}',false),
 ('mem@t.test','Mem','member','{mail}',false);
insert into auth.users (id, email, email_confirmed_at) values
 ('00000000-0000-0000-0000-0000000000a1','adm@t.test',now()),('00000000-0000-0000-0000-0000000000d1','dir@t.test',now()),
 ('00000000-0000-0000-0000-0000000000b1','asst@t.test',now()),('00000000-0000-0000-0000-0000000000c1','cre@t.test',now()),
 ('00000000-0000-0000-0000-0000000000c2','wri@t.test',now()),('00000000-0000-0000-0000-0000000000c3','des@t.test',now()),
 ('00000000-0000-0000-0000-0000000000c4','pro@t.test',now()),('00000000-0000-0000-0000-0000000000c5','pub@t.test',now()),
 ('00000000-0000-0000-0000-0000000000c6','out@t.test',now()),('00000000-0000-0000-0000-0000000000c7','mem@t.test',now());
set local session_replication_role = replica;
insert into auth.users (id, email, email_confirmed_at) values ('00000000-0000-0000-0000-0000000000e1','ghost@t.test',now());
set local session_replication_role = origin;
create function pg_temp.who(id text) returns void language sql as $$ select set_config('request.jwt.claims', json_build_object('sub',id,'role','authenticated')::text, true) $$;
create function pg_temp.nobody() returns void language sql as $$ select set_config('request.jwt.claims', '', true) $$;
create function pg_temp.t(k text, sqltext text, e text) returns void language plpgsql as $$
declare cn text;
begin
  begin execute sqltext; insert into r(k,v,expect) values (k,'ok',e);
  exception when others then
    get stacked diagnostics cn = constraint_name;
    insert into r(k,v,expect) values (k,'ERR '||coalesce(nullif(cn,''), sqlerrm),e); end;
end $$;
create function pg_temp.c(k text, val text, e text) returns void language sql as $$ insert into r(k,v,expect) values (k,coalesce(val,'NULL'),e) $$;
create function pg_temp.g(k text) returns text language sql as $$ select val from v where k = $1 $$;
create function pg_temp.tok(w text) returns text language sql as $$ select 'tok_' || w || '_' || repeat('x', 24) $$;
-- A room's members by name, an administrator marked with a star.
create function pg_temp.members(p_label text) returns text language sql as $$
  select coalesce(string_agg(split_part(m.email,'@',1) || case when m.admin then '*' else '' end, ',' order by m.email collate "C"), 'none')
  from public.chat_members m where m.room_id = pg_temp.g(p_label)::uuid $$;
-- The outbox rows of one kind as label>person, labels from v.
create function pg_temp.rows(p_kind text) returns text language sql as $$
  select coalesce(string_agg(x.k || '>' || split_part(d.email,'@',1), ',' order by x.k, d.email), 'none')
  from public.push_outbox o join public.devices d on d.id = o.device_id join v x on x.val = o.ref::text where o.kind = p_kind $$;
create function pg_temp.global_count() returns text language sql as $$
  select count(*)::text from public.chat_rooms where link->>'type' = 'all' $$;
grant execute on function pg_temp.who(text), pg_temp.nobody(), pg_temp.t(text,text,text), pg_temp.c(text,text,text), pg_temp.g(text),
  pg_temp.tok(text), pg_temp.members(text), pg_temp.rows(text), pg_temp.global_count() to public;

-- 1. The switch -----------------------------------------------------------------------------------------------------
select pg_temp.c('01 the switch is a column that is never empty, off by default',
  (select is_nullable || ' ' || column_default from information_schema.columns
   where table_schema = 'public' and table_name = 'profiles' and column_name = 'chat_window'), 'NO false');
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000c3');
select pg_temp.t('02 the designer saves a profile without naming the switch', $q$ select public.profile_update('{"headline":"مصممة"}') $q$, 'ok');
select pg_temp.c('03 so hers is off', (select chat_window::text from public.profiles where email = 'des@t.test'), 'false');
select pg_temp.who('00000000-0000-0000-0000-0000000000c2');
select pg_temp.t('04 the writer turns his on', $q$ select public.profile_update('{"chat_window":true}') $q$, 'ok');
select pg_temp.c('05 on', (select chat_window::text from public.profiles where email = 'wri@t.test'), 'true');
select pg_temp.t('06 another change of his profile', $q$ select public.profile_update('{"presence":"busy"}') $q$, 'ok');
select pg_temp.c('06b leaves it on, and «Enter يرسل» as it was', (select chat_window || ' ' || enter_sends from public.profiles where email = 'wri@t.test'), 'true true');
select pg_temp.c('07 the designer''s is not touched', (select chat_window::text from public.profiles where email = 'des@t.test'), 'false');
select pg_temp.t('08 he tries to write the table directly', $q$ update public.profiles set chat_window = true where email = 'des@t.test' $q$, 'ok');
select pg_temp.c('08b which changes nothing', (select chat_window::text from public.profiles where email = 'des@t.test'), 'false');
select pg_temp.t('09 he turns it off', $q$ select public.profile_update('{"chat_window":false}') $q$, 'ok');
select pg_temp.c('09b off', (select chat_window::text from public.profiles where email = 'wri@t.test'), 'false');
select pg_temp.t('09c a value that is neither true nor false is refused', $q$ select public.profile_update('{"chat_window":"maybe"}') $q$, 'ERR invalid input syntax for type boolean: "maybe"');

-- 2. «العام» ----------------------------------------------------------------------------------------------------------
reset role;
select pg_temp.c('10 after the migration there is no «العام»', pg_temp.global_count(), '0');
insert into public.accounts (email, display_name, role, pages, protected) values ('early@t.test','Early','member','{}',false);
select pg_temp.c('11 an account approved before anyone opens it changes nothing', pg_temp.global_count(), '0');
set local role anon;
select pg_temp.t('12 a signed-out caller cannot open it', $q$ select public.chat_global_room() $q$, 'ERR permission denied for function chat_global_room');
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000e1');
select pg_temp.t('13 a sign-in with no account is refused', $q$ select public.chat_global_room() $q$, 'ERR FORBIDDEN');
select pg_temp.nobody();
select pg_temp.t('13b so is a session with nobody signed in', $q$ select public.chat_global_room() $q$, 'ERR FORBIDDEN');
reset role;
select pg_temp.c('13c and nothing was made', pg_temp.global_count(), '0');
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000c2');
select pg_temp.t('14 the writer opens it first', $q$ insert into v values ('G', public.chat_global_room()::text) $q$, 'ok');
select pg_temp.c('15 he sees a group named «العام», linked to everyone',
  (select type || ' ' || name || ' ' || link::text from public.chat_rooms where id = pg_temp.g('G')::uuid), 'group العام {"type": "all"}');
reset role;
select pg_temp.c('16 every account is a member, and nobody else',
  (select count(*) filter (where m.email is null) || ' ' || count(*) filter (where a.email is null)
   from public.accounts a full join (select email from public.chat_members where room_id = pg_temp.g('G')::uuid) m on m.email = a.email), '0 0');
select pg_temp.c('16b the account approved before it among them, and the founders',
  ((select count(*) from public.chat_members m join public.accounts a on a.email = m.email
    where m.room_id = pg_temp.g('G')::uuid and (a.email = 'early@t.test' or a.protected))
   = (select count(*) from public.accounts where email = 'early@t.test' or protected))::text, 'true');
select pg_temp.c('17 its opener has read it', (select string_agg(split_part(email,'@',1), ',') from public.chat_members where room_id = pg_temp.g('G')::uuid and last_read_at = now()), 'wri');
select pg_temp.c('17b everyone else has the line of its making to read',
  ((select count(*) from public.chat_members where room_id = pg_temp.g('G')::uuid and last_read_at = now() - interval '1 second')
   = (select count(*) - 1 from public.accounts))::text, 'true');
select pg_temp.c('18 nobody is its room administrator', (select count(*)::text from public.chat_members where room_id = pg_temp.g('G')::uuid and admin), '0');
select pg_temp.c('19 one line says it was made, by the writer',
  (select count(*)::text from public.chat_messages where room_id = pg_temp.g('G')::uuid and kind = 'sys' and data = '{"e":"created","type":"all"}')
  || ' ' || (select created_by from public.chat_rooms where id = pg_temp.g('G')::uuid), '1 wri@t.test');
delete from public.chat_members where room_id = pg_temp.g('G')::uuid and email = 'mem@t.test';
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
select pg_temp.c('20 the director opens it: the same room', (select (public.chat_global_room()::text = pg_temp.g('G'))::text), 'true');
reset role;
select pg_temp.c('21 still one, with one line of its making',
  pg_temp.global_count() || ' ' || (select count(*)::text from public.chat_messages where room_id = pg_temp.g('G')::uuid and kind = 'sys'), '1 1');
select pg_temp.c('22 an account missing from it was put back', (select count(*)::text from public.chat_members where room_id = pg_temp.g('G')::uuid and email = 'mem@t.test'), '1');
insert into public.accounts (email, display_name, role, pages, protected) values ('late@t.test','Late','writer','{}',false);
select pg_temp.c('23 an account approved later is in it at once', (select count(*)::text from public.chat_members where room_id = pg_temp.g('G')::uuid and email = 'late@t.test'), '1');
select pg_temp.t('24 a second «العام» cannot exist', $q$ insert into public.chat_rooms (type, name, link, created_by) values ('group','العام','{"type":"all"}','dir@t.test') $q$, 'ERR chat_rooms_one_global');
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000c2');
select pg_temp.t('25 nobody leaves it', $q$ select public.chat_member(pg_temp.g('G')::uuid, null, 'leave') $q$, 'ERR GLOBAL_ROOM');
select pg_temp.t('25b nor adds to it', $q$ select public.chat_member(pg_temp.g('G')::uuid, 'early@t.test', 'add') $q$, 'ERR GLOBAL_ROOM');
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
select pg_temp.t('25c nor removes from it, a leader included', $q$ select public.chat_member(pg_temp.g('G')::uuid, 'wri@t.test', 'remove') $q$, 'ERR GLOBAL_ROOM');
select pg_temp.who('00000000-0000-0000-0000-0000000000a1');
select pg_temp.t('25d nor does an administrator remove anyone', $q$ select public.chat_member(pg_temp.g('G')::uuid, 'wri@t.test', 'remove') $q$, 'ERR GLOBAL_ROOM');
select pg_temp.t('25e nor name its room administrators', $q$ select public.chat_member(pg_temp.g('G')::uuid, 'wri@t.test', 'admin') $q$, 'ERR GLOBAL_ROOM');
reset role;
select pg_temp.c('26 its members are unchanged',
  ((select count(*) from public.chat_members where room_id = pg_temp.g('G')::uuid) = (select count(*) from public.accounts))::text
  || ' ' || (select count(*)::text from public.chat_members where room_id = pg_temp.g('G')::uuid and admin), 'true 0');

-- 3. Push: a mention passes the mute of «العام» --------------------------------------------------------------------------
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000c3');
select pg_temp.t('27 the designer has a phone', $q$ insert into v values ('DES', public.device_register(null,'android','1.0.0',null,pg_temp.tok('des'))->>'id') $q$, 'ok');
select pg_temp.t('27b and mutes «العام»', $q$ select public.chat_state(pg_temp.g('G')::uuid, '{"muted":true}') $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-0000000000c7');
select pg_temp.t('27c the member has a phone and keeps «العام» on', $q$ insert into v values ('MEM', public.device_register(null,'android','1.0.0',null,pg_temp.tok('mem'))->>'id') $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-0000000000c2');
select pg_temp.t('28 a group of the writer and the designer', $q$ insert into v values ('G2', public.chat_create_room('group','فريق',null,array['des@t.test'],null)::text) $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-0000000000c3');
select pg_temp.t('28b which the designer mutes too', $q$ select public.chat_state(pg_temp.g('G2')::uuid, '{"muted":true}') $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-0000000000c2');
select pg_temp.t('29 g1 a plain message in «العام»', $q$ insert into v values ('g1', public.chat_send(pg_temp.g('G')::uuid,'text','صباح الخير',null,null,0::smallint,false)::text) $q$, 'ok');
select pg_temp.t('29b g2 mentions the designer in «العام»', $q$ insert into v values ('g2', public.chat_send(pg_temp.g('G')::uuid,'text','@Des هل التصميم جاهز؟',null,null,0::smallint,false)::text) $q$, 'ok');
select pg_temp.t('29c g3 mentions the member in «العام»', $q$ insert into v values ('g3', public.chat_send(pg_temp.g('G')::uuid,'text','شكراً @Mem',null,null,0::smallint,false)::text) $q$, 'ok');
select pg_temp.t('29d g4 mentions the designer in the muted group', $q$ insert into v values ('g4', public.chat_send(pg_temp.g('G2')::uuid,'text','@Des هل التصميم جاهز؟',null,null,0::smallint,false)::text) $q$, 'ok');
reset role;
select pg_temp.c('30 a mention passes the mute of «العام»; a plain message does not, and another room''s mute holds', pg_temp.rows('chat'), 'g2>des,g3>mem');
select pg_temp.c('30b both ask for attention', (select string_agg(distinct o.tier, ',') from public.push_outbox o where o.kind = 'chat'), 'attention');

-- 4. A work's own room ---------------------------------------------------------------------------------------------------
insert into public.works (id, no, title, type, due, created_by, assignee, people, restricted) values
 ('CH-999981', 999981, '  تغطية معرض الرياض الدولي للكتاب: لقاءات المؤلفين والناشرين وجلسات التوقيع والندوات', 'post', current_date + 30,
  'cre@t.test', 'wri@t.test', array['des@t.test'], false),
 ('CH-999982', 999982, 'عمل محجوب', 'press', current_date + 30, 'cre@t.test', 'wri@t.test', '{}', true);
insert into public.work_stages (work_id, pos, name, role, who) values
 ('CH-999981', 0, 'إنتاج', 'producer', 'pro@t.test'), ('CH-999981', 1, 'تصميم', 'designer', null);
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000c6');
select pg_temp.t('31 a writer not involved in the work is refused', $q$ select public.chat_work_room('CH-999981') $q$, 'ERR FORBIDDEN');
select pg_temp.who('00000000-0000-0000-0000-0000000000c7');
select pg_temp.t('31b so is a member', $q$ select public.chat_work_room('CH-999981') $q$, 'ERR FORBIDDEN');
select pg_temp.who('00000000-0000-0000-0000-0000000000e1');
select pg_temp.t('31c and a sign-in with no account', $q$ select public.chat_work_room('CH-999981') $q$, 'ERR FORBIDDEN');
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
select pg_temp.t('31d a work that does not exist is refused, to a leader too', $q$ select public.chat_work_room('CH-999989') $q$, 'ERR FORBIDDEN');
reset role;
select pg_temp.c('31e and nothing was made', (select count(*)::text from public.chat_rooms where link->>'type' = 'work'), '0');
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000c2');
select pg_temp.t('32 its assignee opens its room', $q$ insert into v values ('R1', public.chat_work_room('CH-999981')::text) $q$, 'ok');
select pg_temp.c('33 he sees a group named after the work, cut at 60 letters',
  (select r.type || ' ' || char_length(r.name) || ' ' || (r.name = left(btrim(w.title), 60))
   from public.chat_rooms r, public.works w where r.id = pg_temp.g('R1')::uuid and w.id = 'CH-999981'), 'group 60 true');
select pg_temp.c('34 linked to the work, marked as made by itself',
  (select (r.link->>'type') || ' ' || (r.link->>'id') || ' ' || (r.link->'auto')::text || ' ' || ((r.link->>'title') = left(w.title, 140))
   from public.chat_rooms r, public.works w where r.id = pg_temp.g('R1')::uuid and w.id = 'CH-999981'), 'work CH-999981 true true');
reset role;
select pg_temp.c('35 its members: the assignee (its opener and administrator), the creator, the people, the stage holder and the leaders',
  pg_temp.members('R1'), 'asst,cre,des,dir,pro,wri*');
select pg_temp.c('36 one line says it was made',
  (select count(*)::text from public.chat_messages where room_id = pg_temp.g('R1')::uuid and kind = 'sys' and data = '{"e":"created","type":"work"}'), '1');
insert into public.work_stages (work_id, pos, name, role, who) values ('CH-999981', 2, 'نشر', 'publisher', 'pub@t.test');
update public.works set people = '{}' where id = 'CH-999981';
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000b1');
select pg_temp.c('37 the assistant, a leader not involved, opens it: the same room', (select (public.chat_work_room('CH-999981')::text = pg_temp.g('R1'))::text), 'true');
select pg_temp.who('00000000-0000-0000-0000-0000000000c4');
select pg_temp.c('37b and the stage holder: the same room', (select (public.chat_work_room('CH-999981')::text = pg_temp.g('R1'))::text), 'true');
reset role;
select pg_temp.c('38 the new stage holder joined, and the designer, no longer among the people, stayed', pg_temp.members('R1'), 'asst,cre,des,dir,pro,pub,wri*');
select pg_temp.c('39 still one room of its own, with one line of its making',
  (select count(*)::text from public.chat_rooms where link->>'type' = 'work' and link->>'id' = 'CH-999981')
  || ' ' || (select count(*)::text from public.chat_messages where room_id = pg_temp.g('R1')::uuid and kind = 'sys'), '1 1');
select pg_temp.t('40 a second room of its own cannot exist',
  $q$ insert into public.chat_rooms (type, name, link, created_by) values ('group','x','{"type":"work","id":"CH-999981","auto":true}','dir@t.test') $q$, 'ERR chat_rooms_one_work_room');
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000c4');
select pg_temp.t('41 nobody leaves it', $q$ select public.chat_member(pg_temp.g('R1')::uuid, null, 'leave') $q$, 'ERR WORK_ROOM');
select pg_temp.who('00000000-0000-0000-0000-0000000000c2');
select pg_temp.t('41b nor is removed by its administrator', $q$ select public.chat_member(pg_temp.g('R1')::uuid, 'des@t.test', 'remove') $q$, 'ERR WORK_ROOM');
select pg_temp.t('42 its administrator adds a guest', $q$ select public.chat_member(pg_temp.g('R1')::uuid, 'out@t.test', 'add') $q$, 'ok');
select pg_temp.t('42b and names another administrator', $q$ select public.chat_member(pg_temp.g('R1')::uuid, 'pro@t.test', 'admin') $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-0000000000c3');
select pg_temp.t('42c someone who is not its administrator cannot add', $q$ select public.chat_member(pg_temp.g('R1')::uuid, 'mem@t.test', 'add') $q$, 'ERR ADMIN_ONLY');
reset role;
select pg_temp.c('43 the guest is in, the stage holder is an administrator', pg_temp.members('R1'), 'asst,cre,des,dir,out,pro*,pub,wri*');
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000c6');
select pg_temp.t('44 a restricted work is refused to someone who cannot see it', $q$ select public.chat_work_room('CH-999982') $q$, 'ERR FORBIDDEN');
select pg_temp.who('00000000-0000-0000-0000-0000000000c3');
select pg_temp.t('44b to the designer too', $q$ select public.chat_work_room('CH-999982') $q$, 'ERR FORBIDDEN');
select pg_temp.who('00000000-0000-0000-0000-0000000000c2');
select pg_temp.t('45 its assignee opens its room', $q$ insert into v values ('R2', public.chat_work_room('CH-999982')::text) $q$, 'ok');
reset role;
select pg_temp.c('45b with the creator and the leaders only', pg_temp.members('R2'), 'asst,cre,dir,wri*');

-- 5. chat_create_room keeps neither link ---------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000c2');
select pg_temp.t('46 a room asked for with the link of «العام»', $q$ insert into v values ('X1', public.chat_create_room('group','العام',null,array['des@t.test'],'{"type":"all"}')::text) $q$, 'ok');
select pg_temp.t('46b one with the link of a work''s own room', $q$ insert into v values ('X2', public.chat_create_room('group','غرفة',null,array['des@t.test'],'{"type":"work","id":"CH-999981","title":"x","auto":true}')::text) $q$, 'ok');
select pg_temp.t('46c one with "auto" and no work', $q$ insert into v values ('X3', public.chat_create_room('group','غرفة',null,array['des@t.test'],'{"type":"work","auto":true}')::text) $q$, 'ok');
reset role;
select pg_temp.c('47 the first keeps no link, the second the work without "auto", the third none',
  (select string_agg(coalesce(link::text, 'null'), ' | ' order by x.k) from public.chat_rooms r join v x on x.val = r.id::text where x.k in ('X1','X2','X3')),
  'null | {"id": "CH-999981", "type": "work", "title": "x"} | null');
select pg_temp.c('47b still one «العام» and one room of the work''s own',
  pg_temp.global_count() || ' ' || (select count(*)::text from public.chat_rooms where link->>'type' = 'work' and link->>'auto' = 'true' and link->>'id' = 'CH-999981'), '1 1');
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000c3');
select pg_temp.t('48 an ordinary group is left as before', $q$ select public.chat_member(pg_temp.g('G2')::uuid, null, 'leave') $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-0000000000c2');
select pg_temp.t('48b and its administrator removes from it as before', $q$ select public.chat_member(pg_temp.g('X2')::uuid, 'des@t.test', 'remove') $q$, 'ok');
reset role;
select pg_temp.c('48c both are gone', pg_temp.members('G2') || ' ' || pg_temp.members('X2'), 'wri* wri*');

-- 6. Who may call what -----------------------------------------------------------------------------------------------------
select pg_temp.c('49 anonymous callers cannot open either room',
  has_function_privilege('anon','public.chat_global_room()','execute') || ' ' || has_function_privilege('anon','public.chat_work_room(text)','execute'), 'false false');
select pg_temp.c('49b signed-in people can',
  has_function_privilege('authenticated','public.chat_global_room()','execute') || ' ' || has_function_privilege('authenticated','public.chat_work_room(text)','execute'), 'true true');
select pg_temp.c('49c the trigger and the push route are not callable through the API',
  has_function_privilege('authenticated','public.chat_global_join()','execute') || ' ' || has_function_privilege('authenticated','public.push_route_chat(uuid)','execute'), 'false false');
select pg_temp.c('49d the replaced functions keep their callers',
  has_function_privilege('authenticated','public.profile_update(jsonb)','execute') || ' ' || has_function_privilege('authenticated','public.chat_member(uuid,text,text)','execute')
  || ' ' || has_function_privilege('anon','public.profile_update(jsonb)','execute') || ' ' || has_function_privilege('anon','public.chat_member(uuid,text,text)','execute'),
  'true true false false');
select pg_temp.c('49e chat_send still calls the push route once',
  (select ((length(d) - length(replace(d, 'perform public.push_route_chat(mid);', ''))) / length('perform public.push_route_chat(mid);'))::text
   from (select pg_get_functiondef('public.chat_send(uuid,text,text,uuid,jsonb,smallint,boolean)'::regprocedure) d) x), '1');

select n, k, v, expect from r where v is distinct from expect
union all select 0, 'TOTAL', count(*)::text, (count(*) filter (where v is not distinct from expect))::text || ' passed' from r
order by n;
rollback;

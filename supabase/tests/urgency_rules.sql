-- Urgency 0 to 3 on messages (Permissions_Plan.md 7, Step P4), checked inside one
-- transaction that is rolled back at the end. Run with the Supabase SQL editor or the MCP
-- execute_sql tool. Throwaway accounts (@t.test) act through row level security. Covered:
-- level 1 for anyone, level 2 with and without the permission, a one-time level-2 grant used
-- exactly once, an ended temporary grant refused at use, a standing removal beating the role,
-- level 3 fixed (cannot be sent or granted), notices by tier, muted members skip levels 1
-- and 2 but not 3, acknowledgement only at level 3, the boolean form meaning level 3.
-- The last query lists only the checks that differ from the rule, and the total.
-- Result: qa/urgency-rules.json. Since 20261014090000_urgency_drop_urgent.sql the column
-- `urgent` is gone; checks 04 and 21b read `urgency` only.
begin;
create temp table r(n serial, k text, v text, expect text);
create temp table v(k text primary key, val text);
grant all on r, v to authenticated; grant usage on sequence r_n_seq to authenticated;
insert into public.accounts (email, display_name, role, pages, protected) values
 ('dir@t.test','Dir','director','{work,mail}',false),('asst@t.test','Asst','assistant','{work,mail}',false),
 ('wri@t.test','Wri','writer','{work,mail}',false),('des@t.test','Des','designer','{work}',false),('mem@t.test','Mem','member','{work}',false);
insert into auth.users (id, email, email_confirmed_at) values
 ('00000000-0000-0000-0000-0000000000d1','dir@t.test',now()),('00000000-0000-0000-0000-0000000000b1','asst@t.test',now()),
 ('00000000-0000-0000-0000-0000000000c1','wri@t.test',now()),('00000000-0000-0000-0000-0000000000c2','des@t.test',now()),
 ('00000000-0000-0000-0000-0000000000c5','mem@t.test',now());
create function pg_temp.who(id text) returns void language sql as $$ select set_config('request.jwt.claims', json_build_object('sub',id,'role','authenticated')::text, true) $$;
create function pg_temp.t(k text, sqltext text, e text) returns void language plpgsql as $$
begin
  begin execute sqltext; insert into r(k,v,expect) values (k,'ok',e);
  exception when others then insert into r(k,v,expect) values (k,'ERR '||sqlerrm,e); end;
end $$;
create function pg_temp.c(k text, val text, e text) returns void language sql as $$ insert into r(k,v,expect) values (k,val,e) $$;
create function pg_temp.g(k text) returns text language sql as $$ select val from v where k = $1 $$;
-- Who was told about a message whose text is p: recipient:tier, the throwaway accounts only.
create function pg_temp.told(p text) returns text language sql as $$
  select coalesce(string_agg(split_part(recipient,'@',1) || ':' || tier, ',' order by recipient), 'none')
  from public.notifications where recipient like '%@t.test' and body like '%' || p || '%' $$;
grant execute on function pg_temp.t(text,text,text), pg_temp.c(text,text,text), pg_temp.g(text), pg_temp.told(text) to authenticated;
set local role authenticated;

-- A group of five; the member mutes it -------------------------------------------
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
select pg_temp.t('01 the director opens a group of five', $q$ insert into v values ('room', public.chat_create_room('group','غرفة الدرجات',null,array['asst@t.test','wri@t.test','des@t.test','mem@t.test'],null)::text) $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-0000000000c5');
select pg_temp.t('02 the member mutes it', $q$ select public.chat_state(pg_temp.g('room')::uuid, '{"muted":true}') $q$, 'ok');

-- Level 1: anyone ------------------------------------------------------------------
select pg_temp.who('00000000-0000-0000-0000-0000000000c1');
select pg_temp.t('03 a writer sends level 1', $q$ insert into v values ('m1', public.chat_send(pg_temp.g('room')::uuid,'text','نص-درجة-1',null,null,1::smallint,false)::text) $q$, 'ok');
select pg_temp.c('04 stored as level 1', (select urgency::text from public.chat_messages where id = pg_temp.g('m1')::uuid), '1');
reset role;
select pg_temp.c('05 level 1 tells the members as «انتباه», not the author, not the muted member', pg_temp.told('نص-درجة-1'), 'asst:attention,des:attention,dir:attention');
select pg_temp.c('05b worded with the level', (select count(*)::text from public.notifications where recipient = 'dir@t.test' and body like '«للانتباه» من Wri في «غرفة الدرجات»: نص-درجة-1.'), '1');
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000c5');
select pg_temp.t('06 the member sends level 1 too', $q$ select public.chat_send(pg_temp.g('room')::uuid,'text','نص-عضو-1',null,null,1::smallint,false) $q$, 'ok');

-- Level 2: by permission -------------------------------------------------------------
select pg_temp.who('00000000-0000-0000-0000-0000000000c1');
select pg_temp.t('07 a writer without the permission cannot send level 2', $q$ select public.chat_send(pg_temp.g('room')::uuid,'text','نص-ممنوع-2',null,null,2::smallint,false) $q$, 'ERR URGENCY_2');
select pg_temp.c('07b and nothing of it was stored', (select count(*)::text from public.chat_messages where body = 'نص-ممنوع-2'), '0');
select pg_temp.who('00000000-0000-0000-0000-0000000000b1');
select pg_temp.t('08 the assistant sends level 2 (role template)', $q$ insert into v values ('m2', public.chat_send(pg_temp.g('room')::uuid,'text','نص-درجة-2',null,null,2::smallint,false)::text) $q$, 'ok');
reset role;
select pg_temp.c('09 level 2 tells as «انتباه», muted member skipped', pg_temp.told('نص-درجة-2'), 'des:attention,dir:attention,wri:attention');
select pg_temp.c('09b worded «مهم»', (select count(*)::text from public.notifications where recipient = 'wri@t.test' and body like '«مهم» من Asst في «غرفة الدرجات»: نص-درجة-2.'), '1');
set local role authenticated;

-- A one-time level-2 grant, used exactly once ---------------------------------------
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
select pg_temp.t('10 the director gives the writer «مهم» once', $q$ insert into v values ('g1', public.grant_capability('wri@t.test','urgency.2','once',null,1,null,'تجربة الدرجات')::text) $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-0000000000c1');
select pg_temp.t('11 the writer sends level 2 once', $q$ select public.chat_send(pg_temp.g('room')::uuid,'text','نص-مرة-2',null,null,2::smallint,false) $q$, 'ok');
select pg_temp.t('12 and not a second time', $q$ select public.chat_send(pg_temp.g('room')::uuid,'text','نص-ثانية-2',null,null,2::smallint,false) $q$, 'ERR URGENCY_2');
reset role;
select pg_temp.c('13 the grant has no use left and one use is logged', (select uses_left::text from public.member_capabilities where id = pg_temp.g('g1')::uuid)
  || ' ' || (select count(*)::text from public.permission_events where subject = 'wri@t.test' and capability = 'urgency.2' and kind = 'use'), '0 1');
set local role authenticated;

-- An ended temporary grant is refused at use; a standing removal beats the role ------
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
select pg_temp.t('14 the director gives the designer «مهم» for an hour', $q$ insert into v values ('g2', public.grant_capability('des@t.test','urgency.2','timed',now() + interval '1 hour',null,null,'ساعة')::text) $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-0000000000c2');
select pg_temp.t('15 within the hour the designer sends level 2', $q$ select public.chat_send(pg_temp.g('room')::uuid,'text','نص-مؤقت-2',null,null,2::smallint,false) $q$, 'ok');
reset role;
update public.member_capabilities set expires_at = now() - interval '1 minute' where id = pg_temp.g('g2')::uuid;
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000c2');
select pg_temp.t('16 after its end, refused', $q$ select public.chat_send(pg_temp.g('room')::uuid,'text','نص-منته-2',null,null,2::smallint,false) $q$, 'ERR URGENCY_2');
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
select pg_temp.t('17 the director stops «مهم» for the assistant', $q$ select public.set_member_override('asst@t.test','urgency.2','deny','تجربة') $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-0000000000b1');
select pg_temp.t('18 the assistant can no longer send level 2', $q$ select public.chat_send(pg_temp.g('room')::uuid,'text','نص-مسحوب-2',null,null,2::smallint,false) $q$, 'ERR URGENCY_2');

-- Level 3: fixed ---------------------------------------------------------------------
select pg_temp.who('00000000-0000-0000-0000-0000000000c1');
select pg_temp.t('19 a writer cannot send level 3', $q$ select public.chat_send(pg_temp.g('room')::uuid,'text','نص-كاتب-3',null,null,3::smallint,false) $q$, 'ERR URGENT_ROLE');
select pg_temp.t('19b nor through the boolean form', $q$ select public.chat_send(pg_temp.g('room')::uuid,'text','نص-كاتب-ب',null,null,true,false) $q$, 'ERR URGENT_ROLE');
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
select pg_temp.t('20 level 3 cannot be granted', $q$ select public.grant_capability('wri@t.test','urgency.3','once',null,1,null,'x') $q$, 'ERR CAP_FIXED');
select pg_temp.t('21 the director sends level 3', $q$ insert into v values ('m3', public.chat_send(pg_temp.g('room')::uuid,'text','نص-درجة-3',null,null,3::smallint,false)::text) $q$, 'ok');
select pg_temp.c('21b stored as level 3; the author counts as acknowledged',
  (select urgency::text from public.chat_messages where id = pg_temp.g('m3')::uuid) || ' ' || (select count(*) from public.chat_acks where message_id = pg_temp.g('m3')::uuid), '3 1');
reset role;
select pg_temp.c('22 level 3 tells every member as «قرارك», the muted member too', pg_temp.told('نص-درجة-3'), 'asst:decide,des:decide,mem:decide,wri:decide');
select pg_temp.c('22b and asks for the acknowledgement', (select count(*)::text from public.notifications where recipient = 'mem@t.test' and body like '«عاجل» من Dir في «غرفة الدرجات»، ويطلب إقرارك بالاستلام: نص-درجة-3.'), '1');
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
select pg_temp.t('22c the boolean form still means level 3', $q$ insert into v values ('mb', public.chat_send(pg_temp.g('room')::uuid,'text','نص-منطقي',null,null,true,false)::text) $q$, 'ok');
select pg_temp.c('22d stored as level 3', (select urgency::text from public.chat_messages where id = pg_temp.g('mb')::uuid), '3');

-- A refused card uses nothing ---------------------------------------------------------
select pg_temp.t('23 the director gives the writer «مهم» once again', $q$ insert into v values ('g3', public.grant_capability('wri@t.test','urgency.2','once',null,1,null,'مرة أخرى')::text) $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-0000000000c1');
select pg_temp.t('23b a level-2 poll with one option is refused', $q$ select public.chat_send(pg_temp.g('room')::uuid,'poll','',null,'{"q":"سؤال","options":["واحد"]}',2::smallint,false) $q$, 'ERR POLL_INVALID');
reset role;
select pg_temp.c('23c the one-time grant is still unused', (select uses_left::text from public.member_capabilities where id = pg_temp.g('g3')::uuid), '1');
set local role authenticated;

-- Acknowledgement only at level 3 -------------------------------------------------------
select pg_temp.who('00000000-0000-0000-0000-0000000000c5');
select pg_temp.t('24 the member acknowledges level 3', $q$ select public.chat_toggle(pg_temp.g('m3')::uuid,'ack',null) $q$, 'ok');
select pg_temp.t('25 not level 2', $q$ select public.chat_toggle(pg_temp.g('m2')::uuid,'ack',null) $q$, 'ERR FORBIDDEN');
select pg_temp.t('26 not level 1', $q$ select public.chat_toggle(pg_temp.g('m1')::uuid,'ack',null) $q$, 'ERR FORBIDDEN');
select pg_temp.c('27 two acknowledgements on level 3', (select count(*)::text from public.chat_acks where message_id = pg_temp.g('m3')::uuid), '2');

-- Level 0 and out of range ---------------------------------------------------------------
select pg_temp.who('00000000-0000-0000-0000-0000000000c2');
select pg_temp.t('28 level 0 is an ordinary message', $q$ select public.chat_send(pg_temp.g('room')::uuid,'text','نص-درجة-0',null,null,0::smallint,false) $q$, 'ok');
reset role;
select pg_temp.c('29 and tells nobody', pg_temp.told('نص-درجة-0'), 'none');
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
select pg_temp.t('30 a level above 3 is refused', $q$ select public.chat_send(pg_temp.g('room')::uuid,'text','x',null,null,4::smallint,false) $q$, 'ERR BAD_URGENCY');
select pg_temp.t('31 so is a negative level', $q$ select public.chat_send(pg_temp.g('room')::uuid,'text','x',null,null,(-1)::smallint,false) $q$, 'ERR BAD_URGENCY');
reset role;

select * from (
  select n, k, v, expect from r where v is distinct from expect
  union all select 0, 'TOTAL', count(*)::text, (count(*) filter (where v is not distinct from expect))::text || ' passed' from r) z order by n;
rollback;

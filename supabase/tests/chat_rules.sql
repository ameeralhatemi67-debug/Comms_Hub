-- Messaging and profile rules, checked inside one transaction that is rolled back.
-- Expected (2026-10-12): 1 ok, 2 1, 3 0, 4 ERR CHANNEL_ROLE, 5 ok, 6 ERR CHANNEL_POST,
-- 7 ok, 8 ok, 9 ERR URGENT_ROLE, 10 ERR TASK_ROLE, 11 ok, 12 ok, 12b done, 13 ok, 14 ok,
-- 14b 1, 15 ERR EDIT_WINDOW, 16 ERR FORBIDDEN, 17 ok, 17b كاتب جديد, 18 0, 19 ERR FORBIDDEN.
begin;
create temp table r(n serial, k text, v text);
grant all on r to authenticated; grant usage on sequence r_n_seq to authenticated;
insert into public.accounts (email, display_name, role) values
 ('dir@t.test','Dir','director'),('wri@t.test','Wri','writer'),('pub@t.test','Pub','publisher'),('mem@t.test','Mem','member');
insert into auth.users (id, email, email_confirmed_at) values
 ('00000000-0000-0000-0000-00000000d001','dir@t.test',now()),('00000000-0000-0000-0000-00000000b001','wri@t.test',now()),
 ('00000000-0000-0000-0000-00000000c001','pub@t.test',now()),('00000000-0000-0000-0000-00000000e001','mem@t.test',now());
create function pg_temp.who(id text) returns void language sql as $$ select set_config('request.jwt.claims', json_build_object('sub',id,'role','authenticated')::text, true) $$;
create function pg_temp.t(k text, sqltext text) returns void language plpgsql as $$
begin
  begin execute sqltext; insert into r(k,v) values (k,'ok');
  exception when others then insert into r(k,v) values (k,'ERR '||sqlerrm); end;
end $$;
grant execute on function pg_temp.t(text,text) to authenticated;
create temp table ids(k text primary key, id uuid);
grant all on ids to authenticated;

set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-00000000b001');
select pg_temp.t('1 writer opens dm', $q$ insert into ids values ('dm', public.chat_open_dm('dir@t.test')) $q$);
select pg_temp.who('00000000-0000-0000-0000-00000000d001');
insert into r(k,v) select '2 director sees dm', count(*)::text from public.chat_rooms where id=(select id from ids where k='dm');
select pg_temp.who('00000000-0000-0000-0000-00000000c001');
insert into r(k,v) select '3 publisher sees dm', count(*)::text from public.chat_rooms where id=(select id from ids where k='dm');
select pg_temp.who('00000000-0000-0000-0000-00000000b001');
select pg_temp.t('4 writer creates channel', $q$ select public.chat_create_room('channel','x',null,array['dir@t.test'],null) $q$);
select pg_temp.who('00000000-0000-0000-0000-00000000d001');
select pg_temp.t('5 director creates channel', $q$ insert into ids values ('ch', public.chat_create_room('channel','إعلانات',null,array['wri@t.test','pub@t.test'],null)) $q$);
select pg_temp.who('00000000-0000-0000-0000-00000000b001');
select pg_temp.t('6 writer posts in channel', $q$ select public.chat_send((select id from ids where k='ch'),'text','مرحبا',null,null,false,false) $q$);
select pg_temp.who('00000000-0000-0000-0000-00000000d001');
select pg_temp.t('7 director urgent', $q$ insert into ids values ('urg', public.chat_send((select id from ids where k='ch'),'text','اجتماع',null,null,true,false)) $q$);
select pg_temp.who('00000000-0000-0000-0000-00000000b001');
select pg_temp.t('8 writer acks', $q$ select public.chat_toggle((select id from ids where k='urg'),'ack',null) $q$);
select pg_temp.t('9 writer urgent in dm', $q$ select public.chat_send((select id from ids where k='dm'),'text','x',null,null,true,false) $q$);
select pg_temp.t('10 writer task', $q$ select public.chat_send((select id from ids where k='dm'),'task','',null,'{"what":"x","assignee":"dir@t.test","due":"2026-12-01T10:00:00Z"}',false,false) $q$);
select pg_temp.who('00000000-0000-0000-0000-00000000d001');
select pg_temp.t('11 director task to writer', $q$ insert into ids values ('task', public.chat_send((select id from ids where k='dm'),'task','',null,'{"what":"العنوان","assignee":"wri@t.test","due":"2026-12-01T10:00:00Z"}',false,false)) $q$);
select pg_temp.who('00000000-0000-0000-0000-00000000b001');
select pg_temp.t('12 writer done', $q$ select public.chat_card((select id from ids where k='task'),'done',null) $q$);
insert into r(k,v) select '12b card', data->>'state' from public.chat_messages where id=(select id from ids where k='task');
select pg_temp.who('00000000-0000-0000-0000-00000000d001');
select pg_temp.t('13 director poll', $q$ insert into ids values ('poll', public.chat_send((select id from ids where k='dm'),'poll','',null,'{"q":"أي يوم؟","options":["الأحد","الاثنين"],"multi":false}',false,false)) $q$);
select pg_temp.who('00000000-0000-0000-0000-00000000b001');
select pg_temp.t('14 writer votes twice', $q$ select public.chat_toggle((select id from ids where k='poll'),'vote','0'), public.chat_toggle((select id from ids where k='poll'),'vote','1') $q$);
insert into r(k,v) select '14b one vote kept', count(*)::text from public.chat_votes where message_id=(select id from ids where k='poll');
select pg_temp.t('15 writer edits director message', $q$ select public.chat_edit((select id from ids where k='urg'),'تعديل') $q$);
select pg_temp.t('16 writer deletes director message', $q$ select public.chat_delete((select id from ids where k='poll')) $q$);
select pg_temp.t('17 writer profile', $q$ select public.profile_update('{"display_name":"كاتب جديد","presence":"busy","headline":"العناوين والنصوص"}') $q$);
insert into r(k,v) select '17b name', display_name from public.accounts where email='wri@t.test';
select pg_temp.who('00000000-0000-0000-0000-00000000e001');
insert into r(k,v) select '18 member reads others reactions', count(*)::text from public.chat_messages where room_id=(select id from ids where k='dm');
select pg_temp.t('19 member sends to dm', $q$ select public.chat_send((select id from ids where k='dm'),'text','x',null,null,false,false) $q$);
reset role;
select k, v from r order by n;
rollback;

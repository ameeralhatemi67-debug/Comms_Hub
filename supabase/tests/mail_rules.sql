-- Mail rules, checked inside one transaction that is rolled back at the end.
-- Run with the Supabase SQL editor or the MCP execute_sql tool. It creates throwaway
-- accounts (@t.test), acts as each of them, and lists what the database allowed.
-- Expected (2026-10-11): 1 ok, 2 ok, 2b held, 3 ERR TASK_ROLE, 4 ERR FORBIDDEN,
-- 5 ERR FORBIDDEN, 6 0, 7 1, 8 0, 9 2, 10 ok, 10b outbox, 11 ok, 12 ok, 12b 50,
-- 13 ERR TASK_TERMS_LOCKED, 14 ok, 14b done, 15 ok, 15b 0, 16 ok, 16b 184 pub@t.test,
-- 17 ERR FORBIDDEN, 18 ok, 18b true.
begin;
create temp table r(n serial, k text, v text);
grant all on r to authenticated; grant usage on sequence r_n_seq to authenticated;
insert into public.accounts (email, display_name, role) values
 ('dir@t.test','Dir','director'),('asst@t.test','Asst','assistant'),('wri@t.test','Wri','writer'),
 ('pub@t.test','Pub','publisher'),('mem@t.test','Mem','member'),('pro@t.test','Pro','producer');
insert into auth.users (id, email, email_confirmed_at) values
 ('00000000-0000-0000-0000-00000000d001','dir@t.test',now()),('00000000-0000-0000-0000-00000000a001','asst@t.test',now()),
 ('00000000-0000-0000-0000-00000000b001','wri@t.test',now()),('00000000-0000-0000-0000-00000000c001','pub@t.test',now()),
 ('00000000-0000-0000-0000-00000000e001','mem@t.test',now()),('00000000-0000-0000-0000-00000000f001','pro@t.test',now());
create function pg_temp.who(id text) returns void language sql as $$ select set_config('request.jwt.claims', json_build_object('sub',id,'role','authenticated')::text, true) $$;
create function pg_temp.t(k text, sqltext text) returns void language plpgsql as $$
begin
  begin execute sqltext; insert into r(k,v) values (k,'ok');
  exception when others then insert into r(k,v) values (k,'ERR '||sqlerrm); end;
end $$;
grant execute on function pg_temp.t(text,text) to authenticated;

set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-00000000b001');
select pg_temp.t('1 writer internal send', $q$ create temp table w1 as select public.mail_send(null,'داخلي',array['p:dir@t.test'],null,null,'مرحبا',null,null,null,null,null,false) j $q$);
select pg_temp.t('2 writer external new = held', $q$ create temp table w2 as select public.mail_send(null,'خارجي',array['e:x@out.sa'],null,null,'نص',null,null,null,null,null,false) j $q$);
insert into r(k,v) select '2b state', j->>'state' from w2;
select pg_temp.t('3 writer task card refused', $q$ select public.mail_send(null,'مهمة',array['p:dir@t.test'],null,null,'ن',null,null,'{"type":"task","what":"x","assignee":"dir@t.test","due":"2026-12-01T10:00:00Z"}',null,null,false) $q$);
select pg_temp.t('4 writer cannot approve held', $q$ select public.mail_hold_act((select (j->>'message')::uuid from w2),'approve',null) $q$);
select pg_temp.t('5 server fn without key', $q$ select public.mail_ingest('wrong','{}') $q$);
select pg_temp.who('00000000-0000-0000-0000-00000000c001');
insert into r(k,v) select '6 publisher sees internal?', count(*)::text from public.mail_threads where id=(select (j->>'thread')::uuid from w1);
insert into r(k,v) select '7 publisher sees external?', count(*)::text from public.mail_threads where id=(select (j->>'thread')::uuid from w2);
select pg_temp.who('00000000-0000-0000-0000-00000000e001');
insert into r(k,v) select '8 member sees any', count(*)::text from public.mail_threads where id in ((select (j->>'thread')::uuid from w1),(select (j->>'thread')::uuid from w2));
select pg_temp.who('00000000-0000-0000-0000-00000000d001');
insert into r(k,v) select '9 director sees both', count(*)::text from public.mail_threads where id in ((select (j->>'thread')::uuid from w1),(select (j->>'thread')::uuid from w2));
select pg_temp.t('10 director approves held', $q$ select public.mail_hold_act((select (j->>'message')::uuid from w2),'approve',null) $q$);
insert into r(k,v) select '10b state now', state from public.mail_messages where id=(select (j->>'message')::uuid from w2);
select pg_temp.t('11 director task card', $q$ create temp table w3 as select public.mail_send(null,'مهمة',array['p:wri@t.test'],null,null,'رجاء',null,null,'{"type":"task","what":"كتابة العنوان","assignee":"wri@t.test","due":"2026-12-01T10:00:00Z"}',null,null,false) j $q$);
select pg_temp.who('00000000-0000-0000-0000-00000000b001');
select pg_temp.t('12 writer progress 50', $q$ select public.mail_card_act((select (j->>'message')::uuid from w3),'progress','50') $q$);
insert into r(k,v) select '12b card progress', card->>'progress' from public.mail_messages where id=(select (j->>'message')::uuid from w3);
select pg_temp.t('13 writer moves own deadline', $q$ update public.media_tasks set due = due + interval '3 days' where id=(select (card->>'task_id')::uuid from public.mail_messages where id=(select (j->>'message')::uuid from w3)) $q$);
select pg_temp.t('14 writer done', $q$ select public.mail_card_act((select (j->>'message')::uuid from w3),'done',null) $q$);
insert into r(k,v) select '14b card state', card->>'state' from public.mail_messages where id=(select (j->>'message')::uuid from w3);
select pg_temp.t('15 writer schedules', $q$ create temp table w4 as select public.mail_send(null,'لاحقاً',array['p:dir@t.test'],null,null,'غداً',null,null,null,now()+interval '1 day',null,false) j $q$);
select pg_temp.who('00000000-0000-0000-0000-00000000d001');
insert into r(k,v) select '15b director sees scheduled msg', count(*)::text from public.mail_messages where id=(select (j->>'message')::uuid from w4);
select pg_temp.t('16 director assigns', $q$ select public.mail_handle((select (j->>'thread')::uuid from w2), null, 'pub@t.test') $q$);
insert into r(k,v) select '16b req', req_no::text||' '||assignee from public.mail_threads where id=(select (j->>'thread')::uuid from w2);
select pg_temp.who('00000000-0000-0000-0000-00000000e001');
select pg_temp.t('17 member handle refused', $q$ select public.mail_handle((select (j->>'thread')::uuid from w2), 'closed', null) $q$);
select pg_temp.who('00000000-0000-0000-0000-00000000b001');
select pg_temp.t('18 writer state rpc', $q$ select public.mail_state(array[(select (j->>'thread')::uuid from w1)], '{"starred":true,"read":true}') $q$);
insert into r(k,v) select '18b starred', starred::text from public.mail_members where thread_id=(select (j->>'thread')::uuid from w1) and email='wri@t.test';
reset role;
select k, v from r order by n;
rollback;

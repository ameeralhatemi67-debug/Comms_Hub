-- Entry flow (Readiness_Audit.md section 2, migration 20261014130000_entry_flow.sql):
-- invitation rules, what an administrator sees of a person's entry, access-request answers
-- that do not reveal who has an account, the cooldown and hourly allowance, and the
-- server-key gate on who is told about a request. One transaction, rolled back at the end.
-- The three real founding administrators are in the table too, so checks that list people
-- filter to the test addresses. Result: qa/entry-rules.json.
begin;
create temp table r(n serial, k text, v text, expect text);
grant all on r to public; grant usage on sequence r_n_seq to public;
insert into public.accounts (email, display_name, role, pages, protected) values
 ('adm@t.test','Adm','admin','{}',true),('dir@t.test','Dir','director','{}',false),
 ('wri@t.test','Wri','writer','{}',false),('new@t.test','New','writer','{}',false),
 ('asst@t.test','Asst','assistant','{}',false);
insert into auth.users (id, email, email_confirmed_at, last_sign_in_at) values
 ('00000000-0000-0000-0000-0000000000a1','adm@t.test',now(),now()),
 ('00000000-0000-0000-0000-0000000000d1','dir@t.test',now(),now()),
 ('00000000-0000-0000-0000-0000000000c1','wri@t.test',now(),now()),
 ('00000000-0000-0000-0000-0000000000e1','asst@t.test',now(),null);
insert into public.mail_server_key (id, key_hash) values (1, encode(sha256(convert_to('k-entry-run-only', 'UTF8')), 'hex'))
  on conflict (id) do update set key_hash = excluded.key_hash;
create function pg_temp.who(id text) returns void language sql as $$ select set_config('request.jwt.claims', json_build_object('sub',id,'role','authenticated')::text, true) $$;
create function pg_temp.t(k text, sqltext text, e text) returns void language plpgsql as $$
begin
  begin execute sqltext; insert into r(k,v,expect) values (k,'ok',e);
  exception when others then insert into r(k,v,expect) values (k,'ERR '||sqlerrm,e); end;
end $$;
create function pg_temp.c(k text, val text, e text) returns void language sql as $$ insert into r(k,v,expect) values (k,val,e) $$;
grant execute on function pg_temp.who(text), pg_temp.t(text,text,text), pg_temp.c(text,text,text) to public;
set local role authenticated;

-- Who may see and send invitations -----------------------------------------------------------
select pg_temp.who('00000000-0000-0000-0000-0000000000c1');
select pg_temp.t('01 a writer cannot read entry states', $q$ select * from public.entry_states() $q$, 'ERR FORBIDDEN');
select pg_temp.t('02 nor invite', $q$ select public.invite_prepare('new@t.test') $q$, 'ERR FORBIDDEN');
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
select pg_temp.c('03 the director sees the four states',
  (select string_agg(email || ':' || state, ',' order by email) from public.entry_states() where email like '%@t.test'),
  'adm@t.test:active,asst@t.test:confirmed,dir@t.test:active,new@t.test:not_started,wri@t.test:active');
select pg_temp.c('04 inviting a person who never started returns the name and the state',
  (public.invite_prepare('new@t.test')->>'name') || ':' || (public.invite_prepare('new@t.test')->>'state'), 'New:not_started');
select pg_temp.t('05 the director cannot invite an administrator', $q$ select public.invite_prepare('adm@t.test') $q$, 'ERR NOT_MANAGEABLE');
select pg_temp.t('06 nor themselves', $q$ select public.invite_prepare('dir@t.test') $q$, 'ERR SELF_EDIT');
select pg_temp.t('07 nor someone who already signed in', $q$ select public.invite_prepare('wri@t.test') $q$, 'ERR ALREADY_ACTIVE');
select pg_temp.t('08 marking the invitation sent', $q$ select public.invite_mark('new@t.test') $q$, 'ok');
select pg_temp.t('09 a second invitation within a minute is refused', $q$ select public.invite_prepare('new@t.test') $q$, 'ERR INVITE_TOO_SOON');
select pg_temp.c('10 the account records the invitation',
  (select invite_count::text || ':' || coalesce(invited_by, '-') from public.accounts where email = 'new@t.test'), '1:dir@t.test');
select pg_temp.c('11 and the log has one invite line for that person',
  (select count(*)::text from public.permission_events where kind = 'invite' and subject = 'new@t.test'), '1');
select pg_temp.t('12 a reset sent by the director is logged', $q$ select public.entry_help_log('new@t.test', 'reset') $q$, 'ok');
select pg_temp.t('13 an unknown kind is refused', $q$ select public.entry_help_log('new@t.test', 'other') $q$, 'ERR BAD_KIND');
select pg_temp.who('00000000-0000-0000-0000-0000000000e1');
select pg_temp.t('14 an assistant without «إضافة الأعضاء» cannot invite', $q$ select public.invite_prepare('new@t.test') $q$, 'ERR FORBIDDEN');

-- Access requests, as a visitor with no sign-in ----------------------------------------------
reset role; set local role anon;
select pg_temp.c('15 an address that already has an account gets the plain answer', public.request_access('wri@t.test', 'Someone', null), 'received');
select pg_temp.c('16 a new address gets the same answer', public.request_access('stranger@t.test', 'Stranger', 'hello'), 'received');
select pg_temp.c('17 asking again while pending gets the same answer', public.request_access('stranger@t.test', 'Stranger', 'hello'), 'received');
select pg_temp.t('18 a bad address is still refused', $q$ select public.request_access('nope', 'X', null) $q$, 'ERR INVALID_EMAIL');
select pg_temp.t('19 email_status is closed to a visitor', $q$ select public.email_status('wri@t.test') $q$, 'ERR permission denied for function email_status');

-- The notice to the leaders --------------------------------------------------------------------
reset role;
select pg_temp.c('22 one notice each for the administrator and the director, none for the writer',
  (select string_agg(recipient, ',' order by recipient) from public.notifications where body like '%stranger@t.test%' and recipient like '%@t.test'), 'adm@t.test,dir@t.test');
select pg_temp.c('23 the notice leads to the requests tab',
  (select distinct go::text from public.notifications where body like '%stranger@t.test%')::text, '{"tab": "requests", "page": "members"}');
set local role anon;
select pg_temp.t('24 a wrong server key gets nothing', $q$ select * from public.entry_notice_targets('wrong', 'stranger@t.test') $q$, 'ERR FORBIDDEN');
select pg_temp.c('25 the right key gets the two recipients once',
  (select string_agg(to_email, ',' order by to_email) from public.entry_notice_targets('k-entry-run-only', 'stranger@t.test') where to_email like '%@t.test'), 'adm@t.test,dir@t.test');
select pg_temp.c('26 and nothing the second time',
  (select count(*)::text from public.entry_notice_targets('k-entry-run-only', 'stranger@t.test')), '0');

-- Rejection, its notice, the cooldown ------------------------------------------------------------
reset role; set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
select pg_temp.t('27 the director rejects the request', $q$ select public.reject_request((select id from public.access_requests where email = 'stranger@t.test')) $q$, 'ok');
select pg_temp.c('28 the notice names the person once', public.request_reject_notice('stranger@t.test')::text, '{"name": "Stranger"}');
select pg_temp.c('29 and not again', coalesce(public.request_reject_notice('stranger@t.test')::text, 'null'), 'null');
select pg_temp.who('00000000-0000-0000-0000-0000000000c1');
select pg_temp.t('30 a writer cannot ask for the notice', $q$ select public.request_reject_notice('stranger@t.test') $q$, 'ERR FORBIDDEN');
reset role; set local role anon;
select pg_temp.c('31 the same address waits a day after a rejection', public.request_access('stranger@t.test', 'Stranger', null), 'cooldown');
reset role;
insert into public.access_requests (email, full_name, status, created_at)
  select 'bulk' || g || '@t.test', 'Bulk', 'pending', now() from generate_series(1, 30) g;
set local role anon;
select pg_temp.c('32 more than thirty in an hour is held back', public.request_access('late@t.test', 'Late', null), 'busy');

reset role;
select * from (
  select n, k, v, expect from r where not (v = expect or (expect like 'ERR %' and v like expect || '%'))
  union all select 0, 'TOTAL', count(*)::text, (count(*) filter (where v = expect or (expect like 'ERR %' and v like expect || '%')))::text || ' passed' from r) z order by n;
rollback;

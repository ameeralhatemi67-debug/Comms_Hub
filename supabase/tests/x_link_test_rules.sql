-- MVP_draft.md section 83 (migration 20261126120000_x_link_tests.sql): «تجربة النشر بالرابط». Who may record a test of an X account on the link route
-- (those who manage accounts and the account's own publishers, nobody else), that only a post of that account's own handle is accepted whatever
-- the letters, that a test is refused on an account that is not on the link route or is stopped, that the day's limit holds, that a test never
-- uses up a work's link, and what a page may read, call and write. Only throwaway accounts (@t.test) are touched. One transaction, rolled
-- back at the end. Result: qa/x-link-test-rules.json.
begin;
create temp table r(n serial, k text, v text, expect text);
create temp table v(k text primary key, val text);
grant all on r, v to authenticated; grant usage on sequence r_n_seq to authenticated;
insert into public.accounts (email, display_name, role, protected) values
 ('dir@t.test','Dir','director',false),('wri@t.test','Wri','writer',false),('pub@t.test','Pub','publisher',false),
 ('pub2@t.test','Pub2','publisher',false),('mem@t.test','Mem','member',false);
insert into auth.users (id, email, email_confirmed_at) values
 ('00000000-0000-0000-0000-00000000d001','dir@t.test',now()),('00000000-0000-0000-0000-00000000b001','wri@t.test',now()),
 ('00000000-0000-0000-0000-00000000c001','pub@t.test',now()),('00000000-0000-0000-0000-00000000c002','pub2@t.test',now()),
 ('00000000-0000-0000-0000-00000000e001','mem@t.test',now());
insert into public.platforms (key, label_ar, kind, sort, enabled) values ('x', 'X', 'social', 2, true) on conflict (key) do nothing;
insert into public.platforms (key, label_ar, kind, sort, enabled) values ('instagram', 'إنستغرام', 'social', 1, true) on conflict (key) do nothing;
create function pg_temp.who(id text) returns void language sql as $$ select set_config('request.jwt.claims', json_build_object('sub',id,'role','authenticated')::text, true) $$;
create function pg_temp.t(k text, sqltext text, e text) returns void language plpgsql as $$
begin
  begin execute sqltext; insert into r(k,v,expect) values (k,'ok',e);
  exception when others then insert into r(k,v,expect) values (k,'ERR '||sqlerrm,e); end;
end $$;
create function pg_temp.c(k text, val text, e text) returns void language sql as $$ insert into r(k,v,expect) values (k,val,e) $$;
create function pg_temp.g(k text) returns text language sql as $$ select val from v where k = $1 $$;
grant execute on function pg_temp.who(text), pg_temp.t(text,text,text), pg_temp.c(text,text,text), pg_temp.g(text) to authenticated;
set local role authenticated;

-- 1. The accounts ------------------------------------------------------------------------------------------------------------
select pg_temp.who('00000000-0000-0000-0000-00000000d001');
select pg_temp.t('01 the director adds an X account on the link route, a simulated X account and an Instagram one', $q$
  insert into v select 'lk', public.account_add_link('الرسمي', '@T_X', array['pub@t.test'])::text
  union all select 'sim', public.account_save(null, '{"platform":"x","label":"تجريبي","handle":"@t_sim","publishers":["pub@t.test"],"mode":"auto"}')::text
  union all select 'ig', public.account_save(null, '{"platform":"instagram","label":"الرسمي","handle":"@t.ig","publishers":["pub@t.test"],"mode":"auto"}')::text $q$, 'ok');

-- 2. Who may record ----------------------------------------------------------------------------------------------------------
select pg_temp.t('02 the director records a test with a post already on X, nothing published', $q$
  insert into v select 'd1', public.x_link_test_record(pg_temp.g('lk')::uuid, 'https://x.com/T_X/status/1234567890123456789', 'existing')::text $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-00000000c001');
select pg_temp.t('03 a publisher of the account records one with a test post', $q$
  insert into v select 'p1', public.x_link_test_record(pg_temp.g('lk')::uuid, 'https://x.com/T_X/status/2234567890123456789', 'new')::text $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-00000000c002');
select pg_temp.t('04 a publisher who is not on the account may not', $q$ select public.x_link_test_record(pg_temp.g('lk')::uuid, 'https://x.com/T_X/status/3234567890123456789', 'new') $q$, 'ERR FORBIDDEN');
select pg_temp.who('00000000-0000-0000-0000-00000000e001');
select pg_temp.t('05 a member may not', $q$ select public.x_link_test_record(pg_temp.g('lk')::uuid, 'https://x.com/T_X/status/3234567890123456789', 'new') $q$, 'ERR FORBIDDEN');
select pg_temp.who('00000000-0000-0000-0000-00000000b001');
select pg_temp.t('06 a writer may not', $q$ select public.x_link_test_record(pg_temp.g('lk')::uuid, 'https://x.com/T_X/status/3234567890123456789', 'new') $q$, 'ERR FORBIDDEN');

-- 3. What a link must be -----------------------------------------------------------------------------------------------------
select pg_temp.who('00000000-0000-0000-0000-00000000c001');
select pg_temp.t('07 another account''s post is refused', $q$ select public.x_link_test_record(pg_temp.g('lk')::uuid, 'https://x.com/someone/status/1234567890123456789', 'existing') $q$, 'ERR POST_LINK_OTHER_ACCOUNT');
select pg_temp.t('08 a link that is not a post is refused', $q$ select public.x_link_test_record(pg_temp.g('lk')::uuid, 'https://example.com/T_X/status/1234567890123456789', 'existing') $q$, 'ERR POST_LINK_INVALID');
select pg_temp.t('09 so is an empty one', $q$ select public.x_link_test_record(pg_temp.g('lk')::uuid, '   ', 'existing') $q$, 'ERR POST_LINK_INVALID');
select pg_temp.t('10 and a missing one', $q$ select public.x_link_test_record(pg_temp.g('lk')::uuid, null, 'existing') $q$, 'ERR POST_LINK_INVALID');
select pg_temp.t('11 the kind of test is one of two', $q$ select public.x_link_test_record(pg_temp.g('lk')::uuid, 'https://x.com/T_X/status/1234567890123456789', 'silent') $q$, 'ERR TEST_INVALID');
select pg_temp.t('12 and is given', $q$ select public.x_link_test_record(pg_temp.g('lk')::uuid, 'https://x.com/T_X/status/1234567890123456789', null) $q$, 'ERR TEST_INVALID');
select pg_temp.t('13 the letters of the handle do not matter, nor the host, nor the tracking after the link', $q$
  insert into v select 'p2', public.x_link_test_record(pg_temp.g('lk')::uuid, ' https://twitter.com/t_x/status/4234567890123456789?s=20 ', 'existing')::text $q$, 'ok');
select pg_temp.t('14 an account that is not on the link route is refused: a simulated X account', $q$ select public.x_link_test_record(pg_temp.g('sim')::uuid, 'https://x.com/t_sim/status/1234567890123456789', 'existing') $q$, 'ERR FORBIDDEN');
select pg_temp.t('15 and an Instagram one', $q$ select public.x_link_test_record(pg_temp.g('ig')::uuid, 'https://x.com/t.ig/status/1234567890123456789', 'existing') $q$, 'ERR FORBIDDEN');
select pg_temp.t('16 and an account that does not exist', $q$ select public.x_link_test_record('00000000-0000-0000-0000-0000000000ff', 'https://x.com/T_X/status/1234567890123456789', 'existing') $q$, 'ERR FORBIDDEN');
reset role;
select pg_temp.c('17 what is kept: the kind, the number, the address as X shows it (no tracking, the handle''s own letters), and who', (select mode || ' ' || post_id || ' ' || post_url || ' ' || created_by
  from public.x_link_tests where id = pg_temp.g('p2')::uuid), 'existing 4234567890123456789 https://x.com/t_x/status/4234567890123456789 pub@t.test');

-- 4. What each may read ------------------------------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-00000000d001');
select pg_temp.c('18 the director reads every test of the account', (select count(*)::text from public.x_link_tests), '3');
select pg_temp.who('00000000-0000-0000-0000-00000000c001');
select pg_temp.c('19 so does its publisher', (select count(*)::text from public.x_link_tests), '3');
select pg_temp.who('00000000-0000-0000-0000-00000000c002');
select pg_temp.c('20 a publisher who is not on it reads none', (select count(*)::text from public.x_link_tests), '0');
select pg_temp.who('00000000-0000-0000-0000-00000000e001');
select pg_temp.c('21 nor does a member', (select count(*)::text from public.x_link_tests), '0');

-- 5. The day's limit, a stopped account, the work's link ---------------------------------------------------------------------
select pg_temp.who('00000000-0000-0000-0000-00000000d001');
select pg_temp.t('22 up to twenty tests an account in a day (three are recorded; seventeen more)', $q$ do $d$ begin
  for i in 1..17 loop perform public.x_link_test_record(pg_temp.g('lk')::uuid, 'https://x.com/T_X/status/5234567890123456789', 'existing'); end loop; end $d$ $q$, 'ok');
select pg_temp.t('23 the twenty-first is refused', $q$ select public.x_link_test_record(pg_temp.g('lk')::uuid, 'https://x.com/T_X/status/5234567890123456789', 'existing') $q$, 'ERR TEST_LIMIT');
reset role;
select pg_temp.c('24 and twenty are kept', (select count(*)::text from public.x_link_tests where account_id = pg_temp.g('lk')::uuid), '20');
update public.x_link_tests set created_at = now() - interval '2 days';
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-00000000d001');
select pg_temp.t('25 the next day it may be done again', $q$ select public.x_link_test_record(pg_temp.g('lk')::uuid, 'https://x.com/T_X/status/6234567890123456789', 'new') $q$, 'ok');
reset role;
update public.platform_accounts set active = false where id = pg_temp.g('lk')::uuid;
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-00000000d001');
select pg_temp.t('26 a stopped account is not tested', $q$ select public.x_link_test_record(pg_temp.g('lk')::uuid, 'https://x.com/T_X/status/7234567890123456789', 'existing') $q$, 'ERR ACCOUNT_OFF');
reset role;
update public.platform_accounts set active = true where id = pg_temp.g('lk')::uuid;
select pg_temp.c('27 a test uses up no work''s link: the same post is still free for a work', (select count(*)::text from public.works x, jsonb_each(x.results) e where e.value->>'url' like 'https://x.com/T_X/status/%'), '0');

-- 6. What a page may read, call and write ------------------------------------------------------------------------------------
select pg_temp.c('28 a signed-in page reads the tests and records one', (has_table_privilege('authenticated', 'public.x_link_tests', 'select')
  and has_function_privilege('authenticated', 'public.x_link_test_record(uuid, text, text)', 'execute'))::text, 'true');
select pg_temp.c('29 nobody signed out does', (has_table_privilege('anon', 'public.x_link_tests', 'select') or has_function_privilege('anon', 'public.x_link_test_record(uuid, text, text)', 'execute')
  or has_function_privilege('anon', 'public.x_link_test_may(uuid)', 'execute'))::text, 'false');
select pg_temp.c('30 a page writes no test itself: not an insert, an update, nor a delete', (has_table_privilege('authenticated', 'public.x_link_tests', 'insert')
  or has_table_privilege('authenticated', 'public.x_link_tests', 'update') or has_table_privilege('authenticated', 'public.x_link_tests', 'delete'))::text, 'false');
select pg_temp.c('31 the pattern of a post''s link is still not callable from outside', has_function_privilege('authenticated', 'public.x_post_parse(text)', 'execute')::text, 'false');
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-00000000d001');
select pg_temp.t('32 and the director cannot write one directly either', $q$ insert into public.x_link_tests (account_id, mode, post_id, post_url, created_by)
  values (pg_temp.g('lk')::uuid, 'existing', '1234567890', 'https://x.com/T_X/status/1234567890', 'dir@t.test') $q$, 'ERR permission denied for table x_link_tests');
reset role;
select pg_temp.t('33 the table refuses a link that is not a post even from inside', $q$ insert into public.x_link_tests (account_id, mode, post_id, post_url, created_by)
  values (pg_temp.g('lk')::uuid, 'existing', '1234567890', 'https://example.com/T_X/status/1234567890', 'dir@t.test') $q$, 'ERR new row for relation "x_link_tests" violates check constraint "x_link_tests_post_url_check"');

-- 7. An account taken away takes its tests with it ---------------------------------------------------------------------------
select pg_temp.t('34 the account is removed with its tests', $q$ delete from public.platform_accounts where id = pg_temp.g('lk')::uuid $q$, 'ok');
select pg_temp.c('35 and none is left', (select count(*)::text from public.x_link_tests), '0');

select n, k, v, expect from r where v is distinct from expect
union all select 0, 'TOTAL', count(*)::text, (count(*) filter (where v is not distinct from expect))::text || ' passed' from r
order by n;
rollback;

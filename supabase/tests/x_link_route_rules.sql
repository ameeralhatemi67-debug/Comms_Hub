-- MVP_draft.md section 81 (migration 20261125120000_work_cycle_x_link_route.sql): X's link route. Who may add an X account for the link route and what
-- it must be; that «نشر الآن» and the due run do not simulate such an account but make it wait (the work is «جارٍ النشر») and tell its
-- publishers; that only a publisher of the work may confirm, with a link that is a post of that account's own handle, used once; that
-- «لم يُنشر» and the retry work; that accounts that are not on the link route are exactly as before; and what a page may read and call.
-- Only throwaway accounts (@t.test) are touched. One transaction, rolled back at the end. Result: qa/x-link-route-rules.json.
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

-- 1. Adding an X account for the link route ----------------------------------------------------------------------------------
select pg_temp.who('00000000-0000-0000-0000-00000000d001');
select pg_temp.t('01 the director adds an X account for the link route', $q$
  insert into v select 'lk', public.account_add_link('الرسمي', '@T_X', array['pub@t.test','pub2@t.test','mem@t.test','nobody@t.test'])::text $q$, 'ok');
select pg_temp.t('02 and a simulated X account and an Instagram one the old way', $q$
  insert into v select 'sim', public.account_save(null, '{"platform":"x","label":"تجريبي","handle":"@t_sim","publishers":["pub@t.test","pub2@t.test"],"mode":"auto"}')::text
  union all select 'ig', public.account_save(null, '{"platform":"instagram","label":"الرسمي","handle":"@t.ig","publishers":["pub@t.test"],"mode":"auto"}')::text $q$, 'ok');
select pg_temp.t('03 the same handle in other letters is taken', $q$ select public.account_add_link('آخر', 't_x', array['pub@t.test']) $q$, 'ERR HANDLE_TAKEN');
select pg_temp.t('04 a handle that is not X''s', $q$ select public.account_add_link('آخر', 'two words', array['pub@t.test']) $q$, 'ERR HANDLE_INVALID');
select pg_temp.t('05 nor one longer than fifteen', $q$ select public.account_add_link('آخر', 'abcdefghijklmnop', array['pub@t.test']) $q$, 'ERR HANDLE_INVALID');
select pg_temp.t('06 a name is required', $q$ select public.account_add_link('   ', 'someone', array['pub@t.test']) $q$, 'ERR LABEL_REQUIRED');
select pg_temp.t('07 and someone who publishes (a member is not one)', $q$ select public.account_add_link('آخر', 'someone', array['mem@t.test']) $q$, 'ERR PUBLISHER_REQUIRED');
select pg_temp.who('00000000-0000-0000-0000-00000000c001');
select pg_temp.t('08 a publisher may not add accounts', $q$ select public.account_add_link('آخر', 'someone', array['pub@t.test']) $q$, 'ERR FORBIDDEN');
reset role;
select pg_temp.c('09 kept as asked: link, X, with the handle''s @, no authorisation to run out, asks at the time', (select route || ' ' || platform || ' ' || handle || ' ' || (authorized_until is null)::text || ' ' || mode
  || ' ' || cardinality(publishers)::text from public.platform_accounts where id = pg_temp.g('lk')::uuid), 'link x @T_X true ask 2');
select pg_temp.c('10 an account added the old way is on the API route', (select string_agg(route, ',' order by label) from public.platform_accounts where id in (pg_temp.g('sim')::uuid, pg_temp.g('ig')::uuid)), 'api,api');
select pg_temp.t('11 only an X account can be on the link route', $q$ update public.platform_accounts set route = 'link' where id = pg_temp.g('ig')::uuid $q$, 'ERR new row for relation "platform_accounts" violates check constraint "platform_accounts_link_only_x"');
select pg_temp.c('12 the publishers were told', (select count(*)::text from public.notifications where recipient = 'pub@t.test' and body like '%للنشر بالرابط%'), '1');

-- Works placed straight in the states the send step starts from.
insert into public.works (id, no, title, type, status, created_by, assignee, due, channels, pub_mode, sched_at) values
 ('CH-9201', 9201, 'منشور على X بالرابط', 'post', 'APPROVED', 'wri@t.test', 'wri@t.test', current_date + 5, array[pg_temp.g('lk')::uuid], 'auto', null),
 ('CH-9202', 9202, 'منشور على حسابين', 'post', 'APPROVED', 'wri@t.test', 'wri@t.test', current_date + 5, array[pg_temp.g('lk')::uuid, pg_temp.g('sim')::uuid], 'auto', null),
 ('CH-9203', 9203, 'منشور لا يُنشر ثم يعاد', 'post', 'APPROVED', 'wri@t.test', 'wri@t.test', current_date + 5, array[pg_temp.g('lk')::uuid], 'auto', null),
 ('CH-9204', 9204, 'منشور حان موعده', 'post', 'SCHEDULED', 'wri@t.test', 'wri@t.test', current_date + 5, array[pg_temp.g('lk')::uuid], 'auto', now() - interval '1 hour'),
 ('CH-9205', 9205, 'منشور على حساب تجريبي', 'post', 'APPROVED', 'wri@t.test', 'wri@t.test', current_date + 5, array[pg_temp.g('sim')::uuid], 'auto', null),
 ('CH-9206', 9206, 'منشور على حساب موقوف', 'post', 'APPROVED', 'wri@t.test', 'wri@t.test', current_date + 5, array[pg_temp.g('lk')::uuid], 'auto', null),
 ('CH-9207', 9207, 'منشور ثانٍ برابط مستعمل', 'post', 'APPROVED', 'wri@t.test', 'wri@t.test', current_date + 5, array[pg_temp.g('lk')::uuid], 'auto', null);
insert into public.work_texts (work_id, n, body, author)
  select id, 1, 'نص المنشور', 'wri@t.test' from public.works where id between 'CH-9201' and 'CH-9207';

-- 2. «نشر الآن»: the link account waits ------------------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-00000000c001');
select pg_temp.t('13 published now', $q$ select public.work_publish('CH-9201', 'now') $q$, 'ok');
reset role;
select pg_temp.c('14 the work is «جارٍ النشر», not published', (select status from public.works where id = 'CH-9201'), 'PUBLISHING');
select pg_temp.c('15 the account''s result is waiting, not a success or a failure', (select (results->pg_temp.g('lk')->>'ok') || ' ' || (results->pg_temp.g('lk')->>'pending') || ' ' || (results->pg_temp.g('lk')->>'route')
  from public.works where id = 'CH-9201'), 'false true link');
select pg_temp.c('16 the log says it waits, and that it was not simulated', (select count(*)::text from public.work_log where work_id = 'CH-9201' and type = 'publish'
  and text like '%بانتظار النشر بالرابط%' and (data->>'simulated') = 'false'), '1');
select pg_temp.c('17 the writer''s notice says it waits', (select count(*)::text from public.notifications where recipient = 'wri@t.test'
  and body like '«منشور على X بالرابط»: جارٍ النشر. بانتظار النشر بالرابط: X · الرسمي.'), '1');
select pg_temp.c('18 the other publisher is asked', (select count(*)::text from public.notifications where recipient = 'pub2@t.test' and tier = 'attention'
  and body like '«منشور على X بالرابط» ينتظر نشرك على X بالرابط%'), '1');

-- 3. The confirmation ------------------------------------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-00000000b001');
select pg_temp.t('19 a writer may not confirm', $q$ select public.work_link_confirm('CH-9201', pg_temp.g('lk')::uuid, 'https://x.com/T_X/status/1234567890123456789', true) $q$, 'ERR FORBIDDEN');
select pg_temp.who('00000000-0000-0000-0000-00000000c001');
select pg_temp.t('20 a link that is not a post is refused', $q$ select public.work_link_confirm('CH-9201', pg_temp.g('lk')::uuid, 'https://example.com/T_X/status/1234567890123456789', true) $q$, 'ERR POST_LINK_INVALID');
select pg_temp.t('21 nor a post with no number', $q$ select public.work_link_confirm('CH-9201', pg_temp.g('lk')::uuid, 'https://x.com/T_X/status/abc', true) $q$, 'ERR POST_LINK_INVALID');
select pg_temp.t('22 nor the account''s page', $q$ select public.work_link_confirm('CH-9201', pg_temp.g('lk')::uuid, 'https://x.com/T_X', true) $q$, 'ERR POST_LINK_INVALID');
select pg_temp.t('23 a post of another account is refused', $q$ select public.work_link_confirm('CH-9201', pg_temp.g('lk')::uuid, 'https://x.com/someone/status/1234567890123456789', true) $q$, 'ERR POST_LINK_OTHER_ACCOUNT');
reset role;
select pg_temp.c('24 the refusals logged nothing', (select count(*)::text from public.work_log where work_id = 'CH-9201' and text like 'نُشر بالرابط%'), '0');
select pg_temp.c('25 still waiting after the refusals', (select status || ' ' || (results->pg_temp.g('lk')->>'pending') from public.works where id = 'CH-9201'), 'PUBLISHING true');
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-00000000c001');
select pg_temp.t('26 the account''s own post, from the old domain, in other letters, with a tracking tail', $q$
  insert into v select 'st1', public.work_link_confirm('CH-9201', pg_temp.g('lk')::uuid, ' https://twitter.com/t_x/status/1234567890123456789?s=20 ', true) $q$, 'ok');
reset role;
select pg_temp.c('27 the work is published', (select status from public.works where id = 'CH-9201'), 'PUBLISHED');
select pg_temp.c('28 the result keeps the post''s link, as typed in its handle, on x.com', (select (results->pg_temp.g('lk')->>'ok') || ' ' || (results->pg_temp.g('lk')->>'url') || ' ' || coalesce(results->pg_temp.g('lk')->>'pending', 'no-pending')
  from public.works where id = 'CH-9201'), 'true https://x.com/t_x/status/1234567890123456789 no-pending');
select pg_temp.c('29 the log says who''s post and where', (select count(*)::text from public.work_log where work_id = 'CH-9201' and type = 'publish'
  and text = 'نُشر بالرابط على X · الرسمي: https://x.com/t_x/status/1234567890123456789'), '1');
select pg_temp.c('30 the writer is told it is published', (select count(*)::text from public.notifications where recipient = 'wri@t.test' and body = '«منشور على X بالرابط»: منشور.'), '1');
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-00000000c001');
select pg_temp.t('31 a confirmed work cannot be confirmed again', $q$ select public.work_link_confirm('CH-9201', pg_temp.g('lk')::uuid, 'https://x.com/t_x/status/1234567890123456780', true) $q$, 'ERR STATUS_DENIED');

-- 4. A link is used once ---------------------------------------------------------------------------------------------------------
select pg_temp.t('32 another work publishes now', $q$ select public.work_publish('CH-9207', 'now') $q$, 'ok');
select pg_temp.t('33 and cannot use the link already used', $q$ select public.work_link_confirm('CH-9207', pg_temp.g('lk')::uuid, 'https://x.com/t_x/status/1234567890123456789', true) $q$, 'ERR POST_LINK_USED');
select pg_temp.t('34 a different post is accepted', $q$ select public.work_link_confirm('CH-9207', pg_temp.g('lk')::uuid, 'https://x.com/t_x/status/1234567890123456788/photo/1', true) $q$, 'ok');
reset role;
select pg_temp.c('35 and kept without the photo''s tail', (select results->pg_temp.g('lk')->>'url' from public.works where id = 'CH-9207'), 'https://x.com/t_x/status/1234567890123456788');

-- 5. Two accounts, a retry, and «لم يُنشر» -----------------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-00000000c001');
select pg_temp.t('36 a work on a link account and a simulated one', $q$ select public.work_publish('CH-9202', 'now') $q$, 'ok');
reset role;
select pg_temp.c('37 the simulated one succeeded, the link one waits, and the work is «جارٍ النشر» until the link one is settled', (select status || ' ' || (results->pg_temp.g('sim')->>'ok') || ' ' || (results->pg_temp.g('lk')->>'pending') from public.works where id = 'CH-9202'), 'PUBLISHING true true');
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-00000000c001');
select pg_temp.t('38 a retry is not offered while one waits', $q$ select public.work_publish('CH-9202', 'retry') $q$, 'ERR STATUS_DENIED');
select pg_temp.t('39 it was not posted', $q$ select public.work_link_confirm('CH-9202', pg_temp.g('lk')::uuid, null, false) $q$, 'ok');
reset role;
select pg_temp.c('40 partly published, with the reason', (select status || ' ' || (results->pg_temp.g('lk')->>'ok') || ' ' || (results->pg_temp.g('lk')->>'why') from public.works where id = 'CH-9202'), 'PARTIAL false لم يُنشر بالرابط');
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-00000000c001');
select pg_temp.t('41 the retry sends the failed account again, and it waits again', $q$ select public.work_publish('CH-9202', 'retry') $q$, 'ok');
reset role;
select pg_temp.c('42 waiting again, the simulated one untouched', (select status || ' ' || (results->pg_temp.g('lk')->>'pending') || ' ' || (results->pg_temp.g('sim')->>'ok') from public.works where id = 'CH-9202'), 'PUBLISHING true true');
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-00000000c001');
select pg_temp.t('43 posted this time', $q$ select public.work_link_confirm('CH-9202', pg_temp.g('lk')::uuid, 'https://x.com/t_x/status/1234567890123456700', true) $q$, 'ok');
reset role;
select pg_temp.c('44 published', (select status from public.works where id = 'CH-9202'), 'PUBLISHED');
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-00000000c001');
select pg_temp.t('45 a work with only a link account that was not posted', $q$ select public.work_publish('CH-9203', 'now') $q$, 'ok');
select pg_temp.t('46 is told not posted', $q$ select public.work_link_confirm('CH-9203', pg_temp.g('lk')::uuid, '', false) $q$, 'ok');
reset role;
select pg_temp.c('47 and failed', (select status from public.works where id = 'CH-9203'), 'FAILED');

-- 6. The due run and the accounts that are not on the link route ----------------------------------------------------------------
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-00000000c001');
select pg_temp.t('48 the due run publishes a scheduled work', $q$ select public.work_due_run() $q$, 'ok');
reset role;
select pg_temp.c('49 a scheduled work on a link account waits at its time', (select status || ' ' || (results->pg_temp.g('lk')->>'pending') from public.works where id = 'CH-9204'), 'PUBLISHING true');
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-00000000c001');
select pg_temp.t('50 a simulated X account publishes as before', $q$ select public.work_publish('CH-9205', 'now') $q$, 'ok');
reset role;
select pg_temp.c('51 published at once, nothing waiting', (select status || ' ' || (results->pg_temp.g('sim')->>'ok') || ' ' || coalesce(results->pg_temp.g('sim')->>'pending', 'no-pending') from public.works where id = 'CH-9205'), 'PUBLISHED true no-pending');
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-00000000d001');
select pg_temp.t('49b an account a waiting work depends on cannot be stopped', $q$ select public.account_set_active(pg_temp.g('lk')::uuid, false) $q$, 'ERR ACCOUNT_IN_USE');
select pg_temp.t('49c nor deleted', $q$ select public.account_delete(pg_temp.g('lk')::uuid) $q$, 'ERR ACCOUNT_IN_USE');
reset role;
update public.platform_accounts set active = false where id = pg_temp.g('lk')::uuid;
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-00000000c001');
select pg_temp.t('52 a stopped link account is not sent to', $q$ select public.work_publish('CH-9206', 'now') $q$, 'ok');
reset role;
select pg_temp.c('53 it fails and does not wait', (select status || ' ' || (results->pg_temp.g('lk')->>'ok') || ' ' || coalesce(results->pg_temp.g('lk')->>'pending', 'no-pending') from public.works where id = 'CH-9206'), 'FAILED false no-pending');
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-00000000c001');
select pg_temp.t('54 nothing to confirm on a work that is not waiting', $q$ select public.work_link_confirm('CH-9205', pg_temp.g('sim')::uuid, 'https://x.com/t_sim/status/1234567890123456789', true) $q$, 'ERR FORBIDDEN');
select pg_temp.t('55 nor on an account that is not on the link route', $q$ select public.work_link_confirm('CH-9202', pg_temp.g('sim')::uuid, 'https://x.com/t_sim/status/1234567890123456789', true) $q$, 'ERR FORBIDDEN');
select pg_temp.t('56 nor an account that is not the work''s', $q$ select public.work_link_confirm('CH-9204', pg_temp.g('sim')::uuid, 'https://x.com/t_sim/status/1234567890123456789', true) $q$, 'ERR FORBIDDEN');

-- 7. What a page may read and call -----------------------------------------------------------------------------------------------
select pg_temp.c('57 a page reads an account''s route', has_column_privilege('authenticated', 'public.platform_accounts', 'route', 'select')::text, 'true');
select pg_temp.c('58 a signed-in page adds a link account and confirms a post', (has_function_privilege('authenticated', 'public.account_add_link(text, text, text[])', 'execute')
  and has_function_privilege('authenticated', 'public.work_link_confirm(text, uuid, text, boolean)', 'execute'))::text, 'true');
select pg_temp.c('59 nobody signed out does', (has_function_privilege('anon', 'public.account_add_link(text, text, text[])', 'execute')
  or has_function_privilege('anon', 'public.work_link_confirm(text, uuid, text, boolean)', 'execute'))::text, 'false');
select pg_temp.c('60 the pattern of a post''s link is not callable from outside', has_function_privilege('authenticated', 'public.x_post_parse(text)', 'execute')::text, 'false');
select pg_temp.t('61 nobody writes the route directly', $q$ do $d$ begin set local role authenticated; update public.platform_accounts set route = 'api' where id = pg_temp.g('lk')::uuid; exception when others then null; end $d$ $q$, 'ok');
reset role;
select pg_temp.c('62 so it stays as it was', (select route from public.platform_accounts where id = pg_temp.g('lk')::uuid), 'link');

select n, k, v, expect from r where v is distinct from expect
union all select 0, 'TOTAL', count(*)::text, (count(*) filter (where v is not distinct from expect))::text || ' passed' from r
order by n;
rollback;

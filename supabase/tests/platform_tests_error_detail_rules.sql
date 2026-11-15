-- MVP_draft.md section 79.6 (migration 20261115140000_platform_tests_error_detail.sql): what the platform said, kept beside a failed
-- test. Only its author's server, with the key, right after the failure; only a code line; once. Only throwaway accounts (@t.test).
-- One transaction, rolled back at the end. Result: qa/platform-tests-error-detail-rules.json.
begin;
create temp table r(n serial, k text, v text, expect text);
create temp table v(k text primary key, val text);
grant all on r, v to public; grant usage on sequence r_n_seq to public;
insert into public.accounts (email, display_name, role, pages, protected) values
 ('dir@t.test','Dir','director','{}',false),('pub@t.test','Pub','publisher','{}',false);
insert into auth.users (id, email, email_confirmed_at) values
 ('00000000-0000-0000-0000-0000000000c2','dir@t.test',now()),('00000000-0000-0000-0000-0000000000c4','pub@t.test',now());
insert into public.mail_server_key (id, key_hash) values (1, encode(sha256(convert_to('k-ed-run-only', 'UTF8')), 'hex'))
  on conflict (id) do update set key_hash = excluded.key_hash;
insert into public.platforms (key, label_ar, kind, sort, enabled) values ('tiktok', 'تيك توك', 'social', 3, true) on conflict (key) do update set enabled = true;
with i as (insert into public.integrations (kind, type, label, state, created_by) values ('platform','tiktok_user','الحساب','connected','dir@t.test') returning id),
     a as (insert into public.platform_accounts (platform, label, handle, publishers, added_by, conn_kind, conn_state, external_id, integration_id, authorized_until)
           select 'tiktok', 'حساب', 'tt:x', array['pub@t.test'], 'dir@t.test', 'oauth', 'connected', '-000detailtest', i.id, now() + interval '365 days' from i returning id)
insert into v select 'tt', id::text from a;
create function pg_temp.who(id text) returns void language sql as $$ select set_config('request.jwt.claims', json_build_object('sub',id,'role','authenticated')::text, true) $$;
create function pg_temp.t(k text, sqltext text, e text) returns void language plpgsql as $$
begin
  begin execute sqltext; insert into r(k,v,expect) values (k,'ok',e);
  exception when others then insert into r(k,v,expect) values (k,'ERR '||sqlerrm,e); end;
end $$;
create function pg_temp.c(k text, val text, e text) returns void language sql as $$ insert into r(k,v,expect) values (k,val,e) $$;
create function pg_temp.g(k text) returns text language sql as $$ select val from v where k = $1 $$;
grant execute on function pg_temp.who(text), pg_temp.t(text,text,text), pg_temp.c(text,text,text), pg_temp.g(text) to public;
set local role authenticated;

select pg_temp.who('00000000-0000-0000-0000-0000000000c4');
select pg_temp.t('01 a post started', $q$ insert into v select 'p1', public.platform_test_start(pg_temp.g('tt')::uuid, jsonb_build_object('kind','tt_post','privacy','private','title','x','source','device','size',1000,'mime','video/mp4')) $q$, 'ok');
select pg_temp.t('02 nothing kept while it is still going', $q$ select public.platform_test_failed_detail('k-ed-run-only', pg_temp.g('p1')::uuid, 'tiktok early http 403') $q$, 'ok');
reset role;
select pg_temp.c('03 so nothing was written', (select coalesce(error_detail, 'none') from public.platform_tests where id = pg_temp.g('p1')::uuid), 'none');
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000c4');
select pg_temp.t('04 it fails with the site''s code', $q$ select public.platform_test_failed('k-ed-run-only', pg_temp.g('p1')::uuid, 'TT_UNAUDITED') $q$, 'ok');
select pg_temp.t('05 the server key is needed', $q$ select public.platform_test_failed_detail('wrong-key', pg_temp.g('p1')::uuid, 'tiktok x http 403') $q$, 'ERR FORBIDDEN');
select pg_temp.t('06 a message is not a code line', $q$ select public.platform_test_failed_detail('k-ed-run-only', pg_temp.g('p1')::uuid, 'Please <b>review</b> our guidelines!') $q$, 'ERR TEST_INVALID');
select pg_temp.who('00000000-0000-0000-0000-0000000000c2');
select pg_temp.t('07 someone else''s server call changes nothing', $q$ select public.platform_test_failed_detail('k-ed-run-only', pg_temp.g('p1')::uuid, 'tiktok forged http 500') $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-0000000000c4');
select pg_temp.t('08 its author''s server keeps TikTok''s line', $q$ select public.platform_test_failed_detail('k-ed-run-only', pg_temp.g('p1')::uuid, 'tiktok unaudited_client_can_only_post_to_private_accounts log 202611151842436E093E9C1F146C37F821 http 403') $q$, 'ok');
select pg_temp.t('09 once only', $q$ select public.platform_test_failed_detail('k-ed-run-only', pg_temp.g('p1')::uuid, 'tiktok second http 500') $q$, 'ok');
select pg_temp.c('10 the publisher reads it in the list', (select error || ' | ' || error_detail from public.platform_tests where id = pg_temp.g('p1')::uuid),
  'TT_UNAUDITED | tiktok unaudited_client_can_only_post_to_private_accounts log 202611151842436E093E9C1F146C37F821 http 403');
reset role;
select pg_temp.c('11 a page may read the column', (select has_column_privilege('authenticated','public.platform_tests','error_detail','select')::text), 'true');
select pg_temp.c('12 and may not write it', (select has_column_privilege('authenticated','public.platform_tests','error_detail','update')::text), 'false');
select pg_temp.c('13 signed out, the function is closed', (select has_function_privilege('anon','public.platform_test_failed_detail(text, uuid, text)','execute')::text), 'false');

select n, k, v, expect from r where v is distinct from expect
union all select 0, 'TOTAL', count(*)::text, (count(*) filter (where v is not distinct from expect))::text || ' passed' from r
order by n;
rollback;

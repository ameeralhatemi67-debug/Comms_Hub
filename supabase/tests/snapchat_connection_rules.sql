-- MVP_draft.md section 84 (migration 20261126150000_snapchat_connection.sql): Snapchat's connection. The Snap app (a client id and its secret) is entered by
-- the Director and by nobody else, a Snapchat sign-in is kept as a passing offer owned by the person, a Snapchat profile is linked as an account with the
-- token in the vault and its expiry, the offer goes with the pick, the account is in the due list and the reset knows the platform; the lists that were
-- widened still accept every older type and refuse an unknown one; and no secret reaches anything a person can read. One transaction, rolled back at the end;
-- the site's server key is replaced by a throwaway inside it only. Every secret string carries a marker so a leak can be searched for.
-- Result: qa/snapchat-connection-rules.json.
begin;
create temp table r(n serial, k text, v text, expect text);
create temp table v(k text primary key, val text);
grant all on r, v to public; grant usage on sequence r_n_seq to public;
insert into public.accounts (email, display_name, role, pages, protected) values
 ('adm@t.test','Adm','admin','{}',true),('dir@t.test','Dir','director','{}',false),
 ('asst@t.test','Asst','assistant','{}',false),('wri@t.test','Wri','writer','{}',false),('pub@t.test','Pub','publisher','{}',false);
insert into auth.users (id, email, email_confirmed_at) values
 ('00000000-0000-0000-0000-0000000000a1','adm@t.test',now()),('00000000-0000-0000-0000-0000000000d1','dir@t.test',now()),
 ('00000000-0000-0000-0000-0000000000b1','asst@t.test',now()),('00000000-0000-0000-0000-0000000000c1','wri@t.test',now()),
 ('00000000-0000-0000-0000-0000000000e1','pub@t.test',now());
insert into public.mail_server_key (id, key_hash) values (1, encode(sha256(convert_to('k-rule-run-only', 'UTF8')), 'hex'))
  on conflict (id) do update set key_hash = excluded.key_hash;
insert into public.platforms (key, label_ar, kind, sort, enabled) values ('snapchat', 'سناب شات', 'social', 6, true) on conflict (key) do update set enabled = true;
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

-- 1. The app: who enters it, and what is kept -------------------------------------------------------------------------------------
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
select pg_temp.t('01 the director enters the Snap app', $q$ insert into v select 'tail', public.platform_conn_app_set('k-rule-run-only', 'snapchat_app', 'تطبيق سناب شات', '{"app_id":"56b82922-e09e-459e-9c86-8cebc54019cb"}', 'SNAPSECRETMARK-app-00000001') $q$, 'ok');
select pg_temp.c('02 only the tail of the secret comes back', pg_temp.g('tail'), '••••0001');
select pg_temp.who('00000000-0000-0000-0000-0000000000b1');
select pg_temp.t('03 the assistant cannot enter it', $q$ select public.platform_conn_app_set('k-rule-run-only', 'snapchat_app', 'x', '{"app_id":"a-client-id"}', 'SNAPSECRETMARK-app-00000002') $q$, 'ERR FORBIDDEN');
select pg_temp.who('00000000-0000-0000-0000-0000000000c1');
select pg_temp.t('04 a writer cannot', $q$ select public.platform_conn_app_set('k-rule-run-only', 'snapchat_app', 'x', '{"app_id":"a-client-id"}', 'SNAPSECRETMARK-app-00000002') $q$, 'ERR FORBIDDEN');
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
select pg_temp.t('05 a wrong server key is refused', $q$ select public.platform_conn_app_set('wrong', 'snapchat_app', 'x', '{"app_id":"a-client-id"}', 'SNAPSECRETMARK-app-00000002') $q$, 'ERR FORBIDDEN');
select pg_temp.t('06 a type that is not an app is refused', $q$ select public.platform_conn_app_set('k-rule-run-only', 'snapchat_page', 'x', '{"app_id":"a-client-id"}', 'SNAPSECRETMARK-app-00000002') $q$, 'ERR INT_NOT_FOUND');
select pg_temp.c('07 the server reads the app back with its id and its secret', (select (public.platform_conn_app_get('k-rule-run-only', 'snapchat_app', 'اختبار')->'config'->>'app_id') || ' ' || (public.platform_conn_app_get('k-rule-run-only', 'snapchat_app', 'اختبار')->>'secret')), '56b82922-e09e-459e-9c86-8cebc54019cb SNAPSECRETMARK-app-00000001');
select pg_temp.c('08 the settings list shows it with a secret and no secret in it', (select count(*)::text from jsonb_array_elements(public.int_list()) x where x->>'type' = 'snapchat_app' and (x->>'has_secret')::boolean and x::text not like '%SECRETMARK%'), '1');
select pg_temp.c('09 and the readiness list names it', (select (public.platform_ready() ? 'snapchat_app')::text), 'true');
select pg_temp.t('10 entering the app again replaces it, not a second one', $q$ select public.platform_conn_app_set('k-rule-run-only', 'snapchat_app', 'تطبيق سناب شات', '{"app_id":"56b82922-e09e-459e-9c86-8cebc54019cb"}', 'SNAPSECRETMARK-app-00000003') $q$, 'ok');
reset role;
select pg_temp.c('10b one row, as the table holds it', (select count(*)::text from public.integrations where type = 'snapchat_app' and deleted_at is null), '1');
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');

-- 2. The older types are still accepted, an unknown one is not ------------------------------------------------------------------------
select pg_temp.t('11 the older app types still enter', $q$ select public.platform_conn_app_set('k-rule-run-only', 'x_app', 'تطبيق X', '{"app_id":"xclientid1"}', 'XSECRETMARK-app-000003') $q$, 'ok');
select pg_temp.t('12 the older offers too', $q$ insert into v select 'o-x', public.platform_conn_user_put('k-rule-run-only', 'x_user_offer', 'دخول X', '{"provider":"x"}', 'tok-XSECRETMARK-user-0003') $q$, 'ok');
select pg_temp.t('13 an offer type nobody knows is refused', $q$ select public.platform_conn_user_put('k-rule-run-only', 'snapchat_user', 'x', '{}', 'tok-SNAPSECRETMARK-user-0000') $q$, 'ERR INT_NOT_FOUND');

-- 3. A Snapchat sign-in, and the profile linked ----------------------------------------------------------------------------------------
select pg_temp.t('14 a Snapchat sign-in is kept as a passing offer', $q$ insert into v select 'o-s', public.platform_conn_user_put('k-rule-run-only', 'snapchat_user_offer', 'دخول سناب شات', '{"provider":"snapchat","profile_id":"pf-123"}', 'tok-SNAPSECRETMARK-user-0001') $q$, 'ok');
select pg_temp.c('15 the offer is read by its owner and carries no secret', (select (public.platform_conn_offer(pg_temp.g('o-s')::uuid) is not null and public.platform_conn_offer(pg_temp.g('o-s')::uuid)::text not like '%SECRETMARK%')::text), 'true');
select pg_temp.c('16 the settings list hides the passing offer', (select count(*)::text from jsonb_array_elements(public.int_list()) x where x->>'type' = 'snapchat_user_offer'), '0');
select pg_temp.c('17 the server reads the offer token with its key', (select public.platform_conn_secret('k-rule-run-only', pg_temp.g('o-s')::uuid, 'اختبار')), 'tok-SNAPSECRETMARK-user-0001');
select pg_temp.t('18 the profile is linked, and the offer goes with it', format($q$ insert into v select 'a-s', public.platform_conn_link('k-rule-run-only', %L::jsonb, 'tok-SNAPSECRETMARK-prof-0002') $q$,
  json_build_object('platform','snapchat','type','snapchat_profile','label','الملف العام للقسم','handle','snap:pf-123','publishers',array['dir@t.test','pub@t.test'],'mode','ask','external_id','pf-123','external_name','الملف العام للقسم','scopes',array['snapchat-profile-api'],'expires_at',(now() + interval '90 days')::text,'offer',pg_temp.g('o-s'))::text), 'ok');
select pg_temp.c('19 it is a real connection with its expiry', (select count(*)::text from public.platform_accounts where id = pg_temp.g('a-s')::uuid and platform = 'snapchat' and conn_kind = 'oauth' and conn_state = 'connected' and authorized_until > now() + interval '50 days' and external_id = 'pf-123'), '1');
reset role;
select pg_temp.c('20 the offer was removed with the pick, as the table holds it', (select count(*)::text from public.integrations where type = 'snapchat_user_offer' and deleted_at is null), '0');
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
select pg_temp.c('21 the due list names its integration type', (select count(*)::text from jsonb_array_elements(public.platform_conn_due(0)) x where x->>'type' = 'snapchat_profile'), '1');
select pg_temp.t('22 an account type nobody knows is refused', $q$ select public.platform_conn_link('k-rule-run-only', '{"platform":"snapchat","type":"snapchat_page","label":"a","handle":"snap:1","publishers":["dir@t.test"],"external_id":"1"}'::jsonb, 'tok-SNAPSECRETMARK-prof-0002') $q$, 'ERR INT_NOT_FOUND');
select pg_temp.t('23 the same profile linked again is the same account, not a second one', format($q$ select public.platform_conn_link('k-rule-run-only', %L::jsonb, 'tok-SNAPSECRETMARK-prof-0003') $q$,
  json_build_object('platform','snapchat','type','snapchat_profile','label','الملف العام للقسم','handle','snap:pf-123','publishers',array['dir@t.test'],'mode','ask','external_id','pf-123','external_name','الملف العام للقسم','scopes',array['snapchat-profile-api'],'expires_at',(now() + interval '90 days')::text,'account_id',pg_temp.g('a-s'))::text), 'ok');
select pg_temp.c('23b one account', (select count(*)::text from public.platform_accounts where platform = 'snapchat'), '1');
select pg_temp.t('24 a health record: a refused token marks it for reconnection', format($q$ select public.platform_conn_health('k-rule-run-only', %L::uuid, false, 'TOKEN_REFUSED', null, null) $q$, pg_temp.g('a-s')), 'ok');
select pg_temp.c('24b and the state says so', (select conn_state from public.platform_accounts where id = pg_temp.g('a-s')::uuid), 'needs_reconnect');
select pg_temp.t('25 a good check renews it and may replace the token', format($q$ select public.platform_conn_health('k-rule-run-only', %L::uuid, true, null, (now() + interval '90 days')::text::timestamptz, 'tok-SNAPSECRETMARK-prof-0004') $q$, pg_temp.g('a-s')), 'ok');
select pg_temp.c('25b it is connected again', (select conn_state from public.platform_accounts where id = pg_temp.g('a-s')::uuid), 'connected');

-- 4. The reset knows the platform --------------------------------------------------------------------------------------------------------
select pg_temp.t('26 it is refused while an account still holds a token of the app', $q$ select public.platform_app_reset('snapchat') $q$, 'ERR APP_IN_USE');
reset role;
update public.integrations set secret_id = null where id = (select integration_id from public.platform_accounts where platform = 'snapchat');
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
select pg_temp.t('27 once the connection was ended it resets', $q$ select public.platform_app_reset('snapchat') $q$, 'ok');
reset role;
select pg_temp.c('27b the app is closed and its secret gone', (select count(*)::text from public.integrations where type = 'snapchat_app' and deleted_at is null), '0');
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
select pg_temp.c('27c the platform is switched off and its saved steps gone', (select (select enabled::text from public.platforms where key = 'snapchat') || ' ' || (select count(*)::text from public.platform_setup where key = 'snapchat')), 'false 0');
select pg_temp.t('28 the older platforms still reset by name, and an unknown one is refused', $q$ select public.platform_app_reset('x') $q$, 'ok');
select pg_temp.t('28b unknown', $q$ select public.platform_app_reset('myspace') $q$, 'ERR UNKNOWN_PLATFORM');

-- 5. Nothing leaked into anything a person can read -----------------------------------------------------------------------------------
reset role;
select pg_temp.c('29 no secret string in events, integrations, accounts, notifications', (
  (select count(*) from public.integration_events where data::text like '%SECRETMARK%')
  + (select count(*) from public.integrations where row_to_json(integrations)::text like '%SECRETMARK%')
  + (select count(*) from public.platform_accounts where row_to_json(platform_accounts)::text like '%SECRETMARK%')
  + (select count(*) from public.platform_events where data::text like '%SECRETMARK%')
  + (select count(*) from public.notifications where body like '%SECRETMARK%'))::text, '0');
select pg_temp.c('30 the migration can be run again: the nine functions already carry the lists', (select count(*)::text from pg_proc p join pg_namespace s on s.oid = p.pronamespace
  where s.nspname = 'public' and p.proname in ('platform_conn_app_get','platform_conn_app_set','platform_ready','int_list','platform_conn_offer','platform_conn_secret','platform_conn_user_put','platform_conn_link','platform_app_reset')
    and pg_get_functiondef(p.oid) like '%snapchat%'), '9');

select n, k, v, expect from r where v is distinct from expect
union all select 0, 'TOTAL', count(*)::text, (count(*) filter (where v is not distinct from expect))::text || ' passed' from r
order by n;
rollback;

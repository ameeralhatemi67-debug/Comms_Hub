-- Action_Plan.md B9 (migrations 20261015180000_director_connection_rights.sql and
-- 20261015190000_connections_generalised.sql): the Director holds the connection rights, the
-- Google, LinkedIn and X app, passing-offer and account types are accepted next to Meta and
-- TikTok, the server reads a Google app or the mailbox credentials only with its key, and the
-- Director enters the mailbox once. One transaction, rolled back at the end; the site's server key
-- is replaced by a throwaway inside it only. Every secret string carries a marker so a leak can
-- be searched for. Result: qa/connections-generalised-rules.json.
begin;
create temp table r(n serial, k text, v text, expect text);
create temp table v(k text primary key, val text);
grant all on r, v to public; grant usage on sequence r_n_seq to public;
insert into public.accounts (email, display_name, role, pages, protected) values
 ('adm@t.test','Adm','admin','{}',true),('dir@t.test','Dir','director','{}',false),
 ('asst@t.test','Asst','assistant','{}',false),('wri@t.test','Wri','writer','{}',false);
insert into auth.users (id, email, email_confirmed_at) values
 ('00000000-0000-0000-0000-0000000000a1','adm@t.test',now()),('00000000-0000-0000-0000-0000000000d1','dir@t.test',now()),
 ('00000000-0000-0000-0000-0000000000b1','asst@t.test',now()),('00000000-0000-0000-0000-0000000000c1','wri@t.test',now());
insert into public.mail_server_key (id, key_hash) values (1, encode(sha256(convert_to('k-rule-run-only', 'UTF8')), 'hex'))
  on conflict (id) do update set key_hash = excluded.key_hash;
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

-- 1. Who holds the rights ---------------------------------------------------------------------------
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
select pg_temp.c('01 the director holds the platform rights', (select (public.has_capability('platforms.manage', null) and public.has_capability('integrations.secrets', null) and public.has_capability('settings.manage', null))::text), 'true');
select pg_temp.c('02 the director does not hold backups', (select public.has_capability('backups.run', null)::text), 'false');
select pg_temp.who('00000000-0000-0000-0000-0000000000b1');
select pg_temp.c('03 the assistant does not hold them', (select (public.has_capability('platforms.manage', null) or public.has_capability('integrations.secrets', null))::text), 'false');
select pg_temp.t('04 the assistant cannot enter an app', $q$ select public.platform_conn_app_set('k-rule-run-only', 'google_app', 'Google', '{"app_id":"client-1.apps.googleusercontent.com"}', 'GSECRETMARK-app-000001') $q$, 'ERR FORBIDDEN');
select pg_temp.who('00000000-0000-0000-0000-0000000000c1');
select pg_temp.t('05 a writer cannot', $q$ select public.platform_conn_app_set('k-rule-run-only', 'google_app', 'Google', '{"app_id":"client-1.apps.googleusercontent.com"}', 'GSECRETMARK-app-000001') $q$, 'ERR FORBIDDEN');

-- 2. The three new app types ---------------------------------------------------------------------------
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
select pg_temp.t('06 the director enters a Google app', $q$ insert into v select 'tail-google', public.platform_conn_app_set('k-rule-run-only', 'google_app', 'تطبيق Google', '{"app_id":"client-1.apps.googleusercontent.com"}', 'GSECRETMARK-app-000001') $q$, 'ok');
select pg_temp.c('06b only the tail is returned', pg_temp.g('tail-google'), '••••0001');
select pg_temp.t('07 a LinkedIn app', $q$ select public.platform_conn_app_set('k-rule-run-only', 'linkedin_app', 'تطبيق LinkedIn', '{"app_id":"77abcdef"}', 'LSECRETMARK-app-000002') $q$, 'ok');
select pg_temp.t('08 an X app', $q$ select public.platform_conn_app_set('k-rule-run-only', 'x_app', 'تطبيق X', '{"app_id":"xclientid1"}', 'XSECRETMARK-app-000003') $q$, 'ok');
select pg_temp.t('09 a type that is not an app is refused', $q$ select public.platform_conn_app_set('k-rule-run-only', 'google_drive', 'x', '{}', 'GSECRETMARK-app-000001') $q$, 'ERR INT_NOT_FOUND');
select pg_temp.t('10 a wrong server key is refused', $q$ select public.platform_conn_app_set('wrong', 'x_app', 'x', '{"app_id":"x"}', 'XSECRETMARK-app-000003') $q$, 'ERR FORBIDDEN');
select pg_temp.c('11 the app is read back with its secret, for the server', (select (public.platform_conn_app_get('k-rule-run-only', 'google_app', 'اختبار')->>'secret')), 'GSECRETMARK-app-000001');
select pg_temp.c('12 the settings list shows the three apps without a secret', (select count(*)::text from jsonb_array_elements(public.int_list()) x where x->>'type' in ('google_app','linkedin_app','x_app') and (x->>'has_secret')::boolean and x::text not like '%SECRETMARK%'), '3');

-- 3. Passing offers and accounts of the new providers -------------------------------------------------
select pg_temp.t('13 an offer of each new provider', $q$ insert into v select 'o-g', public.platform_conn_user_put('k-rule-run-only', 'google_user_offer', 'دخول Google', '{"provider":"google"}', 'tok-GSECRETMARK-user-0001') $q$, 'ok');
select pg_temp.t('13b linkedin', $q$ insert into v select 'o-l', public.platform_conn_user_put('k-rule-run-only', 'linkedin_user_offer', 'دخول LinkedIn', '{"provider":"linkedin"}', 'tok-LSECRETMARK-user-0002') $q$, 'ok');
select pg_temp.t('13c x', $q$ insert into v select 'o-x', public.platform_conn_user_put('k-rule-run-only', 'x_user_offer', 'دخول X', '{"provider":"x"}', 'tok-XSECRETMARK-user-0003') $q$, 'ok');
select pg_temp.c('14 an offer is read only by its owner and carries no secret', (select (public.platform_conn_offer(pg_temp.g('o-g')::uuid) is not null and public.platform_conn_offer(pg_temp.g('o-g')::uuid)::text not like '%SECRETMARK%')::text), 'true');
select pg_temp.c('15 the settings list hides the passing offers', (select count(*)::text from jsonb_array_elements(public.int_list()) x where x->>'type' like '%_user_offer'), '0');
select pg_temp.t('16 a YouTube channel is linked and the offer goes with it', format($q$ insert into v select 'a-yt', public.platform_conn_link('k-rule-run-only', %L::jsonb, 'tok-GSECRETMARK-chan-0004') $q$,
  json_build_object('platform','youtube','type','youtube_channel','label','قناة القسم','handle','@commshub','publishers',array['dir@t.test','asst@t.test'],'mode','auto','external_id','UC123','external_name','قناة القسم','scopes',array['youtube.upload'],'expires_at',(now() + interval '90 days')::text,'offer',pg_temp.g('o-g'))::text), 'ok');
select pg_temp.t('17 a LinkedIn member', format($q$ insert into v select 'a-li', public.platform_conn_link('k-rule-run-only', %L::jsonb, 'tok-LSECRETMARK-member-0005') $q$,
  json_build_object('platform','linkedin','type','linkedin_member','label','مدير الاتصال','handle','li:abc123','publishers',array['dir@t.test'],'mode','auto','external_id','abc123','external_name','مدير الاتصال','scopes',array['w_member_social'],'expires_at',(now() + interval '60 days')::text,'offer',pg_temp.g('o-l'))::text), 'ok');
select pg_temp.t('18 an X user', format($q$ insert into v select 'a-x', public.platform_conn_link('k-rule-run-only', %L::jsonb, 'tok-XSECRETMARK-user-0006') $q$,
  json_build_object('platform','x','type','x_user','label','@commshub','handle','@commshub','publishers',array['dir@t.test'],'mode','ask','external_id','999','external_name','commshub','scopes',array['tweet.write'],'expires_at',(now() + interval '90 days')::text,'offer',pg_temp.g('o-x'))::text), 'ok');
select pg_temp.t('19 a type nobody knows is refused', $q$ select public.platform_conn_link('k-rule-run-only', '{"platform":"x","type":"x_page","label":"a","handle":"@a","publishers":["dir@t.test"],"external_id":"1"}'::jsonb, 'tok-XSECRETMARK-user-0006') $q$, 'ERR INT_NOT_FOUND');
select pg_temp.c('20 the three accounts are real connections with their expiry', (select count(*)::text from public.platform_accounts where id in (pg_temp.g('a-yt')::uuid, pg_temp.g('a-li')::uuid, pg_temp.g('a-x')::uuid) and conn_kind = 'oauth' and conn_state = 'connected' and authorized_until > now() + interval '50 days'), '3');
select pg_temp.c('21 the offers were removed with the last pick', (select count(*)::text from public.integrations where type like '%_user_offer' and deleted_at is null), '0');
select pg_temp.c('22 the due list names the integration types', (select count(*)::text from jsonb_array_elements(public.platform_conn_due(0)) x where x->>'type' in ('youtube_channel','linkedin_member','x_user')), '3');
select pg_temp.t('23 a health record of a YouTube channel: needs reconnect on a refused token', format($q$ select public.platform_conn_health('k-rule-run-only', %L::uuid, false, 'TOKEN_REFUSED', null, null) $q$, pg_temp.g('a-yt')), 'ok');
reset role;
select pg_temp.c('24 and says so in the reminder with the present name', (select count(*)::text from public.notifications where recipient = 'asst@t.test' and body like 'انقطع ربط%«حسابات المنصات»%'), '1');
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');

-- 4. The server reads credentials only with its key -----------------------------------------------------
select pg_temp.c('25 the Google app, with the key', (select public.integration_creds('k-rule-run-only', 'google_app', 'درايف')->'config'->>'app_id'), 'client-1.apps.googleusercontent.com');
select pg_temp.t('26 a wrong key is refused', $q$ select public.integration_creds('wrong', 'google_app', 'درايف') $q$, 'ERR FORBIDDEN');
select pg_temp.c('27 a type outside the two is not answered', (select coalesce(public.integration_creds('k-rule-run-only', 'meta_app', 'x')::text, 'null')), 'null');

-- 5. The mailbox -----------------------------------------------------------------------------------------
select pg_temp.who('00000000-0000-0000-0000-0000000000b1');
select pg_temp.t('28 the assistant cannot enter the mailbox', $q$ select public.mail_account_set('k-rule-run-only', 'dept@example.com', 'abcdefghijklmnop') $q$, 'ERR FORBIDDEN');
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
select pg_temp.t('29 an invalid address is refused', $q$ select public.mail_account_set('k-rule-run-only', 'not-an-address', 'abcdefghijklmnop') $q$, 'ERR ADDRESS_INVALID');
select pg_temp.t('30 a short password is refused', $q$ select public.mail_account_set('k-rule-run-only', 'dept@example.com', 'short') $q$, 'ERR SECRET_INVALID');
select pg_temp.t('31 the director enters the mailbox', $q$ insert into v select 'mail-tail', public.mail_account_set('k-rule-run-only', 'Dept@Example.com', 'MAILSECRETMARKxyz1') $q$, 'ok');
select pg_temp.c('31b only a tail is returned', pg_temp.g('mail-tail'), '••••xyz1');
select pg_temp.c('32 the server reads the address and the app password', (select (public.integration_creds('k-rule-run-only', 'gmail_account', 'مزامنة البريد')->'config'->>'address') || ' ' || (public.integration_creds('k-rule-run-only', 'gmail_account', 'مزامنة البريد')->>'secret')), 'dept@example.com MAILSECRETMARKxyz1');
select pg_temp.c('33 the settings list shows it connected, no secret', (select count(*)::text from jsonb_array_elements(public.int_list()) x where x->>'type' = 'gmail_account' and x->>'state' = 'connected' and (x->>'has_secret')::boolean and x::text not like '%MAILSECRETMARK%'), '1');
select pg_temp.t('34 entering it again replaces, not duplicates', $q$ select public.mail_account_set('k-rule-run-only', 'dept@example.com', 'MAILSECRETMARKabc2') $q$, 'ok');
select pg_temp.c('34b one row, the new password', (select (select count(*) from jsonb_array_elements(public.int_list()) x where x->>'type' = 'gmail_account')::text || ' ' || (public.integration_creds('k-rule-run-only', 'gmail_account', 'x')->>'secret')), '1 MAILSECRETMARKabc2');

-- 6. Nothing leaked into anything a person can read ------------------------------------------------------
reset role;
select pg_temp.c('35 no secret string in events, integrations, accounts, notifications', (
  (select count(*) from public.integration_events where data::text like '%SECRETMARK%')
  + (select count(*) from public.integrations where row_to_json(integrations)::text like '%SECRETMARK%')
  + (select count(*) from public.platform_accounts where row_to_json(platform_accounts)::text like '%SECRETMARK%')
  + (select count(*) from public.platform_events where data::text like '%SECRETMARK%')
  + (select count(*) from public.notifications where body like '%SECRETMARK%'))::text, '0');

select n, k, v, expect from r where v is distinct from expect
union all select 0, 'TOTAL', count(*)::text, (count(*) filter (where v is not distinct from expect))::text || ' passed' from r
order by n;
rollback;

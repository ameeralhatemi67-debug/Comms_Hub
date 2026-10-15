-- Platform connections (migrations 20261015110000_platform_connections.sql and
-- 20261015120000_account_delete_vault.sql, readiness audit step 6): who may connect, where the
-- tokens go, that no value reaches a row anybody can read, health and its effect on the
-- authorisation, reconnecting, disconnecting and deleting. One transaction, rolled back at the
-- end; the site's server key is replaced by a throwaway inside it only. Every secret string
-- carries a marker so a leak anywhere can be searched for.
-- Result: qa/platform-connections-rules.json.
begin;
create temp table r(n serial, k text, v text, expect text);
create temp table v(k text primary key, val text);
grant all on r, v to public; grant usage on sequence r_n_seq to public;
insert into public.accounts (email, display_name, role, pages, protected) values
 ('adm@t.test','Adm','admin','{}',true),('dir@t.test','Dir','director','{}',false),
 ('wri@t.test','Wri','writer','{}',false),('pub@t.test','Pub','publisher','{}',false);
insert into auth.users (id, email, email_confirmed_at) values
 ('00000000-0000-0000-0000-0000000000a1','adm@t.test',now()),('00000000-0000-0000-0000-0000000000d1','dir@t.test',now()),
 ('00000000-0000-0000-0000-0000000000c1','wri@t.test',now()),('00000000-0000-0000-0000-0000000000e1','pub@t.test',now());
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
create function pg_temp.leaks() returns text language sql as $$
  select (select count(*) from public.integration_events where data::text like '%SECRETMARK%')::text || ' '
      || (select count(*) from public.integrations where row_to_json(integrations)::text like '%SECRETMARK%')::text || ' '
      || (select count(*) from public.platform_accounts where row_to_json(platform_accounts)::text like '%SECRETMARK%')::text || ' '
      || (select count(*) from public.platform_events where data::text like '%SECRETMARK%')::text || ' '
      || (select count(*) from public.notifications where body like '%SECRETMARK%')::text $$;
create temp table before_state as select count(*) filter (where conn_kind = 'oauth') as oauth, count(*) as total from public.platform_accounts;
grant select on before_state to public;
set local role authenticated;

-- Defaults and who may connect ---------------------------------------------------------------------
select pg_temp.who('00000000-0000-0000-0000-0000000000c1');
select pg_temp.c('01 every account that existed is simulated', (select (oauth)::text from before_state), '0');
select pg_temp.t('02 a writer cannot put a user token', $q$ select public.platform_conn_user_put('k-rule-run-only', 'meta_user', 'x', '{}', 'tok-SECRETMARK-user-0001') $q$, 'ERR FORBIDDEN');
select pg_temp.c('02b nor ask whether they may', (select public.platform_conn_may()::text), 'false');
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
select pg_temp.c('03 the director may connect (manages accounts)', (select public.platform_conn_may()::text), 'true');
select pg_temp.t('04 a wrong server key is refused', $q$ select public.platform_conn_user_put('wrong', 'meta_user', 'x', '{}', 'tok-SECRETMARK-user-0001') $q$, 'ERR FORBIDDEN');
select pg_temp.t('05 an unknown type is refused', $q$ select public.platform_conn_user_put('k-rule-run-only', 'google_drive', 'x', '{}', 'tok-SECRETMARK-user-0001') $q$, 'ERR INT_NOT_FOUND');
select pg_temp.t('05b a short secret is refused', $q$ select public.platform_conn_user_put('k-rule-run-only', 'meta_user', 'x', '{}', 'short') $q$, 'ERR SECRET_INVALID');
select pg_temp.t('06 the director puts the user token of a Meta sign-in', $q$ insert into v select 'offer', public.platform_conn_user_put('k-rule-run-only', 'meta_user', 'دخول', '{"provider":"meta"}', 'tok-SECRETMARK-user-0001')::text $q$, 'ok');
select pg_temp.c('07 only its owner can read the offer', (select (public.platform_conn_offer(pg_temp.g('offer')::uuid) is not null)::text), 'true');
select pg_temp.c('07b the offer carries no owner and no secret', (select (public.platform_conn_offer(pg_temp.g('offer')::uuid)::text like '%owner%' or public.platform_conn_offer(pg_temp.g('offer')::uuid)::text like '%SECRETMARK%')::text), 'false');
select pg_temp.c('08 and the secret, for the server, for a purpose', (select public.platform_conn_secret('k-rule-run-only', pg_temp.g('offer')::uuid, 'قائمة')), 'tok-SECRETMARK-user-0001');
select pg_temp.who('00000000-0000-0000-0000-0000000000a1');
select pg_temp.c('09 another person, even the administrator, is not shown the offer', (select (public.platform_conn_offer(pg_temp.g('offer')::uuid) is null)::text), 'true');
select pg_temp.t('10 and cannot read its secret', format($q$ select public.platform_conn_secret('k-rule-run-only', %L::uuid, 'x') $q$, pg_temp.g('offer')), 'ERR FORBIDDEN');
select pg_temp.c('11 the settings list does not show a passing user token', (select count(*)::text from jsonb_array_elements(public.int_list()) x where x->>'type' in ('meta_user','tiktok_user_offer')), '0');
select pg_temp.who('00000000-0000-0000-0000-0000000000c1');
select pg_temp.c('12 the integrations table has no policy: nothing is readable directly', (select count(*)::text from public.integrations), '0');

-- Linking ------------------------------------------------------------------------------------------------
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
select pg_temp.t('13 an account without a publisher is refused', $q$ select public.platform_conn_link('k-rule-run-only',
  '{"platform":"instagram","type":"meta_instagram","label":"الرسمي","handle":"@t_ig","external_id":"IG1","external_name":"t_ig","scopes":["instagram_content_publish"],"expires_at":"2031-01-01T00:00:00Z","publishers":[]}'::jsonb, 'ptok-SECRETMARK-page-0001') $q$, 'ERR PUBLISHER_REQUIRED');
select pg_temp.t('14 a platform that is not on is refused', $q$ select public.platform_conn_link('k-rule-run-only',
  '{"platform":"facebook","type":"meta_page","label":"ص","handle":"@t_fb","external_id":"P1","publishers":["pub@t.test"]}'::jsonb, 'ptok-SECRETMARK-page-0001') $q$, 'ERR PLATFORM_INVALID');
select pg_temp.t('15 an Instagram account is linked, and the user token with it', $q$ insert into v select 'ig', public.platform_conn_link('k-rule-run-only',
  jsonb_build_object('platform','instagram','type','meta_instagram','label','الرسمي','handle','@t_ig','external_id','IG1','external_name','t_ig',
    'scopes',jsonb_build_array('instagram_content_publish'),'expires_at',(now() + interval '60 days')::text,'publishers',jsonb_build_array('pub@t.test'),
    'mode','ask','offer',pg_temp.g('offer')), 'ptok-SECRETMARK-page-0001')::text $q$, 'ok');
select pg_temp.c('15b it is a real connection, connected, until the token end',
  (select conn_kind || ':' || conn_state || ':' || external_id || ':' || mode || ':' || (authorized_until > now() + interval '59 days')::text || ':' || (integration_id is not null)::text from public.platform_accounts where id = pg_temp.g('ig')::uuid),
  'oauth:connected:IG1:ask:true:true');
select pg_temp.c('15c the passing user token is gone', (select (public.platform_conn_offer(pg_temp.g('offer')::uuid) is null)::text), 'true');
select pg_temp.who('00000000-0000-0000-0000-0000000000a1');
select pg_temp.c('16 the settings list shows the account row with a tail and no reference',
  (select (x->>'type') || ':' || (x->>'state') || ':' || (x->>'has_secret') || ':' || (x->>'secret_tail') || ':' || (x ? 'secret_id')::text from jsonb_array_elements(public.int_list()) x where x->>'type' = 'meta_instagram'),
  'meta_instagram:connected:true:••••0001:false');
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
select pg_temp.t('17 the same handle with another identity is refused while connected', $q$ select public.platform_conn_link('k-rule-run-only',
  '{"platform":"instagram","type":"meta_instagram","label":"آخر","handle":"@t_ig","external_id":"IG-OTHER","publishers":["pub@t.test"]}'::jsonb, 'ptok-SECRETMARK-page-0002') $q$, 'ERR HANDLE_TAKEN');
select pg_temp.t('18 the same identity again is a reconnect of the same account', $q$ insert into v select 'ig2', public.platform_conn_link('k-rule-run-only',
  '{"platform":"instagram","type":"meta_instagram","label":"الرسمي","handle":"@t_ig","external_id":"IG1","external_name":"t_ig","publishers":[],"expires_at":"2031-06-01T00:00:00Z"}'::jsonb, 'ptok-SECRETMARK-page-0003')::text $q$, 'ok');
select pg_temp.c('18b same account, one integration, the new token', (select (pg_temp.g('ig') = pg_temp.g('ig2'))::text || ':' ||
  (select count(*)::text from public.platform_accounts where lower(handle) = '@t_ig') || ':' ||
  public.platform_conn_secret('k-rule-run-only', (select integration_id from public.platform_accounts where id = pg_temp.g('ig')::uuid), 'x')), 'true:1:ptok-SECRETMARK-page-0003');
select pg_temp.c('18c publishers kept when none are sent', (select publishers::text from public.platform_accounts where id = pg_temp.g('ig')::uuid), '{pub@t.test}');

-- A simulated account is upgraded in place ------------------------------------------------------------------
select pg_temp.t('19 a simulated account exists', $q$ insert into v select 'sim', public.account_save(null, '{"platform":"instagram","label":"قديم","handle":"@t_old","publishers":["pub@t.test"]}')::text $q$, 'ok');
select pg_temp.c('19b it is simulated', (select conn_kind || ':' || conn_state from public.platform_accounts where id = pg_temp.g('sim')::uuid), 'simulated:simulated');
select pg_temp.t('20 linking the same handle upgrades it in place', $q$ insert into v select 'up', public.platform_conn_link('k-rule-run-only',
  '{"platform":"instagram","type":"meta_instagram","label":"جديد","handle":"@t_old","external_id":"IG9","external_name":"t_old","publishers":[],"expires_at":"2031-01-01T00:00:00Z"}'::jsonb, 'ptok-SECRETMARK-page-0004')::text $q$, 'ok');
select pg_temp.c('20b same id, now real, label kept', (select (id = pg_temp.g('sim')::uuid)::text || ':' || conn_kind || ':' || label from public.platform_accounts where handle = '@t_old'), 'true:oauth:قديم');

-- Health ----------------------------------------------------------------------------------------------------
select pg_temp.c('21 right after linking nothing is due for half an hour, but "now" returns both', (select jsonb_array_length(public.platform_conn_due(30))::text || ':' || jsonb_array_length(public.platform_conn_due(0))::text), '0:2');
select pg_temp.t('22 a wrong key cannot record health', format($q$ select public.platform_conn_health('wrong', %L::uuid, true, null, null, null) $q$, pg_temp.g('ig')), 'ERR FORBIDDEN');
select pg_temp.c('23 a good check records state and the real expiry', (select public.platform_conn_health('k-rule-run-only', pg_temp.g('ig')::uuid, true, null, '2031-09-01T00:00:00Z', null)), 'connected');
select pg_temp.c('23b', (select to_char(authorized_until at time zone 'utc', 'YYYY-MM-DD') || ':' || (conn_checked_at is not null)::text from public.platform_accounts where id = pg_temp.g('ig')::uuid), '2031-09-01:true');
select pg_temp.c('24 it is no longer due for half an hour', (select (public.platform_conn_due(30) @> jsonb_build_array(jsonb_build_object('id', pg_temp.g('ig'))))::text), 'false');
select pg_temp.c('25 a refused token needs reconnecting and ends the authorisation now', (select public.platform_conn_health('k-rule-run-only', pg_temp.g('ig')::uuid, false, 'TOKEN_REFUSED', null, null)), 'needs_reconnect');
select pg_temp.c('25b', (select conn_state || ':' || conn_error || ':' || (authorized_until <= now())::text from public.platform_accounts where id = pg_temp.g('ig')::uuid), 'needs_reconnect:TOKEN_REFUSED:true');
select pg_temp.c('25d the publish rule of the work cycle now says no', (select (a.active and (a.authorized_until is null or a.authorized_until > now()))::text from public.platform_accounts a where a.id = pg_temp.g('ig')::uuid), 'false');
select pg_temp.t('25e the same failure again tells nobody again', format($q$ select public.platform_conn_health('k-rule-run-only', %L::uuid, false, 'TOKEN_REFUSED', null, null) $q$, pg_temp.g('ig')), 'ok');
select pg_temp.c('26 a network failure is an error, not a reconnect, and leaves the authorisation', (select public.platform_conn_health('k-rule-run-only', pg_temp.g('up')::uuid, false, 'UNREACHABLE', null, null)), 'error');
select pg_temp.c('26b', (select (authorized_until > now() + interval '1 year')::text from public.platform_accounts where id = pg_temp.g('up')::uuid), 'true');
select pg_temp.c('27 a later good check restores it and clears the error', (select public.platform_conn_health('k-rule-run-only', pg_temp.g('ig')::uuid, true, null, '2031-12-01T00:00:00Z', 'ptok-SECRETMARK-page-0005')), 'connected');
select pg_temp.c('27b the renewed token replaced the stored one, the error is gone',
  (select (conn_error is null)::text || ':' || public.platform_conn_secret('k-rule-run-only', integration_id, 'x') from public.platform_accounts where id = pg_temp.g('ig')::uuid), 'true:ptok-SECRETMARK-page-0005');

-- Reconnect, disconnect, delete -------------------------------------------------------------------------------------
select pg_temp.t('28 the simulated reconnect is refused for a real account', format($q$ select public.account_reconnect(%L::uuid) $q$, pg_temp.g('ig')), 'ERR RECONNECT_REAL');
select pg_temp.t('28b and still works for a simulated one', $q$ select public.account_reconnect(public.account_save(null, '{"platform":"x","label":"تجريبي","handle":"@t_sim2","publishers":["pub@t.test"]}')) $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-0000000000c1');
select pg_temp.t('29 a writer cannot disconnect', format($q$ select public.platform_conn_disconnect(%L::uuid) $q$, pg_temp.g('ig')), 'ERR FORBIDDEN');
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
select pg_temp.t('30 the director disconnects', format($q$ select public.platform_conn_disconnect(%L::uuid) $q$, pg_temp.g('ig')), 'ok');
select pg_temp.c('30b the token is destroyed and the authorisation ended',
  (select conn_state || ':' || conn_error || ':' || (authorized_until <= now())::text || ':' || coalesce(public.platform_conn_secret('k-rule-run-only', integration_id, 'x'), 'none') from public.platform_accounts where id = pg_temp.g('ig')::uuid),
  'needs_reconnect:DISCONNECTED:true:none');
select pg_temp.t('31 deleting a real account destroys its secret and closes its integration', format($q$ select public.account_delete(%L::uuid) $q$, pg_temp.g('up')), 'ok');
select pg_temp.c('31b', (select count(*)::text from public.platform_accounts where id = pg_temp.g('up')::uuid), '0');

-- The app credentials ----------------------------------------------------------------------------------------------
-- 2026-10-15 (Action_Plan.md B9): the Director holds platforms.manage and integrations.secrets by default.
select pg_temp.t('32 the director enters app secrets (owner decision of 2026-10-15)', $q$ select public.platform_conn_app_set('k-rule-run-only', 'meta_app', 'تطبيق', '{"app_id":"123456"}', 'app-SECRETMARK-secret-0001') $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-0000000000a1');
select pg_temp.t('33 a wrong key cannot', $q$ select public.platform_conn_app_set('wrong', 'meta_app', 'تطبيق', '{"app_id":"123456"}', 'app-SECRETMARK-secret-0001') $q$, 'ERR FORBIDDEN');
select pg_temp.t('34 only the app types (five since B9), not a storage provider', $q$ select public.platform_conn_app_set('k-rule-run-only', 'google_drive', 'x', '{}', 'app-SECRETMARK-secret-0001') $q$, 'ERR INT_NOT_FOUND');
select pg_temp.c('35 the administrator enters them: a masked tail comes back', (select public.platform_conn_app_set('k-rule-run-only', 'meta_app', 'تطبيق', '{"app_id":"123456"}', 'app-SECRETMARK-secret-0001')), '••••0001');
select pg_temp.c('36 the server reads the id and the secret back', (select (public.platform_conn_app_get('k-rule-run-only', 'meta_app', 'فحص')->'config'->>'app_id') || ':' || (public.platform_conn_app_get('k-rule-run-only', 'meta_app', 'فحص')->>'secret')), '123456:app-SECRETMARK-secret-0001');
select pg_temp.t('37 replacing keeps one row', $q$ select public.platform_conn_app_set('k-rule-run-only', 'meta_app', 'تطبيق', '{"app_id":"123456"}', 'app-SECRETMARK-secret-0002') $q$, 'ok');
select pg_temp.c('37b', (select count(*)::text from jsonb_array_elements(public.int_list()) x where x->>'type' = 'meta_app') || ':' || (public.platform_conn_app_get('k-rule-run-only', 'meta_app', 'x')->>'secret'), '1:app-SECRETMARK-secret-0002');
select pg_temp.t('38 a wrong key reads nothing', $q$ select public.platform_conn_app_get('wrong', 'meta_app', 'x') $q$, 'ERR FORBIDDEN');
select pg_temp.c('39 an app type never entered answers nothing', (select (public.platform_conn_app_get('k-rule-run-only', 'tiktok_app', 'x') is null)::text), 'true');

-- Nothing leaks -----------------------------------------------------------------------------------------------------------
select pg_temp.c('40 no secret in the log, the rows, the notices or the account list', (select pg_temp.leaks()), '0 0 0 0 0');
reset role;
select pg_temp.c('15e the publishers were told of each account linked (as the table owner: a person reads only their own notices)',
  (select count(*)::text from public.notifications where recipient = 'pub@t.test' and body like '%ربط حساب%' and body not like 'انقطع%'), '3');
select pg_temp.c('25c the publisher was told once that the connection broke, and not again by the repeated failure',
  (select count(*)::text from public.notifications where recipient = 'pub@t.test' and body like 'انقطع ربط%'), '1');
select pg_temp.c('27c the state changes are in the log (broke, restored, disconnected), the values are not',
  (select count(*)::text from public.integration_events e join public.platform_accounts a on a.integration_id = e.integration_id where a.id = (select val from v where k = 'ig')::uuid and e.kind = 'health'), '3');
select pg_temp.c('15d and its vault secret destroyed', (select count(*)::text from vault.secrets where name like 'integration:meta_user:%'), '0');
select pg_temp.c('41 the vault holds only what the rows say',
  (select count(*)::text from vault.secrets where name like 'integration:meta_%' or name like 'integration:tiktok_%'), (select count(*)::text from public.integrations where type in ('meta_app','meta_instagram','meta_page','tiktok_app','tiktok_user') and secret_id is not null and deleted_at is null));
select pg_temp.c('42 the anonymous role cannot call any of them',
  (select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'platform\_conn\_%' and has_function_privilege('anon', p.oid, 'execute')), '0');

select * from (
  select n, k, v, expect from r where not coalesce(v = expect or (expect like 'ERR%' and v like expect || '%'), false)
  union all select 0, 'TOTAL', count(*)::text, (count(*) filter (where coalesce(v = expect or (expect like 'ERR%' and v like expect || '%'), false)))::text || ' passed' from r) z order by n;
rollback;

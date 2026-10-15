-- Action_Plan.md B10 (migration 20261015210000_onedrive.sql): OneDrive as a storage provider.
-- Only the storage and integrations-secrets holders connect it, a wrong server key is refused, the
-- refresh token lives in Vault and is replaced (not duplicated) when rotated, three accounts at most,
-- the Microsoft app is entered like the other apps and read only with the server key, and no secret
-- string reaches anything a person can read. One transaction, rolled back at the end; the site's
-- server key is replaced by a throwaway inside it only. Result: qa/onedrive-rules.json.
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

-- 1. Who may connect it ----------------------------------------------------------------------------------
select pg_temp.who('00000000-0000-0000-0000-0000000000b1');
select pg_temp.t('01 the assistant cannot connect an account', $q$ select public.onedrive_provider_set('k-rule-run-only', 'dept@example.com', 'OneDrive القسم', 'ODRTMARK-refresh-0000001') $q$, 'ERR FORBIDDEN');
select pg_temp.who('00000000-0000-0000-0000-0000000000c1');
select pg_temp.t('02 a writer cannot', $q$ select public.onedrive_provider_set('k-rule-run-only', 'dept@example.com', 'OneDrive القسم', 'ODRTMARK-refresh-0000001') $q$, 'ERR FORBIDDEN');
select pg_temp.who('00000000-0000-0000-0000-0000000000a1');
select pg_temp.t('03 a wrong server key is refused', $q$ select public.onedrive_provider_set('wrong', 'dept@example.com', 'OneDrive القسم', 'ODRTMARK-refresh-0000001') $q$, 'ERR FORBIDDEN');
select pg_temp.t('04 an empty account is refused', $q$ select public.onedrive_provider_set('k-rule-run-only', '  ', 'OneDrive القسم', 'ODRTMARK-refresh-0000001') $q$, 'ERR ACCOUNT_INVALID');
select pg_temp.t('05 a short token is refused', $q$ select public.onedrive_provider_set('k-rule-run-only', 'dept@example.com', 'OneDrive القسم', 'short') $q$, 'ERR SECRET_INVALID');
select pg_temp.t('06 an empty label is refused', $q$ select public.onedrive_provider_set('k-rule-run-only', 'dept@example.com', ' ', 'ODRTMARK-refresh-0000001') $q$, 'ERR PROVIDER_LABEL');

-- 2. Connecting, replacing, the limit ----------------------------------------------------------------------
select pg_temp.t('07 the administrator connects an account', $q$ insert into v select 'od1', public.onedrive_provider_set('k-rule-run-only', 'Dept@Example.com', 'OneDrive القسم', 'ODRTMARK-refresh-0000001') $q$, 'ok');
select pg_temp.c('08 it is a connected storage provider, with the tail only', (select count(*)::text from jsonb_array_elements(public.int_list()) x where x->>'type' = 'onedrive' and x->>'kind' = 'storage' and x->>'state' = 'connected' and (x->>'has_secret')::boolean and x::text not like '%ODRTMARK%'), '1');
select pg_temp.t('09 the same account again replaces in place', $q$ insert into v select 'od1b', public.onedrive_provider_set('k-rule-run-only', 'dept@example.com', 'OneDrive القسم', 'ODRTMARK-refresh-0000002') $q$, 'ok');
select pg_temp.c('10 one row, the same id', (select ((select count(*) from jsonb_array_elements(public.int_list()) x where x->>'type' = 'onedrive')::text || ' ' || (pg_temp.g('od1') = pg_temp.g('od1b'))::text)), '1 true');
select pg_temp.t('11 a second and a third account', $q$ select public.onedrive_provider_set('k-rule-run-only', 'b@example.com', 'OneDrive ب', 'ODRTMARK-refresh-0000003'), public.onedrive_provider_set('k-rule-run-only', 'c@example.com', 'OneDrive ج', 'ODRTMARK-refresh-0000004') $q$, 'ok');
select pg_temp.t('12 a fourth is refused', $q$ select public.onedrive_provider_set('k-rule-run-only', 'd@example.com', 'OneDrive د', 'ODRTMARK-refresh-0000005') $q$, 'ERR PROVIDER_LIMIT');

-- 3. Rotation by the server ----------------------------------------------------------------------------------
select pg_temp.who('00000000-0000-0000-0000-0000000000c1');
select pg_temp.t('13 the server rotates a token with its key, whoever is asking', format($q$ select public.onedrive_token_rotate('k-rule-run-only', %L::uuid, 'ODRTMARK-rotated-00000009') $q$, pg_temp.g('od1')), 'ok');
select pg_temp.t('14 a wrong key is refused', format($q$ select public.onedrive_token_rotate('wrong', %L::uuid, 'ODRTMARK-rotated-00000010') $q$, pg_temp.g('od1')), 'ERR FORBIDDEN');
select pg_temp.t('15 a short token is refused', format($q$ select public.onedrive_token_rotate('k-rule-run-only', %L::uuid, 'x') $q$, pg_temp.g('od1')), 'ERR SECRET_INVALID');
reset role;
select pg_temp.c('16 the vault holds the rotated token, once', (select count(*)::text from vault.decrypted_secrets s join public.integrations i on i.secret_id = s.id where i.id = pg_temp.g('od1')::uuid and s.decrypted_secret = 'ODRTMARK-rotated-00000009'), '1');
select pg_temp.c('17 the old tokens are gone from the vault', (select count(*)::text from vault.decrypted_secrets where decrypted_secret in ('ODRTMARK-refresh-0000001', 'ODRTMARK-refresh-0000002')), '0');
select pg_temp.c('18 the tail follows the rotation', (select secret_tail from public.integrations where id = pg_temp.g('od1')::uuid), '••••0009');

-- 4. The Microsoft app -------------------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
select pg_temp.t('19 the director enters the Microsoft app', $q$ insert into v select 'tail-ms', public.platform_conn_app_set('k-rule-run-only', 'microsoft_app', 'تطبيق Microsoft', '{"app_id":"11111111-2222-3333-4444-555555555555"}', 'MSSECRETMARK-app-000001') $q$, 'ok');
select pg_temp.c('20 only the tail is returned', pg_temp.g('tail-ms'), '••••0001');
select pg_temp.who('00000000-0000-0000-0000-0000000000b1');
select pg_temp.t('21 the assistant cannot', $q$ select public.platform_conn_app_set('k-rule-run-only', 'microsoft_app', 'x', '{"app_id":"a"}', 'MSSECRETMARK-app-000002') $q$, 'ERR FORBIDDEN');
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
select pg_temp.c('22 the server reads the app with its key', (select (public.integration_creds('k-rule-run-only', 'microsoft_app', 'onedrive')->'config'->>'app_id') || ' ' || (public.integration_creds('k-rule-run-only', 'microsoft_app', 'onedrive')->>'secret')), '11111111-2222-3333-4444-555555555555 MSSECRETMARK-app-000001');
select pg_temp.t('23 a wrong key is refused', $q$ select public.integration_creds('wrong', 'microsoft_app', 'onedrive') $q$, 'ERR FORBIDDEN');
select pg_temp.who('00000000-0000-0000-0000-0000000000a1');
select pg_temp.c('24 the settings list shows the app connected, without a secret', (select count(*)::text from jsonb_array_elements(public.int_list()) x where x->>'type' = 'microsoft_app' and (x->>'has_secret')::boolean and x::text not like '%MSSECRETMARK%'), '1');

-- 5. Removing, and nothing leaked ---------------------------------------------------------------------------
select pg_temp.t('25 an account with no files is removed', format($q$ select public.storage_provider_remove(%L::uuid) $q$, pg_temp.g('od1')), 'ok');
select pg_temp.c('26 and is gone from the list', (select count(*)::text from jsonb_array_elements(public.int_list()) x where x->>'id' = pg_temp.g('od1')), '0');
reset role;
select pg_temp.c('27 no secret string in events, integrations, notifications', (
  (select count(*) from public.integration_events where data::text like '%MARK%')
  + (select count(*) from public.integrations where row_to_json(integrations)::text like '%SECRETMARK%' or row_to_json(integrations)::text like '%ODRTMARK%')
  + (select count(*) from public.notifications where body like '%MARK%'))::text, '0');

select n, k, v, expect from r where v is distinct from expect
union all select 0, 'TOTAL', count(*)::text, (count(*) filter (where v is not distinct from expect))::text || ' passed' from r
order by n;
rollback;

-- Integrations core and Vault, Step S1 (Settings_Integrations_Plan.md 4), with the plan's
-- security review: try to read a secret as an ordinary member, as an administrator through
-- every function, straight from the tables and the vault, and through the event log, and
-- record that each fails. One transaction, rolled back at the end. The site's server key is
-- replaced by a throwaway inside the transaction only (the real row comes back with the
-- rollback; compare md5(key_hash) before and after). The secrets are throwaway strings.
-- Result: qa/integrations-rules.json.
begin;
create temp table r(n serial, k text, v text, expect text);
create temp table v(k text primary key, val text);
grant all on r, v to public; grant usage on sequence r_n_seq to public;
insert into public.accounts (email, display_name, role, pages, protected) values
 ('adm@t.test','Adm','admin','{}',true),('dir@t.test','Dir','director','{settings}',false),('wri@t.test','Wri','writer','{settings}',false);
insert into auth.users (id, email, email_confirmed_at) values
 ('00000000-0000-0000-0000-0000000000a1','adm@t.test',now()),('00000000-0000-0000-0000-0000000000d1','dir@t.test',now()),
 ('00000000-0000-0000-0000-0000000000c1','wri@t.test',now());
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
-- Every secret string used below contains this marker, so a leak anywhere can be searched for.
create function pg_temp.leaks() returns text language sql as $$
  select (select count(*) from public.integration_events where data::text like '%SECRETMARK%')::text || ' '
      || (select count(*) from public.integrations where row_to_json(integrations)::text like '%SECRETMARK%')::text || ' '
      || (select count(*) from public.notifications where body like '%SECRETMARK%')::text $$;
set local role authenticated;

-- Capabilities: the administrator's by default ----------------------------------------------
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
select pg_temp.c('01 eight settings capabilities, none for the director by default',
  (select count(*)::text from public.capabilities where grp = 'settings') || ' ' ||
  (select count(*)::text from public.capabilities c where c.grp = 'settings' and public.has_capability(c.key, null)), '8 0');
select pg_temp.who('00000000-0000-0000-0000-0000000000a1');
select pg_temp.c('02 the administrator holds all eight', (select count(*)::text from public.capabilities c where c.grp = 'settings' and public.has_capability(c.key, null)), '8');

-- Reading the core ---------------------------------------------------------------------------
select pg_temp.who('00000000-0000-0000-0000-0000000000c1');
select pg_temp.t('03 a writer cannot list integrations', $q$ select public.int_list() $q$, 'ERR FORBIDDEN');
select pg_temp.c('04 nor read the table directly (no policy)', (select count(*)::text from public.integrations), '0');
select pg_temp.who('00000000-0000-0000-0000-0000000000a1');
select pg_temp.c('05 the administrator sees Google Drive, pending, no secret, and no secret reference',
  (select string_agg((x->>'label') || ':' || (x->>'state') || ':' || (x->>'has_secret') || ':' || (x ? 'secret_id')::text || ':' || (x ? 'pending_secret_id')::text, ',') from jsonb_array_elements(public.int_list()) x),
  'Google Drive:pending:false:false:false');

-- Putting a secret in --------------------------------------------------------------------------
select pg_temp.who('00000000-0000-0000-0000-0000000000c1');
select pg_temp.t('06 a writer cannot set a secret', $q$ select public.int_secret_set('00000000-0000-4000-8000-0000000000d1', 'tok-SECRETMARK-first-1234') $q$, 'ERR FORBIDDEN');
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
select pg_temp.t('07 nor the director without «integrations.secrets»', $q$ select public.int_secret_set('00000000-0000-4000-8000-0000000000d1', 'tok-SECRETMARK-first-1234') $q$, 'ERR FORBIDDEN');
select pg_temp.who('00000000-0000-0000-0000-0000000000a1');
select pg_temp.t('08 a too short secret is refused', $q$ select public.int_secret_set('00000000-0000-4000-8000-0000000000d1', 'short') $q$, 'ERR SECRET_INVALID');
select pg_temp.c('09 the administrator sets one: only a masked tail comes back', (select public.int_secret_set('00000000-0000-4000-8000-0000000000d1', 'tok-SECRETMARK-first-1234')), '••••1234');
select pg_temp.c('10 it is pending: not yet the secret in use', (select (x->>'pending') || ' ' || (x->>'has_secret') from jsonb_array_elements(public.int_list()) x), 'true false');

-- Getting it out ---------------------------------------------------------------------------------
select pg_temp.t('11 the administrator cannot read it without the server key', $q$ select public.int_secret_use('wrong', 'google_drive', 'look', true) $q$, 'ERR FORBIDDEN');
set local role anon;
select pg_temp.t('12 nor anyone without a sign-in', $q$ select public.int_secret_use('wrong', 'google_drive', 'look', true) $q$, 'ERR FORBIDDEN');
select pg_temp.c('13 the server, with its key: no secret in use yet', coalesce(public.int_secret_use('k-rule-run-only', 'google_drive', 'drive token', false), 'none'), 'none');
select pg_temp.c('14 the server reads the pending one to check it', public.int_secret_use('k-rule-run-only', 'google_drive', 'check before commit', true), 'tok-SECRETMARK-first-1234');
select pg_temp.t('15 the server key alone cannot commit (not even callable without a sign-in)', $q$ select public.int_secret_commit('k-rule-run-only', '00000000-0000-4000-8000-0000000000d1', '••••1234', null) $q$, 'ERR permission denied for function int_secret_commit');
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000a1');
select pg_temp.t('16 nor the holder without the key', $q$ select public.int_secret_commit('wrong', '00000000-0000-4000-8000-0000000000d1', '••••1234', null) $q$, 'ERR FORBIDDEN');
select pg_temp.t('17 holder and key together commit', $q$ select public.int_secret_commit('k-rule-run-only', '00000000-0000-4000-8000-0000000000d1', '••••1234', '{"account":"shown to admins"}') $q$, 'ok');
select pg_temp.c('18 connected, a secret in use, the tail, nothing pending',
  (select (x->>'state') || ' ' || (x->>'has_secret') || ' ' || (x->>'secret_tail') || ' ' || (x->>'pending') from jsonb_array_elements(public.int_list()) x), 'connected true ••••1234 false');
reset role;
select pg_temp.c('19 one vault row for it', (select count(*)::text from vault.secrets where name like 'integration:00000000-0000-4000-8000-0000000000d1:%'), '1');
set local role authenticated;

-- Rotation keeps the old one until the new one is checked ------------------------------------------
select pg_temp.who('00000000-0000-0000-0000-0000000000a1');
select pg_temp.c('20 a new secret is set, pending', (select public.int_secret_set('00000000-0000-4000-8000-0000000000d1', 'tok-SECRETMARK-second-9999')), '••••9999');
set local role anon;
select pg_temp.c('21 the old one is still the one in use', public.int_secret_use('k-rule-run-only', 'google_drive', 'drive token', false), 'tok-SECRETMARK-first-1234');
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000a1');
select pg_temp.t('22 the check failed: discard', $q$ select public.int_secret_discard('00000000-0000-4000-8000-0000000000d1', 'TOKEN_REFUSED') $q$, 'ok');
set local role anon;
select pg_temp.c('23 still the old one, nothing pending', public.int_secret_use('k-rule-run-only', 'google_drive', 'drive token', false) || ' ' || coalesce(public.int_secret_use('k-rule-run-only', 'google_drive', 'x', true), 'none'), 'tok-SECRETMARK-first-1234 none');
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000a1');
select pg_temp.t('24 set and commit a third', $q$ select public.int_secret_set('00000000-0000-4000-8000-0000000000d1', 'tok-SECRETMARK-third-5555'), public.int_secret_commit('k-rule-run-only', '00000000-0000-4000-8000-0000000000d1', '••••5555', null) $q$, 'ok');
set local role anon;
select pg_temp.c('25 the third is in use', public.int_secret_use('k-rule-run-only', 'google_drive', 'drive token', false), 'tok-SECRETMARK-third-5555');
reset role;
select pg_temp.c('26 the replaced and discarded ones are gone from the vault', (select count(*)::text from vault.secrets where name like 'integration:00000000-0000-4000-8000-0000000000d1:%'), '1');
set local role authenticated;

-- The security review: every other way in ----------------------------------------------------------
select pg_temp.who('00000000-0000-0000-0000-0000000000c1');
select pg_temp.t('27 a member reading the vault view', $q$ select count(*) from vault.decrypted_secrets $q$, 'ERR permission denied for schema vault');
select pg_temp.t('28 a member reading the vault table', $q$ select count(*) from vault.secrets $q$, 'ERR permission denied for schema vault');
select pg_temp.t('29 a member calling the vault directly', $q$ select vault.create_secret('x-SECRETMARK-x', 'x', 'x') $q$, 'ERR permission denied for schema vault');
select pg_temp.t('30 a member guessing the server key', $q$ select public.int_secret_use('k-rule-run-only-guess', 'google_drive', 'x', false) $q$, 'ERR FORBIDDEN');
select pg_temp.c('31 a member sees no event', (select count(*)::text from public.integration_events), '0');
select pg_temp.who('00000000-0000-0000-0000-0000000000a1');
select pg_temp.t('32 an administrator reading the vault view', $q$ select count(*) from vault.decrypted_secrets $q$, 'ERR permission denied for schema vault');
select pg_temp.c('33 an administrator through the list: no secret, no reference', (select (public.int_list()::text like '%SECRETMARK%')::text || ' ' || (public.int_list()::text like '%secret_id%')::text), 'false false');
select pg_temp.c('34 an administrator through the event log: no value', (select (public.int_events(500)::text like '%SECRETMARK%')::text), 'false');
reset role;
select pg_temp.c('35 no secret in any event, integration row or notice', pg_temp.leaks(), '0 0 0');
select pg_temp.c('36 every read through the key was logged with its purpose, never the value',
  (select count(*)::text from public.integration_events where kind = 'secret_used' and integration_id = '00000000-0000-4000-8000-0000000000d1' and data ? 'purpose'), '4');
select pg_temp.t('37 the event log is append-only', $q$ update public.integration_events set data = '{}' $q$, 'ERR APPEND_ONLY');
select pg_temp.c('38 the database log does not record function calls', current_setting('log_statement'), 'ddl');
set local role authenticated;

-- Health and state ------------------------------------------------------------------------------------
set local role anon;
select pg_temp.t('39 a health result needs the key', $q$ select public.int_health('wrong', 'google_drive', false, 'TOKEN_REFUSED', null) $q$, 'ERR FORBIDDEN');
select pg_temp.t('40 the server records a refused token', $q$ select public.int_health('k-rule-run-only', 'google_drive', false, 'TOKEN_REFUSED', null) $q$, 'ok');
select pg_temp.t('41 and the same again', $q$ select public.int_health('k-rule-run-only', 'google_drive', false, 'TOKEN_REFUSED', null) $q$, 'ok');
reset role;
select pg_temp.c('42 needs reconnecting; one event for the change, none for the repeat',
  (select state from public.integrations where id = '00000000-0000-4000-8000-0000000000d1') || ' ' ||
  (select count(*)::text from public.integration_events where kind = 'health'), 'needs_reconnect 1');
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
select pg_temp.t('43 the director cannot disable a storage provider', $q$ select public.int_set_enabled('00000000-0000-4000-8000-0000000000d1', false) $q$, 'ERR FORBIDDEN');
select pg_temp.who('00000000-0000-0000-0000-0000000000a1');
select pg_temp.t('44 the administrator disables it', $q$ select public.int_set_enabled('00000000-0000-4000-8000-0000000000d1', false) $q$, 'ok');
set local role anon;
select pg_temp.c('45 a disabled integration gives no secret', coalesce(public.int_secret_use('k-rule-run-only', 'google_drive', 'drive token', false), 'none'), 'none');
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000a1');
select pg_temp.t('46 and enables it again', $q$ select public.int_set_enabled('00000000-0000-4000-8000-0000000000d1', true) $q$, 'ok');

-- General settings -----------------------------------------------------------------------------------
select pg_temp.who('00000000-0000-0000-0000-0000000000c1');
select pg_temp.t('47 a writer cannot change settings', $q$ select public.settings_update('{"maintenance_on":true}') $q$, 'ERR FORBIDDEN');
select pg_temp.t('48 nor see the overview', $q$ select public.settings_overview() $q$, 'ERR FORBIDDEN');
select pg_temp.c('49 but reads the maintenance banner row', (select count(*)::text from public.site_settings), '1');
select pg_temp.who('00000000-0000-0000-0000-0000000000a1');
select pg_temp.t('50 the administrator turns the banner on and lowers the upload limit', $q$ select public.settings_update('{"maintenance_on":true,"maintenance_text":"صيانة الليلة","upload_max_mb":100}') $q$, 'ok');
select pg_temp.t('51 a limit above 5 GB is refused', $q$ select public.settings_update('{"upload_max_mb":6000}') $q$, 'ERR new row for relation "site_settings" violates check constraint "site_settings_upload_max_mb_check"');
select pg_temp.c('52 the row', (select maintenance_on || ' ' || maintenance_text || ' ' || upload_max_mb from public.site_settings), 'true صيانة الليلة 100');
select pg_temp.c('53 the event names what changed, not the text', (select data::text from public.integration_events where kind = 'settings' order by id desc limit 1), '{"upload_max_mb": 100, "maintenance_on": true, "maintenance_text": true}');
select pg_temp.c('54 the overview counts the library', (select (public.settings_overview()->>'library_files') = (select count(*)::text from public.media_versions))::text, 'true');

-- A timed grant opens the view -------------------------------------------------------------------------
select pg_temp.t('55 the administrator gives the director «عرض صحة النظام» for a day', $q$ select public.grant_capability('dir@t.test','settings.view','timed',now() + interval '1 day',null,null,'تغطية') $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
select pg_temp.c('56 the director now lists integrations, still with no secret', (select (jsonb_array_length(public.int_list()) = 1 and public.int_list()::text not like '%SECRETMARK%')::text), 'true');
select pg_temp.t('57 but still cannot touch secrets', $q$ select public.int_secret_set('00000000-0000-4000-8000-0000000000d1', 'tok-SECRETMARK-dir-0000') $q$, 'ERR FORBIDDEN');
reset role;

select * from (
  select n, k, v, expect from r where v is distinct from expect
  union all select 0, 'TOTAL', count(*)::text, (count(*) filter (where v is not distinct from expect))::text || ' passed' from r) z order by n;
rollback;

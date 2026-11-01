-- «المنصات» and «حسابات المنصات» rules (MVP_draft.md 67), checked inside one transaction that is rolled back at the end.
-- Throwaway accounts (@t.test) act through row level security; nothing about a real person is read into the result.
-- Covered: only the platforms right writes a setup; nothing but the app's id and Configuration ID can be kept, so a
-- secret can never sit in a draft; who reads a setup; what `platform_ready` tells and to whom; and the publisher, who
-- may reconnect an account and may not add or cut off one.
-- The last query lists only the checks that differ from the rule, and the total.
-- Result: qa/platform-setup-rules.json.
begin;
create temp table r(n serial, k text, v text, expect text);
create temp table ids(k text primary key, id uuid);
grant all on r, ids to public; grant usage on sequence r_n_seq to public;
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
create function pg_temp.c(k text, got text, e text) returns void language sql as $$ insert into r(k,v,expect) values (k,got,e) $$;

-- One account connected for real, one app with a secret, as the routes leave them.
insert into public.platform_accounts (platform, label, handle, added_by, publishers, conn_kind, conn_state, external_id)
  values ('x', 'رسمي', '@t_real', 'dir@t.test', '{pub@t.test}', 'oauth', 'needs_reconnect', 'ext-1');
insert into ids select 'real', id from public.platform_accounts where handle = '@t_real';
insert into public.integrations (kind, type, label, state, config, secret_id, created_by)
  select 'platform', 'x_app', 'تطبيق X', 'connected', '{"app_id":"t-app"}', vault.create_secret('t-secret-value', 'rule-run-only'), 'dir@t.test'
  where not exists (select 1 from public.integrations where type = 'x_app' and deleted_at is null);

set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000c1');
select pg_temp.t('01 a writer cannot save a setup', $$select public.platform_setup_save('x', '{app}', 'keys', '{}')$$, 'ERR FORBIDDEN');
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
select pg_temp.t('02 the director saves one', $$select public.platform_setup_save('x', '{app,redirect}', 'keys', '{"app_id":"abc.123","config_id":"12345678"}')$$, 'ok');
select pg_temp.c('03 and it is kept', (select array_to_string(done, ',') || '|' || step || '|' || (fields->>'app_id') || '|' || (fields->>'config_id') from public.platform_setup where key = 'x'), 'app,redirect|keys|abc.123|12345678');
select pg_temp.t('04 saving again replaces it', $$select public.platform_setup_save('x', '{app}', null, '{}')$$, 'ok');
select pg_temp.c('05 with nothing left of the last one', (select array_to_string(done, ',') || '|' || coalesce(step, '-') || '|' || fields::text from public.platform_setup where key = 'x'), 'app|-|{}');
select pg_temp.t('06 a secret has no place here', $$select public.platform_setup_save('x', '{}', null, '{"secret":"s3cret-value"}')$$, 'ERR SETUP_INVALID');
select pg_temp.t('07 nor anything else', $$select public.platform_setup_save('x', '{}', null, '{"client_secret":"s3cret"}')$$, 'ERR SETUP_INVALID');
select pg_temp.t('08 a Configuration ID is digits', $$select public.platform_setup_save('x', '{}', null, '{"config_id":"not-digits"}')$$, 'ERR SETUP_INVALID');
select pg_temp.t('09 an app id is plain', $$select public.platform_setup_save('x', '{}', null, '{"app_id":"a b"}')$$, 'ERR SETUP_INVALID');
select pg_temp.t('10 an empty field is simply absent', $$select public.platform_setup_save('x', '{}', null, '{"app_id":"","config_id":""}')$$, 'ok');
select pg_temp.t('11 a step is a name', $$select public.platform_setup_save('x', '{Bad Step}', null, '{}')$$, 'ERR SETUP_INVALID');
select pg_temp.t('12 and the current one too', $$select public.platform_setup_save('x', '{}', 'bad step', '{}')$$, 'ERR SETUP_INVALID');
select pg_temp.t('13 an unknown platform is refused', $$select public.platform_setup_save('nope', '{}', null, '{}')$$, 'ERR UNKNOWN_PLATFORM');
select pg_temp.t('14 the mail channel has no setup', $$select public.platform_setup_save('mail', '{}', null, '{}')$$, 'ERR UNKNOWN_PLATFORM');
select pg_temp.c('15 the table has no field for a secret', (select count(*)::text from information_schema.columns where table_schema = 'public' and table_name = 'platform_setup' and column_name ~ 'secret|token'), '0');
select pg_temp.who('00000000-0000-0000-0000-0000000000c1');
select pg_temp.c('16 a writer reads no setup', (select count(*)::text from public.platform_setup), '0');
select pg_temp.t('17 nor writes to the table', $$insert into public.platform_setup (key) values ('linkedin')$$, 'ERR permission denied for table platform_setup');
select pg_temp.who('00000000-0000-0000-0000-0000000000a1');
select pg_temp.c('18 the Admin reads it', (select count(*)::text from public.platform_setup), '1');

-- What is ready.
select pg_temp.who('00000000-0000-0000-0000-0000000000c1');
select pg_temp.t('19 a writer may not ask which apps are ready', $$select public.platform_ready()$$, 'ERR FORBIDDEN');
select pg_temp.who('00000000-0000-0000-0000-0000000000e1');
select pg_temp.c('20 the publisher may, and hears the state alone', (select (public.platform_ready())->>'x_app'), 'connected');
select pg_temp.c('21 nothing in it but the states', (select count(*)::text from jsonb_each_text(public.platform_ready()) e where e.value !~ '^(pending|connected|needs_reconnect|error|disabled)$'), '0');

-- The publisher.
select pg_temp.c('22 the publisher may go through a sign-in', public.platform_conn_may()::text, 'true');
select pg_temp.c('23 but does not manage accounts', public.platform_conn_manage()::text, 'false');
select pg_temp.t('24 and cannot add an account', $$select public.platform_conn_link('k-rule-run-only', '{"platform":"x","type":"x_user","label":"جديد","handle":"@t_new","publishers":["pub@t.test"],"external_id":"ext-2"}', 'token-value-1')$$, 'ERR FORBIDDEN');
select pg_temp.t('25 nor take over one by its handle', $$select public.platform_conn_link('k-rule-run-only', '{"platform":"x","type":"x_user","label":"رسمي","handle":"@t_real","external_id":"ext-1"}', 'token-value-1')$$, 'ERR FORBIDDEN');
select pg_temp.t('26 but reconnects an account by its id', format($$select public.platform_conn_link('k-rule-run-only', '{"platform":"x","type":"x_user","label":"رسمي","handle":"@t_real","external_id":"ext-1","account_id":"%s"}', 'token-value-1')$$, (select id from ids where k = 'real')), 'ok');
select pg_temp.t('27 which keeps its publishers', 'do $d$ begin if (select publishers from public.platform_accounts where handle = ''@t_real'') <> ''{pub@t.test}''::text[] then raise exception ''CHANGED''; end if; end $d$', 'ok');
select pg_temp.t('28 and cannot cut one off', format($$select public.platform_conn_disconnect('%s')$$, (select id from ids where k = 'real')), 'ERR FORBIDDEN');
select pg_temp.who('00000000-0000-0000-0000-0000000000c1');
select pg_temp.c('29 a writer may not go through a sign-in', public.platform_conn_may()::text, 'false');
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
select pg_temp.c('30 the director manages accounts', public.platform_conn_manage()::text, 'true');
select pg_temp.t('31 and adds one', $$select public.platform_conn_link('k-rule-run-only', '{"platform":"x","type":"x_user","label":"جديد","handle":"@t_new","publishers":["pub@t.test"],"external_id":"ext-2"}', 'token-value-2')$$, 'ok');
select pg_temp.t('32 and cuts one off', format($$select public.platform_conn_disconnect('%s')$$, (select id from ids where k = 'real')), 'ok');
reset role;

select pg_temp.c('33 nobody signed out may save', has_function_privilege('anon','public.platform_setup_save(text,text[],text,jsonb)','execute')::text, 'false');
select pg_temp.c('34 or ask what is ready', has_function_privilege('anon','public.platform_ready()','execute')::text, 'false');
select pg_temp.c('35 or read a setup', has_table_privilege('anon','public.platform_setup','select')::text, 'false');

-- The TOTAL row also carries the md5 of the text this run executed (without the lines a client
-- may append after it), so a recorded result can be matched to the file.
select * from (
  select n, k, v, expect from r where v is distinct from expect
  union all select 0, 'TOTAL', count(*)::text, (count(*) filter (where v is not distinct from expect))::text || ' passed; run md5 '
    || md5(case when strpos(current_query(), E'\n\n-- source: ') > 0 then left(current_query(), strpos(current_query(), E'\n\n-- source: ') - 1) else current_query() end) from r) z order by n;
rollback;

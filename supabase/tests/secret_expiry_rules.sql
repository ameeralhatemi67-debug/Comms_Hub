-- Action_Plan.md section 5 (secret expiry reminder; migration 20261015230000_secret_expiry.sql):
-- holders of the secrets right are told once a week per secret from 30 days before the date the
-- Director stated, nobody else is, a bad date or a disabled integration is ignored, and the
-- function is not callable anonymously. One transaction, rolled back at the end.
-- Result: qa/secret-expiry-rules.json.
begin;
create temp table r(n serial, k text, v text, expect text);
grant all on r to authenticated; grant usage on sequence r_n_seq to authenticated;
insert into public.accounts (email, display_name, role, pages, protected) values
 ('adm@t.test','Adm','admin','{}',true),('dir@t.test','Dir','director','{}',false),
 ('asst@t.test','Asst','assistant','{}',false),('wri@t.test','Wri','writer','{}',false);
insert into auth.users (id, email, email_confirmed_at) values
 ('00000000-0000-0000-0000-0000000000a1','adm@t.test',now()),('00000000-0000-0000-0000-0000000000d1','dir@t.test',now()),
 ('00000000-0000-0000-0000-0000000000b1','asst@t.test',now()),('00000000-0000-0000-0000-0000000000c1','wri@t.test',now());
create function pg_temp.who(id text) returns void language sql as $$ select set_config('request.jwt.claims', json_build_object('sub',id,'role','authenticated')::text, true) $$;
create function pg_temp.c(k text, val text, e text) returns void language sql as $$ insert into r(k,v,expect) values (k,val,e) $$;
grant execute on function pg_temp.who(text), pg_temp.c(text,text,text) to authenticated;
-- Four integrations: due in 10 days; due in 60 days; a bad date text; due in 5 days but disabled.
insert into public.integrations (kind, type, label, state, config, secret_id, secret_tail, secret_set_at, created_by)
select 'platform', t.type, t.label, t.st, t.cfg, vault.create_secret('S-' || t.type, 'rule-' || t.type, 'rule run'), '••••0000', now(), 'seed'
from (values
 ('microsoft_app', 'تطبيق Microsoft (OneDrive)', 'connected', jsonb_build_object('app_id','a1','secret_expires_on', ((now() at time zone 'Asia/Riyadh')::date + 10)::text)),
 ('google_app', 'تطبيق Google', 'connected', jsonb_build_object('app_id','a2','secret_expires_on', ((now() at time zone 'Asia/Riyadh')::date + 60)::text)),
 ('x_app', 'تطبيق X', 'connected', jsonb_build_object('app_id','a3','secret_expires_on', 'soon')),
 ('linkedin_app', 'تطبيق LinkedIn', 'disabled', jsonb_build_object('app_id','a4','secret_expires_on', ((now() at time zone 'Asia/Riyadh')::date + 5)::text))
) as t(type, label, st, cfg);
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
select pg_temp.c('01 the director opens a page: the check runs', (select (public.integration_expiry_notes() >= 1)::text), 'true');
reset role;
select pg_temp.c('02 the director is told once, about Microsoft only', (select count(*)::text from public.notifications where recipient = 'dir@t.test' and body like '%Microsoft%بعد 10 يوماً%'), '1');
select pg_temp.c('03 and about nothing else (60 days, a bad date, disabled)', (select count(*)::text from public.notifications where recipient = 'dir@t.test'), '1');
select pg_temp.c('04 the administrator holds the right and is told too', (select count(*)::text from public.notifications where recipient = 'adm@t.test'), '1');
select pg_temp.c('05 the assistant and the writer are not', (select count(*)::text from public.notifications where recipient in ('asst@t.test','wri@t.test')), '0');
select pg_temp.c('06 the notification leads to the connections tab', (select go ->> 'page' || ' ' || (go ->> 'tab') from public.notifications where recipient = 'dir@t.test'), 'settings connections');
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
select pg_temp.c('07 a second open within the week runs', (select (public.integration_expiry_notes() >= 0)::text), 'true');
reset role;
select pg_temp.c('08 and adds nothing for the director', (select count(*)::text from public.notifications where recipient = 'dir@t.test'), '1');
update public.integrations set config = jsonb_set(config, '{secret_expires_on}', to_jsonb(((now() at time zone 'Asia/Riyadh')::date - 3)::text)) where type = 'microsoft_app';
update public.notifications set created_at = now() - interval '8 days' where recipient = 'dir@t.test';
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
select pg_temp.c('09 a week later it is reminded again', (select (public.integration_expiry_notes() >= 1)::text), 'true');
reset role;
select pg_temp.c('10 worded as expired', (select count(*)::text from public.notifications where recipient = 'dir@t.test' and body like 'انتهى سر%Microsoft%'), '1');
select pg_temp.c('11 anonymous callers have no access', (select case when has_function_privilege('anon', 'public.integration_expiry_notes()', 'execute') then 'callable' else 'refused' end), 'refused');

select n, k, v, expect from r where v is distinct from expect
union all select 0, 'TOTAL', count(*)::text, (count(*) filter (where v is not distinct from expect))::text || ' passed' from r
order by n;
rollback;

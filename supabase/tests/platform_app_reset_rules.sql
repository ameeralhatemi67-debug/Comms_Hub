-- MVP_draft.md section 79.4 (migration 20261115130000_platform_app_reset.sql): «إعادة ضبط» of a platform. Who may, never while an
-- account still holds a token of the app, never YouTube's Google app, and what it forgets: the app's secret, a waiting sign-in, the
-- saved steps, the platform switched off, the reset written to the platform's log. Only throwaway accounts (@t.test) are touched.
-- One transaction, rolled back at the end. Result: qa/platform-app-reset-rules.json.
begin;
create temp table r(n serial, k text, v text, expect text);
create temp table v(k text primary key, val text);
grant all on r, v to public; grant usage on sequence r_n_seq to public;
insert into public.accounts (email, display_name, role, pages, protected) values
 ('adm@t.test','Adm','admin','{}',true),('wri@t.test','Wri','writer','{}',false);
insert into auth.users (id, email, email_confirmed_at) values
 ('00000000-0000-0000-0000-0000000000b1','adm@t.test',now()),('00000000-0000-0000-0000-0000000000b2','wri@t.test',now());
insert into public.platforms (key, label_ar, kind, sort, enabled) values ('tiktok', 'تيك توك', 'social', 3, true) on conflict (key) do update set enabled = true;
insert into public.platforms (key, label_ar, kind, sort, enabled) values ('instagram', 'إنستغرام', 'social', 1, true) on conflict (key) do update set enabled = true;
insert into public.platforms (key, label_ar, kind, sort, enabled) values ('facebook', 'فيسبوك', 'social', 7, true) on conflict (key) do update set enabled = true;
-- The TikTok app, a sign-in waiting to be chosen, and a connected account, each with its secret in the vault.
with s as (select vault.create_secret('tt-app-secret', 'test:tt-app:' || gen_random_uuid()) id),
     i as (insert into public.integrations (kind, type, label, state, config, secret_id, secret_tail, created_by)
           select 'platform', 'tiktok_app', 'TikTok', 'connected', '{"app_id":"awtestkey"}', s.id, '••••cret', 'adm@t.test' from s returning id, secret_id)
insert into v select 'app', id::text from i union all select 'app_secret', secret_id::text from i;
with s as (select vault.create_secret('tt-offer-token', 'test:tt-offer:' || gen_random_uuid()) id),
     i as (insert into public.integrations (kind, type, label, state, secret_id, created_by)
           select 'platform', 'tiktok_user_offer', 'دخول', 'connected', s.id, 'adm@t.test' from s returning id, secret_id)
insert into v select 'offer_secret', secret_id::text from i;
with s as (select vault.create_secret('tt-account-token', 'test:tt-acc:' || gen_random_uuid()) id),
     i as (insert into public.integrations (kind, type, label, state, secret_id, created_by)
           select 'platform', 'tiktok_user', 'الحساب', 'connected', s.id, 'adm@t.test' from s returning id),
     a as (insert into public.platform_accounts (platform, label, handle, publishers, added_by, conn_kind, conn_state, external_id, integration_id, authorized_until)
           select 'tiktok', 'حساب', 'tt:x', '{}', 'adm@t.test', 'oauth', 'connected', '-000resettest', i.id, now() + interval '365 days' from i returning id)
insert into v select 'acc', id::text from a;
insert into public.platform_setup (key, done, step) values ('tiktok', '{org,app,verify}', 'keys'), ('instagram', '{accounts}', 'app'), ('facebook', '{usecase}', 'redirect')
  on conflict (key) do update set done = excluded.done, step = excluded.step;
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

select pg_temp.who('00000000-0000-0000-0000-0000000000b2');
select pg_temp.t('01 a writer may not reset', $q$ select public.platform_app_reset('tiktok') $q$, 'ERR FORBIDDEN');
select pg_temp.who('00000000-0000-0000-0000-0000000000b1');
select pg_temp.t('02 YouTube''s Google app is also the library''s Drive', $q$ select public.platform_app_reset('youtube') $q$, 'ERR APP_SHARED');
select pg_temp.t('03 nor a platform the site does not know', $q$ select public.platform_app_reset('myspace') $q$, 'ERR UNKNOWN_PLATFORM');
select pg_temp.t('04 not while an account still holds a token of the app', $q$ select public.platform_app_reset('tiktok') $q$, 'ERR APP_IN_USE');
select pg_temp.t('05 the account''s connection ended («فصل»)', $q$ select public.platform_conn_disconnect(pg_temp.g('acc')::uuid) $q$, 'ok');
select pg_temp.t('06 then the reset goes through', $q$ select public.platform_app_reset('tiktok') $q$, 'ok');
reset role;
select pg_temp.c('07 the app''s secret left the vault', (select count(*)::text from vault.secrets where id = pg_temp.g('app_secret')::uuid), '0');
select pg_temp.c('08 the app is closed, its log kept', (select (deleted_at is not null)::text || ' ' || state || ' ' || coalesce(secret_tail, 'none') from public.integrations where id = pg_temp.g('app')::uuid), 'true disabled none');
select pg_temp.c('09 its log says it was reset', (select count(*)::text from public.integration_events where integration_id = pg_temp.g('app')::uuid and kind = 'disabled' and data->>'reset' = 'true'), '1');
select pg_temp.c('10 the waiting sign-in''s token is gone', (select count(*)::text from vault.secrets where id = pg_temp.g('offer_secret')::uuid), '0');
select pg_temp.c('11 no TikTok app is left for the server', (select count(*)::text from public.integrations where type = 'tiktok_app' and deleted_at is null), '0');
select pg_temp.c('12 the steps start again', (select count(*)::text from public.platform_setup where key = 'tiktok'), '0');
select pg_temp.c('13 the platform is off for new accounts', (select enabled::text from public.platforms where key = 'tiktok'), 'false');
select pg_temp.c('14 the platform''s log says so', (select count(*)::text from public.platform_events where platform = 'tiktok' and kind = 'reset' and actor = 'adm@t.test'), '1');
select pg_temp.c('15 the ended account stays, to reconnect after the new setup', (select conn_state from public.platform_accounts where id = pg_temp.g('acc')::uuid), 'needs_reconnect');
select pg_temp.c('16 Instagram''s steps are untouched by a TikTok reset', (select array_to_string(done, ',') from public.platform_setup where key = 'instagram'), 'accounts');
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000b1');
select pg_temp.t('17 Meta''s one app: a reset from Instagram', $q$ select public.platform_app_reset('instagram') $q$, 'ok');
reset role;
select pg_temp.c('18 clears Instagram''s and Facebook''s steps together', (select count(*)::text from public.platform_setup where key in ('instagram','facebook')), '0');
select pg_temp.c('19 and switches both off', (select string_agg(key || '=' || enabled::text, ',' order by key) from public.platforms where key in ('instagram','facebook')), 'facebook=false,instagram=false');
select pg_temp.c('20 a page cannot run it signed out', (select has_function_privilege('anon', 'public.platform_app_reset(text)', 'execute')::text), 'false');

select n, k, v, expect from r where v is distinct from expect
union all select 0, 'TOTAL', count(*)::text, (count(*) filter (where v is not distinct from expect))::text || ' passed' from r
order by n;
rollback;

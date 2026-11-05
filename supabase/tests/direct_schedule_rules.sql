-- MVP_draft.md section 76.5 (migration 20261105210000_direct_schedule.sql): «مجدول» for an Instagram direct post. That only a holder
-- of publish.direct schedules, waits and cancels; the window; that a waiting post is never closed by another start; that the site's
-- server, with its key alone and no session, fires only a due scheduled Instagram direct post, under a lease, reading the token once
-- and writing that to the account's events; that it publishes only on the account's own Instagram; that it is written to «سجل النشاط»
-- under its author and told, late or on time; that a post a day late, or on an account that is off, is given up and its author told;
-- and what a page may read and call. Only throwaway accounts (@t.test) are touched; the server key and the vault's token are
-- throwaways inside the transaction. One transaction, rolled back at the end. Result: qa/direct-schedule-rules.json.
begin;
create temp table r(n serial, k text, v text, expect text);
create temp table v(k text primary key, val text);
grant all on r, v to public; grant usage on sequence r_n_seq to public;
insert into public.accounts (email, display_name, role, pages, protected) values
 ('adm@t.test','Adm','admin','{}',true),('dir@t.test','Dir','director','{}',false),('asst@t.test','Asst','assistant','{}',false),
 ('pub@t.test','Pub','publisher','{}',false);
insert into auth.users (id, email, email_confirmed_at) values
 ('00000000-0000-0000-0000-0000000000a1','adm@t.test',now()),('00000000-0000-0000-0000-0000000000a2','dir@t.test',now()),
 ('00000000-0000-0000-0000-0000000000a3','asst@t.test',now()),('00000000-0000-0000-0000-0000000000a4','pub@t.test',now());
insert into public.mail_server_key (id, key_hash) values (1, encode(sha256(convert_to('k-sched-run-only', 'UTF8')), 'hex'))
  on conflict (id) do update set key_hash = excluded.key_hash;
insert into public.platforms (key, label_ar, kind, sort, enabled) values ('instagram', 'إنستغرام', 'social', 1, true) on conflict (key) do nothing;
insert into v select 'secret', vault.create_secret('tok-sched-run-only')::text;
with i as (insert into public.integrations (kind, type, label, state, created_by, secret_id)
           values ('platform','meta_instagram','حساب الفحص','connected','dir@t.test', (select val::uuid from v where k = 'secret')) returning id),
     a as (insert into public.platform_accounts (platform, label, handle, publishers, added_by, conn_kind, conn_state, external_id, integration_id, authorized_until)
           select 'instagram', 'حساب الفحص', '@t_account', array['pub@t.test'], 'dir@t.test', 'oauth', 'connected', '17841400000000001', i.id, now() + interval '60 days' from i returning id, integration_id)
insert into v select 'ig', id::text from a union all select 'int', integration_id::text from a;
create function pg_temp.who(id text) returns void language sql as $$ select set_config('request.jwt.claims', json_build_object('sub',id,'role','authenticated')::text, true) $$;
create function pg_temp.nobody() returns void language sql as $$ select set_config('request.jwt.claims', '', true) $$;
create function pg_temp.t(k text, sqltext text, e text) returns void language plpgsql as $$
begin
  begin execute sqltext; insert into r(k,v,expect) values (k,'ok',e);
  exception when others then insert into r(k,v,expect) values (k,'ERR '||sqlerrm,e); end;
end $$;
create function pg_temp.c(k text, val text, e text) returns void language sql as $$ insert into r(k,v,expect) values (k,val,e) $$;
create function pg_temp.g(k text) returns text language sql as $$ select val from v where k = $1 $$;
-- An Instagram Story of 1000 bytes from this device, scheduled `mins` minutes ahead; `extra` adds or replaces fields.
create function pg_temp.ig(mins int default 60, extra jsonb default '{}') returns jsonb language sql as $$
  select jsonb_build_object('kind', 'story_image', 'title', 'قصة مجدولة', 'source', 'device', 'size', 1000, 'mime', 'image/jpeg',
    'purpose', 'direct', 'scheduled_for', now() + make_interval(mins => mins)) || extra $$;
-- Started, its temporary copy recorded and waiting, as the director's server does it.
create function pg_temp.waiting(name text, mins int default 60) returns void language plpgsql as $$
declare v_id uuid;
begin
  v_id := public.platform_test_start(pg_temp.g('ig')::uuid, pg_temp.ig(mins));
  perform public.platform_test_temp('k-sched-run-only', v_id, 'driveTemp_' || name || '_0001');
  perform public.direct_wait('k-sched-run-only', v_id, '', '');
  insert into v values (name, v_id::text);
end $$;
grant execute on function pg_temp.who(text), pg_temp.nobody(), pg_temp.t(text,text,text), pg_temp.c(text,text,text), pg_temp.g(text),
  pg_temp.ig(int,jsonb), pg_temp.waiting(text,int) to public;
set local role authenticated;

-- 1. Scheduling ------------------------------------------------------------------------------------------------------------
select pg_temp.who('00000000-0000-0000-0000-0000000000a2');
select pg_temp.t('01 ten minutes is too soon', $q$ select public.platform_test_start(pg_temp.g('ig')::uuid, pg_temp.ig(5)) $q$, 'ERR SCHEDULE_INVALID');
select pg_temp.t('02 thirty-one days is too far', $q$ select public.platform_test_start(pg_temp.g('ig')::uuid, pg_temp.ig(31 * 24 * 60)) $q$, 'ERR SCHEDULE_INVALID');
select pg_temp.t('03 a test on Instagram has no time', $q$ select public.platform_test_start(pg_temp.g('ig')::uuid, pg_temp.ig(60, '{"purpose":"test"}')) $q$, 'ERR TEST_INVALID');
select pg_temp.t('04 the director schedules a Story an hour ahead', $q$ insert into v select 'p1', public.platform_test_start(pg_temp.g('ig')::uuid, pg_temp.ig(60)) $q$, 'ok');
select pg_temp.t('05 it cannot wait before its file is where Meta fetches it', $q$ select public.direct_wait('k-sched-run-only', pg_temp.g('p1')::uuid, '', '') $q$, 'ERR FORBIDDEN');
select pg_temp.t('06 its temporary copy', $q$ select public.platform_test_temp('k-sched-run-only', pg_temp.g('p1')::uuid, 'driveTemp_p1_000001') $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-0000000000a3');
select pg_temp.t('07 the assistant may not make it wait', $q$ select public.direct_wait('k-sched-run-only', pg_temp.g('p1')::uuid, 'نص', '') $q$, 'ERR FORBIDDEN');
select pg_temp.who('00000000-0000-0000-0000-0000000000a2');
select pg_temp.t('08 without the server key, nobody may', $q$ select public.direct_wait('k-wrong', pg_temp.g('p1')::uuid, 'نص', '') $q$, 'ERR FORBIDDEN');
select pg_temp.t('09 a caption past Instagram''s limit', $q$ select public.direct_wait('k-sched-run-only', pg_temp.g('p1')::uuid, repeat('a', 2201), '') $q$, 'ERR TEST_INVALID');
select pg_temp.t('10 the director''s server makes it wait', $q$ select public.direct_wait('k-sched-run-only', pg_temp.g('p1')::uuid, 'نص المنشور', '') $q$, 'ok');
reset role;
select pg_temp.c('11 waiting, with its caption kept and no address open', (select state || ' ' || caption || ' ' || (link_hash is null)::text from public.platform_tests where id = pg_temp.g('p1')::uuid), 'waiting نص المنشور true');
select pg_temp.c('12 the publisher and the assistant are told it is scheduled', (select count(*)::text from public.notifications
  where recipient in ('pub@t.test','asst@t.test') and tier = 'info' and body like 'جُدول نشر مباشر «قصة مجدولة» على إنستغرام · حساب الفحص (قصة)، ويُنشر في %'), '2');
select pg_temp.c('13 nothing is written to the log yet', (select count(*)::text from public.activity_log where type = 'direct'), '0');
set local role authenticated;
select pg_temp.t('14 the director starts another post on the account', $q$ insert into v select 'p0', public.platform_test_start(pg_temp.g('ig')::uuid, pg_temp.ig(90)) $q$, 'ok');
reset role;
select pg_temp.c('15 the waiting one is not closed by it', (select state from public.platform_tests where id = pg_temp.g('p1')::uuid), 'waiting');
set local role authenticated;

-- 2. Cancelling ------------------------------------------------------------------------------------------------------------
select pg_temp.t('16 a second one waits', $q$ select pg_temp.waiting('p2') $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-0000000000a3');
select pg_temp.t('17 the assistant may not cancel it', $q$ select public.direct_cancel('k-sched-run-only', pg_temp.g('p2')::uuid) $q$, 'ERR FORBIDDEN');
select pg_temp.who('00000000-0000-0000-0000-0000000000a1');
select pg_temp.c('18 the Admin cancels it, and the server is handed its copy to trash', public.direct_cancel('k-sched-run-only', pg_temp.g('p2')::uuid), 'driveTemp_p2_0001');
select pg_temp.t('19 a cancelled post is not cancelled twice', $q$ select public.direct_cancel('k-sched-run-only', pg_temp.g('p2')::uuid) $q$, 'ERR FORBIDDEN');
reset role;
select pg_temp.c('20 closed as cancelled', (select state || ' ' || error from public.platform_tests where id = pg_temp.g('p2')::uuid), 'failed CANCELLED');

-- 3. Firing: the server key alone ------------------------------------------------------------------------------------------
set local role anon;
select pg_temp.nobody();
select pg_temp.t('21 a wrong key claims nothing', $q$ select public.direct_fire_claim('k-wrong') $q$, 'ERR FORBIDDEN');
select pg_temp.c('22 nothing is due yet', jsonb_array_length(public.direct_fire_claim('k-sched-run-only'))::text, '0');
reset role;
update public.platform_tests set scheduled_for = now() - interval '1 minute' where id = pg_temp.g('p1')::uuid;
-- A test waiting on the account is never fired: a test has no time, and the database refuses one that waits.
select pg_temp.t('23 a test cannot wait', $q$ insert into public.platform_tests (account_id, kind, title, source, size, mime, state, purpose, scheduled_for, created_by)
  values (pg_temp.g('ig')::uuid, 'story_image', 'تجربة', 'device', 10, 'image/jpeg', 'waiting', 'test', now(), 'dir@t.test') $q$, 'ERR new row for relation "platform_tests" violates check constraint "platform_tests_scheduled_kind"');
set local role anon;
select pg_temp.nobody();
insert into v select 'claim1', public.direct_fire_claim('k-sched-run-only')::text;
select pg_temp.c('24 the due post is claimed once, to send', (select string_agg((x->>'id' = pg_temp.g('p1'))::text || ' ' || (x->>'step'), ',') from jsonb_array_elements(pg_temp.g('claim1')::jsonb) x), 'true send');
select pg_temp.c('25 with its caption and the account''s token', (select (x->>'caption') || ' ' || (x->>'token') || ' ' || (x->>'external_id') from jsonb_array_elements(pg_temp.g('claim1')::jsonb) x), 'نص المنشور tok-sched-run-only 17841400000000001');
select pg_temp.c('26 a second claim at once finds it leased', jsonb_array_length(public.direct_fire_claim('k-sched-run-only'))::text, '0');
reset role;
select pg_temp.c('27 it is being fired', (select state || ' ' || (fired_at is not null)::text || ' ' || (fire_lease > now())::text from public.platform_tests where id = pg_temp.g('p1')::uuid), 'uploading true true');
select pg_temp.c('28 the token''s use is in the account''s events, under the post''s author', (select count(*)::text from public.integration_events
  where integration_id = pg_temp.g('int')::uuid and kind = 'secret_used' and actor = 'dir@t.test' and data->>'purpose' = 'نشر مجدول على إنستغرام'), '1');
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000a2');
select pg_temp.t('29 its author cannot give it up while it is fired', $q$ select public.platform_test_failed('k-sched-run-only', pg_temp.g('p1')::uuid, 'CANCELLED') $q$, 'ERR FORBIDDEN');
select pg_temp.t('30 nor can a new start close it', $q$ select public.platform_test_start(pg_temp.g('ig')::uuid, pg_temp.ig(120)) $q$, 'ok');
reset role;
select pg_temp.c('31 still being fired', (select state from public.platform_tests where id = pg_temp.g('p1')::uuid), 'uploading');
set local role anon;
select pg_temp.nobody();
insert into v values ('hash', encode(sha256(convert_to('link-sched-run-only', 'UTF8')), 'hex'));
select pg_temp.t('32 a wrong key sets no address', $q$ select public.direct_fire_link('k-wrong', pg_temp.g('p1')::uuid, pg_temp.g('hash'), now() + interval '30 minutes') $q$, 'ERR FORBIDDEN');
select pg_temp.t('33 an address two hours long is refused', $q$ select public.direct_fire_link('k-sched-run-only', pg_temp.g('p1')::uuid, pg_temp.g('hash'), now() + interval '2 hours') $q$, 'ERR TEST_INVALID');
select pg_temp.t('34 the temporary address', $q$ select public.direct_fire_link('k-sched-run-only', pg_temp.g('p1')::uuid, pg_temp.g('hash'), now() + interval '30 minutes') $q$, 'ok');
select pg_temp.c('35 Meta finds the file behind it', (public.platform_test_fetch('k-sched-run-only', pg_temp.g('hash'))->>'ref'), 'driveTemp_p1_000001');
select pg_temp.t('36 Meta''s container', $q$ select public.direct_fire_container('k-sched-run-only', pg_temp.g('p1')::uuid, '1790000000000001') $q$, 'ok');
select pg_temp.t('37 a second container is refused', $q$ select public.direct_fire_container('k-sched-run-only', pg_temp.g('p1')::uuid, '1790000000000002') $q$, 'ERR FORBIDDEN');
select pg_temp.t('38 Meta is still preparing: the lease ends', $q$ select public.direct_fire_release('k-sched-run-only', pg_temp.g('p1')::uuid) $q$, 'ok');
select pg_temp.t('39 a post not held takes no step', $q$ select public.direct_fire_done('k-sched-run-only', pg_temp.g('p1')::uuid, 'IGpost0001', '17841400000000001', null) $q$, 'ERR FORBIDDEN');
insert into v select 'claim2', public.direct_fire_claim('k-sched-run-only')::text;
select pg_temp.c('40 the next call claims it again, to publish', (select string_agg((x->>'step') || ' ' || (x->>'container'), ',') from jsonb_array_elements(pg_temp.g('claim2')::jsonb) x), 'advance 1790000000000001');
select pg_temp.c('41 published on the account''s own Instagram', public.direct_fire_done('k-sched-run-only', pg_temp.g('p1')::uuid, 'IGpost0001', '17841400000000001', 'https://www.instagram.com/stories/t_account/1/'), 'published');
reset role;
select pg_temp.c('42 recorded, its address ended', (select state || ' ' || video_id || ' ' || (link_hash is null)::text || ' ' || coalesce(post_url, '-') from public.platform_tests where id = pg_temp.g('p1')::uuid),
  'published IGpost0001 true https://www.instagram.com/stories/t_account/1/');
select pg_temp.c('43 written to the log under its author', (select string_agg(actor_email, ',') from public.activity_log where type = 'direct'), 'dir@t.test');
select pg_temp.c('44 told on time to the publisher, the assistant and its author', (select count(*)::text from public.notifications
  where recipient in ('pub@t.test','asst@t.test','dir@t.test') and tier = 'info' and body like 'نُشر في موعده «قصة مجدولة» على إنستغرام · حساب الفحص (قصة).'), '3');

-- 4. Late, wrong account, given up -----------------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000a2');
select pg_temp.t('45 a third one waits', $q$ select pg_temp.waiting('p3') $q$, 'ok');
reset role;
update public.platform_tests set scheduled_for = now() - interval '40 minutes' where id = pg_temp.g('p3')::uuid;
set local role anon;
select pg_temp.nobody();
select pg_temp.c('46 the bridge was off: claimed late', jsonb_array_length(public.direct_fire_claim('k-sched-run-only'))::text, '1');
select pg_temp.t('47 its container', $q$ select public.direct_fire_container('k-sched-run-only', pg_temp.g('p3')::uuid, '1790000000000003') $q$, 'ok');
select pg_temp.c('48 published', public.direct_fire_done('k-sched-run-only', pg_temp.g('p3')::uuid, 'IGpost0003', '17841400000000001', null), 'published');
reset role;
select pg_temp.c('49 told how late', (select count(*)::text from public.notifications where recipient = 'pub@t.test' and body like 'نُشر متأخراً 4_ دقيقة عن موعده «قصة مجدولة»%'), '1');
select pg_temp.c('50 and the log says so', (select (data->>'late')::int >= 40 from public.activity_log where type = 'direct' and data->>'video' = 'IGpost0003')::text, 'true');
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000a2');
select pg_temp.t('51 a fourth one waits', $q$ select pg_temp.waiting('p4') $q$, 'ok');
reset role;
update public.platform_tests set scheduled_for = now() - interval '1 minute' where id = pg_temp.g('p4')::uuid;
set local role anon;
select pg_temp.nobody();
select pg_temp.c('52 claimed', jsonb_array_length(public.direct_fire_claim('k-sched-run-only'))::text, '1');
select pg_temp.t('53 its container', $q$ select public.direct_fire_container('k-sched-run-only', pg_temp.g('p4')::uuid, '1790000000000004') $q$, 'ok');
select pg_temp.c('54 a post Meta names on another account is not recorded', public.direct_fire_done('k-sched-run-only', pg_temp.g('p4')::uuid, 'IGpost0004', '17841400000009999', null), 'failed');
reset role;
select pg_temp.c('55 closed, its author told for attention', (select t.state || ' ' || t.error || ' ' || (select count(*) from public.notifications n where n.recipient = 'dir@t.test' and n.tier = 'attention'
  and n.body like 'تعذّر نشر «قصة مجدولة» المجدول على إنستغرام · حساب الفحص.%')::text from public.platform_tests t where t.id = pg_temp.g('p4')::uuid), 'failed CHANNEL_MISMATCH 1');
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000a2');
select pg_temp.t('56 a fifth and a sixth wait', $q$ select pg_temp.waiting('p5'), pg_temp.waiting('p6') $q$, 'ok');
reset role;
update public.platform_tests set scheduled_for = now() - interval '2 days' where id = pg_temp.g('p5')::uuid;
update public.platform_tests set scheduled_for = now() - interval '1 minute' where id = pg_temp.g('p6')::uuid;
update public.platform_accounts set active = false where id = pg_temp.g('ig')::uuid;
set local role anon;
select pg_temp.nobody();
select pg_temp.c('57 nothing is handed out for an account that is off', jsonb_array_length(public.direct_fire_claim('k-sched-run-only'))::text, '0');
reset role;
select pg_temp.c('58 a post two days late is given up, the other closed as the account is off', (select string_agg(error, ',' order by error) from public.platform_tests
  where id in (pg_temp.g('p5')::uuid, pg_temp.g('p6')::uuid)), 'ACCOUNT_OFF,OVERDUE');
select pg_temp.c('59 each told to its author', (select count(*)::text from public.notifications where recipient = 'dir@t.test' and tier = 'attention'), '3');
update public.platform_accounts set active = true where id = pg_temp.g('ig')::uuid;
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000a2');
select pg_temp.t('60 a seventh waits', $q$ select pg_temp.waiting('p7') $q$, 'ok');
reset role;
update public.platform_tests set scheduled_for = now() - interval '1 minute' where id = pg_temp.g('p7')::uuid;
set local role anon;
select pg_temp.nobody();
select pg_temp.c('61 claimed', jsonb_array_length(public.direct_fire_claim('k-sched-run-only'))::text, '1');
select pg_temp.t('62 Meta refuses the file', $q$ select public.direct_fire_failed('k-sched-run-only', pg_temp.g('p7')::uuid, 'MEDIA_REFUSED') $q$, 'ok');
reset role;
select pg_temp.c('63 closed with Meta''s reason', (select state || ' ' || error from public.platform_tests where id = pg_temp.g('p7')::uuid), 'failed MEDIA_REFUSED');

-- 5. What a page may read and call -----------------------------------------------------------------------------------------
select pg_temp.c('64 a page never reads a caption, the alt text or the lease', (has_column_privilege('authenticated', 'public.platform_tests', 'caption', 'select')
  or has_column_privilege('authenticated', 'public.platform_tests', 'alt', 'select') or has_column_privilege('authenticated', 'public.platform_tests', 'fire_lease', 'select'))::text, 'false');
select pg_temp.c('65 it reads when a post was fired', has_column_privilege('authenticated', 'public.platform_tests', 'fired_at', 'select')::text, 'true');
select pg_temp.c('66 the server fires without a session', (has_function_privilege('anon', 'public.direct_fire_claim(text)', 'execute')
  and has_function_privilege('anon', 'public.direct_fire_done(text, uuid, text, text, text)', 'execute'))::text, 'true');
select pg_temp.c('67 nobody signed out schedules or cancels', (has_function_privilege('anon', 'public.direct_wait(text, uuid, text, text)', 'execute')
  or has_function_privilege('anon', 'public.direct_cancel(text, uuid)', 'execute'))::text, 'false');
select pg_temp.c('68 the inner steps are not callable from outside', (has_function_privilege('authenticated', 'public.direct_fail(public.platform_tests, text)', 'execute')
  or has_function_privilege('authenticated', 'public.direct_fire_held(uuid)', 'execute') or has_function_privilege('anon', 'public.direct_fire_held(uuid)', 'execute'))::text, 'false');
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000a2');
select pg_temp.c('69 the server''s view says what a post is for and when it is due', (select (x->>'purpose') || ' ' || (x->>'fired') || ' ' || (x->>'scheduled_for' is not null)::text
  from (select public.platform_test_get('k-sched-run-only', pg_temp.g('p1')::uuid) x) q), 'direct true true');

select n, k, v, expect from r where v is distinct from expect
union all select 0, 'TOTAL', count(*)::text, (count(*) filter (where v is not distinct from expect))::text || ' passed' from r
order by n;
rollback;

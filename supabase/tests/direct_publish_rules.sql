-- MVP_draft.md section 76 (migration 20261105160000_direct_publish.sql): «نشر مباشر». Who holds publish.direct (the Admin and the
-- director, fixed), that only they start or delete a direct post, how a direct post differs from a test (subscribers, the
-- schedule's window, its own daily count), that a direct post is written to «سجل النشاط» and told to the account's publishers and
-- the assistants while a test is not, and that a Page takes no direct post. Only throwaway accounts (@t.test) are touched; the
-- server key is replaced by a throwaway inside the transaction. One transaction, rolled back at the end.
-- Result: qa/direct-publish-rules.json.
begin;
create temp table r(n serial, k text, v text, expect text);
create temp table v(k text primary key, val text);
grant all on r, v to public; grant usage on sequence r_n_seq to public;
insert into public.accounts (email, display_name, role, pages, protected) values
 ('adm@t.test','Adm','admin','{}',true),('dir@t.test','Dir','director','{}',false),('asst@t.test','Asst','assistant','{}',false),
 ('pub@t.test','Pub','publisher','{}',false),('wri@t.test','Wri','writer','{}',false);
insert into auth.users (id, email, email_confirmed_at) values
 ('00000000-0000-0000-0000-0000000000a1','adm@t.test',now()),('00000000-0000-0000-0000-0000000000a2','dir@t.test',now()),
 ('00000000-0000-0000-0000-0000000000a3','asst@t.test',now()),('00000000-0000-0000-0000-0000000000a4','pub@t.test',now()),
 ('00000000-0000-0000-0000-0000000000a6','wri@t.test',now());
insert into public.mail_server_key (id, key_hash) values (1, encode(sha256(convert_to('k-direct-run-only', 'UTF8')), 'hex'))
  on conflict (id) do update set key_hash = excluded.key_hash;
insert into public.platforms (key, label_ar, kind, sort, enabled) values ('instagram', 'إنستغرام', 'social', 1, true) on conflict (key) do nothing;
insert into public.platforms (key, label_ar, kind, sort, enabled) values ('facebook', 'فيسبوك', 'social', 6, true) on conflict (key) do nothing;
with i as (insert into public.integrations (kind, type, label, state, created_by) values ('platform','youtube_channel','قناة الفحص','connected','dir@t.test') returning id),
     a as (insert into public.platform_accounts (platform, label, handle, publishers, added_by, conn_kind, conn_state, external_id, integration_id, authorized_until)
           select 'youtube', 'قناة الفحص', '@t_channel', array['pub@t.test'], 'dir@t.test', 'oauth', 'connected', 'UCtestchannel', i.id, now() + interval '90 days' from i returning id)
insert into v select 'yt', id::text from a;
with i as (insert into public.integrations (kind, type, label, state, created_by) values ('platform','meta_instagram','حساب الفحص','connected','dir@t.test') returning id),
     a as (insert into public.platform_accounts (platform, label, handle, publishers, added_by, conn_kind, conn_state, external_id, integration_id, authorized_until)
           select 'instagram', 'حساب الفحص', '@t_account', array['pub@t.test'], 'dir@t.test', 'oauth', 'connected', '17841400000000001', i.id, now() + interval '60 days' from i returning id)
insert into v select 'ig', id::text from a;
create function pg_temp.who(id text) returns void language sql as $$ select set_config('request.jwt.claims', json_build_object('sub',id,'role','authenticated')::text, true) $$;
create function pg_temp.t(k text, sqltext text, e text) returns void language plpgsql as $$
begin
  begin execute sqltext; insert into r(k,v,expect) values (k,'ok',e);
  exception when others then insert into r(k,v,expect) values (k,'ERR '||sqlerrm,e); end;
end $$;
create function pg_temp.c(k text, val text, e text) returns void language sql as $$ insert into r(k,v,expect) values (k,val,e) $$;
create function pg_temp.g(k text) returns text language sql as $$ select val from v where k = $1 $$;
-- A YouTube post of 1000 bytes from this device; `extra` adds or replaces fields.
create function pg_temp.yt(privacy text default 'public', extra jsonb default '{}') returns jsonb language sql as $$
  select jsonb_build_object('privacy', privacy, 'title', 'منشور مباشر', 'source', 'device', 'size', 1000, 'mime', 'video/mp4', 'purpose', 'direct') || extra $$;
grant execute on function pg_temp.who(text), pg_temp.t(text,text,text), pg_temp.c(text,text,text), pg_temp.g(text), pg_temp.yt(text,jsonb) to public;
insert into v values ('url', 'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&upload_id=TESTMARK-D1');
set local role authenticated;

-- 1. Who holds it ----------------------------------------------------------------------------------------------------------
select pg_temp.who('00000000-0000-0000-0000-0000000000a2');
select pg_temp.c('01 the director holds publish.direct', public.has_capability('publish.direct')::text, 'true');
select pg_temp.who('00000000-0000-0000-0000-0000000000a1');
select pg_temp.c('02 so does the Admin', public.has_capability('publish.direct')::text, 'true');
select pg_temp.who('00000000-0000-0000-0000-0000000000a3');
select pg_temp.c('03 the assistant does not', public.has_capability('publish.direct')::text, 'false');
select pg_temp.who('00000000-0000-0000-0000-0000000000a4');
select pg_temp.c('04 nor the account''s publisher', public.has_capability('publish.direct')::text, 'false');
reset role;
select pg_temp.c('05 it is fixed and cannot be granted', (select grp || ' ' || grantable::text || ' ' || array_to_string(fixed_roles, ',') from public.capabilities where key = 'publish.direct'), 'fixed false admin,director');
set local role authenticated;

-- 2. Who may start a direct post -------------------------------------------------------------------------------------------
select pg_temp.who('00000000-0000-0000-0000-0000000000a3');
select pg_temp.t('06 the assistant may not, though she may test the account', $q$ select public.platform_test_start(pg_temp.g('yt')::uuid, pg_temp.yt()) $q$, 'ERR FORBIDDEN');
select pg_temp.t('07 and still tests it', $q$ insert into v select 'asst_test', public.platform_test_start(pg_temp.g('yt')::uuid, pg_temp.yt('private', '{"purpose":"test"}')) $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-0000000000a4');
select pg_temp.t('08 the account''s publisher may not', $q$ select public.platform_test_start(pg_temp.g('yt')::uuid, pg_temp.yt()) $q$, 'ERR FORBIDDEN');
select pg_temp.who('00000000-0000-0000-0000-0000000000a6');
select pg_temp.t('09 nor a writer', $q$ select public.platform_test_start(pg_temp.g('yt')::uuid, pg_temp.yt()) $q$, 'ERR FORBIDDEN');
select pg_temp.who('00000000-0000-0000-0000-0000000000a2');
select pg_temp.t('10 a purpose that is neither', $q$ select public.platform_test_start(pg_temp.g('yt')::uuid, pg_temp.yt('public', '{"purpose":"post"}')) $q$, 'ERR TEST_INVALID');
select pg_temp.t('11 the director starts a public direct post', $q$ insert into v select 'd1', public.platform_test_start(pg_temp.g('yt')::uuid, pg_temp.yt()) $q$, 'ok');
reset role;
select pg_temp.c('12 recorded as direct, telling subscribers by default when public', (select purpose || ' ' || notify::text || ' ' || privacy from public.platform_tests where id = pg_temp.g('d1')::uuid), 'direct true public');
set local role authenticated;
select pg_temp.t('13 an unlisted one', $q$ insert into v select 'd2', public.platform_test_start(pg_temp.g('yt')::uuid, pg_temp.yt('unlisted')) $q$, 'ok');
reset role;
select pg_temp.c('14 tells nobody by default', (select notify::text from public.platform_tests where id = pg_temp.g('d2')::uuid), 'false');
set local role authenticated;
select pg_temp.t('15 a public one may stay quiet', $q$ insert into v select 'd3', public.platform_test_start(pg_temp.g('yt')::uuid, pg_temp.yt('public', '{"notify":false}')) $q$, 'ok');
reset role;
select pg_temp.c('16 so kept', (select notify::text from public.platform_tests where id = pg_temp.g('d3')::uuid), 'false');
set local role authenticated;
select pg_temp.t('17 a test never notifies', $q$ select public.platform_test_start(pg_temp.g('yt')::uuid, pg_temp.yt('public', '{"purpose":"test","notify":true}')) $q$, 'ERR TEST_INVALID');
select pg_temp.t('18 nor does Instagram take the choice', $q$ select public.platform_test_start(pg_temp.g('ig')::uuid, jsonb_build_object('kind','story_image','title','x','source','device','size',1000,'mime','image/jpeg','purpose','direct','notify',true)) $q$, 'ERR TEST_INVALID');

-- 3. The schedule's window: 30 days for a test, 180 for a direct post -----------------------------------------------------------
select pg_temp.t('19 a direct post scheduled 100 days ahead', $q$ insert into v select 'd4', public.platform_test_start(pg_temp.g('yt')::uuid, pg_temp.yt('private', jsonb_build_object('scheduled_for', (now() + interval '100 days')::text))) $q$, 'ok');
reset role;
select pg_temp.c('20 tells subscribers by default, since it becomes public', (select notify::text from public.platform_tests where id = pg_temp.g('d4')::uuid), 'true');
set local role authenticated;
select pg_temp.t('21 a test may not go so far', $q$ select public.platform_test_start(pg_temp.g('yt')::uuid, pg_temp.yt('private', jsonb_build_object('purpose','test','scheduled_for', (now() + interval '100 days')::text))) $q$, 'ERR SCHEDULE_INVALID');
select pg_temp.t('22 nor a direct post past 180 days', $q$ select public.platform_test_start(pg_temp.g('yt')::uuid, pg_temp.yt('private', jsonb_build_object('scheduled_for', (now() + interval '181 days')::text))) $q$, 'ERR SCHEDULE_INVALID');
select pg_temp.t('23 nor sooner than ten minutes', $q$ select public.platform_test_start(pg_temp.g('yt')::uuid, pg_temp.yt('private', jsonb_build_object('scheduled_for', (now() + interval '5 minutes')::text))) $q$, 'ERR SCHEDULE_INVALID');

-- 4. Instagram takes a direct post; a Page does not, yet --------------------------------------------------------------------
select pg_temp.t('24 an Instagram Story as a direct post', $q$ insert into v select 'i1', public.platform_test_start(pg_temp.g('ig')::uuid, jsonb_build_object('kind','story_image','title','قصة مباشرة','source','device','size',1000,'mime','image/jpeg','purpose','direct')) $q$, 'ok');
reset role;
select pg_temp.c('25 recorded as direct, with no subscribers'' choice', (select purpose || ' ' || coalesce(notify::text, 'none') from public.platform_tests where id = pg_temp.g('i1')::uuid), 'direct none');
update public.platform_accounts set platform = 'facebook' where id = pg_temp.g('ig')::uuid;
set local role authenticated;
select pg_temp.t('26 a Facebook Page takes no direct post', $q$ select public.platform_test_start(pg_temp.g('ig')::uuid, jsonb_build_object('kind','fb_text','title','x','purpose','direct')) $q$, 'ERR TEST_INVALID');
reset role;
update public.platform_accounts set platform = 'instagram' where id = pg_temp.g('ig')::uuid;
set local role authenticated;

-- 5. A direct post arrives: written to the log, told to the publishers and the assistants -------------------------------------
select pg_temp.t('27 its upload', $q$ select public.platform_test_session('k-direct-run-only', pg_temp.g('d4')::uuid, pg_temp.g('url')) $q$, 'ok');
select pg_temp.c('28 it arrives, scheduled', (select public.platform_test_done('k-direct-run-only', pg_temp.g('d4')::uuid, 'directV0001', 'UCtestchannel', 'private', null, now() + interval '100 days')), 'published');
reset role;
select pg_temp.c('29 the log has it, by the director, with its words', (select type || ' ' || actor_email || ' ' || (data->>'name') || ' ' || (data->>'platform') || ' ' || (data->>'account') || ' ' || (data->>'shown') from public.activity_log where type = 'direct' and data->>'video' = 'directV0001'), 'direct dir@t.test منشور مباشر يوتيوب قناة الفحص مجدول');
select pg_temp.c('30 the publisher and the assistant are told, for information', (select string_agg(recipient || ':' || tier, ',' order by recipient) from public.notifications where recipient like '%@t.test' and go->>'page' = 'accounts'), 'asst@t.test:info,pub@t.test:info');
select pg_temp.c('31 with what happened', (select body from public.notifications where recipient = 'pub@t.test' and go->>'page' = 'accounts'), 'جُدول نشر مباشر «منشور مباشر» على يوتيوب · قناة الفحص، ويصبح عاماً في موعده.');
select pg_temp.c('32 the director, who did it, is not told', (select count(*)::text from public.notifications where recipient = 'dir@t.test'), '0');
-- A test that arrives says nothing to anyone.
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000a3');
select pg_temp.t('33 the assistant''s test upload', $q$ select public.platform_test_session('k-direct-run-only', pg_temp.g('asst_test')::uuid, pg_temp.g('url')) $q$, 'ok');
select pg_temp.c('34 arrives', (select public.platform_test_done('k-direct-run-only', pg_temp.g('asst_test')::uuid, 'testV000001', 'UCtestchannel', 'private')), 'published');
reset role;
select pg_temp.c('35 a test writes no log and tells nobody', ((select count(*) from public.activity_log where data->>'video' = 'testV000001') + (select count(*) from public.notifications where recipient like '%@t.test') - 2)::text, '0');

-- 6. Deleting a direct post is the capability's only ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.t('36 the assistant may not delete a direct post', $q$ select public.platform_test_deleted('k-direct-run-only', pg_temp.g('d4')::uuid) $q$, 'ERR FORBIDDEN');
select pg_temp.t('37 she still deletes a test', $q$ select public.platform_test_deleted('k-direct-run-only', pg_temp.g('asst_test')::uuid) $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-0000000000a2');
select pg_temp.t('38 the director deletes the direct post', $q$ select public.platform_test_deleted('k-direct-run-only', pg_temp.g('d4')::uuid) $q$, 'ok');
reset role;
select pg_temp.c('39 written to the log as a delete', (select count(*)::text from public.activity_log where type = 'direct_off' and data->>'video' = 'directV0001'), '1');
select pg_temp.c('40 and told', (select count(*)::text from public.notifications where recipient = 'pub@t.test' and body like 'حُذف منشور مباشر%'), '1');

-- 7. A direct post has its own count of the day ---------------------------------------------------------------------------------
-- Today only d4 counts (deleted, not failed): d1 to d3 were closed as abandoned when the director started the next one, and a
-- failed post is not counted. Nineteen more make twenty.
insert into public.platform_tests (account_id, privacy, title, source, size, mime, state, video_id, purpose, notify, created_by)
  select pg_temp.g('yt')::uuid, 'public', 'سابق ' || n, 'device', 10, 'video/mp4', 'published', 'dvid' || lpad(n::text, 8, '0'), 'direct', true, 'dir@t.test' from generate_series(1, 19) n;
select pg_temp.c('40b twenty direct posts count today', (select count(*)::text from public.platform_tests where account_id = pg_temp.g('yt')::uuid and purpose = 'direct' and state <> 'failed'), '20');
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000a2');
select pg_temp.t('41 the twenty-first direct post of the day is refused', $q$ select public.platform_test_start(pg_temp.g('yt')::uuid, pg_temp.yt()) $q$, 'ERR TEST_LIMIT');
select pg_temp.t('42 a test is still allowed: its count is apart', $q$ select public.platform_test_start(pg_temp.g('yt')::uuid, pg_temp.yt('private', '{"purpose":"test"}')) $q$, 'ok');

-- 8. What a page may read ------------------------------------------------------------------------------------------------------
reset role;
select pg_temp.c('43 a page reads the purpose and the subscribers'' choice', (has_column_privilege('authenticated', 'public.platform_tests', 'purpose', 'select')
  and has_column_privilege('authenticated', 'public.platform_tests', 'notify', 'select'))::text, 'true');
select pg_temp.c('44 the announcing functions are not callable from outside', (has_function_privilege('authenticated', 'public.direct_announce(public.platform_tests, text)', 'execute')
  or has_function_privilege('authenticated', 'public.direct_words(public.platform_tests)', 'execute'))::text, 'false');

select n, k, v, expect from r where v is distinct from expect
union all select 0, 'TOTAL', count(*)::text, (count(*) filter (where v is not distinct from expect))::text || ' passed' from r
order by n;
rollback;

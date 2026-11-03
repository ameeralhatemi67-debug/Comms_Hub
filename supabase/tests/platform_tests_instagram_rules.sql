-- MVP_draft.md section 72 (migration 20261103180000_platform_tests_instagram.sql): «تجربة النشر» on an Instagram account.
-- Who may test, what each kind may be, that pages never read the temporary link or copy, that the link answers only by its
-- hash, while it lasts and while the test waits, with the server key and no session; the container and the post recorded
-- only for the account's own id; and that a YouTube test is as it was. Only throwaway accounts (@t.test) are touched; the
-- server key is replaced by a throwaway inside the transaction. One transaction, rolled back at the end.
-- Result: qa/platform-tests-instagram-rules.json.
begin;
create temp table r(n serial, k text, v text, expect text);
create temp table v(k text primary key, val text);
grant all on r, v to public; grant usage on sequence r_n_seq to public;
insert into public.accounts (email, display_name, role, pages, protected) values
 ('dir@t.test','Dir','director','{}',false),('pub@t.test','Pub','publisher','{}',false),('pub2@t.test','Pub2','publisher','{}',false),
 ('wri@t.test','Wri','writer','{}',false);
insert into auth.users (id, email, email_confirmed_at) values
 ('00000000-0000-0000-0000-0000000000a2','dir@t.test',now()),('00000000-0000-0000-0000-0000000000a4','pub@t.test',now()),
 ('00000000-0000-0000-0000-0000000000a5','pub2@t.test',now()),('00000000-0000-0000-0000-0000000000a6','wri@t.test',now());
insert into public.mail_server_key (id, key_hash) values (1, encode(sha256(convert_to('k-ig-run-only', 'UTF8')), 'hex'))
  on conflict (id) do update set key_hash = excluded.key_hash;
insert into public.platforms (key, label_ar, kind, sort, enabled) values ('instagram', 'إنستغرام', 'social', 1, true) on conflict (key) do nothing;
with i as (insert into public.integrations (kind, type, label, state, created_by) values ('platform','meta_instagram','الحساب','connected','dir@t.test') returning id),
     a as (insert into public.platform_accounts (platform, label, handle, publishers, added_by, conn_kind, conn_state, external_id, integration_id, authorized_until)
           select 'instagram', 'الحساب', '@t_account', array['pub@t.test'], 'dir@t.test', 'oauth', 'connected', '17841400000000001', i.id, now() + interval '60 days' from i returning id)
insert into v select 'ig', id::text from a;
with i as (insert into public.integrations (kind, type, label, state, created_by) values ('platform','youtube_channel','القناة','connected','dir@t.test') returning id),
     a as (insert into public.platform_accounts (platform, label, handle, publishers, added_by, conn_kind, conn_state, external_id, integration_id, authorized_until)
           select 'youtube', 'القناة', '@t_channel', array['pub@t.test'], 'dir@t.test', 'oauth', 'connected', 'UCtestchannel', i.id, now() + interval '90 days' from i returning id)
insert into v select 'yt', id::text from a;
-- The library's guard names the uploader from the session: the director's.
select set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000a2','role','authenticated')::text, true);
with f as (insert into public.media_folders (name, created_by) values ('مجلد الفحص', 'dir@t.test') returning id),
     m as (insert into public.media_files (drive_file_id, name, mime_type, size_bytes, kind, uploaded_by, folder_id)
           select 'drive-video-TESTMARK-0001', 'مقطع.mp4', 'video/mp4', 5000000, 'video', 'dir@t.test', f.id from f returning id)
insert into v select 'vid', id::text from m;
insert into v values ('h1', encode(sha256('token-one'::bytea), 'hex')), ('h2', encode(sha256('token-two'::bytea), 'hex'));
create function pg_temp.who(id text) returns void language sql as $$ select set_config('request.jwt.claims', json_build_object('sub',id,'role','authenticated')::text, true) $$;
create function pg_temp.anon() returns void language sql as $$ select set_config('request.jwt.claims', json_build_object('role','anon')::text, true) $$;
create function pg_temp.t(k text, sqltext text, e text) returns void language plpgsql as $$
begin
  begin execute sqltext; insert into r(k,v,expect) values (k,'ok',e);
  exception when others then insert into r(k,v,expect) values (k,'ERR '||sqlerrm,e); end;
end $$;
create function pg_temp.c(k text, val text, e text) returns void language sql as $$ insert into r(k,v,expect) values (k,val,e) $$;
create function pg_temp.g(k text) returns text language sql as $$ select val from v where k = $1 $$;
-- An Instagram test of one kind.
create function pg_temp.p(kind text, n bigint default 1000, mime text default 'image/jpeg', source text default 'device') returns jsonb language sql as $$
  select jsonb_build_object('kind', kind, 'title', 'تجربة', 'source', source, 'size', n, 'mime', mime) $$;
grant execute on function pg_temp.who(text), pg_temp.anon(), pg_temp.t(text,text,text), pg_temp.c(text,text,text), pg_temp.g(text),
  pg_temp.p(text,bigint,text,text) to public;
set local role authenticated;

-- 1. Who may test -----------------------------------------------------------------------------------------------------
select pg_temp.who('00000000-0000-0000-0000-0000000000a2');
select pg_temp.c('01 the director may test an Instagram account', public.platform_test_may(pg_temp.g('ig')::uuid)::text, 'true');
select pg_temp.who('00000000-0000-0000-0000-0000000000a4');
select pg_temp.c('02 its own publisher may', public.platform_test_may(pg_temp.g('ig')::uuid)::text, 'true');
select pg_temp.who('00000000-0000-0000-0000-0000000000a5');
select pg_temp.c('03 another publisher may not', public.platform_test_may(pg_temp.g('ig')::uuid)::text, 'false');
select pg_temp.who('00000000-0000-0000-0000-0000000000a6');
select pg_temp.t('04 nor a writer start one', $q$ select public.platform_test_start(pg_temp.g('ig')::uuid, pg_temp.p('story_image')) $q$, 'ERR FORBIDDEN');

-- 2. What each kind may be ----------------------------------------------------------------------------------------------
select pg_temp.who('00000000-0000-0000-0000-0000000000a4');
select pg_temp.t('05 an Instagram test has no privacy', $q$ select public.platform_test_start(pg_temp.g('ig')::uuid, pg_temp.p('image') || '{"privacy":"private"}') $q$, 'ERR TEST_INVALID');
select pg_temp.t('06 nor YouTube''s kind', $q$ select public.platform_test_start(pg_temp.g('ig')::uuid, pg_temp.p('video', 1000, 'video/mp4')) $q$, 'ERR TEST_INVALID');
select pg_temp.t('07 a picture is JPEG', $q$ select public.platform_test_start(pg_temp.g('ig')::uuid, pg_temp.p('image', 1000, 'image/png')) $q$, 'ERR TEST_INVALID');
select pg_temp.t('08 at most 8 MB', $q$ select public.platform_test_start(pg_temp.g('ig')::uuid, pg_temp.p('image', 8388609)) $q$, 'ERR TEST_INVALID');
select pg_temp.t('09 a picture never comes from the library as it is', $q$ select public.platform_test_start(pg_temp.g('ig')::uuid, pg_temp.p('image', 1000, 'image/jpeg', 'library') || jsonb_build_object('asset', pg_temp.g('vid'), 'version', 1)) $q$, 'ERR TEST_INVALID');
select pg_temp.t('10 a video is MP4 or MOV', $q$ select public.platform_test_start(pg_temp.g('ig')::uuid, pg_temp.p('reel', 1000, 'video/webm')) $q$, 'ERR TEST_INVALID');
select pg_temp.t('11 a test video at most 100 MB', $q$ select public.platform_test_start(pg_temp.g('ig')::uuid, pg_temp.p('story_video', 104857601, 'video/mp4')) $q$, 'ERR TEST_INVALID');
select pg_temp.t('12 the feed choice is a Reel''s alone', $q$ select public.platform_test_start(pg_temp.g('ig')::uuid, pg_temp.p('image') || '{"share_to_feed":true}') $q$, 'ERR TEST_INVALID');
select pg_temp.t('13 a YouTube test still needs its privacy', $q$ select public.platform_test_start(pg_temp.g('yt')::uuid, jsonb_build_object('title','x','source','device','size',10,'mime','video/mp4')) $q$, 'ERR TEST_INVALID');
select pg_temp.t('14 and takes no Instagram kind', $q$ select public.platform_test_start(pg_temp.g('yt')::uuid, jsonb_build_object('kind','reel','privacy','private','title','x','source','device','size',10,'mime','video/mp4')) $q$, 'ERR TEST_INVALID');
select pg_temp.t('15 a YouTube test as before', $q$ insert into v select 'y1', public.platform_test_start(pg_temp.g('yt')::uuid, jsonb_build_object('privacy','private','title','x','source','device','size',10,'mime','video/mp4')) $q$, 'ok');
reset role;
select pg_temp.c('16 recorded as a video with its privacy', (select kind || ' ' || privacy from public.platform_tests where id = pg_temp.g('y1')::uuid), 'video private');
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000a4');
select pg_temp.t('17 a Reel, its feed choice kept', $q$ insert into v select 'r1', public.platform_test_start(pg_temp.g('ig')::uuid, pg_temp.p('reel', 5000000, 'video/mp4', 'library') || jsonb_build_object('asset', pg_temp.g('vid'), 'version', 1, 'share_to_feed', true)) $q$, 'ok');
reset role;
select pg_temp.c('18 a library Reel, no privacy, shared to the feed', (select kind || ' ' || coalesce(privacy, 'none') || ' ' || share_to_feed::text || ' ' || source from public.platform_tests where id = pg_temp.g('r1')::uuid), 'reel none true library');
set local role authenticated;

-- 3. What a page may read ------------------------------------------------------------------------------------------------
select pg_temp.c('19 the publisher sees the kind', (select string_agg(kind, ',' order by kind) from public.platform_tests), 'reel,video');
select pg_temp.t('20 but never the link', $q$ select link_hash from public.platform_tests $q$, 'ERR permission denied for table platform_tests');
select pg_temp.t('21 nor the temporary copy', $q$ select temp_ref from public.platform_tests $q$, 'ERR permission denied for table platform_tests');

-- 4. The device file's temporary copy, the link and the container ----------------------------------------------------------
select pg_temp.t('22 a picture Story from the device', $q$ insert into v select 's1', public.platform_test_start(pg_temp.g('ig')::uuid, pg_temp.p('story_image')) $q$, 'ok');
reset role;
select pg_temp.c('23 one upload at a time: the Reel was closed', (select state || ' ' || error from public.platform_tests where id = pg_temp.g('r1')::uuid), 'failed ABANDONED');
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000a2');
select pg_temp.t('24 nobody else records its copy', $q$ select public.platform_test_temp('k-ig-run-only', pg_temp.g('s1')::uuid, 'drivefileTESTMARK2') $q$, 'ERR FORBIDDEN');
select pg_temp.who('00000000-0000-0000-0000-0000000000a4');
select pg_temp.t('25 nor without the key', $q$ select public.platform_test_temp('wrong', pg_temp.g('s1')::uuid, 'drivefileTESTMARK2') $q$, 'ERR FORBIDDEN');
select pg_temp.t('26 a reference of the wrong shape is refused', $q$ select public.platform_test_temp('k-ig-run-only', pg_temp.g('s1')::uuid, '../x') $q$, 'ERR TEST_INVALID');
select pg_temp.t('27 its starter''s server records it', $q$ select public.platform_test_temp('k-ig-run-only', pg_temp.g('s1')::uuid, 'drivefileTESTMARK2') $q$, 'ok');
select pg_temp.t('28 once', $q$ select public.platform_test_temp('k-ig-run-only', pg_temp.g('s1')::uuid, 'drivefileTESTMARK3') $q$, 'ERR FORBIDDEN');
select pg_temp.t('29 a YouTube test has no temporary copy', $q$ select public.platform_test_temp('k-ig-run-only', pg_temp.g('y1')::uuid, 'drivefileTESTMARK4') $q$, 'ERR FORBIDDEN');
select pg_temp.t('30 a link may not last more than an hour', $q$ select public.platform_test_link('k-ig-run-only', pg_temp.g('s1')::uuid, pg_temp.g('h1'), now() + interval '2 hours') $q$, 'ERR TEST_INVALID');
select pg_temp.t('31 nor be anything but a hash', $q$ select public.platform_test_link('k-ig-run-only', pg_temp.g('s1')::uuid, 'token-one', now() + interval '30 minutes') $q$, 'ERR TEST_INVALID');
select pg_temp.t('32 the link is set', $q$ select public.platform_test_link('k-ig-run-only', pg_temp.g('s1')::uuid, pg_temp.g('h1'), now() + interval '30 minutes') $q$, 'ok');
select pg_temp.c('33 the server reads the test''s Instagram facts', (select (x->>'platform') || ' ' || (x->>'kind') || ' ' || (x->>'temp_ref') || ' ' || (x->>'external_id') from (select public.platform_test_get('k-ig-run-only', pg_temp.g('s1')::uuid) x) q), 'instagram story_image drivefileTESTMARK2 17841400000000001');

-- 5. The address, as Meta reaches it: the key alone, no session ---------------------------------------------------------
select pg_temp.anon();
reset role;
set local role anon;
select pg_temp.c('34 without a session, the key finds the file', (select (x->>'ref') || ' ' || (x->>'mime') || ' ' || (x->>'size') from (select public.platform_test_fetch('k-ig-run-only', pg_temp.g('h1')) x) q), 'drivefileTESTMARK2 image/jpeg 1000');
select pg_temp.t('35 without the key, nothing', $q$ select public.platform_test_fetch('wrong', pg_temp.g('h1')) $q$, 'ERR FORBIDDEN');
select pg_temp.c('36 a wrong token, the same nothing', coalesce((select public.platform_test_fetch('k-ig-run-only', pg_temp.g('h2'))::text), 'none'), 'none');
select pg_temp.t('37 a page without a session cannot start a test', $q$ select public.platform_test_start(pg_temp.g('ig')::uuid, pg_temp.p('story_image')) $q$, 'ERR permission denied for function platform_test_start');
select pg_temp.t('38 nor set a link', $q$ select public.platform_test_link('k-ig-run-only', pg_temp.g('s1')::uuid, null, null) $q$, 'ERR permission denied for function platform_test_link');
reset role;
update public.platform_tests set link_until = now() - interval '1 second' where id = pg_temp.g('s1')::uuid;
set local role anon;
select pg_temp.c('39 an ended link finds nothing', coalesce((select public.platform_test_fetch('k-ig-run-only', pg_temp.g('h1'))::text), 'none'), 'none');
reset role;
update public.platform_tests set link_until = now() + interval '10 minutes' where id = pg_temp.g('s1')::uuid;
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000a4');
select pg_temp.t('40 the container is recorded', $q$ select public.platform_test_container('k-ig-run-only', pg_temp.g('s1')::uuid, '17890000000000001') $q$, 'ok');
select pg_temp.t('41 once', $q$ select public.platform_test_container('k-ig-run-only', pg_temp.g('s1')::uuid, '17890000000000002') $q$, 'ERR FORBIDDEN');
select pg_temp.t('42 Meta has the file: the link ends', $q$ select public.platform_test_link('k-ig-run-only', pg_temp.g('s1')::uuid, null, null) $q$, 'ok');
reset role;
set local role anon;
select pg_temp.c('43 and finds nothing any more', coalesce((select public.platform_test_fetch('k-ig-run-only', pg_temp.g('h1'))::text), 'none'), 'none');
reset role;
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000a4');

-- 6. The post, recorded only for the account's own id ---------------------------------------------------------------------
select pg_temp.c('44 a post on another account fails the test', (select public.platform_test_done('k-ig-run-only', pg_temp.g('s1')::uuid, '17920000000000001', '17841499999999999', null, 'https://www.instagram.com/stories/x/1/')), 'failed');
reset role;
select pg_temp.c('45 with no id kept', (select state || ' ' || error || ' ' || coalesce(video_id, 'none') from public.platform_tests where id = pg_temp.g('s1')::uuid), 'failed CHANNEL_MISMATCH none');
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000a4');
select pg_temp.t('46 a picture post', $q$ insert into v select 'i1', public.platform_test_start(pg_temp.g('ig')::uuid, pg_temp.p('image', 2000)) $q$, 'ok');
select pg_temp.t('47 its copy', $q$ select public.platform_test_temp('k-ig-run-only', pg_temp.g('i1')::uuid, 'drivefileTESTMARK5') $q$, 'ok');
select pg_temp.t('48 its link', $q$ select public.platform_test_link('k-ig-run-only', pg_temp.g('i1')::uuid, pg_temp.g('h2'), now() + interval '30 minutes') $q$, 'ok');
select pg_temp.t('49 its container', $q$ select public.platform_test_container('k-ig-run-only', pg_temp.g('i1')::uuid, '17890000000000003') $q$, 'ok');
select pg_temp.c('50 published on the account', (select public.platform_test_done('k-ig-run-only', pg_temp.g('i1')::uuid, '17920000000000002', '17841400000000001', 'public', 'https://www.instagram.com/p/AbC123/')), 'published');
reset role;
select pg_temp.c('51 with its id and link, no privacy, the link ended', (select state || ' ' || video_id || ' ' || post_url || ' ' || coalesce(shown_privacy, 'none') || ' ' || coalesce(link_hash, 'none') from public.platform_tests where id = pg_temp.g('i1')::uuid),
  'published 17920000000000002 https://www.instagram.com/p/AbC123/ none none');
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000a4');
select pg_temp.c('52 the publisher sees its link', (select post_url from public.platform_tests where id = pg_temp.g('i1')::uuid), 'https://www.instagram.com/p/AbC123/');
select pg_temp.who('00000000-0000-0000-0000-0000000000a2');
select pg_temp.t('53 the director records it deleted', $q$ select public.platform_test_deleted('k-ig-run-only', pg_temp.g('i1')::uuid) $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-0000000000a4');
select pg_temp.t('54 a link that is not Instagram''s is not kept', $q$ insert into v select 'i2', public.platform_test_start(pg_temp.g('ig')::uuid, pg_temp.p('image', 2000)) $q$, 'ok');
select pg_temp.t('54b', $q$ select public.platform_test_container('k-ig-run-only', pg_temp.g('i2')::uuid, '17890000000000004') $q$, 'ok');
select pg_temp.c('54c', (select public.platform_test_done('k-ig-run-only', pg_temp.g('i2')::uuid, '17920000000000003', '17841400000000001', null, 'https://evil.example/p/1')), 'published');
reset role;
select pg_temp.c('55 its link left empty', (select coalesce(post_url, 'none') from public.platform_tests where id = pg_temp.g('i2')::uuid), 'none');

-- 7. A YouTube test is as it was -------------------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000a4');
select pg_temp.t('56 YouTube''s upload address is kept', $q$ select public.platform_test_session('k-ig-run-only', pg_temp.g('y1')::uuid, 'https://www.googleapis.com/upload/youtube/v3/videos?upload_id=TESTMARK') $q$, 'ok');
select pg_temp.t('57 YouTube takes no Instagram link', $q$ select public.platform_test_link('k-ig-run-only', pg_temp.g('y1')::uuid, pg_temp.g('h1'), now() + interval '30 minutes') $q$, 'ERR FORBIDDEN');
select pg_temp.c('58 the five-part call still records a video', (select public.platform_test_done('k-ig-run-only', pg_temp.g('y1')::uuid, 'dQw4w9WgXcQ', 'UCtestchannel', 'private')), 'published');
reset role;
select pg_temp.c('59 with its privacy and no Instagram link', (select shown_privacy || ' ' || coalesce(post_url, 'none') from public.platform_tests where id = pg_temp.g('y1')::uuid), 'private none');
select pg_temp.c('60 no address, hash or reference anywhere it should not be', ((select count(*) from public.notifications where body like '%TESTMARK%')
  + (select count(*) from public.integration_events where data::text like '%TESTMARK%')
  + (select count(*) from public.platform_tests where state <> 'uploading' and (link_hash is not null or upload_url is not null)))::text, '0');

select n, k, v, expect from r where v is distinct from expect
union all select 0, 'TOTAL', count(*)::text, (count(*) filter (where v is not distinct from expect))::text || ' passed' from r
order by n;
rollback;

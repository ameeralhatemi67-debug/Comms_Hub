-- Snapchat_Test_Plan.md section 4 (migration 20261126180000_platform_tests_snapchat.sql): «تجربة النشر» on a Snapchat Public Profile.
-- Who may test (the director, the assistant, the account's own publisher; not another publisher, not a writer, not a simulated,
-- switched-off or unconnected account), what each kind may be (one MP4 of at most 30 MiB, no privacy, no direct post, a time for the
-- silent check alone, ahead by one hour to 29 days), the Spotlight's id read whole and a Story that may have none, a post recorded
-- only for the account's own profile id, the media id kept as the container, deleting and failing, the one upload at a time and the
-- daily limit still applying, a test of one account out of reach of someone who may not test that account, the table's own rules
-- held by its constraints, and that YouTube's and TikTok's tests are as they were. Only throwaway accounts (@t.test) are touched;
-- the server key is replaced by a throwaway inside the transaction. One transaction, rolled back at the end.
-- Result: qa/platform-tests-snapchat-rules.json.
begin;
create temp table r(n serial, k text, v text, expect text);
create temp table v(k text primary key, val text);
grant all on r, v to public; grant usage on sequence r_n_seq to public;
insert into public.accounts (email, display_name, role, pages, protected) values
 ('dir@t.test','Dir','director','{}',false),('pub@t.test','Pub','publisher','{}',false),('pub2@t.test','Pub2','publisher','{}',false),
 ('wri@t.test','Wri','writer','{}',false),('ast@t.test','Ast','assistant','{}',false);
insert into auth.users (id, email, email_confirmed_at) values
 ('00000000-0000-0000-0000-0000000000a2','dir@t.test',now()),('00000000-0000-0000-0000-0000000000a4','pub@t.test',now()),
 ('00000000-0000-0000-0000-0000000000a5','pub2@t.test',now()),('00000000-0000-0000-0000-0000000000a6','wri@t.test',now()),
 ('00000000-0000-0000-0000-0000000000a7','ast@t.test',now());
insert into public.mail_server_key (id, key_hash) values (1, encode(sha256(convert_to('k-sn-run-only', 'UTF8')), 'hex'))
  on conflict (id) do update set key_hash = excluded.key_hash;
insert into public.platforms (key, label_ar, kind, sort, enabled) values ('snapchat', 'سناب شات', 'social', 6, true)
  on conflict (key) do update set enabled = true;
insert into public.platforms (key, label_ar, kind, sort, enabled) values ('tiktok', 'تيك توك', 'social', 3, true) on conflict (key) do nothing;
insert into public.platforms (key, label_ar, kind, sort, enabled) values ('youtube', 'يوتيوب', 'social', 2, true) on conflict (key) do nothing;
-- Five Snapchat profiles: the main one (its publisher is pub), another one (its publisher is pub2), one for the one-upload-at-a-time check,
-- one that needs reconnecting, and one that is switched off; and one that is only a simulation. Then a YouTube channel and a TikTok account.
with i as (insert into public.integrations (kind, type, label, state, created_by) values ('platform','snapchat_profile','الملف','connected','dir@t.test') returning id),
     a as (insert into public.platform_accounts (platform, label, handle, publishers, added_by, conn_kind, conn_state, external_id, integration_id, authorized_until)
           select 'snapchat', 'الملف العام', 'snap:main', array['pub@t.test'], 'dir@t.test', 'oauth', 'connected', 'a3c1f5d2-7b44-4e0a-9d7e-5f2b1c8e9a01', i.id, now() + interval '60 days' from i returning id)
insert into v select 'sn', id::text from a;
with i as (insert into public.integrations (kind, type, label, state, created_by) values ('platform','snapchat_profile','الملف الثاني','connected','dir@t.test') returning id),
     a as (insert into public.platform_accounts (platform, label, handle, publishers, added_by, conn_kind, conn_state, external_id, integration_id, authorized_until)
           select 'snapchat', 'الملف الثاني', 'snap:other', array['pub2@t.test'], 'dir@t.test', 'oauth', 'connected', 'b7d2e6f3-8c55-4f1b-8e8f-6a3c2d9fab12', i.id, now() + interval '60 days' from i returning id)
insert into v select 'sn2', id::text from a;
with i as (insert into public.integrations (kind, type, label, state, created_by) values ('platform','snapchat_profile','الملف الثالث','connected','dir@t.test') returning id),
     a as (insert into public.platform_accounts (platform, label, handle, publishers, added_by, conn_kind, conn_state, external_id, integration_id, authorized_until)
           select 'snapchat', 'الملف الثالث', 'snap:third', array['pub@t.test'], 'dir@t.test', 'oauth', 'connected', 'c8e3f7a4-9d66-4a2c-9f9a-7b4d3eaabc23', i.id, now() + interval '60 days' from i returning id)
insert into v select 'sn3', id::text from a;
with i as (insert into public.integrations (kind, type, label, state, created_by) values ('platform','snapchat_profile','ملف يحتاج إعادة','needs_reconnect','dir@t.test') returning id),
     a as (insert into public.platform_accounts (platform, label, handle, publishers, added_by, conn_kind, conn_state, external_id, integration_id, authorized_until)
           select 'snapchat', 'ملف يحتاج إعادة', 'snap:recon', array['pub@t.test'], 'dir@t.test', 'oauth', 'needs_reconnect', 'd9f4a8b5-ae77-4b3d-8a0b-8c5e4fbbcd34', i.id, now() - interval '1 day' from i returning id)
insert into v select 'snr', id::text from a;
with i as (insert into public.integrations (kind, type, label, state, created_by) values ('platform','snapchat_profile','ملف موقوف','connected','dir@t.test') returning id),
     a as (insert into public.platform_accounts (platform, label, handle, publishers, added_by, conn_kind, conn_state, external_id, integration_id, authorized_until)
           select 'snapchat', 'ملف موقوف', 'snap:off', array['pub@t.test'], 'dir@t.test', 'oauth', 'connected', 'e0a5b9c6-bf88-4c4e-9b1c-9d6f50ccde45', i.id, now() + interval '60 days' from i returning id)
insert into v select 'snoff', id::text from a;
update public.platform_accounts set active = false where id = (select val::uuid from v where k = 'snoff');
with a as (insert into public.platform_accounts (platform, label, handle, publishers, added_by) values ('snapchat', 'ملف تجريبي', 'snap:sim', array['pub@t.test'], 'dir@t.test') returning id)
insert into v select 'snsim', id::text from a;
with i as (insert into public.integrations (kind, type, label, state, created_by) values ('platform','youtube_channel','القناة','connected','dir@t.test') returning id),
     a as (insert into public.platform_accounts (platform, label, handle, publishers, added_by, conn_kind, conn_state, external_id, integration_id, authorized_until)
           select 'youtube', 'القناة', '@t_channel', array['pub@t.test'], 'dir@t.test', 'oauth', 'connected', 'UCtestchannel', i.id, now() + interval '90 days' from i returning id)
insert into v select 'yt', id::text from a;
with i as (insert into public.integrations (kind, type, label, state, created_by) values ('platform','tiktok_user','الحساب','connected','dir@t.test') returning id),
     a as (insert into public.platform_accounts (platform, label, handle, publishers, added_by, conn_kind, conn_state, external_id, integration_id, authorized_until)
           select 'tiktok', 'حساب TikTok', 'tt:-000openid', array['pub@t.test'], 'dir@t.test', 'oauth', 'connected', '-000TTopenidTEST', i.id, now() + interval '365 days' from i returning id)
insert into v select 'tt', id::text from a;
-- The library's guard names the uploader from the session: the director's.
select set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000a2','role','authenticated')::text, true);
with f as (insert into public.media_folders (name, created_by) values ('مجلد الفحص', 'dir@t.test') returning id),
     m as (insert into public.media_files (drive_file_id, name, mime_type, size_bytes, kind, uploaded_by, folder_id)
           select 'drive-video-SNAPTESTMARK-0001', 'مقطع.mp4', 'video/mp4', 5000000, 'video', 'dir@t.test', f.id from f returning id)
insert into v select 'vid', id::text from m;
-- A Spotlight's id is 58 characters of base64url; the profile ids above are Snap's UUIDs.
insert into v values ('spid', 'SPOT' || repeat('x', 54)), ('spid2', 'SPOT' || repeat('y', 54)), ('spid3', 'SPOT' || repeat('z', 54)), ('spid4', 'SPOT' || repeat('w', 54)),
  ('prof', 'a3c1f5d2-7b44-4e0a-9d7e-5f2b1c8e9a01'), ('prof2', 'b7d2e6f3-8c55-4f1b-8e8f-6a3c2d9fab12'), ('prof3', 'c8e3f7a4-9d66-4a2c-9f9a-7b4d3eaabc23'),
  ('media', '0c9a3b1e-5d2f-4a7b-8c6e-1f2a3b4c5d6e');
create function pg_temp.who(id text) returns void language sql as $$ select set_config('request.jwt.claims', json_build_object('sub',id,'role','authenticated')::text, true) $$;
create function pg_temp.t(k text, sqltext text, e text) returns void language plpgsql as $$
begin
  begin execute sqltext; insert into r(k,v,expect) values (k,'ok',e);
  exception when others then insert into r(k,v,expect) values (k,'ERR '||sqlerrm,e); end;
end $$;
create function pg_temp.c(k text, val text, e text) returns void language sql as $$ insert into r(k,v,expect) values (k,val,e) $$;
create function pg_temp.g(k text) returns text language sql as $$ select val from v where k = $1 $$;
-- A Snapchat test of one kind: a device file by default; `extra` is merged over it.
create function pg_temp.sn(kind text, extra jsonb default '{}', n bigint default 5000000, mime text default 'video/mp4') returns jsonb language sql as $$
  select jsonb_build_object('kind', kind, 'title', 'تجربة', 'source', 'device', 'size', n, 'mime', mime) || extra $$;
-- The silent check, with its go-live a number of days ahead.
create function pg_temp.sil(days numeric default 14, extra jsonb default '{}') returns jsonb language sql as $$
  select pg_temp.sn('snap_silent', jsonb_build_object('scheduled_for', (now() + days * interval '1 day')::text) || extra) $$;
grant execute on function pg_temp.who(text), pg_temp.t(text,text,text), pg_temp.c(text,text,text), pg_temp.g(text),
  pg_temp.sn(text,jsonb,bigint,text), pg_temp.sil(numeric,jsonb) to public;
set local role authenticated;

-- 1. Who may test ------------------------------------------------------------------------------------------------------
select pg_temp.who('00000000-0000-0000-0000-0000000000a2');
select pg_temp.c('01 the director may test a Snapchat profile', public.platform_test_may(pg_temp.g('sn')::uuid)::text, 'true');
select pg_temp.who('00000000-0000-0000-0000-0000000000a7');
select pg_temp.c('02 so may the assistant, who manages accounts', public.platform_test_may(pg_temp.g('sn')::uuid)::text, 'true');
select pg_temp.who('00000000-0000-0000-0000-0000000000a4');
select pg_temp.c('03 its own publisher may', public.platform_test_may(pg_temp.g('sn')::uuid)::text, 'true');
select pg_temp.who('00000000-0000-0000-0000-0000000000a5');
select pg_temp.c('04 another publisher may not', public.platform_test_may(pg_temp.g('sn')::uuid)::text, 'false');
select pg_temp.who('00000000-0000-0000-0000-0000000000a6');
select pg_temp.c('05 a writer may not', public.platform_test_may(pg_temp.g('sn')::uuid)::text, 'false');
select pg_temp.t('06 nor start one', $q$ select public.platform_test_start(pg_temp.g('sn')::uuid, pg_temp.sn('snap_spotlight')) $q$, 'ERR FORBIDDEN');
select pg_temp.who('00000000-0000-0000-0000-0000000000a2');
select pg_temp.c('07 a Snapchat profile that is only a simulation is nobody''s to test', public.platform_test_may(pg_temp.g('snsim')::uuid)::text, 'false');
select pg_temp.t('08 so starting on it is refused', $q$ select public.platform_test_start(pg_temp.g('snsim')::uuid, pg_temp.sn('snap_spotlight')) $q$, 'ERR FORBIDDEN');
select pg_temp.t('09 a profile that needs reconnecting is refused', $q$ select public.platform_test_start(pg_temp.g('snr')::uuid, pg_temp.sn('snap_spotlight')) $q$, 'ERR NOT_CONNECTED');
select pg_temp.t('10 and a profile switched off', $q$ select public.platform_test_start(pg_temp.g('snoff')::uuid, pg_temp.sn('snap_spotlight')) $q$, 'ERR ACCOUNT_OFF');
select pg_temp.t('11 a start on no account is refused', $q$ select public.platform_test_start(null, pg_temp.sn('snap_spotlight')) $q$, 'ERR FORBIDDEN');

-- 2. What each kind may be --------------------------------------------------------------------------------------------------
select pg_temp.who('00000000-0000-0000-0000-0000000000a4');
select pg_temp.t('12 a kind nobody knows is refused', $q$ select public.platform_test_start(pg_temp.g('sn')::uuid, pg_temp.sn('snap_photo')) $q$, 'ERR TEST_INVALID');
select pg_temp.t('13 the account check has no row to start', $q$ select public.platform_test_start(pg_temp.g('sn')::uuid, pg_temp.sn('snap_check')) $q$, 'ERR TEST_INVALID');
select pg_temp.t('14 Snapchat takes no kind of another platform: a video', $q$ select public.platform_test_start(pg_temp.g('sn')::uuid, pg_temp.sn('video', '{"privacy":"private"}')) $q$, 'ERR TEST_INVALID');
select pg_temp.t('15 nor TikTok''s', $q$ select public.platform_test_start(pg_temp.g('sn')::uuid, pg_temp.sn('tt_draft')) $q$, 'ERR TEST_INVALID');
select pg_temp.t('16 nor an Instagram Reel', $q$ select public.platform_test_start(pg_temp.g('sn')::uuid, pg_temp.sn('reel')) $q$, 'ERR TEST_INVALID');
select pg_temp.t('17 nor a Facebook silent check', $q$ select public.platform_test_start(pg_temp.g('sn')::uuid, pg_temp.sn('fb_silent', '{"scheduled_for":"2999-01-01T00:00:00Z"}')) $q$, 'ERR TEST_INVALID');
select pg_temp.t('18 the kind defaults to a video, which Snapchat refuses', $q$ select public.platform_test_start(pg_temp.g('sn')::uuid, '{"title":"x","source":"device","size":10,"mime":"video/mp4"}'::jsonb) $q$, 'ERR TEST_INVALID');
select pg_temp.t('19 a video is MP4 and nothing else: MOV', $q$ select public.platform_test_start(pg_temp.g('sn')::uuid, pg_temp.sn('snap_spotlight', '{}', 1000, 'video/quicktime')) $q$, 'ERR TEST_INVALID');
select pg_temp.t('20 not WebM', $q$ select public.platform_test_start(pg_temp.g('sn')::uuid, pg_temp.sn('snap_story', '{}', 1000, 'video/webm')) $q$, 'ERR TEST_INVALID');
select pg_temp.t('21 not a picture: Snapchat takes no picture Story here', $q$ select public.platform_test_start(pg_temp.g('sn')::uuid, pg_temp.sn('snap_story', '{}', 1000, 'image/jpeg')) $q$, 'ERR TEST_INVALID');
select pg_temp.t('22 at most 30 MiB: one byte more', $q$ select public.platform_test_start(pg_temp.g('sn')::uuid, pg_temp.sn('snap_spotlight', '{}', 31457281)) $q$, 'ERR TEST_INVALID');
select pg_temp.t('23 the same for a Story', $q$ select public.platform_test_start(pg_temp.g('sn')::uuid, pg_temp.sn('snap_story', '{}', 104857600)) $q$, 'ERR TEST_INVALID');
select pg_temp.t('24 and for the silent check', $q$ select public.platform_test_start(pg_temp.g('sn')::uuid, pg_temp.sil(14, '{"size":40000000}')) $q$, 'ERR TEST_INVALID');
select pg_temp.t('25 no file at all is refused', $q$ select public.platform_test_start(pg_temp.g('sn')::uuid, '{"kind":"snap_spotlight","title":"x"}'::jsonb) $q$, 'ERR TEST_INVALID');
select pg_temp.t('26 an empty file is refused', $q$ select public.platform_test_start(pg_temp.g('sn')::uuid, pg_temp.sn('snap_spotlight', '{}', 0)) $q$, 'ERR TEST_INVALID');
select pg_temp.t('27 a file with no type is refused', $q$ select public.platform_test_start(pg_temp.g('sn')::uuid, '{"kind":"snap_spotlight","title":"x","source":"device","size":10}'::jsonb) $q$, 'ERR TEST_INVALID');
select pg_temp.t('28 a source nobody knows is refused', $q$ select public.platform_test_start(pg_temp.g('sn')::uuid, pg_temp.sn('snap_spotlight', '{"source":"url"}')) $q$, 'ERR TEST_INVALID');
select pg_temp.t('29 a library file needs its asset and version', $q$ select public.platform_test_start(pg_temp.g('sn')::uuid, pg_temp.sn('snap_spotlight', '{"source":"library"}')) $q$, 'ERR TEST_INVALID');
select pg_temp.t('30 a device file has none', $q$ select public.platform_test_start(pg_temp.g('sn')::uuid, pg_temp.sn('snap_spotlight', jsonb_build_object('asset', pg_temp.g('vid'), 'version', 1))) $q$, 'ERR TEST_INVALID');
select pg_temp.t('31 no privacy: Snapchat has none to choose', $q$ select public.platform_test_start(pg_temp.g('sn')::uuid, pg_temp.sn('snap_spotlight', '{"privacy":"public"}')) $q$, 'ERR TEST_INVALID');
select pg_temp.t('32 not even a private one for a Story', $q$ select public.platform_test_start(pg_temp.g('sn')::uuid, pg_temp.sn('snap_story', '{"privacy":"private"}')) $q$, 'ERR TEST_INVALID');
select pg_temp.t('33 the feed choice is an Instagram Reel''s', $q$ select public.platform_test_start(pg_temp.g('sn')::uuid, pg_temp.sn('snap_spotlight', '{"share_to_feed":true}')) $q$, 'ERR TEST_INVALID');
select pg_temp.t('34 a title is needed', $q$ select public.platform_test_start(pg_temp.g('sn')::uuid, pg_temp.sn('snap_spotlight', '{"title":"   "}')) $q$, 'ERR TEST_INVALID');
select pg_temp.t('35 at most 100 characters', $q$ select public.platform_test_start(pg_temp.g('sn')::uuid, pg_temp.sn('snap_spotlight', jsonb_build_object('title', repeat('ب', 101)))) $q$, 'ERR TEST_INVALID');
select pg_temp.t('36 with no angle bracket', $q$ select public.platform_test_start(pg_temp.g('sn')::uuid, pg_temp.sn('snap_spotlight', '{"title":"a<b"}')) $q$, 'ERR TEST_INVALID');
select pg_temp.t('37 a link belongs to a Page''s text post', $q$ select public.platform_test_start(pg_temp.g('sn')::uuid, pg_temp.sn('snap_spotlight', '{"link":"https://example.com"}')) $q$, 'ERR TEST_INVALID');
select pg_temp.t('38 only the silent check has a time: a Spotlight', $q$ select public.platform_test_start(pg_temp.g('sn')::uuid, pg_temp.sn('snap_spotlight', jsonb_build_object('scheduled_for', (now() + interval '14 days')::text))) $q$, 'ERR TEST_INVALID');
select pg_temp.t('39 not a Story', $q$ select public.platform_test_start(pg_temp.g('sn')::uuid, pg_temp.sn('snap_story', jsonb_build_object('scheduled_for', (now() + interval '14 days')::text))) $q$, 'ERR TEST_INVALID');
select pg_temp.t('40 the silent check needs its time', $q$ select public.platform_test_start(pg_temp.g('sn')::uuid, pg_temp.sn('snap_silent')) $q$, 'ERR TEST_INVALID');
select pg_temp.t('41 a time that is not a time is refused', $q$ select public.platform_test_start(pg_temp.g('sn')::uuid, pg_temp.sn('snap_silent', '{"scheduled_for":"tomorrow-ish"}')) $q$, 'ERR TEST_INVALID');
select pg_temp.t('42 at least an hour ahead: 30 minutes', $q$ select public.platform_test_start(pg_temp.g('sn')::uuid, pg_temp.sil(30.0/1440)) $q$, 'ERR SCHEDULE_INVALID');
select pg_temp.t('43 in the past', $q$ select public.platform_test_start(pg_temp.g('sn')::uuid, pg_temp.sil(-1)) $q$, 'ERR SCHEDULE_INVALID');
select pg_temp.t('44 at most 29 days ahead: 30 days', $q$ select public.platform_test_start(pg_temp.g('sn')::uuid, pg_temp.sil(30)) $q$, 'ERR SCHEDULE_INVALID');
select pg_temp.t('45 a test is never a direct post, by a publisher', $q$ select public.platform_test_start(pg_temp.g('sn')::uuid, pg_temp.sn('snap_spotlight', '{"purpose":"direct"}')) $q$, 'ERR FORBIDDEN');
select pg_temp.t('46 a purpose nobody knows is refused', $q$ select public.platform_test_start(pg_temp.g('sn')::uuid, pg_temp.sn('snap_spotlight', '{"purpose":"promo"}')) $q$, 'ERR TEST_INVALID');
select pg_temp.t('47 YouTube takes no Snapchat kind', $q$ select public.platform_test_start(pg_temp.g('yt')::uuid, pg_temp.sn('snap_spotlight', '{"privacy":"private"}')) $q$, 'ERR TEST_INVALID');
select pg_temp.t('48 nor does TikTok', $q$ select public.platform_test_start(pg_temp.g('tt')::uuid, pg_temp.sn('snap_story')) $q$, 'ERR TEST_INVALID');
select pg_temp.who('00000000-0000-0000-0000-0000000000a2');
select pg_temp.t('49 nor does the director make it direct: the engine''s direct post is not Snapchat''s', $q$ select public.platform_test_start(pg_temp.g('sn')::uuid, pg_temp.sn('snap_spotlight', '{"purpose":"direct"}')) $q$, 'ERR TEST_INVALID');
select pg_temp.t('50 not even a silent check as a direct post', $q$ select public.platform_test_start(pg_temp.g('sn')::uuid, pg_temp.sil(14, '{"purpose":"direct"}')) $q$, 'ERR TEST_INVALID');
reset role;
select pg_temp.c('51 nothing was recorded by all of those refusals', (select count(*)::text from public.platform_tests where kind like 'snap\_%' or account_id in (select val::uuid from v where k in ('snsim','snr','snoff'))), '0');

-- 3. A Spotlight: its copy, the media Snap made, arrived with its id ---------------------------------------------------------
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000a4');
select pg_temp.t('52 a Spotlight from the device, exactly 30 MiB', $q$ insert into v select 'sp1', public.platform_test_start(pg_temp.g('sn')::uuid, pg_temp.sn('snap_spotlight', '{}', 31457280)) $q$, 'ok');
reset role;
select pg_temp.c('53 recorded as a Spotlight: no privacy, no time, a test', (select kind || ' ' || coalesce(privacy, 'none') || ' ' || coalesce(scheduled_for::text, 'none') || ' ' || purpose || ' ' || mime || ' ' || size || ' ' || source || ' ' || state
  from public.platform_tests where id = pg_temp.g('sp1')::uuid), 'snap_spotlight none none test video/mp4 31457280 device uploading');
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000a4');
select pg_temp.t('54 the device file''s copy is kept for the server', $q$ select public.platform_test_temp('k-sn-run-only', pg_temp.g('sp1')::uuid, 'drivefileSNTESTMARK1') $q$, 'ok');
select pg_temp.t('55 Snap''s media id is kept as the container', $q$ select public.platform_test_container('k-sn-run-only', pg_temp.g('sp1')::uuid, pg_temp.g('media')) $q$, 'ok');
select pg_temp.t('56 it is set once', $q$ select public.platform_test_container('k-sn-run-only', pg_temp.g('sp1')::uuid, pg_temp.g('media')) $q$, 'ERR FORBIDDEN');
select pg_temp.t('57 and must look like an id', $q$ select public.platform_test_container('k-sn-run-only', pg_temp.g('sp1')::uuid, 'no') $q$, 'ERR TEST_INVALID');
select pg_temp.t('58 a wrong server key reads nothing', $q$ select public.platform_test_get('wrong', pg_temp.g('sp1')::uuid) $q$, 'ERR FORBIDDEN');
select pg_temp.c('59 the server sees the platform, the kind, the media and the profile', (select (x->>'platform') || ' ' || (x->>'kind') || ' ' || (x->>'container') || ' ' || (x->>'external_id') || ' ' || (x->>'purpose') || ' ' || (x->>'mine')
  from (select public.platform_test_get('k-sn-run-only', pg_temp.g('sp1')::uuid) x) q), 'snapchat snap_spotlight ' || pg_temp.g('media') || ' ' || pg_temp.g('prof') || ' test true');
select pg_temp.c('60 and no time, no privacy', (select coalesce(x->>'scheduled_for', 'none') || ' ' || coalesce(x->>'privacy', 'none') from (select public.platform_test_get('k-sn-run-only', pg_temp.g('sp1')::uuid) x) q), 'none none');
select pg_temp.c('61 no upload address is held for it', (select coalesce(x->>'url', 'none') from (select public.platform_test_get('k-sn-run-only', pg_temp.g('sp1')::uuid) x) q), 'none');
select pg_temp.c('62 a Spotlight arrives with the id Snap gave, whole', (select public.platform_test_done('k-sn-run-only', pg_temp.g('sp1')::uuid, pg_temp.g('spid'), pg_temp.g('prof'), null)), 'published');
reset role;
select pg_temp.c('63 recorded with its 58-character id', (select state || ' ' || length(video_id) || ' ' || (video_id = pg_temp.g('spid'))::text || ' ' || coalesce(link_hash, 'none') from public.platform_tests where id = pg_temp.g('sp1')::uuid), 'published 58 true none');
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000a4');
select pg_temp.t('64 it arrives once', $q$ select public.platform_test_done('k-sn-run-only', pg_temp.g('sp1')::uuid, pg_temp.g('spid'), pg_temp.g('prof'), null) $q$, 'ERR FORBIDDEN');
select pg_temp.t('65 and cannot be called failed afterwards', $q$ select public.platform_test_failed('k-sn-run-only', pg_temp.g('sp1')::uuid, 'SN_UPLOAD_FAILED') $q$, 'ERR FORBIDDEN');

-- 4. A library video, a Story, and what starting another one does ----------------------------------------------------------------
select pg_temp.t('66 a Spotlight from the library', $q$ insert into v select 'sp2', public.platform_test_start(pg_temp.g('sn')::uuid, pg_temp.sn('snap_spotlight', jsonb_build_object('source', 'library', 'asset', pg_temp.g('vid'), 'version', 1))) $q$, 'ok');
reset role;
select pg_temp.c('67 recorded as the library''s version', (select source || ' ' || asset_version || ' ' || (asset_id = pg_temp.g('vid')::uuid)::text from public.platform_tests where id = pg_temp.g('sp2')::uuid), 'library 1 true');
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000a4');
select pg_temp.t('68 a library file has no copy of its own to record', $q$ select public.platform_test_temp('k-sn-run-only', pg_temp.g('sp2')::uuid, 'drivefileSNTESTMARK2') $q$, 'ERR FORBIDDEN');
select pg_temp.t('69 a Story, the title being the post''s own words', $q$ insert into v select 'st1', public.platform_test_start(pg_temp.g('sn')::uuid, pg_temp.sn('snap_story', jsonb_build_object('title', repeat('ب', 100)))) $q$, 'ok');
reset role;
select pg_temp.c('70 starting the Story closed the open Spotlight', (select state || ' ' || error from public.platform_tests where id = pg_temp.g('sp2')::uuid), 'failed ABANDONED');
select pg_temp.c('71 and left the published one alone', (select state from public.platform_tests where id = pg_temp.g('sp1')::uuid), 'published');
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000a4');
select pg_temp.c('72 a Story has no id of its own: it arrives without', (select public.platform_test_done('k-sn-run-only', pg_temp.g('st1')::uuid, null, pg_temp.g('prof'), null)), 'published');
reset role;
select pg_temp.c('73 published and recorded with no id', (select state || ' ' || coalesce(video_id, 'none') || ' ' || kind from public.platform_tests where id = pg_temp.g('st1')::uuid), 'published none snap_story');
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000a4');
select pg_temp.t('74 another Story', $q$ insert into v select 'st2', public.platform_test_start(pg_temp.g('sn')::uuid, pg_temp.sn('snap_story')) $q$, 'ok');
select pg_temp.c('75 on another profile it is not recorded', (select public.platform_test_done('k-sn-run-only', pg_temp.g('st2')::uuid, null, pg_temp.g('prof2'), null)), 'failed');
reset role;
select pg_temp.c('76 failed as a mismatch, not published', (select state || ' ' || error from public.platform_tests where id = pg_temp.g('st2')::uuid), 'failed CHANNEL_MISMATCH');

-- 5. A Spotlight that does not arrive as a Spotlight --------------------------------------------------------------------------
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000a4');
select pg_temp.t('77 a Spotlight with no id', $q$ insert into v select 'f1', public.platform_test_start(pg_temp.g('sn')::uuid, pg_temp.sn('snap_spotlight')) $q$, 'ok');
select pg_temp.c('78 is not recorded: it needs the id', (select public.platform_test_done('k-sn-run-only', pg_temp.g('f1')::uuid, null, pg_temp.g('prof'), null)), 'failed');
select pg_temp.t('79 a Spotlight on another profile', $q$ insert into v select 'f2', public.platform_test_start(pg_temp.g('sn')::uuid, pg_temp.sn('snap_spotlight')) $q$, 'ok');
select pg_temp.c('80 is not recorded as this one''s', (select public.platform_test_done('k-sn-run-only', pg_temp.g('f2')::uuid, pg_temp.g('spid2'), pg_temp.g('prof2'), null)), 'failed');
select pg_temp.t('81 a Spotlight with a short id', $q$ insert into v select 'f3', public.platform_test_start(pg_temp.g('sn')::uuid, pg_temp.sn('snap_spotlight')) $q$, 'ok');
select pg_temp.c('82 is not recorded', (select public.platform_test_done('k-sn-run-only', pg_temp.g('f3')::uuid, 'short', pg_temp.g('prof'), null)), 'failed');
select pg_temp.t('83 a Spotlight with a padded id', $q$ insert into v select 'f4', public.platform_test_start(pg_temp.g('sn')::uuid, pg_temp.sn('snap_spotlight')) $q$, 'ok');
select pg_temp.c('84 is not recorded', (select public.platform_test_done('k-sn-run-only', pg_temp.g('f4')::uuid, 'SPOT' || repeat('x', 52) || '==', pg_temp.g('prof'), null)), 'failed');
select pg_temp.t('85 a Spotlight with a very long id', $q$ insert into v select 'f5', public.platform_test_start(pg_temp.g('sn')::uuid, pg_temp.sn('snap_spotlight')) $q$, 'ok');
select pg_temp.c('86 is not recorded', (select public.platform_test_done('k-sn-run-only', pg_temp.g('f5')::uuid, repeat('x', 61), pg_temp.g('prof'), null)), 'failed');
select pg_temp.t('87 a Spotlight that Snap refused, given up by its author', $q$ insert into v select 'f6', public.platform_test_start(pg_temp.g('sn')::uuid, pg_temp.sn('snap_spotlight')) $q$, 'ok');
select pg_temp.t('88 its author closes it with Snap''s own refusal', $q$ select public.platform_test_failed('k-sn-run-only', pg_temp.g('f6')::uuid, 'SN_POST_REFUSED') $q$, 'ok');
reset role;
select pg_temp.c('89 closed by its author with Snap''s refusal', (select state || ' ' || error from public.platform_tests where id = pg_temp.g('f6')::uuid), 'failed SN_POST_REFUSED');
select pg_temp.c('90 the others failed as mismatches, none published', (select count(*)::text from public.platform_tests where id in (select val::uuid from v where k in ('f1','f2','f3','f4','f5')) and state = 'failed' and error = 'CHANNEL_MISMATCH'), '5');
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000a4');
select pg_temp.t('91 another one, to fail with a word that is not a code', $q$ insert into v select 'f7', public.platform_test_start(pg_temp.g('sn')::uuid, pg_temp.sn('snap_story')) $q$, 'ok');
select pg_temp.t('92 closed', $q$ select public.platform_test_failed('k-sn-run-only', pg_temp.g('f7')::uuid, 'not a code <script>') $q$, 'ok');
select pg_temp.t('93 and the platform''s line is kept beside it', $q$ select public.platform_test_failed_detail('k-sn-run-only', pg_temp.g('f7')::uuid, 'snapchat http 403 E1004 media expired') $q$, 'ok');
reset role;
select pg_temp.c('94 an unknown word becomes the general one, the detail kept', (select error || ' ' || error_detail from public.platform_tests where id = pg_temp.g('f7')::uuid), 'PLATFORM_ERROR snapchat http 403 E1004 media expired');
set local role authenticated;

-- 6. The silent check: a time, arrived, deleted at once; or left standing ------------------------------------------------------
select pg_temp.who('00000000-0000-0000-0000-0000000000a4');
select pg_temp.t('95 a silent check 14 days ahead', $q$ insert into v select 'sl1', public.platform_test_start(pg_temp.g('sn')::uuid, pg_temp.sil(14)) $q$, 'ok');
select pg_temp.c('96 the publisher sees its date', (select (scheduled_for > now() + interval '13 days 23 hours' and scheduled_for < now() + interval '14 days 1 hour')::text from public.platform_tests where id = pg_temp.g('sl1')::uuid), 'true');
select pg_temp.c('97 created and read back: its Spotlight id', (select public.platform_test_done('k-sn-run-only', pg_temp.g('sl1')::uuid, pg_temp.g('spid3'), pg_temp.g('prof'), null)), 'published');
select pg_temp.t('98 then deleted at once by its own server', $q$ select public.platform_test_deleted('k-sn-run-only', pg_temp.g('sl1')::uuid) $q$, 'ok');
reset role;
select pg_temp.c('99 a silent check ends deleted, its date kept', (select state || ' ' || (scheduled_for is not null)::text || ' ' || deleted_by from public.platform_tests where id = pg_temp.g('sl1')::uuid), 'deleted true pub@t.test');
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000a4');
select pg_temp.t('100 the edge of the window: one hour and a minute', $q$ insert into v select 'sl2', public.platform_test_start(pg_temp.g('sn')::uuid, pg_temp.sil(61.0/1440)) $q$, 'ok');
select pg_temp.t('101 and 29 days less a minute', $q$ insert into v select 'sl3', public.platform_test_start(pg_temp.g('sn')::uuid, pg_temp.sil(29 - 1.0/1440)) $q$, 'ok');
select pg_temp.c('102 a silent check with no id is not recorded', (select public.platform_test_done('k-sn-run-only', pg_temp.g('sl3')::uuid, null, pg_temp.g('prof'), null)), 'failed');
select pg_temp.t('103 a silent check whose delete was refused stays published', $q$ insert into v select 'sl4', public.platform_test_start(pg_temp.g('sn')::uuid, pg_temp.sil(14)) $q$, 'ok');
select pg_temp.c('104 it arrived', (select public.platform_test_done('k-sn-run-only', pg_temp.g('sl4')::uuid, pg_temp.g('spid4'), pg_temp.g('prof'), null)), 'published');
reset role;
select pg_temp.c('105 published with its date, as the list offers the delete', (select state || ' ' || (scheduled_for is not null)::text from public.platform_tests where id = pg_temp.g('sl4')::uuid), 'published true');
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000a2');
select pg_temp.t('106 the director may delete it later', $q$ select public.platform_test_deleted('k-sn-run-only', pg_temp.g('sl4')::uuid) $q$, 'ok');
select pg_temp.t('107 but not twice', $q$ select public.platform_test_deleted('k-sn-run-only', pg_temp.g('sl4')::uuid) $q$, 'ERR FORBIDDEN');

-- 7. Deleting a Spotlight ----------------------------------------------------------------------------------------------------
select pg_temp.who('00000000-0000-0000-0000-0000000000a5');
select pg_temp.t('108 another publisher cannot delete it', $q$ select public.platform_test_deleted('k-sn-run-only', pg_temp.g('sp1')::uuid) $q$, 'ERR FORBIDDEN');
select pg_temp.who('00000000-0000-0000-0000-0000000000a6');
select pg_temp.t('109 nor a writer', $q$ select public.platform_test_deleted('k-sn-run-only', pg_temp.g('sp1')::uuid) $q$, 'ERR FORBIDDEN');
select pg_temp.who('00000000-0000-0000-0000-0000000000a4');
select pg_temp.t('110 a wrong server key deletes nothing', $q$ select public.platform_test_deleted('wrong', pg_temp.g('sp1')::uuid) $q$, 'ERR FORBIDDEN');
select pg_temp.t('111 a test that failed is not deleted', $q$ select public.platform_test_deleted('k-sn-run-only', pg_temp.g('f1')::uuid) $q$, 'ERR FORBIDDEN');
select pg_temp.t('112 the publisher deletes the published Spotlight', $q$ select public.platform_test_deleted('k-sn-run-only', pg_temp.g('sp1')::uuid) $q$, 'ok');
reset role;
select pg_temp.c('113 recorded deleted, by whom', (select state || ' ' || deleted_by from public.platform_tests where id = pg_temp.g('sp1')::uuid), 'deleted pub@t.test');
select pg_temp.c('114 and its id stays, to say what was deleted', (select (video_id = pg_temp.g('spid'))::text from public.platform_tests where id = pg_temp.g('sp1')::uuid), 'true');
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000a7');
select pg_temp.t('114a the assistant, who manages accounts, starts a Story', $q$ insert into v select 'as1', public.platform_test_start(pg_temp.g('sn')::uuid, pg_temp.sn('snap_story')) $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-0000000000a4');
select pg_temp.t('114b the publisher cannot close what the assistant opened', $q$ select public.platform_test_failed('k-sn-run-only', pg_temp.g('as1')::uuid, 'SN_UPLOAD_FAILED') $q$, 'ERR FORBIDDEN');
select pg_temp.t('114c nor finish it', $q$ select public.platform_test_done('k-sn-run-only', pg_temp.g('as1')::uuid, null, pg_temp.g('prof'), null) $q$, 'ERR FORBIDDEN');
select pg_temp.who('00000000-0000-0000-0000-0000000000a7');
select pg_temp.t('114d only its author finishes it', $q$ select public.platform_test_done('k-sn-run-only', pg_temp.g('as1')::uuid, null, pg_temp.g('prof'), null) $q$, 'ok');
reset role;
select pg_temp.c('114e recorded under the assistant', (select created_by || ' ' || state from public.platform_tests where id = pg_temp.g('as1')::uuid), 'ast@t.test published');

-- 8. A test of one profile is out of reach of someone who may not test it ---------------------------------------------------------
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000a5');
select pg_temp.c('115 another publisher reads none of the main profile''s tests', (select count(*)::text from public.platform_tests where account_id = pg_temp.g('sn')::uuid), '0');
select pg_temp.t('116 nor the server''s view of one', $q$ select public.platform_test_get('k-sn-run-only', pg_temp.g('sp1')::uuid) $q$, 'ERR FORBIDDEN');
select pg_temp.t('117 and cannot start one on it', $q$ select public.platform_test_start(pg_temp.g('sn')::uuid, pg_temp.sn('snap_story')) $q$, 'ERR FORBIDDEN');
select pg_temp.t('118 its own profile is theirs: a Story there', $q$ insert into v select 'o2', public.platform_test_start(pg_temp.g('sn2')::uuid, pg_temp.sn('snap_story')) $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-0000000000a4');
select pg_temp.c('119 the main publisher reads its own tests', (select (count(*) > 0)::text from public.platform_tests where account_id = pg_temp.g('sn')::uuid), 'true');
select pg_temp.c('120 and none of the other profile''s', (select count(*)::text from public.platform_tests where account_id = pg_temp.g('sn2')::uuid), '0');
select pg_temp.t('121 the other profile''s test cannot be finished by him', $q$ select public.platform_test_done('k-sn-run-only', pg_temp.g('o2')::uuid, null, pg_temp.g('prof2'), null) $q$, 'ERR FORBIDDEN');
select pg_temp.t('122 nor failed', $q$ select public.platform_test_failed('k-sn-run-only', pg_temp.g('o2')::uuid, 'SN_UPLOAD_FAILED') $q$, 'ERR FORBIDDEN');
select pg_temp.t('123 nor given a media id', $q$ select public.platform_test_container('k-sn-run-only', pg_temp.g('o2')::uuid, pg_temp.g('media')) $q$, 'ERR FORBIDDEN');
select pg_temp.who('00000000-0000-0000-0000-0000000000a2');
select pg_temp.c('124 the director, who may test both, reads it', (select (x->>'mine') || ' ' || (x->>'state') from (select public.platform_test_get('k-sn-run-only', pg_temp.g('o2')::uuid) x) q), 'false uploading');
select pg_temp.t('125 but only its author finishes it', $q$ select public.platform_test_done('k-sn-run-only', pg_temp.g('o2')::uuid, null, pg_temp.g('prof2'), null) $q$, 'ERR FORBIDDEN');
select pg_temp.who('00000000-0000-0000-0000-0000000000a5');
select pg_temp.c('126 its author finishes it', (select public.platform_test_done('k-sn-run-only', pg_temp.g('o2')::uuid, null, pg_temp.g('prof2'), null)), 'published');
select pg_temp.who('00000000-0000-0000-0000-0000000000a4');
select pg_temp.t('127 the main publisher cannot delete the other profile''s test', $q$ select public.platform_test_deleted('k-sn-run-only', pg_temp.g('o2')::uuid) $q$, 'ERR FORBIDDEN');

-- 9. One upload at a time, and ten a day --------------------------------------------------------------------------------------
select pg_temp.who('00000000-0000-0000-0000-0000000000a4');
select pg_temp.t('128 an upload open on the third profile', $q$ insert into v select 'u1', public.platform_test_start(pg_temp.g('sn3')::uuid, pg_temp.sn('snap_spotlight')) $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-0000000000a2');
select pg_temp.t('129 the director starts one there too', $q$ insert into v select 'u2', public.platform_test_start(pg_temp.g('sn3')::uuid, pg_temp.sn('snap_spotlight')) $q$, 'ok');
reset role;
select pg_temp.c('130 which closes nothing of the publisher''s', (select state from public.platform_tests where id = pg_temp.g('u1')::uuid), 'uploading');
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000a4');
select pg_temp.t('131 the publisher starts another', $q$ insert into v select 'u3', public.platform_test_start(pg_temp.g('sn3')::uuid, pg_temp.sn('snap_story')) $q$, 'ok');
reset role;
select pg_temp.c('132 which closes his own open one, as abandoned', (select state || ' ' || error from public.platform_tests where id = pg_temp.g('u1')::uuid), 'failed ABANDONED');
select pg_temp.c('133 and not the director''s', (select state from public.platform_tests where id = pg_temp.g('u2')::uuid), 'uploading');
-- The second profile already holds one Story of today (above); nine more make ten, as a day's tests do.
insert into public.platform_tests (account_id, kind, title, source, size, mime, state, created_by)
  select pg_temp.g('sn2')::uuid, 'snap_story', 'قصة ' || g, 'device', 1000, 'video/mp4', 'published', 'pub2@t.test' from generate_series(1, 9) g;
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000a5');
select pg_temp.t('134 with ten in a day the next is refused', $q$ select public.platform_test_start(pg_temp.g('sn2')::uuid, pg_temp.sn('snap_story')) $q$, 'ERR TEST_LIMIT');
select pg_temp.t('135 for a Spotlight too', $q$ select public.platform_test_start(pg_temp.g('sn2')::uuid, pg_temp.sn('snap_spotlight')) $q$, 'ERR TEST_LIMIT');
select pg_temp.t('136 and for the silent check', $q$ select public.platform_test_start(pg_temp.g('sn2')::uuid, pg_temp.sil(14)) $q$, 'ERR TEST_LIMIT');
select pg_temp.who('00000000-0000-0000-0000-0000000000a4');
select pg_temp.t('137 the limit is the profile''s own: the main one starts', $q$ insert into v select 'o4', public.platform_test_start(pg_temp.g('sn')::uuid, pg_temp.sn('snap_story')) $q$, 'ok');
reset role;
update public.platform_tests set state = 'failed', error = 'SN_UPLOAD_FAILED', done_at = now()
  where account_id = pg_temp.g('sn2')::uuid and title = 'قصة 1';
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000a5');
select pg_temp.t('138 a failed one does not count', $q$ insert into v select 'o3', public.platform_test_start(pg_temp.g('sn2')::uuid, pg_temp.sn('snap_story')) $q$, 'ok');

-- 10. The table's own rules, held by its constraints, whoever writes ---------------------------------------------------------------
reset role;
select pg_temp.t('139 a Snap row of another mime is refused by the table', $q$ insert into public.platform_tests (account_id, kind, title, source, size, mime, created_by)
  values (pg_temp.g('sn3')::uuid, 'snap_spotlight', 'x', 'device', 1000, 'video/quicktime', 'dir@t.test') $q$, 'ERR new row for relation "platform_tests" violates check constraint "platform_tests_mime_check"');
select pg_temp.t('140 a Snap row over 30 MiB too', $q$ insert into public.platform_tests (account_id, kind, title, source, size, mime, created_by)
  values (pg_temp.g('sn3')::uuid, 'snap_story', 'x', 'device', 31457281, 'video/mp4', 'dir@t.test') $q$, 'ERR new row for relation "platform_tests" violates check constraint "platform_tests_kind_size"');
select pg_temp.t('141 a Snap row with a privacy', $q$ insert into public.platform_tests (account_id, kind, title, source, size, mime, privacy, created_by)
  values (pg_temp.g('sn3')::uuid, 'snap_story', 'x', 'device', 1000, 'video/mp4', 'private', 'dir@t.test') $q$, 'ERR new row for relation "platform_tests" violates check constraint "platform_tests_privacy_kind"');
select pg_temp.t('142 a Spotlight with a time', $q$ insert into public.platform_tests (account_id, kind, title, source, size, mime, scheduled_for, created_by)
  values (pg_temp.g('sn3')::uuid, 'snap_spotlight', 'x', 'device', 1000, 'video/mp4', now() + interval '14 days', 'dir@t.test') $q$, 'ERR new row for relation "platform_tests" violates check constraint "platform_tests_scheduled_kind"');
select pg_temp.t('143 a silent check with none', $q$ insert into public.platform_tests (account_id, kind, title, source, size, mime, created_by)
  values (pg_temp.g('sn3')::uuid, 'snap_silent', 'x', 'device', 1000, 'video/mp4', 'dir@t.test') $q$, 'ERR new row for relation "platform_tests" violates check constraint "platform_tests_scheduled_kind"');
select pg_temp.t('144 a Snap row that is a direct post', $q$ insert into public.platform_tests (account_id, kind, title, source, size, mime, purpose, created_by)
  values (pg_temp.g('sn3')::uuid, 'snap_story', 'x', 'device', 1000, 'video/mp4', 'direct', 'dir@t.test') $q$, 'ERR new row for relation "platform_tests" violates check constraint "platform_tests_snap_test_only"');
select pg_temp.t('145 a published Spotlight with no id', $q$ insert into public.platform_tests (account_id, kind, title, source, size, mime, state, created_by)
  values (pg_temp.g('sn3')::uuid, 'snap_spotlight', 'x', 'device', 1000, 'video/mp4', 'published', 'dir@t.test') $q$, 'ERR new row for relation "platform_tests" violates check constraint "platform_tests_published_id"');
select pg_temp.t('146 a published silent check with none', $q$ insert into public.platform_tests (account_id, kind, title, source, size, mime, state, scheduled_for, created_by)
  values (pg_temp.g('sn3')::uuid, 'snap_silent', 'x', 'device', 1000, 'video/mp4', 'published', now() + interval '14 days', 'dir@t.test') $q$, 'ERR new row for relation "platform_tests" violates check constraint "platform_tests_published_id"');
select pg_temp.t('147 a published Story with none', $q$ insert into public.platform_tests (account_id, kind, title, source, size, mime, state, created_by)
  values (pg_temp.g('sn3')::uuid, 'snap_story', 'x', 'device', 1000, 'video/mp4', 'published', 'dir@t.test') $q$, 'ok');
select pg_temp.t('148 a library Story needs its version', $q$ insert into public.platform_tests (account_id, kind, title, source, size, mime, created_by)
  values (pg_temp.g('sn3')::uuid, 'snap_story', 'x', 'library', 1000, 'video/mp4', 'dir@t.test') $q$, 'ERR new row for relation "platform_tests" violates check constraint "platform_tests_check"');
select pg_temp.t('149 a media id as the container fits', $q$ insert into public.platform_tests (account_id, kind, title, source, size, mime, container_id, created_by)
  values (pg_temp.g('sn3')::uuid, 'snap_story', 'x', 'device', 1000, 'video/mp4', '0c9a3b1e-5d2f-4a7b-8c6e-1f2a3b4c5d6e', 'dir@t.test') $q$, 'ok');
select pg_temp.t('150 a Snap row has no link, no Page text', $q$ insert into public.platform_tests (account_id, kind, title, source, size, mime, link, created_by)
  values (pg_temp.g('sn3')::uuid, 'snap_story', 'x', 'device', 1000, 'video/mp4', 'https://example.com', 'dir@t.test') $q$, 'ERR new row for relation "platform_tests" violates check constraint "platform_tests_link_kind"');
select pg_temp.c('151 one rule says a published row needs an id, not two', (select count(*)::text from pg_constraint where conrelid = 'public.platform_tests'::regclass and contype = 'c'
  and pg_get_constraintdef(oid) ilike '%state <> ''published''%video_id IS NOT NULL%'), '1');
select pg_temp.c('152 a page cannot read the hash, the copy or the address', (select (has_column_privilege('authenticated','public.platform_tests','link_hash','select')
  or has_column_privilege('authenticated','public.platform_tests','temp_ref','select') or has_column_privilege('authenticated','public.platform_tests','upload_url','select'))::text), 'false');
select pg_temp.c('153 and no column holds a key, a secret or a token', (select count(*)::text from information_schema.columns
  where table_schema = 'public' and table_name = 'platform_tests' and column_name ~ '(key|secret|token|cipher|iv$|password)'), '0');

-- 11. The other platforms as they were --------------------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000a4');
select pg_temp.t('154 a YouTube test as before', $q$ insert into v select 'y1', public.platform_test_start(pg_temp.g('yt')::uuid, jsonb_build_object('privacy','unlisted','title','x','source','device','size',10,'mime','video/mp4')) $q$, 'ok');
select pg_temp.c('155 recorded as a video, needing its id', (select public.platform_test_done('k-sn-run-only', pg_temp.g('y1')::uuid, null, 'UCtestchannel', 'unlisted')), 'failed');
select pg_temp.t('156 another YouTube test', $q$ insert into v select 'y2', public.platform_test_start(pg_temp.g('yt')::uuid, jsonb_build_object('privacy','private','title','x','source','device','size',10,'mime','video/mp4','scheduled_for',(now() + interval '1 day')::text)) $q$, 'ok');
select pg_temp.c('157 recorded with its id', (select public.platform_test_done('k-sn-run-only', pg_temp.g('y2')::uuid, 'dQw4w9WgXcQ', 'UCtestchannel', 'private')), 'published');
select pg_temp.t('158 a YouTube test of 1 GiB and of any video type, as before', $q$ insert into v select 'y3', public.platform_test_start(pg_temp.g('yt')::uuid, jsonb_build_object('privacy','public','title','x','source','device','size',1073741824,'mime','video/webm')) $q$, 'ok');
select pg_temp.t('159 a YouTube video of no kind of the other platforms', $q$ select public.platform_test_start(pg_temp.g('yt')::uuid, jsonb_build_object('kind','snap_silent','title','x','source','device','size',10,'mime','video/mp4','scheduled_for',(now() + interval '14 days')::text)) $q$, 'ERR TEST_INVALID');
select pg_temp.t('160 a TikTok draft as before', $q$ insert into v select 't1', public.platform_test_start(pg_temp.g('tt')::uuid, jsonb_build_object('kind','tt_draft','title','x','source','device','size',99000000,'mime','video/quicktime')) $q$, 'ok');
select pg_temp.c('161 arrived with no post id', (select public.platform_test_done('k-sn-run-only', pg_temp.g('t1')::uuid, null, '-000TTopenidTEST', null)), 'published');
select pg_temp.t('162 a TikTok post for the account only', $q$ insert into v select 't2', public.platform_test_start(pg_temp.g('tt')::uuid, jsonb_build_object('kind','tt_post','privacy','private','title','x','source','device','size',5000000,'mime','video/mp4')) $q$, 'ok');
select pg_temp.c('163 a TikTok post may carry its id', (select (public.platform_test_done('k-sn-run-only', pg_temp.g('t2')::uuid, '7300000000000000123', '-000TTopenidTEST', null))), 'published');
select pg_temp.t('164 a TikTok draft', $q$ insert into v select 't3', public.platform_test_start(pg_temp.g('tt')::uuid, jsonb_build_object('kind','tt_draft','title','x','source','device','size',5000000,'mime','video/mp4')) $q$, 'ok');
select pg_temp.c('165 given an id is failed, as before', (select public.platform_test_done('k-sn-run-only', pg_temp.g('t3')::uuid, '7300000000000000124', '-000TTopenidTEST', null)), 'failed');
select pg_temp.t('166 TikTok takes a time of none', $q$ select public.platform_test_start(pg_temp.g('tt')::uuid, jsonb_build_object('kind','tt_post','privacy','private','title','x','source','device','size',10,'mime','video/mp4','scheduled_for',(now() + interval '1 day')::text)) $q$, 'ERR TEST_INVALID');
select pg_temp.who('00000000-0000-0000-0000-0000000000a2');
select pg_temp.t('167 the director''s direct TikTok post as before', $q$ insert into v select 'x1', public.platform_test_start(pg_temp.g('tt')::uuid, jsonb_build_object('kind','tt_post','privacy','private','title','x','source','device','size',10,'mime','video/mp4','purpose','direct')) $q$, 'ok');
reset role;
select pg_temp.c('168 the older kinds are all still allowed by the table', (select count(*)::text from public.platform_tests where kind in ('video','tt_draft','tt_post')), '7');

select n, k, v, expect from r where v is distinct from expect
union all select 0, 'TOTAL', count(*)::text, (count(*) filter (where v is not distinct from expect))::text || ' passed' from r
order by n;
rollback;

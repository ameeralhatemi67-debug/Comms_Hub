-- MVP_draft.md section 71 (migration 20261103120000_platform_tests.sql): «تجربة النشر» on a YouTube account. Who may
-- test, what a test may be, that no page reads the upload's address, that every server step needs the server key and the
-- right person, that only a video recorded on the account's own channel can be deleted, and the daily limit. Only
-- throwaway accounts (@t.test) are touched; the server key is replaced by a throwaway inside the transaction. One
-- transaction, rolled back at the end. Result: qa/platform-tests-rules.json.
begin;
create temp table r(n serial, k text, v text, expect text);
create temp table v(k text primary key, val text);
grant all on r, v to public; grant usage on sequence r_n_seq to public;
insert into public.accounts (email, display_name, role, pages, protected) values
 ('adm@t.test','Adm','admin','{}',true),('dir@t.test','Dir','director','{}',false),('asst@t.test','Asst','assistant','{}',false),
 ('pub@t.test','Pub','publisher','{}',false),('pub2@t.test','Pub2','publisher','{}',false),('wri@t.test','Wri','writer','{}',false);
insert into auth.users (id, email, email_confirmed_at) values
 ('00000000-0000-0000-0000-0000000000a1','adm@t.test',now()),('00000000-0000-0000-0000-0000000000a2','dir@t.test',now()),
 ('00000000-0000-0000-0000-0000000000a3','asst@t.test',now()),('00000000-0000-0000-0000-0000000000a4','pub@t.test',now()),
 ('00000000-0000-0000-0000-0000000000a5','pub2@t.test',now()),('00000000-0000-0000-0000-0000000000a6','wri@t.test',now());
insert into public.mail_server_key (id, key_hash) values (1, encode(sha256(convert_to('k-test-run-only', 'UTF8')), 'hex'))
  on conflict (id) do update set key_hash = excluded.key_hash;
with i as (insert into public.integrations (kind, type, label, state, created_by) values ('platform','youtube_channel','قناة التجربة','connected','dir@t.test') returning id),
     a as (insert into public.platform_accounts (platform, label, handle, publishers, added_by, conn_kind, conn_state, external_id, integration_id, authorized_until)
           select 'youtube', 'قناة التجربة', '@t_channel', array['pub@t.test'], 'dir@t.test', 'oauth', 'connected', 'UCtestchannel', i.id, now() + interval '90 days' from i returning id)
insert into v select 'yt', id::text from a;
with a as (insert into public.platform_accounts (platform, label, handle, publishers, added_by)
           values ('youtube', 'قناة محاكاة', '@t_sim', array['pub@t.test'], 'dir@t.test') returning id)
insert into v select 'sim', id::text from a;
create function pg_temp.who(id text) returns void language sql as $$ select set_config('request.jwt.claims', json_build_object('sub',id,'role','authenticated')::text, true) $$;
create function pg_temp.t(k text, sqltext text, e text) returns void language plpgsql as $$
begin
  begin execute sqltext; insert into r(k,v,expect) values (k,'ok',e);
  exception when others then insert into r(k,v,expect) values (k,'ERR '||sqlerrm,e); end;
end $$;
create function pg_temp.c(k text, val text, e text) returns void language sql as $$ insert into r(k,v,expect) values (k,val,e) $$;
create function pg_temp.g(k text) returns text language sql as $$ select val from v where k = $1 $$;
-- A test of `n` bytes from this device, or of a library file when `asset` is given.
create function pg_temp.p(n bigint default 1000, title text default 'تجربة', privacy text default 'private', mime text default 'video/mp4', source text default 'device') returns jsonb language sql as $$
  select jsonb_build_object('privacy', privacy, 'title', title, 'source', source, 'size', n, 'mime', mime) $$;
grant execute on function pg_temp.who(text), pg_temp.t(text,text,text), pg_temp.c(text,text,text), pg_temp.g(text), pg_temp.p(bigint,text,text,text,text) to public;
-- Address of an upload, as YouTube gives it.
insert into v values ('url', 'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&upload_id=TESTMARK-1');
set local role authenticated;

-- 1. Who may test ---------------------------------------------------------------------------------------------------
select pg_temp.who('00000000-0000-0000-0000-0000000000a2');
select pg_temp.c('01 the director may', public.platform_test_may(pg_temp.g('yt')::uuid)::text, 'true');
select pg_temp.c('02 not on an account that is not really connected', public.platform_test_may(pg_temp.g('sim')::uuid)::text, 'false');
select pg_temp.who('00000000-0000-0000-0000-0000000000a3');
select pg_temp.c('03 the assistant may', public.platform_test_may(pg_temp.g('yt')::uuid)::text, 'true');
select pg_temp.who('00000000-0000-0000-0000-0000000000a1');
select pg_temp.c('04 an administrator may', public.platform_test_may(pg_temp.g('yt')::uuid)::text, 'true');
select pg_temp.who('00000000-0000-0000-0000-0000000000a4');
select pg_temp.c('05 the account''s own publisher may', public.platform_test_may(pg_temp.g('yt')::uuid)::text, 'true');
select pg_temp.who('00000000-0000-0000-0000-0000000000a5');
select pg_temp.c('06 another publisher may not', public.platform_test_may(pg_temp.g('yt')::uuid)::text, 'false');
select pg_temp.t('07 nor start a test', $q$ select public.platform_test_start(pg_temp.g('yt')::uuid, pg_temp.p()) $q$, 'ERR FORBIDDEN');
select pg_temp.who('00000000-0000-0000-0000-0000000000a6');
select pg_temp.t('08 nor a writer', $q$ select public.platform_test_start(pg_temp.g('yt')::uuid, pg_temp.p()) $q$, 'ERR FORBIDDEN');

-- 2. What a test may be -----------------------------------------------------------------------------------------------
select pg_temp.who('00000000-0000-0000-0000-0000000000a4');
select pg_temp.t('09 unlisted is not offered', $q$ select public.platform_test_start(pg_temp.g('yt')::uuid, pg_temp.p(privacy => 'unlisted')) $q$, 'ERR TEST_INVALID');
select pg_temp.t('10 a title with < is refused, as YouTube refuses it', $q$ select public.platform_test_start(pg_temp.g('yt')::uuid, pg_temp.p(title => 'a<b')) $q$, 'ERR TEST_INVALID');
select pg_temp.t('11 an empty title', $q$ select public.platform_test_start(pg_temp.g('yt')::uuid, pg_temp.p(title => '   ')) $q$, 'ERR TEST_INVALID');
select pg_temp.t('12 a title over 100', $q$ select public.platform_test_start(pg_temp.g('yt')::uuid, pg_temp.p(title => repeat('ع', 101))) $q$, 'ERR TEST_INVALID');
select pg_temp.t('13 an empty file', $q$ select public.platform_test_start(pg_temp.g('yt')::uuid, pg_temp.p(0)) $q$, 'ERR TEST_INVALID');
select pg_temp.t('14 over a gigabyte', $q$ select public.platform_test_start(pg_temp.g('yt')::uuid, pg_temp.p(1073741825)) $q$, 'ERR TEST_INVALID');
select pg_temp.t('15 a picture is not a video', $q$ select public.platform_test_start(pg_temp.g('yt')::uuid, pg_temp.p(mime => 'image/png')) $q$, 'ERR TEST_INVALID');
select pg_temp.t('16 a library test names its file', $q$ select public.platform_test_start(pg_temp.g('yt')::uuid, pg_temp.p(source => 'library')) $q$, 'ERR TEST_INVALID');
select pg_temp.t('17 a device test names none', $q$ select public.platform_test_start(pg_temp.g('yt')::uuid, pg_temp.p() || '{"asset":"00000000-0000-0000-0000-000000000001","version":1}') $q$, 'ERR TEST_INVALID');
select pg_temp.t('18 a size that is not a number', $q$ select public.platform_test_start(pg_temp.g('yt')::uuid, pg_temp.p() || '{"size":"many"}') $q$, 'ERR TEST_INVALID');
select pg_temp.t('19 a simulated account cannot be tested', $q$ select public.platform_test_start(pg_temp.g('sim')::uuid, pg_temp.p()) $q$, 'ERR FORBIDDEN');
select pg_temp.t('20 the publisher starts a test', $q$ insert into v select 't1', public.platform_test_start(pg_temp.g('yt')::uuid, pg_temp.p(1000, ' تجربة أولى ')) $q$, 'ok');
reset role;
select pg_temp.c('21 recorded as uploading, by them, the title trimmed', (select state || ' ' || created_by || ' ' || title from public.platform_tests where id = pg_temp.g('t1')::uuid), 'uploading pub@t.test تجربة أولى');

-- 3. What a page may read and write -------------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000a4');
select pg_temp.c('22 the publisher sees the test', (select count(*)::text from public.platform_tests), '1');
select pg_temp.t('23 but never the upload address', $q$ select upload_url from public.platform_tests $q$, 'ERR permission denied for table platform_tests');
select pg_temp.t('24 nor writes the table', $q$ update public.platform_tests set state = 'deleted' $q$, 'ERR permission denied for table platform_tests');
select pg_temp.t('25 nor adds to it', $q$ insert into public.platform_tests (account_id, privacy, title, source, size, mime, created_by) values (pg_temp.g('yt')::uuid, 'public', 'x', 'device', 1, 'video/mp4', 'pub@t.test') $q$, 'ERR permission denied for table platform_tests');
select pg_temp.who('00000000-0000-0000-0000-0000000000a5');
select pg_temp.c('26 another publisher sees nothing', (select count(*)::text from public.platform_tests), '0');
select pg_temp.who('00000000-0000-0000-0000-0000000000a6');
select pg_temp.c('27 nor a writer', (select count(*)::text from public.platform_tests), '0');
select pg_temp.who('00000000-0000-0000-0000-0000000000a2');
select pg_temp.c('28 the director sees it', (select count(*)::text from public.platform_tests), '1');

-- 4. The server's steps need its key and the right person ---------------------------------------------------------------
select pg_temp.who('00000000-0000-0000-0000-0000000000a4');
select pg_temp.t('29 no key, no reading', $q$ select public.platform_test_get('wrong', pg_temp.g('t1')::uuid) $q$, 'ERR FORBIDDEN');
select pg_temp.t('30 no key, no address kept', $q$ select public.platform_test_session('wrong', pg_temp.g('t1')::uuid, pg_temp.g('url')) $q$, 'ERR FORBIDDEN');
select pg_temp.t('31 an address that is not YouTube''s upload is refused', $q$ select public.platform_test_session('k-test-run-only', pg_temp.g('t1')::uuid, 'https://evil.example/upload/youtube/v3/videos?x=1') $q$, 'ERR TEST_INVALID');
select pg_temp.who('00000000-0000-0000-0000-0000000000a2');
select pg_temp.t('32 the director cannot set another''s upload', $q$ select public.platform_test_session('k-test-run-only', pg_temp.g('t1')::uuid, pg_temp.g('url')) $q$, 'ERR FORBIDDEN');
select pg_temp.who('00000000-0000-0000-0000-0000000000a4');
select pg_temp.t('33 the server keeps the address for its starter', $q$ select public.platform_test_session('k-test-run-only', pg_temp.g('t1')::uuid, pg_temp.g('url')) $q$, 'ok');
select pg_temp.t('34 once', $q$ select public.platform_test_session('k-test-run-only', pg_temp.g('t1')::uuid, pg_temp.g('url')) $q$, 'ERR FORBIDDEN');
select pg_temp.c('35 the starter''s server reads it back', (select public.platform_test_get('k-test-run-only', pg_temp.g('t1')::uuid)->>'url'), pg_temp.g('url'));
select pg_temp.c('36 with what the upload needs', (select (x->>'external_id') || ' ' || (x->>'size') || ' ' || (x->>'mime') || ' ' || (x->>'mine') || ' ' || ((x->>'integration') is not null)::text from (select public.platform_test_get('k-test-run-only', pg_temp.g('t1')::uuid) x) q), 'UCtestchannel 1000 video/mp4 true true');
select pg_temp.who('00000000-0000-0000-0000-0000000000a2');
select pg_temp.c('37 nobody else''s server gets the address', (select coalesce(public.platform_test_get('k-test-run-only', pg_temp.g('t1')::uuid)->>'url', 'none')), 'none');
select pg_temp.who('00000000-0000-0000-0000-0000000000a6');
select pg_temp.t('38 a writer''s server gets nothing', $q$ select public.platform_test_get('k-test-run-only', pg_temp.g('t1')::uuid) $q$, 'ERR FORBIDDEN');
select pg_temp.who('00000000-0000-0000-0000-0000000000a2');
select pg_temp.t('39 nobody else records the result', $q$ select public.platform_test_done('k-test-run-only', pg_temp.g('t1')::uuid, 'abcdefghijk', 'UCtestchannel', 'private') $q$, 'ERR FORBIDDEN');

-- 5. A video on another channel is not this account's -------------------------------------------------------------------
select pg_temp.who('00000000-0000-0000-0000-0000000000a4');
select pg_temp.c('40 a video on another channel fails the test', (select public.platform_test_done('k-test-run-only', pg_temp.g('t1')::uuid, 'abcdefghijk', 'UCsomeoneelse', 'private')), 'failed');
reset role;
select pg_temp.c('41 with its reason, no id kept, the address dropped', (select state || ' ' || error || ' ' || coalesce(video_id, 'none') || ' ' || coalesce(upload_url, 'none') from public.platform_tests where id = pg_temp.g('t1')::uuid), 'failed CHANNEL_MISMATCH none none');

-- 6. A test that arrives, and is deleted --------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000a4');
select pg_temp.t('42 another test', $q$ insert into v select 't2', public.platform_test_start(pg_temp.g('yt')::uuid, pg_temp.p(2000, 'تجربة ثانية', 'public')) $q$, 'ok');
select pg_temp.t('43 its upload', $q$ select public.platform_test_session('k-test-run-only', pg_temp.g('t2')::uuid, pg_temp.g('url')) $q$, 'ok');
select pg_temp.t('44 a malformed id is refused as a mismatch', $q$ insert into v select 'bad', public.platform_test_done('k-test-run-only', pg_temp.g('t2')::uuid, 'not an id!', 'UCtestchannel', 'public') $q$, 'ok');
select pg_temp.c('44b', pg_temp.g('bad'), 'failed');
select pg_temp.t('45 a third', $q$ insert into v select 't3', public.platform_test_start(pg_temp.g('yt')::uuid, pg_temp.p(2000, 'تجربة ثالثة', 'public')) $q$, 'ok');
select pg_temp.t('46 its upload', $q$ select public.platform_test_session('k-test-run-only', pg_temp.g('t3')::uuid, pg_temp.g('url')) $q$, 'ok');
select pg_temp.c('47 it arrives on the channel', (select public.platform_test_done('k-test-run-only', pg_temp.g('t3')::uuid, 'dQw4w9WgXcQ', 'UCtestchannel', 'private')), 'published');
select pg_temp.c('48 with its id and the privacy YouTube gave', (select state || ' ' || video_id || ' ' || privacy || ' ' || shown_privacy from public.platform_tests where id = pg_temp.g('t3')::uuid), 'published dQw4w9WgXcQ public private');
select pg_temp.t('49 it cannot be recorded twice', $q$ select public.platform_test_done('k-test-run-only', pg_temp.g('t3')::uuid, 'dQw4w9WgXcQ', 'UCtestchannel', 'private') $q$, 'ERR FORBIDDEN');
select pg_temp.t('50 a published test is not failed afterwards', $q$ select public.platform_test_failed('k-test-run-only', pg_temp.g('t3')::uuid, 'CANCELLED') $q$, 'ERR FORBIDDEN');
select pg_temp.who('00000000-0000-0000-0000-0000000000a5');
select pg_temp.t('51 another publisher cannot record it deleted', $q$ select public.platform_test_deleted('k-test-run-only', pg_temp.g('t3')::uuid) $q$, 'ERR FORBIDDEN');
select pg_temp.who('00000000-0000-0000-0000-0000000000a2');
select pg_temp.t('52 nor without the key', $q$ select public.platform_test_deleted('wrong', pg_temp.g('t3')::uuid) $q$, 'ERR FORBIDDEN');
select pg_temp.c('53 the director''s server reads the id to delete', (select public.platform_test_get('k-test-run-only', pg_temp.g('t3')::uuid)->>'video'), 'dQw4w9WgXcQ');
select pg_temp.t('54 the director deletes a publisher''s test', $q$ select public.platform_test_deleted('k-test-run-only', pg_temp.g('t3')::uuid) $q$, 'ok');
select pg_temp.c('55 deleted, by whom', (select state || ' ' || deleted_by || ' ' || (deleted_at is not null)::text from public.platform_tests where id = pg_temp.g('t3')::uuid), 'deleted dir@t.test true');
select pg_temp.t('56 once', $q$ select public.platform_test_deleted('k-test-run-only', pg_temp.g('t3')::uuid) $q$, 'ERR FORBIDDEN');
select pg_temp.t('57 a failed test has nothing to delete', $q$ select public.platform_test_deleted('k-test-run-only', pg_temp.g('t1')::uuid) $q$, 'ERR FORBIDDEN');

-- 7. One upload at a time, and a cancel -------------------------------------------------------------------------------
select pg_temp.who('00000000-0000-0000-0000-0000000000a4');
select pg_temp.t('58 a test left open', $q$ insert into v select 't4', public.platform_test_start(pg_temp.g('yt')::uuid, pg_temp.p()) $q$, 'ok');
select pg_temp.t('59 a new one from the same person', $q$ insert into v select 't5', public.platform_test_start(pg_temp.g('yt')::uuid, pg_temp.p()) $q$, 'ok');
select pg_temp.c('60 closes the first', (select state || ' ' || error from public.platform_tests where id = pg_temp.g('t4')::uuid), 'failed ABANDONED');
select pg_temp.who('00000000-0000-0000-0000-0000000000a2');
select pg_temp.t('61 the director cannot cancel another''s upload', $q$ select public.platform_test_failed('k-test-run-only', pg_temp.g('t5')::uuid, 'CANCELLED') $q$, 'ERR FORBIDDEN');
select pg_temp.t('62 a director''s own test leaves the publisher''s open', $q$ insert into v select 't6', public.platform_test_start(pg_temp.g('yt')::uuid, pg_temp.p()) $q$, 'ok');
select pg_temp.c('63 still open', (select state from public.platform_tests where id = pg_temp.g('t5')::uuid), 'uploading');
select pg_temp.who('00000000-0000-0000-0000-0000000000a4');
select pg_temp.t('64 the publisher cancels it, with an unknown reason kept as a platform error', $q$ select public.platform_test_failed('k-test-run-only', pg_temp.g('t5')::uuid, 'not a code') $q$, 'ok');
select pg_temp.c('65 closed', (select state || ' ' || error from public.platform_tests where id = pg_temp.g('t5')::uuid), 'failed PLATFORM_ERROR');
reset role;
-- An upload of someone else, started two days ago, is closed by the next start, and its address is no longer given.
update public.platform_tests set created_at = now() - interval '2 days' where id = pg_temp.g('t6')::uuid;
update public.platform_tests set upload_url = pg_temp.g('url') where id = pg_temp.g('t6')::uuid;
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000a2');
select pg_temp.c('66 an upload older than a day gives no address', (select coalesce(public.platform_test_get('k-test-run-only', pg_temp.g('t6')::uuid)->>'url', 'none')), 'none');
select pg_temp.who('00000000-0000-0000-0000-0000000000a4');
select pg_temp.t('67 the next start', $q$ insert into v select 't7', public.platform_test_start(pg_temp.g('yt')::uuid, pg_temp.p()) $q$, 'ok');
reset role;
select pg_temp.c('68 closes it', (select state || ' ' || error || ' ' || coalesce(upload_url, 'none') from public.platform_tests where id = pg_temp.g('t6')::uuid), 'failed ABANDONED none');

-- 8. The account's state and the daily limit ----------------------------------------------------------------------------
reset role;
update public.platform_accounts set active = false where id = pg_temp.g('yt')::uuid;
set local role authenticated;
select pg_temp.t('69 a stopped account', $q$ select public.platform_test_start(pg_temp.g('yt')::uuid, pg_temp.p()) $q$, 'ERR ACCOUNT_OFF');
reset role;
update public.platform_accounts set active = true, conn_state = 'needs_reconnect' where id = pg_temp.g('yt')::uuid;
set local role authenticated;
select pg_temp.t('70 an account that needs reconnecting', $q$ select public.platform_test_start(pg_temp.g('yt')::uuid, pg_temp.p()) $q$, 'ERR NOT_CONNECTED');
reset role;
update public.platform_accounts set conn_state = 'connected' where id = pg_temp.g('yt')::uuid;
-- Counted today: t3 (deleted) and t7 (open). Eight more arrive, which makes ten; failed tests are not counted.
insert into public.platform_tests (account_id, privacy, title, source, size, mime, state, video_id, created_by)
  select pg_temp.g('yt')::uuid, 'private', 'سابقة ' || n, 'device', 10, 'video/mp4', 'published', 'vid' || lpad(n::text, 8, '0'), 'pub@t.test' from generate_series(1, 8) n;
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000a2');
select pg_temp.t('71 the eleventh test of the day is refused', $q$ select public.platform_test_start(pg_temp.g('yt')::uuid, pg_temp.p()) $q$, 'ERR TEST_LIMIT');
reset role;
update public.platform_tests set created_at = now() - interval '25 hours' where title = 'سابقة 1';
set local role authenticated;
select pg_temp.t('72 a day later there is room again', $q$ select public.platform_test_start(pg_temp.g('yt')::uuid, pg_temp.p()) $q$, 'ok');

-- 9. Nothing of the address anywhere else --------------------------------------------------------------------------------
reset role;
select pg_temp.c('73 the address appears in no notice, event or account', ((select count(*) from public.notifications where body like '%TESTMARK%')
  + (select count(*) from public.integration_events where data::text like '%TESTMARK%')
  + (select count(*) from public.platform_accounts where row_to_json(platform_accounts)::text like '%TESTMARK%'))::text, '0');
select pg_temp.c('74 and is dropped from every test that is not uploading', (select count(*)::text from public.platform_tests where state <> 'uploading' and upload_url is not null), '0');

select n, k, v, expect from r where v is distinct from expect
union all select 0, 'TOTAL', count(*)::text, (count(*) filter (where v is not distinct from expect))::text || ' passed' from r
order by n;
rollback;

-- MVP_draft.md section 73 (migration 20261103200000_platform_tests_facebook.sql): «تجربة النشر» on a Facebook Page. Who may
-- test, what each kind may be (the two text kinds carry no file, a photo is a JPEG of at most 4 MB, a Reel at most 100 MB),
-- the silent check's date, a Page post's long id and link, a post on another Page not recorded, and that YouTube's and
-- Instagram's tests are as they were. Only throwaway accounts (@t.test) are touched; the server key is replaced by a
-- throwaway inside the transaction. One transaction, rolled back at the end. Result: qa/platform-tests-facebook-rules.json.
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
insert into public.mail_server_key (id, key_hash) values (1, encode(sha256(convert_to('k-fb-run-only', 'UTF8')), 'hex'))
  on conflict (id) do update set key_hash = excluded.key_hash;
insert into public.platforms (key, label_ar, kind, sort, enabled) values ('facebook', 'فيسبوك', 'social', 7, true)
  on conflict (key) do update set enabled = true;
with i as (insert into public.integrations (kind, type, label, state, created_by) values ('platform','meta_page','الصفحة','connected','dir@t.test') returning id),
     a as (insert into public.platform_accounts (platform, label, handle, publishers, added_by, conn_kind, conn_state, external_id, integration_id, authorized_until)
           select 'facebook', 'الصفحة', 'صفحة القسم', array['pub@t.test'], 'dir@t.test', 'oauth', 'connected', '102345678901234', i.id, now() + interval '60 days' from i returning id)
insert into v select 'fb', id::text from a;
with i as (insert into public.integrations (kind, type, label, state, created_by) values ('platform','youtube_channel','القناة','connected','dir@t.test') returning id),
     a as (insert into public.platform_accounts (platform, label, handle, publishers, added_by, conn_kind, conn_state, external_id, integration_id, authorized_until)
           select 'youtube', 'القناة', '@t_channel', array['pub@t.test'], 'dir@t.test', 'oauth', 'connected', 'UCtestchannel', i.id, now() + interval '90 days' from i returning id)
insert into v select 'yt', id::text from a;
insert into public.platforms (key, label_ar, kind, sort, enabled) values ('instagram', 'إنستغرام', 'social', 1, true) on conflict (key) do nothing;
with i as (insert into public.integrations (kind, type, label, state, created_by) values ('platform','meta_instagram','الحساب','connected','dir@t.test') returning id),
     a as (insert into public.platform_accounts (platform, label, handle, publishers, added_by, conn_kind, conn_state, external_id, integration_id, authorized_until)
           select 'instagram', 'الحساب', '@t_account', array['pub@t.test'], 'dir@t.test', 'oauth', 'connected', '17841400000000001', i.id, now() + interval '60 days' from i returning id)
insert into v select 'ig', id::text from a;
insert into v values ('h1', encode(sha256('fb-token-one'::bytea), 'hex'));
create function pg_temp.who(id text) returns void language sql as $$ select set_config('request.jwt.claims', json_build_object('sub',id,'role','authenticated')::text, true) $$;
create function pg_temp.t(k text, sqltext text, e text) returns void language plpgsql as $$
begin
  begin execute sqltext; insert into r(k,v,expect) values (k,'ok',e);
  exception when others then insert into r(k,v,expect) values (k,'ERR '||sqlerrm,e); end;
end $$;
create function pg_temp.c(k text, val text, e text) returns void language sql as $$ insert into r(k,v,expect) values (k,val,e) $$;
create function pg_temp.g(k text) returns text language sql as $$ select val from v where k = $1 $$;
-- A Page test of one kind; the text kinds carry no file.
create function pg_temp.txt(kind text, extra jsonb default '{}') returns jsonb language sql as $$
  select jsonb_build_object('kind', kind, 'title', 'تجربة') || extra $$;
create function pg_temp.file(kind text, n bigint, mime text, source text default 'device') returns jsonb language sql as $$
  select jsonb_build_object('kind', kind, 'title', 'تجربة', 'source', source, 'size', n, 'mime', mime) $$;
create function pg_temp.silent(days int default 28) returns jsonb language sql as $$
  select jsonb_build_object('kind', 'fb_silent', 'title', 'فحص صامت', 'scheduled_for', (now() + make_interval(days => days))::text) $$;
grant execute on function pg_temp.who(text), pg_temp.t(text,text,text), pg_temp.c(text,text,text), pg_temp.g(text),
  pg_temp.txt(text,jsonb), pg_temp.file(text,bigint,text,text), pg_temp.silent(int) to public;
set local role authenticated;

-- 1. Who may test ------------------------------------------------------------------------------------------------------
select pg_temp.who('00000000-0000-0000-0000-0000000000a2');
select pg_temp.c('01 the director may test a Page', public.platform_test_may(pg_temp.g('fb')::uuid)::text, 'true');
select pg_temp.who('00000000-0000-0000-0000-0000000000a4');
select pg_temp.c('02 its own publisher may', public.platform_test_may(pg_temp.g('fb')::uuid)::text, 'true');
select pg_temp.who('00000000-0000-0000-0000-0000000000a5');
select pg_temp.c('03 another publisher may not', public.platform_test_may(pg_temp.g('fb')::uuid)::text, 'false');
select pg_temp.who('00000000-0000-0000-0000-0000000000a6');
select pg_temp.t('04 nor a writer start one', $q$ select public.platform_test_start(pg_temp.g('fb')::uuid, pg_temp.silent()) $q$, 'ERR FORBIDDEN');

-- 2. What each kind may be ---------------------------------------------------------------------------------------------
select pg_temp.who('00000000-0000-0000-0000-0000000000a4');
select pg_temp.t('05 a silent check needs its date', $q$ select public.platform_test_start(pg_temp.g('fb')::uuid, pg_temp.txt('fb_silent')) $q$, 'ERR TEST_INVALID');
select pg_temp.t('06 at least ten minutes ahead', $q$ select public.platform_test_start(pg_temp.g('fb')::uuid, pg_temp.txt('fb_silent', jsonb_build_object('scheduled_for', (now() + interval '5 minutes')::text))) $q$, 'ERR TEST_INVALID');
select pg_temp.t('07 and at most thirty days', $q$ select public.platform_test_start(pg_temp.g('fb')::uuid, pg_temp.silent(31)) $q$, 'ERR TEST_INVALID');
select pg_temp.t('08 a text post carries no file', $q$ select public.platform_test_start(pg_temp.g('fb')::uuid, pg_temp.txt('fb_text', '{"size":10,"mime":"image/jpeg","source":"device"}')) $q$, 'ERR TEST_INVALID');
select pg_temp.t('09 a link is https', $q$ select public.platform_test_start(pg_temp.g('fb')::uuid, pg_temp.txt('fb_text', '{"link":"http://example.com"}')) $q$, 'ERR TEST_INVALID');
select pg_temp.t('10 and belongs to a text post', $q$ select public.platform_test_start(pg_temp.g('fb')::uuid, pg_temp.file('fb_photo', 1000, 'image/jpeg') || '{"link":"https://example.com"}') $q$, 'ERR TEST_INVALID');
select pg_temp.t('11 a photo is JPEG', $q$ select public.platform_test_start(pg_temp.g('fb')::uuid, pg_temp.file('fb_photo', 1000, 'image/png')) $q$, 'ERR TEST_INVALID');
select pg_temp.t('12 at most 4 MB', $q$ select public.platform_test_start(pg_temp.g('fb')::uuid, pg_temp.file('fb_photo', 4194305, 'image/jpeg')) $q$, 'ERR TEST_INVALID');
select pg_temp.t('13 a Reel is MP4 or MOV', $q$ select public.platform_test_start(pg_temp.g('fb')::uuid, pg_temp.file('fb_reel', 1000, 'video/webm')) $q$, 'ERR TEST_INVALID');
select pg_temp.t('14 at most 100 MB', $q$ select public.platform_test_start(pg_temp.g('fb')::uuid, pg_temp.file('fb_reel', 104857601, 'video/mp4')) $q$, 'ERR TEST_INVALID');
select pg_temp.t('15 a Page takes no Instagram kind', $q$ select public.platform_test_start(pg_temp.g('fb')::uuid, pg_temp.file('reel', 1000, 'video/mp4')) $q$, 'ERR TEST_INVALID');
select pg_temp.t('16 nor a privacy', $q$ select public.platform_test_start(pg_temp.g('fb')::uuid, pg_temp.txt('fb_text', '{"privacy":"private"}')) $q$, 'ERR TEST_INVALID');
select pg_temp.t('17 Instagram takes no Page kind', $q$ select public.platform_test_start(pg_temp.g('ig')::uuid, pg_temp.txt('fb_text')) $q$, 'ERR TEST_INVALID');
select pg_temp.t('18 a text post with its link', $q$ insert into v select 't1', public.platform_test_start(pg_temp.g('fb')::uuid, pg_temp.txt('fb_text', '{"link":"https://example.com/a?b=1"}')) $q$, 'ok');
reset role;
select pg_temp.c('19 recorded with no file and its link', (select kind || ' ' || coalesce(source, 'none') || ' ' || coalesce(size::text, 'none') || ' ' || coalesce(mime, 'none') || ' ' || link
  from public.platform_tests where id = pg_temp.g('t1')::uuid), 'fb_text none none none https://example.com/a?b=1');
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000a4');

-- 3. A Page post's long id, its link, and the Page it is on ------------------------------------------------------------
select pg_temp.c('20 a post on another Page is not recorded', (select public.platform_test_done('k-fb-run-only', pg_temp.g('t1')::uuid, '999999999999999_111111111111111', '999999999999999', null, null)), 'failed');
select pg_temp.t('21 another text post', $q$ insert into v select 't2', public.platform_test_start(pg_temp.g('fb')::uuid, pg_temp.txt('fb_text')) $q$, 'ok');
select pg_temp.c('22 published on the Page, with its long id', (select public.platform_test_done('k-fb-run-only', pg_temp.g('t2')::uuid, '102345678901234_987654321098765', '102345678901234', null, 'https://www.facebook.com/102345678901234/posts/987654321098765')), 'published');
reset role;
select pg_temp.c('23 the id and the Facebook link kept', (select video_id || ' ' || post_url from public.platform_tests where id = pg_temp.g('t2')::uuid),
  '102345678901234_987654321098765 https://www.facebook.com/102345678901234/posts/987654321098765');
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000a2');
select pg_temp.t('24 the director deletes it', $q$ select public.platform_test_deleted('k-fb-run-only', pg_temp.g('t2')::uuid) $q$, 'ok');

-- 4. The silent check ----------------------------------------------------------------------------------------------------
select pg_temp.who('00000000-0000-0000-0000-0000000000a4');
select pg_temp.t('25 a silent check four weeks ahead', $q$ insert into v select 's1', public.platform_test_start(pg_temp.g('fb')::uuid, pg_temp.silent()) $q$, 'ok');
select pg_temp.c('26 the publisher sees its date', (select (scheduled_for > now() + interval '27 days')::text from public.platform_tests where id = pg_temp.g('s1')::uuid), 'true');
select pg_temp.c('27 created and read back', (select public.platform_test_done('k-fb-run-only', pg_temp.g('s1')::uuid, '102345678901234_111222333444555', '102345678901234', null, null)), 'published');
select pg_temp.t('28 then deleted by its own server', $q$ select public.platform_test_deleted('k-fb-run-only', pg_temp.g('s1')::uuid) $q$, 'ok');
reset role;
select pg_temp.c('29 a silent check ends deleted', (select kind || ' ' || state from public.platform_tests where id = pg_temp.g('s1')::uuid), 'fb_silent deleted');

-- 5. A photo and a Reel ----------------------------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000a4');
select pg_temp.t('30 a photo, from the device only', $q$ select public.platform_test_start(pg_temp.g('fb')::uuid, pg_temp.file('fb_photo', 1000, 'image/jpeg', 'library') || '{"asset":"00000000-0000-0000-0000-000000000001","version":1}') $q$, 'ERR TEST_INVALID');
select pg_temp.t('31 a photo of 4 MB', $q$ insert into v select 'p1', public.platform_test_start(pg_temp.g('fb')::uuid, pg_temp.file('fb_photo', 4194304, 'image/jpeg')) $q$, 'ok');
select pg_temp.t('32 an address set on the photo', $q$ select public.platform_test_link('k-fb-run-only', pg_temp.g('p1')::uuid, pg_temp.g('h1'), now() + interval '30 minutes') $q$, 'ok');
select pg_temp.t('33 a Reel from the device', $q$ insert into v select 'r1', public.platform_test_start(pg_temp.g('fb')::uuid, pg_temp.file('fb_reel', 5000000, 'video/mp4')) $q$, 'ok');
reset role;
select pg_temp.c('34 starting the Reel closed the photo and ended its address', (select state || ' ' || error || ' ' || coalesce(link_hash, 'none') from public.platform_tests where id = pg_temp.g('p1')::uuid), 'failed ABANDONED none');
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000a4');
select pg_temp.t('35 its temporary copy', $q$ select public.platform_test_temp('k-fb-run-only', pg_temp.g('r1')::uuid, 'drivefileFBTESTMARK1') $q$, 'ok');
select pg_temp.t('36 its address', $q$ select public.platform_test_link('k-fb-run-only', pg_temp.g('r1')::uuid, pg_temp.g('h1'), now() + interval '30 minutes') $q$, 'ok');
select pg_temp.t('37 its video', $q$ select public.platform_test_container('k-fb-run-only', pg_temp.g('r1')::uuid, '1234567890123456') $q$, 'ok');
reset role;
set local role anon;
select pg_temp.c('38 Meta finds the file without a session', (select (x->>'ref') || ' ' || (x->>'mime') from (select public.platform_test_fetch('k-fb-run-only', pg_temp.g('h1')) x) q), 'drivefileFBTESTMARK1 video/mp4');
reset role;
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000a4');
select pg_temp.c('39 the Reel is published on the Page', (select public.platform_test_done('k-fb-run-only', pg_temp.g('r1')::uuid, '1234567890123456', '102345678901234', null, 'https://www.facebook.com/reel/1234567890123456')), 'published');
reset role;
select pg_temp.c('40 with its link, the address ended', (select post_url || ' ' || coalesce(link_hash, 'none') from public.platform_tests where id = pg_temp.g('r1')::uuid), 'https://www.facebook.com/reel/1234567890123456 none');
select pg_temp.c('41 a link that is neither Instagram''s nor Facebook''s is not kept', (select count(*)::text from public.platform_tests where post_url is not null and post_url not like 'https://www.facebook.com/%' and post_url not like 'https://www.instagram.com/%'), '0');

-- 6. YouTube and Instagram as they were -----------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000a4');
select pg_temp.t('42 a YouTube test as before', $q$ insert into v select 'y1', public.platform_test_start(pg_temp.g('yt')::uuid, jsonb_build_object('privacy','private','title','x','source','device','size',10,'mime','video/mp4')) $q$, 'ok');
select pg_temp.c('43 recorded as a video', (select public.platform_test_done('k-fb-run-only', pg_temp.g('y1')::uuid, 'dQw4w9WgXcQ', 'UCtestchannel', 'private')), 'published');
select pg_temp.t('44 an Instagram Story as before', $q$ insert into v select 'i1', public.platform_test_start(pg_temp.g('ig')::uuid, jsonb_build_object('kind','story_image','title','x','source','device','size',1000,'mime','image/jpeg')) $q$, 'ok');
select pg_temp.c('45 recorded with its link', (select public.platform_test_done('k-fb-run-only', pg_temp.g('i1')::uuid, '17920000000000001', '17841400000000001', null, 'https://www.instagram.com/stories/x/1/')), 'published');
select pg_temp.t('46 a YouTube test still needs a file', $q$ select public.platform_test_start(pg_temp.g('yt')::uuid, jsonb_build_object('privacy','private','title','x')) $q$, 'ERR TEST_INVALID');
reset role;
select pg_temp.c('47 a page cannot read the hash, the copy or the address', (select (has_column_privilege('authenticated','public.platform_tests','link_hash','select')
  or has_column_privilege('authenticated','public.platform_tests','temp_ref','select') or has_column_privilege('authenticated','public.platform_tests','upload_url','select'))::text), 'false');
select pg_temp.c('48 but reads the link and the date', (select (has_column_privilege('authenticated','public.platform_tests','link','select')
  and has_column_privilege('authenticated','public.platform_tests','scheduled_for','select'))::text), 'true');

select n, k, v, expect from r where v is distinct from expect
union all select 0, 'TOTAL', count(*)::text, (count(*) filter (where v is not distinct from expect))::text || ' passed' from r
order by n;
rollback;

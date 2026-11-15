-- MVP_draft.md section 79 (migration 20261115120000_platform_tests_tiktok.sql): «تجربة النشر» and «نشر مباشر» on a TikTok account.
-- Who may test, what each kind may be (a draft has no privacy, a post one of TikTok's four, MP4 or MOV of at most 100 MB, no
-- time), TikTok's upload names kept as the container, a draft or private post recorded with no post id, an id read whole, a
-- post on another account not recorded, a direct post logged and told, and that the other platforms are as they were. Only
-- throwaway accounts (@t.test) are touched; the server key is replaced by a throwaway inside the transaction. One transaction,
-- rolled back at the end. Result: qa/platform-tests-tiktok-rules.json.
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
insert into public.mail_server_key (id, key_hash) values (1, encode(sha256(convert_to('k-tt-run-only', 'UTF8')), 'hex'))
  on conflict (id) do update set key_hash = excluded.key_hash;
insert into public.platforms (key, label_ar, kind, sort, enabled) values ('tiktok', 'تيك توك', 'social', 3, true)
  on conflict (key) do update set enabled = true;
with i as (insert into public.integrations (kind, type, label, state, created_by) values ('platform','tiktok_user','الحساب','connected','dir@t.test') returning id),
     a as (insert into public.platform_accounts (platform, label, handle, publishers, added_by, conn_kind, conn_state, external_id, integration_id, authorized_until)
           select 'tiktok', 'حساب TikTok', 'tt:-000openid', array['pub@t.test'], 'dir@t.test', 'oauth', 'connected', '-000TTopenidTEST', i.id, now() + interval '365 days' from i returning id)
insert into v select 'tt', id::text from a;
with i as (insert into public.integrations (kind, type, label, state, created_by) values ('platform','youtube_channel','القناة','connected','dir@t.test') returning id),
     a as (insert into public.platform_accounts (platform, label, handle, publishers, added_by, conn_kind, conn_state, external_id, integration_id, authorized_until)
           select 'youtube', 'القناة', '@t_channel', array['pub@t.test'], 'dir@t.test', 'oauth', 'connected', 'UCtestchannel', i.id, now() + interval '90 days' from i returning id)
insert into v select 'yt', id::text from a;
insert into v values ('h1', encode(sha256('tt-token-one'::bytea), 'hex'));
create function pg_temp.who(id text) returns void language sql as $$ select set_config('request.jwt.claims', json_build_object('sub',id,'role','authenticated')::text, true) $$;
create function pg_temp.t(k text, sqltext text, e text) returns void language plpgsql as $$
begin
  begin execute sqltext; insert into r(k,v,expect) values (k,'ok',e);
  exception when others then insert into r(k,v,expect) values (k,'ERR '||sqlerrm,e); end;
end $$;
create function pg_temp.c(k text, val text, e text) returns void language sql as $$ insert into r(k,v,expect) values (k,val,e) $$;
create function pg_temp.g(k text) returns text language sql as $$ select val from v where k = $1 $$;
create function pg_temp.tt(kind text, extra jsonb default '{}', n bigint default 5000000, mime text default 'video/mp4') returns jsonb language sql as $$
  select jsonb_build_object('kind', kind, 'title', 'تجربة', 'source', 'device', 'size', n, 'mime', mime) || extra $$;
grant execute on function pg_temp.who(text), pg_temp.t(text,text,text), pg_temp.c(text,text,text), pg_temp.g(text),
  pg_temp.tt(text,jsonb,bigint,text) to public;
set local role authenticated;

-- 1. Who may test ------------------------------------------------------------------------------------------------------
select pg_temp.who('00000000-0000-0000-0000-0000000000a2');
select pg_temp.c('01 the director may test a TikTok account', public.platform_test_may(pg_temp.g('tt')::uuid)::text, 'true');
select pg_temp.who('00000000-0000-0000-0000-0000000000a4');
select pg_temp.c('02 its own publisher may', public.platform_test_may(pg_temp.g('tt')::uuid)::text, 'true');
select pg_temp.who('00000000-0000-0000-0000-0000000000a5');
select pg_temp.c('03 another publisher may not', public.platform_test_may(pg_temp.g('tt')::uuid)::text, 'false');
select pg_temp.who('00000000-0000-0000-0000-0000000000a6');
select pg_temp.t('04 nor a writer start one', $q$ select public.platform_test_start(pg_temp.g('tt')::uuid, pg_temp.tt('tt_draft')) $q$, 'ERR FORBIDDEN');

-- 2. What each kind may be ---------------------------------------------------------------------------------------------
select pg_temp.who('00000000-0000-0000-0000-0000000000a4');
select pg_temp.t('05 a draft has no privacy', $q$ select public.platform_test_start(pg_temp.g('tt')::uuid, pg_temp.tt('tt_draft', '{"privacy":"private"}')) $q$, 'ERR TEST_INVALID');
select pg_temp.t('06 a post needs one', $q$ select public.platform_test_start(pg_temp.g('tt')::uuid, pg_temp.tt('tt_post')) $q$, 'ERR TEST_INVALID');
select pg_temp.t('07 of TikTok''s four only', $q$ select public.platform_test_start(pg_temp.g('tt')::uuid, pg_temp.tt('tt_post', '{"privacy":"unlisted"}')) $q$, 'ERR TEST_INVALID');
select pg_temp.t('08 MP4 or MOV', $q$ select public.platform_test_start(pg_temp.g('tt')::uuid, pg_temp.tt('tt_draft', '{}', 1000, 'video/webm')) $q$, 'ERR TEST_INVALID');
select pg_temp.t('09 at most 100 MB', $q$ select public.platform_test_start(pg_temp.g('tt')::uuid, pg_temp.tt('tt_draft', '{}', 104857601)) $q$, 'ERR TEST_INVALID');
select pg_temp.t('10 no time: TikTok cannot schedule', $q$ select public.platform_test_start(pg_temp.g('tt')::uuid, pg_temp.tt('tt_post', jsonb_build_object('privacy','private','scheduled_for',(now() + interval '1 day')::text))) $q$, 'ERR TEST_INVALID');
select pg_temp.t('11 TikTok takes no other platform''s kind', $q$ select public.platform_test_start(pg_temp.g('tt')::uuid, pg_temp.tt('reel')) $q$, 'ERR TEST_INVALID');
select pg_temp.t('12 and YouTube takes no TikTok kind', $q$ select public.platform_test_start(pg_temp.g('yt')::uuid, pg_temp.tt('tt_draft')) $q$, 'ERR TEST_INVALID');
select pg_temp.t('13 nor a TikTok privacy', $q$ select public.platform_test_start(pg_temp.g('yt')::uuid, jsonb_build_object('privacy','friends','title','x','source','device','size',10,'mime','video/mp4')) $q$, 'ERR TEST_INVALID');
select pg_temp.t('14 a publisher makes no direct post', $q$ select public.platform_test_start(pg_temp.g('tt')::uuid, pg_temp.tt('tt_draft', '{"purpose":"direct"}')) $q$, 'ERR FORBIDDEN');

-- 3. A draft: the temporary copy, the address, TikTok's upload name, arrived with no post id -----------------------------
select pg_temp.t('16 a draft from the device', $q$ insert into v select 'd1', public.platform_test_start(pg_temp.g('tt')::uuid, pg_temp.tt('tt_draft')) $q$, 'ok');
select pg_temp.t('18 its temporary copy', $q$ select public.platform_test_temp('k-tt-run-only', pg_temp.g('d1')::uuid, 'drivefileTTTESTMARK1') $q$, 'ok');
select pg_temp.t('19 its address', $q$ select public.platform_test_link('k-tt-run-only', pg_temp.g('d1')::uuid, pg_temp.g('h1'), now() + interval '30 minutes') $q$, 'ok');
select pg_temp.t('20 TikTok''s name for the upload, with its dots and tilde', $q$ select public.platform_test_container('k-tt-run-only', pg_temp.g('d1')::uuid, 'v_inbox_url~v2.7300000000000000001') $q$, 'ok');
reset role;
set local role anon;
select pg_temp.c('21 TikTok finds the file without a session', (select (x->>'ref') || ' ' || (x->>'mime') from (select public.platform_test_fetch('k-tt-run-only', pg_temp.g('h1')) x) q), 'drivefileTTTESTMARK1 video/mp4');
reset role;
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000a4');
select pg_temp.c('22 the server sees the upload name and no privacy', (select (x->>'container') || ' ' || coalesce(x->>'privacy', 'none') from (select public.platform_test_get('k-tt-run-only', pg_temp.g('d1')::uuid) x) q), 'v_inbox_url~v2.7300000000000000001 none');
select pg_temp.c('23 a draft with a post id is not a draft', (select public.platform_test_done('k-tt-run-only', pg_temp.g('d1')::uuid, '7300000000000000123', '-000TTopenidTEST', null)), 'failed');
select pg_temp.t('24 another draft', $q$ insert into v select 'd2', public.platform_test_start(pg_temp.g('tt')::uuid, pg_temp.tt('tt_draft')) $q$, 'ok');
select pg_temp.c('25 in the inbox: arrived, no post id', (select public.platform_test_done('k-tt-run-only', pg_temp.g('d2')::uuid, null, '-000TTopenidTEST', null)), 'published');
reset role;
select pg_temp.c('26 recorded with no id, the address ended', (select state || ' ' || coalesce(video_id, 'none') || ' ' || coalesce(link_hash, 'none') from public.platform_tests where id = pg_temp.g('d2')::uuid), 'published none none');

-- 4. A post: the privacy kept for the server, an id read whole, another account refused -------------------------------------
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000a4');
select pg_temp.t('27 a post only I see', $q$ insert into v select 'p1', public.platform_test_start(pg_temp.g('tt')::uuid, pg_temp.tt('tt_post', '{"privacy":"private"}')) $q$, 'ok');
select pg_temp.c('28 the server reads its privacy', (select x->>'privacy' from (select public.platform_test_get('k-tt-run-only', pg_temp.g('p1')::uuid) x) q), 'private');
select pg_temp.c('29 a private post has no public id', (select public.platform_test_done('k-tt-run-only', pg_temp.g('p1')::uuid, null, '-000TTopenidTEST', null)), 'published');
select pg_temp.t('30 a post for the followers', $q$ insert into v select 'p2', public.platform_test_start(pg_temp.g('tt')::uuid, pg_temp.tt('tt_post', '{"privacy":"followers"}')) $q$, 'ok');
select pg_temp.c('31 on another account it is not recorded', (select public.platform_test_done('k-tt-run-only', pg_temp.g('p2')::uuid, '7300000000000000124', '-000SOMEONEELSE', null)), 'failed');
select pg_temp.t('32 a post for everyone', $q$ insert into v select 'p3', public.platform_test_start(pg_temp.g('tt')::uuid, pg_temp.tt('tt_post', '{"privacy":"public"}')) $q$, 'ok');
select pg_temp.c('33 published with its 19-digit id', (select public.platform_test_done('k-tt-run-only', pg_temp.g('p3')::uuid, '7300000000000000125', '-000TTopenidTEST', null, 'https://www.tiktok.com/@x/video/7300000000000000125')), 'published');
reset role;
select pg_temp.c('34 the id whole and the TikTok link kept', (select video_id || ' ' || privacy || ' ' || post_url from public.platform_tests where id = pg_temp.g('p3')::uuid),
  '7300000000000000125 public https://www.tiktok.com/@x/video/7300000000000000125');
select pg_temp.c('35 no row breaks the privacy rule', (select count(*)::text from public.platform_tests where (kind = 'tt_draft' and privacy is not null) or (kind = 'tt_post' and privacy not in ('private','public','friends','followers'))), '0');

-- 5. A direct post, by the director: logged and told --------------------------------------------------------------------------
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000a2');
select pg_temp.t('36 the director posts directly', $q$ insert into v select 'x1', public.platform_test_start(pg_temp.g('tt')::uuid, pg_temp.tt('tt_post', '{"privacy":"private","purpose":"direct"}')) $q$, 'ok');
select pg_temp.c('37 it arrives', (select public.platform_test_done('k-tt-run-only', pg_temp.g('x1')::uuid, null, '-000TTopenidTEST', null)), 'published');
reset role;
select pg_temp.c('38 «سجل النشاط» has it, said as TikTok says it', (select count(*)::text from public.activity_log where type = 'direct' and data->>'shown' = 'لي فقط' and data->>'platform' = 'تيك توك'), '1');
select pg_temp.c('39 its publisher and the assistant are told', (select string_agg(recipient, ',' order by recipient) from public.notifications where body like '%على تيك توك%' and tier = 'info'), 'ast@t.test,pub@t.test');
select pg_temp.c('40 a test is not logged', (select count(*)::text from public.activity_log where type = 'direct' and data->>'name' = 'تجربة' and data->>'shown' <> 'لي فقط'), '0');

-- 6. The other platforms as they were ------------------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000a4');
select pg_temp.t('42 a YouTube test as before', $q$ insert into v select 'y1', public.platform_test_start(pg_temp.g('yt')::uuid, jsonb_build_object('privacy','unlisted','title','x','source','device','size',10,'mime','video/mp4')) $q$, 'ok');
select pg_temp.c('43 recorded as a video, needing its id', (select public.platform_test_done('k-tt-run-only', pg_temp.g('y1')::uuid, null, 'UCtestchannel', 'unlisted')), 'failed');
select pg_temp.t('44 another YouTube test', $q$ insert into v select 'y2', public.platform_test_start(pg_temp.g('yt')::uuid, jsonb_build_object('privacy','private','title','x','source','device','size',10,'mime','video/mp4')) $q$, 'ok');
select pg_temp.c('45 recorded with its id', (select public.platform_test_done('k-tt-run-only', pg_temp.g('y2')::uuid, 'dQw4w9WgXcQ', 'UCtestchannel', 'private')), 'published');
select pg_temp.t('46 a Meta container id still fits', $q$ insert into v select 'y3', public.platform_test_start(pg_temp.g('tt')::uuid, pg_temp.tt('tt_draft')) $q$, 'ok');
select pg_temp.t('47 a numeric container as before', $q$ select public.platform_test_container('k-tt-run-only', pg_temp.g('y3')::uuid, '17900000000000001') $q$, 'ok');
select pg_temp.t('48 and nothing with a space or a slash', $q$ select public.platform_test_container('k-tt-run-only', pg_temp.g('y3')::uuid, 'v_inbox/../x') $q$, 'ERR TEST_INVALID');
reset role;
select pg_temp.c('49 a page cannot read the hash, the copy or the address', (select (has_column_privilege('authenticated','public.platform_tests','link_hash','select')
  or has_column_privilege('authenticated','public.platform_tests','temp_ref','select') or has_column_privilege('authenticated','public.platform_tests','upload_url','select'))::text), 'false');

select n, k, v, expect from r where v is distinct from expect
union all select 0, 'TOTAL', count(*)::text, (count(*) filter (where v is not distinct from expect))::text || ' passed' from r
order by n;
rollback;

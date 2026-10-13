-- The approval and publishing rules of «النموذج المرجعي للمركز» (pass 2, accepted
-- 2026-10-12, with the owner's decision of the same day that urgent work is approved by
-- the director and the assistant), one section per rule, checked before the review screen
-- and the publishing tab were built on them (Reference_Build_Plan.md, Step 4). Same method
-- as work_rules.sql: one transaction, throwaway accounts (@t.test), rolled back.
-- Run with the Supabase SQL editor or the MCP execute_sql tool.
begin;
create temp table s0 as select last_value, is_called from public.work_no_seq;
create temp table r(n serial, k text, v text, expect text);
create temp table v(k text primary key, val text);
grant all on r, v to authenticated; grant usage on sequence r_n_seq to authenticated;
insert into public.accounts (email, display_name, role, protected) values
 ('dir@t.test','Dir','director',false),('asst@t.test','Asst','assistant',false),('wri@t.test','Wri','writer',false),
 ('pub@t.test','Pub','publisher',false),('pub2@t.test','Pub2','publisher',false),('mem@t.test','Mem','member',false);
insert into auth.users (id, email, email_confirmed_at) values
 ('00000000-0000-0000-0000-00000000d001','dir@t.test',now()),('00000000-0000-0000-0000-00000000a001','asst@t.test',now()),
 ('00000000-0000-0000-0000-00000000b001','wri@t.test',now()),('00000000-0000-0000-0000-00000000c001','pub@t.test',now()),
 ('00000000-0000-0000-0000-00000000c002','pub2@t.test',now()),('00000000-0000-0000-0000-00000000e001','mem@t.test',now());
-- The writer views the unfiled folder, so a file there can go into her work.
insert into public.media_grants (folder_id, subject_type, subject, level) values ('00000000-0000-0000-0000-0000000000a1','role','writer',1);

-- Since 20261013120000_work_cycle_planning.sql the pages read parts through work_view_parts and
-- work_view_pending, and a stage's state is internal: this run reads it as the database.
create function pg_temp.st(id uuid) returns text language sql security definer set search_path = '' as $$ select public.work_stage_state(id) $$;
create function pg_temp.who(id text) returns void language sql as $$ select set_config('request.jwt.claims', json_build_object('sub',id,'role','authenticated')::text, true) $$;
create function pg_temp.t(k text, sqltext text, e text) returns void language plpgsql as $$
begin
  begin execute sqltext; insert into r(k,v,expect) values (k,'ok',e);
  exception when others then insert into r(k,v,expect) values (k,'ERR '||sqlerrm,e); end;
end $$;
create function pg_temp.c(k text, val text, e text) returns void language sql as $$ insert into r(k,v,expect) values (k,val,e) $$;
create function pg_temp.g(k text) returns text language sql as $$ select val from v where k = $1 $$;
create function pg_temp.pend(w text) returns text language sql as $$ select coalesce(string_agg(key, ',' order by key), '-') from public.work_view_pending(w) $$;
grant execute on function pg_temp.t(text,text,text), pg_temp.c(text,text,text), pg_temp.g(text), pg_temp.pend(text), pg_temp.st(uuid) to authenticated;
set local role authenticated;

-- Accounts the works publish on (the publisher «pub» publishes on both; «pub2» on neither).
select pg_temp.who('00000000-0000-0000-0000-00000000d001');
select pg_temp.t('00a Instagram', $q$ insert into v select 'ig', public.account_save(null, '{"platform":"instagram","label":"الرسمي","handle":"@ar.ig","publishers":["pub@t.test"],"mode":"auto"}')::text $q$, 'ok');
select pg_temp.t('00b X', $q$ insert into v select 'x', public.account_save(null, '{"platform":"x","label":"الرسمي","handle":"@ar_x","publishers":["pub@t.test"],"mode":"auto"}')::text $q$, 'ok');

-- Rule 1: approval per part; each platform copy is its own part ----------------------
select pg_temp.who('00000000-0000-0000-0000-00000000b001');
select pg_temp.t('01 writer creates post P', $q$ insert into v select 'P', public.work_create(jsonb_build_object('type','post','title','منشور القواعد',
  'due',public.work_today()+6,'assignee','wri@t.test','channels',jsonb_build_array(pg_temp.g('ig'),pg_temp.g('x')),'main','النص','start',true,
  'stages','[{"n":"كتابة النص"}]'::jsonb)) $q$, 'ok');
select pg_temp.t('01b a copy for X', $q$ select public.work_text_save(pg_temp.g('P'), 'x', 'نسخة X', null) $q$, 'ok');
select pg_temp.t('01c a copy for Instagram', $q$ select public.work_text_save(pg_temp.g('P'), 'instagram', 'نسخة إنستغرام', null) $q$, 'ok');
select pg_temp.t('01d writer submits with a proposed time', $q$ select public.work_submit(pg_temp.g('P'), null, array[pg_temp.g('ig')::uuid, pg_temp.g('x')::uuid], now() + interval '2 days') $q$, 'ok');
select pg_temp.c('01e every part waits, each copy apart', pg_temp.pend(pg_temp.g('P')), 'date,dest,text,v:instagram,v:x');
select pg_temp.who('00000000-0000-0000-0000-00000000d001');
select pg_temp.t('01f director approves the X copy alone', $q$ select public.work_decide(pg_temp.g('P'), 'approve', array['v:x'], null, false) $q$, 'ok');
select pg_temp.c('01g the rest still waits', pg_temp.pend(pg_temp.g('P')) || ' ' || (select status from public.works where id = pg_temp.g('P')), 'date,dest,text,v:instagram IN_REVIEW');
select pg_temp.t('01h director sends the Instagram copy back', $q$ select public.work_decide(pg_temp.g('P'), 'changes', array['v:instagram'], 'قصّر النسخة', false) $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-00000000b001');
select pg_temp.t('01i writer edits the Instagram copy', $q$ select public.work_text_save(pg_temp.g('P'), 'instagram', 'نسخة أقصر', null) $q$, 'ok');
select pg_temp.t('01j writer resubmits', $q$ select public.work_submit(pg_temp.g('P'), null, array[pg_temp.g('ig')::uuid, pg_temp.g('x')::uuid], now() + interval '2 days') $q$, 'ok');
select pg_temp.c('01k the approved X copy is not reviewed again', pg_temp.pend(pg_temp.g('P')), 'date,dest,text,v:instagram');

-- Rule 3 (owner decision): urgent work is approved by the director and the assistant ---
select pg_temp.t('03a the writer may not decide', $q$ select public.work_decide(pg_temp.g('P'), 'approve', array['text'], null, false) $q$, 'ERR FORBIDDEN_DECIDE');
select pg_temp.who('00000000-0000-0000-0000-00000000d001');
select pg_temp.t('03b director marks P urgent', $q$ select public.work_update(pg_temp.g('P'), '{"priority":"urgent"}') $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-00000000a001');
select pg_temp.c('03c nothing blocks the assistant on urgent work', coalesce(public.work_decide_block(pg_temp.g('P')), 'none'), 'none');
select pg_temp.t('03d the assistant approves the rest', $q$ select public.work_decide(pg_temp.g('P'), 'approve', array['text','v:instagram','dest','date'], null, false) $q$, 'ok');

-- Rule 6: approval never publishes; only the publisher of those accounts schedules ------
select pg_temp.c('06a ready, nothing published', (select status || ' ' || coalesce(pub_at::text, 'none') || ' ' || (results = '{}'::jsonb)::text from public.works where id = pg_temp.g('P')), 'APPROVED none true');
select pg_temp.who('00000000-0000-0000-0000-00000000d001');
select pg_temp.t('06b the director cannot schedule', $q$ select public.work_schedule(pg_temp.g('P'), now() + interval '2 days', 'auto') $q$, 'ERR FORBIDDEN');
select pg_temp.t('06c nor publish', $q$ select public.work_publish(pg_temp.g('P'), 'now') $q$, 'ERR FORBIDDEN');
select pg_temp.who('00000000-0000-0000-0000-00000000c002');
select pg_temp.t('06d a publisher not named on the accounts cannot schedule', $q$ select public.work_schedule(pg_temp.g('P'), now() + interval '2 days', 'auto') $q$, 'ERR FORBIDDEN');

-- Rule 5: an approved date binds; another time re-opens «موعد النشر» alone, then schedules
select pg_temp.who('00000000-0000-0000-0000-00000000c001');
select pg_temp.t('05a publisher picks another time', $q$ insert into v select 'mv', public.work_schedule(pg_temp.g('P'), now() + interval '3 days', 'auto')->>'result' $q$, 'ok');
select pg_temp.c('05b it became a request for the date alone', pg_temp.g('mv') || ' ' || (select status from public.works where id = pg_temp.g('P')) || ' ' || pg_temp.pend(pg_temp.g('P')), 'move IN_REVIEW date');
select pg_temp.who('00000000-0000-0000-0000-00000000d001');
select pg_temp.t('05c director approves the new time', $q$ select public.work_decide(pg_temp.g('P'), 'approve', array['date'], null, false) $q$, 'ok');
select pg_temp.c('05d scheduled by itself at the new time', (select status || ' ' || (sched_at = now() + interval '3 days')::text from public.works where id = pg_temp.g('P')), 'SCHEDULED true');

-- Rule 8: a retry re-sends the failed accounts only --------------------------------
select pg_temp.who('00000000-0000-0000-0000-00000000c001');
select pg_temp.t('08a publisher unschedules', $q$ select public.work_publish(pg_temp.g('P'), 'unschedule') $q$, 'ok');
reset role;
update public.platform_accounts set authorized_until = now() - interval '1 hour' where id = (select val from v where k = 'x')::uuid;
set local role authenticated;
select pg_temp.t('08b publish now with X expired', $q$ insert into v select 'p1', public.work_publish(pg_temp.g('P'), 'now') $q$, 'ok');
select pg_temp.c('08c partial: Instagram yes, X no', pg_temp.g('p1') || ' ' ||
  (select (results->pg_temp.g('ig')->>'ok') || ' ' || (results->pg_temp.g('x')->>'ok') from public.works where id = pg_temp.g('P')), 'PARTIAL true false');
reset role;
-- Mark the Instagram result so a re-send would show.
update public.works set results = jsonb_set(results, array[(select val from v where k = 'ig'), 'at'], '"marked"') where id = (select val from v where k = 'P');
set local role authenticated;
select pg_temp.t('08d publisher reconnects X', $q$ select public.account_reconnect(pg_temp.g('x')::uuid) $q$, 'ok');
select pg_temp.t('08e retry', $q$ insert into v select 'p2', public.work_publish(pg_temp.g('P'), 'retry') $q$, 'ok');
select pg_temp.c('08f published; Instagram was not sent again', pg_temp.g('p2') || ' ' ||
  (select results->pg_temp.g('ig')->>'at' from public.works where id = pg_temp.g('P')), 'PUBLISHED marked');
select pg_temp.t('08g nothing failed: no retry', $q$ select public.work_publish(pg_temp.g('P'), 'retry') $q$, 'ERR STATUS_DENIED');

-- Rule 2: press release, mail and announcement are approved as one package ------------
select pg_temp.who('00000000-0000-0000-0000-00000000d001');
select pg_temp.t('02a director creates press release W for the writer', $q$ insert into v select 'W', public.work_create(jsonb_build_object('type','press','title','بيان القواعد',
  'due',public.work_today()+5,'assignee','wri@t.test','main','نص البيان','start',true,'stages','[{"n":"كتابة البيان"}]'::jsonb)) $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-00000000b001');
select pg_temp.t('02b writer submits W', $q$ select public.work_submit(pg_temp.g('W'), null, null, null) $q$, 'ok');
select pg_temp.c('02c the shared mailbox is its channel', (select count(*)::text from public.works w join public.platform_accounts a on a.id = any (w.channels) where w.id = pg_temp.g('W') and a.platform = 'mail'), '1');
select pg_temp.who('00000000-0000-0000-0000-00000000d001');
select pg_temp.t('02d approving one part approves the package', $q$ select public.work_decide(pg_temp.g('W'), 'approve', array['text'], null, false) $q$, 'ok');
select pg_temp.c('02e ready, nothing pending', (select status from public.works where id = pg_temp.g('W')) || ' ' || pg_temp.pend(pg_temp.g('W')), 'APPROVED -');
select pg_temp.who('00000000-0000-0000-0000-00000000b001');
select pg_temp.t('02f writer edits the approved text', $q$ select public.work_text_save(pg_temp.g('W'), 'main', 'نص معدّل', null) $q$, 'ok');
select pg_temp.c('02g the whole package is back in review', (select status from public.works where id = pg_temp.g('W')) || ' ' || pg_temp.pend(pg_temp.g('W')), 'IN_REVIEW dest,text');

-- Rule 7: a rejection needs a reason and may close the work -------------------------
select pg_temp.who('00000000-0000-0000-0000-00000000d001');
select pg_temp.t('07a rejection without a reason', $q$ select public.work_decide(pg_temp.g('W'), 'reject', null, '  ', true) $q$, 'ERR NOTE_REQUIRED');
select pg_temp.t('07b rejection with a reason, closing it', $q$ select public.work_decide(pg_temp.g('W'), 'reject', null, 'لا حاجة للبيان', true) $q$, 'ok');
select pg_temp.c('07c rejected and closed with the reason', (select status || ' ' || (closed_at is not null)::text || ' ' || close_reason from public.works where id = pg_temp.g('W')), 'REJECTED true رُفض: لا حاجة للبيان');

-- Rule 4: nobody approves what they sent, an approval point they finished, or a file version they uploaded
select pg_temp.who('00000000-0000-0000-0000-00000000a001');
select pg_temp.t('04a assistant creates announcement S for herself', $q$ insert into v select 'S', public.work_create(jsonb_build_object('type','announce','title','إعلان القواعد',
  'due',public.work_today()+4,'assignee','asst@t.test','main','نص','start',true,'stages','[{"n":"كتابة النص"}]'::jsonb)) $q$, 'ok');
select pg_temp.t('04b assistant submits S', $q$ select public.work_submit(pg_temp.g('S'), null, array[pg_temp.g('ig')::uuid], null) $q$, 'ok');
select pg_temp.t('04c assistant cannot approve what she sent', $q$ select public.work_decide(pg_temp.g('S'), 'approve', null, null, false) $q$, 'ERR SELF_APPROVAL');
select pg_temp.t('04d nor send it back', $q$ select public.work_decide(pg_temp.g('S'), 'changes', null, 'ملاحظة', false) $q$, 'ERR SELF_APPROVAL');
select pg_temp.who('00000000-0000-0000-0000-00000000d001');
select pg_temp.t('04e director creates G with an approval point he works on', $q$ insert into v select 'G', public.work_create(jsonb_build_object('type','design','title','تصميم القواعد',
  'due',public.work_today()+6,'assignee','wri@t.test','start',true,'stages',jsonb_build_array(
    jsonb_build_object('n','الفكرة','who','dir@t.test','gate',true),jsonb_build_object('n','التصميم','who','wri@t.test','after','[0]'::jsonb)))) $q$, 'ok');
select pg_temp.t('04f director finishes the approval point', $q$ select public.work_stage_act((select id from public.work_stages where work_id = pg_temp.g('G') and pos = 0), 'finish') $q$, 'ok');
select pg_temp.t('04g he cannot approve it', $q$ select public.work_stage_act((select id from public.work_stages where work_id = pg_temp.g('G') and pos = 0), 'gate') $q$, 'ERR SELF_APPROVAL');
select pg_temp.who('00000000-0000-0000-0000-00000000a001');
select pg_temp.t('04h the assistant approves it', $q$ select public.work_stage_act((select id from public.work_stages where work_id = pg_temp.g('G') and pos = 0), 'gate') $q$, 'ok');
select pg_temp.c('04i what followed is ready', (select pg_temp.st(id) from public.work_stages where work_id = pg_temp.g('G') and pos = 1), 'ready');
select pg_temp.t('04j assistant uploads a video', $q$ with x as (insert into public.media_files (drive_file_id, name, mime_type, size_bytes, kind, folder_id)
  values ('t-ar-drive-1', 'فيديو القواعد.mp4', 'video/mp4', 1000, 'video', '00000000-0000-0000-0000-0000000000a1') returning id)
  insert into v select 'F', id::text from x $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-00000000b001');
select pg_temp.t('04k writer makes video V with her file', $q$ insert into v select 'V', public.work_create(jsonb_build_object('type','video','title','فيديو القواعد',
  'due',public.work_today()+6,'assignee','wri@t.test','channels',jsonb_build_array(pg_temp.g('ig')),'assets',jsonb_build_array(pg_temp.g('F')),
  'start',true,'stages','[{"n":"المونتاج"}]'::jsonb)) $q$, 'ok');
select pg_temp.t('04l writer submits V', $q$ select public.work_submit(pg_temp.g('V'), null, array[pg_temp.g('ig')::uuid], null) $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-00000000a001');
select pg_temp.t('04m from the review, the uploader cannot approve her file', $q$ select public.work_decide(pg_temp.g('V'), 'approve', array['a:' || pg_temp.g('F')], null, false) $q$, 'ERR SELF_APPROVAL');
select pg_temp.t('04n nor send it back', $q$ select public.work_decide(pg_temp.g('V'), 'changes', array['a:' || pg_temp.g('F')], 'قصّه', false) $q$, 'ERR SELF_APPROVAL');
select pg_temp.c('04o her refusals changed nothing', (select stage from public.media_files where id = pg_temp.g('F')::uuid) || ' ' || pg_temp.pend(pg_temp.g('V')), 'review a:' || pg_temp.g('F') || ',dest');
select pg_temp.t('04p she approves the accounts', $q$ select public.work_decide(pg_temp.g('V'), 'approve', array['dest'], null, false) $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-00000000d001');
select pg_temp.t('04q the director approves the file', $q$ select public.work_decide(pg_temp.g('V'), 'approve', array['a:' || pg_temp.g('F')], null, false) $q$, 'ok');
select pg_temp.c('04r one decision: the work is ready and the library has the file approved', (select status from public.works where id = pg_temp.g('V')) || ' ' ||
  (select stage || ' v' || approved_version from public.media_files where id = pg_temp.g('F')::uuid), 'APPROVED ready v1');
select pg_temp.who('00000000-0000-0000-0000-00000000b001');
select pg_temp.t('04s writer makes announcement A2 with her file as a package', $q$ insert into v select 'A2', public.work_create(jsonb_build_object('type','announce','title','إعلان بفيديو',
  'due',public.work_today()+6,'assignee','wri@t.test','channels',jsonb_build_array(pg_temp.g('ig')),'assets',jsonb_build_array(pg_temp.g('F')),
  'main','نص','start',true,'stages','[{"n":"كتابة النص"}]'::jsonb)) $q$, 'ok');
select pg_temp.t('04t writer submits A2', $q$ select public.work_submit(pg_temp.g('A2'), null, array[pg_temp.g('ig')::uuid], null) $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-00000000a001');
select pg_temp.t('04u the uploader cannot approve a package holding her file', $q$ select public.work_decide(pg_temp.g('A2'), 'approve', null, null, false) $q$, 'ERR SELF_APPROVAL');
select pg_temp.who('00000000-0000-0000-0000-00000000d001');
select pg_temp.t('04v the director approves it', $q$ select public.work_decide(pg_temp.g('A2'), 'approve', null, null, false) $q$, 'ok');

-- Notifications: each person reads and clears their own only -----------------------
select pg_temp.who('00000000-0000-0000-0000-00000000d001');
insert into v select 'dirN', count(*)::text from public.notifications where read_at is null;
select pg_temp.c('09a the director has unread notices', (pg_temp.g('dirN')::int > 0)::text, 'true');
select pg_temp.who('00000000-0000-0000-0000-00000000b001');
select pg_temp.c('09b the writer cannot see the director''s', (select count(*)::text from public.notifications where recipient = 'dir@t.test'), '0');
select pg_temp.t('09c the writer marks all of hers read', $q$ select public.notifications_read(null) $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-00000000d001');
select pg_temp.c('09d the director''s are still unread', (select count(*)::text from public.notifications where read_at is null), pg_temp.g('dirN'));
select pg_temp.t('09e the director marks one read', $q$ select public.notifications_read(array[(select id from public.notifications where read_at is null limit 1)]) $q$, 'ok');
select pg_temp.c('09f one fewer', (select count(*)::text from public.notifications where read_at is null), (pg_temp.g('dirN')::int - 1)::text);
select pg_temp.who('00000000-0000-0000-0000-00000000e001');
select pg_temp.c('09g a member sees the decision log only of works they can see', (select count(*)::text from public.work_decisions d join public.works w on w.id = d.work_id where w.restricted), '0');

reset role;
select setval('public.work_no_seq', last_value, is_called) from s0;
select * from (
  select n, k, v, expect from r where v is distinct from expect
  union all select 0, 'TOTAL', count(*)::text, (count(*) filter (where v = expect))::text || ' passed' from r) z order by n;
rollback;

-- Work cycle rules, checked inside one transaction that is rolled back at the end.
-- Run with the Supabase SQL editor or the MCP execute_sql tool. It creates throwaway
-- accounts (@t.test), acts as each of them, and lists what the database allowed.
-- The expected value of every row is in the "expect" column. Result of 2026-10-12: 135 of 135.
begin;
-- Sequences do not roll back: keep the work number where it was.
create temp table s0 as select last_value, is_called from public.work_no_seq;
create temp table r(n serial, k text, v text, expect text);
create temp table v(k text primary key, val text);
grant all on r, v to authenticated; grant usage on sequence r_n_seq to authenticated;
insert into public.accounts (email, display_name, role, protected) values
 ('dir@t.test','Dir','director',false),('asst@t.test','Asst','assistant',false),('wri@t.test','Wri','writer',false),
 ('des@t.test','Des','designer',false),('pro@t.test','Pro','producer',false),('pub@t.test','Pub','publisher',false),
 ('mem@t.test','Mem','member',false),('adm@t.test','Adm','admin',true);
insert into auth.users (id, email, email_confirmed_at) values
 ('00000000-0000-0000-0000-00000000d001','dir@t.test',now()),('00000000-0000-0000-0000-00000000a001','asst@t.test',now()),
 ('00000000-0000-0000-0000-00000000b001','wri@t.test',now()),('00000000-0000-0000-0000-00000000b002','des@t.test',now()),
 ('00000000-0000-0000-0000-00000000f001','pro@t.test',now()),('00000000-0000-0000-0000-00000000c001','pub@t.test',now()),
 ('00000000-0000-0000-0000-00000000e001','mem@t.test',now()),('00000000-0000-0000-0000-00000000aa01','adm@t.test',now());
-- A restricted folder for the access request, and view rights on the unfiled folder for the writer.
insert into public.media_folders (id, parent_id, name, restricted, created_by)
values ('00000000-0000-0000-0000-0000000000f9', null, 'مجلد مقيّد للاختبار', true, 'seed');
insert into public.media_grants (folder_id, subject_type, subject, level) values
 ('00000000-0000-0000-0000-0000000000a1','role','writer',1);

create function pg_temp.who(id text) returns void language sql as $$ select set_config('request.jwt.claims', json_build_object('sub',id,'role','authenticated')::text, true) $$;
create function pg_temp.t(k text, sqltext text, e text) returns void language plpgsql as $$
begin
  begin execute sqltext; insert into r(k,v,expect) values (k,'ok',e);
  exception when others then insert into r(k,v,expect) values (k,'ERR '||sqlerrm,e); end;
end $$;
create function pg_temp.c(k text, val text, e text) returns void language sql as $$ insert into r(k,v,expect) values (k,val,e) $$;
create function pg_temp.g(k text) returns text language sql as $$ select val from v where k = $1 $$;
grant execute on function pg_temp.t(text,text,text), pg_temp.c(text,text,text), pg_temp.g(text) to authenticated;

set local role authenticated;

-- Accounts ---------------------------------------------------------------
select pg_temp.who('00000000-0000-0000-0000-00000000d001');
select pg_temp.t('01 director adds Instagram', $q$ insert into v select 'ig', public.account_save(null, '{"platform":"instagram","label":"الرسمي","handle":"@t.ig","publishers":["pub@t.test"],"mode":"auto"}')::text $q$, 'ok');
select pg_temp.t('02 director adds X', $q$ insert into v select 'x', public.account_save(null, '{"platform":"x","label":"الرسمي","handle":"@t_x","publishers":["pub@t.test"],"mode":"auto"}')::text $q$, 'ok');
select pg_temp.t('03 director adds YouTube', $q$ insert into v select 'yt', public.account_save(null, '{"platform":"youtube","label":"الرسمي","handle":"@TYT","publishers":["pub@t.test"],"mode":"ask"}')::text $q$, 'ok');
select pg_temp.t('04 same handle twice', $q$ select public.account_save(null, '{"platform":"x","label":"آخر","handle":"@T_X","publishers":["pub@t.test"]}') $q$, 'ERR HANDLE_TAKEN');
select pg_temp.who('00000000-0000-0000-0000-00000000b001');
select pg_temp.t('05 writer cannot add an account', $q$ select public.account_save(null, '{"platform":"x","label":"ب","handle":"@w","publishers":["pub@t.test"]}') $q$, 'ERR FORBIDDEN');

-- Creating ---------------------------------------------------------------
select pg_temp.who('00000000-0000-0000-0000-00000000c001');
select pg_temp.t('06 publisher cannot create work', $q$ select public.work_create(jsonb_build_object('type','post','title','x','due',public.work_today()+5,'stages','[{"n":"أ"}]'::jsonb)) $q$, 'ERR CREATE_ROLE');
select pg_temp.who('00000000-0000-0000-0000-00000000b001');
select pg_temp.t('07 YouTube without a video is refused', $q$ select public.work_create(jsonb_build_object('type','post','title','x','due',public.work_today()+5,
  'assignee','wri@t.test','channels',jsonb_build_array(pg_temp.g('yt')),'stages','[{"n":"أ"}]'::jsonb)) $q$, 'ERR YOUTUBE_VIDEO_ONLY');
select pg_temp.t('08 writer cannot assign to the designer', $q$ select public.work_create(jsonb_build_object('type','post','title','x','due',public.work_today()+5,
  'assignee','des@t.test','channels',jsonb_build_array(pg_temp.g('ig')),'stages','[{"n":"أ"}]'::jsonb)) $q$, 'ERR ASSIGN_DENIED');
select pg_temp.t('09 a stage cannot wait for a later one', $q$ select public.work_create(jsonb_build_object('type','post','title','x','due',public.work_today()+5,
  'assignee','wri@t.test','channels',jsonb_build_array(pg_temp.g('ig')),'stages','[{"n":"أ","after":[1]},{"n":"ب"}]'::jsonb)) $q$, 'ERR PLAN_ORDER');
select pg_temp.t('10 writer creates post A', $q$ insert into v select 'A', public.work_create(jsonb_build_object('type','post','title','منشور الاختبار',
  'due',public.work_today()+5,'assignee','wri@t.test','channels',jsonb_build_array(pg_temp.g('ig')),'main','النص الأول','start',true,
  'stages',jsonb_build_array(
    jsonb_build_object('n','كتابة النص','role','writer','who','wri@t.test','start',public.work_today(),'due',public.work_today()+1,'after','[]'::jsonb),
    jsonb_build_object('n','المرئيات','role','designer','who','des@t.test','start',public.work_today()+1,'due',public.work_today()+2,'after','[0]'::jsonb),
    jsonb_build_object('n','التدقيق','role','assistant','who','asst@t.test','start',public.work_today()+2,'due',public.work_today()+3,'after','[0,1]'::jsonb)))) $q$, 'ok');
select pg_temp.c('10b number issued by the server', (select pg_temp.g('A') ~ '^CH-[0-9]+$')::text, 'true');
select pg_temp.who('00000000-0000-0000-0000-00000000b002');
select pg_temp.c('10c designer told, waiting', (select tier from public.notifications where recipient = 'des@t.test' order by created_at limit 1), 'info');
select pg_temp.who('00000000-0000-0000-0000-00000000e001');
select pg_temp.t('11 member sends a request', $q$ insert into v select 'M', public.work_create(jsonb_build_object('type','event','title','طلب تغطية',
  'due',public.work_today()+9,'assignee','mem@t.test','stages','[{"n":"التخطيط","who":"pro@t.test","start":"2026-01-01"},{"n":"التصوير","after":[0]}]'::jsonb)) $q$, 'ok');
select pg_temp.c('11b request has no assignee and no people on stages',
  (select (w.assignee is null)::text || ' ' || (select count(*) from public.work_stages s where s.work_id = w.id and s.who is not null)
   from public.works w where w.id = pg_temp.g('M')), 'true 0');

-- Restricted work -----------------------------------------------------------
select pg_temp.who('00000000-0000-0000-0000-00000000d001');
select pg_temp.t('12 director creates restricted work R for the producer', $q$ insert into v select 'R', public.work_create(jsonb_build_object('type','video','title','لقطات داخلية',
  'due',public.work_today()+6,'assignee','pro@t.test','restricted',true,
  'stages',jsonb_build_array(
    jsonb_build_object('n','النص','role','writer','who','wri@t.test','start',public.work_today(),'due',public.work_today()+1,'gate',true),
    jsonb_build_object('n','التصوير','role','producer','who','pro@t.test','start',public.work_today()+1,'due',public.work_today()+2,'after','[0]'::jsonb),
    jsonb_build_object('n','المونتاج','role','producer','who','pro@t.test','start',public.work_today()+3,'due',public.work_today()+4,'after','[1]'::jsonb)))) $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-00000000e001');
select pg_temp.c('13 member sees restricted R', (select count(*) from public.works where id = pg_temp.g('R'))::text, '0');
select pg_temp.who('00000000-0000-0000-0000-00000000b002');
select pg_temp.c('14 designer (not involved) sees R', (select count(*) from public.works where id = pg_temp.g('R'))::text, '0');
select pg_temp.c('14b designer sees R stages', (select count(*) from public.work_stages where work_id = pg_temp.g('R'))::text, '0');
select pg_temp.c('14c designer sees open work A', (select count(*) from public.works where id = pg_temp.g('A'))::text, '1');
select pg_temp.who('00000000-0000-0000-0000-00000000b001');
select pg_temp.c('15 writer (on a stage) sees R', (select count(*) from public.works where id = pg_temp.g('R'))::text, '1');
select pg_temp.who('00000000-0000-0000-0000-00000000a001');
select pg_temp.c('16 assistant sees R', (select count(*) from public.works where id = pg_temp.g('R'))::text, '1');

-- Stages, hand-over, approval point ----------------------------------------
select pg_temp.who('00000000-0000-0000-0000-00000000b002');
select pg_temp.t('17 designer cannot finish a waiting stage', $q$ select public.work_stage_act((select id from public.work_stages where work_id = pg_temp.g('A') and pos = 1), 'finish') $q$, 'ERR STAGE_WAITING');
select pg_temp.who('00000000-0000-0000-0000-00000000b001');
select pg_temp.t('18 writer finishes their stage', $q$ select public.work_stage_act((select id from public.work_stages where work_id = pg_temp.g('A') and pos = 0), 'finish') $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-00000000b002');
select pg_temp.c('18b designer: «صار دورك»', (select count(*) from public.notifications where recipient = 'des@t.test' and tier = 'attention' and body like 'صار دورك%')::text, '1');
select pg_temp.who('00000000-0000-0000-0000-00000000a001');
select pg_temp.c('18c assistant still waits: told for information', (select count(*) from public.notifications where recipient = 'asst@t.test' and tier = 'info' and body like '%تنتظر%')::text, '1');
select pg_temp.who('00000000-0000-0000-0000-00000000b001');
select pg_temp.t('18d writer writes the Instagram copy', $q$ select public.work_text_save(pg_temp.g('A'), 'instagram', 'نسخة إنستغرام', null) $q$, 'ok');
select pg_temp.t('18e a copy for a platform not chosen is refused', $q$ select public.work_text_save(pg_temp.g('A'), 'x', 'نسخة X', null) $q$, 'ERR PLATFORM_NOT_CHOSEN');
select pg_temp.t('19 writer finishes the approval point of R', $q$ select public.work_stage_act((select id from public.work_stages where work_id = pg_temp.g('R') and pos = 0), 'finish') $q$, 'ok');
select pg_temp.c('19b the next stage waits for approval', (select public.work_stage_state(id) from public.work_stages where work_id = pg_temp.g('R') and pos = 1), 'waiting');
select pg_temp.t('20 writer cannot approve the point', $q$ select public.work_stage_act((select id from public.work_stages where work_id = pg_temp.g('R') and pos = 0), 'gate') $q$, 'ERR FORBIDDEN_DECIDE');
select pg_temp.who('00000000-0000-0000-0000-00000000d001');
select pg_temp.t('21 director approves the point', $q$ select public.work_stage_act((select id from public.work_stages where work_id = pg_temp.g('R') and pos = 0), 'gate') $q$, 'ok');
select pg_temp.c('21b the next stage is ready', (select public.work_stage_state(id) from public.work_stages where work_id = pg_temp.g('R') and pos = 1), 'ready');

-- Extension request moves what follows --------------------------------------
select pg_temp.who('00000000-0000-0000-0000-00000000f001');
select pg_temp.t('22 producer asks to extend the shoot by two days', $q$ insert into v select 'Q', public.request_extension(
  (select id from public.work_stages where work_id = pg_temp.g('R') and pos = 1), null, (public.work_today()+4)::timestamptz + interval '9 hours', 'تأخر وصول المعدات') $q$, 'ok');
select pg_temp.c('22b preview: the edit moves one day', (select jsonb_array_length(public.work_step_impact((select id from public.work_stages where work_id = pg_temp.g('R') and pos = 1), public.work_today()+4)->'shifts'))::text, '1');
select pg_temp.t('23 producer cannot decide their own request', $q$ select public.request_decide(pg_temp.g('Q')::uuid, true, null, false) $q$, 'ERR FORBIDDEN');
select pg_temp.who('00000000-0000-0000-0000-00000000b001');
select pg_temp.t('24 writer cannot decide it', $q$ select public.request_decide(pg_temp.g('Q')::uuid, true, null, false) $q$, 'ERR FORBIDDEN');
select pg_temp.who('00000000-0000-0000-0000-00000000d001');
select pg_temp.t('25 director approves it', $q$ select public.request_decide(pg_temp.g('Q')::uuid, true, null, false) $q$, 'ok');
select pg_temp.c('25b the edit now ends a day later', (select (due_on - public.work_today())::text from public.work_stages where work_id = pg_temp.g('R') and pos = 2), '5');

-- Review: per part, no self approval, urgent ---------------------------------
select pg_temp.who('00000000-0000-0000-0000-00000000b001');
select pg_temp.t('26 writer submits A', $q$ select public.work_submit(pg_temp.g('A'), 'جاهز', array[pg_temp.g('ig')::uuid], now()) $q$, 'ok');
select pg_temp.c('26b parts waiting', (select string_agg(key, ',' order by key) from public.work_pending(pg_temp.g('A'))), 'date,dest,text,v:instagram');
select pg_temp.t('26c no editing while a decision is pending', $q$ select public.work_text_save(pg_temp.g('A'), 'main', 'تعديل أثناء المراجعة', null) $q$, 'ERR STATUS_DENIED');
select pg_temp.t('27 writer cannot decide', $q$ select public.work_decide(pg_temp.g('A'), 'approve', array['text'], null, false) $q$, 'ERR FORBIDDEN_DECIDE');
select pg_temp.who('00000000-0000-0000-0000-00000000d001');
select pg_temp.t('28 director approves the text only', $q$ select public.work_decide(pg_temp.g('A'), 'approve', array['text'], null, false) $q$, 'ok');
select pg_temp.t('29 changes without a note are refused', $q$ select public.work_decide(pg_temp.g('A'), 'changes', array['dest'], '', false) $q$, 'ERR NOTE_REQUIRED');
select pg_temp.t('30 director sends the accounts back', $q$ select public.work_decide(pg_temp.g('A'), 'changes', array['dest'], 'أضف حساباً آخر', false) $q$, 'ok');
select pg_temp.c('30b status and the text stays approved', (select status from public.works where id = pg_temp.g('A')) || ' ' ||
  (select count(*) from public.work_approvals where work_id = pg_temp.g('A') and part = 'text'), 'CHANGES_REQUESTED 1');
select pg_temp.t('31 director marks A urgent', $q$ select public.work_update(pg_temp.g('A'), '{"priority":"urgent"}') $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-00000000b001');
select pg_temp.t('32 writer resubmits', $q$ select public.work_submit(pg_temp.g('A'), null, array[pg_temp.g('ig')::uuid], now()) $q$, 'ok');
select pg_temp.c('32b only what was not approved is waiting', (select string_agg(key, ',' order by key) from public.work_pending(pg_temp.g('A'))), 'date,dest,v:instagram');
select pg_temp.who('00000000-0000-0000-0000-00000000a001');
select pg_temp.t('33 assistant approves the rest of an urgent work', $q$ select public.work_decide(pg_temp.g('A'), 'approve', array['dest','date','v:instagram'], null, false) $q$, 'ok');
select pg_temp.c('33b ready to publish, not published', (select status || ' ' || coalesce(pub_at::text, 'none') from public.works where id = pg_temp.g('A')), 'APPROVED none');
select pg_temp.who('00000000-0000-0000-0000-00000000c001');
select pg_temp.c('33c publisher told', (select count(*) from public.notifications where recipient = 'pub@t.test' and body like 'اكتمل اعتماد%')::text, '1');

-- A change after approval re-opens only that part ---------------------------
select pg_temp.who('00000000-0000-0000-0000-00000000b001');
select pg_temp.t('34 writer edits the approved text', $q$ select public.work_text_save(pg_temp.g('A'), 'main', 'النص الثاني', 'تعديل') $q$, 'ok');
select pg_temp.c('34b back in review for the text alone', (select status from public.works where id = pg_temp.g('A')) || ' ' ||
  (select string_agg(key, ',') from public.work_pending(pg_temp.g('A'))), 'IN_REVIEW text');
select pg_temp.c('34c the Instagram copy is now older than the text', (select base::text from public.work_variants where work_id = pg_temp.g('A') and platform = 'instagram'), '1');
select pg_temp.t('34d writer confirms the copy still fits', $q$ select public.work_variant_confirm(pg_temp.g('A'), 'instagram') $q$, 'ok');
select pg_temp.c('34e confirmed against version 2, nothing re-opened', (select base::text from public.work_variants where work_id = pg_temp.g('A') and platform = 'instagram') || ' ' ||
  (select string_agg(key, ',') from public.work_pending(pg_temp.g('A'))), '2 text');
select pg_temp.who('00000000-0000-0000-0000-00000000d001');
select pg_temp.t('35 director approves the new text', $q$ select public.work_decide(pg_temp.g('A'), 'approve', array['text'], null, false) $q$, 'ok');

-- Approval never publishes; only the publisher schedules --------------------
select pg_temp.t('36 director cannot publish', $q$ select public.work_publish(pg_temp.g('A'), 'now') $q$, 'ERR FORBIDDEN');
select pg_temp.t('37 director cannot schedule', $q$ select public.work_schedule(pg_temp.g('A'), now(), 'auto') $q$, 'ERR FORBIDDEN');
select pg_temp.t('38 an account in use cannot be deleted', $q$ select public.account_delete(pg_temp.g('ig')::uuid) $q$, 'ERR ACCOUNT_IN_USE');
select pg_temp.who('00000000-0000-0000-0000-00000000c001');
select pg_temp.t('39 publisher schedules at the approved time, ask first', $q$ select public.work_schedule(pg_temp.g('A'), now(), 'ask') $q$, 'ok');
select pg_temp.c('39b scheduled', (select status from public.works where id = pg_temp.g('A')), 'SCHEDULED');
select pg_temp.t('40 another time sends only the date back', $q$ select public.work_schedule(pg_temp.g('A'), now() + interval '1 day', 'ask') $q$, 'ok');
select pg_temp.c('40b in review for the date alone', (select status from public.works where id = pg_temp.g('A')) || ' ' ||
  (select string_agg(key, ',') from public.work_pending(pg_temp.g('A'))), 'IN_REVIEW date');
select pg_temp.t('41 publisher withdraws the move', $q$ select public.work_cancel_move(pg_temp.g('A')) $q$, 'ok');
select pg_temp.c('41b back on the old time', (select status || ' ' || (sched_at = now())::text from public.works where id = pg_temp.g('A')), 'SCHEDULED true');
select pg_temp.t('42 the time comes', $q$ insert into v select 'due', public.work_due_run()::text $q$, 'ok');
select pg_temp.c('42b ask first: waits for the publisher', (select status || ' ' || confirm_pending::text from public.works where id = pg_temp.g('A')), 'SCHEDULED true');
select pg_temp.t('43 publisher confirms', $q$ select public.work_publish(pg_temp.g('A'), 'confirm') $q$, 'ok');
select pg_temp.c('43b published (simulation)', (select status from public.works where id = pg_temp.g('A')), 'PUBLISHED');

-- Whole package, self approval, partial publication and retry ---------------
select pg_temp.who('00000000-0000-0000-0000-00000000a001');
select pg_temp.t('44 assistant creates announcement C for herself', $q$ insert into v select 'C', public.work_create(jsonb_build_object('type','announce','title','إعلان داخلي',
  'due',public.work_today()+4,'assignee','asst@t.test','channels',jsonb_build_array(pg_temp.g('ig'),pg_temp.g('x')),'main','نص الإعلان','start',true,
  'stages','[{"n":"كتابة النص"}]'::jsonb)) $q$, 'ok');
select pg_temp.t('45 assistant submits C', $q$ select public.work_submit(pg_temp.g('C'), null, array[pg_temp.g('ig')::uuid, pg_temp.g('x')::uuid], null) $q$, 'ok');
select pg_temp.t('46 assistant cannot approve what she sent', $q$ select public.work_decide(pg_temp.g('C'), 'approve', null, null, false) $q$, 'ERR SELF_APPROVAL');
select pg_temp.who('00000000-0000-0000-0000-00000000d001');
select pg_temp.t('47 director approves the whole package', $q$ select public.work_decide(pg_temp.g('C'), 'approve', null, null, false) $q$, 'ok');
select pg_temp.t('48 renaming the X handle', $q$ select public.account_save(pg_temp.g('x')::uuid, '{"label":"الرسمي","handle":"@t_x2","publishers":["pub@t.test"]}') $q$, 'ok');
select pg_temp.c('48b whole package back in review', (select status from public.works where id = pg_temp.g('C')) || ' ' ||
  (select count(*) from public.work_pending(pg_temp.g('C'))) || '/' || (select count(*) from public.work_parts(pg_temp.g('C'))), 'IN_REVIEW 2/2');
select pg_temp.who('00000000-0000-0000-0000-00000000a001');
select pg_temp.t('49 the one who renamed it cannot approve; the assistant does', $q$ select public.work_decide(pg_temp.g('C'), 'approve', null, null, false) $q$, 'ok');
reset role;
update public.platform_accounts set authorized_until = now() - interval '1 hour' where id = (select val from v where k = 'x')::uuid;
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-00000000c001');
select pg_temp.t('50 publish now with X expired', $q$ insert into v select 'p1', public.work_publish(pg_temp.g('C'), 'now') $q$, 'ok');
select pg_temp.c('50b partial', pg_temp.g('p1'), 'PARTIAL');
select pg_temp.t('51 publisher reconnects X', $q$ select public.account_reconnect(pg_temp.g('x')::uuid) $q$, 'ok');
select pg_temp.t('52 retry', $q$ insert into v select 'p2', public.work_publish(pg_temp.g('C'), 'retry') $q$, 'ok');
select pg_temp.c('52b published; the retry sent X alone', pg_temp.g('p2') || ' ' ||
  (select (text like '%X%' and text not like '%إنستغرام%')::text from public.work_log where work_id = pg_temp.g('C') and type = 'publish' order by id desc limit 1), 'PUBLISHED true');

-- The library and the work decide together ----------------------------------
select pg_temp.who('00000000-0000-0000-0000-00000000a001');
select pg_temp.t('53 assistant uploads a video to the library', $q$ with x as (insert into public.media_files (drive_file_id, name, mime_type, size_bytes, kind, folder_id)
  values ('t-drive-1', 'فيديو الاختبار.mp4', 'video/mp4', 1000, 'video', '00000000-0000-0000-0000-0000000000a1') returning id)
  insert into v select 'F', id::text from x $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-00000000b001');
select pg_temp.t('54 YouTube with a video is accepted', $q$ insert into v select 'E', public.work_create(jsonb_build_object('type','post','title','منشور بفيديو',
  'due',public.work_today()+5,'assignee','wri@t.test','channels',jsonb_build_array(pg_temp.g('yt')),'assets',jsonb_build_array(pg_temp.g('F')),
  'main','نص','start',true,'stages','[{"n":"كتابة النص"}]'::jsonb)) $q$, 'ok');
select pg_temp.t('55 writer submits E', $q$ select public.work_submit(pg_temp.g('E'), null, array[pg_temp.g('yt')::uuid], null) $q$, 'ok');
select pg_temp.c('55b the library shows the file in review', (select stage from public.media_files where id = pg_temp.g('F')::uuid), 'review');
select pg_temp.who('00000000-0000-0000-0000-00000000a001');
select pg_temp.t('56 the uploader cannot approve her file in the library', $q$ update public.media_files set stage = 'ready' where id = pg_temp.g('F')::uuid $q$, 'ERR SELF_APPROVAL');
select pg_temp.who('00000000-0000-0000-0000-00000000d001');
select pg_temp.t('57 director approves the file in the library', $q$ update public.media_files set stage = 'ready' where id = pg_temp.g('F')::uuid $q$, 'ok');
select pg_temp.c('57b the work has the file approved at its version', (select ver from public.work_approvals where work_id = pg_temp.g('E') and part = 'a:' || pg_temp.g('F')), 'v1');

-- Requests, templates, tasks, privacy ---------------------------------------
select pg_temp.who('00000000-0000-0000-0000-00000000e001');
select pg_temp.t('58 member asks for folder access', $q$ insert into v select 'QA', public.request_folder_access('00000000-0000-0000-0000-0000000000f9', 'أحتاج الصور') $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-00000000d001');
select pg_temp.t('59 director approves', $q$ select public.request_decide(pg_temp.g('QA')::uuid, true, null, false) $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-00000000e001');
select pg_temp.c('59b member can now view the folder', public.media_my_level('00000000-0000-0000-0000-0000000000f9')::text, '1');
select pg_temp.who('00000000-0000-0000-0000-00000000b001');
select pg_temp.t('60 writer cannot save a plan template', $q$ select public.plan_template_save('قالب', 'post', '[{"n":"أ"}]') $q$, 'ERR FORBIDDEN');
select pg_temp.t('61 writer cannot give the designer a task', $q$ select public.task_create(jsonb_build_object('what','مهمة','assignee','des@t.test','due',now()+interval '1 day')) $q$, 'ERR TASK_ROLE');
select pg_temp.t('62 writer makes a task for himself', $q$ select public.task_create(jsonb_build_object('what','مهمتي','due',now()+interval '1 day')) $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-00000000f001');
select pg_temp.t('63 producer gives the designer a task', $q$ insert into v select 'T1', public.task_create(jsonb_build_object('what','فرز الصور','assignee','des@t.test','due',now()+interval '1 day'))::text $q$, 'ok');
select pg_temp.t('64 and the writer one that waits for it', $q$ insert into v select 'T2', public.task_create(jsonb_build_object('what','رفع الأرشيف','assignee','wri@t.test','due',now()+interval '2 days','after',jsonb_build_array(pg_temp.g('T1'))))::text $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-00000000b002');
select pg_temp.t('65 designer finishes the first task', $q$ update public.media_tasks set status = 'done' where id = pg_temp.g('T1')::uuid $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-00000000b001');
select pg_temp.c('65b writer: «صار دورك» for the second', (select count(*) from public.notifications where recipient = 'wri@t.test' and body like 'صار دورك: «رفع الأرشيف»%')::text, '1');
select pg_temp.who('00000000-0000-0000-0000-00000000d001');
select pg_temp.t('66 director adds a private reminder', $q$ select public.reminder_add(now() + interval '1 day', 'مراجعة الأرقام') $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-00000000aa01');
select pg_temp.c('67 administrator sees the reminder', (select count(*) from public.reminders)::text, '0');
select pg_temp.c('67b administrator sees restricted R (acts as a leader)', (select count(*) from public.works where id = pg_temp.g('R'))::text, '1');
select pg_temp.who('00000000-0000-0000-0000-00000000e001');
select pg_temp.c('68 member sees only own notifications', (select count(*) from public.notifications where recipient <> 'mem@t.test')::text, '0');
select pg_temp.t('69 nobody writes a table directly', $q$ insert into public.works (id, no, title, type, created_by, due) values ('CH-999999', 999999, 'x', 'post', 'mem@t.test', current_date) $q$, 'ERR new row violates row-level security policy for table "works"');
select pg_temp.t('70 nobody edits the log', $q$ delete from public.work_log $q$, 'ok');
select pg_temp.c('70b the log is still there', (select (count(*) > 0)::text from public.work_log), 'true');

-- Every remaining function runs at least once: plpgsql reports a name clash only when the code runs.
select pg_temp.who('00000000-0000-0000-0000-00000000d001');
select pg_temp.t('71 director makes a project', $q$ insert into v select 'P', public.project_save(null, jsonb_build_object('name','حملة الاختبار','type','campaign',
  'start',public.work_today(),'end',public.work_today()+30,'owner','asst@t.test','description','وصف'))::text $q$, 'ok');
select pg_temp.t('72 project dates the wrong way round', $q$ select public.project_save(null, jsonb_build_object('name','خطأ','start',public.work_today()+2,'end',public.work_today(),'owner','asst@t.test')) $q$, 'ERR DATES_INVALID');
select pg_temp.t('73 director assigns the member request', $q$ select public.work_assign(pg_temp.g('M'), 'pro@t.test') $q$, 'ok');
select pg_temp.t('74 details: project, people and a stage date', $q$ select public.work_update(pg_temp.g('R'), jsonb_build_object('projects',jsonb_build_array(pg_temp.g('P')),
  'people','["des@t.test"]'::jsonb,'stage_dues',jsonb_build_object((select id::text from public.work_stages where work_id = pg_temp.g('R') and pos = 2), public.work_today()+6))) $q$, 'ok');
select pg_temp.t('75 the final due date cannot come before a stage', $q$ select public.work_update(pg_temp.g('R'), jsonb_build_object('due', public.work_today()+3)) $q$, 'ERR STAGE_AFTER_DUE');
select pg_temp.t('76 restrict', $q$ select public.work_set_restricted(pg_temp.g('M'), true) $q$, 'ok');
select pg_temp.t('76b and lift', $q$ select public.work_set_restricted(pg_temp.g('M'), false) $q$, 'ok');
select pg_temp.t('77 close needs a reason', $q$ select public.work_close(pg_temp.g('M'), ' ') $q$, 'ERR REASON_REQUIRED');
select pg_temp.t('78 close', $q$ select public.work_close(pg_temp.g('M'), 'أُلغيت الفعالية') $q$, 'ok');
select pg_temp.t('78b reopen', $q$ select public.work_reopen(pg_temp.g('M')) $q$, 'ok');
select pg_temp.t('79 comment', $q$ select public.work_comment(pg_temp.g('R'), 'تعليق') $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-00000000f001');
select pg_temp.t('80 producer starts production of M', $q$ select public.work_start(pg_temp.g('M')) $q$, 'ok');
select pg_temp.t('81 a plan cannot drop a finished stage', $q$ select public.work_save_plan(pg_temp.g('R'), jsonb_build_array(
  jsonb_build_object('id',(select id from public.work_stages where work_id = pg_temp.g('R') and pos = 1),'n','التصوير','after','[]'::jsonb))) $q$, 'ERR PLAN_DONE_STAGE');
select pg_temp.t('82 a stage cannot end after the final due date', $q$ select public.work_save_plan(pg_temp.g('R'), (select jsonb_agg(jsonb_build_object('id',id,'n',name,'role',role,'who',who,
  'start',start_on,'due',case when pos = 2 then public.work_today()+20 else due_on end,'after',to_jsonb(after_pos)) order by pos) from public.work_stages where work_id = pg_temp.g('R'))) $q$, 'ERR PLAN_AFTER_DUE');
select pg_temp.t('83 producer inserts a stage before the edit', $q$ select public.work_save_plan(pg_temp.g('R'), (
  select jsonb_agg(e order by o) from (
    select jsonb_build_object('id',id,'n',name,'role',role,'who',who,'start',start_on,'due',due_on,'after',to_jsonb(after_pos)) e, pos * 2 o
      from public.work_stages where work_id = pg_temp.g('R') and pos < 2
    union all select jsonb_build_object('n','تعليق صوتي','role','producer','who','pro@t.test','start',public.work_today()+4,'due',public.work_today()+4,'after','[1]'::jsonb), 3
    union all select jsonb_build_object('id',id,'n',name,'role',role,'who',who,'start',start_on,'due',due_on,'after','[1,2]'::jsonb), 4
      from public.work_stages where work_id = pg_temp.g('R') and pos = 2) q)) $q$, 'ok');
select pg_temp.c('83b order after the save', (select string_agg(name, '، ' order by pos) from public.work_stages where work_id = pg_temp.g('R')), 'النص، التصوير، تعليق صوتي، المونتاج');
select pg_temp.t('84 producer starts the shoot', $q$ select public.work_stage_act((select id from public.work_stages where work_id = pg_temp.g('R') and pos = 1), 'start') $q$, 'ok');
select pg_temp.c('85 load counts', (select open_stages || '/' || open_tasks from public.work_people_load() where email = 'pro@t.test'), '3/0');
select pg_temp.t('86 producer adds and deletes an event', $q$ select public.event_delete(public.event_save(null, jsonb_build_object('title','اجتماع','start',now(),'end',now()+interval '1 hour','project',pg_temp.g('P')))) $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-00000000b001');
select pg_temp.t('87 writer asks to extend his waiting task', $q$ insert into v select 'QT', public.request_extension(null, pg_temp.g('T2')::uuid, now() + interval '4 days', 'أحتاج يوماً') $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-00000000f001');
select pg_temp.t('88 the producer who gave it approves', $q$ select public.request_decide(pg_temp.g('QT')::uuid, true, 'حسناً', false) $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-00000000b001');
select pg_temp.t('89 writer reads all his notifications', $q$ select public.notifications_read(null) $q$, 'ok');
select pg_temp.c('89b none unread', (select count(*) from public.notifications where read_at is null)::text, '0');
select pg_temp.who('00000000-0000-0000-0000-00000000a001');
select pg_temp.t('90 assistant saves and deletes a plan template', $q$ select public.plan_template_delete(public.plan_template_save('قالب فيديو', 'video', '[{"n":"النص","role":"writer","days":2},{"n":"التصوير","after":[0],"gate":true}]')) $q$, 'ok');
select pg_temp.t('91 X is free again and can be stopped', $q$ select public.account_set_active(pg_temp.g('x')::uuid, false) $q$, 'ok');
select pg_temp.t('92 YouTube is in a review and cannot be deleted', $q$ select public.account_delete(pg_temp.g('yt')::uuid) $q$, 'ERR ACCOUNT_IN_USE');
select pg_temp.who('00000000-0000-0000-0000-00000000d001');
select pg_temp.t('93 director deletes his reminder', $q$ select public.reminder_delete((select id from public.reminders limit 1)) $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-00000000e001');
select pg_temp.t('94 member cannot withdraw a request that is not his', $q$ select public.request_withdraw(pg_temp.g('QT')::uuid) $q$, 'ERR FORBIDDEN');

reset role;
select setval('public.work_no_seq', last_value, is_called) from s0;
-- Only rows that differ from what is expected, and the total.
select * from (
  select n, k, v, expect from r where v is distinct from expect
  union all select 0, 'TOTAL', count(*)::text, (count(*) filter (where v = expect))::text || ' passed' from r) z order by n;
rollback;

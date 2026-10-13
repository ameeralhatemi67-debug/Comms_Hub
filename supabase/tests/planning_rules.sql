-- Step 5 of Reference_Build_Plan.md: the rules behind «التقويم», «المشاريع» and «الطلبات», and the
-- gaps the review of Steps 1 to 5 closed in 20261013120000_work_cycle_planning.sql. One section
-- per rule. Same method as approval_rules.sql: one transaction, throwaway accounts (@t.test),
-- the work counter restored, rolled back. Run with the Supabase SQL editor or the MCP
-- execute_sql tool.
begin;
create temp table s0 as select last_value, is_called from public.work_no_seq;
create temp table r(n serial, k text, v text, expect text);
create temp table v(k text primary key, val text);
grant all on r, v to authenticated; grant usage on sequence r_n_seq to authenticated;
insert into public.accounts (email, display_name, role, protected) values
 ('dir@t.test','Dir','director',false),('asst@t.test','Asst','assistant',false),('wri@t.test','Wri','writer',false),
 ('wri2@t.test','Wri2','writer',false),('des@t.test','Des','designer',false),('pro@t.test','Pro','producer',false),
 ('pub@t.test','Pub','publisher',false),('mem@t.test','Mem','member',false);
insert into auth.users (id, email, email_confirmed_at) values
 ('00000000-0000-0000-0000-00000000d001','dir@t.test',now()),('00000000-0000-0000-0000-00000000a001','asst@t.test',now()),
 ('00000000-0000-0000-0000-00000000b001','wri@t.test',now()),('00000000-0000-0000-0000-00000000b003','wri2@t.test',now()),
 ('00000000-0000-0000-0000-00000000b002','des@t.test',now()),('00000000-0000-0000-0000-00000000f001','pro@t.test',now()),
 ('00000000-0000-0000-0000-00000000c001','pub@t.test',now()),('00000000-0000-0000-0000-00000000e001','mem@t.test',now());
-- A restricted folder for the access request; an internal conversation the writer is in.
insert into public.media_folders (id, parent_id, name, restricted, created_by)
values ('00000000-0000-0000-0000-0000000000f9', null, 'مجلد مقيّد للاختبار', true, 'seed');
insert into public.mail_threads (id, kind, subject, created_by) values ('00000000-0000-0000-0000-0000000005a1', 'internal', 'محادثة الاختبار', 'wri@t.test');
insert into public.mail_members (thread_id, email, participant) values ('00000000-0000-0000-0000-0000000005a1', 'wri@t.test', true);

create function pg_temp.who(id text) returns void language sql as $$ select set_config('request.jwt.claims', json_build_object('sub',id,'role','authenticated')::text, true) $$;
create function pg_temp.t(k text, sqltext text, e text) returns void language plpgsql as $$
begin
  begin execute sqltext; insert into r(k,v,expect) values (k,'ok',e);
  exception when others then insert into r(k,v,expect) values (k,'ERR '||sqlerrm,e); end;
end $$;
create function pg_temp.c(k text, val text, e text) returns void language sql as $$ insert into r(k,v,expect) values (k,coalesce(val,'NULL'),e) $$;
create function pg_temp.g(k text) returns text language sql as $$ select val from v where k = $1 $$;
create function pg_temp.d(n int) returns text language sql as $$ select (public.work_today() + n)::text $$;
create function pg_temp.sd(w text) returns text language sql as $$
  select string_agg(coalesce(start_on::text,'-') || '/' || coalesce(due_on::text,'-'), ' ' order by pos) from public.work_stages where work_id = w $$;
grant execute on function pg_temp.t(text,text,text), pg_temp.c(text,text,text), pg_temp.g(text), pg_temp.d(int), pg_temp.sd(text) to authenticated;
-- Dates in the checks are offsets from today: 'D+3' means work_today() + 3.
create function pg_temp.rel(s text) returns text language plpgsql as $$
declare m text;
begin
  for m in select (regexp_matches(s, '\d{4}-\d{2}-\d{2}', 'g'))[1] loop
    s := replace(s, m, 'D+' || (m::date - public.work_today()));
  end loop;
  return coalesce(s, 'NULL');
end $$;
grant execute on function pg_temp.rel(text) to authenticated;
set local role authenticated;

select pg_temp.who('00000000-0000-0000-0000-00000000d001');
select pg_temp.t('00 Instagram account', $q$ insert into v select 'ig', public.account_save(null, '{"platform":"instagram","label":"الرسمي","handle":"@pl.ig","publishers":["pub@t.test"],"mode":"auto"}')::text $q$, 'ok');

-- 1. Parts of a work only for those who can see it (review finding) ---------------------
select pg_temp.t('01a director creates a restricted press release R for the writer', $q$ insert into v select 'R', public.work_create(jsonb_build_object('type','press','title','بيان سري',
  'due',public.work_today()+6,'assignee','wri@t.test','main','النص السري','restricted',true,'start',true,'stages','[{"n":"كتابة البيان"}]'::jsonb)) $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-00000000e001');
select pg_temp.c('01b a member reads no part of it', (select count(*)::text from public.work_view_parts(pg_temp.g('R'))), '0');
select pg_temp.t('01c nor through the internal function', $q$ select 1 from public.work_parts(pg_temp.g('R')) $q$, 'ERR permission denied for function work_parts');
select pg_temp.t('01d nor its pending parts', $q$ select 1 from public.work_pending(pg_temp.g('R')) $q$, 'ERR permission denied for function work_pending');
select pg_temp.c('01e nor its pending parts through the visible-only one', (select count(*)::text from public.work_view_pending(pg_temp.g('R'))), '0');
select pg_temp.t('01f stage state is internal', $q$ select public.work_stage_state((select id from public.work_stages limit 1)) $q$, 'ERR permission denied for function work_stage_state');
select pg_temp.c('01g the decision block says FORBIDDEN, not its review state', public.work_decide_block(pg_temp.g('R')), 'FORBIDDEN');
select pg_temp.who('00000000-0000-0000-0000-00000000b001');
select pg_temp.c('01h its writer reads its text', (select snap from public.work_view_parts(pg_temp.g('R')) where key = 'text'), 'النص السري');

-- 2. A publish date is a request; only «موعد النشر» goes back to review ----------------
select pg_temp.t('02a writer creates post M on Instagram', $q$ insert into v select 'M', public.work_create(jsonb_build_object('type','post','title','منشور التقويم',
  'due',public.work_today()+6,'assignee','wri@t.test','channels',jsonb_build_array(pg_temp.g('ig')),'main','النص','start',true,'stages','[{"n":"كتابة النص"}]'::jsonb)) $q$, 'ok');
select pg_temp.t('02b writer sends it with a proposed time', $q$ select public.work_submit(pg_temp.g('M'), null, array[pg_temp.g('ig')::uuid], date_trunc('minute', now()) + interval '2 days') $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-00000000d001');
select pg_temp.t('02c director approves it all', $q$ select public.work_decide(pg_temp.g('M'), 'approve', array['text','dest','date'], null, false) $q$, 'ok');
insert into v select 'M0', proposed_at::text from public.works where id = pg_temp.g('M');
select pg_temp.who('00000000-0000-0000-0000-00000000e001');
select pg_temp.t('02d a member cannot ask to move it', $q$ select public.work_request_move(pg_temp.g('M'), now() + interval '3 days', null) $q$, 'ERR FORBIDDEN');
select pg_temp.who('00000000-0000-0000-0000-00000000b003');
select pg_temp.t('02e nor another writer', $q$ select public.work_request_move(pg_temp.g('M'), now() + interval '3 days', null) $q$, 'ERR FORBIDDEN');
select pg_temp.who('00000000-0000-0000-0000-00000000b001');
select pg_temp.t('02f a time in the past is refused', $q$ select public.work_request_move(pg_temp.g('M'), now() - interval '1 hour', null) $q$, 'ERR DATE_PAST');
select pg_temp.t('02g its writer asks', $q$ select public.work_request_move(pg_temp.g('M'), date_trunc('minute', now()) + interval '3 days', 'تأخر الصور') $q$, 'ok');
select pg_temp.c('02h only «موعد النشر» waits; the old time is held', (select status || ' ' || (move_from = pg_temp.g('M0')::timestamptz)::text || ' ' || move_by from public.works where id = pg_temp.g('M'))
  || ' ' || (select string_agg(key, ',') from public.work_view_pending(pg_temp.g('M'))), 'IN_REVIEW true wri@t.test date');
select pg_temp.t('02j the writer cannot approve it', $q$ select public.work_decide(pg_temp.g('M'), 'approve', array['date'], null, false) $q$, 'ERR FORBIDDEN_DECIDE');
select pg_temp.who('00000000-0000-0000-0000-00000000b002');
select pg_temp.t('02k nor withdraw it for him', $q$ select public.work_cancel_move(pg_temp.g('M')) $q$, 'ERR FORBIDDEN');
select pg_temp.who('00000000-0000-0000-0000-00000000b001');
select pg_temp.t('02l he withdraws it', $q$ select public.work_cancel_move(pg_temp.g('M')) $q$, 'ok');
select pg_temp.c('02m the approved time stands again', (select status || ' ' || (proposed_at = pg_temp.g('M0')::timestamptz)::text || ' ' || coalesce(move_from::text, 'none') from public.works where id = pg_temp.g('M')), 'APPROVED true none');
select pg_temp.who('00000000-0000-0000-0000-00000000c001');
select pg_temp.t('02n publisher schedules at the approved time', $q$ select public.work_schedule(pg_temp.g('M'), pg_temp.g('M0')::timestamptz, 'auto') $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-00000000d001');
select pg_temp.t('02o the director asks to move the scheduled post', $q$ select public.work_request_move(pg_temp.g('M'), date_trunc('minute', now()) + interval '4 days', null) $q$, 'ok');
select pg_temp.t('02p and may not approve his own request', $q$ select public.work_decide(pg_temp.g('M'), 'approve', array['date'], null, false) $q$, 'ERR SELF_APPROVAL');
select pg_temp.who('00000000-0000-0000-0000-00000000a001');
select pg_temp.t('02q the assistant approves it', $q$ select public.work_decide(pg_temp.g('M'), 'approve', array['date'], null, false) $q$, 'ok');
select pg_temp.c('02r scheduled again, at the new time', (select status || ' ' || (sched_at = date_trunc('minute', now()) + interval '4 days')::text from public.works where id = pg_temp.g('M')), 'SCHEDULED true');
select pg_temp.who('00000000-0000-0000-0000-00000000d001');
select pg_temp.t('02s director creates a restricted post Q for the writer', $q$ insert into v select 'Q', public.work_create(jsonb_build_object('type','post','title','منشور مقيّد',
  'due',public.work_today()+6,'assignee','wri@t.test','channels',jsonb_build_array(pg_temp.g('ig')),'main','نص','restricted',true,'start',true,'stages','[{"n":"كتابة النص"}]'::jsonb)) $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-00000000b001');
select pg_temp.t('02t writer sends Q with a time', $q$ select public.work_submit(pg_temp.g('Q'), null, array[pg_temp.g('ig')::uuid], now() + interval '2 days') $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-00000000d001');
select pg_temp.t('02u director approves Q', $q$ select public.work_decide(pg_temp.g('Q'), 'approve', array['text','dest','date'], null, false) $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-00000000c001');
select pg_temp.t('02v the publisher cannot move a restricted work he cannot see (review finding)', $q$ select public.work_request_move(pg_temp.g('Q'), now() + interval '3 days', null) $q$, 'ERR FORBIDDEN');

-- 3. Leaders move deliveries and stage dates directly, never before an open stage --------
select pg_temp.who('00000000-0000-0000-0000-00000000d001');
select pg_temp.t('03a director creates D with three stages in a chain', $q$ insert into v select 'D', public.work_create(jsonb_build_object('type','press','title','بيان المواعيد',
  'due',public.work_today()+10,'assignee','wri@t.test','start',true,'stages',jsonb_build_array(
    jsonb_build_object('n','جمع','who','wri@t.test','start',pg_temp.d(0),'due',pg_temp.d(3),'after','[]'::jsonb),
    jsonb_build_object('n','كتابة','who','wri@t.test','start',pg_temp.d(4),'due',pg_temp.d(6),'after','[0]'::jsonb),
    jsonb_build_object('n','تدقيق','who','asst@t.test','start',pg_temp.d(7),'due',pg_temp.d(8),'after','[1]'::jsonb)))) $q$, 'ok');
insert into v select 'D1', id::text from public.work_stages where work_id = (select val from v where k = 'D') and pos = 1;
insert into v select 'D0', id::text from public.work_stages where work_id = (select val from v where k = 'D') and pos = 0;
select pg_temp.who('00000000-0000-0000-0000-00000000b001');
select pg_temp.t('03b the writer cannot move a stage date', $q$ select public.work_update(pg_temp.g('D'), jsonb_build_object('stage_dues', jsonb_build_object(pg_temp.g('D1'), pg_temp.d(7)))) $q$, 'ERR FORBIDDEN');
select pg_temp.who('00000000-0000-0000-0000-00000000d001');
select pg_temp.t('03c the delivery never before an open stage ends', $q$ select public.work_update(pg_temp.g('D'), jsonb_build_object('due', pg_temp.d(5))) $q$, 'ERR STAGE_AFTER_DUE');
select pg_temp.t('03d a stage never before the open stage it waits for (review finding)', $q$ select public.work_update(pg_temp.g('D'), jsonb_build_object('stage_dues', jsonb_build_object(pg_temp.g('D1'), pg_temp.d(2)))) $q$, 'ERR STAGE_BEFORE_WAIT');
select pg_temp.t('03e nor after the delivery', $q$ select public.work_update(pg_temp.g('D'), jsonb_build_object('stage_dues', jsonb_build_object(pg_temp.g('D1'), pg_temp.d(11)))) $q$, 'ERR STAGE_AFTER_DUE');
select pg_temp.t('03f a stage moved within its bounds', $q$ select public.work_update(pg_temp.g('D'), jsonb_build_object('stage_dues', jsonb_build_object(pg_temp.g('D1'), pg_temp.d(7)))) $q$, 'ok');
select pg_temp.c('03g its date changed and the log says so', pg_temp.rel((select due_on::text from public.work_stages where id = pg_temp.g('D1')::uuid)) || ' ' ||
  (select count(*)::text from public.work_log where work_id = pg_temp.g('D') and type = 'stage_due'), 'D+7 1');
select pg_temp.t('03h the delivery moved later', $q$ select public.work_update(pg_temp.g('D'), jsonb_build_object('due', pg_temp.d(12))) $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-00000000b001');
select pg_temp.t('03i the writer finishes the first stage', $q$ select public.work_stage_act(pg_temp.g('D0')::uuid, 'finish') $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-00000000d001');
select pg_temp.t('03j a finished stage no longer holds the date back', $q$ select public.work_update(pg_temp.g('D'), jsonb_build_object('stage_dues', jsonb_build_object(pg_temp.g('D1'), pg_temp.d(2)))) $q$, 'ok');

-- 4. Extensions: what moves is shown before the decision, and the decision moves it --------
select pg_temp.t('04a director creates E: owner wri2, the first stage the writer''s', $q$ insert into v select 'E', public.work_create(jsonb_build_object('type','press','title','بيان التمديد',
  'due',public.work_today()+6,'assignee','wri2@t.test','start',true,'stages',jsonb_build_array(
    jsonb_build_object('n','الأولى','who','wri@t.test','start',pg_temp.d(0),'due',pg_temp.d(2),'after','[]'::jsonb),
    jsonb_build_object('n','الثانية','who','des@t.test','start',pg_temp.d(3),'due',pg_temp.d(4),'after','[0]'::jsonb),
    jsonb_build_object('n','الثالثة','who','asst@t.test','start',pg_temp.d(5),'due',pg_temp.d(6),'after','[1]'::jsonb)))) $q$, 'ok');
insert into v select 'E0', id::text from public.work_stages where work_id = (select val from v where k = 'E') and pos = 0;
select pg_temp.who('00000000-0000-0000-0000-00000000b002');
select pg_temp.t('04b the designer cannot ask to extend the writer''s stage', $q$ select public.request_extension(pg_temp.g('E0')::uuid, null, now() + interval '5 days', 'سبب') $q$, 'ERR FORBIDDEN');
select pg_temp.who('00000000-0000-0000-0000-00000000b001');
select pg_temp.t('04c the writer asks without a reason', $q$ select public.request_extension(pg_temp.g('E0')::uuid, null, (pg_temp.d(5) || ' 12:00+03')::timestamptz, ' ') $q$, 'ERR REASON_REQUIRED');
select pg_temp.t('04d the writer asks to end on D+5', $q$ insert into v select 'X1', public.request_extension(pg_temp.g('E0')::uuid, null, (pg_temp.d(5) || ' 12:00+03')::timestamptz, 'تأخر المواد')::text $q$, 'ok');
select pg_temp.c('04e before deciding: both stages after it move, past the delivery', (select string_agg((e->>'name') || ' ' || pg_temp.rel(e->'to'->>0) || '/' || pg_temp.rel(e->'to'->>1), '; ')
  || ' over_due ' || (im->>'over_due') || ' max ' || pg_temp.rel(im->>'max_end') from (select public.work_step_impact(pg_temp.g('E0')::uuid, pg_temp.d(5)::date) im) z, jsonb_array_elements(im->'shifts') e group by im),
  'الثانية D+5/D+6; الثالثة D+6/D+7 over_due true max D+7');
select pg_temp.c('04f the writer sees his request, and may not decide it', (select can_decide::text from public.work_request_list() where id = pg_temp.g('X1')::uuid), 'false');
select pg_temp.t('04g nor decide it anyway', $q$ select public.request_decide(pg_temp.g('X1')::uuid, true, null, true) $q$, 'ERR FORBIDDEN');
select pg_temp.who('00000000-0000-0000-0000-00000000b002');
select pg_temp.c('04h the designer does not see the request', (select count(*)::text from public.work_request_list() where id = pg_temp.g('X1')::uuid) || ' ' ||
  (select count(*)::text from public.work_requests where id = pg_temp.g('X1')::uuid), '0 0');
select pg_temp.t('04i nor decide it', $q$ select public.request_decide(pg_temp.g('X1')::uuid, true, null, true) $q$, 'ERR FORBIDDEN');
select pg_temp.who('00000000-0000-0000-0000-00000000e001');
select pg_temp.c('04j a member does not see it', (select count(*)::text from public.work_request_list() where id = pg_temp.g('X1')::uuid), '0');
select pg_temp.who('00000000-0000-0000-0000-00000000d001');
select pg_temp.c('04k the director sees it and may decide', (select can_decide::text || ' ' || stage_name || ' ' || work_title from public.work_request_list() where id = pg_temp.g('X1')::uuid), 'true الأولى بيان التمديد');
select pg_temp.who('00000000-0000-0000-0000-00000000b003');
select pg_temp.c('04l the work''s owner sees it and may decide', (select can_decide::text from public.work_request_list() where id = pg_temp.g('X1')::uuid), 'true');
select pg_temp.t('04m the owner approves, extending the delivery too', $q$ select public.request_decide(pg_temp.g('X1')::uuid, true, null, true) $q$, 'ok');
select pg_temp.c('04n the stages moved and the delivery with them', pg_temp.rel(pg_temp.sd(pg_temp.g('E'))) || ' due ' || pg_temp.rel((select due::text from public.works where id = pg_temp.g('E'))),
  'D+0/D+5 D+5/D+6 D+6/D+7 due D+7');
select pg_temp.c('04o the owner does not read other people''s notices', (select count(*)::text from public.notifications where body like 'تحرّك موعد مرحلتك في «بيان التمديد»%'), '0');
reset role;
select pg_temp.c('04p (as the database) the designer and the assistant were told', (select string_agg(recipient, ',' order by recipient) from public.notifications where body like 'تحرّك موعد مرحلتك في «بيان التمديد»%'), 'asst@t.test,des@t.test');
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-00000000b001');
select pg_temp.c('04q the writer learns the decision', (select count(*)::text from public.notifications where body like 'طلب تمديد «الأولى»%اعتُمد%'), '1');
select pg_temp.t('04r the writer asks again, to D+7', $q$ insert into v select 'X2', public.request_extension(pg_temp.g('E0')::uuid, null, (pg_temp.d(7) || ' 12:00+03')::timestamptz, 'مرة أخرى')::text $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-00000000b002');
select pg_temp.t('04s someone else cannot withdraw it', $q$ select public.request_withdraw(pg_temp.g('X2')::uuid) $q$, 'ERR FORBIDDEN');
select pg_temp.who('00000000-0000-0000-0000-00000000b001');
select pg_temp.t('04t he withdraws it himself', $q$ select public.request_withdraw(pg_temp.g('X2')::uuid) $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-00000000d001');
select pg_temp.t('04u a withdrawn request cannot be decided', $q$ select public.request_decide(pg_temp.g('X2')::uuid, true, null, false) $q$, 'ERR FORBIDDEN');
select pg_temp.who('00000000-0000-0000-0000-00000000b001');
select pg_temp.t('04v he asks for D+7 once more', $q$ insert into v select 'X3', public.request_extension(pg_temp.g('E0')::uuid, null, (pg_temp.d(7) || ' 12:00+03')::timestamptz, 'آخر مرة')::text $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-00000000d001');
select pg_temp.t('04w the director declines with a reason', $q$ select public.request_decide(pg_temp.g('X3')::uuid, false, 'الموعد لا يحتمل', false) $q$, 'ok');
select pg_temp.c('04x nothing moved', pg_temp.rel(pg_temp.sd(pg_temp.g('E'))), 'D+0/D+5 D+5/D+6 D+6/D+7');
select pg_temp.who('00000000-0000-0000-0000-00000000b001');
select pg_temp.t('04y and once more, to D+8', $q$ insert into v select 'X4', public.request_extension(pg_temp.g('E0')::uuid, null, (pg_temp.d(8) || ' 12:00+03')::timestamptz, 'فعلاً آخر مرة')::text $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-00000000a001');
select pg_temp.t('04z the assistant approves without extending the delivery', $q$ select public.request_decide(pg_temp.g('X4')::uuid, true, 'دون مدّ التسليم', false) $q$, 'ok');
select pg_temp.c('04za the stages moved, the delivery did not', pg_temp.rel(pg_temp.sd(pg_temp.g('E'))) || ' due ' || pg_temp.rel((select due::text from public.works where id = pg_temp.g('E'))),
  'D+0/D+8 D+8/D+9 D+9/D+10 due D+7');
select pg_temp.who('00000000-0000-0000-0000-00000000b001');
select pg_temp.c('04zb the writer sees his four requests and how each ended', (select string_agg(status, ',' order by status) from public.work_request_list() where stage_id = pg_temp.g('E0')::uuid), 'approved,approved,declined,withdrawn');

-- 5. Task extensions and task waits ------------------------------------------------------
select pg_temp.who('00000000-0000-0000-0000-00000000d001');
select pg_temp.t('05a director gives the designer T1', $q$ insert into v select 'T1', public.task_create(jsonb_build_object('what','تصميم الغلاف','kind','design','assignee','des@t.test',
  'due',(pg_temp.d(2) || ' 17:00+03'))) $q$, 'ok');
select pg_temp.t('05b and the writer T2, after T1', $q$ insert into v select 'T2', public.task_create(jsonb_build_object('what','كتابة التعليق','kind','copy','assignee','wri@t.test',
  'start',pg_temp.d(2),'due',(pg_temp.d(3) || ' 17:00+03'),'after',jsonb_build_array(pg_temp.g('T1')))) $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-00000000e001');
select pg_temp.t('05c a member cannot read what moves after T1 (review finding)', $q$ select public.work_task_impact(pg_temp.g('T1')::uuid, now() + interval '4 days') $q$, 'ERR FORBIDDEN');
select pg_temp.who('00000000-0000-0000-0000-00000000b003');
select pg_temp.t('05d nor another writer', $q$ select public.work_task_impact(pg_temp.g('T1')::uuid, now() + interval '4 days') $q$, 'ERR FORBIDDEN');
select pg_temp.who('00000000-0000-0000-0000-00000000b002');
select pg_temp.c('05e its designer sees T2 move by two days', (select (e->>'what') from jsonb_array_elements(public.work_task_impact(pg_temp.g('T1')::uuid, (pg_temp.d(3) || ' 17:00+03')::timestamptz)->'shifts') e), 'كتابة التعليق');
select pg_temp.t('05f the designer asks to extend T1 to D+3', $q$ insert into v select 'TX', public.request_extension(null, pg_temp.g('T1')::uuid, (pg_temp.d(3) || ' 17:00+03')::timestamptz, 'انتظار الصور')::text $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-00000000b001');
select pg_temp.t('05g the writer cannot decide it', $q$ select public.request_decide(pg_temp.g('TX')::uuid, true, null, false) $q$, 'ERR FORBIDDEN');
select pg_temp.c('05h nor see it', (select count(*)::text from public.work_request_list() where id = pg_temp.g('TX')::uuid), '0');
select pg_temp.who('00000000-0000-0000-0000-00000000d001');
select pg_temp.t('05i the director, who gave the task, approves', $q$ select public.request_decide(pg_temp.g('TX')::uuid, true, null, false) $q$, 'ok');
select pg_temp.c('05j T1 moved a day, T2 two days', (select pg_temp.rel(((due at time zone 'Asia/Riyadh')::date)::text) from public.media_tasks where id = pg_temp.g('T1')::uuid) || ' ' ||
  (select pg_temp.rel(start_on::text) || '/' || pg_temp.rel(((due at time zone 'Asia/Riyadh')::date)::text) from public.media_tasks where id = pg_temp.g('T2')::uuid), 'D+3 D+4/D+5');
select pg_temp.who('00000000-0000-0000-0000-00000000b001');
select pg_temp.t('05k a task waits only for tasks the caller can read (review finding)', $q$ select public.task_create(jsonb_build_object('what','مهمتي','due',(pg_temp.d(6) || ' 17:00+03'),'after',jsonb_build_array(pg_temp.g('T1')))) $q$, 'ERR TASK_INVALID');
select pg_temp.t('05l the writer may wait for his own task', $q$ select public.task_create(jsonb_build_object('what','مهمتي','due',(pg_temp.d(6) || ' 17:00+03'),'after',jsonb_build_array(pg_temp.g('T2')))) $q$, 'ok');
select pg_temp.t('05m and cannot give a task to someone else', $q$ select public.task_create(jsonb_build_object('what','لغيري','assignee','des@t.test','due',(pg_temp.d(6) || ' 17:00+03'))) $q$, 'ERR TASK_ROLE');

-- 6. Folder access requests -------------------------------------------------------------
select pg_temp.t('06a the writer asks for the restricted folder', $q$ insert into v select 'FA', public.request_folder_access('00000000-0000-0000-0000-0000000000f9', 'أحتاج العقود')::text $q$, 'ok');
select pg_temp.t('06b not twice', $q$ select public.request_folder_access('00000000-0000-0000-0000-0000000000f9', 'مرة أخرى') $q$, 'ERR ALREADY_PENDING');
select pg_temp.c('06c he sees it with the folder''s name, and does not decide it', (select folder_name || ' ' || can_decide::text from public.work_request_list() where id = pg_temp.g('FA')::uuid), 'مجلد مقيّد للاختبار false');
select pg_temp.who('00000000-0000-0000-0000-00000000b003');
select pg_temp.c('06d another writer does not see it', (select count(*)::text from public.work_request_list() where id = pg_temp.g('FA')::uuid), '0');
select pg_temp.who('00000000-0000-0000-0000-00000000a001');
select pg_temp.t('06e the assistant grants it', $q$ select public.request_decide(pg_temp.g('FA')::uuid, true, null, false) $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-00000000b001');
select pg_temp.c('06f the writer now views the folder', (select public.media_my_level('00000000-0000-0000-0000-0000000000f9')::text), '1');

-- 7. A new project with its works plan, in one step ------------------------------------
select pg_temp.t('07a a writer cannot create a project', $q$ select public.project_create(jsonb_build_object('name','م','start',pg_temp.d(0),'end',pg_temp.d(20),'owner','dir@t.test'), '[]') $q$, 'ERR FORBIDDEN');
select pg_temp.who('00000000-0000-0000-0000-00000000d001');
select pg_temp.t('07b director creates a project with two planned works', $q$ insert into v select 'PJ', public.project_create(jsonb_build_object('name','معرض الاختبار','type','event','start',pg_temp.d(0),'end',pg_temp.d(20),'owner','asst@t.test'),
  jsonb_build_array(
    jsonb_build_object('type','post','title','منشور المعرض','due',pg_temp.d(10),'assignee','wri@t.test','source','plan','channels',jsonb_build_array(pg_temp.g('ig')),
      'stages',jsonb_build_array(jsonb_build_object('n','كتابة النص','role','writer','who','wri@t.test','start',pg_temp.d(8),'due',pg_temp.d(8),'after','[]'::jsonb,'days',1),
                                 jsonb_build_object('n','التدقيق','role','assistant','who','asst@t.test','start',pg_temp.d(9),'due',pg_temp.d(10),'after','[0]'::jsonb,'days',2))),
    jsonb_build_object('type','press','title','بيان المعرض','due',pg_temp.d(12),'assignee','wri2@t.test','source','plan',
      'stages',jsonb_build_array(jsonb_build_object('n','كتابة البيان','role','writer','who','wri2@t.test','start',pg_temp.d(11),'due',pg_temp.d(12),'after','[]'::jsonb,'days',2)))))::text $q$, 'ok');
select pg_temp.c('07c two works, both in the project, each with its people and dates', (select count(*)::text from public.work_projects where project_id = (pg_temp.g('PJ')::jsonb->>'id')::uuid) || ' ' ||
  (select string_agg(w.status || ':' || w.assignee || ':' || (select string_agg(coalesce(s.who,'-'), ',' order by s.pos) from public.work_stages s where s.work_id = w.id), ' ' order by w.no)
   from public.works w where w.id in (select jsonb_array_elements_text(pg_temp.g('PJ')::jsonb->'works'))),
  '2 DRAFT:wri@t.test:wri@t.test,asst@t.test DRAFT:wri2@t.test:wri2@t.test');
reset role;
select pg_temp.c('07d (as the database) the assistant, its owner, and each work''s owner were told', (select count(*)::text from public.notifications where recipient = 'asst@t.test' and body like '%مسؤولاً عن مشروع «معرض الاختبار»%') || ' ' ||
  (select count(*)::text from public.notifications where recipient = 'wri2@t.test' and body like '%أسند إليك «بيان المعرض»%'), '1 1');
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-00000000d001');
select pg_temp.t('07e a plan with a work due in the past creates nothing', $q$ select public.project_create(jsonb_build_object('name','مشروع خاطئ','start',pg_temp.d(0),'end',pg_temp.d(20),'owner','dir@t.test'),
  jsonb_build_array(jsonb_build_object('type','press','title','قديم','due',pg_temp.d(-1),'assignee','wri@t.test','stages','[{"n":"كتابة"}]'::jsonb))) $q$, 'ERR DUE_PAST');
select pg_temp.c('07f no project was left behind', (select count(*)::text from public.projects where name = 'مشروع خاطئ'), '0');
select pg_temp.t('07g a planned post without an account is refused', $q$ select public.project_create(jsonb_build_object('name','مشروع بلا حساب','start',pg_temp.d(0),'end',pg_temp.d(20),'owner','dir@t.test'),
  jsonb_build_array(jsonb_build_object('type','post','title','منشور','due',pg_temp.d(5),'assignee','wri@t.test','stages','[{"n":"كتابة"}]'::jsonb))) $q$, 'ERR CHANNEL_REQUIRED');
select pg_temp.who('00000000-0000-0000-0000-00000000b001');
select pg_temp.t('07h a writer cannot edit a project', $q$ select public.project_save((pg_temp.g('PJ')::jsonb->>'id')::uuid, jsonb_build_object('name','تغيير','start',pg_temp.d(0),'end',pg_temp.d(20),'owner','wri@t.test')) $q$, 'ERR FORBIDDEN');

-- 8. Events and private reminders -------------------------------------------------------
select pg_temp.who('00000000-0000-0000-0000-00000000e001');
select pg_temp.t('08a a member cannot add an event', $q$ select public.event_save(null, jsonb_build_object('title','حدث','start',now(),'end',now() + interval '1 hour')) $q$, 'ERR FORBIDDEN');
select pg_temp.who('00000000-0000-0000-0000-00000000b001');
select pg_temp.t('08b an event that ends before it starts', $q$ select public.event_save(null, jsonb_build_object('title','حدث','start',now(),'end',now() - interval '1 hour')) $q$, 'ERR DATES_INVALID');
select pg_temp.t('08c the writer adds a three-day event in the project', $q$ insert into v select 'EV', public.event_save(null, jsonb_build_object('title','المعرض','start',now(),'end',now() + interval '2 days','project',pg_temp.g('PJ')::jsonb->>'id'))::text $q$, 'ok');
select pg_temp.t('08d an event in a project that does not exist', $q$ select public.event_save(null, jsonb_build_object('title','حدث','start',now(),'end',now(),'project',gen_random_uuid())) $q$, 'ERR insert or update on table "events" violates foreign key constraint "events_project_id_fkey"');
select pg_temp.who('00000000-0000-0000-0000-00000000b003');
select pg_temp.t('08e another writer cannot delete it', $q$ select public.event_delete(pg_temp.g('EV')::uuid) $q$, 'ERR FORBIDDEN');
select pg_temp.who('00000000-0000-0000-0000-00000000b001');
select pg_temp.t('08f the writer keeps a private reminder', $q$ insert into v select 'RM', public.reminder_add(now() + interval '1 day', 'اتصال')::text $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-00000000d001');
select pg_temp.c('08g the director does not see it', (select count(*)::text from public.reminders where id = pg_temp.g('RM')::uuid), '0');
select pg_temp.t('08h nor delete it', $q$ select public.reminder_delete(pg_temp.g('RM')::uuid) $q$, 'ERR FORBIDDEN');
select pg_temp.t('08i the director deletes the event', $q$ select public.event_delete(pg_temp.g('EV')::uuid) $q$, 'ok');

-- 9. Linking a conversation to an existing work (known item, fixed) ----------------------
select pg_temp.who('00000000-0000-0000-0000-00000000b001');
select pg_temp.t('09a a work that does not exist', $q$ select public.mail_link_work('00000000-0000-0000-0000-0000000005a1', 'CH-999999', 'لا', null) $q$, 'ERR FORBIDDEN');
select pg_temp.who('00000000-0000-0000-0000-00000000d001');
select pg_temp.t('09b director creates a restricted work the writer is not on', $q$ insert into v select 'H', public.work_create(jsonb_build_object('type','press','title','مقيّد آخر',
  'due',public.work_today()+6,'assignee','wri2@t.test','restricted',true,'stages','[{"n":"كتابة"}]'::jsonb)) $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-00000000b001');
select pg_temp.t('09c a work he cannot see (review finding)', $q$ select public.mail_link_work('00000000-0000-0000-0000-0000000005a1', pg_temp.g('H'), 'مقيّد', null) $q$, 'ERR FORBIDDEN');
reset role;
update public.works set created_at = now() - interval '1 day' where id = (select val from v where k = 'M');
set local role authenticated;
select pg_temp.t('09d he links his existing work M', $q$ select public.mail_link_work('00000000-0000-0000-0000-0000000005a1', pg_temp.g('M'), 'منشور التقويم', null) $q$, 'ok');
select pg_temp.c('09e the work''s log records it now', (select count(*)::text from public.work_log where work_id = pg_temp.g('M') and type = 'link'), '1');
select pg_temp.t('09f linking it again', $q$ select public.mail_link_work('00000000-0000-0000-0000-0000000005a1', pg_temp.g('M'), 'منشور التقويم', null) $q$, 'ok');
select pg_temp.c('09g adds nothing twice', (select count(*)::text from public.work_log where work_id = pg_temp.g('M') and type = 'link') || ' ' ||
  (select jsonb_array_length(links)::text from public.mail_threads where id = '00000000-0000-0000-0000-0000000005a1'), '1 1');
select pg_temp.t('09h a work created from the conversation', $q$ insert into v select 'N', public.work_create(jsonb_build_object('type','press','title','من البريد',
  'due',public.work_today()+6,'assignee','wri@t.test','mail_thread','00000000-0000-0000-0000-0000000005a1','stages','[{"n":"كتابة"}]'::jsonb)) $q$, 'ok');
select pg_temp.c('09i is logged once, by work_create', (select count(*)::text from public.work_log where work_id = pg_temp.g('N') and type = 'link'), '1');

reset role;
select setval('public.work_no_seq', last_value, is_called) from s0;
select * from (
  select n, k, v, expect from r where v is distinct from expect
  union all select 0, 'TOTAL', count(*)::text, (count(*) filter (where v = expect))::text || ' passed' from r) z order by n;
rollback;

-- «سجل النشاط» and «تقرير الشهر» rules (MVP_draft.md 66), checked inside one transaction that is rolled back at the end.
-- Run with the Supabase SQL editor or the MCP execute_sql tool. Throwaway accounts (@t.test) act through row level
-- security, and nothing about a real person is read into the result.
-- Covered: who holds the two permissions by default; what each person reads of the logs; only someone who holds the
-- whole log can give it, and to anyone; the report's refusals; the month by Riyadh's calendar; a file approved in a
-- work counted once; a stage credited to its owner; a task late at the month's end, even if finished after it.
-- The last query lists only the checks that differ from the rule, and the total.
-- Result: qa/activity-report-rules.json.
begin;
create temp table r(n serial, k text, v text, expect text);
create temp table j(k text primary key, doc jsonb);
grant all on r, j to public; grant usage on sequence r_n_seq to public;
insert into public.accounts (email, display_name, role, pages, protected) values
 ('adm@t.test','Adm','admin','{}',true),('dir@t.test','Dir','director','{activity}',false),
 ('asst@t.test','Asst','assistant','{activity}',false),('wri@t.test','Wri','writer','{activity}',false),
 ('wri2@t.test','Wri2','writer','{activity}',false);
insert into auth.users (id, email, email_confirmed_at) values
 ('00000000-0000-0000-0000-0000000000a1','adm@t.test',now()),('00000000-0000-0000-0000-0000000000d1','dir@t.test',now()),
 ('00000000-0000-0000-0000-0000000000b1','asst@t.test',now()),('00000000-0000-0000-0000-0000000000c1','wri@t.test',now()),
 ('00000000-0000-0000-0000-0000000000c2','wri2@t.test',now());
create function pg_temp.who(id text) returns void language sql as $$ select set_config('request.jwt.claims', json_build_object('sub',id,'role','authenticated')::text, true) $$;
create function pg_temp.t(k text, sqltext text, e text) returns void language plpgsql as $$
begin
  begin execute sqltext; insert into r(k,v,expect) values (k,'ok',e);
  exception when others then insert into r(k,v,expect) values (k,'ERR '||sqlerrm,e); end;
end $$;
create function pg_temp.c(k text, got text, e text) returns void language sql as $$ insert into r(k,v,expect) values (k,got,e) $$;

-- October in Riyadh runs from 2026-09-30 21:00 to 2026-10-31 21:00 UTC.
insert into public.activity_log (at, actor_email, type, data) values
 ('2026-10-10 09:00+00','wri@t.test','upload','{}'),
 ('2026-10-10 10:00+00','wri2@t.test','upload','{}'),
 ('2026-09-30 21:30+00','wri@t.test','version','{}'),
 ('2026-10-31 21:30+00','wri@t.test','version','{}');
insert into public.permission_events (actor, subject, capability, kind, data) values ('dir@t.test','adm@t.test','urgency.2','grant','{}');
insert into public.works (id, no, title, type, due, created_by, assignee) values ('CH-999991',999991,'عمل الفحص','post','2026-10-20','dir@t.test','wri@t.test');
insert into public.work_stages (work_id, pos, name, who, due_on, done_at, done_by) values
 ('CH-999991',0,'كتابة','wri@t.test','2026-10-12','2026-10-11 09:00+00','wri@t.test'),
 ('CH-999991',1,'تصميم','wri2@t.test','2026-10-12','2026-10-15 09:00+00','dir@t.test');
insert into public.work_log (work_id, at, actor, type, text, data) values
 ('CH-999991','2026-10-12 09:00+00','dir@t.test','approve','اعتماد','{}'),
 ('CH-999991','2026-10-12 09:05+00','dir@t.test','approve','اعتماد ملف','{"asset":"x"}'),
 ('CH-999991','2026-10-13 09:00+00','dir@t.test','approved','اعتماد العمل','{}');
insert into public.media_tasks (what, assignee, assigned_by, due, status, done_at, created_at) values
 ('في موعدها','wri@t.test','dir@t.test','2026-10-20 12:00+00','done','2026-10-19 12:00+00','2026-10-01 12:00+00'),
 ('مفتوحة ومتأخرة','wri2@t.test','dir@t.test','2026-10-20 12:00+00','open',null,'2026-10-01 12:00+00'),
 ('أُنجزت بعد الشهر','wri2@t.test','dir@t.test','2026-10-20 12:00+00','done','2026-11-02 12:00+00','2026-10-01 12:00+00');

select pg_temp.c('01 two permissions, seeded for every role', (select count(*)::text from public.role_capabilities where capability in ('activity.full','activity.report')), '16');
select pg_temp.c('02 on by default for the Admin and the director only', (select string_agg(distinct role, ',' order by role) from public.role_capabilities where capability in ('activity.full','activity.report') and allowed), 'admin,director');

set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
select pg_temp.c('03 the director holds the whole log', public.has_capability('activity.full')::text, 'true');
select pg_temp.c('04 and reads every line of it', (select count(*)::text from public.activity_log where actor_email like '%@t.test'), '4');
select pg_temp.c('05 and the permission events of someone above their rank', (select count(*)::text from public.permission_events where subject = 'adm@t.test' and actor = 'dir@t.test'), '1');
select pg_temp.who('00000000-0000-0000-0000-0000000000a1');
select pg_temp.c('06 the Admin too', (select count(*)::text from public.activity_log where actor_email like '%@t.test'), '4');
select pg_temp.who('00000000-0000-0000-0000-0000000000b1');
select pg_temp.c('07 the assistant no longer holds it by default', public.has_capability('activity.full')::text, 'false');
select pg_temp.c('08 and reads none of the others'' lines', (select count(*)::text from public.activity_log where actor_email like '%@t.test'), '0');
select pg_temp.who('00000000-0000-0000-0000-0000000000c1');
select pg_temp.c('09 a writer reads their own lines', (select count(*)::text from public.activity_log where actor_email like '%@t.test'), '3');
select pg_temp.c('10 and no one else''s', (select count(*)::text from public.activity_log where actor_email = 'wri2@t.test'), '0');
select pg_temp.c('11 and not the permission event about the Admin', (select count(*)::text from public.permission_events where subject = 'adm@t.test' and actor = 'dir@t.test'), '0');

-- Giving the whole log.
select pg_temp.who('00000000-0000-0000-0000-0000000000b1');
select pg_temp.t('12 the assistant cannot give what they do not hold', $$select public.grant_capability('wri@t.test','activity.full','standing',null,null,null,null)$$, 'ERR NOT_HELD');
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
select pg_temp.t('13 the director gives it to a writer', $$select public.grant_capability('wri@t.test','activity.full','standing',null,null,null,null)$$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-0000000000c1');
select pg_temp.c('14 and the writer reads the whole log', (select count(*)::text from public.activity_log where actor_email like '%@t.test'), '4');
select pg_temp.who('00000000-0000-0000-0000-0000000000c2');
select pg_temp.c('15 the other writer of the same role does not', (select count(*)::text from public.activity_log where actor_email like '%@t.test'), '1');
select pg_temp.who('00000000-0000-0000-0000-0000000000c1');
select pg_temp.t('16 the writer given the log still cannot make the report', $$select public.activity_report('2026-10')$$, 'ERR FORBIDDEN');
select pg_temp.who('00000000-0000-0000-0000-0000000000a1');
select pg_temp.t('17 the Admin gives it to the assistant', $$select public.grant_capability('asst@t.test','activity.full','standing',null,null,null,null)$$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
select pg_temp.t('18 taking it back', $$select public.set_member_override('wri@t.test','activity.full',null,null)$$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-0000000000c1');
select pg_temp.c('19 and the writer is back to their own lines', (select count(*)::text from public.activity_log where actor_email like '%@t.test'), '3');

-- The report.
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
select pg_temp.t('20 a month must be a month', $$select public.activity_report('2026-13')$$, 'ERR BAD_MONTH');
select pg_temp.t('21 the report is not for a team role, even given', $$select public.grant_capability('wri@t.test','activity.report','standing',null,null,null,null)$$, 'ERR CAP_RANK');
select pg_temp.who('00000000-0000-0000-0000-0000000000b1');
select pg_temp.t('22 the assistant needs it given', $$select public.activity_report('2026-10')$$, 'ERR FORBIDDEN');
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
select pg_temp.t('23 the director gives it to the assistant', $$select public.grant_capability('asst@t.test','activity.report','standing',null,null,null,null)$$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-0000000000b1');
select pg_temp.t('24 and the assistant can make it', $$select public.activity_report('2026-10')$$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
insert into j(k, doc) select 'oct', public.activity_report('2026-10');
reset role;

create function pg_temp.acts(p_who text, p_src text, p_type text) returns text language sql as $$
  select coalesce(sum((a->>'n')::int), 0)::text from j, jsonb_array_elements(doc->'actions') a
  where k = 'oct' and a->>'who' = p_who and a->>'src' = p_src and a->>'type' = p_type $$;
select pg_temp.c('25 a line in the first minutes of the month, by Riyadh''s calendar, is in it; one already in November is not', pg_temp.acts('wri@t.test','log','version'), '1');
select pg_temp.c('26 a file approved in a work is one review, not two', pg_temp.acts('dir@t.test','work','approve'), '1');
select pg_temp.c('27 days of activity are Riyadh''s days', (select doc->'days'->>'wri@t.test' from j where k = 'oct'), '2');
select pg_temp.c('28 an approved work goes to whom it was given', (select doc->'approved'->>'wri@t.test' from j where k = 'oct'), '1');
select pg_temp.c('29 a stage ticked by a leader goes to its owner', (select count(*)::text from j, jsonb_array_elements(doc->'stages') s where k = 'oct' and s->>'who' = 'wri2@t.test' and s->>'name' = 'تصميم'), '1');
select pg_temp.c('30 and not to the leader', (select count(*)::text from j, jsonb_array_elements(doc->'stages') s where k = 'oct' and s->>'who' = 'dir@t.test'), '0');
select pg_temp.c('31 in time, by the day it was due', (select s->>'on_time' from j, jsonb_array_elements(doc->'stages') s where k = 'oct' and s->>'name' = 'كتابة' and s->>'who' = 'wri@t.test'), 'true');
select pg_temp.c('32 late, by the day it was due', (select s->>'on_time' from j, jsonb_array_elements(doc->'stages') s where k = 'oct' and s->>'name' = 'تصميم' and s->>'who' = 'wri2@t.test'), 'false');
select pg_temp.c('33 a task finished after the month is not counted in it', (select count(*)::text from j, jsonb_array_elements(doc->'tasks') t where k = 'oct' and t->>'who' = 'wri2@t.test'), '0');
select pg_temp.c('34 a task finished in time is', (select count(*)::text from j, jsonb_array_elements(doc->'tasks') t where k = 'oct' and t->>'who' = 'wri@t.test' and t->>'on_time' = 'true'), '1');
select pg_temp.c('35 late at the month''s end, open or finished after it', (select doc->'late'->>'wri2@t.test' from j where k = 'oct'), '2');
select pg_temp.c('36 the people are named', (select count(*)::text from j, jsonb_array_elements(doc->'people') p where k = 'oct' and p->>'email' = 'wri@t.test' and p->>'name' = 'Wri'), '1');

select pg_temp.c('37 nobody signed out may call it', has_function_privilege('anon','public.activity_report(text)','execute')::text, 'false');
select pg_temp.c('38 the read rule no longer names roles', (select (qual like '%has_capability%' and qual not like '%media_acts%')::text from pg_policies where schemaname = 'public' and tablename = 'activity_log' and policyname = 'log_read'), 'true');

-- The TOTAL row also carries the md5 of the text this run executed (without the lines a client
-- may append after it), so a recorded result can be matched to the file.
select * from (
  select n, k, v, expect from r where v is distinct from expect
  union all select 0, 'TOTAL', count(*)::text, (count(*) filter (where v is not distinct from expect))::text || ' passed; run md5 '
    || md5(case when strpos(current_query(), E'\n\n-- source: ') > 0 then left(current_query(), strpos(current_query(), E'\n\n-- source: ') - 1) else current_query() end) from r) z order by n;
rollback;

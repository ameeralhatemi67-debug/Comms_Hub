-- MVP_draft.md section 70 (migration 20261102210000_work_cancel.sql): whoever created a work can take it back within the
-- hour, if it was never sent and nobody else touched it. Only throwaway accounts (@t.test) are touched. One transaction,
-- rolled back at the end. Result: qa/work-cancel-rules.json.
begin;
create temp table r(n serial, k text, v text, expect text);
create temp table v(k text primary key, val text);
grant all on r, v to authenticated; grant usage on sequence r_n_seq to authenticated;
insert into public.accounts (email, display_name, role, pages, protected) values
 ('dir@t.test','Dir','director','{}',false),('asst@t.test','Asst','assistant','{}',false),('wri@t.test','Wri','writer','{}',false),
 ('wri2@t.test','Wri2','writer','{}',false),('pro@t.test','Pro','producer','{}',false),('mem@t.test','Mem','member','{}',false);
insert into auth.users (id, email, email_confirmed_at) values
 ('00000000-0000-0000-0000-0000000000a2','dir@t.test',now()),('00000000-0000-0000-0000-0000000000a3','asst@t.test',now()),
 ('00000000-0000-0000-0000-0000000000a4','wri@t.test',now()),('00000000-0000-0000-0000-0000000000a5','wri2@t.test',now()),
 ('00000000-0000-0000-0000-0000000000a6','pro@t.test',now()),('00000000-0000-0000-0000-0000000000a9','mem@t.test',now());
update public.role_capabilities set allowed = true where role = 'member' and capability = 'page.create';
create function pg_temp.who(id text) returns void language sql as $$ select set_config('request.jwt.claims', json_build_object('sub',id,'role','authenticated')::text, true) $$;
create function pg_temp.t(k text, sqltext text, e text) returns void language plpgsql as $$
begin
  begin execute sqltext; insert into r(k,v,expect) values (k,'ok',e);
  exception when others then insert into r(k,v,expect) values (k,'ERR '||sqlerrm,e); end;
end $$;
create function pg_temp.c(k text, val text, e text) returns void language sql as $$ insert into r(k,v,expect) values (k,val,e) $$;
create function pg_temp.g(k text) returns text language sql as $$ select val from v where k = $1 $$;
-- A work for `who`, with one stage for the producer. No owner makes it a request.
create function pg_temp.work(p_title text, p_owner text) returns jsonb language sql as $$
  select jsonb_build_object('type','press','title',p_title,'due',(public.work_today() + 30)::text,'assignee',p_owner,
    'stages',jsonb_build_array(jsonb_build_object('n','كتابة','role','producer','who','pro@t.test','days',1,'after','[]'::jsonb))) $$;
grant execute on function pg_temp.who(text), pg_temp.t(text,text,text), pg_temp.c(text,text,text), pg_temp.g(text), pg_temp.work(text,text) to authenticated;

-- 1. The plain case: a mistake, taken back -----------------------------------------------------------------------
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000a4');
select pg_temp.t('01 a writer creates a work', $q$ insert into v select 'a', public.work_create(pg_temp.work('خطأ', 'wri@t.test')) $q$, 'ok');
reset role;
select pg_temp.c('02 the stage holder was told', (select count(*)::text from public.notifications where recipient = 'pro@t.test' and read_at is null), '1');
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000a5');
select pg_temp.t('03 someone else cannot cancel it', $q$ select public.work_cancel(pg_temp.g('a')) $q$, 'ERR FORBIDDEN');
select pg_temp.who('00000000-0000-0000-0000-0000000000a2');
select pg_temp.t('04 nor can a leader', $q$ select public.work_cancel(pg_temp.g('a')) $q$, 'ERR FORBIDDEN');
select pg_temp.who('00000000-0000-0000-0000-0000000000a4');
select pg_temp.t('05 its creator cancels it', $q$ select public.work_cancel(pg_temp.g('a')) $q$, 'ok');
reset role;
select pg_temp.c('06 it is closed, not deleted', (select count(*)::text || ' ' || (max(closed_at) is not null)::text from public.works where id = pg_temp.g('a')), '1 true');
select pg_temp.c('07 with its reason', (select close_reason from public.works where id = pg_temp.g('a')), 'أُلغي بعد إنشائه');
select pg_temp.c('08 closed by its creator', (select closed_by from public.works where id = pg_temp.g('a')), 'wri@t.test');
select pg_temp.c('09 and logged', (select count(*)::text from public.work_log where work_id = pg_temp.g('a') and type = 'cancel'), '1');
select pg_temp.c('10 the stage holder no longer has something waiting', (select count(*)::text from public.notifications where recipient = 'pro@t.test' and tier <> 'info' and read_at is null), '0');
select pg_temp.c('11 and is told, as information', (select count(*)::text from public.notifications where recipient = 'pro@t.test' and tier = 'info' and body like '%ألغى%'), '1');
select pg_temp.c('12 nobody tells the creator of their own action', (select count(*)::text from public.notifications where recipient = 'wri@t.test' and body like '%ألغى%'), '0');
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000a4');
select pg_temp.t('13 it cannot be cancelled twice', $q$ select public.work_cancel(pg_temp.g('a')) $q$, 'ERR FORBIDDEN');
select pg_temp.who('00000000-0000-0000-0000-0000000000a2');
select pg_temp.t('14 a leader can reopen it', $q$ select public.work_reopen(pg_temp.g('a')) $q$, 'ok');
reset role;
select pg_temp.c('15 and it is open again', (select (closed_at is null)::text from public.works where id = pg_temp.g('a')), 'true');

-- 2. Too late, or already gone further ------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000a4');
select pg_temp.t('16 another work', $q$ insert into v select 'late', public.work_create(pg_temp.work('متأخر', 'wri@t.test')) $q$, 'ok');
reset role;
update public.works set created_at = now() - interval '61 minutes' where id = pg_temp.g('late');
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000a4');
select pg_temp.t('17 after the hour it is refused', $q$ select public.work_cancel(pg_temp.g('late')) $q$, 'ERR CANCEL_LATE');
select pg_temp.t('18 another one', $q$ insert into v select 'sent', public.work_create(pg_temp.work('أُرسل', 'wri@t.test')) $q$, 'ok');
reset role;
update public.works set status = 'IN_REVIEW' where id = pg_temp.g('sent');
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000a4');
select pg_temp.t('19 once sent for review it is refused', $q$ select public.work_cancel(pg_temp.g('sent')) $q$, 'ERR CANCEL_SENT');

-- 3. Touched by someone else -------------------------------------------------------------------------------------------
select pg_temp.who('00000000-0000-0000-0000-0000000000a4');
select pg_temp.t('20 a work with a comment', $q$ insert into v select 'c', public.work_create(pg_temp.work('تعليق', 'wri@t.test')) $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-0000000000a2');
select pg_temp.t('21 a leader comments', $q$ select public.work_comment(pg_temp.g('c'), 'رأي') $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-0000000000a4');
select pg_temp.t('22 so the creator is refused', $q$ select public.work_cancel(pg_temp.g('c')) $q$, 'ERR CANCEL_TOUCHED');
select pg_temp.t('23 a work a leader changed', $q$ insert into v select 'l', public.work_create(pg_temp.work('تعديل', 'wri@t.test')) $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-0000000000a2');
select pg_temp.t('24 a leader closes it for now', $q$ select public.work_close(pg_temp.g('l'), 'سبب') $q$, 'ok');
select pg_temp.t('25 and reopens it', $q$ select public.work_reopen(pg_temp.g('l')) $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-0000000000a4');
select pg_temp.t('26 the log shows a hand other than the creator''s', $q$ select public.work_cancel(pg_temp.g('l')) $q$, 'ERR CANCEL_TOUCHED');
select pg_temp.t('27 a work with the creator''s own comment', $q$ insert into v select 'own', public.work_create(pg_temp.work('تعليقي', 'wri@t.test')) $q$, 'ok');
select pg_temp.t('28 their comment', $q$ select public.work_comment(pg_temp.g('own'), 'ملاحظتي') $q$, 'ok');
select pg_temp.t('29 does not stand in their way', $q$ select public.work_cancel(pg_temp.g('own')) $q$, 'ok');

-- 4. A member's request ----------------------------------------------------------------------------------------------------
select pg_temp.who('00000000-0000-0000-0000-0000000000a9');
select pg_temp.t('30 a member with the page sends a request', $q$ insert into v select 'q', public.work_create(pg_temp.work('طلب', null)) $q$, 'ok');
reset role;
select pg_temp.c('31 the leaders have a decision waiting', (select count(*)::text from public.notifications where recipient = 'dir@t.test' and tier = 'decide' and read_at is null), '1');
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000a9');
select pg_temp.t('32 the member takes it back', $q$ select public.work_cancel(pg_temp.g('q')) $q$, 'ok');
reset role;
select pg_temp.c('33 the decision is no longer waiting', (select count(*)::text from public.notifications where recipient = 'dir@t.test' and tier = 'decide' and read_at is null), '0');
select pg_temp.c('34 the leaders are told', (select count(*)::text from public.notifications where recipient = 'dir@t.test' and tier = 'info' and body like '%ألغى%'), '1');

-- 5. An idea that became the work ---------------------------------------------------------------------------------------------
insert into public.ideas (body, author) values ('فكرة', 'wri@t.test');
insert into v select 'idea', id::text from public.ideas where author = 'wri@t.test';
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000a4');
select pg_temp.t('35 a work from an idea', $q$ insert into v select 'i', public.work_create(pg_temp.work('من فكرة', 'wri@t.test')) $q$, 'ok');
select pg_temp.t('36 linked to it', $q$ select public.idea_to_work(pg_temp.g('idea')::uuid, pg_temp.g('i')) $q$, 'ok');
select pg_temp.t('37 cancelled', $q$ select public.work_cancel(pg_temp.g('i')) $q$, 'ok');
reset role;
select pg_temp.c('38 the idea is free again', (select coalesce(work_id, 'null') from public.ideas where id = pg_temp.g('idea')::uuid), 'null');

-- 6. Who may call what ---------------------------------------------------------------------------------------------------------
select pg_temp.c('39 anonymous callers cannot cancel', has_function_privilege('anon','public.work_cancel(text)','execute')::text, 'false');
select pg_temp.c('40 the helper is not callable through the API', has_function_privilege('authenticated','public.work_touched_by_others(text,text)','execute')::text, 'false');

select n, k, v, expect from r where v is distinct from expect
union all select 0, 'TOTAL', count(*)::text, (count(*) filter (where v is not distinct from expect))::text || ' passed' from r
order by n;
rollback;

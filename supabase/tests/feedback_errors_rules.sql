-- Action_Plan.md section 5 (feedback channel and error monitoring; migration
-- 20261015240000_feedback_errors.sql): who may write, what is validated and scrubbed, equal errors
-- are one row, the limits, who reads and marks, and that the table itself is closed.
-- One transaction, rolled back at the end. Result: qa/feedback-errors-rules.json.
begin;
create temp table r(n serial, k text, v text, expect text);
create temp table v(k text primary key, val text);
grant all on r, v to authenticated; grant usage on sequence r_n_seq to authenticated;
insert into public.accounts (email, display_name, role, pages, protected) values
 ('adm@t.test','Adm','admin','{}',true),('dir@t.test','Dir','director','{}',false),
 ('asst@t.test','Asst','assistant','{}',false),('wri@t.test','Wri','writer','{}',false);
insert into auth.users (id, email, email_confirmed_at) values
 ('00000000-0000-0000-0000-0000000000a1','adm@t.test',now()),('00000000-0000-0000-0000-0000000000d1','dir@t.test',now()),
 ('00000000-0000-0000-0000-0000000000b1','asst@t.test',now()),('00000000-0000-0000-0000-0000000000c1','wri@t.test',now());
create function pg_temp.who(id text) returns void language sql as $$ select set_config('request.jwt.claims', json_build_object('sub',id,'role','authenticated')::text, true) $$;
create function pg_temp.t(k text, sqltext text, e text) returns void language plpgsql as $$
begin
  begin execute sqltext; insert into r(k,v,expect) values (k,'ok',e);
  exception when others then insert into r(k,v,expect) values (k,'ERR '||sqlerrm,e); end;
end $$;
create function pg_temp.c(k text, val text, e text) returns void language sql as $$ insert into r(k,v,expect) values (k,val,e) $$;
create function pg_temp.g(k text) returns text language sql as $$ select val from v where k = $1 $$;
grant execute on function pg_temp.who(text), pg_temp.t(text,text,text), pg_temp.c(text,text,text), pg_temp.g(text) to authenticated;
set local role authenticated;

-- 1. A person's note ------------------------------------------------------------------------------
select pg_temp.who('00000000-0000-0000-0000-0000000000c1');
select pg_temp.t('01 a writer sends an idea', $q$ insert into v select 'n1', public.feedback_submit('idea', '/work?token=abc#x', 'أقترح ترتيباً آخر للأعمال') $q$, 'ok');
select pg_temp.t('02 an unknown kind is refused', $q$ select public.feedback_submit('rant', '/work', 'نص') $q$, 'ERR KIND_INVALID');
select pg_temp.t('03 an empty note is refused', $q$ select public.feedback_submit('problem', '/work', '   ') $q$, 'ERR TEXT_REQUIRED');
select pg_temp.t('04 a note over 2000 characters is refused', $q$ select public.feedback_submit('problem', '/work', repeat('ن', 2001)) $q$, 'ERR TEXT_TOO_LONG');
select pg_temp.t('05 an error kind cannot be sent as a note', $q$ select public.feedback_submit('error', '/work', 'نص') $q$, 'ERR KIND_INVALID');
reset role;
select pg_temp.c('06 the page keeps its path only', (select page from public.feedback_reports where id = pg_temp.g('n1')::uuid), '/work');
select pg_temp.c('07 and the author is the sender', (select author from public.feedback_reports where id = pg_temp.g('n1')::uuid), 'wri@t.test');
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000c1');
select pg_temp.t('08 a page that is not a path is dropped, not stored', $q$ insert into v select 'n2', public.feedback_submit('question', 'javascript:alert(1)', 'سؤال') $q$, 'ok');
reset role;
select pg_temp.c('09 so it is null', (select coalesce(page, 'null') from public.feedback_reports where id = pg_temp.g('n2')::uuid), 'null');
-- 18 more notes the same day make 20; the 21st is refused.
insert into public.feedback_reports (kind, author, page, body) select 'idea', 'wri@t.test', '/work', 'n' || g from generate_series(1, 18) g;
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000c1');
select pg_temp.t('10 the 21st note in a day is refused', $q$ select public.feedback_submit('idea', '/work', 'زيادة') $q$, 'ERR FEEDBACK_LIMIT');
select pg_temp.who('00000000-0000-0000-0000-0000000000b1');
select pg_temp.t('11 someone else is not affected by that limit', $q$ select public.feedback_submit('idea', '/work', 'من المساعد') $q$, 'ok');

-- 2. What the browser caught -----------------------------------------------------------------------
select pg_temp.who('00000000-0000-0000-0000-0000000000c1');
select pg_temp.t('12 an error is reported', $q$ select public.error_report('/work/CH-1?x=1', 'Cannot read properties of undefined for dept@example.com at /api/x?token=ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef012345 secret ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef012345', 'WorkItem (item.tsx)') $q$, 'ok');
reset role;
select pg_temp.c('13 the e-mail, the token and the query string are scrubbed', (select body from public.feedback_reports where kind = 'error' limit 1), 'Cannot read properties of undefined for [بريد] at /api/x secret [رمز]');
select pg_temp.c('14 and the page loses its query', (select page from public.feedback_reports where kind = 'error' limit 1), '/work/CH-1');
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000b1');
select pg_temp.t('15 the same error from another person', $q$ select public.error_report('/work', 'Cannot read properties of undefined for dept@example.com at /api/x?token=ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef012345 secret ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef012345', 'WorkItem (item.tsx)') $q$, 'ok');
select pg_temp.t('16 a different error', $q$ select public.error_report('/work', 'Another failure', 'Calendar (calendar.tsx)') $q$, 'ok');
reset role;
select pg_temp.c('17 equal errors are one row with a counter', (select count(*)::text || ' ' || max(count)::text from public.feedback_reports where kind = 'error'), '2 2');
select pg_temp.c('18 errors do not use the notes limit', (select count(*)::text from public.feedback_reports where author = 'wri@t.test' and kind <> 'error'), '20');

-- 3. Who reads and marks ------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000c1');
select pg_temp.t('19 a writer cannot read the inbox', $q$ select * from public.feedback_list(50) $q$, 'ERR FORBIDDEN');
select pg_temp.c('20 nor the table', (select count(*)::text from public.feedback_reports), '0');
select pg_temp.who('00000000-0000-0000-0000-0000000000b1');
select pg_temp.t('21 the assistant cannot read it', $q$ select * from public.feedback_list(50) $q$, 'ERR FORBIDDEN');
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
select pg_temp.c('22 the director reads it, new first', (select count(*)::text from public.feedback_list(500)), '23');
select pg_temp.t('23 the director marks an error done', $q$ select public.feedback_mark((select id from public.feedback_list(500) where kind = 'error' and body like 'Another%'), 'done') $q$, 'ok');
select pg_temp.t('24 an unknown state is refused', $q$ select public.feedback_mark((select id from public.feedback_list(500) limit 1), 'archived') $q$, 'ERR STATE_INVALID');
select pg_temp.who('00000000-0000-0000-0000-0000000000b1');
select pg_temp.t('25 the assistant cannot mark', $q$ select public.feedback_mark(gen_random_uuid(), 'seen') $q$, 'ERR FORBIDDEN');
select pg_temp.who('00000000-0000-0000-0000-0000000000c1');
select pg_temp.t('26 the same error after it was done is a new row', $q$ select public.error_report('/work', 'Another failure', 'Calendar (calendar.tsx)') $q$, 'ok');
reset role;
select pg_temp.c('27 so there are two rows of it, one done', (select count(*)::text || ' ' || count(*) filter (where state = 'done')::text from public.feedback_reports where body = 'Another failure'), '2 1');
update public.feedback_reports set state = 'seen' where kind = 'error' and body like 'Cannot read%';
select pg_temp.c('28 an error someone marked seen', (select state from public.feedback_reports where body like 'Cannot read%'), 'seen');
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000c1');
select pg_temp.t('29 it happens again', $q$ select public.error_report('/work', 'Cannot read properties of undefined for dept@example.com at /api/x?token=ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef012345 secret ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef012345', 'WorkItem (item.tsx)') $q$, 'ok');
reset role;
select pg_temp.c('30 and is new again with the count at 3', (select state || ' ' || count::text from public.feedback_reports where body like 'Cannot read%'), 'new 3');
select pg_temp.c('31 anonymous callers cannot call the functions', (select (has_function_privilege('anon', 'public.feedback_submit(text,text,text)', 'execute')
   or has_function_privilege('anon', 'public.error_report(text,text,text)', 'execute')
   or has_function_privilege('anon', 'public.feedback_list(int)', 'execute'))::text), 'false');
select pg_temp.c('32 the scrub helpers are not callable through the API', (select (has_function_privilege('authenticated', 'public.feedback_scrub(text,int)', 'execute'))::text), 'false');

select n, k, v, expect from r where v is distinct from expect
union all select 0, 'TOTAL', count(*)::text, (count(*) filter (where v is not distinct from expect))::text || ' passed' from r
order by n;
rollback;

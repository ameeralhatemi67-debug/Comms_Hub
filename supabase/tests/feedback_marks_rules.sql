-- MVP_draft.md section 69 (migration 20261102180000_feedback_marks.sql): marks, the outline and the context of a note are
-- rebuilt here and never trusted from the browser, private pages lose their words, a note's author reads their own notes
-- and hears when one is handled, and notes merge and separate without losing a row.
-- One transaction, rolled back at the end. Result: qa/feedback-marks-rules.json.
begin;
create temp table r(n serial, k text, v text, expect text);
create temp table v(k text primary key, val text);
grant all on r, v to authenticated; grant usage on sequence r_n_seq to authenticated;
insert into public.accounts (email, display_name, role, pages, protected) values
 ('adm@t.test','Adm','admin','{}',true),('dir@t.test','Dir','director','{}',false),
 ('asst@t.test','Asst','assistant','{}',false),('wri@t.test','Wri','writer','{}',false),('des@t.test','Des','designer','{}',false);
insert into auth.users (id, email, email_confirmed_at) values
 ('00000000-0000-0000-0000-0000000000a1','adm@t.test',now()),('00000000-0000-0000-0000-0000000000d1','dir@t.test',now()),
 ('00000000-0000-0000-0000-0000000000b1','asst@t.test',now()),('00000000-0000-0000-0000-0000000000c1','wri@t.test',now()),
 ('00000000-0000-0000-0000-0000000000e1','des@t.test',now());
create function pg_temp.who(id text) returns void language sql as $$ select set_config('request.jwt.claims', json_build_object('sub',id,'role','authenticated')::text, true) $$;
create function pg_temp.t(k text, sqltext text, e text) returns void language plpgsql as $$
begin
  begin execute sqltext; insert into r(k,v,expect) values (k,'ok',e);
  exception when others then insert into r(k,v,expect) values (k,'ERR '||sqlerrm,e); end;
end $$;
create function pg_temp.c(k text, val text, e text) returns void language sql as $$ insert into r(k,v,expect) values (k,val,e) $$;
create function pg_temp.g(k text) returns text language sql as $$ select val from v where k = $1 $$;
grant execute on function pg_temp.who(text), pg_temp.t(text,text,text), pg_temp.c(text,text,text), pg_temp.g(text) to authenticated;

-- 1. Marks, outline and context --------------------------------------------------------------------------
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000c1');
select pg_temp.t('01 a problem with two marks and an outline', $q$ insert into v select 'n1', public.feedback_submit('problem', '/work/CH-1?x=1', 'الزر لا يستجيب', 'blocking',
  '[{"t":"b","x":100,"y":200,"w":300,"h":50,"el":"زر «إرسال»","sel":"div.actions > button.primary"},{"t":"p","x":500,"y":600,"w":9,"h":9,"el":"رابط «الأعمال»","sel":"nav > a"}]',
  '{"w":1280,"h":900,"r":[[0,0,1280,60,0],[100,200,300,50,1]]}',
  '{"role":"admin","viewAs":"designer","build":"abc1234","app":"desktop","appVersion":"0.6.0","w":1280,"h":900,"dpr":1.25,"theme":"dark","dialog":"نافذة الجدولة","errors":["boom for a@b.co"],"secret":"x"}') $q$, 'ok');
select pg_temp.t('02 a severity outside the three is refused', $q$ select public.feedback_submit('problem', '/work', 'نص', 'urgent') $q$, 'ERR SEVERITY_INVALID');
reset role;
select pg_temp.c('03 the severity is kept', (select severity from public.feedback_reports where id = pg_temp.g('n1')::uuid), 'blocking');
select pg_temp.c('04 both marks are kept', (select jsonb_array_length(marks)::text from public.feedback_reports where id = pg_temp.g('n1')::uuid), '2');
select pg_temp.c('05 a pointer has no size', (select (marks -> 1 ->> 'w') || ' ' || (marks -> 1 ->> 'h') from public.feedback_reports where id = pg_temp.g('n1')::uuid), '0 0');
select pg_temp.c('06 the element is named on an open page', (select marks -> 0 ->> 'el' from public.feedback_reports where id = pg_temp.g('n1')::uuid), 'زر «إرسال»');
select pg_temp.c('07 the role is the account''s, not the browser''s', (select context ->> 'role' from public.feedback_reports where id = pg_temp.g('n1')::uuid), 'writer');
select pg_temp.c('08 an unknown field of the context is gone', (select (context ? 'secret')::text from public.feedback_reports where id = pg_temp.g('n1')::uuid), 'false');
select pg_temp.c('09 an address in an error is scrubbed', (select context -> 'errors' ->> 0 from public.feedback_reports where id = pg_temp.g('n1')::uuid), 'boom for [بريد]');
select pg_temp.c('10 the outline keeps its rectangles', (select jsonb_array_length(outline -> 'r')::text from public.feedback_reports where id = pg_temp.g('n1')::uuid), '2');

set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000c1');
select pg_temp.t('11 an idea takes no severity', $q$ insert into v select 'n2', public.feedback_submit('idea', '/work', 'فكرة', 'blocking') $q$, 'ok');
select pg_temp.t('12 a problem without one is annoying', $q$ insert into v select 'n3', public.feedback_submit('problem', '/work', 'مشكلة') $q$, 'ok');
select pg_temp.t('13 malformed marks are dropped, the note arrives', $q$ insert into v select 'n4', public.feedback_submit('problem', '/work', 'علامات فاسدة', null, '[{"t":"z","x":1},{"t":"b","x":"a","y":1,"w":1,"h":1},7]') $q$, 'ok');
select pg_temp.t('14 four marks become three', $q$ insert into v select 'n5', public.feedback_submit('problem', '/work', 'أربع', null, '[{"t":"p","x":1,"y":1,"w":0,"h":0},{"t":"p","x":2,"y":2,"w":0,"h":0},{"t":"p","x":3,"y":3,"w":0,"h":0},{"t":"p","x":4,"y":4,"w":0,"h":0}]') $q$, 'ok');
select pg_temp.t('15 a position past the edge stops at the edge', $q$ insert into v select 'n6', public.feedback_submit('problem', '/work', 'خارج', null, '[{"t":"b","x":9999,"y":0,"w":9999,"h":1}]') $q$, 'ok');
select pg_temp.t('16 an outline holding words is dropped whole', $q$ insert into v select 'n7', public.feedback_submit('problem', '/work', 'كلمات', null, '[{"t":"p","x":1,"y":1,"w":0,"h":0}]', '{"w":100,"h":100,"r":[[0,0,10,10,"سر"]]}') $q$, 'ok');
select pg_temp.t('17 an outline over 140 lines is dropped whole', $q$ insert into v select 'n8', public.feedback_submit('problem', '/work', 'طويل', null, '[{"t":"p","x":1,"y":1,"w":0,"h":0}]',
  jsonb_build_object('w',100,'h',100,'r',(select jsonb_agg(jsonb_build_array(g,0,1,1,0)) from generate_series(1,141) g))) $q$, 'ok');
select pg_temp.t('18 an outline without marks is not kept', $q$ insert into v select 'n9', public.feedback_submit('problem', '/work', 'بلا علامة', null, null, '{"w":100,"h":100,"r":[[0,0,10,10,0]]}') $q$, 'ok');
select pg_temp.t('19 the old three arguments still work', $q$ select public.feedback_submit('question', '/work', 'سؤال') $q$, 'ok');
reset role;
select pg_temp.c('20 so the idea has none', (select coalesce(severity, 'null') from public.feedback_reports where id = pg_temp.g('n2')::uuid), 'null');
select pg_temp.c('21 and the problem is annoying', (select severity from public.feedback_reports where id = pg_temp.g('n3')::uuid), 'annoying');
select pg_temp.c('22 no marks were stored from malformed ones', (select coalesce(marks::text, 'null') from public.feedback_reports where id = pg_temp.g('n4')::uuid), 'null');
select pg_temp.c('23 three of the four, in order', (select jsonb_array_length(marks)::text || ' ' || (marks -> 2 ->> 'x') from public.feedback_reports where id = pg_temp.g('n5')::uuid), '3 3');
select pg_temp.c('24 stopped at the edge', (select (marks -> 0 ->> 'x') || ' ' || (marks -> 0 ->> 'w') from public.feedback_reports where id = pg_temp.g('n6')::uuid), '1000 1000');
select pg_temp.c('25 no outline with words', (select coalesce(outline::text, 'null') from public.feedback_reports where id = pg_temp.g('n7')::uuid), 'null');
select pg_temp.c('26 no outline that long', (select coalesce(outline::text, 'null') from public.feedback_reports where id = pg_temp.g('n8')::uuid), 'null');
select pg_temp.c('27 no outline without marks', (select coalesce(outline::text, 'null') from public.feedback_reports where id = pg_temp.g('n9')::uuid), 'null');

-- 2. Private pages -----------------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000c1');
select pg_temp.t('28 a note from the mail page', $q$ insert into v select 'p1', public.feedback_submit('problem', '/mail', 'في البريد', null, '[{"t":"p","x":1,"y":1,"w":0,"h":0,"el":"زر «رسالة من سارة»","sel":"li > button"}]', null, '{"dialog":"رسالة سرية"}') $q$, 'ok');
select pg_temp.t('29 a note from messaging', $q$ insert into v select 'p2', public.feedback_submit('problem', '/mail/chat', 'في المراسلة', null, '[{"t":"p","x":1,"y":1,"w":0,"h":0,"el":"زر «غرفة الإدارة»"}]', null, '{"dialog":"غرفة"}') $q$, 'ok');
reset role;
select pg_temp.c('30 on the mail page a mark keeps only its word', (select marks -> 0 ->> 'el' from public.feedback_reports where id = pg_temp.g('p1')::uuid), 'زر');
select pg_temp.c('31 and the window''s title is gone', (select (context ? 'dialog')::text from public.feedback_reports where id = pg_temp.g('p1')::uuid), 'false');
select pg_temp.c('32 messaging too', (select (marks -> 0 ->> 'el') || ' ' || (context ? 'dialog')::text from public.feedback_reports where id = pg_temp.g('p2')::uuid), 'زر false');
select pg_temp.c('33 a page that only starts alike is not private', (select public.feedback_private_page('/mailbox')::text), 'false');

-- 3. A person's own notes ------------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000e1');
select pg_temp.t('34 a designer sends a note', $q$ insert into v select 'd1', public.feedback_submit('problem', '/work', 'من المصمم') $q$, 'ok');
select pg_temp.c('35 and reads only their own', (select count(*)::text from public.feedback_mine(50)), '1');
select pg_temp.t('36 a member cannot merge', $q$ select public.feedback_merge(gen_random_uuid(), null) $q$, 'ERR FORBIDDEN');
select pg_temp.t('37 nor mark', $q$ select public.feedback_mark(gen_random_uuid(), 'done') $q$, 'ERR FORBIDDEN');

-- 4. Handled: the author hears, in the tier that is never pushed ---------------------------------------------
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
select pg_temp.t('38 the director marks a note seen', $q$ select public.feedback_mark(pg_temp.g('d1')::uuid, 'seen') $q$, 'ok');
reset role;
select pg_temp.c('39 seen tells nobody', (select count(*)::text from public.notifications where recipient = 'des@t.test'), '0');
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
select pg_temp.t('40 and then done', $q$ select public.feedback_mark(pg_temp.g('d1')::uuid, 'done') $q$, 'ok');
reset role;
select pg_temp.c('41 done tells the author, as information, leading to their account', (select count(*)::text || ' ' || max(tier) || ' ' || max(go ->> 'page') from public.notifications where recipient = 'des@t.test'), '1 info profile');
select pg_temp.c('42 the notice quotes the note', (select body from public.notifications where recipient = 'des@t.test'), 'عولجت ملاحظتك: «من المصمم»');
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000e1');
select pg_temp.c('44 the author sees it handled', (select state from public.feedback_mine(50)), 'done');
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
select pg_temp.t('45 the director sends and handles their own note', $q$ insert into v select 'me', public.feedback_submit('idea', '/work', 'فكرتي') $q$, 'ok');
select pg_temp.t('46 marks it done', $q$ select public.feedback_mark(pg_temp.g('me')::uuid, 'done') $q$, 'ok');
reset role;
select pg_temp.c('47 and is not told of their own action', (select count(*)::text from public.notifications where recipient = 'dir@t.test'), '0');

-- 5. Merging ---------------------------------------------------------------------------------------------------
delete from public.notifications where recipient like '%@t.test';
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000e1');
select pg_temp.t('48 a second note from the designer', $q$ insert into v select 'm1', public.feedback_submit('problem', '/work', 'نفس المشكلة') $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
select pg_temp.t('49 the director merges it into the writer''s', $q$ select public.feedback_merge(pg_temp.g('m1')::uuid, pg_temp.g('n1')::uuid) $q$, 'ok');
select pg_temp.c('50 the note it joined counts both', (select count::text from public.feedback_list(500) where id = pg_temp.g('n1')::uuid), '2');
select pg_temp.c('51 the merged note keeps its row and points there', (select (duplicate_of = pg_temp.g('n1')::uuid)::text from public.feedback_list(500) where id = pg_temp.g('m1')::uuid), 'true');
select pg_temp.t('52 a merged note cannot be marked on its own', $q$ select public.feedback_mark(pg_temp.g('m1')::uuid, 'done') $q$, 'ERR MERGED');
select pg_temp.t('53 nothing merges into a merged note', $q$ select public.feedback_merge(pg_temp.g('n2')::uuid, pg_temp.g('m1')::uuid) $q$, 'ERR MERGE_INVALID');
select pg_temp.t('54 nor into itself', $q$ select public.feedback_merge(pg_temp.g('n2')::uuid, pg_temp.g('n2')::uuid) $q$, 'ERR MERGE_INVALID');
reset role;
insert into public.feedback_reports (kind, author, page, body, digest) values ('error', 'wri@t.test', '/work', 'boom', repeat('a', 32));
insert into v select 'e1', id::text from public.feedback_reports where kind = 'error';
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
select pg_temp.t('55 an error does not merge', $q$ select public.feedback_merge(pg_temp.g('e1')::uuid, pg_temp.g('n1')::uuid) $q$, 'ERR MERGE_INVALID');
select pg_temp.t('56 nor does a note merge into an error', $q$ select public.feedback_merge(pg_temp.g('n2')::uuid, pg_temp.g('e1')::uuid) $q$, 'ERR MERGE_INVALID');
select pg_temp.t('57 marking the first note done', $q$ select public.feedback_mark(pg_temp.g('n1')::uuid, 'done') $q$, 'ok');
reset role;
select pg_temp.c('58 the merged note follows it', (select state from public.feedback_reports where id = pg_temp.g('m1')::uuid), 'done');
select pg_temp.c('59 and both authors are told', (select count(distinct recipient)::text from public.notifications where recipient like '%@t.test'), '2');
delete from public.notifications where recipient like '%@t.test';
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
select pg_temp.t('60 a late note merges into one already done', $q$ select public.feedback_merge(pg_temp.g('n3')::uuid, pg_temp.g('n1')::uuid) $q$, 'ok');
reset role;
select pg_temp.c('61 so its author is told at once', (select count(*)::text from public.notifications where recipient = 'wri@t.test'), '1');
select pg_temp.c('62 and it is done too', (select state from public.feedback_reports where id = pg_temp.g('n3')::uuid), 'done');
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
select pg_temp.t('63 separating a note', $q$ select public.feedback_merge(pg_temp.g('m1')::uuid, null) $q$, 'ok');
select pg_temp.c('64 brings the count back', (select count::text from public.feedback_list(500) where id = pg_temp.g('n1')::uuid), '2');
select pg_temp.c('65 and it stands alone again', (select coalesce(duplicate_of::text, 'null') from public.feedback_list(500) where id = pg_temp.g('m1')::uuid), 'null');
select pg_temp.t('66 one more note joins the writer''s', $q$ select public.feedback_merge(pg_temp.g('n5')::uuid, pg_temp.g('n1')::uuid) $q$, 'ok');
select pg_temp.t('67 and the writer''s note, with its merged notes, into another', $q$ select public.feedback_merge(pg_temp.g('n1')::uuid, pg_temp.g('n6')::uuid) $q$, 'ok');
select pg_temp.c('68 they move together, one level deep', (select count(*)::text from public.feedback_list(500) where duplicate_of = pg_temp.g('n6')::uuid), '3');
select pg_temp.c('69 the count of the note they joined', (select count::text from public.feedback_list(500) where id = pg_temp.g('n6')::uuid), '4');

-- 6. Who may call what -------------------------------------------------------------------------------------------
reset role;
select pg_temp.c('70 anonymous callers reach none of the functions', (select (has_function_privilege('anon', 'public.feedback_submit(text,text,text,text,jsonb,jsonb,jsonb)', 'execute')
   or has_function_privilege('anon', 'public.feedback_mine(int)', 'execute') or has_function_privilege('anon', 'public.feedback_merge(uuid,uuid)', 'execute')
   or has_function_privilege('anon', 'public.feedback_list(int)', 'execute'))::text), 'false');
select pg_temp.c('71 the cleaning helpers are not callable through the API', (select (has_function_privilege('authenticated', 'public.feedback_clean_marks(jsonb,boolean)', 'execute')
   or has_function_privilege('authenticated', 'public.feedback_clean_outline(jsonb)', 'execute') or has_function_privilege('authenticated', 'public.feedback_clean_context(jsonb,text,boolean)', 'execute')
   or has_function_privilege('authenticated', 'public.feedback_tell(text,text)', 'execute') or has_function_privilege('authenticated', 'public.feedback_private_page(text)', 'execute'))::text), 'false');
select pg_temp.c('72 the old three-argument function is gone', (select (to_regprocedure('public.feedback_submit(text,text,text)') is null)::text), 'true');
select pg_temp.c('73 the table is still closed to everyone', (select count(*)::text from pg_policies where tablename = 'feedback_reports'), '0');

select n, k, v, expect from r where v is distinct from expect
union all select 0, 'TOTAL', count(*)::text, (count(*) filter (where v is not distinct from expect))::text || ' passed' from r
order by n;
rollback;

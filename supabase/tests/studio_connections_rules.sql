-- The studio, third round, Phase 7 (MVP_draft.md 62.12 to 62.14): notes bound to a version with an area,
-- replies and «تم»; the studio told of notes on its files and of a take-over; a project made for a work;
-- a request for a folder the caller cannot see. One transaction, rolled back at the end (the work-number
-- sequence put back). Result: qa/studio-connections-rules.json.
begin;
create temp table s0 as select last_value, is_called from public.work_no_seq;
create temp table r(n serial, k text, v text, expect text);
create temp table v(k text primary key, val text);
grant all on r, v to authenticated; grant usage on sequence r_n_seq to authenticated;
insert into public.accounts (email, display_name, role, pages, protected) values
 ('sc-dir@t.test','مدير','director','{work,motion,media}',false),
 ('sc-ast@t.test','مساعد','assistant','{work,motion,media}',false),
 ('sc-adm@t.test','مسؤول','admin','{work,motion,media}',true),
 ('sc-wri@t.test','كاتب','writer','{work,motion,media}',false);
insert into auth.users (id, email, email_confirmed_at) values
 ('00000000-0000-0000-0000-00000000b1d1','sc-dir@t.test',now()),
 ('00000000-0000-0000-0000-00000000b1e1','sc-ast@t.test',now()),
 ('00000000-0000-0000-0000-00000000b1a1','sc-adm@t.test',now()),
 ('00000000-0000-0000-0000-00000000b1c1','sc-wri@t.test',now());

create function pg_temp.who(id text) returns void language sql as $$ select set_config('request.jwt.claims', json_build_object('sub',id,'role','authenticated')::text, true) $$;
create function pg_temp.t(k text, sqltext text, e text) returns void language plpgsql as $$
begin
  begin execute sqltext; insert into r(k,v,expect) values (k,'ok',e);
  exception when others then insert into r(k,v,expect) values (k,'ERR '||sqlerrm,e); end;
end $$;
create function pg_temp.c(k text, val text, e text) returns void language sql as $$ insert into r(k,v,expect) values (k,val,e) $$;
create function pg_temp.g(k text) returns text language sql as $$ select val from v where k = $1 $$;
grant execute on function pg_temp.t(text,text,text), pg_temp.c(text,text,text), pg_temp.g(text) to authenticated;

-- a file the director exported, seen by all four; a file in a restricted folder only the Admin sees
insert into public.media_grants (folder_id, subject_type, subject, level) values
 ('00000000-0000-0000-0000-0000000000a1','role','director',1), ('00000000-0000-0000-0000-0000000000a1','role','assistant',1), ('00000000-0000-0000-0000-0000000000a1','role','writer',1)
 on conflict do nothing;
select pg_temp.who('00000000-0000-0000-0000-00000000b1d1');
insert into public.media_files (id, drive_file_id, name, mime_type, size_bytes, kind, folder_id, uploaded_by) values
 ('00000000-0000-0000-0000-00000000ba11', 'studio-conn-a', 'تصدير للمراجعة.mp4', 'video/mp4', 1000, 'video', '00000000-0000-0000-0000-0000000000a1', 'sc-dir@t.test');
select pg_temp.who('00000000-0000-0000-0000-00000000b1a1');
insert into public.media_folders (id, name, restricted, created_by) values ('00000000-0000-0000-0000-00000000baf0', 'مجلد خاص', true, 'sc-adm@t.test');
insert into public.media_files (id, drive_file_id, name, mime_type, size_bytes, kind, folder_id, uploaded_by) values
 ('00000000-0000-0000-0000-00000000ba22', 'studio-conn-b', 'لقطة خاصة.mp4', 'video/mp4', 1000, 'video', '00000000-0000-0000-0000-00000000baf0', 'sc-adm@t.test');

set local role authenticated;
-- the director's project and its export
select pg_temp.who('00000000-0000-0000-0000-00000000b1d1');
select pg_temp.t('00a the director''s project', $q$ insert into v select 'P', public.studio_project_create('مقطع المراجعة', 'video', jsonb_build_object('schema',1,'kind','video','sources','[]'::jsonb,'video',jsonb_build_object('ratio','9:16','fps',30,'background','#000000','tracks','[]'::jsonb)))::text $q$, 'ok');
select pg_temp.t('00b exports the file', $q$ select public.studio_export_record(pg_temp.g('P')::uuid, 1, '00000000-0000-0000-0000-00000000ba11', 1, 'video') $q$, 'ok');

select pg_temp.who('00000000-0000-0000-0000-00000000b1e1');
select pg_temp.t('01 the assistant notes a moment of version 1 with an area of the frame', $q$ insert into v select 'N', public.media_note_add('00000000-0000-0000-0000-00000000ba11', 'الشعار يغطي الوجه هنا', 3250, 1, '{"x":0.1,"y":0.2,"w":0.3,"h":0.25}'::jsonb, null)::text $q$, 'ok');
select pg_temp.c('02 the note keeps its exact time, its minutes and seconds, its version and its area', (select at_ms || ' ' || timecode || ' ' || version || ' ' || (area->>'w') from public.media_notes where id = pg_temp.g('N')::uuid), '3250 00:03 1 0.3');
select pg_temp.t('03 an area outside the frame is refused', $q$ select public.media_note_add('00000000-0000-0000-0000-00000000ba11', 'خارج', 0, 1, '{"x":0.8,"y":0,"w":0.5,"h":0.1}'::jsonb, null) $q$, 'ERR NOTE_INVALID');
select pg_temp.t('04 a version the file does not have is refused', $q$ select public.media_note_add('00000000-0000-0000-0000-00000000ba11', 'إصدار', 0, 9, null, null) $q$, 'ERR VERSION_INVALID');

select pg_temp.who('00000000-0000-0000-0000-00000000b1d1');
select pg_temp.c('05 the director, owner of the studio project, is told, and the notice opens the studio', (select tier || ' ' || (go->>'page') || ' ' || (go->>'id' = pg_temp.g('P'))::text from public.notifications where recipient = 'sc-dir@t.test' and body like 'ملاحظة جديدة على «تصدير للمراجعة.mp4»%' order by created_at desc limit 1), 'attention studio true');
select pg_temp.t('06 the director answers the note', $q$ insert into v select 'R', public.media_note_add('00000000-0000-0000-0000-00000000ba11', 'نقلته إلى الزاوية', null, null, null, pg_temp.g('N')::uuid)::text $q$, 'ok');
select pg_temp.c('07 the answer belongs to the note and its version', (select (parent_id = pg_temp.g('N')::uuid)::text || ' ' || version from public.media_notes where id = pg_temp.g('R')::uuid), 'true 1');
select pg_temp.t('08 an answer to an answer is refused (one level)', $q$ select public.media_note_add('00000000-0000-0000-0000-00000000ba11', 'رد على رد', null, null, null, pg_temp.g('R')::uuid) $q$, 'ERR NOTE_INVALID');

select pg_temp.who('00000000-0000-0000-0000-00000000b1c1');
select pg_temp.c('09 the writer, who sees the file, reads the notes', (select count(*)::text from public.media_notes where asset_id = '00000000-0000-0000-0000-00000000ba11'), '2');
select pg_temp.t('10 but cannot mark the assistant''s note done', $q$ select public.media_note_done(pg_temp.g('N')::uuid, true) $q$, 'ERR FORBIDDEN');
select pg_temp.who('00000000-0000-0000-0000-00000000b1d1');
select pg_temp.t('11 the director, a leader, marks it done', $q$ select public.media_note_done(pg_temp.g('N')::uuid, true) $q$, 'ok');
select pg_temp.c('12 done, by the director', (select done_by || ' ' || (done_at is not null)::text from public.media_notes where id = pg_temp.g('N')::uuid), 'sc-dir@t.test true');
select pg_temp.who('00000000-0000-0000-0000-00000000b1e1');
select pg_temp.t('13 its author opens it again', $q$ select public.media_note_done(pg_temp.g('N')::uuid, false) $q$, 'ok');
select pg_temp.c('14 open again', (select coalesce(done_by, '-') from public.media_notes where id = pg_temp.g('N')::uuid), '-');

-- a project made for a work
select pg_temp.who('00000000-0000-0000-0000-00000000b1d1');
select pg_temp.t('15 the director opens a work', $q$ insert into v select 'W', public.work_create(jsonb_build_object('type','video','title','حملة الأحد','due',public.work_today()+5,'stages','[{"n":"المونتاج"}]'::jsonb)) $q$, 'ok');
select pg_temp.t('16 and a studio project made for it', $q$ insert into v select 'PW', public.studio_project_for_work(pg_temp.g('W'), 'video', 'مقطع الحملة', jsonb_build_object('schema',1,'kind','video','sources','[]'::jsonb,'video',jsonb_build_object('ratio','9:16','fps',30,'background','#000000','tracks','[]'::jsonb)))::text $q$, 'ok');
select pg_temp.c('17 the project is linked to the work', (select work_ref from public.studio_projects where id = pg_temp.g('PW')::uuid), (select val from v where k = 'W'));
select pg_temp.who('00000000-0000-0000-0000-00000000b1c1');
select pg_temp.t('18 the writer cannot make one', $q$ select public.studio_project_for_work(pg_temp.g('W'), 'video', 'محاولة', jsonb_build_object('schema',1,'kind','video','sources','[]'::jsonb,'video',jsonb_build_object('ratio','9:16','fps',30,'background','#000000','tracks','[]'::jsonb))) $q$, 'ERR FORBIDDEN');

-- a take-over, and the request for a folder
select pg_temp.who('00000000-0000-0000-0000-00000000b1a1');
select pg_temp.t('19 the Admin takes the editing of the director''s project', $q$ select public.studio_lease(pg_temp.g('P')::uuid, true) $q$, 'ok');
select pg_temp.t('20 the Admin builds a project on the private file', $q$ insert into v select 'PP', public.studio_project_create('مقطع خاص', 'video', jsonb_build_object('schema',1,'kind','video','sources',jsonb_build_array(jsonb_build_object('id','s1','kind','library','asset','00000000-0000-0000-0000-00000000ba22','version',1,'name','لقطة خاصة.mp4','media','video')),'video',jsonb_build_object('ratio','9:16','fps',30,'background','#000000','tracks','[]'::jsonb)))::text $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-00000000b1d1');
select pg_temp.c('21 the director is told the editing was taken', (select count(*)::text from public.notifications where recipient = 'sc-dir@t.test' and tier = 'info' and body like 'تولّى %' and go->>'id' = pg_temp.g('P')), '1');
select pg_temp.t('22 the director asks for the private file''s folder from the project', $q$ insert into v select 'Q', public.studio_request_source_access(pg_temp.g('PP')::uuid, '00000000-0000-0000-0000-00000000ba22', 'أحتاج اللقطة في المقطع')::text $q$, 'ok');
select pg_temp.c('23 a folder-access request is pending, for the director', (select kind || ' ' || status || ' ' || requested_by from public.work_requests where id = pg_temp.g('Q')::uuid), 'access pending sc-dir@t.test');
select pg_temp.t('24 a file the director already sees needs no request', $q$ select public.studio_request_source_access(pg_temp.g('P')::uuid, '00000000-0000-0000-0000-00000000ba11', 'سبب') $q$, 'ERR NOT_FOUND');
select pg_temp.t('25 the older direct insert of a note still works', $q$ insert into public.media_notes (asset_id, author, body, timecode) values ('00000000-0000-0000-0000-00000000ba11', 'sc-dir@t.test', 'ملاحظة قديمة', '00:05') $q$, 'ok');

reset role;
select setval('public.work_no_seq', last_value, is_called) from s0;
select * from (
  select n, k, v, expect from r where v is distinct from expect
  union all select 0, 'TOTAL', count(*)::text, (count(*) filter (where v is not distinct from expect))::text || ' passed' from r) z order by n;
rollback;

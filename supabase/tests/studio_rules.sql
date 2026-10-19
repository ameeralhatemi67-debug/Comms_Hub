-- The studio's project rules (Studio_Build_Plan.md Phase 2, MVP_draft.md 62), checked inside one
-- transaction that is rolled back at the end. Run with the Supabase SQL editor or the MCP execute_sql
-- tool. Throwaway accounts (@t.test) act through row level security. Each check records what happened
-- (v) beside what the rule says (expect); the last query lists only the checks that differ, and the
-- total. Result: qa/studio-rules.json.
begin;
create temp table r(n serial, k text, v text, expect text);
create temp table v(k text primary key, val text);
grant all on r, v to authenticated, anon; grant usage on sequence r_n_seq to authenticated, anon;
insert into public.accounts (email, display_name, role, pages, protected) values
 ('sp-adm@t.test','مسؤول','admin','{}',true),
 ('sp-dir@t.test','مدير','director','{work,motion,media}',false),
 ('sp-asst@t.test','مساعد','assistant','{work,motion,media}',false),
 ('sp-wri@t.test','كاتب','writer','{work,motion,media}',false);
insert into auth.users (id, email, email_confirmed_at) values
 ('00000000-0000-0000-0000-00000000f0a1','sp-adm@t.test',now()),
 ('00000000-0000-0000-0000-00000000f0d1','sp-dir@t.test',now()),
 ('00000000-0000-0000-0000-00000000f0b1','sp-asst@t.test',now()),
 ('00000000-0000-0000-0000-00000000f0c1','sp-wri@t.test',now());

create function pg_temp.who(id text) returns void language sql as $$ select set_config('request.jwt.claims', json_build_object('sub',id,'role','authenticated')::text, true) $$;
create function pg_temp.t(k text, sqltext text, e text) returns void language plpgsql as $$
begin
  begin execute sqltext; insert into r(k,v,expect) values (k,'ok',e);
  exception when others then insert into r(k,v,expect) values (k,'ERR '||sqlerrm,e); end;
end $$;
create function pg_temp.c(k text, val text, e text) returns void language sql as $$ insert into r(k,v,expect) values (k,val,e) $$;
create function pg_temp.g(k text) returns text language sql as $$ select val from v where k = $1 $$;
-- A minimal document of each kind, with the given library sources ([[asset, version], ...]).
create function pg_temp.vdoc(srcs jsonb) returns jsonb language sql as $$
  select jsonb_build_object('schema', 1, 'kind', 'video', 'video', jsonb_build_object('ratio','9:16','fps',30,'background','#000000','tracks', '[]'::jsonb),
    'sources', coalesce((select jsonb_agg(jsonb_build_object('id', 's' || i, 'kind', 'library', 'asset', x->>0, 'version', (x->>1)::int, 'name', 'ملف', 'media', 'video'))
                         from jsonb_array_elements(srcs) with ordinality as e(x, i)), '[]'::jsonb)) $$;
create function pg_temp.pdoc(srcs jsonb) returns jsonb language sql as $$
  select jsonb_build_object('schema', 1, 'kind', 'photo', 'photo', jsonb_build_object('w',1080,'h',1080,'background','#ffffff','layers', '[]'::jsonb),
    'sources', coalesce((select jsonb_agg(jsonb_build_object('id', 's' || i, 'kind', 'library', 'asset', x->>0, 'version', (x->>1)::int, 'name', 'صورة', 'media', 'image'))
                         from jsonb_array_elements(srcs) with ordinality as e(x, i)), '[]'::jsonb)) $$;
grant execute on function pg_temp.t(text,text,text), pg_temp.c(text,text,text), pg_temp.g(text), pg_temp.vdoc(jsonb), pg_temp.pdoc(jsonb) to authenticated, anon;

-- Two library files: A in the unfiled folder, visible to the director by a role grant; B in a
-- restricted folder nobody but the Admin sees. Both uploaded by the Admin.
select pg_temp.who('00000000-0000-0000-0000-00000000f0a1');
insert into public.media_folders (id, parent_id, name, restricted, created_by) values ('00000000-0000-0000-0000-00000000fb01', null, 'سري للاختبار', true, 'sp-adm@t.test');
insert into public.media_grants (folder_id, subject_type, subject, level) values ('00000000-0000-0000-0000-0000000000a1','role','director',1)
  on conflict do nothing;
insert into public.media_files (id, drive_file_id, name, mime_type, size_bytes, kind, folder_id, uploaded_by) values
 ('00000000-0000-0000-0000-00000000fa01', 'studio-test-a', 'مقطع أ.mp4', 'video/mp4', 1000, 'video', '00000000-0000-0000-0000-0000000000a1', 'sp-adm@t.test'),
 ('00000000-0000-0000-0000-00000000fa02', 'studio-test-b', 'صورة ب.png', 'image/png', 1000, 'image', '00000000-0000-0000-0000-00000000fb01', 'sp-adm@t.test');
insert into v values ('A', '00000000-0000-0000-0000-00000000fa01'), ('B', '00000000-0000-0000-0000-00000000fa02');

set local role authenticated;

-- Outside the studio nothing is visible or callable ------------------------------
select pg_temp.who('00000000-0000-0000-0000-00000000f0c1');
select pg_temp.t('01 the writer cannot list projects', $q$ select public.studio_list() $q$, 'ERR FORBIDDEN');
select pg_temp.t('02 nor create one', $q$ select public.studio_project_create('مشروع', 'video', pg_temp.vdoc('[]')) $q$, 'ERR FORBIDDEN');

-- Creating ----------------------------------------------------------------------
select pg_temp.who('00000000-0000-0000-0000-00000000f0d1');
select pg_temp.t('03 the director creates a video project from a file she can see',
  $q$ insert into v select 'P', public.studio_project_create('فيديو الحملة', 'video', pg_temp.vdoc(jsonb_build_array(jsonb_build_array(pg_temp.g('A'), 1))))::text $q$, 'ok');
select pg_temp.t('04 but not from a file in a folder she cannot see',
  $q$ select public.studio_project_create('سري', 'video', pg_temp.vdoc(jsonb_build_array(jsonb_build_array(pg_temp.g('B'), 1)))) $q$, 'ERR SOURCE_DENIED');
select pg_temp.t('05 nor from a version that does not exist',
  $q$ select public.studio_project_create('بلا إصدار', 'video', pg_temp.vdoc(jsonb_build_array(jsonb_build_array(pg_temp.g('A'), 7)))) $q$, 'ERR SOURCE_DENIED');
select pg_temp.t('06 a title is needed', $q$ select public.studio_project_create('   ', 'video', pg_temp.vdoc('[]')) $q$, 'ERR TITLE_INVALID');
select pg_temp.t('07 a document of another schema is refused', $q$ select public.studio_project_create('م', 'video', pg_temp.vdoc('[]') || '{"schema":2}') $q$, 'ERR DOC_INVALID');
select pg_temp.t('08 a document of the other kind is refused', $q$ select public.studio_project_create('م', 'photo', pg_temp.vdoc('[]')) $q$, 'ERR DOC_INVALID');
select pg_temp.t('09 two sources with one id are refused',
  $q$ select public.studio_project_create('م', 'video', jsonb_set(pg_temp.vdoc('[]'), '{sources}', '[{"id":"a","kind":"local","key":"k","name":"x","media":"video","size":1},{"id":"a","kind":"local","key":"k","name":"y","media":"video","size":1}]')) $q$, 'ERR DOC_INVALID');
select pg_temp.t('10 a library source without a real file id is refused',
  $q$ select public.studio_project_create('م', 'video', jsonb_set(pg_temp.vdoc('[]'), '{sources}', '[{"id":"a","kind":"library","asset":"not-a-uuid","version":1,"name":"x","media":"video"}]')) $q$, 'ERR DOC_INVALID');
select pg_temp.t('11 a document above the limit is refused',
  $q$ select public.studio_project_create('كبير', 'video', pg_temp.vdoc('[]') || jsonb_build_object('pad', repeat('x', 1600000))) $q$, 'ERR DOC_TOO_LARGE');
select pg_temp.c('12 the new project is numbered revision 1 and its file is recorded at its version',
  (select p.revision::text || ' ' || (select string_agg(s.asset_id::text || ':' || s.version, ',') from public.studio_sources s where s.project_id = p.id and s.revision = 1)
   from public.studio_projects p where p.id = pg_temp.g('P')::uuid), '1 ' || pg_temp.g('A') || ':1');

select pg_temp.who('00000000-0000-0000-0000-00000000f0a1');
select pg_temp.t('13 the Admin creates a photo project from the restricted file',
  $q$ insert into v select 'Q', public.studio_project_create('صورة سرية', 'photo', pg_temp.pdoc(jsonb_build_array(jsonb_build_array(pg_temp.g('B'), 1))))::text $q$, 'ok');
select pg_temp.c('14 the Admin and the director share the projects', (select jsonb_array_length(public.studio_list()))::text, '2');
select pg_temp.who('00000000-0000-0000-0000-00000000f0d1');
select pg_temp.c('15 the director sees both, with the owner''s name', (select string_agg(e->>'owner_name', ',' order by e->>'owner_name') from jsonb_array_elements(public.studio_list()) e), 'مدير,مسؤول');

-- Saving ------------------------------------------------------------------------
select pg_temp.t('16 an autosave on top of revision 1', $q$ select public.studio_save(pg_temp.g('P')::uuid, 1, pg_temp.vdoc(jsonb_build_array(jsonb_build_array(pg_temp.g('A'), 1))) || '{"note":"أول"}', false) $q$, 'ok');
select pg_temp.t('17 a second autosave', $q$ select public.studio_save(pg_temp.g('P')::uuid, 1, pg_temp.vdoc(jsonb_build_array(jsonb_build_array(pg_temp.g('A'), 1))) || '{"note":"ثان"}', false) $q$, 'ok');
select pg_temp.c('18 the autosave slot was replaced, not added to', (select string_agg(revision::text, ',' order by revision) || ' ' || (select doc->>'note' from public.studio_revisions where project_id = pg_temp.g('P')::uuid and revision = 0)
   from public.studio_revisions where project_id = pg_temp.g('P')::uuid), '0,1 ثان');
select pg_temp.c('19 opening gives the autosave, the newest state', (select (x->>'autosave') || ' ' || (x->'doc'->>'note') from (select public.studio_project_doc(pg_temp.g('P')::uuid) x) y), 'true ثان');
select pg_temp.t('20 an explicit save makes revision 2', $q$ insert into v select 'S2', public.studio_save(pg_temp.g('P')::uuid, 1, pg_temp.vdoc(jsonb_build_array(jsonb_build_array(pg_temp.g('A'), 1))) || '{"note":"ثالث"}', true, 'نسخة للمراجعة')::text $q$, 'ok');
select pg_temp.c('21 revisions 1 and 2 are kept, the autosave slot is empty', (select string_agg(revision::text, ',' order by revision) from public.studio_revisions where project_id = pg_temp.g('P')::uuid), '1,2');
select pg_temp.c('22 revision 1 is unchanged', (select coalesce(doc->>'note', '-') from public.studio_revisions where project_id = pg_temp.g('P')::uuid and revision = 1), '-');
select pg_temp.t('23 a save on top of an old revision is refused', $q$ select public.studio_save(pg_temp.g('P')::uuid, 1, pg_temp.vdoc('[]'), false) $q$, 'ERR STALE_REVISION');

-- One editor at a time ----------------------------------------------------------
select pg_temp.who('00000000-0000-0000-0000-00000000f0a1');
select pg_temp.t('24 the Admin cannot save the director''s project while she edits it', $q$ select public.studio_save(pg_temp.g('P')::uuid, 2, pg_temp.vdoc('[]'), false) $q$, 'ERR NO_LEASE');
select pg_temp.c('25 asking for the lease names who is editing', (select (x->>'mine') || ' ' || (x->>'holder') || ' ' || (x->>'holder_name') from (select public.studio_lease(pg_temp.g('P')::uuid, false) x) y), 'false sp-dir@t.test مدير');
select pg_temp.c('26 taking over (a long press) gives the lease and says from whom', (select (x->>'mine') || ' ' || (x->>'taken_from') from (select public.studio_lease(pg_temp.g('P')::uuid, true) x) y), 'true sp-dir@t.test');
select pg_temp.who('00000000-0000-0000-0000-00000000f0d1');
select pg_temp.t('27 the director''s next save is refused: she drops to reading', $q$ select public.studio_save(pg_temp.g('P')::uuid, 2, pg_temp.vdoc('[]'), false) $q$, 'ERR NO_LEASE');
select pg_temp.t('28 and she cannot archive a project the Admin is editing', $q$ select public.studio_project_archive(pg_temp.g('P')::uuid, true) $q$, 'ERR IN_USE');

-- Sources carried over and new ones ---------------------------------------------
select pg_temp.c('29 the director takes the Admin''s photo project', (select public.studio_lease(pg_temp.g('Q')::uuid, true)->>'mine'), 'true');
select pg_temp.t('30 and saves it with the restricted file she cannot see: carried over, kept', $q$ select public.studio_save(pg_temp.g('Q')::uuid, 1, pg_temp.pdoc(jsonb_build_array(jsonb_build_array(pg_temp.g('B'), 1))), true) $q$, 'ok');
select pg_temp.c('31 the restricted file is recorded for revision 2 from the document itself', (select string_agg(asset_id::text, ',') from public.studio_sources where project_id = pg_temp.g('Q')::uuid and revision = 2), pg_temp.g('B'));
select pg_temp.c('32 the director takes her video project back', (select public.studio_lease(pg_temp.g('P')::uuid, true)->>'mine'), 'true');
select pg_temp.t('33 adding the restricted file to it is refused: new to this project', $q$ select public.studio_save(pg_temp.g('P')::uuid, 2, pg_temp.vdoc(jsonb_build_array(jsonb_build_array(pg_temp.g('A'), 1), jsonb_build_array(pg_temp.g('B'), 1))), false) $q$, 'ERR SOURCE_DENIED');

-- No writes around the functions ------------------------------------------------
select pg_temp.t('34 no direct insert', $q$ insert into public.studio_projects (title, kind, owner, updated_by) values ('x','video','sp-dir@t.test','sp-dir@t.test') $q$, 'ERR new row violates row-level security policy for table "studio_projects"');
update public.studio_projects set title = 'تغيير مباشر' where id = pg_temp.g('P')::uuid;
delete from public.studio_revisions where project_id = pg_temp.g('P')::uuid;
select pg_temp.c('35 a direct update or delete changes nothing', (select p.title || ' ' || (select count(*) from public.studio_revisions x where x.project_id = p.id) from public.studio_projects p where p.id = pg_temp.g('P')::uuid), 'فيديو الحملة 2');

-- Exports -----------------------------------------------------------------------
select pg_temp.t('36 an export record needs a version the caller uploaded', $q$ select public.studio_export_record(pg_temp.g('P')::uuid, 2, pg_temp.g('A')::uuid, 1, 'video') $q$, 'ERR EXPORT_NOT_YOURS');
select pg_temp.who('00000000-0000-0000-0000-00000000f0a1');
select pg_temp.t('37 and a numbered revision, not the autosave slot', $q$ select public.studio_export_record(pg_temp.g('P')::uuid, 0, pg_temp.g('A')::uuid, 1, 'video') $q$, 'ERR NOT_FOUND');
select pg_temp.t('38 the Admin records her upload as the export of revision 2', $q$ select public.studio_export_record(pg_temp.g('P')::uuid, 2, pg_temp.g('A')::uuid, 1, 'video') $q$, 'ok');
select pg_temp.c('39 the project now counts one export', (select e->>'exports' from jsonb_array_elements(public.studio_list()) e where e->>'id' = pg_temp.g('P')), '1');

-- Works and archive -------------------------------------------------------------
select pg_temp.who('00000000-0000-0000-0000-00000000f0d1');
select pg_temp.t('40 a project cannot be linked to a work the caller cannot see', $q$ select public.studio_project_link_work(pg_temp.g('P')::uuid, 'CH-999999') $q$, 'ERR WORK_DENIED');
select pg_temp.t('41a the director closes her video project', $q$ select public.studio_release(pg_temp.g('P')::uuid) $q$, 'ok');
select pg_temp.c('41b releasing the lease frees the project', (select coalesce(lease_holder, '-') from public.studio_projects where id = pg_temp.g('P')::uuid), '-');
select pg_temp.who('00000000-0000-0000-0000-00000000f0a1');
select pg_temp.t('42 the Admin cannot archive the photo project while the director edits it', $q$ select public.studio_project_archive(pg_temp.g('Q')::uuid, true) $q$, 'ERR IN_USE');
select pg_temp.who('00000000-0000-0000-0000-00000000f0d1');
select pg_temp.t('43 the director, who edits it, archives it', $q$ select public.studio_project_archive(pg_temp.g('Q')::uuid, true) $q$, 'ok');
select pg_temp.c('44 an archived project leaves the list and is kept', (select jsonb_array_length(public.studio_list())::text || ' ' || jsonb_array_length(public.studio_list(true))::text), '1 1');
select pg_temp.t('45 an archived project takes no lease', $q$ select public.studio_lease(pg_temp.g('Q')::uuid, false) $q$, 'ERR ARCHIVED');

-- Roles change at the moment of use ---------------------------------------------
select pg_temp.who('00000000-0000-0000-0000-00000000f0b1');
select pg_temp.t('46 the assistant cannot save', $q$ select public.studio_save(pg_temp.g('P')::uuid, 2, pg_temp.vdoc('[]'), false) $q$, 'ERR FORBIDDEN');
select pg_temp.c('47 and reads no project, revision, source or export', (select (select count(*) from public.studio_projects) + (select count(*) from public.studio_revisions) + (select count(*) from public.studio_sources) + (select count(*) from public.studio_exports))::text, '0');
reset role;
update public.accounts set role = 'writer' where email = 'sp-dir@t.test';
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-00000000f0d1');
select pg_temp.t('48 a director made a writer loses the studio at once', $q$ select public.studio_list() $q$, 'ERR FORBIDDEN');
reset role;
set local role anon;
select pg_temp.t('49 anonymous callers cannot reach the functions', $q$ select public.studio_list() $q$, 'ERR permission denied for function studio_list');
reset role;
select pg_temp.c('50 the database export lists the four studio tables, revisions 25 at a time',
  (select count(*)::text || ' ' || (select e->>'page' from jsonb_array_elements(public.backup_table_list('database')) e where e->>'table' = 'studio_revisions')
   from jsonb_array_elements(public.backup_table_list('database')) e where e->>'table' like 'studio\_%'), '4 25');

select * from (
  select n, k, v, expect from r where v is distinct from expect
  union all select 0, 'TOTAL', count(*)::text, (count(*) filter (where v is not distinct from expect))::text || ' passed' from r) z order by n;
rollback;

-- The studio, third round, Phase 1 (MVP_draft.md 62.6): «النسخ», checked inside one transaction that is
-- rolled back at the end. Run with the Supabase SQL editor or the MCP execute_sql tool. The list holds
-- the numbered versions only (never the autosave slot), newest first, with the saver's name, the note and
-- the files exported from each version; a file's name only for those who may see the file; nobody
-- outside the studio reads it. Result: qa/studio-versions-rules.json.
begin;
create temp table r(n serial, k text, v text, expect text);
create temp table v(k text primary key, val text);
grant all on r, v to authenticated; grant usage on sequence r_n_seq to authenticated;
insert into public.accounts (email, display_name, role, pages, protected) values
 ('sv-dir@t.test','مدير','director','{work,motion,media}',false),
 ('sv-wri@t.test','كاتب','writer','{work,motion,media}',false);
insert into auth.users (id, email, email_confirmed_at) values
 ('00000000-0000-0000-0000-00000000e1d1','sv-dir@t.test',now()),
 ('00000000-0000-0000-0000-00000000e1c1','sv-wri@t.test',now());

create function pg_temp.who(id text) returns void language sql as $$ select set_config('request.jwt.claims', json_build_object('sub',id,'role','authenticated')::text, true) $$;
create function pg_temp.t(k text, sqltext text, e text) returns void language plpgsql as $$
begin
  begin execute sqltext; insert into r(k,v,expect) values (k,'ok',e);
  exception when others then insert into r(k,v,expect) values (k,'ERR '||sqlerrm,e); end;
end $$;
create function pg_temp.c(k text, val text, e text) returns void language sql as $$ insert into r(k,v,expect) values (k,val,e) $$;
create function pg_temp.g(k text) returns text language sql as $$ select val from v where k = $1 $$;
grant execute on function pg_temp.t(text,text,text), pg_temp.c(text,text,text), pg_temp.g(text) to authenticated;

-- a file the director exported, in the unfiled folder the director may see; and a file in a restricted
-- folder with no grant at all
select pg_temp.who('00000000-0000-0000-0000-00000000e1d1');
insert into public.media_grants (folder_id, subject_type, subject, level) values
 ('00000000-0000-0000-0000-0000000000a1','role','director',1) on conflict do nothing;
insert into public.media_files (id, drive_file_id, name, mime_type, size_bytes, kind, folder_id, uploaded_by) values
 ('00000000-0000-0000-0000-00000000ea11', 'studio-versions-test', 'تصدير النسخة الأولى.mp4', 'video/mp4', 1000, 'video', '00000000-0000-0000-0000-0000000000a1', 'sv-dir@t.test');
insert into public.media_folders (id, name, restricted, created_by) values
 ('00000000-0000-0000-0000-00000000eaf0', 'مجلد مقيد للاختبار', true, 'sv-wri@t.test');
insert into public.media_files (id, drive_file_id, name, mime_type, size_bytes, kind, folder_id, uploaded_by) values
 ('00000000-0000-0000-0000-00000000ea22', 'studio-versions-test-2', 'ملف مقيد.mp4', 'video/mp4', 1000, 'video', '00000000-0000-0000-0000-00000000eaf0', 'sv-wri@t.test');

set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-00000000e1d1');
select pg_temp.t('01 the director makes a project (version 1)', $q$ insert into v select 'P', public.studio_project_create('مقطع النسخ', 'video', jsonb_build_object('schema',1,'kind','video','sources','[]'::jsonb,'video',jsonb_build_object('ratio','9:16','fps',30,'background','#000000','tracks','[]'::jsonb)))::text $q$, 'ok');
select pg_temp.t('02 saves version 2 with a note', $q$ select public.studio_save(pg_temp.g('P')::uuid, 1, jsonb_build_object('schema',1,'kind','video','sources','[]'::jsonb,'video',jsonb_build_object('ratio','16:9','fps',30,'background','#000000','tracks','[]'::jsonb)), true, 'قبل الإرسال') $q$, 'ok');
select pg_temp.t('03 and an autosave on top', $q$ select public.studio_save(pg_temp.g('P')::uuid, 2, jsonb_build_object('schema',1,'kind','video','sources','[]'::jsonb,'video',jsonb_build_object('ratio','1:1','fps',30,'background','#000000','tracks','[]'::jsonb)), false) $q$, 'ok');
select pg_temp.t('04 an export of version 1 is recorded', $q$ select public.studio_export_record(pg_temp.g('P')::uuid, 1, '00000000-0000-0000-0000-00000000ea11', 1, 'video') $q$, 'ok');
select pg_temp.c('05 the list holds the numbered versions only, newest first', (select string_agg(x->>'revision', ',') from jsonb_array_elements(public.studio_revisions_list(pg_temp.g('P')::uuid)) x), '2,1');
select pg_temp.c('06 with the note and the saver''s name', (select (x->>'note') || ' / ' || (x->>'saved_by_name') from jsonb_array_elements(public.studio_revisions_list(pg_temp.g('P')::uuid)) x where (x->>'revision') = '2'), 'قبل الإرسال / مدير');
select pg_temp.c('07 and the file exported from version 1, by name', (select x->'exports'->0->>'name' from jsonb_array_elements(public.studio_revisions_list(pg_temp.g('P')::uuid)) x where (x->>'revision') = '1'), 'تصدير النسخة الأولى.mp4');
select pg_temp.c('08 an old version still opens as it was', (select public.studio_project_doc(pg_temp.g('P')::uuid, 1)->'doc'->'video'->>'ratio'), '9:16');

reset role;
-- an export record of a file the director may not see (written as the database itself would)
insert into public.studio_exports (project_id, revision, asset_id, version, kind, created_by)
 values ((select val from v where k = 'P')::uuid, 2, '00000000-0000-0000-0000-00000000ea22', 1, 'video', 'sv-wri@t.test');
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-00000000e1d1');
select pg_temp.c('09 a file is named only for someone who may see it',
  (select ((x->'exports'->0->>'name') is null)::text from jsonb_array_elements(public.studio_revisions_list(pg_temp.g('P')::uuid)) x where (x->>'revision') = '2'),
  (select (coalesce(public.media_asset_level('00000000-0000-0000-0000-00000000ea22'), 0) < 1)::text));
select pg_temp.c('09b the restricted file is hidden from the director here', (select (coalesce(public.media_asset_level('00000000-0000-0000-0000-00000000ea22'), 0))::text), '0');

select pg_temp.who('00000000-0000-0000-0000-00000000e1c1');
select pg_temp.t('10 the writer cannot read the versions', $q$ select public.studio_revisions_list(pg_temp.g('P')::uuid) $q$, 'ERR FORBIDDEN');
select pg_temp.who('00000000-0000-0000-0000-00000000e1d1');
select pg_temp.t('11 an unknown project is said as such', $q$ select public.studio_revisions_list('00000000-0000-0000-0000-0000000000ff') $q$, 'ERR NOT_FOUND');

reset role;
select * from (
  select n, k, v, expect from r where v is distinct from expect
  union all select 0, 'TOTAL', count(*)::text, (count(*) filter (where v is not distinct from expect))::text || ' passed' from r) z order by n;
rollback;

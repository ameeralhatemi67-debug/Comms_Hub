-- The studio and the work cycle (Studio_Build_Plan.md Phase 7, MVP_draft.md 62), checked inside one
-- transaction that is rolled back at the end (the work-number sequence is put back as it was). Run with
-- the Supabase SQL editor or the MCP execute_sql tool. A project joins a work; its exported file is
-- linked to the work by the work cycle's own function; the file's studio origin («فتح في الاستوديو») is
-- readable by those who may open the studio only, even when another person sees the file and the work.
-- Result: qa/studio-links-rules.json.
begin;
create temp table s0 as select last_value, is_called from public.work_no_seq;
create temp table r(n serial, k text, v text, expect text);
create temp table v(k text primary key, val text);
grant all on r, v to authenticated; grant usage on sequence r_n_seq to authenticated;
insert into public.accounts (email, display_name, role, pages, protected) values
 ('sl-dir@t.test','مدير','director','{work,motion,media}',false),
 ('sl-wri@t.test','كاتب','writer','{work,motion,media}',false);
insert into auth.users (id, email, email_confirmed_at) values
 ('00000000-0000-0000-0000-00000000f1d1','sl-dir@t.test',now()),
 ('00000000-0000-0000-0000-00000000f1c1','sl-wri@t.test',now());

create function pg_temp.who(id text) returns void language sql as $$ select set_config('request.jwt.claims', json_build_object('sub',id,'role','authenticated')::text, true) $$;
create function pg_temp.t(k text, sqltext text, e text) returns void language plpgsql as $$
begin
  begin execute sqltext; insert into r(k,v,expect) values (k,'ok',e);
  exception when others then insert into r(k,v,expect) values (k,'ERR '||sqlerrm,e); end;
end $$;
create function pg_temp.c(k text, val text, e text) returns void language sql as $$ insert into r(k,v,expect) values (k,val,e) $$;
create function pg_temp.g(k text) returns text language sql as $$ select val from v where k = $1 $$;
grant execute on function pg_temp.t(text,text,text), pg_temp.c(text,text,text), pg_temp.g(text) to authenticated;

-- a file the director exported, in the unfiled folder both may see
select pg_temp.who('00000000-0000-0000-0000-00000000f1d1');
insert into public.media_grants (folder_id, subject_type, subject, level) values
 ('00000000-0000-0000-0000-0000000000a1','role','director',1), ('00000000-0000-0000-0000-0000000000a1','role','writer',1)
 on conflict do nothing;
insert into public.media_files (id, drive_file_id, name, mime_type, size_bytes, kind, folder_id, uploaded_by) values
 ('00000000-0000-0000-0000-00000000fa11', 'studio-link-test', 'تصدير الاستوديو.mp4', 'video/mp4', 1000, 'video', '00000000-0000-0000-0000-0000000000a1', 'sl-dir@t.test');
insert into v values ('A', '00000000-0000-0000-0000-00000000fa11');

set local role authenticated;

select pg_temp.who('00000000-0000-0000-0000-00000000f1d1');
select pg_temp.t('01 the director opens a work', $q$ insert into v select 'W', public.work_create(jsonb_build_object('type','video','title','عمل من الاستوديو','due',public.work_today()+5,'stages','[{"n":"المونتاج"}]'::jsonb)) $q$, 'ok');
select pg_temp.t('02 and a studio project', $q$ insert into v select 'P', public.studio_project_create('مقطع العمل', 'video', jsonb_build_object('schema',1,'kind','video','sources','[]'::jsonb,'video',jsonb_build_object('ratio','9:16','fps',30,'background','#000000','tracks','[]'::jsonb)))::text $q$, 'ok');
select pg_temp.t('03 the project joins the work', $q$ select public.studio_project_link_work(pg_temp.g('P')::uuid, pg_temp.g('W')) $q$, 'ok');
select pg_temp.c('04 the project records its work', (select work_ref from public.studio_projects where id = pg_temp.g('P')::uuid), pg_temp.g('W'));
select pg_temp.t('05 the exported file is recorded against revision 1', $q$ select public.studio_export_record(pg_temp.g('P')::uuid, 1, pg_temp.g('A')::uuid, 1, 'video') $q$, 'ok');
select pg_temp.t('06 and linked to the work by the work cycle', $q$ select public.work_asset_link(pg_temp.g('W'), pg_temp.g('A')::uuid, true) $q$, 'ok');
select pg_temp.c('07 the work now carries the file', (select count(*)::text from public.work_assets where work_id = pg_temp.g('W') and asset_id = pg_temp.g('A')::uuid), '1');
select pg_temp.c('08 the director reads the file''s studio origin (the work page offers «فتح في الاستوديو»)', (select project_id::text from public.studio_exports where asset_id = pg_temp.g('A')::uuid), pg_temp.g('P'));

select pg_temp.who('00000000-0000-0000-0000-00000000f1c1');
select pg_temp.c('09 the writer sees the file in the library', (select count(*)::text from public.media_files where id = pg_temp.g('A')::uuid), '1');
select pg_temp.c('10 but not its studio origin: no «فتح في الاستوديو» for the writer', (select count(*)::text from public.studio_exports where asset_id = pg_temp.g('A')::uuid), '0');
select pg_temp.t('11 nor can the writer link a project to a work', $q$ select public.studio_project_link_work(pg_temp.g('P')::uuid, pg_temp.g('W')) $q$, 'ERR FORBIDDEN');

select pg_temp.who('00000000-0000-0000-0000-00000000f1d1');
select pg_temp.t('12 the director unlinks the project', $q$ select public.studio_project_link_work(pg_temp.g('P')::uuid, null) $q$, 'ok');
select pg_temp.c('13 the project has no work, the file stays in the work', (select coalesce(work_ref, '-') from public.studio_projects where id = pg_temp.g('P')::uuid) || ' ' || (select count(*)::text from public.work_assets where work_id = pg_temp.g('W')), '- 1');

reset role;
select setval('public.work_no_seq', last_value, is_called) from s0;
select * from (
  select n, k, v, expect from r where v is distinct from expect
  union all select 0, 'TOTAL', count(*)::text, (count(*) filter (where v is not distinct from expect))::text || ' passed' from r) z order by n;
rollback;

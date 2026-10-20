-- The studio, third round, Phase 5 (MVP_draft.md 62.10): an export keeps the shape it was made in.
-- One transaction, rolled back at the end. Result: qa/studio-shapes-rules.json.
begin;
create temp table r(n serial, k text, v text, expect text);
create temp table v(k text primary key, val text);
grant all on r, v to authenticated; grant usage on sequence r_n_seq to authenticated;
insert into public.accounts (email, display_name, role, pages, protected) values
 ('ss-dir@t.test','مدير','director','{work,motion,media}',false),
 ('ss-wri@t.test','كاتب','writer','{work,motion,media}',false);
insert into auth.users (id, email, email_confirmed_at) values
 ('00000000-0000-0000-0000-00000000d1d1','ss-dir@t.test',now()),
 ('00000000-0000-0000-0000-00000000d1c1','ss-wri@t.test',now());

create function pg_temp.who(id text) returns void language sql as $$ select set_config('request.jwt.claims', json_build_object('sub',id,'role','authenticated')::text, true) $$;
create function pg_temp.t(k text, sqltext text, e text) returns void language plpgsql as $$
begin
  begin execute sqltext; insert into r(k,v,expect) values (k,'ok',e);
  exception when others then insert into r(k,v,expect) values (k,'ERR '||sqlerrm,e); end;
end $$;
create function pg_temp.c(k text, val text, e text) returns void language sql as $$ insert into r(k,v,expect) values (k,val,e) $$;
create function pg_temp.g(k text) returns text language sql as $$ select val from v where k = $1 $$;
grant execute on function pg_temp.t(text,text,text), pg_temp.c(text,text,text), pg_temp.g(text) to authenticated;

select pg_temp.who('00000000-0000-0000-0000-00000000d1d1');
insert into public.media_grants (folder_id, subject_type, subject, level) values
 ('00000000-0000-0000-0000-0000000000a1','role','director',1) on conflict do nothing;
insert into public.media_files (id, drive_file_id, name, mime_type, size_bytes, kind, folder_id, uploaded_by) values
 ('00000000-0000-0000-0000-00000000da11', 'studio-shapes-a', 'مقطع (1x1).mp4', 'video/mp4', 1000, 'video', '00000000-0000-0000-0000-0000000000a1', 'ss-dir@t.test'),
 ('00000000-0000-0000-0000-00000000da22', 'studio-shapes-b', 'مقطع.mp4', 'video/mp4', 1000, 'video', '00000000-0000-0000-0000-0000000000a1', 'ss-dir@t.test');

set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-00000000d1d1');
select pg_temp.t('01 a project', $q$ insert into v select 'P', public.studio_project_create('أشكال', 'video', jsonb_build_object('schema',1,'kind','video','sources','[]'::jsonb,'video',jsonb_build_object('ratio','9:16','fps',30,'background','#000000','tracks','[]'::jsonb,'shapes',jsonb_build_array('1:1'))))::text $q$, 'ok');
select pg_temp.t('02 an export in the square shape is recorded with it', $q$ select public.studio_export_record(pg_temp.g('P')::uuid, 1, '00000000-0000-0000-0000-00000000da11', 1, 'video', '1:1') $q$, 'ok');
select pg_temp.c('03 the record keeps the shape', (select shape from public.studio_exports where asset_id = '00000000-0000-0000-0000-00000000da11'), '1:1');
select pg_temp.t('04 an older call without a shape still works', $q$ select public.studio_export_record(pg_temp.g('P')::uuid, 1, '00000000-0000-0000-0000-00000000da22', 1, 'video') $q$, 'ok');
select pg_temp.c('05 and records no shape', (select coalesce(shape, '-') from public.studio_exports where asset_id = '00000000-0000-0000-0000-00000000da22'), '-');
select pg_temp.t('06 an unknown shape is refused', $q$ select public.studio_export_record(pg_temp.g('P')::uuid, 1, '00000000-0000-0000-0000-00000000da22', 1, 'video', '2:1') $q$, 'ERR DOC_INVALID');
select pg_temp.c('07 the version list names the shape of each file', (select string_agg(coalesce(e->>'shape', '-'), ',' order by e->>'shape' nulls last) from jsonb_array_elements(public.studio_revisions_list(pg_temp.g('P')::uuid)) x, jsonb_array_elements(x->'exports') e), '1:1,-');
select pg_temp.who('00000000-0000-0000-0000-00000000d1c1');
select pg_temp.t('08 the writer records nothing', $q$ select public.studio_export_record(pg_temp.g('P')::uuid, 1, '00000000-0000-0000-0000-00000000da11', 1, 'video', '1:1') $q$, 'ERR FORBIDDEN');

reset role;
select * from (
  select n, k, v, expect from r where v is distinct from expect
  union all select 0, 'TOTAL', count(*)::text, (count(*) filter (where v is not distinct from expect))::text || ' passed' from r) z order by n;
rollback;

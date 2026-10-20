-- The studio, third round, Phase 6 (MVP_draft.md 62.11): templates and «هوية الاستوديو». One transaction,
-- rolled back at the end. Result: qa/studio-kit-rules.json.
begin;
create temp table r(n serial, k text, v text, expect text);
create temp table v(k text primary key, val text);
grant all on r, v to authenticated; grant usage on sequence r_n_seq to authenticated;
insert into public.accounts (email, display_name, role, pages, protected) values
 ('sk-dir@t.test','مدير','director','{work,motion,media}',false),
 ('sk-adm@t.test','مسؤول','admin','{work,motion,media}',true),
 ('sk-wri@t.test','كاتب','writer','{work,motion,media}',false);
insert into auth.users (id, email, email_confirmed_at) values
 ('00000000-0000-0000-0000-00000000c1d1','sk-dir@t.test',now()),
 ('00000000-0000-0000-0000-00000000c1a1','sk-adm@t.test',now()),
 ('00000000-0000-0000-0000-00000000c1c1','sk-wri@t.test',now());

create function pg_temp.who(id text) returns void language sql as $$ select set_config('request.jwt.claims', json_build_object('sub',id,'role','authenticated')::text, true) $$;
create function pg_temp.t(k text, sqltext text, e text) returns void language plpgsql as $$
begin
  begin execute sqltext; insert into r(k,v,expect) values (k,'ok',e);
  exception when others then insert into r(k,v,expect) values (k,'ERR '||sqlerrm,e); end;
end $$;
create function pg_temp.c(k text, val text, e text) returns void language sql as $$ insert into r(k,v,expect) values (k,val,e) $$;
create function pg_temp.g(k text) returns text language sql as $$ select val from v where k = $1 $$;
grant execute on function pg_temp.t(text,text,text), pg_temp.c(text,text,text), pg_temp.g(text) to authenticated;

-- a file in a restricted folder the director cannot see, used by a template the Admin built
select pg_temp.who('00000000-0000-0000-0000-00000000c1a1');
insert into public.media_folders (id, name, restricted, created_by) values ('00000000-0000-0000-0000-00000000caf0', 'مجلد القوالب المقيد', true, 'sk-adm@t.test');
insert into public.media_files (id, drive_file_id, name, mime_type, size_bytes, kind, folder_id, uploaded_by) values
 ('00000000-0000-0000-0000-00000000ca11', 'studio-kit-a', 'مقدمة.mp4', 'video/mp4', 1000, 'video', '00000000-0000-0000-0000-00000000caf0', 'sk-adm@t.test');
insert into v values ('DOC', jsonb_build_object('schema',1,'kind','video','sources',jsonb_build_array(jsonb_build_object('id','s1','kind','library','asset','00000000-0000-0000-0000-00000000ca11','version',1,'name','مقدمة.mp4','media','video')),'video',jsonb_build_object('ratio','9:16','fps',30,'background','#000000','tracks','[]'::jsonb))::text);

set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-00000000c1a1');
select pg_temp.t('01 the Admin builds a project on a restricted file', $q$ insert into v select 'T', public.studio_project_create('قالب المقدمة', 'video', pg_temp.g('DOC')::jsonb)::text $q$, 'ok');
select pg_temp.t('02 and marks it a template', $q$ select public.studio_project_set_template(pg_temp.g('T')::uuid, true) $q$, 'ok');
select pg_temp.c('03 the studio home shows it as a template', (select x->>'template' from jsonb_array_elements(public.studio_list(false)) x where x->>'id' = pg_temp.g('T')), 'true');

select pg_temp.who('00000000-0000-0000-0000-00000000c1d1');
select pg_temp.c('04 the director cannot see the restricted file', (coalesce(public.media_asset_level('00000000-0000-0000-0000-00000000ca11'), 0))::text, '0');
select pg_temp.t('05 yet makes a project from the template, its file carried', $q$ insert into v select 'N', public.studio_project_copy(pg_temp.g('T')::uuid, null, 'مقطع اليوم')::text $q$, 'ok');
select pg_temp.c('06 the new project is the director''s, version 1, with the template''s document and a note', (select p.owner || ' ' || p.revision || ' ' || (r.doc->'video'->>'ratio') || ' ' || r.note from public.studio_projects p join public.studio_revisions r on r.project_id = p.id and r.revision = 1 where p.id = pg_temp.g('N')::uuid), 'sk-dir@t.test 1 9:16 من «قالب المقدمة»');
select pg_temp.c('07 and records the carried file', (select count(*)::text from public.studio_sources where project_id = pg_temp.g('N')::uuid and asset_id = '00000000-0000-0000-0000-00000000ca11'), '1');
select pg_temp.c('08 the new project is not a template', (select template::text from public.studio_projects where id = pg_temp.g('N')::uuid), 'false');
select pg_temp.t('09 a copy from the new project carries the file again (recorded for it)', $q$ select public.studio_project_copy(pg_temp.g('N')::uuid, 1, 'نسخة ثانية') $q$, 'ok');

select pg_temp.t('10 the brand is saved: named colours and two fonts', $q$ select public.studio_brand_save('[{"name":"أخضر الهوية","hex":"#17634B"},{"name":"ذهبي","hex":"#c9ac70"}]'::jsonb, 'Cairo', 'Tajawal') $q$, 'ok');
select pg_temp.c('11 and read back by those who may open the studio', (select jsonb_array_length(colors) || ' ' || title_font || ' ' || body_font from public.studio_brand), '2 Cairo Tajawal');
select pg_temp.t('12 a colour that is not #rrggbb is refused', $q$ select public.studio_brand_save('[{"name":"خطأ","hex":"green"}]'::jsonb, null, null) $q$, 'ERR BRAND_INVALID');
select pg_temp.t('13 thirteen colours are refused', $q$ select public.studio_brand_save((select jsonb_agg(jsonb_build_object('name','لون '||i,'hex','#000000')) from generate_series(1,13) i), null, null) $q$, 'ERR BRAND_INVALID');

select pg_temp.who('00000000-0000-0000-0000-00000000c1c1');
select pg_temp.c('14 the writer reads no brand', (select count(*)::text from public.studio_brand), '0');
select pg_temp.t('15 nor saves one', $q$ select public.studio_brand_save('[]'::jsonb, null, null) $q$, 'ERR FORBIDDEN');
select pg_temp.t('16 nor copies a template', $q$ select public.studio_project_copy(pg_temp.g('T')::uuid, null, 'محاولة') $q$, 'ERR FORBIDDEN');
select pg_temp.t('17 nor marks one', $q$ select public.studio_project_set_template(pg_temp.g('T')::uuid, false) $q$, 'ERR FORBIDDEN');

reset role;
select pg_temp.c('18 the brand is in the configuration backup', (select (public.backup_table_list('config') @> '[{"table":"studio_brand"}]'::jsonb)::text), 'true');
select * from (
  select n, k, v, expect from r where v is distinct from expect
  union all select 0, 'TOTAL', count(*)::text, (count(*) filter (where v is not distinct from expect))::text || ' passed' from r) z order by n;
rollback;

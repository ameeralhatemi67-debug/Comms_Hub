-- The studio, third round, Phase 8 (MVP_draft.md 62.12): what the studio's connection to a work relies on in
-- the database. A project made for a work keeps the template groups it suggests and a text clip's link to the
-- work's text through the document checks; the studio sends only where work_submit allows (production or
-- changes requested, with the work's accounts); the chapters go only into a copy of a platform the work
-- publishes to. One transaction, rolled back at the end (the work-number sequence put back).
-- Result: qa/studio-worklink-rules.json.
begin;
create temp table s0 as select last_value, is_called from public.work_no_seq;
create temp table r(n serial, k text, v text, expect text);
create temp table v(k text primary key, val text);
grant all on r, v to authenticated; grant usage on sequence r_n_seq to authenticated;
insert into public.accounts (email, display_name, role, pages, protected) values
 ('sw-dir@t.test','مدير','director','{work,motion,media}',false),
 ('sw-wri@t.test','كاتب','writer','{work,motion,media}',false);
insert into auth.users (id, email, email_confirmed_at) values
 ('00000000-0000-0000-0000-00000000c1d1','sw-dir@t.test',now()),
 ('00000000-0000-0000-0000-00000000c1c1','sw-wri@t.test',now());
-- one throwaway Instagram account (there is no sample data in the database)
insert into public.platform_accounts (id, platform, label, handle, added_by) values ('00000000-0000-0000-0000-00000000c1a0','instagram','حساب تجربة','@sw_test','sw-dir@t.test');

create function pg_temp.who(id text) returns void language sql as $$ select set_config('request.jwt.claims', json_build_object('sub',id,'role','authenticated')::text, true) $$;
create function pg_temp.t(k text, sqltext text, e text) returns void language plpgsql as $$
begin
  begin execute sqltext; insert into r(k,v,expect) values (k,'ok',e);
  exception when others then insert into r(k,v,expect) values (k,'ERR '||sqlerrm,e); end;
end $$;
create function pg_temp.c(k text, val text, e text) returns void language sql as $$ insert into r(k,v,expect) values (k,val,e) $$;
create function pg_temp.g(k text) returns text language sql as $$ select val from v where k = $1 $$;
create function pg_temp.doc(n int) returns jsonb language sql as $$
  select jsonb_build_object('schema',1,'kind','video','sources','[]'::jsonb,'suggest',jsonb_build_object('categories',jsonb_build_array('frames','repine')),
    'video',jsonb_build_object('ratio','9:16','fps',30,'background','#000000','tracks',jsonb_build_array(
      jsonb_build_object('id','t1','kind','text','clips',jsonb_build_array(
        jsonb_build_object('id','c1','start',0,'length',5000000,'text',jsonb_build_object('content','نص العمل','font','IBM Plex Sans Arabic','size',56,'weight',500,'color','#ffffff','align','center'),
          'fromWork',jsonb_build_object('work',pg_temp.g('W'),'part','text','n',n)))))))
$$;
grant execute on function pg_temp.t(text,text,text), pg_temp.c(text,text,text), pg_temp.g(text), pg_temp.doc(int) to authenticated;

set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-00000000c1d1');
select pg_temp.t('01 the director opens a video work for themself', $q$ insert into v select 'W', public.work_create(jsonb_build_object('type','video','title','حملة الاستوديو','due',public.work_today()+5,'assignee','sw-dir@t.test','stages','[{"n":"المونتاج"}]'::jsonb)) $q$, 'ok');
select pg_temp.t('02 «فتح في الاستوديو»: a project made for it, with its suggested template groups and the work''s text on a clip', $q$ insert into v select 'P', public.studio_project_for_work(pg_temp.g('W'), 'video', 'مقطع الحملة', pg_temp.doc(1))::text $q$, 'ok');
select pg_temp.c('03 the project is linked, and its first version keeps the groups and the text''s version', (select (p.work_ref = pg_temp.g('W'))::text || ' ' || (r.doc->'suggest'->'categories'->>0) || ',' || (r.doc->'suggest'->'categories'->>1) || ' ' || (r.doc->'video'->'tracks'->0->'clips'->0->'fromWork'->>'n') from public.studio_projects p join public.studio_revisions r on r.project_id = p.id and r.revision = 1 where p.id = pg_temp.g('P')::uuid), 'true frames,repine 1');
select pg_temp.t('04 «تحديث» to the work''s newer text autosaves', $q$ select public.studio_save(pg_temp.g('P')::uuid, 1, pg_temp.doc(2), false) $q$, 'ok');
select pg_temp.c('05 the autosave slot holds the newer version', (select doc->'video'->'tracks'->0->'clips'->0->'fromWork'->>'n' from public.studio_revisions where project_id = pg_temp.g('P')::uuid and revision = 0), '2');
select pg_temp.t('06 a draft work is not sent to review (the studio offers sending only from production or changes requested)', $q$ select public.work_submit(pg_temp.g('W'), 'من الاستوديو: النسخة 1', null, null) $q$, 'ERR STATUS_DENIED');
select pg_temp.t('07 the work starts', $q$ select public.work_start(pg_temp.g('W')) $q$, 'ok');
select pg_temp.t('08 a publishable work with no accounts is not sent (the studio says to choose them on the work''s page first)', $q$ select public.work_submit(pg_temp.g('W'), 'من الاستوديو: النسخة 1', '{}', null) $q$, 'ERR CHANNEL_REQUIRED');
select pg_temp.t('09 a past proposed time is refused (the studio says to change it on the work''s page)', $q$ select public.work_submit(pg_temp.g('W'), 'من الاستوديو: النسخة 1', array['00000000-0000-0000-0000-00000000c1a0'::uuid], now() - interval '1 day') $q$, 'ERR DATE_PAST');
select pg_temp.t('10 the chapters go only into the copy of a platform the work publishes to', $q$ select public.work_text_save(pg_temp.g('W'), 'youtube', '00:00 البداية', 'فصول من الاستوديو') $q$, 'ERR PLATFORM_NOT_CHOSEN');
select pg_temp.who('00000000-0000-0000-0000-00000000c1c1');
select pg_temp.c('11 a writer does not even see that the work has a studio project', (select count(*)::text from public.studio_projects where work_ref = pg_temp.g('W')), '0');
select pg_temp.t('12 nor can make one for it', $q$ select public.studio_project_for_work(pg_temp.g('W'), 'video', 'محاولة', pg_temp.doc(1)) $q$, 'ERR FORBIDDEN');

reset role;
select setval('public.work_no_seq', last_value, is_called) from s0;
select * from (
  select n, k, v, expect from r where v is distinct from expect
  union all select 0, 'TOTAL', count(*)::text, (count(*) filter (where v is not distinct from expect))::text || ' passed' from r) z order by n;
rollback;

-- Platform registry, Step S5 (Settings_Integrations_Plan.md 8.1, 8.4, 8.5, migration
-- 20261014150000_platform_registry.sql): the seeded rows equal what the constraints said, the
-- foreign keys hold, only the platforms right writes the registry, a new platform is a row
-- the work cycle already understands (accounts, copies, the video-only rule, the order of
-- copies), a platform in use cannot be removed or switched off, the built-in ones keep their
-- names, and the log is append-only. One transaction, rolled back at the end. The existing
-- work and approval rule runs are re-run separately and must be unchanged.
-- Result: qa/platform-rules.json.
begin;
create temp table s0 as select last_value, is_called from public.work_no_seq;
create temp table r(n serial, k text, v text, expect text);
create temp table v(k text primary key, val text);
grant all on r, v to authenticated; grant usage on sequence r_n_seq to authenticated;
insert into public.accounts (email, display_name, role, protected) values
 ('adm@t.test','Adm','admin',true),('dir@t.test','Dir','director',false),('wri@t.test','Wri','writer',false),
 ('pub@t.test','Pub','publisher',false);
insert into auth.users (id, email, email_confirmed_at) values
 ('00000000-0000-0000-0000-00000000aa01','adm@t.test',now()),('00000000-0000-0000-0000-00000000d001','dir@t.test',now()),
 ('00000000-0000-0000-0000-00000000b001','wri@t.test',now()),('00000000-0000-0000-0000-00000000c001','pub@t.test',now());
create function pg_temp.who(id text) returns void language sql as $$ select set_config('request.jwt.claims', json_build_object('sub',id,'role','authenticated')::text, true) $$;
create function pg_temp.t(k text, sqltext text, e text) returns void language plpgsql as $$
begin
  begin execute sqltext; insert into r(k,v,expect) values (k,'ok',e);
  exception when others then insert into r(k,v,expect) values (k,'ERR '||sqlerrm,e); end;
end $$;
create function pg_temp.c(k text, val text, e text) returns void language sql as $$ insert into r(k,v,expect) values (k,val,e) $$;
create function pg_temp.g(k text) returns text language sql as $$ select val from v where k = $1 $$;
grant execute on function pg_temp.who(text), pg_temp.t(text,text,text), pg_temp.c(text,text,text), pg_temp.g(text) to authenticated;

-- The seed -----------------------------------------------------------------------------------------
select pg_temp.c('01 the five rows, with the labels the interface already used',
  (select string_agg(key || ':' || label_ar || ':' || kind || ':' || sort || ':' || coalesce(accepts->>'video_only', '-'), ',' order by sort, key) from public.platforms where builtin),
  'mail:البريد:mail:0:false,instagram:إنستغرام:social:1:false,x:X:social:2:false,linkedin:لينكدإن:social:3:false,youtube:يوتيوب:social:4:true');
select pg_temp.c('02 nothing but the simulation exists as an adapter, and all five are built in',
  (select count(*)::text || ':' || count(*) filter (where adapter = 'simulated')::text || ':' || count(*) filter (where builtin)::text from public.platforms), '5:5:5');
select pg_temp.t('03 an account for an unknown platform is refused by the table itself',
  $q$ insert into public.platform_accounts (platform, label, handle, added_by) values ('nope', 'x', '@x', 'seed') $q$, 'ERR insert or update on table "platform_accounts" violates foreign key constraint');
select pg_temp.c('05 no function carries the old fixed list any more',
  (select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind = 'f' and p.prosrc like '%''instagram'',''x'',''linkedin''%'), '0');

set local role authenticated;
-- Who may write ------------------------------------------------------------------------------------
select pg_temp.who('00000000-0000-0000-0000-00000000b001');
select pg_temp.c('06 a writer reads the registry', (select count(*)::text from public.platforms), '5');
select pg_temp.t('07 but cannot save a platform', $q$ select public.platform_save('facebook', '{"label_ar":"فيسبوك"}') $q$, 'ERR FORBIDDEN');
select pg_temp.t('08 nor set readiness', $q$ select public.platform_set_readiness('x', 'submitted', null) $q$, 'ERR FORBIDDEN');
select pg_temp.t('09 nor switch one off', $q$ select public.platform_set_enabled('x', false) $q$, 'ERR FORBIDDEN');
select pg_temp.t('10 nor read the log', $q$ select public.platform_log('x') $q$, 'ERR FORBIDDEN');
select pg_temp.c('10b nor the event table directly (no policy)', (select count(*)::text from public.platform_events), '0');
select pg_temp.who('00000000-0000-0000-0000-00000000d001');
select pg_temp.t('11 the director has no platforms right by default', $q$ select public.platform_save('facebook', '{"label_ar":"فيسبوك"}') $q$, 'ERR FORBIDDEN');

-- The administrator adds a platform ---------------------------------------------------------------------------
select pg_temp.who('00000000-0000-0000-0000-00000000aa01');
select pg_temp.t('12 a key with a space is refused', $q$ select public.platform_save('Bad Key', '{"label_ar":"س"}') $q$, 'ERR PLATFORM_KEY_INVALID');
select pg_temp.t('13 a label is required', $q$ select public.platform_save('facebook', '{"label_ar":"  "}') $q$, 'ERR LABEL_REQUIRED');
select pg_temp.t('14 a mode must be one of the three', $q$ select public.platform_save('facebook', '{"label_ar":"فيسبوك","publish_mode":"zzz"}') $q$, 'ERR MODE_INVALID');
select pg_temp.t('15 a documentation link must be https', $q$ select public.platform_save('facebook', '{"label_ar":"فيسبوك","docs_url":"http://x.example/a"}') $q$, 'ERR URL_INVALID');
select pg_temp.t('16 the platform is added', $q$ insert into v select 'fb', public.platform_save('facebook', '{"label_ar":"فيسبوك","publish_mode":"assisted","requires_review":true,"docs_url":"https://developers.facebook.com/docs/"}') $q$, 'ok');
select pg_temp.c('16b it is off, not built in, sorted after the others, simulated',
  (select enabled::text || ':' || builtin::text || ':' || sort || ':' || kind || ':' || adapter || ':' || publish_mode || ':' || readiness from public.platforms where key = 'facebook'),
  'false:false:5:social:simulated:assisted:not_started');
select pg_temp.c('16c and the log has one created line by the administrator',
  (select count(*)::text || ':' || min(e->>'actor') from jsonb_array_elements(public.platform_log('facebook', 50)) e where e->>'kind' = 'created'), '1:adm@t.test');

-- Accounts and copies on it ----------------------------------------------------------------------------------------
select pg_temp.who('00000000-0000-0000-0000-00000000d001');
select pg_temp.t('17 an account cannot be added while the platform is off', $q$ select public.account_save(null, '{"platform":"facebook","label":"الصفحة","handle":"@t.fb","publishers":["pub@t.test"]}') $q$, 'ERR PLATFORM_INVALID');
select pg_temp.t('18 nor for the shared mailbox', $q$ select public.account_save(null, '{"platform":"mail","label":"م","handle":"@m","publishers":["pub@t.test"]}') $q$, 'ERR PLATFORM_INVALID');
select pg_temp.who('00000000-0000-0000-0000-00000000aa01');
select pg_temp.t('19 the administrator switches it on', $q$ select public.platform_set_enabled('facebook', true) $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-00000000d001');
select pg_temp.t('20 the director adds an account on it', $q$ insert into v select 'fbacc', public.account_save(null, '{"platform":"facebook","label":"الصفحة","handle":"@t.fb","publishers":["pub@t.test"],"mode":"auto"}')::text $q$, 'ok');
select pg_temp.c('20b its name shows the registry label', (select public.work_account_name(pg_temp.g('fbacc')::uuid)), 'فيسبوك · الصفحة');
select pg_temp.who('00000000-0000-0000-0000-00000000b001');
select pg_temp.t('21 a writer makes a post for it', $q$ insert into v select 'W', public.work_create(jsonb_build_object('type','post','title','منشور فيسبوك',
  'due',public.work_today()+5,'assignee','wri@t.test','channels',jsonb_build_array(pg_temp.g('fbacc')),'main','النص','start',true,
  'stages','[{"n":"كتابة"}]'::jsonb)) $q$, 'ok');
select pg_temp.t('22 and writes its copy', $q$ select public.work_text_save(pg_temp.g('W'), 'facebook', 'نسخة فيسبوك', null) $q$, 'ok');
select pg_temp.t('22b a platform that is not a social one is not a copy target', $q$ select public.work_text_save(pg_temp.g('W'), 'mail', 'x', null) $q$, 'ERR FORBIDDEN');
select pg_temp.c('22c the copy is a part with the registry label and the registry order',
  (select string_agg(label || ':' || ord, ',' order by ord) from public.work_view_parts(pg_temp.g('W')) where key = 'v:facebook'), 'نسخة فيسبوك:15');

-- The video-only rule is data -----------------------------------------------------------------------------------------
select pg_temp.who('00000000-0000-0000-0000-00000000aa01');
select pg_temp.t('23 the administrator makes it video only', $q$ select public.platform_save('facebook', '{"label_ar":"فيسبوك","video_only":true}') $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-00000000b001');
select pg_temp.t('24 a post for it without a video is refused, with the same code as YouTube', $q$ select public.work_create(jsonb_build_object('type','post','title','x','due',public.work_today()+5,
  'assignee','wri@t.test','channels',jsonb_build_array(pg_temp.g('fbacc')),'stages','[{"n":"أ"}]'::jsonb)) $q$, 'ERR YOUTUBE_VIDEO_ONLY');
select pg_temp.t('25 a video work is accepted', $q$ select public.work_create(jsonb_build_object('type','video','title','فيديو','due',public.work_today()+5,
  'assignee','wri@t.test','channels',jsonb_build_array(pg_temp.g('fbacc')),'stages','[{"n":"أ"}]'::jsonb)) $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-00000000aa01');
select pg_temp.t('26 and the rule can be lifted again', $q$ select public.platform_save('facebook', '{"label_ar":"فيسبوك","video_only":false}') $q$, 'ok');

-- In use, built in ------------------------------------------------------------------------------------------------------
select pg_temp.c('27 impact says what removing it would touch', (public.platform_impact('facebook')->>'accounts') || ':' || (public.platform_impact('facebook')->>'active_accounts') || ':' ||
  (public.platform_impact('facebook')->>'open_works') || ':' || (public.platform_impact('facebook')->>'copies'), '1:1:2:1');
select pg_temp.t('28 a platform with an active account cannot be switched off', $q$ select public.platform_set_enabled('facebook', false) $q$, 'ERR PLATFORM_IN_USE');
select pg_temp.t('29 nor deleted', $q$ select public.platform_delete('facebook') $q$, 'ERR PLATFORM_IN_USE');
select pg_temp.t('30 a built-in one cannot be deleted', $q$ select public.platform_delete('instagram') $q$, 'ERR PLATFORM_BUILTIN');
select pg_temp.t('31 the shared mailbox cannot be switched off', $q$ select public.platform_set_enabled('mail', false) $q$, 'ERR PLATFORM_BUILTIN');
select pg_temp.t('32 nor made video only', $q$ select public.platform_save('mail', '{"label_ar":"البريد","video_only":true}') $q$, 'ERR PLATFORM_BUILTIN');
select pg_temp.t('33 a built-in platform keeps its name whatever is sent', $q$ select public.platform_save('instagram', '{"label_ar":"اسم آخر","publish_mode":"manual"}') $q$, 'ok');
select pg_temp.c('33b label kept, mode changed', (select label_ar || ':' || publish_mode from public.platforms where key = 'instagram'), 'إنستغرام:manual');
select pg_temp.t('34 an unknown platform is refused', $q$ select public.platform_set_enabled('nope', true) $q$, 'ERR UNKNOWN_PLATFORM');

-- Readiness and the log ---------------------------------------------------------------------------------------------------
select pg_temp.t('35 a readiness state outside the five is refused', $q$ select public.platform_set_readiness('facebook', 'done', null) $q$, 'ERR READINESS_INVALID');
select pg_temp.t('36 readiness moves with a note', $q$ select public.platform_set_readiness('facebook', 'submitted', 'قُدّم التطبيق للمراجعة') $q$, 'ok');
select pg_temp.c('36b it is recorded with who and when', (select readiness || ':' || readiness_note || ':' || readiness_by || ':' || (readiness_at is not null)::text from public.platforms where key = 'facebook'),
  'submitted:قُدّم التطبيق للمراجعة:adm@t.test:true');
select pg_temp.t('37 the same state and note again writes nothing new', $q$ select public.platform_set_readiness('facebook', 'submitted', 'قُدّم التطبيق للمراجعة') $q$, 'ok');
select pg_temp.c('37b one readiness line', (select count(*)::text from jsonb_array_elements(public.platform_log('facebook', 50)) e where e->>'kind' = 'readiness'), '1');
select pg_temp.c('38 the log is read newest first, with the name of the person',
  (select (e->>'kind') || ':' || (e->>'actor_name') from jsonb_array_elements(public.platform_log('facebook', 5)) e limit 1), 'readiness:Adm');

-- Removing what nothing used ---------------------------------------------------------------------------------------------------
select pg_temp.t('39 a platform nothing used is added', $q$ select public.platform_save('tmp1', '{"label_ar":"مؤقت"}') $q$, 'ok');
select pg_temp.c('39b with the next sort', (select sort::text from public.platforms where key = 'tmp1'), '6');
select pg_temp.t('40 and deleted', $q$ select public.platform_delete('tmp1') $q$, 'ok');
select pg_temp.c('40b the row is gone and the log remembers', (select count(*)::text from public.platforms where key = 'tmp1') || ':' ||
  (select count(*)::text from jsonb_array_elements(public.platform_log('tmp1', 50)) e where e->>'kind' = 'deleted'), '0:1');

reset role;
select pg_temp.t('40c a copy for an unknown platform is refused by the table itself',
  $q$ insert into public.work_variants (work_id, platform, n, body, author) values (pg_temp.g('W'), 'nope', 1, 'x', 'seed') $q$, 'ERR insert or update on table "work_variants" violates foreign key constraint');
select pg_temp.t('41 the log cannot be edited', $q$ update public.platform_events set actor = 'x' $q$, 'ERR APPEND_ONLY');
select pg_temp.t('42 nor emptied', $q$ delete from public.platform_events $q$, 'ERR APPEND_ONLY');
select setval('public.work_no_seq', last_value, is_called) from s0;

select * from (
  select n, k, v, expect from r where not coalesce(v = expect or (expect like 'ERR%' and v like expect || '%'), false)
  union all select 0, 'TOTAL', count(*)::text, (count(*) filter (where coalesce(v = expect or (expect like 'ERR%' and v like expect || '%'), false)))::text || ' passed' from r) z order by n;
rollback;

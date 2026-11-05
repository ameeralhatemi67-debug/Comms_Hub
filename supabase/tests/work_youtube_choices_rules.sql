-- MVP_draft.md section 78 (migration 20261105230000_work_youtube_choices.sql): YouTube's four choices in the work cycle. Who sets a
-- YouTube account's default and what it may be; that «نشر الآن» records each YouTube account's choice, the asked one or the default
-- or «عام», and refuses anything else; that each account's result says how it went out and the notice says a narrower one; that a
-- scheduled work goes out «عام» at its time; that a retry keeps the choice; that the two-argument form still works; and what a page
-- may read and call. Only throwaway accounts (@t.test) are touched. One transaction, rolled back at the end.
-- Result: qa/work-youtube-choices-rules.json.
begin;
create temp table r(n serial, k text, v text, expect text);
create temp table v(k text primary key, val text);
grant all on r, v to authenticated; grant usage on sequence r_n_seq to authenticated;
insert into public.accounts (email, display_name, role, protected) values
 ('dir@t.test','Dir','director',false),('wri@t.test','Wri','writer',false),('pub@t.test','Pub','publisher',false);
insert into auth.users (id, email, email_confirmed_at) values
 ('00000000-0000-0000-0000-00000000d001','dir@t.test',now()),('00000000-0000-0000-0000-00000000b001','wri@t.test',now()),
 ('00000000-0000-0000-0000-00000000c001','pub@t.test',now());
insert into public.platforms (key, label_ar, kind, sort, enabled) values ('youtube', 'يوتيوب', 'social', 4, true) on conflict (key) do nothing;
insert into public.platforms (key, label_ar, kind, sort, enabled) values ('instagram', 'إنستغرام', 'social', 1, true) on conflict (key) do nothing;
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

-- 1. The account's default ---------------------------------------------------------------------------------------------------
select pg_temp.who('00000000-0000-0000-0000-00000000d001');
select pg_temp.t('00a the director adds two YouTube channels and an Instagram account', $q$
  insert into v select 'yt1', public.account_save(null, '{"platform":"youtube","label":"القناة","handle":"@t_one","publishers":["pub@t.test"],"mode":"auto"}')::text
  union all select 'yt2', public.account_save(null, '{"platform":"youtube","label":"المراجعة","handle":"@t_two","publishers":["pub@t.test"],"mode":"auto"}')::text
  union all select 'yt3', public.account_save(null, '{"platform":"youtube","label":"الثالثة","handle":"@t_three","publishers":["pub@t.test"],"mode":"auto"}')::text
  union all select 'ig', public.account_save(null, '{"platform":"instagram","label":"الرسمي","handle":"@t.ig","publishers":["pub@t.test"],"mode":"auto"}')::text $q$, 'ok');
select pg_temp.t('01 the director makes a channel «غير مدرج» by default', $q$ select public.account_set_privacy(pg_temp.g('yt2')::uuid, 'unlisted') $q$, 'ok');
select pg_temp.t('02 not on Instagram, which has no such choice', $q$ select public.account_set_privacy(pg_temp.g('ig')::uuid, 'unlisted') $q$, 'ERR FORBIDDEN');
select pg_temp.t('03 «مجدول» is not a default', $q$ select public.account_set_privacy(pg_temp.g('yt1')::uuid, 'scheduled') $q$, 'ERR OPTIONS_INVALID');
select pg_temp.t('04 «عام» set on a channel', $q$ select public.account_set_privacy(pg_temp.g('yt3')::uuid, 'public') $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-00000000c001');
select pg_temp.t('05 the publisher may not set a default', $q$ select public.account_set_privacy(pg_temp.g('yt1')::uuid, 'private') $q$, 'ERR FORBIDDEN');
reset role;
select pg_temp.c('06 kept: «غير مدرج» on one, «عام» as no default on the others', (select string_agg(coalesce(default_privacy, '-'), ',' order by label)
  from public.platform_accounts where id in (pg_temp.g('yt1')::uuid, pg_temp.g('yt2')::uuid, pg_temp.g('yt3')::uuid)), '-,-,unlisted');

-- Works placed straight in the states the send step starts from: video works, so a YouTube copy fits.
insert into public.works (id, no, title, type, status, created_by, assignee, due, channels, pub_mode, sched_at) values
 ('CH-9101', 9101, 'فيديو على ثلاثة حسابات', 'video', 'APPROVED', 'wri@t.test', 'wri@t.test', current_date + 5, array[pg_temp.g('yt1')::uuid, pg_temp.g('yt2')::uuid, pg_temp.g('ig')::uuid], 'auto', null),
 ('CH-9102', 9102, 'فيديو بلا اختيار', 'video', 'APPROVED', 'wri@t.test', 'wri@t.test', current_date + 5, array[pg_temp.g('yt1')::uuid], 'auto', null),
 ('CH-9103', 9103, 'فيديو حان موعده', 'video', 'SCHEDULED', 'wri@t.test', 'wri@t.test', current_date + 5, array[pg_temp.g('yt2')::uuid], 'auto', now() - interval '1 hour'),
 ('CH-9104', 9104, 'فيديو لاختيارات مرفوضة', 'video', 'APPROVED', 'wri@t.test', 'wri@t.test', current_date + 5, array[pg_temp.g('yt1')::uuid], 'auto', null),
 ('CH-9105', 9105, 'فيديو يفشل ثم يعاد', 'video', 'APPROVED', 'wri@t.test', 'wri@t.test', current_date + 5, array[pg_temp.g('yt3')::uuid], 'auto', null),
 ('CH-9106', 9106, 'فيديو مجدول يُلغى', 'video', 'SCHEDULED', 'wri@t.test', 'wri@t.test', current_date + 5, array[pg_temp.g('yt1')::uuid], 'auto', now() + interval '3 days');
insert into public.work_texts (work_id, n, body, author)
  select id, 1, 'عنوان الفيديو', 'wri@t.test' from public.works where id in ('CH-9101','CH-9102','CH-9103','CH-9104','CH-9105','CH-9106');
update public.platform_accounts set authorized_until = now() - interval '1 day' where id = pg_temp.g('yt3')::uuid;

-- 2. «نشر الآن» ----------------------------------------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-00000000c001');
select pg_temp.t('07 an account that is not YouTube takes no choice', $q$ select public.work_publish('CH-9104', 'now', jsonb_build_object(pg_temp.g('ig'), 'unlisted')) $q$, 'ERR OPTIONS_INVALID');
select pg_temp.t('08 nor a YouTube account that is not the work''s', $q$ select public.work_publish('CH-9104', 'now', jsonb_build_object(pg_temp.g('yt2'), 'unlisted')) $q$, 'ERR OPTIONS_INVALID');
select pg_temp.t('09 «مجدول» is not a choice for now', $q$ select public.work_publish('CH-9104', 'now', jsonb_build_object(pg_temp.g('yt1'), 'scheduled')) $q$, 'ERR OPTIONS_INVALID');
select pg_temp.t('10 a choice that is not a word', $q$ select public.work_publish('CH-9104', 'now', jsonb_build_object(pg_temp.g('yt1'), true)) $q$, 'ERR OPTIONS_INVALID');
select pg_temp.t('11 choices that are not a map', $q$ select public.work_publish('CH-9104', 'now', '["unlisted"]'::jsonb) $q$, 'ERR OPTIONS_INVALID');
select pg_temp.t('12 choices go with «نشر الآن» only', $q$ select public.work_publish('CH-9106', 'unschedule', '{}'::jsonb) $q$, 'ERR OPTIONS_INVALID');
reset role;
select pg_temp.c('13 a refused choice changed nothing', (select status || ' ' || pub_options::text || ' ' || results::text from public.works where id = 'CH-9104'), 'APPROVED {} {}');
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-00000000c001');
select pg_temp.t('14 published now: one channel «خاص», the other left to its default', $q$ select public.work_publish('CH-9101', 'now', jsonb_build_object(pg_temp.g('yt1'), 'private')) $q$, 'ok');
reset role;
select pg_temp.c('15 every YouTube account''s choice is kept, and nothing for Instagram', (select (pub_options->>pg_temp.g('yt1')) || ' ' || (pub_options->>pg_temp.g('yt2')) || ' ' || (pub_options ? pg_temp.g('ig'))::text
  from public.works where id = 'CH-9101'), 'private unlisted false');
select pg_temp.c('16 each result says how it went out', (select status || ' ' || (results->pg_temp.g('yt1')->>'privacy') || ' ' || (results->pg_temp.g('yt2')->>'privacy') || ' ' || (results->pg_temp.g('ig') ? 'privacy')::text
  from public.works where id = 'CH-9101'), 'PUBLISHED private unlisted false');
select pg_temp.c('17 the log says the narrower ones', (select count(*)::text from public.work_log where work_id = 'CH-9101' and type = 'publish'
  and text like '%(خاص)%' and text like '%(غير مدرج)%'), '1');
select pg_temp.c('18 the notice says them too', (select count(*)::text from public.notifications where recipient = 'wri@t.test'
  and body like '«فيديو على ثلاثة حسابات»: منشور. %القناة: خاص، %المراجعة: غير مدرج.'), '1');

-- 3. No choice given: the default, else «عام»; a scheduled work «عام» at its time; a retry as asked --------------------------------
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-00000000c001');
select pg_temp.t('19 the two-argument form still publishes', $q$ select public.work_publish('CH-9102', 'now') $q$, 'ok');
reset role;
select pg_temp.c('20 with no default it goes out «عام», and the notice says nothing more', (select (results->pg_temp.g('yt1')->>'privacy') || ' ' ||
  (select count(*) from public.notifications where recipient = 'wri@t.test' and body = '«فيديو بلا اختيار»: منشور.')::text from public.works where id = 'CH-9102'), 'public 1');
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-00000000c001');
select pg_temp.t('21 the due run publishes a scheduled work', $q$ select public.work_due_run() $q$, 'ok');
reset role;
select pg_temp.c('22 a scheduled YouTube video goes out «عام» at its time, whatever its default', (select status || ' ' || (results->pg_temp.g('yt2')->>'privacy') from public.works where id = 'CH-9103'), 'PUBLISHED public');
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-00000000c001');
select pg_temp.t('23 a channel whose authorisation ended fails', $q$ select public.work_publish('CH-9105', 'now', jsonb_build_object(pg_temp.g('yt3'), 'unlisted')) $q$, 'ok');
reset role;
select pg_temp.c('24 failed, with the choice it was asked', (select status || ' ' || (results->pg_temp.g('yt3')->>'ok') || ' ' || (results->pg_temp.g('yt3')->>'privacy') from public.works where id = 'CH-9105'), 'FAILED false unlisted');
update public.platform_accounts set authorized_until = now() + interval '30 days' where id = pg_temp.g('yt3')::uuid;
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-00000000c001');
select pg_temp.t('25 the retry', $q$ select public.work_publish('CH-9105', 'retry') $q$, 'ok');
reset role;
select pg_temp.c('26 goes out as it was asked', (select status || ' ' || (results->pg_temp.g('yt3')->>'privacy') from public.works where id = 'CH-9105'), 'PUBLISHED unlisted');
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-00000000c001');
select pg_temp.t('27 unscheduling through the two-argument form is unchanged', $q$ select public.work_publish('CH-9106', 'unschedule') $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-00000000b001');
select pg_temp.t('28 a writer may not publish, choice or not', $q$ select public.work_publish('CH-9104', 'now', jsonb_build_object(pg_temp.g('yt1'), 'unlisted')) $q$, 'ERR FORBIDDEN');
reset role;
select pg_temp.c('29 back to «جاهز للنشر»', (select status from public.works where id = 'CH-9106'), 'APPROVED');

-- 4. What a page may read and call -----------------------------------------------------------------------------------------------
select pg_temp.c('30 a page reads a work''s choices and an account''s default', (has_column_privilege('authenticated', 'public.works', 'pub_options', 'select')
  and has_column_privilege('authenticated', 'public.platform_accounts', 'default_privacy', 'select'))::text, 'true');
select pg_temp.c('31 a signed-in page calls «نشر الآن» with choices and sets a default', (has_function_privilege('authenticated', 'public.work_publish(text, text, jsonb)', 'execute')
  and has_function_privilege('authenticated', 'public.account_set_privacy(uuid, text)', 'execute'))::text, 'true');
select pg_temp.c('32 nobody signed out does', (has_function_privilege('anon', 'public.work_publish(text, text, jsonb)', 'execute')
  or has_function_privilege('anon', 'public.account_set_privacy(uuid, text)', 'execute'))::text, 'false');
select pg_temp.c('33 the inner steps are not callable from outside', (has_function_privilege('authenticated', 'public.work_pub_choices(uuid[], jsonb)', 'execute')
  or has_function_privilege('authenticated', 'public.yt_privacy_ar(text)', 'execute'))::text, 'false');
select pg_temp.t('34 nobody writes a choice directly', $q$ set local role authenticated; update public.works set pub_options = '{"x":"public"}' where id = 'CH-9104' $q$, 'ok');
reset role;
select pg_temp.c('35 so it stays as it was', (select pub_options::text from public.works where id = 'CH-9104'), '{}');

select n, k, v, expect from r where v is distinct from expect
union all select 0, 'TOTAL', count(*)::text, (count(*) filter (where v is not distinct from expect))::text || ' passed' from r
order by n;
rollback;

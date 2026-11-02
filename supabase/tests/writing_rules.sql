-- «ورقة الكتابة» and the writing documents (Writing_Build_Plan.md), checked inside one transaction that is rolled back.
-- Throwaway accounts (@t.test) act through row level security; nothing about a real person is read into the result.
-- Covered: who may write what in which status, the server key, NO_CHANGE, the version limit and what it never prunes,
-- the triggers, withdrawing, notes, drafts, pictures, folders and exports, research, accounts before sending, asking an
-- opinion, ideas, phrases, search on a restricted work, what a stage writer is told, the move engine and backups, and
-- that a signed-out caller reaches nothing. file_locations and the move tables have no policy, so the checks read them
-- through pg_temp.q, the owner. The last query lists only the checks that differ from the rule, and the total.
-- Result: qa/writing-rules.json.
begin;
-- Sequences do not roll back: the work number is put back at the end.
create temp table s0 as select last_value, is_called from public.work_no_seq;
create temp table r(n serial, k text, v text, expect text);
create temp table v(k text primary key, val text);
grant all on r, v to public; grant usage on sequence r_n_seq to public;
insert into public.accounts (email, display_name, role, pages, protected) values
 ('adm@t.test','Adm','admin','{}',true),('dir@t.test','Dir','director','{}',false),('asst@t.test','Asst','assistant','{}',false),
 ('wri@t.test','Wri','writer','{}',false),('ws@t.test','Ws','writer','{}',false),('des@t.test','Des','designer','{}',false),
 ('pub@t.test','Pub','publisher','{}',false),('mem@t.test','Mem','member','{}',false),('oth@t.test','Oth','writer','{}',false);
insert into auth.users (id, email, email_confirmed_at) values
 ('00000000-0000-0000-0000-0000000000a1','adm@t.test',now()),('00000000-0000-0000-0000-0000000000d1','dir@t.test',now()),
 ('00000000-0000-0000-0000-0000000000d2','asst@t.test',now()),('00000000-0000-0000-0000-0000000000c1','wri@t.test',now()),
 ('00000000-0000-0000-0000-0000000000c2','ws@t.test',now()),('00000000-0000-0000-0000-0000000000c3','des@t.test',now()),
 ('00000000-0000-0000-0000-0000000000e1','pub@t.test',now()),('00000000-0000-0000-0000-0000000000e2','mem@t.test',now()),
 ('00000000-0000-0000-0000-0000000000c4','oth@t.test',now());
insert into public.mail_server_key (id, key_hash) values (1, encode(sha256(convert_to('k-rule-run-only', 'UTF8')), 'hex'))
  on conflict (id) do update set key_hash = excluded.key_hash;
update public.integrations set state = 'connected' where id = '00000000-0000-4000-8000-0000000000d1';

create function pg_temp.who(id text) returns void language sql as $$ select set_config('request.jwt.claims', json_build_object('sub',id,'role','authenticated')::text, true) $$;
create function pg_temp.t(k text, sqltext text, e text) returns void language plpgsql as $$
begin
  begin execute sqltext; insert into r(k,v,expect) values (k,'ok',e);
  exception when others then insert into r(k,v,expect) values (k,'ERR '||sqlerrm,e); end;
end $$;
create function pg_temp.c(k text, got text, e text) returns void language sql as $$ insert into r(k,v,expect) values (k,got,e) $$;
create function pg_temp.g(k text) returns text language sql as $$ select val from v where k = $1 $$;
create function pg_temp.q(sqltext text) returns text language plpgsql security definer as $$
declare res text; begin execute sqltext into res; return res; end $$;
create function pg_temp.sha(t text) returns text language sql as $$ select encode(sha256(convert_to(t, 'UTF8')), 'hex') $$;
-- A save, as the route makes it: the body is its own checksum source and the reference is unique to the body.
create function pg_temp.dc(w text, body text, ref text) returns jsonb language sql as $$
  select public.work_doc_commit('k-rule-run-only', w, body, null, ref, 10, pg_temp.sha(w || body))
$$;
create function pg_temp.many(w text, a int, b int) returns jsonb language plpgsql as $$
declare i int; last jsonb;
begin
  for i in a..b loop last := pg_temp.dc(w, 'نسخة ' || i, w || '-r' || i); end loop;
  return last;
end $$;
create function pg_temp.mk(title text, assignee text, restricted boolean default false) returns text language sql as $$
  select public.work_create(jsonb_build_object('type','post','title',title,'due',public.work_today()+5,'assignee',assignee,
    'channels',jsonb_build_array(pg_temp.g('ig')),'start',true,'restricted',restricted,
    'stages',jsonb_build_array(jsonb_build_object('n','كتابة','role','writer','who','ws@t.test','after','[]'::jsonb),
                               jsonb_build_object('n','تصميم','role','designer','who','des@t.test','after','[0]'::jsonb))))
$$;
create function pg_temp.send(w text) returns jsonb language sql as $$
  select public.work_submit(w, null, array[pg_temp.g('ig')::uuid], null)
$$;

set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
insert into v select 'ig', public.account_save(null, '{"platform":"instagram","label":"الرسمي","handle":"@t.ig","publishers":["pub@t.test"],"mode":"auto"}')::text;
insert into v select 'x', public.account_save(null, '{"platform":"x","label":"الرسمي","handle":"@t_x","publishers":["pub@t.test"],"mode":"auto"}')::text;
insert into v select 'yt', public.account_save(null, '{"platform":"youtube","label":"الرسمي","handle":"@TYT","publishers":["pub@t.test"],"mode":"ask"}')::text;
insert into v select 'A', pg_temp.mk('عمل الكتابة', 'wri@t.test');
insert into v select 'R', pg_temp.mk('عمل مقيّد', 'wri@t.test', true);

-- Who may save ---------------------------------------------------------------------------------------------------
select pg_temp.who('00000000-0000-0000-0000-0000000000c2');
select pg_temp.c('001 the stage writer has no block', (public.work_text_block(pg_temp.g('A')) is null)::text, 'true');
select pg_temp.t('002 the stage writer saves the main text', $q$ select public.work_text_save(pg_temp.g('A'), 'main', 'نص من كاتب المرحلة', null) $q$, 'ok');
select pg_temp.t('003 and a platform copy', $q$ select public.work_text_save(pg_temp.g('A'), 'instagram', 'نسخة إنستغرام', null) $q$, 'ok');
select pg_temp.t('004 and confirms it', $q$ select public.work_variant_confirm(pg_temp.g('A'), 'instagram') $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-0000000000c1');
select pg_temp.t('005 the assignee saves', $q$ select public.work_text_save(pg_temp.g('A'), 'main', 'نص من المسؤول', null) $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
select pg_temp.t('006 the director saves', $q$ select public.work_text_save(pg_temp.g('A'), 'main', 'نص من المدير', null) $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-0000000000a1');
select pg_temp.t('007 the Admin saves', $q$ select public.work_text_save(pg_temp.g('A'), 'main', 'نص من المسؤول عن النظام', null) $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-0000000000c3');
select pg_temp.t('008 a designer on the work does not', $q$ select public.work_text_save(pg_temp.g('A'), 'main', 'لا', null) $q$, 'ERR FORBIDDEN');
select pg_temp.c('009 and is told why', public.work_text_block(pg_temp.g('A')), 'FORBIDDEN');
select pg_temp.t('010 nor confirms a copy', $q$ select public.work_variant_confirm(pg_temp.g('A'), 'instagram') $q$, 'ERR FORBIDDEN');
select pg_temp.who('00000000-0000-0000-0000-0000000000e1');
select pg_temp.t('011 the publisher does not', $q$ select public.work_text_save(pg_temp.g('A'), 'main', 'لا', null) $q$, 'ERR FORBIDDEN');
select pg_temp.who('00000000-0000-0000-0000-0000000000c4');
select pg_temp.t('012 a writer who holds no stage does not', $q$ select public.work_text_save(pg_temp.g('A'), 'main', 'لا', null) $q$, 'ERR FORBIDDEN');
select pg_temp.who('00000000-0000-0000-0000-0000000000c1');
select pg_temp.t('013 a long text is saved', $q$ select public.work_text_save(pg_temp.g('A'), 'main', repeat('ن', 9000), null) $q$, 'ok');
select pg_temp.c('014 whole, not cut at the old limit', (select char_length(body)::text from public.work_texts where work_id = pg_temp.g('A') order by n desc limit 1), '9000');
select pg_temp.t('015 above the limit it is refused, not cut', $q$ select public.work_text_save(pg_temp.g('A'), 'main', repeat('ن', 200001), null) $q$, 'ERR TEXT_TOO_LONG');
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
insert into v select 'LONG', public.work_create(jsonb_build_object('type','post','title','طويل','due',public.work_today()+5,'assignee','wri@t.test',
  'channels',jsonb_build_array(pg_temp.g('ig')),'main',repeat('ن', 9000),'stages','[{"n":"أ"}]'::jsonb));
select pg_temp.c('016 a new work takes a long first text too', (select char_length(body)::text from public.work_texts where work_id = pg_temp.g('LONG')), '9000');
select pg_temp.who('00000000-0000-0000-0000-0000000000c1');

-- The server key and a saved version ---------------------------------------------------------------------------------
select pg_temp.t('017 a wrong key is refused', $q$ select public.work_doc_commit('wrong', pg_temp.g('A'), 'نص', null, 'r1', 10, pg_temp.sha('a')) $q$, 'ERR FORBIDDEN');
select pg_temp.t('018 no key is refused', $q$ select public.work_doc_commit(null, pg_temp.g('A'), 'نص', null, 'r1', 10, pg_temp.sha('a')) $q$, 'ERR FORBIDDEN');
select pg_temp.t('019 an empty text is refused', $q$ select public.work_doc_commit('k-rule-run-only', pg_temp.g('A'), '  ', null, 'r1', 10, pg_temp.sha('a')) $q$, 'ERR TEXT_REQUIRED');
select pg_temp.t('020 a text above the limit is refused', $q$ select public.work_doc_commit('k-rule-run-only', pg_temp.g('A'), repeat('ن', 200001), null, 'r1', 10, pg_temp.sha('a')) $q$, 'ERR TEXT_TOO_LONG');
select pg_temp.t('021 a checksum must be sha256', $q$ select public.work_doc_commit('k-rule-run-only', pg_temp.g('A'), 'نص', null, 'r1', 10, 'abc') $q$, 'ERR DOC_INVALID');
select pg_temp.t('022 and is required', $q$ select public.work_doc_commit('k-rule-run-only', pg_temp.g('A'), 'نص', null, 'r1', 10, null) $q$, 'ERR DOC_INVALID');
select pg_temp.t('023 a reference is required', $q$ select public.work_doc_commit('k-rule-run-only', pg_temp.g('A'), 'نص', null, '', 10, pg_temp.sha('a')) $q$, 'ERR DOC_INVALID');
select pg_temp.t('024 a size is required', $q$ select public.work_doc_commit('k-rule-run-only', pg_temp.g('A'), 'نص', null, 'r1', null, pg_temp.sha('a')) $q$, 'ERR DOC_INVALID');
select pg_temp.who('00000000-0000-0000-0000-0000000000c3');
select pg_temp.t('025 the key alone is not a right', $q$ select pg_temp.dc(pg_temp.g('A'), 'نص', 'r1') $q$, 'ERR FORBIDDEN');
select pg_temp.who('00000000-0000-0000-0000-0000000000c2');
insert into v select 'c1', pg_temp.dc(pg_temp.g('A'), 'نص من الورقة', 'r-a-1')::text;
select pg_temp.c('026 it answers n, reopened, prune, copies and the draft', (select string_agg(key, ',' order by key) from jsonb_object_keys(pg_temp.g('c1')::jsonb) key), 'copies,draft,n,prune,reopened');
select pg_temp.c('027 nothing to prune', pg_temp.g('c1')::jsonb->>'prune', '[]');
select pg_temp.c('028 the row keeps the file and the plain text', (select body || '|' || master_ref || '|' || master_size || '|' || (checksum = pg_temp.sha(pg_temp.g('A') || 'نص من الورقة')) || '|' || keep from public.work_texts where work_id = pg_temp.g('A') order by n desc limit 1),
  'نص من الورقة|r-a-1|10|true|false');
select pg_temp.c('029 the same words in the log as a save', (select text from public.work_log where work_id = pg_temp.g('A') and type = 'text' order by id desc limit 1),
  'تعديل النص الأساسي (الإصدار ' || (pg_temp.g('c1')::jsonb->>'n') || '). الكاتب Wri');
select pg_temp.c('030 the file is located with the library''s provider', pg_temp.q($$select l.subject_kind || '|' || l.role || '|' || l.state || '|' || l.size_bytes || '|' || (l.integration_id = public.storage_integration_for('library')) from public.file_locations l where l.ref = 'r-a-1'$$), 'work_doc|primary|ok|10|true');
select pg_temp.t('031 the same checksum is no change', $q$ select pg_temp.dc(pg_temp.g('A'), 'نص من الورقة', 'r-a-2') $q$, 'ERR NO_CHANGE');
select pg_temp.c('032 and leaves no row', pg_temp.q($$select count(*)::text from public.file_locations where ref = 'r-a-2'$$), '0');

-- The status rule ----------------------------------------------------------------------------------------------------
select pg_temp.t('033 a stage writer does not send', $q$ select pg_temp.send(pg_temp.g('A')) $q$, 'ERR FORBIDDEN');
select pg_temp.who('00000000-0000-0000-0000-0000000000c1');
select pg_temp.t('034 the assignee sends', $q$ select pg_temp.send(pg_temp.g('A')) $q$, 'ok');
select pg_temp.c('035 the cycle remembers the version sent', (select (c.text_n = (select max(t.n) from public.work_texts t where t.work_id = c.work_id))::text from public.work_cycles c where c.work_id = pg_temp.g('A')), 'true');
select pg_temp.c('036 and that version is kept', (select keep::text from public.work_texts where work_id = pg_temp.g('A') order by n desc limit 1), 'true');
select pg_temp.t('037 in review the assignee waits', $q$ select public.work_text_save(pg_temp.g('A'), 'main', 'لا', null) $q$, 'ERR STATUS_DENIED');
select pg_temp.t('038 at the door of a save too', $q$ select pg_temp.dc(pg_temp.g('A'), 'لا', 'r-no') $q$, 'ERR STATUS_DENIED');
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
select pg_temp.t('039 a leader waits too', $q$ select public.work_text_save(pg_temp.g('A'), 'main', 'لا', null) $q$, 'ERR STATUS_DENIED');
select pg_temp.who('00000000-0000-0000-0000-0000000000c2');
select pg_temp.t('040 in review a stage writer is locked', $q$ select public.work_text_save(pg_temp.g('A'), 'main', 'لا', null) $q$, 'ERR WRITER_LOCKED');
select pg_temp.t('041 at the door of a save too', $q$ select pg_temp.dc(pg_temp.g('A'), 'لا', 'r-no') $q$, 'ERR WRITER_LOCKED');
select pg_temp.t('042 and cannot confirm a copy', $q$ select public.work_variant_confirm(pg_temp.g('A'), 'instagram') $q$, 'ERR WRITER_LOCKED');
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
select pg_temp.t('043 the director approves everything', $q$ select public.work_decide(pg_temp.g('A'), 'approve', array['text','dest','v:instagram'], null, false) $q$, 'ok');
select pg_temp.c('044 it is ready', (select status from public.works where id = pg_temp.g('A')), 'APPROVED');
select pg_temp.who('00000000-0000-0000-0000-0000000000c2');
select pg_temp.c('045 the stage writer is told, as the assignee, for information', (select tier from public.notifications where body like 'اكتمل اعتماد%' order by created_at desc limit 1), 'info');
select pg_temp.t('046 after approval a stage writer is locked', $q$ select pg_temp.dc(pg_temp.g('A'), 'لا', 'r-no') $q$, 'ERR WRITER_LOCKED');
select pg_temp.t('047 on a copy too', $q$ select public.work_text_save(pg_temp.g('A'), 'instagram', 'لا', null) $q$, 'ERR WRITER_LOCKED');
select pg_temp.who('00000000-0000-0000-0000-0000000000c1');
insert into v select 'c2', pg_temp.dc(pg_temp.g('A'), 'تعديل بعد الاعتماد', 'r-a-3')::text;
select pg_temp.c('048 after approval the assignee edits, and review reopens', pg_temp.g('c2')::jsonb->>'reopened', 'true');
select pg_temp.c('049 the work is in review', (select status from public.works where id = pg_temp.g('A')), 'IN_REVIEW');
select pg_temp.c('050 the reopening cycle kept the version', (select keep::text from public.work_texts where work_id = pg_temp.g('A') order by n desc limit 1), 'true');
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
select pg_temp.t('051 the director asks for changes', $q$ select public.work_decide(pg_temp.g('A'), 'changes', array['text'], 'أعد الصياغة', false) $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-0000000000c2');
select pg_temp.c('052 the stage writer is told at «يحتاج انتباهك», in the same words', (select tier || '|' || body from public.notifications where body like '%طلب تعديل%' order by created_at desc limit 1), 'attention|Dir طلب تعديل «النص الأساسي» في «عمل الكتابة».');
select pg_temp.t('053 after changes the stage writer writes', $q$ select pg_temp.dc(pg_temp.g('A'), 'بعد التعديل', 'r-a-4') $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-0000000000c1');
select pg_temp.c('054 the assignee was told once', (select count(*)::text from public.notifications where body = 'Dir طلب تعديل «النص الأساسي» في «عمل الكتابة».'), '1');
select pg_temp.t('055 sends again', $q$ select pg_temp.send(pg_temp.g('A')) $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
select pg_temp.t('056 the director rejects', $q$ select public.work_decide(pg_temp.g('A'), 'reject', null, 'ليس الآن', false) $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-0000000000c2');
select pg_temp.c('057 the stage writer is told of the rejection', (select tier from public.notifications where body = 'Dir رفض «عمل الكتابة»: ليس الآن'), 'attention');
select pg_temp.t('058 after a rejection the stage writer writes', $q$ select pg_temp.dc(pg_temp.g('A'), 'بعد الرفض', 'r-a-5') $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-0000000000c1');
select pg_temp.t('059 production starts again', $q$ select public.work_start(pg_temp.g('A')) $q$, 'ok');
select pg_temp.t('060 and it is sent', $q$ select pg_temp.send(pg_temp.g('A')) $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
select pg_temp.t('061 and approved', $q$ select public.work_decide(pg_temp.g('A'), 'approve', array['text','dest','v:instagram'], null, false) $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-0000000000e1');
select pg_temp.t('062 the publisher publishes', $q$ select public.work_publish(pg_temp.g('A'), 'now') $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-0000000000c2');
select pg_temp.c('063 the stage writer hears the result', (select tier from public.notifications where body = '«عمل الكتابة»: منشور.'), 'info');
select pg_temp.t('064 after publishing a stage writer is locked', $q$ select pg_temp.dc(pg_temp.g('A'), 'لا', 'r-no') $q$, 'ERR WRITER_LOCKED');
select pg_temp.who('00000000-0000-0000-0000-0000000000c1');
select pg_temp.t('065 and the assignee stops', $q$ select pg_temp.dc(pg_temp.g('A'), 'لا', 'r-no') $q$, 'ERR STATUS_DENIED');

-- A failed publication and a declined one reach a stage writer too, and at most once when she is «المسؤول».
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
insert into v select 'F', pg_temp.mk('عمل يفشل', 'wri@t.test');
insert into v select 'G', pg_temp.mk('عمل يُلغى', 'wri@t.test');
insert into v select 'WS', pg_temp.mk('عمل كاتب المرحلة', 'ws@t.test');
select pg_temp.c('065a a stage holder who is the assignee is not told twice', pg_temp.q(format($$select cardinality(public.work_writers(%L))::text$$, pg_temp.g('WS'))), '0');
select pg_temp.c('065b another holder is the writer of a work', pg_temp.q(format($$select array_to_string(public.work_writers(%L), ',')$$, pg_temp.g('F'))), 'ws@t.test');
select pg_temp.who('00000000-0000-0000-0000-0000000000c1');
select pg_temp.t('065c two versions', $q$ select pg_temp.many(pg_temp.g('F'), 1, 1), pg_temp.many(pg_temp.g('G'), 1, 1) $q$, 'ok');
select pg_temp.t('065d sent', $q$ select pg_temp.send(pg_temp.g('F')), pg_temp.send(pg_temp.g('G')) $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
select pg_temp.t('065e approved', $q$ select public.work_decide(pg_temp.g('F'), 'approve', array['text','dest'], null, false), public.work_decide(pg_temp.g('G'), 'approve', array['text','dest'], null, false) $q$, 'ok');
reset role;
update public.platform_accounts set authorized_until = now() - interval '1 day' where id = pg_temp.g('ig')::uuid;
update public.works set status = 'SCHEDULED', sched_at = now(), confirm_pending = true where id = pg_temp.g('G');
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000e1');
select pg_temp.t('065f a publication fails', $q$ select public.work_publish(pg_temp.g('F'), 'now') $q$, 'ok');
select pg_temp.t('065g another is declined at its time', $q$ select public.work_publish(pg_temp.g('G'), 'decline') $q$, 'ok');
reset role;
update public.platform_accounts set authorized_until = null where id = pg_temp.g('ig')::uuid;
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000c2');
select pg_temp.c('065h the stage writer hears the failure at «يحتاج انتباهك»', (select tier from public.notifications where body = '«عمل يفشل»: فشل النشر.'), 'attention');
select pg_temp.c('065i and the decline', (select tier from public.notifications where body = 'لم يُنشر «عمل يُلغى» عند موعده بقرار مسؤول النشر.'), 'attention');

select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
insert into v select 'D', pg_temp.mk('عمل مغلق', 'wri@t.test');
select pg_temp.t('066 a closed work is nobody''s to write', $q$ select public.work_close(pg_temp.g('D'), 'انتهى') $q$, 'ok');
select pg_temp.t('067 not even a leader''s', $q$ select pg_temp.dc(pg_temp.g('D'), 'لا', 'r-no') $q$, 'ERR FORBIDDEN');
select pg_temp.c('068 and the block says so', public.work_text_block(pg_temp.g('D')), 'FORBIDDEN');

-- The version limit ---------------------------------------------------------------------------------------------------
insert into v select 'P', pg_temp.mk('عمل طويل', 'wri@t.test');
select pg_temp.who('00000000-0000-0000-0000-0000000000c1');
select pg_temp.c('069 ten saves prune nothing', pg_temp.many(pg_temp.g('P'), 1, 10)->>'prune', '[]');
insert into v select 'p11', pg_temp.many(pg_temp.g('P'), 11, 11)::text;
select pg_temp.c('070 the eleventh prunes the first', pg_temp.g('p11')::jsonb->>'prune', '["' || pg_temp.g('P') || '-r1"]');
select pg_temp.c('071 and names its live copy', pg_temp.g('p11')::jsonb->'copies'->0->>'ref', pg_temp.g('P') || '-r1');
select pg_temp.c('072 at its provider', pg_temp.g('p11')::jsonb->'copies'->0->>'type', 'google_drive');
select pg_temp.c('073 the record and its text stay', (select body || '|' || (pruned_at is not null) || '|' || master_ref from public.work_texts where work_id = pg_temp.g('P') and n = 1), 'نسخة 1|true|' || pg_temp.g('P') || '-r1');
select pg_temp.c('074 its location goes', pg_temp.q(format($$select count(*)::text from public.file_locations where ref = %L$$, pg_temp.g('P') || '-r1')), '0');
select pg_temp.c('075 the next save prunes only the next', pg_temp.many(pg_temp.g('P'), 12, 12)->>'prune', '["' || pg_temp.g('P') || '-r2"]');
select pg_temp.c('076 ten are left with files', (select count(*)::text from public.work_texts where work_id = pg_temp.g('P') and pruned_at is null), '10');

-- The setting.
select pg_temp.c('077 ten by default', (select writing_keep::text from public.site_settings), '10');
select pg_temp.t('078 a writer cannot change it', $q$ select public.writing_keep_set(5) $q$, 'ERR FORBIDDEN');
select pg_temp.who('00000000-0000-0000-0000-0000000000a1');
select pg_temp.t('079 two is too few', $q$ select public.writing_keep_set(2) $q$, 'ERR KEEP_INVALID');
select pg_temp.t('080 fifty-one is too many', $q$ select public.writing_keep_set(51) $q$, 'ERR KEEP_INVALID');
select pg_temp.t('081 nothing is not a number', $q$ select public.writing_keep_set(null) $q$, 'ERR KEEP_INVALID');
select pg_temp.t('082 fifty is allowed', $q$ select public.writing_keep_set(50) $q$, 'ok');
select pg_temp.t('083 so is three', $q$ select public.writing_keep_set(3) $q$, 'ok');
select pg_temp.c('084 and it is kept', (select writing_keep::text from public.site_settings), '3');
select pg_temp.c('085 and written in the log', pg_temp.q($$select data->>'writing_keep' from public.integration_events where kind = 'settings' order by id desc limit 1$$), '3');
select pg_temp.who('00000000-0000-0000-0000-0000000000c1');
select pg_temp.c('086 a lower limit prunes more at the next save', (select jsonb_array_length(pg_temp.many(pg_temp.g('P'), 13, 13)->'prune'))::text, '8');
select pg_temp.c('087 three are left with files', (select count(*)::text from public.work_texts where work_id = pg_temp.g('P') and pruned_at is null), '3');
select pg_temp.who('00000000-0000-0000-0000-0000000000a1');
select pg_temp.t('088 back to ten', $q$ select public.writing_keep_set(10) $q$, 'ok');

-- What is never pruned.
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
insert into v select 'Q', pg_temp.mk('عمل محمي', 'wri@t.test');
select pg_temp.who('00000000-0000-0000-0000-0000000000c1');
select pg_temp.t('089 two versions', $q$ select pg_temp.many(pg_temp.g('Q'), 1, 2) $q$, 'ok');
select pg_temp.t('090 the second is sent', $q$ select pg_temp.send(pg_temp.g('Q')) $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
select pg_temp.t('091 changes are asked', $q$ select public.work_decide(pg_temp.g('Q'), 'changes', array['text'], 'غيّر', false) $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-0000000000c1');
select pg_temp.t('092 a third', $q$ select pg_temp.many(pg_temp.g('Q'), 3, 3) $q$, 'ok');
select pg_temp.t('093 is sent', $q$ select pg_temp.send(pg_temp.g('Q')) $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
select pg_temp.t('094 and approved', $q$ select public.work_decide(pg_temp.g('Q'), 'approve', array['text','dest'], null, false) $q$, 'ok');
select pg_temp.c('095 the approved version is marked', (select keep::text from public.work_texts where work_id = pg_temp.g('Q') and n = 3), 'true');
select pg_temp.c('096 the approval names it', (select ver from public.work_approvals where work_id = pg_temp.g('Q') and part = 'text'), 't3');
select pg_temp.who('00000000-0000-0000-0000-0000000000c1');
select pg_temp.t('097 a fourth reopens review', $q$ select pg_temp.many(pg_temp.g('Q'), 4, 4) $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
select pg_temp.t('098 changes again', $q$ select public.work_decide(pg_temp.g('Q'), 'changes', array['text'], 'غيّر', false) $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-0000000000c1');
select pg_temp.c('099 eleven more prune what is neither sent nor approved', pg_temp.many(pg_temp.g('Q'), 5, 15)->>'prune', '["' || pg_temp.g('Q') || '-r5"]');
select pg_temp.c('100 only the first and the fifth were pruned', (select string_agg(n::text, ',' order by n) from public.work_texts where work_id = pg_temp.g('Q') and pruned_at is not null), '1,5');
select pg_temp.c('101 the versions sent or approved are all there', (select string_agg(n::text, ',' order by n) from public.work_texts where work_id = pg_temp.g('Q') and keep), '2,3,4');
select pg_temp.c('102 and still located', pg_temp.q(format($$select count(*)::text from public.file_locations l join public.work_texts t on t.id = l.subject_id where t.work_id = %L and t.keep$$, pg_temp.g('Q'))), '3');
select pg_temp.c('103 a cycle says which version it sent', (select string_agg(text_n::text, ',' order by n) from public.work_cycles where work_id = pg_temp.g('Q')), '2,3,4');
select pg_temp.c('104 a version with no file has nothing to prune', (select count(*)::text from public.work_texts where master_ref is null and pruned_at is not null), '0');

-- Withdrawing ---------------------------------------------------------------------------------------------------------
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
insert into v select 'W', pg_temp.mk('عمل يُسحب', 'wri@t.test');
select pg_temp.who('00000000-0000-0000-0000-0000000000c1');
select pg_temp.t('105 not while it is not in review', $q$ select public.work_withdraw(pg_temp.g('W')) $q$, 'ERR NOT_IN_REVIEW');
select pg_temp.t('106 a version', $q$ select pg_temp.many(pg_temp.g('W'), 1, 1) $q$, 'ok');
select pg_temp.t('107 sent', $q$ select pg_temp.send(pg_temp.g('W')) $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-0000000000c2');
select pg_temp.t('108 a stage writer does not withdraw', $q$ select public.work_withdraw(pg_temp.g('W')) $q$, 'ERR FORBIDDEN');
select pg_temp.who('00000000-0000-0000-0000-0000000000c3');
select pg_temp.t('109 nor anyone else on the work', $q$ select public.work_withdraw(pg_temp.g('W')) $q$, 'ERR FORBIDDEN');
select pg_temp.who('00000000-0000-0000-0000-0000000000c1');
select pg_temp.c('110 the sender withdraws, back to production', public.work_withdraw(pg_temp.g('W')), 'IN_PRODUCTION');
select pg_temp.c('111 the cycle is closed', (select status || '|' || (review_cycle is null) from public.works where id = pg_temp.g('W')), 'IN_PRODUCTION|true');
select pg_temp.c('112 it is in the decisions as a withdrawal', (select string_agg(op, ',') from public.work_decisions where work_id = pg_temp.g('W')), 'withdraw');
select pg_temp.c('113 and in the log', (select text from public.work_log where work_id = pg_temp.g('W') and type = 'withdraw'), 'سحب العمل من المراجعة (الدورة 1)');
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
select pg_temp.c('114 the decider is told', (select tier from public.notifications where body = 'Wri سحب «عمل يُسحب» من المراجعة.'), 'info');
select pg_temp.c('115 and nothing still asks for a decision', (select count(*)::text from public.notifications where tier = 'decide' and read_at is null and go->>'id' = pg_temp.g('W')), '0');
select pg_temp.t('116 a decision has nothing to decide', $q$ select public.work_decide(pg_temp.g('W'), 'approve', array['text'], null, false) $q$, 'ERR NOT_IN_REVIEW');
select pg_temp.who('00000000-0000-0000-0000-0000000000c1');
select pg_temp.t('117 the work can be sent again', $q$ select pg_temp.send(pg_temp.g('W')) $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
select pg_temp.t('118 changes are asked', $q$ select public.work_decide(pg_temp.g('W'), 'changes', array['text'], 'غيّر', false) $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-0000000000c1');
select pg_temp.t('119 sent again', $q$ select pg_temp.send(pg_temp.g('W')) $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
select pg_temp.c('120 a leader withdraws, back to where changes left it', public.work_withdraw(pg_temp.g('W')), 'CHANGES_REQUESTED');
select pg_temp.who('00000000-0000-0000-0000-0000000000c1');
select pg_temp.t('121 sent once more', $q$ select pg_temp.send(pg_temp.g('W')) $q$, 'ok');
select pg_temp.c('122 still back to changes after a withdrawal in between', public.work_withdraw(pg_temp.g('W')), 'CHANGES_REQUESTED');
select pg_temp.t('123 sent once more', $q$ select pg_temp.send(pg_temp.g('W')) $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
select pg_temp.t('124 one part is approved', $q$ select public.work_decide(pg_temp.g('W'), 'approve', array['dest'], null, false) $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-0000000000c1');
select pg_temp.t('125 once anything is decided it cannot be withdrawn', $q$ select public.work_withdraw(pg_temp.g('W')) $q$, 'ERR WITHDRAW_DECIDED');
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
select pg_temp.t('126 not even by a leader', $q$ select public.work_withdraw(pg_temp.g('W')) $q$, 'ERR WITHDRAW_DECIDED');

-- A cycle that moves a date has its own way out; one that reopened an approval goes back to production.
insert into v select 'M', pg_temp.mk('عمل بموعد', 'wri@t.test');
select pg_temp.who('00000000-0000-0000-0000-0000000000c1');
select pg_temp.t('127 a version', $q$ select pg_temp.many(pg_temp.g('M'), 1, 1) $q$, 'ok');
select pg_temp.t('128 sent with a date', $q$ select public.work_submit(pg_temp.g('M'), null, array[pg_temp.g('ig')::uuid], now() + interval '2 days') $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
select pg_temp.t('129 approved', $q$ select public.work_decide(pg_temp.g('M'), 'approve', array['text','dest','date'], null, false) $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-0000000000c1');
select pg_temp.t('130 a date move is asked', $q$ select public.work_request_move(pg_temp.g('M'), now() + interval '3 days', 'تأجيل') $q$, 'ok');
select pg_temp.t('131 it is withdrawn by its own way', $q$ select public.work_withdraw(pg_temp.g('M')) $q$, 'ERR WITHDRAW_MOVE');
select pg_temp.t('132 which still works', $q$ select public.work_cancel_move(pg_temp.g('M')) $q$, 'ok');
select pg_temp.c('133 and leaves it approved', (select status from public.works where id = pg_temp.g('M')), 'APPROVED');
select pg_temp.t('134 a change reopens review', $q$ select pg_temp.many(pg_temp.g('M'), 2, 2) $q$, 'ok');
select pg_temp.c('135 withdrawing it goes back to production', public.work_withdraw(pg_temp.g('M')), 'IN_PRODUCTION');

-- A file the review had marked goes back in the library, and a file another work is reviewing stays.
select pg_temp.who('00000000-0000-0000-0000-0000000000a1');
insert into public.media_files (id, drive_file_id, name, mime_type, size_bytes, kind, uploaded_by, folder_id) values
 ('00000000-0000-0000-0000-00000000f101', 'wf-1', 'a.png', 'image/png', 100, 'image', 'adm@t.test', '00000000-0000-0000-0000-0000000000a1'),
 ('00000000-0000-0000-0000-00000000f102', 'wf-2', 'b.png', 'image/png', 100, 'image', 'adm@t.test', '00000000-0000-0000-0000-0000000000a1');
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
insert into v select 'L1', pg_temp.mk('عمل بملف', 'wri@t.test');
insert into v select 'L2', pg_temp.mk('عمل آخر بملف', 'wri@t.test');
select pg_temp.who('00000000-0000-0000-0000-0000000000a1');
select pg_temp.t('136 a file on one work', $q$ select public.work_asset_link(pg_temp.g('L1'), '00000000-0000-0000-0000-00000000f101', true) $q$, 'ok');
select pg_temp.t('137 another on two', $q$ select public.work_asset_link(pg_temp.g('L1'), '00000000-0000-0000-0000-00000000f102', true) $q$, 'ok');
select pg_temp.t('138 and the second work', $q$ select public.work_asset_link(pg_temp.g('L2'), '00000000-0000-0000-0000-00000000f102', true) $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-0000000000c1');
select pg_temp.t('139 versions', $q$ select pg_temp.many(pg_temp.g('L1'), 1, 1), pg_temp.many(pg_temp.g('L2'), 1, 1) $q$, 'ok');
select pg_temp.t('140 both sent', $q$ select pg_temp.send(pg_temp.g('L1')), pg_temp.send(pg_temp.g('L2')) $q$, 'ok');
select pg_temp.c('141 the library shows review', pg_temp.q($$select string_agg(stage, ',' order by name) from public.media_files where drive_file_id in ('wf-1','wf-2')$$), 'review,review');
select pg_temp.t('142 the first is withdrawn', $q$ select public.work_withdraw(pg_temp.g('L1')) $q$, 'ok');
select pg_temp.c('143 its own file goes back, the shared one stays', pg_temp.q($$select string_agg(stage, ',' order by name) from public.media_files where drive_file_id in ('wf-1','wf-2')$$), 'production,review');
select pg_temp.c('144 the database flags are clear again', current_setting('app.media_internal', true) || current_setting('app.work_internal', true), '00');

-- Notes ---------------------------------------------------------------------------------------------------------------
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
insert into v select 'N', pg_temp.mk('عمل بملاحظات', 'wri@t.test');
select pg_temp.who('00000000-0000-0000-0000-0000000000c1');
select pg_temp.t('145 a version', $q$ select pg_temp.many(pg_temp.g('N'), 1, 1) $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
select pg_temp.t('146 no note before it is sent', $q$ select public.work_note_add(pg_temp.g('N'), 'text', null, 'ملاحظة') $q$, 'ERR NOT_IN_REVIEW');
select pg_temp.who('00000000-0000-0000-0000-0000000000c1');
select pg_temp.t('147 sent', $q$ select pg_temp.send(pg_temp.g('N')) $q$, 'ok');
select pg_temp.t('148 a writer does not add a note', $q$ select public.work_note_add(pg_temp.g('N'), 'text', null, 'ملاحظة') $q$, 'ERR FORBIDDEN_DECIDE');
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
insert into v select 'n1', public.work_note_add(pg_temp.g('N'), 'text', 'جملة من النص', ' غيّر هذه الجملة ')::text;
select pg_temp.c('149 a decider adds one on a sentence', (select cycle || '|' || part || '|' || quote || '|' || body || '|' || author from public.work_notes where id = pg_temp.g('n1')::uuid), '1|text|جملة من النص|غيّر هذه الجملة|dir@t.test');
select pg_temp.t('150 on a part the work has', $q$ select public.work_note_add(pg_temp.g('N'), 'v:nothing', null, 'ملاحظة') $q$, 'ERR PART_INVALID');
select pg_temp.t('151 and it says something', $q$ select public.work_note_add(pg_temp.g('N'), 'text', null, '   ') $q$, 'ERR TEXT_REQUIRED');
select pg_temp.who('00000000-0000-0000-0000-0000000000c3');
select pg_temp.c('152 anyone who sees the work reads it', (select count(*)::text from public.work_notes where id = pg_temp.g('n1')::uuid), '1');
select pg_temp.t('153 but only a writer resolves it', $q$ select public.work_note_resolve(pg_temp.g('n1')::uuid) $q$, 'ERR FORBIDDEN');
select pg_temp.who('00000000-0000-0000-0000-0000000000c2');
select pg_temp.t('154 the stage writer resolves it', $q$ select public.work_note_resolve(pg_temp.g('n1')::uuid) $q$, 'ok');
select pg_temp.c('155 and it says who', (select resolved_by || '|' || (resolved_at is not null) from public.work_notes where id = pg_temp.g('n1')::uuid), 'ws@t.test|true');
select pg_temp.t('156 resolving twice changes nothing', $q$ select public.work_note_resolve(pg_temp.g('n1')::uuid) $q$, 'ok');
select pg_temp.t('157 an unknown note is refused', $q$ select public.work_note_resolve('00000000-0000-0000-0000-000000000bad') $q$, 'ERR FORBIDDEN');
select pg_temp.t('158 nobody writes the table', $q$ insert into public.work_notes (work_id, cycle, part, body, author) values (pg_temp.g('N'), 1, 'text', 'x', 'x') $q$, 'ERR permission denied for table work_notes');
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
insert into v select 'S', pg_temp.mk('عمل المدير', 'dir@t.test');
select pg_temp.t('159 a version', $q$ select pg_temp.many(pg_temp.g('S'), 1, 1) $q$, 'ok');
select pg_temp.t('160 sent by the director', $q$ select pg_temp.send(pg_temp.g('S')) $q$, 'ok');
select pg_temp.t('161 who does not add a note on her own work', $q$ select public.work_note_add(pg_temp.g('S'), 'text', null, 'ملاحظة') $q$, 'ERR SELF_APPROVAL');

-- Drafts --------------------------------------------------------------------------------------------------------------
insert into v select 'E', pg_temp.mk('عمل بمسودة', 'wri@t.test');
select pg_temp.who('00000000-0000-0000-0000-0000000000c1');
select pg_temp.t('162 a draft needs the key', $q$ select public.work_draft_set('wrong', pg_temp.g('E'), 'dr-1') $q$, 'ERR FORBIDDEN');
select pg_temp.t('163 and a reference', $q$ select public.work_draft_set('k-rule-run-only', pg_temp.g('E'), '') $q$, 'ERR DOC_INVALID');
select pg_temp.t('164 a writer keeps one', $q$ select public.work_draft_set('k-rule-run-only', pg_temp.g('E'), 'dr-1') $q$, 'ok');
select pg_temp.t('165 and replaces it', $q$ select public.work_draft_set('k-rule-run-only', pg_temp.g('E'), 'dr-2') $q$, 'ok');
select pg_temp.c('166 one row, her own', (select count(*) || '|' || max(ref) from public.work_drafts where work_id = pg_temp.g('E')), '1|dr-2');
select pg_temp.who('00000000-0000-0000-0000-0000000000c3');
select pg_temp.t('167 one who may not write has none', $q$ select public.work_draft_set('k-rule-run-only', pg_temp.g('E'), 'dr-3') $q$, 'ERR FORBIDDEN');
select pg_temp.who('00000000-0000-0000-0000-0000000000c2');
select pg_temp.t('168 the stage writer keeps her own', $q$ select public.work_draft_set('k-rule-run-only', pg_temp.g('E'), 'dr-4') $q$, 'ok');
select pg_temp.c('169 and reads hers alone', (select string_agg(ref, ',') from public.work_drafts where work_id = pg_temp.g('E')), 'dr-4');
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
select pg_temp.c('170 a leader reads none of them', (select count(*)::text from public.work_drafts where work_id = pg_temp.g('E')), '0');
select pg_temp.who('00000000-0000-0000-0000-0000000000a1');
select pg_temp.c('171 nor the Admin', (select count(*)::text from public.work_drafts where work_id = pg_temp.g('E')), '0');
select pg_temp.who('00000000-0000-0000-0000-0000000000c1');
select pg_temp.c('172 a save finishes the writer''s draft and names its file', pg_temp.dc(pg_temp.g('E'), 'نص', 'r-e-1')->>'draft', 'dr-2');
select pg_temp.c('173 hers is gone', (select count(*)::text from public.work_drafts where work_id = pg_temp.g('E')), '0');
select pg_temp.c('174 the other person''s stays', pg_temp.q(format($$select string_agg(ref, ',') from public.work_drafts where work_id = %L$$, pg_temp.g('E'))), 'dr-4');
select pg_temp.t('175 nobody writes the table', $q$ update public.work_drafts set ref = 'x' $q$, 'ERR permission denied for table work_drafts');

-- Pictures, folders, exports ------------------------------------------------------------------------------------------
select pg_temp.t('176 a picture needs the key', $q$ select public.work_image_add('wrong', pg_temp.g('E'), 'im-1', 'a.png', 10, 'image/png') $q$, 'ERR FORBIDDEN');
select pg_temp.t('177 never SVG', $q$ select public.work_image_add('k-rule-run-only', pg_temp.g('E'), 'im-1', 'a.svg', 10, 'image/svg+xml') $q$, 'ERR IMAGE_INVALID');
select pg_temp.t('178 not above 5 MB', $q$ select public.work_image_add('k-rule-run-only', pg_temp.g('E'), 'im-1', 'a.png', 5242881, 'image/png') $q$, 'ERR IMAGE_INVALID');
insert into v select 'im', public.work_image_add('k-rule-run-only', pg_temp.g('E'), 'im-1', 'a.png', 10, 'image/png')::text;
select pg_temp.c('179 a picture is located like a version', pg_temp.q($$select subject_kind || '|' || role from public.file_locations where ref = 'im-1'$$), 'work_doc|primary');
select pg_temp.c('180 its record is the work''s', (select name || '|' || mime_type || '|' || added_by from public.work_images where id = pg_temp.g('im')::uuid), 'a.png|image/png|wri@t.test');
select pg_temp.who('00000000-0000-0000-0000-0000000000c3');
select pg_temp.t('181 a reader adds none', $q$ select public.work_image_add('k-rule-run-only', pg_temp.g('E'), 'im-2', 'a.png', 10, 'image/png') $q$, 'ERR FORBIDDEN');
select pg_temp.t('182 nor makes folders', $q$ select public.work_doc_folders('k-rule-run-only', pg_temp.g('E'), 'f', 'c', 'v', 'd', 'i') $q$, 'ERR FORBIDDEN');
select pg_temp.c('183 what a save would do is refused to her first', (select count(*)::text from (select 1 where public.work_text_block(pg_temp.g('E')) = 'FORBIDDEN') x), '1');
select pg_temp.t('184 at the prepare step', $q$ select public.work_doc_prepare(pg_temp.g('E')) $q$, 'ERR FORBIDDEN');
select pg_temp.who('00000000-0000-0000-0000-0000000000c1');
select pg_temp.t('185 folders need the key', $q$ select public.work_doc_folders('wrong', pg_temp.g('E'), 'f', 'c', 'v', 'd', 'i') $q$, 'ERR FORBIDDEN');
select pg_temp.c('186 the writer records them', public.work_doc_folders('k-rule-run-only', pg_temp.g('E'), 'f1', 'c1', 'v1', 'd1', 'i1')->>'versions_ref', 'v1');
select pg_temp.c('187 a save that raced gets the first', public.work_doc_folders('k-rule-run-only', pg_temp.g('E'), 'f2', 'c2', 'v2', 'd2', 'i2')->>'versions_ref', 'v1');
select pg_temp.c('188 the prepare step returns what a save needs', (select (x->>'next') || '|' || (x->>'latest') || '|' || (x->>'checksum' = pg_temp.sha(pg_temp.g('E') || 'نص')) || '|' || (x->'docs'->>'current_ref') from public.work_doc_prepare(pg_temp.g('E')) x), '2|1|true|c1');
select pg_temp.t('189 an export needs the key', $q$ select public.work_doc_export('wrong', pg_temp.g('E'), 'word', 'w1', 1) $q$, 'ERR FORBIDDEN');
select pg_temp.t('190 of the latest version only', $q$ select public.work_doc_export('k-rule-run-only', pg_temp.g('E'), 'word', 'w1', 2) $q$, 'ERR EXPORT_STALE');
select pg_temp.t('191 of a known kind', $q$ select public.work_doc_export('k-rule-run-only', pg_temp.g('E'), 'html', 'w1', 1) $q$, 'ERR DOC_INVALID');
select pg_temp.t('192 the Word is recorded', $q$ select public.work_doc_export('k-rule-run-only', pg_temp.g('E'), 'word', 'w1', 1) $q$, 'ok');
select pg_temp.t('193 the PDF', $q$ select public.work_doc_export('k-rule-run-only', pg_temp.g('E'), 'pdf', 'p1', 1) $q$, 'ok');
select pg_temp.t('194 the text', $q$ select public.work_doc_export('k-rule-run-only', pg_temp.g('E'), 'text', 't1', 1) $q$, 'ok');
select pg_temp.c('195 each in its place', (select word_ref || word_n || pdf_ref || pdf_n || text_ref from public.work_docs where work_id = pg_temp.g('E')), 'w11p11t1');
select pg_temp.t('196 sent', $q$ select pg_temp.send(pg_temp.g('E')) $q$, 'ok');
select pg_temp.t('197 in review a save is refused', $q$ select public.work_doc_prepare(pg_temp.g('E'), 'save') $q$, 'ERR STATUS_DENIED');
select pg_temp.t('198 and an export is not', $q$ select public.work_doc_prepare(pg_temp.g('E'), 'export') $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-0000000000c2');
select pg_temp.t('199 but not from a stage writer', $q$ select public.work_doc_prepare(pg_temp.g('E'), 'export') $q$, 'ERR WRITER_LOCKED');
select pg_temp.who('00000000-0000-0000-0000-0000000000c1');
select pg_temp.t('200 the table is read only', $q$ update public.work_docs set word_ref = 'x' $q$, 'ERR permission denied for table work_docs');

-- Research ------------------------------------------------------------------------------------------------------------
select pg_temp.t('201 the assignee keeps research', $q$ select public.work_research_save(pg_temp.g('E'), ' مصدر ') $q$, 'ok');
select pg_temp.c('202 trimmed', (select research from public.works where id = pg_temp.g('E')), 'مصدر');
select pg_temp.t('203 not above the limit', $q$ select public.work_research_save(pg_temp.g('E'), repeat('م', 8001)) $q$, 'ERR TEXT_TOO_LONG');
select pg_temp.who('00000000-0000-0000-0000-0000000000c2');
select pg_temp.t('204 the stage writer too', $q$ select public.work_research_save(pg_temp.g('E'), 'مصدر ثان') $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-0000000000c3');
select pg_temp.t('205 a reader does not', $q$ select public.work_research_save(pg_temp.g('E'), 'لا') $q$, 'ERR FORBIDDEN');
select pg_temp.who('00000000-0000-0000-0000-0000000000c1');
select pg_temp.t('206 empty clears it', $q$ select public.work_research_save(pg_temp.g('E'), '  ') $q$, 'ok');
select pg_temp.c('207 cleared', (select coalesce(research, '-') from public.works where id = pg_temp.g('E')), '-');

-- Accounts before sending ---------------------------------------------------------------------------------------------
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
insert into v select 'C', pg_temp.mk('عمل بحسابات', 'wri@t.test');
select pg_temp.who('00000000-0000-0000-0000-0000000000c1');
select pg_temp.t('208 the assignee chooses', $q$ select public.work_set_channels(pg_temp.g('C'), array[pg_temp.g('ig')::uuid, pg_temp.g('x')::uuid]) $q$, 'ok');
select pg_temp.c('209 they are kept', (select cardinality(channels)::text from public.works where id = pg_temp.g('C')), '2');
select pg_temp.c('210 and logged', (select text from public.work_log where work_id = pg_temp.g('C') and type = 'channels'), 'اختيار حسابات النشر (2)');
select pg_temp.t('211 the same choice writes nothing', $q$ select public.work_set_channels(pg_temp.g('C'), array[pg_temp.g('ig')::uuid, pg_temp.g('x')::uuid]) $q$, 'ok');
select pg_temp.c('212 no second line', (select count(*)::text from public.work_log where work_id = pg_temp.g('C') and type = 'channels'), '1');
select pg_temp.t('213 a post needs an account', $q$ select public.work_set_channels(pg_temp.g('C'), '{}') $q$, 'ERR CHANNEL_REQUIRED');
select pg_temp.t('214 video only stays the rule', $q$ select public.work_set_channels(pg_temp.g('C'), array[pg_temp.g('yt')::uuid]) $q$, 'ERR YOUTUBE_VIDEO_ONLY');
select pg_temp.t('215 an unknown account is refused', $q$ select public.work_set_channels(pg_temp.g('C'), array['00000000-0000-0000-0000-000000000bad'::uuid]) $q$, 'ERR ACCOUNT_INVALID');
select pg_temp.who('00000000-0000-0000-0000-0000000000c2');
select pg_temp.t('216 a stage writer does not choose', $q$ select public.work_set_channels(pg_temp.g('C'), array[pg_temp.g('ig')::uuid]) $q$, 'ERR FORBIDDEN');
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
select pg_temp.t('217 a leader does', $q$ select public.work_set_channels(pg_temp.g('C'), array[pg_temp.g('ig')::uuid]) $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-0000000000c1');
select pg_temp.t('218 a version', $q$ select pg_temp.many(pg_temp.g('C'), 1, 1) $q$, 'ok');
select pg_temp.t('219 sent', $q$ select pg_temp.send(pg_temp.g('C')) $q$, 'ok');
select pg_temp.t('220 once sent they stay', $q$ select public.work_set_channels(pg_temp.g('C'), array[pg_temp.g('x')::uuid]) $q$, 'ERR STATUS_DENIED');

-- Asking an opinion ---------------------------------------------------------------------------------------------------
select pg_temp.who('00000000-0000-0000-0000-0000000000c1');
insert into v select 'o1', public.work_ask_opinion(pg_temp.g('C'), 'des@t.test', 'ما رأيك في الصياغة؟')::text;
select pg_temp.c('221 it is a comment everyone reads', (select author || '|' || body from public.work_comments where id = pg_temp.g('o1')::uuid), 'wri@t.test|ما رأيك في الصياغة؟');
select pg_temp.t('222 not to oneself', $q$ select public.work_ask_opinion(pg_temp.g('C'), 'wri@t.test', 'سؤال') $q$, 'ERR PERSON_INVALID');
select pg_temp.t('223 not to a stranger', $q$ select public.work_ask_opinion(pg_temp.g('C'), 'nobody@t.test', 'سؤال') $q$, 'ERR PERSON_INVALID');
select pg_temp.t('224 and it asks something', $q$ select public.work_ask_opinion(pg_temp.g('C'), 'des@t.test', '  ') $q$, 'ERR TEXT_REQUIRED');
select pg_temp.t('225 on a restricted work, not someone who cannot see it', $q$ select public.work_ask_opinion(pg_temp.g('R'), 'oth@t.test', 'سؤال') $q$, 'ERR PERSON_INVALID');
select pg_temp.t('226 but someone on it', $q$ select public.work_ask_opinion(pg_temp.g('R'), 'des@t.test', 'سؤال') $q$, 'ok');
select pg_temp.t('227 or a leader', $q$ select public.work_ask_opinion(pg_temp.g('R'), 'asst@t.test', 'سؤال') $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-0000000000c3');
select pg_temp.c('228 the person asked sees it at «يحتاج انتباهك»', (select string_agg(tier, ',') from public.notifications where go->>'id' = pg_temp.g('C') and body like 'Wri يسأل عن رأيك في «عمل بحسابات»: ما رأيك%'), 'attention');
select pg_temp.who('00000000-0000-0000-0000-0000000000c4');
select pg_temp.t('229 nobody asks on a work they cannot see', $q$ select public.work_ask_opinion(pg_temp.g('R'), 'des@t.test', 'سؤال') $q$, 'ERR FORBIDDEN');

-- Ideas ---------------------------------------------------------------------------------------------------------------
select pg_temp.who('00000000-0000-0000-0000-0000000000c1');
insert into v select 'i1', public.idea_add(' فكرة جميلة ', 'حملة')::text;
select pg_temp.c('230 an idea is the author''s', (select body || '|' || tag || '|' || author from public.ideas where id = pg_temp.g('i1')::uuid), 'فكرة جميلة|حملة|wri@t.test');
select pg_temp.t('231 and says something', $q$ select public.idea_add('   ') $q$, 'ERR TEXT_REQUIRED');
select pg_temp.who('00000000-0000-0000-0000-0000000000c2');
select pg_temp.c('232 another writer does not read it', (select count(*)::text from public.ideas where id = pg_temp.g('i1')::uuid), '0');
select pg_temp.t('233 nor removes it', $q$ select public.idea_remove(pg_temp.g('i1')::uuid) $q$, 'ERR FORBIDDEN');
select pg_temp.t('234 nor marks it', $q$ select public.idea_to_work(pg_temp.g('i1')::uuid, pg_temp.g('C')) $q$, 'ERR FORBIDDEN');
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
select pg_temp.c('235 a leader reads it', (select count(*)::text from public.ideas where id = pg_temp.g('i1')::uuid), '1');
select pg_temp.who('00000000-0000-0000-0000-0000000000c1');
select pg_temp.t('236 the author marks the work made from it', $q$ select public.idea_to_work(pg_temp.g('i1')::uuid, pg_temp.g('C')) $q$, 'ok');
select pg_temp.c('237 it is marked', (select (work_id = pg_temp.g('C'))::text from public.ideas where id = pg_temp.g('i1')::uuid), 'true');
select pg_temp.t('238 the same work again is nothing new', $q$ select public.idea_to_work(pg_temp.g('i1')::uuid, pg_temp.g('C')) $q$, 'ok');
select pg_temp.t('239 a second work is refused', $q$ select public.idea_to_work(pg_temp.g('i1')::uuid, pg_temp.g('E')) $q$, 'ERR IDEA_USED');
select pg_temp.t('240 the table is read only', $q$ insert into public.ideas (body, author) values ('x', 'x') $q$, 'ERR permission denied for table ideas');
select pg_temp.who('00000000-0000-0000-0000-0000000000c4');
insert into v select 'i2', public.idea_add('فكرة أخرى')::text;
select pg_temp.t('241 and a work the author cannot see', $q$ select public.idea_to_work(pg_temp.g('i2')::uuid, pg_temp.g('R')) $q$, 'ERR FORBIDDEN');
select pg_temp.who('00000000-0000-0000-0000-0000000000d2');
select pg_temp.t('242 a leader removes one', $q$ select public.idea_remove(pg_temp.g('i2')::uuid) $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-0000000000c1');
select pg_temp.t('243 the author removes hers', $q$ select public.idea_remove(pg_temp.g('i1')::uuid) $q$, 'ok');

-- Phrases -------------------------------------------------------------------------------------------------------------
select pg_temp.t('244 a writer adds none', $q$ select public.phrase_add('تحية', '{"type":"doc","content":[]}') $q$, 'ERR FORBIDDEN');
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
insert into v select 'ph', public.phrase_add('تحية', '{"type":"doc","content":[{"type":"paragraph"}]}')::text;
select pg_temp.t('245 a phrase is a document', $q$ select public.phrase_add('تحية', '{"type":"paragraph"}') $q$, 'ERR DOC_INVALID');
select pg_temp.t('246 of a bounded size', format($q$ select public.phrase_add('تحية', '{"type":"doc","x":"%s"}') $q$, repeat('a', 50001)), 'ERR DOC_INVALID');
select pg_temp.t('247 with a title', $q$ select public.phrase_add('  ', '{"type":"doc","content":[]}') $q$, 'ERR NAME_REQUIRED');
select pg_temp.who('00000000-0000-0000-0000-0000000000e2');
select pg_temp.c('248 every approved person reads it', (select count(*)::text from public.writing_phrases where id = pg_temp.g('ph')::uuid), '1');
select pg_temp.t('249 a member removes none', $q$ select public.phrase_remove(pg_temp.g('ph')::uuid) $q$, 'ERR FORBIDDEN');
select pg_temp.t('250 nobody writes the table', $q$ delete from public.writing_phrases $q$, 'ERR permission denied for table writing_phrases');
select pg_temp.who('00000000-0000-0000-0000-0000000000d2');
select pg_temp.t('251 a leader removes it', $q$ select public.phrase_remove(pg_temp.g('ph')::uuid) $q$, 'ok');
select pg_temp.c('252 it is gone', (select count(*)::text from public.writing_phrases where id = pg_temp.g('ph')::uuid), '0');

-- Search --------------------------------------------------------------------------------------------------------------
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
insert into v select 'H', pg_temp.mk('عمل بحث', 'wri@t.test');
select pg_temp.t('253 the restricted work gets a word', $q$ select pg_temp.dc(pg_temp.g('R'), 'نص فيه كلمةمقيدة ومعها غيرها', 'r-r-1') $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-0000000000c1');
select pg_temp.t('254 an old word', $q$ select pg_temp.dc(pg_temp.g('H'), 'كلمةقديمة', 'r-h-1') $q$, 'ok');
select pg_temp.t('255 replaced by a new text', format($q$ select pg_temp.dc(pg_temp.g('H'), %L, 'r-h-2') $q$, repeat('حشو ', 30) || 'نسبة 100% رمز_فريد مسار\ثان' || repeat(' حشو', 30)), 'ok');
select pg_temp.t('256 and a copy', $q$ select public.work_text_save(pg_temp.g('H'), 'instagram', 'نسخةفريدة للمنصة', null) $q$, 'ok');
select pg_temp.c('257 a word of the latest text is found', (select string_agg(part || ':' || n, ',') from public.work_text_search('رمز_فريد')), 'text:2');
select pg_temp.c('258 a word of an old version is not', (select count(*)::text from public.work_text_search('كلمةقديمة')), '0');
select pg_temp.c('259 a word of a copy is, with its platform', (select string_agg(part || ':' || platform, ',') from public.work_text_search('نسخةفريدة')), 'copy:instagram');
select pg_temp.c('260 the percent sign is a letter', (select count(*)::text from public.work_text_search('100%')), '1');
select pg_temp.c('261 not a wildcard', (select count(*)::text from public.work_text_search('1%0')), '0');
select pg_temp.c('262 the underscore is a letter', (select count(*)::text from public.work_text_search('رمز_')), '1');
select pg_temp.c('263 not a wildcard', (select count(*)::text from public.work_text_search('ر_ز')), '0');
select pg_temp.c('264 the backslash is a letter', (select count(*)::text from public.work_text_search('مسار\ثان')), '1');
select pg_temp.c('265 one letter asks for nothing', (select count(*)::text from public.work_text_search('ن')), '0');
select pg_temp.c('266 nothing asks for nothing', (select count(*)::text from public.work_text_search(null)), '0');
select pg_temp.c('267 the snippet is around the match', (select (snippet like '…%رمز_فريد%…')::text || '|' || (char_length(snippet) <= 122)::text from public.work_text_search('رمز_فريد')), 'true|true');
select pg_temp.c('268 and on one line', (select (snippet !~ '\n')::text from public.work_text_search('رمز_فريد')), 'true');
select pg_temp.c('269 the assignee finds the restricted work', (select count(*)::text from public.work_text_search('كلمةمقيدة')), '1');
select pg_temp.who('00000000-0000-0000-0000-0000000000c4');
select pg_temp.c('270 someone not on it does not', (select count(*)::text from public.work_text_search('كلمةمقيدة')), '0');
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
select pg_temp.c('271 a leader does', (select count(*)::text from public.work_text_search('كلمةمقيدة')), '1');
do $d$
declare i int; w text;
begin
  for i in 1..21 loop
    w := pg_temp.mk('حد ' || i, 'dir@t.test');
    perform pg_temp.dc(w, 'رمزالحد ' || i, 'r-l-' || i);
  end loop;
end $d$;
select pg_temp.c('272 twenty results at most', (select count(*)::text from public.work_text_search('رمزالحد')), '20');

-- Reading a restricted work -------------------------------------------------------------------------------------------
select pg_temp.who('00000000-0000-0000-0000-0000000000c1');
select pg_temp.t('273 folders on the restricted work', $q$ select public.work_doc_folders('k-rule-run-only', pg_temp.g('R'), 'rf', 'rc', 'rv', 'rd', 'ri') $q$, 'ok');
insert into v select 'rim', public.work_image_add('k-rule-run-only', pg_temp.g('R'), 'im-r', 'a.png', 10, 'image/png')::text;
select pg_temp.who('00000000-0000-0000-0000-0000000000c4');
select pg_temp.c('274 someone not on it reads no folders', (select count(*)::text from public.work_docs where work_id = pg_temp.g('R')), '0');
select pg_temp.c('275 no picture', (select count(*)::text from public.work_images where id = pg_temp.g('rim')::uuid), '0');
select pg_temp.c('276 no version', (select count(*)::text from public.work_texts where work_id = pg_temp.g('R')), '0');
select pg_temp.t('277 and is refused at the door', $q$ select public.work_doc_prepare(pg_temp.g('R'), 'export') $q$, 'ERR FORBIDDEN');
select pg_temp.who('00000000-0000-0000-0000-0000000000c3');
select pg_temp.c('278 a person on it reads them', (select count(*)::text from public.work_docs where work_id = pg_temp.g('R')), '1');

-- The move engine and backups carry the documents ------------------------------------------------------------------------
select pg_temp.who('00000000-0000-0000-0000-0000000000a1');
select pg_temp.c('279 the storage page counts them apart', ((select (p->>'writing_files')::int > 0 from jsonb_array_elements(public.storage_overview()->'providers') p limit 1))::text, 'true');
select pg_temp.c('280 and nothing is unrecorded', public.storage_overview()->>'unrecorded', '0');
insert into v select 'S3', public.storage_provider_save(null, 'الثاني', '{"endpoint":"https://s3.example.org","bucket":"abcd"}'::jsonb)::text;
reset role;
update public.integrations set state = 'connected' where id = pg_temp.g('S3')::uuid;
set local role authenticated;
insert into v select 'mv', public.storage_move_plan('00000000-0000-4000-8000-0000000000d1', pg_temp.g('S3')::uuid, '{"kind":"library"}'::jsonb, 'copy', null, 0)::text;
select pg_temp.c('281 a whole library is planned with its documents', pg_temp.q(format($$select (count(*) filter (where subject_kind = 'work_doc') > 20)::text from public.storage_move_items where move_id = %L$$, pg_temp.g('mv'))), 'true');
select pg_temp.c('282 pruned versions are not in it', pg_temp.q(format($$select count(*)::text from public.storage_move_items i join public.work_texts t on t.id = i.subject_id where i.move_id = %L and t.pruned_at is not null$$, pg_temp.g('mv'))), '0');
select pg_temp.c('283 a version sent or approved counts as approved', pg_temp.q(format($$select bool_and(i.approved = t.keep)::text from public.storage_move_items i join public.work_texts t on t.id = i.subject_id where i.move_id = %L$$, pg_temp.g('mv'))), 'true');
select pg_temp.c('284 a picture counts as a file', pg_temp.q(format($$select bool_or(i.approved)::text from public.storage_move_items i join public.work_images x on x.id = i.subject_id where i.move_id = %L$$, pg_temp.g('mv'))), 'false');
insert into v select 'mv2', public.storage_move_plan('00000000-0000-4000-8000-0000000000d1', pg_temp.g('S3')::uuid, '{"kind":"library","folder_id":"00000000-0000-0000-0000-0000000000a1"}'::jsonb, 'copy', null, 0)::text;
select pg_temp.c('285 a folder is library files alone', pg_temp.q(format($$select count(*)::text from public.storage_move_items where move_id = %L and subject_kind = 'work_doc'$$, pg_temp.g('mv2'))), '0');
select pg_temp.t('286 that plan is dropped', format($q$ select public.storage_move_cancel(%L) $q$, pg_temp.g('mv2')), 'ok');
select pg_temp.t('287 the destination is noted', format($q$ select public.storage_move_note('k-rule-run-only', %L, null, 'x') $q$, pg_temp.g('mv')), 'ok');
select pg_temp.t('288 the run starts', format($q$ select public.storage_move_start(%L) $q$, pg_temp.g('mv')), 'ok');
insert into v select 'cl', public.storage_move_claim('k-rule-run-only', pg_temp.g('mv')::uuid, 10)::text;
select pg_temp.c('289 a claim names a document', (select count(*)::text from (select 1 from jsonb_array_elements(pg_temp.g('cl')::jsonb->'items') e where e->>'kind' = 'work_doc' and e->>'name' ~ '^v[0-9]{3} [0-9]{4}-[0-9]{2}-[0-9]{2}\.json$' and e->>'mime' = 'application/json' limit 1) x), '1');
select pg_temp.c('290 and gives no Drive folder to another provider', (select count(*)::text from jsonb_array_elements(pg_temp.g('cl')::jsonb->'items') e where e->>'kind' = 'work_doc' and e->>'parent' is not null), '0');
select pg_temp.c('291 a picture has its own name and type', pg_temp.q(format($$select (public.work_doc_file(%L)->>'name') || '|' || (public.work_doc_file(%L)->>'mime') || '|' || (public.work_doc_file(%L)->>'parent')$$, pg_temp.g('im'), pg_temp.g('im'), pg_temp.g('im'))), 'a.png|image/png|i1');
-- A version pruned while a run holds it is let go, so the run can end.
select pg_temp.who('00000000-0000-0000-0000-0000000000c1');
select pg_temp.t('292 the long work saves again', $q$ select pg_temp.many(pg_temp.g('Q'), 16, 16) $q$, 'ok');
select pg_temp.c('293 what that pruned leaves the run', pg_temp.q(format($$select string_agg(distinct i.state || ':' || i.reason, ',') from public.storage_move_items i join public.work_texts t on t.id = i.subject_id where i.move_id = %L and t.work_id = %L and t.n = 6$$, pg_temp.g('mv'), pg_temp.g('Q'))), 'skipped:source_changed');
select pg_temp.who('00000000-0000-0000-0000-0000000000a1');
select pg_temp.t('294 the run is cancelled', format($q$ select public.storage_move_cancel(%L) $q$, pg_temp.g('mv')), 'ok');
select pg_temp.t('295 the backup target is set', format($q$ select public.backup_target_set(%L) $q$, pg_temp.g('S3')), 'ok');
insert into v select 'bk', public.backup_run_begin('files')::text;
select pg_temp.c('296 a files backup copies the documents', pg_temp.q(format($$select (count(*) > 20)::text from public.storage_move_items i where i.subject_kind = 'work_doc' and i.move_id = any (array(select jsonb_array_elements_text(%L::jsonb->'moves')::uuid))$$, pg_temp.g('bk'))), 'true');
select pg_temp.c('297 the overview counts them', ((public.backup_overview()->'files'->>'total')::int = pg_temp.q($$select ((select count(*) from public.media_versions) + (select count(*) from public.mail_files) + (select count(*) from public.file_locations where subject_kind = 'work_doc' and role = 'primary' and state <> 'retired'))::text$$)::int)::text, 'true');
select pg_temp.t('298 a document can be restored from its backup', format($q$ select public.backup_restore_file('work_doc', %L) $q$, pg_temp.g('im')), 'ERR BACKUP_NOT_NEEDED');
select pg_temp.t('299 an unknown kind cannot', format($q$ select public.backup_restore_file('nothing', %L) $q$, pg_temp.g('im')), 'ERR BACKUP_BAD_KIND');
select pg_temp.c('300 the export carries the records', pg_temp.q($$select string_agg(e->>'table', ',' order by e->>'table') from jsonb_array_elements(public.backup_table_list('database')) e where e->>'table' in ('work_docs','work_notes','work_images','writing_phrases')$$), 'work_docs,work_images,work_notes,writing_phrases');
select pg_temp.c('301 and no draft or idea', pg_temp.q($$select count(*)::text from jsonb_array_elements(public.backup_table_list('database')) e where e->>'table' in ('work_drafts','ideas')$$), '0');
select pg_temp.c('302 the long table is read in short pages', pg_temp.q($$select e->>'page' from jsonb_array_elements(public.backup_table_list('database')) e where e->>'table' = 'work_texts'$$), '25');
select pg_temp.c('303 the serving lookup finds a document by its reference', (select jsonb_array_length(public.storage_serving('k-rule-run-only', pg_temp.g('Q') || '-r2')) > 0)::text, 'true');
reset role;

-- A removed account takes its private drafts with it. --------------------------------------------------------------------
insert into public.work_drafts (work_id, email, ref) values (pg_temp.g('H'), 'oth@t.test', 'dr-oth');
delete from public.accounts where email = 'oth@t.test';
select pg_temp.c('304 a removed account''s drafts go with it', (select count(*)::text from public.work_drafts where ref = 'dr-oth'), '0');
insert into public.accounts (email, role, display_name) values ('gone@t.test', 'writer', 'راحل');
insert into public.ideas (body, author) values ('فكرة خاصة', 'gone@t.test');
insert into public.ideas (body, author, work_id) values ('صارت عملاً', 'gone@t.test', pg_temp.g('H'));
insert into public.account_deletions (email, name) values ('gone@t.test', 'راحل');
delete from public.accounts where email = 'gone@t.test';
select pg_temp.c('305 at its owner''s request, ideas that never became a work go too', (select count(*)::text from public.ideas where author = 'gone@t.test'), '1');
delete from public.ideas where author = 'gone@t.test';
delete from public.account_deletions where email = 'gone@t.test';

-- Signed out: nothing ------------------------------------------------------------------------------------------------
select pg_temp.c('310 anon reaches none of the new functions', (
  select count(*)::text from unnest(array[
    'work_text_block(text)','work_doc_prepare(text,text)','work_doc_folders(text,text,text,text,text,text,text)',
    'work_doc_commit(text,text,text,text,text,bigint,text)','work_doc_export(text,text,text,text,int)','work_draft_set(text,text,text)',
    'work_image_add(text,text,text,text,bigint,text)','work_research_save(text,text)','work_note_add(text,text,text,text)',
    'work_note_resolve(uuid)','idea_add(text,text)','idea_remove(uuid)','idea_to_work(uuid,text)','phrase_add(text,jsonb)',
    'phrase_remove(uuid)','writing_keep_set(int)','work_withdraw(text)','work_set_channels(text,uuid[])',
    'work_ask_opinion(text,text,text)','work_text_search(text)','work_text_writer(text,text)','work_writers(text)']) f
  where has_function_privilege('anon', 'public.' || f, 'execute')), '0');
select pg_temp.c('311 the internal ones are not for signed-in people either', (
  select count(*)::text from unnest(array[
    'work_text_writer(text,text)','work_writer_locked(text,text)','work_writers(text)','work_cycle_text()','work_approval_text()',
    'file_location_on_doc()','file_location_on_doc_image()','work_doc_file(uuid)','work_snippet(text,text)']) f
  where has_function_privilege('authenticated', 'public.' || f, 'execute')), '0');
select pg_temp.c('312 anon reads none of the new tables', (
  select count(*)::text from unnest(array['work_docs','work_drafts','work_notes','work_images','ideas','writing_phrases']) t
  where has_table_privilege('anon', 'public.' || t, 'select')), '0');
select pg_temp.c('313 signed-in people read them', (
  select count(*)::text from unnest(array['work_docs','work_drafts','work_notes','work_images','ideas','writing_phrases']) t
  where has_table_privilege('authenticated', 'public.' || t, 'select')), '6');
select pg_temp.c('314 and write none of them', (
  select count(*)::text from unnest(array['work_docs','work_drafts','work_notes','work_images','ideas','writing_phrases']) t
  where has_table_privilege('authenticated', 'public.' || t, 'insert') or has_table_privilege('authenticated', 'public.' || t, 'update')
     or has_table_privilege('authenticated', 'public.' || t, 'delete')), '0');
select pg_temp.c('315 every new table has row level security', (
  select count(*)::text from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname in ('work_docs','work_drafts','work_notes','work_images','ideas','writing_phrases') and c.relrowsecurity), '6');
select pg_temp.c('316 no seeded phrases or ideas', (select (select count(*) from public.writing_phrases) + (select count(*) from public.ideas))::text, '0');
select pg_temp.c('317 subject kinds on both tables', (select count(*)::text from pg_constraint where conname in ('file_locations_subject_kind_check','storage_move_items_subject_kind_check') and pg_get_constraintdef(oid) like '%work_doc%'), '2');

select setval('public.work_no_seq', s0.last_value, s0.is_called) from s0;

-- The TOTAL row also carries the md5 of the text this run executed (without the lines a client
-- may append after it), so a recorded result can be matched to the file.
select * from (
  select n, k, v, expect from r where v is distinct from expect
  union all select 0, 'TOTAL', count(*)::text, (count(*) filter (where v is not distinct from expect))::text || ' passed; run md5 '
    || md5(case when strpos(current_query(), E'\n\n-- source: ') > 0 then left(current_query(), strpos(current_query(), E'\n\n-- source: ') - 1) else current_query() end) from r) z order by n;
rollback;

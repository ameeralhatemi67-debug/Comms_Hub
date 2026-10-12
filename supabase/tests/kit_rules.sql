-- Interaction kit rules (guide progress, undo of library edits), checked inside one
-- transaction that is rolled back at the end. Run with the Supabase SQL editor or the
-- MCP execute_sql tool. Throwaway accounts (@t.test) act through row level security.
-- In the site each action is its own request, so its own transaction id; here the whole
-- run is one transaction, so pg_temp.cut() gives the steps of each action their own id.
-- Result of 2026-10-12: see qa/kit-rules.json.
begin;
create temp sequence tseq;
create temp table r(n serial, k text, v text, expect text);
create temp table v(k text primary key, val text);
grant all on r, v to authenticated; grant usage on sequence r_n_seq to authenticated;
insert into public.accounts (email, display_name, role, protected) values
 ('dir@t.test','Dir','director',false),('asst@t.test','Asst','assistant',false),('wri@t.test','Wri','writer',false);
insert into auth.users (id, email, email_confirmed_at) values
 ('00000000-0000-0000-0000-00000000d001','dir@t.test',now()),('00000000-0000-0000-0000-00000000a001','asst@t.test',now()),
 ('00000000-0000-0000-0000-00000000b001','wri@t.test',now());
insert into public.media_folders (id, parent_id, name, created_by) values
 ('00000000-0000-0000-0000-0000000000f1', null, 'مجلد أول', 'seed'), ('00000000-0000-0000-0000-0000000000f2', null, 'مجلد ثان', 'seed');

create function pg_temp.who(id text) returns void language sql as $$ select set_config('request.jwt.claims', json_build_object('sub',id,'role','authenticated')::text, true) $$;
create function pg_temp.t(k text, sqltext text, e text) returns void language plpgsql as $$
begin
  begin execute sqltext; insert into r(k,v,expect) values (k,'ok',e);
  exception when others then insert into r(k,v,expect) values (k,'ERR '||sqlerrm,e); end;
end $$;
create function pg_temp.c(k text, val text, e text) returns void language sql as $$ insert into r(k,v,expect) values (k,val,e) $$;
create function pg_temp.g(k text) returns text language sql as $$ select val from v where k = $1 $$;
-- Run as the table owner: the steps written since the last cut become one action.
create function pg_temp.cut(k text) returns void language sql as $$
  with t as (select nextval('tseq') n), u as (update public.undo_steps set tx = (select n from t) where tx = txid_current() returning 1)
  insert into v(k, val) select k, (select n from t)::text $$;
grant execute on function pg_temp.t(text,text,text), pg_temp.c(text,text,text), pg_temp.g(text) to authenticated;

set local role authenticated;

-- Guide progress -------------------------------------------------------------
select pg_temp.who('00000000-0000-0000-0000-00000000b001');
select pg_temp.t('01 writer marks the library guide seen', $q$ select public.guide_update('seen', 'library') $q$, 'ok');
select pg_temp.t('02 and a section tip', $q$ select public.guide_update('seen', 'library:tree') $q$, 'ok');
select pg_temp.t('03 a malformed key is refused', $q$ select public.guide_update('seen', 'Library tree!') $q$, 'ERR GUIDE_KEY');
select pg_temp.t('04 replay the library guide', $q$ select public.guide_update('unseen_page', 'library') $q$, 'ok');
select pg_temp.t('05 guides off', $q$ select public.guide_update('auto', 'off') $q$, 'ok');
select pg_temp.c('05b what is kept', (select seen::text || ' ' || auto from public.guide_progress where email = 'wri@t.test'), '{} false');
select pg_temp.t('05c mail seen again', $q$ select public.guide_update('seen', 'mail') $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-00000000d001');
select pg_temp.c('06 the director cannot read the writer''s progress', (select count(*) from public.guide_progress where email = 'wri@t.test')::text, '0');

-- A rename, and its undo ----------------------------------------------------------
select pg_temp.who('00000000-0000-0000-0000-00000000a001');
select pg_temp.t('07 assistant uploads two files', $q$ insert into public.media_files (drive_file_id, name, mime_type, size_bytes, kind, folder_id) values
  ('t-k-1', 'ملف أ.png', 'image/png', 10, 'image', '00000000-0000-0000-0000-0000000000f1'),
  ('t-k-2', 'ملف ب.png', 'image/png', 10, 'image', '00000000-0000-0000-0000-0000000000f1') $q$, 'ok');
reset role; insert into v select 'A', id::text from public.media_files where drive_file_id = 't-k-1'; insert into v select 'B', id::text from public.media_files where drive_file_id = 't-k-2';
select pg_temp.c('07b an upload is not undoable', (select count(*) from public.undo_steps where tx = txid_current())::text, '0');
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-00000000a001');
select pg_temp.t('08 assistant renames A', $q$ update public.media_files set name = 'ملف أ نهائي.png' where id = pg_temp.g('A')::uuid $q$, 'ok');
reset role; select pg_temp.cut('u1'); set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-00000000a001');
select pg_temp.c('08b her undo list', (select label || ' ' || ok from public.undo_list() limit 1), 'إعادة تسمية «ملف أ.png» إلى «ملف أ نهائي.png» true');
select pg_temp.who('00000000-0000-0000-0000-00000000d001');
select pg_temp.c('09 the director does not see her steps', (select count(*) from public.undo_list())::text, '0');
select pg_temp.t('09b nor undo them', $q$ select public.undo_action(pg_temp.g('u1')::bigint) $q$, 'ERR UNDO_GONE');
select pg_temp.who('00000000-0000-0000-0000-00000000a001');
select pg_temp.t('10 she undoes it', $q$ select public.undo_action(pg_temp.g('u1')::bigint) $q$, 'ok');
select pg_temp.c('10b the old name is back', (select name from public.media_files where id = pg_temp.g('A')::uuid), 'ملف أ.png');
select pg_temp.c('10c the log says so', (select count(*) from public.activity_log where type = 'undo' and actor_email = 'asst@t.test')::text, '1');
select pg_temp.c('10d the undo is not itself an undoable step', (select count(*) from public.undo_list())::text, '0');
select pg_temp.t('11 once only', $q$ select public.undo_action(pg_temp.g('u1')::bigint) $q$, 'ERR UNDO_GONE');

-- Refused when someone else changed it since -----------------------------------
select pg_temp.t('12 assistant tags B', $q$ update public.media_files set tags = array['حملة'] where id = pg_temp.g('B')::uuid $q$, 'ok');
reset role; select pg_temp.cut('u2'); set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-00000000d001');
select pg_temp.t('13 the director renames B', $q$ update public.media_files set name = 'ملف ب معدّل.png' where id = pg_temp.g('B')::uuid $q$, 'ok');
reset role; select pg_temp.cut('u3'); set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-00000000a001');
select pg_temp.c('13b her step is no longer undoable', (select ok::text from public.undo_list() where tx = pg_temp.g('u2')::bigint), 'false');
select pg_temp.t('14 her undo is refused', $q$ select public.undo_action(pg_temp.g('u2')::bigint) $q$, 'ERR UNDO_CHANGED');
select pg_temp.c('14b the tags stay', (select array_to_string(tags, ',') from public.media_files where id = pg_temp.g('B')::uuid), 'حملة');

-- A stage move on the board, a decision, a move between folders --------------------
select pg_temp.t('15 assistant moves A to production', $q$ update public.media_files set stage = 'production' where id = pg_temp.g('A')::uuid $q$, 'ok');
reset role; select pg_temp.cut('u4'); set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-00000000a001');
select pg_temp.t('16 and back with undo', $q$ select public.undo_action(pg_temp.g('u4')::bigint) $q$, 'ok');
select pg_temp.c('16b A is a draft again', (select stage from public.media_files where id = pg_temp.g('A')::uuid), 'draft');
select pg_temp.t('17 A to review', $q$ update public.media_files set stage = 'review' where id = pg_temp.g('A')::uuid $q$, 'ok');
reset role; select pg_temp.cut('u5'); set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-00000000d001');
select pg_temp.t('18 the director approves A', $q$ update public.media_files set stage = 'ready' where id = pg_temp.g('A')::uuid $q$, 'ok');
reset role; select pg_temp.cut('u6'); set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-00000000d001');
select pg_temp.c('18b a decision is not undoable', (select count(*) from public.undo_list())::text, '1');
select pg_temp.who('00000000-0000-0000-0000-00000000a001');
select pg_temp.t('18c nor the move into review it settled', $q$ select public.undo_action(pg_temp.g('u5')::bigint) $q$, 'ERR UNDO_CHANGED');
select pg_temp.t('19 assistant moves B to the second folder', $q$ update public.media_files set folder_id = '00000000-0000-0000-0000-0000000000f2' where id = pg_temp.g('B')::uuid $q$, 'ok');
reset role; select pg_temp.cut('u7'); set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-00000000a001');
select pg_temp.c('19b the label names the folder', (select label from public.undo_list() where tx = pg_temp.g('u7')::bigint), 'نقل «ملف ب معدّل.png» إلى «مجلد ثان»');

-- Undo checks the rights again ---------------------------------------------------------
reset role;
select set_config('app.undo_internal', '1', true);
insert into public.media_grants (folder_id, subject_type, subject, level) values ('00000000-0000-0000-0000-0000000000f2', 'person', 'asst@t.test', 1);
select set_config('app.undo_internal', '0', true);
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-00000000a001');
select pg_temp.t('20 with view only in the second folder, she cannot move it back', $q$ select public.undo_action(pg_temp.g('u7')::bigint) $q$, 'ERR MOVE_DENIED');
reset role; select set_config('app.undo_internal', '1', true);
delete from public.media_grants where folder_id = '00000000-0000-0000-0000-0000000000f2' and subject = 'asst@t.test';
select set_config('app.undo_internal', '0', true); set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-00000000a001');
select pg_temp.t('20b with the right back, she can', $q$ select public.undo_action(pg_temp.g('u7')::bigint) $q$, 'ok');
select pg_temp.c('20c B is in the first folder again', (select folder_id::text from public.media_files where id = pg_temp.g('B')::uuid), '00000000-0000-0000-0000-0000000000f1');

-- Folders and access --------------------------------------------------------------------
select pg_temp.who('00000000-0000-0000-0000-00000000d001');
select pg_temp.t('21 the director locks the first folder', $q$ update public.media_folders set locked = true, lock_reason = 'نهائي' where id = '00000000-0000-0000-0000-0000000000f1' $q$, 'ok');
reset role; select pg_temp.cut('u8'); set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-00000000d001');
select pg_temp.t('22 and undoes it', $q$ select public.undo_action(pg_temp.g('u8')::bigint) $q$, 'ok');
select pg_temp.c('22b open again', (select locked::text || ' ' || coalesce(lock_reason, '-') from public.media_folders where id = '00000000-0000-0000-0000-0000000000f1'), 'false -');
select pg_temp.t('23 the director gives the writer view access', $q$ insert into public.media_grants (folder_id, subject_type, subject, level) values ('00000000-0000-0000-0000-0000000000f2', 'person', 'wri@t.test', 1) $q$, 'ok');
reset role; select pg_temp.cut('u9'); set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-00000000d001');
select pg_temp.c('23b labelled by folder', (select label from public.undo_list() where tx = pg_temp.g('u9')::bigint), 'صلاحيات «مجلد ثان»');
select pg_temp.t('24 and takes it back', $q$ select public.undo_action(pg_temp.g('u9')::bigint) $q$, 'ok');
select pg_temp.c('24b no grant left', (select count(*) from public.media_grants where subject = 'wri@t.test')::text, '0');

-- Time window, system writes, cancelling after a Drive refusal, redoing -----------------
select pg_temp.who('00000000-0000-0000-0000-00000000a001');
select pg_temp.t('25 assistant renames the second folder', $q$ update public.media_folders set name = 'مجلد ثان معدّل' where id = '00000000-0000-0000-0000-0000000000f2' $q$, 'ok');
reset role; select pg_temp.cut('u10'); update public.undo_steps set at = now() - interval '2 hours' where tx = (select val from v where k = 'u10')::bigint; set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-00000000a001');
select pg_temp.t('26 an hour later it is gone', $q$ select public.undo_action(pg_temp.g('u10')::bigint) $q$, 'ERR UNDO_GONE');
-- 27: a system write (the work sync) is not a step
select set_config('app.media_internal', '1', true);
update public.media_files set stage = 'review' where id = pg_temp.g('B')::uuid;
select set_config('app.media_internal', '0', true);
reset role; select pg_temp.c('27b no step', (select count(*) from public.undo_steps where tx = txid_current())::text, '0'); set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-00000000a001');
select pg_temp.t('28 an approved file keeps its name', $q$ update public.media_files set name = 'لن يبقى.png' where id = pg_temp.g('A')::uuid $q$, 'ERR NAME_LOCKED');
select pg_temp.t('29 a rename of B that Drive will refuse', $q$ update public.media_files set name = 'لن يبقى.png' where id = pg_temp.g('B')::uuid $q$, 'ok');
select pg_temp.t('29b the server cancels it after Drive refused', $q$ select public.undo_cancel_last() $q$, 'ok');
select pg_temp.c('29c the name is back, nothing to undo, no undo in the log', (select name from public.media_files where id = pg_temp.g('B')::uuid) || ' ' ||
  (select count(*) from public.undo_list() where ok) || ' ' || (select count(*) from public.activity_log where type = 'undo' and actor_email = 'asst@t.test'), 'ملف ب معدّل.png 0 3');
select pg_temp.t('30 renames B for real', $q$ update public.media_files set name = 'ملف ب الأخير.png' where id = pg_temp.g('B')::uuid $q$, 'ok');
reset role; select pg_temp.cut('u11'); set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-00000000a001');
select pg_temp.t('31 undo', $q$ select public.undo_action(pg_temp.g('u11')::bigint) $q$, 'ok');
select pg_temp.t('32 Drive refused to follow: the server takes it forward again', $q$ select public.undo_reapply(pg_temp.g('u11')::bigint) $q$, 'ok');
select pg_temp.c('32b the new name, offered again', (select name from public.media_files where id = pg_temp.g('B')::uuid) || ' ' ||
  (select ok::text from public.undo_list() where tx = pg_temp.g('u11')::bigint), 'ملف ب الأخير.png true');
select pg_temp.who('00000000-0000-0000-0000-00000000b001');
select pg_temp.t('33 nobody writes the steps directly', $q$ delete from public.undo_steps $q$, 'ok');
reset role;
select pg_temp.c('33b they are all still there', (select (count(*) > 0)::text from public.undo_steps), 'true');

select * from (
  select n, k, v, expect from r where v is distinct from expect
  union all select 0, 'TOTAL', count(*)::text, (count(*) filter (where v = expect))::text || ' passed' from r) z order by n;
rollback;

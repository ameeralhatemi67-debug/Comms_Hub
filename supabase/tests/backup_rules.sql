-- Settings Step S4 (migrations 20261015150000_backups.sql, 20261015150100_backup_run_ref.sql): who may run,
-- verify and restore a backup; that a copy run is the engine's backup mode (incremental, the primary never
-- changes, role `backup`); that an export holds only the allow-list (no mail, no secret column); that the
-- target is never the library's own provider; that nothing is scheduled; that a restore needs a missing
-- primary and a verified backup. One transaction, rolled back. The server key is replaced by a throwaway
-- inside the transaction only. The move and location tables have no policy, so the checks read them through
-- pg_temp.q (the owner) and every action runs as the person. Result: qa/backup-rules.json.
begin;
create temp table r(n serial, k text, v text, expect text);
create temp table v(k text primary key, val text);
grant all on r, v to public; grant usage on sequence r_n_seq to public;
insert into public.accounts (email, display_name, role, pages, protected) values
 ('adm@t.test','Adm','admin','{}',true),('dir@t.test','Dir','director','{media}',false),('wri@t.test','Wri','writer','{media}',false);
insert into auth.users (id, email, email_confirmed_at) values
 ('00000000-0000-0000-0000-0000000000a1','adm@t.test',now()),('00000000-0000-0000-0000-0000000000d1','dir@t.test',now()),
 ('00000000-0000-0000-0000-0000000000c1','wri@t.test',now());
insert into public.mail_server_key (id, key_hash) values (1, encode(sha256(convert_to('k-backup-run-only', 'UTF8')), 'hex'))
  on conflict (id) do update set key_hash = excluded.key_hash;
create function pg_temp.who(id text) returns void language sql as $$ select set_config('request.jwt.claims', json_build_object('sub',id,'role','authenticated')::text, true) $$;
create function pg_temp.t(k text, sqltext text, e text) returns void language plpgsql as $$
begin
  begin execute sqltext; insert into r(k,v,expect) values (k,'ok',e);
  exception when others then insert into r(k,v,expect) values (k,'ERR '||sqlerrm,e); end;
end $$;
create function pg_temp.c(k text, val text, e text) returns void language sql as $$ insert into r(k,v,expect) values (k,val,e) $$;
create function pg_temp.g(k text) returns text language sql as $$ select val from v where k = $1 $$;
create function pg_temp.q(sqltext text) returns text language plpgsql security definer as $$
declare res text; begin execute sqltext into res; return res; end $$;
grant execute on function pg_temp.who(text), pg_temp.t(text,text,text), pg_temp.c(text,text,text), pg_temp.g(text), pg_temp.q(text) to public;

-- The real files already in the database (the plan will include them too).
insert into v select 'real', (select count(*) from public.file_locations where role = 'primary' and state in ('ok','pending'))::text;
insert into v select 'realfiles', (select count(*) from public.media_files)::text;

-- Fixtures: Drive and a second provider connected; three assets (one already missing) and a mail file --
update public.integrations set state = 'connected' where id = '00000000-0000-4000-8000-0000000000d1';
insert into public.integrations (id, kind, type, label, state, config, created_by)
  values ('00000000-0000-4000-8000-0000000000e1', 'storage', 's3_compatible', 'Backup S3', 'connected', '{"bucket":"bk-files"}', 'adm@t.test');
insert into public.integrations (id, kind, type, label, state, config, created_by)
  values ('00000000-0000-4000-8000-0000000000e2', 'storage', 's3_compatible', 'Pending S3', 'pending', '{"bucket":"bk-two"}', 'adm@t.test');
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000a1');
insert into public.media_files (id, drive_file_id, name, mime_type, size_bytes, kind, uploaded_by, folder_id) values
 ('00000000-0000-0000-0000-00000000a001', 'bk-a1-1', 'a1.png', 'image/png', 1000, 'image', 'adm@t.test', '00000000-0000-0000-0000-0000000000a1'),
 ('00000000-0000-0000-0000-00000000a002', 'bk-a2-1', 'a2.png', 'image/png', 2000, 'image', 'adm@t.test', '00000000-0000-0000-0000-0000000000a1'),
 ('00000000-0000-0000-0000-00000000a003', 'bk-a3-1', 'a3.png', 'image/png', 3000, 'image', 'adm@t.test', '00000000-0000-0000-0000-0000000000a1');
reset role;
insert into public.mail_files (id, drive_file_id, name, mime_type, size_bytes, uploaded_by)
values ('00000000-0000-0000-0000-00000000b001', 'bk-m1-1', 'private-attachment.pdf', 'application/pdf', 4000, 'adm@t.test');
update public.file_locations set state = 'missing' where ref = 'bk-a3-1';

-- Who may ----------------------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000c1');
select pg_temp.t('01 a writer cannot read the backups overview', $q$ select public.backup_overview() $q$, 'ERR FORBIDDEN');
select pg_temp.t('02 nor start a run', $q$ select public.backup_run_begin('database') $q$, 'ERR FORBIDDEN');
select pg_temp.t('03 nor set the policy', $q$ select public.backup_policy_set('files', 'manual', 7, 7, true) $q$, 'ERR FORBIDDEN');
select pg_temp.t('04 nor read an export plan or a page', $q$ select public.backup_export_plan('database') $q$, 'ERR FORBIDDEN');
select pg_temp.t('05 nor restore a file', $q$ select public.backup_restore_file('media_version', '00000000-0000-0000-0000-00000000a001') $q$, 'ERR FORBIDDEN');
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
select pg_temp.t('06 the director holds none of these rights by default', $q$ select public.backup_overview() $q$, 'ERR FORBIDDEN');

-- The administrator: overview, target, policy -----------------------------------------------------------
select pg_temp.who('00000000-0000-0000-0000-0000000000a1');
select pg_temp.c('07 the overview lists three kinds, all stale (no run yet), no target, the second provider as a candidate',
  (select jsonb_array_length(o->'jobs')::text || ':' || (select count(*) filter (where (j->>'stale')::boolean) from jsonb_array_elements(o->'jobs') j)::text || ':' ||
          coalesce((o->'target'->>'id'), 'none') || ':' || (select count(*) from jsonb_array_elements(o->'candidates') c where c->>'type' = 's3_compatible')::text
   from (select public.backup_overview() o) x), '3:3:none:1');
select pg_temp.t('08 the library\'s own provider cannot be the backup target', $q$ select public.backup_target_set('00000000-0000-4000-8000-0000000000d1') $q$, 'ERR BACKUP_SAME_PROVIDER');
select pg_temp.t('09 nor one that is not connected', $q$ select public.backup_target_set('00000000-0000-4000-8000-0000000000e2') $q$, 'ERR BACKUP_TARGET_NOT_READY');
select pg_temp.t('10 a copy run without a target is refused', $q$ select public.backup_run_begin('files') $q$, 'ERR BACKUP_NO_TARGET');
select pg_temp.who('00000000-0000-0000-0000-0000000000c1');
select pg_temp.t('11 a writer cannot set the target', $q$ select public.backup_target_set('00000000-0000-4000-8000-0000000000e1') $q$, 'ERR FORBIDDEN');
select pg_temp.who('00000000-0000-0000-0000-0000000000a1');
select public.backup_target_set('00000000-0000-4000-8000-0000000000e1');
select pg_temp.c('12 the target is set and shown', (public.backup_overview()->'target'->>'label'), 'Backup S3');
select pg_temp.t('13 only a manual frequency is accepted: nothing is scheduled', $q$ select public.backup_policy_set('files', 'daily', 7, 7, true) $q$, 'ERR BACKUP_NO_SCHEDULER');
select pg_temp.t('14 a retention of zero is refused', $q$ select public.backup_policy_set('database', 'manual', 0, 7, true) $q$, 'ERR BACKUP_BAD_POLICY');
select public.backup_policy_set('database', 'manual', 2, 3, true);
select pg_temp.c('15 the policy is saved', (select (j->>'retention_count') || ':' || (j->>'warn_days') from jsonb_array_elements(public.backup_overview()->'jobs') j where j->>'kind' = 'database'), '2:3');

-- What an export holds ----------------------------------------------------------------------------------
select pg_temp.c('16 the plan of the records lists their tables with counts, and holds no mail or messaging table',
  (select (count(*) filter (where e->>'table' like 'mail_%' or e->>'table' like 'chat_%' or e->>'table' in ('reminders','notifications','profiles','undo_steps','storage_move_items')))::text || ':' ||
          (count(*) filter (where e->>'table' = 'media_files'))::text || ':' || (select (e->>'rows') from jsonb_array_elements(public.backup_export_plan('database')) e where e->>'table' = 'media_files')
   from jsonb_array_elements(public.backup_export_plan('database')) e), '0:1:' || (3 + pg_temp.g('realfiles')::int)::text);
select pg_temp.t('17 a table that is not on the list is refused', $q$ select public.backup_export_page('database', 'mail_messages', 0, 10) $q$, 'ERR BACKUP_BAD_TABLE');
select pg_temp.t('17b nor a table of the other kind', $q$ select public.backup_export_page('database', 'role_capabilities', 0, 10) $q$, 'ERR BACKUP_BAD_TABLE');
select pg_temp.t('18 the files kind has no export', $q$ select public.backup_export_plan('files') $q$, 'ERR BACKUP_BAD_KIND');
select public.int_secret_set('00000000-0000-4000-8000-0000000000e1', 'AKIABACKUP:secretvalue654321');
select pg_temp.c('19 an integrations page carries no secret reference or tail',
  (public.backup_export_page('config', 'integrations', 0, 50)::text ~ 'secret_id|pending_secret_id|secretvalue')::text, 'false');
select pg_temp.c('19b but it carries the provider\'s non-secret settings',
  (public.backup_export_page('config', 'integrations', 0, 50)::text like '%bk-files%')::text, 'true');
select pg_temp.c('20 a page of media_files has the three assets and the real ones', jsonb_array_length(public.backup_export_page('database', 'media_files', 0, 50))::text, (3 + pg_temp.g('realfiles')::int)::text);
select pg_temp.c('20b and the page size is capped', (jsonb_array_length(public.backup_export_page('database', 'media_files', 0, 1)))::text, '1');

-- An export run -----------------------------------------------------------------------------------------
insert into v select 'db1', (public.backup_run_begin('database')->>'run');
select pg_temp.t('21 a second run of the same kind while one runs is refused', $q$ select public.backup_run_begin('database') $q$, 'ERR BACKUP_RUNNING');
select pg_temp.t('22 finishing needs the server key', format($q$ select public.backup_run_finish('guess', %L, true, 10, 100, %L, null, null, '{}'::jsonb, null) $q$, pg_temp.g('db1'), repeat('a', 64)), 'ERR FORBIDDEN');
select pg_temp.t('23 a finished export needs a sha256', format($q$ select public.backup_run_finish('k-backup-run-only', %L, true, 10, 100, 'short', null, null, '{}'::jsonb, null) $q$, pg_temp.g('db1')), 'ERR BACKUP_BAD_RECORD');
select public.backup_run_finish('k-backup-run-only', pg_temp.g('db1')::uuid, true, 10, 1234, repeat('a', 64), '00000000-0000-4000-8000-0000000000e1'::uuid, 'backups/database/one.json.gz', '{"works":0}'::jsonb, null);
select pg_temp.c('24 the run is completed with its size and where it is kept',
  pg_temp.q(format($Q$ select state || ':' || size_bytes || ':' || ref || ':' || (verified_at is null)::text from public.backup_runs where id = %L $Q$, pg_temp.g('db1'))), 'completed:1234:backups/database/one.json.gz:true');
select pg_temp.c('25 the overview now has a good database backup, fresh, not verified',
  (select (j->'last_good'->>'items') || ':' || (j->>'stale') || ':' || coalesce(j->'last_good'->>'verified_at', 'none') || ':' || (j->'last_good'->>'kept')
   from jsonb_array_elements(public.backup_overview()->'jobs') j where j->>'kind' = 'database'), '10:false:none:true');
select public.backup_run_verify('k-backup-run-only', pg_temp.g('db1')::uuid, true, 'أُعيدت قراءتها وتطابقت');
select pg_temp.c('26 verification is recorded on the run',
  (select (j->'last_good'->>'verify_ok') || ':' || (j->'last_good'->>'verify_note') from jsonb_array_elements(public.backup_overview()->'jobs') j where j->>'kind' = 'database'), 'true:أُعيدت قراءتها وتطابقت');
select pg_temp.c('27 the general overview carries the age and that something is still stale',
  (select (o->>'last_backup' is not null)::text || ':' || (o->>'backup_stale') from (select public.settings_overview() o) x), 'true:true');

-- Keeping only the last few exports ---------------------------------------------------------------------
insert into v select 'db2', (public.backup_run_begin('database')->>'run');
select public.backup_run_finish('k-backup-run-only', pg_temp.g('db2')::uuid, true, 10, 1300, repeat('b', 64), '00000000-0000-4000-8000-0000000000e1'::uuid, 'backups/database/two.json.gz', '{}'::jsonb, null);
insert into v select 'db3', (public.backup_run_begin('database')->>'run');
select public.backup_run_finish('k-backup-run-only', pg_temp.g('db3')::uuid, true, 10, 1400, repeat('c', 64), '00000000-0000-4000-8000-0000000000e1'::uuid, 'backups/database/three.json.gz', '{}'::jsonb, null);
-- A transaction has one clock: the runs are given the ages three separate transactions would have.
reset role;
update public.backup_runs set finished_at = now() - interval '2 hours' where id = pg_temp.g('db1')::uuid;
update public.backup_runs set finished_at = now() - interval '1 hour' where id = pg_temp.g('db2')::uuid;
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000a1');
select pg_temp.c('28 with a retention of two, the oldest export is offered for removal, with its provider',
  (select jsonb_array_length(c)::text || ':' || (c->0->>'ref') || ':' || (c->0->'integration'->>'type')
   from (select public.backup_prune_claim('k-backup-run-only') c) x), '1:backups/database/one.json.gz:s3_compatible');
select pg_temp.t('29 the prune list needs the key', $q$ select public.backup_prune_claim('guess') $q$, 'ERR FORBIDDEN');
select pg_temp.c('30 marking it pruned removes it from the list and from «last good»',
  public.backup_prune_mark('k-backup-run-only', array[(public.backup_prune_claim('k-backup-run-only')->0->>'id')::uuid])::text, '1');
select pg_temp.c('31 nothing more to prune', jsonb_array_length(public.backup_prune_claim('k-backup-run-only'))::text, '0');

-- A files run: the engine in backup mode ------------------------------------------------------------------
insert into v select 'f1', (public.backup_run_begin('files')->>'run');
select pg_temp.c('32 a files run plans one move for the library and one for attachments, both in backup mode',
  pg_temp.q(format($Q$ select count(*)::text || ':' || string_agg(distinct m.mode, ',') || ':' || sum(m.files)::text
     from public.backup_runs r join public.storage_moves m on m.id = any (r.move_ids) where r.id = %L $Q$, pg_temp.g('f1'))), '2:backup:' || (3 + pg_temp.g('real')::int - 0)::text);
select pg_temp.c('33 the library plan skips the file whose primary is already missing',
  pg_temp.q(format($Q$ select count(*)::text from public.storage_move_items i join public.backup_runs r on i.move_id = any (r.move_ids)
     where r.id = %L and i.state = 'skipped' and i.reason = 'source_unhealthy' $Q$, pg_temp.g('f1'))), '1');
select pg_temp.t('34 a second files run while one runs is refused', $q$ select public.backup_run_begin('files') $q$, 'ERR BACKUP_RUNNING');
select pg_temp.t('35 the run cannot be closed while its plans are open', format($q$ select public.backup_run_close(%L) $q$, pg_temp.g('f1')), 'ERR BACKUP_NOT_DONE');
insert into v select 'mv_lib', pg_temp.q(format($Q$ select m.id::text from public.backup_runs r join public.storage_moves m on m.id = any (r.move_ids) where r.id = %L and (m.scope->>'kind') = 'library' $Q$, pg_temp.g('f1')));
insert into v select 'mv_mail', pg_temp.q(format($Q$ select m.id::text from public.backup_runs r join public.storage_moves m on m.id = any (r.move_ids) where r.id = %L and (m.scope->>'kind') = 'mail' $Q$, pg_temp.g('f1')));
select public.storage_move_note('k-backup-run-only', pg_temp.g('mv_lib')::uuid, null, 'bk-files');
select public.storage_move_note('k-backup-run-only', pg_temp.g('mv_mail')::uuid, null, 'bk-files');
select public.storage_move_start(pg_temp.g('mv_lib')::uuid);
select public.storage_move_start(pg_temp.g('mv_mail')::uuid);
insert into v select 'c_lib', public.storage_move_claim('k-backup-run-only', pg_temp.g('mv_lib')::uuid, 10)::text;
insert into v select 'c_mail', public.storage_move_claim('k-backup-run-only', pg_temp.g('mv_mail')::uuid, 10)::text;
select public.storage_move_copied('k-backup-run-only', (e->>'id')::uuid, 'backups/files/' || (e->>'source_ref'), (e->>'size')::bigint, repeat('d', 32), repeat('d', 32))
  from jsonb_array_elements(pg_temp.g('c_lib')::jsonb->'items') e;
select public.storage_move_copied('k-backup-run-only', (e->>'id')::uuid, 'backups/files/' || (e->>'source_ref'), (e->>'size')::bigint, repeat('e', 32), repeat('e', 32))
  from jsonb_array_elements(pg_temp.g('c_mail')::jsonb->'items') e;
select pg_temp.c('36 a copy is recorded with the role backup, not trusted yet',
  pg_temp.q($Q$ select count(*)::text || ':' || string_agg(distinct role || ':' || state || ':' || (verified_at is null)::text, ',') from public.file_locations where ref like 'backups/files/%' $Q$),
  (3 + pg_temp.g('real')::int)::text || ':backup:pending:true');
select public.storage_move_verified('k-backup-run-only', (e->>'id')::uuid, true, 'checksum', null) from jsonb_array_elements(pg_temp.g('c_lib')::jsonb->'items') e;
select public.storage_move_verified('k-backup-run-only', (e->>'id')::uuid, true, 'checksum', null) from jsonb_array_elements(pg_temp.g('c_mail')::jsonb->'items') e;
select pg_temp.t('37 a backup plan never switches a primary', format($q$ select public.storage_move_switch('k-backup-run-only', %L) $q$, (pg_temp.g('c_lib')::jsonb->'items'->0->>'id')), 'ERR MOVE_BAD_STATE');
select pg_temp.c('38 the plans are completed with no hold, and the primaries are where they were',
  pg_temp.q(format($Q$ select string_agg(distinct m.state, ',') || ':' || (select count(*) from public.file_locations where role = 'primary' and ref like 'bk-%%')::text || ':' ||
     (select count(*) from public.file_locations where ref like 'backups/files/%%' and state = 'ok' and verified_at is not null)::text || ':' || bool_and(m.hold_until is null)::text
     from public.backup_runs r join public.storage_moves m on m.id = any (r.move_ids) where r.id = %L $Q$, pg_temp.g('f1'))),
  'completed:4:' || (3 + pg_temp.g('real')::int)::text || ':true');
select pg_temp.c('39 closing the run counts the verified copies and none failed', (public.backup_run_close(pg_temp.g('f1')::uuid)->>'state') || ':' || (public.backup_run_close(pg_temp.g('f1')::uuid)->>'items'), 'completed:' || (3 + pg_temp.g('real')::int)::text);
select pg_temp.c('40 the next files run finds nothing new and completes at once',
  pg_temp.q(format($Q$ select r.state || ':' || cardinality(r.move_ids)::text from public.backup_runs r where r.id = %L $Q$, (public.backup_run_begin('files')->>'run'))), 'completed:0');
select pg_temp.c('41 the overview counts what is backed up', (select (o->'files'->>'backed_up') || ':' || (o->'files'->>'total') from (select public.backup_overview() o) x),
  (3 + pg_temp.g('real')::int)::text || ':' || (4 + pg_temp.g('real')::int)::text);

-- Verifying by reading back ------------------------------------------------------------------------------------
select pg_temp.t('42 the sample list needs the key', $q$ select public.backup_sample_claim('guess', 3) $q$, 'ERR FORBIDDEN');
insert into v select 'sample', public.backup_sample_claim('k-backup-run-only', 5)::text;
select pg_temp.c('43 the sample hands the server the copies to re-read, with checksum and provider',
  (select (jsonb_array_length(s) >= 3)::text || ':' || (s->0->'integration'->>'type') || ':' || (s->0->>'checksum' ~ '^[0-9a-f]{32}$')::text from (select pg_temp.g('sample')::jsonb s) x), 'true:s3_compatible:true');
insert into v select 'bad_loc', pg_temp.q($Q$ select id::text from public.file_locations where ref = 'backups/files/bk-a2-1' $Q$);
insert into v select 'ok_loc1', pg_temp.q($Q$ select id::text from public.file_locations where ref = 'backups/files/bk-a1-1' $Q$);
insert into v select 'ok_loc2', pg_temp.q($Q$ select id::text from public.file_locations where ref = 'backups/files/bk-m1-1' $Q$);
select pg_temp.c('44 a copy that does not read back as recorded is marked failed; the others are verified, and the run says so',
  (public.backup_sample_mark('k-backup-run-only', pg_temp.g('f1')::uuid,
     jsonb_build_array(jsonb_build_object('id', pg_temp.g('bad_loc'), 'ok', false),
                       jsonb_build_object('id', pg_temp.g('ok_loc1'), 'ok', true),
                       jsonb_build_object('id', pg_temp.g('ok_loc2'), 'ok', true)))->>'failed'), '1');
select pg_temp.c('45 the failed copy is marked, and the run is not verified',
  pg_temp.q(format($Q$ select (select state from public.file_locations where id = %L) || ':' || (select verify_ok::text from public.backup_runs where id = %L) $Q$, pg_temp.g('bad_loc'), pg_temp.g('f1'))), 'failed:false');
select pg_temp.c('46 the overview counts the failed copy', (public.backup_overview()->'files'->>'failed_copies'), '1');

-- Restoring a file whose primary is gone ----------------------------------------------------------------------
select pg_temp.c('47 nothing needs restoring while every primary is fine', (public.backup_overview()->>'restorable'), '0');
reset role;
update public.file_locations set state = 'missing' where ref = 'bk-a1-1';
update public.file_locations set state = 'missing' where ref = 'bk-a2-1';
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000a1');
select pg_temp.c('48 a missing primary with a verified backup is restorable, with the library name; attachments are not named',
  (select count(*)::text || ':' || coalesce(string_agg(e->>'name', ',' order by e->>'name'), '') from jsonb_array_elements(public.backup_restorable()) e where e->>'name' is not null), '1:a1.png');
select pg_temp.c('49 and the list shows no attachment name', (public.backup_restorable()::text like '%private-attachment%')::text, 'false');
select pg_temp.who('00000000-0000-0000-0000-0000000000c1');
select pg_temp.t('50 a writer cannot restore', format($q$ select public.backup_restore_file('media_version', %L) $q$, (select pg_temp.q($Q$ select id::text from public.media_versions where drive_file_id = 'bk-a1-1' $Q$))), 'ERR FORBIDDEN');
select pg_temp.who('00000000-0000-0000-0000-0000000000a1');
insert into v select 'ver_a1', pg_temp.q($Q$ select id::text from public.media_versions where drive_file_id = 'bk-a1-1' $Q$);
insert into v select 'ver_a2', pg_temp.q($Q$ select id::text from public.media_versions where drive_file_id = 'bk-a2-1' $Q$);
insert into v select 'ver_a3', pg_temp.q($Q$ select id::text from public.media_versions where drive_file_id = 'bk-a3-1' $Q$);
select public.backup_restore_file('media_version', pg_temp.g('ver_a1')::uuid);
select pg_temp.c('51 after the restore the backup is the primary and the lost original is a replica',
  pg_temp.q(format($Q$ select string_agg(i.type || ':' || l.role || ':' || l.state, ',' order by l.role) from public.file_locations l join public.integrations i on i.id = l.integration_id
     where l.subject_id = %L $Q$, pg_temp.g('ver_a1'))), 's3_compatible:primary:ok,google_drive:replica:missing');
reset role;
set local role anon;
select pg_temp.c('52 the library is served through the legacy reference from the backup provider now',
  (select (e->>'type') || ':' || (e->>'role') from jsonb_array_elements(public.storage_serving('k-backup-run-only', 'bk-a1-1')) e order by (e->>'role') = 'primary' desc limit 1), 's3_compatible:primary');
reset role;
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000a1');
select pg_temp.t('53 restoring it again is not needed', format($q$ select public.backup_restore_file('media_version', %L) $q$, pg_temp.g('ver_a1')), 'ERR BACKUP_NOT_NEEDED');
select pg_temp.t('54 a file whose backup was not verified cannot be restored', format($q$ select public.backup_restore_file('media_version', %L) $q$, pg_temp.g('ver_a2')), 'ERR BACKUP_NONE');

-- Privacy of the tables and of the functions ---------------------------------------------------------------------
select pg_temp.t('55 the run and policy tables have no read policy: the administrator reads nothing directly', $q$ do $d$ declare n int; begin
    select count(*) into n from public.backup_runs;
    if n > 0 then raise exception 'READ %', n; end if; end $d$ $q$, 'ok');
reset role;
set local role anon;
select pg_temp.t('56 a visitor calls none of them', $q$ select public.backup_overview() $q$, 'ERR permission denied');
select pg_temp.t('56b not the sample either', $q$ select public.backup_sample_claim('k-backup-run-only', 3) $q$, 'ERR permission denied');
reset role;
select pg_temp.c('57 the log has the runs, the verification, the restore and the policy, and no secret or reference',
  (select count(*) filter (where kind = 'backup_run')::text || ':' || count(*) filter (where kind = 'backup_verified')::text || ':' || count(*) filter (where kind = 'backup_restored')::text || ':' ||
          count(*) filter (where kind = 'backup_policy')::text || ':' || bool_or(data::text ~ 'secretvalue|backups/')::text
   from public.integration_events where kind like 'backup_%'), '5:2:1:1:false');

select * from (
  select n, k, v, expect from r where not (v is not distinct from expect or (expect like 'ERR%' and v like expect || '%'))
  union all select 0, 'TOTAL', count(*)::text, (count(*) filter (where v is not distinct from expect or (expect like 'ERR%' and v like expect || '%')))::text || ' passed' from r) z order by n;
rollback;

-- Settings Step S4: the move engine's own flows after the backup migrations replaced three of its functions
-- (storage_move_plan, storage_move_copied, storage_move_start). A short regression of S3's core: plan scope,
-- the approved flag, copy as a replica, switch, the approved-by-checksum rule, plans of different scopes
-- starting together while the same scope still waits, an unknown mode refused, and a backup plan holding
-- nothing. The full S3 run (95 checks) is supabase/tests/storage_move_rules.sql. One transaction, rolled
-- back; the server key is a throwaway inside it. Result: qa/backup-rules.json (section "engineRegression").
begin;
create temp table r(n serial, k text, v text, expect text);
create temp table v(k text primary key, val text);
grant all on r, v to public; grant usage on sequence r_n_seq to public;
insert into public.accounts (email, display_name, role, pages, protected) values
 ('adm@t.test','Adm','admin','{}',true),('dir@t.test','Dir','director','{media}',false),('wri@t.test','Wri','writer','{media}',false);
insert into auth.users (id, email, email_confirmed_at) values
 ('00000000-0000-0000-0000-0000000000a1','adm@t.test',now()),('00000000-0000-0000-0000-0000000000d1','dir@t.test',now()),
 ('00000000-0000-0000-0000-0000000000c1','wri@t.test',now());
insert into public.mail_server_key (id, key_hash) values (1, encode(sha256(convert_to('k-move-run-only', 'UTF8')), 'hex'))
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

update public.integrations set state = 'connected' where id = '00000000-0000-4000-8000-0000000000d1';
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000a1');
insert into public.media_folders (id, parent_id, name, created_by) values
 ('00000000-0000-0000-0000-00000000f001', '00000000-0000-0000-0000-0000000000a1', 'F1', 'adm@t.test'),
 ('00000000-0000-0000-0000-00000000f002', '00000000-0000-0000-0000-00000000f001', 'F2', 'adm@t.test');
insert into public.media_files (id, drive_file_id, name, mime_type, size_bytes, kind, uploaded_by, folder_id) values
 ('00000000-0000-0000-0000-00000000a001', 'mv-a1-1', 'a1.png', 'image/png', 1000, 'image', 'adm@t.test', '00000000-0000-0000-0000-00000000f001'),
 ('00000000-0000-0000-0000-00000000a002', 'mv-a2-1', 'a2.png', 'image/png', 2000, 'image', 'adm@t.test', '00000000-0000-0000-0000-00000000f002'),
 ('00000000-0000-0000-0000-00000000a003', 'mv-a3-1', 'a3.png', 'image/png', 3000, 'image', 'adm@t.test', '00000000-0000-0000-0000-0000000000a1');
insert into public.media_versions (asset_id, version, drive_file_id, size_bytes, mime_type, uploaded_by)
values ('00000000-0000-0000-0000-00000000a001', 2, 'mv-a1-2', 1500, 'image/png', 'adm@t.test');
reset role;
insert into public.mail_files (id, drive_file_id, name, mime_type, size_bytes, uploaded_by)
values ('00000000-0000-0000-0000-00000000b001', 'mv-m1-1', 'att.pdf', 'application/pdf', 4000, 'adm@t.test');
set local session_replication_role = replica;
update public.media_files set approved_version = 1 where id = '00000000-0000-0000-0000-00000000a002';
set local session_replication_role = origin;
update public.file_locations set state = 'missing' where ref = 'mv-a3-1';

set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000c1');
select pg_temp.t('01 a writer cannot add a provider', $q$ select public.storage_provider_save(null, 'X', '{"endpoint":"https://s3.example.org","bucket":"abc"}'::jsonb) $q$, 'ERR FORBIDDEN');
select pg_temp.t('02 nor plan a move', $q$ select public.storage_move_plan('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000d1', '{"kind":"library"}'::jsonb, 'move', null, 14) $q$, 'ERR FORBIDDEN');
select pg_temp.t('03 nor read the plans', $q$ select public.storage_moves_overview() $q$, 'ERR FORBIDDEN');
select pg_temp.who('00000000-0000-0000-0000-0000000000a1');
insert into v select 's3', public.storage_provider_save(null, 'Test S3', '{"endpoint":"https://s3.example.org/storage/v1/s3/","bucket":"hub-files","region":"","prefix":"/hub/","flavor":"supabase"}'::jsonb)::text;
reset role;
update public.integrations set state = 'connected' where id = pg_temp.g('s3')::uuid;
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000a1');
insert into v select 'p1', public.storage_move_plan('00000000-0000-4000-8000-0000000000d1', pg_temp.g('s3')::uuid,
  '{"kind":"library","folder_id":"00000000-0000-0000-0000-00000000f001"}'::jsonb, 'move', 'folder one', 14)::text;
select pg_temp.c('23 a folder plan holds the versions of the folder and the folder below it, and nothing else',
  pg_temp.q(format($Q$ select count(*)::text || ':' || sum(size_bytes)::text from public.storage_move_items where move_id = %L and state = 'pending' $Q$, pg_temp.g('p1'))), '3:4500');
select pg_temp.c('24 the approved version is marked',
  pg_temp.q(format($Q$ select count(*)::text from public.storage_move_items i join public.file_locations l on l.id = i.source_location_id
   where i.move_id = %L and i.approved and l.ref = 'mv-a2-1' $Q$, pg_temp.g('p1'))), '1');
select pg_temp.t('36 a plan whose destination was not checked cannot start', format($q$ select public.storage_move_start(%L) $q$, pg_temp.g('p1')), 'ERR MOVE_NOT_CHECKED');
select public.storage_move_note('k-move-run-only', pg_temp.g('p1')::uuid, null, 'hub-files@s3.example.org');
select pg_temp.t('37 start', format($q$ select public.storage_move_start(%L) $q$, pg_temp.g('p1')), 'ok');
insert into v select 'claim', public.storage_move_claim('k-move-run-only', pg_temp.g('p1')::uuid, 3)::text;
insert into v select 'it_a1v1', e->>'id' from jsonb_array_elements(pg_temp.g('claim')::jsonb->'items') e where e->>'source_ref' = 'mv-a1-1';
insert into v select 'it_a1v2', e->>'id' from jsonb_array_elements(pg_temp.g('claim')::jsonb->'items') e where e->>'source_ref' = 'mv-a1-2';
insert into v select 'it_a2v1', e->>'id' from jsonb_array_elements(pg_temp.g('claim')::jsonb->'items') e where e->>'source_ref' = 'mv-a2-1';
select public.storage_move_copied('k-move-run-only', pg_temp.g('it_a1v1')::uuid, 'hub/library/a1v1', 1000, repeat('a', 32), repeat('a', 32));
select pg_temp.c('47 a move copy is recorded as a replica (not a backup role), pending',
  pg_temp.q($Q$ select string_agg(l.role || ':' || l.state, ',' order by l.role) from public.file_locations l where l.subject_kind = 'media_version' and l.subject_id = (select v.id from public.media_versions v where v.drive_file_id = 'mv-a1-1') $Q$), 'primary:ok,replica:pending');
select public.storage_move_verified('k-move-run-only', pg_temp.g('it_a1v1')::uuid, true, 'checksum', null);
select public.storage_move_switch('k-move-run-only', pg_temp.g('it_a1v1')::uuid);
select pg_temp.c('48 switch still works for a move',
  pg_temp.q($Q$ select string_agg(i.type || ':' || l.role || ':' || l.state, ',' order by l.role) from public.file_locations l join public.integrations i on i.id = l.integration_id
   where l.subject_kind = 'media_version' and l.subject_id = (select v.id from public.media_versions v where v.drive_file_id = 'mv-a1-1') $Q$), 's3_compatible:primary:ok,google_drive:replica:ok');
select public.storage_move_copied('k-move-run-only', pg_temp.g('it_a2v1')::uuid, 'hub/library/a2v1', 2000, repeat('c', 32), repeat('c', 32));
select public.storage_move_verified('k-move-run-only', pg_temp.g('it_a2v1')::uuid, true, 'size', null);
select pg_temp.c('51 an approved version verified by size is still failed',
  pg_temp.q(format($Q$ select i.state || ':' || i.reason from public.storage_move_items i where i.id = %L $Q$, pg_temp.g('it_a2v1'))), 'failed:APPROVED_NEEDS_CHECKSUM');
insert into v select 'mail', public.storage_move_plan('00000000-0000-4000-8000-0000000000d1', pg_temp.g('s3')::uuid, '{"kind":"mail"}'::jsonb, 'copy', 'mail copy', 14)::text;
select public.storage_move_note('k-move-run-only', pg_temp.g('mail')::uuid, null, 'x');
select pg_temp.t('60 a mail plan starts while the library plan is still open (different scope)', format($q$ select public.storage_move_start(%L) $q$, pg_temp.g('mail')), 'ok');
insert into v select 'lib2', public.storage_move_plan('00000000-0000-4000-8000-0000000000d1', pg_temp.g('s3')::uuid, '{"kind":"library","asset_ids":["00000000-0000-0000-0000-00000000a003"]}'::jsonb, 'copy', 'x', 14)::text;
select public.storage_move_note('k-move-run-only', pg_temp.g('lib2')::uuid, null, 'x');
select pg_temp.t('61 a second library plan between the same providers still waits while one runs', format($q$ select public.storage_move_start(%L) $q$, pg_temp.g('lib2')), 'ERR MOVE_ALREADY_RUNNING');
select pg_temp.t('62 the engine refuses an unknown mode', format($q$ select public.storage_move_plan('00000000-0000-4000-8000-0000000000d1', %L, '{"kind":"library"}'::jsonb, 'sync', null, 14) $q$, pg_temp.g('s3')), 'ERR MOVE_BAD_MODE');
select pg_temp.t('63 a hold over a year is still refused for a move', format($q$ select public.storage_move_plan('00000000-0000-4000-8000-0000000000d1', %L, '{"kind":"library"}'::jsonb, 'move', null, 400) $q$, pg_temp.g('s3')), 'ERR MOVE_BAD_HOLD');
select pg_temp.c('64 a backup plan ignores the hold given and has none',
  pg_temp.q(format($Q$ select hold_days::text from public.storage_moves where id = %L $Q$, public.storage_move_plan('00000000-0000-4000-8000-0000000000d1', pg_temp.g('s3')::uuid, '{"kind":"mail"}'::jsonb, 'backup', 'b', 99))), '0');

select * from (
  select n, k, v, expect from r where not (v is not distinct from expect or (expect like 'ERR%' and v like expect || '%'))
  union all select 0, 'TOTAL', count(*)::text, (count(*) filter (where v is not distinct from expect or (expect like 'ERR%' and v like expect || '%')))::text || ' passed' from r) z order by n;
rollback;

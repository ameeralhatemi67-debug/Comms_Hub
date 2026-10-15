-- Settings Step S3 (migrations 20261015140000_storage_move_engine.sql, ...140100_storage_move_release.sql,
-- ...140200_storage_verify_providers.sql, ...140300_storage_provider_prefix.sql): a second provider and the
-- move engine. Who may plan, run and retire a move, that a copy is switched only after it was verified (and
-- an approved version only by checksum), that a held source is retired only after its hold and never while it
-- is a primary, that the serving lookup follows the live copy, and that no secret or reference leaves a
-- function it should not. One transaction, rolled back at the end. The site's server key is replaced by a
-- throwaway inside the transaction only (compare md5(key_hash) before and after).
-- The move tables and file_locations have row level security and no policy, so a signed-in role reads none
-- of their rows: the checks read them through pg_temp.q (the owner), and every action runs as the person.
-- Result: qa/storage-move-rules.json.
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

-- Fixtures: both providers connected, a folder tree, three assets and a mail file ----------------------
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
-- The only version of asset A2 is the approved one (set past the stage rules: test fixture).
set local session_replication_role = replica;
update public.media_files set approved_version = 1 where id = '00000000-0000-0000-0000-00000000a002';
set local session_replication_role = origin;
-- One location is already missing: it cannot be moved from.
update public.file_locations set state = 'missing' where ref = 'mv-a3-1';

-- Providers -----------------------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000c1');
select pg_temp.t('01 a writer cannot add a provider', $q$ select public.storage_provider_save(null, 'X', '{"endpoint":"https://s3.example.org","bucket":"abc"}'::jsonb) $q$, 'ERR FORBIDDEN');
select pg_temp.t('02 nor plan a move', $q$ select public.storage_move_plan('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000d1', '{"kind":"library"}'::jsonb, 'move', null, 14) $q$, 'ERR FORBIDDEN');
select pg_temp.t('03 nor read the plans', $q$ select public.storage_moves_overview() $q$, 'ERR FORBIDDEN');
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
select pg_temp.t('04 the director holds neither right by default', $q$ select public.storage_provider_save(null, 'X', '{"endpoint":"https://s3.example.org","bucket":"abc"}'::jsonb) $q$, 'ERR FORBIDDEN');
select pg_temp.t('04b nor can plan', $q$ select public.storage_move_plan('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000d1', '{"kind":"library"}'::jsonb, 'move', null, 14) $q$, 'ERR FORBIDDEN');

select pg_temp.who('00000000-0000-0000-0000-0000000000a1');
select pg_temp.t('05 an address that is not https is refused', $q$ select public.storage_provider_save(null, 'X', '{"endpoint":"http://s3.example.org","bucket":"abcd"}'::jsonb) $q$, 'ERR PROVIDER_ENDPOINT');
select pg_temp.t('06 an IP address is refused', $q$ select public.storage_provider_save(null, 'X', '{"endpoint":"https://169.254.169.254","bucket":"abcd"}'::jsonb) $q$, 'ERR PROVIDER_ENDPOINT');
select pg_temp.t('07 localhost is refused', $q$ select public.storage_provider_save(null, 'X', '{"endpoint":"https://localhost:9000","bucket":"abcd"}'::jsonb) $q$, 'ERR PROVIDER_ENDPOINT');
select pg_temp.t('08 an internal name is refused', $q$ select public.storage_provider_save(null, 'X', '{"endpoint":"https://minio.corp.internal","bucket":"abcd"}'::jsonb) $q$, 'ERR PROVIDER_ENDPOINT');
select pg_temp.t('09 credentials in the address are refused', $q$ select public.storage_provider_save(null, 'X', '{"endpoint":"https://u:p@s3.example.org","bucket":"abcd"}'::jsonb) $q$, 'ERR PROVIDER_ENDPOINT');
select pg_temp.t('09b a query string is refused', $q$ select public.storage_provider_save(null, 'X', '{"endpoint":"https://s3.example.org/?x=1","bucket":"abcd"}'::jsonb) $q$, 'ERR PROVIDER_ENDPOINT');
select pg_temp.t('10 an upper-case bucket is refused', $q$ select public.storage_provider_save(null, 'X', '{"endpoint":"https://s3.example.org","bucket":"Abcd"}'::jsonb) $q$, 'ERR PROVIDER_BUCKET');
select pg_temp.t('11 a prefix that climbs out (a dot segment) is refused', $q$ select public.storage_provider_save(null, 'X', '{"endpoint":"https://s3.example.org","bucket":"abcd","prefix":"../x"}'::jsonb) $q$, 'ERR PROVIDER_PREFIX');
select pg_temp.t('11b so is a dot segment inside it', $q$ select public.storage_provider_save(null, 'X', '{"endpoint":"https://s3.example.org","bucket":"abcd","prefix":"a/./b"}'::jsonb) $q$, 'ERR PROVIDER_PREFIX');
select pg_temp.t('12 an empty label is refused', $q$ select public.storage_provider_save(null, '  ', '{"endpoint":"https://s3.example.org","bucket":"abcd"}'::jsonb) $q$, 'ERR PROVIDER_LABEL');
select pg_temp.t('13 an unknown flavour is refused', $q$ select public.storage_provider_save(null, 'X', '{"endpoint":"https://s3.example.org","bucket":"abcd","flavor":"azure"}'::jsonb) $q$, 'ERR PROVIDER_FLAVOR');

insert into v select 's3', public.storage_provider_save(null, 'Test S3', '{"endpoint":"https://s3.example.org/storage/v1/s3/","bucket":"hub-files","region":"","prefix":"/hub/","flavor":"supabase"}'::jsonb)::text;
insert into v select 's3b', public.storage_provider_save(null, 'Empty S3', '{"endpoint":"https://s3.other.example.org","bucket":"empty-one","region":"eu-1"}'::jsonb)::text;
select pg_temp.c('14 a provider is added pending, with its settings normalised (no trailing slash, region auto, prefix trimmed)',
  pg_temp.q(format($Q$ select i.state || ':' || (i.config->>'endpoint') || ':' || (i.config->>'region') || ':' || (i.config->>'prefix') || ':' || (i.config->>'path_style') || ':' || i.kind || ':' || i.type
   from public.integrations i where i.id = %L $Q$, pg_temp.g('s3'))),
  'pending:https://s3.example.org/storage/v1/s3:auto:hub:true:storage:s3_compatible');
select pg_temp.c('15 the log says it was created, by whom, and holds no address',
  pg_temp.q(format($Q$ select count(*)::text || ':' || min(actor) || ':' || bool_or(data::text like '%%example.org%%')::text from public.integration_events where kind = 'created' and integration_id = %L $Q$, pg_temp.g('s3'))),
  '1:adm@t.test:false');
select pg_temp.t('16 a plan to a provider that is not connected yet is refused',
  format($q$ select public.storage_move_plan('00000000-0000-4000-8000-0000000000d1', %L, '{"kind":"library"}'::jsonb, 'move', null, 14) $q$, pg_temp.g('s3')), 'ERR MOVE_PROVIDER_NOT_READY');
reset role;
update public.integrations set state = 'connected' where id in (pg_temp.g('s3')::uuid, pg_temp.g('s3b')::uuid);
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000a1');

-- Secrets of the second provider -----------------------------------------------------------------------
select pg_temp.c('17 a key pair is stored pending through int_secret_set and only its tail comes back',
  public.int_secret_set(pg_temp.g('s3')::uuid, 'AKIATESTKEY:secretvalue123456'), '••••3456');
select pg_temp.c('18 the overview shows no secret, only that none is committed and the settings',
  (select (p->>'has_secret') || ':' || (public.storage_overview()::text like '%secretvalue%')::text || ':' || (p->'config'->>'bucket')
   from jsonb_array_elements(public.storage_overview()->'providers') p where p->>'id' = pg_temp.g('s3')), 'false:false:hub-files');
select pg_temp.who('00000000-0000-0000-0000-0000000000c1');
select pg_temp.t('19 a writer cannot enter a secret', format($q$ select public.int_secret_set(%L, 'AKIATESTKEY:another12345678') $q$, pg_temp.g('s3')), 'ERR FORBIDDEN');
select pg_temp.t('20 and cannot read one by id with a guessed key', format($q$ select public.int_secret_use_id('guess', %L, 'x', true) $q$, pg_temp.g('s3')), 'ERR FORBIDDEN');
reset role;
set local role anon;
select pg_temp.c('21 the server reads the pending pair by id with its key',
  public.int_secret_use_id('k-move-run-only', pg_temp.g('s3')::uuid, 'check before commit', true), 'AKIATESTKEY:secretvalue123456');
select pg_temp.c('21b and records a health result by id, which changes the state',
  (public.storage_provider_health('k-move-run-only', pg_temp.g('s3')::uuid, false, 'S3_FORBIDDEN', null))::text, '');
reset role;
select pg_temp.c('22 the state follows the result, and the error is recorded',
  (select state || ':' || last_error from public.integrations where id = pg_temp.g('s3')::uuid), 'error:S3_FORBIDDEN');
select pg_temp.c('22b the log of a use names the purpose and never the value',
  (select count(*)::text || ':' || bool_or(data::text like '%secretvalue%')::text from public.integration_events where kind = 'secret_used' and integration_id = pg_temp.g('s3')::uuid), '1:false');
update public.integrations set state = 'connected' where id = pg_temp.g('s3')::uuid;
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000a1');

-- Plans (the dry run) ---------------------------------------------------------------------------------
insert into v select 'p1', public.storage_move_plan('00000000-0000-4000-8000-0000000000d1', pg_temp.g('s3')::uuid,
  '{"kind":"library","folder_id":"00000000-0000-0000-0000-00000000f001"}'::jsonb, 'move', 'folder one', 14)::text;
select pg_temp.c('23 a folder plan holds the versions of the folder and the folder below it, and nothing else',
  pg_temp.q(format($Q$ select count(*)::text || ':' || sum(size_bytes)::text from public.storage_move_items where move_id = %L and state = 'pending' $Q$, pg_temp.g('p1'))), '3:4500');
select pg_temp.c('24 the approved version is marked, so it can only be moved by checksum',
  pg_temp.q(format($Q$ select count(*)::text from public.storage_move_items i join public.file_locations l on l.id = i.source_location_id
   where i.move_id = %L and i.approved and l.ref = 'mv-a2-1' $Q$, pg_temp.g('p1'))), '1');
select pg_temp.c('25 the plan copied nothing: no location was written at the destination',
  pg_temp.q(format($Q$ select count(*)::text from public.file_locations where integration_id = %L $Q$, pg_temp.g('s3'))), '0');
select pg_temp.c('26 its report says files, bytes and that it is planned',
  (select (r->'move'->>'state') || ':' || (r->'move'->>'files') || ':' || (r->'move'->>'bytes') || ':' || (r->>'approved') || ':' || (r->>'already_there')
   from (select public.storage_move_report(pg_temp.g('p1')::uuid) r) x), 'planned:3:4500:1:0');
select pg_temp.c('27 the report holds no reference and no upload state',
  (public.storage_move_report(pg_temp.g('p1')::uuid)::text ~ 'mv-a|progress|session')::text, 'false');
insert into v select 'p3', public.storage_move_plan('00000000-0000-4000-8000-0000000000d1', pg_temp.g('s3')::uuid,
  '{"kind":"library","asset_ids":["00000000-0000-0000-0000-00000000a003"]}'::jsonb, 'move', null, 14)::text;
select pg_temp.c('28 a plan for a file whose copy is missing skips it, with the reason',
  pg_temp.q(format($Q$ select count(*)::text || ':' || min(reason) from public.storage_move_items i where i.move_id = %L and i.state = 'skipped' $Q$, pg_temp.g('p3'))), '1:source_unhealthy');
insert into v select 'pdup', public.storage_move_plan('00000000-0000-4000-8000-0000000000d1', pg_temp.g('s3')::uuid,
  '{"kind":"library","asset_ids":["00000000-0000-0000-0000-00000000a001"]}'::jsonb, 'move', null, 14)::text;
select pg_temp.c('29 the same files are not planned twice while the first plan is open',
  pg_temp.q(format($Q$ select count(*)::text from public.storage_move_items i where i.move_id = %L $Q$, pg_temp.g('pdup'))), '0');
select pg_temp.t('30 the same provider on both sides is refused', format($q$ select public.storage_move_plan(%L, %L, '{"kind":"library"}'::jsonb, 'move', null, 14) $q$, pg_temp.g('s3'), pg_temp.g('s3')), 'ERR MOVE_SAME_PROVIDER');
select pg_temp.t('31 a hold over a year is refused', format($q$ select public.storage_move_plan('00000000-0000-4000-8000-0000000000d1', %L, '{"kind":"library"}'::jsonb, 'move', null, 400) $q$, pg_temp.g('s3')), 'ERR MOVE_BAD_HOLD');
select pg_temp.t('32 a scope of something else is refused', format($q$ select public.storage_move_plan('00000000-0000-4000-8000-0000000000d1', %L, '{"kind":"chat"}'::jsonb, 'move', null, 14) $q$, pg_temp.g('s3')), 'ERR MOVE_BAD_SCOPE');
select pg_temp.t('33 a folder scope on the mail kind is refused', format($q$ select public.storage_move_plan('00000000-0000-4000-8000-0000000000d1', %L, '{"kind":"mail","folder_id":"00000000-0000-0000-0000-00000000f001"}'::jsonb, 'move', null, 14) $q$, pg_temp.g('s3')), 'ERR MOVE_BAD_SCOPE');

-- Starting needs a checked destination with room -----------------------------------------------------
select pg_temp.t('34 a plan whose destination was not checked cannot start', format($q$ select public.storage_move_start(%L) $q$, pg_temp.g('p1')), 'ERR MOVE_NOT_CHECKED');
select pg_temp.t('35 the destination check needs the server key', format($q$ select public.storage_move_note('guess', %L, 100000, 'x') $q$, pg_temp.g('p1')), 'ERR FORBIDDEN');
select public.storage_move_note('k-move-run-only', pg_temp.g('p1')::uuid, 100, 'hub-files@s3.example.org');
select pg_temp.t('36 a destination with too little room refuses the start', format($q$ select public.storage_move_start(%L) $q$, pg_temp.g('p1')), 'ERR MOVE_NO_SPACE');
select public.storage_move_note('k-move-run-only', pg_temp.g('p1')::uuid, null, 'hub-files@s3.example.org');
select pg_temp.t('37 a destination that does not state its room is allowed', format($q$ select public.storage_move_start(%L) $q$, pg_temp.g('p1')), 'ok');
select pg_temp.c('38 the plan is running, and the log says planned and started',
  pg_temp.q(format($Q$ select (select state from public.storage_moves where id = %L) || ':' || count(*) filter (where kind = 'storage_move_planned')::text || ':' || count(*) filter (where kind = 'storage_move_started')::text
   from public.integration_events where data->>'move' = %L $Q$, pg_temp.g('p1'), pg_temp.g('p1'))), 'running:1:1');

-- Running: claim, record, verify, switch -------------------------------------------------------------
select pg_temp.who('00000000-0000-0000-0000-0000000000c1');
select pg_temp.t('39 a writer with the server key cannot claim', format($q$ select public.storage_move_claim('k-move-run-only', %L, 3) $q$, pg_temp.g('p1')), 'ERR FORBIDDEN');
select pg_temp.who('00000000-0000-0000-0000-0000000000a1');
select pg_temp.t('40 an administrator with a wrong key cannot either', format($q$ select public.storage_move_claim('guess', %L, 3) $q$, pg_temp.g('p1')), 'ERR FORBIDDEN');
insert into v select 'claim', public.storage_move_claim('k-move-run-only', pg_temp.g('p1')::uuid, 3)::text;
select pg_temp.c('41 a claim hands out the three items with their source references, for the server',
  (select jsonb_array_length(c->'items')::text || ':' || (c->'source'->>'type') || ':' || (c->'dest'->>'type')
   from (select pg_temp.g('claim')::jsonb c) x), '3:google_drive:s3_compatible');
select pg_temp.c('42 a second claim finds nothing: all three are leased',
  jsonb_array_length((public.storage_move_claim('k-move-run-only', pg_temp.g('p1')::uuid, 3))->'items')::text, '0');
insert into v select 'it_a1v1', e->>'id' from jsonb_array_elements(pg_temp.g('claim')::jsonb->'items') e where e->>'source_ref' = 'mv-a1-1';
insert into v select 'it_a1v2', e->>'id' from jsonb_array_elements(pg_temp.g('claim')::jsonb->'items') e where e->>'source_ref' = 'mv-a1-2';
insert into v select 'it_a2v1', e->>'id' from jsonb_array_elements(pg_temp.g('claim')::jsonb->'items') e where e->>'source_ref' = 'mv-a2-1';
select pg_temp.c('43 the claim carries the name and mime of what to write',
  (select (e->>'name') || ':' || (e->>'mime') from jsonb_array_elements(pg_temp.g('claim')::jsonb->'items') e where e->>'source_ref' = 'mv-a1-1'), 'a1.png:image/png');

select public.storage_move_progress('k-move-run-only', pg_temp.g('it_a1v1')::uuid, '{"sink":{"uploadId":"u1"},"md5":{"len":0},"offset":0}'::jsonb, 0);
select pg_temp.c('44 saved progress moves the item to copying', pg_temp.q(format($Q$ select state from public.storage_move_items where id = %L $Q$, pg_temp.g('it_a1v1'))), 'copying');
select pg_temp.t('45 a copy with a checksum that is not an md5 is refused', format($q$ select public.storage_move_copied('k-move-run-only', %L, 'hub/library/a1v1', 1000, 'xyz', null) $q$, pg_temp.g('it_a1v1')), 'ERR MOVE_BAD_RECORD');
select pg_temp.t('46 a switch before the copy was verified is refused', format($q$ select public.storage_move_switch('k-move-run-only', %L) $q$, pg_temp.g('it_a1v1')), 'ERR MOVE_BAD_STATE');
select public.storage_move_copied('k-move-run-only', pg_temp.g('it_a1v1')::uuid, 'hub/library/a1v1', 1000, repeat('a', 32), repeat('a', 32));
select pg_temp.c('47 a copy is recorded as a pending replica at the destination, not trusted yet, and the source learns its checksum',
  pg_temp.q($Q$ select string_agg(l.role || ':' || l.state || ':' || (l.verified_at is null)::text || ':' || coalesce(l.checksum, '-'), ',' order by l.role)
   from public.file_locations l where l.subject_kind = 'media_version' and l.subject_id = (select v.id from public.media_versions v where v.drive_file_id = 'mv-a1-1') $Q$),
  'primary:ok:true:' || repeat('a', 32) || ',replica:pending:true:' || repeat('a', 32));
select pg_temp.t('47b a switch of a copy that is not verified is refused', format($q$ select public.storage_move_switch('k-move-run-only', %L) $q$, pg_temp.g('it_a1v1')), 'ERR MOVE_BAD_STATE');
select public.storage_move_verified('k-move-run-only', pg_temp.g('it_a1v1')::uuid, true, 'checksum', null);
select public.storage_move_switch('k-move-run-only', pg_temp.g('it_a1v1')::uuid);
select pg_temp.c('48 after the switch the destination is the primary and the source a replica; one primary only',
  pg_temp.q($Q$ select string_agg(i.type || ':' || l.role || ':' || l.state, ',' order by l.role) from public.file_locations l join public.integrations i on i.id = l.integration_id
   where l.subject_kind = 'media_version' and l.subject_id = (select v.id from public.media_versions v where v.drive_file_id = 'mv-a1-1') $Q$),
  's3_compatible:primary:ok,google_drive:replica:ok');
select pg_temp.c('49 the library row still holds the old Drive reference: nothing that reads it changed',
  pg_temp.q($Q$ select drive_file_id from public.media_versions where drive_file_id = 'mv-a1-1' $Q$), 'mv-a1-1');

select public.storage_move_copied('k-move-run-only', pg_temp.g('it_a1v2')::uuid, 'hub/library/a1v2', 1500, repeat('b', 32), repeat('b', 32));
select public.storage_move_verified('k-move-run-only', pg_temp.g('it_a1v2')::uuid, true, 'size', null);
select pg_temp.c('50 a version that is not approved may be verified by size alone',
  pg_temp.q(format($Q$ select state || ':' || coalesce(verify_level, '-') from public.storage_move_items where id = %L $Q$, pg_temp.g('it_a1v2'))), 'verified:size');
select public.storage_move_switch('k-move-run-only', pg_temp.g('it_a1v2')::uuid);

select public.storage_move_copied('k-move-run-only', pg_temp.g('it_a2v1')::uuid, 'hub/library/a2v1', 2000, repeat('c', 32), repeat('c', 32));
select public.storage_move_verified('k-move-run-only', pg_temp.g('it_a2v1')::uuid, true, 'size', null);
select pg_temp.c('51 an approved version verified by size alone is failed, not switched; its copy is marked failed',
  pg_temp.q(format($Q$ select i.state || ':' || i.reason || ':' || (select state from public.file_locations where id = i.dest_location_id) || ':' ||
          (select role from public.file_locations where id = i.source_location_id) from public.storage_move_items i where i.id = %L $Q$, pg_temp.g('it_a2v1'))),
  'failed:APPROVED_NEEDS_CHECKSUM:failed:primary');
select pg_temp.c('52 all items are settled, so the move is completed, with a hold date 14 days out',
  pg_temp.q(format($Q$ select m.state || ':' || (m.hold_until between now() + interval '13 days' and now() + interval '15 days')::text from public.storage_moves m where m.id = %L $Q$, pg_temp.g('p1'))), 'completed:true');
insert into v select 'retried', public.storage_move_retry(pg_temp.g('p1')::uuid)::text;
select pg_temp.c('53 a retry puts the failed item back and reopens the move',
  pg_temp.g('retried') || ':' || pg_temp.q(format($Q$ select state || ':' || (hold_until is null)::text from public.storage_moves where id = %L $Q$, pg_temp.g('p1'))),
  '1:running:true');
insert into v select 'claim2', public.storage_move_claim('k-move-run-only', pg_temp.g('p1')::uuid, 3)::text;
select pg_temp.c('54 and a claim hands it out again, with the old destination copy to be overwritten',
  (select jsonb_array_length(c->'items')::text || ':' || (c->'items'->0->>'source_ref') || ':' || (c->'items'->0->'dest_location'->>'state')
   from (select pg_temp.g('claim2')::jsonb c) x), '1:mv-a2-1:failed');
select public.storage_move_copied('k-move-run-only', pg_temp.g('it_a2v1')::uuid, 'hub/library/a2v1', 2000, repeat('c', 32), repeat('c', 32));
select public.storage_move_verified('k-move-run-only', pg_temp.g('it_a2v1')::uuid, true, 'checksum', null);
select public.storage_move_switch('k-move-run-only', pg_temp.g('it_a2v1')::uuid);
select pg_temp.c('55 verified by checksum, the approved version is switched',
  pg_temp.q(format($Q$ select i.state || ':' || coalesce(i.verify_level, '-') || ':' || (select role from public.file_locations where id = i.dest_location_id) from public.storage_move_items i where i.id = %L $Q$, pg_temp.g('it_a2v1'))),
  'switched:checksum:primary');
select pg_temp.c('56 the move is completed again, and the completion event counts what happened',
  pg_temp.q(format($Q$ select m.state || ':' || (select (data->>'switched') from public.integration_events where kind = 'storage_move_completed' and data->>'move' = %L order by id desc limit 1)
   from public.storage_moves m where m.id = %L $Q$, pg_temp.g('p1'), pg_temp.g('p1'))), 'completed:3');

-- Serving follows the live copy ------------------------------------------------------------------------
reset role;
set local role anon;
select pg_temp.t('57 the serving lookup needs the key', $q$ select public.storage_serving('guess', 'mv-a1-1') $q$, 'ERR FORBIDDEN');
select pg_temp.c('58 with the key, the legacy reference leads to the new primary first, then the held replica',
  (select string_agg(e->>'type' || ':' || (e->>'role') || ':' || (e->>'ref'), ',' order by ord)
   from jsonb_array_elements(public.storage_serving('k-move-run-only', 'mv-a1-1')) with ordinality t(e, ord)),
  's3_compatible:primary:hub/library/a1v1,google_drive:replica:mv-a1-1');
select pg_temp.c('59 no secret or credential is in what it returns', (public.storage_serving('k-move-run-only', 'mv-a1-1')::text like '%secretvalue%')::text, 'false');
select pg_temp.c('60 an unknown reference answers nothing', public.storage_serving('k-move-run-only', 'mv-none')::text, '[]');
reset role;
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
select pg_temp.c('61 a director who may see the asset sees the provider and role, never a reference',
  (select (e->>'type') || ':' || (e->>'role') || ':' || (public.storage_asset_state('00000000-0000-0000-0000-00000000a001')::text ~ 'mv-a|hub/library')::text
   from jsonb_array_elements(public.storage_asset_state('00000000-0000-0000-0000-00000000a001')) e where e->>'version' = '2' and e->>'role' = 'primary'),
  's3_compatible:primary:false');

-- Holding and retiring the source ----------------------------------------------------------------------
select pg_temp.who('00000000-0000-0000-0000-0000000000a1');
select pg_temp.c('62 the report counts the held sources (three), none retired',
  (select (r->>'retirable') || ':' || (r->>'retired') || ':' || (r->>'hold_over') from (select public.storage_move_report(pg_temp.g('p1')::uuid) r) x), '3:0:false');
select pg_temp.t('63 retiring before the hold is over is refused', format($q$ select public.storage_retire_claim('k-move-run-only', %L, 10) $q$, pg_temp.g('p1')), 'ERR HOLD_NOT_OVER');
-- The way back of asset A1 puts its primary at Drive again: it must then never be retired as a "source".
insert into v select 'back', public.storage_move_plan(pg_temp.g('s3')::uuid, '00000000-0000-4000-8000-0000000000d1',
  '{"kind":"library","asset_ids":["00000000-0000-0000-0000-00000000a001"]}'::jsonb, 'move', 'back', 0)::text;
select pg_temp.c('64 the way back sees the held Drive copies as already there', (public.storage_move_report(pg_temp.g('back')::uuid)->>'already_there'), '2');
select public.storage_move_note('k-move-run-only', pg_temp.g('back')::uuid, null, 'hub@example.com');
select public.storage_move_start(pg_temp.g('back')::uuid);
insert into v select 'claim3', public.storage_move_claim('k-move-run-only', pg_temp.g('back')::uuid, 5)::text;
select pg_temp.c('65 its claim shows the held replica at the destination for each item',
  (select count(*)::text from jsonb_array_elements(pg_temp.g('claim3')::jsonb->'items') e where e->'dest_location'->>'state' = 'ok'), '2');
select public.storage_move_attach('k-move-run-only', (e->>'id')::uuid, (e->'dest_location'->>'id')::uuid) from jsonb_array_elements(pg_temp.g('claim3')::jsonb->'items') e;
select public.storage_move_verified('k-move-run-only', (e->>'id')::uuid, true, 'checksum', null) from jsonb_array_elements(pg_temp.g('claim3')::jsonb->'items') e;
select public.storage_move_switch('k-move-run-only', (e->>'id')::uuid) from jsonb_array_elements(pg_temp.g('claim3')::jsonb->'items') e;
select pg_temp.c('66 both versions are primary at Drive again, without a byte copied',
  pg_temp.q($Q$ select count(*)::text from public.file_locations l join public.integrations i on i.id = l.integration_id
   where i.type = 'google_drive' and l.role = 'primary' and l.ref in ('mv-a1-1', 'mv-a1-2') $Q$), '2');
insert into v values ('loc_a2s3', pg_temp.q($Q$ select id::text from public.file_locations where ref = 'hub/library/a2v1' $Q$));
insert into v values ('loc_a1d', pg_temp.q($Q$ select id::text from public.file_locations where ref = 'mv-a1-1' $Q$));
select pg_temp.t('67 an attach to an item that is no longer pending is refused',
  format($q$ select public.storage_move_attach('k-move-run-only', %L, %L) $q$, pg_temp.g('it_a1v1'), pg_temp.g('loc_a2s3')), 'ERR MOVE_BAD_STATE');
reset role;
update public.storage_moves set hold_until = now() - interval '1 hour' where id = pg_temp.g('p1')::uuid;
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000a1');
insert into v select 'retire', public.storage_retire_claim('k-move-run-only', pg_temp.g('p1')::uuid, 10)::text;
select pg_temp.c('68 once the hold is over, only the held replica of the file still at the second provider is offered',
  (select jsonb_array_length(c->'items')::text || ':' || (c->'items'->0->>'ref') from (select pg_temp.g('retire')::jsonb c) x), '1:mv-a2-1');
select pg_temp.c('69 retiring that one and a primary in the same call retires only the replica',
  public.storage_retire_mark('k-move-run-only', pg_temp.g('p1')::uuid,
    array[(pg_temp.g('retire')::jsonb->'items'->0->>'id')::uuid, pg_temp.g('loc_a1d')::uuid])::text, '1');
select pg_temp.c('70 the primary at Drive is untouched and the retired copy is marked',
  pg_temp.q($Q$ select string_agg(ref || ':' || role || ':' || state, ',' order by ref) from public.file_locations where ref in ('mv-a1-1', 'mv-a2-1') $Q$), 'mv-a1-1:primary:ok,mv-a2-1:replica:retired');
reset role;
set local role anon;
select pg_temp.c('71 serving still finds the file by its legacy reference, at the second provider alone',
  (select count(*)::text || ':' || min(e->>'type') from jsonb_array_elements(public.storage_serving('k-move-run-only', 'mv-a2-1')) e), '1:s3_compatible');
reset role;
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000a1');
select pg_temp.c('72 the retire event counts one copy and names no reference',
  pg_temp.q($Q$ select (data->>'retired') || ':' || (data::text like '%mv-a2%')::text from public.integration_events where kind = 'storage_retired' order by id desc limit 1 $Q$), '1:false');
select pg_temp.t('73 a second retire of the same set finds nothing to do', format($q$ select public.storage_retire_mark('k-move-run-only', %L, array[%L::uuid]) $q$, pg_temp.g('p1'), (pg_temp.g('retire')::jsonb->'items'->0->>'id')), 'ok');

-- Copy mode and cancel -----------------------------------------------------------------------------------
insert into v select 'mail', public.storage_move_plan('00000000-0000-4000-8000-0000000000d1', pg_temp.g('s3')::uuid, '{"kind":"mail"}'::jsonb, 'copy', 'mail copy', 14)::text;
select public.storage_move_note('k-move-run-only', pg_temp.g('mail')::uuid, null, 'x');
select public.storage_move_start(pg_temp.g('mail')::uuid);
insert into v select 'mclaim', public.storage_move_claim('k-move-run-only', pg_temp.g('mail')::uuid, 5)::text;
insert into v select 'mitem', e->>'id' from jsonb_array_elements(pg_temp.g('mclaim')::jsonb->'items') e;
select public.storage_move_copied('k-move-run-only', pg_temp.g('mitem')::uuid, 'hub/mail/m1', 4000, repeat('d', 32), repeat('d', 32));
select public.storage_move_verified('k-move-run-only', pg_temp.g('mitem')::uuid, true, 'checksum', null);
select pg_temp.t('74 copy mode never switches', format($q$ select public.storage_move_switch('k-move-run-only', %L) $q$, pg_temp.g('mitem')), 'ERR MOVE_BAD_STATE');
select pg_temp.c('75 a copy-only move completes with the replica verified and the primary where it was, and no hold',
  pg_temp.q(format($Q$ select m.state || ':' || coalesce(m.hold_until::text, 'none') || ':' || (select string_agg(l.role || ':' || l.state, ',' order by l.role) from public.file_locations l where l.subject_id = '00000000-0000-0000-0000-00000000b001')
   from public.storage_moves m where m.id = %L $Q$, pg_temp.g('mail'))), 'completed:none:primary:ok,replica:ok');

reset role;
update public.file_locations set state = 'ok' where ref = 'mv-a3-1';
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000a1');
insert into v select 'cx', public.storage_move_plan('00000000-0000-4000-8000-0000000000d1', pg_temp.g('s3')::uuid,
  '{"kind":"library","asset_ids":["00000000-0000-0000-0000-00000000a003"]}'::jsonb, 'move', null, 14)::text;
select public.storage_move_note('k-move-run-only', pg_temp.g('cx')::uuid, null, 'x');
select public.storage_move_start(pg_temp.g('cx')::uuid);
insert into v select 'cxclaim', e->>'id' from jsonb_array_elements(public.storage_move_claim('k-move-run-only', pg_temp.g('cx')::uuid, 1)->'items') e;
select public.storage_move_progress('k-move-run-only', pg_temp.g('cxclaim')::uuid, '{"sink":{"uploadId":"u9"},"md5":{},"offset":10}'::jsonb, 10);
select public.storage_move_pause(pg_temp.g('cx')::uuid);
select pg_temp.c('76 a paused move hands out nothing', jsonb_array_length(public.storage_move_claim('k-move-run-only', pg_temp.g('cx')::uuid, 3)->'items')::text, '0');
select public.storage_move_start(pg_temp.g('cx')::uuid);
insert into v select 'cancelled', public.storage_move_cancel(pg_temp.g('cx')::uuid)::text;
select pg_temp.c('77 cancelling hands back the partial upload to abort, and leaves the file where it was',
  (pg_temp.g('cancelled')::jsonb->'sinks'->0->>'uploadId') || ':' || (pg_temp.g('cancelled')::jsonb->'dest'->>'type') || ':' ||
  pg_temp.q(format($Q$ select state from public.storage_moves where id = %L $Q$, pg_temp.g('cx'))) || ':' ||
  pg_temp.q($Q$ select role || ':' || state from public.file_locations where ref = 'mv-a3-1' $Q$), 'u9:s3_compatible:cancelled:primary:ok');
select pg_temp.c('78 and the item is cancelled, its partial state forgotten',
  pg_temp.q(format($Q$ select state || ':' || (progress is null)::text from public.storage_move_items where id = %L $Q$, pg_temp.g('cxclaim'))), 'cancelled:true');
select pg_temp.t('79 a finished move cannot be cancelled', format($q$ select public.storage_move_cancel(%L) $q$, pg_temp.g('cx')), 'ERR MOVE_BAD_STATE');

-- Removing providers and the tables' privacy -----------------------------------------------------------------
select pg_temp.t('80 a provider that holds files cannot be removed', format($q$ select public.storage_provider_remove(%L) $q$, pg_temp.g('s3')), 'ERR PROVIDER_HOLDS_FILES');
select public.int_secret_set(pg_temp.g('s3b')::uuid, 'AKIAOTHERKEY:otherecret99999');
select pg_temp.t('81 an empty one can', format($q$ select public.storage_provider_remove(%L) $q$, pg_temp.g('s3b')), 'ok');
reset role;
select pg_temp.c('82 it is marked deleted, disabled, its secrets are gone from the vault, and the log says so',
  (select (i.deleted_at is not null)::text || ':' || i.state || ':' || (i.secret_id is null and i.pending_secret_id is null)::text || ':' ||
          (select count(*)::text from vault.secrets where name like 'integration:' || i.id || ':%') || ':' ||
          (select count(*)::text from public.integration_events where kind = 'deleted' and integration_id = i.id)
   from public.integrations i where i.id = pg_temp.g('s3b')::uuid), 'true:disabled:true:0:1');
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000a1');
select pg_temp.t('83 the Drive provider cannot be removed through this function', $q$ select public.storage_provider_remove('00000000-0000-4000-8000-0000000000d1') $q$, 'ERR INT_NOT_FOUND');
select pg_temp.t('84 the move tables have no read policy: even the administrator reads nothing directly', $q$ do $d$ declare n int; begin
    select count(*) into n from public.storage_move_items;
    if n > 0 then raise exception 'READ %', n; end if; end $d$ $q$, 'ok');
select pg_temp.t('85 and cannot write them', $q$ do $d$ declare n int; begin
    begin update public.storage_move_items set state = 'switched'; get diagnostics n = row_count;
    if n > 0 then raise exception 'WROTE %', n; end if;
    exception when insufficient_privilege then null; end; end $d$ $q$, 'ok');
reset role;
set local role anon;
select pg_temp.t('86 no function over the tables is callable by a visitor', $q$ select public.storage_move_report('00000000-0000-0000-0000-000000000000') $q$, 'ERR permission denied');
select pg_temp.t('86b nor the claim', $q$ select public.storage_move_claim('k-move-run-only', '00000000-0000-0000-0000-000000000000', 1) $q$, 'ERR permission denied');
reset role;
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000a1');
select pg_temp.c('87 the overview lists the second provider with its counts and rights',
  (select (o->>'can_migrate') || ':' || (o->>'can_secrets') || ':' || jsonb_array_length(o->'providers')::text from (select public.storage_overview() o) x), 'true:true:2');
select pg_temp.c('88 the moves overview lists the plans of this run',
  (select jsonb_array_length(public.storage_moves_overview())::text), '6');

select * from (
  select n, k, v, expect from r where not (v is not distinct from expect or (expect like 'ERR%' and v like expect || '%'))
  union all select 0, 'TOTAL', count(*)::text, (count(*) filter (where v is not distinct from expect or (expect like 'ERR%' and v like expect || '%')))::text || ' passed' from r) z order by n;
rollback;

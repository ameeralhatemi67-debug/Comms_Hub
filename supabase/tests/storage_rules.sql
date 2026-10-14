-- Storage locations, Step S2 (Settings_Integrations_Plan.md 6.1 and 6.2, migration
-- 20261014140000_storage_locations.sql): every stored file has a location, kept true by
-- trigger; who may read where a file lives; who may start a check; and that no signed-in
-- person can write a file's state, only the server with its key. One transaction, rolled
-- back at the end. The site's server key is replaced by a throwaway inside the transaction
-- only (compare md5(key_hash) before and after). Result: qa/storage-rules.json.
begin;
create temp table r(n serial, k text, v text, expect text);
create temp table v(k text primary key, val text);
grant all on r, v to public; grant usage on sequence r_n_seq to public;
insert into public.accounts (email, display_name, role, pages, protected) values
 ('adm@t.test','Adm','admin','{}',true),('dir@t.test','Dir','director','{media}',false),('wri@t.test','Wri','writer','{media}',false);
insert into auth.users (id, email, email_confirmed_at) values
 ('00000000-0000-0000-0000-0000000000a1','adm@t.test',now()),('00000000-0000-0000-0000-0000000000d1','dir@t.test',now()),
 ('00000000-0000-0000-0000-0000000000c1','wri@t.test',now());
insert into public.mail_server_key (id, key_hash) values (1, encode(sha256(convert_to('k-storage-run-only', 'UTF8')), 'hex'))
  on conflict (id) do update set key_hash = excluded.key_hash;
create function pg_temp.who(id text) returns void language sql as $$ select set_config('request.jwt.claims', json_build_object('sub',id,'role','authenticated')::text, true) $$;
create function pg_temp.t(k text, sqltext text, e text) returns void language plpgsql as $$
begin
  begin execute sqltext; insert into r(k,v,expect) values (k,'ok',e);
  exception when others then insert into r(k,v,expect) values (k,'ERR '||sqlerrm,e); end;
end $$;
create function pg_temp.c(k text, val text, e text) returns void language sql as $$ insert into r(k,v,expect) values (k,val,e) $$;
create function pg_temp.g(k text) returns text language sql as $$ select val from v where k = $1 $$;
grant execute on function pg_temp.who(text), pg_temp.t(text,text,text), pg_temp.c(text,text,text), pg_temp.g(text) to public;

-- The state before the test files ----------------------------------------------------------------
select pg_temp.c('01 every version and attachment already stored has a location',
  ((select count(*) from public.media_versions v where not exists (select 1 from public.file_locations l where l.subject_kind = 'media_version' and l.subject_id = v.id))
 + (select count(*) from public.mail_files f where not exists (select 1 from public.file_locations l where l.subject_kind = 'mail_file' and l.subject_id = f.id)))::text, '0');
select pg_temp.c('02 each role points at Google Drive except backup, which is empty',
  (select string_agg(role || ':' || coalesce(integration_id::text, '-'), ',' order by role) from public.storage_roles),
  'backup:-,chat:00000000-0000-4000-8000-0000000000d1,library:00000000-0000-4000-8000-0000000000d1,mail:00000000-0000-4000-8000-0000000000d1');

-- Two test assets: one in the open root folder, one in a restricted folder. Created as the
-- administrator, because the database refuses an insert with no acting person.
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000a1');
insert into public.media_folders (id, parent_id, name, restricted, created_by)
values ('00000000-0000-0000-0000-00000000f001', '00000000-0000-0000-0000-0000000000a1', 'Closed', true, 'adm@t.test');
insert into public.media_files (id, drive_file_id, name, mime_type, size_bytes, kind, uploaded_by, folder_id) values
 ('00000000-0000-0000-0000-00000000a001', 'drv-open-0001', 'open.png', 'image/png', 1000, 'image', 'adm@t.test', '00000000-0000-0000-0000-0000000000a1'),
 ('00000000-0000-0000-0000-00000000a002', 'drv-closed-0002', 'closed.png', 'image/png', 2000, 'image', 'adm@t.test', '00000000-0000-0000-0000-00000000f001');
reset role;
insert into public.mail_files (id, drive_file_id, name, mime_type, size_bytes, uploaded_by)
values ('00000000-0000-0000-0000-00000000b001', 'drv-mail-0003', 'att.pdf', 'application/pdf', 3000, 'adm@t.test');

select pg_temp.c('03 a new asset makes one primary location at the provider, ok, with its size',
  (select count(*)::text || ':' || min(l.state) || ':' || min(l.role) || ':' || min(l.size_bytes)::text || ':' || min(l.ref)
   from public.file_locations l join public.media_versions v on v.id = l.subject_id and l.subject_kind = 'media_version'
   where v.asset_id = '00000000-0000-0000-0000-00000000a001'), '1:ok:primary:1000:drv-open-0001');
select pg_temp.c('04 a new attachment makes one too',
  (select count(*)::text || ':' || min(l.ref) from public.file_locations l where l.subject_kind = 'mail_file' and l.subject_id = '00000000-0000-0000-0000-00000000b001'), '1:drv-mail-0003');
insert into public.media_versions (asset_id, version, drive_file_id, size_bytes, mime_type, uploaded_by)
values ('00000000-0000-0000-0000-00000000a001', 2, 'drv-open-0001-v2', 1500, 'image/png', 'adm@t.test');
select pg_temp.c('05 a new version of the asset adds its own location',
  (select count(*)::text from public.file_locations l join public.media_versions v on v.id = l.subject_id and l.subject_kind = 'media_version'
   where v.asset_id = '00000000-0000-0000-0000-00000000a001'), '2');

-- Who may read ----------------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000c1');
select pg_temp.c('06 a writer reads no location rows directly (no policy)', (select count(*)::text from public.file_locations), '0');
select pg_temp.t('07 nor the storage overview', $q$ select public.storage_overview() $q$, 'ERR FORBIDDEN');
select pg_temp.t('08 nor start a check', $q$ select public.storage_verify_batch(5) $q$, 'ERR FORBIDDEN');
select pg_temp.t('09 a writer with no access to the library cannot read the state of an asset', $q$ select public.storage_asset_state('00000000-0000-0000-0000-00000000a001') $q$, 'ERR FORBIDDEN');
select pg_temp.t('12 nor change a location', $q$ do $d$ declare n int; begin
    begin update public.file_locations set state = 'failed'; get diagnostics n = row_count;
    if n > 0 then raise exception 'WROTE %', n; end if;
    exception when insufficient_privilege then null; end; end $d$ $q$, 'ok');
select pg_temp.t('13 nor mark a check with a guessed key', $q$ select public.storage_verify_mark('guess', 'wri@t.test', '[]'::jsonb) $q$, 'ERR FORBIDDEN');

select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
select pg_temp.t('14 the director has no storage right by default', $q$ select public.storage_overview() $q$, 'ERR FORBIDDEN');
select pg_temp.c('14b but sees the state of an asset in the open library, with provider and version only',
  (select jsonb_array_length(public.storage_asset_state('00000000-0000-0000-0000-00000000a001')))::text, '2');
select pg_temp.c('14c and no provider reference appears in it',
  (public.storage_asset_state('00000000-0000-0000-0000-00000000a001')::text like '%drv-open%')::text, 'false');
select pg_temp.t('14d not of an asset in a restricted folder they have no grant on', $q$ select public.storage_asset_state('00000000-0000-0000-0000-00000000a002') $q$, 'ERR FORBIDDEN');

select pg_temp.who('00000000-0000-0000-0000-0000000000a1');
select pg_temp.c('15 the administrator sees one Drive provider, none unrecorded, and may manage',
  (select (o->'providers'->0->>'label') || ':' || (o->>'unrecorded') || ':' || (o->>'can_manage') || ':' || jsonb_array_length(o->'providers')::text
   from (select public.storage_overview() o) x), 'Google Drive:0:true:1');
select pg_temp.c('16 the provider counts the test files (library 3 more than the real ones, mail 1)',
  (select ((o->'providers'->0->>'library_files')::int - (select count(*) from public.media_versions where asset_id not in ('00000000-0000-0000-0000-00000000a001','00000000-0000-0000-0000-00000000a002')))::text || ':' ||
          (o->'providers'->0->>'mail_files')::text
   from (select public.storage_overview() o) x), '3:1');
select pg_temp.c('17 the closed asset is readable to the administrator',
  (select jsonb_array_length(public.storage_asset_state('00000000-0000-0000-0000-00000000a002')))::text, '1');

-- Checking ----------------------------------------------------------------------------------------------
select pg_temp.c('18 the batch is capped at 50',
  (jsonb_array_length(public.storage_verify_batch(500)) <= 50)::text, 'true');
select pg_temp.c('19 the test files are among the files never checked',
  (select (count(*) filter (where e->>'ref' like 'drv-%-000_'))::text from jsonb_array_elements(public.storage_verify_batch(50)) e), '3');
reset role;
insert into v values ('open', (select l.id::text from public.file_locations l where l.ref = 'drv-open-0001'));
insert into v values ('closed', (select l.id::text from public.file_locations l where l.ref = 'drv-closed-0002'));
insert into v values ('mail', (select l.id::text from public.file_locations l where l.ref = 'drv-mail-0003'));

set local role anon;
select pg_temp.c('20 the server marks three results with its key; one has a state that is not allowed',
  public.storage_verify_mark('k-storage-run-only', 'adm@t.test',
    jsonb_build_array(jsonb_build_object('id', pg_temp.g('open'), 'state', 'ok'),
                      jsonb_build_object('id', pg_temp.g('closed'), 'state', 'missing'),
                      jsonb_build_object('id', pg_temp.g('mail'), 'state', 'retired')))::text, '2');
reset role;
select pg_temp.c('21 that state is ignored: the mail file stays ok and unchecked',
  (select state || ':' || (verified_at is null)::text from public.file_locations where id = pg_temp.g('mail')::uuid), 'ok:true');
select pg_temp.c('22 the marked ones carry their state and a check time',
  (select string_agg(ref || ':' || state || ':' || (verified_at is not null)::text, ',' order by ref) from public.file_locations where ref in ('drv-open-0001','drv-closed-0002')),
  'drv-closed-0002:missing:true,drv-open-0001:ok:true');
select pg_temp.c('23 one event, with counts and the person who started it, no reference',
  (select count(*)::text || ':' || min(data->>'checked') || ':' || min(data->>'ok') || ':' || min(data->>'missing') || ':' || min(actor) || ':' || (bool_or(data::text like '%drv-%'))::text
   from public.integration_events where kind = 'storage_verified'), '1:2:1:1:adm@t.test:false');
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000a1');
select pg_temp.c('24 the overview now counts one missing file for the provider',
  (select (o->'providers'->0->>'missing') from (select public.storage_overview() o) x), '1');
select pg_temp.c('25 and the next batch no longer starts with the files just checked',
  (select (public.storage_verify_batch(1) -> 0 ->> 'ref' not in ('drv-open-0001','drv-closed-0002'))::text), 'true');
select pg_temp.t('26 a result list over a hundred is refused', $q$ select public.storage_verify_mark('k-storage-run-only', 'x', (select jsonb_agg('{}'::jsonb) from generate_series(1, 101))) $q$, 'ERR');

-- Staying true --------------------------------------------------------------------------------------------
delete from public.media_files where id = '00000000-0000-0000-0000-00000000a001';
reset role;
select pg_temp.c('27 removing an asset removes its locations',
  (select count(*)::text from public.file_locations where ref in ('drv-open-0001','drv-open-0001-v2')), '0');
select pg_temp.c('28 and nothing is left without a version or attachment behind it',
  (select count(*)::text from public.file_locations l
   where (l.subject_kind = 'media_version' and not exists (select 1 from public.media_versions v where v.id = l.subject_id))
      or (l.subject_kind = 'mail_file' and not exists (select 1 from public.mail_files f where f.id = l.subject_id))), '0');
select pg_temp.c('29 library locations equal library versions',
  ((select count(*) from public.file_locations where subject_kind = 'media_version') - (select count(*) from public.media_versions))::text, '0');
select pg_temp.t('30 two primaries for one version cannot exist', $q$ insert into public.file_locations (integration_id, subject_kind, subject_id, ref)
   select integration_id, subject_kind, subject_id, 'drv-dup' from public.file_locations where ref = 'drv-closed-0002' $q$, 'ERR duplicate key');

select * from (
  select n, k, v, expect from r where not (v = expect or (expect like 'ERR%' and v like expect || '%'))
  union all select 0, 'TOTAL', count(*)::text, (count(*) filter (where v = expect or (expect like 'ERR%' and v like expect || '%')))::text || ' passed' from r) z order by n;
rollback;

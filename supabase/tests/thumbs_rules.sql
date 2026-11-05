-- MVP_draft.md section 77 (migration 20261105140000_file_thumbs.sql): thumbnails of stored files. Who sees one (exactly who may see
-- its file), who may save one from the browser (who uploaded that version or file), that only the site's server keeps Drive's
-- own picture or `none` and never over a picture already there, that a picture is what its type says and at most 48 KB, that a
-- page never writes the table, and that a thumbnail goes with its file. Only throwaway accounts (@t.test) are touched; the server
-- key is replaced by a throwaway inside the transaction. One transaction, rolled back at the end. Result: qa/thumbs-rules.json.
begin;
create temp table r(n serial, k text, v text, expect text);
create temp table v(k text primary key, val text);
grant all on r, v to public; grant usage on sequence r_n_seq to public;
insert into public.accounts (email, display_name, role, pages, protected) values
 ('dir@t.test','Dir','director','{}',false),('wri@t.test','Wri','writer','{}',false),('pub2@t.test','Pub2','publisher','{}',false);
insert into auth.users (id, email, email_confirmed_at) values
 ('00000000-0000-0000-0000-0000000000a2','dir@t.test',now()),('00000000-0000-0000-0000-0000000000a6','wri@t.test',now()),
 ('00000000-0000-0000-0000-0000000000a5','pub2@t.test',now());
insert into public.mail_server_key (id, key_hash) values (1, encode(sha256(convert_to('k-thumb-run-only', 'UTF8')), 'hex'))
  on conflict (id) do update set key_hash = excluded.key_hash;
create function pg_temp.who(id text) returns void language sql as $$ select set_config('request.jwt.claims', json_build_object('sub',id,'role','authenticated')::text, true) $$;
-- A restricted folder that the writer and the director may see, and the other publisher may not.
with f as (insert into public.media_folders (name, created_by, restricted) values ('مجلد المصغرات', 'dir@t.test', true) returning id)
insert into v select 'folder', id::text from f;
insert into public.media_grants (folder_id, subject_type, subject, level) values
 ((select val::uuid from v where k = 'folder'), 'person', 'wri@t.test', 2),
 ((select val::uuid from v where k = 'folder'), 'person', 'dir@t.test', 1);
-- The library's guard names the uploader from the session: the writer uploads the file (version 1) and version 3, the director version 2.
select pg_temp.who('00000000-0000-0000-0000-0000000000a6');
with m as (insert into public.media_files (drive_file_id, name, mime_type, size_bytes, kind, uploaded_by, folder_id)
           select 'drive-thumb-TESTMARK-0001', 'صورة.png', 'image/png', 50000, 'image', 'wri@t.test', (select val::uuid from v where k = 'folder') returning id)
insert into v select 'img', id::text from m;
insert into public.media_versions (asset_id, version, drive_file_id, size_bytes, mime_type, uploaded_by) values
 ((select val::uuid from v where k = 'img'), 2, 'drive-thumb-TESTMARK-0002', 50000, 'image/png', 'dir@t.test'),
 ((select val::uuid from v where k = 'img'), 3, 'drive-thumb-TESTMARK-0003', 50000, 'image/png', 'wri@t.test');
with m as (insert into public.mail_files (drive_file_id, name, mime_type, size_bytes, uploaded_by)
           values ('drive-mail-TESTMARK-0001', 'مرفق.jpg', 'image/jpeg', 40000, 'wri@t.test') returning id)
insert into v select 'mf', id::text from m;
create function pg_temp.t(k text, sqltext text, e text) returns void language plpgsql as $$
begin
  begin execute sqltext; insert into r(k,v,expect) values (k,'ok',e);
  exception when others then insert into r(k,v,expect) values (k,'ERR '||sqlerrm,e); end;
end $$;
create function pg_temp.c(k text, val text, e text) returns void language sql as $$ insert into r(k,v,expect) values (k,val,e) $$;
create function pg_temp.g(k text) returns text language sql as $$ select val from v where k = $1 $$;
-- Pictures as a page sends them, in base64: `n` bytes after the format's own first bytes.
create function pg_temp.webp(n int default 200) returns text language sql as $$
  select replace(encode('\x5249464600000000574542505650384c'::bytea || decode(repeat('00', n), 'hex'), 'base64'), E'\n', '') $$;
create function pg_temp.jpeg(n int default 200) returns text language sql as $$
  select replace(encode('\xffd8ffe0'::bytea || decode(repeat('00', n), 'hex'), 'base64'), E'\n', '') $$;
grant execute on function pg_temp.who(text), pg_temp.t(text,text,text), pg_temp.c(text,text,text), pg_temp.g(text), pg_temp.webp(int), pg_temp.jpeg(int) to public;
set local role authenticated;

-- 1. The uploader's browser saves the picture it drew ----------------------------------------------------------------------
select pg_temp.who('00000000-0000-0000-0000-0000000000a6');
select pg_temp.t('01 the writer saves the picture of the version they uploaded', $q$ select public.thumb_save(pg_temp.g('img')::uuid, 1, null, pg_temp.webp(), 'image/webp') $q$, 'ok');
select pg_temp.c('02 and reads it: ready, from the browser', (select state || ' ' || source || ' ' || mime || ' ' || octet_length(data)::text from public.file_thumbs where asset_id = pg_temp.g('img')::uuid and version = 1), 'ready browser image/webp 216');
select pg_temp.t('03 not for a version someone else uploaded', $q$ select public.thumb_save(pg_temp.g('img')::uuid, 2, null, pg_temp.webp(), 'image/webp') $q$, 'ERR FORBIDDEN');
select pg_temp.t('04 bytes that are not what the type says', $q$ select public.thumb_save(pg_temp.g('img')::uuid, 1, null, pg_temp.jpeg(), 'image/webp') $q$, 'ERR THUMB_INVALID');
select pg_temp.t('05 text that is not base64', $q$ select public.thumb_save(pg_temp.g('img')::uuid, 1, null, '###', 'image/webp') $q$, 'ERR THUMB_INVALID');
select pg_temp.t('06 over 48 KB', $q$ select public.thumb_save(pg_temp.g('img')::uuid, 1, null, pg_temp.webp(49140), 'image/webp') $q$, 'ERR THUMB_INVALID');
select pg_temp.t('07 too small to be a picture', $q$ select public.thumb_save(pg_temp.g('img')::uuid, 1, null, pg_temp.webp(10), 'image/webp') $q$, 'ERR THUMB_INVALID');
select pg_temp.t('08 a type that is not WebP, JPEG or PNG', $q$ select public.thumb_save(pg_temp.g('img')::uuid, 1, null, pg_temp.webp(), 'image/gif') $q$, 'ERR THUMB_INVALID');
select pg_temp.t('09 a library file and a mail file at once', $q$ select public.thumb_save(pg_temp.g('img')::uuid, 1, pg_temp.g('mf')::uuid, pg_temp.webp(), 'image/webp') $q$, 'ERR THUMB_INVALID');
select pg_temp.t('10 the writer replaces their own', $q$ select public.thumb_save(pg_temp.g('img')::uuid, 1, null, pg_temp.jpeg(300), 'image/jpeg') $q$, 'ok');
select pg_temp.c('11 one row, the new picture', (select count(*)::text || ' ' || max(mime) from public.file_thumbs where asset_id = pg_temp.g('img')::uuid and version = 1), '1 image/jpeg');

-- 2. Who sees it ----------------------------------------------------------------------------------------------------------
select pg_temp.who('00000000-0000-0000-0000-0000000000a5');
select pg_temp.c('12 a person who may not see the folder sees no thumbnail', (select count(*)::text from public.file_thumbs), '0');
select pg_temp.t('13 nor saves one', $q$ select public.thumb_save(pg_temp.g('img')::uuid, 1, null, pg_temp.webp(), 'image/webp') $q$, 'ERR FORBIDDEN');
select pg_temp.who('00000000-0000-0000-0000-0000000000a2');
select pg_temp.c('14 the director, who may see the folder, sees it', (select count(*)::text from public.file_thumbs where asset_id = pg_temp.g('img')::uuid), '1');
select pg_temp.t('15 a page never writes the table', $q$ insert into public.file_thumbs (asset_id, version, state, data, mime, source, made_by) values (pg_temp.g('img')::uuid, 2, 'ready', decode(pg_temp.webp(), 'base64'), 'image/webp', 'browser', 'dir@t.test') $q$, 'ERR permission denied for table file_thumbs');
select pg_temp.t('16 nor changes it', $q$ update public.file_thumbs set mime = 'image/png' $q$, 'ERR permission denied for table file_thumbs');

-- 3. The server: Drive's picture or none, for a person who may see the file ------------------------------------------------
select pg_temp.t('17 no key, nothing kept', $q$ select public.thumb_keep('wrong', pg_temp.g('img')::uuid, 2, null, null, null) $q$, 'ERR FORBIDDEN');
select pg_temp.c('18 no picture from Drive is kept as none', (select public.thumb_keep('k-thumb-run-only', pg_temp.g('img')::uuid, 2, null, null, null)), 'none');
select pg_temp.c('19 recorded as none, by the server', (select state || ' ' || source || ' ' || coalesce(mime, 'no-type') from public.file_thumbs where asset_id = pg_temp.g('img')::uuid and version = 2), 'none drive no-type');
select pg_temp.c('20 a picture already there is never replaced by the server', (select public.thumb_keep('k-thumb-run-only', pg_temp.g('img')::uuid, 1, null, pg_temp.webp(), 'image/webp')), 'already');
select pg_temp.c('21 the writer''s picture stays', (select mime from public.file_thumbs where asset_id = pg_temp.g('img')::uuid and version = 1), 'image/jpeg');
select pg_temp.t('22 a version that does not exist', $q$ select public.thumb_keep('k-thumb-run-only', pg_temp.g('img')::uuid, 9, null, null, null) $q$, 'ERR THUMB_INVALID');
select pg_temp.t('23 the server''s bytes are checked too', $q$ select public.thumb_keep('k-thumb-run-only', pg_temp.g('img')::uuid, 3, null, pg_temp.jpeg(), 'image/png') $q$, 'ERR THUMB_INVALID');
select pg_temp.c('24 Drive''s picture of version 3 is kept for the director', (select public.thumb_keep('k-thumb-run-only', pg_temp.g('img')::uuid, 3, null, pg_temp.jpeg(), 'image/jpeg')), 'kept');
select pg_temp.c('25 as the server''s, made for the director', (select state || ' ' || source from public.file_thumbs where asset_id = pg_temp.g('img')::uuid and version = 3), 'ready drive');
select pg_temp.t('26 the director saves the picture of the version they uploaded over the server''s none', $q$ select public.thumb_save(pg_temp.g('img')::uuid, 2, null, pg_temp.webp(), 'image/webp') $q$, 'ok');
select pg_temp.c('27 ready, from the browser', (select state || ' ' || source from public.file_thumbs where asset_id = pg_temp.g('img')::uuid and version = 2), 'ready browser');
select pg_temp.who('00000000-0000-0000-0000-0000000000a5');
select pg_temp.t('28 the server keeps nothing for a person who may not see the file', $q$ select public.thumb_keep('k-thumb-run-only', pg_temp.g('img')::uuid, 1, null, null, null) $q$, 'ERR FORBIDDEN');
select pg_temp.who('00000000-0000-0000-0000-0000000000a6');
select pg_temp.t('29 the uploader replaces the server''s picture with their own', $q$ select public.thumb_save(pg_temp.g('img')::uuid, 3, null, pg_temp.webp(), 'image/webp') $q$, 'ok');
select pg_temp.c('30 now theirs', (select source || ' ' || mime from public.file_thumbs where asset_id = pg_temp.g('img')::uuid and version = 3), 'browser image/webp');

-- 4. A file sent in mail or messaging -------------------------------------------------------------------------------------
select pg_temp.t('31 the writer saves the picture of their mail file', $q$ select public.thumb_save(null, null, pg_temp.g('mf')::uuid, pg_temp.jpeg(), 'image/jpeg') $q$, 'ok');
select pg_temp.c('32 and sees it', (select count(*)::text from public.file_thumbs where mail_file_id = pg_temp.g('mf')::uuid), '1');
select pg_temp.who('00000000-0000-0000-0000-0000000000a2');
select pg_temp.c('33 the director does not see a file on no mail they can see, as with the file itself', (select count(*)::text from public.file_thumbs where mail_file_id = pg_temp.g('mf')::uuid), '0');
select pg_temp.t('34 nor saves one', $q$ select public.thumb_save(null, null, pg_temp.g('mf')::uuid, pg_temp.jpeg(), 'image/jpeg') $q$, 'ERR FORBIDDEN');
select pg_temp.t('35 nor has the server keep one', $q$ select public.thumb_keep('k-thumb-run-only', null, null, pg_temp.g('mf')::uuid, null, null) $q$, 'ERR FORBIDDEN');

-- 5. Privileges, and a thumbnail goes with its file -----------------------------------------------------------------------
reset role;
select pg_temp.c('36 nobody signed out may save or keep', (has_function_privilege('anon', 'public.thumb_save(uuid, int, uuid, text, text)', 'execute')
  or has_function_privilege('anon', 'public.thumb_keep(text, uuid, int, uuid, text, text)', 'execute'))::text, 'false');
select pg_temp.c('37 the table is not in a backup''s list', (select count(*)::text from pg_proc where proname like 'backup%' and prosrc like '%file_thumbs%'), '0');
delete from public.media_files where id = pg_temp.g('img')::uuid;
select pg_temp.c('38 removing the file removes its thumbnails', (select count(*)::text from public.file_thumbs where asset_id = pg_temp.g('img')::uuid), '0');
delete from public.mail_files where id = pg_temp.g('mf')::uuid;
select pg_temp.c('39 and so for a mail file', (select count(*)::text from public.file_thumbs where mail_file_id = pg_temp.g('mf')::uuid), '0');

select n, k, v, expect from r where v is distinct from expect
union all select 0, 'TOTAL', count(*)::text, (count(*) filter (where v is not distinct from expect))::text || ' passed' from r
order by n;
rollback;

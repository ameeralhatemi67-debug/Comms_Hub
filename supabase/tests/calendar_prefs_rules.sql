-- «ألوان التقويم» rules (MVP_draft.md 74), checked inside one transaction that is rolled back at the end.
-- Throwaway accounts (@t.test) act through row level security; nothing about a real person is read into the result.
-- Covered: a person reads only their own row, administrators included; the only write is calendar_prefs_save, which
-- writes the caller's row and nobody else's; a mode is one of five; a colour is a whole number from 0 to 11; a key
-- is a value of one mode; at most 200 pairs; the table's own check refuses what the function would; nobody signed
-- out may read or save; and the row goes with the account.
-- The last query lists only the checks that differ from the rule, and the total.
-- Result: qa/calendar-prefs-rules.json.
begin;
create temp table r(n serial, k text, v text, expect text);
grant all on r to public; grant usage on sequence r_n_seq to public;
insert into public.accounts (email, display_name, role, pages, protected) values
 ('adm@t.test','Adm','admin','{}',true),('dir@t.test','Dir','director','{}',false),
 ('wri@t.test','Wri','writer','{}',false),('gone@t.test','Gone','member','{}',false);
insert into auth.users (id, email, email_confirmed_at) values
 ('00000000-0000-0000-0000-0000000000a1','adm@t.test',now()),('00000000-0000-0000-0000-0000000000d1','dir@t.test',now()),
 ('00000000-0000-0000-0000-0000000000c1','wri@t.test',now()),('00000000-0000-0000-0000-0000000000f1','gone@t.test',now());
-- A sign-in whose address has no account. Only an approved address may sign up, so it signs up under a passing
-- account, its address changes, and the passing account goes.
insert into public.accounts (email, display_name, role, pages, protected) values ('pass@t.test','Pass','member','{}',false);
insert into auth.users (id, email, email_confirmed_at) values ('00000000-0000-0000-0000-0000000000b1','pass@t.test',now());
update auth.users set email = 'stranger@t.test' where id = '00000000-0000-0000-0000-0000000000b1';
delete from public.accounts where email = 'pass@t.test';
create function pg_temp.who(id text) returns void language sql as $$ select set_config('request.jwt.claims', json_build_object('sub',id,'role','authenticated')::text, true) $$;
create function pg_temp.t(k text, sqltext text, e text) returns void language plpgsql as $$
begin
  begin execute sqltext; insert into r(k,v,expect) values (k,'ok',e);
  exception when others then insert into r(k,v,expect) values (k,'ERR '||sqlerrm,e); end;
end $$;
create function pg_temp.c(k text, got text, e text) returns void language sql as $$ insert into r(k,v,expect) values (k,got,e) $$;
-- 200 and 201 valid pairs: people's addresses, each a colour.
create function pg_temp.many(n int) returns jsonb language sql as $$
  select jsonb_object_agg('person:p' || i || '@t.test', i % 12) from generate_series(1, n) i $$;

set local role authenticated;

-- One's own row.
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
select pg_temp.c('01 nothing is kept before the first choice', (select count(*)::text from public.calendar_prefs), '0');
select pg_temp.t('02 the director saves a choice', $$select public.calendar_prefs_save('status', '{"status:IN_REVIEW":4,"kind:pub":7,"project:0b6f7c1e-1d2a-4c3b-9e8f-1234567890ab":2,"person:wri@t.test":11}')$$, 'ok');
select pg_temp.c('03 and reads it back', (select mode || '|' || (colors->>'status:IN_REVIEW') || '|' || (colors->>'kind:pub') || '|' || (colors->>'person:wri@t.test') from public.calendar_prefs), 'status|4|7|11');
select pg_temp.c('04 the answer is the choice as kept', (select (public.calendar_prefs_save('project', '{"kind:due":3}'))::text), '{"mode": "project", "colors": {"kind:due": 3}}');
select pg_temp.c('05 saving again replaces the whole choice', (select mode || '|' || colors::text from public.calendar_prefs), 'project|{"kind:due": 3}');
select pg_temp.t('06 an empty choice is today''s calendar', $$select public.calendar_prefs_save('kind', null)$$, 'ok');
select pg_temp.c('07 and is kept as nothing chosen', (select mode || '|' || colors::text from public.calendar_prefs), 'kind|{}');
select pg_temp.t('08 back to a choice', $$select public.calendar_prefs_save('person', '{"person:dir@t.test":5}')$$, 'ok');

-- Nobody else's row.
select pg_temp.who('00000000-0000-0000-0000-0000000000c1');
select pg_temp.c('09 a writer sees no other row', (select count(*)::text from public.calendar_prefs), '0');
select pg_temp.c('10 not even by naming it', (select count(*)::text from public.calendar_prefs where email = 'dir@t.test'), '0');
select pg_temp.t('11 the writer saves their own', $$select public.calendar_prefs_save('platform', '{}')$$, 'ok');
select pg_temp.c('12 and sees that one only', (select string_agg(email || ':' || mode, ',') from public.calendar_prefs), 'wri@t.test:platform');
select pg_temp.who('00000000-0000-0000-0000-0000000000a1');
select pg_temp.c('13 an administrator reads nobody''s colours', (select count(*)::text from public.calendar_prefs), '0');
select pg_temp.t('14 and saving writes the administrator''s own row', $$select public.calendar_prefs_save('kind', '{"kind:rem":9}')$$, 'ok');
select pg_temp.c('15 which is the one row the administrator sees', (select string_agg(email, ',') from public.calendar_prefs), 'adm@t.test');
select pg_temp.c('16 the save function names no person to write for', (select pg_get_function_identity_arguments('public.calendar_prefs_save(text,jsonb)'::regprocedure)), 'p_mode text, p_colors jsonb');

-- The table itself is not writable.
select pg_temp.t('17 no insert into the table', $$insert into public.calendar_prefs (email, mode) values ('wri@t.test', 'kind')$$, 'ERR permission denied for table calendar_prefs');
select pg_temp.t('18 no update', $$update public.calendar_prefs set mode = 'status'$$, 'ERR permission denied for table calendar_prefs');
select pg_temp.t('19 no delete', $$delete from public.calendar_prefs$$, 'ERR permission denied for table calendar_prefs');
select pg_temp.t('20 the check is not callable from a page', $$select public.calendar_colors_ok('{}')$$, 'ERR permission denied for function calendar_colors_ok');

-- What a choice may hold.
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
select pg_temp.t('21 a sixth mode is refused', $$select public.calendar_prefs_save('rainbow', '{}')$$, 'ERR CAL_PREFS_INVALID');
select pg_temp.t('22 and no mode at all', $$select public.calendar_prefs_save(null, '{}')$$, 'ERR CAL_PREFS_INVALID');
select pg_temp.t('23 a list is not a choice', $$select public.calendar_prefs_save('kind', '[1,2]')$$, 'ERR CAL_PREFS_INVALID');
select pg_temp.t('24 colour 12 does not exist', $$select public.calendar_prefs_save('kind', '{"kind:pub":12}')$$, 'ERR CAL_PREFS_INVALID');
select pg_temp.t('25 nor colour -1', $$select public.calendar_prefs_save('kind', '{"kind:pub":-1}')$$, 'ERR CAL_PREFS_INVALID');
select pg_temp.t('26 nor half a colour', $$select public.calendar_prefs_save('kind', '{"kind:pub":1.5}')$$, 'ERR CAL_PREFS_INVALID');
select pg_temp.t('27 a colour is a number, not text', $$select public.calendar_prefs_save('kind', '{"kind:pub":"3"}')$$, 'ERR CAL_PREFS_INVALID');
select pg_temp.t('28 nor a free colour', $$select public.calendar_prefs_save('kind', '{"kind:pub":"#ff0000"}')$$, 'ERR CAL_PREFS_INVALID');
select pg_temp.t('29 a kind that does not exist', $$select public.calendar_prefs_save('kind', '{"kind:party":1}')$$, 'ERR CAL_PREFS_INVALID');
select pg_temp.t('30 a status by its words is not a key', $$select public.calendar_prefs_save('status', '{"status:مسودة":1}')$$, 'ERR CAL_PREFS_INVALID');
select pg_temp.t('31 a project is named by its id', $$select public.calendar_prefs_save('project', '{"project:حملة":1}')$$, 'ERR CAL_PREFS_INVALID');
select pg_temp.t('32 an account too', $$select public.calendar_prefs_save('platform', '{"platform:instagram":1}')$$, 'ERR CAL_PREFS_INVALID');
select pg_temp.t('33 a person by an address', $$select public.calendar_prefs_save('person', '{"person:dir":1}')$$, 'ERR CAL_PREFS_INVALID');
select pg_temp.t('34 with no space in it', $$select public.calendar_prefs_save('person', '{"person:d ir@t.test":1}')$$, 'ERR CAL_PREFS_INVALID');
select pg_temp.t('35 a key of no mode', $$select public.calendar_prefs_save('kind', '{"colour":1}')$$, 'ERR CAL_PREFS_INVALID');
select pg_temp.t('36 one bad pair refuses the whole choice', $$select public.calendar_prefs_save('kind', '{"kind:pub":1,"kind:due":99}')$$, 'ERR CAL_PREFS_INVALID');
select pg_temp.c('37 and the last good choice stays', (select mode || '|' || colors::text from public.calendar_prefs), 'person|{"person:dir@t.test": 5}');
select pg_temp.t('38 200 pairs are kept', $$select public.calendar_prefs_save('person', pg_temp.many(200))$$, 'ok');
select pg_temp.c('39 all of them', (select count(*)::text from public.calendar_prefs p, jsonb_object_keys(p.colors)), '200');
select pg_temp.t('40 201 are too many', $$select public.calendar_prefs_save('person', pg_temp.many(201))$$, 'ERR CAL_PREFS_TOO_MANY');
select pg_temp.t('41 every mode and colour at its edges', $$select public.calendar_prefs_save('platform', '{"kind:evt":0,"status:FAILED":11,"platform:0b6f7c1e-1d2a-4c3b-9e8f-1234567890ab":6,"person:a.b+c@x-y.t.test":10}')$$, 'ok');

-- Someone signed in with no account, and nobody signed out.
select pg_temp.who('00000000-0000-0000-0000-0000000000b1');
select pg_temp.t('42 a sign-in with no account saves nothing', $$select public.calendar_prefs_save('kind', '{}')$$, 'ERR FORBIDDEN');
reset role;
select pg_temp.c('43 nobody signed out may save', has_function_privilege('anon', 'public.calendar_prefs_save(text,jsonb)', 'execute')::text, 'false');
select pg_temp.c('44 or read a choice', has_table_privilege('anon', 'public.calendar_prefs', 'select')::text, 'false');
select pg_temp.c('45 row level security is on', (select relrowsecurity::text from pg_class where oid = 'public.calendar_prefs'::regclass), 'true');
select pg_temp.c('46 and the one policy reads one''s own row', (select string_agg(polname || ':' || polcmd::text, ',') from pg_policy where polrelid = 'public.calendar_prefs'::regclass), 'calendar_prefs_read:r');

-- The table's own check, even for the owner of the database.
select pg_temp.t('47 the table refuses a colour out of range', $$insert into public.calendar_prefs (email, colors) values ('gone@t.test', '{"kind:pub":12}')$$, 'ERR new row for relation "calendar_prefs" violates check constraint "calendar_prefs_colors_check"');
select pg_temp.t('48 and a sixth mode', $$insert into public.calendar_prefs (email, mode) values ('gone@t.test', 'rainbow')$$, 'ERR new row for relation "calendar_prefs" violates check constraint "calendar_prefs_mode_check"');
select pg_temp.t('49 and a person who has no account', $$insert into public.calendar_prefs (email) values ('nobody@t.test')$$, 'ERR insert or update on table "calendar_prefs" violates foreign key constraint "calendar_prefs_email_fkey"');

-- The row goes with the account.
insert into public.calendar_prefs (email, mode, colors) values ('gone@t.test', 'status', '{"status:DRAFT":1}');
delete from public.accounts where email = 'gone@t.test';
select pg_temp.c('50 removing an account removes its colours', (select count(*)::text from public.calendar_prefs where email = 'gone@t.test'), '0');
select pg_temp.c('51 and nobody else''s', (select string_agg(email, ',' order by email) from public.calendar_prefs), 'adm@t.test,dir@t.test,wri@t.test');

-- The TOTAL row also carries the md5 of the text this run executed (without the lines a client
-- may append after it), so a recorded result can be matched to the file.
select * from (
  select n, k, v, expect from r where v is distinct from expect
  union all select 0, 'TOTAL', count(*)::text, (count(*) filter (where v is not distinct from expect))::text || ' passed; run md5 '
    || md5(case when strpos(current_query(), E'\n\n-- source: ') > 0 then left(current_query(), strpos(current_query(), E'\n\n-- source: ') - 1) else current_query() end) from r) z order by n;
rollback;

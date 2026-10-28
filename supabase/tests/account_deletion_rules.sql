-- «طلب حذف حسابي» rules (Android_Build_Plan.md A8, MVP_draft.md 64.6), checked inside one transaction that is
-- rolled back at the end. Run with the Supabase SQL editor or the MCP execute_sql tool.
-- Throwaway accounts (@t.test) act through row level security. The real administrators may remove a throwaway
-- account too, so they are told as well inside this run; the checks of who is told read the throwaway accounts only.
-- Covered: nobody signed out asks or reads; nobody writes the table directly; a person asks, once (asking again
-- answers the same request), with a note; who is told (the holders of «إزالة عضو» who may remove that person,
-- never the person, never a lower rank, never for a founder); who sees a request; withdrawing and who is told of it;
-- three requests a day at most; removing the account closes the request as done, by whom, and takes with it what
-- only the person could read, while another person's notices and reminders stay; a removal without a request
-- changes nothing new; the helper functions are not callable.
-- The last query lists only the checks that differ from the rule, and the total.
-- Result: qa/account-deletion-rules.json.
begin;
create temp table r(n serial, k text, v text, expect text);
create temp table v(k text primary key, val text);
grant all on r, v to public; grant usage on sequence r_n_seq to public;
insert into public.accounts (email, display_name, role, pages, protected) values
 ('adm@t.test','Adm','admin','{}',true),('adm2@t.test','Adm2','admin','{}',true),('dir@t.test','Dir','director','{mail}',false),
 ('asst@t.test','Asst','assistant','{mail}',false),('wri@t.test','Wri','writer','{mail}',false),('mem@t.test','Mem','member','{mail}',false),
 ('ex@t.test','Ex','member','{mail}',false);
insert into auth.users (id, email, email_confirmed_at) values
 ('00000000-0000-0000-0000-0000000000a1','adm@t.test',now()),('00000000-0000-0000-0000-0000000000a2','adm2@t.test',now()),
 ('00000000-0000-0000-0000-0000000000d1','dir@t.test',now()),('00000000-0000-0000-0000-0000000000b1','asst@t.test',now()),
 ('00000000-0000-0000-0000-0000000000c1','wri@t.test',now()),('00000000-0000-0000-0000-0000000000c5','mem@t.test',now()),
 ('00000000-0000-0000-0000-0000000000c9','ex@t.test',now());
create function pg_temp.who(id text) returns void language sql as $$ select set_config('request.jwt.claims', json_build_object('sub',id,'role','authenticated')::text, true) $$;
create function pg_temp.t(k text, sqltext text, e text) returns void language plpgsql as $$
declare cn text;
begin
  begin execute sqltext; insert into r(k,v,expect) values (k,'ok',e);
  exception when others then
    get stacked diagnostics cn = constraint_name;
    insert into r(k,v,expect) values (k,'ERR '||coalesce(nullif(cn,''), sqlerrm),e); end;
end $$;
create function pg_temp.c(k text, val text, e text) returns void language sql as $$ insert into r(k,v,expect) values (k,coalesce(val,'NULL'),e) $$;
create function pg_temp.g(k text) returns text language sql as $$ select val from v where k = $1 $$;
-- The throwaway people told of a deletion request: tier and recipient, in order, from notices made in this run.
create function pg_temp.told(p_like text) returns text language sql as $$
  select coalesce(string_agg(tier || ':' || split_part(recipient,'@',1), ',' order by tier, recipient), 'none')
  from public.notifications where recipient like '%@t.test' and body like p_like and created_at >= now() $$;
grant execute on function pg_temp.who(text), pg_temp.t(text,text,text), pg_temp.c(text,text,text), pg_temp.g(text), pg_temp.told(text) to public;

-- Signed out, and writing directly -------------------------------------------------------------
set local role anon;
select pg_temp.t('01 a signed-out caller cannot ask', $q$ select public.account_deletion_request('x') $q$, 'ERR permission denied for function account_deletion_request');
select pg_temp.t('02 nor read the requests', $q$ select count(*) from public.account_deletions $q$, 'ERR permission denied for table account_deletions');
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000c1');
select pg_temp.t('03 nobody writes the table directly', $q$ insert into public.account_deletions (email, name) values ('wri@t.test','Wri') $q$, 'ERR permission denied for table account_deletions');
select pg_temp.t('03b nor changes it', $q$ update public.account_deletions set status = 'done' $q$, 'ERR permission denied for table account_deletions');
select pg_temp.t('03c the helpers are not callable', $q$ select public.deletion_carriers('wri@t.test') $q$, 'ERR permission denied for function deletion_carriers');

-- Asking ------------------------------------------------------------------------------------------
select pg_temp.t('04 the writer asks, with a note', $q$ insert into v values ('W1', public.account_deletion_request('  أغادر المؤسسة.  ')::text) $q$, 'ok');
select pg_temp.c('05 asking again answers the same request', (select (public.account_deletion_request('أخرى')::text = pg_temp.g('W1'))::text), 'true');
select pg_temp.c('06 the writer sees it: open, the note trimmed, the name kept',
  (select string_agg(status || ' ' || note || ' ' || name, ',') from public.account_deletions), 'open أغادر المؤسسة. Wri');
reset role;
select pg_temp.c('07 told in «يحتاج قرارك»: the two administrators and the director, not the assistant, the member or the writer',
  pg_temp.told('طلب Wri (wri@t.test) حذف حسابه.'), 'decide:adm,decide:adm2,decide:dir');
select pg_temp.c('07b the notice leads to the requests of «الحسابات»',
  (select string_agg(distinct go::text, ',') from public.notifications where recipient like '%@t.test' and body like 'طلب Wri%'), '{"tab": "requests", "page": "members"}');
select pg_temp.c('07c one notice each, though the writer asked twice',
  (select count(*)::text from public.notifications where recipient = 'dir@t.test' and body like 'طلب Wri%'), '1');
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
select pg_temp.c('08 the director sees the writer''s request', (select count(*)::text from public.account_deletions where email = 'wri@t.test'), '1');
select pg_temp.who('00000000-0000-0000-0000-0000000000b1');
select pg_temp.c('09 the assistant does not (no «إزالة عضو»)', (select count(*)::text from public.account_deletions), '0');
select pg_temp.who('00000000-0000-0000-0000-0000000000c5');
select pg_temp.c('10 nor the member', (select count(*)::text from public.account_deletions), '0');
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
select pg_temp.t('11 the director asks too', $q$ insert into v values ('D1', public.account_deletion_request(null)::text) $q$, 'ok');
reset role;
select pg_temp.c('11b only the administrators are told: nobody of the director''s rank or below', pg_temp.told('طلب Dir (dir@t.test) حذف حسابه.'), 'decide:adm,decide:adm2');
select pg_temp.c('11c no note is no note', (select coalesce(note, 'none') from public.account_deletions where id = pg_temp.g('D1')::uuid), 'none');
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000c1');
select pg_temp.c('12 the writer sees only their own', (select string_agg(split_part(email,'@',1), ',') from public.account_deletions), 'wri');
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
select pg_temp.c('12b the director sees their own and the writer''s', (select string_agg(split_part(email,'@',1), ',' order by email) from public.account_deletions where email like '%@t.test'), 'dir,wri');
select pg_temp.who('00000000-0000-0000-0000-0000000000a2');
select pg_temp.c('13 an administrator sees both', (select count(*)::text from public.account_deletions where email like '%@t.test'), '2');
select pg_temp.who('00000000-0000-0000-0000-0000000000a1');
select pg_temp.t('14 a founder''s account is not deleted on request', $q$ select public.account_deletion_request(null) $q$, 'ERR PROTECTED_ACCOUNT');

-- Withdrawing, and the day's limit -------------------------------------------------------------------
select pg_temp.who('00000000-0000-0000-0000-0000000000c1');
select pg_temp.c('15 the writer withdraws', (select public.account_deletion_withdraw()::text), 'true');
select pg_temp.c('15b withdrawn, by the writer', (select status || ' ' || split_part(closed_by,'@',1) from public.account_deletions where id = pg_temp.g('W1')::uuid), 'withdrawn wri');
reset role;
select pg_temp.c('15c those told before are told of it, «للعلم» only', pg_temp.told('سحب Wri (wri@t.test) طلب حذف حسابه.'), 'info:adm,info:adm2,info:dir');
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000c1');
select pg_temp.c('16 withdrawing with nothing open answers false', (select public.account_deletion_withdraw()::text), 'false');
select pg_temp.t('17 a second request today', $q$ select public.account_deletion_request(null) $q$, 'ok');
select pg_temp.c('17a withdrawn', (select public.account_deletion_withdraw()::text), 'true');
select pg_temp.t('17b a third', $q$ select public.account_deletion_request(null) $q$, 'ok');
select pg_temp.c('17c withdrawn', (select public.account_deletion_withdraw()::text), 'true');
select pg_temp.t('17d a fourth in a day is refused', $q$ select public.account_deletion_request(null) $q$, 'ERR TOO_MANY');

-- Carrying it out --------------------------------------------------------------------------------------
select pg_temp.who('00000000-0000-0000-0000-0000000000c5');
select pg_temp.t('18 the member asks', $q$ insert into v values ('M1', public.account_deletion_request('شكراً')::text) $q$, 'ok');
reset role;
-- What only the member and the writer could read: notices, a private reminder, the guides' progress.
insert into public.notifications (recipient, tier, body) values ('mem@t.test','attention','للعضو'),('wri@t.test','attention','للكاتب'),('ex@t.test','attention','لمن يغادر');
insert into public.reminders (owner, at, body) values ('mem@t.test', now() + interval '1 day', 'تذكير خاص'),('wri@t.test', now() + interval '1 day', 'تذكير الكاتب');
insert into public.guide_progress (email, seen) values ('mem@t.test','{"account": true}'),('wri@t.test','{"account": true}') on conflict (email) do nothing;
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
select pg_temp.t('19 the director removes the member with «إزالة»', $q$ select public.account_remove('mem@t.test') $q$, 'ok');
reset role;
select pg_temp.c('20 the request is done, carried out by the director',
  (select status || ' ' || split_part(closed_by,'@',1) || ' ' || (closed_at is not null) from public.account_deletions where id = pg_temp.g('M1')::uuid), 'done dir true');
select pg_temp.c('21 the member''s notices, reminders and guide progress are gone',
  (select count(*) from public.notifications where recipient = 'mem@t.test') || ' ' || (select count(*) from public.reminders where owner = 'mem@t.test')
  || ' ' || (select count(*) from public.guide_progress where email = 'mem@t.test'), '0 0 0');
select pg_temp.c('21b and the account, its sign-in and its profile', (select count(*) from public.accounts where email = 'mem@t.test') || ' '
  || (select count(*) from auth.users where email = 'mem@t.test') || ' ' || (select count(*) from public.profiles where email = 'mem@t.test'), '0 0 0');
select pg_temp.c('21c the stars go too', (select (position('delete from public.chat_stars where email = old.email;' in pg_get_functiondef('public.account_deletion_done()'::regprocedure)) > 0)::text), 'true');
select pg_temp.c('22 the writer''s notices and reminder stay',
  (select count(*) from public.notifications where recipient = 'wri@t.test' and body = 'للكاتب') || ' ' || (select count(*) from public.reminders where owner = 'wri@t.test'), '1 1');
select pg_temp.c('22b the writer''s withdrawn requests stay withdrawn', (select string_agg(distinct status, ',') from public.account_deletions where email = 'wri@t.test'), 'withdrawn');
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
select pg_temp.t('23 a removal without a request', $q$ select public.account_remove('ex@t.test') $q$, 'ok');
reset role;
select pg_temp.c('23b changes nothing new: that person''s notices stay, as before', (select count(*)::text from public.notifications where recipient = 'ex@t.test'), '1');
select pg_temp.c('24 the record of the carried-out request stays in the database', (select count(*)::text from public.account_deletions where email = 'mem@t.test'), '1');
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000d1');
select pg_temp.c('24b and is shown to nobody once the account is gone', (select count(*)::text from public.account_deletions where email = 'mem@t.test'), '0');
reset role;

-- The TOTAL row also carries the md5 of the text this run executed (without the lines a client
-- may append after it), so a recorded result can be matched to the file.
select * from (
  select n, k, v, expect from r where v is distinct from expect
  union all select 0, 'TOTAL', count(*)::text, (count(*) filter (where v is not distinct from expect))::text || ' passed; run md5 '
    || md5(case when strpos(current_query(), E'\n\n-- source: ') > 0 then left(current_query(), strpos(current_query(), E'\n\n-- source: ') - 1) else current_query() end) from r) z order by n;
rollback;

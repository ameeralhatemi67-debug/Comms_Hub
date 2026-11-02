-- MVP_draft.md section 70 (migration 20261102200000_create_access.sql): who holds «إنشاء», who may give it, and that the
-- database is the lock. Only throwaway accounts (@t.test) are touched. One transaction, rolled back at the end.
-- Result: qa/create-access-rules.json.
begin;
create temp table r(n serial, k text, v text, expect text);
create temp table v(k text primary key, val text);
grant all on r, v to authenticated; grant usage on sequence r_n_seq to authenticated;
insert into public.accounts (email, display_name, role, pages, protected) values
 ('adm@t.test','Adm','admin','{}',true),('dir@t.test','Dir','director','{}',false),('asst@t.test','Asst','assistant','{}',false),
 ('wri@t.test','Wri','writer','{}',false),('pro@t.test','Pro','producer','{}',false),('pub@t.test','Pub','publisher','{}',false),
 ('des@t.test','Des','designer','{}',false),('des2@t.test','Des2','designer','{}',false),('mem@t.test','Mem','member','{}',false);
insert into auth.users (id, email, email_confirmed_at) values
 ('00000000-0000-0000-0000-0000000000a1','adm@t.test',now()),('00000000-0000-0000-0000-0000000000a2','dir@t.test',now()),
 ('00000000-0000-0000-0000-0000000000a3','asst@t.test',now()),('00000000-0000-0000-0000-0000000000a4','wri@t.test',now()),
 ('00000000-0000-0000-0000-0000000000a5','pro@t.test',now()),('00000000-0000-0000-0000-0000000000a6','pub@t.test',now()),
 ('00000000-0000-0000-0000-0000000000a7','des@t.test',now()),('00000000-0000-0000-0000-0000000000a8','des2@t.test',now()),
 ('00000000-0000-0000-0000-0000000000a9','mem@t.test',now());
create function pg_temp.who(id text) returns void language sql as $$ select set_config('request.jwt.claims', json_build_object('sub',id,'role','authenticated')::text, true) $$;
create function pg_temp.t(k text, sqltext text, e text) returns void language plpgsql as $$
begin
  begin execute sqltext; insert into r(k,v,expect) values (k,'ok',e);
  exception when others then insert into r(k,v,expect) values (k,'ERR '||sqlerrm,e); end;
end $$;
create function pg_temp.c(k text, val text, e text) returns void language sql as $$ insert into r(k,v,expect) values (k,val,e) $$;
create function pg_temp.g(k text) returns text language sql as $$ select val from v where k = $1 $$;
create function pg_temp.holds(p_email text) returns text language sql as $$ select public.perm_eval(p_email, 'page.create', null)->>'ok' $$;
create function pg_temp.work() returns jsonb language sql as $$
  select jsonb_build_object('type','press','title','عمل القواعد','due',(public.work_today() + 30)::text,
    'stages',jsonb_build_array(jsonb_build_object('n','كتابة','role','writer','days',1,'after','[]'::jsonb))) $$;
grant execute on function pg_temp.who(text), pg_temp.t(text,text,text), pg_temp.c(text,text,text), pg_temp.g(text), pg_temp.holds(text), pg_temp.work() to authenticated;

-- 1. Who starts with it --------------------------------------------------------------------------------------
select pg_temp.c('01 the capability is no longer a page list', (select scope_kind from public.capabilities where key = 'page.create'), 'none');
select pg_temp.c('02 the Admin holds it', pg_temp.holds('adm@t.test'), 'true');
select pg_temp.c('03 the director', pg_temp.holds('dir@t.test'), 'true');
select pg_temp.c('04 the assistant', pg_temp.holds('asst@t.test'), 'true');
select pg_temp.c('05 the writer', pg_temp.holds('wri@t.test'), 'true');
select pg_temp.c('06 the producer', pg_temp.holds('pro@t.test'), 'true');
select pg_temp.c('07 the designer does not', pg_temp.holds('des@t.test'), 'false');
select pg_temp.c('08 nor the member', pg_temp.holds('mem@t.test'), 'false');
select pg_temp.c('09 nor the publisher', pg_temp.holds('pub@t.test'), 'false');
select pg_temp.c('10 no account keeps it in its page list', (select count(*)::text from public.accounts where 'create' = any (pages)), '0');

-- 2. The lock -------------------------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000a7');
select pg_temp.t('12 the designer cannot create', $q$ select public.work_create(pg_temp.work()) $q$, 'ERR CREATE_DENIED');
select pg_temp.who('00000000-0000-0000-0000-0000000000a9');
select pg_temp.t('13 nor can the member ask', $q$ select public.work_create(pg_temp.work()) $q$, 'ERR CREATE_DENIED');
select pg_temp.who('00000000-0000-0000-0000-0000000000a6');
select pg_temp.t('14 the publisher keeps the older answer', $q$ select public.work_create(pg_temp.work()) $q$, 'ERR CREATE_ROLE');
select pg_temp.who('00000000-0000-0000-0000-0000000000a4');
select pg_temp.t('15 the writer creates', $q$ select public.work_create(pg_temp.work()) $q$, 'ok');

-- 3. One person ------------------------------------------------------------------------------------------------
select pg_temp.who('00000000-0000-0000-0000-0000000000a3');
select pg_temp.t('16 the assistant cannot give it to a person', $q$ select public.set_member_override('des@t.test','page.create','allow',null) $q$, 'ERR CREATE_GIVER');
select pg_temp.t('17 nor grant it for a time', $q$ select public.grant_capability('des@t.test','page.create','timed',now()+interval '1 day',null,null,'سبب') $q$, 'ERR CREATE_GIVER');
select pg_temp.t('18 and still gives other things', $q$ select public.set_member_override('des@t.test','urgency.2','allow',null) $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-0000000000a2');
select pg_temp.t('19 the director gives it to one designer', $q$ select public.set_member_override('des@t.test','page.create','allow','يحتاجها') $q$, 'ok');
reset role;
select pg_temp.c('20 that designer holds it', pg_temp.holds('des@t.test'), 'true');
select pg_temp.c('21 the other does not', pg_temp.holds('des2@t.test'), 'false');
select pg_temp.c('22 it comes from the override, not a page list', (select pages::text from public.accounts where email = 'des@t.test'), '{}');
select pg_temp.c('23 the person is told', (select count(*)::text from public.notifications where recipient = 'des@t.test' and body like '%«إنشاء»%'), '1');
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000a7');
select pg_temp.t('24 and can create now', $q$ select public.work_create(pg_temp.work()) $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-0000000000a2');
select pg_temp.t('25 a page is not given once', $q$ select public.grant_capability('des2@t.test','page.create','once',null,1,null,'سبب') $q$, 'ERR ONCE_NOT_FOR_PAGES');
select pg_temp.t('26 a publisher cannot be given it', $q$ select public.set_member_override('pub@t.test','page.create','allow',null) $q$, 'ERR PAGE_NEEDS_CREATE');
select pg_temp.t('27 the director gives one designer a week', $q$ select public.grant_capability('des2@t.test','page.create','timed',now()+interval '7 days',null,null,'أسبوع') $q$, 'ok');
reset role;
select pg_temp.c('28 which holds now', pg_temp.holds('des2@t.test'), 'true');
insert into v select 'timed', id::text from public.member_capabilities where email = 'des2@t.test' and capability = 'page.create' and revoked_at is null;
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000a3');
select pg_temp.t('29 the assistant cannot end it', $q$ select public.revoke_capability(pg_temp.g('timed')::uuid) $q$, 'ERR CREATE_GIVER');
select pg_temp.t('30 ending everything leaves it in place', $q$ select public.revoke_all_capabilities('des2@t.test') $q$, 'ok');
reset role;
select pg_temp.c('31 so it still holds', pg_temp.holds('des2@t.test'), 'true');
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000a2');
select pg_temp.t('32 the director ends it', $q$ select public.revoke_capability(pg_temp.g('timed')::uuid) $q$, 'ok');
reset role;
select pg_temp.c('33 and it is gone', pg_temp.holds('des2@t.test'), 'false');

-- 4. A whole role -----------------------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000a3');
select pg_temp.t('34 the assistant cannot switch a role', $q$ select public.set_role_default('designer','page.create',true) $q$, 'ERR FORBIDDEN');
select pg_temp.who('00000000-0000-0000-0000-0000000000a2');
select pg_temp.t('35 nor a role for the publisher, even the director', $q$ select public.set_role_default('publisher','page.create',true) $q$, 'ERR PAGE_NEEDS_CREATE');
select pg_temp.t('36 the director opens it for every designer', $q$ select public.set_role_default('designer','page.create',true) $q$, 'ok');
reset role;
select pg_temp.c('37 the second designer holds it through the role', public.perm_eval('des2@t.test','page.create',null)->>'src', 'role');
select pg_temp.c('38 the member still does not', pg_temp.holds('mem@t.test'), 'false');
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000a2');
select pg_temp.t('39 one person can be taken off while the role is on', $q$ select public.set_member_override('des2@t.test','page.create','deny',null) $q$, 'ok');
reset role;
select pg_temp.c('40 that person does not hold it', pg_temp.holds('des2@t.test'), 'false');
select pg_temp.c('41 the first designer still does', pg_temp.holds('des@t.test'), 'true');
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000a8');
select pg_temp.t('42 and the database refuses them', $q$ select public.work_create(pg_temp.work()) $q$, 'ERR CREATE_DENIED');
select pg_temp.who('00000000-0000-0000-0000-0000000000a2');
select pg_temp.t('43 clearing the override returns them to the role', $q$ select public.set_member_override('des2@t.test','page.create',null,null) $q$, 'ok');
reset role;
select pg_temp.c('44 which holds', pg_temp.holds('des2@t.test'), 'true');
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000a1');
select pg_temp.t('45 the Admin opens it for members', $q$ select public.set_role_default('member','page.create',true) $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-0000000000a9');
select pg_temp.t('46 a member then sends a request', $q$ select public.work_create(pg_temp.work()) $q$, 'ok');
select pg_temp.who('00000000-0000-0000-0000-0000000000a2');
select pg_temp.t('47 the director closes it for designers again', $q$ select public.set_role_default('designer','page.create',false) $q$, 'ok');
reset role;
select pg_temp.c('48 the role is off', pg_temp.holds('des2@t.test'), 'false');
select pg_temp.c('49 a personal grant outlives the role', pg_temp.holds('des@t.test'), 'true');
select pg_temp.c('50 a whole-role change is logged', (select count(*)::text from public.permission_events where kind = 'role_default' and capability = 'page.create' and role = 'designer' and actor like '%@t.test'), '2');

-- 5. Asking --------------------------------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000a8');
select pg_temp.t('51 a designer asks', $q$ insert into v select 'q', public.request_capability('page.create','standing',null,null,null,'أحتاجها','button') $q$, 'ok');
select pg_temp.t('52 not for once', $q$ select public.request_capability('page.create','once',null,1,null,'مرة','button') $q$, 'ERR ONCE_NOT_FOR_PAGES');
reset role;
select pg_temp.c('53 the Admin may decide', public.perm_may_decide('adm@t.test','des2@t.test','page.create')::text, 'true');
select pg_temp.c('54 the director may decide', public.perm_may_decide('dir@t.test','des2@t.test','page.create')::text, 'true');
select pg_temp.c('55 the assistant may not', public.perm_may_decide('asst@t.test','des2@t.test','page.create')::text, 'false');
select pg_temp.c('56 and still may for something else', public.perm_may_decide('asst@t.test','des2@t.test','urgency.2')::text, 'true');
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000a3');
select pg_temp.t('57 so the assistant is refused', $q$ select public.decide_permission_request(pg_temp.g('q')::uuid, true, null, null, null, null, null) $q$, 'ERR NOT_HELD');
select pg_temp.who('00000000-0000-0000-0000-0000000000a2');
select pg_temp.t('58 the director approves', $q$ select public.decide_permission_request(pg_temp.g('q')::uuid, true, null, null, null, null, null) $q$, 'ok');
reset role;
select pg_temp.c('59 and the person holds it', pg_temp.holds('des2@t.test'), 'true');

-- 6. Pages cannot carry it back -------------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-0000000000a1');
select pg_temp.t('60 an account save that still lists it', $q$ select public.account_update('mem@t.test', null, array['work','create']) $q$, 'ok');
reset role;
select pg_temp.c('61 keeps the other page and drops it', (select pages::text from public.accounts where email = 'mem@t.test'), '{work}');
select pg_temp.c('62 the helper is not callable through the API', has_function_privilege('authenticated','public.perm_create_giver(text)','execute')::text, 'false');

select n, k, v, expect from r where v is distinct from expect
union all select 0, 'TOTAL', count(*)::text, (count(*) filter (where v is not distinct from expect))::text || ' passed' from r
order by n;
rollback;

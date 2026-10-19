-- The studio's access rules (Studio_Build_Plan.md Phase 1, MVP_draft.md 62), checked inside one
-- transaction that is rolled back at the end. Run with the Supabase SQL editor or the MCP execute_sql
-- tool. Throwaway accounts (@t.test) of every role act through row level security. Each check records
-- what happened (v) beside what the rule says (expect); the last query lists only the checks that
-- differ, and the total. Result: qa/studio-access-rules.json.
begin;
create temp table r(n serial, k text, v text, expect text);
grant all on r to authenticated, anon; grant usage on sequence r_n_seq to authenticated, anon;
insert into public.accounts (email, display_name, role, pages, protected) values
 ('st-adm@t.test','Adm','admin','{}',true),
 ('st-dir@t.test','Dir','director','{work,motion,media}',false),
 ('st-dir2@t.test','Dir2','director','{work,media}',false),
 ('st-asst@t.test','Asst','assistant','{work,motion}',false),
 ('st-wri@t.test','Wri','writer','{work,motion}',false),
 ('st-des@t.test','Des','designer','{work,motion}',false),
 ('st-pro@t.test','Pro','producer','{work,motion}',false),
 ('st-pub@t.test','Pub','publisher','{work,motion}',false),
 ('st-mem@t.test','Mem','member','{work,motion}',false);
insert into auth.users (id, email, email_confirmed_at) values
 ('00000000-0000-0000-0000-00000000e0a1','st-adm@t.test',now()),
 ('00000000-0000-0000-0000-00000000e0d1','st-dir@t.test',now()),
 ('00000000-0000-0000-0000-00000000e0d2','st-dir2@t.test',now()),
 ('00000000-0000-0000-0000-00000000e0b1','st-asst@t.test',now()),
 ('00000000-0000-0000-0000-00000000e0c1','st-wri@t.test',now()),
 ('00000000-0000-0000-0000-00000000e0c2','st-des@t.test',now()),
 ('00000000-0000-0000-0000-00000000e0c3','st-pro@t.test',now()),
 ('00000000-0000-0000-0000-00000000e0c4','st-pub@t.test',now()),
 ('00000000-0000-0000-0000-00000000e0c5','st-mem@t.test',now());

create function pg_temp.who(id text) returns void language sql as $$ select set_config('request.jwt.claims', json_build_object('sub',id,'role','authenticated')::text, true) $$;
create function pg_temp.t(k text, sqltext text, e text) returns void language plpgsql as $$
begin
  begin execute sqltext; insert into r(k,v,expect) values (k,'ok',e);
  exception when others then insert into r(k,v,expect) values (k,'ERR '||sqlerrm,e); end;
end $$;
create function pg_temp.c(k text, val text, e text) returns void language sql as $$ insert into r(k,v,expect) values (k,val,e) $$;
grant execute on function pg_temp.t(text,text,text), pg_temp.c(text,text,text) to authenticated, anon;

-- The catalog row as the interface mirrors it (src/lib/permissions.ts)
select pg_temp.c('01 the studio is a fixed capability of the Admin and the director',
  (select grp || ' ' || grantable::text || ' ' || array_to_string(fixed_roles, ',') || ' ' || min_rank::text from public.capabilities where key = 'motion.studio'),
  'fixed false admin,director 3');

set local role authenticated;

-- Who holds it: the role alone decides -----------------------------------------
select pg_temp.who('00000000-0000-0000-0000-00000000e0a1');
select pg_temp.c('02 Admin holds the studio and opens it', public.has_capability('motion.studio')::text || ' ' || public.studio_can()::text, 'true true');
select pg_temp.who('00000000-0000-0000-0000-00000000e0d1');
select pg_temp.c('03 the director holds the studio and opens it', public.has_capability('motion.studio')::text || ' ' || public.studio_can()::text, 'true true');
select pg_temp.c('03b the director''s capability list says fixed',
  (select (e->>'ok') || ' ' || (e->>'src') from jsonb_array_elements(public.my_capabilities()->'caps') e where e->>'k' = 'motion.studio'), 'true fixed');
select pg_temp.who('00000000-0000-0000-0000-00000000e0d2');
select pg_temp.c('04 a director without the page of «استوديو الحركة» holds it but cannot open the studio', public.has_capability('motion.studio')::text || ' ' || public.studio_can()::text, 'true false');
select pg_temp.who('00000000-0000-0000-0000-00000000e0b1');
select pg_temp.c('05 the assistant does not', public.has_capability('motion.studio')::text || ' ' || public.studio_can()::text, 'false false');
select pg_temp.who('00000000-0000-0000-0000-00000000e0c1');
select pg_temp.c('06 the writer does not', public.has_capability('motion.studio')::text || ' ' || public.studio_can()::text, 'false false');
select pg_temp.c('06b the writer''s capability list says not held, fixed',
  (select (e->>'ok') || ' ' || (e->>'src') from jsonb_array_elements(public.my_capabilities()->'caps') e where e->>'k' = 'motion.studio'), 'false fixed');
select pg_temp.who('00000000-0000-0000-0000-00000000e0c2');
select pg_temp.c('07 the designer does not', public.studio_can()::text, 'false');
select pg_temp.who('00000000-0000-0000-0000-00000000e0c3');
select pg_temp.c('08 the producer does not', public.studio_can()::text, 'false');
select pg_temp.who('00000000-0000-0000-0000-00000000e0c4');
select pg_temp.c('09 the publisher does not', public.studio_can()::text, 'false');
select pg_temp.who('00000000-0000-0000-0000-00000000e0c5');
select pg_temp.c('10 the member does not', public.studio_can()::text, 'false');

-- Nobody can give it: every grant path refuses a fixed capability ---------------
select pg_temp.who('00000000-0000-0000-0000-00000000e0a1');
select pg_temp.t('11 not granted for a time', $q$ select public.grant_capability('st-wri@t.test','motion.studio','timed',now()+interval '1 day',null,null,null) $q$, 'ERR CAP_FIXED');
select pg_temp.t('12 not granted once', $q$ select public.grant_capability('st-asst@t.test','motion.studio','once',null,1,null,null) $q$, 'ERR CAP_FIXED');
select pg_temp.t('13 not switched on for a person', $q$ select public.set_member_override('st-des@t.test','motion.studio','allow') $q$, 'ERR CAP_FIXED');
select pg_temp.t('14 not switched off for the director either', $q$ select public.set_member_override('st-dir@t.test','motion.studio','deny') $q$, 'ERR CAP_FIXED');
select pg_temp.t('15 not switched on for a role', $q$ select public.set_role_default('producer','motion.studio',true) $q$, 'ERR CAP_FIXED');
select pg_temp.t('16 not held in a preset', $q$ select public.preset_save(null,'استوديو','[{"k":"motion.studio","mode":"timed","hours":24}]') $q$, 'ERR CAP_FIXED');
select pg_temp.who('00000000-0000-0000-0000-00000000e0c1');
select pg_temp.t('17 not asked for', $q$ select public.request_capability('motion.studio','timed',24,null,null,'أريد الاستوديو','page') $q$, 'ERR CAP_FIXED');
select pg_temp.c('18 and the writer still cannot open it', public.studio_can()::text, 'false');

-- Outside a signed-in account the check cannot even be called ------------------
reset role;
set local role anon;
select pg_temp.t('19 anonymous callers cannot run studio_can', $q$ select public.studio_can() $q$, 'ERR permission denied for function studio_can');
reset role;

select * from (
  select n, k, v, expect from r where v is distinct from expect
  union all select 0, 'TOTAL', count(*)::text, (count(*) filter (where v is not distinct from expect))::text || ' passed' from r) z order by n;
rollback;

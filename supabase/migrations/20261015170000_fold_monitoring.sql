-- Action_Plan.md step B6: the page grant «المراقبة» is folded into «سجل النشاط».
--
-- «المراقبة» stopped being a page (step B2): its team panel is part of «سجل النشاط». Until now
-- the grant `page.monitoring` stayed in the catalogue and opened the log (an alias in the
-- interface). This removes it, so the accounts page no longer lists a page that does not exist.
--
--  1. An account that holds the page gets «سجل النشاط» instead (kept if it already has it).
--  2. Person grants and permission requests naming it name `page.activity`; a live standing grant
--     that would duplicate an existing one is ended instead (the unique index allows one).
--  3. The catalogue row goes (its role template rows go with it). Events already written keep the
--     key they were written with: the log is append-only and is read as text.
--  4. The two functions that carry the list of valid pages lose the word.
--
-- On 2026-10-15 no account, grant, request or role template referred to it (counted before this was
-- written); the statements are for the day one does.

-- 1
update public.accounts
set pages = array(
  select distinct x from unnest(array_append(array_remove(pages, 'monitoring'), 'activity')) x
)
where 'monitoring' = any (pages);

-- 2
update public.member_capabilities m
set revoked_at = now()
where m.capability = 'page.monitoring' and m.revoked_at is null and m.mode = 'standing'
  and exists (select 1 from public.member_capabilities o
              where o.email = m.email and o.capability = 'page.activity' and o.revoked_at is null and o.mode = 'standing');

update public.member_capabilities set capability = 'page.activity' where capability = 'page.monitoring';
update public.permission_requests set capability = 'page.activity' where capability = 'page.monitoring';

-- 3
delete from public.capabilities where key = 'page.monitoring';

-- 4
do $$
declare
  f record;
  d text;
  n text;
begin
  for f in
    select p.oid, p.proname
    from pg_proc p join pg_namespace s on s.oid = p.pronamespace
    where s.nspname = 'public' and p.prokind = 'f' and p.prosrc like '%''analytics'',''monitoring'',''settings''%'
  loop
    d := pg_get_functiondef(f.oid);
    if (length(d) - length(replace(d, '''analytics'',''monitoring'',''settings''', ''))) / length('''analytics'',''monitoring'',''settings''') <> 1 then
      raise exception 'MIGRATION_ASSUMPTION: % carries the page list other than once', f.proname;
    end if;
    n := replace(d, '''analytics'',''monitoring'',''settings''', '''analytics'',''settings''');
    execute n;
  end loop;
end
$$;

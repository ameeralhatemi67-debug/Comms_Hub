-- Action_Plan.md step B4b (owner decision of 2026-10-15): the member creates.
--
-- The interface offers «إنشاء» to the member (the domain role creates, and work_create has a member
-- branch: the work is created as a request and assigned by a leader), while the capability
-- `page.create` was fixed-denied for the member, so «صلاحياتي» said the page was not held. The
-- fixed rule now lists the member among the roles that may hold the page, as the interface does.
-- The publisher and the administrator's view of «إنشاء» are unchanged.
--
-- Three functions carry the list of creating roles, each exactly once and only for page.create:
-- perm_eval (the fixed rule), grant_capability (who may be given it), request_capability (who may
-- ask for it). Each is re-created from its own current definition with that one list widened;
-- the block fails, and so the migration, if a function does not carry the list exactly once.

do $$
declare
  f record;
  d text;
  n text;
begin
  for f in
    select p.oid, p.proname
    from pg_proc p join pg_namespace s on s.oid = p.pronamespace
    where s.nspname = 'public' and p.proname in ('perm_eval', 'grant_capability', 'request_capability')
  loop
    d := pg_get_functiondef(f.oid);
    if (length(d) - length(replace(d, '''designer'',''producer'')', ''))) / length('''designer'',''producer'')') <> 1 then
      raise exception 'MIGRATION_ASSUMPTION: % does not carry the creating roles exactly once', f.proname;
    end if;
    n := replace(d, '''designer'',''producer'')', '''designer'',''producer'',''member'')');
    execute n;
  end loop;
end
$$;

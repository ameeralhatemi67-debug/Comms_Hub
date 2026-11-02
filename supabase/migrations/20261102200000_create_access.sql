-- Who holds «إنشاء» (MVP_draft.md section 70, owner directive of 2026-11-02; Create_Access_Plan.md part A).
--
-- The designer and the member start without the page, and the Admin or the Director can give it to a whole role or to one
-- person. A page lives in each account's own list, which cannot say "the role has it but this person does not", so
-- `page.create` moves to the ordinary capability model: a role template, a person's override and a temporary grant. Its key
-- stays, so my_capabilities still turns it into the page, and the site now live keeps working on this migration. Which
-- roles may ever hold it does not change: perm_eval still refuses the publisher.
--
-- This is not the role's ability to create content: uploads follow their own list (`canUpload`, the media_files rule), and
-- the designer keeps them. The database is the lock: work_create asks for the permission, where before it refused only the
-- publisher. This replaces the decision of 2026-10-15 (B4b): the member does not start with «إنشاء».
--
-- An account of the designer or the member holding the page in its list would lose it here. None exists on the day of
-- writing. The function bodies below are patched from their current definitions, and the migration fails if one does not
-- carry the expected text exactly once.

create function pg_temp.patch(p_sig text, p_find text, p_with text) returns void
language plpgsql as $f$
declare d text := pg_get_functiondef(p_sig::regprocedure);
begin
  if (length(d) - length(replace(d, p_find, ''))) / length(p_find) <> 1 then
    raise exception 'MIGRATION_ASSUMPTION: % does not carry the expected text exactly once: %', p_sig, p_find;
  end if;
  execute replace(d, p_find, p_with);
end
$f$;

-- 1. The model -----------------------------------------------------------------------------------------------
update public.capabilities set scope_kind = 'none' where key = 'page.create';

insert into public.role_capabilities (role, capability, allowed, updated_by) values
  ('admin', 'page.create', true, 'system'), ('director', 'page.create', true, 'system'), ('assistant', 'page.create', true, 'system'),
  ('writer', 'page.create', true, 'system'), ('producer', 'page.create', true, 'system'),
  ('designer', 'page.create', false, 'system'), ('member', 'page.create', false, 'system'), ('publisher', 'page.create', false, 'system')
on conflict (role, capability) do update set allowed = excluded.allowed;

-- The page no longer lives in the list: a leftover entry would defeat a person's own "off".
update public.accounts set pages = array_remove(pages, 'create') where 'create' = any (pages);
select pg_temp.patch('public.perm_pages_ok(text[])', '''work'',''create'',''approvals''', '''work'',''approvals''');
select pg_temp.patch('public.account_update(text,text,text[])', '''work'',''create'',''approvals''', '''work'',''approvals''');

-- A page is opened for good or for a time, never once. That held by the scope, so it is named now.
select pg_temp.patch('public.grant_capability(text,text,text,timestamptz,integer,jsonb,text,uuid)',
  'if p_mode = ''once'' and c.scope_kind = ''page'' then', 'if p_mode = ''once'' and (c.scope_kind = ''page'' or p_cap = ''page.create'') then');
select pg_temp.patch('public.request_capability(text,text,integer,integer,jsonb,text,text,text)',
  'if p_mode = ''once'' and c.scope_kind = ''page'' then', 'if p_mode = ''once'' and (c.scope_kind = ''page'' or p_cap = ''page.create'') then');

-- 2. Who may give it: the Admin and the Director, whatever else a person holds ---------------------------------
create function public.perm_create_giver(p_cap text) returns void
language plpgsql stable security definer set search_path = ''
as $$
begin
  if p_cap = 'page.create' and public.media_my_role() is distinct from 'admin' and public.media_my_role() is distinct from 'director' then
    raise exception 'CREATE_GIVER' using errcode = 'P0001';
  end if;
end
$$;
revoke all on function public.perm_create_giver(text) from public, anon, authenticated;

select pg_temp.patch('public.grant_capability(text,text,text,timestamptz,integer,jsonb,text,uuid)',
  'tr := public.perm_require(p_email, ''permissions.grant'');', 'tr := public.perm_require(p_email, ''permissions.grant'');
  perform public.perm_create_giver(p_cap);');
select pg_temp.patch('public.set_member_override(text,text,text,text)',
  'tr := public.perm_require(p_email, ''permissions.grant'');', 'tr := public.perm_require(p_email, ''permissions.grant'');
  perform public.perm_create_giver(p_cap);');
select pg_temp.patch('public.revoke_capability(uuid)',
  'perform public.perm_require(g.email, ''permissions.grant'');', 'perform public.perm_require(g.email, ''permissions.grant'');
  perform public.perm_create_giver(g.capability);');
select pg_temp.patch('public.revoke_all_capabilities(text)',
  'where email = p_email and revoked_at is null;', 'where email = p_email and revoked_at is null
      and (capability <> ''page.create'' or public.media_my_role() in (''admin'', ''director''));');
-- A whole role, for a role that may ever hold it.
select pg_temp.patch('public.set_role_default(text,text,boolean)',
  'if p_allowed and public.perm_rank(p_role) < c.min_rank then', 'perform public.perm_create_giver(p_cap);
  if p_allowed and p_cap = ''page.create'' and p_role not in (''director'',''assistant'',''writer'',''designer'',''producer'',''member'') then
    raise exception ''PAGE_NEEDS_CREATE'' using errcode = ''P0001'';
  end if;
  if p_allowed and public.perm_rank(p_role) < c.min_rank then');
-- A request goes to them alone.
select pg_temp.patch('public.perm_may_decide(text,text,text)',
  'if mr = ''admin'' then return true; end if;', 'if mr = ''admin'' then return true; end if;
  if p_cap = ''page.create'' and mr <> ''director'' then return false; end if;');

-- 3. The lock --------------------------------------------------------------------------------------------------
select pg_temp.patch('public.work_create(jsonb)',
  'if r = ''publisher'' then raise exception ''CREATE_ROLE'' using errcode = ''P0001''; end if;',
  'if r = ''publisher'' then raise exception ''CREATE_ROLE'' using errcode = ''P0001''; end if;
  if not public.has_capability(''page.create'') then raise exception ''CREATE_DENIED'' using errcode = ''P0001''; end if;');

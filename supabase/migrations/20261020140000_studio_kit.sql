-- The studio, third round, Phase 6: templates and «هوية الاستوديو» (MVP_draft.md 62.11).
--
--   * A project can be a template (studio_projects.template); a new project is made from any project's
--     numbered revision by studio_project_copy, carrying the library files the source project recorded
--     even when the person copying cannot see them (as a save carries them, studio_sources_ok).
--   * studio_brand: one shared row of named colours and a title and a text font, read by those who may
--     open the studio and written by studio_brand_save. It is configuration: it joins the config backup.
-- Every write is a function below; row level security reads only.

alter table public.studio_projects add column template boolean not null default false;

create table public.studio_brand (
  id int primary key default 1 check (id = 1),
  colors jsonb not null default '[]'::jsonb,
  title_font text check (title_font is null or char_length(title_font) between 1 and 60),
  body_font text check (body_font is null or char_length(body_font) between 1 and 60),
  updated_by text,
  updated_at timestamptz not null default now()
);
insert into public.studio_brand (id) values (1);
alter table public.studio_brand enable row level security;
create policy studio_brand_read on public.studio_brand for select to authenticated using ((select public.studio_can()));

-- A project marked as a template, or no longer.
create function public.studio_project_set_template(p_project uuid, p_on boolean) returns void
language plpgsql security definer set search_path = ''
as $$
declare me text := public.current_email();
begin
  if not public.studio_can() then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  update public.studio_projects set template = coalesce(p_on, false), updated_at = now(), updated_by = me where id = p_project;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
end
$$;

-- A new project from a project's numbered revision (its latest when p_revision is null).
create function public.studio_project_copy(p_from uuid, p_revision int, p_title text) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare me text := public.current_email(); src public.studio_projects; d jsonb; pid uuid; a uuid; v int;
begin
  if not public.studio_can() then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if char_length(btrim(coalesce(p_title, ''))) not between 1 and 120 then raise exception 'TITLE_INVALID' using errcode = 'P0001'; end if;
  select * into src from public.studio_projects where id = p_from;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  select doc into d from public.studio_revisions where project_id = p_from and revision = coalesce(p_revision, src.revision) and revision >= 1;
  if d is null then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  perform public.studio_doc_check(d, src.kind);
  -- a library file the source project recorded is carried; any other must be visible to the caller
  for a, v in
    select distinct (s->>'asset')::uuid, (s->>'version')::int from jsonb_array_elements(d->'sources') s where s->>'kind' = 'library'
  loop
    if exists (select 1 from public.studio_sources x where x.project_id = p_from and x.asset_id = a and x.version = v) then continue; end if;
    if coalesce(public.media_asset_level(a), 0) < 1 or not exists (select 1 from public.media_versions mv where mv.asset_id = a and mv.version = v) then
      raise exception 'SOURCE_DENIED' using errcode = 'P0001';
    end if;
  end loop;
  insert into public.studio_projects (title, kind, owner, updated_by, revision, lease_holder, lease_until)
  values (btrim(p_title), src.kind, me, me, 1, me, now() + interval '90 seconds')
  returning id into pid;
  insert into public.studio_revisions (project_id, revision, base, schema_version, doc, bytes, saved_by, note)
  values (pid, 1, 0, (d->>'schema')::int, d, octet_length(d::text), me, left('من «' || src.title || '»', 200));
  perform public.studio_sources_record(pid, 1, d);
  return pid;
end
$$;

-- «هوية الاستوديو»: up to twelve named colours (#rrggbb) and two fonts.
create function public.studio_brand_save(p_colors jsonb, p_title_font text, p_body_font text) returns void
language plpgsql security definer set search_path = ''
as $$
declare me text := public.current_email(); c jsonb;
begin
  if not public.studio_can() then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if jsonb_typeof(p_colors) is distinct from 'array' or jsonb_array_length(p_colors) > 12 then raise exception 'BRAND_INVALID' using errcode = 'P0001'; end if;
  for c in select x from jsonb_array_elements(p_colors) x loop
    if jsonb_typeof(c) is distinct from 'object' or coalesce(c->>'hex', '') !~ '^#[0-9a-fA-F]{6}$'
       or char_length(btrim(coalesce(c->>'name', ''))) not between 1 and 40 then
      raise exception 'BRAND_INVALID' using errcode = 'P0001';
    end if;
  end loop;
  if (p_title_font is not null and char_length(p_title_font) not between 1 and 60) or (p_body_font is not null and char_length(p_body_font) not between 1 and 60) then
    raise exception 'BRAND_INVALID' using errcode = 'P0001';
  end if;
  update public.studio_brand set colors = p_colors, title_font = nullif(btrim(coalesce(p_title_font, '')), ''), body_font = nullif(btrim(coalesce(p_body_font, '')), ''), updated_by = me, updated_at = now() where id = 1;
end
$$;

-- The studio home: the template flag joins each project.
create or replace function public.studio_list(p_archived boolean default false) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.studio_can() then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', p.id, 'title', p.title, 'kind', p.kind, 'owner', p.owner,
      'owner_name', (select a.display_name from public.accounts a where a.email = p.owner),
      'created_at', p.created_at, 'updated_at', p.updated_at, 'updated_by', p.updated_by,
      'updated_by_name', (select a.display_name from public.accounts a where a.email = p.updated_by),
      'revision', p.revision, 'autosaved_at', p.autosaved_at, 'work_ref', p.work_ref, 'archived_at', p.archived_at,
      'template', p.template,
      'editing', case when p.lease_until >= now() then p.lease_holder end,
      'editing_name', case when p.lease_until >= now() then (select a.display_name from public.accounts a where a.email = p.lease_holder) end,
      'exports', (select count(*) from public.studio_exports e where e.project_id = p.id),
      'thumb', (select e.asset_id from public.studio_exports e where e.project_id = p.id order by e.created_at desc limit 1)
    ) order by p.updated_at desc)
    from public.studio_projects p
    where (p.archived_at is not null) = coalesce(p_archived, false)), '[]'::jsonb);
end
$$;

-- Backups: «هوية الاستوديو» is configuration.
create or replace function public.backup_table_list(p_kind text) returns jsonb
language sql immutable set search_path = ''
as $$
  select case p_kind
    when 'database' then jsonb_build_array(
      jsonb_build_object('table','works'), jsonb_build_object('table','work_texts'), jsonb_build_object('table','work_variants'),
      jsonb_build_object('table','work_stages'), jsonb_build_object('table','work_approvals'), jsonb_build_object('table','work_cycles'),
      jsonb_build_object('table','work_decisions'), jsonb_build_object('table','work_comments'), jsonb_build_object('table','work_flags'),
      jsonb_build_object('table','work_log'), jsonb_build_object('table','work_assets'), jsonb_build_object('table','work_projects'),
      jsonb_build_object('table','work_requests'), jsonb_build_object('table','projects'), jsonb_build_object('table','events'),
      jsonb_build_object('table','media_files'), jsonb_build_object('table','media_versions'), jsonb_build_object('table','media_folders'),
      jsonb_build_object('table','media_grants'), jsonb_build_object('table','media_notes'), jsonb_build_object('table','media_tasks'),
      jsonb_build_object('table','activity_log'), jsonb_build_object('table','file_locations'),
      jsonb_build_object('table','platform_accounts'), jsonb_build_object('table','integration_events'),
      jsonb_build_object('table','studio_projects', 'drop', jsonb_build_array('lease_holder','lease_until')),
      jsonb_build_object('table','studio_revisions', 'page', 25),
      jsonb_build_object('table','studio_sources'), jsonb_build_object('table','studio_exports'))
    when 'config' then jsonb_build_array(
      jsonb_build_object('table','capabilities'), jsonb_build_object('table','role_capabilities'),
      jsonb_build_object('table','member_capabilities'), jsonb_build_object('table','permission_presets'),
      jsonb_build_object('table','platforms'), jsonb_build_object('table','plan_templates'),
      jsonb_build_object('table','site_settings'), jsonb_build_object('table','storage_roles'),
      jsonb_build_object('table','accounts'), jsonb_build_object('table','mail_rules'), jsonb_build_object('table','backup_jobs'),
      jsonb_build_object('table','integrations', 'drop', jsonb_build_array('secret_id','pending_secret_id')),
      jsonb_build_object('table','studio_brand'))
    else '[]'::jsonb end
$$;

revoke all on function public.studio_project_set_template(uuid, boolean) from public, anon;
revoke all on function public.studio_project_copy(uuid, int, text) from public, anon;
revoke all on function public.studio_brand_save(jsonb, text, text) from public, anon;
grant execute on function public.studio_project_set_template(uuid, boolean) to authenticated;
grant execute on function public.studio_project_copy(uuid, int, text) to authenticated;
grant execute on function public.studio_brand_save(jsonb, text, text) to authenticated;

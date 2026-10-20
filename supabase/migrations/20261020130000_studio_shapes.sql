-- The studio, third round, Phase 5: an export records the shape it was made in (MVP_draft.md 62.10).
--
-- A video project may export the same cut in up to four shapes (its own and three more), each a file of
-- its own. studio_exports gains the shape; studio_export_record takes it (null for older callers and for
-- pictures); the version list shows it beside each file.

alter table public.studio_exports add column shape text check (shape is null or shape in ('9:16','16:9','1:1','4:5'));

drop function public.studio_export_record(uuid, int, uuid, int, text);
create function public.studio_export_record(p_project uuid, p_revision int, p_asset uuid, p_version int, p_kind text, p_shape text default null) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare me text := public.current_email(); eid uuid;
begin
  if not public.studio_can() then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if p_kind not in ('video','image') then raise exception 'DOC_INVALID' using errcode = 'P0001'; end if;
  if p_shape is not null and p_shape not in ('9:16','16:9','1:1','4:5') then raise exception 'DOC_INVALID' using errcode = 'P0001'; end if;
  if coalesce(p_revision, 0) < 1 or not exists (select 1 from public.studio_revisions where project_id = p_project and revision = p_revision) then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.media_versions mv where mv.asset_id = p_asset and mv.version = p_version and mv.uploaded_by = me) then
    raise exception 'EXPORT_NOT_YOURS' using errcode = 'P0001';
  end if;
  insert into public.studio_exports (project_id, revision, asset_id, version, kind, created_by, shape)
  values (p_project, p_revision, p_asset, p_version, p_kind, me, p_shape)
  on conflict (asset_id, version) do nothing
  returning id into eid;
  if eid is null then select id into eid from public.studio_exports where asset_id = p_asset and version = p_version; end if;
  return eid;
end
$$;

create or replace function public.studio_revisions_list(p_project uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.studio_can() then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.studio_projects where id = p_project) then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'revision', r.revision, 'saved_at', r.saved_at, 'saved_by', r.saved_by,
      'saved_by_name', (select a.display_name from public.accounts a where a.email = r.saved_by),
      'note', r.note, 'bytes', r.bytes,
      'exports', coalesce((
        -- a file's name only for those who may see the file (row level security of the library)
        select jsonb_agg(jsonb_build_object('asset', e.asset_id, 'version', e.version, 'kind', e.kind, 'shape', e.shape,
          'name', case when coalesce(public.media_asset_level(e.asset_id), 0) >= 1
                       then (select f.name from public.media_files f where f.id = e.asset_id) end) order by e.created_at)
        from public.studio_exports e where e.project_id = p_project and e.revision = r.revision), '[]'::jsonb)
    ) order by r.revision desc)
    from public.studio_revisions r
    where r.project_id = p_project and r.revision >= 1), '[]'::jsonb);
end
$$;

revoke all on function public.studio_export_record(uuid, int, uuid, int, text, text) from public, anon;
grant execute on function public.studio_export_record(uuid, int, uuid, int, text, text) to authenticated;

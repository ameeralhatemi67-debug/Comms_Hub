-- The studio, third round, Phase 1: the versions of a project (MVP_draft.md 62.6,
-- Studio_Build_Plan.md section 10).
--
-- «النسخ» lists a project's numbered revisions with who saved each one and which library files were
-- exported from it. Opening an old revision already exists (studio_project_doc with p_revision);
-- restoring one is two ordinary numbered saves (studio_save), so nothing here writes. Revisions stay
-- append-only: no version is ever changed or removed.

create function public.studio_revisions_list(p_project uuid) returns jsonb
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
        select jsonb_agg(jsonb_build_object('asset', e.asset_id, 'version', e.version, 'kind', e.kind,
          'name', case when coalesce(public.media_asset_level(e.asset_id), 0) >= 1
                       then (select f.name from public.media_files f where f.id = e.asset_id) end) order by e.created_at)
        from public.studio_exports e where e.project_id = p_project and e.revision = r.revision), '[]'::jsonb)
    ) order by r.revision desc)
    from public.studio_revisions r
    where r.project_id = p_project and r.revision >= 1), '[]'::jsonb);
end
$$;

revoke all on function public.studio_revisions_list(uuid) from public, anon;
grant execute on function public.studio_revisions_list(uuid) to authenticated;

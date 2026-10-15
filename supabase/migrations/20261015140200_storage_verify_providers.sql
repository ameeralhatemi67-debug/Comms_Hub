-- Settings Step S3: the verification batch (S2) now says which provider each copy is at and its
-- non-secret settings, so a copy at a second provider is checked by that provider and not
-- skipped. Same signature, same right (storage.manage), same limit; two more keys per row.
create or replace function public.storage_verify_batch(p_limit int default 20) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.has_capability('storage.manage', null) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', x.id, 'ref', x.ref, 'type', x.type, 'size_bytes', x.size_bytes,
                                        'integration_id', x.integration_id, 'config', x.config))
    from (
      select l.id, l.ref, i.type, l.size_bytes, i.id integration_id, i.config
      from public.file_locations l join public.integrations i on i.id = l.integration_id
      where l.state <> 'retired' and i.deleted_at is null
      order by l.verified_at nulls first, l.created_at
      limit least(greatest(coalesce(p_limit, 20), 1), 50)) x), '[]'::jsonb);
end
$$;

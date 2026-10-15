-- Settings Step S3, follow-up to 20261015140000_storage_move_engine.sql, found while writing the
-- runner: (1) an item the runner stops on (its time budget ended) must be released at once, not
-- left leased for two minutes, or the next batch finds nothing to claim; (2) the claim also hands
-- the server what the source provider itself reported for its copy (remote_checksum), so a
-- source that is an S3 multipart object can be proven unchanged.

create function public.storage_move_release(p_key text, p_item uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.mail_key_ok(p_key) or not public.has_capability('storage.migrate', null) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  update public.storage_move_items set claimed_until = null, updated_at = now() where id = p_item;
end
$$;
revoke all on function public.storage_move_release(text, uuid) from public, anon;
grant execute on function public.storage_move_release(text, uuid) to authenticated;

create or replace function public.storage_move_claim(p_key text, p_id uuid, p_limit int) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare m public.storage_moves; s public.integrations; d public.integrations; picked uuid[];
begin
  if not public.mail_key_ok(p_key) or not public.has_capability('storage.migrate', null) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  select * into m from public.storage_moves where id = p_id;
  if not found then raise exception 'MOVE_NOT_FOUND' using errcode = 'P0001'; end if;
  if m.state <> 'running' then return jsonb_build_object('state', m.state, 'items', '[]'::jsonb); end if;
  select * into s from public.integrations where id = m.source_id;
  select * into d from public.integrations where id = m.dest_id;

  update public.storage_move_items i set state = 'skipped', reason = 'source_changed', progress = null, claimed_until = null, updated_at = now()
    where i.move_id = p_id and i.state in ('pending','copying')
      and not exists (select 1 from public.file_locations l where l.id = i.source_location_id and l.role = 'primary' and l.state <> 'retired');

  perform public.storage_move_settle(p_id);
  select * into m from public.storage_moves where id = p_id;
  if m.state <> 'running' then return jsonb_build_object('state', m.state, 'items', '[]'::jsonb); end if;

  select coalesce(array_agg(x.id), '{}') into picked from (
    select i.id from public.storage_move_items i
    where i.move_id = p_id and (i.state in ('pending','copying','copied') or (i.state = 'verified' and m.mode = 'move'))
      and (i.claimed_until is null or i.claimed_until < now())
    order by i.created_at, i.id
    limit least(greatest(coalesce(p_limit, 3), 1), 10)
    for update skip locked) x;
  update public.storage_move_items set claimed_until = now() + interval '120 seconds', updated_at = now() where id = any (picked);

  return jsonb_build_object(
    'state', m.state, 'mode', m.mode,
    'source', jsonb_build_object('id', s.id, 'type', s.type, 'config', s.config),
    'dest', jsonb_build_object('id', d.id, 'type', d.type, 'config', d.config),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
          'id', i.id, 'state', i.state, 'kind', i.subject_kind, 'subject', i.subject_id, 'approved', i.approved,
          'size', coalesce(i.size_bytes, sl.size_bytes), 'attempts', i.attempts, 'progress', i.progress,
          'source_ref', sl.ref, 'source_checksum', sl.checksum, 'source_remote', sl.remote_checksum,
          'name', case i.subject_kind
                    when 'media_version' then (select f.name from public.media_versions v join public.media_files f on f.id = v.asset_id where v.id = i.subject_id)
                    else (select mf.name from public.mail_files mf where mf.id = i.subject_id) end,
          'mime', case i.subject_kind
                    when 'media_version' then (select v.mime_type from public.media_versions v where v.id = i.subject_id)
                    else (select mf.mime_type from public.mail_files mf where mf.id = i.subject_id) end,
          'parent', case when i.subject_kind = 'media_version' then (
                      select fo.drive_folder_id from public.media_versions v
                        join public.media_files f on f.id = v.asset_id
                        join public.media_folders fo on fo.id = f.folder_id where v.id = i.subject_id) end,
          'dest_location', (select jsonb_build_object('id', dl.id, 'ref', dl.ref, 'state', dl.state, 'size', dl.size_bytes,
                              'checksum', dl.checksum, 'remote_checksum', dl.remote_checksum)
                            from public.file_locations dl
                            where dl.integration_id = m.dest_id and dl.subject_kind = i.subject_kind and dl.subject_id = i.subject_id
                              and dl.state <> 'retired' order by (dl.state = 'ok') desc limit 1)
        ) order by i.created_at, i.id)
      from public.storage_move_items i join public.file_locations sl on sl.id = i.source_location_id
      where i.id = any (picked)), '[]'::jsonb));
end
$$;

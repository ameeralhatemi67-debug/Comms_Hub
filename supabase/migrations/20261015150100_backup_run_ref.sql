-- Settings Step S4, follow-up: a later «تحقق» of a kept export needs its reference and provider.
-- For the server only (the person's right and the server key together), as every record function.
create function public.backup_run_ref(p_key text, p_run uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare r public.backup_runs; i public.integrations;
begin
  if not public.mail_key_ok(p_key) or not public.has_capability('backups.run', null) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  select * into r from public.backup_runs where id = p_run;
  if not found then raise exception 'BACKUP_BAD_STATE' using errcode = 'P0001'; end if;
  select * into i from public.integrations where id = r.integration_id;
  return jsonb_build_object('kind', r.kind, 'state', r.state, 'ref', r.ref, 'checksum', r.checksum, 'size', r.size_bytes,
    'integration', case when i.id is null then null else jsonb_build_object('id', i.id, 'type', i.type, 'config', i.config) end);
end
$$;
revoke all on function public.backup_run_ref(text, uuid) from public, anon;
grant execute on function public.backup_run_ref(text, uuid) to authenticated;

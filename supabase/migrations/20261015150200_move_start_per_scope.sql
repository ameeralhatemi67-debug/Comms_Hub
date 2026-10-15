-- Settings Step S4, found while writing the files run: a backup makes one plan for the library and one
-- for attachments between the same two providers, and the engine refused to start the second because
-- "another move between the same providers is running". The refusal exists so two plans do not copy
-- the same files at once; plans of different scopes (library, mail) cannot overlap, so it now applies
-- to the same scope only.
create or replace function public.storage_move_start(p_id uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare m public.storage_moves; s public.integrations; d public.integrations;
begin
  if not public.has_capability('storage.migrate', null) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  select * into m from public.storage_moves where id = p_id for update;
  if not found then raise exception 'MOVE_NOT_FOUND' using errcode = 'P0001'; end if;
  if m.state not in ('planned','paused') then raise exception 'MOVE_BAD_STATE' using errcode = 'P0001'; end if;
  select * into s from public.integrations where id = m.source_id;
  select * into d from public.integrations where id = m.dest_id;
  if s.deleted_at is not null or d.deleted_at is not null or s.state = 'disabled' or d.state = 'disabled' then
    raise exception 'MOVE_PROVIDER_NOT_READY' using errcode = 'P0001';
  end if;
  if m.dest_checked_at is null then raise exception 'MOVE_NOT_CHECKED' using errcode = 'P0001'; end if;
  if m.dest_free is not null and m.bytes > m.dest_free then raise exception 'MOVE_NO_SPACE' using errcode = 'P0001'; end if;
  if exists (select 1 from public.storage_moves o
             where o.id <> p_id and o.state = 'running' and o.dest_id = m.dest_id and o.source_id = m.source_id
               and (o.scope->>'kind') is not distinct from (m.scope->>'kind')) then
    raise exception 'MOVE_ALREADY_RUNNING' using errcode = 'P0001';
  end if;
  update public.storage_moves set state = 'running', started_at = coalesce(started_at, now()), finished_at = null where id = p_id;
  perform public.storage_move_event(p_id, 'storage_move_started', jsonb_build_object('resumed', m.state = 'paused'));
  perform public.storage_move_settle(p_id);
end
$$;

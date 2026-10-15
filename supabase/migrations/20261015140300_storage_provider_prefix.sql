-- Settings Step S3, found while reviewing the database rule run: a prefix of ../x passed the
-- pattern, and a dot segment in an object key is collapsed by URL handling, so the object would
-- not be where the signature says. A prefix (and the address path) may not contain a "." or ".."
-- segment.
create or replace function public.storage_provider_save(p_id uuid, p_label text, p_config jsonb) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  me text := public.current_email(); i public.integrations; nid uuid;
  ep text := regexp_replace(btrim(coalesce(p_config->>'endpoint', '')), '/+$', '');
  bucket text := btrim(coalesce(p_config->>'bucket', ''));
  region text := btrim(coalesce(p_config->>'region', ''));
  prefix text := btrim(coalesce(p_config->>'prefix', ''), ' /');
  flavor text := coalesce(nullif(btrim(p_config->>'flavor'), ''), 'other');
  path_style boolean := coalesce((p_config->>'path_style')::boolean, true);
  cfg jsonb; lbl text := btrim(coalesce(p_label, ''));
begin
  if not public.has_capability('storage.manage', null) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if char_length(lbl) not between 1 and 60 then raise exception 'PROVIDER_LABEL' using errcode = 'P0001'; end if;
  if ep !~ '^https://[A-Za-z0-9]([A-Za-z0-9.-]{0,120})(:[0-9]{2,5})?(/[A-Za-z0-9._~/-]{0,100})?$' then
    raise exception 'PROVIDER_ENDPOINT' using errcode = 'P0001';
  end if;
  if ep ~ '^https://[0-9.]+(:|/|$)' or ep ~* 'localhost|\.local(:|/|$)|\.internal(:|/|$)|\.lan(:|/|$)' then
    raise exception 'PROVIDER_ENDPOINT' using errcode = 'P0001';
  end if;
  if ep ~ '/\.\.?(/|$)' then raise exception 'PROVIDER_ENDPOINT' using errcode = 'P0001'; end if;
  if bucket !~ '^[a-z0-9][a-z0-9._-]{1,61}[a-z0-9]$' then raise exception 'PROVIDER_BUCKET' using errcode = 'P0001'; end if;
  if region <> '' and region !~ '^[A-Za-z0-9-]{1,40}$' then raise exception 'PROVIDER_REGION' using errcode = 'P0001'; end if;
  if prefix <> '' and (prefix !~ '^[A-Za-z0-9._-]+(/[A-Za-z0-9._-]+){0,3}$' or prefix ~ '(^|/)\.\.?(/|$)') then
    raise exception 'PROVIDER_PREFIX' using errcode = 'P0001';
  end if;
  if flavor not in ('supabase','b2','r2','minio','aws','other') then raise exception 'PROVIDER_FLAVOR' using errcode = 'P0001'; end if;
  cfg := jsonb_build_object('endpoint', ep, 'bucket', bucket, 'region', case when region = '' then 'auto' else region end,
                            'prefix', prefix, 'path_style', path_style, 'flavor', flavor);
  if p_id is null then
    if (select count(*) from public.integrations where type = 's3_compatible' and deleted_at is null) >= 6 then
      raise exception 'PROVIDER_LIMIT' using errcode = 'P0001';
    end if;
    insert into public.integrations (kind, type, label, state, config, created_by)
    values ('storage', 's3_compatible', lbl, 'pending', cfg, me) returning id into nid;
    insert into public.integration_events (integration_id, actor, kind, data)
    values (nid, me, 'created', jsonb_build_object('type', 's3_compatible', 'flavor', flavor));
    return nid;
  end if;
  select * into i from public.integrations where id = p_id and kind = 'storage' and type = 's3_compatible' and deleted_at is null for update;
  if not found then raise exception 'INT_NOT_FOUND' using errcode = 'P0001'; end if;
  if exists (select 1 from public.storage_moves m where m.state in ('planned','running','paused') and p_id in (m.source_id, m.dest_id))
     and (i.config - 'account') is distinct from cfg then
    raise exception 'PROVIDER_IN_MOVE' using errcode = 'P0001';
  end if;
  update public.integrations set label = lbl, config = (config - 'account') || cfg,
      state = case when state = 'disabled' then state when (i.config - 'account') is distinct from cfg then 'pending' else state end
    where id = p_id;
  insert into public.integration_events (integration_id, actor, kind, data)
  values (p_id, me, 'settings', jsonb_build_object('provider', true));
  return p_id;
end
$$;

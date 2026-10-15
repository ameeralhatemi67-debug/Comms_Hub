-- Action_Plan.md B10 (Settings_Integrations_Plan.md S8): OneDrive as a storage provider, on the
-- move engine, entered and connected from the site.
--
--  1. The Microsoft app (client id and secret, entered in the site like the other platform apps):
--     `microsoft_app` joins the app types of platform_conn_app_set / platform_conn_app_get, and the
--     server may read it (integration_creds).
--  2. A OneDrive account is a storage provider (kind storage, type onedrive; its refresh token is
--     the secret, the account's address is in the config):
--       onedrive_provider_set    the Director (storage and secrets rights) connects one, or
--                                reconnects the same account, with the server key
--       onedrive_token_rotate    the server keeps the refresh token Microsoft hands back at a
--                                refresh (key only: share links have no session)
--  3. storage_provider_remove also removes a OneDrive provider (nothing stored at it, no open move,
--     no role), and the move plan knows its file size limit (250 GB).
-- Each patched function is re-created from its own current definition; the block fails, and so the
-- migration, if one does not carry what is expected.

do $$
declare
  f record; d text; n text; patched int := 0;
begin
  for f in
    select p.oid, p.proname from pg_proc p join pg_namespace s on s.oid = p.pronamespace
    where s.nspname = 'public' and p.prokind = 'f'
      and p.proname in ('platform_conn_app_set', 'platform_conn_app_get', 'integration_creds', 'storage_provider_remove', 'storage_move_plan')
  loop
    d := pg_get_functiondef(f.oid);
    n := d;
    if f.proname in ('platform_conn_app_set', 'platform_conn_app_get') then
      n := replace(n, '(''meta_app'',''tiktok_app'',''google_app'',''linkedin_app'',''x_app'')',
                      '(''meta_app'',''tiktok_app'',''google_app'',''linkedin_app'',''x_app'',''microsoft_app'')');
    elsif f.proname = 'integration_creds' then
      n := replace(n, '(''google_app'', ''gmail_account'', ''whatsapp_bridge'')', '(''google_app'', ''gmail_account'', ''whatsapp_bridge'', ''microsoft_app'')');
    elsif f.proname = 'storage_provider_remove' then
      n := replace(n, 'type = ''s3_compatible''', 'type in (''s3_compatible'', ''onedrive'')');
    elsif f.proname = 'storage_move_plan' then
      n := replace(n, 'when ''s3_compatible'' then 80000000000 else', 'when ''s3_compatible'' then 80000000000 when ''onedrive'' then 250000000000 else');
    end if;
    if n = d then raise exception 'MIGRATION_ASSUMPTION: % carries none of the expected text', f.proname; end if;
    execute n;
    patched := patched + 1;
  end loop;
  if patched <> 5 then raise exception 'MIGRATION_ASSUMPTION: % functions patched, expected 5', patched; end if;
end
$$;

create function public.onedrive_provider_set(p_key text, p_account text, p_label text, p_secret text) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  me text := public.current_email(); i public.integrations; sid uuid; v_id uuid; v_found boolean;
  acc text := lower(btrim(coalesce(p_account, ''))); lbl text := btrim(coalesce(p_label, ''));
begin
  if not public.mail_key_ok(p_key) or me is null
     or not (public.has_capability('storage.manage', null) and public.has_capability('integrations.secrets', null)) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  if acc = '' or char_length(acc) > 120 then raise exception 'ACCOUNT_INVALID' using errcode = 'P0001'; end if;
  if char_length(lbl) not between 1 and 60 then raise exception 'PROVIDER_LABEL' using errcode = 'P0001'; end if;
  if p_secret is null or char_length(p_secret) not between 8 and 8192 then raise exception 'SECRET_INVALID' using errcode = 'P0001'; end if;

  select * into i from public.integrations
    where type = 'onedrive' and kind = 'storage' and deleted_at is null and lower(config->>'account') = acc
    for update;
  v_found := found;
  if not v_found and (select count(*) from public.integrations where type = 'onedrive' and deleted_at is null) >= 3 then
    raise exception 'PROVIDER_LIMIT' using errcode = 'P0001';
  end if;

  sid := vault.create_secret(p_secret, 'integration:onedrive:' || gen_random_uuid(), 'Comms Hub OneDrive refresh token');
  if v_found then
    if i.secret_id is not null then delete from vault.secrets where id = i.secret_id; end if;
    update public.integrations set secret_id = sid, secret_tail = '••••' || right(p_secret, 4), secret_set_at = now(),
        state = 'connected', last_check_at = now(), last_ok_at = now(), last_error = null, disabled_at = null
      where id = i.id;
    v_id := i.id;
  else
    insert into public.integrations (kind, type, label, state, config, secret_id, secret_tail, secret_set_at, last_check_at, last_ok_at, created_by)
    values ('storage', 'onedrive', lbl, 'connected', jsonb_build_object('account', acc), sid, '••••' || right(p_secret, 4), now(), now(), now(), me)
    returning id into v_id;
    insert into public.integration_events (integration_id, actor, kind, data) values (v_id, me, 'created', jsonb_build_object('type', 'onedrive'));
  end if;
  insert into public.integration_events (integration_id, actor, kind, data)
  values (v_id, me, 'secret_committed', jsonb_build_object('replaced', v_found, 'onedrive', true));
  return v_id;
end
$$;
revoke all on function public.onedrive_provider_set(text, text, text, text) from public, anon;
grant execute on function public.onedrive_provider_set(text, text, text, text) to authenticated;

create function public.onedrive_token_rotate(p_key text, p_id uuid, p_secret text) returns void
language plpgsql security definer set search_path = ''
as $$
declare i public.integrations; sid uuid;
begin
  if not public.mail_key_ok(p_key) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if p_secret is null or char_length(p_secret) not between 8 and 8192 then raise exception 'SECRET_INVALID' using errcode = 'P0001'; end if;
  select * into i from public.integrations where id = p_id and type = 'onedrive' and deleted_at is null for update;
  if not found or i.state = 'disabled' then return; end if;
  sid := vault.create_secret(p_secret, 'integration:onedrive:' || gen_random_uuid(), 'Comms Hub OneDrive refresh token');
  if i.secret_id is not null then delete from vault.secrets where id = i.secret_id; end if;
  update public.integrations set secret_id = sid, secret_tail = '••••' || right(p_secret, 4), secret_set_at = now() where id = i.id;
  insert into public.integration_events (integration_id, actor, kind, data)
  values (i.id, null, 'secret_committed', jsonb_build_object('rotated', true, 'onedrive', true));
end
$$;
revoke all on function public.onedrive_token_rotate(text, uuid, text) from public;
grant execute on function public.onedrive_token_rotate(text, uuid, text) to anon, authenticated;

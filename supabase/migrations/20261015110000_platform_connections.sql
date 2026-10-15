-- Readiness audit, order step 6: real OAuth connection and health for platform accounts
-- (Settings_Integrations_Plan.md 8.2, 8.4; Facebook and Instagram through one Meta app, then
-- TikTok; Snapchat stays a manual task).
--
-- A connected account used to be a handle and a 60-day fake authorisation. It now has a
-- `conn_kind`: 'simulated' (as before, nothing changed) or 'oauth' (a real authorisation
-- through the platform's own sign-in). For an OAuth account:
--   * the token lives in Supabase Vault as the secret of an `integrations` row (kind platform),
--     read only by the site's server with its key, for a stated purpose, never returned to a
--     browser and never written to a log;
--   * `authorized_until` is the token's real expiry, so the work cycle's existing
--     "authorisation covers the moment" rule becomes true instead of simulated;
--   * `conn_state`, `conn_checked_at` and `conn_error` are the last health check's answer, in
--     columns publishers may read (no secret, no reference);
--   * a failed check that says the token is no longer valid expires the authorisation at once,
--     so a publish to it fails honestly, and the publishers are told once.
-- The app credentials (Meta app id and secret, TikTok client key and secret) are entered once
-- through the interface into the same vault, by someone holding «إدارة المنصات وتطبيقاتها» and
-- «إدخال أسرار التكاملات وتجديدها». Nothing here publishes: publishing stays a simulation.

-- ---------------------------------------------------------------------------
-- 1. What an account knows about its connection
-- ---------------------------------------------------------------------------
alter table public.platform_accounts
  add column conn_kind text not null default 'simulated' check (conn_kind in ('simulated','oauth')),
  add column conn_state text not null default 'simulated' check (conn_state in ('simulated','pending','connected','needs_reconnect','error')),
  add column conn_checked_at timestamptz,
  add column conn_ok_at timestamptz,
  add column conn_error text check (conn_error is null or char_length(conn_error) <= 60),
  add column external_id text check (external_id is null or char_length(external_id) <= 120),
  add column external_name text check (external_name is null or char_length(external_name) <= 200),
  add column scopes text[] not null default '{}',
  add column integration_id uuid references public.integrations(id);
create index platform_accounts_integration_idx on public.platform_accounts (integration_id) where integration_id is not null;

-- The mailbox and every account that existed stay as they were: simulated.

-- ---------------------------------------------------------------------------
-- 2. Who may connect
-- ---------------------------------------------------------------------------
-- The people who manage accounts (the director and the assistant), or whoever holds
-- «إدارة المنصات وتطبيقاتها». Both are decided by the existing engine.
create function public.platform_conn_may() returns boolean
language sql stable security definer set search_path = ''
as $$ select public.account_manager() or public.has_capability('platforms.manage', null) $$;

-- ---------------------------------------------------------------------------
-- 3. The app credentials (one row per app type: meta_app, tiktok_app)
-- ---------------------------------------------------------------------------
-- The route has already asked the platform whether the id and secret work; this stores the
-- secret (replacing the old one) and the non-secret half in `config`. Returns the masked tail.
create function public.platform_conn_app_set(p_key text, p_type text, p_label text, p_config jsonb, p_secret text) returns text
language plpgsql security definer set search_path = ''
as $$
declare me text := public.current_email(); i public.integrations; sid uuid; tail text; v_found boolean; v_replaced boolean;
begin
  if not public.mail_key_ok(p_key) or me is null
     or not (public.has_capability('platforms.manage', null) and public.has_capability('integrations.secrets', null)) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  if p_type not in ('meta_app','tiktok_app') then raise exception 'INT_NOT_FOUND' using errcode = 'P0001'; end if;
  if p_secret is null or char_length(p_secret) not between 8 and 8192 then raise exception 'SECRET_INVALID' using errcode = 'P0001'; end if;
  select * into i from public.integrations where type = p_type and deleted_at is null order by created_at limit 1 for update;
  v_found := found;
  v_replaced := v_found and i.secret_id is not null;
  sid := vault.create_secret(p_secret, 'integration:' || p_type || ':' || gen_random_uuid(), 'Comms Hub platform app secret');
  tail := '••••' || right(p_secret, 4);
  if not v_found then
    insert into public.integrations (kind, type, label, state, config, secret_id, secret_tail, secret_set_at, last_check_at, last_ok_at, created_by)
    values ('platform', p_type, left(p_label, 60), 'connected', coalesce(p_config, '{}'::jsonb), sid, tail, now(), now(), now(), me)
    returning * into i;
    insert into public.integration_events (integration_id, actor, kind, data) values (i.id, me, 'created', jsonb_build_object('type', p_type));
  else
    if i.secret_id is not null then delete from vault.secrets where id = i.secret_id; end if;
    update public.integrations set secret_id = sid, secret_tail = tail, secret_set_at = now(), state = 'connected',
        last_check_at = now(), last_ok_at = now(), last_error = null, config = coalesce(p_config, config), label = left(p_label, 60)
      where id = i.id;
  end if;
  insert into public.integration_events (integration_id, actor, kind, data)
  values (i.id, me, 'secret_committed', jsonb_build_object('replaced', v_replaced, 'app', true));
  return tail;
end
$$;

-- The app's id (non-secret) and secret, for the site's server, for a stated purpose.
create function public.platform_conn_app_get(p_key text, p_type text, p_purpose text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare i public.integrations; v text;
begin
  if not public.mail_key_ok(p_key) or public.current_email() is null then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if p_type not in ('meta_app','tiktok_app') then return null; end if;
  select * into i from public.integrations where type = p_type and deleted_at is null and state <> 'disabled' order by created_at limit 1;
  if not found or i.secret_id is null then return null; end if;
  select s.decrypted_secret into v from vault.decrypted_secrets s where s.id = i.secret_id;
  insert into public.integration_events (integration_id, actor, kind, data)
  values (i.id, public.current_email(), 'secret_used', jsonb_build_object('purpose', left(coalesce(p_purpose, ''), 60), 'pending', false));
  return jsonb_build_object('id', i.id, 'config', i.config, 'secret', v);
end
$$;

-- ---------------------------------------------------------------------------
-- 4. A signed-in person's user token, between the callback and the choice of pages
-- ---------------------------------------------------------------------------
-- Stored as the secret of an integrations row owned by the person who signed in. Other
-- people's leftover rows of the same type older than an hour are removed on the way.
create function public.platform_conn_user_put(p_key text, p_type text, p_label text, p_config jsonb, p_secret text) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare me text := public.current_email(); sid uuid; v_id uuid;
begin
  if not public.mail_key_ok(p_key) or me is null or not public.platform_conn_may() then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if p_type not in ('meta_user','tiktok_user_offer') then raise exception 'INT_NOT_FOUND' using errcode = 'P0001'; end if;
  if p_secret is null or char_length(p_secret) not between 8 and 8192 then raise exception 'SECRET_INVALID' using errcode = 'P0001'; end if;
  delete from vault.secrets where id in (select secret_id from public.integrations where type = p_type and deleted_at is null and created_at < now() - interval '1 hour' and secret_id is not null);
  update public.integrations set deleted_at = now(), secret_id = null where type = p_type and deleted_at is null and created_at < now() - interval '1 hour';
  sid := vault.create_secret(p_secret, 'integration:' || p_type || ':' || gen_random_uuid(), 'Comms Hub platform user token');
  insert into public.integrations (kind, type, label, state, config, secret_id, secret_tail, secret_set_at, last_check_at, last_ok_at, created_by)
  values ('platform', p_type, left(p_label, 60), 'pending', coalesce(p_config, '{}'::jsonb) || jsonb_build_object('owner', me), sid, '••••' || right(p_secret, 4), now(), now(), now(), me)
  returning id into v_id;
  insert into public.integration_events (integration_id, actor, kind, data) values (v_id, me, 'created', jsonb_build_object('type', p_type));
  return v_id;
end
$$;

-- The secret of one platform integration, for the site's server. Only the person who put a
-- user token there, or one who may connect for an account row, reads it back.
create function public.platform_conn_secret(p_key text, p_id uuid, p_purpose text) returns text
language plpgsql security definer set search_path = ''
as $$
declare me text := public.current_email(); i public.integrations; v text;
begin
  if not public.mail_key_ok(p_key) or me is null or not public.platform_conn_may() then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  select * into i from public.integrations where id = p_id and kind = 'platform' and deleted_at is null;
  if not found or i.secret_id is null then return null; end if;
  if i.type in ('meta_user','tiktok_user_offer') and i.config->>'owner' is distinct from me then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  select s.decrypted_secret into v from vault.decrypted_secrets s where s.id = i.secret_id;
  insert into public.integration_events (integration_id, actor, kind, data)
  values (i.id, me, 'secret_used', jsonb_build_object('purpose', left(coalesce(p_purpose, ''), 60), 'pending', false));
  return v;
end
$$;

-- What the offered user token is about (non-secret), for the chooser. Same owner rule.
create function public.platform_conn_offer(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare i public.integrations;
begin
  select * into i from public.integrations where id = p_id and kind = 'platform' and deleted_at is null and type in ('meta_user','tiktok_user_offer');
  if not found or i.config->>'owner' is distinct from public.current_email() or not public.platform_conn_may() then return null; end if;
  return jsonb_build_object('id', i.id, 'type', i.type, 'config', i.config - 'owner', 'created_at', i.created_at);
end
$$;

-- ---------------------------------------------------------------------------
-- 5. Linking an account
-- ---------------------------------------------------------------------------
-- p: {platform, type, label, handle, purpose, publishers[], mode, external_id, external_name,
--     scopes[], expires_at, account_id (to reconnect one), offer (the user-token row to remove)}
-- The account token is the secret of its own integrations row. An existing simulated account
-- on the same platform and handle is upgraded in place, so works and approvals keep pointing at
-- it. A handle already connected for real is refused.
create function public.platform_conn_link(p_key text, p jsonb, p_secret text) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  me text := public.current_email(); v_pub text[]; v_handle text; a public.platform_accounts; v_id uuid; i_id uuid; sid uuid;
  v_exp timestamptz := nullif(p->>'expires_at', '')::timestamptz; v_scopes text[]; v_found boolean;
begin
  if not public.mail_key_ok(p_key) or me is null or not public.platform_conn_may() then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if p->>'type' not in ('meta_page','meta_instagram','tiktok_user') then raise exception 'INT_NOT_FOUND' using errcode = 'P0001'; end if;
  if p_secret is null or char_length(p_secret) not between 8 and 8192 then raise exception 'SECRET_INVALID' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.platforms pl where pl.key = p->>'platform' and pl.kind = 'social' and pl.enabled) then
    raise exception 'PLATFORM_INVALID' using errcode = 'P0001';
  end if;
  v_handle := nullif(btrim(coalesce(p->>'handle', '')), '');
  if v_handle is null then raise exception 'HANDLE_REQUIRED' using errcode = 'P0001'; end if;
  if char_length(btrim(coalesce(p->>'label', ''))) not between 1 and 60 then raise exception 'LABEL_REQUIRED' using errcode = 'P0001'; end if;
  select coalesce(array_agg(distinct x.e), '{}') into v_pub
    from jsonb_array_elements_text(coalesce(p->'publishers', '[]'::jsonb)) x(e) join public.accounts c on c.email = x.e and c.role <> 'member';
  select coalesce(array_agg(x.e), '{}') into v_scopes from jsonb_array_elements_text(coalesce(p->'scopes', '[]'::jsonb)) x(e);

  if nullif(p->>'account_id', '') is not null then
    select * into a from public.platform_accounts where id = (p->>'account_id')::uuid for update;
  else
    select * into a from public.platform_accounts where platform = p->>'platform' and lower(handle) = lower(v_handle) for update;
  end if;
  v_found := found;
  if v_found and a.conn_kind = 'oauth' and a.conn_state <> 'needs_reconnect' and coalesce(a.external_id, '') is distinct from coalesce(p->>'external_id', '')
     and nullif(p->>'account_id', '') is null then
    raise exception 'HANDLE_TAKEN' using errcode = 'P0001';
  end if;
  if cardinality(v_pub) = 0 and not v_found then raise exception 'PUBLISHER_REQUIRED' using errcode = 'P0001'; end if;
  if v_found and a.fixed then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;

  sid := vault.create_secret(p_secret, 'integration:' || (p->>'type') || ':' || gen_random_uuid(), 'Comms Hub platform account token');
  if v_found and a.integration_id is not null then
    i_id := a.integration_id;
    delete from vault.secrets where id = (select secret_id from public.integrations where id = i_id and secret_id is not null);
    update public.integrations set secret_id = sid, secret_tail = '••••' || right(p_secret, 4), secret_set_at = now(), state = 'connected',
        last_check_at = now(), last_ok_at = now(), last_error = null, deleted_at = null,
        config = config || jsonb_build_object('external_id', p->>'external_id', 'scopes', to_jsonb(v_scopes), 'expires_at', p->>'expires_at')
      where id = i_id;
    insert into public.integration_events (integration_id, actor, kind, data) values (i_id, me, 'connected', jsonb_build_object('reconnected', true));
  else
    insert into public.integrations (kind, type, label, state, config, secret_id, secret_tail, secret_set_at, last_check_at, last_ok_at, created_by)
    values ('platform', p->>'type', left(btrim(p->>'label'), 60), 'connected',
            jsonb_build_object('external_id', p->>'external_id', 'scopes', to_jsonb(v_scopes), 'expires_at', p->>'expires_at'),
            sid, '••••' || right(p_secret, 4), now(), now(), now(), me)
    returning id into i_id;
    insert into public.integration_events (integration_id, actor, kind, data) values (i_id, me, 'connected', jsonb_build_object('reconnected', false));
  end if;

  if v_found then
    update public.platform_accounts set conn_kind = 'oauth', conn_state = 'connected', conn_checked_at = now(), conn_ok_at = now(), conn_error = null,
        external_id = p->>'external_id', external_name = left(p->>'external_name', 200), scopes = v_scopes, integration_id = i_id,
        authorized_until = coalesce(v_exp, authorized_until),
        publishers = case when cardinality(v_pub) > 0 then v_pub else publishers end
      where id = a.id returning id into v_id;
  else
    insert into public.platform_accounts (platform, label, handle, purpose, authorized_until, publishers, mode, added_by,
        conn_kind, conn_state, conn_checked_at, conn_ok_at, external_id, external_name, scopes, integration_id)
    values (p->>'platform', btrim(p->>'label'), v_handle, nullif(left(btrim(coalesce(p->>'purpose', '')), 200), ''),
            v_exp, v_pub, case when p->>'mode' = 'ask' then 'ask' else 'auto' end, me,
            'oauth', 'connected', now(), now(), p->>'external_id', left(p->>'external_name', 200), v_scopes, i_id)
    returning id into v_id;
    perform public.work_notify_many(v_pub, 'info', public.work_name(me) || ' ربط حساب «' || public.work_account_name(v_id)
      || '» وجعلك ممن ينشر عليه.', jsonb_build_object('page','accounts'));
  end if;

  -- The person's user token is no longer needed once the pages are chosen.
  if nullif(p->>'offer', '') is not null then
    delete from vault.secrets where id = (select secret_id from public.integrations
      where id = (p->>'offer')::uuid and type in ('meta_user','tiktok_user_offer') and config->>'owner' = me and secret_id is not null);
    update public.integrations set deleted_at = now(), secret_id = null
      where id = (p->>'offer')::uuid and type in ('meta_user','tiktok_user_offer') and config->>'owner' = me;
  end if;
  return v_id;
end
$$;

-- ---------------------------------------------------------------------------
-- 6. Health
-- ---------------------------------------------------------------------------
-- The server records what the platform answered. p_new_secret replaces the stored token in the
-- same step (TikTok's refresh), p_expires is the token's real expiry. A check that says the
-- token is no longer valid expires the authorisation at once and tells the publishers once.
create function public.platform_conn_health(p_key text, p_account uuid, p_ok boolean, p_error text, p_expires timestamptz, p_new_secret text) returns text
language plpgsql security definer set search_path = ''
as $$
declare a public.platform_accounts; i public.integrations; v_next text; sid uuid; v_have boolean;
begin
  if not public.mail_key_ok(p_key) or not public.is_approved() then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  select * into a from public.platform_accounts where id = p_account and conn_kind = 'oauth' for update;
  if not found then return null; end if;
  v_next := case when p_ok then 'connected' when p_error in ('TOKEN_REFUSED','NOT_CONNECTED','TOKEN_EXPIRED','PERMISSION_REVOKED') then 'needs_reconnect' else 'error' end;
  select * into i from public.integrations where id = a.integration_id for update;
  v_have := found;
  if v_have and p_ok and p_new_secret is not null and char_length(p_new_secret) between 8 and 8192 then
    sid := vault.create_secret(p_new_secret, 'integration:' || i.type || ':' || gen_random_uuid(), 'Comms Hub platform account token');
    if i.secret_id is not null then delete from vault.secrets where id = i.secret_id; end if;
    update public.integrations set secret_id = sid, secret_tail = '••••' || right(p_new_secret, 4), secret_set_at = now() where id = i.id;
  end if;
  update public.platform_accounts set conn_state = v_next, conn_checked_at = now(),
      conn_ok_at = case when p_ok then now() else conn_ok_at end,
      conn_error = case when p_ok then null else left(p_error, 60) end,
      authorized_until = case when p_ok and p_expires is not null then p_expires
                              when v_next = 'needs_reconnect' then least(coalesce(authorized_until, now()), now())
                              else authorized_until end
    where id = a.id;
  if v_have then
    update public.integrations set state = v_next, last_check_at = now(),
        last_ok_at = case when p_ok then now() else last_ok_at end,
        last_error = case when p_ok then null else left(p_error, 200) end
      where id = i.id;
  end if;
  if v_next is distinct from a.conn_state then
    if v_have then
      insert into public.integration_events (integration_id, actor, kind, data)
      values (i.id, public.current_email(), 'health', jsonb_build_object('from', a.conn_state, 'to', v_next, 'error', left(coalesce(p_error, ''), 60)));
    end if;
    if v_next = 'needs_reconnect' then
      perform public.work_notify_many(a.publishers, 'attention', 'انقطع ربط حساب «' || public.work_account_name(a.id)
        || '». أعد ربطه من «الحسابات المرتبطة» قبل النشر عليه.', jsonb_build_object('page','accounts'));
    end if;
  end if;
  return v_next;
end
$$;

-- Which accounts are due a check: connected for real and not checked in the last p_minutes.
create function public.platform_conn_due(p_minutes int default 30) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'platform', a.platform, 'type', i.type, 'integration', a.integration_id,
      'external_id', a.external_id) order by a.created_at), '[]'::jsonb)
  from public.platform_accounts a join public.integrations i on i.id = a.integration_id
  where public.is_approved() and a.conn_kind = 'oauth' and a.active
    and (a.conn_checked_at is null or a.conn_checked_at < now() - make_interval(mins => greatest(coalesce(p_minutes, 30), 1)))
$$;

-- Stops using the connection: the token is destroyed and the authorisation ends now. The
-- account, its works and its approvals stay; reconnecting makes it usable again.
create function public.platform_conn_disconnect(p_account uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare a public.platform_accounts; i public.integrations;
begin
  if not public.platform_conn_may() then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  select * into a from public.platform_accounts where id = p_account and conn_kind = 'oauth' for update;
  if not found then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  select * into i from public.integrations where id = a.integration_id for update;
  if found then
    if i.secret_id is not null then delete from vault.secrets where id = i.secret_id; end if;
    update public.integrations set secret_id = null, secret_tail = null, state = 'needs_reconnect', last_error = 'DISCONNECTED' where id = i.id;
    insert into public.integration_events (integration_id, actor, kind, data)
    values (i.id, public.current_email(), 'health', jsonb_build_object('from', a.conn_state, 'to', 'needs_reconnect', 'error', 'DISCONNECTED'));
  end if;
  update public.platform_accounts set conn_state = 'needs_reconnect', conn_error = 'DISCONNECTED', authorized_until = now() where id = a.id;
end
$$;

-- A real connection is renewed through the platform, never by a button that only moves a date.
create or replace function public.account_reconnect(p_id uuid) returns timestamptz
language plpgsql security definer set search_path = ''
as $$
declare v timestamptz; k text;
begin
  if not (public.account_manager() or public.work_publisher()) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  select conn_kind into k from public.platform_accounts where id = p_id;
  if k = 'oauth' then raise exception 'RECONNECT_REAL' using errcode = 'P0001'; end if;
  update public.platform_accounts set authorized_until = now() + interval '60 days'
    where id = p_id and platform <> 'mail' returning authorized_until into v;
  if v is null then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  return v;
end
$$;

-- ---------------------------------------------------------------------------
-- 7. The list in settings does not show a person's passing user token
-- ---------------------------------------------------------------------------
create or replace function public.int_list() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.has_capability('settings.view', null) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', i.id, 'kind', i.kind, 'type', i.type, 'label', i.label, 'state', i.state, 'config', i.config - 'owner',
      'has_secret', i.secret_id is not null, 'secret_tail', i.secret_tail, 'secret_set_at', i.secret_set_at,
      'pending', i.pending_secret_id is not null,
      'last_check_at', i.last_check_at, 'last_ok_at', i.last_ok_at, 'last_error', i.last_error,
      'created_at', i.created_at, 'disabled_at', i.disabled_at) order by i.kind, i.created_at)
    from public.integrations i where i.deleted_at is null and i.type not in ('meta_user','tiktok_user_offer')), '[]'::jsonb);
end
$$;

-- ---------------------------------------------------------------------------
-- 8. Privileges
-- ---------------------------------------------------------------------------
revoke all on function public.platform_conn_may(), public.platform_conn_app_set(text, text, text, jsonb, text),
  public.platform_conn_app_get(text, text, text), public.platform_conn_user_put(text, text, text, jsonb, text),
  public.platform_conn_secret(text, uuid, text), public.platform_conn_offer(uuid), public.platform_conn_link(text, jsonb, text),
  public.platform_conn_health(text, uuid, boolean, text, timestamptz, text), public.platform_conn_due(int),
  public.platform_conn_disconnect(uuid) from public, anon;
grant execute on function public.platform_conn_may(), public.platform_conn_app_set(text, text, text, jsonb, text),
  public.platform_conn_app_get(text, text, text), public.platform_conn_user_put(text, text, text, jsonb, text),
  public.platform_conn_secret(text, uuid, text), public.platform_conn_offer(uuid), public.platform_conn_link(text, jsonb, text),
  public.platform_conn_health(text, uuid, boolean, text, timestamptz, text), public.platform_conn_due(int),
  public.platform_conn_disconnect(uuid) to authenticated;

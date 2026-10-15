-- Action_Plan.md B9: the Director connects the department's platforms, mail and Drive from the site.
--
--  1. YouTube (Google), LinkedIn and X join Meta and TikTok in the platform connection functions.
--     Each function that names the app, passing-offer and account types lists them in its body, so
--     each is re-created from its own current definition with those lists widened. A function that
--     does not carry what is expected fails the migration instead of being half-changed.
--       app types      meta_app, tiktok_app      + google_app, linkedin_app, x_app
--       offer types    meta_user, tiktok_user_offer + google_user_offer, linkedin_user_offer, x_user_offer
--       account types  meta_page, meta_instagram, tiktok_user + youtube_channel, linkedin_member, x_user
--  2. The reminder to reconnect names the page by its present name, «حسابات المنصات».
--  3. integration_creds: the site's server (its key, not a session: share links and the mail
--     sync have none) reads the Google app and the mail account credentials entered in the site,
--     for a stated purpose that is logged without the value.
--  4. mail_account_set: the Director (integrations.secrets and settings.manage) enters the shared
--     Gmail address and app password once; the secret goes to the vault and is never read back.

do $$
declare
  f record;
  d text;
  n text;
  patched int := 0;
  swaps text[][] := array[
    array['(''meta_app'',''tiktok_app'')',
          '(''meta_app'',''tiktok_app'',''google_app'',''linkedin_app'',''x_app'')'],
    array['(''meta_user'',''tiktok_user_offer'')',
          '(''meta_user'',''tiktok_user_offer'',''google_user_offer'',''linkedin_user_offer'',''x_user_offer'')'],
    array['(''meta_page'',''meta_instagram'',''tiktok_user'')',
          '(''meta_page'',''meta_instagram'',''tiktok_user'',''youtube_channel'',''linkedin_member'',''x_user'')'],
    array['«الحسابات المرتبطة»', '«حسابات المنصات»']
  ];
  s int;
begin
  for f in
    select p.oid, p.proname
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public' and p.prokind = 'f'
      and (p.prosrc like '%''tiktok_app''%' or p.prosrc like '%''tiktok_user_offer''%' or p.prosrc like '%''tiktok_user''%'
           or (p.proname = 'platform_conn_health' and p.prosrc like '%الحسابات المرتبطة%'))
  loop
    d := pg_get_functiondef(f.oid);
    n := d;
    for s in 1 .. array_length(swaps, 1) loop
      n := replace(n, swaps[s][1], swaps[s][2]);
    end loop;
    if n = d then
      raise exception 'MIGRATION_ASSUMPTION: % carries none of the expected lists', f.proname;
    end if;
    execute n;
    patched := patched + 1;
  end loop;
  -- app_get, app_set, user_put, secret, offer, link, int_list and health: eight functions.
  if patched <> 8 then
    raise exception 'MIGRATION_ASSUMPTION: % functions patched, expected 8', patched;
  end if;
end
$$;

-- 3. The server reads an app or account credential entered in the site.
create function public.integration_creds(p_key text, p_type text, p_purpose text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare i public.integrations; v text;
begin
  if not public.mail_key_ok(p_key) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if p_type not in ('google_app', 'gmail_account') then return null; end if;
  select * into i from public.integrations
    where type = p_type and deleted_at is null and state <> 'disabled' order by created_at limit 1;
  if not found or i.secret_id is null then return null; end if;
  select s.decrypted_secret into v from vault.decrypted_secrets s where s.id = i.secret_id;
  insert into public.integration_events (integration_id, actor, kind, data)
  values (i.id, public.current_email(), 'secret_used', jsonb_build_object('purpose', left(coalesce(p_purpose, ''), 60), 'pending', false));
  return jsonb_build_object('id', i.id, 'config', i.config, 'secret', v);
end
$$;
revoke all on function public.integration_creds(text, text, text) from public;
grant execute on function public.integration_creds(text, text, text) to anon, authenticated;

-- 4. The shared mailbox's address and app password, entered once by the Director.
create function public.mail_account_set(p_key text, p_address text, p_secret text) returns text
language plpgsql security definer set search_path = ''
as $$
declare me text := public.current_email(); i public.integrations; sid uuid; tail text; v_found boolean; v_addr text := lower(btrim(coalesce(p_address, '')));
begin
  if not public.mail_key_ok(p_key) or me is null
     or not (public.has_capability('settings.manage', null) and public.has_capability('integrations.secrets', null)) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  if v_addr !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(v_addr) > 120 then raise exception 'ADDRESS_INVALID' using errcode = 'P0001'; end if;
  if p_secret is null or char_length(p_secret) not between 8 and 200 then raise exception 'SECRET_INVALID' using errcode = 'P0001'; end if;
  select * into i from public.integrations where type = 'gmail_account' and deleted_at is null order by created_at limit 1 for update;
  v_found := found;
  sid := vault.create_secret(p_secret, 'integration:gmail_account:' || gen_random_uuid(), 'Comms Hub shared mailbox app password');
  tail := '••••' || right(p_secret, 4);
  if not v_found then
    insert into public.integrations (kind, type, label, state, config, secret_id, secret_tail, secret_set_at, last_check_at, last_ok_at, created_by)
    values ('messaging', 'gmail_account', 'صندوق البريد المشترك', 'connected', jsonb_build_object('address', v_addr), sid, tail, now(), now(), now(), me)
    returning * into i;
    insert into public.integration_events (integration_id, actor, kind, data) values (i.id, me, 'created', jsonb_build_object('type', 'gmail_account'));
  else
    if i.secret_id is not null then delete from vault.secrets where id = i.secret_id; end if;
    update public.integrations set secret_id = sid, secret_tail = tail, secret_set_at = now(), state = 'connected',
      last_check_at = now(), last_ok_at = now(), last_error = null, config = config || jsonb_build_object('address', v_addr)
    where id = i.id;
  end if;
  insert into public.integration_events (integration_id, actor, kind, data)
  values (i.id, me, 'secret_committed', jsonb_build_object('replaced', v_found and i.secret_id is not null, 'mail', true));
  return tail;
end
$$;
revoke all on function public.mail_account_set(text, text, text) from public, anon;
grant execute on function public.mail_account_set(text, text, text) to authenticated;

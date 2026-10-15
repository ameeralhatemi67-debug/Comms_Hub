-- Action_Plan.md B9: the Director makes the WhatsApp bridge's key from the site.
--
-- Until now the bridge key and the link-signing secret were made in a PowerShell window, set in the
-- hosting dashboard and fingerprinted with a statement typed into the SQL editor. The site now
-- makes both, keeps them in the vault, writes the key's fingerprint itself, and shows the key once
-- for the bridge computer's settings file. The bridge, and every function that checks the key by
-- its fingerprint (wa_key_ok), are unchanged.
--
--  1. The Director holds «إدارة رقم واتساب النظام» by default (the administrator already does).
--  2. integration_creds also answers for the type 'whatsapp_bridge' (the server reads the pair).
--  3. wa_bridge_issue: with the server key, and for a holder of the system-number right and the
--     secrets right: writes the fingerprint and replaces the pair in the vault. Returns nothing.

with changed as (
  update public.role_capabilities rc set allowed = true, updated_by = 'Action_Plan.md B9', updated_at = now()
  where rc.role = 'director' and rc.capability = 'whatsapp.system.manage' and not rc.allowed
  returning rc.role, rc.capability)
insert into public.permission_events (actor, subject, role, capability, kind, data)
select null, null, c.role, c.capability, 'role_default',
  jsonb_build_object('allowed', true, 'people', (select count(*) from public.accounts a where a.role = c.role),
                     'reason', 'Owner decision 2026-10-15: the Director sets up the WhatsApp bridge from the site')
from changed c;

do $$
declare d text; n text; oid_ oid;
begin
  select p.oid into oid_ from pg_proc p join pg_namespace s on s.oid = p.pronamespace
    where s.nspname = 'public' and p.proname = 'integration_creds';
  d := pg_get_functiondef(oid_);
  if position('(''google_app'', ''gmail_account'')' in d) = 0 then
    raise exception 'MIGRATION_ASSUMPTION: integration_creds does not carry the type list';
  end if;
  n := replace(d, '(''google_app'', ''gmail_account'')', '(''google_app'', ''gmail_account'', ''whatsapp_bridge'')');
  execute n;
end
$$;

create function public.wa_bridge_issue(p_key text, p_hash text, p_pair text) returns void
language plpgsql security definer set search_path = ''
as $$
declare me text := public.current_email(); i public.integrations; sid uuid; v_found boolean;
begin
  if not public.mail_key_ok(p_key) or me is null
     or not (public.has_capability('whatsapp.system.manage', null) and public.has_capability('integrations.secrets', null)) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  if p_hash is null or p_hash !~ '^[0-9a-f]{64}$' then raise exception 'KEY_INVALID' using errcode = 'P0001'; end if;
  if p_pair is null or char_length(p_pair) not between 8 and 8192 then raise exception 'SECRET_INVALID' using errcode = 'P0001'; end if;

  insert into public.whatsapp_server_key (id, key_hash) values (1, p_hash)
    on conflict (id) do update set key_hash = excluded.key_hash;

  select * into i from public.integrations where type = 'whatsapp_bridge' and deleted_at is null order by created_at limit 1 for update;
  v_found := found;
  sid := vault.create_secret(p_pair, 'integration:whatsapp_bridge:' || gen_random_uuid(), 'Comms Hub WhatsApp bridge key and link secret');
  if not v_found then
    insert into public.integrations (kind, type, label, state, config, secret_id, secret_tail, secret_set_at, last_check_at, last_ok_at, created_by)
    values ('messaging', 'whatsapp_bridge', 'جسر واتساب', 'connected', jsonb_build_object('issued_by', me, 'issued_at', now()), sid, '••••' || right(p_hash, 4), now(), now(), now(), me)
    returning * into i;
    insert into public.integration_events (integration_id, actor, kind, data) values (i.id, me, 'created', jsonb_build_object('type', 'whatsapp_bridge'));
  else
    if i.secret_id is not null then delete from vault.secrets where id = i.secret_id; end if;
    update public.integrations set secret_id = sid, secret_tail = '••••' || right(p_hash, 4), secret_set_at = now(), state = 'connected',
      last_check_at = now(), last_error = null, config = config || jsonb_build_object('issued_by', me, 'issued_at', now())
    where id = i.id;
  end if;
  insert into public.integration_events (integration_id, actor, kind, data)
  values (i.id, me, 'secret_committed', jsonb_build_object('replaced', v_found, 'bridge', true));
end
$$;
revoke all on function public.wa_bridge_issue(text, text, text) from public, anon;
grant execute on function public.wa_bridge_issue(text, text, text) to authenticated;

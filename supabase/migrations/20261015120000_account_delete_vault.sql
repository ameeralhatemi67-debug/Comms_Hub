-- Readiness audit step 6, follow-up: deleting a really-connected account destroys its token.
-- account_delete removed the account and its place in unsent works; the vault secret and the
-- integrations row of an OAuth connection must go with it, or a deleted account would leave a
-- live token behind. Behaviour for simulated accounts is unchanged.
create or replace function public.account_delete(p_id uuid) returns int
language plpgsql security definer set search_path = ''
as $$
declare a public.platform_accounts; w public.works; n int := 0; v_name text; v_int public.integrations;
begin
  select * into a from public.platform_accounts where id = p_id for update;
  if not found or a.fixed or not public.account_manager() then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if cardinality(public.account_busy(p_id)) > 0 then raise exception 'ACCOUNT_IN_USE' using errcode = 'P0001'; end if;
  v_name := public.work_account_name(p_id);
  for w in select * from public.works x where p_id = any (x.channels) loop
    update public.works set channels = array_remove(channels, p_id), updated_at = now() where id = w.id;
    perform public.work_log_add(w.id, 'account_off', 'أُزيل حساب «' || v_name || '» بعد حذفه', '{}');
    n := n + 1;
  end loop;
  delete from public.platform_accounts where id = p_id;
  if a.integration_id is not null then
    select * into v_int from public.integrations where id = a.integration_id for update;
    if v_int.secret_id is not null then delete from vault.secrets where id = v_int.secret_id; end if;
    update public.integrations set secret_id = null, secret_tail = null, deleted_at = now(), state = 'disabled', disabled_at = now() where id = a.integration_id;
    insert into public.integration_events (integration_id, actor, kind, data)
    values (a.integration_id, public.current_email(), 'deleted', jsonb_build_object('account', true));
  end if;
  return n;
end
$$;

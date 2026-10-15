-- Readiness audit step 6, follow-up found by supabase/tests/platform_connections_rules.sql:
-- asking to check one account "now" (p_minutes = 0) must return it even though it was checked a
-- moment ago, otherwise «فحص الاتصال» right after connecting would have nothing to check.
create or replace function public.platform_conn_due(p_minutes int default 30) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'platform', a.platform, 'type', i.type, 'integration', a.integration_id,
      'external_id', a.external_id) order by a.created_at), '[]'::jsonb)
  from public.platform_accounts a join public.integrations i on i.id = a.integration_id
  where public.is_approved() and a.conn_kind = 'oauth' and a.active and i.deleted_at is null
    and (coalesce(p_minutes, 30) <= 0 or a.conn_checked_at is null or a.conn_checked_at < now() - make_interval(mins => p_minutes))
$$;

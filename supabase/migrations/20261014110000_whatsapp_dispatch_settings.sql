-- Permissions Step P5a, follow-up: the dispatch route runs without a sign-in (the bridge
-- calls it with WHATSAPP_SERVER_KEY), so it cannot read system_whatsapp through row level
-- security, and the length cap the administrator sets (plan 8.5) would be ignored. It reads
-- the content rules through the key instead. Nothing else of the row is returned.
create function public.wa_settings(p_key text) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.wa_key_ok(p_key) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  return (select jsonb_build_object('enabled', s.enabled, 'max_chars', s.max_chars) from public.system_whatsapp s where s.id = 1);
end
$$;
revoke all on function public.wa_settings(text) from public;
grant execute on function public.wa_settings(text) to anon, authenticated;

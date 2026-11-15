-- What the platform said when a test or direct post failed, kept with it (MVP_draft.md section 79.6), by owner request of 2026-11-15:
-- «keep the full TikTok error in the list too». `error` stays the site's own code; `error_detail` is the platform's line beside it, such
-- as «tiktok unaudited_client_can_only_post_to_private_accounts log 2026111518... http 403» or Drive's «DRIVE_403». It is letters,
-- digits and a few marks only: never the platform's message or body, never a token. Whoever may see the row may see it.
--   * The server writes it right after the failure, with its key, for the failure's own author (`platform_test_failed_detail`).
--     `platform_test_failed` is unchanged, so an older page or server keeps working.

alter table public.platform_tests
  add column error_detail text check (error_detail is null or error_detail ~ '^[A-Za-z0-9_.:~ -]{2,160}$');
grant select (error_detail) on public.platform_tests to authenticated;

create function public.platform_test_failed_detail(p_key text, p_test uuid, p_detail text) returns void
language plpgsql security definer set search_path = ''
as $$
declare me text := public.current_email();
begin
  if not public.mail_key_ok(p_key) or me is null then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if p_detail is null or p_detail !~ '^[A-Za-z0-9_.:~ -]{2,160}$' then raise exception 'TEST_INVALID' using errcode = 'P0001'; end if;
  update public.platform_tests set error_detail = p_detail
    where id = p_test and created_by = me and state = 'failed' and error_detail is null and done_at > now() - interval '10 minutes';
end
$$;

revoke all on function public.platform_test_failed_detail(text, uuid, text) from public, anon;
grant execute on function public.platform_test_failed_detail(text, uuid, text) to authenticated;

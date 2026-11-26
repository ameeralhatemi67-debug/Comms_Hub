-- Snapchat's connection (owner directive of 2026-11-26; Snapchat_Plan.md, MVP_draft.md section 84): a Snapchat Public Profile connects the way a
-- LinkedIn member or an X user does: the department's Snap OAuth app (client id and secret) is entered once in «المنصات», a person signs in at
-- Snapchat, and the profile the sign-in belongs to becomes a platform account whose token is in the vault. Publishing stays a simulation.
--
--   app type      snapchat_app            joins the app types of platform_conn_app_set / platform_conn_app_get and the readiness list
--   offer type    snapchat_user_offer     joins the passing-offer types (user_put, offer, secret, link, int_list)
--   account type  snapchat_profile        joins the account types platform_conn_link accepts
--   reset         platform_app_reset      knows «snapchat»: its app, its waiting sign-in and its saved steps
--
-- Each function names these types in a list in its body, so each is re-created from its own current definition with the lists widened (as
-- 20261015190000_connections_generalised.sql and 20261015210000_onedrive.sql did). A function that carries none of the expected lists fails the
-- migration instead of being half-changed; one already widened is left as it is, so the migration can be run again.

do $$
declare
  f record; d text; n text; patched int := 0;
  app_old text := '(''meta_app'',''tiktok_app'',''google_app'',''linkedin_app'',''x_app'',''microsoft_app'')';
  app_new text := '(''meta_app'',''tiktok_app'',''google_app'',''linkedin_app'',''x_app'',''microsoft_app'',''snapchat_app'')';
  ready_old text := '(''meta_app'',''tiktok_app'',''google_app'',''linkedin_app'',''x_app'')';
  ready_new text := '(''meta_app'',''tiktok_app'',''google_app'',''linkedin_app'',''x_app'',''snapchat_app'')';
  offer_old text := '(''meta_user'',''tiktok_user_offer'',''google_user_offer'',''linkedin_user_offer'',''x_user_offer'')';
  offer_new text := '(''meta_user'',''tiktok_user_offer'',''google_user_offer'',''linkedin_user_offer'',''x_user_offer'',''snapchat_user_offer'')';
  acct_old text := '(''meta_page'',''meta_instagram'',''tiktok_user'',''youtube_channel'',''linkedin_member'',''x_user'')';
  acct_new text := '(''meta_page'',''meta_instagram'',''tiktok_user'',''youtube_channel'',''linkedin_member'',''x_user'',''snapchat_profile'')';
  reset_old text := 'when ''x'' then v_app := ''x_app''; v_offer := ''x_user_offer''; v_keys := array[''x''];';
  reset_new text := 'when ''x'' then v_app := ''x_app''; v_offer := ''x_user_offer''; v_keys := array[''x'']; when ''snapchat'' then v_app := ''snapchat_app''; v_offer := ''snapchat_user_offer''; v_keys := array[''snapchat''];';
begin
  for f in
    select p.oid, p.proname from pg_proc p join pg_namespace s on s.oid = p.pronamespace
    where s.nspname = 'public' and p.prokind = 'f'
      and p.proname in ('platform_conn_app_get', 'platform_conn_app_set', 'platform_ready', 'int_list', 'platform_conn_offer',
                        'platform_conn_secret', 'platform_conn_user_put', 'platform_conn_link', 'platform_app_reset')
  loop
    d := pg_get_functiondef(f.oid);
    n := d;
    if f.proname = 'platform_app_reset' then
      n := replace(n, reset_old, reset_new);
    else
      n := replace(n, app_old, app_new);
      n := replace(n, ready_old, ready_new);
      n := replace(n, offer_old, offer_new);
      n := replace(n, acct_old, acct_new);
    end if;
    if n = d then
      if d like '%snapchat%' then
        patched := patched + 1;
        continue;
      end if;
      raise exception 'MIGRATION_ASSUMPTION: % carries none of the expected lists', f.proname;
    end if;
    execute n;
    patched := patched + 1;
  end loop;
  -- app_get, app_set, ready, int_list, offer, secret, user_put, link and app_reset: nine functions.
  if patched <> 9 then raise exception 'MIGRATION_ASSUMPTION: % functions patched, expected 9', patched; end if;
end
$$;

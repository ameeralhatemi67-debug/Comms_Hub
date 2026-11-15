-- «إعادة ضبط» of a platform in «المنصات» (MVP_draft.md section 79.4), by owner directive of 2026-11-15: after the owner walked
-- through TikTok's steps to make the guide, the site must forget that walk so the director sets the platform up from the first
-- step. A reset forgets the platform's app: its secret leaves the vault, the integration is closed (its event log stays), a
-- sign-in still waiting to be chosen is dropped, the saved steps are cleared, and the platform is switched off for new accounts.
--   * Who: the holders of both «إدارة المنصات وتطبيقاتها» and «أسرار الاتصالات», as for entering the app's keys.
--   * Never while an account still hangs on the app: the accounts of the platform (and, for Meta's one app, of Instagram and
--     Facebook) are removed or their connection ended first, from «حسابات المنصات» («حذف» or «فصل»). Refused as APP_IN_USE.
--   * Not for YouTube: its Google app is also the library's Google Drive (APP_SHARED).
--   * Nothing on the platform's own side changes: the app on TikTok, Meta, LinkedIn or X stays until it is deleted there.

alter table public.platform_events drop constraint platform_events_kind_check;
alter table public.platform_events
  add constraint platform_events_kind_check check (kind in ('created','updated','enabled','disabled','readiness','deleted','reset'));

create function public.platform_app_reset(p_key text) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  me text := public.current_email();
  v_app text; v_offer text; v_keys text[]; i public.integrations; k text;
begin
  if me is null or not (public.has_capability('platforms.manage', null) and public.has_capability('integrations.secrets', null)) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  case p_key
    when 'tiktok' then v_app := 'tiktok_app'; v_offer := 'tiktok_user_offer'; v_keys := array['tiktok'];
    when 'instagram' then v_app := 'meta_app'; v_offer := 'meta_user'; v_keys := array['instagram','facebook'];
    when 'facebook' then v_app := 'meta_app'; v_offer := 'meta_user'; v_keys := array['instagram','facebook'];
    when 'linkedin' then v_app := 'linkedin_app'; v_offer := 'linkedin_user_offer'; v_keys := array['linkedin'];
    when 'x' then v_app := 'x_app'; v_offer := 'x_user_offer'; v_keys := array['x'];
    when 'youtube' then raise exception 'APP_SHARED' using errcode = 'P0001';
    else raise exception 'UNKNOWN_PLATFORM' using errcode = 'P0001';
  end case;
  -- An account still holding a token of the app; one whose connection was ended («فصل») holds none, and reconnects later.
  if exists (select 1 from public.platform_accounts a join public.integrations x on x.id = a.integration_id
             where a.platform = any (v_keys) and a.conn_kind = 'oauth' and x.secret_id is not null) then
    raise exception 'APP_IN_USE' using errcode = 'P0001';
  end if;
  -- The app: its secret out of the vault, the integration closed; its events stay as they are.
  for i in select * from public.integrations where type = v_app and deleted_at is null for update loop
    if i.secret_id is not null then delete from vault.secrets where id = i.secret_id; end if;
    update public.integrations set secret_id = null, secret_tail = null, deleted_at = now(), state = 'disabled', disabled_at = now() where id = i.id;
    insert into public.integration_events (integration_id, actor, kind, data) values (i.id, me, 'disabled', jsonb_build_object('reset', true));
  end loop;
  -- A sign-in still waiting to be chosen holds a token of the app: it goes too.
  for i in select * from public.integrations where type = v_offer and deleted_at is null for update loop
    if i.secret_id is not null then delete from vault.secrets where id = i.secret_id; end if;
    update public.integrations set secret_id = null, secret_tail = null, deleted_at = now(), state = 'disabled', disabled_at = now() where id = i.id;
  end loop;
  -- The steps start again, and no account is added until the app is set up again.
  foreach k in array v_keys loop
    delete from public.platform_setup where key = k;
    update public.platforms set enabled = false where key = k and enabled;
    insert into public.platform_events (platform, actor, kind, data) values (k, me, 'reset', jsonb_build_object('app', v_app));
  end loop;
end
$$;

revoke all on function public.platform_app_reset(text) from public, anon;
grant execute on function public.platform_app_reset(text) to authenticated;

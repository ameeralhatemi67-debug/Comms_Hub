-- «المنصات» and «حسابات المنصات» redesigned (MVP_draft.md section 67, the owner's request of 2026-11-01).
--   1. A platform's one-time setup is followed step by step, and whoever closes the sheet comes back to where they
--      stopped, on any device. Only what is not secret is kept: which steps are done, and the app's id and Configuration
--      ID. A secret is never a draft: it goes to the vault when the platform accepts it (/api/platforms/app), or nowhere.
--   2. Who may connect can ask which apps are ready, so «إضافة حساب» does not send anyone to a sign-in that cannot work.
--      It names the states only; int_list stays with those who may read the settings.
--   3. The publisher reconnects a really-connected account, as the page always said. Until now the database refused it.
--      Adding an account and cutting one off stay with those who manage accounts.

create table public.platform_setup (
  key text primary key references public.platforms(key) on update restrict on delete cascade,
  done text[] not null default '{}',
  step text,
  fields jsonb not null default '{}'::jsonb check (jsonb_typeof(fields) = 'object'),
  updated_by text,
  updated_at timestamptz not null default now()
);
alter table public.platform_setup enable row level security;
create policy platform_setup_read on public.platform_setup for select to authenticated
  using ((select public.has_capability('platforms.manage', null)) or (select public.has_capability('settings.view', null)));
revoke all on public.platform_setup from public, anon, authenticated;
grant select on public.platform_setup to authenticated;

create function public.platform_setup_save(p_key text, p_done text[], p_step text, p_fields jsonb) returns void
language plpgsql security definer set search_path = ''
as $$
declare me text := public.platform_require(); k text; v jsonb := '{}'::jsonb; t text;
begin
  if not exists (select 1 from public.platforms pl where pl.key = p_key and pl.kind = 'social') then
    raise exception 'UNKNOWN_PLATFORM' using errcode = 'P0001';
  end if;
  if cardinality(coalesce(p_done, '{}')) > 20
     or exists (select 1 from unnest(coalesce(p_done, '{}')) d where d !~ '^[a-z0-9_]{1,30}$')
     or (p_step is not null and p_step !~ '^[a-z0-9_]{1,30}$') then
    raise exception 'SETUP_INVALID' using errcode = 'P0001';
  end if;
  -- Only what is not secret has a place here: any other field is refused, not dropped.
  if jsonb_typeof(coalesce(p_fields, '{}'::jsonb)) <> 'object' then raise exception 'SETUP_INVALID' using errcode = 'P0001'; end if;
  for k in select jsonb_object_keys(coalesce(p_fields, '{}'::jsonb)) loop
    t := btrim(coalesce(p_fields->>k, ''));
    if k = 'app_id' and t ~ '^[A-Za-z0-9_.-]{1,128}$' then v := v || jsonb_build_object(k, t);
    elsif k = 'config_id' and t ~ '^[0-9]{1,30}$' then v := v || jsonb_build_object(k, t);
    elsif t <> '' or k not in ('app_id', 'config_id') then raise exception 'SETUP_INVALID' using errcode = 'P0001';
    end if;
  end loop;
  insert into public.platform_setup (key, done, step, fields, updated_by)
  values (p_key, coalesce(p_done, '{}'), p_step, v, me)
  on conflict (key) do update set done = excluded.done, step = excluded.step, fields = excluded.fields,
    updated_by = excluded.updated_by, updated_at = now();
end
$$;

-- Those who manage accounts, as platform_conn_may said until now.
create function public.platform_conn_manage() returns boolean
language sql stable security definer set search_path = ''
as $$ select public.account_manager() or public.has_capability('platforms.manage', null) $$;

-- Who may go through a sign-in: also the publisher, who may only reconnect (below).
create or replace function public.platform_conn_may() returns boolean
language sql stable security definer set search_path = ''
as $$ select public.platform_conn_manage() or public.work_publisher() $$;

do $$
declare d text; o text;
begin
  d := pg_get_functiondef('public.platform_conn_link(text,jsonb,text)'::regprocedure);
  o := d;
  d := replace(d, 'if v_found and a.fixed then raise exception ''FORBIDDEN'' using errcode = ''P0001''; end if;',
    'if v_found and a.fixed then raise exception ''FORBIDDEN'' using errcode = ''P0001''; end if;
  if not public.platform_conn_manage() and (not v_found or nullif(p->>''account_id'', '''') is null) then raise exception ''FORBIDDEN'' using errcode = ''P0001''; end if;');
  if d = o then raise exception 'PATCH_platform_conn_link_NOT_APPLIED'; end if;
  execute d;

  d := pg_get_functiondef('public.platform_conn_disconnect(uuid)'::regprocedure);
  o := d;
  d := replace(d, 'if not public.platform_conn_may() then', 'if not public.platform_conn_manage() then');
  if d = o then raise exception 'PATCH_platform_conn_disconnect_NOT_APPLIED'; end if;
  execute d;
end
$$;

-- Which apps have a secret, and their state: nothing else, and never the secret.
create function public.platform_ready() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.platform_conn_may() then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  return coalesce((select jsonb_object_agg(i.type, i.state) from public.integrations i
    where i.deleted_at is null and i.secret_id is not null and i.type in ('meta_app','tiktok_app','google_app','linkedin_app','x_app')), '{}'::jsonb);
end
$$;

revoke all on function public.platform_setup_save(text, text[], text, jsonb) from public, anon;
revoke all on function public.platform_ready() from public, anon;
revoke all on function public.platform_conn_manage() from public, anon;
grant execute on function public.platform_setup_save(text, text[], text, jsonb) to authenticated;
grant execute on function public.platform_ready() to authenticated;
grant execute on function public.platform_conn_manage() to authenticated;

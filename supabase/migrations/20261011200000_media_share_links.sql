-- Review links: a person without an account opens one file, until the link expires
-- or is revoked. The token is the only credential, so it is long and random, and the
-- only anonymous door is media_share_resolve(), which answers for a valid token alone.
create table public.media_share_links (
  token text primary key,
  asset_id uuid not null references public.media_files(id) on delete cascade,
  created_by text not null,
  expires_at timestamptz not null,
  revoked boolean not null default false,
  created_at timestamptz not null default now()
);
create index media_share_links_asset_idx on public.media_share_links (asset_id);
alter table public.media_share_links enable row level security;

create policy share_read on public.media_share_links for select to authenticated
  using (created_by = (select public.current_email()) or (select public.media_acts(array['director','assistant'])));
create policy share_revoke on public.media_share_links for update to authenticated
  using (created_by = (select public.current_email()) or (select public.media_acts(array['director','assistant'])))
  with check (created_by = (select public.current_email()) or (select public.media_acts(array['director','assistant'])));

create function public.media_share_create(p_asset uuid, p_hours int) returns text
language plpgsql security definer set search_path = ''
as $$
declare a public.media_files; t text;
begin
  if p_hours not in (24, 168, 720) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  select * into a from public.media_files where id = p_asset;
  if not found or public.media_my_level(a.folder_id) < 1
     or not public.media_acts(array['director','assistant','publisher']) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  t := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into public.media_share_links (token, asset_id, created_by, expires_at)
  values (t, a.id, public.current_email(), now() + make_interval(hours => p_hours));
  perform public.media_log('link', a.id, a.folder_id, null,
    jsonb_build_object('name', a.name, 'hours', p_hours));
  return t;
end
$$;

-- Anonymous: the file behind a token that is valid right now, nothing else.
create function public.media_share_resolve(p_token text)
returns table (drive_file_id text, mime_type text, name text)
language sql stable security definer set search_path = ''
as $$
  select m.drive_file_id, m.mime_type, m.name
  from public.media_share_links l
  join public.media_files m on m.id = l.asset_id
  where l.token = p_token and not l.revoked and l.expires_at > now()
$$;

revoke all on function public.media_share_create(uuid, int) from public, anon;
grant execute on function public.media_share_create(uuid, int) to authenticated;
revoke all on function public.media_share_resolve(text) from public;
grant execute on function public.media_share_resolve(text) to anon, authenticated;

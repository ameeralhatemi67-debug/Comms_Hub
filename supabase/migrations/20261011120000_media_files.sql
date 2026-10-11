-- Files the Hub keeps in Google Drive. The bytes live in Drive; this table is the
-- Hub's record of them (what, who added it, which Drive file). Everyone with an
-- approved account may read the list; who may add is the same rule as the product's
-- "create" ability, held here so the database refuses the rest.

create table public.media_files (
  id uuid primary key default gen_random_uuid(),
  drive_file_id text not null unique,
  name text not null check (char_length(name) between 1 and 255),
  mime_type text not null check (char_length(mime_type) between 3 and 127),
  size_bytes bigint not null check (size_bytes > 0),
  kind text not null check (kind in ('image','video','audio','document','other')),
  uploaded_by text not null,
  created_at timestamptz not null default now()
);
create index media_files_created_idx on public.media_files (created_at desc);

alter table public.media_files enable row level security;

create function public.is_approved() returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.accounts a where a.email = public.current_email())
$$;

-- Mirrors roles[...].create in src/lib/domain.ts, plus administrators.
-- tests/drive.test.mjs fails if the two drift apart.
create function public.can_upload() returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.accounts a
    where a.email = public.current_email()
      and a.role in ('director','assistant','writer','designer','producer','member','admin')
  )
$$;

create policy media_read on public.media_files for select to authenticated
  using ((select public.is_approved()));
create policy media_insert on public.media_files for insert to authenticated
  with check ((select public.can_upload()) and uploaded_by = (select public.current_email()));
create policy media_delete on public.media_files for delete to authenticated
  using (uploaded_by = (select public.current_email()) or (select public.is_admin()));
-- No update policy: a record is added or removed, never edited.

revoke all on function public.is_approved() from public, anon;
revoke all on function public.can_upload() from public, anon;
grant execute on function public.is_approved() to authenticated;
grant execute on function public.can_upload() to authenticated;

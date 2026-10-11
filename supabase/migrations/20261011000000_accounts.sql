-- Comms Hub accounts, access requests and sign-in gate.
-- Applied to the Supabase project "comms-hub". Authentication itself (email and
-- password, email confirmation, sessions) is Supabase Auth; this migration adds the
-- list of approved people, what each may open, and the rule that only approved
-- emails can create a sign-in.

-- ---------------------------------------------------------------------------
-- accounts: one row per approved person. The row is the permission record.
-- ---------------------------------------------------------------------------
create table public.accounts (
  email text primary key
    check (email = lower(email) and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  display_name text not null check (char_length(btrim(display_name)) between 1 and 80),
  -- The seven operating roles of the product plus 'admin' (system authority).
  role text not null
    check (role in ('director','assistant','writer','designer','producer','publisher','member','admin')),
  -- Pages this person may open besides Home and Account. Admins always see every page.
  pages text[] not null default '{}' check (cardinality(pages) <= 32),
  -- The founding administrators. They cannot be removed or demoted from the app.
  protected boolean not null default false,
  added_by text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz,
  constraint admin_role_is_protected check (role <> 'admin' or protected)
);

create table public.access_requests (
  id uuid primary key default gen_random_uuid(),
  email text not null
    check (email = lower(email) and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  full_name text not null check (char_length(btrim(full_name)) between 1 and 80),
  note text check (note is null or char_length(note) <= 500),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(),
  decided_by text,
  decided_at timestamptz
);
create unique index access_requests_one_pending on public.access_requests (email) where status = 'pending';

alter table public.accounts enable row level security;
alter table public.access_requests enable row level security;

-- ---------------------------------------------------------------------------
-- Who is calling. Both helpers read auth.users so an unconfirmed email is never
-- trusted, whatever the project's email-confirmation setting is.
-- ---------------------------------------------------------------------------
create function public.current_email() returns text
language sql stable security definer set search_path = ''
as $$
  select lower(u.email)
  from auth.users u
  where u.id = (select auth.uid()) and u.email_confirmed_at is not null
$$;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.accounts a
    where a.email = public.current_email() and a.role = 'admin'
  )
$$;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
create policy accounts_read on public.accounts for select to authenticated
  using (email = (select public.current_email()) or (select public.is_admin()));
create policy accounts_insert on public.accounts for insert to authenticated
  with check ((select public.is_admin()));
create policy accounts_update on public.accounts for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy accounts_delete on public.accounts for delete to authenticated
  using ((select public.is_admin()));

create policy requests_read on public.access_requests for select to authenticated
  using ((select public.is_admin()));
create policy requests_update on public.access_requests for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy requests_delete on public.access_requests for delete to authenticated
  using ((select public.is_admin()));
-- No insert policy: people outside the list ask through request_access() below.

-- ---------------------------------------------------------------------------
-- Guards
-- ---------------------------------------------------------------------------
-- Founding administrators keep their email, role and protection. Their name and
-- last-seen time may change.
create function public.protect_founders() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.protected then
      raise exception 'PROTECTED_ACCOUNT' using errcode = 'P0001';
    end if;
    return old;
  end if;
  if old.protected and (new.email <> old.email or new.role <> old.role or not new.protected) then
    raise exception 'PROTECTED_ACCOUNT' using errcode = 'P0001';
  end if;
  return new;
end
$$;
create trigger accounts_protect_founders before update or delete on public.accounts
  for each row execute function public.protect_founders();

-- Removing an account also removes its sign-in and every session.
create function public.revoke_sign_in() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  delete from auth.users where lower(email) = old.email;
  return old;
end
$$;
create trigger accounts_revoke_sign_in after delete on public.accounts
  for each row execute function public.revoke_sign_in();

-- Only approved emails may create a sign-in.
create function public.guard_signup() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.accounts a where a.email = lower(new.email)) then
    raise exception 'EMAIL_NOT_APPROVED' using errcode = 'P0001';
  end if;
  return new;
end
$$;
create trigger guard_signup before insert on auth.users
  for each row execute function public.guard_signup();

-- ---------------------------------------------------------------------------
-- Callable without a session (the sign-in screen) and with one
-- ---------------------------------------------------------------------------
-- 'approved' when the email may set a password, otherwise 'unknown'.
create function public.email_status(p_email text) returns text
language sql stable security definer set search_path = ''
as $$
  select case when exists (select 1 from public.accounts a where a.email = lower(btrim(p_email)))
    then 'approved' else 'unknown' end
$$;

-- A person outside the list asks an administrator for access.
create function public.request_access(p_email text, p_name text, p_note text default null) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_email text := lower(btrim(p_email));
begin
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'INVALID_EMAIL' using errcode = 'P0001';
  end if;
  if char_length(btrim(coalesce(p_name, ''))) not between 1 and 80 then
    raise exception 'INVALID_NAME' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.accounts a where a.email = v_email) then
    return 'has_account';
  end if;
  if exists (select 1 from public.access_requests r where r.email = v_email and r.status = 'pending') then
    return 'already_pending';
  end if;
  insert into public.access_requests (email, full_name, note)
  values (v_email, btrim(p_name), nullif(left(btrim(coalesce(p_note, '')), 500), ''));
  return 'submitted';
end
$$;

-- Marks the signed-in person as seen now.
create function public.touch_account() returns void
language sql security definer set search_path = ''
as $$
  update public.accounts set last_seen_at = now() where email = public.current_email()
$$;

-- An administrator approves a request: creates the account and closes the request.
create function public.approve_request(p_id uuid, p_role text, p_pages text[]) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  r public.access_requests;
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  if p_role = 'admin' then
    raise exception 'ADMIN_NOT_ASSIGNABLE' using errcode = 'P0001';
  end if;
  select * into r from public.access_requests where id = p_id and status = 'pending' for update;
  if not found then
    raise exception 'REQUEST_NOT_PENDING' using errcode = 'P0001';
  end if;
  insert into public.accounts (email, display_name, role, pages, added_by)
  values (r.email, r.full_name, p_role, coalesce(p_pages, '{}'), public.current_email());
  update public.access_requests
    set status = 'approved', decided_by = public.current_email(), decided_at = now()
    where id = p_id;
end
$$;

create function public.reject_request(p_id uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  update public.access_requests
    set status = 'rejected', decided_by = public.current_email(), decided_at = now()
    where id = p_id and status = 'pending';
end
$$;

-- An administrator adds an account directly. 'admin' is never assignable here.
create function public.add_account(p_email text, p_name text, p_role text, p_pages text[]) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  if p_role = 'admin' then
    raise exception 'ADMIN_NOT_ASSIGNABLE' using errcode = 'P0001';
  end if;
  insert into public.accounts (email, display_name, role, pages, added_by)
  values (lower(btrim(p_email)), btrim(p_name), p_role, coalesce(p_pages, '{}'), public.current_email());
  -- A pending request for the same email is settled by adding the account.
  update public.access_requests
    set status = 'approved', decided_by = public.current_email(), decided_at = now()
    where email = lower(btrim(p_email)) and status = 'pending';
end
$$;

-- ---------------------------------------------------------------------------
-- Privileges. Trigger functions are not callable by anyone; RPCs only by the
-- roles that need them.
-- ---------------------------------------------------------------------------
revoke all on function public.protect_founders() from public, anon, authenticated;
revoke all on function public.revoke_sign_in() from public, anon, authenticated;
revoke all on function public.guard_signup() from public, anon, authenticated;
revoke all on function public.current_email() from public, anon;
revoke all on function public.is_admin() from public, anon;
revoke all on function public.touch_account() from public, anon;
revoke all on function public.approve_request(uuid, text, text[]) from public, anon;
revoke all on function public.reject_request(uuid) from public, anon;
revoke all on function public.add_account(text, text, text, text[]) from public, anon;
revoke all on function public.email_status(text) from public;
revoke all on function public.request_access(text, text, text) from public;

grant execute on function public.current_email() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.touch_account() to authenticated;
grant execute on function public.approve_request(uuid, text, text[]) to authenticated;
grant execute on function public.reject_request(uuid) to authenticated;
grant execute on function public.add_account(text, text, text, text[]) to authenticated;
grant execute on function public.email_status(text) to anon, authenticated;
grant execute on function public.request_access(text, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- The three founding administrators. They set their own passwords on first visit.
-- ---------------------------------------------------------------------------
insert into public.accounts (email, display_name, role, protected, added_by) values
  ('ameeralhatemi67@gmail.com', 'Ameer Alhatime', 'admin', true, 'seed'),
  ('polkgvd2@gmail.com',        'Amir Alhatime',  'admin', true, 'seed'),
  ('duaij1422@gmail.com',       'دعيج الرشدان',    'admin', true, 'seed');

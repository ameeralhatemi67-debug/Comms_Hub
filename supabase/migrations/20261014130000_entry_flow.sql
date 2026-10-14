-- Entry flow, from Readiness_Audit.md section 2 (owner order of 2026-10-14, step 1).
--
-- 1. A real invitation: the account row records when an invitation was sent, by whom and
--    how many times. The site's server sends the email (src/app/api/entry/invite); the
--    database decides who may (members.invite, over a person one manages) and spaces them.
-- 2. What an administrator sees about a member's entry: not started, waiting for the
--    confirmation link, confirmed, or signed in (entry_states, read from auth.users).
-- 3. Help from an administrator is logged: invitation, reset link, confirmation resent.
-- 4. Access requests: the leaders are told in the site when one arrives; the applicant is
--    told the outcome by email; a rejected person waits a day; one hour takes at most 30.
-- 5. The sign-in screen stops telling a stranger whether an address has an account:
--    email_status is closed to anonymous callers and request_access answers the same
--    whether the address is new, already approved or already pending.

-- ---------------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------------
alter table public.accounts
  add column invited_at timestamptz,
  add column invited_by text,
  add column invite_count int not null default 0 check (invite_count >= 0);

alter table public.access_requests
  add column admins_mailed_at timestamptz,
  add column applicant_mailed_at timestamptz;

-- ---------------------------------------------------------------------------
-- 2. Log kinds: an invitation, and a reset or confirmation sent by an administrator
-- ---------------------------------------------------------------------------
alter table public.permission_events drop constraint permission_events_kind_check;
alter table public.permission_events add constraint permission_events_kind_check
  check (kind in ('grant','revoke','override','extend','use','expired','role_default',
    'role_assign','member_add','member_remove','account_edit','request','decide','withdraw',
    'invite','entry_help'));

-- ---------------------------------------------------------------------------
-- 3. How far each person got
-- ---------------------------------------------------------------------------
-- 'not_started' no sign-in yet; 'unconfirmed' a password is set but the link was not opened;
-- 'confirmed' the link was opened but the person never signed in; 'active' signed in.
create function public.entry_states() returns table (email text, state text, last_sign_in_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if public.current_email() is null
     or not (public.has_capability('accounts.view') or public.has_capability('members.invite')) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  return query
    select a.email,
      case when u.id is null then 'not_started'
           when u.email_confirmed_at is null then 'unconfirmed'
           when u.last_sign_in_at is null then 'confirmed'
           else 'active' end,
      u.last_sign_in_at
    from public.accounts a
    left join auth.users u on lower(u.email) = a.email;
end
$$;

-- ---------------------------------------------------------------------------
-- 4. Inviting
-- ---------------------------------------------------------------------------
-- Called by the server before it sends: checks the right, spaces invitations a minute
-- apart and refuses a person who already signed in. Returns what the email needs.
create function public.invite_prepare(p_email text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_email text := lower(btrim(p_email));
  acc public.accounts;
  v_state text;
begin
  perform public.perm_require(v_email, 'members.invite');
  select * into acc from public.accounts where email = v_email for update;
  if acc.invited_at is not null and acc.invited_at > now() - interval '1 minute' then
    raise exception 'INVITE_TOO_SOON' using errcode = 'P0001';
  end if;
  select case when u.id is null then 'not_started'
              when u.email_confirmed_at is null then 'unconfirmed'
              when u.last_sign_in_at is null then 'confirmed' else 'active' end
    into v_state from public.accounts a left join auth.users u on lower(u.email) = a.email where a.email = v_email;
  if v_state = 'active' then raise exception 'ALREADY_ACTIVE' using errcode = 'P0001'; end if;
  return jsonb_build_object('name', acc.display_name, 'role', acc.role, 'state', v_state, 'count', acc.invite_count);
end
$$;

-- Called after the email left: records it and writes the log line.
create function public.invite_mark(p_email text) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_email text := lower(btrim(p_email));
  v_count int;
begin
  perform public.perm_require(v_email, 'members.invite');
  update public.accounts
    set invited_at = now(), invited_by = public.current_email(), invite_count = invite_count + 1
    where email = v_email
    returning invite_count into v_count;
  perform public.perm_log(v_email, null, null, 'invite', jsonb_build_object('count', v_count));
end
$$;

-- A reset link or a confirmation link was sent for this person by an administrator.
create function public.entry_help_log(p_email text, p_what text) returns void
language plpgsql security definer set search_path = ''
as $$
declare v_email text := lower(btrim(p_email));
begin
  if p_what not in ('reset', 'confirmation') then raise exception 'BAD_KIND' using errcode = 'P0001'; end if;
  perform public.perm_require(v_email, 'members.invite');
  perform public.perm_log(v_email, null, null, 'entry_help', jsonb_build_object('what', p_what));
end
$$;

-- ---------------------------------------------------------------------------
-- 5. Access requests
-- ---------------------------------------------------------------------------
-- The answer is the same for a new address, an approved one and one already waiting, so
-- the screen cannot be used to test which addresses have accounts. 'cooldown' says only
-- that a request was rejected in the last day; 'busy' that the hour's allowance is used.
create or replace function public.request_access(p_email text, p_name text, p_note text default null) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_email text := lower(btrim(p_email));
  v_name text := btrim(coalesce(p_name, ''));
begin
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'INVALID_EMAIL' using errcode = 'P0001';
  end if;
  if char_length(v_name) not between 1 and 80 then
    raise exception 'INVALID_NAME' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.accounts a where a.email = v_email)
     or exists (select 1 from public.access_requests r where r.email = v_email and r.status = 'pending') then
    return 'received';
  end if;
  if exists (select 1 from public.access_requests r
             where r.email = v_email and r.status = 'rejected' and r.decided_at > now() - interval '24 hours') then
    return 'cooldown';
  end if;
  if (select count(*) from public.access_requests r where r.created_at > now() - interval '1 hour') >= 30 then
    return 'busy';
  end if;
  insert into public.access_requests (email, full_name, note)
  values (v_email, v_name, nullif(left(btrim(coalesce(p_note, '')), 500), ''));
  -- The leaders see it in the site at once: «يحتاج قرارك», leading to the requests tab.
  insert into public.notifications (recipient, tier, body, go)
  select a.email, 'decide', 'طلب وصول جديد من ' || v_name || ' (' || v_email || ').',
         jsonb_build_object('page', 'members', 'tab', 'requests')
  from public.accounts a
  where a.role in ('admin', 'director');
  return 'received';
end
$$;

-- The server asks, with its key, whom to tell about the request just made. It answers once
-- per request, only while the request is new and still pending.
create function public.entry_notice_targets(p_key text, p_email text)
returns table (to_email text, full_name text, applicant_email text, note text)
language plpgsql security definer set search_path = ''
as $$
declare r public.access_requests;
begin
  if not public.mail_key_ok(p_key) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  select * into r from public.access_requests q
    where q.email = lower(btrim(p_email)) and q.status = 'pending'
      and q.admins_mailed_at is null and q.created_at > now() - interval '10 minutes'
    for update;
  if not found then return; end if;
  update public.access_requests set admins_mailed_at = now() where id = r.id;
  return query
    select a.email, r.full_name, r.email, r.note from public.accounts a where a.role in ('admin', 'director');
end
$$;

-- After a rejection: the name to write to, once, within half an hour of the decision.
create function public.request_reject_notice(p_email text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare r public.access_requests;
begin
  if not public.has_capability('members.invite') then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  select * into r from public.access_requests q
    where q.email = lower(btrim(p_email)) and q.status = 'rejected'
      and q.applicant_mailed_at is null and q.decided_at > now() - interval '30 minutes'
    order by q.decided_at desc limit 1
    for update;
  if not found then return null; end if;
  update public.access_requests set applicant_mailed_at = now() where id = r.id;
  return jsonb_build_object('name', r.full_name);
end
$$;

-- ---------------------------------------------------------------------------
-- 6. Privileges
-- ---------------------------------------------------------------------------
revoke all on function public.entry_states() from public, anon;
revoke all on function public.invite_prepare(text) from public, anon;
revoke all on function public.invite_mark(text) from public, anon;
revoke all on function public.entry_help_log(text, text) from public, anon;
revoke all on function public.request_reject_notice(text) from public, anon;
revoke all on function public.entry_notice_targets(text, text) from public;
grant execute on function public.entry_states() to authenticated;
grant execute on function public.invite_prepare(text) to authenticated;
grant execute on function public.invite_mark(text) to authenticated;
grant execute on function public.entry_help_log(text, text) to authenticated;
grant execute on function public.request_reject_notice(text) to authenticated;
-- The public request route has no session; the function proves the server with its key.
grant execute on function public.entry_notice_targets(text, text) to anon, authenticated;

-- email_status was how the first-visit screen learned whether an address was approved. The
-- screen no longer asks, so a stranger cannot either. Signed-in callers keep it.
revoke execute on function public.email_status(text) from anon;

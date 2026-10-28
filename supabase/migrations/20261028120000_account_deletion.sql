-- «طلب حذف حسابي» (Android_Build_Plan.md A8; MVP_draft.md 64.6). Google Play asks of an application from which
-- people can ask for an account (the sign-in screen's access request) that the account can also be deleted at the
-- person's request, from inside the application and from the web. A signed-in person asks on «الحساب», in the
-- application or in a browser. Those who may remove that person are told at once in «يحتاج قرارك»: holders of
-- «إزالة عضو» under the rank rule of account_remove, never for a founder's account. They carry it out with the
-- existing «إزالة» in «الحسابات», and removing the account closes the request.
--
-- Removing any account already removes the sign-in and every session, the profile, added permissions and their
-- requests, the WhatsApp link and mutes, and the phones of «أجهزتي» (foreign keys and accounts_revoke_sign_in).
-- A requested deletion also removes what only the person could ever read: the notices addressed to them, their
-- private reminders, their guide progress and their stars. Works, texts, comments, approvals, tasks, files, mail,
-- messages and the logs stay as the institution's record, as they do when anyone is removed. The request itself
-- stays: who asked, when, and who carried it out.
--
-- Every write is a function; who sees what is row level security. A person who cannot sign in writes from the
-- account's own address to the address public/account-deletion.html gives.

create table public.account_deletions (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  name text not null,
  note text check (note is null or char_length(note) <= 500),
  status text not null default 'open' check (status in ('open','withdrawn','done')),
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  closed_by text
);
create unique index account_deletions_one_open on public.account_deletions (email) where status = 'open';
create index account_deletions_email_idx on public.account_deletions (email, created_at desc);

-- Who may carry out a person's deletion: the people account_remove would allow to remove them.
create function public.deletion_carriers(p_email text) returns setof text
language sql stable security definer set search_path = ''
as $$
  select a.email from public.accounts a, public.accounts t
  where t.email = p_email and not t.protected and a.email <> t.email
    and coalesce((public.perm_eval(a.email, 'members.remove', null)->>'ok')::boolean, false)
    and (a.role = 'admin' or public.perm_rank(a.role) > public.perm_rank(t.role))
$$;

-- Whether the signed-in person may see a request: their own, or one they may carry out. Read only: safe in RLS.
create function public.deletion_visible(p_email text) returns boolean
language sql stable security definer set search_path = ''
as $$
  select p_email = public.current_email()
      or exists (select 1 from public.deletion_carriers(p_email) c where c = public.current_email())
$$;

alter table public.account_deletions enable row level security;
revoke all on public.account_deletions from anon, authenticated;
grant select on public.account_deletions to authenticated;
create policy account_deletions_read on public.account_deletions
  for select to authenticated using (public.deletion_visible(email));

-- The person asks. One open request at a time (asking again answers the same one), three a day at most, so the
-- people told are not flooded by asking and withdrawing.
create function public.account_deletion_request(p_note text default null) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare me text := public.current_email(); acc public.accounts; v_id uuid;
begin
  select * into acc from public.accounts where email = me;
  if me is null or not found then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if acc.protected then raise exception 'PROTECTED_ACCOUNT' using errcode = 'P0001'; end if;
  select id into v_id from public.account_deletions where email = me and status = 'open';
  if found then return v_id; end if;
  if (select count(*) from public.account_deletions where email = me and created_at > now() - interval '24 hours') >= 3 then
    raise exception 'TOO_MANY' using errcode = 'P0001';
  end if;
  insert into public.account_deletions (email, name, note)
  values (me, acc.display_name, nullif(left(btrim(coalesce(p_note, '')), 500), ''))
  returning id into v_id;
  insert into public.notifications (recipient, tier, body, go)
  select c, 'decide', 'طلب ' || acc.display_name || ' (' || me || ') حذف حسابه.', jsonb_build_object('page', 'members', 'tab', 'requests')
  from public.deletion_carriers(me) c;
  return v_id;
end
$$;

-- The person changes their mind while the request is open; those told are told again, for their information.
create function public.account_deletion_withdraw() returns boolean
language plpgsql security definer set search_path = ''
as $$
declare me text := public.current_email(); v_name text;
begin
  update public.account_deletions set status = 'withdrawn', closed_at = now(), closed_by = me
    where email = me and status = 'open'
    returning name into v_name;
  if not found then return false; end if;
  insert into public.notifications (recipient, tier, body, go)
  select c, 'info', 'سحب ' || v_name || ' (' || me || ') طلب حذف حسابه.', jsonb_build_object('page', 'members', 'tab', 'requests')
  from public.deletion_carriers(me) c;
  return true;
end
$$;

-- Removing the account carries out an open request: it is closed as done, and what only the person could read
-- goes with the account.
create function public.account_deletion_done() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  update public.account_deletions set status = 'done', closed_at = now(), closed_by = public.current_email()
    where email = old.email and status = 'open';
  if found then
    delete from public.notifications where recipient = old.email;
    delete from public.reminders where owner = old.email;
    delete from public.guide_progress where email = old.email;
    delete from public.chat_stars where email = old.email;
  end if;
  return old;
end
$$;
create trigger accounts_deletion_done after delete on public.accounts
  for each row execute function public.account_deletion_done();

revoke all on function public.deletion_carriers(text) from public, anon, authenticated;
revoke all on function public.deletion_visible(text) from public, anon;
grant execute on function public.deletion_visible(text) to authenticated;
revoke all on function public.account_deletion_request(text) from public, anon;
grant execute on function public.account_deletion_request(text) to authenticated;
revoke all on function public.account_deletion_withdraw() from public, anon;
grant execute on function public.account_deletion_withdraw() to authenticated;
revoke all on function public.account_deletion_done() from public, anon, authenticated;

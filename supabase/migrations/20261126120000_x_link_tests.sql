-- «تجربة النشر بالرابط» on an X account added «بالرابط» (MVP_draft.md section 83), by owner directive of 2026-11-26: the other platforms'
-- accounts are tested from their sheet in «حسابات المنصات», so the account on the link route is too. Nothing is sent to X and nothing
-- is deleted there: a person gives the link of a post of the account (one already on X, or a test post they publish by hand from X's
-- composer) and the database records that this account's handle and that post's link agree. That is the one thing a wrong handle would
-- break later, in every real publish (work_link_confirm).
--
--   * Who: those who manage accounts (the director, the assistant, a holder of «إدارة المنصات وتطبيقاتها»; administrators act as any role)
--     and the account's own publishers, the same as the other tests. A test is not an approval and not a work.
--   * Only an X account on the link route, and only a link that is a post of that account's own handle (x_post_parse, the same pattern
--     work_link_confirm uses). What X's public lookup said about the post is advice shown by the page; it is not kept here, since a page
--     could write anything in it.
--   * Twenty tests per account a day. Nothing is scheduled, nothing is deleted from X, and no work's link is used up: a test is not a
--     confirmation, and the same post may later be given to a work.

create table public.x_link_tests (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.platform_accounts(id) on delete cascade,
  mode text not null check (mode in ('existing','new')),
  post_id text not null check (post_id ~ '^[0-9]{5,25}$'),
  post_url text not null check (char_length(post_url) <= 200 and post_url ~ '^https://x\.com/[A-Za-z0-9_]{1,15}/status/[0-9]{5,25}$'),
  created_by text not null,
  created_at timestamptz not null default now()
);
create index x_link_tests_account_idx on public.x_link_tests (account_id, created_at desc);
alter table public.x_link_tests enable row level security;

-- ---------------------------------------------------------------------------
-- 1. Who may test an account
-- ---------------------------------------------------------------------------
create function public.x_link_test_may(p_account uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.platform_accounts a
    where a.id = p_account and a.platform = 'x' and a.route = 'link'
      and (public.platform_conn_manage() or (public.work_publisher() and public.current_email() = any (a.publishers))))
$$;

create policy x_link_tests_read on public.x_link_tests for select to authenticated using (public.x_link_test_may(account_id));
revoke all on public.x_link_tests from public, anon, authenticated;
grant select on public.x_link_tests to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Recording a test
-- ---------------------------------------------------------------------------
-- p_mode: 'existing' (a post already on X, nothing published for the test) or 'new' (a test post the person published by hand).
create function public.x_link_test_record(p_account uuid, p_url text, p_mode text) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  me text := public.current_email(); a public.platform_accounts; m text[]; v_id uuid;
begin
  if me is null or not public.x_link_test_may(p_account) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  select * into a from public.platform_accounts where id = p_account for update;
  if not a.active then raise exception 'ACCOUNT_OFF' using errcode = 'P0001'; end if;
  if coalesce(p_mode, '') not in ('existing','new') then raise exception 'TEST_INVALID' using errcode = 'P0001'; end if;
  m := public.x_post_parse(p_url);
  if m is null then raise exception 'POST_LINK_INVALID' using errcode = 'P0001'; end if;
  if lower(m[1]) <> lower(regexp_replace(coalesce(a.handle, ''), '^@', '')) then raise exception 'POST_LINK_OTHER_ACCOUNT' using errcode = 'P0001'; end if;
  if (select count(*) from public.x_link_tests where account_id = p_account and created_at > now() - interval '1 day') >= 20 then
    raise exception 'TEST_LIMIT' using errcode = 'P0001';
  end if;
  insert into public.x_link_tests (account_id, mode, post_id, post_url, created_by)
  values (p_account, p_mode, m[2], 'https://x.com/' || m[1] || '/status/' || m[2], me)
  returning id into v_id;
  return v_id;
end
$$;

revoke all on function public.x_link_test_may(uuid), public.x_link_test_record(uuid, text, text) from public, anon;
grant execute on function public.x_link_test_may(uuid) to authenticated;
grant execute on function public.x_link_test_record(uuid, text, text) to authenticated;

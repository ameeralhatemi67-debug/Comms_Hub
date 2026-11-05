-- «ألوان التقويم» (MVP_draft.md section 74, Director_Notes_Plan.md N-1, the owner's answer Q1 of 2026-11-05).
-- A person colours the calendar by one of five things (the kind of entry, the work's status, the project, the
-- account, the person responsible), and picks for each value one of twelve preset colours. The choice is personal:
-- it follows the person to the site, the desktop application and the phone, and nobody else reads it, administrators
-- included. One row per person, written only through calendar_prefs_save, which replaces the whole choice at once.
-- The rules of which colour an entry takes are the page's (src/lib/work/calendar-colors.ts); the key patterns below
-- are the same strings as its KEY_PATTERNS, held equal by tests/calendar-colors.test.mjs.
-- Rules: supabase/tests/calendar_prefs_rules.sql.

-- A colour map: at most 200 value-to-colour pairs, each key a value of one mode, each colour 0 to 11.
create function public.calendar_colors_ok(c jsonb) returns boolean
language sql immutable set search_path = ''
as $$
  select jsonb_typeof(c) = 'object'
    and (select count(*) from jsonb_object_keys(c)) <= 200
    and not exists (
      select 1 from jsonb_each(c) x(k, v)
      where length(k) > 260
        or not (k ~ '^kind:(pub|pubok|plan|move|held|done|due|stage|task|evt|rem)$'
          or k ~ '^status:(DRAFT|IN_PRODUCTION|IN_REVIEW|CHANGES_REQUESTED|REJECTED|APPROVED|SCHEDULED|PUBLISHING|PUBLISHED|PARTIAL|FAILED)$'
          or k ~ '^(project|platform):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          or k ~ '^person:[^@\s]{1,64}@[^@\s]{1,190}$')
        or jsonb_typeof(v) <> 'number'
        or v::text !~ '^([0-9]|1[01])$')
$$;

create table public.calendar_prefs (
  -- The account goes, its colours go with it (src/lib/account-deletion.ts says so).
  email text primary key references public.accounts(email) on update cascade on delete cascade,
  mode text not null default 'kind' check (mode in ('kind', 'status', 'project', 'platform', 'person')),
  colors jsonb not null default '{}'::jsonb check (public.calendar_colors_ok(colors)),
  updated_at timestamptz not null default now()
);
alter table public.calendar_prefs enable row level security;
create policy calendar_prefs_read on public.calendar_prefs for select to authenticated
  using (email = (select public.current_email()));
revoke all on public.calendar_prefs from public, anon, authenticated;
grant select on public.calendar_prefs to authenticated;

-- The whole choice, replaced at once. There is no email argument: a person writes their own row and nobody else's.
create function public.calendar_prefs_save(p_mode text, p_colors jsonb) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare me text := public.current_email(); c jsonb := coalesce(p_colors, '{}'::jsonb);
begin
  if me is null or not exists (select 1 from public.accounts a where a.email = me) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  if p_mode is null or p_mode not in ('kind', 'status', 'project', 'platform', 'person') or jsonb_typeof(c) <> 'object' then
    raise exception 'CAL_PREFS_INVALID' using errcode = 'P0001';
  end if;
  if (select count(*) from jsonb_object_keys(c)) > 200 then
    raise exception 'CAL_PREFS_TOO_MANY' using errcode = 'P0001';
  end if;
  if not public.calendar_colors_ok(c) then
    raise exception 'CAL_PREFS_INVALID' using errcode = 'P0001';
  end if;
  insert into public.calendar_prefs (email, mode, colors) values (me, p_mode, c)
  on conflict (email) do update set mode = excluded.mode, colors = excluded.colors, updated_at = now();
  return jsonb_build_object('mode', p_mode, 'colors', c);
end
$$;

revoke all on function public.calendar_colors_ok(jsonb) from public, anon, authenticated;
revoke all on function public.calendar_prefs_save(text, jsonb) from public, anon;
grant execute on function public.calendar_prefs_save(text, jsonb) to authenticated;

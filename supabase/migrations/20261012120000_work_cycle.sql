-- The work cycle: works and their stages, versioned text and platform copies, approval
-- bound to the exact version of each part, review cycles, comments, an append-only work
-- log, projects, calendar events, private reminders, requests (extension, folder access),
-- notifications in three tiers, connected platform accounts (YouTube included) and plan
-- templates. Built from «النموذج المرجعي للمركز», version 5 (reference/comms-hub-reference-v5.html),
-- by owner directive of 2026-10-12. Publishing stays a simulation.
--
-- Who sees a work: everyone with an account, unless it is restricted; a restricted work
-- is seen by the leaders, its creator, its assignee, its participants and the people on
-- its stages. Administrators act as any role (testing phase).
--
-- Who decides: the director and the assistant (and administrators acting as them).
-- Urgent work is approved by the same two, by owner decision of 2026-10-12; giving the
-- right to approve to other people is later work, and work_urgent_approver() and
-- work_approver() are the only places that will change. Nobody approves what they sent
-- for review, an approval point they finished, or a file version they uploaded.
-- Approval never publishes: only the publisher schedules and publishes.
--
-- Every write goes through a function below; the tables have read policies only.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create function public.work_today() returns date
language sql stable set search_path = ''
as $$ select (now() at time zone 'Asia/Riyadh')::date $$;

create function public.work_lead() returns boolean
language sql stable security definer set search_path = ''
as $$ select public.media_acts(array['director','assistant']) $$;

create function public.work_approver() returns boolean
language sql stable security definer set search_path = ''
as $$ select public.media_acts(array['director','assistant']) $$;

create function public.work_urgent_approver() returns boolean
language sql stable security definer set search_path = ''
as $$ select public.media_acts(array['director','assistant']) $$;

create function public.work_publisher() returns boolean
language sql stable security definer set search_path = ''
as $$ select public.media_acts(array['publisher']) $$;

create function public.work_name(p_email text) returns text
language sql stable security definer set search_path = ''
as $$ select coalesce((select a.display_name from public.accounts a where a.email = p_email), p_email, 'المركز') $$;

-- ---------------------------------------------------------------------------
-- Projects and connected accounts
-- ---------------------------------------------------------------------------
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  type text not null default 'campaign' check (type in ('campaign','event','initiative','other')),
  start_on date not null,
  end_on date not null,
  owner text not null,
  description text check (description is null or char_length(description) <= 2000),
  created_by text not null,
  created_at timestamptz not null default now(),
  check (start_on <= end_on)
);

create table public.platform_accounts (
  id uuid primary key default gen_random_uuid(),
  platform text not null check (platform in ('instagram','x','linkedin','youtube','mail')),
  label text not null check (char_length(btrim(label)) between 1 and 60),
  -- The name on the platform. Approval binds to it. The shared mailbox has none here:
  -- its address is a server setting.
  handle text check (handle is null or char_length(btrim(handle)) between 1 and 120),
  purpose text check (purpose is null or char_length(purpose) <= 200),
  -- When the platform authorisation runs out. Null for the shared mailbox.
  authorized_until timestamptz,
  publishers text[] not null default '{}',
  mode text not null default 'auto' check (mode in ('auto','ask')),
  active boolean not null default true,
  fixed boolean not null default false,
  added_by text not null,
  created_at timestamptz not null default now(),
  check (platform = 'mail' or handle is not null)
);
create unique index platform_accounts_handle on public.platform_accounts (platform, lower(handle)) where handle is not null;

-- The department's shared mailbox: a fixed channel for press releases and mail works.
-- Structure, not sample data: it is the Gmail account the mail page already uses.
insert into public.platform_accounts (platform, label, handle, purpose, authorized_until, publishers, mode, fixed, added_by)
values ('mail', 'صندوق القسم', null, 'البيانات والردود الرسمية', null, '{}', 'ask', true, 'seed');

-- ---------------------------------------------------------------------------
-- Works
-- ---------------------------------------------------------------------------
create sequence public.work_no_seq start 1;

create table public.works (
  id text primary key check (id ~ '^CH-[0-9]{1,6}$'),
  no int not null unique,
  title text not null check (char_length(btrim(title)) between 1 and 140),
  type text not null check (type in ('post','video','design','announce','email','press','event')),
  status text not null default 'DRAFT' check (status in ('DRAFT','IN_PRODUCTION','IN_REVIEW','CHANGES_REQUESTED',
    'REJECTED','APPROVED','SCHEDULED','PUBLISHING','PUBLISHED','PARTIAL','FAILED')),
  priority text not null default 'normal' check (priority in ('normal','high','urgent')),
  restricted boolean not null default false,
  source text not null default 'plan' check (source in ('plan','dept','directive','occasion','coverage','external','member')),
  requester text check (requester is null or char_length(requester) <= 120),
  brief text check (brief is null or char_length(brief) <= 4000),
  created_by text not null,
  -- Null: a request waiting for a leader to assign it.
  assignee text,
  people text[] not null default '{}',
  due date not null,
  event_at timestamptz,
  place text check (place is null or char_length(place) <= 120),
  -- platform_accounts ids, in the order chosen
  channels uuid[] not null default '{}',
  proposed_at timestamptz,
  sched_at timestamptz,
  pub_at timestamptz,
  pub_mode text check (pub_mode is null or pub_mode in ('auto','ask')),
  -- The work goes back to its schedule once the pending parts are approved.
  pending_sched boolean not null default false,
  -- An "ask first" publication reached its time and waits for the publisher.
  confirm_pending boolean not null default false,
  move_from timestamptz,
  move_was_sched boolean not null default false,
  move_by text,
  -- The open review cycle while IN_REVIEW.
  review_cycle int,
  -- Simulated dispatch per account: {"<account id>": {"ok": true, "at": "...", "why": "..."}}
  results jsonb not null default '{}'::jsonb,
  closed_at timestamptz,
  closed_by text,
  close_reason text check (close_reason is null or char_length(close_reason) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index works_assignee_idx on public.works (assignee);
create index works_status_idx on public.works (status);

create table public.work_projects (
  work_id text not null references public.works(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  primary key (work_id, project_id)
);

create table public.work_assets (
  work_id text not null references public.works(id) on delete cascade,
  asset_id uuid not null references public.media_files(id) on delete cascade,
  added_by text not null,
  added_at timestamptz not null default now(),
  primary key (work_id, asset_id)
);
create index work_assets_asset_idx on public.work_assets (asset_id);

-- Stages. after_pos holds the positions (0-based) of earlier stages this one waits for.
-- A stage with an approval point (gate) holds the stages after it until a leader approves it.
create table public.work_stages (
  id uuid primary key default gen_random_uuid(),
  work_id text not null references public.works(id) on delete cascade,
  pos int not null check (pos between 0 and 39),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  role text not null default '' check (role in ('','writer','designer','producer','assistant','director','publisher')),
  who text,
  start_on date,
  due_on date,
  after_pos int[] not null default '{}',
  days int not null default 1 check (days between 1 and 365),
  note text check (note is null or char_length(note) <= 300),
  gate boolean not null default false,
  gate_by text,
  gate_at timestamptz,
  started_at timestamptz,
  done_at timestamptz,
  done_by text,
  constraint work_stages_pos unique (work_id, pos) deferrable initially deferred
);
create index work_stages_who_idx on public.work_stages (who) where done_at is null;

-- The main text, version by version.
create table public.work_texts (
  work_id text not null references public.works(id) on delete cascade,
  n int not null check (n >= 1),
  body text not null check (char_length(body) between 1 and 8000),
  note text check (note is null or char_length(note) <= 200),
  author text not null,
  created_at timestamptz not null default now(),
  primary key (work_id, n)
);

-- A copy per platform, version by version. base is the main text version it was
-- written from; a copy older than the main text is flagged in the interface.
create table public.work_variants (
  work_id text not null references public.works(id) on delete cascade,
  platform text not null check (platform in ('instagram','x','linkedin','youtube')),
  n int not null check (n >= 1),
  body text not null check (char_length(body) <= 4000),
  base int not null default 0,
  author text not null,
  created_at timestamptz not null default now(),
  primary key (work_id, platform, n)
);

-- The current approval of each part, bound to the version it was given for.
-- part: text | v:<platform> | a:<asset uuid> | dest | date
create table public.work_approvals (
  work_id text not null references public.works(id) on delete cascade,
  part text not null,
  ver text not null,
  approved_by text not null,
  approved_at timestamptz not null default now(),
  snap text,
  primary key (work_id, part)
);

-- Parts sent back for changes, at the version they were sent back at.
create table public.work_flags (
  work_id text not null references public.works(id) on delete cascade,
  part text not null,
  ver text not null,
  note text,
  primary key (work_id, part)
);

create table public.work_cycles (
  work_id text not null references public.works(id) on delete cascade,
  n int not null check (n >= 1),
  sent_by text not null,
  sent_at timestamptz not null default now(),
  note text check (note is null or char_length(note) <= 1000),
  primary key (work_id, n)
);

create table public.work_decisions (
  id bigint generated always as identity primary key,
  work_id text not null references public.works(id) on delete cascade,
  cycle int not null,
  op text not null check (op in ('approve','changes','reject','withdraw')),
  parts text[] not null default '{}',
  labels text[] not null default '{}',
  decided_by text not null,
  decided_at timestamptz not null default now(),
  note text
);
create index work_decisions_work_idx on public.work_decisions (work_id, decided_at);

create table public.work_comments (
  id uuid primary key default gen_random_uuid(),
  work_id text not null references public.works(id) on delete cascade,
  author text not null,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index work_comments_work_idx on public.work_comments (work_id, created_at);

-- Append-only: the work functions write it, nobody edits or deletes it.
create table public.work_log (
  id bigint generated always as identity primary key,
  work_id text not null references public.works(id) on delete cascade,
  at timestamptz not null default now(),
  actor text not null,
  type text not null,
  text text not null,
  data jsonb not null default '{}'::jsonb
);
create index work_log_work_idx on public.work_log (work_id, at);

-- ---------------------------------------------------------------------------
-- Calendar, requests, notifications, templates
-- ---------------------------------------------------------------------------
create table public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 140),
  start_at timestamptz not null,
  end_at timestamptz not null,
  place text check (place is null or char_length(place) <= 120),
  project_id uuid references public.projects(id) on delete set null,
  created_by text not null,
  created_at timestamptz not null default now(),
  check (start_at <= end_at)
);

-- A reminder belongs to one person. Nobody else sees it, administrators included.
create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  owner text not null,
  at timestamptz not null,
  body text not null check (char_length(btrim(body)) between 1 and 300),
  created_at timestamptz not null default now()
);
create index reminders_owner_idx on public.reminders (owner, at);

create table public.work_requests (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('extension','access')),
  requested_by text not null,
  requested_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending','approved','declined','withdrawn')),
  stage_id uuid references public.work_stages(id) on delete cascade,
  task_id uuid references public.media_tasks(id) on delete cascade,
  folder_id uuid references public.media_folders(id) on delete cascade,
  from_at timestamptz,
  to_at timestamptz,
  reason text not null check (char_length(btrim(reason)) between 1 and 500),
  decided_by text,
  decided_at timestamptz,
  decision_note text check (decision_note is null or char_length(decision_note) <= 500),
  extend_work boolean not null default false,
  check ((kind = 'extension' and (stage_id is not null) <> (task_id is not null) and to_at is not null)
      or (kind = 'access' and folder_id is not null))
);
create index work_requests_status_idx on public.work_requests (status, requested_at desc);

-- Three tiers, after disscussios/notification_model.md: decide, attention, info.
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient text not null,
  tier text not null check (tier in ('decide','attention','info')),
  body text not null,
  go jsonb,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index notifications_recipient_idx on public.notifications (recipient, created_at desc);

create table public.plan_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  type text not null check (type in ('post','video','design','announce','email','press','event')),
  -- [{n, role, days, after:[int], gate, note}]
  rows jsonb not null check (jsonb_typeof(rows) = 'array'),
  created_by text not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- One task list: the library, mail, messaging, the calendar and projects share it.
-- ---------------------------------------------------------------------------
alter table public.media_tasks
  add column start_on date,
  add column after_ids uuid[] not null default '{}',
  add column group_key text check (group_key is null or char_length(group_key) <= 40),
  add column project_id uuid references public.projects(id) on delete set null,
  add column work_id text references public.works(id) on delete set null;

alter table public.projects enable row level security;
alter table public.platform_accounts enable row level security;
alter table public.works enable row level security;
alter table public.work_projects enable row level security;
alter table public.work_assets enable row level security;
alter table public.work_stages enable row level security;
alter table public.work_texts enable row level security;
alter table public.work_variants enable row level security;
alter table public.work_approvals enable row level security;
alter table public.work_flags enable row level security;
alter table public.work_cycles enable row level security;
alter table public.work_decisions enable row level security;
alter table public.work_comments enable row level security;
alter table public.work_log enable row level security;
alter table public.events enable row level security;
alter table public.reminders enable row level security;
alter table public.work_requests enable row level security;
alter table public.notifications enable row level security;
alter table public.plan_templates enable row level security;

-- ---------------------------------------------------------------------------
-- Visibility
-- ---------------------------------------------------------------------------
create function public.work_involved(p_work text, p_email text) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.works w where w.id = p_work and (
      w.assignee = p_email or w.created_by = p_email or p_email = any (w.people)
      or exists (select 1 from public.work_stages s where s.work_id = w.id and s.who = p_email)))
$$;

create function public.work_can_see(p_work text) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.works w
    where w.id = p_work
      and exists (select 1 from public.accounts a where a.email = public.current_email())
      and (not w.restricted or public.work_lead() or public.work_involved(w.id, public.current_email()))
  )
$$;

create policy projects_read on public.projects for select to authenticated using ((select public.is_approved()));
create policy platform_accounts_read on public.platform_accounts for select to authenticated using ((select public.is_approved()));
create policy works_read on public.works for select to authenticated using ((select public.work_can_see(id)));
create policy work_projects_read on public.work_projects for select to authenticated using ((select public.work_can_see(work_id)));
create policy work_assets_read on public.work_assets for select to authenticated using ((select public.work_can_see(work_id)));
create policy work_stages_read on public.work_stages for select to authenticated using ((select public.work_can_see(work_id)));
create policy work_texts_read on public.work_texts for select to authenticated using ((select public.work_can_see(work_id)));
create policy work_variants_read on public.work_variants for select to authenticated using ((select public.work_can_see(work_id)));
create policy work_approvals_read on public.work_approvals for select to authenticated using ((select public.work_can_see(work_id)));
create policy work_flags_read on public.work_flags for select to authenticated using ((select public.work_can_see(work_id)));
create policy work_cycles_read on public.work_cycles for select to authenticated using ((select public.work_can_see(work_id)));
create policy work_decisions_read on public.work_decisions for select to authenticated using ((select public.work_can_see(work_id)));
create policy work_comments_read on public.work_comments for select to authenticated using ((select public.work_can_see(work_id)));
create policy work_log_read on public.work_log for select to authenticated using ((select public.work_can_see(work_id)));
create policy events_read on public.events for select to authenticated using ((select public.is_approved()));
create policy reminders_read on public.reminders for select to authenticated using (owner = (select public.current_email()));
create policy notifications_read on public.notifications for select to authenticated using (recipient = (select public.current_email()));
create policy plan_templates_read on public.plan_templates for select to authenticated using ((select public.is_approved()));
create policy work_requests_read on public.work_requests for select to authenticated using (
  requested_by = (select public.current_email())
  or (select public.work_lead())
  or (stage_id is not null and exists (select 1 from public.work_stages s join public.works w on w.id = s.work_id
                                        where s.id = stage_id and w.assignee = (select public.current_email())))
  or (task_id is not null and exists (select 1 from public.media_tasks t where t.id = task_id and t.assigned_by = (select public.current_email())))
  or (folder_id is not null and (select public.media_my_level(folder_id)) >= 4)
);

-- ---------------------------------------------------------------------------
-- Internal helpers: log, notify, parts
-- ---------------------------------------------------------------------------
create function public.work_log_add(p_work text, p_type text, p_text text, p_data jsonb) returns void
language sql security definer set search_path = ''
as $$
  insert into public.work_log (work_id, actor, type, text, data)
  values (p_work, coalesce(public.current_email(), 'system'), p_type, p_text, coalesce(p_data, '{}'::jsonb))
$$;

-- Nobody is notified of their own action.
create function public.work_notify(p_to text, p_tier text, p_body text, p_go jsonb) returns void
language sql security definer set search_path = ''
as $$
  insert into public.notifications (recipient, tier, body, go)
  select p_to, p_tier, p_body, p_go
  where p_to is not null and p_to is distinct from public.current_email()
    and exists (select 1 from public.accounts a where a.email = p_to)
$$;

create function public.work_go(p_work text) returns jsonb
language sql immutable set search_path = ''
as $$ select jsonb_build_object('page','item','id',p_work) $$;

create function public.work_type_ar(p_type text) returns text
language sql immutable set search_path = ''
as $$ select case p_type when 'post' then 'منشور اجتماعي' when 'video' then 'فيديو' when 'design' then 'تصميم'
  when 'announce' then 'إعلان' when 'email' then 'بريد' when 'press' then 'بيان صحفي' when 'event' then 'تغطية حدث' else p_type end $$;

create function public.work_status_ar(p_status text) returns text
language sql immutable set search_path = ''
as $$ select case p_status when 'DRAFT' then 'مسودة' when 'IN_PRODUCTION' then 'قيد الإنتاج' when 'IN_REVIEW' then 'قيد المراجعة'
  when 'CHANGES_REQUESTED' then 'بحاجة إلى تعديل' when 'REJECTED' then 'مرفوض' when 'APPROVED' then 'جاهز للنشر'
  when 'SCHEDULED' then 'مجدول' when 'PUBLISHING' then 'جارٍ النشر' when 'PUBLISHED' then 'منشور'
  when 'PARTIAL' then 'نشر جزئي' when 'FAILED' then 'فشل النشر' else p_status end $$;

create function public.work_text_label(p_type text) returns text
language sql immutable set search_path = ''
as $$ select case p_type when 'post' then 'النص الأساسي' when 'video' then 'نص الفيديو' when 'design' then 'النص على التصميم'
  when 'announce' then 'نص الإعلان' when 'email' then 'نص الرسالة' when 'press' then 'نص البيان' when 'event' then 'نص التغطية' end $$;

create function public.work_platform_ar(p_platform text) returns text
language sql immutable set search_path = ''
as $$ select case p_platform when 'instagram' then 'إنستغرام' when 'x' then 'X' when 'linkedin' then 'لينكدإن'
  when 'youtube' then 'يوتيوب' when 'mail' then 'البريد' else p_platform end $$;

create function public.work_account_name(p_id uuid) returns text
language sql stable security definer set search_path = ''
as $$ select coalesce((select case when a.platform = 'mail' then 'البريد' else public.work_platform_ar(a.platform) || ' · ' || a.label end
                       from public.platform_accounts a where a.id = p_id), 'حساب محذوف') $$;

-- Whole package: press release, mail and announcement are approved as one.
create function public.work_whole(p_type text) returns boolean
language sql immutable set search_path = ''
as $$ select p_type in ('press','email','announce') $$;

create function public.work_publishable(p_type text) returns boolean
language sql immutable set search_path = ''
as $$ select p_type in ('post','video','design','announce','event') $$;

create function public.work_ts(p_at timestamptz) returns text
language sql immutable set search_path = ''
as $$ select to_char(p_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI') $$;

-- Riyadh date and time, as the interface shows them.
create function public.work_when(p_at timestamptz) returns text
language sql immutable set search_path = ''
as $$ select to_char(p_at at time zone 'Asia/Riyadh', 'YYYY-MM-DD HH24:MI') $$;

-- The parts of a work as they stand now, each with the exact version an approval binds to.
create function public.work_parts(p_work text)
returns table (key text, label text, ver text, kind text, snap text, ord int)
language sql stable security definer set search_path = ''
as $$
  with w as (select * from public.works where id = p_work),
  t as (select x.* from public.work_texts x where x.work_id = p_work order by x.n desc limit 1),
  v as (select distinct on (x.platform) x.* from public.work_variants x where x.work_id = p_work order by x.platform, x.n desc)
  select 'text', public.work_text_label(w.type), 't' || t.n, 'text', t.body, 0 from w, t
  union all
  select 'v:' || v.platform, 'نسخة ' || public.work_platform_ar(v.platform), 'c' || v.n, 'copy', v.body,
         10 + array_position(array['instagram','x','linkedin','youtube'], v.platform)
  from w, v
  where btrim(v.body) <> '' and exists (select 1 from public.platform_accounts a
                                        where a.id = any (w.channels) and a.platform = v.platform)
  union all
  select 'a:' || m.id, m.name, 'v' || m.current_version, 'asset', null, 20
  from public.work_assets wa join public.media_files m on m.id = wa.asset_id where wa.work_id = p_work
  union all
  select 'dest',
         case when (select a.platform from public.platform_accounts a where a.id = w.channels[1]) = 'mail' then 'جهة الإرسال' else 'المنصات والحسابات' end,
         'd:' || (select string_agg(c::text || '@' || coalesce(a.handle, ''), ',' order by c::text)
                  from unnest(w.channels) c left join public.platform_accounts a on a.id = c),
         'dest', null, 30
  from w where cardinality(w.channels) > 0
  union all
  select 'date', 'موعد النشر', 's:' || public.work_ts(w.proposed_at), 'date', null, 40
  from w where w.proposed_at is not null
$$;

create function public.work_pending(p_work text) returns table (key text, label text, ver text, kind text)
language sql stable security definer set search_path = ''
as $$
  select p.key, p.label, p.ver, p.kind from public.work_parts(p_work) p
  where not exists (select 1 from public.work_approvals a where a.work_id = p_work and a.part = p.key and a.ver = p.ver)
  order by p.ord, p.label
$$;

-- People who decide on this work now, without the one who sent it.
create function public.work_deciders(p_work text) returns text[]
language sql stable security definer set search_path = ''
as $$
  select coalesce(array_agg(a.email), '{}') from public.accounts a, public.works w
  where w.id = p_work and a.role in ('director','assistant')
    and a.email is distinct from (select c.sent_by from public.work_cycles c where c.work_id = w.id and c.n = w.review_cycle)
$$;

create function public.work_leaders() returns text[]
language sql stable security definer set search_path = ''
as $$ select coalesce(array_agg(a.email), '{}') from public.accounts a where a.role in ('director','assistant') $$;

create function public.work_publishers() returns text[]
language sql stable security definer set search_path = ''
as $$ select coalesce(array_agg(a.email), '{}') from public.accounts a where a.role = 'publisher' $$;

-- plpgsql, not sql: a sql function stops its last query after the first row.
create function public.work_notify_many(p_list text[], p_tier text, p_body text, p_go jsonb) returns void
language plpgsql security definer set search_path = ''
as $$
declare x text;
begin
  for x in select distinct unnest(p_list) loop
    perform public.work_notify(x, p_tier, p_body, p_go);
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- Stages: state and hand-over
-- ---------------------------------------------------------------------------
create function public.work_stage_cleared(p_work text, p_pos int) returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((select s.done_at is not null and (not s.gate or s.gate_by is not null)
                   from public.work_stages s where s.work_id = p_work and s.pos = p_pos), true)
$$;

-- done | active | ready | waiting
create function public.work_stage_state(p_stage uuid) returns text
language sql stable security definer set search_path = ''
as $$
  select case when s.done_at is not null then 'done' when s.started_at is not null then 'active'
    when not exists (select 1 from unnest(s.after_pos) j where not public.work_stage_cleared(s.work_id, j)) then 'ready'
    else 'waiting' end
  from public.work_stages s where s.id = p_stage
$$;

-- After a stage is cleared: «صار دورك» to the stages it unblocked, «للعلم» to the ones still waiting.
create function public.work_wake_after(p_work text, p_pos int, p_verb text) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  w public.works; s public.work_stages; d public.work_stages; me text := public.current_email(); waits text;
begin
  select * into w from public.works where id = p_work;
  select * into s from public.work_stages where work_id = p_work and pos = p_pos;
  for d in select * from public.work_stages x where x.work_id = p_work and x.done_at is null and p_pos = any (x.after_pos) order by x.pos loop
    if d.who is null then continue; end if;
    if public.work_stage_state(d.id) = 'ready' then
      perform public.work_notify(d.who, 'attention', 'صار دورك: «' || d.name || '» في «' || w.title || '» بعد أن ' || p_verb || ' '
        || public.work_name(me) || ' «' || s.name || '».', public.work_go(p_work));
    else
      select string_agg('«' || o.name || '» (' || public.work_name(o.who) || ')', ' و' order by o.pos) into waits
        from public.work_stages o where o.work_id = p_work and o.pos = any (d.after_pos) and not public.work_stage_cleared(p_work, o.pos);
      perform public.work_notify(d.who, 'info', p_verb || ' ' || public.work_name(me) || ' «' || s.name || '»، وما زالت «'
        || d.name || '» تنتظر ' || coalesce(waits, '') || '.', public.work_go(p_work));
    end if;
  end loop;
  if not exists (select 1 from public.work_stages x where x.work_id = p_work and not public.work_stage_cleared(p_work, x.pos)) then
    perform public.work_notify(w.assignee, 'attention', 'اكتملت مراحل «' || w.title || '». أرسله للمراجعة.', public.work_go(p_work));
  end if;
end
$$;

-- Problems that stop a plan from being saved. Finished stages are not checked again.
-- rows: [{id?, n, role, who, start, due, after:[int], days, gate, note}] in order.
create function public.work_plan_check(p_rows jsonb, p_due date) returns void
language plpgsql stable security definer set search_path = ''
as $$
declare
  r jsonb; i int := 0; j int; o jsonb; v_start date; v_due date; done boolean;
begin
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 40 then
    raise exception 'PLAN_INVALID' using errcode = 'P0001';
  end if;
  for r in select x from jsonb_array_elements(p_rows) x loop
    done := coalesce((r->>'done')::boolean, false);
    if char_length(btrim(coalesce(r->>'n', ''))) not between 1 and 80 then
      raise exception 'PLAN_NAME' using errcode = 'P0001';
    end if;
    v_start := nullif(r->>'start', '')::date; v_due := nullif(r->>'due', '')::date;
    if not done then
      if v_start is not null and v_due is not null and v_start > v_due then
        raise exception 'PLAN_START_AFTER_END' using errcode = 'P0001';
      end if;
      if p_due is not null and v_due is not null and v_due > p_due then
        raise exception 'PLAN_AFTER_DUE' using errcode = 'P0001';
      end if;
    end if;
    if nullif(r->>'who', '') is not null and not exists (
        select 1 from public.accounts a where a.email = r->>'who' and a.role not in ('member')) then
      raise exception 'PLAN_PERSON' using errcode = 'P0001';
    end if;
    for j in select (x)::int from jsonb_array_elements_text(coalesce(r->'after', '[]'::jsonb)) x loop
      -- A stage waits only for stages above it.
      if j < 0 or j >= i then raise exception 'PLAN_ORDER' using errcode = 'P0001'; end if;
      o := p_rows->j;
      if not done and not coalesce((o->>'done')::boolean, false) and v_start is not null
         and nullif(o->>'due', '') is not null and v_start < (o->>'due')::date then
        raise exception 'PLAN_BEFORE_DEPENDENCY' using errcode = 'P0001';
      end if;
    end loop;
    i := i + 1;
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- Approval engine
-- ---------------------------------------------------------------------------
-- The library stage of a file follows the works it belongs to.
create function public.work_sync_asset(p_asset uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  prev_m text := coalesce(current_setting('app.media_internal', true), '0');
  prev_w text := coalesce(current_setting('app.work_internal', true), '0');
  m public.media_files; w public.works; ver text; s text; best text; rank jsonb :=
    '{"published":7,"partial":7,"failed":7,"scheduled":6,"ready":5,"changes":4,"review":3}';
begin
  select * into m from public.media_files where id = p_asset;
  if not found then return; end if;
  ver := 'v' || m.current_version;
  for w in select x.* from public.works x join public.work_assets wa on wa.work_id = x.id where wa.asset_id = p_asset loop
    s := null;
    if exists (select 1 from public.work_approvals a where a.work_id = w.id and a.part = 'a:' || p_asset and a.ver = ver) then
      s := case w.status when 'PUBLISHED' then 'published' when 'PARTIAL' then 'partial' when 'FAILED' then 'failed'
                         when 'SCHEDULED' then 'scheduled' else 'ready' end;
    elsif exists (select 1 from public.work_flags f where f.work_id = w.id and f.part = 'a:' || p_asset and f.ver = ver) then
      s := 'changes';
    elsif w.status = 'IN_REVIEW' then
      s := 'review';
    end if;
    if s is not null and (best is null or (rank->>s)::int > (rank->>best)::int) then best := s; end if;
  end loop;
  if best is null or best = m.stage then return; end if;
  perform set_config('app.media_internal', '1', true);
  perform set_config('app.work_internal', '1', true);
  update public.media_files set stage = best,
      approved_version = case when best in ('changes','review') then approved_version else current_version end
    where id = p_asset;
  perform set_config('app.media_internal', prev_m, true);
  perform set_config('app.work_internal', prev_w, true);
end
$$;

create function public.work_sync_assets(p_work text) returns void
language plpgsql security definer set search_path = ''
as $$
declare a uuid;
begin
  for a in select wa.asset_id from public.work_assets wa where wa.work_id = p_work loop
    perform public.work_sync_asset(a);
  end loop;
end
$$;

-- After the last part is approved: ready, or straight back to the schedule it already had.
create function public.work_finish_if_done(p_work text) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare w public.works;
begin
  select * into w from public.works where id = p_work for update;
  if exists (select 1 from public.work_pending(p_work)) then return false; end if;
  if w.pending_sched and w.sched_at is not null then
    update public.works set status = 'SCHEDULED', sched_at = coalesce(proposed_at, sched_at) where id = p_work;
  else
    update public.works set status = 'APPROVED' where id = p_work;
  end if;
  update public.works set pending_sched = false, review_cycle = null, move_from = null, move_by = null,
      move_was_sched = false, updated_at = now()
    where id = p_work returning * into w;
  delete from public.work_flags where work_id = p_work;
  perform public.work_log_add(p_work, 'approved',
    case when w.status = 'SCHEDULED' then 'اكتمل الاعتماد وعاد العمل إلى موعده ' || public.work_when(w.sched_at)
         else 'اكتمل الاعتماد: العمل «جاهز للنشر»' end, '{}');
  perform public.work_notify_many(array[w.assignee] || public.work_publishers(), 'info',
    'اكتمل اعتماد «' || w.title || '» وصار «' || public.work_status_ar(w.status) || '».', public.work_go(p_work));
  perform public.work_sync_assets(p_work);
  return true;
end
$$;

-- A change after approval re-opens review for the changed parts only (or the whole package).
create function public.work_reopen_after_change(p_work text, p_why text) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare w public.works; n int; labels text;
begin
  select * into w from public.works where id = p_work for update;
  if w.status not in ('APPROVED','SCHEDULED') or not exists (select 1 from public.work_pending(p_work)) then
    return false;
  end if;
  if public.work_whole(w.type) then delete from public.work_approvals where work_id = p_work; end if;
  n := coalesce((select max(c.n) from public.work_cycles c where c.work_id = p_work), 0) + 1;
  insert into public.work_cycles (work_id, n, sent_by, note) values (p_work, n, coalesce(public.current_email(), 'system'), left(p_why, 1000));
  update public.works set pending_sched = (status = 'SCHEDULED' or pending_sched), status = 'IN_REVIEW',
      review_cycle = n, confirm_pending = false, updated_at = now()
    where id = p_work;
  select string_agg(p.label, '، ') into labels from public.work_pending(p_work) p;
  perform public.work_log_add(p_work, 'review', 'عودة إلى المراجعة (الدورة ' || n || '): ' || labels, jsonb_build_object('cycle', n));
  perform public.work_notify_many(public.work_deciders(p_work), 'decide',
    p_why || ' في «' || w.title || '»: ' || labels || ' يحتاج قرارك.', jsonb_build_object('page','review','id',p_work));
  perform public.work_sync_assets(p_work);
  return true;
end
$$;

-- Why the caller may not decide on this work now; null when they may.
create function public.work_decide_block(p_work text) returns text
language sql stable security definer set search_path = ''
as $$
  select case
    when not public.work_approver() then 'FORBIDDEN_DECIDE'
    when w.status <> 'IN_REVIEW' or w.review_cycle is null or w.closed_at is not null then 'NOT_IN_REVIEW'
    when c.sent_by = public.current_email() then 'SELF_APPROVAL'
    when w.priority = 'urgent' and not public.work_urgent_approver() then 'URGENT_APPROVER'
    else null end
  from public.works w left join public.work_cycles c on c.work_id = w.id and c.n = w.review_cycle
  where w.id = p_work
$$;

-- ---------------------------------------------------------------------------
-- Creating and editing a work
-- ---------------------------------------------------------------------------
create function public.work_insert_stages(p_work text, p_rows jsonb, p_strip boolean) returns void
language plpgsql security definer set search_path = ''
as $$
declare r jsonb; i int := 0;
begin
  for r in select x from jsonb_array_elements(p_rows) x loop
    insert into public.work_stages (work_id, pos, name, role, who, start_on, due_on, after_pos, days, note, gate)
    values (p_work, i, btrim(r->>'n'), coalesce(nullif(r->>'role', ''), ''),
      case when p_strip then null else nullif(r->>'who', '') end,
      case when p_strip then null else nullif(r->>'start', '')::date end,
      case when p_strip then null else nullif(r->>'due', '')::date end,
      coalesce((select array_agg(x::int) from jsonb_array_elements_text(coalesce(r->'after', '[]'::jsonb)) x), '{}'),
      greatest(1, least(365, coalesce(nullif(r->>'days', '')::int, 1))),
      nullif(btrim(coalesce(r->>'note', '')), ''),
      coalesce((r->>'gate')::boolean, false));
    i := i + 1;
  end loop;
end
$$;

-- YouTube carries video only: a work published there needs the video type or a video file.
create function public.work_youtube_ok(p_type text, p_channels uuid[], p_assets uuid[]) returns boolean
language sql stable security definer set search_path = ''
as $$
  select p_type = 'video'
      or not exists (select 1 from public.platform_accounts a where a.id = any (p_channels) and a.platform = 'youtube')
      or exists (select 1 from public.media_files m where m.id = any (p_assets) and m.kind = 'video')
$$;

create function public.work_check_channels(p_channels uuid[]) returns void
language plpgsql stable security definer set search_path = ''
as $$
begin
  if exists (select 1 from unnest(p_channels) c
             where not exists (select 1 from public.platform_accounts a where a.id = c and a.active and a.platform <> 'mail')) then
    raise exception 'ACCOUNT_INVALID' using errcode = 'P0001';
  end if;
end
$$;

-- p: {type, title, brief, priority, restricted, source, requester, due, assignee, people[],
--     projects[], channels[], assets[], main, stages[], event_at, place, mail_thread, start}
create function public.work_create(p jsonb) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  me text := public.current_email(); r text := public.media_my_role(); member boolean;
  v_type text := p->>'type'; v_due date; v_assignee text; v_id text; v_no int; w public.works;
  v_channels uuid[]; v_assets uuid[]; v_people text[]; v_projects uuid[]; v_stages jsonb; st public.work_stages;
  v_status text; waits text; v_mail uuid;
begin
  if me is null or r is null then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  member := r = 'member';
  -- The publisher receives approved work for scheduling and does not create work.
  if r = 'publisher' then raise exception 'CREATE_ROLE' using errcode = 'P0001'; end if;
  if v_type is null or v_type not in ('post','video','design','announce','email','press','event') then
    raise exception 'TYPE_INVALID' using errcode = 'P0001';
  end if;
  if char_length(btrim(coalesce(p->>'title', ''))) not between 1 and 140 then raise exception 'TITLE_REQUIRED' using errcode = 'P0001'; end if;
  v_due := nullif(p->>'due', '')::date;
  if v_due is null then raise exception 'DUE_REQUIRED' using errcode = 'P0001'; end if;
  if v_due < public.work_today() then raise exception 'DUE_PAST' using errcode = 'P0001'; end if;

  v_assignee := nullif(p->>'assignee', '');
  if member then
    v_assignee := null;
  elsif v_assignee is not null and not public.work_lead() and v_assignee <> me then
    raise exception 'ASSIGN_DENIED' using errcode = 'P0001';
  end if;
  if v_assignee is not null and not exists (select 1 from public.accounts a where a.email = v_assignee and a.role <> 'member') then
    raise exception 'PERSON_INVALID' using errcode = 'P0001';
  end if;

  select coalesce(array_agg(x::uuid), '{}') into v_assets from jsonb_array_elements_text(coalesce(p->'assets', '[]'::jsonb)) x;
  if exists (select 1 from unnest(v_assets) a where public.media_asset_level(a) < 1) then
    raise exception 'ASSET_DENIED' using errcode = 'P0001';
  end if;
  select coalesce(array_agg(x::uuid), '{}') into v_projects from jsonb_array_elements_text(coalesce(p->'projects', '[]'::jsonb)) x;
  if exists (select 1 from unnest(v_projects) x where not exists (select 1 from public.projects j where j.id = x)) then
    raise exception 'PROJECT_INVALID' using errcode = 'P0001';
  end if;

  if public.work_publishable(v_type) then
    if member then
      v_channels := '{}';
    else
      select coalesce(array_agg(x::uuid), '{}') into v_channels from jsonb_array_elements_text(coalesce(p->'channels', '[]'::jsonb)) x;
      perform public.work_check_channels(v_channels);
      if v_type = 'post' and cardinality(v_channels) = 0 then raise exception 'CHANNEL_REQUIRED' using errcode = 'P0001'; end if;
      if not public.work_youtube_ok(v_type, v_channels, v_assets) then raise exception 'YOUTUBE_VIDEO_ONLY' using errcode = 'P0001'; end if;
    end if;
  elsif v_type in ('press','email') then
    select array[a.id] into v_channels from public.platform_accounts a where a.platform = 'mail' and a.fixed limit 1;
  else
    v_channels := '{}';
  end if;

  v_stages := coalesce(p->'stages', '[]'::jsonb);
  if jsonb_typeof(v_stages) <> 'array' or jsonb_array_length(v_stages) = 0 then
    raise exception 'PLAN_INVALID' using errcode = 'P0001';
  end if;
  if not member and v_assignee is not null then
    perform public.work_plan_check(v_stages, v_due);
  else
    -- A request keeps only the stage names and their order; people and dates come at assignment.
    perform public.work_plan_check((select jsonb_agg(jsonb_build_object('n', e->'n', 'after', coalesce(e->'after', '[]'::jsonb)) order by o)
                                   from jsonb_array_elements(v_stages) with ordinality q(e, o)), null);
  end if;

  select coalesce(array_agg(distinct a.email), '{}') into v_people
    from jsonb_array_elements_text(coalesce(p->'people', '[]'::jsonb)) x join public.accounts a on a.email = x and a.role <> 'member'
    where not member and x is distinct from v_assignee;

  v_no := nextval('public.work_no_seq');
  v_id := 'CH-' || v_no;
  v_status := case when coalesce((p->>'start')::boolean, false) and v_assignee is not null then 'IN_PRODUCTION' else 'DRAFT' end;
  insert into public.works (id, no, title, type, status, priority, restricted, source, requester, brief, created_by, assignee,
                            people, due, event_at, place, channels)
  values (v_id, v_no, btrim(p->>'title'), v_type, v_status,
    case when p->>'priority' in ('normal','high','urgent') then p->>'priority' else 'normal' end,
    public.work_lead() and coalesce((p->>'restricted')::boolean, false),
    case when member then (case when p->>'source' = 'dept' then 'dept' else 'member' end)
         when p->>'source' in ('plan','dept','directive','occasion','coverage','external') then p->>'source' else 'plan' end,
    nullif(left(btrim(coalesce(p->>'requester', '')), 120), ''),
    nullif(left(btrim(coalesce(p->>'brief', '')), 4000), ''),
    me, v_assignee, v_people, v_due,
    case when v_type = 'event' then nullif(p->>'event_at', '')::timestamptz end,
    case when v_type = 'event' then nullif(left(btrim(coalesce(p->>'place', '')), 120), '') end,
    v_channels)
  returning * into w;

  perform public.work_insert_stages(v_id, v_stages, member or v_assignee is null);
  update public.works set people = (select coalesce(array_agg(distinct x), '{}') from (
      select unnest(people) x union select s.who from public.work_stages s where s.work_id = v_id and s.who is not null) y
      where x is distinct from v_assignee)
    where id = v_id;
  insert into public.work_projects (work_id, project_id) select v_id, x from unnest(v_projects) x;
  insert into public.work_assets (work_id, asset_id, added_by) select v_id, x, me from unnest(v_assets) x;
  if char_length(btrim(coalesce(p->>'main', ''))) > 0 and public.work_text_label(v_type) is not null then
    insert into public.work_texts (work_id, n, body, note, author) values (v_id, 1, left(btrim(p->>'main'), 8000), 'عند الإنشاء', me);
  end if;

  perform public.work_log_add(v_id, case when v_assignee is null then 'request' else 'create' end,
    case when v_assignee is null then 'إرسال طلب جديد'
         else 'إنشاء العمل وإسناده إلى ' || public.work_name(v_assignee) end, jsonb_build_object('type', v_type));
  if v_status = 'IN_PRODUCTION' then perform public.work_log_add(v_id, 'start', 'بدء الإنتاج', '{}'); end if;

  v_mail := nullif(p->>'mail_thread', '')::uuid;
  if v_mail is not null then
    perform public.mail_link_work(v_mail, v_id, w.title, v_assignee);
    perform public.work_log_add(v_id, 'link', 'ربط العمل برسالة البريد', jsonb_build_object('thread', v_mail));
  end if;

  if v_assignee is not null then
    for st in select * from public.work_stages s where s.work_id = v_id and s.who is not null and s.who <> me order by s.pos loop
      if public.work_stage_state(st.id) = 'ready' then
        perform public.work_notify(st.who, 'attention', public.work_name(me) || ' أسند إليك «' || st.name || '» في «' || w.title || '».', public.work_go(v_id));
      else
        select string_agg('«' || o.name || '»', ' و' order by o.pos) into waits
          from public.work_stages o where o.work_id = v_id and o.pos = any (st.after_pos);
        perform public.work_notify(st.who, 'info', public.work_name(me) || ' أسند إليك «' || st.name || '» في «' || w.title
          || '»، وتبدأ بعد ' || coalesce(waits, '') || '.', public.work_go(v_id));
      end if;
    end loop;
    perform public.work_notify(v_assignee, 'attention', public.work_name(me) || ' أسند إليك «' || w.title || '».', public.work_go(v_id));
  else
    perform public.work_notify_many(public.work_leaders(), 'decide', public.work_name(me) || ' أرسل طلب عمل: «' || w.title || '».',
      jsonb_build_object('page','requests'));
  end if;
  return v_id;
end
$$;

-- Details: title, brief, requester, due, priority, projects, people, stage dates.
-- Leaders; the creator of a request may edit it until it is assigned.
create function public.work_update(p_work text, p jsonb) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  me text := public.current_email(); w public.works; changes text[] := '{}'; v_due date; k text; s public.work_stages;
  v_date date; v_projects uuid[];
begin
  select * into w from public.works where id = p_work for update;
  if not found or w.closed_at is not null
     or not (public.work_lead() or (w.assignee is null and w.created_by = me)) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  if p ? 'title' and btrim(p->>'title') is distinct from w.title then
    if char_length(btrim(coalesce(p->>'title', ''))) not between 1 and 140 then raise exception 'TITLE_REQUIRED' using errcode = 'P0001'; end if;
    update public.works set title = btrim(p->>'title') where id = p_work; changes := changes || 'العنوان'::text;
  end if;
  if p ? 'brief' then update public.works set brief = nullif(left(btrim(coalesce(p->>'brief', '')), 4000), '') where id = p_work; end if;
  if p ? 'requester' then update public.works set requester = nullif(left(btrim(coalesce(p->>'requester', '')), 120), '') where id = p_work; end if;

  -- Stage dates first, so a new final due date is checked against them.
  if p ? 'stage_dues' then
    if not public.work_lead() then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
    for k in select jsonb_object_keys(p->'stage_dues') loop
      select * into s from public.work_stages where id = k::uuid and work_id = p_work and done_at is null for update;
      if not found then continue; end if;
      v_date := nullif(p->'stage_dues'->>k, '')::date;
      if v_date is distinct from s.due_on then
        if v_date is not null and v_date > coalesce(nullif(p->>'due', '')::date, w.due) then
          raise exception 'STAGE_AFTER_DUE' using errcode = 'P0001';
        end if;
        update public.work_stages set due_on = v_date, start_on = case when start_on > v_date then v_date else start_on end where id = s.id;
        perform public.work_log_add(p_work, 'stage_due', 'تغيير موعد مرحلة «' || s.name || '» إلى ' || coalesce(v_date::text, 'بلا موعد'),
          jsonb_build_object('stage', s.id, 'from', s.due_on, 'to', v_date));
        perform public.work_notify(s.who, 'attention', 'تغيّر موعد «' || s.name || '» في «' || w.title || '» إلى ' || coalesce(v_date::text, 'بلا موعد') || '.', public.work_go(p_work));
      end if;
    end loop;
  end if;

  if p ? 'due' then
    v_due := nullif(p->>'due', '')::date;
    if v_due is null then raise exception 'DUE_REQUIRED' using errcode = 'P0001'; end if;
    if v_due is distinct from w.due then
      if exists (select 1 from public.work_stages x where x.work_id = p_work and x.done_at is null and x.due_on > v_due) then
        raise exception 'STAGE_AFTER_DUE' using errcode = 'P0001';
      end if;
      update public.works set due = v_due where id = p_work;
      changes := changes || ('التسليم من ' || w.due || ' إلى ' || v_due);
      perform public.work_notify(w.assignee, 'attention', 'تغيّر موعد تسليم «' || w.title || '» إلى ' || v_due || '.', public.work_go(p_work));
    end if;
  end if;
  if p ? 'priority' and p->>'priority' is distinct from w.priority then
    if p->>'priority' not in ('normal','high','urgent') then raise exception 'PRIORITY_INVALID' using errcode = 'P0001'; end if;
    update public.works set priority = p->>'priority' where id = p_work;
    changes := changes || ('الأولوية إلى «' || case p->>'priority' when 'urgent' then 'عاجل' when 'high' then 'مرتفعة' else 'عادية' end || '»');
  end if;
  if p ? 'projects' then
    select coalesce(array_agg(x::uuid), '{}') into v_projects from jsonb_array_elements_text(p->'projects') x;
    if exists (select 1 from unnest(v_projects) x where not exists (select 1 from public.projects j where j.id = x)) then
      raise exception 'PROJECT_INVALID' using errcode = 'P0001';
    end if;
    if (select coalesce(array_agg(project_id order by project_id), '{}') from public.work_projects where work_id = p_work)
       is distinct from (select coalesce(array_agg(x order by x), '{}') from unnest(v_projects) x) then
      delete from public.work_projects where work_id = p_work;
      insert into public.work_projects (work_id, project_id) select p_work, x from unnest(v_projects) x;
      changes := changes || 'المشاريع'::text;
    end if;
  end if;
  if p ? 'people' then
    update public.works set people = (select coalesce(array_agg(distinct a.email), '{}')
        from jsonb_array_elements_text(p->'people') x join public.accounts a on a.email = x and a.role <> 'member'
        where x is distinct from w.assignee)
      where id = p_work;
  end if;
  update public.works set updated_at = now() where id = p_work;
  if cardinality(changes) > 0 then
    perform public.work_log_add(p_work, 'details', 'تعديل: ' || array_to_string(changes, '، '), '{}');
  end if;
end
$$;

create function public.work_assign(p_work text, p_to text) returns void
language plpgsql security definer set search_path = ''
as $$
declare w public.works; me text := public.current_email();
begin
  select * into w from public.works where id = p_work for update;
  if not found or w.closed_at is not null or not public.work_lead() then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.accounts a where a.email = p_to and a.role <> 'member') then
    raise exception 'PERSON_INVALID' using errcode = 'P0001';
  end if;
  if p_to = w.assignee then return; end if;
  update public.works set assignee = p_to, people = array_remove(people, p_to), updated_at = now() where id = p_work;
  perform public.work_log_add(p_work, 'assign', case when w.assignee is null then 'إسناد الطلب إلى ' || public.work_name(p_to)
    else 'إسناد العمل إلى ' || public.work_name(p_to) || ' بدلاً من ' || public.work_name(w.assignee) end, jsonb_build_object('to', p_to, 'from', w.assignee));
  perform public.work_notify(p_to, 'attention', public.work_name(me) || ' أسند إليك «' || w.title || '».', public.work_go(p_work));
  if w.assignee is null then
    perform public.work_notify(w.created_by, 'info', 'أُسند طلبك «' || w.title || '» إلى ' || public.work_name(p_to) || '.', public.work_go(p_work));
  end if;
end
$$;

create function public.work_set_restricted(p_work text, p_restricted boolean) returns void
language plpgsql security definer set search_path = ''
as $$
declare w public.works;
begin
  select * into w from public.works where id = p_work for update;
  if not found or w.closed_at is not null or not public.work_lead() then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if w.restricted = p_restricted then return; end if;
  update public.works set restricted = p_restricted, updated_at = now() where id = p_work;
  perform public.work_log_add(p_work, 'restrict', case when p_restricted then 'تقييد رؤية العمل' else 'إلغاء تقييد الرؤية' end,
    jsonb_build_object('restricted', p_restricted));
end
$$;

create function public.work_close(p_work text, p_reason text) returns void
language plpgsql security definer set search_path = ''
as $$
declare w public.works;
begin
  select * into w from public.works where id = p_work for update;
  if not found or w.closed_at is not null or not public.work_lead() then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) = 0 then raise exception 'REASON_REQUIRED' using errcode = 'P0001'; end if;
  update public.works set closed_at = now(), closed_by = public.current_email(), close_reason = left(btrim(p_reason), 500),
      updated_at = now() where id = p_work;
  perform public.work_log_add(p_work, 'close', 'إغلاق العمل: ' || left(btrim(p_reason), 500), '{}');
  perform public.work_notify(w.assignee, 'info', 'أُغلق «' || w.title || '»: ' || left(btrim(p_reason), 500), public.work_go(p_work));
end
$$;

create function public.work_reopen(p_work text) returns void
language plpgsql security definer set search_path = ''
as $$
declare w public.works;
begin
  select * into w from public.works where id = p_work for update;
  if not found or w.closed_at is null or not public.work_lead() then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  update public.works set closed_at = null, closed_by = null, close_reason = null, updated_at = now() where id = p_work;
  perform public.work_log_add(p_work, 'reopen', 'إعادة فتح العمل', '{}');
end
$$;

-- Start production, or start again after changes or a rejection.
create function public.work_start(p_work text) returns void
language plpgsql security definer set search_path = ''
as $$
declare w public.works;
begin
  select * into w from public.works where id = p_work for update;
  if not found or w.closed_at is not null or w.assignee is null
     or not (public.work_lead() or w.assignee = public.current_email()) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  if w.status not in ('DRAFT','CHANGES_REQUESTED','REJECTED') then raise exception 'STATUS_DENIED' using errcode = 'P0001'; end if;
  update public.works set status = 'IN_PRODUCTION', updated_at = now() where id = p_work;
  perform public.work_log_add(p_work, 'start', case when w.status = 'DRAFT' then 'بدء الإنتاج' else 'بدء التعديل بعد المراجعة' end, '{}');
end
$$;

-- ---------------------------------------------------------------------------
-- Stages
-- ---------------------------------------------------------------------------
-- op: start | finish | gate (approve an approval point)
create function public.work_stage_act(p_stage uuid, p_op text) returns void
language plpgsql security definer set search_path = ''
as $$
declare me text := public.current_email(); s public.work_stages; w public.works; st text;
begin
  select * into s from public.work_stages where id = p_stage for update;
  if not found then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  select * into w from public.works where id = s.work_id for update;
  if w.closed_at is not null or not public.work_can_see(w.id) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  st := public.work_stage_state(p_stage);

  if p_op = 'gate' then
    if not s.gate or s.done_at is null or s.gate_by is not null then raise exception 'GATE_NOT_PENDING' using errcode = 'P0001'; end if;
    if not public.work_approver() then raise exception 'FORBIDDEN_DECIDE' using errcode = 'P0001'; end if;
    if s.done_by = me then raise exception 'SELF_APPROVAL' using errcode = 'P0001'; end if;
    update public.work_stages set gate_by = me, gate_at = now() where id = p_stage;
    perform public.work_log_add(w.id, 'gate', 'اعتماد نقطة «' || s.name || '»', jsonb_build_object('stage', s.id));
    perform public.work_notify(s.done_by, 'info', public.work_name(me) || ' اعتمد «' || s.name || '» في «' || w.title || '».', public.work_go(w.id));
    perform public.work_wake_after(w.id, s.pos, 'اعتمد');
    return;
  end if;

  if w.status not in ('DRAFT','IN_PRODUCTION') or w.assignee is null then raise exception 'STATUS_DENIED' using errcode = 'P0001'; end if;
  if not (s.who = me or w.assignee = me or public.work_lead()) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if st = 'waiting' then raise exception 'STAGE_WAITING' using errcode = 'P0001'; end if;

  if p_op = 'start' then
    if st <> 'ready' then raise exception 'STAGE_STATE' using errcode = 'P0001'; end if;
    update public.work_stages set started_at = now(), who = coalesce(who, me) where id = p_stage;
    update public.works set status = 'IN_PRODUCTION', updated_at = now() where id = w.id and status = 'DRAFT';
    perform public.work_log_add(w.id, 'stage_start', 'بدء مرحلة «' || s.name || '»', jsonb_build_object('stage', s.id));
    if w.assignee <> me then
      perform public.work_notify(w.assignee, 'info', public.work_name(me) || ' بدأ «' || s.name || '» في «' || w.title || '».', public.work_go(w.id));
    end if;
  elsif p_op = 'finish' then
    if st = 'done' then raise exception 'STAGE_STATE' using errcode = 'P0001'; end if;
    update public.work_stages set done_at = now(), done_by = me, started_at = coalesce(started_at, now()), who = coalesce(who, me)
      where id = p_stage;
    update public.works set status = 'IN_PRODUCTION', updated_at = now() where id = w.id and status = 'DRAFT';
    perform public.work_log_add(w.id, 'stage_done', 'إنهاء مرحلة «' || s.name || '»', jsonb_build_object('stage', s.id));
    if s.gate then
      perform public.work_log_add(w.id, 'gate_wait', '«' || s.name || '» نقطة اعتماد: ما بعدها ينتظر اعتماد مدير الاتصال أو مساعده', jsonb_build_object('stage', s.id));
      perform public.work_notify_many(public.work_leaders(), 'decide', 'انتهت «' || s.name || '» في «' || w.title
        || '»، وهي نقطة اعتماد: ما بعدها لا يبدأ حتى تعتمدها.', public.work_go(w.id));
    else
      perform public.work_wake_after(w.id, s.pos, 'أنهى');
    end if;
  else
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
end
$$;

-- Save the whole plan: rows in their new order. Rows with an id keep it; a finished stage
-- cannot be removed or changed; new people on a stage are told.
create function public.work_save_plan(p_work text, p_rows jsonb) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  me text := public.current_email(); w public.works; r jsonb; i int := 0; s public.work_stages; v_id uuid;
  before jsonb; keep uuid[] := '{}'; waits text;
begin
  select * into w from public.works where id = p_work for update;
  if not found or w.closed_at is not null or not (public.work_lead() or w.assignee = me) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  if w.status not in ('DRAFT','IN_PRODUCTION','IN_REVIEW','CHANGES_REQUESTED','REJECTED') then
    raise exception 'STATUS_DENIED' using errcode = 'P0001';
  end if;
  -- Mark finished rows so the check leaves their dates alone.
  p_rows := (select coalesce(jsonb_agg(case when exists (select 1 from public.work_stages x where x.work_id = p_work
                 and x.id::text = e->>'id' and x.done_at is not null) then e || '{"done":true}' else e end order by o), '[]'::jsonb)
             from jsonb_array_elements(p_rows) with ordinality q(e, o));
  if jsonb_array_length(p_rows) = 0 then raise exception 'PLAN_INVALID' using errcode = 'P0001'; end if;
  perform public.work_plan_check(p_rows, w.due);
  if exists (select 1 from public.work_stages x where x.work_id = p_work and x.done_at is not null
             and not exists (select 1 from jsonb_array_elements(p_rows) e where e->>'id' = x.id::text)) then
    raise exception 'PLAN_DONE_STAGE' using errcode = 'P0001';
  end if;
  select coalesce(jsonb_object_agg(x.id::text, coalesce(x.who, '')), '{}') into before from public.work_stages x where x.work_id = p_work;

  -- Move every position out of the way, then write the new order.
  for r in select e from jsonb_array_elements(p_rows) e loop
    v_id := nullif(r->>'id', '')::uuid;
    select * into s from public.work_stages where id = v_id and work_id = p_work;
    if found then
      if s.done_at is not null then
        update public.work_stages set pos = i, after_pos = coalesce((select array_agg(x::int) from jsonb_array_elements_text(coalesce(r->'after', '[]'::jsonb)) x), '{}'),
            note = nullif(btrim(coalesce(r->>'note', '')), '')
          where id = v_id;
      else
        update public.work_stages set pos = i, name = btrim(r->>'n'), role = coalesce(nullif(r->>'role', ''), ''),
            who = nullif(r->>'who', ''), start_on = nullif(r->>'start', '')::date, due_on = nullif(r->>'due', '')::date,
            after_pos = coalesce((select array_agg(x::int) from jsonb_array_elements_text(coalesce(r->'after', '[]'::jsonb)) x), '{}'),
            days = greatest(1, least(365, coalesce(nullif(r->>'days', '')::int, 1))),
            note = nullif(btrim(coalesce(r->>'note', '')), ''),
            gate = coalesce((r->>'gate')::boolean, false)
          where id = v_id;
      end if;
    else
      insert into public.work_stages (work_id, pos, name, role, who, start_on, due_on, after_pos, days, note, gate)
      values (p_work, i, btrim(r->>'n'), coalesce(nullif(r->>'role', ''), ''), nullif(r->>'who', ''),
        nullif(r->>'start', '')::date, nullif(r->>'due', '')::date,
        coalesce((select array_agg(x::int) from jsonb_array_elements_text(coalesce(r->'after', '[]'::jsonb)) x), '{}'),
        greatest(1, least(365, coalesce(nullif(r->>'days', '')::int, 1))),
        nullif(btrim(coalesce(r->>'note', '')), ''), coalesce((r->>'gate')::boolean, false))
      returning id into v_id;
    end if;
    keep := keep || v_id;
    i := i + 1;
  end loop;
  delete from public.work_stages where work_id = p_work and not (id = any (keep));

  update public.works set updated_at = now(), people = (select coalesce(array_agg(distinct x), '{}') from (
      select unnest(people) x union select s2.who from public.work_stages s2 where s2.work_id = p_work and s2.who is not null) y
      where x is distinct from assignee)
    where id = p_work;
  perform public.work_log_add(p_work, 'plan', 'تعديل خطة المراحل', jsonb_build_object('stages', i));

  for s in select * from public.work_stages x where x.work_id = p_work and x.done_at is null and x.who is not null order by x.pos loop
    if (before->>s.id::text) is not distinct from s.who then continue; end if;
    if public.work_stage_state(s.id) = 'ready' then
      perform public.work_notify(s.who, 'attention', public.work_name(me) || ' أسند إليك «' || s.name || '» في «' || w.title || '».', public.work_go(p_work));
    else
      select string_agg('«' || o.name || '»', ' و' order by o.pos) into waits
        from public.work_stages o where o.work_id = p_work and o.pos = any (s.after_pos) and not public.work_stage_cleared(p_work, o.pos);
      perform public.work_notify(s.who, 'info', public.work_name(me) || ' أسند إليك «' || s.name || '» في «' || w.title
        || '»، وتبدأ بعد ' || coalesce(waits, '') || '.', public.work_go(p_work));
    end if;
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- Text, copies, files, comments
-- ---------------------------------------------------------------------------
-- p_target: 'main' or a platform. Text is editable while in production, after changes
-- or a rejection, and after approval (which re-opens review for what changed).
create function public.work_text_save(p_work text, p_target text, p_body text, p_note text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare me text := public.current_email(); w public.works; n int; base int; cur text; reopened boolean;
begin
  select * into w from public.works where id = p_work for update;
  if not found or w.closed_at is not null or not (public.work_lead() or w.assignee = me) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  if w.status not in ('DRAFT','IN_PRODUCTION','CHANGES_REQUESTED','REJECTED','APPROVED','SCHEDULED') then
    raise exception 'STATUS_DENIED' using errcode = 'P0001';
  end if;
  p_body := btrim(coalesce(p_body, ''));
  if p_target = 'main' then
    if public.work_text_label(w.type) is null or char_length(p_body) = 0 then raise exception 'TEXT_REQUIRED' using errcode = 'P0001'; end if;
    select x.n, x.body into n, cur from public.work_texts x where x.work_id = p_work order by x.n desc limit 1;
    if cur = p_body then raise exception 'NO_CHANGE' using errcode = 'P0001'; end if;
    n := coalesce(n, 0) + 1;
    insert into public.work_texts (work_id, n, body, note, author)
    values (p_work, n, left(p_body, 8000), coalesce(nullif(left(btrim(coalesce(p_note, '')), 200), ''), case when n = 1 then 'الصياغة الأولى' end), me);
    perform public.work_log_add(p_work, 'text', case when n = 1 then 'كتابة ' || public.work_text_label(w.type)
      else 'تعديل ' || public.work_text_label(w.type) || ' (الإصدار ' || n || ')'
        || case when me is distinct from w.assignee and w.assignee is not null then '. الكاتب ' || public.work_name(w.assignee) else '' end end,
      jsonb_build_object('n', n));
  elsif p_target in ('instagram','x','linkedin','youtube') then
    if not exists (select 1 from public.platform_accounts a where a.id = any (w.channels) and a.platform = p_target) then
      raise exception 'PLATFORM_NOT_CHOSEN' using errcode = 'P0001';
    end if;
    select x.n, x.body into n, cur from public.work_variants x where x.work_id = p_work and x.platform = p_target order by x.n desc limit 1;
    if cur = p_body then raise exception 'NO_CHANGE' using errcode = 'P0001'; end if;
    n := coalesce(n, 0) + 1;
    base := coalesce((select max(x.n) from public.work_texts x where x.work_id = p_work), 0);
    insert into public.work_variants (work_id, platform, n, body, base, author) values (p_work, p_target, n, left(p_body, 4000), base, me);
    perform public.work_log_add(p_work, 'copy', 'تعديل نسخة ' || public.work_platform_ar(p_target) || ' (الصياغة ' || n || ')',
      jsonb_build_object('platform', p_target, 'n', n));
  else
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  update public.works set updated_at = now() where id = p_work;
  reopened := public.work_reopen_after_change(p_work, 'تعديل بعد الاعتماد');
  return jsonb_build_object('n', n, 'reopened', reopened);
end
$$;

-- The copy still fits the current main text: its base moves to the current version.
create function public.work_variant_confirm(p_work text, p_platform text) returns void
language plpgsql security definer set search_path = ''
as $$
declare w public.works; n int;
begin
  select * into w from public.works where id = p_work for update;
  if not found or w.closed_at is not null or not (public.work_lead() or w.assignee = public.current_email()) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  n := coalesce((select max(x.n) from public.work_texts x where x.work_id = p_work), 0);
  update public.work_variants set base = n
    where work_id = p_work and platform = p_platform
      and n = (select max(v.n) from public.work_variants v where v.work_id = p_work and v.platform = p_platform);
  if not found then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  perform public.work_log_add(p_work, 'copy_ok', 'تأكيد صياغة نسخة ' || public.work_platform_ar(p_platform), jsonb_build_object('platform', p_platform));
end
$$;

create function public.work_asset_link(p_work text, p_asset uuid, p_add boolean) returns void
language plpgsql security definer set search_path = ''
as $$
declare me text := public.current_email(); w public.works; v_name text;
begin
  select * into w from public.works where id = p_work for update;
  if not found or w.closed_at is not null or not (public.work_lead() or public.work_involved(p_work, me)) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  if w.status not in ('DRAFT','IN_PRODUCTION','CHANGES_REQUESTED','REJECTED') then raise exception 'STATUS_DENIED' using errcode = 'P0001'; end if;
  if public.media_asset_level(p_asset) < 1 then raise exception 'ASSET_DENIED' using errcode = 'P0001'; end if;
  select m.name into v_name from public.media_files m where m.id = p_asset;
  if p_add then
    insert into public.work_assets (work_id, asset_id, added_by) values (p_work, p_asset, me) on conflict do nothing;
    if not found then return; end if;
    perform public.work_log_add(p_work, 'asset', 'ربط «' || v_name || '» من المكتبة', jsonb_build_object('asset', p_asset));
  else
    delete from public.work_assets where work_id = p_work and asset_id = p_asset;
    if not found then return; end if;
    delete from public.work_approvals where work_id = p_work and part = 'a:' || p_asset;
    delete from public.work_flags where work_id = p_work and part = 'a:' || p_asset;
    perform public.work_log_add(p_work, 'asset_off', 'إزالة «' || v_name || '» من العمل', jsonb_build_object('asset', p_asset));
  end if;
  update public.works set updated_at = now() where id = p_work;
end
$$;

create function public.work_comment(p_work text, p_body text) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare me text := public.current_email(); w public.works; v_id uuid;
begin
  select * into w from public.works where id = p_work;
  if not found or not public.work_can_see(p_work) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if char_length(btrim(coalesce(p_body, ''))) = 0 then raise exception 'TEXT_REQUIRED' using errcode = 'P0001'; end if;
  insert into public.work_comments (work_id, author, body) values (p_work, me, left(btrim(p_body), 2000)) returning id into v_id;
  perform public.work_notify_many(array[w.assignee] || w.people, 'info',
    public.work_name(me) || ' علّق على «' || w.title || '».', public.work_go(p_work));
  return v_id;
end
$$;

-- ---------------------------------------------------------------------------
-- Review and decisions
-- ---------------------------------------------------------------------------
create function public.work_submit(p_work text, p_note text, p_channels uuid[], p_proposed timestamptz) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  me text := public.current_email(); w public.works; n int; pend text; cnt int; total int; v_assets uuid[];
begin
  select * into w from public.works where id = p_work for update;
  if not found or w.closed_at is not null or w.assignee is null or not (public.work_lead() or w.assignee = me) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  if w.status not in ('IN_PRODUCTION','CHANGES_REQUESTED') then raise exception 'STATUS_DENIED' using errcode = 'P0001'; end if;
  if public.work_publishable(w.type) then
    p_channels := coalesce(p_channels, '{}');
    if cardinality(p_channels) = 0 then raise exception 'CHANNEL_REQUIRED' using errcode = 'P0001'; end if;
    perform public.work_check_channels(p_channels);
    select coalesce(array_agg(asset_id), '{}') into v_assets from public.work_assets where work_id = p_work;
    if not public.work_youtube_ok(w.type, p_channels, v_assets) then raise exception 'YOUTUBE_VIDEO_ONLY' using errcode = 'P0001'; end if;
    if p_proposed is not null and p_proposed < now() then raise exception 'DATE_PAST' using errcode = 'P0001'; end if;
    update public.works set channels = p_channels, proposed_at = p_proposed where id = p_work;
  elsif w.type in ('press','email') and cardinality(w.channels) = 0 then
    update public.works set channels = array[(select a.id from public.platform_accounts a where a.platform = 'mail' and a.fixed limit 1)] where id = p_work;
  end if;
  if public.work_whole(w.type) then delete from public.work_approvals where work_id = p_work; end if;
  select count(*), string_agg(p.label, '، ') into cnt, pend from public.work_pending(p_work) p;
  if cnt = 0 then raise exception 'NOTHING_TO_REVIEW' using errcode = 'P0001'; end if;
  select count(*) into total from public.work_parts(p_work);
  n := coalesce((select max(c.n) from public.work_cycles c where c.work_id = p_work), 0) + 1;
  insert into public.work_cycles (work_id, n, sent_by, note) values (p_work, n, me, nullif(left(btrim(coalesce(p_note, '')), 1000), ''));
  update public.works set status = 'IN_REVIEW', review_cycle = n, updated_at = now() where id = p_work;
  if char_length(btrim(coalesce(p_note, ''))) > 0 then
    insert into public.work_comments (work_id, author, body) values (p_work, me, left(btrim(p_note), 2000));
  end if;
  perform public.work_log_add(p_work, 'submit', case when n > 1 then 'إعادة الإرسال للمراجعة' else 'إرسال العمل للمراجعة' end
    || ' (الدورة ' || n || '): ' || case when public.work_whole(w.type) then 'الحزمة كاملة' else pend end, jsonb_build_object('cycle', n));
  perform public.work_notify_many(public.work_deciders(p_work), 'decide', public.work_name(me)
    || case when n > 1 then ' أعاد «' else ' أرسل «' end || w.title || '» للمراجعة'
    || case when public.work_whole(w.type) then '' else ': ' || cnt || ' أجزاء' end || '.', jsonb_build_object('page','review','id',p_work));
  perform public.work_sync_assets(p_work);
  return jsonb_build_object('cycle', n, 'pending', cnt, 'total', total);
end
$$;

-- op: approve | changes | reject. Parts are keys from work_parts; a whole package
-- is decided as one. Changes and reject need a written note.
create function public.work_decide(p_work text, p_op text, p_parts text[], p_note text, p_close boolean) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  me text := public.current_email(); w public.works; blk text; keys text[]; labels text[]; done boolean := false;
  v_note text := nullif(left(btrim(coalesce(p_note, '')), 1000), '');
begin
  select * into w from public.works where id = p_work for update;
  if not found or not public.work_can_see(p_work) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  blk := public.work_decide_block(p_work);
  if blk is not null then raise exception '%', blk using errcode = 'P0001'; end if;

  if p_op = 'approve' then
    if public.work_whole(w.type) then
      select array_agg(p.key), array['الحزمة كاملة'] into keys, labels from public.work_parts(p_work) p;
    else
      select array_agg(p.key order by p.kind), array_agg(p.label order by p.kind) into keys, labels
        from public.work_pending(p_work) p where p.key = any (coalesce(p_parts, '{}'));
    end if;
    if keys is null then raise exception 'NO_PARTS' using errcode = 'P0001'; end if;
    insert into public.work_approvals (work_id, part, ver, approved_by, snap)
      select p_work, p.key, p.ver, me, p.snap from public.work_parts(p_work) p where p.key = any (keys)
      on conflict (work_id, part) do update set ver = excluded.ver, approved_by = excluded.approved_by,
        approved_at = now(), snap = excluded.snap;
    delete from public.work_flags where work_id = p_work and part = any (keys);
    insert into public.work_decisions (work_id, cycle, op, parts, labels, decided_by)
      values (p_work, w.review_cycle, 'approve', keys, labels, me);
    perform public.work_log_add(p_work, 'approve', 'اعتماد ' || array_to_string(labels, '، '), jsonb_build_object('parts', keys));
    done := public.work_finish_if_done(p_work);
    perform public.work_sync_assets(p_work);

  elsif p_op = 'changes' then
    if v_note is null then raise exception 'NOTE_REQUIRED' using errcode = 'P0001'; end if;
    if public.work_whole(w.type) then
      select array_agg(p.key), array['الحزمة كاملة'] into keys, labels from public.work_parts(p_work) p;
    else
      select array_agg(p.key order by p.ord), array_agg(p.label order by p.ord) into keys, labels
        from public.work_parts(p_work) p where p.key = any (coalesce(p_parts, '{}'));
    end if;
    if keys is null then raise exception 'NO_PARTS' using errcode = 'P0001'; end if;
    insert into public.work_flags (work_id, part, ver, note)
      select p_work, p.key, p.ver, v_note from public.work_parts(p_work) p where p.key = any (keys)
      on conflict (work_id, part) do update set ver = excluded.ver, note = excluded.note;
    insert into public.work_decisions (work_id, cycle, op, parts, labels, decided_by, note)
      values (p_work, w.review_cycle, 'changes', keys, labels, me, v_note);
    update public.works set status = 'CHANGES_REQUESTED', review_cycle = null, updated_at = now() where id = p_work;
    insert into public.work_comments (work_id, author, body)
      values (p_work, me, left('طلب تعديل على ' || array_to_string(labels, '، ') || ': ' || v_note, 2000));
    perform public.work_log_add(p_work, 'changes', 'طلب تعديل على «' || array_to_string(labels, '»، «') || '»', jsonb_build_object('parts', keys));
    perform public.work_notify(w.assignee, 'attention', public.work_name(me) || ' طلب تعديل «' || array_to_string(labels, '»، «')
      || '» في «' || w.title || '».', public.work_go(p_work));
    perform public.work_sync_assets(p_work);

  elsif p_op = 'reject' then
    if v_note is null then raise exception 'NOTE_REQUIRED' using errcode = 'P0001'; end if;
    insert into public.work_decisions (work_id, cycle, op, parts, labels, decided_by, note)
      values (p_work, w.review_cycle, 'reject', '{}', array['العمل كله'], me, v_note);
    update public.works set status = 'REJECTED', review_cycle = null, pending_sched = false, updated_at = now() where id = p_work;
    insert into public.work_comments (work_id, author, body) values (p_work, me, left('رفض العمل: ' || v_note, 2000));
    perform public.work_log_add(p_work, 'reject', 'رفض العمل: ' || v_note, '{}');
    if coalesce(p_close, false) then
      update public.works set closed_at = now(), closed_by = me, close_reason = left('رُفض: ' || v_note, 500) where id = p_work;
      perform public.work_log_add(p_work, 'close', 'إغلاق العمل بعد رفضه', '{}');
    end if;
    perform public.work_notify(w.assignee, 'attention', public.work_name(me) || ' رفض «' || w.title || '»: ' || v_note, public.work_go(p_work));
    perform public.work_sync_assets(p_work);
  else
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  return jsonb_build_object('finished', done, 'status', (select x.status from public.works x where x.id = p_work),
    'pending', (select count(*) from public.work_pending(p_work)));
end
$$;

-- ---------------------------------------------------------------------------
-- Publish dates: a move is a request; only «موعد النشر» goes back to review
-- ---------------------------------------------------------------------------
create function public.work_move_inner(p_work text, p_when timestamptz, p_reason text, p_schedule boolean) returns void
language plpgsql security definer set search_path = ''
as $$
declare me text := public.current_email(); w public.works; old timestamptz; n int; v_note text;
begin
  select * into w from public.works where id = p_work for update;
  old := coalesce(w.proposed_at, w.sched_at);
  n := coalesce((select max(c.n) from public.work_cycles c where c.work_id = p_work), 0) + 1;
  v_note := 'طلب نقل موعد النشر من ' || coalesce(public.work_when(old), 'بلا موعد') || ' إلى ' || public.work_when(p_when)
    || case when char_length(btrim(coalesce(p_reason, ''))) > 0 then ': ' || left(btrim(p_reason), 300) else '' end;
  insert into public.work_cycles (work_id, n, sent_by, note) values (p_work, n, me, v_note);
  update public.works set move_from = old, move_was_sched = (status = 'SCHEDULED'), move_by = me,
      pending_sched = coalesce(p_schedule, false) or status = 'SCHEDULED' or pending_sched,
      proposed_at = p_when,
      sched_at = case when coalesce(p_schedule, false) or status = 'SCHEDULED' or pending_sched then p_when else sched_at end,
      status = 'IN_REVIEW', review_cycle = n, confirm_pending = false, updated_at = now()
    where id = p_work;
  perform public.work_log_add(p_work, 'move', v_note || '. يُراجع «موعد النشر» وحده', jsonb_build_object('from', old, 'to', p_when));
  perform public.work_notify_many(public.work_deciders(p_work), 'decide', public.work_name(me) || ' طلب نقل موعد «' || w.title
    || '» إلى ' || public.work_when(p_when) || '.', jsonb_build_object('page','requests'));
  perform public.work_notify_many(public.work_publishers(), 'info', 'طلب نقل موعد «' || w.title || '» من '
    || coalesce(public.work_when(old), 'بلا موعد') || ' إلى ' || public.work_when(p_when) || '.', jsonb_build_object('page','calendar'));
end
$$;

create function public.work_request_move(p_work text, p_when timestamptz, p_reason text) returns void
language plpgsql security definer set search_path = ''
as $$
declare me text := public.current_email(); w public.works;
begin
  select * into w from public.works where id = p_work for update;
  if not found or w.closed_at is not null
     or not (public.work_lead() or w.assignee = me or public.work_publisher())
     or not (w.status = 'SCHEDULED' or (w.status = 'APPROVED' and w.proposed_at is not null)) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  if p_when is null or p_when < now() then raise exception 'DATE_PAST' using errcode = 'P0001'; end if;
  if p_when = coalesce(w.proposed_at, w.sched_at) then raise exception 'NO_CHANGE' using errcode = 'P0001'; end if;
  perform public.work_move_inner(p_work, p_when, p_reason, false);
end
$$;

create function public.work_cancel_move(p_work text) returns void
language plpgsql security definer set search_path = ''
as $$
declare me text := public.current_email(); w public.works;
begin
  select * into w from public.works where id = p_work for update;
  if not found or w.status <> 'IN_REVIEW' or w.move_from is null
     or (select count(*) from public.work_pending(p_work)) <> 1
     or not exists (select 1 from public.work_pending(p_work) p where p.key = 'date')
     or not (me = w.move_by or public.work_lead() or public.work_publisher()) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  insert into public.work_decisions (work_id, cycle, op, parts, labels, decided_by)
    values (p_work, w.review_cycle, 'withdraw', array['date'], array['موعد النشر'], me);
  update public.works set proposed_at = w.move_from,
      sched_at = case when w.move_was_sched then w.move_from else null end,
      status = case when w.move_was_sched then 'SCHEDULED' else 'APPROVED' end,
      pending_sched = false, review_cycle = null, move_from = null, move_by = null, move_was_sched = false, updated_at = now()
    where id = p_work;
  perform public.work_log_add(p_work, 'move_off', 'سحب طلب النقل. يبقى الموعد ' || public.work_when(w.move_from), '{}');
end
$$;

-- ---------------------------------------------------------------------------
-- Publishing (simulation): only the publisher, only on accounts they publish on
-- ---------------------------------------------------------------------------
create function public.work_may_publish(p_work text) returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.work_publisher() and (
    public.media_my_role() = 'admin'
    or not exists (select 1 from public.works w, unnest(w.channels) c
                   join public.platform_accounts a on a.id = c
                   where w.id = p_work and a.platform <> 'mail' and not (public.current_email() = any (a.publishers))))
$$;

-- Each account succeeds only if it is active and its authorisation covers the moment.
-- Accounts that already succeeded are never sent again.
create function public.work_run_publish(p_work text, p_channels uuid[], p_when timestamptz, p_label text) returns text
language plpgsql security definer set search_path = ''
as $$
declare w public.works; c uuid; ok boolean; res jsonb; good text[] := '{}'; bad text[] := '{}'; okn int; st text;
begin
  select * into w from public.works where id = p_work for update;
  res := w.results;
  foreach c in array p_channels loop
    select a.active and (a.authorized_until is null or a.authorized_until > p_when) into ok from public.platform_accounts a where a.id = c;
    ok := coalesce(ok, false);
    res := res || jsonb_build_object(c::text, jsonb_build_object('ok', ok, 'at', p_when,
      'why', case when ok then null else 'التفويض منتهٍ' end));
    if ok then good := good || public.work_account_name(c); else bad := bad || public.work_account_name(c); end if;
  end loop;
  select count(*) into okn from unnest(w.channels) x where coalesce((res->x::text->>'ok')::boolean, false);
  st := case when okn = cardinality(w.channels) then 'PUBLISHED' when okn > 0 then 'PARTIAL' else 'FAILED' end;
  update public.works set results = res, status = st, pub_at = p_when, sched_at = coalesce(sched_at, p_when),
      confirm_pending = false, updated_at = now()
    where id = p_work;
  perform public.work_log_add(p_work, 'publish', p_label || ': '
    || case when cardinality(good) > 0 then 'نجح ' || array_to_string(good, '، ') else '' end
    || case when cardinality(good) > 0 and cardinality(bad) > 0 then '، و' else '' end
    || case when cardinality(bad) > 0 then 'فشل ' || array_to_string(bad, '، ') else '' end,
    jsonb_build_object('status', st, 'simulated', true));
  perform public.work_notify(w.assignee, case when st = 'PUBLISHED' then 'info' else 'attention' end,
    '«' || w.title || '»: ' || public.work_status_ar(st) || '.', public.work_go(p_work));
  perform public.work_sync_assets(p_work);
  return st;
end
$$;

-- A time other than the approved one sends «موعد النشر» back for approval, and the work
-- is scheduled by itself when it is approved.
create function public.work_schedule(p_work text, p_when timestamptz, p_mode text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare w public.works; risky text[];
begin
  select * into w from public.works where id = p_work for update;
  if not found or w.closed_at is not null or not public.work_may_publish(p_work) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if w.status not in ('APPROVED','SCHEDULED') or w.confirm_pending then raise exception 'STATUS_DENIED' using errcode = 'P0001'; end if;
  if p_when is null or p_when < now() then raise exception 'DATE_PAST' using errcode = 'P0001'; end if;
  if p_mode is not null and p_mode not in ('auto','ask') then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  update public.works set pub_mode = coalesce(p_mode, pub_mode, 'auto') where id = p_work;
  select coalesce(array_agg(public.work_account_name(a.id)), '{}') into risky from public.platform_accounts a
    where a.id = any (w.channels) and not (a.active and (a.authorized_until is null or a.authorized_until > p_when));
  if w.proposed_at is not null and p_when <> w.proposed_at then
    perform public.work_move_inner(p_work, p_when, null, true);
    return jsonb_build_object('result', 'move', 'risky', risky);
  end if;
  update public.works set sched_at = p_when, status = 'SCHEDULED', updated_at = now() where id = p_work returning * into w;
  perform public.work_log_add(p_work, 'schedule', 'جدولة النشر ' || public.work_when(p_when)
    || case when w.pub_mode = 'ask' then '، بتأكيد قبل النشر' else '، نشر تلقائي' end, jsonb_build_object('at', p_when, 'mode', w.pub_mode));
  perform public.work_notify(w.assignee, 'info', 'جُدول «' || w.title || '» ' || public.work_when(p_when) || '.', public.work_go(p_work));
  perform public.work_sync_assets(p_work);
  return jsonb_build_object('result', 'scheduled', 'risky', risky);
end
$$;

-- op: now | confirm | decline | retry | unschedule
create function public.work_publish(p_work text, p_op text) returns text
language plpgsql security definer set search_path = ''
as $$
declare w public.works; failed uuid[];
begin
  select * into w from public.works where id = p_work for update;
  if not found or w.closed_at is not null or not public.work_may_publish(p_work) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if p_op = 'now' and w.status = 'APPROVED' then
    return public.work_run_publish(p_work, w.channels, now(),
      case when (select a.platform from public.platform_accounts a where a.id = w.channels[1]) = 'mail' then 'إرسال من البريد' else 'نشر الآن' end);
  elsif p_op = 'confirm' and w.status = 'SCHEDULED' and w.confirm_pending then
    return public.work_run_publish(p_work, w.channels, now(), 'تأكيد النشر عند الموعد');
  elsif p_op = 'decline' and w.status = 'SCHEDULED' and w.confirm_pending then
    update public.works set status = 'APPROVED', sched_at = null, confirm_pending = false, updated_at = now() where id = p_work;
    perform public.work_log_add(p_work, 'publish_no', 'لم يُؤكَّد النشر عند الموعد ' || public.work_when(w.sched_at) || '، فلم يُنشر وعاد «جاهز للنشر»', '{}');
    perform public.work_notify(w.assignee, 'attention', 'لم يُنشر «' || w.title || '» عند موعده بقرار مسؤول النشر.', public.work_go(p_work));
    perform public.work_sync_assets(p_work);
    return 'APPROVED';
  elsif p_op = 'retry' and w.status in ('PARTIAL','FAILED') then
    select coalesce(array_agg(c), '{}') into failed from unnest(w.channels) c where not coalesce((w.results->c::text->>'ok')::boolean, false);
    return public.work_run_publish(p_work, failed, now(), 'إعادة المحاولة لـ ' ||
      (select string_agg(public.work_account_name(c), '، ') from unnest(failed) c));
  elsif p_op = 'unschedule' and w.status = 'SCHEDULED' and not w.confirm_pending then
    update public.works set status = 'APPROVED', sched_at = null, updated_at = now() where id = p_work;
    perform public.work_log_add(p_work, 'unschedule', 'إلغاء جدولة ' || public.work_when(w.sched_at), '{}');
    perform public.work_sync_assets(p_work);
    return 'APPROVED';
  end if;
  raise exception 'STATUS_DENIED' using errcode = 'P0001';
end
$$;

-- There is no background worker: whoever has a page open runs this. Scheduled work whose
-- time has come is published (simulation), or waits for the publisher if it asks first.
create function public.work_due_run() returns int
language plpgsql security definer set search_path = ''
as $$
declare w public.works; n int := 0;
begin
  if not public.is_approved() then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  for w in select * from public.works where status = 'SCHEDULED' and not confirm_pending and closed_at is null
             and sched_at <= now() order by sched_at for update skip locked loop
    if w.pub_mode = 'ask' then
      update public.works set confirm_pending = true, updated_at = now() where id = w.id;
      perform public.work_log_add(w.id, 'due', 'حلّ موعد النشر ' || public.work_when(w.sched_at) || ': ينتظر تأكيد مسؤول النشر', '{}');
      perform public.work_notify_many(public.work_publishers(), 'decide', 'حلّ موعد «' || w.title || '». أكّد النشر أو ألغه.',
        jsonb_build_object('page','approvals','tab','publish'));
    else
      perform public.work_run_publish(w.id, w.channels, w.sched_at, 'حلّ موعد النشر ' || public.work_when(w.sched_at) || ' (محاكاة)');
    end if;
    n := n + 1;
  end loop;
  return n;
end
$$;

-- ---------------------------------------------------------------------------
-- Extension and folder access requests
-- ---------------------------------------------------------------------------
-- What moves if a stage ends on p_to instead: every stage downstream of it is pushed
-- so it starts no earlier than what it waits for ends. Read only, for the preview too.
create function public.work_step_impact(p_stage uuid, p_to date) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  s0 public.work_stages; w public.works; s public.work_stages; ends jsonb; deps int[]; need date; e date; j int;
  sh int; nd date; shifts jsonb := '[]'; max_end date := p_to; pub date;
begin
  select * into s0 from public.work_stages where id = p_stage;
  if not found or not public.work_can_see(s0.work_id) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  select * into w from public.works where id = s0.work_id;
  ends := jsonb_build_object(s0.pos::text, p_to);
  deps := array[s0.pos];
  for s in select * from public.work_stages x where x.work_id = w.id and x.pos > s0.pos order by x.pos loop
    if not (s.after_pos && deps) then continue; end if;
    deps := deps || s.pos;
    if s.done_at is not null or s.start_on is null then
      ends := ends || jsonb_build_object(s.pos::text, s.due_on);
      continue;
    end if;
    need := s.start_on;
    foreach j in array s.after_pos loop
      e := coalesce(nullif(ends->>j::text, '')::date, (select x.due_on from public.work_stages x where x.work_id = w.id and x.pos = j));
      if e is not null and e > need then need := e; end if;
    end loop;
    if need > s.start_on then
      sh := need - s.start_on;
      nd := case when s.due_on is null then null else s.due_on + sh end;
      shifts := shifts || jsonb_build_object('stage', s.id, 'name', s.name, 'who', s.who,
        'from', jsonb_build_array(s.start_on, s.due_on), 'to', jsonb_build_array(need, nd));
      ends := ends || jsonb_build_object(s.pos::text, nd);
      if nd is not null and nd > max_end then max_end := nd; end if;
    else
      ends := ends || jsonb_build_object(s.pos::text, s.due_on);
    end if;
  end loop;
  pub := (coalesce(w.sched_at, w.proposed_at) at time zone 'Asia/Riyadh')::date;
  return jsonb_build_object('shifts', shifts, 'max_end', max_end, 'over_due', max_end > w.due,
    'over_pub', pub is not null and max_end > pub, 'pub_day', pub);
end
$$;

-- Tasks: a task waiting for another moves by as many days as it would now overlap.
create function public.work_task_impact(p_task uuid, p_to timestamptz) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  t public.media_tasks; x public.media_tasks; ends jsonb; q uuid[]; cur uuid; st date; need date; sh int; shifts jsonb := '[]';
  nd timestamptz;
begin
  select * into t from public.media_tasks where id = p_task;
  if not found then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  ends := jsonb_build_object(t.id::text, (p_to at time zone 'Asia/Riyadh')::date);
  q := array[t.id];
  while cardinality(q) > 0 loop
    cur := q[1]; q := q[2:];
    for x in select * from public.media_tasks m where m.status <> 'done' and cur = any (m.after_ids) loop
      if ends ? x.id::text then continue; end if;
      st := coalesce(x.start_on, (x.due at time zone 'Asia/Riyadh')::date);
      need := (ends->>cur::text)::date;
      if need >= st then
        sh := need - st + 1;
        nd := x.due + make_interval(days => sh);
        shifts := shifts || jsonb_build_object('task', x.id, 'what', x.what, 'who', x.assignee,
          'from', jsonb_build_array(x.start_on, x.due), 'to', jsonb_build_array(x.start_on + sh, nd));
        ends := ends || jsonb_build_object(x.id::text, (nd at time zone 'Asia/Riyadh')::date);
        q := q || x.id;
      end if;
    end loop;
  end loop;
  return jsonb_build_object('shifts', shifts, 'max_end', (p_to at time zone 'Asia/Riyadh')::date, 'over_due', false, 'over_pub', false);
end
$$;

create function public.request_extension(p_stage uuid, p_task uuid, p_to timestamptz, p_reason text) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare me text := public.current_email(); s public.work_stages; w public.works; t public.media_tasks; v_id uuid; cur timestamptz;
begin
  if char_length(btrim(coalesce(p_reason, ''))) = 0 then raise exception 'REASON_REQUIRED' using errcode = 'P0001'; end if;
  if (p_stage is null) = (p_task is null) or p_to is null then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if p_stage is not null then
    select * into s from public.work_stages where id = p_stage;
    select * into w from public.works where id = s.work_id;
    if not found or s.done_at is not null or w.closed_at is not null or s.who is distinct from me then
      raise exception 'FORBIDDEN' using errcode = 'P0001';
    end if;
    cur := coalesce(s.due_on, w.due)::timestamptz;
    if (p_to at time zone 'Asia/Riyadh')::date <= coalesce(s.due_on, w.due) then raise exception 'DATE_NOT_LATER' using errcode = 'P0001'; end if;
    insert into public.work_requests (kind, requested_by, stage_id, from_at, to_at, reason)
      values ('extension', me, p_stage, cur, p_to, left(btrim(p_reason), 500)) returning id into v_id;
    perform public.work_log_add(w.id, 'extension', 'طلب تمديد «' || s.name || '» إلى ' || (p_to at time zone 'Asia/Riyadh')::date, jsonb_build_object('request', v_id));
    perform public.work_notify_many(public.work_leaders() || array[w.assignee], 'decide',
      'طلب ' || public.work_name(me) || ' تمديد «' || s.name || '» في «' || w.title || '» إلى ' || (p_to at time zone 'Asia/Riyadh')::date || '.',
      jsonb_build_object('page','requests'));
  else
    select * into t from public.media_tasks where id = p_task;
    if not found or t.status = 'done' or t.assignee is distinct from me then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
    if p_to <= t.due then raise exception 'DATE_NOT_LATER' using errcode = 'P0001'; end if;
    insert into public.work_requests (kind, requested_by, task_id, from_at, to_at, reason)
      values ('extension', me, p_task, t.due, p_to, left(btrim(p_reason), 500)) returning id into v_id;
    perform public.work_notify_many(public.work_leaders() || array[t.assigned_by], 'decide',
      'طلب ' || public.work_name(me) || ' تمديد مهمة «' || t.what || '» إلى ' || public.work_when(p_to) || '.', jsonb_build_object('page','requests'));
  end if;
  return v_id;
end
$$;

create function public.request_folder_access(p_folder uuid, p_reason text) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare me text := public.current_email(); v_id uuid; v_name text;
begin
  if char_length(btrim(coalesce(p_reason, ''))) = 0 then raise exception 'REASON_REQUIRED' using errcode = 'P0001'; end if;
  select f.name into v_name from public.media_folders f where f.id = p_folder;
  if v_name is null or not public.is_approved() then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if public.media_my_level(p_folder) >= 1 then raise exception 'ALREADY_HAS_ACCESS' using errcode = 'P0001'; end if;
  if exists (select 1 from public.work_requests r where r.kind = 'access' and r.folder_id = p_folder and r.requested_by = me and r.status = 'pending') then
    raise exception 'ALREADY_PENDING' using errcode = 'P0001';
  end if;
  insert into public.work_requests (kind, requested_by, folder_id, reason) values ('access', me, p_folder, left(btrim(p_reason), 500))
    returning id into v_id;
  perform public.work_notify_many(public.work_leaders(), 'decide', 'طلب وصول إلى مجلد «' || v_name || '» من ' || public.work_name(me) || '.',
    jsonb_build_object('page','requests'));
  return v_id;
end
$$;

-- Approve or decline. An approved extension moves what follows and tells its owners;
-- the approver may also move the final due date when the plan now runs past it.
create function public.request_decide(p_id uuid, p_approve boolean, p_note text, p_extend_work boolean) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  me text := public.current_email(); q public.work_requests; s public.work_stages; w public.works; t public.media_tasks;
  im jsonb; x jsonb; ok boolean; title text; v_to date;
begin
  select * into q from public.work_requests where id = p_id for update;
  if not found or q.status <> 'pending' or q.requested_by = me then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if q.stage_id is not null then
    select * into s from public.work_stages where id = q.stage_id;
    select * into w from public.works where id = s.work_id for update;
    ok := public.work_lead() or w.assignee = me;
    title := 'طلب تمديد «' || s.name || '» في «' || w.title || '»';
  elsif q.task_id is not null then
    select * into t from public.media_tasks where id = q.task_id for update;
    ok := public.work_lead() or t.assigned_by = me;
    title := 'طلب تمديد مهمة «' || t.what || '»';
  else
    ok := public.work_lead() or public.media_my_level(q.folder_id) >= 4;
    title := 'طلب وصول إلى مجلد «' || (select f.name from public.media_folders f where f.id = q.folder_id) || '»';
  end if;
  if not ok then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;

  update public.work_requests set status = case when p_approve then 'approved' else 'declined' end, decided_by = me,
      decided_at = now(), decision_note = nullif(left(btrim(coalesce(p_note, '')), 500), ''),
      extend_work = coalesce(p_extend_work, false)
    where id = p_id;

  if p_approve and q.stage_id is not null then
    v_to := (q.to_at at time zone 'Asia/Riyadh')::date;
    im := public.work_step_impact(q.stage_id, v_to);
    update public.work_stages set due_on = v_to where id = q.stage_id;
    for x in select e from jsonb_array_elements(im->'shifts') e loop
      update public.work_stages set start_on = (x->'to'->>0)::date, due_on = nullif(x->'to'->>1, '')::date where id = (x->>'stage')::uuid;
      perform public.work_notify(x->>'who', 'attention', 'تحرّك موعد مرحلتك في «' || w.title || '» بعد تمديد «' || s.name || '».', public.work_go(w.id));
    end loop;
    if (im->>'over_due')::boolean and coalesce(p_extend_work, false) then
      perform public.work_log_add(w.id, 'due', 'مدّ التسليم النهائي من ' || w.due || ' إلى ' || (im->>'max_end'), '{}');
      update public.works set due = (im->>'max_end')::date where id = w.id;
    end if;
    update public.works set updated_at = now() where id = w.id;
    perform public.work_log_add(w.id, 'extension_ok', 'اعتماد تمديد «' || s.name || '» من ' || coalesce(s.due_on::text, 'بلا موعد') || ' إلى ' || v_to
      || case when jsonb_array_length(im->'shifts') > 0 then '، وتحرّكت ' || (select string_agg('«' || (e->>'name') || '»', ' و') from jsonb_array_elements(im->'shifts') e) else '' end,
      jsonb_build_object('request', p_id));
  elsif p_approve and q.task_id is not null then
    im := public.work_task_impact(q.task_id, q.to_at);
    update public.media_tasks set due = q.to_at where id = q.task_id;
    for x in select e from jsonb_array_elements(im->'shifts') e loop
      update public.media_tasks set start_on = nullif(x->'to'->>0, '')::date, due = (x->'to'->>1)::timestamptz where id = (x->>'task')::uuid;
      perform public.work_notify(x->>'who', 'attention', 'تحرّك موعد مهمتك بعد تمديد «' || t.what || '».', jsonb_build_object('page','tasks'));
    end loop;
  elsif p_approve then
    if not exists (select 1 from public.media_grants g where g.folder_id = q.folder_id and g.subject_type = 'person' and g.subject = q.requested_by) then
      insert into public.media_grants (folder_id, subject_type, subject, level) values (q.folder_id, 'person', q.requested_by, 1);
    end if;
  end if;
  perform public.work_notify(q.requested_by, 'info', title || ': ' || case when p_approve then 'اعتُمد' else 'لم يُعتمد' end
    || ' من ' || public.work_name(me) || case when char_length(btrim(coalesce(p_note, ''))) > 0 then ' («' || left(btrim(p_note), 200) || '»)' else '' end || '.',
    jsonb_build_object('page','requests'));
  return coalesce(im, '{}'::jsonb);
end
$$;

create function public.request_withdraw(p_id uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  update public.work_requests set status = 'withdrawn', decided_by = public.current_email(), decided_at = now()
    where id = p_id and status = 'pending' and requested_by = public.current_email();
  if not found then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Connected accounts
-- ---------------------------------------------------------------------------
create function public.account_manager() returns boolean
language sql stable security definer set search_path = ''
as $$ select public.media_acts(array['director','assistant']) $$;

-- Works an account is part of an approval or schedule for: it cannot be stopped or deleted.
create function public.account_busy(p_id uuid) returns text[]
language sql stable security definer set search_path = ''
as $$
  select coalesce(array_agg(w.id order by w.no), '{}') from public.works w
  where p_id = any (w.channels) and w.closed_at is null and w.status in ('APPROVED','SCHEDULED','IN_REVIEW')
$$;

-- p: {platform, label, handle, purpose, publishers[], mode}
create function public.account_save(p_id uuid, p jsonb) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  me text := public.current_email(); a public.platform_accounts; v_pub text[]; v_handle text; v_id uuid; w public.works;
  reopened text[] := '{}';
begin
  if not public.account_manager() then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if char_length(btrim(coalesce(p->>'label', ''))) not between 1 and 60 then raise exception 'LABEL_REQUIRED' using errcode = 'P0001'; end if;
  select coalesce(array_agg(distinct x.e), '{}') into v_pub
    from jsonb_array_elements_text(coalesce(p->'publishers', '[]'::jsonb)) x(e) join public.accounts c on c.email = x.e and c.role <> 'member';
  if p_id is not null then select * into a from public.platform_accounts where id = p_id for update; end if;
  if cardinality(v_pub) = 0 and coalesce(a.platform, p->>'platform') <> 'mail' then raise exception 'PUBLISHER_REQUIRED' using errcode = 'P0001'; end if;
  v_handle := nullif(btrim(coalesce(p->>'handle', '')), '');
  if p_id is null then
    if p->>'platform' not in ('instagram','x','linkedin','youtube') then raise exception 'PLATFORM_INVALID' using errcode = 'P0001'; end if;
    if v_handle is null then raise exception 'HANDLE_REQUIRED' using errcode = 'P0001'; end if;
    if exists (select 1 from public.platform_accounts x where x.platform = p->>'platform' and lower(x.handle) = lower(v_handle)) then
      raise exception 'HANDLE_TAKEN' using errcode = 'P0001';
    end if;
    -- Linking is simulated: the authorisation runs 60 days.
    insert into public.platform_accounts (platform, label, handle, purpose, authorized_until, publishers, mode, added_by)
    values (p->>'platform', btrim(p->>'label'), v_handle, nullif(left(btrim(coalesce(p->>'purpose', '')), 200), ''),
            now() + interval '60 days', v_pub, case when p->>'mode' = 'ask' then 'ask' else 'auto' end, me)
    returning id into v_id;
    perform public.work_notify_many(v_pub, 'info', public.work_name(me) || ' ربط حساب «' || public.work_account_name(v_id)
      || '» وجعلك ممن ينشر عليه.', jsonb_build_object('page','accounts'));
    return v_id;
  end if;
  if not found then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if a.fixed then v_handle := a.handle; end if;
  if v_handle is null and a.platform <> 'mail' then raise exception 'HANDLE_REQUIRED' using errcode = 'P0001'; end if;
  if v_handle is not null and exists (select 1 from public.platform_accounts x where x.id <> p_id and x.platform = a.platform and lower(x.handle) = lower(v_handle)) then
    raise exception 'HANDLE_TAKEN' using errcode = 'P0001';
  end if;
  update public.platform_accounts set label = btrim(p->>'label'), handle = v_handle,
      purpose = nullif(left(btrim(coalesce(p->>'purpose', '')), 200), ''), publishers = v_pub,
      mode = case when p->>'mode' = 'ask' then 'ask' else 'auto' end
    where id = p_id;
  -- Approval binds to the handle: renaming it re-opens «المنصات والحسابات».
  if v_handle is distinct from a.handle then
    for w in select * from public.works x where p_id = any (x.channels) and x.closed_at is null loop
      if public.work_reopen_after_change(w.id, 'تغيّر اسم حساب ' || public.work_account_name(p_id) || ' من ' || coalesce(a.handle, '') || ' إلى ' || v_handle) then
        reopened := reopened || w.id;
      end if;
    end loop;
  end if;
  return p_id;
end
$$;

create function public.account_set_active(p_id uuid, p_active boolean) returns void
language plpgsql security definer set search_path = ''
as $$
declare a public.platform_accounts;
begin
  select * into a from public.platform_accounts where id = p_id for update;
  if not found or a.fixed or not public.account_manager() then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if not p_active and cardinality(public.account_busy(p_id)) > 0 then raise exception 'ACCOUNT_IN_USE' using errcode = 'P0001'; end if;
  update public.platform_accounts set active = p_active where id = p_id;
end
$$;

create function public.account_delete(p_id uuid) returns int
language plpgsql security definer set search_path = ''
as $$
declare a public.platform_accounts; w public.works; n int := 0; v_name text;
begin
  select * into a from public.platform_accounts where id = p_id for update;
  if not found or a.fixed or not public.account_manager() then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if cardinality(public.account_busy(p_id)) > 0 then raise exception 'ACCOUNT_IN_USE' using errcode = 'P0001'; end if;
  v_name := public.work_account_name(p_id);
  for w in select * from public.works x where p_id = any (x.channels) loop
    update public.works set channels = array_remove(channels, p_id), updated_at = now() where id = w.id;
    perform public.work_log_add(w.id, 'account_off', 'أُزيل حساب «' || v_name || '» بعد حذفه', '{}');
    n := n + 1;
  end loop;
  delete from public.platform_accounts where id = p_id;
  return n;
end
$$;

-- Reconnecting is simulated: the authorisation runs 60 days from now.
create function public.account_reconnect(p_id uuid) returns timestamptz
language plpgsql security definer set search_path = ''
as $$
declare v timestamptz;
begin
  if not (public.account_manager() or public.work_publisher()) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  update public.platform_accounts set authorized_until = now() + interval '60 days'
    where id = p_id and platform <> 'mail' returning authorized_until into v;
  if v is null then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  return v;
end
$$;

-- ---------------------------------------------------------------------------
-- Projects, events, reminders, templates
-- ---------------------------------------------------------------------------
-- p: {name, type, start, end, owner, description}
create function public.project_save(p_id uuid, p jsonb) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare me text := public.current_email(); v_id uuid; old_owner text;
begin
  if not public.work_lead() then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if char_length(btrim(coalesce(p->>'name', ''))) not between 1 and 120 then raise exception 'NAME_REQUIRED' using errcode = 'P0001'; end if;
  if nullif(p->>'start', '') is null or nullif(p->>'end', '') is null or (p->>'start')::date > (p->>'end')::date then
    raise exception 'DATES_INVALID' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.accounts a where a.email = p->>'owner' and a.role <> 'member') then
    raise exception 'PERSON_INVALID' using errcode = 'P0001';
  end if;
  if p_id is null then
    insert into public.projects (name, type, start_on, end_on, owner, description, created_by)
    values (btrim(p->>'name'), case when p->>'type' in ('campaign','event','initiative','other') then p->>'type' else 'campaign' end,
            (p->>'start')::date, (p->>'end')::date, p->>'owner', nullif(left(btrim(coalesce(p->>'description', '')), 2000), ''), me)
    returning id into v_id;
  else
    select owner into old_owner from public.projects where id = p_id for update;
    if not found then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
    update public.projects set name = btrim(p->>'name'),
        type = case when p->>'type' in ('campaign','event','initiative','other') then p->>'type' else type end,
        start_on = (p->>'start')::date, end_on = (p->>'end')::date, owner = p->>'owner',
        description = nullif(left(btrim(coalesce(p->>'description', '')), 2000), '')
      where id = p_id;
    v_id := p_id;
  end if;
  if old_owner is distinct from p->>'owner' then
    perform public.work_notify(p->>'owner', 'attention', public.work_name(me) || ' جعلك مسؤولاً عن مشروع «' || btrim(p->>'name') || '».',
      jsonb_build_object('page','project','id',v_id));
  end if;
  return v_id;
end
$$;

-- p: {title, start, end, place, project}
create function public.event_save(p_id uuid, p jsonb) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare me text := public.current_email(); v_id uuid; e public.events;
begin
  if not public.is_approved() or public.media_my_role() = 'member' then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if char_length(btrim(coalesce(p->>'title', ''))) not between 1 and 140 then raise exception 'TITLE_REQUIRED' using errcode = 'P0001'; end if;
  if nullif(p->>'start', '') is null or nullif(p->>'end', '') is null or (p->>'start')::timestamptz > (p->>'end')::timestamptz then
    raise exception 'DATES_INVALID' using errcode = 'P0001';
  end if;
  if p_id is null then
    insert into public.events (title, start_at, end_at, place, project_id, created_by)
    values (btrim(p->>'title'), (p->>'start')::timestamptz, (p->>'end')::timestamptz,
            nullif(left(btrim(coalesce(p->>'place', '')), 120), ''), nullif(p->>'project', '')::uuid, me)
    returning id into v_id;
    return v_id;
  end if;
  select * into e from public.events where id = p_id for update;
  if not found or not (e.created_by = me or public.work_lead()) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  update public.events set title = btrim(p->>'title'), start_at = (p->>'start')::timestamptz, end_at = (p->>'end')::timestamptz,
      place = nullif(left(btrim(coalesce(p->>'place', '')), 120), ''), project_id = nullif(p->>'project', '')::uuid
    where id = p_id;
  return p_id;
end
$$;

create function public.event_delete(p_id uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  delete from public.events where id = p_id and (created_by = public.current_email() or public.work_lead());
  if not found then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
end
$$;

create function public.reminder_add(p_at timestamptz, p_body text) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare v_id uuid;
begin
  if not public.is_approved() then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if p_at is null or char_length(btrim(coalesce(p_body, ''))) = 0 then raise exception 'TEXT_REQUIRED' using errcode = 'P0001'; end if;
  insert into public.reminders (owner, at, body) values (public.current_email(), p_at, left(btrim(p_body), 300)) returning id into v_id;
  return v_id;
end
$$;

create function public.reminder_delete(p_id uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  delete from public.reminders where id = p_id and owner = public.current_email();
  if not found then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
end
$$;

-- rows: [{n, role, days, after:[int], gate, note}]
create function public.plan_template_save(p_name text, p_type text, p_rows jsonb) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare v_id uuid; r jsonb; i int := 0; j int;
begin
  if not public.work_lead() then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if char_length(btrim(coalesce(p_name, ''))) not between 1 and 80 then raise exception 'NAME_REQUIRED' using errcode = 'P0001'; end if;
  if p_type not in ('post','video','design','announce','email','press','event') then raise exception 'TYPE_INVALID' using errcode = 'P0001'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) not between 1 and 40 then raise exception 'PLAN_INVALID' using errcode = 'P0001'; end if;
  for r in select x from jsonb_array_elements(p_rows) x loop
    if char_length(btrim(coalesce(r->>'n', ''))) not between 1 and 80 then raise exception 'PLAN_NAME' using errcode = 'P0001'; end if;
    for j in select (x)::int from jsonb_array_elements_text(coalesce(r->'after', '[]'::jsonb)) x loop
      if j < 0 or j >= i then raise exception 'PLAN_ORDER' using errcode = 'P0001'; end if;
    end loop;
    i := i + 1;
  end loop;
  insert into public.plan_templates (name, type, rows, created_by) values (btrim(p_name), p_type, p_rows, public.current_email())
    returning id into v_id;
  return v_id;
end
$$;

create function public.plan_template_delete(p_id uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.work_lead() then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  delete from public.plan_templates where id = p_id;
end
$$;

-- ---------------------------------------------------------------------------
-- Tasks with start dates, waits and groups
-- ---------------------------------------------------------------------------
-- p: {what, kind, assignee, due, start, after[], project, work, note, group, priority, asset}
-- Leaders and the producer give tasks to others; everyone else makes tasks for themselves.
create function public.task_create(p jsonb) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare me text := public.current_email(); v_to text := nullif(p->>'assignee', ''); v_after uuid[]; v_id uuid; v_work text;
begin
  if not public.is_approved() then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if char_length(btrim(coalesce(p->>'what', ''))) not between 1 and 140 then raise exception 'TEXT_REQUIRED' using errcode = 'P0001'; end if;
  if v_to is null then v_to := me; end if;
  if v_to <> me and not public.media_acts(array['director','assistant','producer']) then raise exception 'TASK_ROLE' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.accounts a where a.email = v_to) then raise exception 'PERSON_INVALID' using errcode = 'P0001'; end if;
  if nullif(p->>'due', '') is null then raise exception 'DUE_REQUIRED' using errcode = 'P0001'; end if;
  if nullif(p->>'start', '') is not null and (p->>'start')::date > ((p->>'due')::timestamptz at time zone 'Asia/Riyadh')::date then
    raise exception 'DATES_INVALID' using errcode = 'P0001';
  end if;
  select coalesce(array_agg(x::uuid), '{}') into v_after from jsonb_array_elements_text(coalesce(p->'after', '[]'::jsonb)) x;
  if exists (select 1 from unnest(v_after) x where not exists (select 1 from public.media_tasks t where t.id = x)) then
    raise exception 'TASK_INVALID' using errcode = 'P0001';
  end if;
  v_work := nullif(p->>'work', '');
  if v_work is not null and not public.work_can_see(v_work) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if nullif(p->>'asset', '') is not null and public.media_asset_level((p->>'asset')::uuid) < 1 then raise exception 'ASSET_DENIED' using errcode = 'P0001'; end if;
  insert into public.media_tasks (asset_id, what, kind, assignee, assigned_by, due, priority, note, start_on, after_ids, group_key, project_id, work_id)
  values (nullif(p->>'asset', '')::uuid, btrim(p->>'what'),
    case when p->>'kind' in ('copy','design','edit','review','publish','other') then p->>'kind' else 'other' end,
    v_to, me, (p->>'due')::timestamptz, case when p->>'priority' = 'urgent' then 'urgent' else 'normal' end,
    nullif(left(btrim(coalesce(p->>'note', '')), 500), ''), nullif(p->>'start', '')::date, v_after,
    nullif(left(p->>'group', 40), ''), nullif(p->>'project', '')::uuid, v_work)
  returning id into v_id;
  return v_id;
end
$$;

create function public.task_ready(p_task uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select not exists (select 1 from public.media_tasks t, unnest(t.after_ids) x
                     join public.media_tasks o on o.id = x where t.id = p_task and o.status <> 'done')
$$;

-- The shared task list tells people: a new task, and «صار دورك» when what it waited for is done.
create function public.task_notify() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare x public.media_tasks;
begin
  if tg_op = 'INSERT' then
    if new.assignee <> new.assigned_by then
      perform public.work_notify(new.assignee, case when public.task_ready(new.id) then 'attention' else 'info' end,
        public.work_name(new.assigned_by) || ' أسند إليك: «' || new.what || '»'
        || case when public.task_ready(new.id) then '' else '، وتبدأ بعد إنجاز ما تنتظره' end || '.', jsonb_build_object('page','tasks'));
    end if;
  elsif new.status = 'done' and old.status <> 'done' then
    perform public.work_notify(new.assigned_by, 'info', public.work_name(new.assignee) || ' أنجز «' || new.what || '».', jsonb_build_object('page','tasks'));
    for x in select * from public.media_tasks t where t.status <> 'done' and new.id = any (t.after_ids) loop
      if public.task_ready(x.id) then
        perform public.work_notify(x.assignee, 'attention', 'صار دورك: «' || x.what || '» بعد أن أنجز ' || public.work_name(new.assignee)
          || ' «' || new.what || '».', jsonb_build_object('page','tasks'));
      end if;
    end loop;
  end if;
  return new;
end
$$;
create trigger media_tasks_notify after insert or update on public.media_tasks
  for each row execute function public.task_notify();

-- ---------------------------------------------------------------------------
-- Load: open stages and tasks per person, for the team view and automatic assignment.
-- Counts only, so a restricted work shows as load without its details.
-- ---------------------------------------------------------------------------
create function public.work_people_load()
returns table (email text, display_name text, role text, active_works int, late_works int, open_stages int,
               late_stages int, open_tasks int, late_tasks int)
language sql stable security definer set search_path = ''
as $$
  select a.email, a.display_name, a.role,
    (select count(*)::int from public.works w where w.assignee = a.email and w.closed_at is null
       and w.status in ('DRAFT','IN_PRODUCTION','IN_REVIEW','CHANGES_REQUESTED','REJECTED')),
    (select count(*)::int from public.works w where w.assignee = a.email and w.closed_at is null
       and w.status in ('DRAFT','IN_PRODUCTION','IN_REVIEW','CHANGES_REQUESTED','REJECTED') and w.due < public.work_today()),
    (select count(*)::int from public.work_stages s join public.works w on w.id = s.work_id
       where s.who = a.email and s.done_at is null and w.closed_at is null
         and w.status in ('DRAFT','IN_PRODUCTION','IN_REVIEW','CHANGES_REQUESTED','REJECTED')),
    (select count(*)::int from public.work_stages s join public.works w on w.id = s.work_id
       where s.who = a.email and s.done_at is null and w.closed_at is null and s.due_on < public.work_today()
         and w.status in ('DRAFT','IN_PRODUCTION','IN_REVIEW','CHANGES_REQUESTED','REJECTED')),
    (select count(*)::int from public.media_tasks t where t.assignee = a.email and t.status <> 'done'),
    (select count(*)::int from public.media_tasks t where t.assignee = a.email and t.status <> 'done' and t.due < now())
  from public.accounts a
  where a.role <> 'admin' and public.is_approved()
$$;

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------
-- Null marks every notification of the caller as read.
create function public.notifications_read(p_ids uuid[]) returns int
language plpgsql security definer set search_path = ''
as $$
declare n int;
begin
  update public.notifications set read_at = now()
    where recipient = public.current_email() and read_at is null and (p_ids is null or id = any (p_ids));
  get diagnostics n = row_count;
  return n;
end
$$;

-- ---------------------------------------------------------------------------
-- The library and the works decide together: approving, sending back or replacing a
-- file in the library, mail or messaging does the same in every work it belongs to.
-- ---------------------------------------------------------------------------
-- The media guard, as before, plus: nobody approves a file version they uploaded.
create or replace function public.media_files_guard() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  actor text := public.current_email();
  creative text[] := array['writer','designer','producer','assistant','director'];
  lvl_old int; lvl_new int; edit_ok boolean; asset_locked boolean; ok boolean;
begin
  if tg_op = 'INSERT' then
    if actor is null then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
    new.uploaded_by := actor;
    new.stage := 'draft'; new.current_version := 1; new.approved_version := null; new.schedule := null;
    return new;
  end if;

  if current_setting('app.media_internal', true) = '1' then return new; end if;
  if actor is null then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;

  lvl_old := public.media_level(actor, old.folder_id);
  edit_ok := lvl_old >= 2 and (public.media_locked_by(old.folder_id) is null or lvl_old >= 4);
  asset_locked := old.approved_version is not null and old.stage in ('ready','scheduled','published');

  if new.id is distinct from old.id or new.drive_file_id is distinct from old.drive_file_id
     or new.uploaded_by is distinct from old.uploaded_by or new.current_version is distinct from old.current_version
     or new.size_bytes is distinct from old.size_bytes or new.mime_type is distinct from old.mime_type
     or new.kind is distinct from old.kind or new.created_at is distinct from old.created_at then
    raise exception 'IMMUTABLE_COLUMN' using errcode = 'P0001';
  end if;

  if new.name is distinct from old.name and (not edit_ok or asset_locked) then
    raise exception 'NAME_LOCKED' using errcode = 'P0001';
  end if;
  if (new.tags is distinct from old.tags or new.work_ref is distinct from old.work_ref
      or new.channels is distinct from old.channels or new.dims is distinct from old.dims
      or new.duration is distinct from old.duration) and (not edit_ok or asset_locked) then
    raise exception 'EDIT_LOCKED' using errcode = 'P0001';
  end if;
  if new.folder_id is distinct from old.folder_id then
    lvl_new := public.media_level(actor, new.folder_id);
    if not edit_ok or asset_locked or lvl_new < 2
       or (public.media_locked_by(new.folder_id) is not null and lvl_new < 4) then
      raise exception 'MOVE_DENIED' using errcode = 'P0001';
    end if;
  end if;

  if new.copy is distinct from old.copy then
    if not (public.media_acts(array['writer','assistant','director','publisher']) and lvl_old >= 1) then
      raise exception 'COPY_DENIED' using errcode = 'P0001';
    end if;
    new.checklist := jsonb_set(new.checklist, '{copy}', to_jsonb(new.copy <> '{}'::jsonb));
  end if;

  if new.stage is distinct from old.stage then
    if old.stage = 'draft' and new.stage = 'production' then
      ok := public.media_acts(creative) and edit_ok;
    elsif new.stage = 'review' and old.stage in ('draft','production','changes') then
      ok := public.media_acts(creative) and edit_ok;
    elsif old.stage = 'review' and new.stage in ('ready','changes','rejected')
          and exists (select 1 from public.media_versions v where v.asset_id = old.id
                      and v.version = old.current_version and v.uploaded_by = actor) then
      raise exception 'SELF_APPROVAL' using errcode = 'P0001';
    elsif old.stage = 'review' and new.stage = 'ready' then
      ok := public.media_acts(array['director','assistant']) and lvl_old >= 1;
      new.approved_version := old.current_version;
      new.checklist := jsonb_set(new.checklist, '{review}', 'true'::jsonb);
    elsif old.stage = 'review' and new.stage = 'changes' then
      ok := public.media_acts(array['director','assistant']) and lvl_old >= 1;
    elsif old.stage = 'review' and new.stage = 'rejected' then
      ok := public.media_acts(array['director']) and lvl_old >= 1;
    elsif old.stage = 'rejected' and new.stage in ('draft','production') then
      ok := public.media_acts(creative) and edit_ok;
    elsif old.stage in ('ready','scheduled') and new.stage in ('scheduled','published','partial','failed') then
      ok := public.media_acts(array['publisher']) and lvl_old >= 1;
    elsif old.stage in ('partial','failed') and new.stage in ('scheduled','published','partial','failed') then
      ok := public.media_acts(array['publisher']) and lvl_old >= 1;
    else
      ok := false;
    end if;
    if not ok then raise exception 'STAGE_DENIED' using errcode = 'P0001'; end if;
    if new.stage = 'scheduled' and new.schedule is null then
      raise exception 'SCHEDULE_REQUIRED' using errcode = 'P0001';
    end if;
  elsif new.schedule is distinct from old.schedule then
    if not (public.media_acts(array['publisher']) and old.stage in ('ready','scheduled') and lvl_old >= 1) then
      raise exception 'STAGE_DENIED' using errcode = 'P0001';
    end if;
  end if;

  if new.approved_version is distinct from old.approved_version
     and not (old.stage = 'review' and new.stage = 'ready') then
    raise exception 'IMMUTABLE_COLUMN' using errcode = 'P0001';
  end if;

  if (new.checklist - 'copy' - 'review') is distinct from (old.checklist - 'copy' - 'review') and not edit_ok then
    raise exception 'EDIT_LOCKED' using errcode = 'P0001';
  end if;

  new.updated_at := now();
  return new;
end
$$;

create function public.media_follow_works() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare w public.works; ver text := 'v' || new.current_version; me text := public.current_email(); v_note text;
begin
  if current_setting('app.work_internal', true) = '1' then return new; end if;
  if not exists (select 1 from public.work_assets wa where wa.asset_id = new.id) then return new; end if;
  perform set_config('app.work_internal', '1', true);
  if new.current_version > old.current_version then
    -- A new version re-opens that part wherever it was approved.
    for w in select x.* from public.works x join public.work_assets wa on wa.work_id = x.id where wa.asset_id = new.id and x.closed_at is null loop
      perform public.work_reopen_after_change(w.id, 'إصدار جديد من «' || new.name || '»');
    end loop;
  elsif old.stage = 'review' and new.stage = 'ready' then
    for w in select x.* from public.works x join public.work_assets wa on wa.work_id = x.id where wa.asset_id = new.id and x.closed_at is null loop
      insert into public.work_approvals (work_id, part, ver, approved_by) values (w.id, 'a:' || new.id, ver, me)
        on conflict (work_id, part) do update set ver = excluded.ver, approved_by = excluded.approved_by, approved_at = now();
      delete from public.work_flags where work_id = w.id and part = 'a:' || new.id;
      if w.status = 'IN_REVIEW' and w.review_cycle is not null then
        insert into public.work_decisions (work_id, cycle, op, parts, labels, decided_by)
          values (w.id, w.review_cycle, 'approve', array['a:' || new.id], array[new.name], me);
      end if;
      perform public.work_log_add(w.id, 'approve', 'اعتماد «' || new.name || '» ' || ver, jsonb_build_object('asset', new.id));
      if w.status = 'IN_REVIEW' then perform public.work_finish_if_done(w.id); end if;
    end loop;
  elsif old.stage = 'review' and new.stage in ('changes','rejected') then
    v_note := case when new.stage = 'rejected' then 'رُفض الملف من المكتبة' else 'طُلب تعديل الملف من المكتبة' end;
    for w in select x.* from public.works x join public.work_assets wa on wa.work_id = x.id where wa.asset_id = new.id and x.closed_at is null loop
      insert into public.work_flags (work_id, part, ver, note) values (w.id, 'a:' || new.id, ver, v_note)
        on conflict (work_id, part) do update set ver = excluded.ver, note = excluded.note;
      if w.status = 'IN_REVIEW' and w.review_cycle is not null then
        insert into public.work_decisions (work_id, cycle, op, parts, labels, decided_by, note)
          values (w.id, w.review_cycle, 'changes', array['a:' || new.id], array[new.name], me, v_note);
        update public.works set status = 'CHANGES_REQUESTED', review_cycle = null, updated_at = now() where id = w.id;
      end if;
      perform public.work_log_add(w.id, 'changes', 'طلب تعديل على «' || new.name || '»', jsonb_build_object('asset', new.id));
      perform public.work_notify(w.assignee, 'attention', public.work_name(me) || ' طلب تعديل «' || new.name || '» في «' || w.title || '».', public.work_go(w.id));
    end loop;
  end if;
  perform set_config('app.work_internal', '0', true);
  return new;
end
$$;
create trigger media_files_follow_works after update on public.media_files
  for each row when (old.stage is distinct from new.stage or old.current_version is distinct from new.current_version)
  execute function public.media_follow_works();

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
revoke all on sequence public.work_no_seq from public, anon, authenticated;

do $$
declare f text;
begin
  -- Internal: callable by no one through the API.
  foreach f in array array[
    'work_log_add(text,text,text,jsonb)', 'work_notify(text,text,text,jsonb)', 'work_notify_many(text[],text,text,jsonb)',
    'work_sync_asset(uuid)', 'work_sync_assets(text)', 'work_finish_if_done(text)', 'work_reopen_after_change(text,text)',
    'work_wake_after(text,int,text)', 'work_insert_stages(text,jsonb,boolean)', 'work_move_inner(text,timestamptz,text,boolean)',
    'work_run_publish(text,uuid[],timestamptz,text)', 'work_involved(text,text)', 'work_deciders(text)', 'work_leaders()',
    'work_publishers()', 'work_check_channels(uuid[])', 'work_youtube_ok(text,uuid[],uuid[])', 'work_plan_check(jsonb,date)',
    'account_busy(uuid)', 'task_notify()', 'media_follow_works()', 'media_files_guard()', 'work_stage_cleared(text,int)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;

  -- Callable by signed-in people; each checks its own rule.
  foreach f in array array[
    'work_today()', 'work_lead()', 'work_approver()', 'work_urgent_approver()', 'work_publisher()', 'work_name(text)',
    'work_can_see(text)', 'work_go(text)', 'work_type_ar(text)', 'work_status_ar(text)', 'work_text_label(text)',
    'work_platform_ar(text)', 'work_account_name(uuid)', 'work_whole(text)', 'work_publishable(text)', 'work_ts(timestamptz)',
    'work_when(timestamptz)', 'work_parts(text)', 'work_pending(text)', 'work_stage_state(uuid)', 'work_decide_block(text)',
    'work_create(jsonb)', 'work_update(text,jsonb)', 'work_assign(text,text)', 'work_set_restricted(text,boolean)',
    'work_close(text,text)', 'work_reopen(text)', 'work_start(text)', 'work_stage_act(uuid,text)', 'work_save_plan(text,jsonb)',
    'work_text_save(text,text,text,text)', 'work_variant_confirm(text,text)', 'work_asset_link(text,uuid,boolean)',
    'work_comment(text,text)', 'work_submit(text,text,uuid[],timestamptz)', 'work_decide(text,text,text[],text,boolean)',
    'work_request_move(text,timestamptz,text)', 'work_cancel_move(text)', 'work_may_publish(text)',
    'work_schedule(text,timestamptz,text)', 'work_publish(text,text)', 'work_due_run()',
    'work_step_impact(uuid,date)', 'work_task_impact(uuid,timestamptz)', 'request_extension(uuid,uuid,timestamptz,text)',
    'request_folder_access(uuid,text)', 'request_decide(uuid,boolean,text,boolean)', 'request_withdraw(uuid)',
    'account_manager()', 'account_save(uuid,jsonb)', 'account_set_active(uuid,boolean)', 'account_delete(uuid)',
    'account_reconnect(uuid)', 'project_save(uuid,jsonb)', 'event_save(uuid,jsonb)', 'event_delete(uuid)',
    'reminder_add(timestamptz,text)', 'reminder_delete(uuid)', 'plan_template_save(text,text,jsonb)',
    'plan_template_delete(uuid)', 'task_create(jsonb)', 'task_ready(uuid)', 'work_people_load()', 'notifications_read(uuid[])'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end
$$;

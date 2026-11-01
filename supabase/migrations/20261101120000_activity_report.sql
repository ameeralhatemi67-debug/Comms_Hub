-- «سجل النشاط» upgraded (MVP_draft.md section 66, the Director's request of 2026-11-01).
--   1. The whole log becomes a permission of its own, «عرض سجل النشاط كاملاً»: the administrator's and the
--      director's by default, grantable to anyone. It replaces the fixed list of roles in the read rule, so the
--      assistant no longer sees the whole log unless given it; their own actions and the files they reach stay.
--   2. «تقرير الشهر عن الفريق»: what each person did in one month, read through one function. The function
--      gives counts and lists; turning them into points and a ranking is src/lib/activity/report.ts, so the
--      way of counting stays one rule in one place, and can change without a migration.
-- Nothing here writes a person's work. Row level security on work_log is unchanged: a holder of the whole log sees
-- a restricted work's history only if they may see that work, and the report's lists follow the same rule.

insert into public.capabilities (key, grp, label_ar, grantable, scope_kind, min_rank, fixed_roles, why_ar, sort) values
  ('activity.full',   'accounts', 'عرض سجل النشاط كاملاً', true, 'none', 1, '{}', null, 47),
  ('activity.report', 'accounts', 'تقرير الشهر عن الفريق', true, 'none', 2, '{}', null, 48);

insert into public.role_capabilities (role, capability, allowed, updated_by)
select r, c.key, r in ('admin','director'), 'installation'
from unnest(array['admin','director','assistant','writer','designer','producer','publisher','member']) r
cross join public.capabilities c
where c.key in ('activity.full','activity.report');

-- The library's log: the whole of it by permission, as before one's own actions and the files one reaches.
drop policy log_read on public.activity_log;
create policy log_read on public.activity_log for select to authenticated
  using ((select public.has_capability('activity.full'))
         or actor_email = (select public.current_email())
         or (asset_id is not null and (select public.media_asset_level(asset_id)) >= 1));

-- The permission log, which the whole view shows among the rest.
drop policy permission_events_read on public.permission_events;
create policy permission_events_read on public.permission_events for select to authenticated
  using (subject = (select public.current_email())
      or (subject is not null and public.perm_can_manage(subject))
      or (subject is null and (select public.has_capability('permissions.grant')))
      or (select public.has_capability('activity.full')));

-- One month, by Riyadh's calendar, as counts and lists. Approving a file linked to a work is written to both logs,
-- so the work log's copy of it is left out here. A finished stage goes to its owner, because a leader may tick it
-- for them. Titles in the lists follow work_can_see, so a restricted work stays hidden from whoever may not see it,
-- while the count still reaches the person who did the work.
create function public.activity_report(p_month text) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare v_day date; v_from timestamptz; v_to timestamptz;
begin
  if not public.has_capability('activity.report') then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if p_month is null or p_month !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then raise exception 'BAD_MONTH' using errcode = 'P0001'; end if;
  v_day := (p_month || '-01')::date;
  v_from := v_day::timestamp at time zone 'Asia/Riyadh';
  v_to := (v_day + interval '1 month')::timestamp at time zone 'Asia/Riyadh';
  return jsonb_build_object(
    'month', p_month,
    'from', v_from,
    'to', v_to,
    'people', coalesce((
      select jsonb_agg(jsonb_build_object('email', a.email, 'name', a.display_name, 'role', a.role) order by a.created_at)
      from public.accounts a), '[]'::jsonb),
    'actions', coalesce((
      select jsonb_agg(jsonb_build_object('who', x.who, 'src', x.src, 'type', x.type, 'n', x.n))
      from (
        select l.actor_email as who, 'log' as src, l.type, count(*) as n
        from public.activity_log l
        where l.at >= v_from and l.at < v_to
        group by l.actor_email, l.type
        union all
        select l.actor, 'work', l.type, count(*)
        from public.work_log l
        where l.at >= v_from and l.at < v_to and not (l.type in ('approve','changes') and l.data ? 'asset')
        group by l.actor, l.type
      ) x), '[]'::jsonb),
    'days', coalesce((
      select jsonb_object_agg(d.who, d.n)
      from (
        select who, count(distinct (at at time zone 'Asia/Riyadh')::date) as n
        from (
          select l.actor_email as who, l.at from public.activity_log l where l.at >= v_from and l.at < v_to
          union all
          select l.actor, l.at from public.work_log l where l.at >= v_from and l.at < v_to
        ) a
        group by who
      ) d), '{}'::jsonb),
    'approved', coalesce((
      select jsonb_object_agg(z.who, z.n)
      from (
        select w.assignee as who, count(distinct w.id) as n
        from public.work_log l join public.works w on w.id = l.work_id
        where l.type = 'approved' and l.at >= v_from and l.at < v_to and w.assignee is not null
        group by w.assignee
      ) z), '{}'::jsonb),
    'stages', coalesce((
      select jsonb_agg(jsonb_build_object(
        'who', coalesce(s.who, s.done_by), 'at', s.done_at, 'due', s.due_on,
        'on_time', s.due_on is not null and (s.done_at at time zone 'Asia/Riyadh')::date <= s.due_on,
        'name', case when public.work_can_see(w.id) then s.name end,
        'work', case when public.work_can_see(w.id) then w.title end,
        'work_id', case when public.work_can_see(w.id) then w.id end) order by s.done_at)
      from public.work_stages s join public.works w on w.id = s.work_id
      where s.done_at >= v_from and s.done_at < v_to and coalesce(s.who, s.done_by) is not null), '[]'::jsonb),
    'tasks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'who', t.assignee, 'at', t.done_at, 'due', t.due, 'on_time', t.done_at <= t.due, 'name', t.what) order by t.done_at)
      from public.media_tasks t
      where t.status = 'done' and t.done_at >= v_from and t.done_at < v_to), '[]'::jsonb),
    -- Late at the month's end, whether or not it was finished after: a report of October reads the same in December.
    'late', coalesce((
      select jsonb_object_agg(q.who, q.n)
      from (
        select t.assignee as who, count(*) as n
        from public.media_tasks t
        where t.due < v_to and t.created_at < v_to and (t.status = 'open' or t.done_at >= v_to)
        group by t.assignee
      ) q), '{}'::jsonb)
  );
end
$$;

revoke all on function public.activity_report(text) from public, anon;
grant execute on function public.activity_report(text) to authenticated;

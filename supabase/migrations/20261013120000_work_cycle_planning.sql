-- Step 5 of Reference_Build_Plan.md: what «التقويم», «المشاريع» and «الطلبات» need, and the
-- gaps the review of the rules and row level security across Steps 1 to 5 found.
--
--  1. work_parts and work_pending gave the parts of any work, its text included, to anyone
--     signed in, a restricted work too: they run with the owner's rights and did not check
--     who asks. They stay as they are for the functions inside the database; the pages now
--     read work_view_parts and work_view_pending, which answer only for a work the caller
--     can see. work_stage_state is no longer callable from outside (no page uses it).
--  2. work_decide_block answers FORBIDDEN for a work the caller cannot see.
--  3. work_task_impact answered for any task: now only for its assignee, the person who
--     assigned it, and the leaders, the people who can read the task.
--  4. work_request_move and work_cancel_move: the caller must see the work as well.
--  5. work_update: a stage's new date cannot fall before the end of an open stage it
--     waits for ("never before an open stage"); the delivery date already could not fall
--     before an open stage's end.
--  6. task_create: a task can wait only for tasks the caller can read.
--  7. mail_link_work: the work must exist and the caller must see it; linking an existing
--     work is now written in the work's own log (it updated the conversation only), and a
--     conversation is not linked twice to the same work.
--  8. project_create: a new project and its works plan in one step; every planned work is
--     created by work_create, so its rules apply to each.
--  9. work_request_list: the requests a person may see, with what each is about and whether
--     the caller may decide it, for «الطلبات».

-- ---------------------------------------------------------------------------
-- 1. Parts and pending parts, for a work the caller can see
-- ---------------------------------------------------------------------------
create function public.work_view_parts(p_work text)
returns table (key text, label text, ver text, kind text, snap text, ord int)
language sql stable security definer set search_path = ''
as $$
  select p.key, p.label, p.ver, p.kind, p.snap, p.ord from public.work_parts(p_work) p where public.work_can_see(p_work)
$$;

create function public.work_view_pending(p_work text) returns table (key text, label text, ver text, kind text)
language sql stable security definer set search_path = ''
as $$
  select p.key, p.label, p.ver, p.kind from public.work_pending(p_work) p where public.work_can_see(p_work)
$$;

-- ---------------------------------------------------------------------------
-- 2. Why the caller may not decide; FORBIDDEN for a work they cannot see
-- ---------------------------------------------------------------------------
create or replace function public.work_decide_block(p_work text) returns text
language sql stable security definer set search_path = ''
as $$
  select case
    when not public.work_can_see(w.id) then 'FORBIDDEN'
    when not public.work_approver() then 'FORBIDDEN_DECIDE'
    when w.status <> 'IN_REVIEW' or w.review_cycle is null or w.closed_at is not null then 'NOT_IN_REVIEW'
    when c.sent_by = public.current_email() then 'SELF_APPROVAL'
    when w.priority = 'urgent' and not public.work_urgent_approver() then 'URGENT_APPROVER'
    else null end
  from public.works w left join public.work_cycles c on c.work_id = w.id and c.n = w.review_cycle
  where w.id = p_work
$$;

-- ---------------------------------------------------------------------------
-- 3. What moves after a task: for those who can read the task
-- ---------------------------------------------------------------------------
create or replace function public.work_task_impact(p_task uuid, p_to timestamptz) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  me text := public.current_email();
  t public.media_tasks; x public.media_tasks; ends jsonb; q uuid[]; cur uuid; st date; need date; sh int; shifts jsonb := '[]';
  nd timestamptz;
begin
  select * into t from public.media_tasks where id = p_task;
  if not found or not (t.assignee = me or t.assigned_by = me or public.work_lead()) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
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

-- ---------------------------------------------------------------------------
-- 4. A publish-date move, and withdrawing it: only on a work the caller can see
-- ---------------------------------------------------------------------------
create or replace function public.work_request_move(p_work text, p_when timestamptz, p_reason text) returns void
language plpgsql security definer set search_path = ''
as $$
declare me text := public.current_email(); w public.works;
begin
  select * into w from public.works where id = p_work for update;
  if not found or w.closed_at is not null or not public.work_can_see(p_work)
     or not (public.work_lead() or w.assignee = me or public.work_publisher())
     or not (w.status = 'SCHEDULED' or (w.status = 'APPROVED' and w.proposed_at is not null)) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  if p_when is null or p_when < now() then raise exception 'DATE_PAST' using errcode = 'P0001'; end if;
  if p_when = coalesce(w.proposed_at, w.sched_at) then raise exception 'NO_CHANGE' using errcode = 'P0001'; end if;
  perform public.work_move_inner(p_work, p_when, p_reason, false);
end
$$;

create or replace function public.work_cancel_move(p_work text) returns void
language plpgsql security definer set search_path = ''
as $$
declare me text := public.current_email(); w public.works;
begin
  select * into w from public.works where id = p_work for update;
  if not found or not public.work_can_see(p_work) or w.status <> 'IN_REVIEW' or w.move_from is null
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
-- 5. Details and dates. As before, plus: a stage's date never falls before the end of an
--    open stage it waits for.
-- ---------------------------------------------------------------------------
create or replace function public.work_update(p_work text, p jsonb) returns void
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
        if v_date is not null and exists (
            select 1 from public.work_stages o
            where o.work_id = p_work and o.pos = any (s.after_pos) and o.done_at is null
              and coalesce(nullif(p->'stage_dues'->>o.id::text, '')::date, o.due_on) > v_date) then
          raise exception 'STAGE_BEFORE_WAIT' using errcode = 'P0001';
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

-- ---------------------------------------------------------------------------
-- 6. Tasks: as before, and a task waits only for tasks the caller can read
-- ---------------------------------------------------------------------------
create or replace function public.task_create(p jsonb) returns uuid
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
  if exists (select 1 from unnest(v_after) x where not exists (
      select 1 from public.media_tasks t where t.id = x and (t.assignee = me or t.assigned_by = me or public.work_lead()))) then
    raise exception 'TASK_INVALID' using errcode = 'P0001';
  end if;
  if nullif(p->>'project', '') is not null and not exists (select 1 from public.projects j where j.id = (p->>'project')::uuid) then
    raise exception 'PROJECT_INVALID' using errcode = 'P0001';
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

-- ---------------------------------------------------------------------------
-- 7. Linking a conversation to a work
-- ---------------------------------------------------------------------------
create or replace function public.mail_link_work(p_thread uuid, p_work text, p_title text, p_assignee text) returns int
language plpgsql security definer set search_path = ''
as $$
declare t public.mail_threads; w public.works;
begin
  select * into t from public.mail_threads where id = p_thread for update;
  select * into w from public.works where id = p_work;
  if t.id is null or not public.mail_can_see(p_thread) or p_work !~ '^CH-[0-9]{1,6}$'
     or w.id is null or not public.work_can_see(p_work)
     or (t.kind = 'external' and not (public.mail_lead() or t.assignee = public.current_email())) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  -- Already linked: nothing to add.
  if t.links @> jsonb_build_array(jsonb_build_object('type','work','id',p_work)) then return t.req_no; end if;
  update public.mail_threads set
      links = jsonb_build_array(jsonb_build_object('type','work','id',p_work,'title',left(coalesce(p_title,''),140))) || links,
      req_no = case when kind = 'external' then coalesce(req_no, nextval('public.mail_req_seq')) end
    where id = p_thread returning * into t;
  perform public.mail_sys(p_thread, jsonb_build_object('e','work','id',p_work,'title',left(coalesce(p_title,''),140),'req',t.req_no));
  if t.kind = 'external' and t.assignee is null and p_assignee is not null then
    perform public.mail_handle(p_thread, null, p_assignee);
  end if;
  -- A work created in this same transaction is logged by work_create; an existing one is logged here.
  if w.created_at < now() then
    perform public.work_log_add(p_work, 'link', 'ربط العمل برسالة البريد «' || left(t.subject, 140) || '»', jsonb_build_object('thread', p_thread));
  end if;
  return t.req_no;
end
$$;

-- ---------------------------------------------------------------------------
-- 8. A new project with its works plan, in one transaction
-- ---------------------------------------------------------------------------
-- p: as project_save. p_works: [work_create payloads]; each is linked to the new project.
create function public.project_create(p jsonb, p_works jsonb) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_id uuid; x jsonb; ids text[] := '{}';
begin
  if not public.work_lead() then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  p_works := coalesce(p_works, '[]'::jsonb);
  if jsonb_typeof(p_works) <> 'array' or jsonb_array_length(p_works) > 30 then raise exception 'PLAN_INVALID' using errcode = 'P0001'; end if;
  v_id := public.project_save(null, p);
  for x in select e from jsonb_array_elements(p_works) e loop
    ids := ids || public.work_create((x - 'projects') || jsonb_build_object('projects', jsonb_build_array(v_id)));
  end loop;
  return jsonb_build_object('id', v_id, 'works', to_jsonb(ids));
end
$$;

-- ---------------------------------------------------------------------------
-- 9. «الطلبات»: the requests a person may see (the same rule as the table's policy), with
--    what each is about and whether the caller may decide it now (as request_decide).
-- ---------------------------------------------------------------------------
create function public.work_request_list()
returns table (id uuid, kind text, status text, requested_by text, requested_at timestamptz, from_at timestamptz, to_at timestamptz,
               reason text, decided_by text, decided_at timestamptz, decision_note text, extend_work boolean,
               stage_id uuid, stage_name text, work_id text, work_title text, work_due date,
               task_id uuid, task_what text, task_assigned_by text, folder_id uuid, folder_name text, can_decide boolean)
language sql stable security definer set search_path = ''
as $$
  with me as (select public.current_email() as e, public.work_lead() as lead)
  select q.id, q.kind, q.status, q.requested_by, q.requested_at, q.from_at, q.to_at, q.reason, q.decided_by, q.decided_at,
         q.decision_note, q.extend_work, q.stage_id, s.name, w.id, w.title, w.due, q.task_id, t.what, t.assigned_by,
         q.folder_id, f.name,
         q.status = 'pending' and q.requested_by <> me.e and (
           me.lead
           or (q.stage_id is not null and w.assignee = me.e)
           or (q.task_id is not null and t.assigned_by = me.e)
           or (q.folder_id is not null and public.media_my_level(q.folder_id) >= 4))
  from public.work_requests q
  cross join me
  left join public.work_stages s on s.id = q.stage_id
  left join public.works w on w.id = s.work_id
  left join public.media_tasks t on t.id = q.task_id
  left join public.media_folders f on f.id = q.folder_id
  where public.is_approved() and (
    q.requested_by = me.e
    or me.lead
    or (q.stage_id is not null and w.assignee = me.e)
    or (q.task_id is not null and t.assigned_by = me.e)
    or (q.folder_id is not null and public.media_my_level(q.folder_id) >= 4))
  order by q.requested_at desc
  limit 300
$$;

-- ---------------------------------------------------------------------------
-- Who may call what
-- ---------------------------------------------------------------------------
do $$
declare f text;
begin
  -- Internal now: the functions inside the database keep using them.
  foreach f in array array['work_parts(text)', 'work_pending(text)', 'work_stage_state(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;
  -- Callable by signed-in people; each checks its own rule. (create or replace keeps the
  -- grants the replaced functions already had.)
  foreach f in array array['work_view_parts(text)', 'work_view_pending(text)', 'project_create(jsonb,jsonb)', 'work_request_list()'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end
$$;

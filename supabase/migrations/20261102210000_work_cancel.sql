-- «إلغاء العمل» (MVP_draft.md section 70, owner directive of 2026-11-02; Create_Access_Plan.md part B).
--
-- Whoever created a work can take it back within the hour, if it was never sent and nobody else has touched it. Before
-- this the only way out was «إغلاق العمل», which is for leaders alone, so a writer or a designer who created a work by
-- mistake could not reverse it. Nothing is deleted: the work closes with a stated reason and stays in «المغلقة», its number
-- is not used again, and a leader can reopen it with work_reopen. What was asked of people stops asking: their notices are
-- marked read and they are told, in the tier that is never pushed. An idea that became this work is free again. A mail
-- thread and a project keep their link, as history.

-- Has anyone but this person done anything on the work? Comments, documents and tasks are checked apart from the log,
-- because not all of them write to it.
create function public.work_touched_by_others(p_work text, p_me text) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.work_log l where l.work_id = p_work and l.actor not in (p_me, 'system'))
      or exists (select 1 from public.work_comments c where c.work_id = p_work and c.author <> p_me)
      or exists (select 1 from public.work_texts t where t.work_id = p_work and t.author <> p_me)
      or exists (select 1 from public.work_variants v where v.work_id = p_work and v.author <> p_me)
      or exists (select 1 from public.work_notes n where n.work_id = p_work and n.author <> p_me)
      or exists (select 1 from public.work_images i where i.work_id = p_work and i.added_by <> p_me)
      or exists (select 1 from public.work_assets a where a.work_id = p_work and a.added_by <> p_me)
      or exists (select 1 from public.work_stages s where s.work_id = p_work and (s.done_by <> p_me or s.gate_by <> p_me))
      or exists (select 1 from public.media_tasks m where m.work_id = p_work and m.assigned_by <> p_me)
$$;

create function public.work_cancel(p_work text) returns void
language plpgsql security definer set search_path = ''
as $$
declare me text := public.current_email(); w public.works; v_told text[];
begin
  select * into w from public.works where id = p_work for update;
  if not found or me is null or w.closed_at is not null or w.created_by is distinct from me then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  if w.created_at < now() - interval '1 hour' then raise exception 'CANCEL_LATE' using errcode = 'P0001'; end if;
  if w.status not in ('DRAFT', 'IN_PRODUCTION') or w.review_cycle is not null then raise exception 'CANCEL_SENT' using errcode = 'P0001'; end if;
  if public.work_touched_by_others(p_work, me) then raise exception 'CANCEL_TOUCHED' using errcode = 'P0001'; end if;

  update public.works set closed_at = now(), closed_by = me, close_reason = 'أُلغي بعد إنشائه', updated_at = now() where id = p_work;
  perform public.work_log_add(p_work, 'cancel', 'إلغاء العمل بعد إنشائه', '{}');

  -- Nothing waits for them now, so their lists do not keep saying so. A request's notice has no work id: it is the one
  -- written in the transaction that created the work, so it carries the same time.
  update public.notifications x set read_at = now()
    where x.read_at is null and x.tier in ('decide', 'attention')
      and ((x.go->>'page' = 'item' and x.go->>'id' = p_work)
        or (x.go->>'page' = 'requests' and x.tier = 'decide' and x.created_at = w.created_at));
  v_told := case when w.assignee is null then public.work_leaders()
                 else array(select unnest(array_append(w.people, w.assignee)) union select s.who from public.work_stages s where s.work_id = p_work and s.who is not null) end;
  perform public.work_notify_many(v_told, 'info', public.work_name(me) || ' ألغى «' || w.title || '» بعد إنشائه.', public.work_go(p_work));

  update public.ideas i set work_id = null where i.work_id = p_work;
end
$$;

revoke all on function public.work_touched_by_others(text, text) from public, anon, authenticated;
revoke all on function public.work_cancel(text) from public, anon;
grant execute on function public.work_cancel(text) to authenticated;

-- Step 4 of Reference_Build_Plan.md, from the review of the approval rules before the
-- review screen was built: nobody approves a file version they uploaded. The library
-- refuses it (media_files_guard), but a file approved or sent back from a work's review
-- went through work_decide, which writes the library stage with the guard switched off
-- (work_sync_asset). work_decide now refuses it the same way, for a part or a package.

-- Refuses when one of these parts is a file whose current version the caller uploaded.
create function public.work_uploader_block(p_keys text[]) returns void
language plpgsql stable security definer set search_path = ''
as $$
begin
  if exists (select 1 from unnest(p_keys) k
             join public.media_files m on k = 'a:' || m.id::text
             join public.media_versions v on v.asset_id = m.id and v.version = m.current_version
             where v.uploaded_by = public.current_email()) then
    raise exception 'SELF_APPROVAL' using errcode = 'P0001';
  end if;
end
$$;
revoke all on function public.work_uploader_block(text[]) from public, anon, authenticated;

-- op: approve | changes | reject. Parts are keys from work_parts; a whole package
-- is decided as one. Changes and reject need a written note.
create or replace function public.work_decide(p_work text, p_op text, p_parts text[], p_note text, p_close boolean) returns jsonb
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
    perform public.work_uploader_block(keys);
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
    perform public.work_uploader_block(keys);
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

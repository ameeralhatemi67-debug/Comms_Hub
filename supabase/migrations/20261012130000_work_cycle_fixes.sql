-- Fixes found by the first database rule run (supabase/tests/work_rules.sql, 2026-10-12):
-- three functions used a local variable with the same name as a column in their own
-- queries ("ver", "n"), which plpgsql refuses as ambiguous. Same behaviour, renamed.

create or replace function public.work_sync_asset(p_asset uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  prev_m text := coalesce(current_setting('app.media_internal', true), '0');
  prev_w text := coalesce(current_setting('app.work_internal', true), '0');
  m public.media_files; w public.works; v_ver text; s text; best text; rank jsonb :=
    '{"published":7,"partial":7,"failed":7,"scheduled":6,"ready":5,"changes":4,"review":3}';
begin
  select * into m from public.media_files where id = p_asset;
  if not found then return; end if;
  v_ver := 'v' || m.current_version;
  for w in select x.* from public.works x join public.work_assets wa on wa.work_id = x.id where wa.asset_id = p_asset loop
    s := null;
    if exists (select 1 from public.work_approvals a where a.work_id = w.id and a.part = 'a:' || p_asset and a.ver = v_ver) then
      s := case w.status when 'PUBLISHED' then 'published' when 'PARTIAL' then 'partial' when 'FAILED' then 'failed'
                         when 'SCHEDULED' then 'scheduled' else 'ready' end;
    elsif exists (select 1 from public.work_flags f where f.work_id = w.id and f.part = 'a:' || p_asset and f.ver = v_ver) then
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

create or replace function public.work_variant_confirm(p_work text, p_platform text) returns void
language plpgsql security definer set search_path = ''
as $$
declare w public.works; v_n int;
begin
  select * into w from public.works where id = p_work for update;
  if not found or w.closed_at is not null or not (public.work_lead() or w.assignee = public.current_email()) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  v_n := coalesce((select max(x.n) from public.work_texts x where x.work_id = p_work), 0);
  update public.work_variants y set base = v_n
    where y.work_id = p_work and y.platform = p_platform
      and y.n = (select max(v.n) from public.work_variants v where v.work_id = p_work and v.platform = p_platform);
  if not found then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  perform public.work_log_add(p_work, 'copy_ok', 'تأكيد صياغة نسخة ' || public.work_platform_ar(p_platform), jsonb_build_object('platform', p_platform));
end
$$;

create or replace function public.media_follow_works() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare w public.works; v_ver text := 'v' || new.current_version; me text := public.current_email(); v_note text;
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
      insert into public.work_approvals (work_id, part, ver, approved_by) values (w.id, 'a:' || new.id, v_ver, me)
        on conflict (work_id, part) do update set ver = excluded.ver, approved_by = excluded.approved_by, approved_at = now();
      delete from public.work_flags f where f.work_id = w.id and f.part = 'a:' || new.id;
      if w.status = 'IN_REVIEW' and w.review_cycle is not null then
        insert into public.work_decisions (work_id, cycle, op, parts, labels, decided_by)
          values (w.id, w.review_cycle, 'approve', array['a:' || new.id], array[new.name], me);
      end if;
      perform public.work_log_add(w.id, 'approve', 'اعتماد «' || new.name || '» ' || v_ver, jsonb_build_object('asset', new.id));
      if w.status = 'IN_REVIEW' then perform public.work_finish_if_done(w.id); end if;
    end loop;
  elsif old.stage = 'review' and new.stage in ('changes','rejected') then
    v_note := case when new.stage = 'rejected' then 'رُفض الملف من المكتبة' else 'طُلب تعديل الملف من المكتبة' end;
    for w in select x.* from public.works x join public.work_assets wa on wa.work_id = x.id where wa.asset_id = new.id and x.closed_at is null loop
      insert into public.work_flags (work_id, part, ver, note) values (w.id, 'a:' || new.id, v_ver, v_note)
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

revoke all on function public.work_sync_asset(uuid) from public, anon, authenticated;
revoke all on function public.media_follow_works() from public, anon, authenticated;
revoke all on function public.work_variant_confirm(text, text) from public, anon;
grant execute on function public.work_variant_confirm(text, text) to authenticated;

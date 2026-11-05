-- YouTube's four choices in the work cycle (Director_Notes_Plan.md N-3, step 5, owner directive of 2026-11-05 with answer Q5;
-- MVP_draft.md section 78). Publishing works stays a simulation: nothing reaches YouTube, and what is recorded is what YouTube would
-- have been asked.
--
--   * «نشر الآن»: each YouTube account of the work goes out «عام», «غير مدرج» or «خاص», chosen by the publisher in the dialog. Not
--     chosen, it takes the account's default («الظهور الافتراضي», `platform_accounts.default_privacy`), else «عام». The choice is kept in
--     `works.pub_options` (account id to choice), and each account's result records how it went out (`results[account].privacy`).
--   * «جدولة» is the fourth choice, «مجدول», faithful to YouTube: a scheduled video is private until its time and YouTube makes it
--     public then, by itself. A scheduled work's YouTube accounts therefore go out «عام» at their time; work_schedule is unchanged.
--     YouTube has no «غير مدرج» at a time: to go out unlisted or private, publish now.
--   * Approval does not change (answer Q5): approval clears the content for the public, and a narrower choice is always allowed.
--   * The account's default is set by whoever manages accounts (account_manager), on a YouTube account only.
--   * The notice of a published work says a YouTube account that went out «غير مدرج» or «خاص», and so does its push.

alter table public.works
  add column pub_options jsonb not null default '{}'::jsonb check (jsonb_typeof(pub_options) = 'object');
alter table public.platform_accounts
  add column default_privacy text check (default_privacy is null or default_privacy in ('unlisted','private'));

-- The words of a choice, as the interface says them.
create function public.yt_privacy_ar(p text) returns text
language sql immutable set search_path = ''
as $$ select case p when 'public' then 'عام' when 'unlisted' then 'غير مدرج' when 'private' then 'خاص' when 'scheduled' then 'مجدول' end $$;

-- ---------------------------------------------------------------------------
-- 1. The account's default
-- ---------------------------------------------------------------------------
-- 'public', 'unlisted' or 'private'; «عام» is kept as no default.
create function public.account_set_privacy(p_id uuid, p_privacy text) returns void
language plpgsql security definer set search_path = ''
as $$
declare a public.platform_accounts;
begin
  select * into a from public.platform_accounts where id = p_id for update;
  if not found or a.platform <> 'youtube' or not public.account_manager() then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if p_privacy is null or p_privacy not in ('public','unlisted','private') then raise exception 'OPTIONS_INVALID' using errcode = 'P0001'; end if;
  update public.platform_accounts set default_privacy = nullif(p_privacy, 'public') where id = p_id;
end
$$;

-- ---------------------------------------------------------------------------
-- 2. What a work's YouTube accounts are asked to be, at «نشر الآن»
-- ---------------------------------------------------------------------------
-- p_options: {account id: 'public' | 'unlisted' | 'private'} for some of the work's YouTube accounts, or null. Every YouTube account of
-- the work gets one: the asked choice, else its default, else 'public'. Anything else is refused.
create function public.work_pub_choices(p_channels uuid[], p_options jsonb) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare k text; a public.platform_accounts; v text; o jsonb := '{}'::jsonb;
begin
  if p_options is not null and jsonb_typeof(p_options) <> 'object' then raise exception 'OPTIONS_INVALID' using errcode = 'P0001'; end if;
  for k in select jsonb_object_keys(coalesce(p_options, '{}'::jsonb)) loop
    if not exists (select 1 from public.platform_accounts x where x.id::text = k and x.id = any (p_channels) and x.platform = 'youtube')
       or jsonb_typeof(p_options->k) <> 'string' then
      raise exception 'OPTIONS_INVALID' using errcode = 'P0001';
    end if;
  end loop;
  for a in select * from public.platform_accounts x where x.id = any (p_channels) and x.platform = 'youtube' loop
    v := coalesce(p_options->>a.id::text, a.default_privacy, 'public');
    if v not in ('public','unlisted','private') then raise exception 'OPTIONS_INVALID' using errcode = 'P0001'; end if;
    o := o || jsonb_build_object(a.id::text, v);
  end loop;
  return o;
end
$$;

-- ---------------------------------------------------------------------------
-- 3. Publishing: «نشر الآن» takes the choices; the rest is as before
-- ---------------------------------------------------------------------------
create function public.work_publish(p_work text, p_op text, p_options jsonb) returns text
language plpgsql security definer set search_path = ''
as $$
declare w public.works; failed uuid[];
begin
  select * into w from public.works where id = p_work for update;
  if not found or w.closed_at is not null or not public.work_may_publish(p_work) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if p_options is not null and p_op <> 'now' then raise exception 'OPTIONS_INVALID' using errcode = 'P0001'; end if;
  if (p_op = 'now' and w.status = 'APPROVED') or (p_op = 'confirm' and w.status = 'SCHEDULED' and w.confirm_pending)
     or (p_op = 'retry' and w.status in ('PARTIAL','FAILED')) then
    perform public.work_assert_copies(p_work, w.channels);
  end if;
  if p_op = 'now' and w.status = 'APPROVED' then
    update public.works set pub_options = public.work_pub_choices(w.channels, p_options) where id = p_work;
    return public.work_run_publish(p_work, w.channels, now(),
      case when (select a.platform from public.platform_accounts a where a.id = w.channels[1]) = 'mail' then 'إرسال من البريد' else 'نشر الآن' end);
  elsif p_op = 'confirm' and w.status = 'SCHEDULED' and w.confirm_pending then
    return public.work_run_publish(p_work, w.channels, now(), 'تأكيد النشر عند الموعد');
  elsif p_op = 'decline' and w.status = 'SCHEDULED' and w.confirm_pending then
    update public.works set status = 'APPROVED', sched_at = null, confirm_pending = false, updated_at = now() where id = p_work;
    perform public.work_log_add(p_work, 'publish_no', 'لم يُؤكَّد النشر عند الموعد ' || public.work_when(w.sched_at) || '، فلم يُنشر وعاد «جاهز للنشر»', '{}');
    perform public.work_notify_many(array[w.assignee] || public.work_writers(p_work), 'attention', 'لم يُنشر «' || w.title || '» عند موعده بقرار مسؤول النشر.', public.work_go(p_work));
    perform public.work_sync_assets(p_work);
    return 'APPROVED';
  elsif p_op = 'retry' and w.status in ('PARTIAL','FAILED') then
    -- The accounts that failed go again as they were asked.
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

-- The two-argument form stays for every caller that has no choice to give: «نشر الآن» then takes each account's default.
create or replace function public.work_publish(p_work text, p_op text) returns text
language sql security definer set search_path = ''
as $$ select public.work_publish(p_work, p_op, null::jsonb) $$;

-- ---------------------------------------------------------------------------
-- 4. The run records how each YouTube account went out, and says it when it was not public
-- ---------------------------------------------------------------------------
create or replace function public.work_run_publish(p_work text, p_channels uuid[], p_when timestamptz, p_label text) returns text
language plpgsql security definer set search_path = ''
as $$
declare w public.works; c uuid; ok boolean; over boolean; res jsonb; good text[] := '{}'; bad text[] := '{}'; okn int; st text;
  v_plat text; v_priv text; v_narrow text[] := '{}';
begin
  select * into w from public.works where id = p_work for update;
  res := w.results;
  foreach c in array p_channels loop
    select a.active and (a.authorized_until is null or a.authorized_until > p_when), a.platform into ok, v_plat from public.platform_accounts a where a.id = c;
    ok := coalesce(ok, false);
    over := ok and cardinality(public.work_copy_errors(p_work, c)) > 0;
    if over then ok := false; end if;
    -- A YouTube account: what it was asked, a scheduled one public at its time, a work from before the choice public.
    v_priv := case when v_plat = 'youtube' then
      case coalesce(w.pub_options->>c::text, 'public') when 'scheduled' then 'public' else coalesce(w.pub_options->>c::text, 'public') end end;
    res := res || jsonb_build_object(c::text, jsonb_build_object('ok', ok, 'at', p_when,
      'why', case when ok then null when over then 'النسخة تتجاوز حد المنصة' else 'التفويض منتهٍ' end)
      || case when v_priv is not null then jsonb_build_object('privacy', v_priv) else '{}'::jsonb end);
    if ok then
      good := good || (public.work_account_name(c) || case when v_priv in ('unlisted','private') then ' (' || public.yt_privacy_ar(v_priv) || ')' else '' end);
      if v_priv in ('unlisted','private') then v_narrow := v_narrow || (public.work_account_name(c) || ': ' || public.yt_privacy_ar(v_priv)); end if;
    else
      bad := bad || public.work_account_name(c);
    end if;
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
  perform public.work_notify_many(array[w.assignee] || public.work_writers(p_work), case when st = 'PUBLISHED' then 'info' else 'attention' end,
    '«' || w.title || '»: ' || public.work_status_ar(st) || '.'
      || case when cardinality(v_narrow) > 0 then ' ' || array_to_string(v_narrow, '، ') || '.' else '' end,
    public.work_go(p_work));
  perform public.work_sync_assets(p_work);
  return st;
end
$$;

-- ---------------------------------------------------------------------------
-- 5. Privileges
-- ---------------------------------------------------------------------------
revoke all on function public.work_publish(text, text, jsonb), public.account_set_privacy(uuid, text),
  public.work_pub_choices(uuid[], jsonb), public.yt_privacy_ar(text) from public, anon, authenticated;
grant execute on function public.work_publish(text, text, jsonb) to authenticated;
grant execute on function public.account_set_privacy(uuid, text) to authenticated;

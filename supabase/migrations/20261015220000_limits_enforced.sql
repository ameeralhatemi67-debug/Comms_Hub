-- Action_Plan.md C4: the database enforces a platform's limits at the send step.
--
-- Until now only the interface stopped a copy that is over its platform's limits (Step 5 of
-- Readiness_Audit.md); a person calling work_schedule or work_publish directly could still
-- schedule or publish it. The rule lives in two places that must agree, so the pure part is one
-- function here (work_copy_issues, a port of src/lib/platforms/limits.ts checkCopy, error level
-- only) and the same battery of cases is run through both in tests/limits-parity (TypeScript)
-- and supabase/tests/limits_rules.sql (this function).
--
-- Enforced at: work_schedule (refused), work_publish now / confirm / retry (refused, nothing is
-- recorded), and work_run_publish for a due scheduled work (the account fails with the reason,
-- like an expired authorisation). Not enforced at work_submit: a copy may still be fixed during
-- review. Counting differs from the interface in one respect: the database counts every linked
-- library file, the interface only the ones its viewer can see, so the database can be stricter.
-- Warnings and information (NEAR_LIMIT, FOLD, NO_TEXT, VIDEO_LENGTH) are not enforced.

-- A limit out of `accepts`, only when it is a sane positive whole number (as limitsOf does).
create function public.platform_limit(p_accepts jsonb, p_key text) returns int
language sql immutable set search_path = ''
as $$
  select case when jsonb_typeof(p_accepts -> p_key) = 'number' and (p_accepts ->> p_key) ~ '^[0-9]{1,7}$'
              and (p_accepts ->> p_key)::int between 1 and 1000000
         then (p_accepts ->> p_key)::int end
$$;

-- The error-level problems of one copy against one platform's limits, as a list of codes.
create function public.work_copy_issues(p_text text, p_images int, p_videos int, p_type_video boolean, p_accepts jsonb)
returns text[]
language plpgsql immutable set search_path = ''
as $$
declare
  a jsonb := coalesce(p_accepts, '{}'::jsonb);
  t text := coalesce(p_text, '');
  out text[] := '{}';
  blank boolean := t ~ '^\s*$';
  media int := coalesce(p_images, 0) + coalesce(p_videos, 0);
  v_title_max int := public.platform_limit(a, 'title_max');
  v_desc_max int := public.platform_limit(a, 'description_max_bytes');
  v_chars_max int := public.platform_limit(a, 'max_chars');
  v_tags_max int := public.platform_limit(a, 'max_hashtags');
  v_img_max int := public.platform_limit(a, 'max_images');
  v_vid_max int := public.platform_limit(a, 'max_videos');
  v_media_max int := public.platform_limit(a, 'max_media');
  v_url int := public.platform_limit(a, 'url_chars');
  lead text; i int; title text; descr text; used int; links int; tags int;
begin
  if blank and media = 0 then out := array_append(out, 'EMPTY'); end if;

  if v_title_max is not null or v_desc_max is not null then
    lead := regexp_replace(t, '^\s+', '');
    i := case when lead ~ E'\n' then strpos(lead, E'\n') else 0 end;
    if i = 0 then
      title := regexp_replace(regexp_replace(lead, '^\s+', ''), '\s+$', '');
      descr := '';
    else
      title := regexp_replace(regexp_replace(substr(lead, 1, i - 1), '^\s+', ''), '\s+$', '');
      descr := regexp_replace(regexp_replace(substr(lead, i), '^\s+', ''), '\s+$', '');
    end if;
    if v_title_max is not null then
      if char_length(title) > v_title_max then out := array_append(out, 'TITLE_TOO_LONG'); end if;
      if not blank and title = '' then out := array_append(out, 'NO_TITLE'); end if;
      if title ~ '[<>]' then out := array_append(out, 'TITLE_BRACKETS'); end if;
    end if;
    if v_desc_max is not null then
      if octet_length(descr) > v_desc_max then out := array_append(out, 'DESCRIPTION_TOO_LONG'); end if;
      if descr ~ '[<>]' then out := array_append(out, 'DESCRIPTION_BRACKETS'); end if;
    end if;
  end if;

  if v_chars_max is not null then
    if v_url is null then
      used := char_length(t);
    else
      select count(*) into links from regexp_matches(t, 'https?://\S+', 'gi');
      used := char_length(regexp_replace(t, 'https?://\S+', '', 'gi')) + links * v_url;
    end if;
    if used > v_chars_max then out := array_append(out, 'TOO_LONG'); end if;
  end if;

  if v_tags_max is not null then
    select count(*) into tags from regexp_matches(t, '(^|[\s(])#[[:alnum:]_]+', 'g');
    if tags > v_tags_max then out := array_append(out, 'TOO_MANY_HASHTAGS'); end if;
  end if;
  if v_img_max is not null and coalesce(p_images, 0) > v_img_max then out := array_append(out, 'TOO_MANY_IMAGES'); end if;
  if v_vid_max is not null and coalesce(p_videos, 0) > v_vid_max then out := array_append(out, 'TOO_MANY_VIDEOS'); end if;
  if v_media_max is not null and media > v_media_max then out := array_append(out, 'TOO_MANY_MEDIA'); end if;
  if v_img_max is not null and v_vid_max is not null and coalesce(p_images, 0) > 0 and coalesce(p_videos, 0) > 0 then
    out := array_append(out, 'MIXED_MEDIA');
  end if;
  if coalesce((a ->> 'video_only') = 'true', false) and coalesce(p_videos, 0) = 0 and not coalesce(p_type_video, false) then
    out := array_append(out, 'VIDEO_REQUIRED');
  end if;
  return out;
end
$$;

-- The same, for the copy one work would send to one account: the platform's own latest
-- non-blank variant, else the work's main text, and the work's linked files.
create function public.work_copy_errors(p_work text, p_account uuid) returns text[]
language plpgsql stable security definer set search_path = ''
as $$
declare
  w public.works; pl public.platforms; txt text; imgs int; vids int;
begin
  select * into w from public.works where id = p_work;
  if not found then return '{}'; end if;
  select p.* into pl from public.platform_accounts a join public.platforms p on p.key = a.platform where a.id = p_account;
  if not found then return '{}'; end if;
  select x.body into txt from public.work_variants x
    where x.work_id = p_work and x.platform = pl.key and x.body !~ '^\s*$' order by x.n desc limit 1;
  if txt is null then
    select x.body into txt from public.work_texts x where x.work_id = p_work order by x.n desc limit 1;
  end if;
  select count(*) filter (where m.kind = 'image'), count(*) filter (where m.kind = 'video') into imgs, vids
    from public.work_assets wa join public.media_files m on m.id = wa.asset_id where wa.work_id = p_work;
  return public.work_copy_issues(coalesce(txt, ''), imgs, vids, w.type = 'video', pl.accepts);
end
$$;

-- Refuses when any account that has not already succeeded would receive a copy over its limits.
create function public.work_assert_copies(p_work text, p_channels uuid[]) returns void
language plpgsql stable security definer set search_path = ''
as $$
declare
  w public.works; c uuid; e text[]; pk text;
begin
  select * into w from public.works where id = p_work;
  if not found then return; end if;
  foreach c in array coalesce(p_channels, '{}') loop
    if coalesce((w.results -> c::text ->> 'ok')::boolean, false) then continue; end if;
    e := public.work_copy_errors(p_work, c);
    if cardinality(e) > 0 then
      select a.platform into pk from public.platform_accounts a where a.id = c;
      raise exception 'COPY_OVER_LIMIT: % %', pk, e[1] using errcode = 'P0001';
    end if;
  end loop;
end
$$;

revoke all on function public.platform_limit(jsonb, text) from public, anon, authenticated;
revoke all on function public.work_copy_issues(text, int, int, boolean, jsonb) from public, anon, authenticated;
revoke all on function public.work_copy_errors(text, uuid) from public, anon, authenticated;
revoke all on function public.work_assert_copies(text, uuid[]) from public, anon, authenticated;

-- The three send-step functions are patched from their live definitions; each replacement must
-- match exactly once or the migration stops.
do $patch$
declare
  d text; o text;
begin
  d := pg_get_functiondef('public.work_schedule(text,timestamptz,text)'::regprocedure);
  o := d;
  d := replace(d, $s$  if p_mode is not null and p_mode not in ('auto','ask') then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
$s$, $s$  if p_mode is not null and p_mode not in ('auto','ask') then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  perform public.work_assert_copies(p_work, w.channels);
$s$);
  if d = o then raise exception 'PATCH_work_schedule_NOT_APPLIED'; end if;
  execute d;

  d := pg_get_functiondef('public.work_publish(text,text)'::regprocedure);
  o := d;
  d := replace(d, $s$  if p_op = 'now' and w.status = 'APPROVED' then
$s$, $s$  if (p_op = 'now' and w.status = 'APPROVED') or (p_op = 'confirm' and w.status = 'SCHEDULED' and w.confirm_pending)
     or (p_op = 'retry' and w.status in ('PARTIAL','FAILED')) then
    perform public.work_assert_copies(p_work, w.channels);
  end if;
  if p_op = 'now' and w.status = 'APPROVED' then
$s$);
  if d = o then raise exception 'PATCH_work_publish_NOT_APPLIED'; end if;
  execute d;

  d := pg_get_functiondef('public.work_run_publish(text,uuid[],timestamptz,text)'::regprocedure);
  o := d;
  d := replace(d, $s$    ok := coalesce(ok, false);
    res := res || jsonb_build_object(c::text, jsonb_build_object('ok', ok, 'at', p_when,
      'why', case when ok then null else 'التفويض منتهٍ' end));
$s$, $s$    ok := coalesce(ok, false);
    over := ok and cardinality(public.work_copy_errors(p_work, c)) > 0;
    if over then ok := false; end if;
    res := res || jsonb_build_object(c::text, jsonb_build_object('ok', ok, 'at', p_when,
      'why', case when ok then null when over then 'النسخة تتجاوز حد المنصة' else 'التفويض منتهٍ' end));
$s$);
  if d = o then raise exception 'PATCH_work_run_publish_NOT_APPLIED'; end if;
  o := d;
  d := replace(d, $s$declare w public.works; c uuid; ok boolean;$s$, $s$declare w public.works; c uuid; ok boolean; over boolean;$s$);
  if d = o then raise exception 'PATCH_work_run_publish_DECLARE_NOT_APPLIED'; end if;
  execute d;
end
$patch$;

-- Readiness audit, order step 5: what a platform accepts, as data (the post preview's limits).
--
-- `platforms.accepts` already held `video_only`, the one rule the database enforces. The preview
-- reads the same column for the limits a copy is checked against: text length, hashtags, number
-- of images and videos, a title and description. They are information in the interface and in
-- the check a platform adapter will run; the database still enforces only video_only (a copy over
-- a limit is shown and stops the send in the interface, and is refused by the adapter's own
-- validate step when one exists).
--
-- Each platform says where its numbers came from (`limits_note`) and the day they were read from
-- the platform's documentation (`limits_checked`). A number nobody could confirm is not stored.
-- The values below equal BUILTIN_LIMITS in src/lib/platforms/limits.ts (tests/preview.test.mjs).

update public.platforms set accepts = accepts || '{"max_chars": 2200, "max_hashtags": 30, "max_media": 10, "fold_chars": 125, "limits_checked": "2026-10-15", "limits_note": "عدد العناصر (10 في الدوّارة) من وثائق Instagram الرسمية. طول الشرح (2200) وعدد الوسوم (30) وبداية «المزيد» (نحو 125) من مساعدة إنستغرام العامة لا من وثائق الواجهة، فتحقق منها عند الربط."}'::jsonb where key = 'instagram';
update public.platforms set accepts = accepts || '{"max_chars": 280, "max_images": 4, "max_videos": 1, "url_chars": 23, "limits_checked": "2026-10-15", "limits_note": "عدد الوسائط (4 صور أو فيديو واحد) من وثائق X الرسمية. 280 حرفاً لحساب عادي وعدّ الرابط 23 حرفاً من مساعدة X العامة لا من وثائق الواجهة. حساب Premium يسمح بأكثر."}'::jsonb where key = 'x';
update public.platforms set accepts = accepts || '{"max_chars": 3000, "limits_checked": "2026-10-15", "limits_note": "وثائق لينكدإن تذكر رفض النص الأطول من الحد دون رقم. الرقم 3000 من مساعدة لينكدإن العامة، فتحقق منه عند الربط."}'::jsonb where key = 'linkedin';
update public.platforms set accepts = accepts || '{"max_videos": 1, "title_max": 100, "description_max_bytes": 5000, "limits_checked": "2026-10-15", "limits_note": "العنوان 100 حرف والوصف 5000 بايت (حرف عربي = بايتان) من وثائق YouTube Data API الرسمية. السطر الأول من النسخة هو العنوان والباقي الوصف."}'::jsonb where key = 'youtube';

-- platform_save keeps everything it did (name, mode, video_only, link pattern fix) and also
-- reads the limits. An empty value removes a limit; anything else is a whole number 1 to 1000000.
create or replace function public.platform_save(p_key text, p jsonb) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  me text := public.platform_require(); k text := lower(btrim(coalesce(p_key, ''))); cur public.platforms;
  v_label text; v_mode text; v_url text; v_life int; v_accepts jsonb; lk text; v_val text; v_note text;
begin
  if k !~ '^[a-z][a-z0-9_]{0,29}$' then raise exception 'PLATFORM_KEY_INVALID' using errcode = 'P0001'; end if;
  select * into cur from public.platforms where key = k for update;
  v_label := btrim(coalesce(p->>'label_ar', ''));
  if cur.key is not null and cur.builtin then v_label := cur.label_ar; end if;
  if char_length(v_label) not between 1 and 40 then raise exception 'LABEL_REQUIRED' using errcode = 'P0001'; end if;
  v_mode := coalesce(nullif(p->>'publish_mode', ''), cur.publish_mode, 'assisted');
  if v_mode not in ('auto','assisted','manual') then raise exception 'MODE_INVALID' using errcode = 'P0001'; end if;
  v_url := nullif(btrim(coalesce(p->>'docs_url', '')), '');
  if v_url is not null and (v_url !~ '^https://[^[:space:]]{3,}$' or char_length(v_url) > 300) then raise exception 'URL_INVALID' using errcode = 'P0001'; end if;
  v_life := nullif(p->>'token_life_days', '')::int;
  if v_life is not null and v_life not between 1 and 3650 then raise exception 'LIFE_INVALID' using errcode = 'P0001'; end if;
  v_accepts := coalesce(cur.accepts, '{}'::jsonb) || jsonb_build_object('video_only', coalesce((p->>'video_only')::boolean, coalesce((cur.accepts->>'video_only')::boolean, false)));

  foreach lk in array array['max_chars','max_hashtags','max_images','max_videos','max_media','title_max','description_max_bytes','fold_chars','url_chars','max_video_seconds'] loop
    if p ? lk then
      v_val := nullif(btrim(coalesce(p->>lk, '')), '');
      if v_val is null then
        v_accepts := v_accepts - lk;
      else
        if v_val !~ '^[0-9]{1,7}$' or v_val::int not between 1 and 1000000 then raise exception 'LIMIT_INVALID' using errcode = 'P0001'; end if;
        v_accepts := v_accepts || jsonb_build_object(lk, v_val::int);
      end if;
    end if;
  end loop;
  if p ? 'limits_note' then
    v_note := nullif(btrim(coalesce(p->>'limits_note', '')), '');
    if v_note is null then v_accepts := v_accepts - 'limits_note';
    else
      if char_length(v_note) > 300 then raise exception 'LIMIT_NOTE_INVALID' using errcode = 'P0001'; end if;
      v_accepts := v_accepts || jsonb_build_object('limits_note', v_note);
    end if;
  end if;
  if p ? 'limits_checked' then
    v_val := nullif(btrim(coalesce(p->>'limits_checked', '')), '');
    if v_val is null then v_accepts := v_accepts - 'limits_checked';
    else
      if v_val !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'LIMIT_NOTE_INVALID' using errcode = 'P0001'; end if;
      v_accepts := v_accepts || jsonb_build_object('limits_checked', v_val);
    end if;
  end if;

  if cur.key is null then
    insert into public.platforms (key, label_ar, kind, sort, accepts, publish_mode, scheduling, requires_review, token_life_days, enabled, docs_url, created_by)
    values (k, v_label, 'social', (select coalesce(max(sort), 4) + 1 from public.platforms), v_accepts, v_mode,
            coalesce((p->>'scheduling')::boolean, true), coalesce((p->>'requires_review')::boolean, false), v_life, false, v_url, me);
    insert into public.platform_events (platform, actor, kind, data) values (k, me, 'created', jsonb_build_object('label', v_label, 'mode', v_mode));
  else
    if cur.kind = 'mail' and (v_accepts->>'video_only')::boolean then raise exception 'PLATFORM_BUILTIN' using errcode = 'P0001'; end if;
    update public.platforms set label_ar = v_label, accepts = v_accepts, publish_mode = v_mode,
        scheduling = coalesce((p->>'scheduling')::boolean, scheduling),
        requires_review = coalesce((p->>'requires_review')::boolean, requires_review),
        token_life_days = case when p ? 'token_life_days' then v_life else token_life_days end,
        docs_url = case when p ? 'docs_url' then v_url else docs_url end
      where key = k;
    insert into public.platform_events (platform, actor, kind, data)
    values (k, me, 'updated', jsonb_strip_nulls(jsonb_build_object(
      'label', case when v_label is distinct from cur.label_ar then v_label end,
      'mode', case when v_mode is distinct from cur.publish_mode then v_mode end,
      'video_only', case when (v_accepts->>'video_only') is distinct from (cur.accepts->>'video_only') then (v_accepts->>'video_only')::boolean end,
      'limits', case when (v_accepts - 'video_only') is distinct from (coalesce(cur.accepts, '{}'::jsonb) - 'video_only') then true end)));
  end if;
  return k;
end
$$;
revoke all on function public.platform_save(text, jsonb) from public, anon;
grant execute on function public.platform_save(text, jsonb) to authenticated;

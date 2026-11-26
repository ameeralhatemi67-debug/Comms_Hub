-- A scheduled Instagram direct post that Meta published but whose result the site could not record (MVP_draft.md 76.5, found by the health check of
-- 2026-11-26). The run now tries to record a published post a few times and, if it cannot, closes the row with PUBLISHED_UNRECORDED (src/lib/platforms/
-- direct-due.ts). The notice its author is told must not say the post failed to publish, because it is live: it says it was published, that it could
-- not be recorded, and not to post it again. Only the notice's words change; every other failure keeps its words and its behaviour. The function is
-- the one *direct_schedule* made; this stops, changing nothing, if it is not. It can be run again.

do $$
declare d text;
begin
  select pg_get_functiondef('public.direct_fail(public.platform_tests,text)'::regprocedure) into d;
  if d not like '%تعذّر نشر «%' or d not like '%direct_words%' then
    raise exception 'MIGRATION_ASSUMPTION: direct_fail is not the version of the direct_schedule migration';
  end if;
end
$$;

create or replace function public.direct_fail(t public.platform_tests, p_error text) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  w jsonb := public.direct_words(t);
  v_code text := case when p_error ~ '^[A-Z_]{2,40}$' then p_error else 'PLATFORM_ERROR' end;
begin
  update public.platform_tests set state = 'failed', error = v_code,
      upload_url = null, link_hash = null, link_until = null, fire_lease = null, done_at = now()
    where id = t.id;
  perform public.work_notify(t.created_by, 'attention',
    case when v_code = 'PUBLISHED_UNRECORDED'
      then 'نُشر «' || (w->>'name') || '» على ' || (w->>'platform') || ' · ' || (w->>'account') || ' لكن تعذّر تسجيله هنا. تأكد منه في الحساب ولا تُعد نشره.'
      else 'تعذّر نشر «' || (w->>'name') || '» المجدول على ' || (w->>'platform') || ' · ' || (w->>'account') || '. افتح «نشر مباشر» لترى السبب.' end,
    jsonb_build_object('page', 'accounts'));
end
$$;

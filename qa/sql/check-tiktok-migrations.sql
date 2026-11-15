-- Read-only check that both TikTok migrations of 2026-11-15 are on the database (MVP_draft.md section 79). Changes nothing.
-- Run in the SQL editor of comms-hub; every line of the result should end in «true».
select 'tiktok kinds allowed' as what, pg_get_constraintdef(oid) like '%tt_draft%tt_post%' as ok
  from pg_constraint where conname = 'platform_tests_kind_check'
union all
select 'tiktok privacies allowed', pg_get_constraintdef(oid) like '%friends%followers%'
  from pg_constraint where conname = 'platform_tests_privacy_check'
union all
select 'a tiktok account may be tested', pg_get_functiondef('public.platform_test_may(uuid)'::regprocedure) like '%''tiktok''%'
union all
select 'tiktok starts accepted', pg_get_functiondef('public.platform_test_start(uuid, jsonb)'::regprocedure) like '%tt_post%'
union all
select 'the server reads the privacy', pg_get_functiondef('public.platform_test_get(text, uuid)'::regprocedure) like '%''privacy'', t.privacy%'
union all
select 'a tiktok row may arrive with no post id', exists (select 1 from pg_constraint where conname = 'platform_tests_published_id')
union all
select 'the old rule that refused it is gone', not exists (select 1 from pg_constraint where conrelid = 'public.platform_tests'::regclass
  and contype = 'c' and pg_get_constraintdef(oid) ilike '%state <> ''published''::text%video_id IS NOT NULL)%' and conname <> 'platform_tests_published_id')
union all
select 'the reset exists', exists (select 1 from pg_proc where proname = 'platform_app_reset')
union all
select 'the platform log takes a reset', pg_get_constraintdef(oid) like '%reset%'
  from pg_constraint where conname = 'platform_events_kind_check';

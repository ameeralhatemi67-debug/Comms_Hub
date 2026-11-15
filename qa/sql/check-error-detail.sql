-- Read-only check that the migration 20261115140000_platform_tests_error_detail.sql is on the database (MVP_draft.md 79.6).
-- Run in the SQL editor of comms-hub; every line of the result should end in «true». Changes nothing.
select 'the column for the platform''s line' as what, exists (select 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'platform_tests' and column_name = 'error_detail') as ok
union all
select 'pages may read it', has_column_privilege('authenticated', 'public.platform_tests', 'error_detail', 'select')
union all
select 'the server may keep it', exists (select 1 from pg_proc where proname = 'platform_test_failed_detail');

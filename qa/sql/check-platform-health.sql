-- Read-only health check of the platform work on the LIVE database (written 2026-11-26 after the platform connections' health check).
-- Changes nothing: only SELECTs. Run it in the SQL editor of **comms-hub** (project ref hrghmioxvgkjpnydrxrk, not any other project),
-- one part at a time (select the part's text and press Run), because the editor shows only the last result of a run.
--
--   Part A: which of the platform migrations are on the database. Every line should say «true»; a «false» names a migration the owner has
--           not run yet (the file name is in the line). The last two lines are the ones written on 2026-11-26 and not yet applied.
--   Part B1, B2, B3: what the site holds today (which platforms are switched on, which accounts are connected and how they last checked,
--           what the tests and direct posts have done). They carry no names, no emails and no tokens, only platform keys, states and counts.
-- Nothing here proves a platform really publishes: «connected» means the person signed in at the platform and the last check passed.

-- ---------------------------------------------------------------------------
-- Part A. The migrations
-- ---------------------------------------------------------------------------
select 'registry of platforms (20261014150000)' as what, to_regclass('public.platforms') is not null as ok
union all
select 'a platform account can be connected for real (20261015110000)', exists (select 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'platform_accounts' and column_name = 'conn_state')
union all
select 'tests of YouTube (20261103120000)', to_regclass('public.platform_tests') is not null
union all
select 'tests of Instagram (20261103180000)', exists (select 1 from pg_constraint where conname = 'platform_tests_kind_check' and pg_get_constraintdef(oid) like '%story_image%')
union all
select 'tests of a Facebook Page (20261103200000)', exists (select 1 from pg_constraint where conname = 'platform_tests_kind_check' and pg_get_constraintdef(oid) like '%fb_silent%')
union all
select 'direct publish from Home (20261105)', exists (select 1 from pg_proc p where p.proname = 'direct_words' and p.pronamespace = 'public'::regnamespace)
union all
select 'scheduled direct posts on Instagram (20261105210000)', exists (select 1 from pg_proc p where p.proname = 'direct_fire_claim' and p.pronamespace = 'public'::regnamespace)
union all
select 'YouTube''s choices in the work cycle (20261105230000)', exists (select 1 from pg_proc p where p.proname = 'work_publish' and p.pronamespace = 'public'::regnamespace and p.pronargs = 3)
union all
select 'tests and direct posts of TikTok (20261115120000)', exists (select 1 from pg_constraint where conname = 'platform_tests_kind_check' and pg_get_constraintdef(oid) like '%tt_draft%tt_post%')
union all
select 'the platform''s own line kept beside a failure (20261115140000)', exists (select 1 from pg_proc p where p.proname = 'platform_test_failed_detail' and p.pronamespace = 'public'::regnamespace)
union all
select 'X''s link route (20261125120000)', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'platform_accounts' and column_name = 'route')
union all
select 'tests of X''s link route (20261126120000)', exists (select 1 from pg_proc p where p.proname = 'x_link_test_record' and p.pronamespace = 'public'::regnamespace)
union all
select 'Snapchat''s connection (20261126150000)', exists (select 1 from pg_proc p where p.proname = 'platform_conn_app_get' and p.pronamespace = 'public'::regnamespace
  and pg_get_functiondef(p.oid) like '%snapchat_app%')
union all
select 'tests of Snapchat (20261126180000)', exists (select 1 from pg_constraint where conname = 'platform_tests_kind_check' and pg_get_constraintdef(oid) like '%snap_silent%')
  and exists (select 1 from pg_proc p where p.proname = 'platform_test_may' and p.pronamespace = 'public'::regnamespace and pg_get_functiondef(p.oid) like '%snapchat%')
union all
select 'a post Meta published but the site could not record says so (20261126200000)', exists (select 1 from pg_proc p where p.proname = 'direct_fail'
  and p.pronamespace = 'public'::regnamespace and pg_get_functiondef(p.oid) like '%PUBLISHED_UNRECORDED%');

-- ---------------------------------------------------------------------------
-- Part B1. The platforms the site knows and whether each is switched on
-- ---------------------------------------------------------------------------
-- A platform that is not in this list (Facebook, TikTok, Snapchat, WhatsApp) was never added from «المنصات»; one that is «enabled = false» is off.
select key, label_ar, kind, enabled, readiness from public.platforms order by sort, key;

-- ---------------------------------------------------------------------------
-- Part B2. The accounts and how they are connected (no names, no emails, no tokens)
-- ---------------------------------------------------------------------------
-- conn_state: connected = the person signed in at the platform and the last check passed; needs_reconnect or error = see conn_error;
-- simulated = no real connection. authorized_until is the token's real end, or a rolling date for Google, X and Snapchat.
select a.platform, a.conn_kind, a.conn_state, to_jsonb(a) ->> 'route' as route, a.active, a.authorized_until::date as authorized_until,
       a.conn_checked_at::date as last_check, a.conn_error, cardinality(a.publishers) as publishers
from public.platform_accounts a order by a.platform, a.conn_state;

-- ---------------------------------------------------------------------------
-- Part B3. What the tests and the direct posts have done
-- ---------------------------------------------------------------------------
-- state published = it reached the platform; failed = it did not (the reason is in the list on the account's sheet); deleted = it was removed after.
select t.kind, coalesce(to_jsonb(t) ->> 'purpose', 'test') as purpose, t.state, count(*) as n, max(t.created_at)::date as last_one
from public.platform_tests t group by 1, 2, 3 order by 1, 2, 3;

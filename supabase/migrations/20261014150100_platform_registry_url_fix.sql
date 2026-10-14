-- Fix to 20261014150000_platform_registry.sql, found by supabase/tests/platform_rules.sql on the
-- first run: the documentation-link pattern used a repetition count of 300, and Postgres allows
-- at most 255 in a regular expression, so any link was refused with "invalid repetition
-- count(s)". The pattern is now open-ended and the length is checked on its own.
alter table public.platforms drop constraint platforms_docs_url_check;
alter table public.platforms add constraint platforms_docs_url_check
  check (docs_url is null or (docs_url ~ '^https://[^[:space:]]{3,}$' and char_length(docs_url) <= 300));

do $patch$
declare
  d text;
  o text;
begin
  d := pg_get_functiondef('public.platform_save(text,jsonb)'::regprocedure);
  o := d;
  d := replace(d, $s$v_url !~ '^https://[^[:space:]]{3,300}$'$s$,
                  $s$(v_url !~ '^https://[^[:space:]]{3,}$' or char_length(v_url) > 300)$s$);
  if d = o then raise exception 'PATCH_platform_save_NOT_APPLIED'; end if;
  execute d;
end
$patch$;

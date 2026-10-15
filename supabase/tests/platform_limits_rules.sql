-- Platform limits (migration 20261015100000_platform_limits.sql, readiness audit order step 5):
-- the seeded limits and their sources, platform_save reads and writes them (an empty value
-- removes one, anything else is a whole number 1 to 1000000), a save that does not mention them
-- keeps them, video_only is untouched by them, only the platforms right writes, and the log
-- records that limits changed. One transaction, rolled back at the end.
-- Result: qa/platform-limits-rules.json.
begin;
create temp table r(n serial, k text, v text, expect text);
create temp table v(k text primary key, val text);
grant all on r, v to authenticated; grant usage on sequence r_n_seq to authenticated;
insert into public.accounts (email, display_name, role, protected) values
 ('adm@t.test','Adm','admin',true),('wri@t.test','Wri','writer',false);
insert into auth.users (id, email, email_confirmed_at) values
 ('00000000-0000-0000-0000-00000000aa01','adm@t.test',now()),('00000000-0000-0000-0000-00000000b001','wri@t.test',now());
create function pg_temp.who(id text) returns void language sql as $$ select set_config('request.jwt.claims', json_build_object('sub',id,'role','authenticated')::text, true) $$;
create function pg_temp.t(k text, sqltext text, e text) returns void language plpgsql as $$
begin
  begin execute sqltext; insert into r(k,v,expect) values (k,'ok',e);
  exception when others then insert into r(k,v,expect) values (k,'ERR '||sqlerrm,e); end;
end $$;
create function pg_temp.c(k text, val text, e text) returns void language sql as $$ insert into r(k,v,expect) values (k,val,e) $$;
grant execute on function pg_temp.who(text), pg_temp.t(text,text,text), pg_temp.c(text,text,text) to authenticated;

-- The seed -----------------------------------------------------------------------------------------
select pg_temp.c('01 instagram', (select (accepts->>'max_chars') || ':' || (accepts->>'max_hashtags') || ':' || (accepts->>'max_media') || ':' || (accepts->>'fold_chars') || ':' || (accepts->>'video_only') from public.platforms where key = 'instagram'), '2200:30:10:125:false');
select pg_temp.c('02 x', (select (accepts->>'max_chars') || ':' || (accepts->>'max_images') || ':' || (accepts->>'max_videos') || ':' || (accepts->>'url_chars') from public.platforms where key = 'x'), '280:4:1:23');
select pg_temp.c('03 linkedin', (select accepts->>'max_chars' from public.platforms where key = 'linkedin'), '3000');
select pg_temp.c('04 youtube keeps video_only and gets the title and description', (select (accepts->>'video_only') || ':' || (accepts->>'title_max') || ':' || (accepts->>'description_max_bytes') || ':' || (accepts->>'max_videos') from public.platforms where key = 'youtube'), 'true:100:5000:1');
select pg_temp.c('05 every seeded platform says where its numbers came from and when',
  (select count(*)::text from public.platforms where key in ('instagram','x','linkedin','youtube') and accepts ? 'limits_note' and accepts->>'limits_checked' = '2026-10-15'), '4');
select pg_temp.c('06 the mailbox has no limits', (select (accepts - 'video_only')::text from public.platforms where key = 'mail'), '{}');

set local role authenticated;
select pg_temp.who('00000000-0000-0000-0000-00000000b001');
select pg_temp.t('07 a writer cannot change a limit', $q$ select public.platform_save('x', '{"max_chars": 500}') $q$, 'ERR FORBIDDEN');

select pg_temp.who('00000000-0000-0000-0000-00000000aa01');
-- Writing ------------------------------------------------------------------------------------------
select pg_temp.t('08 a limit is saved as a number', $q$ select public.platform_save('x', '{"max_chars": 4000, "max_hashtags": "5"}') $q$, 'ok');
select pg_temp.c('08b both stored as numbers, the others and video_only untouched',
  (select (accepts->>'max_chars') || ':' || (accepts->>'max_hashtags') || ':' || (accepts->>'max_images') || ':' || (accepts->>'video_only') || ':' || jsonb_typeof(accepts->'max_hashtags') from public.platforms where key = 'x'), '4000:5:4:false:number');
select pg_temp.c('08c the log says limits changed', (select count(*)::text from jsonb_array_elements(public.platform_log('x', 20)) e where e->>'kind' = 'updated' and e->'data' ? 'limits'), '1');
select pg_temp.t('09 a save that does not mention the limits keeps them', $q$ select public.platform_save('x', '{"publish_mode": "assisted"}') $q$, 'ok');
select pg_temp.c('09b still there', (select accepts->>'max_chars' from public.platforms where key = 'x'), '4000');
select pg_temp.c('09c and no limits line was written for that save', (select count(*)::text from jsonb_array_elements(public.platform_log('x', 20)) e where e->>'kind' = 'updated' and e->'data' ? 'limits'), '1');
select pg_temp.t('10 an empty value removes a limit', $q$ select public.platform_save('x', '{"max_hashtags": ""}') $q$, 'ok');
select pg_temp.c('10b removed, not set to zero', (select (accepts ? 'max_hashtags')::text from public.platforms where key = 'x'), 'false');
select pg_temp.t('11 zero is refused', $q$ select public.platform_save('x', '{"max_chars": 0}') $q$, 'ERR LIMIT_INVALID');
select pg_temp.t('12 text is refused', $q$ select public.platform_save('x', '{"max_chars": "abc"}') $q$, 'ERR LIMIT_INVALID');
select pg_temp.t('13 a million and one is refused', $q$ select public.platform_save('x', '{"max_chars": 1000001}') $q$, 'ERR LIMIT_INVALID');
select pg_temp.t('14 a negative number is refused', $q$ select public.platform_save('x', '{"max_chars": "-5"}') $q$, 'ERR LIMIT_INVALID');
select pg_temp.c('14b nothing changed by the refusals', (select accepts->>'max_chars' from public.platforms where key = 'x'), '4000');
select pg_temp.t('15 a source note over 300 characters is refused', format($q$ select public.platform_save('x', '{"limits_note": "%s"}') $q$, repeat('ع', 301)), 'ERR LIMIT_NOTE_INVALID');
select pg_temp.t('16 a review date must be a date', $q$ select public.platform_save('x', '{"limits_checked": "yesterday"}') $q$, 'ERR LIMIT_NOTE_INVALID');
select pg_temp.t('17 a source and a day are saved', $q$ select public.platform_save('x', '{"limits_note": "من وثائق المنصة", "limits_checked": "2026-10-16"}') $q$, 'ok');
select pg_temp.c('17b', (select (accepts->>'limits_note') || ':' || (accepts->>'limits_checked') from public.platforms where key = 'x'), 'من وثائق المنصة:2026-10-16');

-- A new platform from a template ---------------------------------------------------------------------------
select pg_temp.t('18 tiktok is added with its limits and video only', $q$ select public.platform_save('tiktok', '{"label_ar":"تيك توك","publish_mode":"assisted","video_only":true,"requires_review":true,"max_chars":2200,"max_videos":1,"max_video_seconds":600,"limits_checked":"2026-10-15"}') $q$, 'ok');
select pg_temp.c('18b stored, and off until switched on',
  (select (accepts->>'video_only') || ':' || (accepts->>'max_chars') || ':' || (accepts->>'max_videos') || ':' || (accepts->>'max_video_seconds') || ':' || enabled::text from public.platforms where key = 'tiktok'), 'true:2200:1:600:false');
select pg_temp.t('19 an unknown key in the body is ignored, not stored', $q$ select public.platform_save('tiktok', '{"label_ar":"تيك توك","evil": 1, "max_chars": 2000}') $q$, 'ok');
select pg_temp.c('19b', (select (accepts ? 'evil')::text || ':' || (accepts->>'max_chars') from public.platforms where key = 'tiktok'), 'false:2000');

reset role;
select * from (
  select n, k, v, expect from r where not coalesce(v = expect or (expect like 'ERR%' and v like expect || '%'), false)
  union all select 0, 'TOTAL', count(*)::text, (count(*) filter (where coalesce(v = expect or (expect like 'ERR%' and v like expect || '%'), false)))::text || ' passed' from r) z order by n;
rollback;

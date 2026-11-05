-- «نشر مباشر» from Home's «إجراءات سريعة» (Director_Notes_Plan.md N-2, owner directive of 2026-11-05 with answer Q2; MVP_draft.md
-- section 76). The director, or the Admin, publishes for real to a connected YouTube channel or Instagram account, outside the
-- work cycle, on the engine of «تجربة النشر» (*platform_tests*). Publishing works stays a simulation.
--
--   * Who: the fixed capability `publish.direct`, the Admin's and the director's only, like `motion.studio`. No grant,
--     template, preset or request can give it. The person must also be one who may test the account (platform_test_may).
--   * A direct post is a row of platform_tests with `purpose` 'direct'. A test stays a test: 10 a day per account, never
--     notifying subscribers, scheduled at most 30 days ahead. A direct post: 20 a day per account (under YouTube's 100 uploads
--     a day for the whole project, shared with the tests), YouTube may notify subscribers (`notify`), and «مجدول» may be up to
--     180 days ahead. Facebook takes no direct post yet («قريباً»).
--   * Nothing is hidden: when a direct post arrives, the library's log (activity_log, «سجل النشاط») records it as `direct`, and
--     the account's publishers and the assistants are told «للعلم». Deleting one is the capability's only, and is recorded as
--     `direct_off`. A test records nothing, as before.

insert into public.capabilities (key, grp, label_ar, grantable, scope_kind, min_rank, fixed_roles, why_ar, sort) values
  ('publish.direct', 'fixed', 'النشر المباشر من «الرئيسية»', false, 'none', 3, '{admin,director}',
     'النشر المباشر يتجاوز دورة العمل، فهو لمسؤول النظام ومدير الاتصال المؤسسي فقط، بقرار المالك في 2026-11-05.', 67);

alter table public.platform_tests
  add column purpose text not null default 'test' check (purpose in ('test','direct')),
  add column notify boolean,
  add constraint platform_tests_notify_kind check (notify is null or (purpose = 'direct' and kind = 'video'));
create index platform_tests_purpose_idx on public.platform_tests (account_id, purpose, created_at desc);
grant select (purpose, notify) on public.platform_tests to authenticated;

-- ---------------------------------------------------------------------------
-- 1. Starting: a test, or a direct post by a holder of publish.direct
-- ---------------------------------------------------------------------------
-- p: as before ({privacy, title, source, asset, version, size, mime, scheduled_for} for YouTube; {kind, title, source, asset,
-- version, size, mime, share_to_feed} for Instagram; {kind, title, link, scheduled_for, ...} for a Page), plus `purpose`
-- ('test' when absent) and, for a YouTube direct post, `notify`.
create or replace function public.platform_test_start(p_account uuid, p jsonb) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  me text := public.current_email(); a public.platform_accounts; v_id uuid;
  v_title text := btrim(coalesce(p->>'title', '')); v_source text := nullif(p->>'source', '');
  v_kind text := coalesce(nullif(p->>'kind', ''), 'video'); v_privacy text := nullif(p->>'privacy', '');
  v_mime text := nullif(p->>'mime', ''); v_link text := nullif(btrim(coalesce(p->>'link', '')), '');
  v_purpose text := coalesce(nullif(p->>'purpose', ''), 'test');
  v_size bigint; v_version int; v_asset uuid; v_feed boolean; v_when timestamptz; v_notify boolean; v_bad boolean;
  v_text boolean; v_cap int;
begin
  if me is null or not public.platform_test_may(p_account) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if v_purpose not in ('test','direct') then raise exception 'TEST_INVALID' using errcode = 'P0001'; end if;
  if v_purpose = 'direct' and not public.has_capability('publish.direct') then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  select * into a from public.platform_accounts where id = p_account for update;
  if not a.active then raise exception 'ACCOUNT_OFF' using errcode = 'P0001'; end if;
  if a.conn_state <> 'connected' or a.integration_id is null or a.external_id is null then raise exception 'NOT_CONNECTED' using errcode = 'P0001'; end if;
  begin
    v_size := (p->>'size')::bigint;
    v_version := nullif(p->>'version', '')::int;
    v_asset := nullif(p->>'asset', '')::uuid;
    v_feed := (p->>'share_to_feed')::boolean;
    v_when := nullif(p->>'scheduled_for', '')::timestamptz;
    v_notify := (p->>'notify')::boolean;
  exception when others then raise exception 'TEST_INVALID' using errcode = 'P0001';
  end;
  v_text := v_kind in ('fb_silent','fb_text');
  v_bad := char_length(v_title) not between 1 and 100 or v_title ~ '[<>]'
    or (v_link is not null and v_kind <> 'fb_text') or (v_when is not null and v_kind not in ('fb_silent','video'))
    or (v_notify is not null and (v_purpose <> 'direct' or a.platform <> 'youtube'));
  if v_text then
    v_bad := v_bad or v_source is not null or v_size is not null or v_mime is not null or v_asset is not null;
  else
    v_bad := v_bad or v_source is null or v_source not in ('device','library') or v_size is null or v_size < 1 or v_mime is null
      or (v_source = 'library') <> (v_asset is not null and v_version is not null);
  end if;
  if a.platform = 'youtube' then
    -- «مجدول» is private until its time; a public or unlisted video has no time.
    v_bad := v_bad or v_kind <> 'video' or coalesce(v_privacy, '') not in ('private','public','unlisted') or v_feed is not null
      or v_size > 1073741824 or v_mime !~ '^video/[a-z0-9.+-]{1,60}$'
      or (v_when is not null and v_privacy <> 'private');
  elsif a.platform = 'instagram' then
    v_bad := v_bad or v_kind not in ('story_image','story_video','image','reel') or v_privacy is not null
      or (v_feed is not null and v_kind <> 'reel')
      or (v_kind in ('story_image','image') and (v_mime <> 'image/jpeg' or v_size > 8388608 or v_source <> 'device'))
      or (v_kind in ('story_video','reel') and (v_mime not in ('video/mp4','video/quicktime') or v_size > 104857600));
  else
    -- A Facebook Page takes tests only: its direct posts are «قريباً».
    v_bad := v_bad or v_purpose = 'direct'
      or v_kind not in ('fb_silent','fb_text','fb_photo','fb_reel') or v_privacy is not null or v_feed is not null
      or (v_kind = 'fb_silent' and (v_when is null or v_when < now() + interval '10 minutes' or v_when > now() + interval '30 days'))
      or (v_link is not null and (char_length(v_link) > 2000 or v_link !~ '^https://[^\s<>"]+$'))
      or (v_kind = 'fb_photo' and (v_mime <> 'image/jpeg' or v_size > 4194304 or v_source <> 'device'))
      or (v_kind = 'fb_reel' and (v_mime not in ('video/mp4','video/quicktime') or v_size > 104857600));
  end if;
  if v_bad then raise exception 'TEST_INVALID' using errcode = 'P0001'; end if;
  -- A scheduled YouTube video: the site's own window, 30 days for a test and 180 for a direct post, said by name.
  if a.platform = 'youtube' and v_when is not null and (v_when < now() + interval '10 minutes'
      or v_when > now() + case when v_purpose = 'direct' then interval '180 days' else interval '30 days' end) then
    raise exception 'SCHEDULE_INVALID' using errcode = 'P0001';
  end if;
  -- One upload at a time: this person's open one on this account, and anyone's older than a day, are closed.
  update public.platform_tests set state = 'failed', error = 'ABANDONED', upload_url = null, link_hash = null, link_until = null, done_at = now()
    where account_id = p_account and state = 'uploading' and (created_by = me or created_at < now() - interval '1 day');
  v_cap := case when v_purpose = 'direct' then 20 else 10 end;
  if (select count(*) from public.platform_tests
      where account_id = p_account and purpose = v_purpose and state <> 'failed' and created_at > now() - interval '1 day') >= v_cap then
    raise exception 'TEST_LIMIT' using errcode = 'P0001';
  end if;
  insert into public.platform_tests (account_id, kind, privacy, title, source, asset_id, asset_version, size, mime, share_to_feed, link,
      scheduled_for, purpose, notify, created_by)
  values (p_account, v_kind, v_privacy, v_title, v_source, v_asset, case when v_source = 'library' then v_version end, v_size, v_mime,
          case when v_kind = 'reel' then coalesce(v_feed, false) end, v_link, v_when, v_purpose,
          case when v_purpose = 'direct' and a.platform = 'youtube' then coalesce(v_notify, v_privacy = 'public' or v_when is not null) end, me)
  returning id into v_id;
  return v_id;
end
$$;

-- ---------------------------------------------------------------------------
-- 2. What a direct post says: in the log, and to the account's publishers and the assistants
-- ---------------------------------------------------------------------------
create function public.direct_words(t public.platform_tests) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'name', t.title,
    'platform', coalesce(p.label_ar, a.platform),
    'account', a.label,
    'shown', case
      when t.kind = 'video' and t.scheduled_for is not null and t.shown_publish_at is not null then 'مجدول'
      when t.kind = 'video' then case coalesce(t.shown_privacy, t.privacy) when 'public' then 'عام' when 'unlisted' then 'غير مدرج' else 'خاص' end
      when t.kind in ('story_image','story_video') then 'قصة'
      when t.kind = 'image' then 'منشور صورة'
      when t.kind = 'reel' then 'ريلز'
      else '' end,
    'publish_at', t.shown_publish_at,
    'video', t.video_id,
    'link', t.post_url)
  from public.platform_accounts a left join public.platforms p on p.key = a.platform
  where a.id = t.account_id
$$;

create function public.direct_announce(t public.platform_tests, p_type text) returns void
language plpgsql security definer set search_path = ''
as $$
declare w jsonb := public.direct_words(t); v_folder uuid; v_to text[];
begin
  select folder_id into v_folder from public.media_files where id = t.asset_id;
  perform public.media_log(p_type, t.asset_id, v_folder, null, w);
  select coalesce(a.publishers, '{}') || coalesce((select array_agg(x.email) from public.accounts x where x.role = 'assistant'), '{}')
    into v_to from public.platform_accounts a where a.id = t.account_id;
  perform public.work_notify_many(v_to, 'info',
    case when p_type = 'direct_off'
      then 'حُذف منشور مباشر «' || (w->>'name') || '» من ' || (w->>'platform') || ' · ' || (w->>'account') || '.'
      when w->>'shown' = 'مجدول'
      then 'جُدول نشر مباشر «' || (w->>'name') || '» على ' || (w->>'platform') || ' · ' || (w->>'account') || '، ويصبح عاماً في موعده.'
      else 'نُشر مباشرة «' || (w->>'name') || '» على ' || (w->>'platform') || ' · ' || (w->>'account') || ' (' || (w->>'shown') || ').' end,
    jsonb_build_object('page', 'accounts'));
end
$$;

-- ---------------------------------------------------------------------------
-- 3. The post arrives: as before, and a direct post is announced
-- ---------------------------------------------------------------------------
create or replace function public.platform_test_done(p_key text, p_test uuid, p_video text, p_channel text, p_privacy text, p_url text default null,
    p_publish_at timestamptz default null) returns text
language plpgsql security definer set search_path = ''
as $$
declare me text := public.current_email(); t public.platform_tests; v_ext text;
begin
  if not public.mail_key_ok(p_key) or me is null then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  select * into t from public.platform_tests where id = p_test for update;
  if not found or t.created_by <> me or t.state <> 'uploading' or not public.platform_test_may(t.account_id) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  select external_id into v_ext from public.platform_accounts where id = t.account_id;
  if p_channel is distinct from v_ext or p_video is null or p_video !~ '^[A-Za-z0-9_-]{6,60}$' then
    update public.platform_tests set state = 'failed', error = 'CHANNEL_MISMATCH', upload_url = null, link_hash = null, link_until = null,
        done_at = now() where id = t.id;
    return 'failed';
  end if;
  update public.platform_tests set state = 'published', video_id = p_video, upload_url = null, link_hash = null, link_until = null,
      done_at = now(),
      shown_privacy = case when t.kind = 'video' and p_privacy in ('private','public','unlisted') then p_privacy end,
      shown_publish_at = case when t.kind = 'video' then p_publish_at end,
      post_url = case when t.kind <> 'video' and char_length(p_url) <= 300
        and (p_url like 'https://www.instagram.com/%' or p_url like 'https://www.facebook.com/%') then p_url end
    where id = t.id
    returning * into t;
  if t.purpose = 'direct' then perform public.direct_announce(t, 'direct'); end if;
  return 'published';
end
$$;

-- ---------------------------------------------------------------------------
-- 4. Deleting: a test by anyone who may test the account, a direct post by the capability's holders only
-- ---------------------------------------------------------------------------
create or replace function public.platform_test_deleted(p_key text, p_test uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare me text := public.current_email(); t public.platform_tests;
begin
  if not public.mail_key_ok(p_key) or me is null then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  update public.platform_tests set state = 'deleted', deleted_by = me, deleted_at = now()
    where id = p_test and state = 'published' and public.platform_test_may(account_id)
      and (purpose = 'test' or public.has_capability('publish.direct'))
    returning * into t;
  if not found then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if t.purpose = 'direct' then perform public.direct_announce(t, 'direct_off'); end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 5. Privileges
-- ---------------------------------------------------------------------------
revoke all on function public.direct_words(public.platform_tests), public.direct_announce(public.platform_tests, text) from public, anon, authenticated;

-- Push notices, the server half (Android_Build_Plan.md A5; Mobile_Apps_Plan.md 5.3 to 5.5;
-- MVP_draft.md 64.3; owner directive of 2026-10-26, decisions M-3, M-4, M-5 and M-13).
--
-- Rules kept here, not in the interface:
--   * «أجهزتي»: a person sees and manages only their own devices (M-13). The FCM token is never
--     selectable by a page: the table grants only its other columns, and pages read the view
--     `my_devices`. Only the sender's security-definer function reads a token, with the server key.
--   * The outbox holds ids, never text: a device, a kind and a reference (a notice, a chat message
--     or a mail message), one row per device per reference. The words are built at claim time.
--   * What is pushed (M-4): «يحتاج قرارك» (decide) always, «يحتاج انتباهك» (attention) if the device
--     keeps it on, «للعلم» (info) never; nothing about the person's own action. Messaging: direct
--     messages, mentions and the urgent levels, never to the author or to a member who muted the
--     conversation (level 3 passes a mute, as its notice does). Mail: action cards addressed to the
--     person in internal mail. Messaging and mail carry only «رسالة جديدة من …» (M-5), never their
--     text, so the notices chat_send writes for urgent messages (which quote the message) are pushed
--     by the chat route instead of the notice trigger.
--   * «إخفاء نص التنبيهات» replaces a notice's text and a sender's name with a fixed line.
--   * Nothing is scheduled (M-3, S-1 and S-2): the site's route /api/push/flush claims and reports
--     when a signed-in page that just wrote, or the WhatsApp bridge computer, asks. It proves itself
--     with MAIL_SERVER_KEY, whose sha256 alone is in mail_server_key. There is no database-started call.
--   * The Firebase service account is an integration of type fcm_service_account in Vault, entered
--     in «الإعدادات» by a holder of «integrations.secrets» and checked before it is kept.

-- ---------------------------------------------------------------------------
-- Devices
-- ---------------------------------------------------------------------------
create table public.devices (
  id uuid primary key default gen_random_uuid(),
  email text not null references public.accounts(email) on delete cascade on update cascade,
  platform text not null check (platform in ('android')),
  version text not null check (version ~ '^[0-9]{1,4}\.[0-9]{1,4}\.[0-9]{1,6}$'),
  name text not null check (char_length(btrim(name)) between 1 and 60),
  channel text not null default 'fcm' check (channel in ('fcm')),
  fcm_token text check (fcm_token is null or (fcm_token ~ '^[A-Za-z0-9_:-]+$' and char_length(fcm_token) between 20 and 4096)),
  push_ready boolean generated always as (fcm_token is not null) stored,
  -- «يحتاج قرارك» always; «يحتاج انتباهك» while the person keeps it.
  tiers text[] not null default array['decide', 'attention']
    check (tiers <@ array['decide', 'attention']::text[] and 'decide' = any (tiers)),
  hide_text boolean not null default false,
  created_at timestamptz not null default now(),
  seen_at timestamptz not null default now(),
  token_at timestamptz,
  removed_at timestamptz,
  constraint devices_removed_no_token check (removed_at is null or fcm_token is null)
);
-- One installation holds a token: it is on one live row at most.
create unique index devices_token_idx on public.devices (fcm_token) where fcm_token is not null;
create index devices_email_idx on public.devices (email);
alter table public.devices enable row level security;
create policy devices_read on public.devices for select to authenticated
  using (email = (select public.current_email()));
-- Every column but the token. A page that names fcm_token is refused by the database.
revoke all on public.devices from public, anon, authenticated;
grant select (id, email, platform, version, name, channel, push_ready, tiers, hide_text, created_at, seen_at, token_at, removed_at)
  on public.devices to authenticated;

-- What «أجهزتي» reads: the person's live devices, without the token.
create view public.my_devices with (security_invoker = true) as
  select d.id, d.platform, d.version, d.name, d.push_ready, ('attention' = any (d.tiers)) as attention, d.hide_text,
         d.created_at, d.seen_at
  from public.devices d
  where d.removed_at is null and d.email = (select public.current_email());
revoke all on public.my_devices from public, anon, authenticated;
grant select on public.my_devices to authenticated;

-- ---------------------------------------------------------------------------
-- The outbox: ids only
-- ---------------------------------------------------------------------------
create table public.push_outbox (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.devices(id) on delete cascade,
  kind text not null check (kind in ('notice', 'chat', 'mail')),
  notice_id uuid references public.notifications(id) on delete cascade,
  message_id uuid references public.chat_messages(id) on delete cascade,
  mail_id uuid references public.mail_messages(id) on delete cascade,
  ref uuid generated always as (coalesce(notice_id, message_id, mail_id)) stored,
  tier text not null check (tier in ('decide', 'attention')),
  state text not null default 'queued' check (state in ('queued', 'sending', 'sent', 'failed', 'skipped')),
  attempts int not null default 0 check (attempts between 0 and 5),
  -- A code, never a provider's words.
  error text check (error is null or error ~ '^[A-Z_]{2,40}$'),
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  sent_at timestamptz,
  constraint push_outbox_ref check (
    (kind = 'notice') = (notice_id is not null) and (kind = 'chat') = (message_id is not null)
    and (kind = 'mail') = (mail_id is not null)),
  constraint push_outbox_once unique (device_id, kind, ref)
);
create index push_outbox_queue_idx on public.push_outbox (state, created_at);
create index push_outbox_notice_idx on public.push_outbox (notice_id);
create index push_outbox_message_idx on public.push_outbox (message_id);
create index push_outbox_mail_idx on public.push_outbox (mail_id);
alter table public.push_outbox enable row level security;
-- A person may see what was queued for their own devices (ids and states only).
create policy push_outbox_read on public.push_outbox for select to authenticated
  using (exists (select 1 from public.devices d where d.id = device_id and d.email = (select public.current_email())));

-- The flush turn: a lock and a gate, as mail_sync_begin keeps mail_settings.
create table public.push_state (
  id int primary key default 1 check (id = 1),
  flush_lock timestamptz,
  flush_at timestamptz
);
insert into public.push_state (id) values (1);
alter table public.push_state enable row level security;
create policy push_state_read on public.push_state for select to authenticated
  using ((select public.has_capability('settings.view', null)));

-- ---------------------------------------------------------------------------
-- Filling the outbox
-- ---------------------------------------------------------------------------
-- Notices: decide always, attention if the device keeps it, never info, never to the actor.
-- Notices about messaging (go.page = 'chat') quote the message, so the chat route pushes those.
create function public.push_on_notice() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.tier not in ('decide', 'attention') or new.read_at is not null then return null; end if;
  if new.recipient is not distinct from public.current_email() then return null; end if;
  if coalesce(new.go->>'page', '') = 'chat' then return null; end if;
  insert into public.push_outbox (device_id, kind, notice_id, tier)
  select d.id, 'notice', new.id, new.tier
  from public.devices d
  where d.email = new.recipient and d.removed_at is null and d.fcm_token is not null and new.tier = any (d.tiers)
  on conflict do nothing;
  return null;
end
$$;
create trigger notifications_push after insert on public.notifications
  for each row execute function public.push_on_notice();

-- Messaging, inside chat_send: every other member of the room for a direct message, a mention of
-- them, or an urgent level; level 3 is a decision and passes a muted conversation, the rest do not.
create function public.push_route_chat(p_msg uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare m public.chat_messages; t public.chat_rooms;
begin
  select * into m from public.chat_messages where id = p_msg;
  if not found or m.kind = 'sys' or m.deleted then return; end if;
  select * into t from public.chat_rooms where id = m.room_id;
  insert into public.push_outbox (device_id, kind, message_id, tier)
  select d.id, 'chat', m.id, x.tier
  from (
    select cm.email, case when m.urgency = 3 then 'decide' else 'attention' end as tier
    from public.chat_members cm
    where cm.room_id = m.room_id and cm.email <> m.author
      and (m.urgency = 3
           or (not cm.muted and (t.type = 'dm' or m.urgency > 0
               or (m.kind = 'text' and position('@' || public.work_name(cm.email) in m.body) > 0))))
  ) x
  join public.devices d on d.email = x.email and d.removed_at is null and d.fcm_token is not null and x.tier = any (d.tiers)
  on conflict do nothing;
end
$$;

-- Internal mail, inside mail_send: an action card addressed to the person (a task's assignee, a
-- date's askee, the approvers among the participants of an approval card), never the author, never
-- a muted thread, never mail that nobody sees yet (held, or scheduled for later).
create function public.push_route_mail(p_msg uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare x public.mail_messages; th public.mail_threads;
begin
  select * into x from public.mail_messages where id = p_msg;
  if not found or x.kind <> 'mail' or x.card is null or x.state <> 'sent' then return; end if;
  if x.send_at is not null and x.send_at > now() then return; end if;
  select * into th from public.mail_threads where id = x.thread_id;
  if th.kind <> 'internal' then return; end if;
  insert into public.push_outbox (device_id, kind, mail_id, tier)
  select d.id, 'mail', x.id, 'decide'
  from (
    select x.card->>'assignee' as e where x.card->>'type' = 'task'
    union select x.card->>'askee' where x.card->>'type' = 'date' and x.card->>'askee' is distinct from 'ext'
    union select a.email from public.mail_members p join public.accounts a on a.email = p.email
      where x.card->>'type' = 'approval' and p.thread_id = x.thread_id and p.participant and a.role in ('director', 'assistant')
  ) r
  join public.mail_members mm on mm.thread_id = x.thread_id and mm.email = r.e and mm.participant and not mm.muted
  join public.devices d on d.email = r.e and d.removed_at is null and d.fcm_token is not null and 'decide' = any (d.tiers)
  where r.e is distinct from x.author
  on conflict do nothing;
end
$$;

-- The two hooks, spliced into the current definitions without changing anything else. A function
-- that does not carry the expected end fails the migration instead of being half-changed.
do $$
declare src text; hook text;
begin
  src := pg_get_functiondef('public.chat_send(uuid,text,text,uuid,jsonb,smallint,boolean)'::regprocedure);
  hook := E'  perform public.wa_route(mid);\n  return mid;\nend';
  if (length(src) - length(replace(src, hook, ''))) <> length(hook) then
    raise exception 'chat_send changed: review the push migration';
  end if;
  execute replace(src, hook, E'  perform public.wa_route(mid);\n  perform public.push_route_chat(mid);\n  return mid;\nend');

  src := pg_get_functiondef('public.mail_send(uuid,text,text[],text[],text[],text,uuid[],uuid[],jsonb,timestamptz,jsonb,boolean)'::regprocedure);
  hook := E'  return jsonb_build_object(''thread'', t.id, ''message'', mid, ''state'', st);\nend';
  if (length(src) - length(replace(src, hook, ''))) <> length(hook) then
    raise exception 'mail_send changed: review the push migration';
  end if;
  execute replace(src, hook, E'  perform public.push_route_mail(mid);\n' || hook);
end $$;

-- ---------------------------------------------------------------------------
-- The person's side: «أجهزتي» and «إعدادات التنبيهات»
-- ---------------------------------------------------------------------------
-- Called by the application, signed in, at its first opening and whenever its token changes. It
-- passes the device id it was given before (or null), and its current token (or null). A removed
-- device is refused, so the application signs out. A token that was on another row (another
-- person signed in on this phone before) leaves that row, which is removed.
create function public.device_register(p_device uuid, p_platform text, p_version text, p_name text, p_token text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare me text := public.current_email(); d public.devices; prev public.devices; v_name text;
begin
  if me is null or not public.is_approved() then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if p_platform is distinct from 'android' then raise exception 'DEVICE_PLATFORM' using errcode = 'P0001'; end if;
  if p_version is null or p_version !~ '^[0-9]{1,4}\.[0-9]{1,4}\.[0-9]{1,6}$' then raise exception 'DEVICE_VERSION' using errcode = 'P0001'; end if;
  if p_token is not null and (p_token !~ '^[A-Za-z0-9_:-]+$' or char_length(p_token) not between 20 and 4096) then
    raise exception 'DEVICE_TOKEN' using errcode = 'P0001';
  end if;
  v_name := left(btrim(coalesce(p_name, '')), 60);
  if v_name = '' then v_name := 'هاتف Android'; end if;

  if p_device is not null then
    select * into d from public.devices where id = p_device and email = me for update;
    if found and d.removed_at is not null then raise exception 'DEVICE_REMOVED' using errcode = 'P0001'; end if;
  end if;
  -- The application lost its stored id but kept its token: the same device, not a new one.
  if d.id is null and p_token is not null then
    select * into d from public.devices where fcm_token = p_token and email = me and removed_at is null for update;
  end if;
  if p_token is not null then
    update public.devices set fcm_token = null, token_at = null, removed_at = now()
      where fcm_token = p_token and id is distinct from d.id;
  end if;

  if d.id is null then
    if (select count(*) from public.devices where email = me and removed_at is null) >= 20 then
      raise exception 'DEVICE_LIMIT' using errcode = 'P0001';
    end if;
    -- A new phone keeps the person's choices from their latest device.
    select * into prev from public.devices where email = me and removed_at is null order by seen_at desc limit 1;
    insert into public.devices (email, platform, version, name, fcm_token, token_at, tiers, hide_text)
    values (me, p_platform, p_version, v_name, p_token, case when p_token is not null then now() end,
            coalesce(prev.tiers, array['decide', 'attention']), coalesce(prev.hide_text, false))
    returning * into d;
  else
    update public.devices set platform = p_platform, version = p_version, fcm_token = p_token,
        token_at = case when p_token is null then null when p_token is distinct from d.fcm_token then now() else token_at end,
        seen_at = now()
      where id = d.id
      returning * into d;
  end if;
  return jsonb_build_object('id', d.id, 'name', d.name, 'push', d.fcm_token is not null);
end
$$;

-- At each opening: 'live', 'removed' (the application signs out locally) or 'unknown' (the id is
-- not this person's: the application registers again).
create function public.device_seen(p_device uuid, p_version text) returns text
language plpgsql security definer set search_path = ''
as $$
declare me text := public.current_email(); d public.devices;
begin
  if me is null or not public.is_approved() then return 'unknown'; end if;
  select * into d from public.devices where id = p_device and email = me;
  if not found then return 'unknown'; end if;
  if d.removed_at is not null then return 'removed'; end if;
  update public.devices set seen_at = now(),
      version = case when p_version ~ '^[0-9]{1,4}\.[0-9]{1,4}\.[0-9]{1,6}$' then p_version else version end
    where id = d.id;
  return 'live';
end
$$;

create function public.device_rename(p_device uuid, p_name text) returns void
language plpgsql security definer set search_path = ''
as $$
declare me text := public.current_email(); v_name text := btrim(coalesce(p_name, ''));
begin
  if me is null then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if char_length(v_name) not between 1 and 60 then raise exception 'DEVICE_NAME' using errcode = 'P0001'; end if;
  update public.devices set name = v_name where id = p_device and email = me and removed_at is null;
  if not found then raise exception 'DEVICE_NOT_FOUND' using errcode = 'P0001'; end if;
end
$$;

-- «إزالة الجهاز»: its token is deleted at once, nothing more is sent to it, and at its next opening
-- the application finds itself removed and signs out.
create function public.device_remove(p_device uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare me text := public.current_email();
begin
  if me is null then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  update public.devices set removed_at = now(), fcm_token = null, token_at = null
    where id = p_device and email = me and removed_at is null;
  if not found then raise exception 'DEVICE_NOT_FOUND' using errcode = 'P0001'; end if;
  delete from public.push_outbox where device_id = p_device and state in ('queued', 'sending');
end
$$;

-- «إعدادات التنبيهات»: «يحتاج انتباهك» on or off, and «إخفاء نص التنبيهات», for one device or, with a
-- null id, for all the person's devices. Null leaves a setting as it is. Returns the devices changed.
create function public.device_prefs(p_device uuid, p_attention boolean, p_hide_text boolean) returns int
language plpgsql security definer set search_path = ''
as $$
declare me text := public.current_email(); n int;
begin
  if me is null then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  update public.devices set
      tiers = case when p_attention is null then tiers when p_attention then array['decide', 'attention'] else array['decide'] end,
      hide_text = coalesce(p_hide_text, hide_text)
    where email = me and removed_at is null and (p_device is null or id = p_device);
  get diagnostics n = row_count;
  if p_device is not null and n = 0 then raise exception 'DEVICE_NOT_FOUND' using errcode = 'P0001'; end if;
  if p_attention = false then
    update public.push_outbox o set state = 'skipped', error = 'TIER_OFF'
      from public.devices d
      where d.id = o.device_id and d.email = me and (p_device is null or d.id = p_device)
        and o.tier = 'attention' and o.state = 'queued';
  end if;
  return n;
end
$$;

-- ---------------------------------------------------------------------------
-- The Firebase service account (Vault)
-- ---------------------------------------------------------------------------
-- The integration row the credential is stored under, made the first time it is entered. The
-- secret itself goes through int_secret_set, the server's check and int_secret_commit.
create function public.push_fcm_slot() returns uuid
language plpgsql security definer set search_path = ''
as $$
declare me text := public.current_email(); v uuid;
begin
  if me is null or not public.has_capability('integrations.secrets', null) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  select id into v from public.integrations where type = 'fcm_service_account' and deleted_at is null order by created_at limit 1;
  if v is null then
    insert into public.integrations (kind, type, label, state, created_by)
    values ('messaging', 'fcm_service_account', 'Firebase Cloud Messaging', 'pending', me)
    returning id into v;
    insert into public.integration_events (integration_id, actor, kind, data)
    values (v, me, 'created', jsonb_build_object('type', 'fcm_service_account'));
  end if;
  return v;
end
$$;

-- ---------------------------------------------------------------------------
-- Server only (MAIL_SERVER_KEY): the flush route
-- ---------------------------------------------------------------------------
-- Takes the flush turn. Answers at once when nothing waits; otherwise one flush at a time (a lock
-- left by a stopped flush ends after a minute), and not again within two seconds of the last.
create function public.push_flush_begin(p_key text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.mail_key_ok(p_key) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.push_outbox o
                 where o.state = 'queued' or (o.state = 'sending' and o.claimed_at < now() - interval '5 minutes')) then
    return jsonb_build_object('go', false, 'why', 'empty');
  end if;
  update public.push_state set flush_lock = now()
    where id = 1 and (flush_lock is null or flush_lock < now() - interval '1 minute')
      and (flush_at is null or flush_at < now() - interval '2 seconds');
  if not found then return jsonb_build_object('go', false, 'why', 'busy'); end if;
  return jsonb_build_object('go', true);
end
$$;

create function public.push_flush_end(p_key text) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.mail_key_ok(p_key) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  update public.push_state set flush_lock = null, flush_at = now() where id = 1;
end
$$;

-- Claims queued rows (marks them sending) and builds each payload now, by the rules of
-- Mobile_Apps_Plan.md 5.4: the device's token, the tier, the notice id, a destination inside the
-- site with no query string, a notice's text unless the device hides it, and for messaging and
-- mail only «رسالة جديدة من …». A row whose device, conversation or reader changed is closed here
-- instead of going out. A row claimed but never reported waits again, five attempts in all.
create function public.push_claim(p_key text, p_limit int) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_out jsonb := '[]'::jsonb; o public.push_outbox; d public.devices; n public.notifications;
        cm public.chat_messages; mm public.mail_messages; why text; v_ref uuid; v_from text;
begin
  if not public.mail_key_ok(p_key) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  update public.push_outbox set state = case when attempts >= 5 then 'failed' else 'queued' end,
      error = case when attempts >= 5 then 'STALE' else error end
    where state = 'sending' and claimed_at < now() - interval '5 minutes';
  for o in select * from public.push_outbox where state = 'queued' order by created_at
           limit least(greatest(coalesce(p_limit, 20), 1), 100) for update skip locked loop
    why := null; n := null; cm := null; mm := null; v_ref := null; v_from := null;
    select * into d from public.devices where id = o.device_id;
    if d.removed_at is not null or d.fcm_token is null then
      why := 'DEVICE_GONE';
    elsif not (o.tier = any (d.tiers)) then
      why := 'TIER_OFF';
    elsif o.kind = 'notice' then
      select * into n from public.notifications where id = o.notice_id;
      v_ref := n.id;
      if n.read_at is not null then why := 'READ'; end if;
    elsif o.kind = 'chat' then
      select * into cm from public.chat_messages where id = o.message_id;
      v_ref := cm.room_id; v_from := cm.author;
      if cm.deleted then why := 'DELETED';
      elsif not exists (select 1 from public.chat_members x where x.room_id = cm.room_id and x.email = d.email) then why := 'NOT_MEMBER';
      elsif exists (select 1 from public.chat_members x where x.room_id = cm.room_id and x.email = d.email and x.last_read_at > cm.created_at) then why := 'READ';
      end if;
    else
      select * into mm from public.mail_messages where id = o.mail_id;
      v_ref := mm.thread_id; v_from := mm.author;
      if not exists (select 1 from public.mail_members x where x.thread_id = mm.thread_id and x.email = d.email and x.participant) then why := 'NOT_MEMBER';
      elsif exists (select 1 from public.mail_members x where x.thread_id = mm.thread_id and x.email = d.email and x.read_at > mm.created_at) then why := 'READ';
      end if;
    end if;
    if why is not null then
      update public.push_outbox set state = case when why in ('READ', 'TIER_OFF') then 'skipped' else 'failed' end, error = why
        where id = o.id;
      continue;
    end if;
    update public.push_outbox set state = 'sending', claimed_at = now(), attempts = attempts + 1 where id = o.id;
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'id', o.id,
      'token', d.fcm_token,
      'kind', o.kind,
      'tier', o.tier,
      'notice', case when o.kind = 'notice' then n.id end,
      'title', case o.kind when 'chat' then 'المراسلة' when 'mail' then 'البريد'
                 else case o.tier when 'decide' then 'يحتاج قرارك' else 'يحتاج انتباهك' end end,
      'body', case when o.kind = 'notice' then (case when d.hide_text then 'لديك إشعار جديد في المركز.' else left(n.body, 240) end)
                   when d.hide_text then 'رسالة جديدة'
                   else 'رسالة جديدة من ' || left(coalesce((select a.display_name from public.accounts a where a.email = v_from), 'زميل'), 80) end,
      'go', '/n/' || o.kind || '/' || v_ref::text,
      'tag', o.kind || ':' || v_ref::text || ':' || o.tier));
  end loop;
  return v_out;
end
$$;

-- What the sender found, for each claimed row: {id, ok, error}. TOKEN_GONE (the provider says the
-- token is no longer valid) deletes that device's token and closes its waiting rows; RETRY sends
-- the row back to the queue while attempts remain; any other code closes it. Returns rows closed.
create function public.push_report(p_key text, p jsonb) returns int
language plpgsql security definer set search_path = ''
as $$
declare r record; o public.push_outbox; v_err text; n int := 0;
begin
  if not public.mail_key_ok(p_key) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if jsonb_typeof(p) is distinct from 'array' then return 0; end if;
  for r in select * from jsonb_to_recordset(p) as x(id uuid, ok boolean, error text) limit 200 loop
    select * into o from public.push_outbox where id = r.id and state = 'sending' for update;
    if not found then continue; end if;
    n := n + 1;
    if coalesce(r.ok, false) then
      update public.push_outbox set state = 'sent', sent_at = now(), error = null where id = o.id;
      continue;
    end if;
    v_err := case when r.error ~ '^[A-Z_]{2,40}$' then r.error else 'FAILED' end;
    if v_err = 'TOKEN_GONE' then
      update public.push_outbox set state = 'failed', error = v_err where id = o.id;
      update public.devices set fcm_token = null, token_at = null where id = o.device_id;
      update public.push_outbox set state = 'failed', error = v_err where device_id = o.device_id and state = 'queued';
    elsif v_err = 'RETRY' and o.attempts < 5 then
      update public.push_outbox set state = 'queued', claimed_at = null, error = v_err where id = o.id;
    else
      update public.push_outbox set state = 'failed', error = v_err where id = o.id;
    end if;
  end loop;
  return n;
end
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke all on function public.push_on_notice(), public.push_route_chat(uuid), public.push_route_mail(uuid)
  from public, anon, authenticated;
revoke all on function public.device_register(uuid, text, text, text, text), public.device_seen(uuid, text),
  public.device_rename(uuid, text), public.device_remove(uuid), public.device_prefs(uuid, boolean, boolean),
  public.push_fcm_slot(), public.push_flush_begin(text), public.push_flush_end(text), public.push_claim(text, int),
  public.push_report(text, jsonb) from public, anon;
grant execute on function public.device_register(uuid, text, text, text, text), public.device_seen(uuid, text),
  public.device_rename(uuid, text), public.device_remove(uuid), public.device_prefs(uuid, boolean, boolean),
  public.push_fcm_slot() to authenticated;
-- The site's server reaches these without a sign-in when the bridge starts the flush; the key decides.
grant execute on function public.push_flush_begin(text), public.push_flush_end(text), public.push_claim(text, int),
  public.push_report(text, jsonb) to anon, authenticated;

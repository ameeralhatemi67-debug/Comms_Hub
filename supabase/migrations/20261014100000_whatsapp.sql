-- Permissions Step P5a: WhatsApp, everything but the real sender (Permissions_Plan.md 8, D-5
-- to D-8, D-12, D-13). One way: the system sends, nothing is read back. Only to a number a
-- member proved on the site with a six-digit code, and only in two cases: a message whose
-- urgency reaches the recipient's chosen level, or a message its author pushed.
--
-- Rules kept here, not in the interface:
--   * Routing is decided inside chat_send (wa_route), in the same transaction that stores the
--     message, from room membership and the recipient's verified link. The browser never
--     names a destination, only a recipient account, and only for a push.
--   * The outbox holds ids, never message text: the text is read at dispatch. A recipient
--     who is not a member of the message's room cannot be inserted: foreign keys, not only
--     a check in code. One row per (message, recipient, reason).
--   * A number is seen by its owner and by an administrator (D-12); everyone else sees
--     "linked" or "not linked".
--   * The sender is a pull bridge on the owner's computer (bridge/whatsapp/). It proves
--     itself with WHATSAPP_SERVER_KEY, whose sha256 alone is stored here (as with
--     MAIL_SERVER_KEY). There is no timer in the site: a queued row waits for the bridge.
--   * The code is made by the site's server from WHATSAPP_LINK_SECRET and a random nonce;
--     the database stores only sha256(code:nonce), the browser never sees the code.

-- ---------------------------------------------------------------------------
-- Server key and the system number
-- ---------------------------------------------------------------------------
create table public.whatsapp_server_key (
  id int primary key default 1 check (id = 1),
  key_hash text not null check (key_hash ~ '^[0-9a-f]{64}$')
);
alter table public.whatsapp_server_key enable row level security;
-- No policies: nobody reads or writes it through the API.

create function public.wa_key_ok(p_key text) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.whatsapp_server_key k
                 where k.key_hash = encode(sha256(convert_to(coalesce(p_key, ''), 'UTF8')), 'hex'))
$$;

create table public.system_whatsapp (
  id int primary key default 1 check (id = 1),
  enabled boolean not null default false,
  display_name text not null default 'مركز الاتصال المؤسسي' check (char_length(btrim(display_name)) between 1 and 60),
  about text check (about is null or char_length(about) <= 140),
  daily_cap int not null default 10 check (daily_cap between 0 and 200),
  max_chars int not null default 1000 check (max_chars between 200 and 4000),
  heartbeat_at timestamptz,
  bridge_note text check (bridge_note is null or char_length(bridge_note) <= 200),
  updated_by text,
  updated_at timestamptz not null default now()
);
insert into public.system_whatsapp (id) values (1);
alter table public.system_whatsapp enable row level security;
create policy system_whatsapp_read on public.system_whatsapp for select to authenticated
  using ((select public.is_approved()));

-- ---------------------------------------------------------------------------
-- A member's link, pending code and mutes
-- ---------------------------------------------------------------------------
create table public.whatsapp_links (
  email text primary key references public.accounts(email) on delete cascade on update cascade,
  phone text unique check (phone is null or phone ~ '^\+[1-9][0-9]{7,14}$'),
  verified_at timestamptz,
  -- Grows with each verified number, so a row queued for an old number is never sent to a new one.
  link_version int not null default 0 check (link_version >= 0),
  from_level smallint not null default 3 check (from_level in (2, 3)),
  pushed boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint whatsapp_links_verified check ((phone is null) = (verified_at is null))
);
alter table public.whatsapp_links enable row level security;
create policy whatsapp_links_read on public.whatsapp_links for select to authenticated
  using (email = (select public.current_email()) or (select public.is_admin()));

create table public.whatsapp_codes (
  email text primary key references public.whatsapp_links(email) on delete cascade on update cascade,
  phone text not null check (phone ~ '^\+[1-9][0-9]{7,14}$'),
  nonce text not null check (nonce ~ '^[0-9a-f]{32}$'),
  code_hash text not null check (code_hash ~ '^[0-9a-f]{64}$'),
  attempts int not null default 0 check (attempts between 0 and 5),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
alter table public.whatsapp_codes enable row level security;
-- No policies: the member sees the pending step through wa_me().

create table public.whatsapp_mutes (
  email text not null references public.whatsapp_links(email) on delete cascade on update cascade,
  sender text not null references public.accounts(email) on delete cascade on update cascade,
  created_at timestamptz not null default now(),
  primary key (email, sender),
  check (email <> sender)
);
create index whatsapp_mutes_sender_idx on public.whatsapp_mutes (sender);
alter table public.whatsapp_mutes enable row level security;
create policy whatsapp_mutes_read on public.whatsapp_mutes for select to authenticated
  using (email = (select public.current_email()));

-- ---------------------------------------------------------------------------
-- The outbox: ids only
-- ---------------------------------------------------------------------------
alter table public.chat_messages add constraint chat_messages_id_room unique (id, room_id);

create table public.whatsapp_outbox (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('urgent', 'push', 'code', 'test')),
  message_id uuid,
  room_id uuid,
  recipient text not null references public.whatsapp_links(email) on delete cascade on update cascade,
  sender text,
  link_version int not null,
  state text not null default 'queued' check (state in ('queued', 'sending', 'sent', 'failed')),
  attempts int not null default 0,
  error text check (error is null or char_length(error) <= 200),
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  sent_at timestamptz,
  constraint whatsapp_outbox_message check ((kind in ('urgent', 'push')) = (message_id is not null and room_id is not null and sender is not null)),
  constraint whatsapp_outbox_not_self check (sender is null or sender <> recipient),
  -- The message belongs to that room, and the recipient is a member of that room.
  constraint whatsapp_outbox_message_room foreign key (message_id, room_id) references public.chat_messages(id, room_id) on delete cascade,
  constraint whatsapp_outbox_member foreign key (room_id, recipient) references public.chat_members(room_id, email) on delete cascade,
  constraint whatsapp_outbox_once unique (message_id, recipient, kind)
);
create index whatsapp_outbox_queue_idx on public.whatsapp_outbox (state, created_at);
create index whatsapp_outbox_sender_idx on public.whatsapp_outbox (sender, created_at desc);
create index whatsapp_outbox_recipient_idx on public.whatsapp_outbox (recipient);
create index whatsapp_outbox_room_idx on public.whatsapp_outbox (room_id, recipient);
create index whatsapp_outbox_message_idx on public.whatsapp_outbox (message_id, room_id);
alter table public.whatsapp_outbox enable row level security;
create policy whatsapp_outbox_read on public.whatsapp_outbox for select to authenticated
  using (sender = (select public.current_email()) or recipient = (select public.current_email()));

-- The link is checked on insert, whoever inserts: a message row needs a verified link of
-- the same version; a code row needs a pending code.
create function public.wa_outbox_check() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare l public.whatsapp_links;
begin
  select * into l from public.whatsapp_links where email = new.recipient;
  if new.kind = 'code' then
    if not exists (select 1 from public.whatsapp_codes c where c.email = new.recipient) then
      raise exception 'WA_NO_CODE' using errcode = 'P0001';
    end if;
  elsif l.verified_at is null or l.link_version <> new.link_version then
    raise exception 'WA_NOT_LINKED' using errcode = 'P0001';
  end if;
  return new;
end
$$;
create trigger whatsapp_outbox_check before insert on public.whatsapp_outbox
  for each row execute function public.wa_outbox_check();

-- ---------------------------------------------------------------------------
-- Routing, inside chat_send
-- ---------------------------------------------------------------------------
-- Every other member of the message's room whose verified link asks for this level and who
-- did not mute the author; a muted conversation still lets level 3 through, as its notices do.
create function public.wa_route(p_msg uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare m public.chat_messages;
begin
  select * into m from public.chat_messages where id = p_msg;
  if not found or m.urgency < 2 then return; end if;
  if not coalesce((select s.enabled from public.system_whatsapp s where s.id = 1), false) then return; end if;
  insert into public.whatsapp_outbox (kind, message_id, room_id, recipient, sender, link_version)
  select 'urgent', m.id, m.room_id, l.email, m.author, l.link_version
  from public.chat_members cm
  join public.whatsapp_links l on l.email = cm.email
  where cm.room_id = m.room_id and cm.email <> m.author and l.verified_at is not null
    and m.urgency >= l.from_level and (m.urgency = 3 or not cm.muted)
    and not exists (select 1 from public.whatsapp_mutes x where x.email = l.email and x.sender = m.author)
  on conflict do nothing;
end
$$;

do $$
declare src text;
begin
  src := pg_get_functiondef('public.chat_send(uuid,text,text,uuid,jsonb,smallint,boolean)'::regprocedure);
  if (length(src) - length(replace(src, E'  return mid;\nend', ''))) <> length(E'  return mid;\nend') then
    raise exception 'chat_send changed: review the WhatsApp migration';
  end if;
  execute replace(src, E'  return mid;\nend', E'  perform public.wa_route(mid);\n  return mid;\nend');
end $$;

-- ---------------------------------------------------------------------------
-- The member's side
-- ---------------------------------------------------------------------------
create function public.wa_online() returns boolean
language sql stable security definer set search_path = ''
as $$ select coalesce((select s.heartbeat_at > now() - interval '2 minutes' from public.system_whatsapp s where s.id = 1), false) $$;

-- Everything the member's WhatsApp section shows: their own number only.
create function public.wa_me() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare me text := public.current_email(); l public.whatsapp_links; c public.whatsapp_codes; s public.system_whatsapp;
begin
  if me is null or not public.is_approved() then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  select * into l from public.whatsapp_links where email = me;
  select * into c from public.whatsapp_codes where email = me;
  select * into s from public.system_whatsapp where id = 1;
  return jsonb_build_object(
    'on', l.email is not null,
    'phone', l.phone, 'verified_at', l.verified_at, 'from_level', coalesce(l.from_level, 3), 'pushed', coalesce(l.pushed, true),
    'pending', case when c.email is null then null else jsonb_build_object('phone', c.phone, 'expires_at', c.expires_at, 'left', 5 - c.attempts) end,
    'mutes', coalesce((select jsonb_agg(x.sender order by x.created_at) from public.whatsapp_mutes x where x.email = me), '[]'::jsonb),
    'system', jsonb_build_object('enabled', s.enabled, 'online', public.wa_online(), 'heartbeat_at', s.heartbeat_at, 'name', s.display_name));
end
$$;

-- Turning it on keeps nothing yet; turning it off deletes the number, the pending code, the
-- mutes and every queued row (cascade). Also the level and pushed messages.
create function public.wa_set(p jsonb) returns void
language plpgsql security definer set search_path = ''
as $$
declare me text := public.current_email();
begin
  if me is null or not public.is_approved() then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if p ? 'on' then
    if (p->>'on')::boolean then
      insert into public.whatsapp_links (email) values (me) on conflict (email) do nothing;
    else
      delete from public.whatsapp_links where email = me;
      return;
    end if;
  end if;
  if not exists (select 1 from public.whatsapp_links where email = me) then raise exception 'WA_OFF' using errcode = 'P0001'; end if;
  update public.whatsapp_links set
      from_level = case when p ? 'from_level' then (p->>'from_level')::smallint else from_level end,
      pushed = case when p ? 'pushed' then (p->>'pushed')::boolean else pushed end,
      updated_at = now()
    where email = me;
end
$$;

create function public.wa_mute(p_sender text, p_on boolean) returns void
language plpgsql security definer set search_path = ''
as $$
declare me text := public.current_email();
begin
  if me is null or not exists (select 1 from public.whatsapp_links where email = me) then raise exception 'WA_OFF' using errcode = 'P0001'; end if;
  if p_on then
    if p_sender = me or not exists (select 1 from public.accounts where email = p_sender) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
    insert into public.whatsapp_mutes (email, sender) values (me, p_sender) on conflict do nothing;
  else
    delete from public.whatsapp_mutes where email = me and sender = p_sender;
  end if;
end
$$;

-- Called by the site's server for the signed-in member (route /api/whatsapp/code), with the
-- server key: it made the code from its secret and passes only the nonce and the hash.
-- Three codes an hour, ten minutes each, five tries; one account per number.
create function public.wa_code_issue(p_key text, p_phone text, p_nonce text, p_hash text) returns timestamptz
language plpgsql security definer set search_path = ''
as $$
declare me text := public.current_email(); l public.whatsapp_links; v_until timestamptz := now() + interval '10 minutes';
begin
  if not public.wa_key_ok(p_key) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if me is null or not public.is_approved() then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  select * into l from public.whatsapp_links where email = me;
  if not found then raise exception 'WA_OFF' using errcode = 'P0001'; end if;
  if not coalesce((select s.enabled from public.system_whatsapp s where s.id = 1), false) then raise exception 'WA_SYSTEM_OFF' using errcode = 'P0001'; end if;
  if p_phone is null or p_phone !~ '^\+[1-9][0-9]{7,14}$' then raise exception 'WA_PHONE_BAD' using errcode = 'P0001'; end if;
  if exists (select 1 from public.whatsapp_links x where x.phone = p_phone and x.email <> me) then raise exception 'WA_PHONE_TAKEN' using errcode = 'P0001'; end if;
  if (select count(*) from public.whatsapp_outbox o where o.recipient = me and o.kind = 'code' and o.created_at > now() - interval '1 hour') >= 3 then
    raise exception 'WA_RATE' using errcode = 'P0001';
  end if;
  insert into public.whatsapp_codes (email, phone, nonce, code_hash, attempts, expires_at)
  values (me, p_phone, p_nonce, p_hash, 0, v_until)
  on conflict (email) do update set phone = excluded.phone, nonce = excluded.nonce, code_hash = excluded.code_hash,
    attempts = 0, expires_at = excluded.expires_at, created_at = now();
  -- An older code still waiting is not sent any more.
  update public.whatsapp_outbox set state = 'failed', error = 'طُلب رمز أحدث.'
    where recipient = me and kind = 'code' and state = 'queued';
  insert into public.whatsapp_outbox (kind, recipient, link_version) values ('code', me, l.link_version);
  return v_until;
end
$$;

-- The member types the code back. A wrong code is counted, not raised (a raise would undo the count).
create function public.wa_code_verify(p_code text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare me text := public.current_email(); c public.whatsapp_codes;
begin
  if me is null then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  select * into c from public.whatsapp_codes where email = me for update;
  if not found then raise exception 'WA_NO_CODE' using errcode = 'P0001'; end if;
  if c.expires_at <= now() then raise exception 'WA_CODE_EXPIRED' using errcode = 'P0001'; end if;
  if c.attempts >= 5 then raise exception 'WA_CODE_LOCKED' using errcode = 'P0001'; end if;
  if encode(sha256(convert_to(coalesce(btrim(p_code), '') || ':' || c.nonce, 'UTF8')), 'hex') <> c.code_hash then
    update public.whatsapp_codes set attempts = attempts + 1 where email = me;
    return jsonb_build_object('ok', false, 'left', 4 - c.attempts);
  end if;
  if exists (select 1 from public.whatsapp_links x where x.phone = c.phone and x.email <> me) then raise exception 'WA_PHONE_TAKEN' using errcode = 'P0001'; end if;
  update public.whatsapp_links set phone = c.phone, verified_at = now(), link_version = link_version + 1, updated_at = now()
    where email = me;
  delete from public.whatsapp_codes where email = me;
  return jsonb_build_object('ok', true);
end
$$;

-- Linked or not, for everyone; the number only for its owner and an administrator (D-12).
-- `push` says whether a push from the reader would be accepted, without saying why not.
create function public.wa_people() returns table (email text, linked boolean, push boolean, phone text)
language sql stable security definer set search_path = ''
as $$
  select a.email, l.verified_at is not null,
    l.verified_at is not null and l.pushed and not exists (select 1 from public.whatsapp_mutes x where x.email = a.email and x.sender = public.current_email()),
    case when a.email = public.current_email() or public.is_admin() then l.phone end
  from public.accounts a left join public.whatsapp_links l on l.email = a.email
  where public.is_approved()
$$;

-- ---------------------------------------------------------------------------
-- Pushing a message, and retrying a failed row
-- ---------------------------------------------------------------------------
create function public.wa_push(p_msg uuid, p_recipient text) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare me text := public.current_email(); m public.chat_messages; l public.whatsapp_links; s public.system_whatsapp; v uuid;
begin
  select * into m from public.chat_messages where id = p_msg;
  if not found or not public.chat_is_member(m.room_id) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if m.author <> me then raise exception 'WA_NOT_AUTHOR' using errcode = 'P0001'; end if;
  if m.deleted or m.kind = 'sys' then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if p_recipient = me or not exists (select 1 from public.chat_members cm where cm.room_id = m.room_id and cm.email = p_recipient) then
    raise exception 'WA_NOT_MEMBER' using errcode = 'P0001';
  end if;
  select * into s from public.system_whatsapp where id = 1;
  if not s.enabled then raise exception 'WA_SYSTEM_OFF' using errcode = 'P0001'; end if;
  select * into l from public.whatsapp_links where email = p_recipient;
  if l.verified_at is null or not l.pushed
     or exists (select 1 from public.whatsapp_mutes x where x.email = p_recipient and x.sender = me) then
    raise exception 'WA_UNAVAILABLE' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.whatsapp_outbox o where o.message_id = m.id and o.recipient = p_recipient and o.kind = 'push') then
    raise exception 'WA_ALREADY' using errcode = 'P0001';
  end if;
  if (select count(*) from public.whatsapp_outbox o where o.sender = me and o.kind = 'push' and o.created_at > now() - interval '1 day') >= s.daily_cap then
    raise exception 'WA_DAILY_CAP' using errcode = 'P0001';
  end if;
  -- Off until granted (D-13); a one-time grant may be bound to this conversation.
  if not public.use_capability('whatsapp.push', jsonb_build_object('room', m.room_id::text)) then
    raise exception 'WA_PUSH' using errcode = 'P0001';
  end if;
  insert into public.whatsapp_outbox (kind, message_id, room_id, recipient, sender, link_version)
  values ('push', m.id, m.room_id, p_recipient, me, l.link_version)
  returning id into v;
  return v;
end
$$;

create function public.wa_retry(p_id uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare me text := public.current_email(); o public.whatsapp_outbox;
begin
  select * into o from public.whatsapp_outbox where id = p_id for update;
  if not found or o.sender is distinct from me then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if o.state <> 'failed' then raise exception 'WA_NOT_FAILED' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.whatsapp_links l where l.email = o.recipient and l.verified_at is not null and l.link_version = o.link_version) then
    raise exception 'WA_UNAVAILABLE' using errcode = 'P0001';
  end if;
  update public.whatsapp_outbox set state = 'queued', error = null, claimed_at = null where id = p_id;
end
$$;

-- ---------------------------------------------------------------------------
-- The system number (whatsapp.system.manage) and an administrator unlinking a member
-- ---------------------------------------------------------------------------
create function public.wa_system_view() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare s public.system_whatsapp;
begin
  if not public.has_capability('whatsapp.system.manage') then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  select * into s from public.system_whatsapp where id = 1;
  return to_jsonb(s) || jsonb_build_object(
    'online', public.wa_online(),
    'linked', (select count(*) from public.whatsapp_links where verified_at is not null),
    'queued', (select count(*) from public.whatsapp_outbox where state in ('queued', 'sending')),
    'sent_day', (select count(*) from public.whatsapp_outbox where state = 'sent' and sent_at > now() - interval '1 day'),
    'failed_day', (select count(*) from public.whatsapp_outbox where state = 'failed' and created_at > now() - interval '1 day'),
    'failures', coalesce((select jsonb_agg(f order by f.at desc) from (
        select o.kind, o.error, coalesce(o.sent_at, o.claimed_at, o.created_at) at, public.work_name(o.recipient) who
        from public.whatsapp_outbox o where o.state = 'failed' order by o.created_at desc limit 8) f), '[]'::jsonb));
end
$$;

create function public.wa_system_update(p jsonb) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.has_capability('whatsapp.system.manage') then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  update public.system_whatsapp set
      enabled = coalesce((p->>'enabled')::boolean, enabled),
      display_name = coalesce(nullif(btrim(p->>'display_name'), ''), display_name),
      about = case when p ? 'about' then nullif(btrim(p->>'about'), '') else about end,
      daily_cap = coalesce((p->>'daily_cap')::int, daily_cap),
      max_chars = coalesce((p->>'max_chars')::int, max_chars),
      updated_by = public.current_email(), updated_at = now()
    where id = 1;
end
$$;

-- A test message to the manager's own verified number.
create function public.wa_test_send() returns uuid
language plpgsql security definer set search_path = ''
as $$
declare me text := public.current_email(); l public.whatsapp_links; v uuid;
begin
  if not public.has_capability('whatsapp.system.manage') then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if not coalesce((select s.enabled from public.system_whatsapp s where s.id = 1), false) then raise exception 'WA_SYSTEM_OFF' using errcode = 'P0001'; end if;
  select * into l from public.whatsapp_links where email = me;
  if l.verified_at is null then raise exception 'WA_NOT_LINKED' using errcode = 'P0001'; end if;
  insert into public.whatsapp_outbox (kind, recipient, link_version) values ('test', me, l.link_version) returning id into v;
  return v;
end
$$;

create function public.wa_admin_unlink(p_email text) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_admin() or p_email = public.current_email() then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  delete from public.whatsapp_links where email = p_email;
  if not found then raise exception 'WA_NOT_LINKED' using errcode = 'P0001'; end if;
  insert into public.notifications (recipient, tier, body, go)
  values (p_email, 'info', 'قطع مسؤول النظام ربط رقم واتساب بحسابك. لن تصلك رسائل واتساب حتى تتحقق من رقمك من جديد.', jsonb_build_object('page', 'profile'));
end
$$;

-- ---------------------------------------------------------------------------
-- Server only (WHATSAPP_SERVER_KEY): the bridge, through the site's dispatch route
-- ---------------------------------------------------------------------------
create function public.wa_heartbeat(p_key text, p_note text) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.wa_key_ok(p_key) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  update public.system_whatsapp set heartbeat_at = now(), bridge_note = coalesce(left(p_note, 200), bridge_note) where id = 1;
end
$$;

-- Claims queued rows (marks them sending) and returns what the package needs, read now:
-- the verified number, the sender's name, the level, the text, the room. A row whose link
-- changed or ended, or whose message was deleted, fails here instead of going out.
create function public.wa_claim(p_key text, p_limit int) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_out jsonb := '[]'::jsonb; o public.whatsapp_outbox; l public.whatsapp_links; c public.whatsapp_codes;
        m public.chat_messages; r public.chat_rooms; why text;
begin
  if not public.wa_key_ok(p_key) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  update public.system_whatsapp set heartbeat_at = now() where id = 1;
  -- A row claimed but never reported (the bridge stopped mid-send) waits again.
  update public.whatsapp_outbox set state = 'queued' where state = 'sending' and claimed_at < now() - interval '5 minutes';
  if not coalesce((select s.enabled from public.system_whatsapp s where s.id = 1), false) then return v_out; end if;
  for o in select * from public.whatsapp_outbox where state = 'queued' order by created_at
           limit least(greatest(coalesce(p_limit, 5), 1), 20) for update skip locked loop
    why := null; c := null; m := null; r := null;
    select * into l from public.whatsapp_links where email = o.recipient;
    if o.kind = 'code' then
      select * into c from public.whatsapp_codes where email = o.recipient;
      if c.email is null or c.expires_at <= now() then why := 'انتهى الرمز قبل إرساله.'; end if;
    elsif l.verified_at is null or l.link_version <> o.link_version then
      why := 'تغيّر الرقم أو أُلغي الربط.';
    end if;
    if why is null and o.message_id is not null then
      select * into m from public.chat_messages where id = o.message_id;
      select * into r from public.chat_rooms where id = o.room_id;
      if m.deleted then why := 'حُذفت الرسالة.'; end if;
    end if;
    if why is not null then
      update public.whatsapp_outbox set state = 'failed', error = why, attempts = attempts + 1 where id = o.id;
      continue;
    end if;
    update public.whatsapp_outbox set state = 'sending', claimed_at = now(), attempts = attempts + 1 where id = o.id;
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'id', o.id, 'kind', o.kind, 'recipient', o.recipient,
      'to', case when o.kind = 'code' then c.phone else l.phone end,
      'nonce', case when o.kind = 'code' then c.nonce end,
      'sender_name', case when o.sender is not null then public.work_name(o.sender) end,
      'message_id', o.message_id, 'room_id', o.room_id,
      'room_name', case when r.type = 'dm' then null else r.name end,
      'urgency', case when o.message_id is not null then m.urgency end,
      'msg_kind', case when o.message_id is not null then m.kind end,
      'body', case when o.message_id is not null then m.body end,
      'data', case when o.message_id is not null then m.data end));
  end loop;
  return v_out;
end
$$;

create function public.wa_report(p_key text, p_id uuid, p_ok boolean, p_error text) returns void
language plpgsql security definer set search_path = ''
as $$
declare o public.whatsapp_outbox;
begin
  if not public.wa_key_ok(p_key) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  update public.whatsapp_outbox set state = case when p_ok then 'sent' else 'failed' end,
      sent_at = case when p_ok then now() end,
      error = case when p_ok then null else left(coalesce(nullif(btrim(p_error), ''), 'تعذّر الإرسال.'), 200) end
    where id = p_id and state = 'sending'
    returning * into o;
  if found and not p_ok and o.sender is not null then
    insert into public.notifications (recipient, tier, body, go)
    values (o.sender, 'info', 'لم تصل رسالتك إلى واتساب ' || public.work_name(o.recipient) || '. يمكنك إعادة المحاولة من الرسالة.',
      jsonb_build_object('page', 'chat', 'id', o.room_id));
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Grants and Realtime
-- ---------------------------------------------------------------------------
revoke all on function public.wa_key_ok(text), public.wa_outbox_check(), public.wa_route(uuid), public.wa_online()
  from public, anon, authenticated;
revoke all on function public.wa_me(), public.wa_set(jsonb), public.wa_mute(text, boolean), public.wa_code_issue(text, text, text, text),
  public.wa_code_verify(text), public.wa_people(), public.wa_push(uuid, text), public.wa_retry(uuid), public.wa_system_view(),
  public.wa_system_update(jsonb), public.wa_test_send(), public.wa_admin_unlink(text),
  public.wa_heartbeat(text, text), public.wa_claim(text, int), public.wa_report(text, uuid, boolean, text) from public, anon;
grant execute on function public.wa_me(), public.wa_set(jsonb), public.wa_mute(text, boolean), public.wa_code_issue(text, text, text, text),
  public.wa_code_verify(text), public.wa_people(), public.wa_push(uuid, text), public.wa_retry(uuid), public.wa_system_view(),
  public.wa_system_update(jsonb), public.wa_test_send(), public.wa_admin_unlink(text) to authenticated;
-- The bridge reaches these through the site's dispatch route without a sign-in; the key decides.
grant execute on function public.wa_heartbeat(text, text), public.wa_claim(text, int), public.wa_report(text, uuid, boolean, text) to anon, authenticated;

alter publication supabase_realtime add table public.whatsapp_outbox, public.whatsapp_links, public.system_whatsapp;

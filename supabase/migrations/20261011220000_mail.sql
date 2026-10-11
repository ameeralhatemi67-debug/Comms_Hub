-- Mail: internal mail between approved accounts, the department's shared external
-- mailbox (a Gmail account reached by the server over IMAP and SMTP), and action
-- cards that act on real records through the rules that already govern them.
--
-- Who sees a thread:
--   internal  its participants (people it was sent to, groups expanded at send time)
--   external  its participants, plus the director, the assistant and the publisher,
--             who see the whole shared mailbox
--   held      external mail waiting for approval is also seen by the director and
--             the assistant, who approve it
-- Administrators act as any role (testing phase), but internal mail stays private:
-- an administrator sees an internal thread only as a participant.
--
-- Every write goes through a function below; the tables have read policies only.
-- The server proves itself to the inbound, outbox and file functions with a key
-- held only in its environment (MAIL_SERVER_KEY). Its sha256 is stored here, the
-- key never is, and no policy lets anyone read the hash.

-- ---------------------------------------------------------------------------
-- Settings, server key, sorting rules
-- ---------------------------------------------------------------------------
create table public.mail_settings (
  id int primary key default 1 check (id = 1),
  paused boolean not null default false,
  sla_hours int not null default 8 check (sla_hours between 1 and 168),
  last_uid bigint not null default 0,
  uid_validity bigint,
  sync_at timestamptz,
  sync_lock timestamptz,
  updated_by text,
  updated_at timestamptz not null default now()
);
insert into public.mail_settings (id) values (1);
alter table public.mail_settings enable row level security;
create policy mail_settings_read on public.mail_settings for select to authenticated
  using ((select public.is_approved()));

create table public.mail_server_key (
  id int primary key default 1 check (id = 1),
  key_hash text not null check (key_hash ~ '^[0-9a-f]{64}$')
);
alter table public.mail_server_key enable row level security;
-- No policies: nobody reads or writes it through the API.

create table public.mail_rules (
  id uuid primary key default gen_random_uuid(),
  field text not null check (field in ('from','subject')),
  pattern text not null check (char_length(btrim(pattern)) between 2 and 80),
  label text check (label is null or char_length(label) between 1 and 30),
  assignee text,
  enabled boolean not null default true,
  created_by text not null,
  created_at timestamptz not null default now(),
  check (label is not null or assignee is not null)
);
alter table public.mail_rules enable row level security;
create policy mail_rules_read on public.mail_rules for select to authenticated
  using ((select public.media_acts(array['director','assistant','publisher'])));
create policy mail_rules_write on public.mail_rules for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()) and created_by = (select public.current_email()));

-- ---------------------------------------------------------------------------
-- Threads, members, messages, files
-- ---------------------------------------------------------------------------
create sequence public.mail_req_seq start 184;

create table public.mail_threads (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('internal','external')),
  subject text not null check (char_length(btrim(subject)) between 1 and 200),
  created_by text not null,
  created_at timestamptz not null default now(),
  last_at timestamptz not null default now(),
  labels text[] not null default '{}' check (cardinality(labels) <= 10),
  -- [{type:'work'|'asset', id, title?}]
  links jsonb not null default '[]'::jsonb check (jsonb_typeof(links) = 'array'),
  contact_email text,
  contact_name text,
  ext_status text check (ext_status in ('new','assigned','waiting','closed')),
  assignee text,
  reply_by timestamptz,
  req_no int,
  constraint mail_ext_fields check ((kind = 'external') = (ext_status is not null))
);
create index mail_threads_last_idx on public.mail_threads (last_at desc);

-- One row per person per thread: participation and that person's own view of it.
create table public.mail_members (
  thread_id uuid not null references public.mail_threads(id) on delete cascade,
  email text not null,
  participant boolean not null default true,
  read_at timestamptz,
  starred boolean not null default false,
  archived boolean not null default false,
  trashed boolean not null default false,
  muted boolean not null default false,
  snooze_until timestamptz,
  primary key (thread_id, email)
);
create index mail_members_email_idx on public.mail_members (email);

-- Files a person attached from their computer. The bytes are in Google Drive
-- (folder «البريد» inside «Comms Hub»); the server registers a file only after
-- checking it in Drive.
create table public.mail_files (
  id uuid primary key default gen_random_uuid(),
  drive_file_id text not null unique,
  name text not null check (char_length(name) between 1 and 255),
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0),
  uploaded_by text not null,
  created_at timestamptz not null default now()
);
alter table public.mail_files enable row level security;
create policy mail_files_read on public.mail_files for select to authenticated
  using (uploaded_by = (select public.current_email()));

create table public.mail_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.mail_threads(id) on delete cascade,
  kind text not null check (kind in ('mail','note','sys')),
  -- An account email; null for mail received from outside.
  author text,
  from_name text,
  from_email text,
  -- Recipient tokens: p:<account email>, g:<production|leaders|all>, e:<address>
  to_list text[] not null default '{}',
  cc_list text[] not null default '{}',
  bcc_list text[] not null default '{}',
  body text not null default '' check (char_length(body) <= 20000),
  created_at timestamptz not null default now(),
  -- Scheduled: others see it, and the server sends it, from this moment.
  send_at timestamptz,
  state text not null default 'sent'
    check (state in ('sent','held','returned','outbox','queued','failed')),
  hold_by text,
  hold_note text check (hold_note is null or char_length(hold_note) <= 500),
  ext_sent_at timestamptz,
  gmail_id text unique,
  error text,
  refs uuid[] not null default '{}',
  files uuid[] not null default '{}',
  -- Attachments of received mail stay in Gmail: [{uid, part, name, size, mime}]
  inbound_files jsonb not null default '[]'::jsonb,
  -- Action card on a mail message, event data on a system line
  card jsonb
);
create index mail_messages_thread_idx on public.mail_messages (thread_id, created_at);
create index mail_messages_task_idx on public.mail_messages ((card->>'task_id')) where card ? 'task_id';

-- Signed answers to a publish date from someone outside: one token per message.
create table public.mail_date_tokens (
  token text primary key,
  message_id uuid not null references public.mail_messages(id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz
);

alter table public.mail_threads enable row level security;
alter table public.mail_members enable row level security;
alter table public.mail_messages enable row level security;
alter table public.mail_date_tokens enable row level security;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create function public.mail_key_ok(p_key text) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.mail_server_key k
                 where k.key_hash = encode(sha256(convert_to(coalesce(p_key, ''), 'UTF8')), 'hex'))
$$;

create function public.mail_lead() returns boolean
language sql stable security definer set search_path = ''
as $$ select public.media_acts(array['director','assistant','publisher']) $$;

create function public.mail_approver() returns boolean
language sql stable security definer set search_path = ''
as $$ select public.media_acts(array['director','assistant']) $$;

-- Recipient tokens to account emails. Groups are read from roles at send time.
create function public.mail_expand(p_tokens text[]) returns text[]
language sql stable security definer set search_path = ''
as $$
  select coalesce(array_agg(distinct x.e), '{}') from (
    select a.email as e from unnest(coalesce(p_tokens, '{}')) t
      join public.accounts a on a.email = substr(t, 3) where t like 'p:%'
    union all
    select a.email from unnest(coalesce(p_tokens, '{}')) t
      join public.accounts a on a.role <> 'admin' and (
           (t = 'g:production' and a.role in ('producer','designer','writer'))
        or (t = 'g:leaders' and a.role in ('director','assistant'))
        or  t = 'g:all')
  ) x
$$;

create function public.mail_can_see(p_thread uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.mail_threads t
    where t.id = p_thread and (
      exists (select 1 from public.mail_members m
              where m.thread_id = t.id and m.email = public.current_email() and m.participant)
      or (t.kind = 'external' and public.mail_lead())
      or (public.mail_approver() and exists (select 1 from public.mail_messages x
                                             where x.thread_id = t.id and x.state in ('held','returned')))
    )
  )
$$;

create function public.mail_sys(p_thread uuid, p_data jsonb) returns void
language sql security definer set search_path = ''
as $$
  insert into public.mail_messages (thread_id, kind, author, card)
  values (p_thread, 'sys', coalesce(public.current_email(), 'system'), p_data)
$$;

-- Other people see the thread again in their inbox unless they muted it.
create function public.mail_wake(p_thread uuid, p_except text) returns void
language sql security definer set search_path = ''
as $$
  update public.mail_members set archived = false, snooze_until = null
  where thread_id = p_thread and email is distinct from p_except and not muted
$$;

-- ---------------------------------------------------------------------------
-- Read policies
-- ---------------------------------------------------------------------------
create policy mail_threads_read on public.mail_threads for select to authenticated
  using ((select public.mail_can_see(id)));

create policy mail_members_read on public.mail_members for select to authenticated
  using (email = (select public.current_email()));

create policy mail_messages_read on public.mail_messages for select to authenticated
  using ((select public.mail_can_see(thread_id)) and (
    author = (select public.current_email())
    or kind in ('note','sys')
    or (state in ('sent','outbox','queued','failed') and (send_at is null or send_at <= now()))
    or (state in ('held','returned') and (select public.mail_approver()))
  ));

-- ---------------------------------------------------------------------------
-- Sending
-- ---------------------------------------------------------------------------
create function public.mail_send(
  p_thread uuid, p_subject text, p_to text[], p_cc text[], p_bcc text[], p_body text,
  p_refs uuid[], p_files uuid[], p_card jsonb, p_send_at timestamptz, p_links jsonb, p_forward boolean
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  me text := public.current_email();
  t public.mail_threads;
  tok text; ref uuid; fid uuid;
  ext boolean; gated boolean; new_thread boolean;
  st text; paused boolean; sla int;
  members text[]; card jsonb := null; a public.media_files; task uuid;
  mid uuid; contact text; ctype text; askee text; due timestamptz;
  v_to text[] := coalesce(p_to, '{}'); v_cc text[] := coalesce(p_cc, '{}'); v_bcc text[] := coalesce(p_bcc, '{}');
  v_refs uuid[] := coalesce(p_refs, '{}'); v_files uuid[] := coalesce(p_files, '{}');
begin
  if me is null or public.media_my_role() is null then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  select s.paused, s.sla_hours into paused, sla from public.mail_settings s where s.id = 1;

  foreach tok in array v_to || v_cc || v_bcc loop
    if tok !~ '^(p:[^@[:space:]]+@[^@[:space:]]+|g:(production|leaders|all)|e:[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+)$'
       or (tok like 'p:%' and not exists (select 1 from public.accounts x where x.email = substr(tok, 3))) then
      raise exception 'BAD_RECIPIENT' using errcode = 'P0001';
    end if;
  end loop;
  if exists (select 1 from unnest(v_bcc) b where b not like 'e:%') then
    raise exception 'BAD_RECIPIENT' using errcode = 'P0001';
  end if;
  if cardinality(v_to || v_cc || v_bcc) > 50 then
    raise exception 'TOO_MANY_RECIPIENTS' using errcode = 'P0001';
  end if;

  new_thread := p_thread is null or coalesce(p_forward, false);
  if p_thread is not null then
    select * into t from public.mail_threads where id = p_thread;
    if not found or not public.mail_can_see(p_thread) then
      raise exception 'FORBIDDEN' using errcode = 'P0001';
    end if;
  end if;
  if not new_thread and t.kind = 'internal' and exists (select 1 from unnest(v_to || v_cc || v_bcc) x where x like 'e:%') then
    raise exception 'EXTERNAL_NEEDS_NEW_THREAD' using errcode = 'P0001';
  end if;
  ext := exists (select 1 from unnest(v_to || v_cc || v_bcc) x where x like 'e:%')
         or (not new_thread and t.kind = 'external');
  if new_thread and cardinality(v_to || v_cc) = 0 then
    raise exception 'NO_RECIPIENT' using errcode = 'P0001';
  end if;
  if ext and not exists (select 1 from unnest(v_to || v_cc || v_bcc) x where x like 'e:%') and not new_thread
     and t.contact_email is not null then
    v_to := array['e:' || t.contact_email] || v_to;
  end if;
  if char_length(btrim(coalesce(p_body, ''))) = 0 and p_card is null and cardinality(v_refs) = 0 and cardinality(v_files) = 0 then
    raise exception 'EMPTY_MESSAGE' using errcode = 'P0001';
  end if;
  if new_thread and char_length(btrim(coalesce(p_subject, ''))) = 0 then
    raise exception 'NO_SUBJECT' using errcode = 'P0001';
  end if;
  if p_send_at is not null and (p_send_at < now() - interval '1 minute' or p_send_at > now() + interval '60 days') then
    raise exception 'BAD_SCHEDULE' using errcode = 'P0001';
  end if;

  -- References: the sender must see each asset; outside mail carries approved versions only.
  foreach ref in array v_refs loop
    select * into a from public.media_files where id = ref;
    if not found or public.media_level(me, a.folder_id) < 1 then
      raise exception 'REF_FORBIDDEN' using errcode = 'P0001';
    end if;
    if ext and a.approved_version is null then
      raise exception 'REF_NOT_APPROVED' using errcode = 'P0001';
    end if;
  end loop;
  -- Files: one's own uploads, or files already in a thread one can see (forwarding).
  foreach fid in array v_files loop
    if not exists (select 1 from public.mail_files f where f.id = fid and f.uploaded_by = me)
       and not exists (select 1 from public.mail_messages x where fid = any (x.files) and public.mail_can_see(x.thread_id)) then
      raise exception 'FILE_FORBIDDEN' using errcode = 'P0001';
    end if;
  end loop;

  gated := ext and not public.mail_approver()
           and (new_thread or t.assignee is distinct from me);

  -- The thread
  if new_thread then
    select substr(x, 3) into contact from unnest(v_to || v_cc || v_bcc) x where x like 'e:%' limit 1;
    insert into public.mail_threads (kind, subject, created_by, contact_email, contact_name, ext_status, assignee)
    values (case when ext then 'external' else 'internal' end, btrim(p_subject), me,
            lower(contact), null, case when ext then 'waiting' else null end, case when ext then me else null end)
    returning * into t;
  end if;
  members := array_append(public.mail_expand(v_to || v_cc), me);
  insert into public.mail_members (thread_id, email, participant)
  select t.id, e, true from unnest(members) e
  on conflict (thread_id, email) do update set participant = true;

  -- The card
  if p_card is not null then
    ctype := p_card->>'type';
    if ext and ctype is distinct from 'date' then
      raise exception 'CARD_INTERNAL_ONLY' using errcode = 'P0001';
    end if;
    if p_send_at is not null and ctype in ('task','approval','progress') then
      raise exception 'CARD_NOT_SCHEDULABLE' using errcode = 'P0001';
    end if;
    if ctype in ('approval','date','progress') or (ctype = 'task' and p_card ? 'asset_id') then
      select * into a from public.media_files where id = (p_card->>'asset_id')::uuid;
      if not found or public.media_level(me, a.folder_id) < 1 then
        raise exception 'REF_FORBIDDEN' using errcode = 'P0001';
      end if;
    end if;
    if ctype = 'task' then
      if not public.media_acts(array['director','assistant','producer']) then
        raise exception 'TASK_ROLE' using errcode = 'P0001';
      end if;
      askee := p_card->>'assignee';
      due := (p_card->>'due')::timestamptz;
      if askee is null or askee = me or not askee = any (members) then
        raise exception 'TASK_ASSIGNEE' using errcode = 'P0001';
      end if;
      insert into public.media_tasks (asset_id, what, kind, assignee, assigned_by, due, priority)
      values (case when p_card ? 'asset_id' then (p_card->>'asset_id')::uuid end,
              btrim(p_card->>'what'), 'other', askee, me, due,
              case when p_card->>'priority' = 'urgent' then 'urgent' else 'normal' end)
      returning id into task;
      card := jsonb_build_object('type','task','task_id',task,'what',btrim(p_card->>'what'),'assignee',askee,
              'due',due,'priority',case when p_card->>'priority' = 'urgent' then 'urgent' else 'normal' end,
              'by',me,'state','open','progress',0,'asset_id',p_card->'asset_id');
    elsif ctype = 'approval' then
      if a.stage <> 'review' then
        raise exception 'NOT_IN_REVIEW' using errcode = 'P0001';
      end if;
      card := jsonb_build_object('type','approval','asset_id',a.id,'name',a.name,'version',a.current_version,'by',me,'state','pending');
    elsif ctype = 'date' then
      askee := case when ext then 'ext' else p_card->>'askee' end;
      if askee <> 'ext' and (askee = me or not askee = any (members)) then
        raise exception 'DATE_ASKEE' using errcode = 'P0001';
      end if;
      card := jsonb_build_object('type','date','asset_id',a.id,'name',a.name,
              'proposed',(p_card->>'proposed')::timestamptz,'was',p_card->'was',
              'channels',coalesce(p_card->'channels','[]'::jsonb),'askee',askee,'by',me,'state','pending');
    elsif ctype = 'progress' then
      if p_card->>'to' not in ('production','review') then
        raise exception 'STAGE_DENIED' using errcode = 'P0001';
      end if;
      -- The media guard decides, exactly as on the media page.
      update public.media_files set stage = p_card->>'to' where id = a.id;
      card := jsonb_build_object('type','progress','asset_id',a.id,'name',a.name,'from',a.stage,'to',p_card->>'to',
              'version',a.current_version,'by',me);
    else
      raise exception 'BAD_CARD' using errcode = 'P0001';
    end if;
  end if;

  st := case when gated then 'held' when ext and paused then 'queued' when ext then 'outbox' else 'sent' end;
  insert into public.mail_messages (thread_id, kind, author, to_list, cc_list, bcc_list, body, send_at, state, refs, files, card)
  values (t.id, 'mail', me, v_to, v_cc, v_bcc, coalesce(p_body, ''), p_send_at, st, v_refs, v_files, card)
  returning id into mid;

  if ctype = 'date' and ext then
    insert into public.mail_date_tokens (token, message_id, expires_at)
    values (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''), mid, now() + interval '72 hours');
  end if;

  update public.mail_threads set
      last_at = greatest(now(), coalesce(p_send_at, now())),
      ext_status = case when ext and not gated and not new_thread then 'waiting' else ext_status end,
      reply_by = case when ext and not gated then null else reply_by end,
      links = case when jsonb_typeof(p_links) = 'array' then
                (select coalesce(jsonb_agg(distinct l), '[]'::jsonb) from (
                   select l from jsonb_array_elements(links) l
                   union select l from jsonb_array_elements(p_links) l
                   where l->>'type' = 'work' and l->>'id' ~ '^CH-[0-9]{1,6}$') q)
              else links end
    where id = t.id;
  update public.mail_members set read_at = now(), archived = false, trashed = false
    where thread_id = t.id and email = me;
  if not gated then perform public.mail_wake(t.id, me); end if;
  if card ? 'asset_id' and card->>'asset_id' is not null and not exists (
       select 1 from jsonb_array_elements(t.links) l where l->>'id' = card->>'asset_id') then
    update public.mail_threads set links = links || jsonb_build_array(jsonb_build_object('type','asset','id',card->>'asset_id'))
      where id = t.id;
  end if;

  return jsonb_build_object('thread', t.id, 'message', mid, 'state', st);
end
$$;

-- Withdraw one's own message before it went anywhere: held, returned, queued,
-- waiting in the outbox, or scheduled. Removes the thread if nothing else is left.
create function public.mail_cancel(p_message uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare m public.mail_messages; left_over int;
begin
  select * into m from public.mail_messages where id = p_message for update;
  if not found or m.author is distinct from public.current_email() or m.kind <> 'mail'
     or not (m.state in ('held','returned','queued','outbox') or (m.state = 'sent' and m.send_at > now())) then
    raise exception 'CANNOT_CANCEL' using errcode = 'P0001';
  end if;
  if m.card->>'type' in ('task','approval','progress') then
    raise exception 'CANNOT_CANCEL' using errcode = 'P0001';
  end if;
  delete from public.mail_messages where id = p_message;
  select count(*) into left_over from public.mail_messages where thread_id = m.thread_id and kind = 'mail';
  if left_over = 0 then delete from public.mail_threads where id = m.thread_id; end if;
  return to_jsonb(m);
end
$$;

-- A scheduled message goes now.
create function public.mail_send_now(p_message uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  update public.mail_messages set send_at = null
    where id = p_message and author = public.current_email() and send_at > now();
  if not found then raise exception 'CANNOT_CANCEL' using errcode = 'P0001'; end if;
  update public.mail_threads set last_at = now()
    where id = (select thread_id from public.mail_messages where id = p_message);
end
$$;

-- An internal note on an external thread: never leaves the Hub.
create function public.mail_note(p_thread uuid, p_body text) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.mail_can_see(p_thread) or char_length(btrim(coalesce(p_body, ''))) not between 1 and 2000 then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  insert into public.mail_messages (thread_id, kind, author, body)
  values (p_thread, 'note', public.current_email(), btrim(p_body));
  update public.mail_threads set last_at = now() where id = p_thread;
end
$$;

-- One's own view of threads: read, star, archive, trash, mute, snooze.
create function public.mail_state(p_threads uuid[], p_patch jsonb) returns void
language plpgsql security definer set search_path = ''
as $$
declare me text := public.current_email(); th uuid;
begin
  foreach th in array coalesce(p_threads, '{}') loop
    if not public.mail_can_see(th) then
      raise exception 'FORBIDDEN' using errcode = 'P0001';
    end if;
    insert into public.mail_members (thread_id, email, participant) values (th, me, false)
      on conflict (thread_id, email) do nothing;
    update public.mail_members set
        read_at      = case when p_patch ? 'read' then (case when (p_patch->>'read')::boolean then now() end) else read_at end,
        starred      = coalesce((p_patch->>'starred')::boolean, starred),
        archived     = coalesce((p_patch->>'archived')::boolean, archived),
        trashed      = coalesce((p_patch->>'trashed')::boolean, trashed),
        muted        = coalesce((p_patch->>'muted')::boolean, muted),
        snooze_until = case when p_patch ? 'snooze_until' then (p_patch->>'snooze_until')::timestamptz else snooze_until end
      where thread_id = th and email = me;
  end loop;
end
$$;

create function public.mail_set_labels(p_thread uuid, p_labels text[]) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.mail_can_see(p_thread) or cardinality(coalesce(p_labels, '{}')) > 10
     or exists (select 1 from unnest(p_labels) l where char_length(btrim(l)) not between 1 and 30) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  update public.mail_threads set labels = (select coalesce(array_agg(distinct btrim(l)), '{}') from unnest(p_labels) l)
    where id = p_thread;
end
$$;

-- Status and owner of a shared external thread.
create function public.mail_handle(p_thread uuid, p_status text, p_assignee text) returns void
language plpgsql security definer set search_path = ''
as $$
declare t public.mail_threads; me text := public.current_email(); sla int;
begin
  select * into t from public.mail_threads where id = p_thread for update;
  if not found or t.kind <> 'external' or not public.mail_can_see(p_thread) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  select s.sla_hours into sla from public.mail_settings s where s.id = 1;
  if p_assignee is distinct from t.assignee and p_assignee is not null and p_assignee <> '-' then
    if not public.mail_lead() then raise exception 'LEAD_ONLY' using errcode = 'P0001'; end if;
    if not exists (select 1 from public.accounts a where a.email = p_assignee) then
      raise exception 'BAD_RECIPIENT' using errcode = 'P0001';
    end if;
    update public.mail_threads set assignee = p_assignee,
        req_no = coalesce(req_no, nextval('public.mail_req_seq')),
        ext_status = case when ext_status = 'new' then 'assigned' else ext_status end,
        reply_by = case when ext_status in ('new','assigned') then coalesce(reply_by, now() + make_interval(hours => sla)) else reply_by end
      where id = p_thread returning * into t;
    insert into public.mail_members (thread_id, email, participant) values (p_thread, p_assignee, true)
      on conflict (thread_id, email) do update set participant = true, archived = false, read_at = null;
    perform public.mail_sys(p_thread, jsonb_build_object('e','assign','to',p_assignee,'req',t.req_no));
  elsif p_assignee = '-' and t.assignee is not null then
    if not public.mail_lead() then raise exception 'LEAD_ONLY' using errcode = 'P0001'; end if;
    update public.mail_threads set assignee = null, ext_status = 'new' where id = p_thread returning * into t;
    perform public.mail_sys(p_thread, jsonb_build_object('e','unassign'));
  end if;
  if p_status is not null and p_status is distinct from t.ext_status then
    if p_status not in ('new','assigned','waiting','closed') then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
    if not (public.mail_lead() or t.assignee = me) then raise exception 'LEAD_ONLY' using errcode = 'P0001'; end if;
    update public.mail_threads set ext_status = p_status,
        reply_by = case when p_status in ('new','assigned') then coalesce(reply_by, now() + make_interval(hours => sla)) else null end
      where id = p_thread;
    perform public.mail_sys(p_thread, jsonb_build_object('e','status','to',p_status));
  end if;
end
$$;

-- A message became a work item (work items are still local to each browser).
create function public.mail_link_work(p_thread uuid, p_work text, p_title text, p_assignee text) returns int
language plpgsql security definer set search_path = ''
as $$
declare t public.mail_threads;
begin
  select * into t from public.mail_threads where id = p_thread for update;
  if not found or not public.mail_can_see(p_thread) or p_work !~ '^CH-[0-9]{1,6}$'
     or (t.kind = 'external' and not (public.mail_lead() or t.assignee = public.current_email())) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  update public.mail_threads set
      links = jsonb_build_array(jsonb_build_object('type','work','id',p_work,'title',left(coalesce(p_title,''),140))) || links,
      req_no = case when kind = 'external' then coalesce(req_no, nextval('public.mail_req_seq')) end
    where id = p_thread returning * into t;
  perform public.mail_sys(p_thread, jsonb_build_object('e','work','id',p_work,'title',left(coalesce(p_title,''),140),'req',t.req_no));
  if t.kind = 'external' and t.assignee is null and p_assignee is not null then
    perform public.mail_handle(p_thread, null, p_assignee);
  end if;
  return t.req_no;
end
$$;

-- ---------------------------------------------------------------------------
-- Approval of outside mail
-- ---------------------------------------------------------------------------
create function public.mail_hold_act(p_message uuid, p_op text, p_note text) returns void
language plpgsql security definer set search_path = ''
as $$
declare m public.mail_messages; paused boolean;
begin
  select * into m from public.mail_messages where id = p_message for update;
  if not found or m.state <> 'held' or not public.mail_approver() or m.author = public.current_email() then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  select s.paused into paused from public.mail_settings s where s.id = 1;
  if p_op = 'approve' then
    update public.mail_messages set state = case when paused then 'queued' else 'outbox' end,
        hold_by = public.current_email(), created_at = now()
      where id = p_message;
    update public.mail_threads set ext_status = 'waiting', reply_by = null, last_at = now(),
        assignee = coalesce(assignee, m.author)
      where id = m.thread_id;
    perform public.mail_sys(m.thread_id, jsonb_build_object('e','hold_ok','author',m.author,'queued',paused));
  elsif p_op = 'return' then
    if char_length(btrim(coalesce(p_note, ''))) = 0 then raise exception 'NOTE_REQUIRED' using errcode = 'P0001'; end if;
    update public.mail_messages set state = 'returned', hold_by = public.current_email(), hold_note = btrim(p_note)
      where id = p_message;
    perform public.mail_sys(m.thread_id, jsonb_build_object('e','hold_return','author',m.author));
  else
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  update public.mail_members set read_at = null, archived = false
    where thread_id = m.thread_id and email = m.author;
end
$$;

-- ---------------------------------------------------------------------------
-- Action cards
-- ---------------------------------------------------------------------------
create function public.mail_card_act(p_message uuid, p_op text, p_value text) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  m public.mail_messages; c jsonb; me text := public.current_email(); a public.media_files;
  k public.media_tasks; v int;
begin
  select * into m from public.mail_messages where id = p_message for update;
  if not found or m.card is null or m.kind <> 'mail' or not public.mail_can_see(m.thread_id) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  c := m.card;

  if c->>'type' = 'approval' then
    if c->>'state' <> 'pending' then raise exception 'CARD_CLOSED' using errcode = 'P0001'; end if;
    select * into a from public.media_files where id = (c->>'asset_id')::uuid;
    if not found then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
    if a.current_version <> (c->>'version')::int or a.stage <> 'review' then
      update public.mail_messages set card = c || jsonb_build_object('state','superseded','now',a.current_version,'stage',a.stage)
        where id = p_message;
      return;
    end if;
    if p_op not in ('approve','changes','reject') then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
    if p_op = 'changes' and char_length(btrim(coalesce(p_value, ''))) = 0 then
      raise exception 'NOTE_REQUIRED' using errcode = 'P0001';
    end if;
    -- Same rule as the approvals and media pages: the media guard decides.
    update public.media_files set stage = case p_op when 'approve' then 'ready' when 'changes' then 'changes' else 'rejected' end
      where id = a.id;
    if p_op = 'changes' then
      insert into public.media_notes (asset_id, author, body) values (a.id, me, left(btrim(p_value), 500));
    end if;
    update public.mail_messages set card = c || jsonb_build_object('state',
        case p_op when 'approve' then 'approved' when 'changes' then 'changes' else 'rejected' end,
        'dby', me, 'dat', now(), 'note', nullif(btrim(coalesce(p_value, '')), ''))
      where id = p_message;
    perform public.mail_sys(m.thread_id, jsonb_build_object('e','approval','op',p_op,'name',c->>'name','version',(c->>'version')::int));

  elsif c->>'type' = 'date' then
    if p_op = 'confirm' and c->>'state' = 'pending' and c->>'askee' = me then
      c := c || jsonb_build_object('state','confirmed','final',c->'proposed','dby',me,'dat',now());
    elsif p_op = 'counter' and c->>'state' = 'pending' and c->>'askee' = me then
      c := c || jsonb_build_object('state','counter','counter',p_value::timestamptz,'cby',me,'cat',now());
    elsif p_op = 'accept' and c->>'state' = 'counter' and (c->>'by' = me or public.mail_lead()) then
      c := c || jsonb_build_object('state','confirmed','final',c->'counter','dby',me,'dat',now());
    else
      raise exception 'FORBIDDEN' using errcode = 'P0001';
    end if;
    update public.mail_messages set card = c where id = p_message;
    perform public.mail_sys(m.thread_id, jsonb_build_object('e','date','op',p_op,'name',c->>'name',
      'at', case when p_op = 'counter' then c->'counter' else c->'final' end));
    if c->>'state' = 'confirmed' then
      perform public.media_log('date', (c->>'asset_id')::uuid, null, null,
        jsonb_build_object('name', c->>'name', 'at', c->'final', 'channels', c->'channels'));
    end if;

  elsif c->>'type' = 'task' then
    select * into k from public.media_tasks where id = (c->>'task_id')::uuid for update;
    if not found then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
    if p_op = 'progress' and k.assignee = me and k.status = 'open' then
      v := p_value::int;
      if v not between 0 and 99 then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
      update public.media_tasks set progress = v where id = k.id;
      perform public.mail_sys(m.thread_id, jsonb_build_object('e','progress','what',k.what,'pct',v));
    elsif p_op = 'done' and k.assignee = me and k.status = 'open' then
      update public.media_tasks set status = 'done' where id = k.id;
      perform public.mail_sys(m.thread_id, jsonb_build_object('e','done','what',k.what));
    elsif p_op = 'remind' and k.status = 'open' and (k.assigned_by = me or public.mail_approver()) then
      perform public.mail_sys(m.thread_id, jsonb_build_object('e','remind','to',k.assignee,'what',k.what));
      update public.mail_members set read_at = null, archived = false where thread_id = m.thread_id and email = k.assignee;
    else
      raise exception 'FORBIDDEN' using errcode = 'P0001';
    end if;
  else
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  update public.mail_threads set last_at = now() where id = m.thread_id;
  perform public.mail_wake(m.thread_id, me);
end
$$;

-- A task card follows its task, wherever the task is changed (mail or Tasks page).
create function public.mail_task_follow() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  update public.mail_messages set card = card || jsonb_build_object(
      'state', case when new.status = 'done' then 'done' else 'open' end,
      'progress', new.progress, 'due', new.due, 'priority', new.priority, 'dat', new.done_at)
    where card->>'task_id' = new.id::text;
  return new;
end
$$;
create trigger media_tasks_mail_follow after update on public.media_tasks
  for each row execute function public.mail_task_follow();

-- ---------------------------------------------------------------------------
-- Administration
-- ---------------------------------------------------------------------------
create function public.mail_admin(p_paused boolean, p_sla int) returns void
language plpgsql security definer set search_path = ''
as $$
declare was boolean;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  select paused into was from public.mail_settings where id = 1;
  update public.mail_settings set
      paused = coalesce(p_paused, paused),
      sla_hours = coalesce(p_sla, sla_hours),
      updated_by = public.current_email(), updated_at = now()
    where id = 1;
  if p_paused is not null and p_paused is distinct from was then
    if not p_paused then
      update public.mail_messages set state = 'outbox' where state = 'queued';
    end if;
    perform public.media_log('mail_pause', null, null, null, jsonb_build_object('paused', p_paused));
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Files
-- ---------------------------------------------------------------------------
-- A file the caller may open: their own upload, or one attached to a visible message.
create function public.mail_file(p_id uuid) returns table (drive_file_id text, name text, mime_type text, size_bytes bigint)
language sql stable security definer set search_path = ''
as $$
  select f.drive_file_id, f.name, f.mime_type, f.size_bytes from public.mail_files f
  where f.id = p_id and (f.uploaded_by = public.current_email() or exists (
    select 1 from public.mail_messages x
    where p_id = any (x.files) and public.mail_can_see(x.thread_id)
      and (x.author = public.current_email() or x.state not in ('held','returned') or public.mail_approver())))
$$;

-- An attachment of received mail: where it is in Gmail.
create function public.mail_inbound_file(p_message uuid, p_index int) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select x.inbound_files->p_index from public.mail_messages x
  where x.id = p_message and public.mail_can_see(x.thread_id) and jsonb_array_length(x.inbound_files) > p_index
$$;

-- ---------------------------------------------------------------------------
-- Server only (MAIL_SERVER_KEY)
-- ---------------------------------------------------------------------------
create function public.mail_register_file(p_key text, p_drive text, p_name text, p_mime text, p_size bigint, p_by text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare v uuid;
begin
  if not public.mail_key_ok(p_key) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  insert into public.mail_files (drive_file_id, name, mime_type, size_bytes, uploaded_by)
  values (p_drive, left(p_name, 255), p_mime, p_size, p_by)
  on conflict (drive_file_id) do update set name = excluded.name
  returning id into v;
  return v;
end
$$;

-- Takes the sync turn. Null when another sync ran within 40 seconds or is running.
create function public.mail_sync_begin(p_key text, p_force boolean) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare s public.mail_settings;
begin
  if not public.mail_key_ok(p_key) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  update public.mail_settings set sync_lock = now()
    where id = 1 and (sync_lock is null or sync_lock < now() - interval '2 minutes')
      and (coalesce(p_force, false) or sync_at is null or sync_at < now() - interval '40 seconds')
    returning * into s;
  if not found then return null; end if;
  return jsonb_build_object('last_uid', s.last_uid, 'uid_validity', s.uid_validity, 'paused', s.paused);
end
$$;

create function public.mail_sync_end(p_key text, p_last_uid bigint, p_uid_validity bigint) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.mail_key_ok(p_key) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  update public.mail_settings set
      last_uid = coalesce(p_last_uid, last_uid), uid_validity = coalesce(p_uid_validity, uid_validity),
      sync_at = now(), sync_lock = null
    where id = 1;
end
$$;

-- Records one received message. Threads by the References and In-Reply-To headers.
create function public.mail_ingest(p_key text, p jsonb) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  th uuid; t public.mail_threads; sla int; mid uuid; r public.mail_rules;
  sender text := lower(p->>'from_email'); subj text := left(coalesce(nullif(btrim(p->>'subject'), ''), '(بلا موضوع)'), 200);
  refs text[];
begin
  if not public.mail_key_ok(p_key) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if p->>'gmail_id' is not null and exists (select 1 from public.mail_messages where gmail_id = p->>'gmail_id') then
    return null;
  end if;
  select s.sla_hours into sla from public.mail_settings s where s.id = 1;
  refs := array(select jsonb_array_elements_text(coalesce(p->'refs', '[]'::jsonb)));
  select x.thread_id into th from public.mail_messages x
    where x.gmail_id = any (refs) order by x.created_at desc limit 1;

  if th is null then
    insert into public.mail_threads (kind, subject, created_by, contact_email, contact_name, ext_status, reply_by)
    values ('external', subj, 'system', sender, left(p->>'from_name', 120), 'new', now() + make_interval(hours => sla))
    returning * into t;
    th := t.id;
    for r in select * from public.mail_rules where enabled order by created_at loop
      if (r.field = 'from' and sender ilike '%' || r.pattern || '%')
         or (r.field = 'subject' and subj ilike '%' || r.pattern || '%') then
        if r.label is not null then
          update public.mail_threads set labels = (select array_agg(distinct l) from unnest(labels || array[r.label]) l) where id = th;
        end if;
        if r.assignee is not null and (select assignee from public.mail_threads where id = th) is null
           and exists (select 1 from public.accounts a where a.email = r.assignee) then
          update public.mail_threads set assignee = r.assignee, ext_status = 'assigned',
              req_no = nextval('public.mail_req_seq') where id = th;
          insert into public.mail_members (thread_id, email, participant) values (th, r.assignee, true)
            on conflict do nothing;
        end if;
      end if;
    end loop;
  else
    update public.mail_threads set
        ext_status = case when ext_status in ('waiting','closed') then (case when assignee is null then 'new' else 'assigned' end) else ext_status end,
        reply_by = coalesce(case when ext_status in ('new','assigned') then reply_by end, now() + make_interval(hours => sla))
      where id = th;
  end if;

  insert into public.mail_messages (thread_id, kind, author, from_name, from_email, to_list, cc_list, body,
                                    created_at, state, gmail_id, inbound_files)
  values (th, 'mail', null, left(p->>'from_name', 120), sender,
          array(select 'e:' || lower(v) from jsonb_array_elements_text(coalesce(p->'to', '[]'::jsonb)) v),
          array(select 'e:' || lower(v) from jsonb_array_elements_text(coalesce(p->'cc', '[]'::jsonb)) v),
          left(coalesce(p->>'body', ''), 20000), coalesce((p->>'at')::timestamptz, now()), 'sent',
          p->>'gmail_id', coalesce(p->'files', '[]'::jsonb))
  returning id into mid;
  update public.mail_threads set last_at = greatest(last_at, coalesce((p->>'at')::timestamptz, now())) where id = th;
  perform public.mail_wake(th, null);
  update public.mail_members set read_at = null where thread_id = th;
  return mid;
end
$$;

-- What the server should send now, with everything it needs to build each message.
create function public.mail_outbox(p_key text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare out jsonb := '[]'::jsonb; m record; refs jsonb; files jsonb; tok text; hdr text[]; a record; link text;
begin
  if not public.mail_key_ok(p_key) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if (select paused from public.mail_settings where id = 1) then return out; end if;
  for m in
    select x.*, t.subject, ac.display_name as author_name, ac.role as author_role
    from public.mail_messages x
    join public.mail_threads t on t.id = x.thread_id
    left join public.accounts ac on ac.email = x.author
    where x.state = 'outbox' and (x.send_at is null or x.send_at <= now())
    order by x.created_at limit 20
  loop
    refs := '[]'::jsonb;
    for a in
      select f.id, f.name, v.drive_file_id, v.size_bytes, v.mime_type, f.approved_version
      from public.media_files f join public.media_versions v on v.asset_id = f.id and v.version = f.approved_version
      where f.id = any (m.refs)
    loop
      link := null;
      if a.size_bytes > 25 * 1024 * 1024 then
        link := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
        insert into public.media_share_links (token, asset_id, created_by, expires_at)
        values (link, a.id, m.author, now() + interval '7 days');
      end if;
      refs := refs || jsonb_build_object('name', a.name, 'drive', a.drive_file_id, 'size', a.size_bytes,
                                         'mime', a.mime_type, 'version', a.approved_version, 'link', link);
    end loop;
    select coalesce(jsonb_agg(jsonb_build_object('name', f.name, 'drive', f.drive_file_id, 'size', f.size_bytes, 'mime', f.mime_type)), '[]'::jsonb)
      into files from public.mail_files f where f.id = any (m.files);
    select token into tok from public.mail_date_tokens where message_id = m.id;
    hdr := array(select x.gmail_id from public.mail_messages x
                 where x.thread_id = m.thread_id and x.gmail_id is not null order by x.created_at);
    out := out || jsonb_build_object(
      'id', m.id, 'subject', m.subject, 'body', m.body,
      'to', (select coalesce(jsonb_agg(substr(v, 3)), '[]'::jsonb) from unnest(m.to_list) v where v like 'e:%'),
      'cc', (select coalesce(jsonb_agg(substr(v, 3)), '[]'::jsonb) from unnest(m.cc_list) v where v like 'e:%'),
      'bcc', (select coalesce(jsonb_agg(substr(v, 3)), '[]'::jsonb) from unnest(m.bcc_list) v where v like 'e:%'),
      'author_name', m.author_name, 'refs', refs, 'files', files,
      'in_reply_to', hdr[array_length(hdr, 1)], 'references', to_jsonb(hdr),
      'date_token', tok, 'card', m.card);
  end loop;
  return out;
end
$$;

create function public.mail_mark_sent(p_key text, p_id uuid, p_gmail_id text, p_error text) returns void
language plpgsql security definer set search_path = ''
as $$
declare m public.mail_messages;
begin
  if not public.mail_key_ok(p_key) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  select * into m from public.mail_messages where id = p_id and state = 'outbox' for update;
  if not found then return; end if;
  if p_error is not null then
    update public.mail_messages set state = 'failed', error = left(p_error, 300) where id = p_id;
    return;
  end if;
  update public.mail_messages set state = 'sent', ext_sent_at = now(), gmail_id = p_gmail_id, error = null where id = p_id;
  insert into public.activity_log (actor_email, type, data)
  values (coalesce(m.author, 'system'), 'mail_out', jsonb_build_object(
    'subject', (select subject from public.mail_threads where id = m.thread_id),
    'to', (select coalesce(jsonb_agg(substr(v, 3)), '[]'::jsonb) from unnest(m.to_list || m.cc_list) v where v like 'e:%')));
end
$$;

-- A failed message is tried again.
create function public.mail_retry(p_message uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  update public.mail_messages set state = 'outbox', error = null
    where id = p_message and state = 'failed'
      and (author = public.current_email() or public.mail_lead());
  if not found then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Outside answers to a publish date (anonymous, by signed token)
-- ---------------------------------------------------------------------------
create function public.mail_date_peek(p_token text) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object('name', x.card->>'name', 'proposed', x.card->'proposed', 'state', x.card->>'state',
                            'channels', x.card->'channels', 'used', k.used_at is not null)
  from public.mail_date_tokens k join public.mail_messages x on x.id = k.message_id
  where k.token = p_token and k.expires_at > now()
$$;

create function public.mail_date_answer(p_token text, p_answer text, p_counter timestamptz) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare k public.mail_date_tokens; m public.mail_messages; c jsonb; who text;
begin
  select * into k from public.mail_date_tokens where token = p_token and expires_at > now() and used_at is null for update;
  if not found then return false; end if;
  select * into m from public.mail_messages where id = k.message_id for update;
  c := m.card;
  if c->>'state' <> 'pending' or p_answer not in ('confirm','counter')
     or (p_answer = 'counter' and (p_counter is null or p_counter < now() or p_counter > now() + interval '1 year')) then
    return false;
  end if;
  select coalesce(t.contact_name, t.contact_email) into who from public.mail_threads t where t.id = m.thread_id;
  if p_answer = 'confirm' then
    c := c || jsonb_build_object('state','confirmed','final',c->'proposed','dby','ext','dat',now());
    perform public.media_log('date', (c->>'asset_id')::uuid, null, null,
      jsonb_build_object('name', c->>'name', 'at', c->'final', 'channels', c->'channels', 'by', who));
  else
    c := c || jsonb_build_object('state','counter','counter',p_counter,'cby','ext','cat',now());
  end if;
  update public.mail_messages set card = c where id = m.id;
  update public.mail_date_tokens set used_at = now() where token = p_token;
  insert into public.mail_messages (thread_id, kind, author, card)
  values (m.thread_id, 'sys', 'system', jsonb_build_object('e','date_ext','op',p_answer,'who',who,'name',c->>'name',
          'at', case when p_answer = 'confirm' then c->'final' else c->'counter' end));
  update public.mail_threads set last_at = now(),
      ext_status = case when ext_status = 'waiting' then (case when assignee is null then 'new' else 'assigned' end) else ext_status end
    where id = m.thread_id;
  perform public.mail_wake(m.thread_id, null);
  update public.mail_members set read_at = null where thread_id = m.thread_id;
  return true;
end
$$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
revoke all on function public.mail_key_ok(text) from public, anon, authenticated;
revoke all on function public.mail_sys(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.mail_wake(uuid, text) from public, anon, authenticated;
revoke all on function public.mail_expand(text[]) from public, anon, authenticated;
revoke all on function public.mail_task_follow() from public, anon, authenticated;

revoke all on function public.mail_lead() from public, anon;
revoke all on function public.mail_approver() from public, anon;
revoke all on function public.mail_can_see(uuid) from public, anon;
revoke all on function public.mail_send(uuid, text, text[], text[], text[], text, uuid[], uuid[], jsonb, timestamptz, jsonb, boolean) from public, anon;
revoke all on function public.mail_cancel(uuid) from public, anon;
revoke all on function public.mail_send_now(uuid) from public, anon;
revoke all on function public.mail_note(uuid, text) from public, anon;
revoke all on function public.mail_state(uuid[], jsonb) from public, anon;
revoke all on function public.mail_set_labels(uuid, text[]) from public, anon;
revoke all on function public.mail_handle(uuid, text, text) from public, anon;
revoke all on function public.mail_link_work(uuid, text, text, text) from public, anon;
revoke all on function public.mail_hold_act(uuid, text, text) from public, anon;
revoke all on function public.mail_card_act(uuid, text, text) from public, anon;
revoke all on function public.mail_admin(boolean, int) from public, anon;
revoke all on function public.mail_file(uuid) from public, anon;
revoke all on function public.mail_inbound_file(uuid, int) from public, anon;
revoke all on function public.mail_retry(uuid) from public, anon;
revoke all on function public.mail_register_file(text, text, text, text, bigint, text) from public, anon;
revoke all on function public.mail_sync_begin(text, boolean) from public, anon;
revoke all on function public.mail_sync_end(text, bigint, bigint) from public, anon;
revoke all on function public.mail_ingest(text, jsonb) from public, anon;
revoke all on function public.mail_outbox(text) from public, anon;
revoke all on function public.mail_mark_sent(text, uuid, text, text) from public, anon;
revoke all on function public.mail_date_peek(text) from public;
revoke all on function public.mail_date_answer(text, text, timestamptz) from public;

grant execute on function public.mail_lead() to authenticated;
grant execute on function public.mail_approver() to authenticated;
grant execute on function public.mail_can_see(uuid) to authenticated;
grant execute on function public.mail_send(uuid, text, text[], text[], text[], text, uuid[], uuid[], jsonb, timestamptz, jsonb, boolean) to authenticated;
grant execute on function public.mail_cancel(uuid) to authenticated;
grant execute on function public.mail_send_now(uuid) to authenticated;
grant execute on function public.mail_note(uuid, text) to authenticated;
grant execute on function public.mail_state(uuid[], jsonb) to authenticated;
grant execute on function public.mail_set_labels(uuid, text[]) to authenticated;
grant execute on function public.mail_handle(uuid, text, text) to authenticated;
grant execute on function public.mail_link_work(uuid, text, text, text) to authenticated;
grant execute on function public.mail_hold_act(uuid, text, text) to authenticated;
grant execute on function public.mail_card_act(uuid, text, text) to authenticated;
grant execute on function public.mail_admin(boolean, int) to authenticated;
grant execute on function public.mail_file(uuid) to authenticated;
grant execute on function public.mail_inbound_file(uuid, int) to authenticated;
grant execute on function public.mail_retry(uuid) to authenticated;
-- Server-key functions: callable with a signed-in session, useless without the key.
grant execute on function public.mail_register_file(text, text, text, text, bigint, text) to authenticated;
grant execute on function public.mail_sync_begin(text, boolean) to authenticated;
grant execute on function public.mail_sync_end(text, bigint, bigint) to authenticated;
grant execute on function public.mail_ingest(text, jsonb) to authenticated;
grant execute on function public.mail_outbox(text) to authenticated;
grant execute on function public.mail_mark_sent(text, uuid, text, text) to authenticated;
grant execute on function public.mail_date_peek(text) to anon, authenticated;
grant execute on function public.mail_date_answer(text, text, timestamptz) to anon, authenticated;

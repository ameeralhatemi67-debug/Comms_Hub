-- «ورقة الكتابة» and the writing documents (Writing_Build_Plan.md, MVP_draft.md section 68), by owner directive of
-- 2026-11-02.
--
--   1. A written text is a checked JSON document, one file per saved version at the library's provider, and the
--      database keeps the record of each version with a plain-text copy (W-1, W-2). Platform copies stay plain text in
--      the database (W-3). Approval, comparison, search and the review screen never need the provider.
--   2. Who may write (the deviation from the reference, W-5): a leader, the work's «المسؤول», and a person holding a
--      stage whose role is `writer`. That third kind writes only in DRAFT, IN_PRODUCTION, CHANGES_REQUESTED and
--      REJECTED. Sending stays with «المسؤول» and the leaders; approval and publishing do not change.
--   3. The last N versions are kept (10 by default, 3 to 50), plus every version sent for review or approved. Pruning
--      happens at a save, because the site has no scheduled job: the record and its plain text stay, the file goes to
--      the provider's trash (W-6).
--   4. Documents are not library rows. Masters and pictures join the same machinery through file_locations, with
--      subject_kind 'work_doc' (W-4): a whole-library move carries them, a files backup copies them, and a version
--      sent or approved moves only by its checksum, as an approved library version does.
--   5. Drafts are private, a person's own rows only (W-7). Notes, research, ideas and phrases are here too.
--   6. Withdrawing from review, choosing accounts before sending, asking an opinion, and telling a stage writer what
--      «المسؤول» is told. Search reads the latest text and copies of works the person may see.
-- Every write is a function; who sees what is row level security. Nothing here is scheduled, and no sample data is seeded.

-- ---------------------------------------------------------------------------
-- 1. Columns on what exists
-- ---------------------------------------------------------------------------
alter table public.work_texts drop constraint work_texts_body_check;
alter table public.work_texts add constraint work_texts_body_check check (char_length(body) between 1 and 200000);
alter table public.work_texts
  add column id uuid not null default gen_random_uuid(),
  add column master_ref text check (master_ref is null or char_length(master_ref) between 1 and 300),
  add column master_size bigint check (master_size is null or master_size >= 0),
  -- sha256 of the checked document. file_locations.checksum stays the md5 of the bytes, as the move engine expects.
  add column checksum text check (checksum is null or checksum ~ '^[0-9a-f]{64}$'),
  add column keep boolean not null default false,
  add column pruned_at timestamptz;
create unique index work_texts_id_key on public.work_texts (id);

alter table public.works add column research text check (research is null or char_length(research) <= 8000);

alter table public.work_cycles add column text_n int;
update public.work_cycles c set text_n = (select max(t.n) from public.work_texts t where t.work_id = c.work_id and t.created_at <= c.sent_at);
update public.work_texts t set keep = true
  where exists (select 1 from public.work_cycles c where c.work_id = t.work_id and c.text_n = t.n)
     or exists (select 1 from public.work_approvals a where a.work_id = t.work_id and a.part = 'text' and a.ver = 't' || t.n);

alter table public.site_settings add column writing_keep int not null default 10 check (writing_keep between 3 and 50);

alter table public.file_locations drop constraint file_locations_subject_kind_check;
alter table public.file_locations add constraint file_locations_subject_kind_check
  check (subject_kind in ('media_version','mail_file','work_doc'));
alter table public.storage_move_items drop constraint storage_move_items_subject_kind_check;
alter table public.storage_move_items add constraint storage_move_items_subject_kind_check
  check (subject_kind in ('media_version','mail_file','work_doc'));

-- ---------------------------------------------------------------------------
-- 2. New tables
-- ---------------------------------------------------------------------------
-- The provider's folders and the current files of a work. The site tracks ids, never names.
create table public.work_docs (
  work_id text primary key references public.works(id) on delete cascade,
  folder_ref text not null check (char_length(folder_ref) between 1 and 300),
  current_ref text not null check (char_length(current_ref) between 1 and 300),
  versions_ref text not null check (char_length(versions_ref) between 1 and 300),
  drafts_ref text not null check (char_length(drafts_ref) between 1 and 300),
  images_ref text not null check (char_length(images_ref) between 1 and 300),
  word_ref text check (word_ref is null or char_length(word_ref) between 1 and 300),
  word_n int,
  pdf_ref text check (pdf_ref is null or char_length(pdf_ref) between 1 and 300),
  pdf_n int,
  text_ref text check (text_ref is null or char_length(text_ref) between 1 and 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- A person's draft of a work. Private: not even an administrator reads it. It goes with the account.
create table public.work_drafts (
  work_id text not null references public.works(id) on delete cascade,
  email text not null references public.accounts(email) on delete cascade,
  ref text not null check (char_length(ref) between 1 and 300),
  updated_at timestamptz not null default now(),
  primary key (work_id, email)
);
create index work_drafts_email_idx on public.work_drafts (email);

-- A note of a decider on a part, and on a sentence of it when `quote` is set.
create table public.work_notes (
  id uuid primary key default gen_random_uuid(),
  work_id text not null references public.works(id) on delete cascade,
  cycle int not null,
  part text not null check (char_length(part) between 1 and 120),
  quote text check (quote is null or char_length(quote) <= 500),
  body text not null check (char_length(btrim(body)) between 1 and 1000),
  author text not null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by text
);
create index work_notes_work_idx on public.work_notes (work_id, created_at);

-- Pictures from the device, placed in a document. Pictures from the library stay library files.
create table public.work_images (
  id uuid primary key default gen_random_uuid(),
  work_id text not null references public.works(id) on delete cascade,
  ref text not null check (char_length(ref) between 1 and 300),
  name text not null check (char_length(name) between 1 and 200),
  size_bytes bigint not null check (size_bytes between 1 and 5242880),
  mime_type text not null check (mime_type in ('image/png','image/jpeg','image/webp','image/gif')),
  added_by text not null,
  created_at timestamptz not null default now()
);
create index work_images_work_idx on public.work_images (work_id);

create table public.ideas (
  id uuid primary key default gen_random_uuid(),
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  tag text check (tag is null or char_length(tag) <= 40),
  author text not null,
  work_id text references public.works(id) on delete set null,
  created_at timestamptz not null default now()
);
create index ideas_author_idx on public.ideas (author, created_at desc);
create index ideas_work_idx on public.ideas (work_id);

create table public.writing_phrases (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 80),
  doc jsonb not null check (jsonb_typeof(doc) = 'object' and doc->>'type' = 'doc' and octet_length(doc::text) <= 50000),
  created_by text not null,
  created_at timestamptz not null default now()
);

alter table public.work_docs enable row level security;
alter table public.work_drafts enable row level security;
alter table public.work_notes enable row level security;
alter table public.work_images enable row level security;
alter table public.ideas enable row level security;
alter table public.writing_phrases enable row level security;

create policy work_docs_read on public.work_docs for select to authenticated using ((select public.work_can_see(work_id)));
create policy work_notes_read on public.work_notes for select to authenticated using ((select public.work_can_see(work_id)));
create policy work_images_read on public.work_images for select to authenticated using ((select public.work_can_see(work_id)));
create policy work_drafts_read on public.work_drafts for select to authenticated using (email = (select public.current_email()));
create policy ideas_read on public.ideas for select to authenticated
  using (author = (select public.current_email()) or (select public.work_lead()));
create policy writing_phrases_read on public.writing_phrases for select to authenticated using ((select public.is_approved()));

revoke all on public.work_docs from public, anon, authenticated;
revoke all on public.work_drafts from public, anon, authenticated;
revoke all on public.work_notes from public, anon, authenticated;
revoke all on public.work_images from public, anon, authenticated;
revoke all on public.ideas from public, anon, authenticated;
revoke all on public.writing_phrases from public, anon, authenticated;
grant select on public.work_docs to authenticated;
grant select on public.work_drafts to authenticated;
grant select on public.work_notes to authenticated;
grant select on public.work_images to authenticated;
grant select on public.ideas to authenticated;
grant select on public.writing_phrases to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Who may write
-- ---------------------------------------------------------------------------
create function public.work_text_writer(p_work text, p_email text) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.accounts a where a.email = p_email and a.role in ('director','assistant','admin'))
      or exists (select 1 from public.works w where w.id = p_work and w.assignee = p_email)
      or exists (select 1 from public.work_stages s where s.work_id = p_work and s.who = p_email and s.role = 'writer')
$$;

-- A person who writes through a stage alone, once the work has left the four statuses they may write in.
create function public.work_writer_locked(p_work text, p_email text) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.works w where w.id = p_work and w.assignee is distinct from p_email
                   and w.status not in ('DRAFT','IN_PRODUCTION','CHANGES_REQUESTED','REJECTED'))
     and not exists (select 1 from public.accounts a where a.email = p_email and a.role in ('director','assistant','admin'))
$$;

-- Why the caller may not write this work's text now; null when they may.
create function public.work_text_block(p_work text) returns text
language sql stable security definer set search_path = ''
as $$
  select case
    when w.closed_at is not null or not public.work_text_writer(w.id, public.current_email()) then 'FORBIDDEN'
    when public.work_writer_locked(w.id, public.current_email()) then 'WRITER_LOCKED'
    when w.status not in ('DRAFT','IN_PRODUCTION','CHANGES_REQUESTED','REJECTED','APPROVED','SCHEDULED') then 'STATUS_DENIED'
    else null end
  from public.works w where w.id = p_work
$$;

-- Who holds a writer stage and is not «المسؤول»: they are told what «المسؤول» is told.
create function public.work_writers(p_work text) returns text[]
language sql stable security definer set search_path = ''
as $$
  select coalesce(array_agg(distinct s.who), '{}') from public.work_stages s join public.works w on w.id = s.work_id
  where s.work_id = p_work and s.role = 'writer' and s.who is not null and s.who is distinct from w.assignee
$$;

-- ---------------------------------------------------------------------------
-- 4. Triggers
-- ---------------------------------------------------------------------------
-- A cycle remembers the version it sent, and that version is never pruned.
create function public.work_cycle_text() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare v_n int;
begin
  select max(t.n) into v_n from public.work_texts t where t.work_id = new.work_id;
  new.text_n := v_n;
  if v_n is not null then
    update public.work_texts t set keep = true where t.work_id = new.work_id and t.n = v_n and not t.keep;
  end if;
  return new;
end
$$;
create trigger work_cycles_text before insert on public.work_cycles
  for each row execute function public.work_cycle_text();

-- The approval of the text binds to t<n>: that version is never pruned either.
create function public.work_approval_text() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.part = 'text' and new.ver ~ '^t[0-9]{1,9}$' then
    update public.work_texts t set keep = true where t.work_id = new.work_id and t.n = substr(new.ver, 2)::int and not t.keep;
  end if;
  return new;
end
$$;
create trigger work_approvals_text after insert or update on public.work_approvals
  for each row execute function public.work_approval_text();

create function public.file_location_on_doc() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.file_locations where subject_kind = 'work_doc' and subject_id = old.id;
    return old;
  end if;
  if new.master_ref is not null and public.storage_integration_for('library') is not null then
    insert into public.file_locations (integration_id, subject_kind, subject_id, ref, size_bytes)
    values (public.storage_integration_for('library'), 'work_doc', new.id, new.master_ref, new.master_size)
    on conflict do nothing;
  end if;
  return new;
end
$$;
create trigger work_texts_location after insert or delete on public.work_texts
  for each row execute function public.file_location_on_doc();

create function public.file_location_on_doc_image() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.file_locations where subject_kind = 'work_doc' and subject_id = old.id;
    return old;
  end if;
  if public.storage_integration_for('library') is not null then
    insert into public.file_locations (integration_id, subject_kind, subject_id, ref, size_bytes)
    values (public.storage_integration_for('library'), 'work_doc', new.id, new.ref, new.size_bytes)
    on conflict do nothing;
  end if;
  return new;
end
$$;
create trigger work_images_location after insert or delete on public.work_images
  for each row execute function public.file_location_on_doc_image();

-- ---------------------------------------------------------------------------
-- 5. The version: rules, folders, commit
-- ---------------------------------------------------------------------------
-- What the save and export routes ask first, before anything reaches the provider. p_op 'export' changes no text,
-- so a work in review or published may still be exported by those who may write it.
create function public.work_doc_prepare(p_work text, p_op text default 'save') returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare w public.works; blk text; v_n int; v_sum text;
begin
  select * into w from public.works where id = p_work;
  if not found then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  blk := public.work_text_block(p_work);
  if blk = 'STATUS_DENIED' and p_op = 'export' then blk := null; end if;
  if blk is not null then raise exception '%', blk using errcode = 'P0001'; end if;
  select x.n, x.checksum into v_n, v_sum from public.work_texts x where x.work_id = p_work order by x.n desc limit 1;
  return jsonb_build_object('title', w.title, 'latest', v_n, 'next', coalesce(v_n, 0) + 1, 'checksum', v_sum,
    'docs', (select to_jsonb(d) from public.work_docs d where d.work_id = p_work));
end
$$;

-- The folders the server made at the provider. If two saves raced, the first stands and is returned.
create function public.work_doc_folders(p_key text, p_work text, p_folder text, p_current text, p_versions text, p_drafts text, p_images text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.mail_key_ok(p_key) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  perform public.work_doc_prepare(p_work, 'export');
  insert into public.work_docs (work_id, folder_ref, current_ref, versions_ref, drafts_ref, images_ref)
  values (p_work, p_folder, p_current, p_versions, p_drafts, p_images)
  on conflict (work_id) do nothing;
  return (select to_jsonb(d) from public.work_docs d where d.work_id = p_work);
end
$$;

-- A saved version: the same rule and the same words as work_text_save, plus the file. Returns {n, reopened, prune,
-- copies, draft}. `prune` names the references of the versions it pruned and `copies` every live copy of them, which
-- the server sends to the provider's trash; `draft` is the person's own draft file, finished with by this save.
create function public.work_doc_commit(p_key text, p_work text, p_body text, p_note text, p_master_ref text, p_size bigint, p_checksum text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  me text := public.current_email(); w public.works; blk text; v_n int; v_sum text; reopened boolean; v_keep int;
  gone uuid[]; refs text[]; v_copies jsonb; v_draft text; v_move uuid;
begin
  if not public.mail_key_ok(p_key) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  select * into w from public.works where id = p_work for update;
  if not found then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  blk := public.work_text_block(p_work);
  if blk is not null then raise exception '%', blk using errcode = 'P0001'; end if;
  p_body := btrim(coalesce(p_body, ''));
  if public.work_text_label(w.type) is null or char_length(p_body) = 0 then raise exception 'TEXT_REQUIRED' using errcode = 'P0001'; end if;
  if char_length(p_body) > 200000 then raise exception 'TEXT_TOO_LONG' using errcode = 'P0001'; end if;
  if char_length(coalesce(p_master_ref, '')) not between 1 and 300 or coalesce(p_size, -1) < 0
     or coalesce(p_checksum, '') !~ '^[0-9a-f]{64}$' then
    raise exception 'DOC_INVALID' using errcode = 'P0001';
  end if;
  select x.n, x.checksum into v_n, v_sum from public.work_texts x where x.work_id = p_work order by x.n desc limit 1;
  if v_sum = p_checksum then raise exception 'NO_CHANGE' using errcode = 'P0001'; end if;
  v_n := coalesce(v_n, 0) + 1;
  insert into public.work_texts (work_id, n, body, note, author, master_ref, master_size, checksum)
  values (p_work, v_n, p_body, coalesce(nullif(left(btrim(coalesce(p_note, '')), 200), ''), case when v_n = 1 then 'الصياغة الأولى' end), me,
          p_master_ref, p_size, p_checksum);
  perform public.work_log_add(p_work, 'text', case when v_n = 1 then 'كتابة ' || public.work_text_label(w.type)
    else 'تعديل ' || public.work_text_label(w.type) || ' (الإصدار ' || v_n || ')'
      || case when me is distinct from w.assignee and w.assignee is not null then '. الكاتب ' || public.work_name(w.assignee) else '' end end,
    jsonb_build_object('n', v_n));
  update public.works set updated_at = now() where id = p_work;
  reopened := public.work_reopen_after_change(p_work, 'تعديل بعد الاعتماد');

  -- The draft this save finished.
  delete from public.work_drafts d where d.work_id = p_work and d.email = me returning d.ref into v_draft;

  -- Beyond the last N, unless it was sent or approved. The record and its plain text stay.
  select coalesce(s.writing_keep, 10) into v_keep from public.site_settings s where s.id = 1;
  select coalesce(array_agg(t.id), '{}'), coalesce(array_agg(t.master_ref order by t.n), '{}') into gone, refs
    from public.work_texts t
    where t.work_id = p_work and t.n <= v_n - coalesce(v_keep, 10) and t.master_ref is not null and t.pruned_at is null and not t.keep;
  v_copies := '[]'::jsonb;
  if cardinality(gone) > 0 then
    select coalesce(jsonb_agg(jsonb_build_object('integration_id', i.id, 'type', i.type, 'config', i.config, 'ref', l.ref)), '[]'::jsonb)
      into v_copies
      from public.file_locations l join public.integrations i on i.id = l.integration_id
      where l.subject_kind = 'work_doc' and l.subject_id = any (gone) and l.state <> 'retired'
        and i.deleted_at is null and i.state <> 'disabled';
    update public.work_texts t set pruned_at = now() where t.id = any (gone);
    -- A run of the move engine that held one of these lets it go, so the run can still end.
    for v_move in select distinct i.move_id from public.storage_move_items i
                  where i.subject_kind = 'work_doc' and i.subject_id = any (gone) and i.state in ('pending','copying','copied','verified') loop
      update public.storage_move_items i set state = 'skipped', reason = 'source_changed', progress = null, claimed_until = null, updated_at = now()
        where i.move_id = v_move and i.subject_kind = 'work_doc' and i.subject_id = any (gone) and i.state in ('pending','copying','copied','verified');
      perform public.storage_move_settle(v_move);
    end loop;
    delete from public.file_locations l where l.subject_kind = 'work_doc' and l.subject_id = any (gone);
  end if;
  return jsonb_build_object('n', v_n, 'reopened', reopened, 'prune', to_jsonb(refs), 'copies', v_copies, 'draft', v_draft);
end
$$;

-- What the server wrote to «الحالي». p_kind: word | pdf | text. A Word or PDF of anything but the latest version is refused.
create function public.work_doc_export(p_key text, p_work text, p_kind text, p_ref text, p_n int) returns void
language plpgsql security definer set search_path = ''
as $$
declare v_n int;
begin
  if not public.mail_key_ok(p_key) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  perform public.work_doc_prepare(p_work, 'export');
  if p_kind is null or p_kind not in ('word','pdf','text') or char_length(coalesce(p_ref, '')) not between 1 and 300 then
    raise exception 'DOC_INVALID' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.work_docs d where d.work_id = p_work) then raise exception 'DOC_INVALID' using errcode = 'P0001'; end if;
  select max(t.n) into v_n from public.work_texts t where t.work_id = p_work;
  if p_n is distinct from v_n then raise exception 'EXPORT_STALE' using errcode = 'P0001'; end if;
  update public.work_docs d set
      word_ref = case when p_kind = 'word' then p_ref else d.word_ref end,
      word_n = case when p_kind = 'word' then p_n else d.word_n end,
      pdf_ref = case when p_kind = 'pdf' then p_ref else d.pdf_ref end,
      pdf_n = case when p_kind = 'pdf' then p_n else d.pdf_n end,
      text_ref = case when p_kind = 'text' then p_ref else d.text_ref end,
      updated_at = now()
    where d.work_id = p_work;
end
$$;

-- The person's own draft file. A draft is not a version: no log and no notice.
create function public.work_draft_set(p_key text, p_work text, p_ref text) returns void
language plpgsql security definer set search_path = ''
as $$
declare me text := public.current_email();
begin
  if not public.mail_key_ok(p_key) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  perform public.work_doc_prepare(p_work, 'save');
  if char_length(coalesce(p_ref, '')) not between 1 and 300 then raise exception 'DOC_INVALID' using errcode = 'P0001'; end if;
  insert into public.work_drafts (work_id, email, ref) values (p_work, me, p_ref)
  on conflict (work_id, email) do update set ref = excluded.ref, updated_at = now();
end
$$;

create function public.work_image_add(p_key text, p_work text, p_ref text, p_name text, p_size bigint, p_mime text) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare me text := public.current_email(); v_id uuid;
begin
  if not public.mail_key_ok(p_key) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  perform public.work_doc_prepare(p_work, 'save');
  if char_length(coalesce(p_ref, '')) not between 1 and 300 or coalesce(p_size, 0) not between 1 and 5242880
     or coalesce(p_mime, '') not in ('image/png','image/jpeg','image/webp','image/gif') then
    raise exception 'IMAGE_INVALID' using errcode = 'P0001';
  end if;
  insert into public.work_images (work_id, ref, name, size_bytes, mime_type, added_by)
  values (p_work, p_ref, coalesce(nullif(left(btrim(coalesce(p_name, '')), 200), ''), 'صورة'), p_size, p_mime, me)
  returning id into v_id;
  return v_id;
end
$$;

-- The research kept beside the text. Not a version: it is saved as it is.
create function public.work_research_save(p_work text, p_text text) returns void
language plpgsql security definer set search_path = ''
as $$
declare w public.works; v_text text := nullif(btrim(coalesce(p_text, '')), '');
begin
  select * into w from public.works where id = p_work for update;
  if not found or w.closed_at is not null or not public.work_text_writer(p_work, public.current_email()) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  if char_length(coalesce(v_text, '')) > 8000 then raise exception 'TEXT_TOO_LONG' using errcode = 'P0001'; end if;
  update public.works set research = v_text, updated_at = now() where id = p_work;
end
$$;

-- ---------------------------------------------------------------------------
-- 6. Notes, ideas, phrases, the version limit
-- ---------------------------------------------------------------------------
-- Those who may decide now add a note on a part of the open review, or on a sentence of it.
create function public.work_note_add(p_work text, p_part text, p_quote text, p_body text) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare me text := public.current_email(); w public.works; blk text; v_id uuid;
begin
  select * into w from public.works where id = p_work;
  if not found or not public.work_can_see(p_work) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  blk := public.work_decide_block(p_work);
  if blk is not null then raise exception '%', blk using errcode = 'P0001'; end if;
  if not exists (select 1 from public.work_parts(p_work) p where p.key = p_part) then raise exception 'PART_INVALID' using errcode = 'P0001'; end if;
  if char_length(btrim(coalesce(p_body, ''))) not between 1 and 1000 then raise exception 'TEXT_REQUIRED' using errcode = 'P0001'; end if;
  insert into public.work_notes (work_id, cycle, part, quote, body, author)
  values (p_work, w.review_cycle, p_part, nullif(left(btrim(coalesce(p_quote, '')), 500), ''), btrim(p_body), me)
  returning id into v_id;
  return v_id;
end
$$;

-- Those who may write close a note once it is dealt with.
create function public.work_note_resolve(p_id uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare me text := public.current_email(); v_work text; w public.works;
begin
  select x.work_id into v_work from public.work_notes x where x.id = p_id for update;
  if not found then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  select * into w from public.works where id = v_work;
  if w.closed_at is not null or not public.work_text_writer(v_work, me) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  update public.work_notes x set resolved_at = now(), resolved_by = me where x.id = p_id and x.resolved_at is null;
end
$$;

create function public.idea_add(p_body text, p_tag text default null) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare v_id uuid;
begin
  if not public.is_approved() then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if char_length(btrim(coalesce(p_body, ''))) not between 1 and 4000 then raise exception 'TEXT_REQUIRED' using errcode = 'P0001'; end if;
  insert into public.ideas (body, tag, author)
  values (btrim(p_body), nullif(left(btrim(coalesce(p_tag, '')), 40), ''), public.current_email())
  returning id into v_id;
  return v_id;
end
$$;

create function public.idea_remove(p_id uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  delete from public.ideas i where i.id = p_id and (i.author = public.current_email() or public.work_lead());
  if not found then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
end
$$;

-- The page creates the work through «إنشاء», the existing flow, and then marks the idea with it.
create function public.idea_to_work(p_id uuid, p_work text) returns void
language plpgsql security definer set search_path = ''
as $$
declare x public.ideas;
begin
  select * into x from public.ideas i where i.id = p_id for update;
  if not found or not (x.author = public.current_email() or public.work_lead()) or not public.work_can_see(p_work) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  if x.work_id is not null and x.work_id <> p_work then raise exception 'IDEA_USED' using errcode = 'P0001'; end if;
  update public.ideas i set work_id = p_work where i.id = p_id;
end
$$;

create function public.phrase_add(p_title text, p_doc jsonb) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare v_id uuid;
begin
  if not public.work_lead() then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if char_length(btrim(coalesce(p_title, ''))) not between 1 and 80 then raise exception 'NAME_REQUIRED' using errcode = 'P0001'; end if;
  if p_doc is null or jsonb_typeof(p_doc) <> 'object' or p_doc->>'type' <> 'doc' or octet_length(p_doc::text) > 50000 then
    raise exception 'DOC_INVALID' using errcode = 'P0001';
  end if;
  insert into public.writing_phrases (title, doc, created_by) values (btrim(p_title), p_doc, public.current_email()) returning id into v_id;
  return v_id;
end
$$;

create function public.phrase_remove(p_id uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.work_lead() then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  delete from public.writing_phrases p where p.id = p_id;
end
$$;

create function public.writing_keep_set(p_n int) returns void
language plpgsql security definer set search_path = ''
as $$
declare me text := public.current_email();
begin
  if not public.has_capability('settings.manage', null) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if p_n is null or p_n not between 3 and 50 then raise exception 'KEEP_INVALID' using errcode = 'P0001'; end if;
  update public.site_settings set writing_keep = p_n, updated_by = me, updated_at = now() where id = 1;
  insert into public.integration_events (integration_id, actor, kind, data)
  values (null, me, 'settings', jsonb_build_object('writing_keep', p_n));
end
$$;

-- ---------------------------------------------------------------------------
-- 7. Sending: withdrawing, the accounts, asking an opinion
-- ---------------------------------------------------------------------------
-- The sender or a leader takes the work back while nobody has decided anything in this cycle. It returns to where it
-- was: «بحاجة إلى تعديل» if the last decision before it asked for changes, else «قيد الإنتاج». A schedule that was
-- waiting (pending_sched) keeps waiting, as after a request for changes. A cycle that only moves a date has its own
-- way out, work_cancel_move, because the work there returns to its schedule.
create function public.work_withdraw(p_work text) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  me text := public.current_email(); w public.works; v_sent text; v_op text; v_status text; v_told text[];
  prev_m text := coalesce(current_setting('app.media_internal', true), '0');
  prev_w text := coalesce(current_setting('app.work_internal', true), '0');
begin
  select * into w from public.works where id = p_work for update;
  if not found or w.closed_at is not null or not public.work_can_see(p_work) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if w.status <> 'IN_REVIEW' or w.review_cycle is null then raise exception 'NOT_IN_REVIEW' using errcode = 'P0001'; end if;
  if w.move_from is not null then raise exception 'WITHDRAW_MOVE' using errcode = 'P0001'; end if;
  select c.sent_by into v_sent from public.work_cycles c where c.work_id = p_work and c.n = w.review_cycle;
  if not (v_sent = me or public.work_lead()) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if exists (select 1 from public.work_decisions d where d.work_id = p_work and d.cycle = w.review_cycle) then
    raise exception 'WITHDRAW_DECIDED' using errcode = 'P0001';
  end if;
  select d.op into v_op from public.work_decisions d
    where d.work_id = p_work and d.cycle < w.review_cycle and d.op <> 'withdraw' order by d.cycle desc, d.id desc limit 1;
  v_status := case when v_op = 'changes' then 'CHANGES_REQUESTED' else 'IN_PRODUCTION' end;
  -- Asked while the cycle is open: it leaves the sender out.
  v_told := public.work_deciders(p_work);
  insert into public.work_decisions (work_id, cycle, op, parts, labels, decided_by)
    values (p_work, w.review_cycle, 'withdraw', '{}', array['العمل كله'], me);
  update public.works set status = v_status, review_cycle = null, updated_at = now() where id = p_work;
  perform public.work_log_add(p_work, 'withdraw', 'سحب العمل من المراجعة (الدورة ' || w.review_cycle || ')', jsonb_build_object('cycle', w.review_cycle));
  -- Nothing waits for their decision now, so «يحتاج قرارك» does not keep saying so.
  update public.notifications x set read_at = now()
    where x.tier = 'decide' and x.read_at is null and x.go->>'page' = 'review' and x.go->>'id' = p_work;
  perform public.work_notify_many(v_told, 'info', public.work_name(me) || ' سحب «' || w.title || '» من المراجعة.', public.work_go(p_work));
  perform public.work_sync_assets(p_work);
  -- work_sync_asset only moves a file on to a later state, and this one goes back: a file the review had marked and no
  -- other work is reviewing returns to production in the library, where it can be sent again.
  perform set_config('app.media_internal', '1', true);
  perform set_config('app.work_internal', '1', true);
  update public.media_files m set stage = 'production'
    where m.stage = 'review'
      and exists (select 1 from public.work_assets wa where wa.work_id = p_work and wa.asset_id = m.id)
      and not exists (select 1 from public.work_assets wa join public.works x on x.id = wa.work_id
                      where wa.asset_id = m.id and x.status = 'IN_REVIEW');
  perform set_config('app.media_internal', prev_m, true);
  perform set_config('app.work_internal', prev_w, true);
  return v_status;
end
$$;

-- «المسؤول» or a leader chooses the accounts before sending. work_submit may still replace them.
create function public.work_set_channels(p_work text, p_channels uuid[]) returns void
language plpgsql security definer set search_path = ''
as $$
declare me text := public.current_email(); w public.works; v_assets uuid[]; v_channels uuid[] := coalesce(p_channels, '{}');
begin
  select * into w from public.works where id = p_work for update;
  if not found or w.closed_at is not null or not public.work_can_see(p_work) or not (public.work_lead() or w.assignee = me) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  if not public.work_publishable(w.type) or w.status not in ('DRAFT','IN_PRODUCTION','CHANGES_REQUESTED','REJECTED') then
    raise exception 'STATUS_DENIED' using errcode = 'P0001';
  end if;
  if w.type = 'post' and cardinality(v_channels) = 0 then raise exception 'CHANNEL_REQUIRED' using errcode = 'P0001'; end if;
  perform public.work_check_channels(v_channels);
  select coalesce(array_agg(a.asset_id), '{}') into v_assets from public.work_assets a where a.work_id = p_work;
  if not public.work_youtube_ok(w.type, v_channels, v_assets) then raise exception 'YOUTUBE_VIDEO_ONLY' using errcode = 'P0001'; end if;
  if v_channels = w.channels then return; end if;
  update public.works set channels = v_channels, updated_at = now() where id = p_work;
  perform public.work_log_add(p_work, 'channels', 'اختيار حسابات النشر (' || cardinality(v_channels) || ')', jsonb_build_object('channels', v_channels));
end
$$;

-- A comment everyone on the work reads, and a notice at «يحتاج انتباهك» for the one person asked.
create function public.work_ask_opinion(p_work text, p_to text, p_body text) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare me text := public.current_email(); w public.works; v_body text := left(btrim(coalesce(p_body, '')), 2000); v_id uuid;
begin
  select * into w from public.works where id = p_work;
  if not found or not public.work_can_see(p_work) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if char_length(v_body) = 0 then raise exception 'TEXT_REQUIRED' using errcode = 'P0001'; end if;
  if p_to is null or p_to = me or not exists (select 1 from public.accounts a where a.email = p_to) then
    raise exception 'PERSON_INVALID' using errcode = 'P0001';
  end if;
  -- On a restricted work the person asked must already see it.
  if w.restricted and not (public.work_involved(p_work, p_to)
                           or exists (select 1 from public.accounts a where a.email = p_to and a.role in ('director','assistant','admin'))) then
    raise exception 'PERSON_INVALID' using errcode = 'P0001';
  end if;
  insert into public.work_comments (work_id, author, body) values (p_work, me, v_body) returning id into v_id;
  perform public.work_notify(p_to, 'attention', public.work_name(me) || ' يسأل عن رأيك في «' || w.title || '»: ' || left(v_body, 120), public.work_go(p_work));
  return v_id;
end
$$;

-- ---------------------------------------------------------------------------
-- 8. Search
-- ---------------------------------------------------------------------------
create function public.work_snippet(p_body text, p_q text) returns text
language sql immutable set search_path = ''
as $$
  with t as (select regexp_replace(p_body, '\s+', ' ', 'g') as b),
  p as (select b, strpos(lower(b), lower(p_q)) as pos from t)
  select case when p.pos <= 41 then '' else '…' end
      || substr(p.b, greatest(p.pos - 40, 1), 120)
      || case when greatest(p.pos - 40, 1) + 120 > char_length(p.b) then '' else '…' end
  from p
$$;

-- The latest text and the latest copy per platform of works the person may see. p_q is matched literally.
create function public.work_text_search(p_q text)
returns table (work_id text, title text, status text, part text, platform text, n int, snippet text)
language plpgsql stable security definer set search_path = ''
as $$
#variable_conflict use_column
declare q text := left(btrim(coalesce(p_q, '')), 100); pat text;
begin
  if not public.is_approved() or char_length(q) < 2 then return; end if;
  pat := '%' || replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  return query
  with latest as (
    select distinct on (t.work_id) t.work_id, 'text'::text as part, null::text as platform, t.n, t.body
    from public.work_texts t order by t.work_id, t.n desc),
  copies as (
    select distinct on (v.work_id, v.platform) v.work_id, 'copy'::text as part, v.platform, v.n, v.body
    from public.work_variants v order by v.work_id, v.platform, v.n desc)
  select w.id, w.title, w.status, x.part, x.platform, x.n, public.work_snippet(x.body, q)
  from (select * from latest union all select * from copies) x
  join public.works w on w.id = x.work_id
  where x.body ilike pat escape '\' and public.work_can_see(w.id)
  order by w.updated_at desc, w.id, x.part desc, x.platform
  limit 20;
end
$$;

-- ---------------------------------------------------------------------------
-- 9. The move engine and backups carry the documents
-- ---------------------------------------------------------------------------
-- A document file as the engine sees it: its name, its type, and the folder it goes back to at Drive.
create function public.work_doc_file(p_id uuid) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select jsonb_build_object('name', 'v' || lpad(t.n::text, 3, '0') || ' ' || to_char(t.created_at at time zone 'Asia/Riyadh', 'YYYY-MM-DD') || '.json',
                               'mime', 'application/json', 'parent', d.versions_ref)
     from public.work_texts t left join public.work_docs d on d.work_id = t.work_id where t.id = p_id),
    (select jsonb_build_object('name', x.name, 'mime', x.mime_type, 'parent', d.images_ref)
     from public.work_images x left join public.work_docs d on d.work_id = x.work_id where x.id = p_id))
$$;

-- ---------------------------------------------------------------------------
-- 10. Patches, each from the function's live definition. Every replacement must match or the migration stops.
-- ---------------------------------------------------------------------------
do $patch$
declare d text; o text;
begin
  -- work_text_save: the writer rule; the main text is refused above the limit, never cut.
  d := pg_get_functiondef('public.work_text_save(text,text,text,text)'::regprocedure);
  o := d;
  d := replace(d, $s$if not found or w.closed_at is not null or not (public.work_lead() or w.assignee = me) then$s$,
                  $s$if not found or public.work_text_block(p_work) = 'FORBIDDEN' then$s$);
  if d = o then raise exception 'PATCH_work_text_save_RULE_NOT_APPLIED'; end if;
  o := d;
  d := replace(d, $s$if w.status not in ('DRAFT','IN_PRODUCTION','CHANGES_REQUESTED','REJECTED','APPROVED','SCHEDULED') then$s$,
                  $s$if public.work_text_block(p_work) = 'WRITER_LOCKED' then raise exception 'WRITER_LOCKED' using errcode = 'P0001'; end if;
  if w.status not in ('DRAFT','IN_PRODUCTION','CHANGES_REQUESTED','REJECTED','APPROVED','SCHEDULED') then$s$);
  if d = o then raise exception 'PATCH_work_text_save_LOCK_NOT_APPLIED'; end if;
  o := d;
  d := replace(d, $s$if public.work_text_label(w.type) is null or char_length(p_body) = 0 then raise exception 'TEXT_REQUIRED' using errcode = 'P0001'; end if;$s$,
                  $s$if public.work_text_label(w.type) is null or char_length(p_body) = 0 then raise exception 'TEXT_REQUIRED' using errcode = 'P0001'; end if;
    if char_length(p_body) > 200000 then raise exception 'TEXT_TOO_LONG' using errcode = 'P0001'; end if;$s$);
  if d = o then raise exception 'PATCH_work_text_save_LIMIT_NOT_APPLIED'; end if;
  o := d;
  d := replace(d, $s$values (p_work, n, left(p_body, 8000), coalesce($s$, $s$values (p_work, n, p_body, coalesce($s$);
  if d = o then raise exception 'PATCH_work_text_save_CUT_NOT_APPLIED'; end if;
  execute d;

  -- work_variant_confirm: the same rule.
  d := pg_get_functiondef('public.work_variant_confirm(text,text)'::regprocedure);
  o := d;
  d := replace(d, $s$if not found or w.closed_at is not null or not (public.work_lead() or w.assignee = public.current_email()) then$s$,
                  $s$if found and public.work_text_writer(p_work, public.current_email()) and public.work_writer_locked(p_work, public.current_email()) then
    raise exception 'WRITER_LOCKED' using errcode = 'P0001';
  end if;
  if not found or w.closed_at is not null or not public.work_text_writer(p_work, public.current_email()) then$s$);
  if d = o then raise exception 'PATCH_work_variant_confirm_NOT_APPLIED'; end if;
  execute d;

  -- work_create: a first text may be as long as any other.
  d := pg_get_functiondef('public.work_create(jsonb)'::regprocedure);
  o := d;
  d := replace(d, $s$left(btrim(p->>'main'), 8000)$s$, $s$left(btrim(p->>'main'), 200000)$s$);
  if d = o then raise exception 'PATCH_work_create_NOT_APPLIED'; end if;
  execute d;

  -- Removing an account at its owner's request also removes their ideas that never became a work.
  d := pg_get_functiondef('public.account_deletion_done()'::regprocedure);
  o := d;
  d := replace(d, $s$delete from public.chat_stars where email = old.email;$s$,
                  $s$delete from public.chat_stars where email = old.email;
    delete from public.ideas where author = old.email and work_id is null;$s$);
  if d = o then raise exception 'PATCH_account_deletion_done_NOT_APPLIED'; end if;
  execute d;

  -- A writer-stage holder is told what «المسؤول» is told, at the same tier. work_notify_many takes out repeats.
  d := pg_get_functiondef('public.work_decide(text,text,text[],text,boolean)'::regprocedure);
  o := d;
  d := replace(d, $s$perform public.work_notify(w.assignee, 'attention', public.work_name(me) || ' طلب تعديل «' || array_to_string(labels, '»، «')$s$,
                  $s$perform public.work_notify_many(array[w.assignee] || public.work_writers(p_work), 'attention', public.work_name(me) || ' طلب تعديل «' || array_to_string(labels, '»، «')$s$);
  if d = o then raise exception 'PATCH_work_decide_CHANGES_NOT_APPLIED'; end if;
  o := d;
  d := replace(d, $s$perform public.work_notify(w.assignee, 'attention', public.work_name(me) || ' رفض «' || w.title || '»: ' || v_note, public.work_go(p_work));$s$,
                  $s$perform public.work_notify_many(array[w.assignee] || public.work_writers(p_work), 'attention', public.work_name(me) || ' رفض «' || w.title || '»: ' || v_note, public.work_go(p_work));$s$);
  if d = o then raise exception 'PATCH_work_decide_REJECT_NOT_APPLIED'; end if;
  execute d;

  d := pg_get_functiondef('public.work_finish_if_done(text)'::regprocedure);
  o := d;
  d := replace(d, $s$perform public.work_notify_many(array[w.assignee] || public.work_publishers(), 'info',$s$,
                  $s$perform public.work_notify_many(array[w.assignee] || public.work_writers(p_work) || public.work_publishers(), 'info',$s$);
  if d = o then raise exception 'PATCH_work_finish_if_done_NOT_APPLIED'; end if;
  execute d;

  d := pg_get_functiondef('public.work_run_publish(text,uuid[],timestamptz,text)'::regprocedure);
  o := d;
  d := replace(d, $s$perform public.work_notify(w.assignee, case when st = 'PUBLISHED' then 'info' else 'attention' end,$s$,
                  $s$perform public.work_notify_many(array[w.assignee] || public.work_writers(p_work), case when st = 'PUBLISHED' then 'info' else 'attention' end,$s$);
  if d = o then raise exception 'PATCH_work_run_publish_NOT_APPLIED'; end if;
  execute d;

  d := pg_get_functiondef('public.work_publish(text,text)'::regprocedure);
  o := d;
  d := replace(d, $s$perform public.work_notify(w.assignee, 'attention', 'لم يُنشر «' || w.title || '» عند موعده بقرار مسؤول النشر.', public.work_go(p_work));$s$,
                  $s$perform public.work_notify_many(array[w.assignee] || public.work_writers(p_work), 'attention', 'لم يُنشر «' || w.title || '» عند موعده بقرار مسؤول النشر.', public.work_go(p_work));$s$);
  if d = o then raise exception 'PATCH_work_publish_NOT_APPLIED'; end if;
  execute d;

  -- The whole library is planned with its documents; a folder or a chosen list is library files alone. A version sent
  -- or approved counts as approved for the engine: it moves only by checksum.
  d := pg_get_functiondef('public.storage_move_plan(uuid,uuid,jsonb,text,text,int)'::regprocedure);
  o := d;
  d := replace(d, $s$where l.integration_id = p_source and l.role = 'primary' and l.state <> 'retired' and l.subject_kind = subject$s$,
                  $s$where l.integration_id = p_source and l.role = 'primary' and l.state <> 'retired'
    and (l.subject_kind = subject or (sk = 'library' and l.subject_kind = 'work_doc'))$s$);
  if d = o then raise exception 'PATCH_storage_move_plan_SCOPE_NOT_APPLIED'; end if;
  o := d;
  d := replace(d, $s$(l.subject_kind = 'media_version' and exists ($s$,
                  $s$(l.subject_kind = 'work_doc' and exists (select 1 from public.work_texts t where t.id = l.subject_id and t.keep))
         or (l.subject_kind = 'media_version' and exists ($s$);
  if d = o then raise exception 'PATCH_storage_move_plan_APPROVED_NOT_APPLIED'; end if;
  execute d;

  d := pg_get_functiondef('public.storage_move_claim(text,uuid,int)'::regprocedure);
  o := d;
  d := replace(d, $s$else (select mf.name from public.mail_files mf where mf.id = i.subject_id) end,$s$,
                  $s$when 'work_doc' then public.work_doc_file(i.subject_id)->>'name'
                    else (select mf.name from public.mail_files mf where mf.id = i.subject_id) end,$s$);
  if d = o then raise exception 'PATCH_storage_move_claim_NAME_NOT_APPLIED'; end if;
  o := d;
  d := replace(d, $s$else (select mf.mime_type from public.mail_files mf where mf.id = i.subject_id) end,$s$,
                  $s$when 'work_doc' then public.work_doc_file(i.subject_id)->>'mime'
                    else (select mf.mime_type from public.mail_files mf where mf.id = i.subject_id) end,$s$);
  if d = o then raise exception 'PATCH_storage_move_claim_MIME_NOT_APPLIED'; end if;
  o := d;
  d := replace(d, $s$join public.media_folders fo on fo.id = f.folder_id where v.id = i.subject_id) end,$s$,
                  $s$join public.media_folders fo on fo.id = f.folder_id where v.id = i.subject_id)
                    when i.subject_kind = 'work_doc' and d.type = 'google_drive' then public.work_doc_file(i.subject_id)->>'parent' end,$s$);
  if d = o then raise exception 'PATCH_storage_move_claim_PARENT_NOT_APPLIED'; end if;
  execute d;

  d := pg_get_functiondef('public.backup_run_begin(text)'::regprocedure);
  o := d;
  d := replace(d, $s$where l.role = 'primary' and l.state in ('ok','pending') and l.subject_kind = subject and l.integration_id <> tgt$s$,
                  $s$where l.role = 'primary' and l.state in ('ok','pending') and l.integration_id <> tgt
          and (l.subject_kind = subject or (k = 'library' and l.subject_kind = 'work_doc'))$s$);
  if d = o then raise exception 'PATCH_backup_run_begin_NOT_APPLIED'; end if;
  execute d;

  d := pg_get_functiondef('public.backup_restore_file(text,uuid)'::regprocedure);
  o := d;
  d := replace(d, $s$if p_kind not in ('media_version','mail_file') then$s$, $s$if p_kind not in ('media_version','mail_file','work_doc') then$s$);
  if d = o then raise exception 'PATCH_backup_restore_file_NOT_APPLIED'; end if;
  execute d;

  d := pg_get_functiondef('public.backup_overview()'::regprocedure);
  o := d;
  d := replace(d, $s$'total', (select count(*) from public.media_versions) + (select count(*) from public.mail_files),$s$,
                  $s$'total', (select count(*) from public.media_versions) + (select count(*) from public.mail_files)
               + (select count(*) from public.file_locations x where x.subject_kind = 'work_doc' and x.role = 'primary' and x.state <> 'retired'),$s$);
  if d = o then raise exception 'PATCH_backup_overview_NOT_APPLIED'; end if;
  execute d;

  -- The export list: the records of a document. Drafts and ideas are a person's own and do not leave.
  -- A version can be a hundred times longer now, so its table is read in shorter pages.
  d := pg_get_functiondef('public.backup_table_list(text)'::regprocedure);
  o := d;
  d := replace(d, $s$jsonb_build_object('table','studio_sources'), jsonb_build_object('table','studio_exports'))$s$,
                  $s$jsonb_build_object('table','studio_sources'), jsonb_build_object('table','studio_exports'),
      jsonb_build_object('table','work_docs'), jsonb_build_object('table','work_notes'), jsonb_build_object('table','work_images'),
      jsonb_build_object('table','writing_phrases'))$s$);
  if d = o then raise exception 'PATCH_backup_table_list_ADD_NOT_APPLIED'; end if;
  o := d;
  d := replace(d, $s$jsonb_build_object('table','work_texts')$s$, $s$jsonb_build_object('table','work_texts', 'page', 25)$s$);
  if d = o then raise exception 'PATCH_backup_table_list_PAGE_NOT_APPLIED'; end if;
  execute d;

  d := pg_get_functiondef('public.storage_overview()'::regprocedure);
  o := d;
  d := replace(d, $s$'library_files', coalesce(s.library_files, 0), 'mail_files', coalesce(s.mail_files, 0),$s$,
                  $s$'library_files', coalesce(s.library_files, 0), 'mail_files', coalesce(s.mail_files, 0), 'writing_files', coalesce(s.writing_files, 0),$s$);
  if d = o then raise exception 'PATCH_storage_overview_CARD_NOT_APPLIED'; end if;
  o := d;
  d := replace(d, $s$count(*) filter (where subject_kind = 'mail_file') mail_files,$s$,
                  $s$count(*) filter (where subject_kind = 'mail_file') mail_files,
               count(*) filter (where subject_kind = 'work_doc') writing_files,$s$);
  if d = o then raise exception 'PATCH_storage_overview_COUNT_NOT_APPLIED'; end if;
  o := d;
  d := replace(d, $s$where not exists (select 1 from public.file_locations l where l.subject_kind = 'mail_file' and l.subject_id = f.id and l.state <> 'retired')),$s$,
                  $s$where not exists (select 1 from public.file_locations l where l.subject_kind = 'mail_file' and l.subject_id = f.id and l.state <> 'retired'))
                 + (select count(*) from public.work_texts t where t.master_ref is not null and t.pruned_at is null
                    and not exists (select 1 from public.file_locations l where l.subject_kind = 'work_doc' and l.subject_id = t.id and l.state <> 'retired'))
                 + (select count(*) from public.work_images x
                    where not exists (select 1 from public.file_locations l where l.subject_kind = 'work_doc' and l.subject_id = x.id and l.state <> 'retired')),$s$);
  if d = o then raise exception 'PATCH_storage_overview_UNRECORDED_NOT_APPLIED'; end if;
  execute d;
end
$patch$;

-- ---------------------------------------------------------------------------
-- 11. Privileges. CREATE OR REPLACE keeps what the patched functions had.
-- ---------------------------------------------------------------------------
-- Internal: callable by no one through the API.
revoke all on function public.work_text_writer(text, text) from public, anon, authenticated;
revoke all on function public.work_writer_locked(text, text) from public, anon, authenticated;
revoke all on function public.work_writers(text) from public, anon, authenticated;
revoke all on function public.work_cycle_text() from public, anon, authenticated;
revoke all on function public.work_approval_text() from public, anon, authenticated;
revoke all on function public.file_location_on_doc() from public, anon, authenticated;
revoke all on function public.file_location_on_doc_image() from public, anon, authenticated;
revoke all on function public.work_doc_file(uuid) from public, anon, authenticated;
revoke all on function public.work_snippet(text, text) from public, anon, authenticated;

-- Signed-in people; each checks its own rule.
revoke all on function public.work_text_block(text) from public, anon;
revoke all on function public.work_doc_prepare(text, text) from public, anon;
revoke all on function public.work_research_save(text, text) from public, anon;
revoke all on function public.work_note_add(text, text, text, text) from public, anon;
revoke all on function public.work_note_resolve(uuid) from public, anon;
revoke all on function public.idea_add(text, text) from public, anon;
revoke all on function public.idea_remove(uuid) from public, anon;
revoke all on function public.idea_to_work(uuid, text) from public, anon;
revoke all on function public.phrase_add(text, jsonb) from public, anon;
revoke all on function public.phrase_remove(uuid) from public, anon;
revoke all on function public.writing_keep_set(int) from public, anon;
revoke all on function public.work_withdraw(text) from public, anon;
revoke all on function public.work_set_channels(text, uuid[]) from public, anon;
revoke all on function public.work_ask_opinion(text, text, text) from public, anon;
revoke all on function public.work_text_search(text) from public, anon;
grant execute on function public.work_text_block(text) to authenticated;
grant execute on function public.work_doc_prepare(text, text) to authenticated;
grant execute on function public.work_research_save(text, text) to authenticated;
grant execute on function public.work_note_add(text, text, text, text) to authenticated;
grant execute on function public.work_note_resolve(uuid) to authenticated;
grant execute on function public.idea_add(text, text) to authenticated;
grant execute on function public.idea_remove(uuid) to authenticated;
grant execute on function public.idea_to_work(uuid, text) to authenticated;
grant execute on function public.phrase_add(text, jsonb) to authenticated;
grant execute on function public.phrase_remove(uuid) to authenticated;
grant execute on function public.writing_keep_set(int) to authenticated;
grant execute on function public.work_withdraw(text) to authenticated;
grant execute on function public.work_set_channels(text, uuid[]) to authenticated;
grant execute on function public.work_ask_opinion(text, text, text) to authenticated;
grant execute on function public.work_text_search(text) to authenticated;

-- The server's own calls, made with the person's session: the key and the person's right together.
revoke all on function public.work_doc_commit(text, text, text, text, text, bigint, text) from public, anon;
revoke all on function public.work_doc_folders(text, text, text, text, text, text, text) from public, anon;
revoke all on function public.work_doc_export(text, text, text, text, int) from public, anon;
revoke all on function public.work_draft_set(text, text, text) from public, anon;
revoke all on function public.work_image_add(text, text, text, text, bigint, text) from public, anon;
grant execute on function public.work_doc_commit(text, text, text, text, text, bigint, text) to authenticated;
grant execute on function public.work_doc_folders(text, text, text, text, text, text, text) to authenticated;
grant execute on function public.work_doc_export(text, text, text, text, int) to authenticated;
grant execute on function public.work_draft_set(text, text, text) to authenticated;
grant execute on function public.work_image_add(text, text, text, text, bigint, text) to authenticated;

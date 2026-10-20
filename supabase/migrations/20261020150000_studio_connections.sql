-- The studio, third round, Phase 7: the database for the studio's connections (MVP_draft.md 62.12 to
-- 62.14, Studio_Build_Plan.md section 10). Owner decision of 2026-10-20: a review note records the file
-- version it was written on and, when wanted, an area of the frame.
--
--   * media_notes gains the version, the exact time in milliseconds (timecode stays for display and older
--     readers), an area {x, y, w, h} as fractions of the frame, one level of replies, and «تم».
--     media_note_add and media_note_done are the new writers; the older insert policy stays for older
--     clients. A note is done or undone by its author, a leader, or someone who may edit the file.
--   * A new note on a file exported from the studio tells the project's owner and last editor, while they
--     still hold the studio's fixed rule (studio_can_for).
--   * studio_project_for_work: a project made already linked to a work the caller can see.
--   * studio_lease: a take-over tells the person who was editing.
--   * studio_request_source_access: a request for the folder of a file the project uses and the caller
--     cannot see, raised by the database without showing the folder to the caller.

-- ---------------------------------------------------------------------------
-- Notes
-- ---------------------------------------------------------------------------
create function public.media_note_area_ok(p jsonb) returns boolean
language sql immutable set search_path = ''
as $$
  select p is null or (
    jsonb_typeof(p) = 'object'
    and jsonb_typeof(p->'x') = 'number' and jsonb_typeof(p->'y') = 'number'
    and jsonb_typeof(p->'w') = 'number' and jsonb_typeof(p->'h') = 'number'
    and (p->>'x')::numeric between 0 and 1 and (p->>'y')::numeric between 0 and 1
    and (p->>'w')::numeric > 0 and (p->>'h')::numeric > 0
    and (p->>'x')::numeric + (p->>'w')::numeric <= 1.0001 and (p->>'y')::numeric + (p->>'h')::numeric <= 1.0001)
$$;

alter table public.media_notes
  add column version int check (version is null or version >= 1),
  add column at_ms int check (at_ms is null or at_ms >= 0),
  add column area jsonb check (public.media_note_area_ok(area)),
  add column parent_id uuid references public.media_notes(id) on delete cascade,
  add column done_at timestamptz,
  add column done_by text;
create index media_notes_parent_idx on public.media_notes (parent_id) where parent_id is not null;

-- A note (or a reply) on a file the caller can see.
create function public.media_note_add(p_asset uuid, p_body text, p_at_ms int, p_version int, p_area jsonb, p_parent uuid) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare me text := public.current_email(); nid uuid; tc text; par public.media_notes;
begin
  if coalesce(public.media_asset_level(p_asset), 0) < 1 then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if char_length(btrim(coalesce(p_body, ''))) not between 1 and 500 then raise exception 'NOTE_INVALID' using errcode = 'P0001'; end if;
  if p_at_ms is not null and p_at_ms < 0 then raise exception 'NOTE_INVALID' using errcode = 'P0001'; end if;
  if not public.media_note_area_ok(p_area) then raise exception 'NOTE_INVALID' using errcode = 'P0001'; end if;
  if p_version is not null and not exists (select 1 from public.media_versions v where v.asset_id = p_asset and v.version = p_version) then
    raise exception 'VERSION_INVALID' using errcode = 'P0001';
  end if;
  if p_parent is not null then
    select * into par from public.media_notes n where n.id = p_parent;
    if not found or par.asset_id <> p_asset or par.parent_id is not null then raise exception 'NOTE_INVALID' using errcode = 'P0001'; end if;
  end if;
  -- the minutes and seconds older readers show (mm:ss, up to 99:59)
  if p_at_ms is not null and p_at_ms < 6000000 then
    tc := lpad(((p_at_ms / 1000) / 60)::text, 2, '0') || ':' || lpad(((p_at_ms / 1000) % 60)::text, 2, '0');
  end if;
  insert into public.media_notes (asset_id, author, body, timecode, version, at_ms, area, parent_id)
  values (p_asset, me, btrim(p_body), tc, coalesce(p_version, par.version), p_at_ms, p_area, p_parent)
  returning id into nid;
  return nid;
end
$$;

-- «تم» on a note, or not: its author, a leader, or someone who may edit the file.
create function public.media_note_done(p_note uuid, p_done boolean) returns void
language plpgsql security definer set search_path = ''
as $$
declare me text := public.current_email(); n public.media_notes; fld uuid;
begin
  select * into n from public.media_notes where id = p_note;
  if not found or coalesce(public.media_asset_level(n.asset_id), 0) < 1 then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  select folder_id into fld from public.media_files where id = n.asset_id;
  if n.author is distinct from me and not public.work_lead() and not public.media_can_edit(fld) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  update public.media_notes
     set done_at = case when coalesce(p_done, false) then now() end,
         done_by = case when coalesce(p_done, false) then me end
   where id = p_note;
end
$$;

-- ---------------------------------------------------------------------------
-- Telling the studio
-- ---------------------------------------------------------------------------
-- Whether a person holds the studio's rule now: the fixed capability and the page, as studio_can does
-- for the caller.
create function public.studio_can_for(p_email text) returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((public.perm_eval(p_email, 'motion.studio', null)->>'ok')::boolean, false)
     and coalesce((public.perm_eval(p_email, 'page.motion', null)->>'ok')::boolean, false)
$$;

create function public.studio_note_notify() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare r record; v_name text;
begin
  select m.name into v_name from public.media_files m where m.id = new.asset_id;
  for r in
    select distinct p.id, p.title, x.email
      from public.studio_exports e
      join public.studio_projects p on p.id = e.project_id
      cross join lateral (values (p.owner), (p.updated_by)) as x(email)
     where e.asset_id = new.asset_id and p.archived_at is null
  loop
    if public.studio_can_for(r.email) then
      perform public.work_notify(r.email, 'attention',
        'ملاحظة جديدة على «' || coalesce(v_name, 'ملف') || '» من مشروع الاستوديو «' || r.title || '»'
          || case when new.timecode is not null then ' عند ' || new.timecode else '' end || '.',
        jsonb_build_object('page', 'studio', 'id', r.id));
    end if;
  end loop;
  return new;
end
$$;
create trigger media_notes_studio_notify_trg after insert on public.media_notes
  for each row execute function public.studio_note_notify();

-- The editing lease as before; taking it over now tells the person who was editing.
create or replace function public.studio_lease(p_project uuid, p_take boolean default false) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare me text := public.current_email(); p public.studio_projects; was_other boolean;
begin
  if not public.studio_can() then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  select * into p from public.studio_projects where id = p_project for update;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  if p.archived_at is not null then raise exception 'ARCHIVED' using errcode = 'P0001'; end if;
  was_other := p.lease_holder is not null and p.lease_holder <> me and p.lease_until >= now();
  if not was_other or coalesce(p_take, false) then
    update public.studio_projects set lease_holder = me, lease_until = now() + interval '90 seconds' where id = p_project;
    if was_other then
      perform public.work_notify(p.lease_holder, 'info',
        'تولّى ' || public.work_name(me) || ' تحرير مشروع الاستوديو «' || p.title || '»، فصار أمامك للقراءة، وتغييراتك غير المحفوظة باقية على جهازك.',
        jsonb_build_object('page', 'studio', 'id', p_project));
    end if;
    return jsonb_build_object('mine', true, 'holder', me, 'until', now() + interval '90 seconds', 'taken_from', case when was_other then p.lease_holder end);
  end if;
  return jsonb_build_object('mine', false, 'holder', p.lease_holder,
    'holder_name', (select a.display_name from public.accounts a where a.email = p.lease_holder), 'until', p.lease_until);
end
$$;

-- ---------------------------------------------------------------------------
-- Projects from works, and access to their files
-- ---------------------------------------------------------------------------
create function public.studio_project_for_work(p_work text, p_kind text, p_title text, p_doc jsonb) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare me text := public.current_email(); pid uuid;
begin
  if not public.studio_can() then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if p_work is null or not public.work_can_see(p_work) then raise exception 'WORK_DENIED' using errcode = 'P0001'; end if;
  if char_length(btrim(coalesce(p_title, ''))) not between 1 and 120 then raise exception 'TITLE_INVALID' using errcode = 'P0001'; end if;
  if p_kind not in ('video','photo') then raise exception 'DOC_INVALID' using errcode = 'P0001'; end if;
  perform public.studio_doc_check(p_doc, p_kind);
  perform public.studio_sources_ok(null, p_doc);
  insert into public.studio_projects (title, kind, owner, updated_by, revision, lease_holder, lease_until, work_ref)
  values (btrim(p_title), p_kind, me, me, 1, me, now() + interval '90 seconds', p_work)
  returning id into pid;
  insert into public.studio_revisions (project_id, revision, base, schema_version, doc, bytes, saved_by, note)
  values (pid, 1, 0, (p_doc->>'schema')::int, p_doc, octet_length(p_doc::text), me, left('للعمل ' || p_work, 200));
  perform public.studio_sources_record(pid, 1, p_doc);
  return pid;
end
$$;

-- «طلب الوصول» on a source the caller cannot see: the request names the file's folder for those who
-- decide, and the caller learns nothing of it.
create function public.studio_request_source_access(p_project uuid, p_asset uuid, p_reason text) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare fld uuid;
begin
  if not public.studio_can() then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.studio_sources s where s.project_id = p_project and s.asset_id = p_asset) then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if coalesce(public.media_asset_level(p_asset), 0) >= 1 then raise exception 'ALREADY_HAS_ACCESS' using errcode = 'P0001'; end if;
  select folder_id into fld from public.media_files where id = p_asset;
  if fld is null then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  return public.request_folder_access(fld, p_reason);
end
$$;

revoke all on function public.media_note_area_ok(jsonb) from public, anon;
revoke all on function public.media_note_add(uuid, text, int, int, jsonb, uuid) from public, anon;
revoke all on function public.media_note_done(uuid, boolean) from public, anon;
revoke all on function public.studio_can_for(text) from public, anon, authenticated;
revoke all on function public.studio_note_notify() from public, anon, authenticated;
revoke all on function public.studio_project_for_work(text, text, text, jsonb) from public, anon;
revoke all on function public.studio_request_source_access(uuid, uuid, text) from public, anon;
grant execute on function public.media_note_area_ok(jsonb) to authenticated;
grant execute on function public.media_note_add(uuid, text, int, int, jsonb, uuid) to authenticated;
grant execute on function public.media_note_done(uuid, boolean) to authenticated;
grant execute on function public.studio_project_for_work(text, text, text, jsonb) to authenticated;
grant execute on function public.studio_request_source_access(uuid, uuid, text) to authenticated;

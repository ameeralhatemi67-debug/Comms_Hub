-- The shared interaction kit (Reference_Build_Plan.md, Step 2): the help system's
-- progress per person, and undo of the library's edits.
--
-- Guide progress: which first-visit guides and section tips a person has seen, and
-- whether guides start by themselves. It follows the account, not the browser. It sits
-- in its own table, readable by its owner only (profiles are readable by everyone).
--
-- Undo: every library edit a person makes (rename, move, tags, title and description,
-- checklist, a stage move that is not a decision, folder name, lock and restriction,
-- folder access) is recorded as a step, with the values before and after and a
-- fingerprint of the row after. Steps of one request share its transaction id: that is
-- one action. undo_action() puts the values back only if nothing touched the rows since
-- (the fingerprint still matches), within an hour, and only for the person who made it.
-- The rights are checked again as the undo is applied, and the activity log records it.
-- Decisions (approve, request changes, reject), scheduling, publishing, uploads and
-- deletions are not undoable: decisions and deletions ask for a long press instead.

-- ---------------------------------------------------------------------------
-- Guide progress
-- ---------------------------------------------------------------------------
create table public.guide_progress (
  email text primary key,
  -- {"library": true, "library:tree": true, ...}: a page's first-visit guide, a part's tip
  seen jsonb not null default '{}'::jsonb check (jsonb_typeof(seen) = 'object'),
  auto boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.guide_progress enable row level security;
create policy guide_progress_read on public.guide_progress for select to authenticated
  using (email = (select public.current_email()));

-- op: seen (key), unseen_page (page: the page and its parts), reset, auto (key 'on' or 'off')
create function public.guide_update(p_op text, p_key text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare me text := public.current_email(); g public.guide_progress;
begin
  if me is null or not exists (select 1 from public.accounts a where a.email = me) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  if p_op in ('seen','unseen_page') and (p_key is null or p_key !~ '^[a-z][a-z0-9_-]{0,30}(:[a-z0-9_-]{1,30})?$') then
    raise exception 'GUIDE_KEY' using errcode = 'P0001';
  end if;
  insert into public.guide_progress (email) values (me) on conflict (email) do nothing;
  if p_op = 'seen' then
    update public.guide_progress set seen = seen || jsonb_build_object(p_key, true), updated_at = now() where email = me;
  elsif p_op = 'unseen_page' then
    update public.guide_progress set seen = (select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) from jsonb_each(seen) x(k, v)
        where k <> p_key and k not like p_key || ':%'), updated_at = now()
      where email = me;
  elsif p_op = 'reset' then
    update public.guide_progress set seen = '{}'::jsonb, updated_at = now() where email = me;
  elsif p_op = 'auto' and p_key in ('on','off') then
    update public.guide_progress set auto = (p_key = 'on'), updated_at = now() where email = me;
  else
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  select * into g from public.guide_progress where email = me;
  return jsonb_build_object('seen', g.seen, 'auto', g.auto);
end
$$;

-- ---------------------------------------------------------------------------
-- Undo steps
-- ---------------------------------------------------------------------------
create table public.undo_steps (
  id bigint generated always as identity primary key,
  tx bigint not null,
  actor text not null,
  at timestamptz not null default now(),
  tbl text not null check (tbl in ('media_files','media_folders','media_grants')),
  row_id uuid not null,
  op text not null check (op in ('update','insert','delete')),
  -- update: the changed columns before and after; insert: after is the row; delete: before is the row
  before jsonb,
  after jsonb,
  after_hash text,
  label text not null,
  used_at timestamptz
);
create index undo_steps_actor_idx on public.undo_steps (actor, at desc);
create index undo_steps_tx_idx on public.undo_steps (tx);
alter table public.undo_steps enable row level security;
create policy undo_steps_read on public.undo_steps for select to authenticated
  using (actor = (select public.current_email()));

create function public.undo_row_hash(p_tbl text, p_row uuid) returns text
language plpgsql stable security definer set search_path = ''
as $$
declare h text;
begin
  if p_tbl = 'media_files' then select md5(to_jsonb(x)::text) into h from public.media_files x where x.id = p_row;
  elsif p_tbl = 'media_folders' then select md5(to_jsonb(x)::text) into h from public.media_folders x where x.id = p_row;
  elsif p_tbl = 'media_grants' then select md5(to_jsonb(x)::text) into h from public.media_grants x where x.id = p_row;
  end if;
  return h;
end
$$;

-- Stage moves a maker makes on the board, which are not decisions.
create function public.undo_stage_ok(p_from text, p_to text) returns boolean
language sql immutable set search_path = ''
as $$ select p_from in ('draft','production','changes','rejected') and p_to in ('draft','production','review') $$;

create function public.undo_capture() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  me text := public.current_email(); b jsonb := '{}'::jsonb; a jsonb := '{}'::jsonb; lbl text; c text;
  o jsonb; n jsonb; cols text[]; fname text;
begin
  if me is null or current_setting('app.undo_internal', true) = '1' or current_setting('app.media_internal', true) = '1' then
    return coalesce(new, old);
  end if;

  if tg_table_name = 'media_grants' then
    fname := (select f.name from public.media_folders f where f.id = coalesce(new.folder_id, old.folder_id));
    lbl := 'صلاحيات ' || coalesce('«' || fname || '»', 'المكتبة');
    if tg_op = 'INSERT' then
      insert into public.undo_steps (tx, actor, tbl, row_id, op, after, after_hash, label)
      values (txid_current(), me, 'media_grants', new.id, 'insert', to_jsonb(new), md5(to_jsonb(new)::text), lbl);
    elsif tg_op = 'DELETE' then
      insert into public.undo_steps (tx, actor, tbl, row_id, op, before, label)
      values (txid_current(), me, 'media_grants', old.id, 'delete', to_jsonb(old), lbl);
    elsif new.level is distinct from old.level then
      insert into public.undo_steps (tx, actor, tbl, row_id, op, before, after, after_hash, label)
      values (txid_current(), me, 'media_grants', new.id, 'update', jsonb_build_object('level', old.level),
              jsonb_build_object('level', new.level), md5(to_jsonb(new)::text), lbl);
    end if;
    return coalesce(new, old);
  end if;

  o := to_jsonb(old); n := to_jsonb(new);
  if tg_table_name = 'media_files' then
    cols := array['name','folder_id','tags','copy','checklist','work_ref','channels','dims','duration'];
    -- A decision, scheduling or publishing is never undone, and neither is anything saved with it.
    if new.stage is distinct from old.stage and not public.undo_stage_ok(old.stage, new.stage) then return new; end if;
    if new.stage is distinct from old.stage then cols := cols || 'stage'::text; end if;
  else
    cols := array['name','locked','lock_reason','restricted'];
  end if;
  foreach c in array cols loop
    if o->c is distinct from n->c then
      b := b || jsonb_build_object(c, o->c);
      a := a || jsonb_build_object(c, n->c);
    end if;
  end loop;
  if a = '{}'::jsonb then return new; end if;

  if tg_table_name = 'media_files' then
    lbl := case
      when a ? 'name' then 'إعادة تسمية «' || old.name || '» إلى «' || new.name || '»'
      when a ? 'folder_id' then 'نقل «' || new.name || '» إلى «' || coalesce((select f.name from public.media_folders f where f.id = new.folder_id), '') || '»'
      when a ? 'stage' then 'نقل «' || new.name || '» إلى «' || case new.stage when 'draft' then 'مسودة' when 'production' then 'قيد الإنتاج' else 'قيد المراجعة' end || '»'
      when a ? 'tags' then 'وسوم «' || new.name || '»'
      when a ? 'copy' then 'العنوان والوصف لـ«' || new.name || '»'
      when a ? 'checklist' then 'قائمة الجاهزية لـ«' || new.name || '»'
      when a ? 'channels' then 'منصات «' || new.name || '»'
      else 'تفاصيل «' || new.name || '»' end;
  else
    lbl := case
      when a ? 'name' then 'إعادة تسمية مجلد «' || old.name || '» إلى «' || new.name || '»'
      when a ? 'locked' then case when new.locked then 'قفل «' else 'فتح قفل «' end || new.name || '»'
      when a ? 'restricted' then case when new.restricted then 'تقييد «' else 'إلغاء تقييد «' end || new.name || '»'
      else 'سبب قفل «' || new.name || '»' end;
  end if;
  insert into public.undo_steps (tx, actor, tbl, row_id, op, before, after, after_hash, label)
  values (txid_current(), me, tg_table_name, new.id, 'update', b, a, md5(n::text), lbl);
  return new;
end
$$;
create trigger media_files_undo after update on public.media_files
  for each row execute function public.undo_capture();
create trigger media_folders_undo after update on public.media_folders
  for each row execute function public.undo_capture();
create trigger media_grants_undo after insert or update or delete on public.media_grants
  for each row execute function public.undo_capture();

-- The caller's recent actions that can still be undone, newest first: one row per action.
create function public.undo_list() returns table (tx bigint, label text, n int, at timestamptz, ok boolean)
language sql stable security definer set search_path = ''
as $$
  select s.tx,
         (array_agg(s.label order by s.id))[1] || case when count(*) > 1 then ' و' || (count(*) - 1) || ' غيره' else '' end,
         count(*)::int, max(s.at),
         bool_and(case when s.op = 'delete' then public.undo_row_hash(s.tbl, s.row_id) is null
                       else public.undo_row_hash(s.tbl, s.row_id) is not distinct from s.after_hash end)
  from public.undo_steps s
  where s.actor = public.current_email() and s.used_at is null and s.at > now() - interval '1 hour'
  group by s.tx
  order by max(s.id) desc
  limit 15
$$;

-- Puts one action back. Returns the rows it restored, so the server can bring Google
-- Drive into step (names and folders), or refuses with UNDO_CHANGED when something
-- touched the rows since, and UNDO_GONE when the action is no longer available.
create function public.undo_apply(p_tx bigint, p_log boolean) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  me text := public.current_email(); s public.undo_steps; v_rows jsonb := '[]'::jsonb; lbl text; cnt int;
  r public.media_grants;
begin
  select count(*), (array_agg(label order by id))[1] into cnt, lbl from public.undo_steps
    where tx = p_tx and actor = me and used_at is null and at > now() - interval '1 hour';
  if me is null or cnt = 0 then raise exception 'UNDO_GONE' using errcode = 'P0001'; end if;
  for s in select * from public.undo_steps where tx = p_tx and actor = me order by id for update loop
    if (s.op = 'delete' and public.undo_row_hash(s.tbl, s.row_id) is not null)
       or (s.op <> 'delete' and public.undo_row_hash(s.tbl, s.row_id) is distinct from s.after_hash) then
      raise exception 'UNDO_CHANGED' using errcode = 'P0001';
    end if;
  end loop;

  perform set_config('app.undo_internal', '1', true);
  for s in select * from public.undo_steps where tx = p_tx and actor = me order by id desc loop
    if s.tbl = 'media_files' then
      -- A stage move goes back past the forward-only pipeline; everything else goes
      -- through the library's guard, so the person's rights are checked again now.
      if s.before ? 'stage' then
        perform set_config('app.media_internal', '1', true);
        update public.media_files set stage = s.before->>'stage' where id = s.row_id;
        perform set_config('app.media_internal', '0', true);
      end if;
      update public.media_files set
          name = case when s.before ? 'name' then s.before->>'name' else name end,
          folder_id = case when s.before ? 'folder_id' then (s.before->>'folder_id')::uuid else folder_id end,
          tags = case when s.before ? 'tags' then (select coalesce(array_agg(x), '{}') from jsonb_array_elements_text(s.before->'tags') x) else tags end,
          copy = case when s.before ? 'copy' then s.before->'copy' else copy end,
          checklist = case when s.before ? 'checklist' then s.before->'checklist' else checklist end,
          work_ref = case when s.before ? 'work_ref' then s.before->>'work_ref' else work_ref end,
          channels = case when s.before ? 'channels' then (select coalesce(array_agg(x), '{}') from jsonb_array_elements_text(s.before->'channels') x) else channels end,
          dims = case when s.before ? 'dims' then s.before->>'dims' else dims end,
          duration = case when s.before ? 'duration' then s.before->>'duration' else duration end
        where id = s.row_id;
    elsif s.tbl = 'media_folders' then
      update public.media_folders set
          name = case when s.before ? 'name' then s.before->>'name' else name end,
          locked = case when s.before ? 'locked' then (s.before->>'locked')::boolean else locked end,
          lock_reason = case when s.before ? 'lock_reason' then s.before->>'lock_reason' else lock_reason end,
          restricted = case when s.before ? 'restricted' then (s.before->>'restricted')::boolean else restricted end
        where id = s.row_id;
    else
      -- Folder access: the same "manage" right as changing it.
      select * into r from public.media_grants where id = s.row_id;
      if public.media_my_level(coalesce((s.before->>'folder_id')::uuid, (s.after->>'folder_id')::uuid, r.folder_id)) < 4 then
        raise exception 'FORBIDDEN' using errcode = 'P0001';
      end if;
      if s.op = 'insert' then
        delete from public.media_grants where id = s.row_id;
      elsif s.op = 'delete' then
        insert into public.media_grants (id, folder_id, subject_type, subject, level)
        values (s.row_id, (s.before->>'folder_id')::uuid, s.before->>'subject_type', s.before->>'subject', (s.before->>'level')::int);
      else
        update public.media_grants set level = (s.before->>'level')::int where id = s.row_id;
      end if;
    end if;
    v_rows := v_rows || jsonb_build_object('tbl', s.tbl, 'id', s.row_id, 'before', s.before, 'after', s.after);
  end loop;
  perform set_config('app.undo_internal', '0', true);
  update public.undo_steps set used_at = now() where tx = p_tx and actor = me;
  if p_log then
    perform public.media_log('undo', null, null, null, jsonb_build_object('label', lbl, 'steps', cnt));
  end if;
  return jsonb_build_object('label', lbl, 'rows', v_rows);
end
$$;

create function public.undo_action(p_tx bigint) returns jsonb
language sql security definer set search_path = ''
as $$ select public.undo_apply(p_tx, true) $$;

-- Google Drive refused a rename or a move that the database had already taken: put the
-- caller's latest action back and forget it. It is not an undo, so the log does not say
-- so; the log keeps both changes, as it keeps everything.
create function public.undo_cancel_last() returns void
language plpgsql security definer set search_path = ''
as $$
declare v_tx bigint;
begin
  select s.tx into v_tx from public.undo_steps s
    where s.actor = public.current_email() and s.used_at is null order by s.id desc limit 1;
  if v_tx is null then return; end if;
  perform public.undo_apply(v_tx, false);
  delete from public.undo_steps where tx = v_tx;
end
$$;

-- Drive refused to follow an undo: take the action forward again and offer it again.
create function public.undo_reapply(p_tx bigint) returns void
language plpgsql security definer set search_path = ''
as $$
declare s public.undo_steps; me text := public.current_email();
begin
  perform set_config('app.undo_internal', '1', true);
  for s in select * from public.undo_steps where tx = p_tx and actor = me and used_at > now() - interval '5 minutes' order by id loop
    if s.tbl = 'media_files' then
      update public.media_files set
          name = case when s.after ? 'name' then s.after->>'name' else name end,
          folder_id = case when s.after ? 'folder_id' then (s.after->>'folder_id')::uuid else folder_id end
        where id = s.row_id;
    elsif s.tbl = 'media_folders' then
      update public.media_folders set name = case when s.after ? 'name' then s.after->>'name' else name end where id = s.row_id;
    end if;
    update public.undo_steps set used_at = null,
        after_hash = case when s.op = 'delete' then null else public.undo_row_hash(s.tbl, s.row_id) end
      where id = s.id;
  end loop;
  perform set_config('app.undo_internal', '0', true);
end
$$;

revoke all on function public.undo_capture() from public, anon, authenticated;
revoke all on function public.undo_row_hash(text, uuid) from public, anon, authenticated;
revoke all on function public.undo_stage_ok(text, text) from public, anon, authenticated;
revoke all on function public.undo_apply(bigint, boolean) from public, anon, authenticated;
revoke all on function public.guide_update(text, text) from public, anon;
revoke all on function public.undo_list() from public, anon;
revoke all on function public.undo_action(bigint) from public, anon;
revoke all on function public.undo_cancel_last() from public, anon;
revoke all on function public.undo_reapply(bigint) from public, anon;
grant execute on function public.guide_update(text, text) to authenticated;
grant execute on function public.undo_list() to authenticated;
grant execute on function public.undo_action(bigint) to authenticated;
grant execute on function public.undo_cancel_last() to authenticated;
grant execute on function public.undo_reapply(bigint) to authenticated;

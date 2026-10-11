-- Task progress, and the assignee may no longer move their own deadline.
-- The person a task is assigned to reports progress (0 to 100) and marks it done.
-- What, when, how urgent and what kind stay with the person who assigned it and the
-- department's leadership (review finding of 2026-10-11).

alter table public.media_tasks
  add column progress int not null default 0 check (progress between 0 and 100);

create or replace function public.media_tasks_done_stamp() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.status = 'done' and old.status <> 'done' then
    new.done_at := now();
    new.progress := 100;
  end if;
  if new.what is distinct from old.what or new.assignee is distinct from old.assignee
     or new.assigned_by is distinct from old.assigned_by or new.asset_id is distinct from old.asset_id then
    raise exception 'IMMUTABLE_COLUMN' using errcode = 'P0001';
  end if;
  if (new.due is distinct from old.due or new.priority is distinct from old.priority
      or new.kind is distinct from old.kind or new.note is distinct from old.note)
     and not (old.assigned_by = public.current_email() or public.media_acts(array['director','assistant'])) then
    raise exception 'TASK_TERMS_LOCKED' using errcode = 'P0001';
  end if;
  return new;
end
$$;
revoke all on function public.media_tasks_done_stamp() from public, anon, authenticated;

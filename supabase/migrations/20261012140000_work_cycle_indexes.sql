-- Indexes for the foreign keys of the work cycle, after the Supabase performance advisor
-- of 2026-10-12 (unindexed_foreign_keys). The older tables' findings are left as they were.
create index events_project_idx on public.events (project_id);
create index media_tasks_project_idx on public.media_tasks (project_id);
create index media_tasks_work_idx on public.media_tasks (work_id);
create index work_projects_project_idx on public.work_projects (project_id);
create index work_requests_folder_idx on public.work_requests (folder_id);
create index work_requests_stage_idx on public.work_requests (stage_id);
create index work_requests_task_idx on public.work_requests (task_id);

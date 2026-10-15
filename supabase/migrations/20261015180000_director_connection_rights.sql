-- Owner decision of 2026-10-15 (after Action_Plan.md B8): the Director connects the department's
-- platforms and mail from the site, so the Director holds, by default, the rights that enter an
-- app's id and secret, connect accounts and see the settings pages. The assistant does not;
-- the administrator already holds everything and keeps it.
--
--   settings.view         opens «الإعدادات» (the page opens with this or settings.manage)
--   settings.manage       the general settings, and the mail account's credentials
--   platforms.manage      the platforms and their apps (Meta, TikTok, Google, LinkedIn, X)
--   integrations.secrets  entering and renewing a secret (written once, never shown again)
--   storage.manage        connecting a storage provider, Google Drive included
--
-- Not given: storage.migrate, backups.run, backups.restore (the administrator's technical rights),
-- and nothing about approval or publishing, which stay fixed.

with wanted(capability) as (values
  ('settings.view'), ('settings.manage'), ('platforms.manage'), ('integrations.secrets'), ('storage.manage')),
changed as (
  update public.role_capabilities rc set allowed = true, updated_by = 'Action_Plan.md B9', updated_at = now()
  from wanted w
  where rc.role = 'director' and rc.capability = w.capability and not rc.allowed
  returning rc.role, rc.capability)
insert into public.permission_events (actor, subject, role, capability, kind, data)
select null, null, c.role, c.capability, 'role_default',
  jsonb_build_object('allowed', true, 'people', (select count(*) from public.accounts a where a.role = c.role),
                     'reason', 'Owner decision 2026-10-15: the Director connects the platforms, the mail and the storage from the site')
from changed c;

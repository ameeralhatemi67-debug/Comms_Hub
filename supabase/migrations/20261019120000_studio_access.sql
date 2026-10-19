-- The studio of «استوديو الحركة» (Studio_Build_Plan.md, MVP_draft.md section 62), Phase 1: who may
-- open it. Owner decision of 2026-10-19: the Admin and the director only.
--
--   * A fixed capability: perm_eval answers it from the role alone, before any template, override,
--     timed or one-time grant, so no grant row can change it; grant_capability, set_member_override,
--     set_role_default, preset_save and request_capability refuse it (CAP_FIXED). Fixed capabilities
--     have no role_capabilities rows. It appears in my_capabilities(), so in session.account.caps.
--   * studio_can() is the one check every studio record and function uses (Phase 2): the studio
--     capability and the page of «استوديو الحركة» together, so removing that page from a director
--     removes the studio as well, as the server's page check does (canOpenRoute in src/lib/access.ts).

insert into public.capabilities (key, grp, label_ar, grantable, scope_kind, min_rank, fixed_roles, why_ar, sort) values
  ('motion.studio',    'fixed', 'الاستوديو في «استوديو الحركة»',          false, 'none', 3, '{admin,director}',
     'الاستوديو لمسؤول النظام ومدير الاتصال المؤسسي فقط، بقرار المالك في 2026-10-19.', 66);

create function public.studio_can() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.has_capability('motion.studio') and public.has_capability('page.motion');
$$;
comment on function public.studio_can() is 'The studio (MVP_draft.md 62): the fixed capability motion.studio (admin, director) and the page of «استوديو الحركة».';

revoke all on function public.studio_can() from public, anon;
grant execute on function public.studio_can() to authenticated;

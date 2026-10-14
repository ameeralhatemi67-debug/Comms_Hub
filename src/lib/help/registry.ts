// Which help page a route is, who a role counts as in the page guide, and where a page
// lives. The content is in ./pages.ts.
import type { Role } from '../domain.ts';
import { PAGES, SHELL_PARTS } from './pages.ts';
import type { HelpPage, RoleGroup } from './types.ts';

export { PAGES, SHELL_PARTS };

/** The page a path belongs to, or null where no guide is written yet. */
export function pageKeyOf(path: string): string | null {
  const p = path.replace(/\/+$/, '') || '/';
  if (p === '/media') return 'library';
  if (/^\/media\/[^/]+$/.test(p)) return 'asset';
  if (p === '/tasks') return 'tasks';
  if (p === '/activity') return 'activity';
  if (p === '/mail') return 'mail';
  if (p === '/mail/chat') return 'chat';
  if (p === '/work') return 'work';
  if (/^\/work\/[^/]+$/.test(p)) return 'item';
  if (p === '/create') return 'create';
  if (p === '/approvals') return 'approvals';
  if (/^\/approvals\/[^/]+$/.test(p)) return 'review';
  if (p === '/channels') return 'channels';
  if (p === '/calendar') return 'calendar';
  if (p === '/projects') return 'projects';
  if (/^\/projects\/[^/]+$/.test(p)) return 'project';
  if (p === '/requests') return 'requests';
  if (p === '/') return 'home';
  if (p === '/accounts') return 'accounts';
  if (p === '/account') return 'account';
  if (p === '/settings') return 'settings';
  return null;
}

/** Where a linked page opens. The file page needs a file, so it opens the library; a work page opens «العمل». */
export const PAGE_HREF: Record<string, string> = {
  library: '/media',
  asset: '/media',
  tasks: '/tasks',
  activity: '/activity',
  mail: '/mail',
  chat: '/mail/chat',
  work: '/work',
  item: '/work',
  create: '/create',
  approvals: '/approvals',
  review: '/approvals',
  channels: '/channels',
  calendar: '/calendar',
  projects: '/projects',
  project: '/projects',
  requests: '/requests',
  accounts: '/accounts',
  account: '/account',
  settings: '/settings',
  home: '/',
};

export const ROLE_GROUP: Record<RoleGroup, string> = {
  lead: 'مدير الاتصال المؤسسي ومساعده والمسؤول عن النظام',
  maker: 'كاتب المحتوى والمصمم والمنتج الإعلامي',
  publisher: 'مسؤول النشر وإدارة الحسابات',
  member: 'العضو',
};

export function roleGroup(r: Role): RoleGroup {
  if (r === 'admin' || r === 'director' || r === 'assistant') return 'lead';
  if (r === 'publisher') return 'publisher';
  if (r === 'member') return 'member';
  return 'maker';
}

export const helpFor = (key: string | null): HelpPage | null => (key && PAGES[key]) || null;

/** The components each page is drawn by: tests/kit.test.mjs checks the selectors against them. */
export const PAGE_SOURCES: Record<string, string[]> = {
  library: ['src/components/media/library.tsx', 'src/components/media/parts.tsx'],
  asset: ['src/components/media/asset-page.tsx', 'src/components/media/parts.tsx'],
  tasks: ['src/components/media/tasks-page.tsx'],
  activity: ['src/components/media/activity-page.tsx'],
  mail: ['src/components/mail/mail-page.tsx', 'src/components/mail/thread.tsx', 'src/components/mail/parts.tsx', 'src/components/mail/composer.tsx'],
  chat: ['src/components/chat/chat-tab.tsx', 'src/components/chat/urgency.tsx', 'src/components/chat/whatsapp.tsx', 'src/components/mail/mail-page.tsx'],
  work: ['src/components/work/list.tsx', 'src/components/work/parts.tsx'],
  item: ['src/components/work/item.tsx', 'src/components/work/plan.tsx', 'src/components/work/publish.tsx', 'src/components/work/parts.tsx'],
  create: ['src/components/work/create.tsx', 'src/components/work/plan.tsx', 'src/components/work/parts.tsx'],
  approvals: ['src/components/work/approvals.tsx', 'src/components/work/publish.tsx', 'src/components/work/parts.tsx'],
  review: ['src/components/work/review.tsx', 'src/components/work/parts.tsx'],
  channels: ['src/components/work/channels.tsx', 'src/components/work/parts.tsx'],
  calendar: ['src/components/work/calendar.tsx', 'src/components/work/day-dialogs.tsx', 'src/components/work/parts.tsx'],
  projects: ['src/components/work/projects.tsx', 'src/components/work/parts.tsx'],
  project: ['src/components/work/projects.tsx', 'src/components/work/list.tsx', 'src/components/work/day-dialogs.tsx', 'src/components/work/parts.tsx'],
  requests: ['src/components/work/requests.tsx', 'src/components/work/day-dialogs.tsx', 'src/components/work/parts.tsx', 'src/components/perm-requests.tsx'],
  accounts: ['src/components/accounts/page.tsx', 'src/components/accounts/members.tsx', 'src/components/accounts/card.tsx', 'src/components/accounts/roles.tsx', 'src/components/accounts/log.tsx', 'src/components/perm-requests.tsx'],
  account: ['src/components/supporting.tsx', 'src/components/profile-editor.tsx', 'src/components/my-permissions.tsx', 'src/components/whatsapp/member.tsx'],
  settings: ['src/components/supporting.tsx', 'src/components/whatsapp/system-panel.tsx'],
  home: ['src/components/home.tsx', 'src/components/home-perms.tsx', 'src/components/work/parts.tsx'],
};
export const SHARED_SOURCES = ['src/components/ui.tsx', 'src/components/shell.tsx', 'src/components/kit.tsx'];

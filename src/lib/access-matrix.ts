// Who sees which page, by role (Action_Plan.md B4): the menu and the pages a new account of each role
// starts with, computed from the same rules the shell and the page guard run (access.ts, the
// capability templates in permissions.ts). Pure, so tests/access-matrix.test.mjs can hold it to a
// written expectation and qa/access-matrix.mjs can save it as JSON and as the table in MVP_draft.md.
// What it describes is the default: an account's own page list and its grants change it, and the
// database decides every use (has_capability, use_capability).
import { roles, type Role } from './domain.ts';
import { canOpen, defaultPages, linkedAccountRoles, menuEntries, menuFor, type Account } from './access.ts';
import { CAPABILITIES, installedDefault, resolve } from './permissions.ts';
import { logAllRoles } from './media/rules.ts';

/** Administrator first, then the department's roles in the order the product lists them. */
export const MATRIX_ROLES: Role[] = ['admin', 'director', 'assistant', 'writer', 'designer', 'producer', 'publisher', 'member'];

/** Every route's first segment, and how it is reached. */
export const MATRIX_ROUTES: { id: string; label: string; how: 'menu' | 'badge' | 'direct' | 'redirect'; note?: string }[] = [
  ...menuEntries.map((e) => ({ id: e.href === '/' ? '' : e.href.slice(1), label: e.label, how: 'menu' as const })),
  { id: 'account', label: 'الحساب', how: 'badge', note: 'من اسمك أسفل القائمة' },
  { id: 'analytics', label: 'التحليلات', how: 'direct', note: 'خارج القائمة حتى تقرأ بياناً حقيقياً' },
  { id: 'monitoring', label: 'المراقبة', how: 'redirect', note: 'يفتح «سجل النشاط»' },
  { id: 'admin', label: 'الإدارة', how: 'redirect', note: 'يفتح «الحسابات»' },
];

export type MatrixRole = {
  role: Role;
  name: string;
  /** The pages a new account of this role starts with (defaultPages). */
  pages: string[];
  /** The non-page capabilities held by default (the installed templates and the fixed rules). */
  caps: string[];
  /** The sidebar of an account of this role viewing as itself. */
  menu: string[];
  /** The routes it may open by address. */
  open: string[];
  /** What it sees inside «سجل النشاط»: the whole log and the team panel, or its own actions. */
  activity: 'whole' | 'own';
};

export type AccessMatrix = {
  roles: MatrixRole[];
  routes: typeof MATRIX_ROUTES;
  /** An administrator's sidebar when viewing as each role («عرض بصفة»). */
  adminViewAs: Record<string, string[]>;
  capabilities: { key: string; label: string; heldBy: Role[] }[];
};

const homeId = (href: string) => (href === '/' ? '' : href.slice(1));

export function accessMatrix(): AccessMatrix {
  const capKeys = CAPABILITIES.filter((c) => c.scope !== 'page');
  const held = (role: Role, key: string) =>
    resolve({ role, pages: [], templates: installedDefault, grants: [] }, key, 0).ok;

  const rolesOut: MatrixRole[] = MATRIX_ROLES.map((role) => {
    const caps = capKeys.filter((c) => held(role, c.key)).map((c) => c.key);
    const account: Pick<Account, 'role' | 'pages' | 'caps'> = { role, pages: defaultPages(role), caps };
    return {
      role,
      name: roles[role].name,
      pages: account.pages,
      caps,
      menu: menuFor(account, { viewAs: role }).map((e) => homeId(e.href)),
      open: MATRIX_ROUTES.map((r) => r.id).filter((id) => canOpen(account, id) && !['monitoring', 'admin'].includes(id)),
      activity: role === 'admin' || logAllRoles.includes(role) ? 'whole' : 'own',
    };
  });

  const admin: Pick<Account, 'role' | 'pages' | 'caps'> = { role: 'admin', pages: [], caps: [] };
  const adminViewAs = Object.fromEntries(
    MATRIX_ROLES.map((r) => [r, menuFor(admin, { viewAs: r }).map((e) => homeId(e.href))]),
  );

  return {
    roles: rolesOut,
    routes: MATRIX_ROUTES,
    adminViewAs,
    capabilities: capKeys.map((c) => ({ key: c.key, label: c.label, heldBy: MATRIX_ROLES.filter((r) => held(r, c.key)) })),
  };
}

/** The platform-accounts page is for these roles, with «الموافقات والنشر» (`linkedAccountRoles`). */
export const platformAccountRoles = linkedAccountRoles;

/** The matrix as a markdown table for MVP_draft.md: routes down, roles across. */
export function matrixMarkdown(m: AccessMatrix = accessMatrix()): string {
  const head = ['الصفحة', ...m.roles.map((r) => r.name), 'كيف تُفتح'];
  const lines = [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`];
  for (const route of m.routes) {
    const cells = m.roles.map((r) => {
      if (route.how === 'redirect') return '-';
      const open = r.open.includes(route.id);
      const inMenu = r.menu.includes(route.id);
      return open ? (inMenu || route.how === 'badge' ? 'نعم' : 'بالعنوان') : 'لا';
    });
    const how = route.how === 'menu' ? 'القائمة' : route.how === 'badge' ? 'الاسم أسفل القائمة' : (route.note ?? '');
    lines.push(`| ${route.label} | ${cells.join(' | ')} | ${how} |`);
  }
  return lines.join('\n');
}

// Who may open what. Pure rules, shared by the server (layout and page), the shell
// and the accounts page, and covered by tests/access.test.mjs.
//
// An account has one role and a list of pages.
//   - The role says what the person may DO. It decides create, review and publish
//     through the same table the whole product already uses (roles in domain.ts), and
//     the domain reducer enforces it.
//   - The pages say where the person may GO. Home and Account are always open.
//   - Admin is the system authority. It opens every page and alone may switch the
//     role it views the product as. It is held by the founding administrators only.
import { roles, type Role } from './domain.ts';

/** Pages an administrator can grant or withhold, in navigation order. */
export const grantablePages = [
  { id: 'work', label: 'العمل' },
  { id: 'create', label: 'إنشاء' },
  { id: 'approvals', label: 'الموافقات والنشر' },
  { id: 'calendar', label: 'التقويم' },
  { id: 'media', label: 'مكتبة الوسائط' },
  { id: 'tasks', label: 'المهام' },
  { id: 'activity', label: 'سجل النشاط' },
  { id: 'motion', label: 'استوديو الحركة' },
  { id: 'mail', label: 'البريد' },
  { id: 'ideas', label: 'الأفكار' },
  { id: 'analytics', label: 'التحليلات' },
  { id: 'settings', label: 'الإعدادات' },
] as const;

export type GrantablePage = (typeof grantablePages)[number]['id'];

const grantable = new Set<string>(grantablePages.map((p) => p.id));

/** Open to every signed-in person. */
const alwaysOpen = new Set(['', 'account']);

/** The roles that open «حسابات المنصات» (/channels), with the «الموافقات والنشر» page. */
export const linkedAccountRoles: Role[] = ['director', 'assistant', 'publisher'];

/** The grants that open «المشاريع» (/projects) and «الطلبات» (/requests). */
export const projectPageGrants = ['work', 'calendar'] as const;
export const requestPageGrants = ['work', 'media', 'tasks'] as const;

/** Open to administrators only. Anything not listed anywhere is treated the same way. */
export const adminOnlyPages = ['admin', 'accounts'] as const;

/**
 * «الحسابات» opens with the capability «فتح صفحة الحسابات» (Permissions_Plan.md 5), which
 * the database resolves (has_capability). Installed for administrators only, as before.
 */
export const ACCOUNTS_CAP = 'accounts.view';

/** Holding either of these opens «الإعدادات» without the page grant (its tabs still ask their own). */
export const SETTINGS_CAPS = ['settings.view', 'settings.manage'] as const;

/**
 * «الاستوديو», the studio tab of «استوديو الحركة» at /motion/studio (MVP_draft.md 62): a fixed
 * capability, the Admin's and the director's by the owner's decision of 2026-10-19. The database
 * checks the same pair as canOpenStudio (studio_can(): this capability and the motion page).
 */
export const STUDIO_CAP = 'motion.studio';
/** The roles the studio is fixed to; an administrator viewing as one of them sees its tab. */
export const studioRoles: readonly Role[] = ['admin', 'director'];

export type Account = {
  email: string;
  name: string;
  role: Role;
  pages: string[];
  /** A founding administrator: cannot be removed or demoted from the app. */
  protected: boolean;
  /**
   * The capabilities this person holds now (my_capabilities() in the database), pages
   * excluded: those are in `pages`, which also carries temporary page grants.
   */
  caps?: string[];
};

/** Roles an administrator may give to another person. 'admin' is never among them. */
export const assignableRoles = (Object.keys(roles) as Role[]).filter((r) => r !== 'admin');

/** Keeps only known, grantable page ids, once each, in navigation order. */
export function sanitizePages(pages: readonly string[] | null | undefined): GrantablePage[] {
  const wanted = new Set(pages ?? []);
  return grantablePages.filter((p) => wanted.has(p.id)).map((p) => p.id);
}

/**
 * The pages a new account of this role starts with: everything the role can use, except
 * «الإعدادات», which is the administrator's (Action_Plan.md B4b): another person opens it with the
 * page grant or by holding «settings.view» or «settings.manage» (SETTINGS_CAPS).
 */
export function defaultPages(role: Role): GrantablePage[] {
  return grantablePages
    .filter((p) => (p.id !== 'create' || roles[role].create) && (p.id !== 'settings' || role === 'admin'))
    .map((p) => p.id);
}

export const isAdmin = (account: Pick<Account, 'role'>) => account.role === 'admin';

/**
 * May this person open the page whose first path segment is `page`
 * ('' for Home, 'work' for /work and /work/CH-241, and so on)?
 */
export function canOpen(account: Pick<Account, 'role' | 'pages' | 'caps'>, page: string): boolean {
  if (isAdmin(account)) return true;
  if (alwaysOpen.has(page)) return true;
  if (page === 'accounts') return !!account.caps?.includes(ACCOUNTS_CAP);
  if (page === 'settings') return account.pages.includes('settings') || SETTINGS_CAPS.some((c) => account.caps?.includes(c));
  // «حسابات المنصات» goes with «الموافقات والنشر», for the roles that manage the
  // accounts (director, assistant) or publish on them (publisher).
  if (page === 'channels') return linkedAccountRoles.includes(account.role) && account.pages.includes('approvals');
  // «المشاريع» and «الطلبات» (Step 5) are not granted on their own, so existing accounts need no
  // change: projects go with «العمل» or «التقويم», whose works and dates they gather; requests go
  // with «العمل», «مكتبة الوسائط» or «المهام», where extensions and folder access are asked for.
  if (page === 'projects') return projectPageGrants.some((p) => account.pages.includes(p));
  if (page === 'requests') return requestPageGrants.some((p) => account.pages.includes(p));
  if (!grantable.has(page)) return false;
  // Creating is also a role ability; a page grant cannot give it to a role that lacks it.
  if (page === 'create' && !roles[account.role].create) return false;
  return account.pages.includes(page);
}

/** May this person open the studio? The motion page and the studio capability, as studio_can() decides. */
export function canOpenStudio(account: Pick<Account, 'role' | 'pages' | 'caps'>): boolean {
  return canOpen(account, 'motion') && (isAdmin(account) || !!account.caps?.includes(STUDIO_CAP));
}

/**
 * May this person open the address whose segments are `slug` (['work', 'CH-241'], [] for Home)?
 * The page of its first segment (canOpen), and for /motion/studio the studio's own rule: the
 * first segment alone would open the studio to everyone who opens «استوديو الحركة».
 */
export function canOpenRoute(account: Pick<Account, 'role' | 'pages' | 'caps'>, slug: readonly string[]): boolean {
  const [page = '', sub] = slug;
  if (!canOpen(account, page)) return false;
  if (page === 'motion' && sub === 'studio') return canOpenStudio(account);
  return true;
}

/**
 * Does «استوديو الحركة» show its tab bar («قوالب الحركة»، «الاستوديو»)? For those who may open the
 * studio. An administrator viewing as another role sees it only as the Admin or the director, as
 * «الحسابات» follows the viewed role in the menu; the address still opens for the administrator.
 * `hasCap` reads the capability live (useCaps); without it, the account's own list is used.
 */
export function studioTabVisible(
  account: Pick<Account, 'role' | 'pages' | 'caps'>,
  opts: { viewAs?: Role; hasCap?: (key: string) => boolean } = {},
): boolean {
  if (isAdmin(account)) return studioRoles.includes(opts.viewAs ?? account.role);
  const hasCap = opts.hasCap ?? ((k: string) => !!account.caps?.includes(k));
  return canOpen(account, 'motion') && hasCap(STUDIO_CAP);
}

/**
 * The sidebar, in order: where each entry goes and what it is called. The one list the shell draws
 * from (icons are the shell's) and the access table is generated from (Action_Plan.md B4,
 * `src/lib/access-matrix.ts`). «الحساب» is not in it: it is reached from the name badge.
 */
export const menuEntries = [
  { href: '/', label: 'الرئيسية' },
  { href: '/work', label: 'العمل' },
  { href: '/create', label: 'إنشاء' },
  { href: '/approvals', label: 'الموافقات والنشر' },
  { href: '/calendar', label: 'التقويم' },
  { href: '/projects', label: 'المشاريع' },
  { href: '/requests', label: 'الطلبات' },
  { href: '/media', label: 'مكتبة الوسائط' },
  { href: '/tasks', label: 'المهام' },
  { href: '/activity', label: 'سجل النشاط' },
  { href: '/analytics', label: 'التحليلات' },
  { href: '/motion', label: 'استوديو الحركة' },
  { href: '/mail', label: 'البريد' },
  { href: '/channels', label: 'حسابات المنصات' },
  { href: '/ideas', label: 'الأفكار' },
  { href: '/accounts', label: 'الحسابات' },
  { href: '/settings', label: 'الإعدادات' },
] as const;

export type MenuHref = (typeof menuEntries)[number]['href'];

/**
 * The entries the sidebar offers this person: the pages their account may open (canOpen), and only
 * what the role being viewed can use. Administrators open every page and alone choose the role they
 * view as (`viewAs`); everyone else views as their own role. «الحسابات» follows the capability
 * «فتح صفحة الحسابات», which the caller reads live (`hasCap`); an administrator viewing as another
 * role sees it as that role's leaders do.
 */
export function menuFor(
  account: Pick<Account, 'role' | 'pages' | 'caps'>,
  opts: { viewAs?: Role; hasCap?: (key: string) => boolean } = {},
): (typeof menuEntries)[number][] {
  const viewAs = opts.viewAs ?? account.role;
  const hasCap = opts.hasCap ?? ((k: string) => !!account.caps?.includes(k));
  const accountsOpen = isAdmin(account) ? roles[viewAs].admin || viewAs === 'director' || viewAs === 'assistant' : hasCap(ACCOUNTS_CAP);
  return menuEntries.filter(
    (e) =>
      (e.href === '/accounts'
        ? accountsOpen
        : e.href === '/settings'
          ? canOpen(account, 'settings') || SETTINGS_CAPS.some((c) => hasCap(c))
          : canOpen(account, e.href.slice(1))) &&
      (e.href !== '/create' || roles[viewAs].create),
  );
}

/** Only an administrator may switch the role the product is viewed as. */
export const canSwitchRole = (account: Pick<Account, 'role'>) => isAdmin(account);

/** The page id of a pathname such as '/work/CH-241'. */
export function pageOf(pathname: string): string {
  return pathname.split('/').filter(Boolean)[0] ?? '';
}

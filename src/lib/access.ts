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
  { id: 'monitoring', label: 'المراقبة' },
  { id: 'settings', label: 'الإعدادات' },
] as const;

export type GrantablePage = (typeof grantablePages)[number]['id'];

const grantable = new Set<string>(grantablePages.map((p) => p.id));

/** Open to every signed-in person. */
const alwaysOpen = new Set(['', 'account']);

/** The roles that open «الحسابات المرتبطة» (/channels), with the «الموافقات والنشر» page. */
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

/** The pages a new account of this role starts with: everything the role can use. */
export function defaultPages(role: Role): GrantablePage[] {
  return grantablePages.filter((p) => p.id !== 'create' || roles[role].create).map((p) => p.id);
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
  // «الحسابات المرتبطة» goes with «الموافقات والنشر», for the roles that manage the
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

/** Only an administrator may switch the role the product is viewed as. */
export const canSwitchRole = (account: Pick<Account, 'role'>) => isAdmin(account);

/** The page id of a pathname such as '/work/CH-241'. */
export function pageOf(pathname: string): string {
  return pathname.split('/').filter(Boolean)[0] ?? '';
}

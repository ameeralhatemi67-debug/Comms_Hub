// The permission catalog and the rules the interface needs to explain itself
// (Permissions_Plan.md). The database decides every grant and every use
// (supabase/migrations/*permissions*: has_capability, use_capability); this file only
// mirrors it, so a page can show where a permission comes from and why a control is
// locked. tests/permissions.test.mjs keeps the catalog equal to the seeded table and the
// resolution equal to perm_eval.
import type { Role } from './domain.ts';

export type CapGroup = 'pages' | 'messaging' | 'accounts' | 'settings' | 'fixed';
export type ScopeKind = 'none' | 'page' | 'room' | 'work' | 'folder';
export type Capability = {
  key: string;
  grp: CapGroup;
  label: string;
  grantable: boolean;
  scope: ScopeKind;
  minRank: number;
  /** For a capability fixed by the reference or by an owner decision: the roles that hold it. */
  fixedRoles: Role[];
  /** For a fixed capability: why it cannot be granted. */
  why?: string;
  sort: number;
};

const page = (id: string, label: string, sort: number): Capability => ({
  key: `page.${id}`,
  grp: 'pages',
  label: `صفحة «${label}»`,
  grantable: true,
  scope: 'page',
  minRank: 1,
  fixedRoles: [],
  sort,
});

export const CAPABILITIES: Capability[] = [
  page('work', 'العمل', 10),
  page('create', 'إنشاء', 11),
  page('approvals', 'الموافقات والنشر', 12),
  page('calendar', 'التقويم', 13),
  page('media', 'مكتبة الوسائط', 14),
  page('tasks', 'المهام', 15),
  page('activity', 'سجل النشاط', 16),
  page('motion', 'استوديو الحركة', 17),
  page('mail', 'البريد', 18),
  page('ideas', 'الأفكار', 19),
  page('analytics', 'التحليلات', 20),
  page('settings', 'الإعدادات', 22),
  { key: 'urgency.2', grp: 'messaging', label: 'رسائل «مهم» (المستوى 2)', grantable: true, scope: 'none', minRank: 1, fixedRoles: [], sort: 30 },
  {
    key: 'urgency.3', grp: 'messaging', label: 'رسائل «عاجل» (المستوى 3)', grantable: false, scope: 'none', minRank: 2,
    fixedRoles: ['admin', 'director', 'assistant'],
    why: 'المستوى الأعلى لمدير الاتصال ومساعده ومسؤول النظام فقط، حتى يبقى العاجل نادراً.', sort: 31,
  },
  { key: 'whatsapp.push', grp: 'messaging', label: 'إرسال رسالة إلى واتساب زميل', grantable: true, scope: 'room', minRank: 1, fixedRoles: [], sort: 32 },
  { key: 'mail.outside.send', grp: 'messaging', label: 'بريد خارجي دون انتظار الاعتماد', grantable: true, scope: 'none', minRank: 1, fixedRoles: [], sort: 33 },
  { key: 'room.create', grp: 'messaging', label: 'إنشاء قناة إعلانات في المراسلة', grantable: true, scope: 'none', minRank: 1, fixedRoles: [], sort: 34 },
  { key: 'accounts.view', grp: 'accounts', label: 'فتح صفحة «الحسابات»', grantable: true, scope: 'none', minRank: 1, fixedRoles: [], sort: 40 },
  { key: 'permissions.grant', grp: 'accounts', label: 'منح الصلاحيات وسحبها', grantable: true, scope: 'none', minRank: 2, fixedRoles: [], sort: 41 },
  { key: 'roles.assign', grp: 'accounts', label: 'تغيير دور عضو', grantable: true, scope: 'none', minRank: 2, fixedRoles: [], sort: 42 },
  { key: 'members.invite', grp: 'accounts', label: 'إضافة الأعضاء وقبول طلبات الوصول', grantable: true, scope: 'none', minRank: 2, fixedRoles: [], sort: 43 },
  { key: 'members.remove', grp: 'accounts', label: 'إزالة عضو', grantable: true, scope: 'none', minRank: 2, fixedRoles: [], sort: 44 },
  { key: 'roles.templates.edit', grp: 'accounts', label: 'تعديل صلاحيات الأدوار', grantable: true, scope: 'none', minRank: 2, fixedRoles: [], sort: 45 },
  { key: 'whatsapp.system.manage', grp: 'accounts', label: 'إدارة رقم واتساب النظام', grantable: true, scope: 'none', minRank: 2, fixedRoles: [], sort: 46 },
  // Settings and integrations (Settings_Integrations_Plan.md 4.3), the administrator's by default.
  { key: 'settings.view', grp: 'settings', label: 'عرض صحة النظام وسجل الإعدادات', grantable: true, scope: 'none', minRank: 2, fixedRoles: [], sort: 50 },
  { key: 'settings.manage', grp: 'settings', label: 'تعديل الإعدادات العامة للنظام', grantable: true, scope: 'none', minRank: 2, fixedRoles: [], sort: 51 },
  { key: 'storage.manage', grp: 'settings', label: 'إدارة مزودي التخزين', grantable: true, scope: 'none', minRank: 2, fixedRoles: [], sort: 52 },
  { key: 'storage.migrate', grp: 'settings', label: 'نقل الملفات بين مزودي التخزين', grantable: true, scope: 'none', minRank: 2, fixedRoles: [], sort: 53 },
  { key: 'backups.run', grp: 'settings', label: 'تشغيل النسخ الاحتياطي', grantable: true, scope: 'none', minRank: 2, fixedRoles: [], sort: 54 },
  { key: 'backups.restore', grp: 'settings', label: 'استعادة ملفات من نسخة احتياطية', grantable: true, scope: 'none', minRank: 2, fixedRoles: [], sort: 55 },
  { key: 'platforms.manage', grp: 'settings', label: 'إدارة المنصات وتطبيقاتها', grantable: true, scope: 'none', minRank: 2, fixedRoles: [], sort: 56 },
  { key: 'integrations.secrets', grp: 'settings', label: 'إدخال أسرار التكاملات وتجديدها', grantable: true, scope: 'none', minRank: 2, fixedRoles: [], sort: 57 },
  {
    key: 'work.approve', grp: 'fixed', label: 'اعتماد جزء من عمل أو رفضه', grantable: false, scope: 'none', minRank: 2,
    fixedRoles: ['admin', 'director', 'assistant'],
    why: 'الاعتماد لمدير الاتصال ومساعده كما قرر المالك، وتفويضه ميزة لاحقة لها ضوابطها.', sort: 60,
  },
  {
    key: 'work.publish', grp: 'fixed', label: 'النشر والجدولة', grantable: false, scope: 'none', minRank: 1,
    fixedRoles: ['admin', 'publisher'], why: 'النشر لمسؤول النشر وإدارة الحسابات، والاعتماد لا ينشر أبداً.', sort: 61,
  },
  {
    key: 'media.approve', grp: 'fixed', label: 'اعتماد إصدار ملف في المكتبة', grantable: false, scope: 'none', minRank: 2,
    fixedRoles: ['admin', 'director', 'assistant'], why: 'اعتماد الإصدار يقفله في كل عمل يدخل فيه، فهو لمراجعي المحتوى.', sort: 62,
  },
  {
    key: 'approve.own', grp: 'fixed', label: 'اعتماد ما أرسلته أو رفعته بنفسك', grantable: false, scope: 'none', minRank: 4,
    fixedRoles: [], why: 'لا يعتمد أحد ما أرسله أو رفعه، فصلاً بين من يصنع ومن يعتمد.', sort: 63,
  },
  {
    key: 'role.switch', grp: 'fixed', label: 'عرض النظام بصفة دور آخر', grantable: false, scope: 'none', minRank: 4,
    fixedRoles: ['admin'], why: 'لمسؤول النظام فقط، لاختبار الأدوار.', sort: 64,
  },
  {
    key: 'account.protected', grp: 'fixed', label: 'إزالة حساب مؤسس أو تغيير دوره', grantable: false, scope: 'none', minRank: 4,
    fixedRoles: [], why: 'حسابات المؤسسين محمية ولا تتغير من التطبيق.', sort: 65,
  },
  // The studio tab of «استوديو الحركة» (MVP_draft.md 62), fixed by the owner's decision of 2026-10-19.
  {
    key: 'motion.studio', grp: 'fixed', label: 'الاستوديو في «استوديو الحركة»', grantable: false, scope: 'none', minRank: 3,
    fixedRoles: ['admin', 'director'], why: 'الاستوديو لمسؤول النظام ومدير الاتصال المؤسسي فقط، بقرار المالك في 2026-10-19.', sort: 66,
  },
];

export const capability = (key: string) => CAPABILITIES.find((c) => c.key === key);
export const capLabel = (key: string) => capability(key)?.label ?? 'صلاحية';

export const GROUP_AR: Record<CapGroup, string> = {
  pages: 'الصفحات',
  messaging: 'المراسلة والبريد',
  accounts: 'الحسابات والصلاحيات',
  settings: 'الإعدادات والتكاملات',
  fixed: 'مقفلة بقواعد المركز',
};

/** Rank 4 admin, 3 director, 2 assistant, 1 everyone else (Permissions_Plan.md 4.2). */
export function rankOf(role: Role | string | null | undefined): number {
  if (!role) return 0;
  return role === 'admin' ? 4 : role === 'director' ? 3 : role === 'assistant' ? 2 : 1;
}

const CREATORS = ['admin', 'director', 'assistant', 'writer', 'designer', 'producer', 'member'];

/**
 * What each role holds from its template (role_capabilities), as the migrations leave it:
 *   - 2026-10-13, Step P1: the administrator everything except the WhatsApp push (D-13); the
 *     director and the assistant urgency 2, outside mail without waiting and announcement
 *     channels; everyone else nothing extra.
 *   - Step P2 (20261013160000): the director adds accounts.view, permissions.grant, roles.assign,
 *     members.invite, members.remove, roles.templates.edit; the assistant adds accounts.view and
 *     permissions.grant.
 *   - 2026-10-15, owner decision (20261015180000): the director also holds settings.view,
 *     settings.manage, platforms.manage, integrations.secrets and storage.manage, because the
 *     Director connects the platforms, the mail and the storage from the site; and
 *     (20261015200000) whatsapp.system.manage, to set up the WhatsApp bridge from the site.
 * tests/permissions.test.mjs reads those migrations and holds this table to them. Pages are the
 * account's own list, not part of the templates.
 */
export const TEMPLATE_HOLDS: Partial<Record<Role, readonly string[]>> = {
  director: [
    'urgency.2', 'mail.outside.send', 'room.create',
    'accounts.view', 'permissions.grant', 'roles.assign', 'members.invite', 'members.remove', 'roles.templates.edit',
    'settings.view', 'settings.manage', 'platforms.manage', 'integrations.secrets', 'storage.manage',
    'whatsapp.system.manage',
  ],
  assistant: ['urgency.2', 'mail.outside.send', 'room.create', 'accounts.view', 'permissions.grant'],
};

export function installedDefault(role: Role, key: string): boolean {
  const c = capability(key);
  if (!c || !c.grantable || c.scope === 'page') return false;
  if (key === 'whatsapp.push') return false;
  if (role === 'admin') return true;
  return TEMPLATE_HOLDS[role]?.includes(key) ?? false;
}

export type Source = 'role' | 'page' | 'added' | 'removed' | 'timed' | 'once' | 'fixed' | 'rank' | 'none';
export type CapEval = { k: string; ok: boolean; src: Source; until: string | null; uses: number | null; id: string | null };
export type Grant = {
  id: string;
  k: string;
  mode: 'standing' | 'timed' | 'once';
  effect: 'allow' | 'deny';
  until: string | null;
  uses: number | null;
  total: number | null;
  scope: Record<string, string> | null;
  by: string;
  at: string;
  reason: string | null;
};

/** What the database's grant rows look like for the mirror (active or not). */
export type GrantRow = Omit<Grant, 'by' | 'at' | 'reason' | 'total'> & { revoked?: boolean; created?: string };

const fits = (grant: Record<string, string> | null, want: Record<string, string> | null) =>
  !grant || (!!want && Object.entries(grant).every(([k, v]) => want[k] === v));

/** The mirror of perm_eval: layers, later wins, fixed rules last. */
export function resolve(
  p: { role: Role; pages: string[]; templates: (role: Role, key: string) => boolean; grants: GrantRow[] },
  key: string,
  nowMs: number,
  scope: Record<string, string> | null = null,
): Omit<CapEval, 'k'> {
  const c = capability(key);
  const none = { ok: false, src: 'none' as Source, until: null, uses: null, id: null };
  if (!c) return none;
  if (!c.grantable) return { ...none, ok: c.fixedRoles.includes(p.role), src: 'fixed' };
  let ok: boolean;
  let src: Source;
  let until: string | null = null;
  let uses: number | null = null;
  let id: string | null = null;
  if (c.scope === 'page') {
    ok = p.role === 'admin' || p.pages.includes(key.slice(5));
    src = ok ? 'page' : 'none';
  } else {
    ok = p.templates(p.role, key);
    src = ok ? 'role' : 'none';
  }
  const live = p.grants.filter((g) => g.k === key && !g.revoked);
  const standing = live.find((g) => g.mode === 'standing');
  if (standing) {
    ok = standing.effect === 'allow';
    src = ok ? 'added' : 'removed';
    id = standing.id;
  }
  const timed = live
    .filter((g) => g.mode === 'timed' && g.until && Date.parse(g.until) > nowMs)
    .sort((a, b) => Date.parse(b.until!) - Date.parse(a.until!))[0];
  if (timed && !ok) {
    ok = true;
    src = 'timed';
    until = timed.until;
    id = timed.id;
  }
  if (!ok) {
    const once = live
      .filter((g) => g.mode === 'once' && (g.uses ?? 0) > 0 && (!g.until || Date.parse(g.until) > nowMs) && fits(g.scope, scope))
      .sort((a, b) => (a.until ? Date.parse(a.until) : Infinity) - (b.until ? Date.parse(b.until) : Infinity))[0];
    if (once) {
      ok = true;
      src = 'once';
      until = once.until;
      uses = once.uses;
      id = once.id;
    }
  }
  if (ok && rankOf(p.role) < c.minRank) return { ok: false, src: 'rank', until: null, uses: null, id: null };
  if (ok && key === 'page.create' && !CREATORS.includes(p.role)) return { ok: false, src: 'fixed', until: null, uses: null, id: null };
  return { ok, src, until, uses, id };
}

/** May `me` manage `target`'s permissions? Mirrors perm_require. */
export function manageBlock(me: { email: string; role: Role; caps: string[] }, target: { email: string; role: Role }, cap = 'permissions.grant'):
  | null
  | 'SELF_EDIT'
  | 'FORBIDDEN'
  | 'NOT_MANAGEABLE' {
  if (me.email === target.email) return 'SELF_EDIT';
  if (!me.caps.includes(cap)) return 'FORBIDDEN';
  if (me.role !== 'admin' && rankOf(me.role) <= rankOf(target.role)) return 'NOT_MANAGEABLE';
  return null;
}

/** The roles `me` may give: never Admin; below their own rank unless they are an administrator. */
export function assignableBy(meRole: Role, all: Role[]): Role[] {
  return all.filter((r) => r !== 'admin' && (meRole === 'admin' || rankOf(r) < rankOf(meRole)));
}

export const SOURCE_AR: Record<Source, string> = {
  role: 'من الدور',
  page: 'من صفحات الحساب',
  added: 'أُضيفت',
  removed: 'مسحوبة',
  timed: 'مؤقتة',
  once: 'مرة واحدة',
  fixed: 'مقفلة',
  rank: 'لا تناسب الدور',
  none: 'غير ممنوحة',
};

/** A short Riyadh date and time, as the database words it (perm_stamp). */
export function stamp(iso: string): string {
  return new Date(iso).toLocaleString('sv-SE', { timeZone: 'Asia/Riyadh' }).slice(0, 16);
}

/** The label of one row on the person's card, with its end or uses. */
export function sourceLine(e: Pick<CapEval, 'src' | 'until' | 'uses'>): string {
  if (e.src === 'timed' && e.until) return `مؤقتة حتى ${stamp(e.until)}`;
  if (e.src === 'once') return `مرة واحدة · ${e.uses ?? 0} ${e.uses === 1 ? 'استخدام باقٍ' : 'استخدامات باقية'}${e.until ? ` · حتى ${stamp(e.until)}` : ''}`;
  return SOURCE_AR[e.src];
}

export const DURATIONS: { id: string; label: string; ms: number | null }[] = [
  { id: 'hour', label: 'ساعة', ms: 3600e3 },
  { id: 'day', label: 'يوم', ms: 864e5 },
  { id: 'week', label: 'أسبوع', ms: 7 * 864e5 },
  { id: 'date', label: 'تاريخ محدد', ms: null },
];

export type Mode = 'standing' | 'timed' | 'once';
export const MODE_AR: Record<Mode, string> = { standing: 'دائمة', timed: 'مؤقتة', once: 'مرة واحدة' };

/** The sentence shown before a grant is saved: what the person will be able to do, and until when. */
export function grantPreview(name: string, key: string, mode: Mode, untilIso: string | null, uses: number, target: string | null): string {
  const what = capLabel(key);
  const where = target ? ` في «${target}»` : '';
  if (mode === 'standing') return `سيملك ${name} «${what}»${where} دائماً، حتى تُسحب.`;
  if (mode === 'timed') return `سيملك ${name} «${what}»${where} حتى ${untilIso ? stamp(untilIso) : '…'}، ثم تنتهي وحدها.`;
  const times = uses === 1 ? 'مرة واحدة' : `${uses} مرات`;
  return `سيستطيع ${name} «${what}»${where} ${times}${untilIso ? ` قبل ${stamp(untilIso)}` : ''}، ثم تنتهي.`;
}

/** Arabic for the reasons the database refuses a permission action. */
export function permError(message: string): string {
  const m = message ?? '';
  const table: [string, string][] = [
    ['SELF_EDIT', 'لا يعدّل أحد صلاحياته بنفسه.'],
    ['NOT_MANAGEABLE', 'هذا الشخص في رتبتك أو فوقها، فلا تدير صلاحياته.'],
    ['NOT_HELD', 'لا تمنح ما لا تملكه أنت.'],
    ['CAP_FIXED', 'هذه مقفلة بقواعد المركز ولا تُمنح.'],
    ['CAP_RANK', 'هذه الصلاحية لا تناسب دور هذا الشخص.'],
    ['PAGE_NEEDS_CREATE', 'صفحة «إنشاء» لمن يملك دوره الإنشاء.'],
    ['ONCE_NOT_FOR_PAGES', 'الصفحة تُفتح دائماً أو مؤقتاً، لا مرة واحدة.'],
    ['BAD_UNTIL', 'اختر نهاية في المستقبل، خلال سنة.'],
    ['BAD_USES', 'عدد المرات من 1 إلى 20.'],
    ['BAD_SCOPE', 'الهدف المختار لا يناسب هذه الصلاحية.'],
    ['BAD_MODE', 'اختر دائمة أو مؤقتة أو مرة واحدة.'],
    ['GRANT_NOT_ACTIVE', 'انتهت هذه الصلاحية من قبل.'],
    ['ADMIN_NOT_ASSIGNABLE', 'دور Admin لا يُمنح من التطبيق.'],
    ['ROLE_ABOVE', 'لا تمنح دوراً في رتبتك أو فوقها.'],
    ['ROLE_LOCKED', 'صلاحيات دور Admin ثابتة.'],
    ['PROTECTED_ACCOUNT', 'حساب مؤسس: لا يُحذف ولا يتغير دوره من التطبيق.'],
    ['UNKNOWN_ACCOUNT', 'هذا الحساب لم يعد موجوداً.'],
    ['UNKNOWN_CAP', 'صلاحية غير معروفة.'],
    ['CARD_NOT_SCHEDULABLE', 'لا تُجدول رسالة فيها طلب.'],
    ['UNKNOWN_ROLE', 'دور غير معروف.'],
    ['REQUEST_NOT_PENDING', 'سبق البتّ في هذا الطلب.'],
    ['INVALID_NAME', 'الاسم من حرف إلى 80 حرفاً.'],
    ['ALREADY_HELD', 'تملك هذه الصلاحية بالفعل.'],
    ['ALREADY_PENDING', 'طلبت هذه الصلاحية من قبل وطلبك ينتظر القرار.'],
    ['REASON_REQUIRED', 'اكتب سبب الطلب.'],
    ['NOTE_REQUIRED', 'اكتب سبب الرفض.'],
    ['NOT_A_GRANTER', 'هذا الشخص لا يقرر في هذه الصلاحية لك. اختر المدير أو المساعد.'],
    ['BAD_SOURCE', 'تعذّر إرسال الطلب من هنا.'],
    ['INVITE_TOO_SOON', 'أُرسلت دعوة لهذا الشخص قبل أقل من دقيقة. انتظر قليلاً.'],
    ['ALREADY_ACTIVE', 'هذا الشخص دخل المركز بالفعل، فلا حاجة إلى دعوة.'],
    ['BAD_KIND', 'نوع غير معروف.'],
    ['FORBIDDEN', 'لا تملك صلاحية هذا الإجراء.'],
  ];
  for (const [code, text] of table) if (m.includes(code)) return text;
  if (m.includes('duplicate key') || m.includes('23505')) return 'هذا البريد مُضاف بالفعل.';
  if (m.includes('violates check constraint')) return 'تحقق من البريد والاسم، ثم أعد المحاولة.';
  return 'تعذّر تنفيذ الإجراء. حاول مجدداً.';
}

// ---------------------------------------------------------------------------
// The permission log, in words
// ---------------------------------------------------------------------------
export type PermEvent = {
  id: number;
  at: string;
  actor: string | null;
  subject: string | null;
  role: string | null;
  capability: string | null;
  kind: string;
  data: Record<string, unknown>;
};

export const EVENT_KINDS: Record<string, string> = {
  grant: 'منح',
  revoke: 'إنهاء',
  override: 'سحب أو إعادة',
  extend: 'تمديد',
  use: 'استخدام',
  expired: 'انتهاء',
  role_default: 'صلاحيات دور',
  role_assign: 'تغيير دور',
  member_add: 'إضافة عضو',
  member_remove: 'إزالة عضو',
  account_edit: 'تعديل حساب',
  request: 'طلب',
  decide: 'قرار طلب',
  withdraw: 'سحب طلب',
  invite: 'دعوة',
  entry_help: 'مساعدة في الدخول',
};

const ROLE_AR: Record<string, string> = {
  director: 'مدير الاتصال المؤسسي',
  assistant: 'مساعد مدير الاتصال المؤسسي',
  writer: 'كاتب المحتوى',
  designer: 'المصمم',
  producer: 'المنتج الإعلامي',
  publisher: 'مسؤول النشر وإدارة الحسابات',
  member: 'عضو',
  admin: 'Admin',
};
export const roleAr = (r: string | null | undefined) => (r && ROLE_AR[r]) || '';

const howLong = (d: Record<string, unknown>) => {
  if (d.mode === 'timed' && typeof d.until === 'string') return ` حتى ${stamp(d.until)}`;
  if (d.mode === 'once') return Number(d.uses ?? 1) === 1 ? ' لمرة واحدة' : ` لـ${d.uses} مرات`;
  if (d.mode === 'standing') return ' دائمة';
  return '';
};

/** One line of the permission log, in Arabic, without a raw key. */
export function eventText(e: PermEvent, nameOf: (email: string) => string): string {
  const who = e.actor ? nameOf(e.actor) : 'النظام';
  const whom = e.subject ? nameOf(e.subject) : '';
  const cap = e.capability ? `«${capLabel(e.capability)}»` : '';
  const d = e.data ?? {};
  switch (e.kind) {
    case 'grant':
      return `${who} منح ${whom} ${cap}${howLong(d)}${d.request ? ' بطلب منه' : ''}.`;
    case 'revoke':
      return d.all ? `${who} أنهى كل الصلاحيات المضافة لـ${whom}.` : `${who} أنهى ${cap} لـ${whom}.`;
    case 'override':
      return d.effect === 'deny' ? `${who} سحب ${cap} من ${whom}.` : `${who} أعاد ${cap} لـ${whom} إلى ما يقرره دوره.`;
    case 'extend':
      return `${who} غيّر نهاية ${cap} لـ${whom} إلى ${typeof d.to === 'string' ? stamp(d.to) : ''}.`;
    case 'use':
      return `استخدم ${whom} ${cap} مرة، وبقي ${d.left ?? 0}.`;
    case 'expired':
      return d.used_up ? `استُنفدت ${cap} لـ${whom}.` : `انتهت ${cap} لـ${whom}.`;
    case 'role_default':
      return `${who} ${d.allowed ? 'فعّل' : 'أوقف'} ${cap} لدور «${roleAr(e.role)}»${typeof d.people === 'number' ? ` (${d.people} ${d.people === 1 ? 'شخص' : 'أشخاص'})` : ''}.`;
    case 'role_assign':
      return `${who} غيّر دور ${whom} من «${roleAr(String(d.from ?? ''))}» إلى «${roleAr(String(d.to ?? e.role ?? ''))}».`;
    case 'member_add':
      return `${who} أضاف ${whom} بدور «${roleAr(e.role)}».`;
    case 'member_remove':
      return `${who} أزال ${whom}${typeof d.name === 'string' ? ` (${d.name})` : ''}.`;
    case 'account_edit':
      return `${who} عدّل حساب ${whom}${Array.isArray(d.added) && d.added.length ? `: فتح ${d.added.length} ${d.added.length === 1 ? 'صفحة' : 'صفحات'}` : ''}${Array.isArray(d.removed) && d.removed.length ? `، وأغلق ${d.removed.length}` : ''}.`;
    case 'request':
      return `طلب ${who} ${cap}${howLong(d)}.`;
    case 'decide':
      return `${who} ${d.approve ? 'وافق على' : 'رفض'} طلب ${whom} ${cap}${d.approve ? howLong(d) : ''}.`;
    case 'withdraw':
      return `سحب ${who} طلبه ${cap}.`;
    case 'invite':
      return `${who} أرسل دعوة إلى ${whom}${Number(d.count ?? 1) > 1 ? ` (المرة ${d.count})` : ''}.`;
    case 'entry_help':
      return d.what === 'reset' ? `${who} أرسل إلى ${whom} رابطاً لتعيين كلمة مرور جديدة.` : `${who} أعاد إرسال رابط التأكيد إلى ${whom}.`;
    default:
      return `${who}: ${EVENT_KINDS[e.kind] ?? 'حدث'} ${cap}`.trim();
  }
}

/** The small markers on a member's row: temporary, one-time and removed. */
export function markers(grants: Pick<Grant, 'mode' | 'effect'>[]): { timed: number; once: number; removed: number } {
  return {
    timed: grants.filter((g) => g.mode === 'timed').length,
    once: grants.filter((g) => g.mode === 'once').length,
    removed: grants.filter((g) => g.mode === 'standing' && g.effect === 'deny').length,
  };
}

/** The next moment one of these grants ends, for the shell to read again then (no timer job). */
export function nextEnd(grants: Pick<Grant, 'until'>[], nowMs: number): number | null {
  const ends = grants.map((g) => (g.until ? Date.parse(g.until) : NaN)).filter((t) => t > nowMs);
  return ends.length ? Math.min(...ends) : null;
}

// ---------------------------------------------------------------------------
// Requests (Permissions_Plan.md 6)
// ---------------------------------------------------------------------------
/** How long a request asks for, as the database words it (perm_how). */
export function howAr(mode: Mode, hours: number | null | undefined, uses: number | null | undefined): string {
  if (mode === 'standing') return ' دائمة';
  if (mode === 'once') return (uses ?? 1) === 1 ? ' لمرة واحدة' : ` لـ${uses} مرات`;
  const h = hours ?? 0;
  if (h % 168 === 0) return ` لمدة ${h / 168} أسبوع`;
  if (h % 24 === 0) return ` لمدة ${h / 24} يوم`;
  return ` لمدة ${h} ساعة`;
}

export const REQUEST_HOURS: { h: number; label: string }[] = [
  { h: 1, label: 'ساعة' },
  { h: 24, label: 'يوم' },
  { h: 168, label: 'أسبوع' },
  { h: 720, label: 'شهر' },
];

export const SOURCE_DOOR: Record<string, string> = {
  button: 'من زر مقفل',
  chat: 'من المراسلة',
  mail: 'من البريد',
  page: 'من صفحة الطلبات',
};

export const REQUEST_STATUS: Record<string, string> = {
  pending: 'بانتظار القرار',
  approved: 'مُنحت',
  declined: 'لم تُمنح',
  withdrawn: 'سُحب',
};

/** What a person may ask for: grantable, fitting their role, not already theirs by role or for good. */
export function askable(role: Role, evals: Pick<CapEval, 'k' | 'ok' | 'src'>[]): Capability[] {
  return CAPABILITIES.filter((c) => {
    if (!c.grantable || rankOf(role) < c.minRank) return false;
    if (c.key === 'page.create' && !['director', 'assistant', 'writer', 'designer', 'producer', 'member'].includes(role)) return false;
    const e = evals.find((x) => x.k === c.key);
    return !(e?.ok && ['role', 'added', 'page'].includes(e.src));
  });
}

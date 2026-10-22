// Media rules for the interface: levels, pipeline stages and which quick actions a
// person sees. The database is the authority (supabase/migrations/..._media_system.sql
// refuses anything these rules would not offer); this module only decides what to
// SHOW, so the two are kept in step by tests/media.test.mjs.
import type { Role } from '../domain.ts';

// ---------------------------------------------------------------- levels
export const LEVELS = { none: 0, view: 1, edit: 2, create: 3, manage: 4 } as const;
export type Level = keyof typeof LEVELS;
export const LEVEL_NAMES = Object.keys(LEVELS) as Level[];

export const levelLabels: Record<Level, string> = {
  none: 'لا وصول',
  view: 'عرض فقط',
  edit: 'تحرير',
  create: 'إنشاء',
  manage: 'إدارة',
};

export const levelHints: Record<Level, string> = {
  none: 'المجلد مخفي تماماً',
  view: 'يرى ويُنزّل ويعلّق',
  edit: 'يعدّل الموجود: الاسم والوسوم والنقل',
  create: 'يضيف ملفات ومجلدات وإصدارات جديدة، إضافة إلى التحرير',
  manage: 'يحذف ويدير الوصول ويقفل المجلد',
};

/** What each level can do, in the order the access dialog shows it (view, edit, create, manage). */
export const capabilityMatrix: [string, [boolean, boolean, boolean, boolean]][] = [
  ['عرض وتنزيل وتعليق', [true, true, true, true]],
  ['تعديل الاسم والوسوم', [false, true, true, true]],
  ['نقل الملفات', [false, true, true, true]],
  ['رفع ملفات وإصدارات ومجلدات جديدة', [false, false, true, true]],
  ['حذف الملفات', [false, false, false, true]],
  ['إدارة الوصول وقفل المجلد', [false, false, false, true]],
];

export const canEditAt = (level: number, locked: boolean) => level >= LEVELS.edit && (!locked || level >= LEVELS.manage);
export const canCreateAt = (level: number, locked: boolean) => level >= LEVELS.create && (!locked || level >= LEVELS.manage);

// ---------------------------------------------------------------- pipeline
export type Stage =
  | 'draft'
  | 'production'
  | 'review'
  | 'changes'
  | 'rejected'
  | 'ready'
  | 'scheduled'
  | 'published'
  | 'partial'
  | 'failed';

/** The main path, left to right. Arabic terms are the product's own (AGENTS.md). */
export const pipeline: Stage[] = ['draft', 'production', 'review', 'ready', 'scheduled', 'published'];

export const stageLabels: Record<Stage, string> = {
  draft: 'مسودة',
  production: 'قيد الإنتاج',
  review: 'قيد المراجعة',
  changes: 'بحاجة إلى تعديل',
  rejected: 'مرفوض',
  ready: 'جاهز للنشر',
  scheduled: 'مجدول',
  published: 'منشور',
  partial: 'نشر جزئي',
  failed: 'فشل النشر',
};

export type Tone = 'neutral' | 'info' | 'review' | 'success' | 'schedule' | 'done' | 'warn' | 'danger';
export const stageTone: Record<Stage, Tone> = {
  draft: 'neutral',
  production: 'info',
  review: 'review',
  changes: 'warn',
  rejected: 'danger',
  ready: 'success',
  scheduled: 'schedule',
  published: 'done',
  partial: 'warn',
  failed: 'danger',
};

/** Side states hang off the main path at this position. */
const sidePosition: Partial<Record<Stage, number>> = { changes: 2, rejected: 2, partial: 5, failed: 4 };
export const isSideStage = (s: Stage) => s in sidePosition;
export function stagePosition(s: Stage): number {
  const i = pipeline.indexOf(s);
  return i >= 0 ? i : (sidePosition[s] ?? 0);
}

/** An approved version that is on its way to or already published is frozen. */
export const isAssetLocked = (a: { approved_version: number | null; stage: Stage }) =>
  a.approved_version !== null && ['ready', 'scheduled', 'published'].includes(a.stage);

// ---------------------------------------------------------------- roles
export const creativeRoles: Role[] = ['writer', 'designer', 'producer', 'assistant', 'director'];
export const reviewerRoles: Role[] = ['director', 'assistant'];
/** Roles that see everyone's activity in the log. */
export const logAllRoles: Role[] = ['admin', 'director', 'assistant'];
/** Roles that may assign tasks. */
export const assignerRoles: Role[] = ['admin', 'director', 'assistant', 'producer'];

// ---------------------------------------------------------------- quick actions
export type ActionId =
  | 'approve'
  | 'changes'
  | 'reject'
  | 'schedule'
  | 'publish'
  | 'startprod'
  | 'submit'
  | 'newver'
  | 'writecopy'
  | 'copyreq'
  | 'assign'
  | 'note'
  | 'link';

export type ActionDef = { id: ActionId; label: string; hint: string; icon: string; next?: boolean };

export type ActionContext = {
  role: Role;
  /** The person's level in the asset's folder, 0 to 4. */
  level: number;
  folderLocked: boolean;
  stage: Stage;
  approvedVersion: number | null;
  currentVersion: number;
  hasChannels: boolean;
  isVideo: boolean;
  /** This person uploaded the current version: the database refuses their decision on it (SELF_APPROVAL). */
  uploadedByMe?: boolean;
};

/** Who owns each action, for the "other actions belong to…" line on the asset page. */
export const actionOwners: Record<ActionId, string> = {
  approve: 'مراجعي المحتوى',
  changes: 'مراجعي المحتوى',
  reject: 'مدير الاتصال',
  schedule: 'مسؤول النشر',
  publish: 'مسؤول النشر',
  startprod: 'فريق الإنتاج',
  submit: 'فريق الإنتاج',
  newver: 'فريق الإنتاج',
  writecopy: 'الكتّاب',
  copyreq: 'الإدارة والمنتجين',
  assign: 'الإدارة والمنتجين',
  note: 'الجميع',
  link: 'الإدارة ومسؤول النشر',
};

export function quickActions(c: ActionContext): ActionDef[] {
  const { role, level, stage } = c;
  const view = level >= LEVELS.view;
  const edit = canEditAt(level, c.folderLocked);
  const create = canCreateAt(level, c.folderLocked);
  const isReviewer = reviewerRoles.includes(role);
  const out: ActionDef[] = [];
  const add = (id: ActionId, label: string, hint: string, icon: string, next = false) =>
    out.push({ id, label, hint, icon, next });

  // A decision on a version you uploaded is someone else's (approve, changes and reject alike).
  const decide = view && stage === 'review' && !c.uploadedByMe;
  if (decide && isReviewer) {
    add('approve', `اعتماد الإصدار v${c.currentVersion}`, 'يقفل الإصدار ويجعله جاهزاً للنشر', 'check', true);
    add('changes', 'طلب تعديل', c.isVideo ? 'ملاحظة، وبوقت محدد للفيديو' : 'ملاحظة تعود إلى المنشئ', 'pencil');
  }
  if (decide && role === 'director') add('reject', 'رفض', 'يعيد الأصل مع السبب', 'x');

  if (view && role === 'publisher' && (stage === 'ready' || stage === 'scheduled')) {
    add('schedule', stage === 'scheduled' ? 'تعديل موعد النشر' : 'جدولة النشر', 'التاريخ والوقت والمنصات والنص', 'cal', stage === 'ready');
    add('publish', 'نشر الآن', 'محاكاة: لا يُرسل شيء إلى المنصات', 'send');
  }
  if (view && role === 'publisher' && (stage === 'partial' || stage === 'failed'))
    add('publish', 'إعادة محاولة النشر', 'محاكاة على المنصات الفاشلة', 'send', true);

  if (edit && creativeRoles.includes(role) && stage === 'draft')
    add('startprod', 'بدء الإنتاج', 'ينقله إلى «قيد الإنتاج»', 'film', true);
  if (edit && creativeRoles.includes(role) && ['draft', 'production', 'changes'].includes(stage))
    add('submit', 'إرسال للمراجعة', 'ينقله إلى «قيد المراجعة»', 'eye', stage === 'production' || stage === 'changes');
  if (create && ['writer', 'designer', 'producer', 'assistant', 'director'].includes(role) && stage !== 'published')
    add('newver', 'رفع إصدار جديد', 'بدون المساس بالإصدار المعتمد', 'upload');

  if (view && ['writer', 'assistant', 'director'].includes(role) && stage !== 'published' && c.hasChannels)
    add('writecopy', 'كتابة العنوان والوصف', 'لكل منصة مستهدفة', 'file');
  if (view && ['admin', 'director', 'assistant', 'designer', 'producer', 'publisher'].includes(role) && stage !== 'published')
    add('copyreq', 'طلب عنوان ووصف من الكاتب', 'يسند مهمة إلى كاتب المحتوى', 'file');
  if (view && assignerRoles.includes(role)) add('assign', 'إسناد مهمة', 'إلى من، ومتى، وماذا يُطلب', 'users');
  if (view) add('note', c.isVideo ? 'إضافة ملاحظة بوقت محدد' : 'إضافة ملاحظة', 'تُسجَّل في رحلة الأصل', 'note');
  if (view && ['admin', 'director', 'assistant', 'publisher'].includes(role))
    add('link', 'رابط مراجعة', 'لمن لا يملك حساباً، ينتهي تلقائياً', 'link');
  return out;
}

/** Every action id, to name the ones that belong to other roles. */
export const allActionIds = Object.keys(actionOwners) as ActionId[];

// ---------------------------------------------------------------- tasks
export type TaskKind = 'copy' | 'design' | 'edit' | 'review' | 'publish' | 'other';
export const taskKindLabels: Record<TaskKind, string> = {
  copy: 'كتابة عنوان ووصف',
  design: 'تصميم أو تعديل تصميم',
  edit: 'مونتاج أو تعديل',
  review: 'مراجعة',
  publish: 'تجهيز النشر',
  other: 'مهمة أخرى',
};

// ---------------------------------------------------------------- platforms
export type PlatformSpec = { id: string; name: string; ratio: number; size: string };
/** Channel names match the integrations in domain.ts. Ratios are width / height. */
export const platformSpecs: PlatformSpec[] = [
  { id: 'Instagram', name: 'Instagram', ratio: 0.8, size: '1080 × 1350' },
  { id: 'X', name: 'X', ratio: 1.78, size: '1600 × 900' },
  { id: 'LinkedIn', name: 'LinkedIn', ratio: 1.91, size: '1200 × 627' },
];

/** Parses "1080 × 1350 px" into a width / height ratio, or null. */
export function ratioOf(dims: string | null | undefined): number | null {
  const m = (dims ?? '').match(/(\d+)\s*[×x]\s*(\d+)/i);
  return m && Number(m[2]) > 0 ? Number(m[1]) / Number(m[2]) : null;
}
export const fitsPlatform = (dims: string | null | undefined, p: PlatformSpec) => {
  const r = ratioOf(dims);
  return r === null ? null : Math.abs(r - p.ratio) / p.ratio < 0.06;
};

// ---------------------------------------------------------------- small helpers
/** "mm:ss" or "m:ss" to seconds, or null. */
export function timecodeSeconds(tc: string | null | undefined): number | null {
  const m = (tc ?? '').match(/^(\d{1,2}):([0-5]\d)$/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v >= 100 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

/** Riyadh wall-clock time as "YYYY-MM-DD HH:mm". */
export function riyadhStamp(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return d.toLocaleString('sv-SE', { timeZone: 'Asia/Riyadh' }).slice(0, 16);
}

/** Maps a database error code to Arabic. */
export function dbErrorText(message: string): string {
  const m = message || '';
  const table: [string, string][] = [
    ['SELF_APPROVAL', 'لا تعتمد إصداراً رفعته بنفسك. يقرر فيه غيرك من القيادة.'],
    ['STAGE_DENIED', 'هذا الانتقال غير متاح لدورك أو لحالة الأصل الحالية.'],
    ['NAME_LOCKED', 'لا يمكن تغيير الاسم: لا تملك صلاحية التحرير، أو الإصدار معتمد ومقفل، أو المجلد مقفل.'],
    ['EDIT_LOCKED', 'لا يمكن التعديل: لا تملك صلاحية التحرير، أو الإصدار معتمد ومقفل، أو المجلد مقفل.'],
    ['MOVE_DENIED', 'لا يمكن النقل إلى هذا المجلد: يلزم تحرير في المجلدين وألا يكون مقفلاً.'],
    ['COPY_DENIED', 'كتابة العنوان والوصف للكتّاب والإدارة ومسؤول النشر.'],
    ['SCHEDULE_REQUIRED', 'حدّد موعد النشر أولاً.'],
    ['VERSION_ORDER', 'تغيّر الأصل أثناء الرفع. أعد المحاولة.'],
    ['MANAGE_REQUIRED', 'القفل والتقييد يتطلبان صلاحية «إدارة».'],
    ['IMMUTABLE_COLUMN', 'لا يمكن تغيير هذا الحقل.'],
    ['FORBIDDEN', 'لا تملك صلاحية هذا الإجراء.'],
  ];
  for (const [code, text] of table) if (m.includes(code)) return text;
  if (m.includes('row-level security') || m.includes('violates row-level')) return 'لا تملك صلاحية هذا الإجراء في هذا المجلد.';
  if (m.includes('duplicate key')) return 'هذا العنصر موجود بالفعل.';
  return 'تعذّر تنفيذ الإجراء. حاول مجدداً.';
}

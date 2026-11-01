// «سجل النشاط» as one list (MVP_draft.md 66). Three logs feed it, each with its own row level security: the library's
// and mail's (activity_log), the work cycle's (work_log) and the permissions' (permission_events). This turns their
// rows into one shape, and pages through them without losing a row. Pure, tested.
import { describe, logTypeLabels, type LogRow } from '../media/log-text.ts';
import type { Stage } from '../media/rules.ts';
import { eventText, type PermEvent } from '../permissions.ts';

export type WorkLogRow = { id: number; work_id: string; at: string; actor: string; type: string; text: string; works?: { title: string } | null };

export type EntrySource = 'library' | 'work' | 'permission';

/** The kinds a person filters by: what happened, whichever log it came from. */
export type EntryKind = 'work' | 'files' | 'review' | 'publish' | 'tasks' | 'access' | 'tidy';

export const ENTRY_KINDS: { id: EntryKind; label: string }[] = [
  { id: 'work', label: 'سير الأعمال' },
  { id: 'files', label: 'النصوص والملفات' },
  { id: 'review', label: 'المراجعة والاعتماد' },
  { id: 'publish', label: 'النشر والجدولة' },
  { id: 'tasks', label: 'المهام' },
  { id: 'access', label: 'الوصول والصلاحيات' },
  { id: 'tidy', label: 'التنظيم' },
];

export type Entry = {
  key: string;
  at: string;
  actor: string;
  source: EntrySource;
  /** The row's own type, for its icon. */
  type: string;
  kind: EntryKind;
  label: string;
  text: string;
  before?: string;
  after?: string;
  stage?: Stage;
  /** A library file's id, when the row is about one. */
  asset?: string | null;
  /** A work's address and name, when the row is about one. */
  work?: { href: string; label: string } | null;
};

const LIBRARY_KIND: Record<string, EntryKind> = {
  upload: 'files', version: 'files', copy: 'files', download: 'files',
  stage: 'review', approve: 'review', changes: 'review', reject: 'review',
  schedule: 'publish', publish: 'publish', date: 'publish',
  assign: 'tasks', done: 'tasks',
  access: 'access', lock: 'access', link: 'access', permission: 'access',
};

export const WORK_LABELS: Record<string, string> = {
  create: 'إنشاء عمل', request: 'طلب عمل', start: 'بدء الإنتاج', stage_start: 'بدء مرحلة', stage_done: 'إنهاء مرحلة', stage_due: 'موعد مرحلة',
  text: 'كتابة نص', copy: 'نسخة منصة', copy_ok: 'اعتماد نسخة منصة', asset: 'ربط ملف', asset_off: 'فك ربط ملف',
  submit: 'إرسال للمراجعة', review: 'عودة إلى المراجعة', approve: 'اعتماد', approved: 'اعتماد العمل', changes: 'طلب تعديل', reject: 'رفض',
  gate: 'نقطة موافقة', gate_wait: 'انتظار موافقة', schedule: 'جدولة', unschedule: 'إلغاء جدولة', publish: 'نشر', publish_no: 'نشر متعذّر',
  assign: 'إسناد', extension: 'طلب تمديد', extension_ok: 'قرار تمديد', due: 'موعد العمل', details: 'تعديل التفاصيل', plan: 'خطة العمل',
  close: 'إغلاق', reopen: 'إعادة فتح', restrict: 'تقييد الرؤية', link: 'ربط', move: 'نقل', move_off: 'إلغاء نقل', account_off: 'حساب متوقف',
};

const WORK_KIND: Record<string, EntryKind> = {
  text: 'files', copy: 'files', copy_ok: 'review', asset: 'files', asset_off: 'files',
  submit: 'review', review: 'review', approve: 'review', approved: 'review', changes: 'review', reject: 'review', gate: 'review', gate_wait: 'review',
  schedule: 'publish', unschedule: 'publish', publish: 'publish', publish_no: 'publish',
  restrict: 'access',
};

export function libraryEntry(r: LogRow, nameOf: (email: string) => string): Entry {
  const d = describe(r, nameOf);
  return {
    key: `l${r.id}`, at: r.at, actor: r.actor_email, source: 'library', type: r.type,
    kind: LIBRARY_KIND[r.type] ?? 'tidy', label: logTypeLabels[r.type] ?? r.type,
    text: d.text, before: d.before, after: d.after, stage: d.stage, asset: r.asset_id,
  };
}

export function workEntry(r: WorkLogRow, nameOf: (email: string) => string): Entry {
  return {
    key: `w${r.id}`, at: r.at, actor: r.actor, source: 'work', type: r.type,
    kind: WORK_KIND[r.type] ?? 'work', label: WORK_LABELS[r.type] ?? 'حدث في عمل',
    text: `${nameOf(r.actor)}: ${r.text}`,
    work: { href: `/work/${r.work_id}`, label: r.works?.title ? `${r.work_id} · ${r.works.title}` : r.work_id },
  };
}

export function permissionEntry(e: PermEvent, nameOf: (email: string) => string): Entry {
  return {
    key: `p${e.id}`, at: e.at, actor: e.actor ?? 'system', source: 'permission', type: 'permission',
    kind: 'access', label: logTypeLabels.permission, text: eventText(e, nameOf),
  };
}

/**
 * Each log is read newest first, up to `limit` rows. A log that filled its limit has more rows older than its last,
 * so the merged list can be trusted only down to the newest of those last rows: anything older may have rows missing
 * between the logs. It stops there, and the next read starts from that moment, so paging never skips a row.
 */
export function mergePage(sources: Entry[][], limit: number): { entries: Entry[]; cursor: string | null } {
  const full = sources.filter((s) => s.length >= limit).map((s) => s[s.length - 1].at);
  const cursor = full.length ? full.reduce((a, b) => (a > b ? a : b)) : null;
  const all = sources.flat().sort((x, y) => (x.at === y.at ? x.key.localeCompare(y.key) : y.at.localeCompare(x.at)));
  return { entries: cursor ? all.filter((e) => e.at > cursor) : all, cursor };
}

export type Period = 'all' | 'today' | 'week' | 'month' | 'last';

export const PERIODS: { id: Period; label: string }[] = [
  { id: 'all', label: 'كل الوقت' },
  { id: 'today', label: 'اليوم' },
  { id: 'week', label: 'آخر 7 أيام' },
  { id: 'month', label: 'هذا الشهر' },
  { id: 'last', label: 'الشهر الماضي' },
];

/** The first moment of a Riyadh day, as an instant (Riyadh is UTC+3 all year). */
const riyadhDay = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d, -3)).toISOString();

/** The instants a period covers, by Riyadh's calendar; null where it is open. */
export function periodRange(p: Period, now: Date): { from: string | null; to: string | null } {
  const r = new Date(now.getTime() + 3 * 3600e3);
  const y = r.getUTCFullYear();
  const m = r.getUTCMonth();
  const d = r.getUTCDate();
  if (p === 'today') return { from: riyadhDay(y, m, d), to: null };
  if (p === 'week') return { from: new Date(now.getTime() - 7 * 864e5).toISOString(), to: null };
  if (p === 'month') return { from: riyadhDay(y, m, 1), to: null };
  if (p === 'last') return { from: riyadhDay(y, m - 1, 1), to: riyadhDay(y, m, 1) };
  return { from: null, to: null };
}

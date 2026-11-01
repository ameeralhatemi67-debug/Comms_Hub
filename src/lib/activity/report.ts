// «تقرير الشهر» (MVP_draft.md 66). The database gives what happened in one month (activity_report); this turns it into
// what each person did, their points and the ranking, so the Excel file, both PDFs and the page all read the same
// numbers. The way of counting is here alone, stated in words in every report. Pure, tested.
import { roleAr } from '../permissions.ts';

export type RawAction = { who: string; src: 'log' | 'work'; type: string; n: number };
export type RawStage = { who: string; at: string; due: string | null; on_time: boolean; name: string | null; work: string | null; work_id: string | null };
export type RawTask = { who: string; at: string; due: string; on_time: boolean; name: string };
export type RawReport = {
  month: string;
  from: string;
  to: string;
  people: { email: string; name: string; role: string }[];
  actions: RawAction[];
  days: Record<string, number>;
  approved: Record<string, number>;
  stages: RawStage[];
  tasks: RawTask[];
  late: Record<string, number>;
};

export type Category = 'stages' | 'tasks' | 'works' | 'reviews' | 'publishing' | 'content' | 'other';

/** What is counted, what it is worth, in the order every report shows it. */
export const CATEGORIES: { id: Category; label: string; short: string; points: number; note: string }[] = [
  { id: 'stages', label: 'مراحل أُنجزت', short: 'مراحل', points: 3, note: 'وتُضاف نقطة إن أُنجزت في موعدها' },
  { id: 'tasks', label: 'مهام أُنجزت', short: 'مهام', points: 3, note: 'وتُضاف نقطة إن أُنجزت في موعدها' },
  { id: 'works', label: 'أعمال اعتُمدت', short: 'أعمال', points: 4, note: 'لمن أُسند إليه العمل، عند اعتماده كاملاً' },
  { id: 'reviews', label: 'مراجعات وقرارات', short: 'مراجعات', points: 2, note: 'اعتماد أو طلب تعديل أو رفض' },
  { id: 'publishing', label: 'نشر وجدولة', short: 'نشر', points: 2, note: 'كل جدولة أو نشر' },
  { id: 'content', label: 'نصوص وملفات', short: 'محتوى', points: 1, note: 'كل نص أو نسخة منصة أو ملف أو إصدار' },
  { id: 'other', label: 'تنظيم ومتابعة', short: 'تنظيم', points: 0, note: 'يظهر في التقرير ولا تُحسب له نقاط' },
];

export const ON_TIME_POINT = 1;

/** Counted through their own records, so the log's line for them is not counted again. */
const COUNTED_ELSEWHERE = new Set(['done', 'stage_done', 'approved']);

const CATEGORY_OF: { log: Record<string, Category>; work: Record<string, Category> } = {
  log: { approve: 'reviews', changes: 'reviews', reject: 'reviews', schedule: 'publishing', publish: 'publishing', upload: 'content', version: 'content' },
  work: { approve: 'reviews', changes: 'reviews', reject: 'reviews', gate: 'reviews', schedule: 'publishing', publish: 'publishing', text: 'content', copy: 'content', asset: 'content' },
};

export type ReportItem = { kind: 'stage' | 'task'; at: string; onTime: boolean | null; name: string; work: string | null };

export type ReportPerson = {
  email: string;
  name: string;
  role: string;
  roleName: string;
  /** No longer a member: their month still counts, under what is left of their name. */
  removed: boolean;
  /** Takes part in the ranking; the Admin and the director are shown and not ranked. */
  ranked: boolean;
  rank: number | null;
  points: number;
  counts: Record<Category, number>;
  /** Of stages and tasks with a due date, the share finished in time, as a whole percent; null when there were none. */
  onTime: number | null;
  lateOpen: number;
  days: number;
  items: ReportItem[];
};

export type MonthlyReport = {
  month: string;
  title: string;
  /** The month has not ended: the numbers are up to now. */
  partial: boolean;
  people: ReportPerson[];
  ranked: ReportPerson[];
  /** Who came first; more than one on a tie, none when nobody has points. */
  top: ReportPerson[];
  totals: { points: number; counts: Record<Category, number>; onTime: number | null; active: number; members: number };
};

const MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

/** «أكتوبر 2026». */
export function monthTitle(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return `${MONTHS[m - 1] ?? ''} ${y}`;
}

/** A month a step away from another: monthAdd('2026-01', -1) is '2025-12'. */
export function monthAdd(month: string, by: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** The month a moment falls in, by Riyadh's calendar. */
export const monthOf = (now: Date) => new Date(now.getTime() + 3 * 3600e3).toISOString().slice(0, 7);

/** What the page opens on: last month, unless the current one is in its last three days. */
export function defaultMonth(now: Date): string {
  const r = new Date(now.getTime() + 3 * 3600e3);
  const end = new Date(Date.UTC(r.getUTCFullYear(), r.getUTCMonth() + 1, 0)).getUTCDate();
  return r.getUTCDate() > end - 3 ? monthOf(now) : monthAdd(monthOf(now), -1);
}

/** The months offered, newest first, starting at the current one. */
export const recentMonths = (now: Date, count = 12) => Array.from({ length: count }, (_, i) => monthAdd(monthOf(now), -i));

const emptyCounts = (): Record<Category, number> => ({ stages: 0, tasks: 0, works: 0, reviews: 0, publishing: 0, content: 0, other: 0 });

const NOT_RANKED = new Set(['admin', 'director']);

const percent = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : null);

/** Turns what the database gave into the report. `now` decides only whether the month has ended. */
export function buildReport(raw: RawReport, now: Date): MonthlyReport {
  const known = new Map(raw.people.map((p) => [p.email, p]));
  const seen = new Set<string>();
  const counts = new Map<string, Record<Category, number>>();
  const timely = new Map<string, { done: number; due: number }>();
  const items = new Map<string, ReportItem[]>();
  const bucket = (who: string) => {
    seen.add(who);
    let c = counts.get(who);
    if (!c) counts.set(who, (c = emptyCounts()));
    return c;
  };
  const time = (who: string) => {
    let t = timely.get(who);
    if (!t) timely.set(who, (t = { done: 0, due: 0 }));
    return t;
  };
  const item = (who: string, x: ReportItem) => items.set(who, [...(items.get(who) ?? []), x]);

  for (const a of raw.actions) {
    if (a.who === 'system' || COUNTED_ELSEWHERE.has(a.type)) continue;
    bucket(a.who)[CATEGORY_OF[a.src][a.type] ?? 'other'] += a.n;
  }
  for (const s of raw.stages) {
    bucket(s.who).stages += 1;
    if (s.due) {
      time(s.who).due += 1;
      if (s.on_time) time(s.who).done += 1;
    }
    item(s.who, { kind: 'stage', at: s.at, onTime: s.due ? s.on_time : null, name: s.name ?? 'مرحلة في عمل مقيّد', work: s.work });
  }
  for (const t of raw.tasks) {
    bucket(t.who).tasks += 1;
    time(t.who).due += 1;
    if (t.on_time) time(t.who).done += 1;
    item(t.who, { kind: 'task', at: t.at, onTime: t.on_time, name: t.name, work: null });
  }
  for (const [who, n] of Object.entries(raw.approved)) bucket(who).works += n;

  const everyone = [...raw.people.map((p) => p.email), ...[...seen].filter((e) => !known.has(e))];
  const people: ReportPerson[] = everyone.map((email) => {
    const p = known.get(email);
    const c = counts.get(email) ?? emptyCounts();
    const t = timely.get(email) ?? { done: 0, due: 0 };
    const worth = CATEGORIES.reduce((sum, x) => sum + c[x.id] * x.points, 0) + t.done * ON_TIME_POINT;
    const role = p?.role ?? '';
    return {
      email,
      name: p?.name ?? email.split('@')[0],
      role,
      roleName: p ? roleAr(role) : 'حساب أُزيل',
      removed: !p,
      ranked: !!p && !NOT_RANKED.has(role),
      rank: null,
      points: worth,
      counts: c,
      onTime: percent(t.done, t.due),
      lateOpen: raw.late[email] ?? 0,
      days: raw.days[email] ?? 0,
      items: (items.get(email) ?? []).sort((a, b) => a.at.localeCompare(b.at)),
    };
  });

  // More points first; then what was finished, then the days present, so a tie on points is rarely left to the name.
  const order = (a: ReportPerson, b: ReportPerson) =>
    b.points - a.points || b.counts.stages + b.counts.tasks - (a.counts.stages + a.counts.tasks) || b.days - a.days || a.name.localeCompare(b.name, 'ar');
  people.sort((a, b) => Number(b.ranked) - Number(a.ranked) || order(a, b));
  const ranked = people.filter((p) => p.ranked);
  // Nobody is placed for nothing: without points there is no rank, and an empty month has no first place.
  ranked.forEach((p, i) => {
    const before = ranked[i - 1];
    if (p.points > 0) p.rank = before && before.points === p.points ? before.rank : i + 1;
  });
  const top = ranked.length && ranked[0].points > 0 ? ranked.filter((p) => p.points === ranked[0].points) : [];

  const all = [...timely.values()].reduce((s, t) => ({ done: s.done + t.done, due: s.due + t.due }), { done: 0, due: 0 });
  const totals = emptyCounts();
  for (const p of people) for (const c of CATEGORIES) totals[c.id] += p.counts[c.id];
  return {
    month: raw.month,
    title: monthTitle(raw.month),
    partial: now.getTime() < Date.parse(raw.to),
    people,
    ranked,
    top,
    totals: {
      points: people.reduce((s, p) => s + p.points, 0),
      counts: totals,
      onTime: percent(all.done, all.due),
      active: people.filter((p) => p.days > 0 || p.points > 0).length,
      members: people.filter((p) => !p.removed).length,
    },
  };
}

/** The same words in every report, so a number can always be traced to a rule. */
export function methodLines(): string[] {
  return [
    ...CATEGORIES.map((c) => `${c.label}: ${c.points === 1 ? 'نقطة واحدة' : c.points === 2 ? 'نقطتان' : c.points === 0 ? 'بلا نقاط' : `${c.points} نقاط`}${c.points ? ' لكل واحد' : ''}. ${c.note}.`),
    'الترتيب يشمل الفريق. Admin ومدير الاتصال المؤسسي يظهران في التقرير ولا يدخلان الترتيب.',
    'يقيس التقرير ما سُجّل في المركز من إنجاز، لا جودته ولا ما جرى خارجه، فاقرأه مع ما تعرفه عن عمل كل شخص.',
  ];
}

/** Names of the first place, for a sentence. */
export const topNames = (r: MonthlyReport) => r.top.map((p) => p.name).join(' و');

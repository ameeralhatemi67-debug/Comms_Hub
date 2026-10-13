// The planning pages' rules: «التقويم» (what shows on which day and lane, the warnings that
// do not block, who may move what), «المشاريع» (progress, people, a works plan assigned and
// dated back from each due date) and «الطلبات» (one inbox for every kind of request). Pure,
// covered by tests/planning.test.mjs. The database decides every write (the work cycle
// functions in supabase/migrations/*work_cycle*); this file predicts its answers so a page can
// say them before a click. After «النموذج المرجعي للمركز» version 5 (calEntries, lanesNow,
// spansFor, bandsFor, moveWarn, projProgress, backSchedule, workFromProjectPlan, inboxItems).
import type { Role } from '../domain.ts';
import {
  MAIN_ROLE,
  OUTSTANDING,
  TYPE_PLANS,
  authOk,
  backSchedule,
  canPublish,
  dayAdd,
  dayDiff,
  decideBlock,
  fdate,
  involved,
  isLead,
  isOutstanding,
  isRequest,
  planPayload,
  platformLabels,
  riyadhStamp,
  sdate,
  stageLate,
  stageState,
  type AccountRow,
  type LoadRow,
  type PlanRow,
  type StageRole,
  type StageRow,
  type StageState,
  type WorkRow,
  type WorkType,
} from './rules.ts';

export type TaskItem = {
  id: string;
  what: string;
  kind: string;
  assignee: string;
  assigned_by: string;
  due: string;
  start_on: string | null;
  after_ids: string[];
  status: 'open' | 'done';
  note: string | null;
  project_id: string | null;
  work_id: string | null;
  group_key: string | null;
  priority: string;
};
export type EventItem = { id: string; title: string; start_at: string; end_at: string; place: string | null; project_id: string | null; created_by: string };
export type ReminderItem = { id: string; at: string; body: string };
export type ProjectItem = { id: string; name: string; type: string; start_on: string; end_on: string; owner: string; description: string | null };
export type PlanWork = { w: WorkRow; stages: StageRow[]; projects: string[]; pendingKeys?: string[] };

// ---------------------------------------------------------------------------
// Days
// ---------------------------------------------------------------------------
const DAY_NAMES = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
export const MONTH_NAMES = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
const dow = (d: string) => new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10))).getUTCDay();
/** A moment as the pages say it: «الأربعاء 14 أكتوبر 18:00», in Riyadh. */
export function whenText(iso: string): string {
  const s = riyadhStamp(iso);
  return `${fdate(s.slice(0, 10))} ${s.slice(11)}`;
}
export const dayName = (d: string) => DAY_NAMES[dow(d)];
export const WEEK_DAYS = DAY_NAMES;
/** The week begins on Sunday, as the department's week does. */
export const weekStart = (d: string) => dayAdd(d, -dow(d));
export const daysFrom = (start: string, n: number) => Array.from({ length: n }, (_, i) => dayAdd(start, i));
/** The cells of a month view: whole weeks from the Sunday before the first to the Saturday after the last. */
export function monthCells(anchor: string): string[] {
  const first = `${anchor.slice(0, 7)}-01`;
  const y = +anchor.slice(0, 4);
  const m = +anchor.slice(5, 7);
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
  const start = weekStart(first);
  const end = dayAdd(weekStart(dayAdd(next, -1)), 6);
  return daysFrom(start, dayDiff(end, start) + 1);
}
export type CalView = 'day' | 'week' | 'month' | 'agenda';
/** The heading for the range on screen. */
export function rangeTitle(view: CalView, anchor: string): string {
  if (view === 'week') {
    const ws = weekStart(anchor);
    return `${sdate(ws)} إلى ${sdate(dayAdd(ws, 6))} ${ws.slice(0, 4)}`;
  }
  if (view === 'month') return `${MONTH_NAMES[+anchor.slice(5, 7) - 1]} ${anchor.slice(0, 4)}`;
  if (view === 'day') return `${fdate(anchor)} ${anchor.slice(0, 4)}`;
  return `من ${sdate(anchor)} لمدة أسبوعين`;
}
export const stepOf = (view: CalView) => (view === 'day' ? 1 : view === 'week' ? 7 : view === 'agenda' ? 14 : 0);
/** Previous or next range: a month moves by calendar month. */
export function shiftAnchor(view: CalView, anchor: string, dir: -1 | 1): string {
  if (view !== 'month') return dayAdd(anchor, dir * stepOf(view));
  let y = +anchor.slice(0, 4);
  let m = +anchor.slice(5, 7) + dir;
  if (m < 1) { m = 12; y--; }
  if (m > 12) { m = 1; y++; }
  return `${y}-${String(m).padStart(2, '0')}-01`;
}

// ---------------------------------------------------------------------------
// Calendar entries
// ---------------------------------------------------------------------------
export type CalKind = 'pub' | 'pubok' | 'plan' | 'move' | 'held' | 'done' | 'due' | 'stage' | 'task' | 'event' | 'evt' | 'rem';
/** The words and colour class of each kind, in the order of the key under the calendar. */
export const CAL_KIND: Record<CalKind, [string, string]> = {
  pub: ['مجدول', 'k-pub'],
  pubok: ['معتمد · لم يُجدول', 'k-ok'],
  plan: ['مقترح · لم يُعتمد بعد', 'k-plan'],
  move: ['موعد مطلوب', 'k-move'],
  held: ['معلّق حتى القرار', 'k-held'],
  done: ['نُشر', 'k-done'],
  due: ['تسليم', 'k-due'],
  stage: ['مرحلة', 'k-stage'],
  task: ['مهمة', 'k-task'],
  event: ['تغطية حدث', 'k-event'],
  evt: ['حدث', 'k-event'],
  rem: ['تذكير', 'k-rem'],
};
export const KEY_ORDER: CalKind[] = ['pub', 'pubok', 'plan', 'move', 'held', 'done', 'due', 'stage', 'task', 'evt', 'rem'];
const PUBLISHING: CalKind[] = ['pub', 'pubok', 'plan', 'move'];

export type CalFilter = { pub: boolean; due: boolean; stages: boolean; tasks: boolean; events: boolean; camps: boolean; rem: boolean };
export const FILTERS: [keyof CalFilter, string][] = [
  ['pub', 'النشر'], ['due', 'التسليم'], ['stages', 'المراحل'], ['tasks', 'المهام'], ['events', 'الأحداث'], ['camps', 'المشاريع'], ['rem', 'تذكيراتي'],
];
export const ALL_ON: CalFilter = { pub: true, due: true, stages: true, tasks: true, events: true, camps: true, rem: true };

export type CalEntry = {
  key: string;
  k: CalKind;
  /** Riyadh day and time: 'YYYY-MM-DD' and 'HH:MM' (empty for a whole day). */
  date: string;
  time: string;
  /** The instant, for publishing entries (authorisation and nearness are counted on it). */
  iso?: string;
  /** An account id, 'mail', 'ev' (events) or 'int' (deliveries, stages, tasks, reminders). */
  lane: string;
  ch?: string;
  w?: WorkRow;
  si?: number;
  /** A stage entry's stage name. */
  sn?: string;
  t?: TaskItem;
  ev?: EventItem;
  r?: ReminderItem;
  late?: boolean;
  risk?: boolean;
  near?: { title: string; time: string; id: string };
  multi?: boolean;
};
export type CalInput = {
  works: PlanWork[];
  tasks: TaskItem[];
  events: EventItem[];
  reminders: ReminderItem[];
  accounts: AccountRow[];
  me: string;
  today: string;
  nowIso: string;
  filter?: CalFilter;
  mine?: boolean;
  project?: string;
};

const stampOf = (iso: string) => riyadhStamp(iso);
const keyOf = (...p: (string | number | undefined | null)[]) => p.map((x) => x ?? '').join('|');

export function calEntries(x: CalInput): CalEntry[] {
  const f = x.filter ?? ALL_ON;
  const proj = x.project ?? 'all';
  const out: CalEntry[] = [];
  const acc = new Map(x.accounts.map((a) => [a.id, a]));
  const push = (e: Omit<CalEntry, 'key' | 'date' | 'time'> & { at: string; key?: string }) => {
    const { at, ...rest } = e;
    out.push({ ...rest, date: at.slice(0, 10), time: at.length > 10 ? at.slice(11, 16) : '', key: e.key ?? keyOf(e.k, e.w?.id, e.ch, e.t?.id, e.ev?.id ?? e.r?.id, e.si) });
  };
  const inProj = (projects: string[]) => proj === 'all' || projects.includes(proj);
  for (const it of x.works) {
    const w = it.w;
    if (w.closed_at) continue;
    if (x.mine && !involved(w, it.stages, x.me)) continue;
    if (!inProj(it.projects)) continue;
    if (f.pub && w.channels.length) {
      for (const c of w.channels) {
        const a = acc.get(c);
        const lane = !a ? c : a.platform === 'mail' ? 'mail' : c;
        const pub = (k: CalKind, iso: string | null) => iso && push({ k, at: stampOf(iso), iso, w, ch: c, lane });
        if (['PUBLISHED', 'PARTIAL', 'FAILED', 'PUBLISHING'].includes(w.status) && w.pub_at) pub('done', w.pub_at);
        else if (w.status === 'SCHEDULED') pub('pub', w.sched_at);
        else if (w.status === 'APPROVED' && w.proposed_at) pub('pubok', w.proposed_at);
        else if (w.status === 'IN_REVIEW' && w.move_from) {
          pub('held', w.move_from);
          pub('move', w.proposed_at);
        } else if (w.proposed_at && OUTSTANDING.includes(w.status)) pub('plan', w.proposed_at);
      }
    }
    const going = isOutstanding(w) && !!w.assignee;
    if (f.due && going) push({ k: 'due', at: w.due, w, lane: 'int', late: dayDiff(w.due, x.today) < 0 });
    if (f.stages && going)
      it.stages.forEach((s, i) => {
        if (!s.done_at && s.due_on) push({ k: 'stage', at: s.due_on, w, si: i, sn: s.name, lane: 'int', late: stageLate(s, x.today) });
      });
    if (f.events && w.type === 'event' && w.event_at) push({ k: 'event', at: stampOf(w.event_at), w, lane: 'ev' });
  }
  if (f.tasks) {
    const workOf = new Map(x.works.map((i) => [i.w.id, i]));
    for (const t of x.tasks) {
      if (t.status === 'done') continue;
      if (x.mine && t.assignee !== x.me && t.assigned_by !== x.me) continue;
      const wi = t.work_id ? workOf.get(t.work_id) : undefined;
      if (proj !== 'all' && t.project_id !== proj && !(wi && wi.projects.includes(proj))) continue;
      push({ k: 'task', at: stampOf(t.due), t, w: wi?.w, lane: 'int', late: Date.parse(t.due) < Date.parse(x.nowIso) });
    }
  }
  // An event that is not a work: one spanning several days shows on each of its days.
  if (f.events)
    for (const ev of x.events) {
      if (proj !== 'all' && ev.project_id !== proj) continue;
      const a = stampOf(ev.start_at);
      const b = stampOf(ev.end_at).slice(0, 10);
      let d = a.slice(0, 10);
      for (let n = 0; d <= b && n < 31; n++, d = dayAdd(d, 1))
        push({ k: 'evt', at: d === a.slice(0, 10) ? a : d, ev, lane: 'ev', multi: a.slice(0, 10) !== b, key: keyOf('evt', ev.id, d) });
    }
  if (f.rem) for (const r of x.reminders) push({ k: 'rem', at: stampOf(r.at), r, lane: 'int' });

  // Two publications of different works on the same account within two hours.
  const pubs = out.filter((e) => PUBLISHING.includes(e.k) && e.iso);
  for (const e of pubs)
    for (const o of pubs)
      if (o !== e && o.ch === e.ch && o.w?.id !== e.w?.id && Math.abs(Date.parse(o.iso!) - Date.parse(e.iso!)) < 120 * 60e3)
        e.near = { title: o.w!.title, time: o.time, id: o.w!.id };
  // An account whose authorisation will not cover the time.
  for (const e of out) {
    const a = e.ch ? acc.get(e.ch) : undefined;
    if (a && a.platform !== 'mail' && PUBLISHING.includes(e.k) && e.iso && !authOk(a, e.iso)) e.risk = true;
  }
  return out.sort((a, b) => (a.time || '00:00').localeCompare(b.time || '00:00'));
}

export function entryTitle(e: CalEntry): string {
  if (e.k === 'task') return e.t!.what;
  if (e.k === 'evt') return e.ev!.title;
  if (e.k === 'rem') return e.r!.body;
  if (e.k === 'stage') return `${e.sn} · ${e.w!.title}`;
  return e.w!.title;
}
/** A day with seven or more entries is busy (a warning only). Reminders and held times do not count. */
export const BUSY_DAY = 7;
export const dayCount = (all: CalEntry[], d: string) => all.filter((e) => e.date === d && e.k !== 'rem' && e.k !== 'held').length;
/** Deliveries, stages and tasks on a day: the team's load. */
export function dayLoad(all: CalEntry[], d: string): { n: number; late: boolean } {
  const l = all.filter((e) => e.date === d && (e.k === 'due' || e.k === 'stage' || e.k === 'task'));
  return { n: l.length, late: l.some((e) => e.late) };
}
/** Day and list views show one row per work and time, its accounts together. */
export function grouped(list: CalEntry[]): { e: CalEntry; chs: string[] }[] {
  const g = new Map<string, { e: CalEntry; chs: string[] }>();
  for (const e of list) {
    const k = e.ch ? keyOf(e.k, e.w?.id, e.date, e.time) : e.key;
    if (!g.has(k)) g.set(k, { e, chs: [] });
    if (e.ch) g.get(k)!.chs.push(e.ch);
  }
  return [...g.values()];
}

/** One lane per account in use or active, then mail, events, and deliveries with tasks. */
export function lanesOf(accounts: AccountRow[], works: Pick<WorkRow, 'closed_at' | 'channels'>[]): [string, string][] {
  const used = new Set(works.filter((w) => !w.closed_at).flatMap((w) => w.channels));
  const acc = accounts.filter((a) => a.platform !== 'mail' && (a.active || used.has(a.id)));
  return [...acc.map((a): [string, string] => [a.id, `${platformLabels[a.platform]} · ${a.label}`]), ['mail', 'البريد'], ['ev', 'الأحداث'], ['int', 'التسليم والمهام']];
}

/** Project bands across a range of days. */
export type Band = { id: string; name: string; tone: number; from: number; to: number; cut0: boolean; cut1: boolean };
export function bandsFor(projects: ProjectItem[], start: string, days: number, only = 'all'): Band[] {
  const end = dayAdd(start, days - 1);
  return projects
    .filter((p) => p.start_on <= end && p.end_on >= start && (only === 'all' || only === p.id))
    .map((p) => {
      const a = p.start_on < start ? start : p.start_on;
      const b = p.end_on > end ? end : p.end_on;
      return { id: p.id, name: p.name, tone: toneOf(p.id), from: dayDiff(a, start), to: dayDiff(b, start), cut0: p.start_on < start, cut1: p.end_on > end };
    });
}
/** A steady colour per project, from its id. */
export function toneOf(id: string): number {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h % 4;
}

/** Bars for work across several days: open stages with a start and an end, and tasks with a start. */
export type Span = { key: string; who: string; label: string; st: StageState; late: boolean; from: number; to: number; cut0: boolean; cut1: boolean; workId?: string };
export function spansFor(x: Pick<CalInput, 'works' | 'tasks' | 'me' | 'today' | 'nowIso' | 'mine' | 'project' | 'filter'>, start: string, days: number): Span[] {
  const f = x.filter ?? ALL_ON;
  const proj = x.project ?? 'all';
  const end = dayAdd(start, days - 1);
  const raw: (Omit<Span, 'from' | 'to' | 'cut0' | 'cut1'> & { a: string; b: string })[] = [];
  if (f.stages)
    for (const it of x.works) {
      const w = it.w;
      if (w.closed_at || !isOutstanding(w) || !w.assignee) continue;
      if (proj !== 'all' && !it.projects.includes(proj)) continue;
      it.stages.forEach((s, i) => {
        if (s.done_at || !s.start_on || !s.due_on || s.start_on === s.due_on) return;
        if (x.mine && s.who !== x.me) return;
        if (s.due_on < start || s.start_on > end) return;
        raw.push({ key: keyOf('stage', w.id, '', '', '', i), who: s.who ?? '', label: `${s.name} · ${w.title}`, st: stageState(it.stages, i), late: stageLate(s, x.today), a: s.start_on, b: s.due_on, workId: w.id });
      });
    }
  if (f.tasks)
    for (const t of x.tasks) {
      if (t.status === 'done' || !t.start_on) continue;
      if (x.mine && t.assignee !== x.me && t.assigned_by !== x.me) continue;
      const wi = t.work_id ? x.works.find((i) => i.w.id === t.work_id) : undefined;
      if (proj !== 'all' && t.project_id !== proj && !(wi && wi.projects.includes(proj))) continue;
      const b = riyadhStamp(t.due).slice(0, 10);
      if (b < start || t.start_on > end) continue;
      const waiting = t.after_ids.some((id) => x.tasks.some((o) => o.id === id && o.status !== 'done'));
      raw.push({ key: keyOf('task', wi?.w.id, '', t.id, '', ''), who: t.assignee, label: t.what, st: waiting ? 'waiting' : 'ready', late: Date.parse(t.due) < Date.parse(x.nowIso), a: t.start_on, b, workId: wi?.w.id });
    }
  return raw.map(({ a, b, ...s }) => {
    const aa = a < start ? start : a;
    const bb = b > end ? end : b;
    return { ...s, from: dayDiff(aa, start), to: dayDiff(bb, start), cut0: a < start, cut1: b > end };
  });
}

// ---------------------------------------------------------------------------
// Who may move what from the calendar (the database decides each)
// ---------------------------------------------------------------------------
/** A publish date: a request to move it, by the leaders, the work's owner or the publisher. */
export const canRequestMove = (w: Pick<WorkRow, 'closed_at' | 'assignee' | 'status' | 'proposed_at'>, me: string, r: Role) =>
  !w.closed_at && (isLead(r) || w.assignee === me || canPublish(r)) && (w.status === 'SCHEDULED' || (w.status === 'APPROVED' && !!w.proposed_at));
/** Only «موعد النشر» waits: the move can be approved or withdrawn on its own. */
export const moveOnlyDate = (w: Pick<WorkRow, 'status' | 'move_from'>, pendingKeys: string[] | undefined) =>
  w.status === 'IN_REVIEW' && !!w.move_from && !!pendingKeys && pendingKeys.length === 1 && pendingKeys[0] === 'date';
export const canCancelMove = (w: Pick<WorkRow, 'status' | 'move_from' | 'move_by'>, pendingKeys: string[] | undefined, me: string, r: Role) =>
  moveOnlyDate(w, pendingKeys) && (me === w.move_by || isLead(r) || canPublish(r));
/** Why this person may not approve the new date; empty when they may. The move was sent by whoever asked for it. */
export const moveBlock = (w: WorkRow, me: string, r: Role) => decideBlock(w, w.move_by, me, r);
/** Leaders move deliveries and stages directly. */
export const canMoveDates = (r: Role) => isLead(r);

/** Why a delivery or stage cannot take this date; empty when it can. Mirrors work_update. */
export function dueMoveIssue(w: Pick<WorkRow, 'due'>, stages: Pick<StageRow, 'name' | 'due_on' | 'done_at' | 'after_pos'>[], si: number | null, date: string): string {
  if (!date) return 'اختر التاريخ.';
  if (si === null) {
    const bad = stages.find((s) => !s.done_at && s.due_on && s.due_on > date);
    return bad ? `مرحلة «${bad.name}» موعدها ${fdate(bad.due_on!)} بعد التسليم الجديد. انقلها أولاً أو اختر يوماً بعدها.` : '';
  }
  if (date > w.due) return `موعد المرحلة بعد التسليم النهائي (${fdate(w.due)}). مدّ التسليم أولاً.`;
  const wait = stages[si].after_pos.map((j) => stages[j]).find((o) => o && !o.done_at && o.due_on && o.due_on > date);
  return wait ? `«${stages[si].name}» تنتظر «${wait.name}» التي تنتهي ${fdate(wait.due_on!)}، فلا يكون موعدها قبلها.` : '';
}

/** Warnings for a new publish time, before the request is sent: authorisation and nearness. They do not block. */
export function moveWarnings(w: Pick<WorkRow, 'id' | 'channels'>, iso: string, accounts: AccountRow[], entries: CalEntry[], nowIso: string): string[] {
  const out: string[] = [];
  for (const c of w.channels) {
    const a = accounts.find((x) => x.id === c);
    if (!a || a.platform === 'mail' || authOk(a, iso)) continue;
    const name = `${platformLabels[a.platform]} · ${a.label}`;
    out.push(`تفويض ${name} ${authOk(a, nowIso) && a.authorized_until ? `ينتهي ${whenText(a.authorized_until)}` : 'منتهٍ'}، قبل الموعد الجديد.`);
  }
  const seen = new Set<string>();
  for (const e of entries)
    if (PUBLISHING.includes(e.k) && e.iso && e.w && e.w.id !== w.id && e.ch && w.channels.includes(e.ch) && Math.abs(Date.parse(e.iso) - Date.parse(iso)) < 120 * 60e3 && !seen.has(e.w.id)) {
      seen.add(e.w.id);
      out.push(`على الحساب نفسه «${e.w.title}» ${whenText(e.iso)}، خلال ساعتين من الموعد الجديد.`);
    }
  return out;
}

// ---------------------------------------------------------------------------
// «المشاريع»
// ---------------------------------------------------------------------------
export function projState(p: Pick<ProjectItem, 'start_on' | 'end_on'>, today: string): ['جارٍ' | 'قادم' | 'منتهٍ', string] {
  if (p.end_on < today) return ['منتهٍ', ''];
  if (p.start_on > today) return ['قادم', 'sched'];
  return ['جارٍ', 'info'];
}
export const projWorks = <T extends PlanWork>(pid: string, works: T[]): T[] => works.filter((x) => x.projects.includes(pid));
export const projTasks = (pid: string, works: PlanWork[], tasks: TaskItem[]) =>
  tasks.filter((t) => t.project_id === pid || (!!t.work_id && works.some((x) => x.w.id === t.work_id && x.projects.includes(pid))));
/** Done stages and tasks over all of them, open works only. */
export function projProgress(works: PlanWork[], tasks: TaskItem[]): number {
  const st = works.filter((x) => !x.w.closed_at).flatMap((x) => x.stages);
  const total = st.length + tasks.length;
  if (!total) return 0;
  return Math.round(((st.filter((s) => s.done_at).length + tasks.filter((t) => t.status === 'done').length) / total) * 100);
}
/** Late: works past delivery plus late stages. */
export function projLate(works: PlanWork[], today: string): number {
  return works.reduce((n, x) => n + (isOutstanding(x.w) && x.w.assignee && dayDiff(x.w.due, today) < 0 ? 1 : 0) + (isOutstanding(x.w) ? x.stages.filter((s) => stageLate(s, today)).length : 0), 0);
}
/** The next date in the project from today: a delivery, a stage or an event. */
export function projNext(works: PlanWork[], events: EventItem[], today: string): [string, string] | null {
  const c: [string, string][] = [];
  for (const x of works) {
    if (!isOutstanding(x.w) || x.w.closed_at) continue;
    if (x.w.due >= today) c.push([x.w.due, `تسليم «${x.w.title}»`]);
    for (const s of x.stages) if (!s.done_at && s.due_on && s.due_on >= today) c.push([s.due_on, `«${s.name}» في «${x.w.title}»`]);
  }
  for (const e of events) {
    const d = riyadhStamp(e.start_at).slice(0, 10);
    if (d >= today) c.push([d, e.title]);
  }
  c.sort((a, b) => a[0].localeCompare(b[0]));
  return c[0] ?? null;
}
/** Everyone on the project: its owner, the works' owners, the people on the stages and the tasks. */
export function projPeople(owner: string, works: PlanWork[], tasks: TaskItem[]): string[] {
  const s = new Set<string>([owner]);
  for (const x of works) {
    if (x.w.assignee) s.add(x.w.assignee);
    for (const st of x.stages) if (st.who) s.add(st.who);
  }
  for (const t of tasks) s.add(t.assignee);
  return [...s];
}
/** The timeline's range: the project's dates, widened to its stages and deliveries. */
export function projRange(p: Pick<ProjectItem, 'start_on' | 'end_on'>, works: PlanWork[]): [string, string] {
  let a = p.start_on;
  let b = p.end_on;
  for (const x of works) {
    if (x.w.closed_at) continue;
    for (const s of x.stages) {
      if (s.start_on && s.start_on < a) a = s.start_on;
      if (s.due_on && s.due_on > b) b = s.due_on;
    }
    if (x.w.due > b) b = x.w.due;
  }
  return [a, b];
}

/** A works plan row in the new project dialog. */
export type PlanDraft = { title: string; type: WorkType; due: string };
/**
 * Each planned work as work_create takes it: its stages from the type template, each given to
 * the least busy person in its role (counting what this plan has already given out), dated back
 * from its due date; its owner the least busy in the type's main role. A post goes on the active
 * accounts that are not YouTube (YouTube carries video only); the accounts can be changed when
 * the work is sent for review.
 */
export function planWorks(rows: PlanDraft[], load: LoadRow[], today: string, accounts: AccountRow[]) {
  const busy = new Map(load.map((p) => [p.email, p.open_stages + p.open_tasks]));
  const pick = (role: StageRole): { who: string; why: string } => {
    const pool = load.filter((p) => p.role === role).sort((a, b) => (busy.get(a.email)! - busy.get(b.email)!) || (a.email < b.email ? -1 : 1));
    if (!pool.length) return { who: '', why: 'لا يوجد في القسم من يحمل هذا الدور' };
    const p = pool[0];
    busy.set(p.email, busy.get(p.email)! + 1);
    return { who: p.email, why: pool.length > 1 ? 'الأقل حملاً في الدور' : 'الوحيد في هذا الدور' };
  };
  const postAccounts = accounts.filter((a) => a.active && a.platform !== 'mail' && a.platform !== 'youtube').map((a) => a.id);
  const issues: string[] = [];
  const works = rows
    .filter((r) => r.title.trim())
    .map((r) => {
      if (!r.due || r.due < today) issues.push(`اختر موعد تسليم قادماً لـ «${r.title.trim()}».`);
      if (r.type === 'post' && !postAccounts.length) issues.push(`«${r.title.trim()}» منشور يحتاج حساباً مرتبطاً نشطاً، ولا يوجد بعد.`);
      const steps = TYPE_PLANS[r.type];
      const dates = r.due ? backSchedule(steps, r.due, today) : steps.map(() => ({ start: '', due: '' }));
      const owner = pick(MAIN_ROLE[r.type]);
      if (!owner.who) issues.push(`لا يوجد من يتولى «${r.title.trim()}» في دوره.`);
      const plan: PlanRow[] = steps.map(([n, role, days, after], i) => ({ n, role, who: pick(role).who, start: dates[i].start, due: dates[i].due, after: [...after], days, gate: false, note: '' }));
      return {
        type: r.type,
        title: r.title.trim(),
        due: r.due,
        assignee: owner.who,
        source: 'plan',
        priority: 'normal',
        channels: r.type === 'post' ? postAccounts : [],
        stages: planPayload(plan),
      };
    });
  return { works, issues };
}

// ---------------------------------------------------------------------------
// «الطلبات»
// ---------------------------------------------------------------------------
export type RequestRow = {
  id: string;
  kind: 'extension' | 'access';
  status: 'pending' | 'approved' | 'declined' | 'withdrawn';
  requested_by: string;
  requested_at: string;
  from_at: string | null;
  to_at: string | null;
  reason: string;
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
  extend_work: boolean;
  stage_id: string | null;
  stage_name: string | null;
  work_id: string | null;
  work_title: string | null;
  work_due: string | null;
  task_id: string | null;
  task_what: string | null;
  task_assigned_by: string | null;
  folder_id: string | null;
  folder_name: string | null;
  can_decide: boolean;
};
export type HeldMail = { id: string; thread_id: string; author: string; created_at: string; subject: string };
export type InboxType = 'extension' | 'access' | 'move' | 'work' | 'mailhold' | 'confirm' | 'delegation';
export const INBOX_TYPE: Record<InboxType, [string, string]> = {
  extension: ['طلب تمديد', 'warn'],
  access: ['طلب وصول', 'info'],
  move: ['نقل موعد نشر', 'sched'],
  work: ['عمل جديد', 'approved'],
  mailhold: ['اعتماد بريد خارجي', 'review'],
  confirm: ['تأكيد نشر', 'danger'],
  delegation: ['تفويض', ''],
};
export type InboxItem = {
  key: string;
  src: 'req' | 'move' | 'work' | 'confirm' | 'mail';
  type: InboxType;
  by: string;
  at: string;
  title: string;
  status: RequestRow['status'];
  /** This person decides it now. */
  mine: boolean;
  /** This person sent it. */
  sent: boolean;
  q?: RequestRow;
  w?: WorkRow;
  m?: HeldMail;
};
export type InboxTab = 'mine' | 'sent' | 'done' | 'deleg';
export const INBOX_TABS: [InboxTab, string][] = [['mine', 'بانتظار قراري'], ['sent', 'طلباتي'], ['done', 'المنتهية'], ['deleg', 'التفويض']];

export function requestTitle(q: RequestRow): string {
  const to = q.to_at ? fdate(riyadhStamp(q.to_at).slice(0, 10)) : '';
  if (q.kind === 'extension' && q.stage_id) return `طلب تمديد «${q.stage_name ?? 'مرحلة'}» في «${q.work_title ?? ''}» إلى ${to}`;
  if (q.kind === 'extension') return `طلب تمديد مهمة «${q.task_what ?? ''}» إلى ${to}`;
  return `طلب وصول إلى مجلد «${q.folder_name ?? 'مجلد مقيّد'}»`;
}

export function inboxItems(x: { requests: RequestRow[]; works: PlanWork[]; held: HeldMail[]; me: string; role: Role }): InboxItem[] {
  const out: InboxItem[] = [];
  const lead = isLead(x.role);
  for (const q of x.requests)
    out.push({ key: `q:${q.id}`, src: 'req', type: q.kind, by: q.requested_by, at: q.requested_at, title: requestTitle(q), status: q.status, mine: q.can_decide, sent: q.requested_by === x.me, q });
  for (const it of x.works) {
    const w = it.w;
    if (w.closed_at) continue;
    if (w.status === 'IN_REVIEW' && w.move_from)
      out.push({
        key: `m:${w.id}`, src: 'move', type: 'move', by: w.move_by ?? '', at: w.updated_at, w, status: 'pending', sent: w.move_by === x.me,
        title: `نقل موعد «${w.title}» من ${whenText(w.move_from)} إلى ${w.proposed_at ? whenText(w.proposed_at) : ''}`,
        mine: moveOnlyDate(w, it.pendingKeys) && !moveBlock(w, x.me, x.role),
      });
    if (isRequest(w))
      out.push({ key: `w:${w.id}`, src: 'work', type: 'work', by: w.created_by, at: w.created_at, w, status: 'pending', mine: lead, sent: w.created_by === x.me, title: `طلب عمل: «${w.title}»${w.requester ? ` لـ ${w.requester}` : ''}` });
    if (w.confirm_pending)
      out.push({ key: `c:${w.id}`, src: 'confirm', type: 'confirm', by: '', at: w.sched_at ?? w.updated_at, w, status: 'pending', mine: canPublish(x.role), sent: false, title: `تأكيد نشر «${w.title}» في موعده ${w.sched_at ? whenText(w.sched_at) : ''}` });
  }
  for (const m of x.held)
    out.push({ key: `h:${m.id}`, src: 'mail', type: 'mailhold', by: m.author, at: m.created_at, m, status: 'pending', mine: lead && m.author !== x.me, sent: m.author === x.me, title: `بريد خارجي: «${m.subject}»` });
  return out.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}
export function inTabInbox(i: InboxItem, tab: InboxTab): boolean {
  if (tab === 'mine') return i.status === 'pending' && i.mine;
  if (tab === 'sent') return i.sent;
  if (tab === 'done') return i.status !== 'pending' && (i.sent || i.src === 'req');
  return false;
}
export const STATUS_WORD: Record<RequestRow['status'], [string, string]> = {
  pending: ['بانتظار القرار', 'review'], approved: ['اعتُمد', 'approved'], declined: ['رُفض', 'danger'], withdrawn: ['سُحب', ''],
};

// Work cycle rules the interface needs to explain itself: stages and what they wait for,
// the plan editor, approval parts bound to versions, who may decide, publishing outcomes,
// extension impact, and the Arabic wording of all of it. Pure, covered by
// tests/work.test.mjs. The database (supabase/migrations/*work_cycle*) enforces every
// rule; this file only predicts its answers so a page can say them before a click.
// The reference for every rule is «النموذج المرجعي للمركز», version 5
// (reference/comms-hub-reference-v5.html).
import type { Role } from '../domain.ts';
import { dbErrorText } from '../media/rules.ts';

export type WorkType = 'post' | 'video' | 'design' | 'announce' | 'email' | 'press' | 'event';
export type WorkStatus =
  | 'DRAFT' | 'IN_PRODUCTION' | 'IN_REVIEW' | 'CHANGES_REQUESTED' | 'REJECTED'
  | 'APPROVED' | 'SCHEDULED' | 'PUBLISHING' | 'PUBLISHED' | 'PARTIAL' | 'FAILED';
export type Priority = 'normal' | 'high' | 'urgent';
export type Platform = 'instagram' | 'x' | 'linkedin' | 'youtube' | 'mail';
export type StageRole = '' | 'writer' | 'designer' | 'producer' | 'assistant' | 'director' | 'publisher';
export type StageState = 'done' | 'active' | 'ready' | 'waiting';
export type Tier = 'decide' | 'attention' | 'info';

export type WorkRow = {
  id: string;
  no: number;
  title: string;
  type: WorkType;
  status: WorkStatus;
  priority: Priority;
  restricted: boolean;
  source: string;
  requester: string | null;
  brief: string | null;
  created_by: string;
  assignee: string | null;
  people: string[];
  due: string;
  event_at: string | null;
  place: string | null;
  channels: string[];
  proposed_at: string | null;
  sched_at: string | null;
  pub_at: string | null;
  pub_mode: 'auto' | 'ask' | null;
  pending_sched: boolean;
  confirm_pending: boolean;
  move_from: string | null;
  move_by: string | null;
  review_cycle: number | null;
  results: Record<string, { ok: boolean; at: string; why: string | null }>;
  closed_at: string | null;
  closed_by: string | null;
  close_reason: string | null;
  created_at: string;
  updated_at: string;
};

export type StageRow = {
  id: string;
  work_id: string;
  pos: number;
  name: string;
  role: StageRole;
  who: string | null;
  start_on: string | null;
  due_on: string | null;
  after_pos: number[];
  days: number;
  note: string | null;
  gate: boolean;
  gate_by: string | null;
  gate_at: string | null;
  started_at: string | null;
  done_at: string | null;
  done_by: string | null;
};

export type AccountRow = {
  id: string;
  platform: Platform;
  label: string;
  handle: string | null;
  purpose: string | null;
  authorized_until: string | null;
  publishers: string[];
  mode: 'auto' | 'ask';
  active: boolean;
  fixed: boolean;
};

export type TaskRow = {
  id: string;
  what: string;
  assignee: string;
  assigned_by: string;
  due: string;
  start_on: string | null;
  after_ids: string[];
  status: 'open' | 'done';
};

// ---------------------------------------------------------------------------
// Words. The status and role keys stay English in code and never reach the screen.
// ---------------------------------------------------------------------------
export const statusLabels: Record<WorkStatus, string> = {
  DRAFT: 'مسودة', IN_PRODUCTION: 'قيد الإنتاج', IN_REVIEW: 'قيد المراجعة', CHANGES_REQUESTED: 'بحاجة إلى تعديل',
  REJECTED: 'مرفوض', APPROVED: 'جاهز للنشر', SCHEDULED: 'مجدول', PUBLISHING: 'جارٍ النشر', PUBLISHED: 'منشور',
  PARTIAL: 'نشر جزئي', FAILED: 'فشل النشر',
};
export const typeLabels: Record<WorkType, string> = {
  post: 'منشور اجتماعي', video: 'فيديو', design: 'تصميم', announce: 'إعلان', email: 'بريد', press: 'بيان صحفي', event: 'تغطية حدث',
};
export const textLabels: Record<WorkType, string> = {
  post: 'النص الأساسي', video: 'نص الفيديو', design: 'النص على التصميم', announce: 'نص الإعلان', email: 'نص الرسالة',
  press: 'نص البيان', event: 'نص التغطية',
};
export const priorityLabels: Record<Priority, string> = { normal: 'عادية', high: 'مرتفعة', urgent: 'عاجل' };
export const sourceLabels: Record<string, string> = {
  plan: 'خطة المشروع', dept: 'طلب من إدارة أخرى', directive: 'توجيه من الإدارة', occasion: 'مناسبة', coverage: 'تغطية',
  external: 'طلب خارجي من البريد', member: 'طلب من عضو',
};
export const platformLabels: Record<Platform, string> = {
  instagram: 'إنستغرام', x: 'X', linkedin: 'لينكدإن', youtube: 'يوتيوب', mail: 'البريد',
};
export const stageStateLabels: Record<StageState, string> = {
  done: 'منتهية', active: 'جارية', ready: 'جاهزة للبدء', waiting: 'تنتظر',
};
export const tierLabels: Record<Tier, string> = { decide: 'يحتاج قرارك', attention: 'يحتاج انتباهك', info: 'للعلم' };
export const projectTypeLabels: Record<string, string> = { campaign: 'حملة', event: 'فعالية', initiative: 'مبادرة', other: 'أخرى' };
export const taskKindLabels: Record<string, string> = {
  copy: 'كتابة عنوان ووصف', design: 'تصميم أو تعديل تصميم', edit: 'مونتاج أو تعديل', review: 'مراجعة', publish: 'تجهيز النشر', other: 'مهمة أخرى',
};

/** Still being made or decided: what «العمل» counts as open. */
export const OUTSTANDING: WorkStatus[] = ['DRAFT', 'IN_PRODUCTION', 'IN_REVIEW', 'CHANGES_REQUESTED', 'REJECTED'];
export const BOARD: WorkStatus[] = ['DRAFT', 'IN_PRODUCTION', 'IN_REVIEW', 'CHANGES_REQUESTED', 'APPROVED', 'SCHEDULED', 'PUBLISHED'];
/** Press release, mail and announcement are approved as one package. */
export const WHOLE_TYPES: WorkType[] = ['press', 'email', 'announce'];
export const PUBLISHABLE_TYPES: WorkType[] = ['post', 'video', 'design', 'announce', 'event'];
/** YouTube carries video only. */
export const VIDEO_ONLY: Platform[] = ['youtube'];
export const PLATFORM_ORDER: Platform[] = ['instagram', 'x', 'linkedin', 'youtube'];

// ---------------------------------------------------------------------------
// Plans: [name, role, days, waits for]. Stages without a shared wait run side by side.
// ---------------------------------------------------------------------------
export type PlanStep = [string, StageRole, number, number[]];
export const TYPE_PLANS: Record<WorkType, PlanStep[]> = {
  post: [['كتابة النص', 'writer', 1, []], ['نسخ المنصات', 'writer', 1, [0]], ['المرئيات', 'designer', 2, [0]], ['التدقيق', 'assistant', 1, [1, 2]]],
  video: [['النص', 'writer', 2, []], ['التصوير', 'producer', 2, [0]], ['المونتاج', 'producer', 3, [1]], ['الرسوم والصوت', 'designer', 2, [0]], ['التدقيق', 'assistant', 1, [2, 3]]],
  design: [['الفكرة', 'designer', 1, []], ['المسودة الأولى', 'designer', 2, [0]], ['التصميم النهائي', 'designer', 2, [1]], ['المقاسات', 'designer', 1, [2]]],
  announce: [['كتابة النص', 'writer', 1, []], ['المرئيات', 'designer', 1, [0]], ['التدقيق', 'assistant', 1, [0, 1]]],
  email: [['كتابة النص', 'writer', 1, []], ['قائمة المستلمين', 'assistant', 1, []], ['التدقيق', 'assistant', 1, [0, 1]]],
  press: [['جمع المعلومات', 'writer', 1, []], ['كتابة البيان', 'writer', 1, [0]], ['التدقيق', 'assistant', 1, [1]]],
  event: [['التخطيط', 'assistant', 1, []], ['التصوير يوم الحدث', 'producer', 1, [0]], ['المعالجة', 'producer', 1, [1]], ['التسليم', 'designer', 1, [2]]],
};
/** Ready-made stages for the free plan editor: [name, role, days]. */
export const STAGE_LIBRARY: [string, StageRole, number][] = [
  ['تدقيق لغوي', 'assistant', 1], ['مراجعة قانونية', 'director', 2], ['ترجمة', 'writer', 2], ['تعليق صوتي', 'producer', 1],
  ['تصوير', 'producer', 1], ['مونتاج', 'producer', 2], ['تصميم', 'designer', 2], ['مقاسات المنصات', 'designer', 1],
  ['اعتماد الإدارة', 'director', 1], ['تجهيز النشر', 'publisher', 1],
];
/** Which role a task kind goes to when assigning automatically. */
export const KIND_ROLE: Record<string, StageRole> = { copy: 'writer', design: 'designer', edit: 'producer', review: 'assistant', publish: 'publisher' };
/** The role that usually leads a work of this type, for a project's works plan. */
export const MAIN_ROLE: Record<WorkType, StageRole> = {
  post: 'writer', video: 'producer', design: 'designer', announce: 'writer', email: 'writer', press: 'writer', event: 'assistant',
};

// ---------------------------------------------------------------------------
// Who may do what (the database decides; administrators act as any role)
// ---------------------------------------------------------------------------
export const isLead = (r: Role) => r === 'director' || r === 'assistant' || r === 'admin';
/** Approvers, urgent work included (owner decision of 2026-10-12). */
export const isApprover = (r: Role) => isLead(r);
export const isUrgentApprover = (r: Role) => isLead(r);
export const canCreateWork = (r: Role) => r !== 'publisher';
export const canPublish = (r: Role) => r === 'publisher' || r === 'admin';
export const canManageAccounts = (r: Role) => isLead(r);
export const canAssignTasksToOthers = (r: Role) => isLead(r) || r === 'producer';
export const canMakeProject = (r: Role) => isLead(r);
export const canSaveTemplate = (r: Role) => isLead(r);

export function involved(w: Pick<WorkRow, 'assignee' | 'created_by' | 'people'>, stages: Pick<StageRow, 'who'>[], me: string) {
  return w.assignee === me || w.created_by === me || w.people.includes(me) || stages.some((s) => s.who === me);
}
export function canSeeWork(w: Pick<WorkRow, 'restricted' | 'assignee' | 'created_by' | 'people'>, stages: Pick<StageRow, 'who'>[], me: string, r: Role) {
  return !w.restricted || isLead(r) || involved(w, stages, me);
}
export const isRequest = (w: Pick<WorkRow, 'assignee' | 'closed_at'>) => !w.closed_at && !w.assignee;
export const isOutstanding = (w: Pick<WorkRow, 'status' | 'closed_at'>) => !w.closed_at && OUTSTANDING.includes(w.status);
export const isWhole = (t: WorkType) => WHOLE_TYPES.includes(t);
/** Text can be edited in production and after approval (which re-opens review), not while a decision is pending. */
export const textEditable = (w: Pick<WorkRow, 'status' | 'closed_at'>) =>
  !w.closed_at && ['DRAFT', 'IN_PRODUCTION', 'CHANGES_REQUESTED', 'REJECTED', 'APPROVED', 'SCHEDULED'].includes(w.status);

// ---------------------------------------------------------------------------
// Dates: plain 'YYYY-MM-DD' strings, counted in whole days
// ---------------------------------------------------------------------------
const dayNum = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 864e5;
export const dayAdd = (d: string, n: number) => new Date((dayNum(d) + n) * 864e5).toISOString().slice(0, 10);
export const dayDiff = (a: string, b: string) => dayNum(a) - dayNum(b);
/** Today in Riyadh, the department's clock. */
export const riyadhToday = (now: number = Date.now()) => new Date(now + 3 * 3600e3).toISOString().slice(0, 10);

export function nDays(n: number): string {
  return n === 1 ? 'يوماً واحداً' : n === 2 ? 'يومين' : n <= 10 ? `${n} أيام` : `${n} يوماً`;
}
/** How the due date reads in the list: late, due today, soon, delivered. */
export function dueNote(w: Pick<WorkRow, 'due' | 'status' | 'closed_at' | 'assignee'>, today: string): { text: string; tone: '' | 'late' | 'soon' | 'ok' } {
  if (w.closed_at) return { text: 'مغلق', tone: '' };
  if (!w.assignee) return { text: `المطلوب ${w.due}`, tone: '' };
  if (!OUTSTANDING.includes(w.status)) return { text: 'سُلّم', tone: 'ok' };
  const d = dayDiff(w.due, today);
  if (d < 0) return { text: `متأخر ${nDays(-d)}`, tone: 'late' };
  if (d === 0) return { text: 'يستحق اليوم', tone: 'soon' };
  if (d === 1) return { text: 'يستحق غداً', tone: 'soon' };
  if (d === 2) return { text: 'يستحق بعد يومين', tone: 'soon' };
  return { text: `بعد ${inDays(d)}`, tone: '' };
}
export function inDays(n: number): string {
  return n === 1 ? 'يوم' : n === 2 ? 'يومين' : n <= 10 ? `${n} أيام` : `${n} يوماً`;
}

// ---------------------------------------------------------------------------
// Stages: state, waits, hand-over
// ---------------------------------------------------------------------------
type StageLike = Pick<StageRow, 'done_at' | 'started_at' | 'gate' | 'gate_by' | 'after_pos'>;
/** Finished, and if it is an approval point, approved. Only then do the stages after it start. */
export const cleared = (s: StageLike | undefined) => !s || (!!s.done_at && (!s.gate || !!s.gate_by));
export const gatePending = (s: StageLike) => !!s.done_at && s.gate && !s.gate_by;
export function stageState(stages: StageLike[], i: number): StageState {
  const s = stages[i];
  if (s.done_at) return 'done';
  if (s.started_at) return 'active';
  return s.after_pos.every((j) => cleared(stages[j])) ? 'ready' : 'waiting';
}
export const waitsFor = (stages: StageLike[], i: number) => stages[i].after_pos.filter((j) => !cleared(stages[j]));
/** Everything downstream of a stage, nearest first. */
export function dependents(stages: Pick<StageRow, 'after_pos'>[], i: number): number[] {
  const out: number[] = [];
  const q = [i];
  while (q.length) {
    const x = q.shift()!;
    stages.forEach((s, k) => { if (s.after_pos.includes(x) && !out.includes(k)) { out.push(k); q.push(k); } });
  }
  return out;
}

// ---------------------------------------------------------------------------
// The plan editor. Rows are in order; `after` holds earlier positions only.
// ---------------------------------------------------------------------------
export type PlanRow = {
  id?: string;
  n: string;
  role: StageRole;
  who: string;
  start: string;
  due: string;
  after: number[];
  days: number;
  gate: boolean;
  note: string;
  done?: boolean;
};

export function stepDays(r: Pick<PlanRow, 'days' | 'start' | 'due'>): number {
  if (r.days > 0) return r.days;
  if (r.start && r.due && r.due >= r.start) return dayDiff(r.due, r.start) + 1;
  return 1;
}
export function planInsert(P: PlanRow[], at: number, row: PlanRow): PlanRow[] {
  const out = P.map((s) => ({ ...s, after: s.after.map((j) => (j >= at ? j + 1 : j)) }));
  out.splice(at, 0, row);
  return out;
}
export function planRemove(P: PlanRow[], k: number): PlanRow[] {
  return P.filter((_, i) => i !== k).map((s) => ({ ...s, after: s.after.filter((j) => j !== k).map((j) => (j > k ? j - 1 : j)) }));
}
/** Move a stage. A stage only waits for stages above it, so a wait that would now point down is removed and reported. */
export function planMove(P: PlanRow[], from: number, to: number): { plan: PlanRow[]; dropped: string[] } {
  if (from === to || to < 0 || to >= P.length) return { plan: P, dropped: [] };
  const order = P.map((_, i) => i);
  order.splice(from, 1);
  order.splice(to, 0, from);
  const pos: Record<number, number> = {};
  order.forEach((old, neu) => { pos[old] = neu; });
  const dropped: string[] = [];
  const plan = order.map((old, i) => {
    const s = P[old];
    const keep: number[] = [];
    s.after.forEach((j) => {
      if (pos[j] < i) keep.push(pos[j]);
      else dropped.push(`«${s.n}» لم تعد تنتظر «${P[j].n}» لأنها صارت بعدها`);
    });
    return { ...s, after: keep.sort((a, b) => a - b) };
  });
  return { plan, dropped };
}
/** Dates from durations: forward from today, or backwards from the final due date. Finished stages keep theirs. */
export function planCalc(P: PlanRow[], mode: 'fwd' | 'back', today: string, due?: string): PlanRow[] {
  const out = P.map((s) => ({ ...s }));
  if (mode === 'fwd' || !due) {
    out.forEach((s) => {
      if (s.done) return;
      let st = today;
      s.after.forEach((j) => { const o = out[j]; if (o?.due) { const nx = dayAdd(o.due, 1); if (nx > st) st = nx; } });
      s.start = st;
      s.due = dayAdd(st, stepDays(s) - 1);
    });
    return out;
  }
  for (let i = out.length - 1; i >= 0; i--) {
    const s = out[i];
    if (s.done) continue;
    let end = due;
    out.forEach((t, k) => { if (!t.done && t.after.includes(i)) { const x = dayAdd(t.start, -1); if (x < end) end = x; } });
    if (end < today) end = today;
    let st = dayAdd(end, -(stepDays(s) - 1));
    if (st < today) st = today;
    s.start = st;
    s.due = end;
  }
  return out;
}
/** A new work's plan from its type: each stage dated backwards from the due date. */
export function backSchedule(steps: PlanStep[], due: string, today: string): { start: string; due: string }[] {
  const rows: PlanRow[] = steps.map(([n, role, days, after]) => ({ n, role, who: '', start: '', due: '', after: [...after], days, gate: false, note: '' }));
  return planCalc(rows, 'back', today, due).map((r) => ({ start: r.start, due: r.due }));
}

export type PlanIssue = { code: string; text: string };
/** Problems that stop a save (the same codes the database raises), and warnings that do not. */
export function planIssues(P: PlanRow[], due?: string): { errs: PlanIssue[]; warns: string[] } {
  const errs: PlanIssue[] = [];
  const warns: string[] = [];
  P.forEach((s, i) => {
    const label = s.n?.trim() || `المرحلة ${i + 1}`;
    if (!s.n?.trim()) errs.push({ code: 'PLAN_NAME', text: `اكتب اسم المرحلة ${i + 1}.` });
    s.after.forEach((j) => { if (j < 0 || j >= i) errs.push({ code: 'PLAN_ORDER', text: `«${label}» تنتظر مرحلة بعدها.` }); });
    if (s.done) return;
    if (s.start && s.due && s.start > s.due) errs.push({ code: 'PLAN_START_AFTER_END', text: `«${label}» تبدأ بعد نهايتها.` });
    else if (due && s.due && s.due > due) errs.push({ code: 'PLAN_AFTER_DUE', text: `«${label}» تنتهي بعد التسليم النهائي ${due}.` });
    else s.after.forEach((j) => {
      const o = P[j];
      if (o && !o.done && o.due && s.start && s.start < o.due) errs.push({ code: 'PLAN_BEFORE_DEPENDENCY', text: `«${label}» تبدأ ${s.start} قبل أن تنتهي «${o.n}» ${o.due}.` });
    });
    if (!s.who) warns.push(`«${label}» غير مسندة.`);
    if (!s.due) warns.push(`«${label}» بلا موعد.`);
  });
  return { errs, warns };
}

/** Automatic assignment: the person in the role with the fewest open stages and tasks. */
export type LoadRow = { email: string; display_name: string; role: Role; open_stages: number; open_tasks: number };
export function autoPick(role: StageRole, load: LoadRow[]): { who: string; why: string } {
  const pool = load.filter((p) => p.role === role).sort((a, b) =>
    a.open_stages + a.open_tasks - (b.open_stages + b.open_tasks) || (a.email < b.email ? -1 : 1));
  if (!pool.length) return { who: '', why: 'لا يوجد في القسم من يحمل هذا الدور' };
  const p = pool[0];
  const busy = p.open_stages + p.open_tasks;
  return { who: p.email, why: pool.length > 1 ? `الأقل حملاً في الدور (${busy} مفتوحة)` : 'الوحيد في هذا الدور' };
}

// ---------------------------------------------------------------------------
// Approval: parts bound to versions
// ---------------------------------------------------------------------------
export type Part = { key: string; label: string; ver: string; kind: 'text' | 'copy' | 'asset' | 'dest' | 'date' };
export type PartsInput = {
  type: WorkType;
  text: { n: number } | null;
  variants: { platform: Platform; n: number; body: string }[];
  assets: { id: string; name: string; current_version: number }[];
  channels: AccountRow[];
  proposed_at: string | null;
};
const utcMinute = (iso: string) => new Date(iso).toISOString().slice(0, 16);
/** Mirrors work_parts(): the same keys and versions, so the interface and the database agree. */
export function partsOf(x: PartsInput): Part[] {
  const out: Part[] = [];
  if (x.text) out.push({ key: 'text', label: textLabels[x.type], ver: `t${x.text.n}`, kind: 'text' });
  const chosen = new Set(x.channels.map((c) => c.platform));
  PLATFORM_ORDER.forEach((p) => {
    const v = x.variants.find((y) => y.platform === p);
    if (v && v.body.trim() && chosen.has(p)) out.push({ key: `v:${p}`, label: `نسخة ${platformLabels[p]}`, ver: `c${v.n}`, kind: 'copy' });
  });
  x.assets.forEach((a) => out.push({ key: `a:${a.id}`, label: a.name, ver: `v${a.current_version}`, kind: 'asset' }));
  if (x.channels.length) {
    const ver = 'd:' + x.channels.map((c) => `${c.id}@${c.handle ?? ''}`).sort().join(',');
    out.push({ key: 'dest', label: x.channels[0].platform === 'mail' ? 'جهة الإرسال' : 'المنصات والحسابات', ver, kind: 'dest' });
  }
  if (x.proposed_at) out.push({ key: 'date', label: 'موعد النشر', ver: `s:${utcMinute(x.proposed_at)}`, kind: 'date' });
  return out;
}
export type Approval = { part: string; ver: string };
export type PartState = 'ok' | 'outdated' | 'new';
export function partState(p: Part, approvals: Approval[]): PartState {
  const a = approvals.find((x) => x.part === p.key);
  return !a ? 'new' : a.ver === p.ver ? 'ok' : 'outdated';
}
export const pendingParts = (parts: Part[], approvals: Approval[]) => parts.filter((p) => partState(p, approvals) !== 'ok');

/** Why this person may not decide now; empty when they may. Mirrors work_decide_block(). */
export function decideBlock(w: Pick<WorkRow, 'status' | 'review_cycle' | 'closed_at' | 'priority'>, sentBy: string | null, me: string, r: Role): string {
  if (!isApprover(r)) return 'القرار لمدير الاتصال ومساعده.';
  if (w.status !== 'IN_REVIEW' || w.review_cycle == null || w.closed_at) return 'العمل ليس بانتظار قرار.';
  if (sentBy === me) return 'أرسلتَ هذا العمل للمراجعة بنفسك، فلا تعتمده.';
  if (w.priority === 'urgent' && !isUrgentApprover(r)) return 'العمل عاجل: الاعتماد لمدير الاتصال ومساعده.';
  return '';
}

/** YouTube carries video only: the video type, or a video file among the work's files. */
export function youtubeOk(type: WorkType, platforms: Platform[], assetKinds: string[]): boolean {
  return type === 'video' || !platforms.some((p) => VIDEO_ONLY.includes(p)) || assetKinds.includes('video');
}

// ---------------------------------------------------------------------------
// Publishing (simulation): an account succeeds only if it is active and authorised then
// ---------------------------------------------------------------------------
export const authOk = (a: Pick<AccountRow, 'active' | 'authorized_until'>, when: string) =>
  a.active && (!a.authorized_until || a.authorized_until > when);

export function publishOutcome(
  channels: string[], send: string[], accounts: AccountRow[], when: string,
  prev: WorkRow['results'] = {},
): { status: 'PUBLISHED' | 'PARTIAL' | 'FAILED'; results: WorkRow['results'] } {
  const results = { ...prev };
  send.forEach((c) => {
    const a = accounts.find((x) => x.id === c);
    const ok = !!a && authOk(a, when);
    results[c] = { ok, at: when, why: ok ? null : 'التفويض منتهٍ' };
  });
  const okN = channels.filter((c) => results[c]?.ok).length;
  return { status: okN === channels.length ? 'PUBLISHED' : okN ? 'PARTIAL' : 'FAILED', results };
}
/** A retry sends the failed accounts only. */
export const failedChannels = (w: Pick<WorkRow, 'channels' | 'results'>) => w.channels.filter((c) => !w.results[c]?.ok);

// ---------------------------------------------------------------------------
// Extensions: what moves before anyone approves
// ---------------------------------------------------------------------------
export type Shift = { index: number; name: string; who: string | null; from: [string | null, string | null]; to: [string, string | null] };
/** Mirrors work_step_impact(). */
export function stepImpact(stages: Pick<StageRow, 'name' | 'who' | 'start_on' | 'due_on' | 'after_pos' | 'done_at'>[], si: number, to: string, workDue: string, pubDay?: string | null) {
  const ends: Record<number, string | null> = { [si]: to };
  const deps = new Set([si]);
  const shifts: Shift[] = [];
  let maxEnd = to;
  for (let k = si + 1; k < stages.length; k++) {
    const s = stages[k];
    if (!s.after_pos.some((j) => deps.has(j))) continue;
    deps.add(k);
    if (s.done_at || !s.start_on) { ends[k] = s.due_on; continue; }
    let need = s.start_on;
    s.after_pos.forEach((j) => { const e = ends[j] !== undefined ? ends[j] : stages[j].due_on; if (e && e > need) need = e; });
    if (need > s.start_on) {
      const sh = dayDiff(need, s.start_on);
      const nd = s.due_on ? dayAdd(s.due_on, sh) : null;
      shifts.push({ index: k, name: s.name, who: s.who, from: [s.start_on, s.due_on], to: [need, nd] });
      ends[k] = nd;
      if (nd && nd > maxEnd) maxEnd = nd;
    } else ends[k] = s.due_on;
  }
  return { shifts, maxEnd, overDue: maxEnd > workDue, overPub: !!pubDay && maxEnd > pubDay };
}
/** Mirrors work_task_impact(): a waiting task moves by as many days as it would overlap. Dates are Riyadh days. */
export function taskImpact(tasks: Pick<TaskRow, 'id' | 'what' | 'assignee' | 'due' | 'start_on' | 'after_ids' | 'status'>[], id: string, toDay: string) {
  const ends: Record<string, string> = { [id]: toDay };
  const shifts: { id: string; what: string; who: string; days: number }[] = [];
  const q = [id];
  while (q.length) {
    const cur = q.shift()!;
    tasks.forEach((x) => {
      if (x.status === 'done' || !x.after_ids.includes(cur) || ends[x.id]) return;
      const st = x.start_on ?? riyadhToday(Date.parse(x.due));
      const need = ends[cur];
      if (need >= st) {
        const sh = dayDiff(need, st) + 1;
        shifts.push({ id: x.id, what: x.what, who: x.assignee, days: sh });
        ends[x.id] = dayAdd(riyadhToday(Date.parse(x.due)), sh);
        q.push(x.id);
      }
    });
  }
  return { shifts };
}

// ---------------------------------------------------------------------------
// Errors from the database, in Arabic
// ---------------------------------------------------------------------------
const ERRORS: Record<string, string> = {
  FORBIDDEN: 'لا تملك هذا الإجراء.',
  FORBIDDEN_DECIDE: 'القرار لمدير الاتصال ومساعده.',
  NOT_IN_REVIEW: 'العمل ليس بانتظار قرار.',
  SELF_APPROVAL: 'لا تعتمد ما أرسلته أو رفعته بنفسك.',
  URGENT_APPROVER: 'العمل عاجل: الاعتماد لمدير الاتصال ومساعده.',
  CREATE_ROLE: 'مسؤول النشر يستلم الأعمال المعتمدة للجدولة، ولا ينشئ عملاً.',
  TYPE_INVALID: 'اختر نوع العمل.',
  TITLE_REQUIRED: 'اكتب عنواناً للعمل.',
  DUE_REQUIRED: 'اختر موعد التسليم.',
  DUE_PAST: 'موعد التسليم قبل اليوم. اختر تاريخاً من اليوم فصاعداً.',
  ASSIGN_DENIED: 'الإسناد إلى غيرك لمدير الاتصال ومساعده. اختر نفسك أو اتركه طلباً.',
  PERSON_INVALID: 'هذا الشخص ليس من القسم.',
  ASSET_DENIED: 'لا تصل إلى هذا الملف في المكتبة.',
  PROJECT_INVALID: 'المشروع غير موجود.',
  ACCOUNT_INVALID: 'أحد الحسابات موقوف أو غير موجود.',
  CHANNEL_REQUIRED: 'اختر حساباً واحداً على الأقل.',
  YOUTUBE_VIDEO_ONLY: 'يوتيوب يقبل الفيديو فقط. أضف فيديو من المكتبة أو أزل حساب يوتيوب.',
  PLAN_INVALID: 'الخطة تحتاج مرحلة واحدة على الأقل.',
  PLAN_NAME: 'اكتب اسماً لكل مرحلة.',
  PLAN_ORDER: 'المرحلة تنتظر مراحل قبلها فقط.',
  PLAN_START_AFTER_END: 'مرحلة تبدأ بعد نهايتها.',
  PLAN_AFTER_DUE: 'مرحلة تنتهي بعد التسليم النهائي. مدّ التسليم من «تعديل التفاصيل» أولاً.',
  PLAN_BEFORE_DEPENDENCY: 'مرحلة تبدأ قبل أن تنتهي ما تنتظره.',
  PLAN_PERSON: 'أسند المرحلة إلى شخص من فريق الإنتاج.',
  PLAN_DONE_STAGE: 'لا تُحذف مرحلة منتهية.',
  STATUS_DENIED: 'لا يمكن هذا الإجراء في حالة العمل الآن.',
  STAGE_WAITING: 'المرحلة تنتظر ما قبلها.',
  STAGE_STATE: 'المرحلة بدأت أو انتهت من قبل.',
  GATE_NOT_PENDING: 'لا تنتظر هذه المرحلة اعتماداً.',
  STAGE_AFTER_DUE: 'موعد مرحلة بعد التسليم النهائي.',
  PRIORITY_INVALID: 'أولوية غير معروفة.',
  REASON_REQUIRED: 'اكتب السبب.',
  NOTE_REQUIRED: 'اكتب ما يجب تعديله.',
  TEXT_REQUIRED: 'اكتب النص أولاً.',
  NO_CHANGE: 'لم يتغيّر شيء.',
  PLATFORM_NOT_CHOSEN: 'هذه المنصة ليست من حسابات العمل.',
  NOTHING_TO_REVIEW: 'لا شيء جديداً للمراجعة: كل الأجزاء معتمدة.',
  NO_PARTS: 'اختر جزءاً واحداً على الأقل.',
  DATE_PAST: 'الموعد مضى. اختر موعداً قادماً.',
  DATE_NOT_LATER: 'اختر موعداً بعد الموعد الحالي.',
  ALREADY_HAS_ACCESS: 'تصل إلى هذا المجلد من قبل.',
  ALREADY_PENDING: 'أرسلت هذا الطلب من قبل، وهو بانتظار القرار.',
  LABEL_REQUIRED: 'اكتب الاسم في المركز.',
  HANDLE_REQUIRED: 'اكتب اسم الحساب على المنصة.',
  HANDLE_TAKEN: 'هذا الحساب مرتبط من قبل.',
  PUBLISHER_REQUIRED: 'اختر شخصاً واحداً على الأقل ينشر عليه.',
  PLATFORM_INVALID: 'اختر المنصة.',
  ACCOUNT_IN_USE: 'عليه عمل معتمد أو مجدول أو قيد المراجعة. انقل هذه الأعمال أو أوقف الحساب بدل حذفه.',
  NAME_REQUIRED: 'اكتب الاسم.',
  DATES_INVALID: 'اختر بداية ونهاية صحيحتين.',
  TASK_ROLE: 'إسناد المهام إلى غيرك لمدير الاتصال ومساعده والمنتج الإعلامي.',
  TASK_INVALID: 'إحدى المهام التي تنتظرها غير موجودة.',
};
export function workErrorText(message: string | null | undefined): string {
  const m = message ?? '';
  const code = Object.keys(ERRORS).sort((a, b) => b.length - a.length).find((k) => m.includes(k));
  // A file approved from a work page goes through the library's guard, which words its own codes.
  return code ? ERRORS[code] : dbErrorText(m);
}
export const WORK_ERROR_CODES = Object.keys(ERRORS);

/** The database functions the work pages call. tests/work.test.mjs checks each exists in a migration. */
export const WORK_RPC = [
  'work_create', 'work_update', 'work_assign', 'work_set_restricted', 'work_close', 'work_reopen', 'work_start',
  'work_stage_act', 'work_save_plan', 'work_text_save', 'work_variant_confirm', 'work_asset_link', 'work_comment',
  'work_submit', 'work_decide', 'work_request_move', 'work_cancel_move', 'work_schedule', 'work_publish', 'work_due_run',
  'work_parts', 'work_pending', 'work_stage_state', 'work_decide_block', 'work_step_impact', 'work_task_impact',
  'work_people_load', 'request_extension', 'request_folder_access', 'request_decide', 'request_withdraw',
  'account_save', 'account_set_active', 'account_delete', 'account_reconnect', 'project_save', 'event_save', 'event_delete',
  'reminder_add', 'reminder_delete', 'plan_template_save', 'plan_template_delete', 'task_create', 'notifications_read',
] as const;

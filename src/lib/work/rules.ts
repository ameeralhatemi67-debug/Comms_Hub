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
// Dates as the pages show them: «الأحد 11 أكتوبر», in Riyadh
// ---------------------------------------------------------------------------
const DAY_NAMES = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const MONTH_NAMES = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
export const sdate = (d: string) => `${+d.slice(8, 10)} ${MONTH_NAMES[+d.slice(5, 7) - 1]}`;
export const fdate = (d: string) => `${DAY_NAMES[new Date(dayNum(d) * 864e5).getUTCDay()]} ${sdate(d)}`;
/** A moment as 'YYYY-MM-DD HH:MM' in Riyadh. */
export const riyadhStamp = (iso: string) => new Date(Date.parse(iso) + 3 * 3600e3).toISOString().slice(0, 16).replace('T', ' ');
/** A Riyadh 'YYYY-MM-DDTHH:MM' (a datetime-local value) as an instant. */
export const riyadhInstant = (local: string) => new Date(`${local.length === 16 ? `${local}:00` : local}+03:00`).toISOString();
export function lateN(n: number): string {
  return n === 1 ? 'مرحلة متأخرة' : n === 2 ? 'مرحلتان متأخرتان' : `${n} مراحل متأخرة`;
}

// ---------------------------------------------------------------------------
// «العمل»: what is late, what each row says, tabs and order
// ---------------------------------------------------------------------------
type ListWork = Pick<WorkRow, 'status' | 'closed_at' | 'assignee' | 'due' | 'priority'>;
export const isOverdue = (w: ListWork, today: string) => isOutstanding(w) && !isRequest(w) && dayDiff(w.due, today) < 0;
export const isSoon = (w: ListWork, today: string) => {
  const d = dayDiff(w.due, today);
  return isOutstanding(w) && !isRequest(w) && d >= 0 && d <= 2;
};
type DatedStage = Pick<StageRow, 'done_at' | 'due_on'>;
export const stageLate = (s: DatedStage, today: string) => !s.done_at && !!s.due_on && dayDiff(s.due_on, today) < 0;
export const lateStages = <S extends DatedStage>(w: ListWork, stages: S[], today: string) =>
  isOutstanding(w) ? stages.filter((s) => stageLate(s, today)) : [];
/** Stages someone can work on now: started, or ready to start. */
export function openSteps(stages: StageLike[]): number[] {
  return stages.map((_, i) => i).filter((i) => ['active', 'ready'].includes(stageState(stages, i)));
}
export function curStage(stages: StageLike[]): number {
  const o = openSteps(stages);
  if (o.length) return o[0];
  return stages.findIndex((s) => !s.done_at);
}

/** Where a work stands, in one line: the open stages and who is on them, or what it waits for. */
export function stageLine(
  w: Pick<WorkRow, 'status' | 'closed_at' | 'assignee' | 'type' | 'sched_at' | 'pub_at' | 'proposed_at' | 'confirm_pending' | 'due' | 'priority'>,
  stages: (StageLike & DatedStage & Pick<StageRow, 'name' | 'who'>)[],
  today: string,
  nameOf: (email: string) => string,
  counts: { pending?: number; flags?: number } = {},
): { text: string; tone: '' | 'late' } {
  if (w.closed_at) return { text: 'مغلق', tone: '' };
  if (!w.assignee) return { text: 'بانتظار الإسناد', tone: '' };
  const late = lateStages(w, stages, today);
  const n = (k: number) => (k === 1 ? 'جزء واحد' : k === 2 ? 'جزأين' : `${k} أجزاء`);
  switch (w.status) {
    case 'DRAFT':
      return { text: `لم يبدأ الإنتاج${late.length ? ` · ${lateN(late.length)}` : ''}`, tone: late.length ? 'late' : '' };
    case 'IN_PRODUCTION': {
      const o = openSteps(stages);
      if (!o.length) return { text: 'المراحل مكتملة · جاهز للإرسال', tone: '' };
      const anyLate = o.some((i) => stageLate(stages[i], today));
      return {
        text: o.map((i) => stages[i].name + (stages[i].who ? ` (${nameOf(stages[i].who!)})` : '')).join(' · ') + (anyLate ? ' · متأخرة' : ''),
        tone: anyLate ? 'late' : '',
      };
    }
    case 'IN_REVIEW':
      return {
        text: isWhole(w.type) ? 'بانتظار اعتماد الحزمة كاملة' : counts.pending ? `بانتظار اعتماد ${n(counts.pending)}` : 'بانتظار القرار',
        tone: '',
      };
    case 'CHANGES_REQUESTED':
      return { text: `تعديل بعد المراجعة${counts.flags ? ` · ${n(counts.flags)}` : ''}`, tone: '' };
    case 'REJECTED':
      return { text: 'رُفض في المراجعة', tone: '' };
    case 'APPROVED':
      return { text: `معتمد · بانتظار الجدولة${w.proposed_at ? ` (${sdate(riyadhStamp(w.proposed_at))})` : ''}`, tone: '' };
    case 'SCHEDULED': {
      const at = w.sched_at ? riyadhStamp(w.sched_at) : '';
      return { text: `مجدول للنشر ${at ? `${sdate(at)} ${at.slice(11)}` : ''}${w.confirm_pending ? ' · بانتظار التأكيد' : ''}`, tone: w.confirm_pending ? 'late' : '' };
    }
    case 'PUBLISHING':
      return { text: 'جارٍ النشر', tone: '' };
    case 'PUBLISHED':
      return { text: `نُشر ${w.pub_at ? sdate(riyadhStamp(w.pub_at)) : ''}`.trim(), tone: '' };
    case 'PARTIAL':
      return { text: 'نُشر على بعض المنصات', tone: 'late' };
    case 'FAILED':
      return { text: 'فشل النشر', tone: 'late' };
  }
  return { text: '', tone: '' };
}

export type WorkTab = 'team' | 'all' | 'mine' | 'requests' | 'closed';
export function tabsFor(r: Role): [WorkTab, string][] {
  const t: [WorkTab, string][] = [];
  if (isLead(r)) t.push(['team', 'الفريق']);
  t.push(['all', 'الكل']);
  t.push(['mine', r === 'member' ? 'طلباتي' : 'مهامي']);
  if (isLead(r)) t.push(['requests', 'الطلبات']);
  t.push(['closed', 'المغلقة']);
  return t;
}
export function inTab(
  w: Pick<WorkRow, 'closed_at' | 'assignee' | 'created_by' | 'people'>,
  stages: Pick<StageRow, 'who'>[],
  tab: WorkTab,
  me: string,
  r: Role,
): boolean {
  if (tab === 'closed') return !!w.closed_at;
  if (w.closed_at) return false;
  if (tab === 'mine') return r === 'member' ? w.created_by === me : involved(w, stages, me);
  if (tab === 'requests') return isRequest(w);
  return true;
}
/** Open work first (urgent, then by due date), then requests, then delivered, then closed (newest first). */
export function workOrder(a: ListWork & Pick<WorkRow, 'closed_at'>, b: ListWork & Pick<WorkRow, 'closed_at'>): number {
  const k = (w: typeof a) => (w.closed_at ? 3 : isOutstanding(w) ? (isRequest(w) ? 1 : 0) : 2);
  const ka = k(a), kb = k(b);
  if (ka !== kb) return ka - kb;
  if (ka === 0) {
    const ua = a.priority === 'urgent' ? 0 : 1, ub = b.priority === 'urgent' ? 0 : 1;
    if (ua !== ub) return ua - ub;
  }
  if (ka === 3) return (a.closed_at ?? '') < (b.closed_at ?? '') ? 1 : -1;
  return a.due < b.due ? -1 : a.due > b.due ? 1 : 0;
}
/** The attention counts on «العمل», over open work. */
export function attentionCounts(list: { w: ListWork; stages: DatedStage[] }[], today: string) {
  const open = list.filter((x) => !x.w.closed_at);
  return {
    late: open.filter((x) => isOverdue(x.w, today)).length,
    soon: open.filter((x) => isSoon(x.w, today)).length,
    stages: open.filter((x) => lateStages(x.w, x.stages, today).length).length,
    review: open.filter((x) => x.w.status === 'IN_REVIEW').length,
    urgent: open.filter((x) => x.w.priority === 'urgent' && isOutstanding(x.w)).length,
    requests: open.filter((x) => isRequest(x.w)).length,
  };
}

// ---------------------------------------------------------------------------
// The work page: what this person may do now (the database decides each one)
// ---------------------------------------------------------------------------
export type ActionId =
  | 'reopen' | 'assign' | 'details' | 'start' | 'submit' | 'plan' | 'review' | 'edittext' | 'lib'
  | 'schedule' | 'pubnow' | 'confirmpub' | 'declinepub' | 'unsched' | 'retry'
  | 'chat' | 'restrict' | 'close' | `stepdone:${number}` | `wait:${number}`;
export type WorkAction = { id: ActionId; label: string; hint: string; next: boolean; disabled: boolean };
export type ActionInput = {
  w: Pick<WorkRow, 'status' | 'closed_at' | 'assignee' | 'created_by' | 'people' | 'type' | 'restricted' | 'channels' | 'priority' | 'review_cycle'>
    & Partial<Pick<WorkRow, 'proposed_at' | 'sched_at' | 'confirm_pending'>>;
  /** The work goes out by the shared mailbox rather than a platform. */
  mail?: boolean;
  stages: (StageLike & Pick<StageRow, 'name' | 'who'>)[];
  me: string;
  role: Role;
  hasText: boolean;
  pending: number;
  total: number;
  decideBlock: string;
  hasChat: boolean;
  nameOf: (email: string) => string;
};
export function workActions(x: ActionInput): WorkAction[] {
  const { w, stages, me, role: r, nameOf } = x;
  const out: WorkAction[] = [];
  const add = (id: ActionId, label: string, hint: string, next = false, disabled = false) => out.push({ id, label, hint, next, disabled });
  const lead = isLead(r);
  const part = lead || involved(w, stages, me);
  if (w.closed_at) {
    if (lead) add('reopen', 'إعادة فتح العمل', 'يعود إلى القوائم النشطة بحالته الأخيرة', true);
    return out;
  }
  if (!w.assignee) {
    if (lead) add('assign', 'إسناد الطلب', 'اختر المسؤول، فيصله إشعار ويبدأ العمل', true);
    if (w.created_by === me && !lead) add('details', 'تعديل الطلب', 'العنوان والموعد والوصف قبل الإسناد');
  } else {
    const boss = lead || w.assignee === me;
    if (w.status === 'DRAFT' && boss) add('start', 'بدء الإنتاج', 'ينتقل العمل إلى «قيد الإنتاج»', true);
    if (['CHANGES_REQUESTED', 'REJECTED'].includes(w.status) && boss)
      add('start', 'بدء التعديل', 'يعود العمل إلى «قيد الإنتاج» لتعديل ما طُلب');
    if (w.status === 'CHANGES_REQUESTED' && boss)
      add('submit', 'إعادة الإرسال للمراجعة', isWhole(w.type) ? 'تُراجع الحزمة كاملة مرة أخرى' : 'يُراجع ما تغيّر فقط، والمعتمد يبقى معتمداً', true);
    if (['IN_PRODUCTION', 'DRAFT'].includes(w.status) && part) {
      openSteps(stages)
        .filter((i) => stages[i].who === me || boss)
        .slice(0, 3)
        .forEach((i) => {
          const s = stages[i];
          add(`stepdone:${i}`, `إنهاء مرحلة «${s.name}»`, `${s.who && s.who !== me ? `مسندة إلى ${nameOf(s.who)}. ` : ''}يصل إشعار لمن بعدها`, s.who === me);
        });
      stages.forEach((s, i) => {
        if (s.who === me && stageState(stages, i) === 'waiting')
          add(`wait:${i}`, `«${s.name}» تنتظر`, `تبدأ بعد ${waitsFor(stages, i).map((j) => `«${stages[j].name}»${stages[j].who ? ` (${nameOf(stages[j].who!)})` : ''}`).join(' و')}`, false, true);
      });
      const left = stages.filter((s) => !s.done_at).length;
      if (w.status === 'IN_PRODUCTION' && boss)
        add('submit', 'إرسال للمراجعة', `إلى مدير الاتصال ومساعده${left ? `، وتبقى ${left} مراحل` : ''}`, !left);
    }
    if ((lead || w.assignee === me) && OUTSTANDING.includes(w.status)) add('plan', 'خطة المراحل', 'من يعمل على ماذا ومتى، وما ينتظر ماذا');
    if (w.status === 'IN_REVIEW' && lead)
      add('review', x.decideBlock ? 'عرض المراجعة' : 'مراجعة واعتماد', x.decideBlock || `ينتظر قرارك: ${x.pending} من ${x.total} أجزاء`, !x.decideBlock);
    if (boss && textEditable(w)) {
      const after = ['APPROVED', 'SCHEDULED'].includes(w.status);
      add('edittext', `${x.hasText ? 'تعديل' : 'كتابة'} ${textLabels[w.type]}`,
        !x.hasText ? 'يصبح جزءاً يُراجع ويُعتمد'
          : after ? (isWhole(w.type) ? 'معتمد: التعديل يعيد الحزمة كاملة إلى المراجعة' : 'معتمد: التعديل يعيده وحده إلى المراجعة')
            : 'يُحفظ إصداراً جديداً باسم من عدّله');
    }
    if (part && ['DRAFT', 'IN_PRODUCTION', 'CHANGES_REQUESTED', 'REJECTED'].includes(w.status))
      add('lib', 'إضافة وسائط من المكتبة', 'تبقى الوسائط في مجلدها بصلاحياته');
    if (canPublish(r)) {
      const noun = x.mail ? 'الإرسال' : 'النشر';
      if (w.status === 'APPROVED') {
        add('schedule', `جدولة ${noun}`, w.proposed_at ? `الموعد المعتمد ${riyadhStamp(w.proposed_at)}` : 'اختر الموعد', true);
        add('pubnow', x.mail ? 'إرسال الآن من البريد' : 'نشر الآن', 'محاكاة: إلى الحسابات المعتمدة');
      } else if (w.status === 'SCHEDULED' && w.confirm_pending) {
        add('confirmpub', 'انشر الآن', `حلّ الموعد ${w.sched_at ? riyadhStamp(w.sched_at) : ''}، وهذا العمل لا يُنشر بلا تأكيد`, true);
        add('declinepub', 'لا تنشر', 'يعود «جاهز للنشر» بلا موعد');
      } else if (w.status === 'SCHEDULED') {
        add('schedule', 'تغيير الموعد', 'موعد غير المعتمد يعيد «موعد النشر» وحده إلى المراجعة');
        add('unsched', 'إلغاء الجدولة', 'يعود إلى «جاهز للنشر»');
      } else if (w.status === 'PARTIAL' || w.status === 'FAILED') {
        add('retry', 'إعادة المحاولة', 'للحسابات التي فشلت فقط', true);
      }
    }
    if (lead) add('assign', 'إسناد إلى شخص آخر', `المسؤول الحالي: ${nameOf(w.assignee)}`);
  }
  if (lead) add('details', 'تعديل التفاصيل والمواعيد', 'المشاريع والأولوية ومواعيد المراحل');
  if (!x.hasChat && part) add('chat', 'فتح محادثة للعمل', 'مجموعة مراسلة تضم المسؤول والمشاركين');
  if (lead) add('restrict', w.restricted ? 'إلغاء التقييد' : 'تقييد الرؤية', w.restricted ? 'يراه كل القسم' : 'لا يراه إلا المعنيون والقادة');
  if (lead) add('close', 'إغلاق العمل', 'مع سبب مكتوب، ويبقى في «المغلقة»');
  return out;
}
/** Under the actions: who holds what this person does not. */
export function actionOwners(w: Pick<WorkRow, 'closed_at' | 'assignee'>, me: string, r: Role, nameOf: (e: string) => string): string {
  if (w.closed_at) return isLead(r) ? '' : 'إعادة الفتح لمدير الاتصال ومساعده.';
  if (isLead(r)) return '';
  const t: string[] = [];
  if (w.assignee && w.assignee !== me) t.push(`الإنتاج والإرسال للمراجعة: ${nameOf(w.assignee)}`);
  t.push('الإسناد والإغلاق والتقييد: مدير الاتصال ومساعده');
  return `${t.join(' · ')}.`;
}

// ---------------------------------------------------------------------------
// The free plan editor's tools
// ---------------------------------------------------------------------------
/** Each stage waits for the one before it. Finished stages keep their waits. */
export const planChain = (P: PlanRow[]): PlanRow[] => P.map((s, i) => (s.done ? s : { ...s, after: i ? [i - 1] : [] }));
/** Every stage starts on its own. */
export const planParallel = (P: PlanRow[]): PlanRow[] => P.map((s) => (s.done ? s : { ...s, after: [] }));
/** A copy right after the stage: the same person, dates and waits, as a new stage. */
export function planCopy(P: PlanRow[], i: number): PlanRow[] {
  const s = P[i];
  const out = planInsert(P, i + 1, { ...s, id: undefined, n: `${s.n} (نسخة)`, days: stepDays(s), done: false });
  out[i + 1] = { ...out[i + 1], after: [...s.after] };
  return out;
}
export type TemplateRow = { n: string; role: StageRole; days: number; after: number[]; gate: boolean; note: string };
export function typeTemplate(t: WorkType): TemplateRow[] {
  return TYPE_PLANS[t].map(([n, role, days, after]) => ({ n, role, days, after: [...after], gate: false, note: '' }));
}
export function rowsFromTemplate(rows: TemplateRow[]): PlanRow[] {
  return rows.map((r) => ({ n: r.n, role: r.role, who: '', start: '', due: '', after: [...r.after], days: r.days, gate: !!r.gate, note: r.note ?? '' }));
}
/** Apply a template: finished stages stay first, and the template's stages follow them. */
export function planWithTemplate(P: PlanRow[], rows: TemplateRow[]): PlanRow[] {
  const done = P.filter((s) => s.done).map((s) => ({ ...s, after: [] as number[] }));
  const base = done.length;
  return [
    ...done,
    ...rowsFromTemplate(rows).map((r) => ({ ...r, after: r.after.length ? r.after.map((j) => j + base) : base ? [base - 1] : [] })),
  ];
}
export function templateFromPlan(P: PlanRow[]): TemplateRow[] {
  return P.map((s) => ({ n: s.n.trim(), role: s.role, days: stepDays(s), after: [...s.after], gate: s.gate, note: s.note.trim() }));
}
/** A plan as the database functions take it. */
export function planPayload(P: PlanRow[]) {
  return P.map((s) => ({
    id: s.id ?? null, n: s.n.trim(), role: s.role, who: s.who || null, start: s.start || null, due: s.due || null,
    after: s.after, days: stepDays(s), gate: s.gate, note: s.note.trim(),
  }));
}

// ---------------------------------------------------------------------------
// «الموافقات والنشر»: the word difference, the state of a part, accounts, notifications
// ---------------------------------------------------------------------------
/** Word by word: kept, added and removed, as the review screen shows a changed text. */
export function diffWords(a: string, b: string): ['s' | 'a' | 'd', string][] {
  const x = a.split(/\s+/).filter(Boolean);
  const y = b.split(/\s+/).filter(Boolean);
  const n = x.length;
  const m = y.length;
  const L: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = x[i] === y[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out: ['s' | 'a' | 'd', string][] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (x[i] === y[j]) {
      out.push(['s', x[i]]);
      i++;
      j++;
    } else if (L[i + 1][j] >= L[i][j + 1]) out.push(['d', x[i++]]);
    else out.push(['a', y[j++]]);
  }
  while (i < n) out.push(['d', x[i++]]);
  while (j < m) out.push(['a', y[j++]]);
  return out;
}

type ApprovalRow = { part: string; ver: string; approved_by: string; approved_at?: string };
type FlagRow = { part: string; ver: string };
/** The line under a part: approved by whom, changed since, or sent back and not yet changed. */
export function partLine(p: Pick<Part, 'key' | 'ver'>, approvals: ApprovalRow[], flags: FlagRow[], nameOf: (e: string) => string): string {
  const a = approvals.find((x) => x.part === p.key);
  const f = flags.find((x) => x.part === p.key);
  if (a && a.ver === p.ver) return `معتمد · ${nameOf(a.approved_by)}${a.approved_at ? ` ${sdate(riyadhStamp(a.approved_at))}` : ''}`;
  if (f && f.ver === p.ver) return 'طُلب تعديله ولم يتغيّر بعد';
  if (f) return 'عُدّل بعد طلب التعديل';
  if (a) return `تغيّر بعد اعتماده${a.approved_at ? ` ${sdate(riyadhStamp(a.approved_at))}` : ''}`;
  return 'لم يُعتمد بعد';
}

/** How an account stands now: stopped, expired, running out within six days, or connected. */
export function accountState(a: Pick<AccountRow, 'active' | 'authorized_until'>, nowIso: string): [string, '' | 'danger' | 'warn' | 'approved'] {
  if (!a.active) return ['موقوف', ''];
  if (!a.authorized_until) return ['متصل', 'approved'];
  if (Date.parse(a.authorized_until) <= Date.parse(nowIso)) return ['التفويض منتهٍ', 'danger'];
  if (Date.parse(a.authorized_until) - Date.parse(nowIso) < 6 * 864e5) return [`ينتهي ${riyadhStamp(a.authorized_until)}`, 'warn'];
  return [`متصل حتى ${sdate(riyadhStamp(a.authorized_until))}`, 'approved'];
}
/** The accounts of a scheduled work whose authorisation will not cover its time. */
export function atRisk(w: Pick<WorkRow, 'status' | 'sched_at' | 'channels'>, accounts: AccountRow[]): AccountRow[] {
  if (w.status !== 'SCHEDULED' || !w.sched_at) return [];
  const at = w.sched_at;
  return accounts.filter((a) => w.channels.includes(a.id) && a.platform !== 'mail' && !(a.active && (!a.authorized_until || Date.parse(a.authorized_until) > Date.parse(at))));
}
export const accountName = (a: Pick<AccountRow, 'platform' | 'label'> | undefined) =>
  !a ? 'حساب محذوف' : a.platform === 'mail' ? 'البريد' : `${platformLabels[a.platform]} · ${a.label}`;

/** Where a notification leads, from the `go` the database wrote with it. */
export function noticeHref(go: { page?: string; id?: string; tab?: string } | null | undefined): string {
  const g = go ?? {};
  switch (g.page) {
    case 'item':
      return g.id ? `/work/${g.id}` : '/work';
    case 'review':
      return g.id ? `/approvals/${g.id}` : '/approvals';
    case 'approvals':
      return g.tab === 'publish' ? '/approvals?tab=publish' : '/approvals';
    case 'requests':
      return '/work?tab=requests';
    case 'accounts':
      return '/channels';
    case 'tasks':
      return '/tasks';
    case 'calendar':
      return '/calendar';
    case 'asset':
      return g.id ? `/media/${g.id}` : '/media';
    case 'mail':
      return g.id ? `/mail?thread=${g.id}` : '/mail';
    case 'chat':
      return g.id ? `/mail/chat?room=${g.id}` : '/mail/chat';
    default:
      return '/work';
  }
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

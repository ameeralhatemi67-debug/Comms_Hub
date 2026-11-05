// Stand-ins for the browser check of «ألوان التقويم» (qa/calendar-colors.cjs, MVP_draft.md section 74): the database
// client, the work provider and the dialogs the calendar opens, so the real calendar, project pages and Home draw on a
// fixture. `calendar_prefs_save` answers as the database function does: it checks the mode, the keys, the colours and
// the 200, keeps the row, and returns it; every call is recorded. Flags in the address change the case:
//   seed=status   the person chose «حالة العمل» before, with «قيد المراجعة» in «نيلي» (4);
//   seed=project  the person chose «المشروع» before, with «حملة الشتاء» in «زيتوني» (10);
//   fail=1        the database refuses every save, so the page must go back to what was kept.
// The rules themselves are the database's (supabase/tests/calendar_prefs_rules.sql) and the page's
// (tests/calendar-colors.test.mjs).
import { useSyncExternalStore } from 'react';
import { KEY_PATTERNS, MAX_PAIRS } from '../../src/lib/work/calendar-colors';
import { setPlatformRegistry, type AccountRow, type PlatformInfo, type StageRow, type WorkRow } from '../../src/lib/work/rules';

const q = new URLSearchParams(location.search);
const ME = 'dir@example.test';
const TODAY = '2026-11-05';
const P1 = '0b6f7c1e-1d2a-4c3b-9e8f-1234567890ab';
const P2 = '7c1e0b6f-2a1d-4c3b-8e9f-abcdef123456';
const IG = '11111111-1111-4111-8111-111111111111';
const XA = '22222222-2222-4222-8222-222222222222';
const ML = '33333333-3333-4333-8333-333333333333';

const db = {
  row: (q.get('seed') === 'status'
    ? { mode: 'status', colors: { 'status:IN_REVIEW': 4 } }
    : q.get('seed') === 'project'
      ? { mode: 'project', colors: { 'project:0b6f7c1e-1d2a-4c3b-9e8f-1234567890ab': 10 } }
      : null) as { mode: string; colors: Record<string, number> } | null,
  calls: [] as { fn: string; args: Record<string, unknown> }[],
  reads: 0,
  says: [] as string[],
};
(window as unknown as { __db: typeof db }).__db = db;
const listeners = new Set<() => void>();
let version = 0;
const changed = () => {
  version++;
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};

// ---------------------------------------------------------------------------
// The database client: only `calendar_prefs` is read on these pages, by its owner.
// ---------------------------------------------------------------------------
const keyOk = (k: string) => k.length <= 260 && KEY_PATTERNS.some((p) => new RegExp(p).test(k));
function save(args: Record<string, unknown>): { data: unknown; error: { message: string } | null } {
  if (q.get('fail')) return { data: null, error: { message: 'CAL_PREFS_INVALID' } };
  const mode = args.p_mode as string;
  const colors = (args.p_colors ?? {}) as Record<string, unknown>;
  if (!['kind', 'status', 'project', 'platform', 'person'].includes(mode) || typeof colors !== 'object' || Array.isArray(colors)) return { data: null, error: { message: 'CAL_PREFS_INVALID' } };
  if (Object.keys(colors).length > MAX_PAIRS) return { data: null, error: { message: 'CAL_PREFS_TOO_MANY' } };
  for (const [k, v] of Object.entries(colors)) if (!keyOk(k) || typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 11) return { data: null, error: { message: 'CAL_PREFS_INVALID' } };
  db.row = { mode, colors: colors as Record<string, number> };
  return { data: db.row, error: null };
}
function from(table: string) {
  const answer = () => {
    if (table === 'calendar_prefs') db.reads++;
    return Promise.resolve({ data: table === 'calendar_prefs' ? (db.row ? structuredClone(db.row) : null) : [], error: null });
  };
  const chain = { select: () => chain, eq: () => chain, order: () => chain, limit: () => answer(), maybeSingle: () => answer(), then: (f: (r: unknown) => void) => answer().then(f) };
  return chain;
}
export const supabase = () => ({ from, rpc: async () => ({ data: null, error: null }) });

// ---------------------------------------------------------------------------
// The work provider (src/components/work/data.tsx)
// ---------------------------------------------------------------------------
const people = [
  { email: ME, display_name: 'مدير الفحص', role: 'director' },
  { email: 'wri@example.test', display_name: 'كاتبة الفحص', role: 'writer' },
  { email: 'des@example.test', display_name: 'مصمم الفحص', role: 'designer' },
  { email: 'pub@example.test', display_name: 'ناشر الفحص', role: 'publisher' },
];
const nameOf = (e: string | null | undefined) => (e ? (people.find((x) => x.email === e)?.display_name ?? e.split('@')[0]) : '');
const later = '2026-12-31T00:00:00Z';
const acc = (id: string, platform: string, label: string, over: Partial<AccountRow> = {}): AccountRow => ({
  id, platform, label, handle: `@${platform}`, purpose: null, authorized_until: later, publishers: ['pub@example.test'], mode: 'auto', active: true, fixed: false, ...over,
});
const accounts: AccountRow[] = [
  acc(IG, 'instagram', 'الحساب الرسمي'),
  acc(XA, 'x', 'الأخبار', { authorized_until: '2026-11-06T00:00:00Z' }),
  acc(ML, 'mail', 'البريد', { handle: null, authorized_until: null, fixed: true }),
];
const platforms = ['instagram', 'x', 'mail'].map((key, i) => ({ key, label_ar: { instagram: 'إنستغرام', x: 'إكس', mail: 'البريد' }[key], kind: key === 'mail' ? 'mail' : 'social', sort: i, accepts: {}, publish_mode: 'assisted', scheduling: true, requires_review: true, token_life_days: 60, enabled: true, builtin: true, docs_url: null, readiness: 'live', readiness_note: null, readiness_at: null, readiness_by: null })) as unknown as PlatformInfo[];
setPlatformRegistry(platforms);
const projects = [
  { id: P1, name: 'حملة الشتاء', type: 'campaign', start_on: '2026-11-01', end_on: '2026-11-20', owner: ME, description: null },
  { id: P2, name: 'المعرض', type: 'event', start_on: '2026-11-03', end_on: '2026-11-12', owner: ME, description: null },
];
const W = (over: Partial<WorkRow>): WorkRow => ({
  id: 'CH-0', no: 1, title: 'عمل', type: 'post', status: 'IN_PRODUCTION', priority: 'normal', restricted: false, source: 'plan', requester: null, brief: null,
  created_by: ME, assignee: 'wri@example.test', people: [], due: '2026-11-12', event_at: null, place: null, channels: [], proposed_at: null, sched_at: null,
  pub_at: null, pub_mode: null, pending_sched: false, confirm_pending: false, move_from: null, move_by: null, review_cycle: null, results: {}, closed_at: null,
  closed_by: null, close_reason: null, created_at: '2026-11-01T06:00:00Z', updated_at: '2026-11-01T06:00:00Z', ...over,
});
const S = (work: string, pos: number, over: Partial<StageRow>): StageRow => ({
  id: `${work}-s${pos}`, work_id: work, pos, name: `مرحلة ${pos + 1}`, role: 'writer', who: null, start_on: null, due_on: null, after_pos: pos ? [pos - 1] : [], days: 1,
  note: null, gate: false, gate_by: null, gate_at: null, started_at: null, done_at: null, done_by: null, ...over,
} as StageRow);
const items = [
  { w: W({ id: 'CH-1', no: 1, title: 'إعلان الشتاء', status: 'SCHEDULED', channels: [IG, XA], sched_at: '2026-11-07T15:00:00Z', priority: 'urgent' }), stages: [], projects: [P1], flags: 0 },
  { w: W({ id: 'CH-2', no: 2, title: 'تغطية المعرض', status: 'SCHEDULED', channels: [XA], sched_at: '2026-11-07T15:30:00Z', assignee: 'des@example.test' }), stages: [], projects: [P2], flags: 0 },
  {
    w: W({ id: 'CH-3', no: 3, title: 'فيديو الافتتاح', type: 'video', status: 'IN_PRODUCTION', assignee: 'des@example.test', due: '2026-11-06' }),
    stages: [S('CH-3', 0, { name: 'النص', who: 'wri@example.test', due_on: '2026-11-03' }), S('CH-3', 1, { name: 'المونتاج', role: 'producer', who: 'des@example.test', start_on: '2026-11-04', due_on: '2026-11-06' })],
    projects: [P1],
    flags: 0,
  },
  { w: W({ id: 'CH-4', no: 4, title: 'بيان صحفي', type: 'press', status: 'IN_REVIEW', channels: [IG], proposed_at: '2026-11-04T09:00:00Z' }), stages: [], projects: [], flags: 0, pending: 1, pendingKeys: ['text'] },
  {
    w: W({ id: 'CH-5', no: 5, title: 'منشور الصباح', status: 'PARTIAL', channels: [IG, XA], pub_at: '2026-11-05T05:00:00Z', results: { [IG]: { ok: true, at: '2026-11-05T05:00:00Z', why: null }, [XA]: { ok: false, at: '2026-11-05T05:00:00Z', why: 'رفضت المنصة' } } }),
    stages: [],
    projects: [P2],
    flags: 0,
  },
  { w: W({ id: 'CH-6', no: 6, title: 'تهنئة', status: 'APPROVED', channels: [IG], proposed_at: '2026-11-06T09:00:00Z', assignee: 'des@example.test' }), stages: [], projects: [], flags: 0 },
  { w: W({ id: 'CH-7', no: 7, title: 'ملصق اليوم', type: 'design', status: 'IN_PRODUCTION', due: TODAY }), stages: [], projects: [], flags: 0 },
];
const tasks = [
  { id: 't1', what: 'مراجعة الصور', kind: 'other', assignee: 'des@example.test', assigned_by: ME, due: '2026-11-04T12:00:00Z', start_on: null, after_ids: [], status: 'open', note: null, project_id: P2, work_id: null, group_key: null, priority: 'normal' },
];
const events = [{ id: 'e1', title: 'اجتماع الفريق', start_at: '2026-11-05T08:00:00Z', end_at: '2026-11-05T09:00:00Z', place: 'القاعة', project_id: P1, created_by: ME }];
const reminders = [{ id: 'r1', at: '2026-11-05T10:00:00Z', body: 'اتصال بالمطبعة' }];

const say = (text: string) => {
  db.says.push(text);
  changed();
};
const call = async (fn: string, args: Record<string, unknown>) => {
  db.calls.push({ fn, args: structuredClone(args) });
  await new Promise((r) => setTimeout(r, 20));
  if (fn !== 'calendar_prefs_save') return { ok: true as const, data: null };
  const r = save(args);
  return r.error ? { ok: false as const, error: r.error.message.includes('TOO_MANY') ? 'بلغت ألوانك المحفوظة 200. أرجع بعض القيم إلى الافتراضي أولاً.' : 'تعذّر حفظ الألوان: أحد الاختيارات غير صالح. أعد فتح التقويم وحاول مجدداً.' } : { ok: true as const, data: r.data };
};
const work = {
  status: 'ready' as const, me: ME, role: 'director' as const, isAdmin: false, today: TODAY, people, nameOf, personOf: (e: string | null | undefined) => people.find((x) => x.email === e),
  load: [], projects, accounts, platforms, templates: [], reloadBase: async () => undefined, call, say,
};
export function useWork() {
  useSyncExternalStore(subscribe, () => version);
  return work;
}
export const useWorkList = () => ({ items, status: 'ready' as const, reload: async () => undefined });
export const usePlanData = () => ({ tasks, events, reminders, status: 'ready' as const, reload: async () => undefined });
export const useWritingMarks = () => ({ latest: {}, copies: [], tasks: [] });
export const useWorkDocs = () => ({ docs: [], reload: async () => undefined });
export const libraryFiles = async () => [];

// Stand-ins for the flow check of «سجل النشاط» (qa/activity-flow.cjs). The page reads three logs and the month's report
// from the database client, and who it is from the provider and the capabilities; here those come from `window.__who`,
// and the client records every read and applies its filters to rows held in memory, so a filter that is not sent
// would show in the result. The rules themselves are the database's (supabase/tests/activity_report_rules.sql).
import { SAMPLE_REPORT } from './report-sample.mjs';

type Row = Record<string, unknown>;
const w = window as unknown as { __who: Who; __reads: { table: string; filters: string[] }[]; __reportCalls: unknown[] };
type Who = { email: string; role: string; isAdmin: boolean; caps: string[]; known: boolean };
w.__reads = [];
w.__reportCalls = [];

const day = (d: number, h = 9) => `2026-10-${String(d).padStart(2, '0')}T${String(h).padStart(2, '0')}:00:00Z`;
const library: Row[] = [
  { id: 1, at: day(20), actor_email: 'design@example.test', type: 'upload', asset_id: 'a1', folder_id: null, task_id: null, data: { name: 'ملصق الحملة.png' } },
  { id: 2, at: day(19), actor_email: 'director@example.test', type: 'approve', asset_id: 'a1', folder_id: null, task_id: null, data: {} },
  { id: 3, at: day(18), actor_email: 'one@example.test', type: 'rename', asset_id: null, folder_id: null, task_id: null, data: { from: 'قديم', to: 'جديد' } },
];
const work: Row[] = [
  { id: 1, work_id: 'CH-101', at: day(21), actor: 'one@example.test', type: 'text', text: 'كتابة نص', works: { title: 'حملة اليوم الوطني' } },
  { id: 2, work_id: 'CH-101', at: day(17), actor: 'director@example.test', type: 'approve', text: 'اعتماد النص', works: { title: 'حملة اليوم الوطني' } },
  { id: 3, work_id: 'CH-107', at: day(16), actor: 'pub@example.test', type: 'schedule', text: 'جدولة النشر', works: { title: 'تقرير الربع' } },
];
const permission: Row[] = [{ id: 1, at: day(15), actor: 'director@example.test', subject: 'one@example.test', role: null, capability: 'activity.full', kind: 'grant', data: { mode: 'standing' } }];
// Enough old rows in one log to need a second page.
for (let i = 0; i < 320; i++) library.push({ id: 100 + i, at: new Date(Date.UTC(2026, 8, 30, 12) - i * 36e5).toISOString(), actor_email: 'design@example.test', type: 'version', asset_id: null, folder_id: null, task_id: null, data: {} });

const TABLES: Record<string, Row[]> = { activity_log: library, work_log: work, permission_events: permission };

class Query {
  private table: string;
  private rows: Row[];
  private filters: string[] = [];
  private max = 1000;
  constructor(table: string) {
    this.table = table;
    this.rows = [...(TABLES[table] ?? [])];
  }
  select() {
    return this;
  }
  private note(text: string, keep: (r: Row) => boolean) {
    this.filters.push(text);
    this.rows = this.rows.filter(keep);
    return this;
  }
  gte(c: string, v: string) {
    return this.note(`${c}>=${v}`, (r) => String(r[c]) >= v);
  }
  lt(c: string, v: string) {
    return this.note(`${c}<${v}`, (r) => String(r[c]) < v);
  }
  lte(c: string, v: string) {
    return this.note(`${c}<=${v}`, (r) => String(r[c]) <= v);
  }
  eq(c: string, v: string) {
    return this.note(`${c}=${v}`, (r) => r[c] === v);
  }
  order() {
    this.rows.sort((a, b) => String(b.at).localeCompare(String(a.at)));
    return this;
  }
  limit(n: number) {
    this.max = n;
    return this;
  }
  then(done: (r: { data: Row[]; error: null }) => void) {
    // What row level security would give someone without the whole log: their own actions, and files they reach.
    const me = w.__who;
    const allowed = me.caps.includes('activity.full') ? this.rows : this.rows.filter((r) => [r.actor_email, r.actor].includes(me.email) || r.asset_id === 'a1');
    w.__reads.push({ table: this.table, filters: this.filters });
    done({ data: allowed.slice(0, this.max), error: null });
  }
}

export const supabase = () => ({
  from: (table: string) => new Query(table),
  rpc: async (name: string, args: { p_month?: string }) => {
    if (name !== 'activity_report') return { data: null, error: null };
    w.__reportCalls.push(args);
    if (!w.__who.caps.includes('activity.report')) return { data: null, error: { message: 'FORBIDDEN' } };
    const empty = args.p_month !== '2026-10';
    return { data: empty ? { ...SAMPLE_REPORT, month: args.p_month, actions: [], days: {}, approved: {}, stages: [], tasks: [], late: {} } : SAMPLE_REPORT, error: null };
  },
});

export const useCaps = () => {
  const me = w.__who;
  const evals = me.known ? ['activity.full', 'activity.report'].map((k) => ({ k, ok: me.caps.includes(k), src: 'role', until: null, uses: null, id: null })) : [];
  return { ready: true, evals, grants: [], has: (k: string) => me.caps.includes(k), evalOf: (k: string) => evals.find((e) => e.k === k), reload: async () => undefined };
};

const people = SAMPLE_REPORT.people.map((p) => ({ email: p.email, display_name: p.name, role: p.role }));
const media = () => ({
  status: 'ready', email: w.__who.email, role: w.__who.role, isAdmin: w.__who.isAdmin, people,
  nameOf: (e: string) => people.find((p) => p.email === e)?.display_name ?? e,
  assets: [{ id: 'a1', name: 'ملصق الحملة.png' }], folders: [], tasks: [],
});
let shared: ReturnType<typeof media> | null = null;
export const useMedia = () => (shared ??= media());

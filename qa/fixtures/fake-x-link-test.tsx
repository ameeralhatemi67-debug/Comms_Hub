// Stand-ins for the browser check of «تجربة النشر بالرابط» (qa/x-link-test-flow.cjs, MVP_draft.md section 83): the work provider and a
// database client that answers the list of tests and records a test as the database does, so the page is driven without a signed-in
// person. `window.__refuse` makes the next recording fail with a code (or a missing function) and `window.__calls` holds what the page
// asked. The rules themselves are the database's (supabase/tests/x_link_test_rules.sql).
import { setPlatformRegistry, type PlatformInfo } from '../../src/lib/work/rules';

const mk = (key: string, label: string, sort: number) =>
  ({
    key, label_ar: label, kind: 'social', sort, accepts: { max_chars: 280, video_only: false }, publish_mode: 'auto', scheduling: true, requires_review: false, token_life_days: 60,
    enabled: true, builtin: true, docs_url: null, readiness: 'live', readiness_note: null, readiness_at: null, readiness_by: null,
  }) as PlatformInfo;
setPlatformRegistry([mk('x', 'X', 2)]);

type W = { __calls: { fn: string; args: Record<string, unknown> }[]; __rows: Record<string, unknown>[]; __refuse?: { code: string; message: string } | null };
const w = window as unknown as W;
w.__calls = [];
w.__rows = [];

const people = [
  { email: 'pub@example.test', display_name: 'ناشر الفحص', role: 'publisher', avatar: null },
  { email: 'dir@example.test', display_name: 'مدير الفحص', role: 'director', avatar: null },
];
export function useWork() {
  return {
    status: 'ready' as const, me: 'pub@example.test', role: 'publisher', isAdmin: false, today: '2026-11-26', people,
    nameOf: (e: string | null | undefined) => people.find((x) => x.email === e)?.display_name ?? e ?? '',
    personOf: (e: string) => people.find((x) => x.email === e), load: [], projects: [], accounts: [], platforms: [], templates: [],
    reloadBase: async () => undefined, call: async () => ({ ok: true as const, data: null }), say: () => undefined,
  };
}

let n = 0;
function from(table: string) {
  w.__calls.push({ fn: `select ${table}`, args: {} });
  const result = () => (w.__refuse && w.__refuse.code === 'NO_TABLE' ? { data: null, error: { code: 'PGRST205', message: 'Could not find the table' } } : { data: [...w.__rows].reverse().slice(0, 5), error: null });
  const done = () => Promise.resolve(result());
  const chain = { select: () => chain, eq: () => chain, order: () => chain, limit: () => done(), then: (f: (r: unknown) => unknown, g?: (e: unknown) => unknown) => done().then(f, g) };
  return chain;
}
async function rpc(fn: string, args: Record<string, unknown>) {
  w.__calls.push({ fn, args });
  const refuse = w.__refuse;
  if (refuse) {
    w.__refuse = null;
    return { data: null, error: refuse };
  }
  const m = /^https?:\/\/(?:www\.|mobile\.)?(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})\/status\/([0-9]{5,25})/i.exec(String(args.p_url).trim());
  const id = `test-${++n}`;
  w.__rows.push({ id, account_id: args.p_account, mode: args.p_mode, post_id: m?.[2], post_url: `https://x.com/${m?.[1]}/status/${m?.[2]}`, created_by: 'pub@example.test', created_at: new Date().toISOString() });
  return { data: id, error: null };
}
export const supabase = () => ({ from, rpc });
export const libraryFiles = async () => [];
export const useWorkList = () => ({ items: [], status: 'ready' as const, reload: async () => undefined });

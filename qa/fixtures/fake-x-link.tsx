// Stand-ins for the browser check of X's link route (qa/x-link-flow.cjs, MVP_draft.md section 81): the work provider with an X account
// on the link route, a simulated X account and an Instagram one, and a database client that answers the hand-off's copy source with one
// short text and one picture. The rules themselves are the database's (supabase/tests/x_link_route_rules.sql).
import { setPlatformRegistry, type AccountRow, type PlatformInfo } from '../../src/lib/work/rules';

const later = (d: number) => new Date(Date.now() + d * 864e5).toISOString();
const mk = (key: string, label: string, sort: number, accepts: Record<string, unknown>) =>
  ({
    key, label_ar: label, kind: 'social', sort, accepts, publish_mode: 'auto', scheduling: true, requires_review: false, token_life_days: 60,
    enabled: true, builtin: true, docs_url: null, readiness: 'live', readiness_note: null, readiness_at: null, readiness_by: null,
  }) as PlatformInfo;
setPlatformRegistry([mk('instagram', 'إنستغرام', 1, { max_chars: 2200, video_only: false }), mk('x', 'X', 2, { max_chars: 280, video_only: false })]);
const account = (id: string, platform: string, label: string, handle: string, extra: Partial<AccountRow> = {}): AccountRow =>
  ({ id, platform, label, handle, purpose: null, authorized_until: later(80), publishers: ['pub@example.test'], mode: 'auto', active: true, fixed: false, conn_kind: 'oauth', conn_state: 'connected', ...extra }) as AccountRow;
export const accounts: AccountRow[] = [
  account('x-link', 'x', 'الرسمي', '@t_x', { authorized_until: null, mode: 'ask', route: 'link', conn_kind: undefined, conn_state: undefined }),
  account('x-sim', 'x', 'تجريبي', '@t_sim', { conn_kind: 'simulated', conn_state: 'simulated', route: 'api' }),
  account('ig-main', 'instagram', 'الرسمي', '@t.ig'),
];

const people = [
  { email: 'pub@example.test', display_name: 'ناشر الفحص', role: 'publisher', avatar: null },
  { email: 'dir@example.test', display_name: 'مدير الفحص', role: 'director', avatar: null },
];
const calls = () => (window as unknown as { __calls: unknown[] }).__calls;
export function useWork() {
  return {
    status: 'ready' as const, me: 'pub@example.test', role: 'publisher', isAdmin: false, today: '2026-11-25', people,
    nameOf: (e: string | null | undefined) => people.find((x) => x.email === e)?.display_name ?? e ?? '',
    personOf: (e: string) => people.find((x) => x.email === e), load: [], projects: [], accounts, platforms: [], templates: [],
    reloadBase: async () => undefined, call: async (fn: string, args: unknown) => (calls().push({ fn, args }), { ok: true as const, data: null }), say: () => undefined,
  };
}

// The copy source reads the work's text, its platform copies and its files.
const TEXT = 'افتتاح معرض هداية اليوم في الرياض. ندعوكم لزيارتنا #هداية';
const rows: Record<string, unknown[]> = {
  work_texts: [{ n: 1, body: TEXT }],
  work_variants: [],
  work_assets: [{ file: { id: '11111111-1111-4111-8111-111111111111', kind: 'image', name: 'poster.png', current_version: 2, approved_version: 1 } }],
};
function from(table: string) {
  const done = Promise.resolve({ data: rows[table] ?? [], error: null });
  const chain = { select: () => chain, eq: () => chain, order: () => chain, limit: () => done, then: (f: (r: unknown) => unknown, g?: (e: unknown) => unknown) => done.then(f, g) };
  return chain;
}
export const supabase = () => ({ from, rpc: async () => ({ data: null, error: null }) });
export const libraryFiles = async () => [];
export const useWorkList = () => ({ items: [], status: 'ready' as const, reload: async () => undefined });

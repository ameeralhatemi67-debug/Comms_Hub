// Stand-ins for the browser check of YouTube's choices in the work cycle (qa/publish-choices-flow.cjs, MVP_draft.md section 78): the
// work provider with two YouTube channels (one «غير مدرج» by default) and an Instagram account, and a database client that answers the
// dialogs' copy check with one short text. The rules themselves are the database's (supabase/tests/work_youtube_choices_rules.sql).
import { setPlatformRegistry, type AccountRow, type PlatformInfo } from '../../src/lib/work/rules';

const later = (d: number) => new Date(Date.now() + d * 864e5).toISOString();
const mk = (key: string, label: string, sort: number, accepts: Record<string, unknown>) =>
  ({
    key, label_ar: label, kind: 'social', sort, accepts, publish_mode: 'auto', scheduling: true, requires_review: false, token_life_days: 60,
    enabled: true, builtin: true, docs_url: null, readiness: 'live', readiness_note: null, readiness_at: null, readiness_by: null,
  }) as PlatformInfo;
const platforms: PlatformInfo[] = [
  mk('instagram', 'إنستغرام', 1, { max_chars: 2200, video_only: false }),
  mk('youtube', 'يوتيوب', 4, { max_videos: 1, title_max: 100, description_max_bytes: 5000, video_only: true }),
];
setPlatformRegistry(platforms);
const account = (id: string, platform: string, label: string, extra: Partial<AccountRow> = {}): AccountRow =>
  ({
    id, platform, label, handle: `@${id}`, purpose: null, authorized_until: later(80), publishers: ['pub@example.test'], mode: 'auto', active: true,
    fixed: false, conn_kind: 'oauth', conn_state: 'connected', ...extra,
  }) as AccountRow;
export const accounts: AccountRow[] = [
  account('yt-main', 'youtube', 'الرسمية'),
  account('yt-review', 'youtube', 'المراجعة', { default_privacy: 'unlisted' }),
  account('ig-main', 'instagram', 'الرسمي'),
];

const people = [
  { email: 'pub@example.test', display_name: 'ناشر الفحص', role: 'publisher', avatar: null },
  { email: 'dir@example.test', display_name: 'مدير الفحص', role: 'director', avatar: null },
];
export function useWork() {
  return {
    status: 'ready' as const, me: 'pub@example.test', role: 'publisher', isAdmin: false, today: '2026-11-05', people,
    nameOf: (e: string | null | undefined) => people.find((x) => x.email === e)?.display_name ?? e ?? '',
    personOf: (e: string) => people.find((x) => x.email === e), load: [], projects: [], accounts, platforms, templates: [],
    reloadBase: async () => undefined, call: async () => ({ ok: true as const, data: null }), say: () => undefined,
  };
}

// The copy check reads the work's text, its platform copies and its files.
const rows: Record<string, unknown[]> = { work_texts: [{ n: 1, body: 'افتتاح المعرض\nمقطع الافتتاح كاملاً.' }], work_variants: [], work_assets: [] };
function from(table: string) {
  const done = Promise.resolve({ data: rows[table] ?? [], error: null });
  const chain = { select: () => chain, eq: () => chain, order: () => chain, limit: () => done, then: (f: (r: unknown) => unknown, g?: (e: unknown) => unknown) => done.then(f, g) };
  return chain;
}
export const supabase = () => ({ from, rpc: async () => ({ data: null, error: null }) });

// The library picker is not opened here.
export const libraryFiles = async () => [];
export const useWorkList = () => ({ items: [], status: 'ready' as const, reload: async () => undefined });

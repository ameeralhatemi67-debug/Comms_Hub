// Stand-ins for the browser check of «تجربة النشر» (qa/youtube-test-flow.cjs, MVP_draft.md section 71): the database
// client, the capabilities, the work provider, and the site's /api/platforms/test routes, which answer as the routes do
// in front of a small fake YouTube (pieces acknowledged, the video returned at the last byte, a delete). Every request is
// recorded with the size of what the page sent. Flags in the address change the case:
//   scopes=upload  the channel was connected before the delete permission;   flaky=1  the second piece is lost once;
//   role=publisher / role=other  the account's own publisher / a publisher who is not on it;   off=1  needs reconnecting;
//   slow=1  each piece takes 400 ms, so an upload can be cancelled half way.
// The rules themselves are the database's (supabase/tests/platform_tests_rules.sql) and the routes' (tests/youtube-test.test.mjs).
import { useSyncExternalStore } from 'react';
import { setPlatformRegistry, type AccountRow, type PlatformInfo } from '../../src/lib/work/rules';

const q = new URLSearchParams(location.search);
const ROLE = q.get('role') === 'other' ? 'publisher' : (q.get('role') ?? 'director');
const ME = q.get('role') === 'publisher' ? 'pub@example.test' : q.get('role') === 'other' ? 'pub2@example.test' : 'dir@example.test';
const later = (d: number) => new Date(Date.now() + d * 864e5).toISOString();
const FULL = ['https://www.googleapis.com/auth/youtube.upload', 'https://www.googleapis.com/auth/youtube.readonly', 'https://www.googleapis.com/auth/youtube.force-ssl'];
const platform: PlatformInfo = {
  key: 'youtube', label_ar: 'يوتيوب', kind: 'social', sort: 4, accepts: { video_only: true }, publish_mode: 'assisted', scheduling: true, requires_review: false,
  token_life_days: 60, enabled: true, builtin: true, docs_url: null, readiness: 'live', readiness_note: null, readiness_at: null, readiness_by: null,
} as PlatformInfo;
const yt: AccountRow = {
  id: 'a-yt', platform: 'youtube', label: 'جمعية هداية', handle: '@hedayh', purpose: null, authorized_until: later(80), publishers: ['pub@example.test'], mode: 'auto',
  active: true, fixed: false, conn_kind: 'oauth', conn_state: q.get('off') ? 'needs_reconnect' : 'connected', conn_checked_at: later(-0.01), conn_error: q.get('off') ? 'TOKEN_REFUSED' : null,
  external_id: 'UCfixturechannel000000', external_name: 'جمعية هداية', scopes: q.get('scopes') === 'upload' ? FULL.slice(0, 2) : FULL,
};
type Test = { id: string; privacy: string; title: string; state: string; video_id: string | null; shown_privacy: string | null; error: string | null; created_by: string; created_at: string; deleted_at: string | null; size: number; piece: number; got: number; lost: boolean };
const db = {
  tests: [] as Test[],
  calls: [] as { method: string; url: string; body: unknown; bytes: number }[],
  says: [] as string[],
};
const w = window as unknown as { __db: typeof db };
w.__db = db;
const listeners = new Set<() => void>();
let version = 0;
const changed = () => {
  version++;
  listeners.forEach((l) => l());
};
const ok = (data: unknown = null) => Promise.resolve({ data, error: null });

function from(table: string) {
  const rows = () => (table === 'platform_tests' ? [...db.tests].reverse().slice(0, 5).map(({ size, piece, got, lost, ...t }) => (void size, void piece, void got, void lost, t)) : []);
  const chain = { select: () => chain, eq: () => chain, order: () => chain, limit: () => ok(rows()), then: (f: (r: unknown) => void) => ok(rows()).then(f) };
  return chain;
}
export const supabase = () => ({ rpc: (name: string) => ok(name === 'platform_ready' ? { google_app: 'connected' } : null), from });

// The routes, in front of a fake YouTube. A piece is the size the route agreed: 256 KiB here, so a small file makes several.
const PIECE = 256 * 1024;
const realFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if (!url.startsWith('/api/platforms/')) return realFetch(input, init);
  const method = init?.method ?? 'GET';
  const raw = init?.body;
  const bytes = raw instanceof Blob ? raw.size : 0;
  const body = typeof raw === 'string' ? JSON.parse(raw) : null;
  db.calls.push({ method, url, body, bytes });
  const reply = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } });
  if (url === '/api/platforms/check') return reply({ checked: 0, results: [] });
  if (url === '/api/platforms/test' && method === 'POST') {
    if (ME === 'pub2@example.test') return reply({ error: 'تجربة النشر لمن يدير الحسابات ولمن ينشر على هذه القناة.', code: 'FORBIDDEN' }, 403);
    if (body.title === 'أعد الربط') return reply({ error: 'لم يأذن Google للموقع بهذا بعد. أعد ربط القناة مرة واحدة ووافق على كل الصلاحيات.', code: 'SCOPE_MISSING' }, 403);
    const size = body.source === 'library' ? 600 * 1024 : body.size;
    const t: Test = { id: `00000000-0000-4000-8000-${String(db.tests.length + 1).padStart(12, '0')}`, privacy: body.privacy, title: body.title, state: 'uploading', video_id: null, shown_privacy: null, error: null, created_by: ME, created_at: new Date().toISOString(), deleted_at: null, size, piece: PIECE, got: 0, lost: false };
    db.tests.push(t);
    changed();
    return reply({ test: t.id, size, piece: PIECE });
  }
  const m = /^\/api\/platforms\/test\/([^?]+)(?:\?(.*))?$/.exec(url);
  const t = m ? db.tests.find((x) => x.id === m[1]) : undefined;
  if (!t) return reply({ error: 'غير موجود', code: 'FORBIDDEN' }, 403);
  const p = new URLSearchParams(m![2] ?? '');
  if (method === 'PUT') {
    if (q.get('slow')) await new Promise((r) => setTimeout(r, 400));
    const from = Number(p.get('from'));
    if (p.get('ask') === '1') return reply({ next: t.got });
    const len = Math.min(t.piece, t.size - from);
    // A file from the device must come in exactly the agreed pieces; a library file is read by the server, so nothing comes.
    if (from !== t.got || (raw instanceof Blob ? bytes !== len : raw != null)) return reply({ error: 'بيانات التجربة ناقصة أو غير صالحة.', code: 'TEST_INVALID' }, 400);
    if (q.get('flaky') && from > 0 && !t.lost) {
      t.lost = true;
      return reply({ error: 'تعذّر الوصول إلى المنصة.', code: 'UNREACHABLE', retry: true }, 502);
    }
    t.got = from + len;
    if (t.got < t.size) return reply({ next: t.got });
    Object.assign(t, { state: 'published', video_id: 'dQw4w9WgXcQ', shown_privacy: 'private' });
    changed();
    return reply({ done: true, video: 'dQw4w9WgXcQ', privacy: 'private' });
  }
  if (method === 'DELETE') {
    if (t.state === 'uploading') {
      Object.assign(t, { state: 'failed', error: 'CANCELLED' });
      changed();
      return reply({ cancelled: true });
    }
    if (!yt.scopes!.includes(FULL[2])) return reply({ error: 'لم يأذن Google للموقع بهذا بعد.', code: 'SCOPE_MISSING' }, 403);
    Object.assign(t, { state: 'deleted', deleted_at: new Date().toISOString() });
    changed();
    return reply({ deleted: true, gone: false });
  }
  return reply({ error: 'غير موجود' }, 404);
};

// Capabilities (src/components/caps.tsx).
export const useCaps = () => ({ ready: true, evals: [], grants: [], has: () => true, evalOf: () => undefined, reload: async () => undefined });

// The work provider (src/components/work/data.tsx).
const people = [
  { email: 'dir@example.test', display_name: 'مدير الفحص', role: 'director', avatar: null },
  { email: 'pub@example.test', display_name: 'ناشر الفحص', role: 'publisher', avatar: null },
  { email: 'pub2@example.test', display_name: 'ناشر آخر', role: 'publisher', avatar: null },
];
const nameOf = (e: string | null | undefined) => people.find((x) => x.email === e)?.display_name ?? e ?? '';
setPlatformRegistry([platform]);
const say = (text: string) => {
  db.says.push(text);
  changed();
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};
export function useWork() {
  useSyncExternalStore(subscribe, () => version);
  return {
    status: 'ready' as const, me: ME, role: ROLE, isAdmin: false, today: '2026-11-03', people, nameOf, personOf: (e: string) => people.find((x) => x.email === e),
    load: [], projects: [], accounts: [yt], platforms: [platform], templates: [], reloadBase: async () => undefined, call: async () => ({ ok: true as const, data: null }), say,
  };
}
export const useWorkList = () => ({ items: [], reload: async () => undefined });
// The library: a video and a picture. The picker shows videos only.
export const libraryFiles = async () => [
  { id: 'f-video', name: 'مقطع الحملة.mp4', kind: 'video', current_version: 3, stage: 'approved' },
  { id: 'f-image', name: 'صورة الغلاف.png', kind: 'image', current_version: 1, stage: 'approved' },
];

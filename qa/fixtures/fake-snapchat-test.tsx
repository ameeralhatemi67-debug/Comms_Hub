// Stand-ins for the browser check of «تجربة النشر» on a Snapchat account (qa/snapchat-test-flow.cjs, Snapchat_Test_Plan.md): the
// database client, the capabilities, the work provider, the Drive upload the site opens, and the site's /api/platforms/test routes,
// which answer as Snapchat_Test_Plan.md section 5 says they do in front of a small fake Snap (the account check; a silent check done
// in one request; a Spotlight and a Story posted in the request that follows the upload; the numbers; a delete; a Story that cannot
// be deleted). Every request is recorded with what the page sent. Nothing here has met Snap: Snap's whole API is open only to apps it
// has allowed. Flags in the address change the case:
//   refuse=1    Snap refuses the profile read (ACCESS_NOT_GRANTED);   expired=1  the token is expired (TOKEN_EXPIRED);
//   partial=1   the check comes back with the parts Snap would not give as null;   nodelete=1  Snap refuses the silent check's delete;
//   nostats=1   Snap has no numbers yet;   slowdrive=1  the Drive upload goes slowly, so it can be cancelled;
//   role=publisher / role=other  the account's own publisher / a publisher who is not on it;   off=1  needs reconnecting.
// The rules themselves are the database's (supabase/tests/platform_tests_snapchat_rules.sql) and the routes' (tests/snapchat-test.test.mjs).
import { useSyncExternalStore } from 'react';
import { CONN_ERROR_AR } from '../../src/lib/platforms/info';
import { SN_STORY_HOURS, SN_SILENT_DAYS, TEST_ERROR_AR, snTitle } from '../../src/lib/platforms/test-rules';
import { setPlatformRegistry, type AccountRow, type PlatformInfo } from '../../src/lib/work/rules';

const q = new URLSearchParams(location.search);
const ROLE = q.get('role') === 'other' ? 'publisher' : (q.get('role') ?? 'director');
const ME = q.get('role') === 'publisher' ? 'pub@example.test' : q.get('role') === 'other' ? 'pub2@example.test' : 'dir@example.test';
const later = (d: number) => new Date(Date.now() + d * 864e5).toISOString();
const platform = {
  key: 'snapchat', label_ar: 'سناب شات', kind: 'social', sort: 5, accepts: { video_only: false }, publish_mode: 'assisted', scheduling: false, requires_review: false,
  token_life_days: 60, enabled: true, builtin: false, docs_url: null, readiness: 'live', readiness_note: null, readiness_at: null, readiness_by: null,
} as unknown as PlatformInfo;
export const sn = {
  id: 'a-sn', platform: 'snapchat', label: 'ملف الجمعية', handle: 'hedayah.team', purpose: null, authorized_until: later(55), publishers: ['pub@example.test'], mode: 'auto',
  active: true, fixed: false, conn_kind: 'oauth', conn_state: q.get('off') ? 'needs_reconnect' : 'connected', conn_checked_at: later(-0.01), conn_error: q.get('off') ? 'TOKEN_REFUSED' : null,
  external_id: '8f1c2d3e-4a5b-4c6d-9e7f-0a1b2c3d4e5f', external_name: 'هداية', scopes: ['snapchat-profile-api'],
} as unknown as AccountRow;
type Test = {
  id: string; privacy: null; title: string; kind: string; state: string; video_id: string | null; post_url: string | null; shown_privacy: null; error: string | null; error_detail?: string | null;
  link: null; scheduled_for: string | null; purpose: string; created_by: string; created_at: string; done_at: string | null; deleted_at: string | null;
  size: number | null; source: string | null; ref: string | null; description: string;
};
const db = { tests: [] as Test[], calls: [] as { method: string; url: string; body: unknown; bytes: number }[], says: [] as string[] };
const w = window as unknown as { __db: typeof db };
w.__db = db;
const listeners = new Set<() => void>();
let version = 0;
const changed = () => {
  version++;
  listeners.forEach((l) => l());
};
const ok = (data: unknown = null) => Promise.resolve({ data, error: null });
// What the library says of its files: the type and size are the library's, the length is read from the clip the check's server gives at /api/media/<id>/content.
const LIBRARY: Record<string, { mime_type: string; size_bytes: number }> = {
  'f-ok': { mime_type: 'video/mp4', size_bytes: 6 * 1048576 },
  'f-short': { mime_type: 'video/mp4', size_bytes: 1048576 },
  'f-long': { mime_type: 'video/mp4', size_bytes: 8 * 1048576 },
  'f-mov': { mime_type: 'video/quicktime', size_bytes: 6 * 1048576 },
  'f-big': { mime_type: 'video/mp4', size_bytes: 40 * 1048576 },
};

function from(table: string) {
  let id = '';
  const rows = () =>
    table === 'platform_tests' ? [...db.tests].reverse().slice(0, 5).map(({ size, source, ref, description, ...t }) => (void size, void source, void ref, void description, t)) : [];
  const chain = {
    select: () => chain,
    eq: (_k: string, v: string) => ((id = v), chain),
    order: () => chain,
    limit: () => ok(rows()),
    maybeSingle: () => ok(table === 'media_files' ? (LIBRARY[id] ?? null) : null),
    then: (f: (r: unknown) => void) => ok(rows()).then(f),
  };
  return chain;
}
export const supabase = () => ({ rpc: (name: string) => ok(name === 'platform_ready' ? { snapchat_app: 'connected' } : null), from });

const reply = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } });
const newTest = (kind: string, title: string, o: Partial<Test> = {}): Test => {
  const t: Test = {
    id: `00000000-0000-4000-8000-${String(db.tests.length + 1).padStart(12, '0')}`, privacy: null, title, kind, state: 'uploading', video_id: null, post_url: null, shown_privacy: null,
    error: null, link: null, scheduled_for: null, purpose: 'test', created_by: ME, created_at: new Date().toISOString(), done_at: null, deleted_at: null,
    size: null, source: null, ref: null, description: '', ...o,
  };
  db.tests.push(t);
  return t;
};
/** A Spotlight id as Snap gives one: 58 base64url characters. */
const spotlightId = (n: number) => `Zm9vYmFyU3BvdGxpZ2h0${String(n).padStart(4, '0')}QUJDREVGR0hJSktMTU5PUFFSU1RV`.slice(0, 58);

// The final answer of a post: what the route returns once Snap has the media and has been asked to post it.
function post(t: Test) {
  const description = t.description;
  if (description === 'ارفض') {
    Object.assign(t, { state: 'failed', error: 'SN_POST_REFUSED', error_detail: 'snap http 403' });
    changed();
    return reply({ error: TEST_ERROR_AR.SN_POST_REFUSED, code: 'SN_POST_REFUSED', detail: 'snap http 403' }, 502);
  }
  const at = later(SN_SILENT_DAYS);
  if (t.kind === 'snap_silent') {
    Object.assign(t, { state: 'published', video_id: spotlightId(db.tests.indexOf(t) + 1), scheduled_for: at, done_at: new Date().toISOString() });
    if (q.get('nodelete')) {
      changed();
      return reply({ done: true, silent: true, deleted: false, post: t.video_id, status: 'SUBMITTED', at, kind: t.kind, error: 'SN_SILENT_NOT_DELETED' });
    }
    Object.assign(t, { state: 'deleted', deleted_at: new Date().toISOString() });
    changed();
    return reply({ done: true, silent: true, deleted: true, post: t.video_id, status: 'SUBMITTED', at, kind: t.kind });
  }
  if (t.kind === 'snap_story') {
    Object.assign(t, { state: 'published', done_at: new Date().toISOString() });
    changed();
    return reply({ done: true, kind: t.kind, endsAt: new Date(Date.now() + SN_STORY_HOURS * 3600e3).toISOString() });
  }
  Object.assign(t, { state: 'published', video_id: spotlightId(db.tests.indexOf(t) + 1), done_at: new Date().toISOString() });
  changed();
  return reply({ done: true, post: t.video_id, status: 'SUBMITTED', kind: t.kind });
}

const realFetch = window.fetch.bind(window);
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  const method = init?.method ?? 'GET';
  const raw = init?.body;
  const bytes = raw instanceof Blob ? raw.size : 0;
  if (url.includes('/drive-upload/')) {
    const id = url.split('/drive-upload/')[1];
    db.calls.push({ method, url: `/drive-upload/${id}`, body: null, bytes });
    const t = db.tests.find((x) => x.id === id);
    if (!t || (!q.get('slowdrive') && bytes !== t.size)) return new Response('bad', { status: 400 });
    if (q.get('slowdrive')) {
      // Drive keeps asking for more: a 308 with the range it has, again and again, until the page stops.
      await pause(250);
      return new Response(null, { status: 308, headers: { Range: 'bytes=0-1023' } });
    }
    t.ref = `drivefileSNFIXTURE${db.tests.indexOf(t) + 1}x`;
    return reply({ id: t.ref });
  }
  if (!url.startsWith('/api/platforms/')) return realFetch(input, init);
  const body = typeof raw === 'string' ? (JSON.parse(raw) as Record<string, unknown>) : null;
  db.calls.push({ method, url, body, bytes });
  if (url === '/api/platforms/check') return reply({ checked: 0, results: [] });
  if (url === '/api/platforms/test' && method === 'POST') {
    if (ME === 'pub2@example.test') return reply({ error: TEST_ERROR_AR.FORBIDDEN, code: 'FORBIDDEN' }, 403);
    const b = body as Record<string, string>;
    if (b.kind === 'snap_check') {
      if (q.get('refuse')) return reply({ error: CONN_ERROR_AR.ACCESS_NOT_GRANTED, code: 'ACCESS_NOT_GRANTED' }, 403);
      if (q.get('expired')) return reply({ error: CONN_ERROR_AR.TOKEN_EXPIRED, code: 'TOKEN_EXPIRED' }, 401);
      if (q.get('partial')) return reply({ check: { profile: { name: 'هداية', username: null, subscribers: null }, spotlights: null, stories: null, stats: null, note: '' } });
      return reply({
        check: {
          profile: { name: 'هداية', username: 'hedayah.team', subscribers: 4210 },
          spotlights: { count: 5, live: 3, submitted: 1, rejected: 1 },
          stories: { count: 2 },
          stats: { subscribers: 4210, views: 52000, viewers: 31000, shares: 410, screenshots: 87 },
          note: 'قرأ الفحص آخر خمسة سبوتلايت وآخر قصتين.',
        },
      });
    }
    const size = b.source === 'library' ? LIBRARY[b.asset]?.size_bytes : Number(b.size);
    const t = newTest(b.kind, snTitle(b.kind as 'snap_spotlight', b.description ?? ''), { size, source: b.source, description: b.description ?? '' });
    changed();
    if (b.source === 'library') return post(t);
    return reply({ test: t.id, phase: 'upload', upload: `${location.origin}/drive-upload/${t.id}` });
  }
  const m = /^\/api\/platforms\/test\/([^?]+)$/.exec(url);
  const t = m ? db.tests.find((x) => x.id === m[1]) : undefined;
  if (!t) return reply({ error: 'غير موجود', code: 'FORBIDDEN' }, 403);
  if (method === 'POST' && body?.step === 'uploaded') {
    if (!t.ref || body.ref !== t.ref) return reply({ error: TEST_ERROR_AR.TEMP_MISMATCH, code: 'TEMP_MISMATCH' }, 400);
    return post(t);
  }
  if (method === 'POST' && body?.step === 'stats') {
    if (t.kind !== 'snap_spotlight' || t.state !== 'published') return reply({ error: 'لا أرقام لهذه التجربة.', code: 'TEST_INVALID' }, 400);
    if (q.get('nostats')) return reply({ error: TEST_ERROR_AR.SN_STATS_UNAVAILABLE, code: 'SN_STATS_UNAVAILABLE' }, 404);
    return reply({ stats: { views: 128, viewers: 97, shares: 6, screenshots: 2, at: new Date().toISOString(), late: true } });
  }
  if (method === 'DELETE') {
    if (t.state === 'uploading') {
      Object.assign(t, { state: 'failed', error: 'CANCELLED' });
      changed();
      return reply({ cancelled: true });
    }
    if (t.kind === 'snap_story') return reply({ error: TEST_ERROR_AR.SN_NO_DELETE, code: 'SN_NO_DELETE' }, 409);
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
    status: 'ready' as const, me: ME, role: ROLE, isAdmin: false, today: '2026-11-26', people, nameOf, personOf: (e: string) => people.find((x) => x.email === e),
    load: [], projects: [], accounts: [sn], platforms: [platform], templates: [], reloadBase: async () => undefined, call: async () => ({ ok: true as const, data: null }), say,
  };
}
export const useWorkList = () => ({ items: [], reload: async () => undefined });
// The library: five videos that differ in what the panel must refuse or take.
export const libraryFiles = async () => [
  { id: 'f-ok', name: 'مقطع مناسب.mp4', kind: 'video', current_version: 3, stage: 'approved' },
  { id: 'f-short', name: 'مقطع قصير.mp4', kind: 'video', current_version: 1, stage: 'approved' },
  { id: 'f-long', name: 'مقطع طويل.mp4', kind: 'video', current_version: 1, stage: 'approved' },
  { id: 'f-mov', name: 'مقطع بصيغة أخرى.mov', kind: 'video', current_version: 1, stage: 'approved' },
  { id: 'f-big', name: 'مقطع كبير.mp4', kind: 'video', current_version: 1, stage: 'approved' },
];

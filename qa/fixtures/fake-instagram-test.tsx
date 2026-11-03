// Stand-ins for the browser check of «تجربة النشر» on Instagram (qa/instagram-test-flow.cjs, MVP_draft.md section 72): the
// database client, the capabilities, the work provider, the Drive upload the site opens, and the site's /api/platforms/test
// routes, which answer as the routes do in front of a small fake Meta (a container that waits, then is published; a delete).
// Every request is recorded with the size of what the page sent. Flags in the address change the case:
//   scopes=publish  connected without the delete permission;   fail=1  Meta cannot fetch the file;
//   slow=1  Meta prepares for longer, so a test can be cancelled;   role=publisher / role=other   the account's own
//   publisher / a publisher who is not on it;   off=1  needs reconnecting.
// The rules themselves are the database's (supabase/tests/platform_tests_instagram_rules.sql) and the routes'
// (tests/instagram-test.test.mjs).
import { useSyncExternalStore } from 'react';
import { setPlatformRegistry, type AccountRow, type PlatformInfo } from '../../src/lib/work/rules';

const q = new URLSearchParams(location.search);
const ROLE = q.get('role') === 'other' ? 'publisher' : (q.get('role') ?? 'director');
const ME = q.get('role') === 'publisher' ? 'pub@example.test' : q.get('role') === 'other' ? 'pub2@example.test' : 'dir@example.test';
const later = (d: number) => new Date(Date.now() + d * 864e5).toISOString();
const SCOPES = ['instagram_basic', 'instagram_content_publish', 'instagram_manage_comments', ...(q.get('scopes') === 'publish' ? [] : ['instagram_manage_contents'])];
const platform = {
  key: 'instagram', label_ar: 'إنستغرام', kind: 'social', sort: 1, accepts: { video_only: false }, publish_mode: 'assisted', scheduling: true, requires_review: false,
  token_life_days: 60, enabled: true, builtin: true, docs_url: null, readiness: 'live', readiness_note: null, readiness_at: null, readiness_by: null,
} as PlatformInfo;
const ig: AccountRow = {
  id: 'a-ig', platform: 'instagram', label: 'حساب الجمعية', handle: '@hedayh_org', purpose: null, authorized_until: later(55), publishers: ['pub@example.test'], mode: 'auto',
  active: true, fixed: false, conn_kind: 'oauth', conn_state: q.get('off') ? 'needs_reconnect' : 'connected', conn_checked_at: later(-0.01), conn_error: q.get('off') ? 'TOKEN_REFUSED' : null,
  external_id: '17841400000000001', external_name: 'حساب الجمعية', scopes: SCOPES,
};
type Test = { id: string; privacy: null; title: string; kind: string; state: string; video_id: string | null; post_url: string | null; shown_privacy: null; error: string | null; created_by: string; created_at: string; done_at: string | null; deleted_at: string | null; size: number; source: string; ref: string | null; waits: number };
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
const LIBRARY: Record<string, { mime_type: string; size_bytes: number }> = { 'f-video': { mime_type: 'video/mp4', size_bytes: 6 * 1048576 }, 'f-image': { mime_type: 'image/png', size_bytes: 20000 } };

function from(table: string) {
  let id = '';
  const rows = () => (table === 'platform_tests' ? [...db.tests].reverse().slice(0, 5).map(({ size, source, ref, waits, ...t }) => (void size, void source, void ref, void waits, t)) : []);
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
export const supabase = () => ({ rpc: (name: string) => ok(name === 'platform_ready' ? { meta_app: 'connected' } : null), from });

const reply = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } });
const realFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  const method = init?.method ?? 'GET';
  const raw = init?.body;
  const bytes = raw instanceof Blob ? raw.size : 0;
  // The Drive upload the site opened: the whole file in one piece, answered with Drive's id.
  if (url.includes('/drive-upload/')) {
    const id = url.split('/drive-upload/')[1];
    db.calls.push({ method, url: `/drive-upload/${id}`, body: null, bytes });
    const t = db.tests.find((x) => x.id === id);
    if (!t || bytes !== t.size) return new Response('bad', { status: 400 });
    t.ref = `drivefileFIXTURE${db.tests.indexOf(t) + 1}x`;
    return reply({ id: t.ref });
  }
  if (!url.startsWith('/api/platforms/')) return realFetch(input, init);
  const body = typeof raw === 'string' ? JSON.parse(raw) : null;
  db.calls.push({ method, url, body, bytes });
  if (url === '/api/platforms/check') return reply({ checked: 0, results: [] });
  if (url === '/api/platforms/test' && method === 'POST') {
    if (ME === 'pub2@example.test') return reply({ error: 'تجربة النشر لمن يدير الحسابات ولمن ينشر على هذا الحساب.', code: 'FORBIDDEN' }, 403);
    if (body.caption === 'أعد الربط') return reply({ error: 'لم تأذن المنصة للموقع بهذا بعد. أعد ربط الحساب مرة واحدة ووافق على كل الصلاحيات.', code: 'SCOPE_MISSING' }, 403);
    const size = body.source === 'library' ? LIBRARY[body.asset]?.size_bytes : body.size;
    const n = db.tests.length + 1;
    const line = String(body.caption ?? '').split('\n').find((l: string) => l.trim())?.trim();
    const t: Test = {
      id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`, privacy: null, title: line || 'تجربة قصة', kind: body.kind, state: 'uploading', video_id: null, post_url: null,
      shown_privacy: null, error: null, created_by: ME, created_at: new Date().toISOString(), done_at: null, deleted_at: null, size, source: body.source, ref: null, waits: 0,
    };
    db.tests.push(t);
    changed();
    const quota = { used: 3, total: 50 };
    if (body.source === 'library') return reply({ test: t.id, phase: 'wait', quota });
    return reply({ test: t.id, phase: 'upload', upload: `${location.origin}/drive-upload/${t.id}`, quota });
  }
  const m = /^\/api\/platforms\/test\/([^?]+)$/.exec(url);
  const t = m ? db.tests.find((x) => x.id === m[1]) : undefined;
  if (!t) return reply({ error: 'غير موجود', code: 'FORBIDDEN' }, 403);
  if (method === 'POST' && body?.step === 'uploaded') {
    if (!t.ref || body.ref !== t.ref) return reply({ error: 'الملف المرفوع لا يطابق هذه التجربة.', code: 'TEMP_MISMATCH' }, 400);
    return reply({ test: t.id, phase: 'wait', quota: null });
  }
  if (method === 'POST' && body?.step === 'advance') {
    if (q.get('fail')) {
      Object.assign(t, { state: 'failed', error: 'MEDIA_FETCH_FAILED' });
      changed();
      return reply({ error: 'لم يستطع إنستغرام جلب الملف من الموقع. أعد المحاولة بعد قليل.', code: 'MEDIA_FETCH_FAILED' }, 502);
    }
    if (++t.waits < (q.get('slow') ? 30 : 2)) return reply({ phase: 'wait' });
    const post = String(17920000000000000 + db.tests.indexOf(t) + 1);
    const story = t.kind.startsWith('story');
    Object.assign(t, { state: 'published', video_id: post, post_url: story ? null : `https://www.instagram.com/p/FIXTURE${db.tests.indexOf(t) + 1}/`, done_at: new Date().toISOString() });
    changed();
    return reply({ done: true, post, url: t.post_url, kind: t.kind });
  }
  if (method === 'DELETE') {
    if (t.state === 'uploading') {
      Object.assign(t, { state: 'failed', error: 'CANCELLED' });
      changed();
      return reply({ cancelled: true });
    }
    if (!SCOPES.includes('instagram_manage_contents')) return reply({ error: 'لم تأذن المنصة للموقع بهذا بعد.', code: 'SCOPE_MISSING' }, 403);
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
    load: [], projects: [], accounts: [ig], platforms: [platform], templates: [], reloadBase: async () => undefined, call: async () => ({ ok: true as const, data: null }), say,
  };
}
export const useWorkList = () => ({ items: [], reload: async () => undefined });
// The library: a video and a picture.
export const libraryFiles = async () => [
  { id: 'f-video', name: 'مقطع الحملة.mp4', kind: 'video', current_version: 3, stage: 'approved' },
  { id: 'f-image', name: 'صورة الغلاف.png', kind: 'image', current_version: 1, stage: 'approved' },
];

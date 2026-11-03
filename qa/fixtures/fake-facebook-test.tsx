// Stand-ins for the browser check of «تجربة النشر» on a Facebook Page (qa/facebook-test-flow.cjs, MVP_draft.md section 73):
// the database client, the capabilities, the work provider, the Drive upload the site opens, and the site's
// /api/platforms/test routes, which answer as the routes do in front of a small fake Meta (the silent check in one request,
// a photo taken as a form, a Reel that waits, then is published; a delete). Every request is recorded with what the page
// sent. Flags in the address change the case:
//   nodelete=1  Meta refuses the silent check's delete;   slow=1  the Reel waits longer, so it can be cancelled;
//   role=publisher / role=other  the Page's own publisher / a publisher who is not on it;   off=1  needs reconnecting.
// The rules themselves are the database's (supabase/tests/platform_tests_facebook_rules.sql) and the routes'
// (tests/facebook-test.test.mjs).
import { useSyncExternalStore } from 'react';
import { setPlatformRegistry, type AccountRow, type PlatformInfo } from '../../src/lib/work/rules';

const q = new URLSearchParams(location.search);
const ROLE = q.get('role') === 'other' ? 'publisher' : (q.get('role') ?? 'director');
const ME = q.get('role') === 'publisher' ? 'pub@example.test' : q.get('role') === 'other' ? 'pub2@example.test' : 'dir@example.test';
const PAGE = '102345678901234';
const later = (d: number) => new Date(Date.now() + d * 864e5).toISOString();
const platform = {
  key: 'facebook', label_ar: 'فيسبوك', kind: 'social', sort: 7, accepts: { video_only: false }, publish_mode: 'assisted', scheduling: true, requires_review: false,
  token_life_days: 60, enabled: true, builtin: false, docs_url: null, readiness: 'live', readiness_note: null, readiness_at: null, readiness_by: null,
} as PlatformInfo;
const fb: AccountRow = {
  id: 'a-fb', platform: 'facebook', label: 'صفحة الجمعية', handle: 'صفحة الجمعية', purpose: null, authorized_until: later(55), publishers: ['pub@example.test'], mode: 'auto',
  active: true, fixed: false, conn_kind: 'oauth', conn_state: q.get('off') ? 'needs_reconnect' : 'connected', conn_checked_at: later(-0.01), conn_error: q.get('off') ? 'TOKEN_REFUSED' : null,
  external_id: PAGE, external_name: 'صفحة الجمعية', scopes: ['pages_show_list', 'pages_read_engagement', 'pages_manage_posts', 'publish_video'],
};
type Test = {
  id: string; privacy: null; title: string; kind: string; state: string; video_id: string | null; post_url: string | null; shown_privacy: null; error: string | null;
  link: string | null; scheduled_for: string | null; created_by: string; created_at: string; done_at: string | null; deleted_at: string | null;
  size: number | null; source: string | null; ref: string | null; waits: number;
};
const db = { tests: [] as Test[], calls: [] as { method: string; url: string; body: unknown; bytes: number; form?: Record<string, string | number> }[], says: [] as string[] };
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
  const rows = () =>
    table === 'platform_tests' ? [...db.tests].reverse().slice(0, 5).map(({ size, source, ref, waits, ...t }) => (void size, void source, void ref, void waits, t)) : [];
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
const n = () => db.tests.length + 1;
const newTest = (kind: string, title: string, o: Partial<Test> = {}): Test => {
  const t: Test = {
    id: `00000000-0000-4000-8000-${String(n()).padStart(12, '0')}`, privacy: null, title, kind, state: 'uploading', video_id: null, post_url: null, shown_privacy: null, error: null,
    link: null, scheduled_for: null, created_by: ME, created_at: new Date().toISOString(), done_at: null, deleted_at: null, size: null, source: null, ref: null, waits: 0, ...o,
  };
  db.tests.push(t);
  return t;
};
const publish = (t: Test, url: string | null) => {
  Object.assign(t, { state: 'published', video_id: `${PAGE}_${900000000000000 + db.tests.indexOf(t)}`, post_url: url, done_at: new Date().toISOString() });
  changed();
};
const realFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  const method = init?.method ?? 'GET';
  const raw = init?.body;
  const bytes = raw instanceof Blob ? raw.size : 0;
  if (url.includes('/drive-upload/')) {
    const id = url.split('/drive-upload/')[1];
    db.calls.push({ method, url: `/drive-upload/${id}`, body: null, bytes });
    const t = db.tests.find((x) => x.id === id);
    if (!t || bytes !== t.size) return new Response('bad', { status: 400 });
    t.ref = `drivefileFBFIXTURE${db.tests.indexOf(t) + 1}x`;
    return reply({ id: t.ref });
  }
  if (!url.startsWith('/api/platforms/')) return realFetch(input, init);
  let body: Record<string, unknown> | null = null;
  let form: Record<string, string | number> | undefined;
  if (typeof raw === 'string') body = JSON.parse(raw);
  if (raw instanceof FormData) {
    form = {};
    for (const [k, v] of raw.entries()) form[k] = v instanceof Blob ? v.size : String(v);
  }
  db.calls.push({ method, url, body, bytes, form });
  if (url === '/api/platforms/check') return reply({ checked: 0, results: [] });
  if (url === '/api/platforms/test' && method === 'POST') {
    if (ME === 'pub2@example.test') return reply({ error: 'تجربة النشر لمن يدير الحسابات ولمن ينشر على هذا الحساب.', code: 'FORBIDDEN' }, 403);
    const b = body as Record<string, string>;
    if (b.message === 'ارفض') return reply({ error: 'رفضت فيسبوك النشر على الصفحة: تأكد أن من ربطها يستطيع إنشاء المحتوى عليها، وأن الصفحة لا تنتظر «تفويض النشر».', code: 'PAGE_REFUSED' }, 403);
    const line = String(b.message ?? '').split('\n').find((l) => l.trim())?.trim();
    if (b.kind === 'fb_silent') {
      const t = newTest('fb_silent', 'فحص صامت', { scheduled_for: later(28) });
      publish(t, null);
      if (q.get('nodelete')) return reply({ done: true, silent: true, deleted: false, error: 'SILENT_NOT_DELETED', post: t.video_id });
      Object.assign(t, { state: 'deleted', deleted_at: new Date().toISOString() });
      changed();
      return reply({ done: true, silent: true, deleted: true, post: t.video_id });
    }
    if (b.kind === 'fb_text') {
      const t = newTest('fb_text', line || 'تجربة منشور نصي', { link: b.link || null });
      publish(t, `https://www.facebook.com/${PAGE}/posts/${db.tests.indexOf(t) + 1}`);
      return reply({ done: true, post: t.video_id, url: t.post_url, kind: 'fb_text' });
    }
    if (b.kind === 'fb_photo') {
      const t = newTest('fb_photo', line || 'تجربة منشور صورة', { size: Number(b.size), source: 'device' });
      changed();
      return reply({ test: t.id, phase: 'photo' });
    }
    const size = b.source === 'library' ? LIBRARY[b.asset]?.size_bytes : Number(b.size);
    const t = newTest('fb_reel', line || 'تجربة ريلز', { size, source: b.source });
    changed();
    if (b.source === 'library') return reply({ test: t.id, phase: 'wait' });
    return reply({ test: t.id, phase: 'upload', upload: `${location.origin}/drive-upload/${t.id}` });
  }
  const m = /^\/api\/platforms\/test\/([^?]+)$/.exec(url);
  const t = m ? db.tests.find((x) => x.id === m[1]) : undefined;
  if (!t) return reply({ error: 'غير موجود', code: 'FORBIDDEN' }, 403);
  if (method === 'PUT') {
    // A photo: the form must hold the started file and its words.
    if (t.kind !== 'fb_photo' || !form || form.file !== t.size) return reply({ error: 'بيانات التجربة ناقصة أو غير صالحة.', code: 'TEST_INVALID' }, 400);
    publish(t, `https://www.facebook.com/photo/?fbid=${db.tests.indexOf(t) + 1}`.replace('/photo/?fbid=', `/${PAGE}/posts/`));
    return reply({ done: true, post: t.video_id, url: t.post_url, kind: 'fb_photo' });
  }
  if (method === 'POST' && body?.step === 'uploaded') {
    if (!t.ref || body.ref !== t.ref) return reply({ error: 'الملف المرفوع لا يطابق هذه التجربة.', code: 'TEMP_MISMATCH' }, 400);
    return reply({ test: t.id, phase: 'wait' });
  }
  if (method === 'POST' && body?.step === 'advance') {
    if (++t.waits < (q.get('slow') ? 30 : 2)) return reply({ phase: 'wait' });
    publish(t, `https://www.facebook.com/reel/${1234567890123450 + db.tests.indexOf(t)}`);
    return reply({ done: true, post: t.video_id, url: t.post_url, kind: 'fb_reel' });
  }
  if (method === 'DELETE') {
    if (t.state === 'uploading') {
      Object.assign(t, { state: 'failed', error: 'CANCELLED' });
      changed();
      return reply({ cancelled: true });
    }
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
    load: [], projects: [], accounts: [fb], platforms: [platform], templates: [], reloadBase: async () => undefined, call: async () => ({ ok: true as const, data: null }), say,
  };
}
export const useWorkList = () => ({ items: [], reload: async () => undefined });
// The library: a video and a picture.
export const libraryFiles = async () => [
  { id: 'f-video', name: 'مقطع الحملة.mp4', kind: 'video', current_version: 3, stage: 'approved' },
  { id: 'f-image', name: 'صورة الغلاف.png', kind: 'image', current_version: 1, stage: 'approved' },
];

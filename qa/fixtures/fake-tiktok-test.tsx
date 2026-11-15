// Stand-ins for the browser check of «تجربة النشر» and «نشر مباشر» on TikTok (qa/tiktok-test-flow.cjs, MVP_draft.md section 79):
// the database client, the capabilities, the work provider, the Drive upload the site opens, and the site's /api/platforms/test
// routes, which answer as the routes do in front of a small fake TikTok (the creator's settings, a draft that reaches the inbox,
// a post that is published, a refusal). Every request is recorded with what the page sent. Flags in the address change the case:
//   creator=fail  TikTok will not say the creator's settings;   slow=1  TikTok takes longer, so the wait can be cancelled;
//   role=publisher / role=other  the account's own publisher / a publisher who is not on it;   off=1  needs reconnecting;
//   direct=1  the panel in its «نشر مباشر» mode.
// The rules themselves are the database's (supabase/tests/platform_tests_tiktok_rules.sql) and the routes' (tests/tiktok-test.test.mjs).
import { useSyncExternalStore } from 'react';
import { setPlatformRegistry, type AccountRow, type PlatformInfo } from '../../src/lib/work/rules';

const q = new URLSearchParams(location.search);
const ROLE = q.get('role') === 'other' ? 'publisher' : (q.get('role') ?? 'director');
const ME = q.get('role') === 'publisher' ? 'pub@example.test' : q.get('role') === 'other' ? 'pub2@example.test' : 'dir@example.test';
const later = (d: number) => new Date(Date.now() + d * 864e5).toISOString();
const platform = {
  key: 'tiktok', label_ar: 'تيك توك', kind: 'social', sort: 3, accepts: { video_only: true }, publish_mode: 'assisted', scheduling: false, requires_review: false,
  token_life_days: 365, enabled: true, builtin: false, docs_url: null, readiness: 'live', readiness_note: null, readiness_at: null, readiness_by: null,
} as PlatformInfo;
export const tt: AccountRow = {
  id: 'a-tt', platform: 'tiktok', label: 'حساب القسم', handle: 'tt:-000openid', purpose: null, authorized_until: later(360), publishers: ['pub@example.test'], mode: 'auto',
  active: true, fixed: false, conn_kind: 'oauth', conn_state: q.get('off') ? 'needs_reconnect' : 'connected', conn_checked_at: later(-0.01), conn_error: q.get('off') ? 'TOKEN_REFUSED' : null,
  external_id: '-000openid', external_name: 'حساب القسم', scopes: ['user.info.basic', 'video.publish', 'video.upload'],
};
type Test = {
  id: string; privacy: string | null; title: string; kind: string; state: string; video_id: string | null; post_url: string | null; shown_privacy: null; error: string | null; error_detail?: string | null;
  link: null; scheduled_for: null; purpose: string; created_by: string; created_at: string; done_at: string | null; deleted_at: null;
  size: number | null; source: string | null; ref: string | null; waits: number;
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
const LIBRARY: Record<string, { mime_type: string; size_bytes: number }> = { 'f-video': { mime_type: 'video/mp4', size_bytes: 6 * 1048576 } };

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
export const supabase = () => ({ rpc: (name: string) => ok(name === 'platform_ready' ? { tiktok_app: 'connected' } : null), from });

const reply = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } });
const newTest = (kind: string, title: string, o: Partial<Test> = {}): Test => {
  const t: Test = {
    id: `00000000-0000-4000-8000-${String(db.tests.length + 1).padStart(12, '0')}`, privacy: null, title, kind, state: 'uploading', video_id: null, post_url: null, shown_privacy: null,
    error: null, link: null, scheduled_for: null, purpose: q.get('direct') ? 'direct' : 'test', created_by: ME, created_at: new Date().toISOString(), done_at: null, deleted_at: null,
    size: null, source: null, ref: null, waits: 0, ...o,
  };
  db.tests.push(t);
  return t;
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
    t.ref = `drivefileTTFIXTURE${db.tests.indexOf(t) + 1}x`;
    return reply({ id: t.ref });
  }
  if (!url.startsWith('/api/platforms/')) return realFetch(input, init);
  const body = typeof raw === 'string' ? (JSON.parse(raw) as Record<string, unknown>) : null;
  db.calls.push({ method, url, body, bytes });
  if (url === '/api/platforms/check') return reply({ checked: 0, results: [] });
  if (url === '/api/platforms/test/creator') {
    if (q.get('creator') === 'fail') return reply({ error: 'طلبات كثيرة إلى المنصة في دقيقة. انتظر قليلاً ثم جرّب.', code: 'RATE_LIMIT', retry: true }, 429);
    // A private account: TikTok offers followers, friends and only me, and this one has Duet off.
    // public=1: a public account, which TikTok offers «الجميع».
    const privacy = q.get('public') ? ['public', 'friends', 'private'] : ['friends', 'followers', 'private'];
    return reply({ creator: { nickname: 'حساب القسم على TikTok', privacy, commentOff: false, duetOff: true, stitchOff: false, maxSeconds: 600 } });
  }
  if (url === '/api/platforms/test' && method === 'POST') {
    if (ME === 'pub2@example.test') return reply({ error: 'تجربة النشر لمن يدير الحسابات ولمن ينشر على هذا الحساب.', code: 'FORBIDDEN' }, 403);
    const b = body as Record<string, string>;
    if (b.caption === 'ارفض') {
      // As the route answers: the test closed with the site's code, TikTok's line kept beside it, and both said.
      const detail = 'tiktok unaudited_client_can_only_post_to_private_accounts log 202611151842436E093E9C1F146C37F821 http 403';
      newTest('tt_post', 'ارفض', { state: 'failed', error: 'TT_UNAUDITED', error_detail: detail, privacy: b.privacy ?? null });
      changed();
      return reply({ error: 'لم يدقق TikTok التطبيق بعد، فلا ينشر مباشرة إلا على حساب خاص. اجعل الحساب خاصاً في تطبيق TikTok، أو أرسل مسودة.', code: 'TT_UNAUDITED', detail }, 403);
    }
    const line = String(b.caption ?? '').split('\n').find((l) => l.trim())?.trim();
    const size = b.source === 'library' ? LIBRARY[b.asset]?.size_bytes : Number(b.size);
    const t = newTest(b.kind, line || (b.kind === 'tt_draft' ? 'تجربة مسودة في صندوق TikTok' : 'تجربة منشور مباشر'), { size, source: b.source, privacy: b.privacy ?? null });
    changed();
    if (b.source === 'library') return reply({ test: t.id, phase: 'wait' });
    return reply({ test: t.id, phase: 'upload', upload: `${location.origin}/drive-upload/${t.id}` });
  }
  const m = /^\/api\/platforms\/test\/([^?]+)$/.exec(url);
  const t = m ? db.tests.find((x) => x.id === m[1]) : undefined;
  if (!t) return reply({ error: 'غير موجود', code: 'FORBIDDEN' }, 403);
  if (method === 'POST' && body?.step === 'uploaded') {
    if (!t.ref || body.ref !== t.ref) return reply({ error: 'الملف المرفوع لا يطابق هذه التجربة.', code: 'TEMP_MISMATCH' }, 400);
    return reply({ test: t.id, phase: 'wait' });
  }
  if (method === 'POST' && body?.step === 'advance') {
    if (++t.waits < (q.get('slow') ? 30 : 2)) return reply({ phase: 'wait' });
    Object.assign(t, { state: 'published', done_at: new Date().toISOString() });
    changed();
    return reply({ done: true, inbox: t.kind === 'tt_draft', post: null, kind: t.kind });
  }
  if (method === 'DELETE') {
    if (t.state === 'uploading') {
      Object.assign(t, { state: 'failed', error: 'CANCELLED' });
      changed();
      return reply({ cancelled: true });
    }
    return reply({ error: 'لا يسمح TikTok للتطبيقات بحذف منشور. احذفه من تطبيق TikTok نفسه.', code: 'TT_NO_DELETE' }, 502);
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
    status: 'ready' as const, me: ME, role: ROLE, isAdmin: false, today: '2026-11-15', people, nameOf, personOf: (e: string) => people.find((x) => x.email === e),
    load: [], projects: [], accounts: [tt], platforms: [platform], templates: [], reloadBase: async () => undefined, call: async () => ({ ok: true as const, data: null }), say,
  };
}
export const useWorkList = () => ({ items: [], reload: async () => undefined });
// The library: a video.
export const libraryFiles = async () => [{ id: 'f-video', name: 'مقطع الحملة.mp4', kind: 'video', current_version: 3, stage: 'approved' }];

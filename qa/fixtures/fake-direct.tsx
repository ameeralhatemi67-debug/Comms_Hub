// Stand-ins for the browser check of «إجراءات سريعة» and «نشر مباشر» (qa/direct-publish-flow.cjs, MVP_draft.md section 76). The
// database client, the library and the site's YouTube routes are fake-youtube-test.tsx's (a small fake YouTube that records every
// request); this file adds what Home's menu needs: the capabilities by role, a work provider with a YouTube channel and an Instagram
// account connected for real, a simulated account that is not offered, and the registry's other platforms («قريباً»).
//   role=publisher  the account's publisher, who holds no publish.direct.
//   view=list       the account sheet's list of direct posts, over posts already made (MVP_draft.md 76.6).
// Instagram's routes answer as the site's do for a direct post from this device: the file goes to a stand-in for Drive, then the
// post is published, or, «مجدول» (76.5), waits for its time and may be cancelled.
// The rules themselves are the database's (supabase/tests/direct_publish_rules.sql, direct_schedule_rules.sql).
import { useSyncExternalStore } from 'react';
import { setPlatformRegistry, type AccountRow, type PlatformInfo } from '../../src/lib/work/rules';
export { supabase, libraryFiles, useWorkList } from './fake-youtube-test';

const q = new URLSearchParams(location.search);
const ROLE = q.get('role') ?? 'director';
const ME = ROLE === 'publisher' ? 'pub@example.test' : 'dir@example.test';
const later = (d: number) => new Date(Date.now() + d * 864e5).toISOString();
const FULL = ['https://www.googleapis.com/auth/youtube.upload', 'https://www.googleapis.com/auth/youtube.readonly', 'https://www.googleapis.com/auth/youtube.force-ssl'];
const mk = (key: string, label: string, sort: number, kind = 'social') =>
  ({
    key, label_ar: label, kind, sort, accepts: key === 'youtube' ? { video_only: true } : {}, publish_mode: 'assisted', scheduling: true, requires_review: false,
    token_life_days: 60, enabled: true, builtin: true, docs_url: null, readiness: 'live', readiness_note: null, readiness_at: null, readiness_by: null,
  }) as PlatformInfo;
const platforms: PlatformInfo[] = [mk('instagram', 'إنستغرام', 1), mk('x', 'إكس', 2), mk('linkedin', 'لينكدإن', 3), mk('youtube', 'يوتيوب', 4), mk('facebook', 'فيسبوك', 6), mk('mail', 'البريد', 9, 'mail')];
setPlatformRegistry(platforms);
const account = (id: string, platform: string, label: string, handle: string, external: string, real = true): AccountRow => ({
  id, platform, label, handle, purpose: null, authorized_until: later(80), publishers: ['pub@example.test'], mode: 'auto', active: true, fixed: false,
  conn_kind: real ? 'oauth' : null, conn_state: real ? 'connected' : null, conn_checked_at: later(-0.01), conn_error: null,
  external_id: real ? external : null, external_name: real ? label : null, scopes: real && platform === 'youtube' ? FULL : real ? ['instagram_business_basic', 'instagram_business_content_publish'] : [],
}) as AccountRow;
export const accounts: AccountRow[] = [
  account('a-yt', 'youtube', 'جمعية هداية', '@hedayh', 'UCfixturechannel000000'),
  account('a-ig', 'instagram', 'هداية', '@hedayh', '17841400000000001'),
  // A simulated account is never a place to publish for real.
  account('a-x', 'x', 'هداية على إكس', '@hedayh', '', false),
];

type Row = Record<string, unknown> & { id: string; kind?: string; state: string; scheduled_for?: string | null };
type W = {
  __db: { says: string[]; tests: Row[]; calls: { method: string; url: string; body: unknown; bytes: number }[] };
  __calls: { fn: string; args: Record<string, unknown> }[];
};
const w = window as unknown as W;
w.__calls = [];
const people = [
  { email: 'dir@example.test', display_name: 'مدير الفحص', role: 'director', avatar: null },
  { email: 'pub@example.test', display_name: 'ناشر الفحص', role: 'publisher', avatar: null },
];
const nameOf = (e: string | null | undefined) => people.find((x) => x.email === e)?.display_name ?? e ?? '';

// Posts already made, for the account sheet's list (view=list): one waiting, one published late, one cancelled, one on YouTube.
const at = (minutes: number) => new Date(Date.now() + minutes * 60e3).toISOString();
const row = (id: string, extra: Partial<Row>): Row => ({
  id: `00000000-0000-4000-8000-0000000009${id}`, privacy: null, title: 'منشور', kind: 'image', state: 'published', video_id: null, post_url: null,
  shown_privacy: null, shown_publish_at: null, scheduled_for: null, purpose: 'direct', error: null, created_by: 'dir@example.test',
  created_at: at(-600), done_at: null, deleted_at: null, size: 0, piece: 0, got: 0, lost: false, ...extra,
});
if (q.get('view') === 'list')
  w.__db.tests.push(
    row('01', { kind: 'video', title: 'مقطع غير مدرج', privacy: 'unlisted', shown_privacy: 'unlisted', video_id: 'dQw4w9WgXcQ', done_at: at(-590) }),
    row('02', { title: 'قصة أُلغيت', kind: 'story_image', state: 'failed', error: 'CANCELLED', scheduled_for: at(300) }),
    row('03', { title: 'منشور تأخر', scheduled_for: at(-120), done_at: at(-79), post_url: 'https://www.instagram.com/p/fixture-late/' }),
    row('04', { title: 'منشور ينتظر', state: 'waiting', scheduled_for: at(1500) }),
  );

// Instagram's routes for a direct post from this device: the file to a stand-in for Drive, then published, or waiting.
const before = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  const method = init?.method ?? 'GET';
  const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : null;
  const reply = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } });
  const db = w.__db;
  const note = () => db.calls.push({ method, url, body, bytes: init?.body instanceof Blob ? init.body.size : 0 });
  if (url === '/api/platforms/test' && method === 'POST' && typeof body?.kind === 'string') {
    note();
    const t = row(String(db.tests.length + 10).padStart(2, '0'), {
      title: String(body.kind).startsWith('story') ? 'قصة' : 'منشور', kind: String(body.kind), state: 'uploading',
      scheduled_for: typeof body.scheduled_for === 'string' ? body.scheduled_for : null, created_by: ME, created_at: new Date().toISOString(),
    });
    db.tests.push(t);
    return reply({ test: t.id, phase: 'upload', upload: `/api/platforms/fake-drive/${t.id}` });
  }
  if (url.startsWith('/api/platforms/fake-drive/') && method === 'PUT') {
    note();
    return reply({ id: 'driveTempFixture0001' });
  }
  const m = /^\/api\/platforms\/test\/([^?]+)$/.exec(url);
  const t = m ? db.tests.find((x) => x.id === m[1] && x.kind && x.kind !== 'video') : undefined;
  if (t) {
    note();
    if (method === 'POST' && body?.step === 'uploaded') {
      if (t.scheduled_for) {
        t.state = 'waiting';
        return reply({ test: t.id, phase: 'scheduled', at: t.scheduled_for });
      }
      return reply({ test: t.id, phase: 'wait' });
    }
    if (method === 'POST' && body?.step === 'advance') {
      Object.assign(t, { state: 'published', done_at: new Date().toISOString(), post_url: 'https://www.instagram.com/p/fixture/' });
      return reply({ done: true, post: '17900000000000099', url: t.post_url, kind: t.kind });
    }
    if (method === 'DELETE' && t.state === 'waiting') {
      Object.assign(t, { state: 'failed', error: 'CANCELLED' });
      return reply({ cancelled: true });
    }
  }
  return before(input, init);
};
let version = 0;
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};
const say = (text: string) => {
  w.__db.says.push(text);
  version++;
  listeners.forEach((l) => l());
};

export function useWork() {
  useSyncExternalStore(subscribe, () => version);
  return {
    status: 'ready' as const, me: ME, role: ROLE, isAdmin: ROLE === 'admin', today: '2026-11-05', people, nameOf, personOf: (e: string) => people.find((x) => x.email === e),
    load: [], projects: [], accounts, platforms, templates: [], reloadBase: async () => undefined,
    call: async (fn: string, args: Record<string, unknown>) => {
      w.__calls.push({ fn, args });
      return { ok: true as const, data: null };
    },
    say,
  };
}

// Capabilities (src/components/caps.tsx): publish.direct is the director's and the Admin's; every page is open here.
export const useCaps = () => ({
  ready: true, evals: [], grants: [], evalOf: () => undefined, reload: async () => undefined,
  has: (k: string) => (k === 'publish.direct' ? ROLE === 'director' || ROLE === 'admin' : true),
});

// Stand-ins for the flow check of «المنصات» and «حسابات المنصات» (qa/platforms-flow.cjs): the database client, the
// capabilities, the work provider and the site's own /api/platforms routes, held in sessionStorage so a return from a
// sign-in finds them. They answer as the database functions do for what the flows touch and record every call, and
// `window.__refuse` makes the next call of that name fail. The rules themselves are the database's
// (supabase/tests/platform_setup_rules.sql); the signed-in pages cannot be driven by a check, so this drives the components.
import { useSyncExternalStore } from 'react';
import { setPlatformRegistry, type AccountRow, type PlatformInfo } from '../../src/lib/work/rules';

const q = new URLSearchParams(location.search);
const ROLE = q.get('role') ?? 'director';
const ME = ROLE === 'publisher' ? 'pub@example.test' : 'dir@example.test';
const later = (d: number) => new Date(Date.now() + d * 864e5).toISOString();
const row = (key: string, label_ar: string, sort: number, o: Partial<PlatformInfo> = {}): PlatformInfo => ({
  key, label_ar, kind: 'social', sort, accepts: { video_only: false }, publish_mode: 'assisted', scheduling: true, requires_review: false, token_life_days: 60,
  enabled: true, builtin: true, docs_url: null, readiness: 'not_started', readiness_note: null, readiness_at: null, readiness_by: null, ...o,
});
const app = (type: string, label: string, o: Record<string, unknown> = {}) => ({ id: type, kind: 'platform', type, label, state: 'connected', config: { app_id: `${type}-id` }, has_secret: true, secret_tail: '••••a91f', secret_set_at: null, pending: false, last_check_at: null, last_ok_at: null, last_error: null, created_at: '2026-10-20', disabled_at: null, ...o });
const account = (id: string, platform: string, label: string, handle: string, o: Partial<AccountRow> = {}): AccountRow => ({ id, platform, label, handle, purpose: null, authorized_until: later(50), publishers: ['pub@example.test'], mode: 'auto', active: true, fixed: false, conn_kind: 'oauth', conn_state: 'connected', conn_checked_at: later(-1), conn_error: null, external_id: `ext-${id}`, external_name: label, scopes: [], ...o });

const seed = () => ({
  platforms: [
    row('mail', 'البريد', 0, { kind: 'mail', readiness: 'live', token_life_days: null }),
    row('instagram', 'إنستغرام', 1),
    row('x', 'X', 2),
    row('linkedin', 'لينكدإن', 3),
    row('youtube', 'يوتيوب', 4, { accepts: { video_only: true } }),
    row('tiktok', 'تيك توك', 5, { enabled: false, builtin: false, accepts: { video_only: true } }),
    row('snapchat', 'سناب شات', 6, { publish_mode: 'manual', builtin: false }),
  ],
  ints: [app('meta_app', 'تطبيق Meta', { config: { app_id: '1234567', config_id: '987654321' } }), app('google_app', 'تطبيق Google'), app('x_app', 'تطبيق X', { state: 'error', last_error: 'APP_REFUSED' })],
  setup: [
    { key: 'youtube', done: ['youtube'], step: 'redirect', fields: {} },
    { key: 'tiktok', done: ['app', 'details', 'verify', 'products', 'redirect', 'scopes'], step: 'keys', fields: { app_id: 'client-key-saved' } },
  ] as { key: string; done: string[]; step: string | null; fields: Record<string, string> }[],
  accounts: [
    account('a-mail', 'mail', 'البريد', 'mail', { fixed: true, conn_kind: 'simulated', conn_state: 'simulated', authorized_until: null }),
    account('a-ig1', 'instagram', 'الحساب الرسمي', '@org_official'),
    account('a-ig2', 'instagram', 'الفعاليات', '@org_events', { mode: 'ask' }),
    account('a-ig3', 'instagram', 'التوظيف', '@org_careers', { authorized_until: later(3) }),
    account('a-x', 'x', 'الحساب الرسمي', '@org_x', { conn_state: 'needs_reconnect', conn_error: 'TOKEN_REFUSED' }),
    account('a-yt', 'youtube', 'القناة التجريبية', '@org_trial', { conn_kind: 'simulated', conn_state: 'simulated' }),
    account('a-snap', 'snapchat', 'الحساب الرسمي', 'org_official', { conn_kind: 'simulated', conn_state: 'simulated', authorized_until: null, mode: 'ask' }),
  ],
  calls: [] as { name: string; args: Record<string, unknown> }[],
  says: [] as string[],
});

const KEY = 'pf-flow-db';
const stored = sessionStorage.getItem(KEY);
const db: ReturnType<typeof seed> = stored ? JSON.parse(stored) : seed();
const w = window as unknown as { __db: typeof db; __refuse?: string; __nav: (h: string) => void; __went: string[] };
w.__db = db;
const listeners = new Set<() => void>();
let version = 0;
const changed = () => {
  sessionStorage.setItem(KEY, JSON.stringify(db));
  version++;
  listeners.forEach((l) => l());
};
const ok = (data: unknown = null) => Promise.resolve({ data, error: null });
const no = (message: string) => Promise.resolve({ data: null, error: { message } });
const impactOf = (key: string) => {
  const list = db.accounts.filter((a) => a.platform === key);
  return { accounts: list.length, active_accounts: list.filter((a) => a.active).length, open_works: 0, copies: 0 };
};

function rpc(name: string, args: Record<string, unknown> = {}) {
  const quiet = ['platform_impact', 'int_list', 'platform_log', 'platform_ready'].includes(name);
  if (!quiet) db.calls.push({ name, args });
  if (w.__refuse === name) {
    w.__refuse = undefined;
    changed();
    return no('REFUSED');
  }
  const p = db.platforms.find((x) => x.key === args.p_key);
  switch (name) {
    case 'platform_impact':
      return ok(impactOf(args.p_key as string));
    case 'int_list':
      return ok(db.ints);
    case 'platform_log':
      return ok([{ id: 1, at: '2026-10-20T08:00:00Z', kind: 'created', actor: 'dir@example.test', actor_name: 'مدير الفحص', data: {} }]);
    case 'platform_ready':
      return ok(Object.fromEntries(db.ints.filter((i) => i.has_secret).map((i) => [i.type, i.state])));
    case 'platform_setup_save': {
      const had = db.setup.find((s) => s.key === args.p_key);
      const next = { key: args.p_key as string, done: args.p_done as string[], step: args.p_step as string | null, fields: args.p_fields as Record<string, string> };
      if (had) Object.assign(had, next);
      else db.setup.push(next);
      break;
    }
    case 'platform_save':
      db.platforms.push(row(args.p_key as string, (args.p as { label_ar: string }).label_ar, 20 + db.platforms.length, { enabled: false, builtin: false, publish_mode: (args.p as { publish_mode: PlatformInfo['publish_mode'] }).publish_mode }));
      break;
    case 'platform_set_enabled':
      p!.enabled = args.p_on as boolean;
      break;
    case 'platform_set_readiness':
      p!.readiness = args.p_state as PlatformInfo['readiness'];
      break;
    case 'account_save':
      db.accounts.push(account(`a-new${db.accounts.length}`, (args.p as { platform: string }).platform, (args.p as { label: string }).label, (args.p as { handle: string }).handle, { conn_kind: 'simulated', conn_state: 'simulated' }));
      break;
    case 'account_set_active': {
      const a = db.accounts.find((x) => x.id === args.p_id);
      a!.active = args.p_active as boolean;
      break;
    }
    case 'account_reconnect':
      db.accounts.find((x) => x.id === args.p_id)!.authorized_until = later(60);
      break;
  }
  changed();
  return ok();
}

function from(table: string) {
  const answer = () => (table === 'platforms' ? ok(db.platforms) : table === 'platform_setup' ? (q.get('nosetup') ? no('relation does not exist') : ok(db.setup)) : ok([]));
  const chain = { select: () => chain, order: () => answer(), then: (f: (r: unknown) => void) => answer().then(f) };
  return chain;
}

export const supabase = () => ({ rpc, from });

// The site's own routes: what the page sends is recorded, and answered as the route does.
const realFetch = window.fetch.bind(window);
window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  const reply = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
  if (url.startsWith('/api/platforms/')) {
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    db.calls.push({ name: url, args: body ?? {} });
    changed();
    if (url === '/api/platforms/app') {
      if (body.secret === 'refused-secret') return reply({ error: 'رفضت المنصة المعرّف أو السر. تحقق منهما في لوحة المطوّرين.' }, 400);
      const type = `${body.provider}_app`;
      const had = db.ints.find((i) => i.type === type);
      if (had) Object.assign(had, { state: 'connected', last_error: null });
      else db.ints.push(app(type, type));
      changed();
      return reply({ ok: true, tail: '••••a91f' });
    }
    if (url.startsWith('/api/platforms/offer')) {
      return reply({
        candidates: [
          { platform: 'instagram', id: 'ig-news', name: '@org_news', handle: '@org_news', parent: null, canPost: true },
          { platform: 'instagram', id: 'ig-camp', name: '@org_campaigns', handle: '@org_campaigns', parent: null, canPost: true },
          // As on comms-hub: Facebook is not in the registry until someone adds it.
          { platform: 'facebook', id: 'fb-page', name: 'الصفحة الرسمية', handle: null, parent: null, canPost: true },
        ],
      });
    }
    if (url === '/api/platforms/link') {
      for (const x of body.picks) db.accounts.push(account(`a-${x.id}`, x.platform, x.id, `@${x.id}`, { publishers: body.publishers }));
      changed();
      return reply({ results: body.picks.map((x: { platform: string; id: string }) => ({ platform: x.platform, id: x.id, ok: true, account: x.id })) });
    }
    if (url === '/api/platforms/check') return reply({ checked: body?.account ? 1 : 0, results: [{ state: 'connected', error: null }] });
    return reply({ ok: true });
  }
  return realFetch(input, init);
};

// Capabilities (src/components/caps.tsx).
const CAPS = q.get('caps') === 'viewer' ? ['settings.view'] : ['settings.view', 'platforms.manage', 'integrations.secrets'];
export const useCaps = () => ({ ready: true, evals: [], grants: [], has: (k: string) => CAPS.includes(k), evalOf: () => undefined, reload: async () => undefined });

// The work provider (src/components/work/data.tsx).
const people = [
  { email: 'dir@example.test', display_name: 'مدير الفحص', role: 'director', avatar: null },
  { email: 'pub@example.test', display_name: 'ناشر الفحص', role: 'publisher', avatar: null },
  { email: 'wri@example.test', display_name: 'كاتب الفحص', role: 'writer', avatar: null },
].filter((p) => !(q.get('nopub') && p.role === 'publisher'));
const nameOf = (e: string | null | undefined) => people.find((p) => p.email === e)?.display_name ?? e ?? '';
setPlatformRegistry(db.platforms);
const say = (text: string) => {
  db.says.push(text);
  changed();
};
const call = async (fn: string, args: Record<string, unknown>) => {
  const r = await rpc(fn, args);
  return r.error ? { ok: false as const, error: 'تعذّر التنفيذ.' } : { ok: true as const, data: r.data };
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};
export function useWork() {
  useSyncExternalStore(subscribe, () => version);
  setPlatformRegistry(db.platforms);
  return {
    status: 'ready' as const, me: ME, role: ROLE, isAdmin: false, today: '2026-11-01', people, nameOf, personOf: (e: string) => people.find((p) => p.email === e),
    load: [], projects: [], accounts: db.accounts, platforms: db.platforms, templates: [], reloadBase: async () => undefined, call, say,
  };
}
const work = (id: string, status: string, channels: string[]) => ({ w: { id, title: `عمل ${id}`, status, channels, closed_at: null }, stages: [], projects: [], flags: 0 });
export const useWorkList = () => ({ items: [work('CH-1', 'SCHEDULED', ['a-x']), work('CH-2', 'IN_REVIEW', ['a-ig1'])], reload: async () => undefined });
export const libraryFiles = async () => [];

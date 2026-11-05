// Stand-ins for the browser check of «إجراءات سريعة» and «نشر مباشر» (qa/direct-publish-flow.cjs, MVP_draft.md section 76). The
// database client, the library and the site's YouTube routes are fake-youtube-test.tsx's (a small fake YouTube that records every
// request); this file adds what Home's menu needs: the capabilities by role, a work provider with a YouTube channel and an Instagram
// account connected for real, a simulated account that is not offered, and the registry's other platforms («قريباً»).
//   role=publisher  the account's publisher, who holds no publish.direct.
// The rules themselves are the database's (supabase/tests/direct_publish_rules.sql).
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
const accounts: AccountRow[] = [
  account('a-yt', 'youtube', 'جمعية هداية', '@hedayh', 'UCfixturechannel000000'),
  account('a-ig', 'instagram', 'هداية', '@hedayh', '17841400000000001'),
  // A simulated account is never a place to publish for real.
  account('a-x', 'x', 'هداية على إكس', '@hedayh', '', false),
];

type W = { __db: { says: string[] }; __calls: { fn: string; args: Record<string, unknown> }[] };
const w = window as unknown as W;
w.__calls = [];
const people = [
  { email: 'dir@example.test', display_name: 'مدير الفحص', role: 'director', avatar: null },
  { email: 'pub@example.test', display_name: 'ناشر الفحص', role: 'publisher', avatar: null },
];
const nameOf = (e: string | null | undefined) => people.find((x) => x.email === e)?.display_name ?? e ?? '';
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

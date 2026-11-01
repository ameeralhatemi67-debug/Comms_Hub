// A stand-in for «الحسابات»' provider (src/components/accounts/data.tsx) in the flow check (qa/accounts-flow.cjs): a
// small department held in memory, signed in as the director, answering as the database functions do for what the
// flows touch. It records every call, and `window.__refuse` makes the next one refused, as the database would. The rules
// themselves are the database's (supabase/migrations/*permissions*); a person's state here comes from the real mirror
// of perm_eval (resolve), which tests/permissions.test.mjs holds equal to it.
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { CAPABILITIES, TEMPLATE_HOLDS, installedDefault, permError, resolve, roleHolds, type Grant } from '../../src/lib/permissions';
import { sanitizePages } from '../../src/lib/access';
import { roleIds, type Role } from '../../src/lib/domain';

type Call = { name: string; args: Record<string, unknown> };
type Member = { email: string; display_name: string; role: Role; pages: string[]; protected: boolean; added_by: string | null; created_at: string; last_seen_at: string | null; invited_at: string | null; invite_count: number };
type Row = Grant & { email: string };
const w = window as unknown as { __rpc: Call[]; __says: string[]; __refuse?: string };
w.__rpc = [];
w.__says = [];

const person = (email: string, display_name: string, role: Role, pages: string[], over: Partial<Member> = {}): Member => ({
  email, display_name, role, pages, protected: false, added_by: null, created_at: '2026-10-11T00:00:00Z', last_seen_at: '2026-10-30T07:30:00Z', invited_at: null, invite_count: 0, ...over,
});
const later = (days: number) => new Date(Date.now() + days * 864e5).toISOString();
const grant = (email: string, k: string, over: Partial<Row>): Row => ({ id: `g-${k}-${email}`, email, k, mode: 'standing', effect: 'allow', until: null, uses: null, total: null, scope: null, by: 'director@example.test', at: '2026-10-30T07:00:00Z', reason: null, ...over });

const TEAM = ['work', 'create', 'approvals', 'calendar', 'media', 'tasks', 'activity', 'motion', 'mail', 'analytics'];
const state = {
  members: [
    person('admin@example.test', 'مسؤول الفحص', 'admin', [], { protected: true }),
    person('director@example.test', 'مدير الفحص', 'director', TEAM),
    person('assistant@example.test', 'مساعدة الفحص', 'assistant', TEAM),
    person('one@example.test', 'كاتب أول', 'writer', ['work', 'mail', 'media']),
    person('two@example.test', 'كاتبة ثانية', 'writer', ['work', 'mail', 'media']),
    person('pub@example.test', 'ناشر الفحص', 'publisher', ['work', 'approvals'], { last_seen_at: null }),
  ],
  grants: [grant('one@example.test', 'urgency.2', { id: 't1', mode: 'timed', until: later(1) })],
  defaults: roleIds.flatMap((role) => CAPABILITIES.filter((c) => c.grantable && c.scope !== 'page').map((c) => ({ role, capability: c.key, allowed: installedDefault(role, c.key) }))),
  presets: [{ id: 'p1', name: 'تغطية النشر لأسبوع', items: [{ k: 'mail.outside.send', mode: 'timed' as const, hours: 168 }], note: null, created_by: 'director@example.test' }],
};
const me = { email: 'director@example.test', name: 'مدير الفحص', role: 'director' as Role, pages: TEAM, protected: false, caps: TEMPLATE_HOLDS.director as string[] };
const held = new Set<string>([...(TEMPLATE_HOLDS.director ?? []), ...TEAM.map((p) => `page.${p}`)]);

function answer(name: string, a: Record<string, unknown>): unknown {
  const m = state.members.find((x) => x.email === a.p_email);
  const k = a.p_cap as string;
  const isPage = k?.startsWith('page.');
  const page = isPage ? k.slice(5) : '';
  const clear = () => (state.grants = state.grants.filter((g) => !(g.email === a.p_email && g.k === k && g.mode === 'standing')));
  switch (name) {
    case 'assign_role':
      m!.role = a.p_role as Role;
      return null;
    case 'set_member_override':
      if (isPage) {
        m!.pages = a.p_effect === 'deny' ? m!.pages.filter((p) => p !== page) : [...m!.pages, page];
        return null;
      }
      clear();
      if (a.p_effect) state.grants.push(grant(a.p_email as string, k, { id: `g${Date.now()}`, effect: a.p_effect as 'allow' | 'deny' }));
      return null;
    case 'grant_capability':
      if (a.p_mode === 'standing') clear();
      state.grants.push(grant(a.p_email as string, k, { id: `g${Date.now()}`, mode: a.p_mode as Row['mode'], until: (a.p_until as string) ?? null, uses: (a.p_uses as number) ?? null }));
      return 'id';
    case 'revoke_capability':
      state.grants = state.grants.filter((g) => g.id !== a.p_id);
      return null;
    case 'revoke_all_capabilities':
      state.grants = state.grants.filter((g) => g.email !== a.p_email);
      return 0;
    case 'set_role_default': {
      const d = state.defaults.find((x) => x.role === a.p_role && x.capability === k);
      if (d) d.allowed = a.p_allowed as boolean;
      return state.members.filter((x) => x.role === a.p_role).length;
    }
    case 'add_account':
      state.members.push(person(String(a.p_email).trim().toLowerCase(), a.p_name as string, a.p_role as Role, a.p_pages as string[], { last_seen_at: null }));
      return null;
    case 'account_update':
      if (a.p_name) m!.display_name = a.p_name as string;
      return null;
    default:
      return [];
  }
}

const AccountsContext = createContext<unknown>(null);
export const useAccounts = () => useContext(AccountsContext) as ReturnType<typeof makeValue>;

function makeValue(tick: number, reload: () => Promise<void>) {
  const entry: Record<string, string> = { 'pub@example.test': 'not_started' };
  return {
    tick,
    status: 'ready' as const,
    me,
    can: (cap: string) => held.has(cap),
    members: state.members.map((m) => ({ ...m })),
    entry,
    requests: [],
    deletions: [],
    grants: state.grants.slice(),
    defaults: state.defaults.slice(),
    events: [],
    presets: state.presets,
    nameOf: (e: string) => state.members.find((m) => m.email === e)?.display_name ?? e,
    reload,
    call: async (name: string, args: Record<string, unknown>) => {
      if (name !== 'wa_people') w.__rpc.push({ name, args });
      if (w.__refuse) {
        const code = w.__refuse;
        w.__refuse = undefined;
        return { ok: false as const, error: permError(code) };
      }
      return { ok: true as const, data: answer(name, args) };
    },
    say: (text: string) => void w.__says.push(text),
  };
}

export function AccountsProvider({ children }: { children: ReactNode }) {
  const [tick, setTick] = useState(0);
  const reload = useCallback(async () => setTick((t) => t + 1), []);
  const value = useMemo(() => makeValue(tick, reload), [tick, reload]);
  return <AccountsContext.Provider value={value}>{children}</AccountsContext.Provider>;
}

export function usePersonCard(email: string) {
  const a = useAccounts();
  const m = a.members.find((x) => x.email === email);
  if (!m) return { card: null, error: 'هذا الحساب لم يعد موجوداً.' };
  const grants = a.grants.filter((g) => g.email === email);
  const templates = (r: Role, k: string) => roleHolds(a.defaults, r, k);
  return {
    error: '',
    card: {
      email, name: m.display_name, role: m.role, pages: m.pages, protected: m.protected, last_seen: m.last_seen_at,
      caps: CAPABILITIES.map((c) => ({ k: c.key, ...resolve({ role: m.role, pages: sanitizePages(m.pages), templates, grants }, c.key, Date.now()) })),
      grants, folders: [{ folder: 'f1', name: 'الحملات', level: 2 }], requests: [],
    },
  };
}

export const useRooms = () => [];

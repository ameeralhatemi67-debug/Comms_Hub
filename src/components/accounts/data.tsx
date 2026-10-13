'use client';
// What «الحسابات» reads, and its one way to write: a database function
// (supabase/migrations/*permissions*). Row level security decides what each person sees:
// the list of members with «فتح صفحة الحسابات», the grants and log of the people one may
// manage, access requests with «إضافة الأعضاء». The database decides every rule; this
// layer loads, calls and words the answer (src/lib/permissions.ts).
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Role } from '@/lib/domain';
import type { Account } from '@/lib/access';
import { useAccount } from '@/lib/account-context';
import { useHub } from '@/lib/store';
import { supabase } from '@/lib/supabase/client';
import { permError, type Grant, type Mode, type PermEvent } from '@/lib/permissions';
import { useCaps } from '../caps';

export type Member = {
  email: string;
  display_name: string;
  role: Role;
  pages: string[];
  protected: boolean;
  added_by: string | null;
  created_at: string;
  last_seen_at: string | null;
};
export type AccessRequest = { id: string; email: string; full_name: string; note: string | null; created_at: string };
export type GrantRow = Grant & { email: string };
export type RoleDefault = { role: Role; capability: string; allowed: boolean };
export type PresetItem = { k: string; mode: Mode; hours?: number; uses?: number };
export type Preset = { id: string; name: string; items: PresetItem[]; note: string | null; created_by: string };
export type Result<T = unknown> = { ok: true; data: T } | { ok: false; error: string };

type Ctx = {
  status: 'loading' | 'ready' | 'error';
  me: Account;
  /** What the signed-in person holds now (my_capabilities), pages excluded. */
  can: (cap: string) => boolean;
  members: Member[];
  requests: AccessRequest[];
  grants: GrantRow[];
  defaults: RoleDefault[];
  events: PermEvent[];
  presets: Preset[];
  nameOf: (email: string | null | undefined) => string;
  reload: () => Promise<void>;
  /** Calls a database function; on refusal returns the reason in Arabic. */
  call: <T = unknown>(fn: string, args: Record<string, unknown>) => Promise<Result<T>>;
  say: (text: string) => void;
};

const AccountsContext = createContext<Ctx | null>(null);
export function useAccounts(): Ctx {
  const v = useContext(AccountsContext);
  if (!v) throw Error('Accounts provider missing');
  return v;
}

const active = (g: GrantRow, now: number) =>
  g.mode === 'standing' || ((!g.until || Date.parse(g.until) > now) && (g.mode !== 'once' || (g.uses ?? 0) > 0));

export function AccountsProvider({ children }: { children: ReactNode }) {
  const me = useAccount();
  const caps = useCaps();
  const { dispatch } = useHub();
  const [status, setStatus] = useState<Ctx['status']>('loading');
  const [members, setMembers] = useState<Member[]>([]);
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [grants, setGrants] = useState<GrantRow[]>([]);
  const [defaults, setDefaults] = useState<RoleDefault[]>([]);
  const [events, setEvents] = useState<PermEvent[]>([]);
  const [presets, setPresets] = useState<Preset[]>([]);

  const reload = useCallback(async () => {
    const db = supabase();
    const [a, r, g, d, e, p] = await Promise.all([
      db.from('accounts').select('email, display_name, role, pages, protected, added_by, created_at, last_seen_at').order('created_at', { ascending: true }),
      db.from('access_requests').select('id, email, full_name, note, created_at').eq('status', 'pending').order('created_at', { ascending: true }),
      db
        .from('member_capabilities')
        .select('id, email, capability, mode, effect, expires_at, uses_left, uses_total, scope, granted_by, created_at, reason')
        .is('revoked_at', null)
        .order('created_at', { ascending: true }),
      db.from('role_capabilities').select('role, capability, allowed'),
      db.from('permission_events').select('id, at, actor, subject, role, capability, kind, data').order('at', { ascending: false }).limit(300),
      db.from('permission_presets').select('id, name, items, note, created_by').order('name'),
    ]);
    if (a.error || g.error || d.error) return setStatus('error');
    const now = Date.now();
    setMembers((a.data ?? []) as Member[]);
    setRequests((r.data ?? []) as AccessRequest[]);
    setGrants(
      ((g.data ?? []) as Record<string, unknown>[])
        .map((x) => ({
          id: String(x.id), email: String(x.email), k: String(x.capability), mode: x.mode as Grant['mode'], effect: x.effect as Grant['effect'],
          until: (x.expires_at as string | null) ?? null, uses: (x.uses_left as number | null) ?? null, total: (x.uses_total as number | null) ?? null,
          scope: (x.scope as Record<string, string> | null) ?? null, by: String(x.granted_by), at: String(x.created_at), reason: (x.reason as string | null) ?? null,
        }))
        .filter((x) => active(x, now)),
    );
    setDefaults((d.data ?? []) as RoleDefault[]);
    setEvents((e.data ?? []) as PermEvent[]);
    setPresets((p.data ?? []) as Preset[]);
    setStatus('ready');
  }, []);

  useEffect(() => {
    void reload();
    const db = supabase();
    let t: ReturnType<typeof setTimeout> | undefined;
    const soon = () => {
      clearTimeout(t);
      t = setTimeout(() => void reload(), 300);
    };
    const ch = db.channel('accounts-live');
    for (const table of ['member_capabilities', 'role_capabilities', 'permission_events']) ch.on('postgres_changes', { event: '*', schema: 'public', table }, soon);
    ch.subscribe();
    return () => {
      clearTimeout(t);
      void db.removeChannel(ch);
    };
  }, [reload]);

  const say = useCallback((text: string) => dispatch({ type: 'notify', text }), [dispatch]);
  const call = useCallback(async <T,>(fn: string, args: Record<string, unknown>): Promise<Result<T>> => {
    const { data, error } = await supabase().rpc(fn, args);
    if (error) return { ok: false, error: permError(error.code === '23505' ? `${error.message} duplicate key` : error.message) };
    return { ok: true, data: data as T };
  }, []);

  const value = useMemo<Ctx>(() => {
    const names = new Map(members.map((m) => [m.email, m.display_name]));
    return {
      status,
      me,
      can: (cap) => caps.has(cap),
      members,
      requests,
      grants,
      defaults,
      events,
      presets,
      nameOf: (e) => (e ? names.get(e) ?? (e === me.email ? me.name : e.split('@')[0]) : ''),
      reload,
      call,
      say,
    };
  }, [status, me, caps, members, requests, grants, defaults, events, presets, reload, call, say]);

  return <AccountsContext.Provider value={value}>{children}</AccountsContext.Provider>;
}

export type PersonCardData = {
  email: string;
  name: string;
  role: Role;
  pages: string[];
  protected: boolean;
  last_seen: string | null;
  caps: import('@/lib/permissions').CapEval[];
  grants: Grant[];
  folders: { folder: string | null; name: string | null; level: number }[];
};

/** A person's card (perm_card): read again whenever the page's data changes. */
export function usePersonCard(email: string): { card: PersonCardData | null; error: string } {
  const a = useAccounts();
  const [card, setCard] = useState<PersonCardData | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    void a.call<PersonCardData>('perm_card', { p_email: email }).then((r) => {
      if (!live) return;
      if (r.ok) {
        setCard(r.data);
        setError('');
      } else setError(r.error);
    });
    return () => {
      live = false;
    };
  }, [email, a.events, a.grants, a.call]);
  return { card, error };
}

export type RoomOption = { id: string; name: string | null; type: string };

/** Rooms the granter can see, to bind a one-time grant to one conversation. */
export function useRooms(enabled: boolean): RoomOption[] {
  const [rooms, setRooms] = useState<RoomOption[]>([]);
  useEffect(() => {
    if (!enabled) return;
    void supabase()
      .from('chat_rooms')
      .select('id, name, type')
      .neq('type', 'dm')
      .order('last_at', { ascending: false })
      .limit(50)
      .then(({ data }) => setRooms((data ?? []) as RoomOption[]));
  }, [enabled]);
  return rooms;
}

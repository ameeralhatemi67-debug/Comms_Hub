'use client';
// What the signed-in person may do now, from my_capabilities() in the database
// (Permissions_Plan.md 4.4 and 9, «Shell»). Read once per page, again when Realtime says a
// grant about this person changed, and at the next moment one of their grants ends. There
// is no timer job: the database checks time at the moment of use; this only keeps the
// interface's explanations current. When a page grant starts or ends, the server's page
// check is re-run (router.refresh), so the sidebar and the page agree with the database.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useAccount } from '@/lib/account-context';
import { supabase } from '@/lib/supabase/client';
import { nextEnd, type CapEval, type Grant } from '@/lib/permissions';

type Caps = {
  /** Loaded from the database at least once. */
  ready: boolean;
  evals: CapEval[];
  grants: Grant[];
  /** Holds the capability now (for a target, when one is given and a grant is bound to it). */
  has: (key: string) => boolean;
  evalOf: (key: string) => CapEval | undefined;
  reload: () => Promise<void>;
};

const CapsContext = createContext<Caps | null>(null);

export function useCaps(): Caps {
  const v = useContext(CapsContext);
  if (v) return v;
  // Outside the provider (a page drawn on its own): nothing beyond what the server said.
  return { ready: false, evals: [], grants: [], has: () => false, evalOf: () => undefined, reload: async () => {} };
}

export function CapsProvider({ children }: { children: ReactNode }) {
  const account = useAccount();
  const router = useRouter();
  const [evals, setEvals] = useState<CapEval[]>([]);
  const [grants, setGrants] = useState<Grant[]>([]);
  const [ready, setReady] = useState(false);
  const pagesKey = useRef<string | null>(null);

  const reload = useCallback(async () => {
    const { data } = await supabase().rpc('my_capabilities');
    const d = data as { caps?: CapEval[]; grants?: Grant[] } | null;
    if (!d) return;
    const caps = d.caps ?? [];
    setEvals(caps);
    setGrants(d.grants ?? []);
    setReady(true);
    const key = caps.filter((c) => c.k.startsWith('page.') && c.ok).map((c) => c.k).join(',') + '|' + (caps.find((c) => c.k === 'accounts.view')?.ok ?? '');
    if (pagesKey.current !== null && pagesKey.current !== key) router.refresh();
    pagesKey.current = key;
  }, [router]);

  // Live: a grant, an override or a role template that concerns this person.
  useEffect(() => {
    void reload();
    const db = supabase();
    let t: ReturnType<typeof setTimeout> | undefined;
    const soon = () => {
      clearTimeout(t);
      t = setTimeout(() => void reload(), 300);
    };
    const ch = db
      .channel('caps-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'member_capabilities', filter: `email=eq.${account.email}` }, soon)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'role_capabilities' }, soon)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'permission_events', filter: `subject=eq.${account.email}` }, soon)
      .subscribe();
    const back = () => document.visibilityState === 'visible' && void reload();
    document.addEventListener('visibilitychange', back);
    return () => {
      clearTimeout(t);
      void db.removeChannel(ch);
      document.removeEventListener('visibilitychange', back);
    };
  }, [account.email, reload]);

  // Read again when the next grant ends, so a temporary permission disappears on time.
  useEffect(() => {
    const at = nextEnd(grants, Date.now());
    if (at === null) return;
    const t = setTimeout(() => void reload(), Math.min(at - Date.now() + 1500, 864e5));
    return () => clearTimeout(t);
  }, [grants, reload]);

  const value = useMemo<Caps>(() => {
    const fallback = new Set(account.caps ?? []);
    const byKey = new Map(evals.map((e) => [e.k, e]));
    return {
      ready,
      evals,
      grants,
      evalOf: (k) => byKey.get(k),
      has: (k) => (ready ? !!byKey.get(k)?.ok : k.startsWith('page.') ? account.pages.includes(k.slice(5)) : fallback.has(k)),
      reload,
    };
  }, [account.caps, account.pages, evals, grants, ready, reload]);

  return <CapsContext.Provider value={value}>{children}</CapsContext.Provider>;
}

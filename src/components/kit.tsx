'use client';
// The shared interaction kit in the page: undo (the person's recent library edits, kept
// and decided by the database), the help system's progress (kept per person in the
// database), and the two document-level engines, hold to confirm and the guide.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { CircleHelp, Undo2 } from 'lucide-react';
import { useHub } from '@/lib/store';
import { supabase } from '@/lib/supabase/client';
import { installGuide, type GuideApi } from '@/lib/kit/guide';
import { installHold } from '@/lib/kit/hold';
import { installNeed, NEED_EVENT, type NeedDetail } from '@/lib/kit/need';
import { RequestPermissionDialog } from './perm-requests';
import { undoKeyApplies, undoTip, type UndoItem } from '@/lib/kit/undo';
import { pageKeyOf, roleGroup } from '@/lib/help/registry';

type Offer = { tx: number; label: string; at: number };
type Kit = {
  undoItems: UndoItem[];
  /** Undo one action, the latest by default. */
  undo: (tx?: number) => Promise<void>;
  /** Call after a library change: refreshes the list and offers «تراجع» for what was just done. */
  track: () => Promise<void>;
  /** Fresh offer for the result message, if the last change can be undone. */
  offer: Offer | null;
  dropOffer: () => void;
  /** Pages that show undoable data reload when an undo lands. */
  onUndo: (reload: () => void) => () => void;
};

const KitContext = createContext<Kit | null>(null);
export function useKit(): Kit {
  const v = useContext(KitContext);
  if (!v) throw Error('Kit provider missing');
  return v;
}
/** For providers that may render outside the shell (tests, public pages). */
export const useKitMaybe = () => useContext(KitContext);

export function KitProvider({ children }: { children: ReactNode }) {
  const { state, dispatch } = useHub();
  const path = usePathname();
  const router = useRouter();
  const say = useCallback((text: string) => dispatch({ type: 'notify', text }), [dispatch]);

  // ---------- undo ----------
  const [items, setItems] = useState<UndoItem[]>([]);
  const itemsRef = useRef<UndoItem[]>([]);
  itemsRef.current = items;
  const [offer, setOffer] = useState<Offer | null>(null);
  const reloaders = useRef(new Set<() => void>());
  const busy = useRef(false);
  const list = useCallback(async () => {
    const { data } = await supabase().rpc('undo_list');
    const next = ((data ?? []) as UndoItem[]).map((x) => ({ ...x, tx: Number(x.tx) }));
    setItems(next);
    return next;
  }, []);
  const undo = useCallback(
    async (tx?: number) => {
      if (busy.current) return;
      const target = tx ?? itemsRef.current[0]?.tx;
      if (!target) return say('لا شيء للتراجع عنه.');
      busy.current = true;
      setOffer(null);
      try {
        const res = await fetch('/api/undo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tx: target }) });
        const j = (await res.json().catch(() => null)) as { label?: string; error?: string } | null;
        const left = await list();
        reloaders.current.forEach((f) => f());
        if (!res.ok) return say(j?.error ?? 'تعذّر التراجع. أعد المحاولة.');
        say(`تراجعتَ عن: ${j?.label ?? 'الإجراء'}${left.length ? `. يمكنك التراجع عن ${left.length} قبله` : ''}`);
      } finally {
        busy.current = false;
      }
    },
    [list, say],
  );
  const track = useCallback(async () => {
    const before = itemsRef.current[0]?.tx;
    const next = await list();
    if (next[0] && next[0].tx !== before && next[0].ok) setOffer({ tx: next[0].tx, label: next[0].label, at: Date.now() });
  }, [list]);
  useEffect(() => {
    void list();
  }, [list]);
  // «تراجع» stays in the result message for eight seconds; the top-bar button keeps it for the hour.
  useEffect(() => {
    if (!offer) return;
    const t = setTimeout(() => setOffer(null), 8000);
    return () => clearTimeout(t);
  }, [offer]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!undoKeyApplies(e, e.target as HTMLElement | null, window.location.pathname)) return;
      e.preventDefault();
      void undo();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [undo]);

  // ---------- guide progress ----------
  const progress = useRef({ ready: false, seen: {} as Record<string, boolean>, auto: true });
  const call = useCallback((op: string, key: string | null) => {
    void supabase()
      .rpc('guide_update', { p_op: op, p_key: key })
      .then(({ data }) => {
        if (data) {
          const d = data as { seen: Record<string, boolean>; auto: boolean };
          progress.current.seen = { ...d.seen, ...progress.current.seen };
          if (op === 'unseen_page') progress.current.seen = d.seen;
        }
      });
  }, []);
  useEffect(() => {
    void supabase()
      .from('guide_progress')
      .select('seen, auto')
      .maybeSingle()
      .then(({ data }) => {
        progress.current = { ready: true, seen: (data?.seen as Record<string, boolean>) ?? {}, auto: data?.auto ?? true };
        guide.current?.refresh();
      });
  }, []);

  // ---------- the engines ----------
  const guide = useRef<GuideApi | null>(null);
  const pathRef = useRef(path);
  const roleRef = useRef(state.role);
  pathRef.current = path;
  roleRef.current = state.role;
  useEffect(() => {
    const g = installGuide({
      root: () => document.querySelector('.app-shell'),
      page: () => pageKeyOf(pathRef.current),
      role: () => roleGroup(roleRef.current),
      progress: {
        ready: () => progress.current.ready,
        seen: (k) => !!progress.current.seen[k],
        mark: (k) => {
          if (progress.current.seen[k]) return;
          progress.current.seen[k] = true;
          call('seen', k);
        },
        unmarkPage: (p) => {
          for (const k of Object.keys(progress.current.seen)) if (k === p || k.startsWith(`${p}:`)) delete progress.current.seen[k];
          call('unseen_page', p);
        },
        auto: () => progress.current.auto,
      },
      go: (href) => router.push(href),
      say,
    });
    const stopHold = installHold({ guideOn: g.isOn, passing: g.passing });
    const stopNeed = installNeed({ guideOn: g.isOn });
    guide.current = g;
    return () => {
      stopHold();
      stopNeed();
      g.destroy();
      guide.current = null;
    };
    // The engines are installed once; they read the route and role through refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    guide.current?.refresh();
  }, [path]);

  // A locked control asked for its permission (src/lib/kit/need.ts): the request dialog.
  const [asking, setAsking] = useState<string | null>(null);
  useEffect(() => {
    const onNeed = (e: Event) => setAsking((e as CustomEvent<NeedDetail>).detail.cap);
    window.addEventListener(NEED_EVENT, onNeed);
    return () => window.removeEventListener(NEED_EVENT, onNeed);
  }, []);

  const value = useMemo<Kit>(
    () => ({
      undoItems: items,
      undo,
      track,
      offer,
      dropOffer: () => setOffer(null),
      onUndo: (f) => {
        reloaders.current.add(f);
        return () => reloaders.current.delete(f);
      },
    }),
    [items, undo, track, offer],
  );
  return (
    <KitContext.Provider value={value}>
      {children}
      {asking && <RequestPermissionDialog cap={asking} source="button" onClose={() => setAsking(null)} />}
    </KitContext.Provider>
  );
}

/** The question mark in the top bar: hover, click for guide mode, double click for the page guide. The guide engine handles it. */
export function HelpButton() {
  return (
    <button type="button" className="help-q" aria-label="المساعدة: انقر لوضع الإرشاد، وانقر مرتين لدليل الصفحة">
      <CircleHelp />
    </button>
  );
}

export function UndoButton() {
  const k = useKit();
  const tip = undoTip(k.undoItems);
  return (
    <button type="button" className="undo-button" disabled={!k.undoItems.length} aria-label={tip} title={tip} onClick={() => void k.undo()}>
      <Undo2 />
      {k.undoItems.length > 0 && <i>{k.undoItems.length}</i>}
    </button>
  );
}

/** «تراجع» in the result message, for a few seconds after an undoable change. */
export function ToastUndo() {
  const k = useKit();
  if (!k.offer) return null;
  return (
    <button type="button" className="toast-undo" onClick={() => void k.undo(k.offer!.tx)}>
      <Undo2 />
      تراجع
    </button>
  );
}

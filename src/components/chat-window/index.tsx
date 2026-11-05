'use client';
// The experimental mail and messaging window (MVP_draft.md section 74): a launcher on the left
// edge of every page and a window beside the page that grows from a side panel to the sidebar's
// edge. Off unless the account turned it on («الحساب» «التجارب»). It reads and writes through the
// same providers and database functions as the mail page; nothing about people is decided here.
import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAccount } from '@/lib/account-context';
import { canOpen } from '@/lib/access';
import type { FolderId } from '@/lib/mail/rules';
import {
  LAUNCHER,
  launcherHidden,
  launcherY,
  maxWidth,
  shownWidth,
  sizeName,
  tierOf,
  workOfPath,
  type Tier,
} from '@/lib/chat-window/rules';
import { useChatWindowSwitch } from './switch';
import { useGeometry } from './geometry';

// The heavy part (providers, conversation, mail reader) loads only once the window is opened.
const Live = lazy(() => import('./live'));
import { Launcher, type LauncherProps } from './launcher';
import { EMPTY_BOX, WinContext, type BoxDraft, type WinState } from './state';

const store = {
  get<T>(k: string, d: T): T {
    try {
      const v = localStorage.getItem(`cw:${k}`);
      return v == null ? d : (JSON.parse(v) as T);
    } catch {
      return d;
    }
  },
  set(k: string, v: unknown) {
    try {
      localStorage.setItem(`cw:${k}`, JSON.stringify(v));
    } catch {
      // A private window keeps nothing; the window still works.
    }
  },
};

export function ChatWindow() {
  const account = useAccount();
  const sw = useChatWindowSwitch(account.email);
  const allowed = canOpen(account, 'mail');
  if (!sw.on || !allowed) return <Off />;
  return <On />;
}

/** With the window off, the page keeps its own corner as before. */
function Off() {
  useEffect(() => {
    document.documentElement.classList.remove('cw-on', 'cw-full');
    document.documentElement.style.removeProperty('--cw-left');
  }, []);
  return null;
}

function On() {
  const path = usePathname() ?? '/';
  const router = useRouter();
  const hidden = launcherHidden(path);
  const [open, setOpen] = useState(false);
  const [used, setUsed] = useState(false);
  const geo = useGeometry(!hidden);
  const [saved, setSaved] = useState(() => store.get('size', { w: 380, full: false }));
  const [y, setY] = useState<number | null>(() => store.get<number | null>('y', null));
  const [mode, setMode] = useState<'chat' | 'mail'>(() => store.get<'chat' | 'mail'>('mode', 'chat'));
  const [room, setRoom] = useState<string | null>(null);
  const [pending, setPending] = useState<WinState['pending']>(null);
  const [thread, setThread] = useState<string | null>(null);
  const [folder, setFolder] = useState<FolderId>('inbox');
  const [box, setBoxState] = useState<BoxDraft>(EMPTY_BOX);
  const [globalOk, setGlobalOk] = useState(false);
  const focusBox = useRef<(() => void) | null>(null);

  const max = maxWidth(geo.vw, geo.sidebar);
  const width = geo.phone ? geo.vw : shownWidth(saved, max);
  const size = geo.phone ? 'side' : sizeName(width, max);
  const tier: Tier = geo.phone ? 'side' : tierOf(width);
  const shown = open && !hidden;

  useEffect(() => store.set('size', saved), [saved]);
  useEffect(() => store.set('y', y), [y]);
  useEffect(() => store.set('mode', mode), [mode]);
  // The mail page is the whole of this; the window steps aside there.
  useEffect(() => {
    if (hidden) setOpen(false);
  }, [hidden]);

  // The page keeps its toasts clear of the launcher and the window.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add('cw-on');
    // A full window, or any open window on a phone, leaves no corner: the toast rises above the box.
    const full = shown && (size === 'full' || geo.phone);
    root.classList.toggle('cw-full', full);
    const left = hidden ? 0 : shown ? (full || geo.phone ? 0 : width) : LAUNCHER.x + LAUNCHER.size;
    root.style.setProperty('--cw-left', `${left}px`);
    return () => {
      root.classList.remove('cw-on', 'cw-full');
      root.style.removeProperty('--cw-left');
    };
  }, [shown, size, width, hidden, geo.phone]);

  // Alt+M opens and closes; Escape minimises when nothing inside the window took it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && !e.ctrlKey && !e.metaKey && e.code === 'KeyM') {
        if (hidden) return;
        e.preventDefault();
        setOpen((o) => !o);
        setUsed(true);
        return;
      }
      // An open menu, list or dialog takes Escape first.
      if (e.key === 'Escape' && shown && !e.defaultPrevented && !document.querySelector('dialog[open], .cw-win .cw-menu, .cw-win .cw-pop')) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [hidden, shown]);

  const win = useMemo<WinState>(
    () => ({
      geo,
      width,
      max,
      size,
      tier,
      setSize: setSaved,
      mode,
      setMode: (m) => {
        setMode(m);
        setBoxState((b) => ({ ...b, dest: null }));
      },
      room,
      openRoom: (id) => {
        setMode('chat');
        setRoom(id);
        setPending(null);
        setBoxState((b) => ({ ...b, dest: null }));
      },
      pending,
      openPending: (p) => {
        setMode('chat');
        setRoom(null);
        setPending(p);
        setBoxState((b) => ({ ...b, dest: null }));
      },
      thread,
      openThread: (id) => {
        setMode('mail');
        setThread(id);
        setBoxState((b) => ({ ...b, dest: null }));
      },
      folder,
      setFolder: (f) => {
        setFolder(f);
        setThread(null);
      },
      box,
      setBox: (p) => setBoxState((b) => ({ ...b, ...(typeof p === 'function' ? p(b) : p) })),
      globalOk,
      setGlobalOk,
      pageWork: workOfPath(path),
      focusBox,
      minimize: () => setOpen(false),
      toMailPage: () => {
        setOpen(false);
        if (mode === 'mail') router.push(thread ? `/mail?thread=${encodeURIComponent(thread)}` : '/mail');
        else router.push(room ? `/mail/chat?room=${encodeURIComponent(room)}` : '/mail/chat');
      },
    }),
    [geo, width, max, size, tier, mode, room, pending, thread, folder, box, globalOk, path, router],
  );

  const home = launcherY(null, geo.vh, geo.top, geo.bottom);
  const launcher: LauncherProps | null =
    shown || hidden
      ? null
      : {
          y: launcherY(y, geo.vh, geo.top, geo.bottom),
          home,
          min: home,
          maxY: launcherY(1e6, geo.vh, geo.top, geo.bottom),
          onMove: setY,
          onOpen: () => {
            setOpen(true);
            setUsed(true);
          },
        };

  return (
    <WinContext.Provider value={win}>
      {used && !hidden ? (
        <Suspense fallback={launcher && <Launcher {...launcher} />}>
          <Live launcher={launcher} shown={shown} />
        </Suspense>
      ) : (
        launcher && <Launcher {...launcher} />
      )}
    </WinContext.Provider>
  );
}

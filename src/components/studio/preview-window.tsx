'use client';

// The studio's preview in a window of its own (MVP_draft.md 63.5, Desktop_App_Plan.md D6), in the desktop
// application: «فتح المعاينة في نافذة مستقلة» in the editor's «عرض» menu opens it full screen on another
// screen, or as a window on this one. The window is a page of the same address
// (/motion/studio/<project>/preview) that only shows: it draws the project with the studio's own player from
// what the editor sends (src/lib/studio/preview-link.ts), with no sound, no editing, no lease and nothing
// saved. Space there plays and pauses the editor. Nothing here shows in a browser.
import { useEffect, useMemo, useRef, useState } from 'react';
import { MonitorUp, X } from 'lucide-react';
import { native, type NativeScreen } from '@/lib/native';
import { useNativeFeature } from '../native/use-native';
import { canvasOf, durationOf, type ProjectDoc } from '@/lib/studio/schema';
import { Player } from '@/lib/studio/preview';
import { followClock, PreviewFollower, PreviewLeader, type Clock } from '@/lib/studio/preview-link';
import { MotionRenderer } from '@/lib/studio/motion-adapter';
import { canvasWidth } from '@/lib/studio/handles';
import type { MenuItem } from './menubar';
import { useStudioAssets, useStudioFonts, useStudioMedia } from './editor';

// --- the editor's side -----------------------------------------------------------------------------

export type PreviewLink = { can: boolean; present: boolean; screens: NativeScreen[]; open: (screen?: number, full?: boolean) => Promise<void>; close: () => Promise<void> };

/** Keeps a preview window, if one is open, in step with this editor's player and what it shows. */
export function usePreviewLink(projectId: string, player: Player | null, shown: ProjectDoc): PreviewLink {
  const can = useNativeFeature('windows');
  const [present, setPresent] = useState(false);
  const [screens, setScreens] = useState<NativeScreen[]>([]);
  const leader = useRef<PreviewLeader | null>(null);
  const latest = useRef(shown);
  latest.current = shown;

  useEffect(() => {
    if (!player) return;
    const l = new PreviewLeader(projectId, { now: () => player.clock(), onKey: () => player.toggle(), onPresence: setPresent });
    leader.current = l;
    l.show(latest.current);
    player.onClock = (c) => l.clock(c);
    // a reload or a closed window runs no cleanup: the preview window still hears goodbye
    const bye = () => l.dispose();
    window.addEventListener('pagehide', bye);
    return () => {
      window.removeEventListener('pagehide', bye);
      player.onClock = null;
      l.dispose();
      leader.current = null;
      // the window shows this editor's project only: it goes with it
      void native().raw?.windows?.close?.('preview').catch(() => false);
    };
  }, [projectId, player]);

  useEffect(() => {
    leader.current?.show(shown);
  }, [shown]);

  useEffect(() => {
    if (!can) return;
    const read = () => void native().raw!.windows!.screens!().then(setScreens, () => undefined);
    read();
    window.addEventListener('focus', read);
    return () => window.removeEventListener('focus', read);
  }, [can]);

  return {
    can,
    present,
    screens,
    open: async (screen, full) => {
      await native().raw?.windows?.popOut?.({ panel: 'preview', project: projectId, screen, full }).catch(() => null);
    },
    close: async () => {
      await native().raw?.windows?.close?.('preview').catch(() => false);
    },
  };
}

/** The «عرض» menu's items for the preview window: one per screen when there are several. */
export function previewWindowItems(link: PreviewLink): MenuItem[] {
  if (!link.can) return [];
  const others = link.screens.filter((s) => !s.current);
  const name = (s: NativeScreen) => {
    const n = link.screens.indexOf(s) + 1;
    return `${s.primary ? 'الشاشة الرئيسية' : `الشاشة ${n}`}${s.label ? ` (${s.label})` : ''}`;
  };
  const open: MenuItem = others.length
    ? {
        label: 'فتح المعاينة في نافذة مستقلة',
        icon: <MonitorUp aria-hidden="true" />,
        items: [
          ...others.map((s): MenuItem => ({ label: `ملء ${name(s)}`, onSelect: () => void link.open(s.id, true) })),
          { label: 'في نافذة على هذه الشاشة', onSelect: () => void link.open(link.screens.find((s) => s.current)?.id, false) },
        ],
      }
    : { label: 'فتح المعاينة في نافذة مستقلة', icon: <MonitorUp aria-hidden="true" />, onSelect: () => void link.open(undefined, false) };
  return [{ kind: 'sep' }, open, ...(link.present ? [{ label: 'إغلاق نافذة المعاينة المستقلة', icon: <X aria-hidden="true" />, onSelect: () => void link.close() } as MenuItem] : [])];
}

// --- the preview window --------------------------------------------------------------------------

export function PreviewWindow({ projectId }: { projectId: string }) {
  const [doc, setDoc] = useState<ProjectDoc | null>(null);
  const [leader, setLeader] = useState<'waiting' | 'here' | 'gone'>('waiting');
  const clock = useRef<Clock | null>(null);
  const player = useRef<Player | null>(null);
  const docRef = useRef<ProjectDoc | null>(null);
  const link = useRef<PreviewFollower | null>(null);

  useEffect(() => {
    const f = new PreviewFollower(projectId, {
      onDoc: (d) => {
        docRef.current = d;
        setDoc(d);
        if (player.current && !player.current.playing) player.current.draw();
      },
      onClock: (c) => {
        clock.current = c;
        if (player.current && docRef.current) followClock(player.current, c, durationOf(docRef.current));
      },
      onLeader: (p) => {
        setLeader(p ? 'here' : 'gone');
        if (!p && player.current?.playing) player.current.pause();
      },
    });
    link.current = f;
    const bye = () => f.dispose();
    window.addEventListener('pagehide', bye);
    const keys = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      e.preventDefault();
      f.key('toggle');
    };
    window.addEventListener('keydown', keys);
    return () => {
      window.removeEventListener('pagehide', bye);
      window.removeEventListener('keydown', keys);
      f.dispose();
      link.current = null;
    };
  }, [projectId]);

  return (
    <div className="st-pop" data-leader={leader}>
      {doc && leader !== 'gone' ? (
        <FollowerStage
          doc={doc}
          onPlayer={(pl) => {
            player.current = pl;
            if (pl && clock.current && docRef.current) followClock(pl, clock.current, durationOf(docRef.current));
          }}
        />
      ) : (
        <div className="st-pop-note" role="status">
          <b>المعاينة في نافذة مستقلة</b>
          <p>{leader === 'gone' ? 'أُغلق المحرر، فتوقفت المعاينة هنا. تعود عند فتح المشروع في الاستوديو.' : 'تنتظر المحرر: افتح المشروع في الاستوديو في النافذة الرئيسية.'}</p>
        </div>
      )}
    </div>
  );
}

/** The project drawn by the studio's own player, as large as the window allows, silent. */
function FollowerStage({ doc, onPlayer }: { doc: ProjectDoc; onPlayer: (pl: Player | null) => void }) {
  const { pool, tick } = useStudioMedia(doc);
  const assetsReady = useStudioAssets();
  const fontTick = useStudioFonts(doc);
  const motion = useMemo(() => new MotionRenderer(), []);
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const live = useRef(doc);
  live.current = doc;
  const [pl, setPl] = useState<Player | null>(null);
  const [size, setSize] = useState({ w: 640, h: 360 });
  const { w: W, h: H } = canvasOf(doc);

  useEffect(() => {
    if (!pool || !canvas.current) return;
    const p = new Player({ canvas: canvas.current, pool, motion, getDoc: () => live.current, scale: () => (canvas.current?.width ?? W) / canvasOf(live.current).w, onTime: () => undefined });
    p.muted = true;
    setPl(p);
    onPlayer(p);
    return () => {
      onPlayer(null);
      p.dispose();
    };
  }, [pool, motion]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => {
      const r = el.getBoundingClientRect();
      const k = Math.min(r.width / W, r.height / H);
      setSize({ w: Math.max(1, Math.floor(W * k)), h: Math.max(1, Math.floor(H * k)) });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [W, H]);

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const pw = canvasWidth(W, size.w, window.devicePixelRatio || 1, 1);
    const ph = Math.max(9, Math.round((pw * H) / W));
    if (c.width !== pw || c.height !== ph) {
      c.width = pw;
      c.height = ph;
    }
    if (pl && !pl.playing) pl.draw();
  }, [size, W, H, pl]);

  useEffect(() => {
    if (pl && !pl.playing) pl.draw();
  }, [pl, doc, tick, assetsReady, fontTick]);

  return (
    <div className="st-pop-stage" ref={box}>
      <canvas ref={canvas} className="st-pop-canvas" style={{ width: size.w, height: size.h }} aria-label="المعاينة" />
    </div>
  );
}

'use client';

// The video editor (MVP_draft.md 62, 62.1 to 62.5). On a computer every part is a window of the
// workspace (editor-frame.tsx): «الوسائط», «قوالب الحركة», «النصوص والعلامات», «الانتقالات والحركات»,
// «المعاينة», «الخط الزمني», «الإعدادات», «المشروع», «التصدير», «المراجعة» and «السجل», worked with the
// menu bar and the keyboard (shortcuts.ts). On a phone the preview and one panel at a time. Every change
// makes a new document, goes into the studio's own undo history, and is handed to the project shell,
// which autosaves it. Media come from the device cache; the 26 templates and the brand marks from the
// template tab's renderers and files; the fonts are bundled (studio-fonts.ts) and loaded when used.
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Blend, ClipboardPaste, Copy, FileOutput, Hand, Magnet, Maximize, Moon, MousePointer2, Pencil, Redo2, Save, ScanLine, Scissors, Trash2, Type as TypeIcon, Undo2, VolumeX, ZoomIn, ZoomOut, ArrowLeftToLine, XCircle, Plus } from 'lucide-react';
import { canOpen } from '@/lib/access';
import { useAccount } from '@/lib/account-context';
import { loadAssets } from '@/lib/motion/renderers.js';
import type { Graphic } from '@/lib/motion/types';
import { STICKERS, TRACK_LABELS, TRACK_LIMITS, US, canvasOf, durationOf, type Clip, type Micros, type NewClip, type ProjectDoc, type Source, type StickerKey, type TrackKind } from '@/lib/studio/schema';
import { historyOf, record, undo, redo, undoLabel, redoLabel, type History } from '@/lib/studio/history';
import {
  addClip, addSource, addTrack, duplicateClip, locate, moveClip, nextAdjacent, prevAdjacent, removeClip, setTrack, setTransition, snapPoints, splitClip, trimEnd, trimStart, updateClip, visibleAt, maxLengthOf,
} from '@/lib/studio/timeline';
import { MotionRenderer, graphicById, loadSticker, motionClip } from '@/lib/studio/motion-adapter';
import { captionStyle, defaultText, loadFonts, parseSrt, usedFonts } from '@/lib/studio/text';
import { fillWindow } from '@/lib/studio/compose';
import { DeviceCache } from '@/lib/studio/cache';
import { MediaPool, probeFile, type SourceState } from '@/lib/studio/media';
import { Player } from '@/lib/studio/preview';
import { frameUs } from '@/lib/studio/time';
import { matchShortcut, keysOf, typingTarget } from '@/lib/studio/shortcuts';
import { DEFAULT_TRANSITION, animLabel, entryPatch, transitionLabel, type AnimKind, type TransitionKind } from '@/lib/studio/transitions';
import { RESOLUTIONS } from '@/lib/studio/handles';
import { Modal } from '../ui';
import { Bin, GraphicsPane, MediaPane, TemplatesPane, type AddDrop, type LibraryItem } from './bin';
import { CachePanel } from './cache-panel';
import { PanelTabs, useCompact, type Panel } from './compact';
import { ReviewPanel, useProjectWork } from './work-links';
import { ExportPanel } from './export-panel';
import { FolderSelect } from './folder-picker';
import { Inspector, ProjectSettings } from './inspector';
import { librarySource, uploadToLibrary } from './library';
import type { EditorProps } from './project-shell';
import { Stage, drawOutline, drawSafeZones, type Resolution, type Tool } from './stage';
import { Timeline, TimelineBar } from './timeline';
import { EffectsPanel } from './effects-panel';
import { HistoryPanel } from './history-panel';
import { EditorFrame, panelSpecs, useEditorFrame } from './editor-frame';
import type { Menu } from './menubar';
import { usePref } from './prefs';
import '../motion-studio.css';
import './editor.css';
import './workspace.css';
import './studio-fonts';

/** What a source's state means for the person, or null when it is ready. */
export function sourceNote(s: SourceState | undefined): string | null {
  if (!s) return null;
  if (s.kind === 'loading') return s.total ? `جارٍ نسخ الملف إلى هذا الجهاز (${Math.round((s.done / s.total) * 100)}٪)…` : 'جارٍ تجهيز الملف…';
  if (s.kind === 'missing') return s.why === 'device' ? 'هذا الملف على جهاز آخر («على هذا الجهاز فقط» حيث أُضيف)، فلا يُعرض هنا.' : s.why === 'denied' ? 'لا تملك صلاحية هذا الملف في المكتبة، فيبقى في المشروع دون عرض.' : 'لم يعد هذا الملف في المكتبة.';
  if (s.kind === 'error') return s.message;
  return null;
}

/** The project's media, shared by the video and photo editors: the device cache, the pool, a tick on change. */
export function useStudioMedia(doc: ProjectDoc) {
  const [cache, setCache] = useState<DeviceCache | null | undefined>(undefined);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    void DeviceCache.open().then((c) => live && setCache(c));
    return () => {
      live = false;
    };
  }, []);
  const pool = useMemo(() => (cache === undefined ? null : new MediaPool({ cache, onChange: () => setTick((x) => x + 1) })), [cache]);
  useEffect(() => () => pool?.dispose(), [pool]);
  useEffect(() => {
    pool?.ensure(doc);
  }, [pool, doc]);
  // the ten-day sweep runs once when the studio opens, leaving what this project uses
  const swept = useRef(false);
  useEffect(() => {
    if (!cache || !pool || swept.current) return;
    swept.current = true;
    void cache.sweep(pool.inUse(doc));
  }, [cache, pool, doc]);
  return { cache: cache ?? null, pool, tick, cacheReady: cache !== undefined };
}

/** Templates, brand marks and the site's fonts are ready (each failure still lets the editor open). */
export function useStudioAssets() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    void Promise.allSettled([
      loadAssets(),
      ...STICKERS.map((k) => loadSticker(k)),
      loadFonts([{ font: 'IBM Plex Sans Arabic', weight: 600 }, { font: 'IBM Plex Sans Arabic', weight: 700 }, { font: 'IBM Plex Sans Arabic', weight: 500 }]),
    ]).then(() => setReady(true));
  }, []);
  return ready;
}

/** The fonts the project's texts use are loaded; the count changes when more become ready (to redraw). */
export function useStudioFonts(doc: ProjectDoc) {
  const want = usedFonts(doc);
  const key = want.map((f) => `${f.weight}|${f.font}`).sort().join(',');
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!key) return;
    let live = true;
    void loadFonts(want).then(() => live && setTick((x) => x + 1));
    return () => {
      live = false;
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return tick;
}

/** The studio's own history over the shell's document: resets when the document comes from outside. */
export function useDocHistory(p: Pick<EditorProps, 'doc' | 'onChange' | 'readOnly'>) {
  const hist = useRef<History<ProjectDoc>>(historyOf(p.doc));
  const emitted = useRef(p.doc);
  const [, force] = useReducer((x: number) => x + 1, 0);
  if (p.doc !== emitted.current) {
    hist.current = historyOf(p.doc);
    emitted.current = p.doc;
  }
  const commit = useCallback(
    (h: History<ProjectDoc>) => {
      hist.current = h;
      emitted.current = h.present;
      force();
      p.onChange(h.present);
    },
    [p],
  );
  const apply = useCallback(
    (next: ProjectDoc, label: string, key: string | null = null) => {
      if (p.readOnly || next === hist.current.present) return;
      commit(record(hist.current, next, label, key));
    },
    [commit, p.readOnly],
  );
  /** A change that is not a step of its own (exact sizes read from a file). */
  const quiet = useCallback(
    (next: ProjectDoc) => {
      if (p.readOnly || next === hist.current.present) return;
      commit({ ...hist.current, present: next });
    },
    [commit, p.readOnly],
  );
  /** Back (negative) or forward (positive) by this many steps («السجل»). */
  const go = useCallback(
    (steps: number) => {
      if (p.readOnly || !steps) return;
      let h = hist.current;
      for (let i = 0; i < Math.abs(steps); i++) h = steps < 0 ? undo(h) : redo(h);
      if (h !== hist.current) commit(h);
    },
    [commit, p.readOnly],
  );
  return {
    doc: hist.current.present,
    hist: hist.current,
    get: () => hist.current.present,
    apply,
    quiet,
    go,
    undo: () => !p.readOnly && hist.current.past.length && commit(undo(hist.current)),
    redo: () => !p.readOnly && hist.current.future.length && commit(redo(hist.current)),
  };
}

/** Exact sizes and lengths read from the files replace the library's approximate ones. */
export function useExactSources(doc: ProjectDoc, pool: MediaPool | null, tick: number, quiet: (d: ProjectDoc) => void) {
  useEffect(() => {
    if (!pool) return;
    let next = doc;
    for (const s of doc.sources) {
      const i = pool.info(s.id);
      if (!i) continue;
      const patch: Record<string, number> = {};
      if (i.duration && s.media !== 'image' && i.duration !== s.duration) patch.duration = i.duration;
      if (i.w && i.w !== s.w) patch.w = i.w;
      if (i.h && i.h !== s.h) patch.h = i.h;
      if (Object.keys(patch).length) next = { ...next, sources: next.sources.map((x) => (x.id === s.id ? ({ ...x, ...patch } as typeof x) : x)) };
    }
    if (next !== doc) quiet(next);
  }, [tick]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** The studio's clipboard: one clip or layer with the sources it needs, shared by the projects open in this tab. */
export type Copied = { kind: 'clip'; clip: Clip; sources: Source[] } | { kind: 'layer'; layer: import('@/lib/studio/schema').Layer; sources: Source[] };
let clipboard: Copied | null = null;
export const studioClipboard = {
  get: () => clipboard,
  set: (c: Copied | null) => {
    clipboard = c;
  },
};

const isResolution = (v: unknown): v is Resolution => !!v && typeof v === 'object' && RESOLUTIONS.some((r) => r.value === (v as Resolution).play) && RESOLUTIONS.some((r) => r.value === (v as Resolution).pause);
const isChrome = (v: unknown): v is 'dark' | 'light' => v === 'dark' || v === 'light';

export function VideoEditor(p: EditorProps) {
  const account = useAccount();
  const router = useRouter();
  const canLibrary = canOpen(account, 'media');
  const h = useDocHistory(p);
  const doc = h.doc;
  const { w: W, h: H } = canvasOf(doc);
  const fps = doc.video?.fps ?? 30;
  const { cache, pool, tick, cacheReady } = useStudioMedia(doc);
  useExactSources(doc, pool, tick, h.quiet);
  const assetsReady = useStudioAssets();
  const fontTick = useStudioFonts(doc);
  const motion = useMemo(() => new MotionRenderer(), []);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [player, setPlayer] = useState<Player | null>(null);
  const [t, setT] = useState<Micros>(0);
  const [playing, setPlaying] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [safe, setSafe] = useState(false);
  const [zoom, setZoom] = usePref<number>('timeline-zoom', 40);
  const [tool, setTool] = useState<Tool>('select');
  const [snap, setSnap] = usePref<boolean>('snap', true);
  const [fitSignal, setFitSignal] = useState(0);
  const [resolution, setResolution] = usePref<Resolution>('resolution', { play: 1, pause: 1 }, isResolution);
  const [chrome, setChrome] = usePref<'dark' | 'light'>('chrome', 'dark', isChrome);
  const [full, setFull] = usePref<boolean>('full-window', false);
  const [fxLength, setFxLength] = usePref<number>('effect-length', DEFAULT_TRANSITION.length);
  const [fxNote, setFxNote] = useState<string | null>(null);
  const [reviewKey, setReviewKey] = useState(0);
  const [uploading, setUploading] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, bumpClip] = useReducer((x: number) => x + 1, 0);
  const compact = useCompact();
  const [panel, setPanel] = useState<Panel>('timeline');
  const pw = useProjectWork(p.projectId, p.api);
  const frame = useEditorFrame('video');
  const live = useRef({ doc, selected, safe });
  live.current = { doc, selected, safe };

  useEffect(() => {
    if (!pool || !canvasRef.current) return;
    const pl = new Player({
      canvas: canvasRef.current,
      pool,
      motion,
      getDoc: () => live.current.doc,
      scale: () => (canvasRef.current?.width ?? W) / canvasOf(live.current.doc).w,
      onTime: (tt, pp) => {
        setT(tt);
        setPlaying(pp);
      },
      overlay: (ctx, scale) => {
        const d = live.current.doc;
        if (live.current.safe) drawSafeZones(ctx, { width: ctx.canvas.width, ratio: d.video?.ratio ?? '' });
        const sel = live.current.selected ? locate(d, live.current.selected)?.clip ?? null : null;
        if (sel && !pl.playing) drawOutline(ctx, d, sel, pl.resolver(), scale);
      },
    });
    setPlayer(pl);
    return () => pl.dispose();
  }, [pool, motion]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (player && !player.playing) player.draw();
  }, [player, doc, selected, tick, assetsReady, safe, fontTick]);

  const seek = useCallback((tt: Micros) => player?.seek(tt) ?? setT(tt), [player]);
  const at = player?.t ?? t;

  // ------------------------------------------------------------- adding
  type Where = { at?: Micros; trackId?: string | null };
  const place = (d: ProjectDoc, clip: NewClip, label: string, w: Where = {}) => {
    const r = addClip(d, clip, { at: w.at ?? at, trackId: w.trackId ?? undefined });
    h.apply(r.doc, label);
    setSelected(r.clipId);
  };
  const addLibrary = (item: LibraryItem, w: Where = {}) => {
    const src = librarySource(item);
    const r = addSource(h.get(), src);
    const length = src.media === 'image' ? 5 * US : (src.duration ?? 5 * US);
    place(r.doc, { source: r.id, start: w.at ?? at, length, in: 0 }, 'إضافة ملف من المكتبة', w);
  };
  const addDevice = async (file: File, upload: boolean) => {
    setError(null);
    if (upload) return setUploading(file);
    if (!cache) return setError('هذا المتصفح لا يحفظ الملفات على الجهاز. ارفع الملف إلى المكتبة.');
    try {
      const info = await probeFile(file);
      if (!info) return setError('نوع هذا الملف غير مدعوم في الاستوديو.');
      const { key } = await cache.putLocal(file);
      const r = addSource(live.current.doc, { kind: 'local', key, name: file.name, media: info.media, mime: file.type, size: file.size, w: info.w, h: info.h, duration: info.duration });
      const length = info.media === 'image' ? 5 * US : (info.duration ?? 5 * US);
      place(r.doc, { source: r.id, start: at, length, in: 0 }, 'إضافة ملف من هذا الجهاز');
    } catch (e) {
      setError((e as Error).message || 'تعذّر قراءة الملف.');
    }
  };
  const addMotion = (g: Graphic, w: Where = {}) => place(h.get(), { ...motionClip(g, doc.video?.ratio ?? '9:16', w.at ?? at) }, 'إضافة قالب حركة', w);
  const addText = (kind: 'title' | 'body' | 'caption', w: Where = {}, pos?: { x: number; y: number }) => {
    const style = kind === 'caption' ? captionStyle('تعليق أسفل الشاشة') : kind === 'title' ? { ...defaultText('عنوان'), size: 110, weight: 700 } : { ...defaultText('نص'), size: 64, weight: 500 };
    const y = pos?.y ?? (kind === 'caption' ? H * 0.84 : kind === 'title' ? H * 0.42 : H * 0.5);
    place(h.get(), { start: w.at ?? at, length: 3 * US, text: style, transform: { x: pos?.x ?? W / 2, y, scale: 1, rotation: 0, opacity: 1 } }, 'إضافة نص', w);
  };
  const addSrt = (text: string) => {
    const cues = parseSrt(text);
    if (!cues.length) return setError('لم يُعثر على ترجمة صالحة في الملف.');
    let d = addTrack(doc, 'text');
    const textTracks = d.video!.tracks.filter((x) => x.kind === 'text');
    const target = textTracks[textTracks.length - 1].id;
    for (const c of cues) d = addClip(d, { start: c.start, length: c.end - c.start, text: captionStyle(c.text), transform: { x: W / 2, y: H * 0.84, scale: 1, rotation: 0, opacity: 1 } }, { trackId: target, at: c.start }).doc;
    h.apply(d, `استيراد ${cues.length} سطر ترجمة`);
  };
  const addMark = (key: StickerKey, color: string, w: Where = {}) =>
    place(h.get(), { start: w.at ?? at, length: 4 * US, sticker: { key, color }, transform: { x: W * 0.78, y: H * 0.1, scale: 0.6, rotation: 0, opacity: 1 } }, 'إضافة علامة الهوية', w);
  const addDrop = (d: AddDrop, trackId: string | null, atT: Micros) => {
    const w: Where = { at: atT, trackId };
    if (d.type === 'library') addLibrary(d.item, w);
    else if (d.type === 'motion') {
      const g = graphicById(d.id);
      if (g) addMotion(g, w);
    } else if (d.type === 'text') addText(d.kind, w);
    else if (d.type === 'mark') addMark(d.key, d.color, w);
  };

  // ------------------------------------------------------------- editing the selection
  const sel = selected ? locate(doc, selected) : null;
  const patch = (pt: Partial<Clip> | ((c: Clip) => Clip), label: string, key?: string) => selected && h.apply(updateClip(h.get(), selected, pt), label, key ? `${key}-${selected}` : null);
  const splitAt = (id: string, cut: Micros) => {
    const r = splitClip(h.get(), id, cut);
    if (r.secondId) {
      h.apply(r.doc, 'قص المقطع');
      setSelected(r.secondId);
    }
  };
  const split = () => (selected ? splitAt(selected, at) : splitAll());
  const splitAll = () => {
    let d = h.get();
    let n = 0;
    for (const { clip } of [...visibleAt(d, at), ...(d.video?.tracks.filter((x) => x.kind === 'audio').flatMap((tr) => tr.clips.filter((c) => c.start < at && at < c.start + c.length).map((clip) => ({ clip }))) ?? [])]) {
      const r = splitClip(d, clip.id, at);
      if (r.secondId) {
        d = r.doc;
        n++;
      }
    }
    if (n) h.apply(d, `قص ${n} مقطع عند رأس التشغيل`);
  };
  const remove = (ripple: boolean) => {
    if (!selected) return;
    h.apply(removeClip(doc, selected, ripple), ripple ? 'حذف وسد الفراغ' : 'حذف المقطع');
    setSelected(null);
  };
  const duplicate = () => {
    if (!selected) return;
    const r = duplicateClip(doc, selected);
    if (r.clipId) {
      h.apply(r.doc, 'تكرار المقطع');
      setSelected(r.clipId);
    }
  };
  const copy = () => {
    if (!sel) return;
    const ids = new Set([sel.clip.source].filter(Boolean) as string[]);
    studioClipboard.set({ kind: 'clip', clip: structuredClone(sel.clip), sources: doc.sources.filter((s) => ids.has(s.id)).map((s) => structuredClone(s)) });
    bumpClip();
  };
  const cut = () => {
    if (!sel) return;
    copy();
    remove(false);
  };
  const paste = () => {
    const c = studioClipboard.get();
    if (!c || c.kind !== 'clip') return;
    let d = h.get();
    const map = new Map<string, string>();
    for (const s of c.sources) {
      const { id: oldId, ...rest } = s;
      const r = addSource(d, rest as Parameters<typeof addSource>[1]);
      d = r.doc;
      map.set(oldId, r.id);
    }
    const { id: _drop, ...clip } = c.clip;
    void _drop;
    const source = clip.source ? map.get(clip.source) ?? clip.source : undefined;
    const r = addClip(d, { ...clip, source, transition: null, start: at }, { at });
    h.apply(r.doc, 'لصق المقطع');
    setSelected(r.clipId);
  };
  const applyTransition = (kind: TransitionKind, where: 'start' | 'end', clipId: string | null = selected, length = fxLength) => {
    if (!clipId) return setFxNote('حدد مقطعاً أولاً.');
    const d = h.get();
    const here = locate(d, clipId);
    if (!here) return;
    const target = where === 'start' ? (prevAdjacent(d, clipId) || here.clip.transition ? clipId : null) : (nextAdjacent(d, clipId)?.id ?? null);
    if (!target) return setFxNote(where === 'start' ? 'لا مقطع ملاصق قبل هذا المقطع على مساره، فلا انتقال عند بدايته. جرّب حركة دخول.' : 'لا مقطع ملاصق بعد هذا المقطع على مساره، فلا انتقال عند نهايته. جرّب حركة خروج.');
    const next = setTransition(d, target, length, kind);
    if (next === d) return setFxNote('لم يتسع الانتقال: مدته أطول من نصف أحد المقطعين. قصّر المدة.');
    h.apply(next, `انتقال: ${transitionLabel(kind)}`);
    setSelected(target);
    setFxNote(null);
  };
  const applyAnim = (kind: AnimKind, where: 'in' | 'out', clipId: string | null = selected) => {
    if (!clipId) return setFxNote('حدد مقطعاً أولاً.');
    const c = locate(h.get(), clipId)?.clip;
    if (!c) return;
    if (c.source && doc.sources.find((s) => s.id === c.source)?.media === 'audio') return setFxNote('مقطع الصوت لا يتحرك على الإطار.');
    h.apply(updateClip(h.get(), clipId, entryPatch(c, where, { kind, length: fxLength })), `${where === 'in' ? 'دخول' : 'خروج'}: ${animLabel(kind)}`);
    setSelected(clipId);
    setFxNote(null);
  };
  const defaultTransition = () => {
    if (!selected) return setFxNote('حدد مقطعاً أولاً.');
    if (prevAdjacent(h.get(), selected) || sel?.clip.transition) applyTransition(DEFAULT_TRANSITION.kind, 'start');
    else applyTransition(DEFAULT_TRANSITION.kind, 'end');
  };
  const editPoint = (dir: 1 | -1) => {
    const pts = snapPoints(doc, null, [durationOf(doc)]);
    const target = dir > 0 ? pts.find((x) => x > at + 1) : [...pts].reverse().find((x) => x < at - 1);
    if (target !== undefined) seek(target);
  };
  const frameAbove = sel && sel.clip.source && doc.sources.find((s) => s.id === sel.clip.source)?.media !== 'audio'
    ? visibleAt(doc, at).map((v) => v.clip).find((c) => c.motion && graphicById(c.motion.template)?.winBox)
    : undefined;
  const hasPrevAdjacent = !!selected && !!prevAdjacent(doc, selected);
  const nextClip = selected ? nextAdjacent(doc, selected) : null;
  const zoomBy = (k: number) => setZoom((z) => Math.max(4, Math.min(320, Math.round(z * k))));
  const audibleSel = !!sel?.clip.source && doc.sources.find((s) => s.id === sel.clip.source)?.media !== 'image';

  // ------------------------------------------------------------- keys
  const run = (id: string): boolean => {
    switch (id) {
      case 'play': player?.toggle(); break;
      case 'play-forward': if (!player?.playing) player?.play(); break;
      case 'stop': if (player?.playing) player.pause(); break;
      case 'back-second': case 'second-back': seek(at - US); break;
      case 'second-forward': seek(at + US); break;
      case 'frame-back': seek(at - frameUs(fps)); break;
      case 'frame-forward': seek(at + frameUs(fps)); break;
      case 'edit-back': editPoint(-1); break;
      case 'edit-forward': editPoint(1); break;
      case 'home': seek(0); break;
      case 'end': seek(Number.MAX_SAFE_INTEGER); break;
      case 'undo': h.undo(); break;
      case 'redo': h.redo(); break;
      case 'split': split(); break;
      case 'split-all': splitAll(); break;
      case 'delete': remove(false); break;
      case 'ripple-delete': remove(true); break;
      case 'duplicate': duplicate(); break;
      case 'copy': copy(); break;
      case 'cut': cut(); break;
      case 'paste': paste(); break;
      case 'deselect': if (frame.ws.layout.max) frame.maximize(); else if (tool !== 'select') setTool('select'); else setSelected(null); break;
      case 'default-transition': defaultTransition(); break;
      case 'snap': setSnap((v) => !v); break;
      case 'tool-select': setTool('select'); break;
      case 'tool-razor': setTool('razor'); break;
      case 'tool-hand': setTool('hand'); break;
      case 'tool-text': setTool('text'); break;
      case 'zoom-in': zoomBy(1.25); break;
      case 'zoom-out': zoomBy(0.8); break;
      case 'zoom-fit': setFitSignal((x) => x + 1); break;
      case 'maximize': frame.maximize(); break;
      case 'full-window': setFull((v) => !v); break;
      case 'safe-zones': if (doc.video?.ratio === '9:16') setSafe((v) => !v); break;
      case 'shortcuts': frame.setKeys(true); break;
      case 'save-version': p.onRequestVersion?.(); break;
      case 'export': frame.ws.open('export'); frame.setFocused('export'); break;
      case 'rename': p.onRequestRename?.(); break;
      default:
        if (id.startsWith('window-')) frame.byDigit(Number(id.slice(7)));
        else return false;
    }
    return true;
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest?.('dialog')) return;
      const id = matchShortcut(e, 'video');
      if (!id) return;
      // keys typed into a field are the field's, except saving, exporting and leaving it
      if (typingTarget(target) && !['save-version', 'export', 'full-window'].includes(id)) {
        if (id === 'deselect') target?.blur();
        return;
      }
      if (compact && id.startsWith('window-')) return;
      if (run(id)) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const missing = doc.sources.map((s) => pool?.state(s.id)).filter((s) => s?.kind === 'missing' || s?.kind === 'error').length;
  const binProps = {
    ratio: doc.video?.ratio ?? '9:16',
    readOnly: p.readOnly,
    canLibrary,
    canDevice: cacheReady && !!cache,
    onLibrary: (it: LibraryItem) => addLibrary(it),
    onDevice: (f: File, up: boolean) => void addDevice(f, up),
    onMotion: (g: Graphic) => addMotion(g),
    onText: (k: 'title' | 'body' | 'caption') => addText(k),
    onSrt: addSrt,
    onMark: (k: StickerKey, c: string) => addMark(k, c),
    assetsReady,
    compact,
  };

  const stageEl = (
    <Stage
      doc={doc}
      player={player}
      canvasRef={canvasRef}
      t={t}
      playing={playing}
      safe={safe}
      onSafe={setSafe}
      selected={selected}
      readOnly={p.readOnly}
      onSelect={setSelected}
      onPlace={(id, x, y, key) => h.apply(updateClip(h.get(), id, (c) => ({ ...c, transform: { x, y, scale: c.transform?.scale ?? 1, rotation: c.transform?.rotation ?? 0, opacity: c.transform?.opacity ?? 1 } })), 'نقل على الإطار', key)}
      onTransform={(id, tr, key) => h.apply(updateClip(h.get(), id, { transform: tr }), 'الحجم والدوران', key)}
      ready={assetsReady && !!pool}
      note={missing ? `${missing} من ملفات المشروع غير متاح هنا، ويبقى في المشروع.` : null}
      resolution={resolution}
      onResolution={setResolution}
      tool={tool}
      onTextAt={(x, y) => {
        addText('body', {}, { x, y });
        setTool('select');
      }}
      onDropAdd={(d) => addDrop(d, null, at)}
    />
  );
  const exportEl = <ExportPanel doc={doc} pool={pool} t={at} projectId={p.projectId} title={p.title} readOnly={p.readOnly} canLibrary={canLibrary} api={p.api} saveVersion={p.saveVersion} revision={p.revision} workRef={pw.workRef} onSaved={() => setReviewKey((x) => x + 1)} />;
  const cacheEl = <CachePanel cache={cache} inUse={pool ? pool.inUse(doc) : new Set()} onChanged={() => player?.draw()} />;
  const reviewEl = <ReviewPanel projectId={p.projectId} api={p.api} readOnly={p.readOnly} onSeek={seek} pw={pw} refreshKey={reviewKey} />;
  const projectEl = <ProjectSettings doc={doc} onDoc={(d, label, key) => h.apply(d, label, key ?? null)} readOnly={p.readOnly} cachePanel={cacheEl} />;
  const inspEl = (
    <Inspector
      doc={doc}
      clip={sel?.clip ?? null}
      onClip={patch}
      readOnly={p.readOnly}
      compact={compact}
      canFillWindow={!!frameAbove}
      hasPrevAdjacent={hasPrevAdjacent}
      hasNextFree={!!nextClip && !nextClip.transition}
      sourceNote={sel?.clip.source ? sourceNote(pool?.state(sel.clip.source)) : null}
      onLength={(us) => selected && h.apply(trimEnd(doc, selected, (sel?.clip.start ?? 0) + us), 'طول القالب')}
      actions={{
        split,
        duplicate,
        remove: () => remove(false),
        ripple: () => remove(true),
        fillWindow: () => {
          if (!sel || !frameAbove || !player) return;
          const tr = fillWindow(doc, sel.clip, frameAbove, player.resolver());
          if (tr) h.apply(updateClip(doc, sel.clip.id, { transform: tr, fit: 'contain' }), 'وضع الفيديو داخل الإطار');
        },
        setTransition: (us, kind) => selected && h.apply(setTransition(h.get(), selected, us, kind), us ? `انتقال: ${transitionLabel(kind ?? sel?.clip.transition?.kind)}` : 'إزالة الانتقال', `xfade-${selected}${kind ?? ''}`),
        nextTransition: () => applyTransition(DEFAULT_TRANSITION.kind, 'end'),
        setStart: (us) => selected && h.apply(moveClip(h.get(), selected, us), 'بداية المقطع', `start-${selected}`),
        setLength: (us) => selected && h.apply(trimEnd(h.get(), selected, (locate(h.get(), selected)?.clip.start ?? 0) + Math.min(us, maxLengthOf(h.get(), locate(h.get(), selected)!.clip))), 'مدة المقطع', `len-${selected}`),
      }}
    />
  );
  const barEl = (
    <TimelineBar
      tool={tool}
      onTool={setTool}
      snap={snap}
      onSnap={setSnap}
      zoom={zoom}
      onZoom={setZoom}
      onFit={() => setFitSignal((x) => x + 1)}
      undo={h.undo}
      redo={h.redo}
      canUndo={!!h.hist.past.length}
      canRedo={!!h.hist.future.length}
      undoTitle={undoLabel(h.hist)}
      redoTitle={redoLabel(h.hist)}
      split={split}
      remove={() => remove(false)}
      hasSelection={!!selected}
      readOnly={p.readOnly}
      compact={compact}
    />
  );
  const tlEl = (
    <Timeline
      doc={doc}
      t={t}
      zoom={zoom}
      onZoom={setZoom}
      fitSignal={fitSignal}
      selected={selected}
      readOnly={p.readOnly}
      compact={compact}
      tool={compact ? 'select' : tool}
      snap={snap}
      stateOf={(id) => pool?.state(id)}
      onSelect={setSelected}
      onSeek={seek}
      onMove={(id, start, trackId, key) => h.apply(moveClip(h.get(), id, start, trackId), 'نقل المقطع', key)}
      onTrim={(id, edge, to, key) => h.apply(edge === 'start' ? trimStart(h.get(), id, to) : trimEnd(h.get(), id, to), 'تعديل طرف المقطع', key)}
      onTrack={(id, pt) => h.apply(setTrack(doc, id, pt), 'إعدادات المسار')}
      onAddTrack={(k) => h.apply(addTrack(doc, k), 'إضافة مسار')}
      onSplitAt={splitAt}
      onDropAdd={addDrop}
      onDropEffect={(fx, clipId, where) => (fx.type === 'transition' ? applyTransition(fx.kind, where, clipId) : applyAnim(fx.kind, where === 'start' ? 'in' : 'out', clipId))}
      clipMenu={(id) => {
        const c = locate(doc, id)?.clip;
        const audible = !!c?.source && doc.sources.find((s) => s.id === c.source)?.media !== 'image';
        return {
          split: () => splitAt(id, at),
          copy,
          paste,
          duplicate,
          remove: () => remove(false),
          ripple: () => remove(true),
          transition: defaultTransition,
          mute: () => h.apply(updateClip(h.get(), id, { mute: !c?.mute }), c?.mute ? 'تشغيل صوت المقطع' : 'كتم صوت المقطع'),
          muted: !!c?.mute,
          audible,
          canPaste: studioClipboard.get()?.kind === 'clip',
        };
      }}
    />
  );
  const effectsEl = (
    <EffectsPanel
      readOnly={p.readOnly}
      selection={sel ? { has: true, prev: hasPrevAdjacent || !!sel.clip.transition, next: !!nextClip, text: !!sel.clip.text } : null}
      length={fxLength}
      onLength={setFxLength}
      onTransition={(k, w) => applyTransition(k, w)}
      onAnim={(k, w) => applyAnim(k, w)}
      note={fxNote}
    />
  );
  const uploadEl = uploading && (
    <UploadDialog
      file={uploading}
      onClose={() => setUploading(null)}
      onDone={(row) => {
        setUploading(null);
        addLibrary({ id: row.id, name: row.name, kind: row.kind as LibraryItem['kind'], current_version: row.current_version, mime_type: row.mime_type, dims: row.dims, duration: row.duration });
      }}
    />
  );
  const errorEl = error && (
    <p className="warning st-err" role="alert">
      {error}
      <button type="button" onClick={() => setError(null)} aria-label="إغلاق">×</button>
    </p>
  );

  if (compact)
    return (
      <div className="st-editor" data-readonly={p.readOnly ? 'yes' : 'no'} data-compact="yes" data-chrome="light">
        {errorEl}
        {stageEl}
        <PanelTabs value={panel} onChange={setPanel} panels={[{ id: 'timeline', label: 'الخط الزمني' }, { id: 'add', label: 'إضافة' }, { id: 'settings', label: 'الإعدادات' }, { id: 'export', label: 'التصدير' }]} />
        {panel === 'timeline' && (
          <>
            {barEl}
            {tlEl}
          </>
        )}
        {panel === 'add' && <Bin {...binProps} />}
        {panel === 'settings' && (sel ? inspEl : <>{projectEl}<aside className="st-insp">{reviewEl}</aside></>)}
        {panel === 'export' && exportEl}
        {uploadEl}
      </div>
    );

  const kinds = (Object.keys(TRACK_LIMITS) as TrackKind[]).filter((k) => (doc.video?.tracks.filter((x) => x.kind === k).length ?? 0) < TRACK_LIMITS[k]);
  const ro = p.readOnly;
  const menus: Menu[] = [
    {
      id: 'file',
      label: 'ملف',
      items: [
        { label: 'حفظ نسخة مرقّمة…', icon: <Save aria-hidden="true" />, keys: keysOf('save-version'), disabled: ro || !p.onRequestVersion, onSelect: () => p.onRequestVersion?.() },
        { label: 'إعادة تسمية المشروع…', icon: <Pencil aria-hidden="true" />, keys: keysOf('rename'), disabled: ro || !p.onRequestRename, onSelect: () => p.onRequestRename?.() },
        { label: 'التصدير…', icon: <FileOutput aria-hidden="true" />, keys: keysOf('export'), onSelect: () => run('export') },
        { kind: 'sep' },
        { label: 'العودة إلى المشاريع', icon: <ArrowRight aria-hidden="true" />, onSelect: () => router.push('/motion/studio') },
      ],
    },
    {
      id: 'edit',
      label: 'تحرير',
      items: [
        { label: undoLabel(h.hist), icon: <Undo2 aria-hidden="true" />, keys: 'Ctrl+Z', disabled: ro || !h.hist.past.length, onSelect: h.undo },
        { label: redoLabel(h.hist), icon: <Redo2 aria-hidden="true" />, keys: 'Ctrl+Shift+Z', disabled: ro || !h.hist.future.length, onSelect: h.redo },
        { kind: 'sep' },
        { label: 'قص إلى الحافظة', icon: <Scissors aria-hidden="true" />, keys: keysOf('cut'), disabled: ro || !selected, onSelect: cut },
        { label: 'نسخ', icon: <Copy aria-hidden="true" />, keys: keysOf('copy'), disabled: !selected, onSelect: copy },
        { label: 'لصق عند رأس التشغيل', icon: <ClipboardPaste aria-hidden="true" />, keys: keysOf('paste'), disabled: ro || studioClipboard.get()?.kind !== 'clip', onSelect: paste },
        { label: 'تكرار', icon: <Copy aria-hidden="true" />, keys: keysOf('duplicate'), disabled: ro || !selected, onSelect: duplicate },
        { kind: 'sep' },
        { label: 'حذف', icon: <Trash2 aria-hidden="true" />, keys: 'Delete', disabled: ro || !selected, onSelect: () => remove(false) },
        { label: 'حذف وسد الفراغ', icon: <ArrowLeftToLine aria-hidden="true" />, keys: 'Shift+Delete', disabled: ro || !selected, onSelect: () => remove(true) },
        { label: 'إلغاء التحديد', icon: <XCircle aria-hidden="true" />, keys: 'Esc', disabled: !selected, onSelect: () => setSelected(null) },
      ],
    },
    {
      id: 'clip',
      label: 'المقطع',
      items: [
        { label: 'قص المحدد عند رأس التشغيل', icon: <Scissors aria-hidden="true" />, keys: keysOf('split'), disabled: ro, onSelect: split },
        { label: 'قص كل المسارات عند رأس التشغيل', icon: <Scissors aria-hidden="true" />, keys: keysOf('split-all'), disabled: ro, onSelect: splitAll },
        { label: 'انتقال افتراضي', icon: <Blend aria-hidden="true" />, keys: keysOf('default-transition'), disabled: ro || !selected, onSelect: defaultTransition },
        { label: sel?.clip.mute ? 'تشغيل صوت المقطع' : 'كتم صوت المقطع', icon: <VolumeX aria-hidden="true" />, disabled: ro || !audibleSel, onSelect: () => patch({ mute: !sel?.clip.mute }, 'كتم الصوت') },
        { kind: 'sep' },
        { label: 'إضافة مسار', icon: <Plus aria-hidden="true" />, disabled: ro || !kinds.length, items: kinds.map((k) => ({ label: TRACK_LABELS[k], onSelect: () => h.apply(addTrack(h.get(), k), 'إضافة مسار') })) },
        {
          label: 'الأداة',
          icon: <MousePointer2 aria-hidden="true" />,
          items: [
            { label: 'التحديد', checked: tool === 'select', keys: keysOf('tool-select'), icon: <MousePointer2 aria-hidden="true" />, onSelect: () => setTool('select') },
            { label: 'الشفرة', checked: tool === 'razor', keys: keysOf('tool-razor'), icon: <Scissors aria-hidden="true" />, onSelect: () => setTool('razor') },
            { label: 'اليد', checked: tool === 'hand', keys: keysOf('tool-hand'), icon: <Hand aria-hidden="true" />, onSelect: () => setTool('hand') },
            { label: 'النص', checked: tool === 'text', keys: keysOf('tool-text'), icon: <TypeIcon aria-hidden="true" />, onSelect: () => setTool('text') },
          ],
        },
      ],
    },
    {
      id: 'view',
      label: 'عرض',
      items: [
        { label: 'دقة المعاينة أثناء التشغيل', items: RESOLUTIONS.map((r) => ({ label: r.label, checked: resolution.play === r.value, onSelect: () => setResolution({ ...resolution, play: r.value }) })) },
        { label: 'دقة المعاينة عند الإيقاف', items: RESOLUTIONS.map((r) => ({ label: r.label, checked: resolution.pause === r.value, onSelect: () => setResolution({ ...resolution, pause: r.value }) })) },
        { label: 'مناطق Reels الآمنة', icon: <ScanLine aria-hidden="true" />, keys: keysOf('safe-zones'), checked: safe, disabled: doc.video?.ratio !== '9:16', onSelect: () => setSafe(!safe) },
        { label: 'الالتقاط على الخط الزمني', icon: <Magnet aria-hidden="true" />, keys: keysOf('snap'), checked: snap, onSelect: () => setSnap(!snap) },
        { kind: 'sep' },
        { label: 'تكبير الخط الزمني', icon: <ZoomIn aria-hidden="true" />, keys: keysOf('zoom-in'), onSelect: () => zoomBy(1.25) },
        { label: 'تصغير الخط الزمني', icon: <ZoomOut aria-hidden="true" />, keys: keysOf('zoom-out'), onSelect: () => zoomBy(0.8) },
        { label: 'الخط الزمني كله في النافذة', icon: <Maximize aria-hidden="true" />, keys: keysOf('zoom-fit'), onSelect: () => setFitSignal((x) => x + 1) },
        { kind: 'sep' },
        { label: 'ملء نافذة المتصفح', keys: keysOf('full-window'), checked: full, onSelect: () => setFull(!full) },
        { label: 'محرر داكن', icon: <Moon aria-hidden="true" />, checked: chrome === 'dark', onSelect: () => setChrome(chrome === 'dark' ? 'light' : 'dark') },
      ],
    },
  ];

  const panels = panelSpecs('video', {
    media: <MediaPane {...binProps} />,
    templates: <TemplatesPane {...binProps} />,
    graphics: <GraphicsPane {...binProps} />,
    effects: effectsEl,
    program: stageEl,
    timeline: (
      <div className="st-tlwrap" data-focus={frame.focused === 'timeline' ? 'yes' : 'no'}>
        {barEl}
        {tlEl}
      </div>
    ),
    inspector: inspEl,
    project: projectEl,
    export: exportEl,
    review: <aside className="st-insp st-review-pane">{reviewEl}</aside>,
    history: <HistoryPanel hist={h.hist} onGo={h.go} readOnly={p.readOnly} />,
  });

  return (
    <div className="st-editor" data-readonly={p.readOnly ? 'yes' : 'no'} data-compact="no" data-chrome={chrome} data-full={full ? 'yes' : 'no'} data-tool={tool}>
      {errorEl}
      <EditorFrame frame={frame} menus={menus} panels={panels} full={full} onFull={() => setFull(!full)} chrome={chrome} onChrome={() => setChrome(chrome === 'dark' ? 'light' : 'dark')}>
        {uploadEl}
      </EditorFrame>
    </div>
  );
}

export function UploadDialog({ file, onClose, onDone }: { file: File; onClose: () => void; onDone: (row: Awaited<ReturnType<typeof uploadToLibrary>>) => void }) {
  const [folder, setFolder] = useState('');
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal title="رفع الملف إلى المكتبة" onClose={() => progress === null && onClose()}>
      <div className="st-form">
        <p dir="auto">{file.name}</p>
        <FolderSelect value={folder} onChange={setFolder} disabled={progress !== null} />
        {progress !== null && (
          <div className="st-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
            <i style={{ width: `${Math.round(progress * 100)}%` }} />
            <span>جارٍ رفع الملف {Math.round(progress * 100)}٪</span>
          </div>
        )}
        {error && <p className="warning" role="alert">{error}</p>}
        <div className="actions">
          <button
            type="button"
            className="primary"
            disabled={!folder || progress !== null}
            onClick={async () => {
              setError(null);
              setProgress(0);
              try {
                onDone(await uploadToLibrary(file, folder, setProgress));
              } catch (e) {
                setProgress(null);
                setError((e as Error).message || 'تعذّر رفع الملف.');
              }
            }}
          >
            رفع ثم استخدام
          </button>
          <button type="button" onClick={onClose} disabled={progress !== null}>
            إلغاء
          </button>
        </div>
      </div>
    </Modal>
  );
}

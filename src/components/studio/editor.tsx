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
import { ArrowRight, Blend, ClipboardPaste, Copy, FileOutput, Send, Hand, Magnet, Maximize, Moon, MousePointer2, Pencil, Redo2, Save, ScanLine, Scissors, Trash2, Type as TypeIcon, Undo2, VolumeX, ZoomIn, ZoomOut, ArrowLeftToLine, XCircle, Plus, Snowflake, Diamond, Rewind, Bookmark, Mic, ImagePlus, LayoutTemplate } from 'lucide-react';
import { canOpen } from '@/lib/access';
import { useAccount } from '@/lib/account-context';
import { loadAssets } from '@/lib/motion/renderers.js';
import type { Graphic } from '@/lib/motion/types';
import { STICKERS, TRACK_LABELS, TRACK_LIMITS, US, canvasOf, durationOf, type Clip, type Micros, type NewClip, type ProjectDoc, type Source, type StickerKey, type TrackKind } from '@/lib/studio/schema';
import { historyOf, record, undo, redo, undoLabel, redoLabel, type History } from '@/lib/studio/history';
import {
  addClip, addSource, addTrack, duplicateClip, locate, moveClip, nextAdjacent, prevAdjacent, removeClip, setTrack, setTransition, snapPoints, splitClip, trimEnd, trimStart, updateClip, visibleAt, maxLengthOf,
  insertHold, setReverse, setSpeed, setSpeedKeys, setTrackSound,
} from '@/lib/studio/timeline';
import { KEY_TOLERANCE, MOTION_PROPS, hasKeys, keyAllMotion, keyAt, keyTimes, moveKeyTime, setEaseAt, setKey, tidyKeys, toggleKey, type Ease, type KeyProp } from '@/lib/studio/keys';
import { clampSpeed, isHold, speedAt } from '@/lib/studio/speed';
import { newCover } from '@/lib/studio/cover';
import { addMarker, chapterIssues, chapters, removeMarker, updateMarker } from '@/lib/studio/markers';
import { platformLabels } from '@/lib/work/rules';
import { allShapes, docForShape, reframeFromPlace, setReframe } from '@/lib/studio/reframe';
import { addLayer } from '@/lib/studio/photo';
import { sourceTime } from '@/lib/studio/speed';
import { shortTime } from '@/lib/studio/time';
import { newPhotoDoc, type Ratio } from '@/lib/studio/schema';
import { MotionRenderer, graphicById, loadSticker, motionClip } from '@/lib/studio/motion-adapter';
import { captionStyle, defaultText, loadFonts, parseSrt, usedFonts } from '@/lib/studio/text';
import { fillWindow, transformAt, transformOf } from '@/lib/studio/compose';
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
import { ChaptersToWork, ReviewPanel, newerText, useProjectWork, useWorkTexts, type NoteMark, type TextFrom } from './work-links';
import { SendReviewDialog } from './send-review';
import { suggestOf } from '@/lib/studio/worklink';
import { ExportPanel } from './export-panel';
import { FolderSelect } from './folder-picker';
import { Inspector, ProjectSettings, writeClipTransform, type KeyActions } from './inspector';
import { librarySource, uploadToLibrary } from './library';
import type { EditorProps } from './project-shell';
import { Stage, drawOutline, drawSafeZones, type Resolution, type Tool } from './stage';
import { Timeline, TimelineBar, clipLabel } from './timeline';
import { EffectsPanel } from './effects-panel';
import { HistoryPanel } from './history-panel';
import { MarkersPanel } from './markers-panel';
import { RecordDialog } from './recorder';
import { useStudioBrand, useTemplateFlag } from './brand';
import { brandText } from '@/lib/studio/brand';
import { SwatchContext } from '../motion-controls';
import { VersionsPanel } from './versions-panel';
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
  const [recording, setRecording] = useState<Micros | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, bumpClip] = useReducer((x: number) => x + 1, 0);
  const compact = useCompact();
  const [panel, setPanel] = useState<Panel>('timeline');
  const pw = useProjectWork(p.projectId, p.api);
  const workTexts = useWorkTexts(pw.workRef);
  const [noteMarks, setNoteMarks] = useState<NoteMark[]>([]);
  const { brand } = useStudioBrand();
  const template = useTemplateFlag(p.projectId, p.api);
  const frame = useEditorFrame('video');
  // another shape shown in the preview (MVP_draft.md 62.10): the project as it is exported in that shape
  const [viewShape, setViewShape] = useState<Ratio | null>(null);
  const shapeList = allShapes(doc);
  const showing = viewShape && viewShape !== shapeList[0] && shapeList.includes(viewShape) ? viewShape : null;
  const shown = useMemo(() => (showing ? docForShape(doc, showing) : doc), [doc, showing]);
  const live = useRef({ doc, selected, safe, shown });
  live.current = { doc, selected, safe, shown };

  useEffect(() => {
    if (!pool || !canvasRef.current) return;
    const pl = new Player({
      canvas: canvasRef.current,
      pool,
      motion,
      getDoc: () => live.current.shown,
      scale: () => (canvasRef.current?.width ?? W) / canvasOf(live.current.shown).w,
      onTime: (tt, pp) => {
        setT(tt);
        setPlaying(pp);
      },
      overlay: (ctx, scale) => {
        const d = live.current.shown;
        if (live.current.safe) drawSafeZones(ctx, { width: ctx.canvas.width, ratio: d.video?.ratio ?? '' });
        const sel = live.current.selected ? locate(d, live.current.selected)?.clip ?? null : null;
        if (sel && !pl.playing) drawOutline(ctx, d, sel, pl.resolver(), scale, pl.t);
      },
    });
    setPlayer(pl);
    return () => pl.dispose();
  }, [pool, motion]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (player && !player.playing) player.draw();
  }, [player, shown, selected, tick, assetsReady, safe, fontTick]);

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
  /** A voice-over from «تسجيل صوت»: a file on this device, on a free sound track, which becomes a speech track. */
  const addRecording = async (file: File, startAt: Micros) => {
    if (!cache) return setError('هذا المتصفح لا يحفظ الملفات على الجهاز، فلا يُحفظ التسجيل فيه. جرّب Chrome أو Edge على حاسوب.');
    try {
      const info = await probeFile(file);
      if (!info) return setError('تعذّر قراءة التسجيل.');
      const { key } = await cache.putLocal(file);
      const r = addSource(live.current.doc, { kind: 'local', key, name: file.name, media: 'audio', mime: file.type, size: file.size, duration: info.duration });
      const added = addClip(r.doc, { source: r.id, start: startAt, length: info.duration ?? US, in: 0 });
      let d = added.doc;
      const tr = d.video?.tracks.find((x) => x.id === added.trackId);
      if (tr && tr.clips.length === 1 && !tr.role) d = setTrackSound(d, tr.id, { role: 'voice' });
      h.apply(d, 'تسجيل صوت');
      setSelected(added.clipId);
    } catch (e) {
      setError((e as Error).message || 'تعذّر حفظ التسجيل.');
    }
  };
  const addMotion = (g: Graphic, w: Where = {}) => place(h.get(), { ...motionClip(g, doc.video?.ratio ?? '9:16', w.at ?? at) }, 'إضافة قالب حركة', w);
  const addText = (kind: 'title' | 'body' | 'caption', w: Where = {}, pos?: { x: number; y: number }) => {
    const plain = kind === 'caption' ? captionStyle('تعليق أسفل الشاشة') : kind === 'title' ? { ...defaultText('عنوان'), size: 110, weight: 700 } : { ...defaultText('نص'), size: 64, weight: 500 };
    const style = brandText(plain, brand, kind === 'title' ? 'title' : 'body');
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
  const addCover = (mode: 'blur' | 'blocks', w: Where = {}) =>
    place(h.get(), { start: w.at ?? at, length: 3 * US, cover: newCover(mode, W, H), transform: { x: W / 2, y: H / 2, scale: 1, rotation: 0, opacity: 1 } }, mode === 'blur' ? 'تمويه منطقة' : 'إخفاء بالمربعات', w);
  /** A text clip from the work's text or a platform's copy, which remembers its version (MVP_draft.md 62.12). */
  const insertWorkText = (body: string, from: TextFrom) => {
    if (p.readOnly) return;
    const style = brandText({ ...defaultText(body), size: 56, weight: 500 }, brand, 'body');
    place(h.get(), { start: at, length: 5 * US, text: style, fromWork: from, transform: { x: W / 2, y: H * 0.5, scale: 1, rotation: 0, opacity: 1 } }, from.part === 'text' ? 'إدراج نص العمل' : 'إدراج نسخة منصة');
  };
  /** The next or previous open review note with a time, from the playhead. */
  const seekNote = (dir: 1 | -1) => {
    const open = noteMarks.filter((n) => n.open).map((n) => n.t).sort((a, b) => a - b);
    const eps = frameUs(fps) / 2;
    const to = dir > 0 ? open.find((x) => x > at + eps) : [...open].reverse().find((x) => x < at - eps);
    if (to !== undefined) seek(to);
  };
  const putMarker = () => {
    if (p.readOnly) return;
    const r = addMarker(h.get(), at);
    if (r.doc !== h.get()) h.apply(r.doc, 'علامة على الخط الزمني');
    frame.ws.open('markers');
  };
  const addDrop = (d: AddDrop, trackId: string | null, atT: Micros) => {
    const w: Where = { at: atT, trackId };
    if (d.type === 'library') addLibrary(d.item, w);
    else if (d.type === 'motion') {
      const g = graphicById(d.id);
      if (g) addMotion(g, w);
    } else if (d.type === 'text') addText(d.kind, w);
    else if (d.type === 'mark') addMark(d.key, d.color, w);
    else if (d.type === 'cover') addCover(d.mode, w);
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
  const videoSel = !!sel?.clip.source && doc.sources.find((s) => s.id === sel.clip.source)?.media === 'video';

  // ------------------------------------------------------------- keyframes, speed, stills (MVP_draft.md 62.7)
  const tauOf = (c: Clip) => Math.max(0, Math.min(c.length, at - c.start));
  const toggleKeyOf = (prop: KeyProp) => {
    const c = sel?.clip;
    if (!c) return;
    const tau = tauOf(c);
    const now = prop === 'speed' ? speedAt(c, tau) : transformAt(c, at, W, H)[prop];
    const had = !!keyAt(c.keys?.[prop], tau);
    const next: Clip = { ...c, keys: toggleKey(c.keys, prop, tau, now) };
    // the last key gone: the setting keeps the value it had here, as its plain value
    if (!hasKeys(next.keys, prop)) {
      if (prop === 'speed') next.speed = clampSpeed(now) === 1 ? undefined : clampSpeed(now);
      else next.transform = { ...transformOf(c, W, H), [prop]: now };
    }
    if (!next.keys) delete next.keys;
    if (next.speed === undefined) delete next.speed;
    const d = updateClip(h.get(), c.id, () => next);
    h.apply(prop === 'speed' ? setSpeedKeys(d, c.id, next.keys) : d, had ? 'إزالة مفتاح' : 'مفتاح عند رأس التشغيل');
  };
  const seekKey = (dir: -1 | 1) => {
    const c = sel?.clip;
    if (!c) return;
    const tau = tauOf(c);
    const times = keyTimes(c.keys);
    const target = dir > 0 ? times.find((x) => x > tau + KEY_TOLERANCE) : [...times].reverse().find((x) => x < tau - KEY_TOLERANCE);
    if (target !== undefined) seek(c.start + Math.max(0, Math.min(c.length, target)));
  };
  const keyAll = () => {
    const c = sel?.clip;
    if (!c || p.readOnly) return;
    if (c.source && doc.sources.find((s) => s.id === c.source)?.media === 'audio') return;
    h.apply(updateClip(h.get(), c.id, (x) => ({ ...x, keys: keyAllMotion(transformOf(x, W, H), x.keys, tauOf(x)) })), 'مفاتيح الحركة عند رأس التشغيل');
  };
  const freeze = () => {
    if (p.readOnly) return;
    const d = h.get();
    // the selected video clip if the playhead is on it, else the topmost video clip there
    const onIt = (c: Clip) => c.start <= at && at < c.start + c.length && d.sources.find((s) => s.id === c.source)?.media === 'video' && !isHold(c);
    const target = sel && onIt(sel.clip) ? sel.clip : [...visibleAt(d, at)].reverse().map((v) => v.clip).find(onIt);
    if (!target) return setError('ضع رأس التشغيل على مقطع فيديو لتجميد إطاره.');
    const r = insertHold(d, target.id, at);
    if (!r.holdId) return setError('تعذّر تجميد الإطار هنا.');
    h.apply(r.doc, 'تجميد الإطار');
    setSelected(r.holdId);
  };
  /** «إطار إلى مشروع صورة»: a photo project whose picture is the frame at the playhead, from the same file. */
  const frameToPhoto = async () => {
    const d = h.get();
    const top = [...visibleAt(d, at)].reverse().map((v) => v.clip).find((c) => d.sources.find((s) => s.id === c.source)?.media === 'video');
    if (!top) return setError('ضع رأس التشغيل على مقطع فيديو لتصنع من إطاره صورة.');
    const src = d.sources.find((s) => s.id === top.source)!;
    const { id: _old, ...rest } = src;
    void _old;
    let photoDoc = newPhotoDoc(W, H);
    const r = addSource(photoDoc, rest as Parameters<typeof addSource>[1]);
    photoDoc = addLayer(r.doc, { source: r.id, at: sourceTime(top, at), transform: transformAt(top, at, W, H), ...(top.fit ? { fit: top.fit } : {}), ...(top.crop ? { crop: top.crop } : {}), name: `إطار ${shortTime(at)}` }).doc;
    const made = await p.api.create(`${p.title} · إطار ${shortTime(at)}`.slice(0, 120), photoDoc);
    if (!made.ok) return setError(made.error);
    router.push(`/motion/studio/${made.data}`);
  };
  const keyActions: KeyActions = {
    toggle: toggleKeyOf,
    seek: seekKey,
    ease: (e: Ease) => sel && patch((c) => ({ ...c, keys: setEaseAt(c.keys, tauOf(c), e) }), 'منحنى المفتاح'),
    clear: () =>
      sel &&
      patch((c) => {
        const now = transformAt(c, at, W, H);
        const keys = { ...(c.keys ?? {}) };
        for (const k of MOTION_PROPS) delete keys[k];
        const next: Clip = { ...c, transform: now, keys: tidyKeys(keys) };
        if (!next.keys) delete next.keys;
        return next;
      }, 'إزالة مفاتيح الحركة'),
    setSpeed: (v: number) => {
      const c = sel?.clip;
      if (!c) return;
      if (hasKeys(c.keys, 'speed')) h.apply(setSpeedKeys(h.get(), c.id, { ...c.keys, speed: setKey(c.keys!.speed, tauOf(c), clampSpeed(v)) }), 'نقطة السرعة', `speedkey-${c.id}`);
      else h.apply(setSpeed(h.get(), c.id, v), 'السرعة', `speed-${c.id}`);
    },
    setReverse: (on: boolean) => selected && h.apply(setReverse(h.get(), selected, on), on ? 'تشغيل عكسي' : 'تشغيل أمامي'),
    freeze,
  };
  /** Only the settings that a drag on the preview changed (a keyed one gets its key at the playhead). */
  const changedOf = (c: Clip, tr: { x: number; y: number; scale: number; rotation: number; opacity: number }) => {
    const now = transformAt(c, at, W, H);
    const out: Record<string, number> = {};
    for (const k of MOTION_PROPS) if (Math.abs(now[k] - tr[k]) > 1e-6) out[k] = tr[k];
    return out;
  };

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
      case 'freeze': freeze(); break;
      case 'marker': putMarker(); break;
      case 'key-all': keyAll(); break;
      case 'key-prev': seekKey(-1); break;
      case 'key-next': seekKey(1); break;
      case 'note-next': seekNote(1); break;
      case 'note-prev': seekNote(-1); break;
      case 'send-review': p.onSending?.(true); break;
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
      if (typingTarget(target) && !['save-version', 'export', 'send-review', 'full-window'].includes(id)) {
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
    onCover: (m: 'blur' | 'blocks') => addCover(m),
    assetsReady,
    suggest: suggestOf(doc),
    compact,
  };

  const stageEl = (
    <Stage
      doc={shown}
      shapes={{ list: shapeList, shown: showing ?? shapeList[0] }}
      onShape={(r) => setViewShape(r === shapeList[0] ? null : r)}
      player={player}
      canvasRef={canvasRef}
      t={t}
      playing={playing}
      safe={safe}
      onSafe={setSafe}
      selected={selected}
      readOnly={p.readOnly}
      onSelect={setSelected}
      onPlace={(id, x, y, key) => {
        const d = h.get();
        const c = locate(d, id)?.clip;
        if (showing && c) return h.apply(setReframe(d, showing, id, reframeFromPlace(d, showing, c, at, { x, y })), `المكان في الشكل ${showing}`, key);
        h.apply(updateClip(d, id, (x2) => writeClipTransform(x2, tauOf(x2), { x, y }, W, H)), 'نقل على الإطار', key);
      }}
      onTransform={(id, tr, key) => {
        const d = h.get();
        const c = locate(d, id)?.clip;
        if (showing && c) return h.apply(setReframe(d, showing, id, reframeFromPlace(d, showing, c, at, { x: tr.x, y: tr.y, scale: tr.scale })), `الحجم في الشكل ${showing}`, key);
        h.apply(updateClip(d, id, (x2) => writeClipTransform(x2, tauOf(x2), changedOf(x2, tr), W, H)), 'الحجم والدوران', key);
      }}
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
  const exportEl = <ExportPanel doc={doc} pool={pool} t={at} projectId={p.projectId} title={p.title} readOnly={p.readOnly} canLibrary={canLibrary} api={p.api} saveVersion={p.saveVersion} revision={p.revision} workRef={pw.workRef} onSaved={() => setReviewKey((x) => x + 1)} onSend={p.onSending ? () => p.onSending?.(true) : undefined} />;
  const cacheEl = <CachePanel cache={cache} inUse={pool ? pool.inUse(doc) : new Set()} onChanged={() => player?.draw()} />;
  const reviewEl = <ReviewPanel projectId={p.projectId} api={p.api} readOnly={p.readOnly} onSeek={seek} pw={pw} refreshKey={reviewKey} revision={p.revision()} onNotes={setNoteMarks} onInsertText={insertWorkText} texts={workTexts} />;
  const fromWork = sel?.clip.fromWork;
  const workTextNote = fromWork && fromWork.work === pw.workRef
    ? { label: fromWork.part === 'text' ? 'نص العمل' : `نسخة ${platformLabels[fromWork.part.replace(/^v:/, '')] ?? fromWork.part}`, n: fromWork.n, newer: newerText(fromWork, workTexts) }
    : null;
  const sendEl = p.sending && p.linked && (
    <SendReviewDialog
      projectId={p.projectId}
      title={p.title}
      doc={doc}
      pool={pool}
      api={p.api}
      saveVersion={p.saveVersion}
      revision={p.revision}
      linked={p.linked}
      canLibrary={canLibrary}
      onClose={() => {
        p.onSending?.(false);
        setReviewKey((x) => x + 1);
      }}
    />
  );
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
      t={at}
      keyActions={keyActions}
      track={sel?.track}
      onTrackSound={(pt) => sel && h.apply(setTrackSound(h.get(), sel.track.id, pt), pt.role ? 'المسار في المزج' : 'خفض الموسيقى تحت الكلام', `track-sound-${sel.track.id}`)}
      workText={workTextNote}
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
      onRecord={cache ? () => setRecording(at) : undefined}
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
      peaksOf={(id) => pool?.peaks(id) ?? null}
      notes={noteMarks}
      onTrackRole={(id, role) => h.apply(setTrackSound(h.get(), id, { role }), role === 'voice' ? 'مسار كلام' : 'مسار موسيقى')}
      onMoveKey={(id, from, to, key) => {
        const d = updateClip(h.get(), id, (c) => ({ ...c, keys: moveKeyTime(c.keys, from, to) }));
        h.apply(setSpeedKeys(d, id, locate(d, id)?.clip.keys), 'نقل مفتاح', key);
      }}
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
  const recordEl = recording !== null && (
    <RecordDialog
      at={recording}
      onClose={() => setRecording(null)}
      onDone={addRecording}
      onRun={(on) => {
        if (!player) return;
        player.muted = on;
        if (on) {
          player.seek(recording);
          player.play();
        } else if (player.playing) player.pause();
      }}
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
        {sendEl}
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
        { label: 'تصدير وإرسال للمراجعة…', icon: <Send aria-hidden="true" />, keys: keysOf('send-review'), disabled: !p.onSending, hint: p.linked ? undefined : 'يحتاج المشروع عملاً مرتبطاً: اربطه من نافذة «المراجعة».', onSelect: () => p.onSending?.(true) },
        { label: 'إطار إلى مشروع صورة', icon: <ImagePlus aria-hidden="true" />, hint: 'مشروع صورة جديد صورته الإطار عند رأس التشغيل، للغلاف والصورة المصغرة.', onSelect: () => void frameToPhoto() },
        { label: template.on ? 'إلغاء كونه قالباً' : 'حفظ قالباً', icon: <LayoutTemplate aria-hidden="true" />, checked: template.on, disabled: ro, hint: 'يظهر القالب في «القوالب» في صفحة الاستوديو، ويُبدأ منه مشروع جديد.', onSelect: async () => { const e = await template.set(!template.on); if (e) setError(e); } },
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
        { label: 'تجميد الإطار عند رأس التشغيل', icon: <Snowflake aria-hidden="true" />, keys: keysOf('freeze'), disabled: ro, onSelect: freeze },
        { label: sel?.clip.reverse ? 'تشغيل أمامي' : 'تشغيل عكسي', icon: <Rewind aria-hidden="true" />, disabled: ro || !videoSel || (!!sel && isHold(sel.clip)), onSelect: () => keyActions.setReverse(!sel?.clip.reverse) },
        { label: 'مفاتيح الحركة عند رأس التشغيل', icon: <Diamond aria-hidden="true" />, keys: keysOf('key-all'), disabled: ro || !selected, onSelect: keyAll },
        { label: 'علامة عند رأس التشغيل', icon: <Bookmark aria-hidden="true" />, keys: keysOf('marker'), disabled: ro, onSelect: putMarker },
        { label: 'تسجيل صوت…', icon: <Mic aria-hidden="true" />, disabled: ro || !cache, onSelect: () => setRecording(at) },
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
    markers: (
      <MarkersPanel
        doc={doc}
        readOnly={p.readOnly}
        onAdd={putMarker}
        onUpdate={(id, pt) => h.apply(updateMarker(h.get(), id, pt), pt.label !== undefined ? 'اسم العلامة' : 'لون العلامة', `marker-${id}-${pt.label !== undefined ? 'label' : 'color'}`)}
        onRemove={(id) => h.apply(removeMarker(h.get(), id), 'حذف علامة')}
        onSeek={seek}
        extra={pw.workRef ? <ChaptersToWork workRef={pw.workRef} lines={chapters(doc)} ready={!chapterIssues(doc, durationOf(doc)).length} current={workTexts.variants.youtube ?? null} readOnly={p.readOnly} /> : undefined}
      />
    ),
    versions: <VersionsPanel projectId={p.projectId} api={p.api} readOnly={p.readOnly} doc={doc} revision={p.revision} saveVersion={p.saveVersion} onApply={(d, label) => h.apply(d, label)} label={(d, item) => clipLabel(d, item as Clip)} refreshKey={p.revision()} />,
  });

  return (
    <SwatchContext.Provider value={brand.colors}>
    <div className="st-editor" data-readonly={p.readOnly ? 'yes' : 'no'} data-compact="no" data-chrome={chrome} data-full={full ? 'yes' : 'no'} data-tool={tool}>
      {errorEl}
      <EditorFrame frame={frame} menus={menus} panels={panels} full={full} onFull={() => setFull(!full)} chrome={chrome} onChrome={() => setChrome(chrome === 'dark' ? 'light' : 'dark')}>
        {uploadEl}
        {recordEl}
        {sendEl}
      </EditorFrame>
    </div>
    </SwatchContext.Provider>
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

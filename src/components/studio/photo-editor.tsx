'use client';

// The photo editor (MVP_draft.md 62, 62.1 to 62.5): one canvas of layers (pictures, text, shapes, motion
// templates at their settled moment, brand marks), drawn by the shared compositor. On a computer every
// part is a window of the workspace with the menu bar and the keyboard; on a phone the canvas and one
// panel at a time. Layers are moved, scaled from a corner and turned on the canvas, ordered, hidden,
// locked, copied, duplicated and deleted; pictures are cropped, flipped, blended and adjusted by the
// pixel functions in a worker. The same undo history, device cache, sources and export as the video editor.
import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowDown, ArrowUp, Copy, Eye, EyeOff, Lock, Trash2, Unlock, AlignCenter, AlignLeft, AlignRight, ArrowRight, ClipboardPaste, FileOutput, Moon, MousePointer2, Pencil, Redo2, Save, Scissors, Type as TypeIcon, Undo2, XCircle, ChevronsUp, ChevronsDown, MousePointerClick, Pin, LayoutTemplate,
} from 'lucide-react';
import { canOpen } from '@/lib/access';
import { useAccount } from '@/lib/account-context';
import type { Graphic } from '@/lib/motion/types';
import { PHOTO_MAX_SIDE, PHOTO_PRESETS, STICKERS, STICKER_LABELS, canvasOf, type Layer, type ProjectDoc, type Shape, type StickerKey } from '@/lib/studio/schema';
import { addSource } from '@/lib/studio/timeline';
import { MotionRenderer, graphicById } from '@/lib/studio/motion-adapter';
import { boxOf, composePhoto, pick, transformOf, type Resolver } from '@/lib/studio/compose';
import { defaultText } from '@/lib/studio/text';
import { probeFile } from '@/lib/studio/media';
import { addLayer, adjustImage, adjusts, alignLayer, duplicateLayer, moveLayer, removeLayer, setCanvas, updateLayer } from '@/lib/studio/photo';
import { redoLabel, undoLabel } from '@/lib/studio/history';
import { dragHandle, handleAt, snapCentre, type Handle } from '@/lib/studio/handles';
import { keysOf, matchShortcut, typingTarget } from '@/lib/studio/shortcuts';
import { ColorInput, Segmented, Slider, Switch, SwatchContext } from '../motion-controls';
import { ADD_MIME, Bin, GraphicsPane, MediaPane, TemplatesPane, type AddDrop, type LibraryItem } from './bin';
import { CachePanel } from './cache-panel';
import { DesktopOnly, PanelTabs, useCompact, type Panel } from './compact';
import { ReviewPanel, useProjectWork } from './work-links';
import { ExportPanel } from './export-panel';
import { CoverControls, CropControls, MotionControls, TextControls, TransformControls } from './inspector';
import { newCover } from '@/lib/studio/cover';
import { librarySource } from './library';
import type { EditorProps } from './project-shell';
import { drawOutline, readAddDrop } from './stage';
import { UploadDialog, sourceNote, studioClipboard, useDocHistory, useExactSources, useStudioAssets, useStudioFonts, useStudioMedia } from './editor';
import { HistoryPanel } from './history-panel';
import { useStudioBrand, useTemplateFlag } from './brand';
import { brandText } from '@/lib/studio/brand';
import { HOLD } from '@/lib/kit/hold-reasons';
import { VersionsPanel } from './versions-panel';
import { plainLabel } from '@/lib/studio/diff';
import { EditorFrame, panelSpecs, useEditorFrame } from './editor-frame';
import type { Menu } from './menubar';
import { usePref } from './prefs';
import '../motion-studio.css';
import './editor.css';
import './workspace.css';
import './studio-fonts';

export function layerLabel(doc: ProjectDoc, l: Layer): string {
  if (l.name) return l.name;
  if (l.text) return l.text.content.split('\n')[0] || 'نص';
  if (l.motion) return graphicById(l.motion.template)?.name ?? 'قالب حركة';
  if (l.sticker) return STICKER_LABELS[l.sticker.key];
  if (l.shape) return l.shape.type === 'ellipse' ? 'دائرة' : l.shape.type === 'line' ? 'خط' : 'مستطيل';
  if (l.cover) return l.cover.mode === 'blocks' ? 'إخفاء بالمربعات' : 'تمويه منطقة';
  return doc.sources.find((s) => s.id === l.source)?.name ?? 'صورة';
}

const BLENDS = [
  { value: 'normal' as const, label: 'عادي' },
  { value: 'multiply' as const, label: 'ضرب' },
  { value: 'screen' as const, label: 'تفتيح' },
];
const isChrome = (v: unknown): v is 'dark' | 'light' => v === 'dark' || v === 'light';

export function PhotoEditor(p: EditorProps) {
  const account = useAccount();
  const router = useRouter();
  const canLibrary = canOpen(account, 'media');
  const h = useDocHistory(p);
  const doc = h.doc;
  const { w: W, h: H } = canvasOf(doc);
  const { cache, pool, tick, cacheReady } = useStudioMedia(doc);
  useExactSources(doc, pool, tick, h.quiet);
  const assetsReady = useStudioAssets();
  const fontTick = useStudioFonts(doc);
  const motion = useMemo(() => new MotionRenderer(), []);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [size, setSize] = useState({ w: 400, h: 400 });
  const [uploading, setUploading] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tool, setTool] = useState<'select' | 'text'>('select');
  const [hover, setHover] = useState<Handle>(null);
  const [dropping, setDropping] = useState(false);
  const [reviewKey, setReviewKey] = useState(0);
  const [chrome, setChrome] = usePref<'dark' | 'light'>('chrome', 'dark', isChrome);
  const [full, setFull] = usePref<boolean>('full-window', false);
  const [, bumpClip] = useState(0);
  const compact = useCompact();
  const [panel, setPanel] = useState<Panel>('timeline');
  const pw = useProjectWork(p.projectId, p.api);
  const frame = useEditorFrame('photo');
  const { brand } = useStudioBrand();
  const template = useTemplateFlag(p.projectId, p.api);
  // pictures with their adjustment applied (by the worker), by layer
  const [adjusted, setAdjusted] = useState<Map<string, { key: string; canvas: HTMLCanvasElement }>>(new Map());
  const layers = doc.photo?.layers ?? [];
  const sel = layers.find((l) => l.id === selected) ?? null;

  useEffect(() => {
    if (!pool) return;
    let live = true;
    for (const l of layers) {
      if (!l.source || !adjusts(l.adjust)) continue;
      const img = pool.image(l.source);
      if (!img) continue;
      const key = `${l.source}|${JSON.stringify(l.adjust)}`;
      if (adjusted.get(l.id)?.key === key) continue;
      void adjustImage(img, l.adjust!).then((canvas) => {
        if (live) setAdjusted((m) => new Map(m).set(l.id, { key, canvas }));
      });
    }
    return () => {
      live = false;
    };
  }, [layers, pool, tick]); // eslint-disable-line react-hooks/exhaustive-deps

  // a layer that is a frame of a video («إطار إلى مشروع صورة»): the decoder's frame, copied, by layer
  const [frames, setFrames] = useState<Map<string, { key: string; canvas: HTMLCanvasElement }>>(new Map());
  useEffect(() => {
    if (!pool) return;
    let live = true;
    for (const l of layers) {
      if (!l.source || doc.sources.find((s) => s.id === l.source)?.media !== 'video' || pool.state(l.source)?.kind !== 'ready') continue;
      const key = `${l.source}|${l.at ?? 0}`;
      if (frames.get(l.id)?.key === key) continue;
      void pool.frameAt(l.source, l.at ?? 0).then((f) => {
        if (!live || !f) return;
        const c = document.createElement('canvas');
        const fw = (f as HTMLCanvasElement).width;
        const fh = (f as HTMLCanvasElement).height;
        c.width = fw;
        c.height = fh;
        c.getContext('2d')!.drawImage(f, 0, 0);
        setFrames((m) => new Map(m).set(l.id, { key, canvas: c }));
      });
    }
    return () => {
      live = false;
    };
  }, [layers, pool, tick]); // eslint-disable-line react-hooks/exhaustive-deps

  const resolver = useMemo<Resolver>(
    () => ({
      motion,
      image: (id) => pool?.image(id) ?? null,
      videoFrame: (_s, _at, layerId) => (layerId ? (frames.get(layerId)?.canvas ?? null) : null),
      adjusted: (item) => {
        const a = adjusted.get(item.id);
        return a && a.key === `${item.source}|${JSON.stringify(item.adjust)}` ? a.canvas : null;
      },
    }),
    [motion, pool, adjusted, frames],
  );

  // the canvas fits its window with the photo's proportions
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const fit = () => {
      const r = el.getBoundingClientRect();
      const maxH = compact ? Math.max(220, window.innerHeight * 0.62) : Math.max(120, r.height - 20);
      const k = Math.min((r.width - 20) / W, maxH / H);
      setSize({ w: Math.max(1, Math.floor(W * k)), h: Math.max(1, Math.floor(H * k)) });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [W, H, compact]);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const pw = Math.min(W, Math.round(size.w * dpr));
    if (c.width !== pw) {
      c.width = pw;
      c.height = Math.round((pw * H) / W);
    }
    const ctx = c.getContext('2d')!;
    const scale = c.width / W;
    composePhoto(ctx, doc, resolver, { scale });
    if (sel) drawOutline(ctx, doc, sel, resolver, scale);
  }, [doc, size, W, H, resolver, sel, tick, assetsReady, fontTick]);

  // ------------------------------------------------------------- adding
  type At = { x: number; y: number } | undefined;
  const put = (d: ProjectDoc, layer: Parameters<typeof addLayer>[1], label: string, at?: At) => {
    const r = addLayer(d, at ? { ...layer, transform: { x: at.x, y: at.y, scale: layer.transform?.scale ?? 1, rotation: 0, opacity: 1 } } : layer);
    h.apply(r.doc, label);
    setSelected(r.id);
  };
  const addLibrary = (item: LibraryItem, at?: At) => {
    const r = addSource(h.get(), librarySource(item));
    put(r.doc, { source: r.id, fit: 'contain' }, 'إضافة صورة من المكتبة', at);
  };
  const addDevice = async (file: File, upload: boolean) => {
    setError(null);
    if (upload) return setUploading(file);
    if (!cache) return setError('هذا المتصفح لا يحفظ الملفات على الجهاز. ارفع الصورة إلى المكتبة.');
    const info = await probeFile(file);
    if (!info || info.media !== 'image') return setError('اختر صورة.');
    const { key } = await cache.putLocal(file);
    const r = addSource(h.get(), { kind: 'local', key, name: file.name, media: 'image', mime: file.type, size: file.size, w: info.w, h: info.h });
    put(r.doc, { source: r.id, fit: 'contain' }, 'إضافة صورة من هذا الجهاز');
  };
  const addMotion = (g: Graphic, at?: At) => put(h.get(), { motion: { template: g.id, params: {} } }, 'إضافة قالب حركة', at);
  const addText = (kind: 'title' | 'body' | 'caption', at?: At) =>
    put(h.get(), { text: brandText(kind === 'title' ? { ...defaultText('عنوان'), size: Math.round(W / 10), weight: 700, enter: 'none', exit: 'none' } : { ...defaultText('نص'), size: Math.round(W / 18), weight: 500, enter: 'none', exit: 'none' }, brand, kind === 'title' ? 'title' : 'body') }, 'إضافة نص', at);
  const addMark = (key: StickerKey, color: string, at?: At) => put(h.get(), { sticker: { key, color }, transform: { x: at?.x ?? W * 0.78, y: at?.y ?? H * 0.12, scale: 0.6, rotation: 0, opacity: 1 } }, 'إضافة علامة الهوية');
  const addShape = (type: Shape['type'], at?: At) =>
    put(h.get(), { shape: { type, w: type === 'line' ? W * 0.5 : W * 0.4, h: type === 'line' ? 8 : W * 0.25, fill: type === 'line' ? null : '#17634b', stroke: type === 'line' ? '#c9ac70' : null, strokeWidth: type === 'line' ? 8 : 0, radius: 24 } }, 'إضافة شكل', at);
  const addCover = (mode: 'blur' | 'blocks', at?: At) => put(h.get(), { cover: newCover(mode, W, H) }, mode === 'blur' ? 'تمويه منطقة' : 'إخفاء بالمربعات', at);
  const addDrop = (d: AddDrop, at: At) => {
    if (d.type === 'library') {
      if (d.item.kind === 'image') addLibrary(d.item, at);
      else setError('مشروع الصورة يقبل الصور وحدها.');
    } else if (d.type === 'motion') {
      const g = graphicById(d.id);
      if (g) addMotion(g, at);
    } else if (d.type === 'text') addText(d.kind, at);
    else if (d.type === 'mark') addMark(d.key, d.color, at);
    else if (d.type === 'shape') addShape(d.shape, at);
    else if (d.type === 'cover') addCover(d.mode, at);
  };

  // ------------------------------------------------------------- editing
  const patch = (pt: Partial<Layer> | ((l: Layer) => Layer), label: string, key?: string) => selected && h.apply(updateLayer(h.get(), selected, pt), label, key ? `${key}-${selected}` : null);
  const remove = () => {
    if (!selected || sel?.locked || sel?.pinned) return;
    h.apply(removeLayer(doc, selected), 'حذف الطبقة');
    setSelected(null);
  };
  const duplicate = () => {
    if (!selected) return;
    const r = duplicateLayer(doc, selected);
    if (r.id) {
      h.apply(r.doc, 'تكرار الطبقة');
      setSelected(r.id);
    }
  };
  const copy = () => {
    if (!sel) return;
    studioClipboard.set({ kind: 'layer', layer: structuredClone(sel), sources: doc.sources.filter((s) => s.id === sel.source).map((s) => structuredClone(s)) });
    bumpClip((x) => x + 1);
  };
  const cut = () => {
    if (!sel || sel.locked) return;
    copy();
    remove();
  };
  const paste = () => {
    const c = studioClipboard.get();
    let d = h.get();
    let source: string | undefined;
    if (c?.kind === 'layer') {
      for (const s of c.sources) {
        const { id: oldId, ...rest } = s;
        const r = addSource(d, rest as Parameters<typeof addSource>[1]);
        d = r.doc;
        if (oldId === c.layer.source) source = r.id;
      }
      const { id: _drop, ...layer } = c.layer;
      void _drop;
      const r = addLayer(d, { ...layer, source: source ?? layer.source, transform: { ...layer.transform, x: layer.transform.x + 24, y: layer.transform.y + 24 } });
      h.apply(r.doc, 'لصق الطبقة');
      setSelected(r.id);
    } else if (c?.kind === 'clip') {
      // a clip of a video project pasted as a layer: its content and place, without its timing
      for (const s of c.sources) {
        const { id: oldId, ...rest } = s;
        const r = addSource(d, rest as Parameters<typeof addSource>[1]);
        d = r.doc;
        if (oldId === c.clip.source) source = r.id;
      }
      const cl = c.clip;
      if (cl.source && d.sources.find((s) => s.id === source)?.media !== 'image') return setError('مشروع الصورة يقبل الصور وحدها.');
      const r = addLayer(d, { source, motion: cl.motion, text: cl.text, sticker: cl.sticker, shape: cl.shape, fit: cl.fit, crop: cl.crop, adjust: cl.adjust, ...(cl.transform ? { transform: cl.transform } : {}) });
      h.apply(r.doc, 'لصق طبقة');
      setSelected(r.id);
    }
  };
  const align = (how: Parameters<typeof alignLayer>[2]) => {
    if (!sel) return;
    const b = boxOf(doc, sel, resolver, canvasRef.current?.getContext('2d') ?? null);
    if (b) h.apply(alignLayer(doc, sel.id, how, { w: b.w, h: b.h }), 'محاذاة الطبقة');
  };
  const order = (to: 'up' | 'down' | 'top' | 'bottom') => sel && h.apply(moveLayer(doc, sel.id, to), 'ترتيب الطبقات');
  const nudge = (dx: number, dy: number) => sel && !sel.locked && h.apply(updateLayer(doc, sel.id, (l) => ({ ...l, transform: { ...l.transform, x: l.transform.x + dx, y: l.transform.y + dy } })), 'تحريك الطبقة', `nudge-${sel.id}`);

  // dragging on the canvas: a layer's body moves it, a corner scales it, the round handle turns it
  const drag = useRef<{ id: string; mode: 'move' | 'scale' | 'rotate'; x0: number; y0: number; cx: number; cy: number; tr: Layer['transform']; key: string } | null>(null);
  const toCanvas = (e: { clientX: number; clientY: number }) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  };
  const k = () => (canvasRef.current?.getBoundingClientRect().width ?? size.w) / W;
  const handleUnder = (pt: { x: number; y: number }): Handle => {
    if (!sel || sel.locked || p.readOnly) return null;
    const b = boxOf(doc, sel, resolver, canvasRef.current?.getContext('2d') ?? null);
    return b ? handleAt(b, pt, k()) : null;
  };
  const down = (e: RPointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    const pt = toCanvas(e);
    if (tool === 'text' && !p.readOnly) {
      addText('body', { x: Math.round(pt.x), y: Math.round(pt.y) });
      return setTool('select');
    }
    const hd = handleUnder(pt);
    if (hd && sel) {
      e.currentTarget.setPointerCapture(e.pointerId);
      drag.current = { id: sel.id, mode: hd, x0: pt.x, y0: pt.y, cx: 0, cy: 0, tr: transformOf(sel, W, H), key: `${hd}-${sel.id}-${Date.now()}` };
      return;
    }
    const id = pick(doc, pt.x, pt.y, null, resolver, canvasRef.current!.getContext('2d'));
    setSelected(id);
    if (!id || p.readOnly) return;
    const l = layers.find((x) => x.id === id)!;
    // a layer pinned in a template is selected but not dragged (MVP_draft.md 62.11)
    if (l.pinned) return;
    const tr = transformOf(l, W, H);
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id, mode: 'move', x0: pt.x, y0: pt.y, cx: tr.x, cy: tr.y, tr, key: `place-${id}-${Date.now()}` };
  };
  const move = (e: RPointerEvent<HTMLCanvasElement>) => {
    const pt = toCanvas(e);
    const d = drag.current;
    if (!d) return setHover(handleUnder(pt));
    if (d.mode === 'move') {
      const s = snapCentre(d.cx + (pt.x - d.x0), d.cy + (pt.y - d.y0), W, H);
      return h.apply(updateLayer(h.get(), d.id, (l) => ({ ...l, transform: { ...l.transform, x: s.x, y: s.y } })), 'نقل الطبقة', d.key);
    }
    const l = layers.find((x) => x.id === d.id);
    if (!l) return;
    const b = boxOf(doc, { ...l, transform: d.tr }, resolver, canvasRef.current?.getContext('2d') ?? null);
    if (b) h.apply(updateLayer(h.get(), d.id, { transform: dragHandle(d.mode, d.tr, b, { x: d.x0, y: d.y0 }, pt, e.shiftKey) }), 'الحجم والدوران', d.key);
  };

  // ------------------------------------------------------------- keys
  const run = (id: string): boolean => {
    switch (id) {
      case 'undo': h.undo(); break;
      case 'redo': h.redo(); break;
      case 'delete': remove(); break;
      case 'duplicate': duplicate(); break;
      case 'copy': copy(); break;
      case 'cut': cut(); break;
      case 'paste': paste(); break;
      case 'deselect': if (frame.ws.layout.max) frame.maximize(); else if (tool !== 'select') setTool('select'); else setSelected(null); break;
      case 'nudge-left': nudge(-1, 0); break;
      case 'nudge-right': nudge(1, 0); break;
      case 'nudge-up': nudge(0, -1); break;
      case 'nudge-down': nudge(0, 1); break;
      case 'nudge-left-10': nudge(-10, 0); break;
      case 'nudge-right-10': nudge(10, 0); break;
      case 'nudge-up-10': nudge(0, -10); break;
      case 'nudge-down-10': nudge(0, 10); break;
      case 'forward': order('up'); break;
      case 'backward': order('down'); break;
      case 'to-front': order('top'); break;
      case 'to-back': order('bottom'); break;
      case 'tool-select': setTool('select'); break;
      case 'tool-text': setTool('text'); break;
      case 'maximize': frame.maximize(); break;
      case 'full-window': setFull((v) => !v); break;
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
      const id = matchShortcut(e, 'photo');
      if (!id) return;
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

  const src = sel?.source ? doc.sources.find((s) => s.id === sel.source) : undefined;
  const presetIndex = PHOTO_PRESETS.findIndex((x) => x.w === W && x.h === H);
  const ro = p.readOnly;

  const binProps = {
    ratio: W >= H ? '16:9' : '9:16',
    photo: true,
    readOnly: ro,
    canLibrary,
    canDevice: cacheReady && !!cache,
    onLibrary: (it: LibraryItem) => addLibrary(it),
    onDevice: (f: File, up: boolean) => void addDevice(f, up),
    onMotion: (g: Graphic) => addMotion(g),
    onText: (k: 'title' | 'body' | 'caption') => addText(k),
    onMark: (k: StickerKey, c: string) => addMark(k, c),
    onShape: (t: Shape['type']) => addShape(t),
    onCover: (m: 'blur' | 'blocks') => addCover(m),
    assetsReady,
    compact,
  };
  const stageEl = (
    <section className="st-stage" aria-label="الصورة">
      <div className="st-mon-head">
        <span className="st-mon-time" dir="ltr">
          <bdi dir="ltr">{W}×{H}</bdi>
        </span>
        <span className="st-mon-fill" />
        <button type="button" className="st-mon-btn" data-on={tool === 'text' ? 'yes' : 'no'} aria-pressed={tool === 'text'} onClick={() => setTool(tool === 'text' ? 'select' : 'text')} title={`أداة النص (${keysOf('tool-text')})`}>
          <TypeIcon aria-hidden="true" />
          <span>أداة النص</span>
        </button>
      </div>
      {compact && (
        <div className="st-tl-bar">
          <button type="button" onClick={h.undo} disabled={ro || !h.hist.past.length} title={undoLabel(h.hist)} aria-label={undoLabel(h.hist)}>
            <Undo2 aria-hidden="true" />
          </button>
          <button type="button" onClick={h.redo} disabled={ro || !h.hist.future.length} title={redoLabel(h.hist)} aria-label={redoLabel(h.hist)}>
            <Redo2 aria-hidden="true" />
          </button>
          <span className="st-hint">
            <bdi dir="ltr">{W}×{H}</bdi>
          </span>
        </div>
      )}
      <div
        className="st-stage-box st-photo-box"
        ref={boxRef}
        data-drop={dropping ? 'yes' : 'no'}
        onDragOver={(e) => {
          if (ro || !e.dataTransfer.types.includes(ADD_MIME)) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
          setDropping(true);
        }}
        onDragLeave={() => setDropping(false)}
        onDrop={(e) => {
          setDropping(false);
          const d = readAddDrop(e);
          if (!d || ro || !canvasRef.current) return;
          e.preventDefault();
          const pt = toCanvas(e);
          const inside = pt.x >= 0 && pt.y >= 0 && pt.x <= W && pt.y <= H;
          addDrop(d, inside ? { x: Math.round(pt.x), y: Math.round(pt.y) } : undefined);
        }}
      >
        <canvas
          ref={canvasRef}
          className="st-canvas"
          style={{ width: size.w, height: size.h, cursor: tool === 'text' ? 'text' : hover === 'rotate' ? 'grab' : hover === 'scale' ? 'nwse-resize' : 'default' }}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={() => (drag.current = null)}
          onPointerCancel={() => (drag.current = null)}
          onPointerLeave={() => !drag.current && setHover(null)}
          role="img"
          aria-label={`الصورة ${W} في ${H}`}
        />
        {!assetsReady && <div className="st-stage-wait" role="status">جارٍ تجهيز القوالب والخطوط…</div>}
        {tool === 'text' && !ro && <div className="st-stage-tip">أداة النص: انقر حيث تريد النص.</div>}
      </div>
    </section>
  );
  const layersEl = (
    <section className="st-layers" aria-label="الطبقات">
      <h2>الطبقات</h2>
      {layers.length === 0 ? (
        <p className="st-hint">أضف صورة أو نصاً أو شكلاً من نوافذ الإضافة، أو اسحبه إلى الصورة.</p>
      ) : (
        <ol>
          {[...layers].reverse().map((l) => (
            <li key={l.id} data-selected={l.id === selected ? 'yes' : 'no'} data-layer={l.id}>
              <button type="button" className="st-layer-name" onClick={() => setSelected(l.id)} dir="auto">
                {layerLabel(doc, l)}
              </button>
              <span className="st-layer-acts">
                <button type="button" aria-label={l.hidden ? 'إظهار' : 'إخفاء'} title={l.hidden ? 'إظهار' : 'إخفاء'} disabled={ro} onClick={() => h.apply(updateLayer(doc, l.id, { hidden: !l.hidden }), 'إظهار الطبقة')}>
                  {l.hidden ? <EyeOff /> : <Eye />}
                </button>
                <button type="button" aria-label={l.locked ? 'فتح القفل' : 'قفل'} title={l.locked ? 'فتح القفل' : 'قفل'} disabled={ro} onClick={() => h.apply(updateLayer(doc, l.id, { locked: !l.locked }), 'قفل الطبقة')}>
                  {l.locked ? <Lock /> : <Unlock />}
                </button>
                <button type="button" aria-label="إلى الأعلى" title={`إلى الأمام (${keysOf('forward')})`} disabled={ro} onClick={() => h.apply(moveLayer(doc, l.id, 'up'), 'ترتيب الطبقات')}>
                  <ArrowUp />
                </button>
                <button type="button" aria-label="إلى الأسفل" title={`إلى الخلف (${keysOf('backward')})`} disabled={ro} onClick={() => h.apply(moveLayer(doc, l.id, 'down'), 'ترتيب الطبقات')}>
                  <ArrowDown />
                </button>
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
  const exportEl = <ExportPanel doc={doc} pool={pool} t={0} projectId={p.projectId} title={p.title} readOnly={ro} canLibrary={canLibrary} api={p.api} saveVersion={p.saveVersion} revision={p.revision} photo adjusted={resolver.adjusted} workRef={pw.workRef} onSaved={() => setReviewKey((x) => x + 1)} />;
  const reviewEl = <ReviewPanel projectId={p.projectId} api={p.api} readOnly={ro} pw={pw} refreshKey={reviewKey} />;
  const cacheEl = <CachePanel cache={cache} inUse={pool ? pool.inUse(doc) : new Set()} onChanged={() => undefined} />;
  const projectEl = (
    <aside className="st-insp st-project-pane" aria-label="الصورة">
      <details className="st-sec" open>
        <summary>الصورة</summary>
        <div className="st-sec-body">
          <Segmented
            label="المقاس"
            size="sm"
            value={presetIndex}
            disabled={ro}
            onChange={(i) => i >= 0 && h.apply(setCanvas(doc, { w: PHOTO_PRESETS[i].w, h: PHOTO_PRESETS[i].h }), 'مقاس الصورة')}
            options={[...PHOTO_PRESETS.map((x, i) => ({ value: i, label: x.label })), ...(presetIndex < 0 ? [{ value: -1, label: 'مقاس آخر' }] : [])]}
          />
          {compact ? (
            <DesktopOnly what="مقاس آخر" />
          ) : (
            <>
              <Slider label="العرض" value={W} min={16} max={PHOTO_MAX_SIDE} step={1} unit="px" box disabled={ro} onChange={(v) => h.apply(setCanvas(h.get(), { w: v }), 'مقاس الصورة', 'canvas-w')} />
              <Slider label="الارتفاع" value={H} min={16} max={PHOTO_MAX_SIDE} step={1} unit="px" box disabled={ro} onChange={(v) => h.apply(setCanvas(h.get(), { h: v }), 'مقاس الصورة', 'canvas-h')} />
            </>
          )}
          <Switch label="خلفية شفافة (PNG)" checked={doc.photo?.background === null} disabled={ro} onChange={(on) => h.apply(setCanvas(doc, { background: on ? null : '#ffffff' }), 'الخلفية')} />
          {doc.photo?.background !== null && <ColorInput label="لون الخلفية" value={doc.photo?.background ?? '#ffffff'} disabled={ro} onChange={(v) => h.apply(setCanvas(h.get(), { background: v }), 'لون الخلفية', 'bg')} />}
        </div>
      </details>
      {cacheEl}
    </aside>
  );
  const inspEl = (
    <aside className="st-insp" aria-label={sel ? 'إعدادات الطبقة' : 'إعدادات الصورة'}>
      {sel ? (
        <>
          <div className="st-insp-head">
            <b dir="auto">{layerLabel(doc, sel)}</b>
            {sel.source && sourceNote(pool?.state(sel.source)) && <p className="st-hint st-warn">{sourceNote(pool?.state(sel.source))}</p>}
            <div className="st-insp-acts">
              {sel.pinned ? (
                <button type="button" className="st-pin" data-on="yes" disabled={ro} data-hold={HOLD.studioUnpin} onClick={() => patch((l) => { const n = { ...l }; delete n.pinned; return n; }, 'إلغاء التثبيت')}><Pin aria-hidden="true" />مثبّت في القالب</button>
              ) : (
                <button type="button" className="st-pin" data-on="no" disabled={ro} onClick={() => patch({ pinned: true }, 'تثبيت في القالب')} title="لا تُسحب ولا تُحذف خطأً حتى يُلغى تثبيتها بضغطة مطولة"><Pin aria-hidden="true" />تثبيت</button>
              )}
              <button type="button" onClick={duplicate} disabled={ro} title={`تكرار (${keysOf('duplicate')})`}><Copy aria-hidden="true" />تكرار</button>
              <button type="button" onClick={remove} disabled={ro || sel.locked || !!sel.pinned} title="حذف (Delete)"><Trash2 aria-hidden="true" />حذف</button>
              {!compact && (
                <>
                  <button type="button" onClick={() => align('start')} disabled={ro} aria-label="محاذاة إلى اليمين" title="محاذاة إلى اليمين"><AlignRight aria-hidden="true" /></button>
                  <button type="button" onClick={() => align('centerX')} disabled={ro} aria-label="توسيط أفقي" title="توسيط أفقي"><AlignCenter aria-hidden="true" /></button>
                  <button type="button" onClick={() => align('end')} disabled={ro} aria-label="محاذاة إلى اليسار" title="محاذاة إلى اليسار"><AlignLeft aria-hidden="true" /></button>
                  <button type="button" onClick={() => align('centerY')} disabled={ro} title="توسيط عمودي">وسط عمودي</button>
                </>
              )}
            </div>
          </div>
          {sel.text && (
            <details className="st-sec" open>
              <summary>النص</summary>
              <div className="st-sec-body">
                <TextControls style={sel.text} timed={false} disabled={ro || !!sel.locked} onChange={(s, l, k2) => patch({ text: s }, l, k2)} />
              </div>
            </details>
          )}
          {sel.motion && (
            <details className="st-sec" open>
              <summary>القالب</summary>
              <div className="st-sec-body">
                <MotionControls item={sel} ratio={W >= H ? '16:9' : W === H ? '1:1' : '9:16'} timed={false} disabled={ro || !!sel.locked} onParams={(params, l, k2) => patch((x) => ({ ...x, motion: { template: x.motion!.template, params } }), l, k2)} />
              </div>
            </details>
          )}
          {sel.sticker && (
            <details className="st-sec" open>
              <summary>العلامة</summary>
              <div className="st-sec-body">
                <Segmented label="العلامة" size="sm" value={sel.sticker.key} disabled={ro} onChange={(v) => patch({ sticker: { ...sel.sticker!, key: v } }, 'العلامة')} options={STICKERS.map((k2) => ({ value: k2, label: STICKER_LABELS[k2] }))} />
                <ColorInput label="اللون" value={sel.sticker.color} disabled={ro} onChange={(v) => patch({ sticker: { ...sel.sticker!, color: v } }, 'لون العلامة', 'sticker')} />
              </div>
            </details>
          )}
          {sel.cover && (
            <details className="st-sec" open>
              <summary>المنطقة المخفية</summary>
              <div className="st-sec-body">
                <CoverControls cover={sel.cover} W={W} H={H} disabled={ro} onChange={(c, l, k2) => patch({ cover: c }, l, k2)} />
              </div>
            </details>
          )}
          {sel.shape && (
            <details className="st-sec" open>
              <summary>الشكل</summary>
              <div className="st-sec-body">
                <Slider label="العرض" value={Math.round(sel.shape.w)} min={4} max={PHOTO_MAX_SIDE} step={1} unit="px" box disabled={ro} onChange={(v) => patch({ shape: { ...sel.shape!, w: v } }, 'حجم الشكل', 'shape-w')} />
                <Slider label="الارتفاع" value={Math.round(sel.shape.h)} min={2} max={PHOTO_MAX_SIDE} step={1} unit="px" box disabled={ro} onChange={(v) => patch({ shape: { ...sel.shape!, h: v } }, 'حجم الشكل', 'shape-h')} />
                {sel.shape.type !== 'line' && <Switch label="تعبئة" checked={!!sel.shape.fill} disabled={ro} onChange={(on) => patch({ shape: { ...sel.shape!, fill: on ? '#17634b' : null } }, 'تعبئة الشكل')} />}
                {sel.shape.fill && <ColorInput label="لون التعبئة" value={sel.shape.fill} disabled={ro} onChange={(v) => patch({ shape: { ...sel.shape!, fill: v } }, 'لون الشكل', 'shape-fill')} />}
                <Switch label="إطار" checked={!!sel.shape.stroke} disabled={ro} onChange={(on) => patch({ shape: { ...sel.shape!, stroke: on ? '#c9ac70' : null, strokeWidth: on ? Math.max(4, sel.shape!.strokeWidth) : 0 } }, 'إطار الشكل')} />
                {sel.shape.stroke && (
                  <>
                    <ColorInput label="لون الإطار" value={sel.shape.stroke} disabled={ro} onChange={(v) => patch({ shape: { ...sel.shape!, stroke: v } }, 'لون الإطار', 'shape-stroke')} />
                    <Slider label="سماكة الإطار" value={sel.shape.strokeWidth} min={1} max={80} step={1} unit="px" disabled={ro} onChange={(v) => patch({ shape: { ...sel.shape!, strokeWidth: v } }, 'سماكة الإطار', 'shape-sw')} />
                  </>
                )}
                {sel.shape.type === 'rect' && <Slider label="استدارة الزوايا" value={sel.shape.radius} min={0} max={400} step={1} unit="px" disabled={ro} onChange={(v) => patch({ shape: { ...sel.shape!, radius: v } }, 'استدارة الزوايا', 'shape-r')} />}
              </div>
            </details>
          )}
          <details className="st-sec" open>
            <summary>الموضع والحجم</summary>
            <div className="st-sec-body">
              <TransformControls item={sel} W={W} H={H} disabled={ro || !!sel.locked} onChange={(tr, key) => patch({ transform: tr }, 'الموضع والحجم', key)} />
              {compact ? <DesktopOnly what="الدمج" /> : <Segmented label="الدمج" size="sm" value={sel.blend ?? 'normal'} disabled={ro} onChange={(v) => patch({ blend: v }, 'الدمج')} options={BLENDS} />}
              <div className="st-flip">
                <Switch label="قلب أفقي" checked={!!sel.flip?.h} disabled={ro} onChange={(v) => patch({ flip: { h: v, v: !!sel.flip?.v } }, 'قلب أفقي')} />
                <Switch label="قلب عمودي" checked={!!sel.flip?.v} disabled={ro} onChange={(v) => patch({ flip: { h: !!sel.flip?.h, v } }, 'قلب عمودي')} />
              </div>
            </div>
          </details>
          {src?.media === 'image' && (
            <>
              <details className="st-sec">
                <summary>القص</summary>
                <div className="st-sec-body">
                  <CropControls crop={sel.crop} disabled={ro} onChange={(c, key) => patch({ crop: c }, 'القص', key)} />
                </div>
              </details>
              <details className="st-sec" open>
                <summary>الألوان</summary>
                <div className="st-sec-body">
                  {(['brightness', 'contrast', 'saturation', 'warmth', 'blur'] as const).map((k2) => (
                    <Slider
                      key={k2}
                      label={{ brightness: 'السطوع', contrast: 'التباين', saturation: 'التشبع', warmth: 'الدفء', blur: 'التمويه' }[k2]}
                      value={sel.adjust?.[k2] ?? 0}
                      min={k2 === 'blur' ? 0 : -100}
                      max={100}
                      step={1}
                      disabled={ro}
                      onChange={(v) => patch((l) => ({ ...l, adjust: { brightness: 0, contrast: 0, saturation: 0, warmth: 0, blur: 0, ...l.adjust, [k2]: v } }), 'الألوان', `adj-${k2}`)}
                    />
                  ))}
                </div>
              </details>
            </>
          )}
        </>
      ) : (
        <div className="st-insp-empty">
          <MousePointerClick aria-hidden="true" />
          <b>لا طبقة محددة</b>
          <p>حدد طبقة على الصورة أو في «الطبقات» لترى إعداداتها. مقاس الصورة وخلفيتها في نافذة «المشروع».</p>
        </div>
      )}
    </aside>
  );
  const uploadEl = uploading && (
    <UploadDialog
      file={uploading}
      onClose={() => setUploading(null)}
      onDone={(row) => {
        setUploading(null);
        addLibrary({ id: row.id, name: row.name, kind: 'image', current_version: row.current_version, mime_type: row.mime_type, dims: row.dims, duration: row.duration });
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
      <div className="st-editor st-photo" data-readonly={ro ? 'yes' : 'no'} data-compact="yes" data-chrome="light">
        {errorEl}
        {stageEl}
        <PanelTabs value={panel} onChange={setPanel} panels={[{ id: 'timeline', label: 'الطبقات' }, { id: 'add', label: 'إضافة' }, { id: 'settings', label: 'الإعدادات' }, { id: 'export', label: 'التصدير' }]} />
        {panel === 'timeline' && layersEl}
        {panel === 'add' && <Bin {...binProps} />}
        {panel === 'settings' && (sel ? inspEl : <>{projectEl}<aside className="st-insp">{reviewEl}</aside></>)}
        {panel === 'export' && exportEl}
        {uploadEl}
      </div>
    );

  const menus: Menu[] = [
    {
      id: 'file',
      label: 'ملف',
      items: [
        { label: 'حفظ نسخة مرقّمة…', icon: <Save aria-hidden="true" />, keys: keysOf('save-version'), disabled: ro || !p.onRequestVersion, onSelect: () => p.onRequestVersion?.() },
        { label: 'إعادة تسمية المشروع…', icon: <Pencil aria-hidden="true" />, keys: keysOf('rename'), disabled: ro || !p.onRequestRename, onSelect: () => p.onRequestRename?.() },
        { label: 'التصدير…', icon: <FileOutput aria-hidden="true" />, keys: keysOf('export'), onSelect: () => run('export') },
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
        { label: 'قص إلى الحافظة', icon: <Scissors aria-hidden="true" />, keys: keysOf('cut'), disabled: ro || !sel || !!sel.locked, onSelect: cut },
        { label: 'نسخ', icon: <Copy aria-hidden="true" />, keys: keysOf('copy'), disabled: !sel, onSelect: copy },
        { label: 'لصق', icon: <ClipboardPaste aria-hidden="true" />, keys: keysOf('paste'), disabled: ro || !studioClipboard.get(), onSelect: paste },
        { label: 'تكرار', icon: <Copy aria-hidden="true" />, keys: keysOf('duplicate'), disabled: ro || !sel, onSelect: duplicate },
        { label: 'حذف', icon: <Trash2 aria-hidden="true" />, keys: 'Delete', disabled: ro || !sel || !!sel.locked, onSelect: remove },
        { label: 'إلغاء التحديد', icon: <XCircle aria-hidden="true" />, keys: 'Esc', disabled: !sel, onSelect: () => setSelected(null) },
      ],
    },
    {
      id: 'layer',
      label: 'الطبقة',
      items: [
        { label: 'إلى الأمام', icon: <ArrowUp aria-hidden="true" />, keys: keysOf('forward'), disabled: ro || !sel, onSelect: () => order('up') },
        { label: 'إلى الخلف', icon: <ArrowDown aria-hidden="true" />, keys: keysOf('backward'), disabled: ro || !sel, onSelect: () => order('down') },
        { label: 'إلى المقدمة', icon: <ChevronsUp aria-hidden="true" />, keys: keysOf('to-front'), disabled: ro || !sel, onSelect: () => order('top') },
        { label: 'إلى الخلفية', icon: <ChevronsDown aria-hidden="true" />, keys: keysOf('to-back'), disabled: ro || !sel, onSelect: () => order('bottom') },
        { kind: 'sep' },
        { label: sel?.locked ? 'فتح القفل' : 'قفل الطبقة', icon: <Lock aria-hidden="true" />, disabled: ro || !sel, onSelect: () => patch({ locked: !sel?.locked }, 'قفل الطبقة') },
        { label: sel?.hidden ? 'إظهار الطبقة' : 'إخفاء الطبقة', icon: <EyeOff aria-hidden="true" />, disabled: ro || !sel, onSelect: () => patch({ hidden: !sel?.hidden }, 'إظهار الطبقة') },
        { kind: 'sep' },
        {
          label: 'الأداة',
          icon: <MousePointer2 aria-hidden="true" />,
          items: [
            { label: 'التحديد', checked: tool === 'select', keys: keysOf('tool-select'), onSelect: () => setTool('select') },
            { label: 'النص', checked: tool === 'text', keys: keysOf('tool-text'), onSelect: () => setTool('text') },
          ],
        },
      ],
    },
    {
      id: 'view',
      label: 'عرض',
      items: [
        { label: 'ملء نافذة المتصفح', keys: keysOf('full-window'), checked: full, onSelect: () => setFull(!full) },
        { label: 'محرر داكن', icon: <Moon aria-hidden="true" />, checked: chrome === 'dark', onSelect: () => setChrome(chrome === 'dark' ? 'light' : 'dark') },
      ],
    },
  ];
  const panels = panelSpecs('photo', {
    media: <MediaPane {...binProps} />,
    templates: <TemplatesPane {...binProps} />,
    graphics: <GraphicsPane {...binProps} />,
    layers: layersEl,
    program: stageEl,
    inspector: inspEl,
    project: projectEl,
    export: exportEl,
    review: <aside className="st-insp st-review-pane">{reviewEl}</aside>,
    history: <HistoryPanel hist={h.hist} onGo={h.go} readOnly={ro} />,
    versions: <VersionsPanel projectId={p.projectId} api={p.api} readOnly={ro} doc={doc} revision={p.revision} saveVersion={p.saveVersion} onApply={(d, label) => h.apply(d, label)} label={(d, item) => (item as Layer).name || plainLabel(d, item)} refreshKey={p.revision()} />,
  });

  return (
    <SwatchContext.Provider value={brand.colors}>
      <div className="st-editor st-photo" data-readonly={ro ? 'yes' : 'no'} data-compact="no" data-chrome={chrome} data-full={full ? 'yes' : 'no'}>
        {errorEl}
        <EditorFrame frame={frame} menus={menus} panels={panels} full={full} onFull={() => setFull(!full)} chrome={chrome} onChrome={() => setChrome(chrome === 'dark' ? 'light' : 'dark')}>
          {uploadEl}
        </EditorFrame>
      </div>
    </SwatchContext.Provider>
  );
}

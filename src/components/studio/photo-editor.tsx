'use client';

// The photo editor (MVP_draft.md 62): one canvas of layers (pictures, text, shapes, motion templates at
// their settled moment, brand marks), drawn by the shared compositor. Layers are moved on the canvas,
// ordered, hidden, locked, duplicated and deleted; pictures are cropped, flipped, blended and adjusted
// by the pixel functions in a worker. The same undo history, device cache, media panel and export panel
// as the video editor.
import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { ArrowDown, ArrowUp, Copy, Eye, EyeOff, Lock, Trash2, Unlock, Redo2, Undo2, AlignCenter, AlignLeft, AlignRight } from 'lucide-react';
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
import { historyKey, redoLabel, undoLabel } from '@/lib/studio/history';
import { ColorInput, Segmented, Slider, Switch } from '../motion-controls';
import { Bin, type LibraryItem } from './bin';
import { CachePanel } from './cache-panel';
import { DesktopOnly, PanelTabs, useCompact, type Panel } from './compact';
import { ExportPanel } from './export-panel';
import { CropControls, MotionControls, TextControls, TransformControls } from './inspector';
import { librarySource } from './library';
import type { EditorProps } from './project-shell';
import { drawOutline } from './stage';
import { UploadDialog, sourceNote, useDocHistory, useExactSources, useStudioAssets, useStudioMedia } from './editor';
import '../motion-studio.css';
import './editor.css';

export function layerLabel(doc: ProjectDoc, l: Layer): string {
  if (l.name) return l.name;
  if (l.text) return l.text.content.split('\n')[0] || 'نص';
  if (l.motion) return graphicById(l.motion.template)?.name ?? 'قالب حركة';
  if (l.sticker) return STICKER_LABELS[l.sticker.key];
  if (l.shape) return l.shape.type === 'ellipse' ? 'دائرة' : l.shape.type === 'line' ? 'خط' : 'مستطيل';
  return doc.sources.find((s) => s.id === l.source)?.name ?? 'صورة';
}

const BLENDS = [
  { value: 'normal' as const, label: 'عادي' },
  { value: 'multiply' as const, label: 'ضرب' },
  { value: 'screen' as const, label: 'تفتيح' },
];

export function PhotoEditor(p: EditorProps) {
  const account = useAccount();
  const canLibrary = canOpen(account, 'media');
  const h = useDocHistory(p);
  const doc = h.doc;
  const { w: W, h: H } = canvasOf(doc);
  const { cache, pool, tick, cacheReady } = useStudioMedia(doc);
  useExactSources(doc, pool, tick, h.quiet);
  const assetsReady = useStudioAssets();
  const motion = useMemo(() => new MotionRenderer(), []);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [size, setSize] = useState({ w: 400, h: 400 });
  const [uploading, setUploading] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const compact = useCompact();
  const [panel, setPanel] = useState<Panel>('timeline');
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

  const resolver = useMemo<Resolver>(
    () => ({
      motion,
      image: (id) => pool?.image(id) ?? null,
      videoFrame: () => null,
      adjusted: (item) => {
        const a = adjusted.get(item.id);
        return a && a.key === `${item.source}|${JSON.stringify(item.adjust)}` ? a.canvas : null;
      },
    }),
    [motion, pool, adjusted],
  );

  // the canvas fits its box with the photo's proportions
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const fit = () => {
      const r = el.getBoundingClientRect();
      const maxH = Math.max(220, window.innerHeight * 0.62);
      const k = Math.min((r.width - 20) / W, maxH / H);
      setSize({ w: Math.max(1, Math.floor(W * k)), h: Math.max(1, Math.floor(H * k)) });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [W, H]);

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
  }, [doc, size, W, H, resolver, sel, tick, assetsReady]);

  // ------------------------------------------------------------- adding
  const put = (d: ProjectDoc, layer: Parameters<typeof addLayer>[1], label: string) => {
    const r = addLayer(d, layer);
    h.apply(r.doc, label);
    setSelected(r.id);
  };
  const addLibrary = (item: LibraryItem) => {
    const r = addSource(doc, librarySource(item));
    put(r.doc, { source: r.id, fit: 'contain' }, 'إضافة صورة من المكتبة');
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
  const addMotion = (g: Graphic) => put(doc, { motion: { template: g.id, params: {} } }, 'إضافة قالب حركة');
  const addText = (kind: 'title' | 'body' | 'caption') =>
    put(doc, { text: kind === 'title' ? { ...defaultText('عنوان'), size: Math.round(W / 10), weight: 700, enter: 'none', exit: 'none' } : { ...defaultText('نص'), size: Math.round(W / 18), weight: 500, enter: 'none', exit: 'none' } }, 'إضافة نص');
  const addMark = (key: StickerKey, color: string) => put(doc, { sticker: { key, color }, transform: { x: W * 0.78, y: H * 0.12, scale: 0.6, rotation: 0, opacity: 1 } }, 'إضافة علامة الهوية');
  const addShape = (type: Shape['type']) =>
    put(doc, { shape: { type, w: type === 'line' ? W * 0.5 : W * 0.4, h: type === 'line' ? 8 : W * 0.25, fill: type === 'line' ? null : '#17634b', stroke: type === 'line' ? '#c9ac70' : null, strokeWidth: type === 'line' ? 8 : 0, radius: 24 } }, 'إضافة شكل');

  // ------------------------------------------------------------- editing
  const patch = (pt: Partial<Layer> | ((l: Layer) => Layer), label: string, key?: string) => selected && h.apply(updateLayer(h.get(), selected, pt), label, key ? `${key}-${selected}` : null);
  const remove = () => {
    if (!selected) return;
    h.apply(removeLayer(doc, selected), 'حذف الطبقة');
    setSelected(null);
  };
  const duplicate = () => {
    if (!selected) return;
    const r = duplicateLayer(doc, selected);
    if (r.id) {
      h.apply(r.doc, 'نسخ الطبقة');
      setSelected(r.id);
    }
  };
  const align = (how: Parameters<typeof alignLayer>[2]) => {
    if (!sel) return;
    const b = boxOf(doc, sel, resolver, canvasRef.current?.getContext('2d') ?? null);
    if (b) h.apply(alignLayer(doc, sel.id, how, { w: b.w, h: b.h }), 'محاذاة الطبقة');
  };

  // dragging a layer on the canvas
  const drag = useRef<{ id: string; x0: number; y0: number; cx: number; cy: number; key: string } | null>(null);
  const toCanvas = (e: RPointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  };
  const down = (e: RPointerEvent<HTMLCanvasElement>) => {
    const pt = toCanvas(e);
    const id = pick(doc, pt.x, pt.y, null, resolver, canvasRef.current!.getContext('2d'));
    setSelected(id);
    if (!id || p.readOnly) return;
    const l = layers.find((x) => x.id === id)!;
    const tr = transformOf(l, W, H);
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id, x0: pt.x, y0: pt.y, cx: tr.x, cy: tr.y, key: `place-${id}-${Date.now()}` };
  };
  const move = (e: RPointerEvent<HTMLCanvasElement>) => {
    const d = drag.current;
    if (!d) return;
    const pt = toCanvas(e);
    let x = d.cx + (pt.x - d.x0);
    let y = d.cy + (pt.y - d.y0);
    if (Math.abs(x - W / 2) < W * 0.015) x = W / 2;
    if (Math.abs(y - H / 2) < H * 0.015) y = H / 2;
    h.apply(updateLayer(h.get(), d.id, (l) => ({ ...l, transform: { ...l.transform, x: Math.round(x), y: Math.round(y) } })), 'نقل الطبقة', d.key);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable)) return;
      if (target?.closest('dialog')) return;
      const hk = historyKey(e, target);
      if (hk) {
        e.preventDefault();
        if (hk === 'undo') h.undo();
        else h.redo();
        return;
      }
      if (!sel) return;
      if (e.key === 'Delete' || e.key === 'Backspace') remove();
      else if ((e.ctrlKey || e.metaKey) && (e.key === 'd' || e.code === 'KeyD')) {
        e.preventDefault();
        duplicate();
      } else if (e.key.startsWith('Arrow') && !sel.locked) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        h.apply(updateLayer(doc, sel.id, (l) => ({ ...l, transform: { ...l.transform, x: l.transform.x + dx, y: l.transform.y + dy } })), 'تحريك الطبقة', `nudge-${sel.id}`);
      } else if (e.key === 'Escape') setSelected(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const src = sel?.source ? doc.sources.find((s) => s.id === sel.source) : undefined;
  const presetIndex = PHOTO_PRESETS.findIndex((x) => x.w === W && x.h === H);

  const binEl = (
        <Bin
          ratio={W >= H ? '16:9' : '9:16'}
          photo
          readOnly={p.readOnly}
          canLibrary={canLibrary}
          canDevice={cacheReady && !!cache}
          onLibrary={addLibrary}
          onDevice={(f, up) => void addDevice(f, up)}
          onMotion={addMotion}
          onText={addText}
          onMark={addMark}
          onShape={addShape}
          assetsReady={assetsReady}
          compact={compact}
        />
  );
  const stageEl = (
          <section className="st-stage" aria-label="الصورة">
            <div className="st-tl-bar">
              <button type="button" onClick={h.undo} disabled={p.readOnly || !h.hist.past.length} title={undoLabel(h.hist)} aria-label={undoLabel(h.hist)}>
                <Undo2 aria-hidden="true" />
              </button>
              <button type="button" onClick={h.redo} disabled={p.readOnly || !h.hist.future.length} title={redoLabel(h.hist)} aria-label={redoLabel(h.hist)}>
                <Redo2 aria-hidden="true" />
              </button>
              <span className="st-hint">
                <bdi dir="ltr">{W}×{H}</bdi>
              </span>
            </div>
            <div className="st-stage-box st-photo-box" ref={boxRef}>
              <canvas
                ref={canvasRef}
                className="st-canvas"
                style={{ width: size.w, height: size.h }}
                onPointerDown={down}
                onPointerMove={move}
                onPointerUp={() => (drag.current = null)}
                onPointerCancel={() => (drag.current = null)}
                role="img"
                aria-label={`الصورة ${W} في ${H}`}
              />
              {!assetsReady && <div className="st-stage-wait" role="status">جارٍ تجهيز القوالب والخطوط…</div>}
            </div>
          </section>
  );
  const layersEl = (
          <section className="st-layers" aria-label="الطبقات">
            <h2>الطبقات</h2>
            {layers.length === 0 ? (
              <p className="st-hint">أضف صورة أو نصاً أو شكلاً من لوحة الوسائط.</p>
            ) : (
              <ol>
                {[...layers].reverse().map((l) => (
                  <li key={l.id} data-selected={l.id === selected ? 'yes' : 'no'} data-layer={l.id}>
                    <button type="button" className="st-layer-name" onClick={() => setSelected(l.id)} dir="auto">
                      {layerLabel(doc, l)}
                    </button>
                    <span className="st-layer-acts">
                      <button type="button" aria-label={l.hidden ? 'إظهار' : 'إخفاء'} title={l.hidden ? 'إظهار' : 'إخفاء'} disabled={p.readOnly} onClick={() => h.apply(updateLayer(doc, l.id, { hidden: !l.hidden }), 'إظهار الطبقة')}>
                        {l.hidden ? <EyeOff /> : <Eye />}
                      </button>
                      <button type="button" aria-label={l.locked ? 'فتح القفل' : 'قفل'} title={l.locked ? 'فتح القفل' : 'قفل'} disabled={p.readOnly} onClick={() => h.apply(updateLayer(doc, l.id, { locked: !l.locked }), 'قفل الطبقة')}>
                        {l.locked ? <Lock /> : <Unlock />}
                      </button>
                      <button type="button" aria-label="إلى الأعلى" title="إلى الأعلى" disabled={p.readOnly} onClick={() => h.apply(moveLayer(doc, l.id, 'up'), 'ترتيب الطبقات')}>
                        <ArrowUp />
                      </button>
                      <button type="button" aria-label="إلى الأسفل" title="إلى الأسفل" disabled={p.readOnly} onClick={() => h.apply(moveLayer(doc, l.id, 'down'), 'ترتيب الطبقات')}>
                        <ArrowDown />
                      </button>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>
  );
  const exportEl = <ExportPanel doc={doc} pool={pool} t={0} projectId={p.projectId} title={p.title} readOnly={p.readOnly} canLibrary={canLibrary} api={p.api} saveVersion={p.saveVersion} revision={p.revision} photo adjusted={resolver.adjusted} />;
  const inspEl = (
        <aside className="st-insp" aria-label={sel ? 'إعدادات الطبقة' : 'إعدادات الصورة'}>
          {sel ? (
            <>
              <div className="st-insp-head">
                <b dir="auto">{layerLabel(doc, sel)}</b>
                {sel.source && sourceNote(pool?.state(sel.source)) && <p className="st-hint st-warn">{sourceNote(pool?.state(sel.source))}</p>}
                <div className="st-insp-acts">
                  <button type="button" onClick={duplicate} disabled={p.readOnly} title="نسخ (Ctrl+D)"><Copy aria-hidden="true" />نسخ</button>
                  <button type="button" onClick={remove} disabled={p.readOnly || sel.locked} title="حذف (Delete)"><Trash2 aria-hidden="true" />حذف</button>
                  {!compact && (
                    <>
                  <button type="button" onClick={() => align('start')} disabled={p.readOnly} aria-label="محاذاة إلى اليمين" title="محاذاة إلى اليمين"><AlignRight aria-hidden="true" /></button>
                  <button type="button" onClick={() => align('centerX')} disabled={p.readOnly} aria-label="توسيط أفقي" title="توسيط أفقي"><AlignCenter aria-hidden="true" /></button>
                  <button type="button" onClick={() => align('end')} disabled={p.readOnly} aria-label="محاذاة إلى اليسار" title="محاذاة إلى اليسار"><AlignLeft aria-hidden="true" /></button>
                  <button type="button" onClick={() => align('centerY')} disabled={p.readOnly} title="توسيط عمودي">وسط عمودي</button>
                    </>
                  )}
                </div>
              </div>
              {sel.text && (
                <details className="st-sec" open>
                  <summary>النص</summary>
                  <div className="st-sec-body">
                    <TextControls style={sel.text} timed={false} disabled={p.readOnly || !!sel.locked} onChange={(s, l, k) => patch({ text: s }, l, k)} />
                  </div>
                </details>
              )}
              {sel.motion && (
                <details className="st-sec" open>
                  <summary>القالب</summary>
                  <div className="st-sec-body">
                    <MotionControls item={sel} ratio={W >= H ? '16:9' : W === H ? '1:1' : '9:16'} timed={false} disabled={p.readOnly || !!sel.locked} onParams={(params, l, k) => patch((x) => ({ ...x, motion: { template: x.motion!.template, params } }), l, k)} />
                  </div>
                </details>
              )}
              {sel.sticker && (
                <details className="st-sec" open>
                  <summary>العلامة</summary>
                  <div className="st-sec-body">
                    <Segmented label="العلامة" size="sm" value={sel.sticker.key} disabled={p.readOnly} onChange={(v) => patch({ sticker: { ...sel.sticker!, key: v } }, 'العلامة')} options={STICKERS.map((k) => ({ value: k, label: STICKER_LABELS[k] }))} />
                    <ColorInput label="اللون" value={sel.sticker.color} disabled={p.readOnly} onChange={(v) => patch({ sticker: { ...sel.sticker!, color: v } }, 'لون العلامة', 'sticker')} />
                  </div>
                </details>
              )}
              {sel.shape && (
                <details className="st-sec" open>
                  <summary>الشكل</summary>
                  <div className="st-sec-body">
                    <Slider label="العرض" value={Math.round(sel.shape.w)} min={4} max={PHOTO_MAX_SIDE} step={1} unit="px" box disabled={p.readOnly} onChange={(v) => patch({ shape: { ...sel.shape!, w: v } }, 'حجم الشكل', 'shape-w')} />
                    <Slider label="الارتفاع" value={Math.round(sel.shape.h)} min={2} max={PHOTO_MAX_SIDE} step={1} unit="px" box disabled={p.readOnly} onChange={(v) => patch({ shape: { ...sel.shape!, h: v } }, 'حجم الشكل', 'shape-h')} />
                    {sel.shape.type !== 'line' && <Switch label="تعبئة" checked={!!sel.shape.fill} disabled={p.readOnly} onChange={(on) => patch({ shape: { ...sel.shape!, fill: on ? '#17634b' : null } }, 'تعبئة الشكل')} />}
                    {sel.shape.fill && <ColorInput label="لون التعبئة" value={sel.shape.fill} disabled={p.readOnly} onChange={(v) => patch({ shape: { ...sel.shape!, fill: v } }, 'لون الشكل', 'shape-fill')} />}
                    <Switch label="إطار" checked={!!sel.shape.stroke} disabled={p.readOnly} onChange={(on) => patch({ shape: { ...sel.shape!, stroke: on ? '#c9ac70' : null, strokeWidth: on ? Math.max(4, sel.shape!.strokeWidth) : 0 } }, 'إطار الشكل')} />
                    {sel.shape.stroke && (
                      <>
                        <ColorInput label="لون الإطار" value={sel.shape.stroke} disabled={p.readOnly} onChange={(v) => patch({ shape: { ...sel.shape!, stroke: v } }, 'لون الإطار', 'shape-stroke')} />
                        <Slider label="سماكة الإطار" value={sel.shape.strokeWidth} min={1} max={80} step={1} unit="px" disabled={p.readOnly} onChange={(v) => patch({ shape: { ...sel.shape!, strokeWidth: v } }, 'سماكة الإطار', 'shape-sw')} />
                      </>
                    )}
                    {sel.shape.type === 'rect' && <Slider label="استدارة الزوايا" value={sel.shape.radius} min={0} max={400} step={1} unit="px" disabled={p.readOnly} onChange={(v) => patch({ shape: { ...sel.shape!, radius: v } }, 'استدارة الزوايا', 'shape-r')} />}
                  </div>
                </details>
              )}
              <details className="st-sec" open>
                <summary>الموضع والحجم</summary>
                <div className="st-sec-body">
                  <TransformControls item={sel} W={W} H={H} disabled={p.readOnly || !!sel.locked} onChange={(tr, key) => patch({ transform: tr }, 'الموضع والحجم', key)} />
                  {compact ? <DesktopOnly what="الدمج" /> : <Segmented label="الدمج" size="sm" value={sel.blend ?? 'normal'} disabled={p.readOnly} onChange={(v) => patch({ blend: v }, 'الدمج')} options={BLENDS} />}
                  <div className="st-flip">
                    <Switch label="قلب أفقي" checked={!!sel.flip?.h} disabled={p.readOnly} onChange={(v) => patch({ flip: { h: v, v: !!sel.flip?.v } }, 'قلب أفقي')} />
                    <Switch label="قلب عمودي" checked={!!sel.flip?.v} disabled={p.readOnly} onChange={(v) => patch({ flip: { h: !!sel.flip?.h, v } }, 'قلب عمودي')} />
                  </div>
                </div>
              </details>
              {src?.media === 'image' && (
                <>
                  <details className="st-sec">
                    <summary>القص</summary>
                    <div className="st-sec-body">
                      <CropControls crop={sel.crop} disabled={p.readOnly} onChange={(c, key) => patch({ crop: c }, 'القص', key)} />
                    </div>
                  </details>
                  <details className="st-sec" open>
                    <summary>الألوان</summary>
                    <div className="st-sec-body">
                      {(['brightness', 'contrast', 'saturation', 'warmth', 'blur'] as const).map((k) => (
                        <Slider
                          key={k}
                          label={{ brightness: 'السطوع', contrast: 'التباين', saturation: 'التشبع', warmth: 'الدفء', blur: 'التمويه' }[k]}
                          value={sel.adjust?.[k] ?? 0}
                          min={k === 'blur' ? 0 : -100}
                          max={100}
                          step={1}
                          disabled={p.readOnly}
                          onChange={(v) => patch((l) => ({ ...l, adjust: { brightness: 0, contrast: 0, saturation: 0, warmth: 0, blur: 0, ...l.adjust, [k]: v } }), 'الألوان', `adj-${k}`)}
                        />
                      ))}
                    </div>
                  </details>
                </>
              )}
            </>
          ) : (
            <>
              <details className="st-sec" open>
                <summary>الصورة</summary>
                <div className="st-sec-body">
                  <Segmented
                    label="المقاس"
                    size="sm"
                    value={presetIndex}
                    disabled={p.readOnly}
                    onChange={(i) => i >= 0 && h.apply(setCanvas(doc, { w: PHOTO_PRESETS[i].w, h: PHOTO_PRESETS[i].h }), 'مقاس الصورة')}
                    options={[...PHOTO_PRESETS.map((x, i) => ({ value: i, label: x.label })), ...(presetIndex < 0 ? [{ value: -1, label: 'مقاس آخر' }] : [])]}
                  />
                  {compact ? (
                    <DesktopOnly what="مقاس آخر" />
                  ) : (
                    <>
                      <Slider label="العرض" value={W} min={16} max={PHOTO_MAX_SIDE} step={1} unit="px" box disabled={p.readOnly} onChange={(v) => h.apply(setCanvas(h.get(), { w: v }), 'مقاس الصورة', 'canvas-w')} />
                      <Slider label="الارتفاع" value={H} min={16} max={PHOTO_MAX_SIDE} step={1} unit="px" box disabled={p.readOnly} onChange={(v) => h.apply(setCanvas(h.get(), { h: v }), 'مقاس الصورة', 'canvas-h')} />
                    </>
                  )}
                  <Switch label="خلفية شفافة (PNG)" checked={doc.photo?.background === null} disabled={p.readOnly} onChange={(on) => h.apply(setCanvas(doc, { background: on ? null : '#ffffff' }), 'الخلفية')} />
                  {doc.photo?.background !== null && <ColorInput label="لون الخلفية" value={doc.photo?.background ?? '#ffffff'} disabled={p.readOnly} onChange={(v) => h.apply(setCanvas(h.get(), { background: v }), 'لون الخلفية', 'bg')} />}
                </div>
              </details>
              <CachePanel cache={cache} inUse={pool ? pool.inUse(doc) : new Set()} onChanged={() => undefined} />
            </>
          )}
        </aside>
  );

  return (
    <div className="st-editor st-photo" data-readonly={p.readOnly ? 'yes' : 'no'} data-compact={compact ? 'yes' : 'no'}>
      {error && (
        <p className="warning st-err" role="alert">
          {error}
          <button type="button" onClick={() => setError(null)} aria-label="إغلاق">×</button>
        </p>
      )}
      {compact ? (
        <>
          {stageEl}
          <PanelTabs value={panel} onChange={setPanel} panels={[{ id: 'timeline', label: 'الطبقات' }, { id: 'add', label: 'إضافة' }, { id: 'settings', label: 'الإعدادات' }, { id: 'export', label: 'التصدير' }]} />
          {panel === 'timeline' && layersEl}
          {panel === 'add' && binEl}
          {panel === 'settings' && inspEl}
          {panel === 'export' && exportEl}
        </>
      ) : (
        <div className="st-work">
          {binEl}
          <div className="st-center">
            {stageEl}
            {layersEl}
            {exportEl}
          </div>
          {inspEl}
        </div>
      )}
      {uploading && (
        <UploadDialog
          file={uploading}
          onClose={() => setUploading(null)}
          onDone={(row) => {
            setUploading(null);
            addLibrary({ id: row.id, name: row.name, kind: 'image', current_version: row.current_version, mime_type: row.mime_type, dims: row.dims, duration: row.duration });
          }}
        />
      )}
    </div>
  );
}

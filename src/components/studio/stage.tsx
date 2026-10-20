'use client';

// The studio's preview, «المعاينة» (MVP_draft.md 62, 62.5): the project's frame drawn by the shared
// compositor, at the preview resolution chosen for playing and for pausing (full down to 1/32, as in
// desktop editors, so a slow computer plays smoothly); the transport; Reels safe zones; the selected
// clip's outline with handles to move it, scale it from a corner and turn it; the text tool (a click adds
// a text there); things dragged from the other windows are dropped here at the playhead.
import { useEffect, useRef, useState, type DragEvent, type PointerEvent as RPointerEvent } from 'react';
import { ChevronsLeft, ChevronsRight, Gauge, Pause, Play, ScanLine, SkipBack, SkipForward, StepBack, StepForward } from 'lucide-react';
import { canvasOf, durationOf, type Clip, type Layer, type Micros, type ProjectDoc, type Transform } from '@/lib/studio/schema';
import { boxOf, pick, transformAt, type Resolver } from '@/lib/studio/compose';
import { canvasWidth, dragHandle, handleAt, resolutionLabel, RESOLUTIONS, snapCentre, ROTATE_GAP_PX, HANDLE_PX, type Handle } from '@/lib/studio/handles';
import { withKeys } from '@/lib/studio/shortcuts';
import { frameUs, timecode } from '@/lib/studio/time';
import { drawSafeZones } from '@/lib/motion/preview.js';
import type { Player } from '@/lib/studio/preview';
import { ADD_MIME, type AddDrop } from './bin';
import { EFFECT_MIME } from './effects-panel';

export type Resolution = { play: number; pause: number };
export type Tool = 'select' | 'razor' | 'hand' | 'text';

/** The selected item's outline at time t (a keyframed clip moves): corners to scale it, a round handle to turn it. */
export function drawOutline(ctx: CanvasRenderingContext2D, doc: ProjectDoc, item: Clip | Layer | null, res: Resolver, scale: number, t: Micros | null = null) {
  if (!item) return;
  const b = boxOf(doc, item, res, ctx, t);
  if (!b) return;
  // handles keep their size on screen whatever the canvas resolution
  const css = ctx.canvas.clientWidth || ctx.canvas.width;
  const px = ctx.canvas.width / css;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.translate(b.cx * scale, b.cy * scale);
  ctx.rotate((b.rotation * Math.PI) / 180);
  const w = b.w * scale;
  const h = b.h * scale;
  ctx.strokeStyle = '#d9ad4f';
  ctx.lineWidth = 1.5 * px;
  ctx.setLineDash([7 * px, 5 * px]);
  ctx.strokeRect(-w / 2, -h / 2, w, h);
  ctx.setLineDash([]);
  const gap = ROTATE_GAP_PX * px;
  ctx.beginPath();
  ctx.moveTo(0, -h / 2);
  ctx.lineTo(0, -h / 2 - gap);
  ctx.stroke();
  const s = HANDLE_PX * px;
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#b8892b';
  for (const [x, y] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    ctx.beginPath();
    ctx.rect((x * w) / 2 - s / 2, (y * h) / 2 - s / 2, s, s);
    ctx.fill();
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(0, -h / 2 - gap, s * 0.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/** Reads what was dragged in from the other windows, or null. */
export function readAddDrop(e: DragEvent): AddDrop | null {
  try {
    const raw = e.dataTransfer.getData(ADD_MIME);
    return raw ? (JSON.parse(raw) as AddDrop) : null;
  } catch {
    return null;
  }
}

export function ResolutionMenu({ value, onChange, photo }: { value: Resolution; onChange: (r: Resolution) => void; photo?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const off = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('pointerdown', off, true);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('pointerdown', off, true);
      window.removeEventListener('keydown', esc);
    };
  }, [open]);
  const lowered = value.play < 1 || value.pause < 1;
  return (
    <div className="st-res" ref={ref}>
      <button type="button" className="st-mon-btn" data-on={lowered ? 'yes' : 'no'} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((v) => !v)} title="دقة المعاينة: أقل يعني تشغيلاً أسلس على الأجهزة البطيئة، والتصدير بدقته الكاملة دائماً">
        <Gauge aria-hidden="true" />
        <span>{photo ? resolutionLabel(value.pause) : value.play === value.pause ? resolutionLabel(value.play) : `${resolutionLabel(value.play)} / ${resolutionLabel(value.pause)}`}</span>
      </button>
      {open && (
        <div className="st-menu st-res-pop" role="dialog" aria-label="دقة المعاينة">
          {!photo && (
            <>
              <span className="st-menu-label">أثناء التشغيل</span>
              <div className="st-res-row" role="radiogroup" aria-label="الدقة أثناء التشغيل">
                {RESOLUTIONS.map((r) => (
                  <button key={r.label} type="button" role="radio" aria-checked={Math.abs(value.play - r.value) < 1e-6} data-on={Math.abs(value.play - r.value) < 1e-6 ? 'yes' : 'no'} onClick={() => onChange({ ...value, play: r.value })}>
                    {r.label}
                  </button>
                ))}
              </div>
            </>
          )}
          <span className="st-menu-label">{photo ? 'دقة المعاينة' : 'عند الإيقاف'}</span>
          <div className="st-res-row" role="radiogroup" aria-label={photo ? 'دقة المعاينة' : 'الدقة عند الإيقاف'}>
            {RESOLUTIONS.map((r) => (
              <button key={r.label} type="button" role="radio" aria-checked={Math.abs(value.pause - r.value) < 1e-6} data-on={Math.abs(value.pause - r.value) < 1e-6 ? 'yes' : 'no'} onClick={() => onChange({ ...value, pause: r.value })}>
                {r.label}
              </button>
            ))}
          </div>
          <p className="st-hint">المعاينة وحدها تتأثر؛ التصدير يُرسم بدقته الكاملة.</p>
        </div>
      )}
    </div>
  );
}

export function Stage({
  doc, player, canvasRef, t, playing, safe, onSafe, selected, readOnly, onSelect, onPlace, onTransform, ready, note, resolution, onResolution, tool, onTextAt, onDropAdd, onDropEffect,
}: {
  doc: ProjectDoc;
  player: Player | null;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  t: Micros;
  playing: boolean;
  safe: boolean;
  onSafe: (v: boolean) => void;
  selected: string | null;
  readOnly: boolean;
  onSelect: (id: string | null) => void;
  /** A drag of the selected clip on the canvas: its new centre, in canvas pixels. */
  onPlace: (id: string, x: number, y: number, key: string) => void;
  /** A drag of a corner or of the turning handle: the clip's new transform. */
  onTransform: (id: string, tr: Transform, key: string) => void;
  ready: boolean;
  note: string | null;
  resolution: Resolution;
  onResolution: (r: Resolution) => void;
  tool: Tool;
  onTextAt: (x: number, y: number) => void;
  onDropAdd: (d: AddDrop) => void;
  onDropEffect?: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const { w: W, h: H } = canvasOf(doc);
  const [size, setSize] = useState({ w: 320, h: 568 });
  const [hover, setHover] = useState<Handle>(null);
  const [dropping, setDropping] = useState(false);
  const fps = doc.video?.fps ?? 30;
  const end = durationOf(doc);

  // the canvas fits its window with the project's proportions
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => {
      const r = el.getBoundingClientRect();
      const avail = Math.max(120, r.height - 16);
      const k = Math.min((r.width - 16) / W, avail / H);
      setSize({ w: Math.max(1, Math.floor(W * k)), h: Math.max(1, Math.floor(H * k)) });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [W, H]);

  // its pixels: the share of its size on screen chosen for playing or pausing
  const frac = playing ? resolution.play : resolution.pause;
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const pw = canvasWidth(W, size.w, window.devicePixelRatio || 1, frac);
    const ph = Math.max(9, Math.round((pw * H) / W));
    if (c.width !== pw || c.height !== ph) {
      c.width = pw;
      c.height = ph;
    }
    if (!playing) player?.draw();
  }, [size, W, H, canvasRef, player, frac, playing]);

  const k = () => (canvasRef.current?.getBoundingClientRect().width ?? size.w) / W;
  const drag = useRef<{ id: string; mode: 'move' | 'scale' | 'rotate'; x0: number; y0: number; cx: number; cy: number; tr: Transform; key: string } | null>(null);
  const toCanvas = (e: { clientX: number; clientY: number }) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  };
  const itemOf = (id: string | null) => (id ? (doc.video?.tracks.flatMap((x) => x.clips).find((c) => c.id === id) ?? null) : null);
  const handleUnder = (pt: { x: number; y: number }): Handle => {
    const item = itemOf(selected);
    if (!item || !player || readOnly || playing) return null;
    const b = boxOf(doc, item, player.resolver(), canvasRef.current?.getContext('2d') ?? null, t);
    return b ? handleAt(b, pt, k()) : null;
  };

  const down = (e: RPointerEvent<HTMLCanvasElement>) => {
    if (!player || e.button !== 0) return;
    const pt = toCanvas(e);
    if (tool === 'text' && !readOnly) return onTextAt(Math.round(pt.x), Math.round(pt.y));
    const h = handleUnder(pt);
    if (h && selected) {
      const item = itemOf(selected)!;
      e.currentTarget.setPointerCapture(e.pointerId);
      drag.current = { id: selected, mode: h, x0: pt.x, y0: pt.y, cx: 0, cy: 0, tr: transformAt(item, t, W, H), key: `${h}-${selected}-${Date.now()}` };
      return;
    }
    const id = pick(doc, pt.x, pt.y, t, player.resolver(), canvasRef.current!.getContext('2d'));
    onSelect(id);
    if (!id || readOnly) return;
    const item = itemOf(id);
    if (!item) return;
    const tr = transformAt(item, t, W, H);
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id, mode: 'move', x0: pt.x, y0: pt.y, cx: tr.x, cy: tr.y, tr, key: `place-${id}-${Date.now()}` };
  };
  const move = (e: RPointerEvent<HTMLCanvasElement>) => {
    const pt = toCanvas(e);
    const d = drag.current;
    if (!d) return setHover(handleUnder(pt));
    if (d.mode === 'move') {
      const s = snapCentre(d.cx + (pt.x - d.x0), d.cy + (pt.y - d.y0), W, H);
      return onPlace(d.id, s.x, s.y, d.key);
    }
    const item = itemOf(d.id);
    if (!item || !player) return;
    const b = boxOf(doc, { ...item, transform: d.tr, keys: undefined }, player.resolver(), canvasRef.current?.getContext('2d') ?? null);
    if (b) onTransform(d.id, dragHandle(d.mode, d.tr, b, { x: d.x0, y: d.y0 }, pt, e.shiftKey), d.key);
  };
  const up = () => {
    drag.current = null;
  };

  const step = (n: number) => player?.seek(t + n * frameUs(fps));
  const cursor = tool === 'text' ? 'text' : hover === 'rotate' ? 'grab' : hover === 'scale' ? 'nwse-resize' : 'default';

  return (
    <section className="st-stage" aria-label="المعاينة">
      <div className="st-mon-head">
        <output className="st-mon-time" dir="ltr" aria-label="الوقت الحالي">
          {timecode(t, fps)}
        </output>
        <span className="st-mon-total" dir="ltr">/ {timecode(end, fps)}</span>
        <span className="st-mon-fill" />
        {doc.video?.ratio === '9:16' && (
          <button type="button" className="st-mon-btn" aria-pressed={safe} data-on={safe ? 'yes' : 'no'} onClick={() => onSafe(!safe)} title={withKeys('مناطق Reels الآمنة', 'safe-zones')}>
            <ScanLine aria-hidden="true" />
            <span>المناطق الآمنة</span>
          </button>
        )}
        <ResolutionMenu value={resolution} onChange={onResolution} />
      </div>
      <div
        className="st-stage-box"
        ref={box}
        data-drop={dropping ? 'yes' : 'no'}
        onDragOver={(e) => {
          if (readOnly || !e.dataTransfer.types.includes(ADD_MIME)) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
          setDropping(true);
        }}
        onDragLeave={() => setDropping(false)}
        onDrop={(e) => {
          setDropping(false);
          if (e.dataTransfer.types.includes(EFFECT_MIME)) return onDropEffect?.();
          const d = readAddDrop(e);
          if (!d || readOnly) return;
          e.preventDefault();
          onDropAdd(d);
        }}
      >
        <canvas
          ref={canvasRef}
          className="st-canvas"
          style={{ width: size.w, height: size.h, cursor }}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          onPointerLeave={() => !drag.current && setHover(null)}
          aria-label={`معاينة المشروع ${W} في ${H}`}
          role="img"
        />
        {frac < 1 && <span className="st-res-badge" aria-hidden="true">{resolutionLabel(frac)}</span>}
        {!ready && <div className="st-stage-wait" role="status">جارٍ تجهيز القوالب والخطوط…</div>}
        {note && <div className="st-stage-note" role="status">{note}</div>}
        {tool === 'text' && !readOnly && <div className="st-stage-tip">أداة النص: انقر حيث تريد العنوان.</div>}
      </div>
      <div className="st-transport" dir="ltr">
        <button type="button" onClick={() => player?.seek(0)} aria-label="إلى البداية" title={withKeys('إلى البداية', 'home')}>
          <SkipBack />
        </button>
        <button type="button" onClick={() => step(-fps)} aria-label="رجوع ثانية" title={withKeys('رجوع ثانية', 'second-back')}>
          <ChevronsLeft />
        </button>
        <button type="button" onClick={() => step(-1)} aria-label="إطار للخلف" title={withKeys('إطار للخلف', 'frame-back')}>
          <StepBack />
        </button>
        <button type="button" className="primary st-play" onClick={() => player?.toggle()} aria-label={playing ? 'إيقاف مؤقت' : 'تشغيل'} title={withKeys('تشغيل وإيقاف', 'play')} disabled={!end}>
          {playing ? <Pause /> : <Play />}
        </button>
        <button type="button" onClick={() => step(1)} aria-label="إطار للأمام" title={withKeys('إطار للأمام', 'frame-forward')}>
          <StepForward />
        </button>
        <button type="button" onClick={() => step(fps)} aria-label="تقدم ثانية" title={withKeys('تقدم ثانية', 'second-forward')}>
          <ChevronsRight />
        </button>
        <button type="button" onClick={() => player?.seek(Number.MAX_SAFE_INTEGER)} aria-label="إلى النهاية" title={withKeys('إلى النهاية', 'end')}>
          <SkipForward />
        </button>
        <output className="st-time">
          {timecode(t, fps)} / {timecode(end, fps)}
        </output>
      </div>
    </section>
  );
}

export { drawSafeZones };

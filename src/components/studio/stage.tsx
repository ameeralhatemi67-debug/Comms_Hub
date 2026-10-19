'use client';

// The studio's preview (MVP_draft.md 62): the project's frame drawn by the shared compositor, the
// transport (play, frame steps, the time), Reels safe zones, and the selected clip's outline, which can
// be dragged to place it. A paused frame comes from the export's own decoder.
import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { ChevronsLeft, ChevronsRight, Pause, Play, SkipBack, StepBack, StepForward } from 'lucide-react';
import { canvasOf, durationOf, type Clip, type Layer, type Micros, type ProjectDoc } from '@/lib/studio/schema';
import { boxOf, pick, transformOf, type Resolver } from '@/lib/studio/compose';
import { frameUs, timecode } from '@/lib/studio/time';
import { drawSafeZones } from '@/lib/motion/preview.js';
import type { Player } from '@/lib/studio/preview';

export function drawOutline(ctx: CanvasRenderingContext2D, doc: ProjectDoc, item: Clip | Layer | null, res: Resolver, scale: number) {
  if (!item) return;
  const b = boxOf(doc, item, res, ctx);
  if (!b) return;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.translate(b.cx * scale, b.cy * scale);
  ctx.rotate((b.rotation * Math.PI) / 180);
  ctx.strokeStyle = '#c9ac70';
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 6]);
  ctx.strokeRect((-b.w / 2) * scale, (-b.h / 2) * scale, b.w * scale, b.h * scale);
  ctx.setLineDash([]);
  ctx.fillStyle = '#c9ac70';
  for (const [x, y] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) ctx.fillRect(((x * b.w) / 2) * scale - 5, ((y * b.h) / 2) * scale - 5, 10, 10);
  ctx.restore();
}

export function Stage({
  doc,
  player,
  canvasRef,
  t,
  playing,
  safe,
  onSafe,
  selected,
  readOnly,
  onSelect,
  onPlace,
  ready,
  note,
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
  ready: boolean;
  note: string | null;
}) {
  const box = useRef<HTMLDivElement>(null);
  const { w: W, h: H } = canvasOf(doc);
  const [size, setSize] = useState({ w: 320, h: 568 });
  const fps = doc.video?.fps ?? 30;
  const end = durationOf(doc);

  // the canvas fits its box with the project's proportions, in device pixels up to the project's size
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => {
      const r = el.getBoundingClientRect();
      const maxH = Math.max(200, Math.min(r.height || 9999, window.innerHeight * 0.62));
      const k = Math.min(r.width / W, maxH / H);
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
    c.width = pw;
    c.height = Math.round((pw * H) / W);
    player?.draw();
  }, [size, W, H, canvasRef, player]);

  const drag = useRef<{ id: string; x0: number; y0: number; cx: number; cy: number; key: string } | null>(null);
  const toCanvas = (e: RPointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  };
  const down = (e: RPointerEvent<HTMLCanvasElement>) => {
    if (!player) return;
    const pt = toCanvas(e);
    const ctx = canvasRef.current!.getContext('2d');
    const id = pick(doc, pt.x, pt.y, t, player.resolver(), ctx);
    onSelect(id);
    if (!id || readOnly) return;
    const item = doc.video?.tracks.flatMap((x) => x.clips).find((c) => c.id === id);
    if (!item) return;
    const tr = transformOf(item, W, H);
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id, x0: pt.x, y0: pt.y, cx: tr.x, cy: tr.y, key: `place-${id}-${Date.now()}` };
  };
  const move = (e: RPointerEvent<HTMLCanvasElement>) => {
    const d = drag.current;
    if (!d) return;
    const pt = toCanvas(e);
    let x = d.cx + (pt.x - d.x0);
    let y = d.cy + (pt.y - d.y0);
    // the centre snaps to the canvas's middle lines
    if (Math.abs(x - W / 2) < W * 0.015) x = W / 2;
    if (Math.abs(y - H / 2) < H * 0.015) y = H / 2;
    onPlace(d.id, Math.round(x), Math.round(y), d.key);
  };
  const up = () => {
    drag.current = null;
  };

  const step = (n: number) => player?.seek(t + n * frameUs(fps));

  return (
    <section className="st-stage" aria-label="المعاينة">
      <div className="st-stage-box" ref={box}>
        <canvas
          ref={canvasRef}
          className="st-canvas"
          style={{ width: size.w, height: size.h }}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          aria-label={`معاينة المشروع ${W} في ${H}`}
          role="img"
        />
        {!ready && <div className="st-stage-wait" role="status">جارٍ تجهيز القوالب والخطوط…</div>}
        {note && <div className="st-stage-note" role="status">{note}</div>}
      </div>
      <div className="st-transport" dir="ltr">
        <button type="button" onClick={() => player?.seek(0)} aria-label="إلى البداية" title="إلى البداية (Home)">
          <SkipBack />
        </button>
        <button type="button" onClick={() => step(-fps)} aria-label="رجوع ثانية" title="رجوع ثانية (Shift+←)">
          <ChevronsLeft />
        </button>
        <button type="button" onClick={() => step(-1)} aria-label="إطار للخلف" title="إطار للخلف (←)">
          <StepBack />
        </button>
        <button type="button" className="primary st-play" onClick={() => player?.toggle()} aria-label={playing ? 'إيقاف مؤقت' : 'تشغيل'} title="تشغيل وإيقاف (المسافة)" disabled={!end}>
          {playing ? <Pause /> : <Play />}
        </button>
        <button type="button" onClick={() => step(1)} aria-label="إطار للأمام" title="إطار للأمام (→)">
          <StepForward />
        </button>
        <button type="button" onClick={() => step(fps)} aria-label="تقدم ثانية" title="تقدم ثانية (Shift+→)">
          <ChevronsRight />
        </button>
        <output className="st-time">
          {timecode(t, fps)} / {timecode(end, fps)}
        </output>
        {doc.video?.ratio === '9:16' && (
          <label className="st-safe" dir="rtl">
            <input type="checkbox" checked={safe} onChange={(e) => onSafe(e.target.checked)} />
            مناطق Reels الآمنة
          </label>
        )}
      </div>
    </section>
  );
}

export { drawSafeZones };

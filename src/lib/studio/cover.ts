// Covered areas (MVP_draft.md 62.8): a box or an oval that blurs, or turns into large squares, whatever is
// already drawn under it, for faces, car plates and papers. Drawn by the compositor as a pass over the
// pixels below it, so the preview and the export cover the same pixels. Where the browser has no canvas
// filter, blur falls back to a soft reduce-and-enlarge, the same in that browser's preview and export.
import type { Cover, Transform } from './schema.ts';

export const COVER_MODES: { value: Cover['mode']; label: string }[] = [
  { value: 'blur', label: 'تمويه' },
  { value: 'blocks', label: 'مربعات' },
];
export const COVER_SHAPES: { value: Cover['shape']; label: string }[] = [
  { value: 'rect', label: 'مستطيل' },
  { value: 'ellipse', label: 'بيضوي' },
];
export const coverLabel = (c: Cover) => (c.mode === 'blocks' ? 'إخفاء بالمربعات' : 'تمويه منطقة');

/** A new covered area: an oval a third of the short side, at half strength. */
export function newCover(mode: Cover['mode'], W: number, H: number): Cover {
  const side = Math.round(Math.min(W, H) * 0.34);
  return { mode, amount: 50, shape: mode === 'blur' ? 'ellipse' : 'rect', w: side, h: Math.round(side * 1.2) };
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Number.isFinite(v) ? v : lo));
/** Blur radius in canvas pixels for a strength 1 to 100. */
export const coverRadius = (c: Pick<Cover, 'amount'>) => 2 + (clamp(c.amount, 1, 100) / 100) * 48;
/** Square size in canvas pixels for a strength 1 to 100. */
export const coverBlock = (c: Pick<Cover, 'amount'>) => 4 + (clamp(c.amount, 1, 100) / 100) * 60;

let filterOk: boolean | null = null;
function canFilter(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D): boolean {
  if (filterOk === null) {
    try {
      ctx.filter = 'blur(1px)';
      filterOk = ctx.filter === 'blur(1px)';
      ctx.filter = 'none';
    } catch {
      filterOk = false;
    }
  }
  return filterOk;
}

type Scratch = HTMLCanvasElement | OffscreenCanvas;
const scratches: Scratch[] = [];
function scratch(i: number, w: number, h: number): Scratch {
  let c = scratches[i];
  if (!c) {
    c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : document.createElement('canvas');
    scratches[i] = c;
  }
  if (c.width !== w) c.width = w;
  if (c.height !== h) c.height = h;
  return c;
}

/**
 * Covers the area of `cover` placed by `tr` (canvas pixels) on a context whose canvas is the project's
 * size times `scale`, mixing by `alpha`. The context's own transform is left as it was.
 */
export function drawCover(ctx: CanvasRenderingContext2D, cover: Cover, tr: Transform, scale: number, alpha = 1) {
  const a = Math.min(1, alpha * (tr.opacity ?? 1));
  if (a <= 0.001) return;
  const canvas = ctx.canvas;
  const w = Math.abs(cover.w * tr.scale * scale);
  const h = Math.abs(cover.h * tr.scale * scale);
  if (w < 1 || h < 1) return;
  const cx = tr.x * scale;
  const cy = tr.y * scale;
  const half = Math.hypot(w, h) / 2;
  const radius = coverRadius(cover) * scale;
  const pad = cover.mode === 'blur' ? Math.ceil(radius * 2) : 0;
  const x0 = Math.max(0, Math.floor(cx - half - pad));
  const y0 = Math.max(0, Math.floor(cy - half - pad));
  const x1 = Math.min(canvas.width, Math.ceil(cx + half + pad));
  const y1 = Math.min(canvas.height, Math.ceil(cy + half + pad));
  const bw = x1 - x0;
  const bh = y1 - y0;
  if (bw < 1 || bh < 1) return;
  const big = scratch(0, bw, bh);
  const b = big.getContext('2d') as CanvasRenderingContext2D;
  b.setTransform(1, 0, 0, 1, 0, 0);
  b.clearRect(0, 0, bw, bh);
  if (cover.mode === 'blur' && canFilter(b)) {
    b.filter = `blur(${radius.toFixed(2)}px)`;
    b.drawImage(canvas, x0, y0, bw, bh, 0, 0, bw, bh);
    b.filter = 'none';
  } else {
    // squares: reduce without smoothing, enlarge without smoothing; the blur fallback enlarges smoothly
    const size = Math.max(2, cover.mode === 'blur' ? radius : coverBlock(cover) * scale);
    const sw = Math.max(1, Math.round(bw / size));
    const sh = Math.max(1, Math.round(bh / size));
    const small = scratch(1, sw, sh);
    const s = small.getContext('2d') as CanvasRenderingContext2D;
    s.setTransform(1, 0, 0, 1, 0, 0);
    s.imageSmoothingEnabled = cover.mode === 'blur';
    s.clearRect(0, 0, sw, sh);
    s.drawImage(canvas, x0, y0, bw, bh, 0, 0, sw, sh);
    b.imageSmoothingEnabled = cover.mode === 'blur';
    b.drawImage(small, 0, 0, sw, sh, 0, 0, bw, bh);
    b.imageSmoothingEnabled = true;
  }
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = a;
  ctx.globalCompositeOperation = 'source-over';
  ctx.filter = 'none';
  ctx.beginPath();
  ctx.translate(cx, cy);
  if (tr.rotation) ctx.rotate((tr.rotation * Math.PI) / 180);
  if (cover.shape === 'ellipse') ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
  else ctx.rect(-w / 2, -h / 2, w, h);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clip();
  ctx.drawImage(big, 0, 0, bw, bh, x0, y0, bw, bh);
  ctx.restore();
}

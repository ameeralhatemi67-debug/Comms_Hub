// Covered areas (MVP_draft.md 62.8): a box or an oval that blurs, or turns into large squares, whatever is
// already drawn under it, for faces, car plates and papers. Drawn by the compositor as a pass over the
// pixels below it, so the preview and the export cover the same pixels. Where the browser has no canvas
// filter, blur falls back to a soft reduce-and-enlarge, the same in that browser's preview and export.
// The squares are worked out from the pixels themselves, with whole numbers, the same on every computer: on the
// graphics chip (squares-gl.ts), or in plain code here (mosaic). Shrinking without smoothing, as they were made before
// 2026-11-03, let each graphics chip pick its own pixel for a square (Desktop_Power_Ideas.md 5.2,
// qa/studio-crossdevice.cjs).
import type { Cover, Transform } from './schema.ts';
import { squaresOnChip } from './squares-gl.ts';

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

/** Where `count` squares across `size` pixels begin and end: count + 1 whole-pixel edges, from 0 to size. */
export function squareEdges(size: number, count: number): Int32Array {
  const edges = new Int32Array(count + 1);
  for (let i = 0; i <= count; i++) edges[i] = Math.floor((i * size) / count);
  return edges;
}

/**
 * «إخفاء بالمربعات» worked out exactly: RGBA pixels, w by h, cut into cols by rows squares on whole-pixel edges
 * (squareEdges); each square's colour is the average, weighted by opacity, of its pixels on a grid of every `step`-th
 * pixel from its corner. Whole-number sums and one rounding per channel, so the same pixels give the same colours on
 * every machine. Returns cols x rows colours, RGBA, row by row.
 */
export function mosaic(data: Uint8ClampedArray, w: number, h: number, cols: number, rows: number, step = 1): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(cols * rows * 4);
  const xs = squareEdges(w, cols);
  const ys = squareEdges(h, rows);
  const s = Math.max(1, Math.floor(step));
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let n = 0;
      for (let y = ys[j]; y < ys[j + 1]; y += s) {
        for (let x = xs[i], p = (y * w + x) * 4; x < xs[i + 1]; x += s, p += 4 * s) {
          const alpha = data[p + 3];
          r += data[p] * alpha;
          g += data[p + 1] * alpha;
          b += data[p + 2] * alpha;
          a += alpha;
          n++;
        }
      }
      if (!n) continue;
      // halves round up, as integer division does it on the graphics chip (squares-gl.ts)
      const k = (j * cols + i) * 4;
      out[k] = a ? Math.floor((2 * r + a) / (2 * a)) : 0;
      out[k + 1] = a ? Math.floor((2 * g + a) / (2 * a)) : 0;
      out[k + 2] = a ? Math.floor((2 * b + a) / (2 * a)) : 0;
      out[k + 3] = Math.floor((2 * a + n) / (2 * n));
    }
  }
  return out;
}

/** The grid a square is averaged on: about six samples a side, every pixel for small squares. */
export const mosaicStep = (squarePx: number) => Math.max(1, Math.floor(squarePx / 6));

/**
 * The squares of the area (x0, y0, bw, bh) of `ctx`'s picture as an image of bw by bh to draw back at (x0, y0).
 * 'auto' works them out on the graphics chip (squares-gl.ts) and in plain code where it cannot; the browser check
 * asks for each path by name and holds them equal. The plain-code path reads the area back, which is cheap only
 * where the canvas is drawn by the processor.
 */
export function squaresImage(ctx: CanvasRenderingContext2D, x0: number, y0: number, bw: number, bh: number, cols: number, rows: number, stride: number, path: 'auto' | 'chip' | 'code' = 'auto'): CanvasImageSource | null {
  if (path !== 'code') {
    const onChip = squaresOnChip(ctx.canvas, x0, y0, bw, bh, cols, rows, stride);
    if (onChip || path === 'chip') return onChip;
  }
  const colours = mosaic(ctx.getImageData(x0, y0, bw, bh).data, bw, bh, cols, rows, stride);
  const out = scratch(2, bw, bh);
  const o = out.getContext('2d') as CanvasRenderingContext2D;
  o.setTransform(1, 0, 0, 1, 0, 0);
  o.clearRect(0, 0, bw, bh);
  const xs = squareEdges(bw, cols);
  const ys = squareEdges(bh, rows);
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const k = (j * cols + i) * 4;
      o.fillStyle = `rgba(${colours[k]},${colours[k + 1]},${colours[k + 2]},${colours[k + 3] / 255})`;
      o.fillRect(xs[i], ys[j], xs[i + 1] - xs[i], ys[j + 1] - ys[j]);
    }
  }
  return out;
}

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
  let image: CanvasImageSource = big;
  if (cover.mode === 'blocks') {
    // squares worked out from the pixels under the area, the same on every machine
    const size = Math.max(2, coverBlock(cover) * scale);
    const cols = Math.min(bw, Math.max(1, Math.round(bw / size)));
    const rows = Math.min(bh, Math.max(1, Math.round(bh / size)));
    image = squaresImage(ctx, x0, y0, bw, bh, cols, rows, mosaicStep(size)) ?? big;
  } else if (canFilter(b)) {
    b.filter = `blur(${radius.toFixed(2)}px)`;
    b.drawImage(canvas, x0, y0, bw, bh, 0, 0, bw, bh);
    b.filter = 'none';
  } else {
    // blur where the canvas has no filter: reduce, then enlarge smoothly
    const size = Math.max(2, radius);
    const sw = Math.max(1, Math.round(bw / size));
    const sh = Math.max(1, Math.round(bh / size));
    const small = scratch(1, sw, sh);
    const s = small.getContext('2d') as CanvasRenderingContext2D;
    s.setTransform(1, 0, 0, 1, 0, 0);
    s.imageSmoothingEnabled = true;
    s.clearRect(0, 0, sw, sh);
    s.drawImage(canvas, x0, y0, bw, bh, 0, 0, sw, sh);
    b.drawImage(small, 0, 0, sw, sh, 0, 0, bw, bh);
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
  ctx.drawImage(image, 0, 0, bw, bh, x0, y0, bw, bh);
  ctx.restore();
}

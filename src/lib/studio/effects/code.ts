// The effects of plan.ts in plain code: the reference the graphics chip (chip.ts) is held equal to, byte for byte,
// and the path taken where there is no chip. Pixels are RGBA, premultiplied as the canvas keeps them; every step is
// whole-number arithmetic with one rounding, written as chip.ts writes it. Pure, usable in a worker.
import { reduced, type BlurPlan, type ColourPlan } from './plan.ts';
import { blurLanes } from './blur-simd.ts';
import { colourLanes } from './simd.ts';

/** Straight colour from premultiplied, rounded to the nearest; opaque pixels unchanged. */
export const unpremultiply = (p: number, a: number) => (a === 255 ? p : a ? Math.min(255, Math.floor((p * 255 + (a >> 1)) / a)) : 0);
/** Premultiplied from straight colour, rounded to the nearest (as the canvas does it); opaque pixels unchanged. */
export const premultiply = (c: number, a: number) => (a === 255 ? c : Math.floor((c * a + 127) / 255));

/** Straight RGBA, as getImageData gives it, to premultiplied, in place: exact for what a canvas holds. */
export function toPremultiplied(px: Uint8ClampedArray): void {
  for (let i = 0; i < px.length; i += 4) {
    const a = px[i + 3];
    if (a === 255) continue;
    px[i] = premultiply(px[i], a);
    px[i + 1] = premultiply(px[i + 1], a);
    px[i + 2] = premultiply(px[i + 2], a);
  }
}

/** Premultiplied RGBA to straight, in place, so putImageData premultiplies it back to the same bytes. */
export function toStraight(px: Uint8ClampedArray): void {
  for (let i = 0; i < px.length; i += 4) {
    const a = px[i + 3];
    if (a === 255) continue;
    px[i] = unpremultiply(px[i], a);
    px[i + 1] = unpremultiply(px[i + 1], a);
    px[i + 2] = unpremultiply(px[i + 2], a);
  }
}

/** A sum in 1/65536 to a byte: rounded to the nearest, an exact half to the even neighbour, within 0 to 255. */
export const toByte = (v: number) => (v <= 0 ? 0 : Math.min(255, (v & 65535) === 32768 ? ((v + 32768) >> 16) & ~1 : (v + 32768) >> 16));

/** A colour plan over premultiplied pixels, in place. */
export function colourPixels(px: Uint8ClampedArray, plan: ColourPlan): void {
  const t = plan.table ?? Uint8Array.from({ length: 256 }, (_, i) => i);
  const m = plan.matrix;
  const o0 = plan.offset ? plan.offset[0] : 0;
  const o1 = plan.offset ? plan.offset[1] : 0;
  const o2 = plan.offset ? plan.offset[2] : 0;
  // each matrix entry times the table, looked up rather than multiplied: the same whole numbers
  const k = m ? Array.from({ length: 9 }, (_, e) => Int32Array.from(t, (v) => m[e] * v)) : null;
  for (let i = 0; i < px.length; i += 4) {
    const a = px[i + 3];
    if (!a) continue;
    let r = a === 255 ? px[i] : unpremultiply(px[i], a);
    let g = a === 255 ? px[i + 1] : unpremultiply(px[i + 1], a);
    let b = a === 255 ? px[i + 2] : unpremultiply(px[i + 2], a);
    if (k) {
      const vr = k[0][r] + k[1][g] + k[2][b] + o0;
      const vg = k[3][r] + k[4][g] + k[5][b] + o1;
      const vb = k[6][r] + k[7][g] + k[8][b] + o2;
      r = toByte(vr);
      g = toByte(vg);
      b = toByte(vb);
    } else {
      r = t[r];
      g = t[g];
      b = t[b];
    }
    if (a === 255) {
      px[i] = r;
      px[i + 1] = g;
      px[i + 2] = b;
      continue;
    }
    px[i] = premultiply(r, a);
    px[i + 1] = premultiply(g, a);
    px[i + 2] = premultiply(b, a);
  }
}

/**
 * colourPixels on straight colour as getImageData gives it, for putImageData, in one pass: a see-through pixel is taken
 * premultiplied (exact) and back to straight colour by unpremultiply, as the chip takes it, so the canvas ends up with
 * colourPixels' bytes. Worked out by simd.ts's WebAssembly where it runs (`simd`), the same bytes, here otherwise; the
 * result is `px`, or simd.ts's memory, good until the next effect.
 */
export function colourStraight(px: Uint8ClampedArray, plan: ColourPlan, simd = true): Uint8ClampedArray {
  const fast = simd ? colourLanes(px, plan) : null;
  if (fast) return fast;
  const t = plan.table ?? Uint8Array.from({ length: 256 }, (_, i) => i);
  const m = plan.matrix;
  const o0 = plan.offset ? plan.offset[0] : 0;
  const o1 = plan.offset ? plan.offset[1] : 0;
  const o2 = plan.offset ? plan.offset[2] : 0;
  const k = m ? Array.from({ length: 9 }, (_, e) => Int32Array.from(t, (v) => m[e] * v)) : null;
  const [k0, k1, k2, k3, k4, k5, k6, k7, k8] = k ?? [];
  for (let i = 0; i < px.length; i += 4) {
    const a = px[i + 3];
    if (!a) continue;
    let r = px[i];
    let g = px[i + 1];
    let b = px[i + 2];
    if (a !== 255) {
      r = unpremultiply(premultiply(r, a), a);
      g = unpremultiply(premultiply(g, a), a);
      b = unpremultiply(premultiply(b, a), a);
    }
    if (k) {
      px[i] = toByte(k0[r] + k1[g] + k2[b] + o0);
      px[i + 1] = toByte(k3[r] + k4[g] + k5[b] + o1);
      px[i + 2] = toByte(k6[r] + k7[g] + k8[b] + o2);
    } else {
      px[i] = t[r];
      px[i + 1] = t[g];
      px[i + 2] = t[b];
    }
  }
  return px;
}

/**
 * A blur plan over a w by h picture of premultiplied pixels; returns the blurred picture, the same size. With `pad`,
 * the picture is taken as lying in a transparent margin of `pad` pixels on every side (a multiple of the plan's n),
 * which the blur reads and the result leaves out: what the canvas filter did at the edge of what it was given. Worked
 * out by blur-simd.ts's WebAssembly where it runs (`simd`), the same bytes, here otherwise.
 */
export function blurPixels(px: Uint8ClampedArray, w: number, h: number, plan: BlurPlan, pad = 0, simd = true): Uint8ClampedArray<ArrayBuffer> {
  const fast = simd ? blurLanes(px, w, h, plan, pad) : null;
  if (fast) return fast;
  const { n, k, radius, weights } = plan;
  const vw = w + 2 * pad;
  const vh = h + 2 * pad;
  const rw = reduced(vw, n);
  const rh = reduced(vh, n);
  // 1. reduce: the sum of each n by n block (outside the picture counts as transparent), cut to a whole number
  const small = new Uint32Array(rw * rh * 4);
  const shift = 2 * k;
  if (n === 1 && !pad) small.set(px);
  else {
    const row = new Uint32Array(rw * 4);
    for (let j = 0; j < rh; j++) {
      row.fill(0);
      for (let yy = j * n - pad, end = yy + n; yy < end; yy++) {
        if (yy < 0 || yy >= h) continue;
        for (let x = 0; x < w; x++) {
          const i = (x + pad) >> k;
          const s = (yy * w + x) * 4;
          const d = i * 4;
          row[d] += px[s];
          row[d + 1] += px[s + 1];
          row[d + 2] += px[s + 2];
          row[d + 3] += px[s + 3];
        }
      }
      for (let i = 0; i < rw * 4; i++) small[j * rw * 4 + i] = row[i] >>> shift;
    }
  }
  // 2. across then down, transparent outside, rounded to the nearest
  const pass = (src: Uint32Array, across: boolean): Uint32Array => {
    const dst = new Uint32Array(src.length);
    if (!radius) {
      dst.set(src);
      return dst;
    }
    for (let y = 0; y < rh; y++) {
      for (let x = 0; x < rw; x++) {
        let r = 0;
        let g = 0;
        let b = 0;
        let a = 0;
        for (let j = -radius; j <= radius; j++) {
          const xx = across ? x + j : x;
          const yy = across ? y : y + j;
          if (xx < 0 || yy < 0 || xx >= rw || yy >= rh) continue;
          const wt = weights[j + radius];
          const s = (yy * rw + xx) * 4;
          r += wt * src[s];
          g += wt * src[s + 1];
          b += wt * src[s + 2];
          a += wt * src[s + 3];
        }
        const d = (y * rw + x) * 4;
        dst[d] = (r + 32768) >>> 16;
        dst[d + 1] = (g + 32768) >>> 16;
        dst[d + 2] = (b + 32768) >>> 16;
        dst[d + 3] = (a + 32768) >>> 16;
      }
    }
    return dst;
  };
  // or three boxes each way, by running sums: (2 * sum + width) / (2 * width), never an exact half since the width is odd
  const box = (src: Uint32Array, across: boolean, width: number): Uint32Array => {
    const dst = new Uint32Array(src.length);
    const r = (width - 1) >> 1;
    const len = across ? rw : rh;
    const lines = across ? rh : rw;
    const step = across ? 4 : rw * 4;
    const two = 2 * width;
    for (let line = 0; line < lines; line++) {
      const base = across ? line * rw * 4 : line * 4;
      for (let c = 0; c < 4; c++) {
        let sum = 0;
        for (let j = 0; j <= r && j < len; j++) sum += src[base + j * step + c];
        for (let k = 0; k < len; k++) {
          dst[base + k * step + c] = ((2 * sum + width) / two) | 0;
          if (k + r + 1 < len) sum += src[base + (k + r + 1) * step + c];
          if (k - r >= 0) sum -= src[base + (k - r) * step + c];
        }
      }
    }
    return dst;
  };
  const boxes = plan.boxes;
  const blurred = boxes ? [true, false].reduce<Uint32Array>((img, across) => boxes.reduce<Uint32Array>((x, wd) => box(x, across, wd), img), small) : pass(pass(small, true), false);
  // 3. enlarge: bilinear weights in 1/(2n) steps, the edge repeated, one rounding over the four
  const out = new Uint8ClampedArray(w * h * 4);
  const two = 2 * n;
  const mask = two - 1;
  const sh = k + 1;
  const half = 2 * n * n;
  const total = 2 * sh;
  const cols = new Int32Array(w * 4);
  const lo = new Int32Array(w * 4);
  const hi = new Int32Array(w * 4);
  for (let x = 0; x < w; x++) {
    const u = 2 * (x + pad) + 1 - n + two;
    const i0 = (u >> sh) - 1;
    cols[x * 4] = Math.min(rw - 1, Math.max(0, i0));
    cols[x * 4 + 1] = Math.min(rw - 1, Math.max(0, i0 + 1));
    cols[x * 4 + 2] = two - (u & mask);
    cols[x * 4 + 3] = u & mask;
  }
  const across = (row: number, into: Int32Array) => {
    const base = row * rw * 4;
    for (let x = 0; x < w; x++) {
      const a = base + cols[x * 4] * 4;
      const b = base + cols[x * 4 + 1] * 4;
      const wa = cols[x * 4 + 2];
      const wb = cols[x * 4 + 3];
      const d = x * 4;
      into[d] = wa * blurred[a] + wb * blurred[b];
      into[d + 1] = wa * blurred[a + 1] + wb * blurred[b + 1];
      into[d + 2] = wa * blurred[a + 2] + wb * blurred[b + 2];
      into[d + 3] = wa * blurred[a + 3] + wb * blurred[b + 3];
    }
  };
  let loRow = -1;
  let hiRow = -1;
  for (let y = 0; y < h; y++) {
    const v = 2 * (y + pad) + 1 - n + two;
    const j0 = (v >> sh) - 1;
    const r0 = Math.min(rh - 1, Math.max(0, j0));
    const r1 = Math.min(rh - 1, Math.max(0, j0 + 1));
    if (r0 !== loRow) {
      if (r0 === hiRow) lo.set(hi);
      else across(r0, lo);
      loRow = r0;
    }
    if (r1 !== hiRow) {
      across(r1, hi);
      hiRow = r1;
    }
    const wy1 = v & mask;
    const wy0 = two - wy1;
    const d = y * w * 4;
    for (let i = 0; i < w * 4; i++) out[d + i] = (wy0 * lo[i] + wy1 * hi[i] + half) >>> total;
  }
  return out;
}

/**
 * blurPixels over straight colour as getImageData gives it, for putImageData: coloured first if `colour` is given
 * (colourStraight), premultiplied, blurred and straight again, the same bytes as those steps one after the other. The
 * result may be blur-simd.ts's memory, good until the next blur, and `px` may be changed.
 */
export function blurStraight(px: Uint8ClampedArray, w: number, h: number, plan: BlurPlan, pad = 0, colour: ColourPlan | null = null, simd = true): Uint8ClampedArray<ArrayBuffer> {
  const fast = simd ? blurLanes(px, w, h, plan, pad, { colour, straight: true, borrowed: true }) : null;
  if (fast) return fast;
  if (colour) {
    const coloured = colourStraight(px, colour, simd);
    if (coloured !== px) px.set(coloured);
  }
  toPremultiplied(px);
  const out = blurPixels(px, w, h, plan, pad, false);
  toStraight(out);
  return out;
}

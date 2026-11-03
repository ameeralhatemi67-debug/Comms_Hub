// The effects of plan.ts in plain code: the reference the graphics chip (chip.ts) is held equal to, byte for byte,
// and the path taken where there is no chip. Pixels are RGBA, premultiplied as the canvas keeps them; every step is
// whole-number arithmetic with one rounding, written as chip.ts writes it. Pure, usable in a worker.
import { reduced, type BlurPlan, type ColourPlan } from './plan.ts';

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

/** A colour plan over premultiplied pixels, in place. */
export function colourPixels(px: Uint8ClampedArray, plan: ColourPlan): void {
  const t = plan.table;
  const m = plan.matrix;
  const o0 = plan.offset ? plan.offset[0] : 0;
  const o1 = plan.offset ? plan.offset[1] : 0;
  const o2 = plan.offset ? plan.offset[2] : 0;
  for (let i = 0; i < px.length; i += 4) {
    const a = px[i + 3];
    if (!a) continue;
    let r = unpremultiply(px[i], a);
    let g = unpremultiply(px[i + 1], a);
    let b = unpremultiply(px[i + 2], a);
    if (t) {
      r = t[r];
      g = t[g];
      b = t[b];
    }
    if (m) {
      const vr = m[0] * r + m[1] * g + m[2] * b + o0;
      const vg = m[3] * r + m[4] * g + m[5] * b + o1;
      const vb = m[6] * r + m[7] * g + m[8] * b + o2;
      r = vr <= 0 ? 0 : Math.min(255, (vr + 32768) >> 16);
      g = vg <= 0 ? 0 : Math.min(255, (vg + 32768) >> 16);
      b = vb <= 0 ? 0 : Math.min(255, (vb + 32768) >> 16);
    }
    px[i] = premultiply(r, a);
    px[i + 1] = premultiply(g, a);
    px[i + 2] = premultiply(b, a);
  }
}

/**
 * A blur plan over a w by h picture of premultiplied pixels; returns the blurred picture, the same size. With `pad`,
 * the picture is taken as lying in a transparent margin of `pad` pixels on every side (a multiple of the plan's n),
 * which the blur reads and the result leaves out: what the canvas filter did at the edge of what it was given.
 */
export function blurPixels(px: Uint8ClampedArray, w: number, h: number, plan: BlurPlan, pad = 0): Uint8ClampedArray<ArrayBuffer> {
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
          const i = ((x + pad) / n) | 0;
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
  const blurred = pass(pass(small, true), false);
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

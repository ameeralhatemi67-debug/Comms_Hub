// The studio's picture effects worked out as whole numbers (Desktop_Power_Ideas.md P-09 and H-03; MVP_draft.md 62.15):
// a colour adjustment is a 256-entry table and a 3 by 3 matrix of integers, a blur a list of integer weights on a
// copy reduced by a power of two, so the graphics chip (chip.ts) and the plain code (code.ts) do the same arithmetic
// and give the same bytes on every computer. They follow what the canvas filters drew before 2026-11-04 (compose.ts
// filterOf): brightness and contrast as Chromium's 8-bit tables, saturation as its matrix, blur as Skia's Gaussian,
// computed on a copy halved until its radius is at most four pixels. Pure, usable in a worker.

/**
 * A colour adjustment on straight (not premultiplied) colour: the table first, then the matrix (rows of 1/65536) with
 * its constant `offset` (1/65536 too), rounded to the nearest (an exact half to the even neighbour) and kept within 0
 * to 255.
 */
export type ColourPlan = { table: Uint8Array | null; matrix: Int32Array | null; offset: Int32Array | null };

/**
 * A blur of `sigma` pixels: the picture reduced `n` times (2^k) by averaging each n by n block, blurred there with
 * `weights` (2 * radius + 1 of them, summing to 65536) across then down, and enlarged back by bilinear weights.
 * `reach` is how far a blurred picture spreads beyond what was drawn, and how far around it the blur reads.
 */
export type BlurPlan = { sigma: number; n: number; k: number; radius: number; weights: Int32Array; reach: number };

export type EffectPlan = { colour: ColourPlan | null; blur: BlurPlan | null };

/** What the canvas filter used to receive: CSS numbers written with three decimals, read as 32-bit floats. */
const f = Math.fround;
const css = (v: number, digits: number) => Number(v.toFixed(digits));

/** Chromium's table for a linear component transfer: slope * i + 255 * intercept in floats, cut to a whole number. */
function linearTable(slope: number, intercept: number): Uint8Array {
  const t = new Uint8Array(256);
  const s = f(slope);
  const b = f(255 * f(intercept));
  for (let i = 0; i < 256; i++) {
    const v = f(f(s * i) + b);
    t[i] = v <= 0 ? 0 : v >= 255 ? 255 : Math.floor(v);
  }
  return t;
}

/** Chromium's saturation matrix, in floats, to 1/65536. */
function saturationMatrix(s: number): Int32Array {
  const a = f(s);
  const m = [
    f(0.213 + f(0.787 * a)), f(0.715 - f(0.715 * a)), f(0.072 - f(0.072 * a)),
    f(0.213 - f(0.213 * a)), f(0.715 + f(0.285 * a)), f(0.072 - f(0.072 * a)),
    f(0.213 - f(0.213 * a)), f(0.715 - f(0.715 * a)), f(0.072 + f(0.928 * a)),
  ];
  return Int32Array.from(m, (v) => Math.round(v * 65536));
}

/** Brightness, contrast and saturation (-100 to 100 each) as a colour plan, or null when nothing changes. */
export function colourPlan(a: { brightness?: number; contrast?: number; saturation?: number } | undefined): ColourPlan | null {
  if (!a) return null;
  const amount = (v: number | undefined) => Math.max(0, css(1 + (Number.isFinite(v) ? (v as number) : 0) / 100, 3));
  const br = amount(a.brightness);
  const ct = amount(a.contrast);
  const sat = amount(a.saturation);
  let table: Uint8Array | null = null;
  if (br !== 1 || ct !== 1) {
    const tb = br !== 1 ? linearTable(br, 0) : null;
    const tc = ct !== 1 ? linearTable(ct, -0.5 * f(ct) + 0.5) : null;
    table = new Uint8Array(256);
    for (let i = 0; i < 256; i++) {
      const x = tb ? tb[i] : i;
      table[i] = tc ? tc[x] : x;
    }
  }
  const matrix = sat !== 1 ? saturationMatrix(sat) : null;
  return table || matrix ? { table, matrix, offset: null } : null;
}

/**
 * A photo's adjustment (photo.ts; brightness, contrast, saturation and warmth, -100 to 100 each) as one map on
 * straight colour, matrix and offset to 1/65536: brightness then contrast about 128, saturation about the Rec. 709
 * luma, then warmth on red and blue, as photo.ts worked it out in floating point before 2026-11-04. Null when nothing
 * changes.
 */
export function photoColourPlan(a: { brightness?: number; contrast?: number; saturation?: number; warmth?: number } | undefined): ColourPlan | null {
  if (!a) return null;
  const num = (v: number | undefined) => (Number.isFinite(v) ? (v as number) : 0);
  const br = 1 + num(a.brightness) / 100;
  const ct = 1 + num(a.contrast) / 100;
  const sat = 1 + num(a.saturation) / 100;
  const wr = num(a.warmth) / 100;
  if (br === 1 && ct === 1 && sat === 1 && wr === 0) return null;
  const luma = [0.2126, 0.7152, 0.0722];
  const warm = [1 + wr * 0.25, 1, 1 - wr * 0.25];
  const k = br * ct;
  const matrix = new Int32Array(9);
  const offset = new Int32Array(3);
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) matrix[i * 3 + j] = Math.round(65536 * warm[i] * k * ((i === j ? sat : 0) + (1 - sat) * luma[j]));
    // saturation leaves a grey grey, so contrast's constant passes through it unchanged
    offset[i] = Math.round(65536 * warm[i] * 128 * (1 - ct));
  }
  return { table: null, matrix, offset };
}

/** e^-x from additions, products and quotients alone, so every engine computes the same weights. */
function expNeg(x: number): number {
  let term = 1;
  let sum = 1;
  for (let i = 1; i < 48; i++) {
    term = (term * -x) / i;
    sum += term;
  }
  return Math.max(0, sum);
}

/** Skia's largest blur radius drawn at full size; above it the picture is halved first. */
export const MAX_SIGMA = 4;
/** At most 2^6 = 64 times smaller. */
const MAX_K = 6;

/** A blur of `sigma` pixels (a CSS blur radius), or null for none. */
export function blurPlan(sigma: number): BlurPlan | null {
  const s = Number.isFinite(sigma) ? css(Math.max(0, sigma), 2) : 0;
  if (s <= 0) return null;
  let n = 1;
  let k = 0;
  while (s / n > MAX_SIGMA && k < MAX_K) {
    n *= 2;
    k++;
  }
  // the reduction's average and the enlargement's bilinear weights blur too, by about (n * n - 1) / 4 in variance
  const variance = Math.max(0, (s * s - (n * n - 1) / 4) / (n * n));
  const sd = Math.sqrt(variance);
  const radius = Math.min(12, Math.ceil(3 * sd));
  const g: number[] = [];
  let total = 0;
  for (let j = -radius; j <= radius; j++) {
    const v = variance > 0 ? expNeg((j * j) / (2 * variance)) : j === 0 ? 1 : 0;
    g.push(v);
    total += v;
  }
  const weights = Int32Array.from(g, (v) => Math.round((v / total) * 65536));
  weights[radius] += 65536 - weights.reduce((x, y) => x + y, 0);
  return { sigma: s, n, k, radius, weights, reach: Math.ceil(3 * s) + 2 * n };
}

/** The pixels a reduced copy of a w by h picture has: ceil(w / n) by ceil(h / n). */
export const reduced = (size: number, n: number) => Math.ceil(size / n);

/** Two blurs one after the other spread as one whose radius is the root of the sum of their squares. */
export const blurTogether = (a: number, b: number) => Math.sqrt(a * a + b * b);

/**
 * An item's effects as the compositor used to write them for the canvas filter (compose.ts filterOf): its colour
 * adjustment, then its own blur (a tenth of `adjust.blur` pixels, as before not scaled) with the blur of its
 * transition or movement (`blurPx`, target pixels). Null when it has none.
 */
export function effectOf(adjust: { brightness?: number; contrast?: number; saturation?: number; blur?: number } | undefined, blurPx = 0): EffectPlan | null {
  const colour = colourPlan(adjust);
  const own = adjust?.blur ? css(Math.max(0, adjust.blur / 10), 2) : 0;
  const moving = blurPx > 0 ? css(blurPx, 2) : 0;
  const blur = blurPlan(own && moving ? blurTogether(own, moving) : own || moving);
  return colour || blur ? { colour, blur } : null;
}

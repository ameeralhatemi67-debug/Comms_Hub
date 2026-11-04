// The studio's effects as whole numbers (src/lib/studio/effects/, Desktop_Power_Ideas.md P-09): the plans follow the
// canvas filters they replace, and the plain code keeps what a canvas can hold. The graphics chip is held equal to
// this code in the browser (qa/studio-effects-parity.cjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blurPlan, colourPlan, effectOf, MAX_SIGMA } from '../src/lib/studio/effects/plan.ts';
import { blurPixels, colourPixels, premultiply, toPremultiplied, toStraight, unpremultiply } from '../src/lib/studio/effects/code.ts';

test('no adjustment and no blur is no effect', () => {
  assert.equal(effectOf(undefined), null);
  assert.equal(effectOf({ brightness: 0, contrast: 0, saturation: 0 }), null);
  assert.equal(effectOf({ brightness: 0, contrast: 0, saturation: 0 }, 0.004), null, 'below what the filter wrote (two decimals)');
  assert.equal(colourPlan({ brightness: 0, contrast: 0, saturation: 10 }).table, null);
  assert.equal(colourPlan({ brightness: 5, contrast: 0, saturation: 0 }).matrix, null);
});

test('brightness and contrast are the 8-bit tables the canvas filter used, cut to whole numbers', () => {
  // measured on 2026-11-04: Edge's filter equals floor(x * 1.12) and floor((x - 127.5) * 1.18 + 127.5) on every pixel
  const b = colourPlan({ brightness: 12, contrast: 0, saturation: 0 }).table;
  const c = colourPlan({ brightness: 0, contrast: 18, saturation: 0 }).table;
  for (let x = 0; x < 256; x++) {
    assert.equal(b[x], Math.min(255, Math.floor(x * 1.12)), `brightness at ${x}`);
    assert.equal(c[x], Math.max(0, Math.min(255, Math.floor((x - 127.5) * 1.18 + 127.5))), `contrast at ${x}`);
  }
  assert.equal(colourPlan({ brightness: -100, contrast: 0, saturation: 0 }).table.every((v) => v === 0), true, 'no brightness is black');
  const flat = colourPlan({ brightness: 0, contrast: -100, saturation: 0 }).table;
  assert.equal(new Set(flat).size, 1, 'no contrast is one grey');
});

test('saturation is a matrix whose rows keep a grey grey', () => {
  for (const s of [-100, -30, 25, 100]) {
    const m = colourPlan({ brightness: 0, contrast: 0, saturation: s }).matrix;
    for (let row = 0; row < 3; row++) assert.ok(Math.abs(m[row * 3] + m[row * 3 + 1] + m[row * 3 + 2] - 65536) <= 2, `row ${row} at ${s}`);
  }
  const px = new Uint8ClampedArray([255, 0, 0, 255, 90, 90, 90, 255]);
  colourPixels(px, colourPlan({ brightness: 0, contrast: 0, saturation: -100 }));
  assert.equal(px[0], px[1]);
  assert.equal(px[1], px[2]);
  assert.deepEqual([...px.slice(4, 8)], [90, 90, 90, 255]);
});

test('premultiplied and straight colour turn into each other without loss where a canvas holds them', () => {
  for (let a = 1; a < 256; a++) {
    for (let p = 0; p <= a; p++) assert.equal(premultiply(unpremultiply(p, a), a), p, `p ${p} at a ${a}`);
  }
  const px = new Uint8ClampedArray([200, 100, 50, 128, 10, 20, 30, 255, 0, 0, 0, 0]);
  const copy = px.slice();
  toPremultiplied(px);
  toStraight(px);
  toPremultiplied(px);
  toPremultiplied(copy);
  assert.deepEqual([...px], [...copy]);
});

test('a colour adjustment keeps opacity and premultiplied colour within it', () => {
  const plan = colourPlan({ brightness: 100, contrast: 60, saturation: 100 });
  const px = new Uint8ClampedArray(256 * 4);
  for (let a = 0; a < 256; a++) px.set([a, Math.floor(a / 2), Math.floor(a / 3), a], a * 4);
  colourPixels(px, plan);
  for (let a = 0; a < 256; a++) {
    assert.equal(px[a * 4 + 3], a);
    for (let k = 0; k < 3; k++) assert.ok(px[a * 4 + k] <= a, `channel ${k} within opacity ${a}`);
  }
});

test('a blur is reduced by powers of two above four pixels, its weights summing to one', () => {
  assert.equal(blurPlan(0), null);
  assert.equal(blurPlan(3).n, 1);
  assert.equal(blurPlan(MAX_SIGMA).n, 1);
  assert.equal(blurPlan(4.5).n, 2);
  assert.equal(blurPlan(30).n, 8);
  assert.equal(blurPlan(100).n, 32);
  for (const s of [0.3, 2, 9, 30, 100]) {
    const p = blurPlan(s);
    assert.equal(p.weights.reduce((x, y) => x + y, 0), 65536, `sum at ${s}`);
    assert.equal(p.weights.length, 2 * p.radius + 1);
    assert.ok(p.radius <= 12);
    assert.ok(p.reach >= 3 * s);
    for (let j = 0; j < p.radius; j++) assert.equal(p.weights[j], p.weights[2 * p.radius - j], 'symmetric');
  }
  assert.deepEqual(blurPlan(30), blurPlan(30.001), 'the radius is read to two decimals, as the filter wrote it');
});

function picture(w, h, seed = 7) {
  const px = new Uint8ClampedArray(w * h * 4);
  let s = seed;
  for (let i = 0; i < px.length; i += 4) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const a = (s >>> 24) | 0;
    px[i] = Math.floor(((s >>> 16) & 255) * a / 255);
    px[i + 1] = Math.floor(((s >>> 8) & 255) * a / 255);
    px[i + 2] = Math.floor((s & 255) * a / 255);
    px[i + 3] = a;
  }
  return px;
}

test('a blur keeps premultiplied colour within opacity, an even picture even, and is the same twice', () => {
  for (const s of [1.5, 6, 20]) {
    const plan = blurPlan(s);
    const px = picture(97, 61);
    const a = blurPixels(px, 97, 61, plan);
    const b = blurPixels(px, 97, 61, plan);
    assert.deepEqual(a, b);
    for (let i = 0; i < a.length; i += 4) for (let k = 0; k < 3; k++) assert.ok(a[i + k] <= a[i + 3], `within opacity at ${s}`);
    const even = new Uint8ClampedArray(64 * 48 * 4).fill(200);
    const out = blurPixels(even, 64, 48, plan);
    // far from the edges (transparent beyond) an even picture stays even
    const r = Math.ceil(plan.reach);
    if (r * 2 < 48) for (let y = r; y < 48 - r; y++) for (let x = r; x < 64 - r; x++) assert.ok(Math.abs(out[(y * 64 + x) * 4] - 200) <= 1, `even inside at ${s}`);
  }
});

test('a blur with a margin reads transparency beyond the picture and returns the picture only', () => {
  const plan = blurPlan(9);
  const px = new Uint8ClampedArray(40 * 30 * 4).fill(255);
  const out = blurPixels(px, 40, 30, plan, 32);
  assert.equal(out.length, px.length);
  assert.ok(out[3] < 160 && out[3] > 60, 'the corner fades towards the margin');
  assert.ok(out[(15 * 40 + 20) * 4 + 3] > out[3], 'the middle less');
});

test('colour on straight colour in one pass leaves the canvas the bytes of the premultiplied path', async () => {
  const { colourStraight } = await import('../src/lib/studio/effects/code.ts');
  for (const a of [{ brightness: 12, contrast: 18, saturation: 25 }, { brightness: -100, contrast: 0, saturation: 0 }, { brightness: 0, contrast: -60, saturation: 100 }]) {
    const plan = colourPlan(a);
    const straight = picture(97, 61, 13);
    toStraight(straight);
    const viaPremultiplied = straight.slice();
    toPremultiplied(viaPremultiplied);
    colourPixels(viaPremultiplied, plan);
    const once = straight.slice();
    colourStraight(once, plan);
    // what the canvas keeps after putImageData
    toPremultiplied(once);
    for (let i = 0; i < once.length; i += 4) {
      if (!once[i + 3]) continue;
      for (let k = 0; k < 4; k++) assert.equal(once[i + k], viaPremultiplied[i + k], `${JSON.stringify(a)} at ${i / 4}`);
    }
  }
});

test('a scratch picture grows to hold what a frame asks and shrinks only after a long time far too large', async () => {
  const { fitted } = await import('../src/lib/studio/effects/chip.ts');
  const r = { cw: 0, ch: 0, over: 0 };
  assert.deepEqual(fitted(r, 1920, 1080), [1920, 1080]);
  assert.deepEqual(fitted(r, 1000, 1100), [1920, 1100], 'each side grows to the larger');
  for (let i = 0; i < 50; i++) {
    assert.equal(fitted(r, 1920, 1080), null, 'a frame of a large and a small effect reallocates nothing');
    assert.equal(fitted(r, 300, 300), null);
  }
  let shrunk = null;
  for (let i = 0; i < 130 && !shrunk; i++) shrunk = fitted(r, 300, 300);
  assert.deepEqual(shrunk, [300, 300], 'far too large for 120 requests in a row');
});

test('the colour in WebAssembly lanes gives the bytes of the plain code, opaque pixels or not', async () => {
  const { colourStraight } = await import('../src/lib/studio/effects/code.ts');
  const { colourOpaque } = await import('../src/lib/studio/effects/simd.ts');
  const { photoColourPlan } = await import('../src/lib/studio/effects/plan.ts');
  const plans = [
    ...[{ brightness: 12, contrast: 18, saturation: 25 }, { brightness: -8, contrast: 10, saturation: -30 }, { brightness: 0, contrast: 0, saturation: -100 }, { brightness: 37, contrast: -63, saturation: 81 }, { brightness: 100, contrast: 0, saturation: 0 }, { brightness: 0, contrast: -100, saturation: 0 }, { brightness: -50, contrast: 100, saturation: 100 }].map(colourPlan),
    ...[{ brightness: 30, warmth: 70 }, { contrast: -45, saturation: 60 }, { brightness: 100, contrast: 100, saturation: 100, warmth: 100 }].map(photoColourPlan),
  ];
  // mostly opaque, as footage is, with see-through and clear pixels among them, and a length that is not 16-aligned
  const w = 211;
  const h = 97;
  const base = picture(w, h, 33);
  for (let i = 0; i < base.length; i += 4) if ((i / 4) % 11) base[i + 3] = 255;
  for (let i = 3; i < base.length; i += 4 * 37) base[i] = 0;
  toStraight(base);
  for (const plan of plans) {
    const lanes = base.slice();
    const plain = base.slice();
    assert.ok(colourOpaque(lanes.slice(), plan) > 0, 'the lanes are offered here');
    colourStraight(lanes, plan, true);
    colourStraight(plain, plan, false);
    assert.deepEqual([...lanes], [...plain]);
  }
});

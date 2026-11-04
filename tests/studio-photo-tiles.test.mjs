// Photo adjustments in whole numbers and in bands (src/lib/studio/photo.ts, Desktop_Power_Ideas.md P-17): the integer
// colour stays within a level of the floating point one it replaced, equals the graphics chip's arithmetic, and a
// picture cut into bands across workers comes out the same as the whole. The workers and the chip themselves are held
// equal in the browser (qa/studio-photo-tiles.cjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { colourPixels, toPremultiplied, toStraight } from '../src/lib/studio/effects/code.ts';

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

import { photoColourPlan } from '../src/lib/studio/effects/plan.ts';
import { adjustPixels, bandsOf, blurPixels as photoBlur, blurRadius, photoPixels } from '../src/lib/studio/photo.ts';

/** photo.ts adjustPixels as it was until 2026-11-04, in floating point: what a saved photo looked like. */
function before(data, a) {
  const br = 1 + (a.brightness || 0) / 100;
  const ct = 1 + (a.contrast || 0) / 100;
  const sat = 1 + (a.saturation || 0) / 100;
  const wr = (a.warmth || 0) / 100;
  for (let i = 0; i < data.length; i += 4) {
    let r = data[i] * br;
    let g = data[i + 1] * br;
    let b = data[i + 2] * br;
    r = (r - 128) * ct + 128;
    g = (g - 128) * ct + 128;
    b = (b - 128) * ct + 128;
    const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    r = y + (r - y) * sat;
    g = y + (g - y) * sat;
    b = y + (b - y) * sat;
    r *= 1 + wr * 0.25;
    b *= 1 - wr * 0.25;
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
  }
}

const ADJUSTS = [{ brightness: 30 }, { brightness: -70 }, { contrast: 45 }, { contrast: -80 }, { saturation: 60 }, { saturation: -100 }, { warmth: 100 }, { warmth: -55 }, { brightness: 12, contrast: -20, saturation: 35, warmth: 40 }, { brightness: 100, contrast: 100, saturation: 100, warmth: 100 }];

test('a photo adjustment in whole numbers is within one level of the floating point one it replaced', () => {
  const opaque = picture(256, 64, 3);
  for (let i = 3; i < opaque.length; i += 4) opaque[i] = 255;
  for (const a of ADJUSTS) {
    const x = opaque.slice();
    const y = opaque.slice();
    adjustPixels(x, a);
    before(y, a);
    let max = 0;
    let differ = 0;
    for (let i = 0; i < x.length; i++) {
      const d = Math.abs(x[i] - y[i]);
      max = Math.max(max, d);
      if (d) differ++;
    }
    assert.ok(max <= 1, `${JSON.stringify(a)}: ${max}`);
    // a half went to the even neighbour before, and up now: brightness 30 (times 1.3) lands many values on a half
    assert.ok(differ / x.length < 0.05, `${JSON.stringify(a)}: ${differ} channels`);
  }
  assert.equal(photoColourPlan({ brightness: 0, contrast: 0, saturation: 0, warmth: 0 }), null);
});

test("a photo adjustment on straight colour is the graphics chip's arithmetic on the canvas's own bytes", () => {
  for (const a of ADJUSTS) {
    const plan = photoColourPlan(a);
    const straight = picture(128, 64, 11);
    toStraight(straight);
    const viaCode = straight.slice();
    toPremultiplied(viaCode);
    colourPixels(viaCode, plan);
    const photo = straight.slice();
    photoPixels(photo, plan.matrix, plan.offset);
    // what the canvas keeps after putImageData: the photo path's straight colour premultiplied
    toPremultiplied(photo);
    for (let i = 0; i < photo.length; i += 4) {
      if (!photo[i + 3]) continue;
      for (let k = 0; k < 4; k++) assert.equal(photo[i + k], viaCode[i + k], `${JSON.stringify(a)} at ${i / 4}`);
    }
  }
});

test('a photo cut into bands, each with the rows its blur reads, comes out the same as the whole', () => {
  const w = 53;
  const h = 97;
  const plan = photoColourPlan({ brightness: 10, contrast: 20, saturation: -15, warmth: 30 });
  for (const r of [0, 1, 3, 7]) {
    const whole = picture(w, h, 5);
    photoPixels(whole, plan.matrix, plan.offset);
    photoBlur(whole, w, h, r);
    for (const n of [2, 3, 5, 8, 14]) {
      const src = picture(w, h, 5);
      const out = new Uint8ClampedArray(src.length);
      for (const b of bandsOf(h, n, r)) {
        const band = src.slice(b.top * w * 4, b.bottom * w * 4);
        photoPixels(band, plan.matrix, plan.offset);
        photoBlur(band, w, b.bottom - b.top, r);
        out.set(band.subarray((b.y0 - b.top) * w * 4, (b.y1 - b.top) * w * 4), b.y0 * w * 4);
      }
      assert.deepEqual(out, whole, `radius ${r}, ${n} bands`);
    }
  }
  const bands = bandsOf(6000, 10, 133);
  assert.equal(bands.length, 10);
  assert.equal(bands[0].y0, 0);
  assert.equal(bands.at(-1).y1, 6000);
  for (let i = 1; i < bands.length; i++) assert.equal(bands[i].y0, bands[i - 1].y1, 'every row kept once');
  assert.equal(bandsOf(3, 8, 0).length, 3, 'no more bands than rows');
  assert.equal(blurRadius({ blur: 100 }, 8000, 6000), 133);
  assert.equal(blurRadius({ blur: 0 }, 8000, 6000), 0);
});

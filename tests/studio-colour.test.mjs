// The export's colour where the encoder runs on the processor (src/lib/studio/yuv.ts, export.ts; 2026-11-03): the
// studio's own BT.709 limited-range conversion, in whole numbers, and the export choosing it.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { BT709, BT709_SPACE, rgbaToI420 } from '../src/lib/studio/yuv.ts';

const solid = (w, h, [r, g, b]) => new Uint8ClampedArray(w * h * 4).map((_, i) => [r, g, b, 255][i % 4]);
const planes = (out, w, h) => ({ y: out.subarray(0, w * h), u: out.subarray(w * h, w * h + (w * h) / 4), v: out.subarray(w * h + (w * h) / 4) });

test('BT.709 limited range: black, white and every grey are exact, with chroma neutral', () => {
  for (let k = 0; k <= 255; k++) {
    const { y, u, v } = planes(rgbaToI420(solid(2, 2, [k, k, k]), 2, 2), 2, 2);
    assert.equal(u[0], 128, `grey ${k}: Cb`);
    assert.equal(v[0], 128, `grey ${k}: Cr`);
    assert.equal(y[0], 16 + Math.round((219 * k) / 255), `grey ${k}: Y`);
  }
  for (const c of [BT709.cb, BT709.cr]) assert.equal(c[0] + c[1] + c[2], 0, 'a grey has no colour');
  assert.equal(BT709.y[0] + BT709.y[1] + BT709.y[2], Math.round((219 / 255) * 65536), 'white is 235');
});

test('BT.709 primaries land where the standard puts them (within one level)', () => {
  // 8-bit limited-range BT.709 of full red, green and blue
  const want = { red: [63, 102, 240], green: [173, 42, 26], blue: [32, 240, 118] };
  const got = (rgb) => { const { y, u, v } = planes(rgbaToI420(solid(2, 2, rgb), 2, 2), 2, 2); return [y[0], u[0], v[0]]; };
  for (const [name, rgb] of [['red', [255, 0, 0]], ['green', [0, 255, 0]], ['blue', [0, 0, 255]]]) {
    got(rgb).forEach((c, i) => assert.ok(Math.abs(c - want[name][i]) <= 1, `${name} ${i}: ${c} against ${want[name][i]}`));
  }
  // green is where BT.601 and BT.709 differ most: BT.601 would give Y 145, not 173
  assert.equal(got([0, 255, 0])[0], 173);
});

test('I420 layout: the full Y plane, then each chroma plane at half size, averaged over its 2 by 2 block', () => {
  // 4 x 2: left block red, right block blue
  const rgba = new Uint8ClampedArray(4 * 2 * 4);
  for (let y = 0; y < 2; y++) for (let x = 0; x < 4; x++) rgba.set(x < 2 ? [255, 0, 0, 255] : [0, 0, 255, 255], (y * 4 + x) * 4);
  const out = rgbaToI420(rgba, 4, 2);
  assert.equal(out.length, 4 * 2 * 1.5);
  const { y, u, v } = planes(out, 4, 2);
  assert.deepEqual([...y], [63, 63, 32, 32, 63, 63, 32, 32]);
  assert.equal(u.length, 2);
  assert.deepEqual([u[0], v[0]], [102, 240]);
  assert.deepEqual([u[1], v[1]], [240, 118]);
  // one block half red, half blue: the average colour's chroma
  const mixed = new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 255, 255, 255, 0, 0, 255, 0, 0, 255, 255]);
  const m = planes(rgbaToI420(mixed, 2, 2), 2, 2);
  assert.deepEqual([m.u[0], m.v[0]], [planes(rgbaToI420(solid(2, 2, [128, 0, 128]), 2, 2), 2, 2).u[0], planes(rgbaToI420(solid(2, 2, [128, 0, 128]), 2, 2), 2, 2).v[0]]);
  assert.throws(() => rgbaToI420(new Uint8ClampedArray(3 * 2 * 4), 3, 2), /even/);
});

test('reading pixels as 32-bit words and byte by byte gives the same bytes', () => {
  const w = 16;
  const h = 10;
  let s = 7;
  const data = new Uint8ClampedArray(w * h * 4).map((_, i) => (i % 4 === 3 ? 255 : ((s = (s * 1103515245 + 12345) & 0x7fffffff) >> 16) & 255));
  // a copy one byte into its buffer cannot be read as words
  const shifted = new Uint8ClampedArray(data.length + 1);
  shifted.set(data, 1);
  const unaligned = shifted.subarray(1);
  assert.equal(unaligned.byteOffset % 4, 1);
  assert.deepEqual([...rgbaToI420(unaligned, w, h)], [...rgbaToI420(data, w, h)]);
});

test('the frames carry BT.709 limited range, and the export sends them so wherever the encoder is not on a graphics chip', () => {
  assert.deepEqual({ ...BT709_SPACE }, { primaries: 'bt709', transfer: 'bt709', matrix: 'bt709', fullRange: false });
  const src = fs.readFileSync('src/lib/studio/export.ts', 'utf8');
  assert.match(src, /canEncodeVideo\(vcodec, \{ width: w, height: h, hardwareAcceleration: 'prefer-hardware' \}\)/);
  assert.match(src, /if \(!onChip\) return attempt\('yuv'\);/);
  assert.match(src, /e\.code === 'COLOUR'\) return attempt\('yuv'\)/, 'a chip that fell back is caught and the export starts again');
  assert.match(src, /matrix && matrix !== 'bt709'\) throw new ExportError\('COLOUR'\)/);
  assert.match(src, /format: 'I420'[^}]*colorSpace: \{ \.\.\.BT709_SPACE \}/);
});

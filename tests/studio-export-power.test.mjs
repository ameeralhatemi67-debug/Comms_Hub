// The export on stronger and weaker computers (src/lib/studio/export.ts, yuv.ts, yuv-pipe.ts; MVP_draft.md 62.10;
// Desktop_Power_Ideas.md 5.1: speed may vary, the file may not). The encoder settings, the colour the file says, and
// the BT.709 conversion that the workers are made from.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as mb from 'mediabunny';
import { buildVideoCodecString } from '../node_modules/mediabunny/dist/modules/src/codec.js';
import { HIGH_QP, aimMbps, asBt709, outputSize, videoQuality } from '../src/lib/studio/export.ts';
import { BT709, i420Into, rgbaToI420 } from '../src/lib/studio/yuv.ts';
import { simdModule } from '../src/lib/studio/yuv-simd.ts';
import { RATIOS, FPS_CHOICES, newVideoDoc } from '../src/lib/studio/schema.ts';

const sizes = () => {
  const out = [];
  for (const ratio of Object.keys(RATIOS)) for (const short of [720, 1080, 2160]) out.push({ ratio, short, ...outputSize(newVideoDoc(ratio, 30), short) });
  return out;
};

test('H.264 asks for Mediabunny\'s high quantizer, which the graphics chips take, and the export\'s own rate where an encoder takes none', () => {
  assert.equal(mb.QUALITY_HIGH._toVideoRateControl('avc', 1920, 1080).quantizer, HIGH_QP, 'the quantizer is the one Mediabunny\'s high quality gives');
  for (const { short, w, h } of sizes()) {
    for (const fps of FPS_CHOICES) {
      const rc = videoQuality(mb, 'avc', short, fps)._toVideoRateControl('avc', w, h);
      assert.equal(rc.quantizer, HIGH_QP);
      assert.equal(rc.bitrate, Math.round(aimMbps(short, fps) * 1e6));
      assert.equal(rc.bitrateMode, 'variable');
    }
  }
  assert.deepEqual([aimMbps(720, 30), aimMbps(1080, 30), aimMbps(2160, 30), aimMbps(1080, 60)], [5, 10, 35, 15]);
  assert.equal(videoQuality(mb, 'vp9', 1080, 30), mb.QUALITY_HIGH, 'WebM keeps Mediabunny\'s high quality');
});

test('the codec string, and so the level, a graphics chip is configured with is what it was, in every shape, size and rate', () => {
  for (const { ratio, short, w, h } of sizes()) {
    for (const fps of FPS_CHOICES) {
      const before = buildVideoCodecString('avc', w, h, mb.QUALITY_HIGH._toVideoRateControl('avc', w, h).bitrate);
      const now = buildVideoCodecString('avc', w, h, videoQuality(mb, 'avc', short, fps)._toVideoRateControl('avc', w, h).bitrate);
      assert.equal(now, before, `${ratio} ${short} ${fps}`);
    }
  }
});

test('the canvas way names the transfer BT.709 only where the encoder converted with BT.709 into limited range', () => {
  const edge = { primaries: 'bt709', transfer: 'iec61966-2-1', matrix: 'bt709', fullRange: false };
  assert.equal(asBt709(edge), true);
  assert.deepEqual(edge, { primaries: 'bt709', transfer: 'bt709', matrix: 'bt709', fullRange: false });
  for (const other of [
    { primaries: 'bt709', transfer: 'bt709', matrix: 'bt709', fullRange: false },
    { primaries: 'bt709', transfer: 'iec61966-2-1', matrix: 'bt709', fullRange: true },
    { primaries: 'smpte170m', transfer: 'smpte170m', matrix: 'smpte170m', fullRange: false },
    { primaries: 'bt709', transfer: 'iec61966-2-1', matrix: 'rgb', fullRange: true },
  ]) {
    const copy = { ...other };
    assert.equal(asBt709(copy), false);
    assert.deepEqual(copy, other, 'anything else is left as the encoder said it');
  }
  assert.equal(asBt709(undefined), false);
  const src = fs.readFileSync('src/lib/studio/export.ts', 'utf8');
  assert.match(src, /if \(via === 'canvas'\) asBt709\(meta\?\.decoderConfig\?\.colorSpace\)/);
});

test('the conversion the workers are made from names nothing outside its own text, and gives rgbaToI420\'s bytes', () => {
  const made = new Function(`return (${i420Into.toString()})`)();
  let s = 11;
  for (const [w, h] of [[2, 2], [16, 10], [64, 36]]) {
    const rgba = new Uint8ClampedArray(w * h * 4).map((_, i) => (i % 4 === 3 ? 255 : ((s = (s * 1103515245 + 12345) & 0x7fffffff) >> 16) & 255));
    const dst = new Uint8Array((w * h * 3) / 2);
    made(rgba, w, h, dst);
    assert.deepEqual([...dst], [...rgbaToI420(rgba, w, h)], `${w}x${h}`);
    // and byte by byte where the pixels do not start on a word
    const shifted = new Uint8ClampedArray(rgba.length + 1);
    shifted.set(rgba, 1);
    const odd = new Uint8Array((w * h * 3) / 2);
    made(shifted.subarray(1), w, h, odd);
    assert.deepEqual([...odd], [...dst]);
  }
  const text = i420Into.toString();
  for (const c of [...BT709.y, ...BT709.cb, ...BT709.cr]) assert.ok(text.includes(String(c)), `the coefficient ${c} is written inside`);
});

test("the WebAssembly conversion gives i420Into's bytes in every shape and size, the last columns in plain code", async () => {
  const bytes = simdModule();
  assert.equal(WebAssembly.validate(bytes), true);
  const mod = await WebAssembly.compile(bytes);
  for (const { ratio, short, w, h } of [...sizes().filter((x) => x.short !== 2160), { ratio: 'tail', short: 0, w: 40, h: 6 }, { ratio: 'one block', short: 0, w: 16, h: 2 }]) {
    const size = w * h;
    const memory = new WebAssembly.Memory({ initial: Math.ceil((size * 4 + (size * 3) / 2) / 65536) });
    const { convert } = (await WebAssembly.instantiate(mod, { env: { memory } })).exports;
    const rgba = new Uint8Array(memory.buffer, 0, size * 4);
    let s = w * 31 + h;
    for (let i = 0; i < rgba.length; i++) rgba[i] = i % 4 === 3 ? 255 : ((s = (s * 1103515245 + 12345) & 0x7fffffff) >> 16) & 255;
    // the extremes, where a lane could overflow or a narrowing saturate: black, white, pure colours
    for (const [k, px] of [[0, [0, 0, 0]], [1, [255, 255, 255]], [2, [255, 0, 0]], [3, [0, 255, 0]], [4, [0, 0, 255]], [5, [255, 0, 255]]]) rgba.set([...px, 255], k * 4);
    const out = new Uint8Array(memory.buffer, size * 4, (size * 3) / 2);
    const x1 = w - (w % 16);
    convert(w, h, x1);
    if (x1 < w) i420Into(rgba, w, h, out, x1);
    const want = new Uint8Array((size * 3) / 2);
    i420Into(rgba, w, h, want);
    assert.ok(Buffer.from(out).equals(Buffer.from(want)), `${ratio} ${short}: ${w}x${h}`);
  }
});

test('the workers are offered and the page stays the way where they cannot be made', () => {
  const src = fs.readFileSync('src/lib/studio/export.ts', 'utf8');
  assert.match(src, /e\.code === 'YUV_WORKER'\) return run\(via, 0\)/, 'a failed worker starts the export again on the page');
  assert.match(src, /rgbaToI420\(ctx\.getImageData\(0, 0, w, h\)\.data, w, h\)/, 'the page\'s conversion is kept');
  const pipe = fs.readFileSync('src/lib/studio/yuv-pipe.ts', 'utf8');
  assert.match(pipe, /const i420Into = \$\{i420Into\.toString\(\)\}/);
  assert.match(pipe, /format: 'RGBA', colorSpace: 'srgb'/);
});

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
  assert.match(src, /code === 'YUV_WORKER' && workers > 0\) workers = 0;/, 'a failed worker starts the export again on the page');
  assert.match(src, /rgbaToI420\(ctx\.getImageData\(0, 0, w, h\)\.data, w, h\)/, 'the page\'s conversion is kept');
  const pipe = fs.readFileSync('src/lib/studio/yuv-pipe.ts', 'utf8');
  assert.match(pipe, /const i420Into = \$\{i420Into\.toString\(\)\}/);
  assert.match(pipe, /format: 'RGBA', colorSpace: 'srgb'/);
});

test('the sound\'s key (P-15) changes with everything the mix depends on and not with what moves only the picture', async () => {
  const { soundKey } = await import('../src/lib/studio/loudness-ahead.ts');
  const tl = await import('../src/lib/studio/timeline.ts');
  const { US } = await import('../src/lib/studio/schema.ts');
  let doc = newVideoDoc('16:9', 30);
  const a = tl.addSource(doc, { kind: 'library', asset: 'aaaaaaaa-0000-4000-8000-000000000001', version: 1, name: 'a.mp4', media: 'video', duration: 10 * US, w: 1920, h: 1080 });
  const placed = tl.addClip(a.doc, { source: a.id, start: 0, length: 4 * US, in: 0 });
  doc = placed.doc;
  const clip = placed.clipId;
  const key = soundKey(doc);
  const same = (d, what) => assert.equal(soundKey(d), key, `${what} leaves the key`);
  const changed = (d, what) => assert.notEqual(soundKey(d), key, `${what} changes the key`);
  same(tl.updateClip(doc, clip, { transform: { x: 10, y: 20, scale: 0.5, rotation: 3, opacity: 0.5 } }), 'moving the picture');
  same(tl.updateClip(doc, clip, { crop: { l: 0.1, t: 0, r: 0, b: 0 }, adjust: { brightness: 10, contrast: 0, saturation: 0 }, fit: 'cover' }), 'cropping and adjusting');
  same(tl.updateClip(doc, clip, { animIn: { kind: 'fade', length: US } }), 'an entry movement');
  same(tl.addClip(doc, { text: { content: 'عنوان' }, start: 0, length: US }).doc, 'a text inside the length');
  changed(tl.updateClip(doc, clip, { volume: 0.5 }), 'the volume');
  changed(tl.updateClip(doc, clip, { mute: true }), 'muting the clip');
  changed(tl.updateClip(doc, clip, { fadeIn: US / 2 }), 'a fade');
  changed(tl.updateClip(doc, clip, { in: US }), 'where it starts in its source');
  changed(tl.moveClip(doc, clip, US), 'where it sits in time');
  changed(tl.setSpeed(doc, clip, 2), 'its speed');
  changed(tl.setTrack(doc, doc.video.tracks.find((t) => t.clips.length).id, { muted: true }), 'muting its track');
  changed(tl.setTrackSound(doc, doc.video.tracks.find((t) => t.clips.length).id, { role: 'music', duck: 6 }), 'the track\'s role and lowering');
  changed({ ...doc, sources: doc.sources.map((s) => ({ ...s, version: 2 })) }, 'a new version of the source');
  changed(tl.addClip(doc, { text: { content: 'بعد' }, start: 6 * US, length: US }).doc, 'a text that makes the project longer');
});

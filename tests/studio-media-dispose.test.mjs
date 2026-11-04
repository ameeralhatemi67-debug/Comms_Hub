// A closed project stops what its files still have under way (src/lib/studio/media.ts dispose and forget; D10, found on
// 2026-11-04 when a no-chip row kept the processor busy after its media were let go). Mediabunny ends a pass only when its
// consumer returns or its input is disposed; the pool now disposes its files' inputs, the original's and the light
// copy's. Decoding needs WebCodecs, which Node lacks, but a packet pass checks the same disposal, so a real Mediabunny
// input over a small MP4 made here shows a pass under way ending at the moment the pool closes.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as mb from 'mediabunny';
import { MediaPool } from '../src/lib/studio/media.ts';

/** Ten seconds of a 64 x 64 H.264 track at 30 frames a second, a key frame every two seconds; the bytes are not pictures. */
async function mp4() {
  const out = new mb.Output({ format: new mb.Mp4OutputFormat(), target: new mb.BufferTarget() });
  const src = new mb.EncodedVideoPacketSource('avc');
  out.addVideoTrack(src, { frameRate: 30 });
  await out.start();
  const description = new Uint8Array([1, 0x64, 0, 0x28, 0xff, 0xe0, 0x00]);
  for (let i = 0; i < 300; i++) {
    const pkt = new mb.EncodedPacket(new Uint8Array(64).fill(i & 0xff), i % 60 === 0 ? 'key' : 'delta', i / 30, 1 / 30);
    await src.add(pkt, i === 0 ? { decoderConfig: { codec: 'avc1.640028', codedWidth: 64, codedHeight: 64, description } } : undefined);
  }
  await out.finalize();
  return out.target.buffer;
}

const inputOf = (buf) => new mb.Input({ source: new mb.BufferSource(buf), formats: mb.ALL_FORMATS });

/** Reads the track's packets, calling `stop` after the fifth: how many were read, and what ended the pass. */
async function passUntil(input, stop) {
  const sink = new mb.EncodedPacketSink(await input.getPrimaryVideoTrack());
  let n = 0;
  try {
    for await (const p of sink.packets()) {
      void p;
      n++;
      if (n === 5) stop();
    }
    return { n, ended: 'the end of the file' };
  } catch (e) {
    return { n, ended: e instanceof mb.InputDisposedError ? 'disposed' : String(e) };
  }
}

/** A pool holding one video source whose reader is `input` (and a light copy's, when given), as load() and openPreview() leave it. */
function poolWith(input, preview = null) {
  const pool = new MediaPool({ cache: null, onChange: () => undefined });
  const source = { id: 's1', kind: 'local', key: 'k', name: 'a.mp4', media: 'video', mime: 'video/mp4', size: 1, w: 64, h: 64, duration: 10e6 };
  pool.loaded.set('s1', { source, file: null, url: '', input, hasVideo: true, ...(preview ? { preview: { input: preview, url: '', name: 'copy', height: 64, offset: 0 } } : {}) });
  return pool;
}

test('a pass on a file reads to its end when nothing stops it (the fixture is a real file)', async () => {
  const r = await passUntil(inputOf(await mp4()), () => undefined);
  assert.deepEqual(r, { n: 300, ended: 'the end of the file' });
});

test('closing the pool ends a pass still under way on its file, at once', async () => {
  const input = inputOf(await mp4());
  const pool = poolWith(input);
  const r = await passUntil(input, () => pool.dispose());
  assert.equal(r.ended, 'disposed');
  assert.equal(r.n, 5);
});

test('closing the pool ends the light copy\'s passes too', async () => {
  const buf = await mp4();
  const original = inputOf(buf);
  const copy = inputOf(buf);
  const pool = poolWith(original, copy);
  const [a, b] = await Promise.all([passUntil(copy, () => pool.dispose()), passUntil(original, () => undefined)]);
  assert.equal(a.ended, 'disposed');
  assert.equal(b.ended, 'disposed');
  assert.ok(b.n < 300, 'the original stopped before its end');
});

test('a source the pool forgets (a converted copy replaces it) has its passes ended as well', async () => {
  const input = inputOf(await mp4());
  const pool = poolWith(input);
  const r = await passUntil(input, () => pool.forget('s1'));
  assert.equal(r.ended, 'disposed');
  assert.equal(pool.info('s1'), null);
  pool.dispose();
});

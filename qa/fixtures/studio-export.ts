// Fixture of the studio's export (Studio_Build_Plan.md Phase 4), bundled by qa/studio-export.cjs from
// the real modules and run in headless Edge. The page exports projects built from ffmpeg-made media and
// hands each file back to Node, where ffprobe and ffmpeg check it.
import * as schema from '../../src/lib/studio/schema.ts';
import * as timeline from '../../src/lib/studio/timeline.ts';
import * as media from '../../src/lib/studio/media.ts';
import * as cache from '../../src/lib/studio/cache.ts';
import { exportVideo, exportStill, estimateBytes, outputSize } from '../../src/lib/studio/export.ts';
import { loadAssets } from '../../src/lib/motion/renderers.js';

const US = schema.US;
const RGB = '00000000-0000-4000-8000-0000000000a1';
const SYNC = '00000000-0000-4000-8000-0000000000c1';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function ready(pool: media.MediaPool, ids: string[]) {
  for (let i = 0; i < 400; i++) {
    if (ids.every((id) => pool.state(id)?.kind === 'ready')) return true;
    await sleep(50);
  }
  return false;
}

async function b64(file: Blob) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000) as unknown as number[]);
  return btoa(bin);
}

export async function run() {
  const out: Record<string, unknown> = {};
  await loadAssets();
  const root = await navigator.storage.getDirectory();
  for (const d of [cache.CACHE_DIR, 'studio-exports', 'studio-manifest.json']) await root.removeEntry(d, { recursive: true }).catch(() => undefined);
  const dc = await cache.DeviceCache.open();
  const pool = new media.MediaPool({ cache: dc, onChange: () => undefined });

  // A: the colours, split at 2 s, the second part moved to 3 s (one second of background between)
  let a = schema.newVideoDoc('16:9', 30);
  let r = timeline.addSource(a, { kind: 'library', asset: RGB, version: 1, name: 'ألوان.mp4', media: 'video', duration: 6 * US, w: 640, h: 360 });
  a = r.doc;
  const vid = r.id;
  const c = timeline.addClip(a, { source: vid, start: 0, length: 6 * US, in: 0 });
  const s = timeline.splitClip(c.doc, c.clipId, 2 * US);
  a = timeline.moveClip(s.doc, s.secondId!, 3 * US);
  pool.ensure(a);
  out.readyA = await ready(pool, [vid]);
  const progress: number[] = [];
  const t0 = performance.now();
  const ra = await exportVideo(a, pool, { short: 720, format: 'mp4', name: 'ألوان.mp4', onProgress: (p) => p.phase === 'encode' && progress.push(p.done) });
  out.a = { b64: await b64(ra.file), bytes: ra.bytes, frames: ra.frames, target: ra.target, audio: ra.audio, ms: Math.round(performance.now() - t0), lastProgress: progress[progress.length - 1], size: outputSize(a, 720), estimate: estimateBytes(a, 720) };

  // C: the same at half volume
  const half = timeline.updateClip(timeline.updateClip(a, c.clipId, { volume: 0.5 }), s.secondId!, { volume: 0.5 });
  const rc = await exportVideo(half, pool, { short: 720, format: 'mp4', name: 'نصف.mp4' });
  out.c = { b64: await b64(rc.file) };

  // B: flashes and beeps at 1 s and 3 s, for picture and sound in step
  let b = schema.newVideoDoc('16:9', 30);
  r = timeline.addSource(b, { kind: 'library', asset: SYNC, version: 1, name: 'تزامن.mp4', media: 'video', duration: 5 * US, w: 640, h: 360 });
  b = r.doc;
  const sid = r.id;
  b = timeline.addClip(b, { source: sid, start: 0, length: 5 * US, in: 0 }).doc;
  pool.ensure(b);
  out.readyB = await ready(pool, [sid]);
  const rb = await exportVideo(b, pool, { short: 720, format: 'mp4', name: 'تزامن.mp4' });
  out.b = { b64: await b64(rb.file) };

  // D: a still of A at 5 s (the second part, blue)
  const still = await exportStill(a, pool, { t: 5 * US, name: 'لقطة.png' });
  out.d = { b64: await b64(still), type: still.type };

  // the export was written through the browser's private storage
  const dir = await root.getDirectoryHandle('studio-exports');
  const names: string[] = [];
  for await (const [k] of (dir as unknown as { entries(): AsyncIterable<[string, unknown]> }).entries()) names.push(k);
  out.opfs = names;
  pool.dispose();
  return out;
}

(window as unknown as { studioExport: typeof run }).studioExport = run;

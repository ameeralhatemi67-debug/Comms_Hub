// Fixture of the studio's export (Studio_Build_Plan.md Phase 4), bundled by qa/studio-export.cjs from
// the real modules and run in headless Edge. The page exports projects built from ffmpeg-made media and
// hands each file back to Node, where ffprobe and ffmpeg check it.
import * as schema from '../../src/lib/studio/schema.ts';
import * as timeline from '../../src/lib/studio/timeline.ts';
import * as media from '../../src/lib/studio/media.ts';
import * as cache from '../../src/lib/studio/cache.ts';
import { exportVideo, exportStill, estimateBytes, outputSize, measureLoudness } from '../../src/lib/studio/export.ts';
import { normalizeGain } from '../../src/lib/studio/loudness.ts';
import { setShapes, docForShape } from '../../src/lib/studio/reframe.ts';
import * as photoLib from '../../src/lib/studio/photo.ts';
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

  // E, F, G (MVP_draft.md 62.7): the colours at 2x, on a ramp from 1x to 3x, and reversed; all silent
  const lone = (over: Partial<schema.Clip>) => timeline.addClip({ ...a, video: { ...a.video!, tracks: a.video!.tracks.map((tr) => ({ ...tr, clips: [] })) } }, { source: vid, start: 0, length: 3 * US, in: 0, ...over });
  const e = lone({ speed: 2 });
  const re = await exportVideo(e.doc, pool, { short: 720, format: 'mp4', name: 'سريع.mp4' });
  out.e = { b64: await b64(re.file), frames: re.frames, audio: re.audio };
  const f0 = lone({ length: 3 * US });
  const f = timeline.setSpeedKeys(f0.doc, f0.clipId, { speed: [{ t: 0, v: 1 }, { t: 2 * US, v: 3 }] });
  const rf = await exportVideo(f, pool, { short: 720, format: 'mp4', name: 'متدرج.mp4' });
  out.f = { b64: await b64(rf.file), frames: rf.frames, length: timeline.locate(f, f0.clipId)!.clip.length };
  const g = lone({ length: 6 * US, reverse: true });
  const rg = await exportVideo(g.doc, pool, { short: 720, format: 'mp4', name: 'معكوس.mp4' });
  out.g = { b64: await b64(rg.file), frames: rg.frames };

  // H (MVP_draft.md 62.9): A measured by the studio's BS.1770 meter, then exported with «توحيد مستوى الصوت»
  const ma = await measureLoudness(a, pool);
  const gain = normalizeGain(ma);
  const rh = await exportVideo(a, pool, { short: 720, format: 'mp4', name: 'موحد.mp4', gain });
  out.h = { b64: await b64(rh.file), measured: ma.integrated, peak: ma.peakDb, gainDb: 20 * Math.log10(gain) };

  // I (MVP_draft.md 62.10): A in its own shape and in a square, one file each
  const shaped = setShapes(a, ['1:1']);
  const ri = await exportVideo(docForShape(shaped, '1:1'), pool, { short: 720, format: 'mp4', name: 'مربع.mp4' });
  out.i = { b64: await b64(ri.file) };
  // J: a photo project whose layer is the frame at 5 s of the video, exported as a PNG
  let ph = schema.newPhotoDoc(640, 360);
  const phs = timeline.addSource(ph, { kind: 'library', asset: RGB, version: 1, name: 'ألوان.mp4', media: 'video', duration: 6 * US, w: 640, h: 360 });
  ph = photoLib.addLayer(phs.doc, { source: phs.id, at: 5 * US }).doc;
  pool.ensure(ph);
  await ready(pool, [phs.id]);
  const pj = await exportStill(ph, pool, { name: 'إطار.png' });
  out.j = { b64: await b64(pj) };

  // the export was written through the browser's private storage
  const dir = await root.getDirectoryHandle('studio-exports');
  const names: string[] = [];
  for await (const [k] of (dir as unknown as { entries(): AsyncIterable<[string, unknown]> }).entries()) names.push(k);
  out.opfs = names;
  pool.dispose();
  return out;
}

(window as unknown as { studioExport: typeof run }).studioExport = run;

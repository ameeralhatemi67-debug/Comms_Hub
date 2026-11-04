// Fixture of qa/studio-shapes-onepass.cjs (Desktop_Power_Ideas.md P-05; MVP_draft.md 62.10): a project in four shapes
// exported in one pass (shapes.ts) and one shape after another (export.ts), every composed frame fingerprinted.
import * as schema from '../../src/lib/studio/schema.ts';
import * as timeline from '../../src/lib/studio/timeline.ts';
import * as media from '../../src/lib/studio/media.ts';
import * as cache from '../../src/lib/studio/cache.ts';
import { exportVideo } from '../../src/lib/studio/export.ts';
import { exportShapes } from '../../src/lib/studio/shapes.ts';
import { docForShape, setShapes } from '../../src/lib/studio/reframe.ts';
import { defaultText, loadFonts, usedFonts } from '../../src/lib/studio/text.ts';

export const REAL = '00000000-0000-4000-8000-0000000000f3';
const SHAPES = ['16:9', '9:16', '1:1', '4:5'] as schema.Ratio[];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fingerprint(frame: VideoFrame): Promise<string> {
  const w = frame.displayWidth;
  const h = frame.displayHeight;
  const px = new Uint32Array(w * h);
  await frame.copyTo(px, { rect: { x: 0, y: 0, width: w, height: h }, format: 'RGBA', colorSpace: 'srgb' });
  frame.close();
  let a = 0x811c9dc5;
  let b = 0x9e3779b9;
  for (let i = 0; i < px.length; i++) {
    a = Math.imul(a ^ px[i], 16777619);
    b = Math.imul(b + px[i], 2246822519) ^ (b >>> 13);
  }
  return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0');
}

async function upload(tag: string, file: File) {
  const piece = 64 << 20;
  for (let at = 0; at < file.size; at += piece) await fetch(`/upload/${tag}.mp4?at=${at}`, { method: 'POST', body: file.slice(at, at + piece) });
}

export async function run(o: { seconds: number; short: 720 | 1080 }) {
  const root = await navigator.storage.getDirectory();
  for (const d of [cache.CACHE_DIR, 'studio-exports', 'studio-manifest.json']) await root.removeEntry(d, { recursive: true }).catch(() => undefined);
  const pool = new media.MediaPool({ cache: await cache.DeviceCache.open(), onChange: () => undefined });
  let doc = schema.newVideoDoc('16:9', 30);
  const r = timeline.addSource(doc, { kind: 'library', asset: REAL, version: 1, name: 'مصدر.mp4', media: 'video', duration: o.seconds * schema.US, w: 1920, h: 1080 });
  doc = timeline.addClip(r.doc, { source: r.id, start: 0, length: o.seconds * schema.US, in: 0 }).doc;
  doc = timeline.addClip(doc, { text: { ...defaultText('الاتصال المؤسسي 2026'), weight: 700, size: 96 }, start: 0, length: o.seconds * schema.US }).doc;
  doc = setShapes(doc, SHAPES.slice(1));
  pool.ensure(doc);
  for (let i = 0; i < 600 && pool.state(r.id)?.kind !== 'ready'; i++) await sleep(50);
  await loadFonts(usedFonts(doc));
  const docs = SHAPES.map((s) => docForShape(doc, s));

  // one shape after another, as the panel did
  const alone: { prints: string[]; ms: number; via: string }[] = [];
  const t0 = performance.now();
  for (const [i, d] of docs.entries()) {
    const prints: string[] = [];
    const t = performance.now();
    const res = await exportVideo(d, pool, { short: o.short, format: 'mp4', name: `alone-${i}.mp4`, inspect: async (n, f) => void (prints[n] = await fingerprint(f)) });
    await upload(`alone-${i}`, res.file);
    alone.push({ prints, ms: Math.round(performance.now() - t), via: res.via });
  }
  const aloneMs = Math.round(performance.now() - t0);

  // all four in one pass
  const together: string[][] = SHAPES.map(() => []);
  const t1 = performance.now();
  const results = await exportShapes(docs.map((d, i) => ({ doc: d, name: `together-${i}.mp4` })), pool, { short: o.short, format: 'mp4', inspect: async (s, n, f) => void (together[s][n] = await fingerprint(f)) });
  const togetherMs = Math.round(performance.now() - t1);
  for (const [i, res] of results.entries()) await upload(`together-${i}`, res.file);
  pool.dispose();
  return { shapes: SHAPES, alone, aloneMs, together: together.map((prints, i) => ({ prints, via: results[i].via, steps: results[i].steps })), togetherMs };
}

/** Timing only, no fingerprints: one after another, then one pass. */
export async function timed(o: { seconds: number; short: 720 | 1080 }) {
  const root = await navigator.storage.getDirectory();
  for (const d of [cache.CACHE_DIR, 'studio-exports', 'studio-manifest.json']) await root.removeEntry(d, { recursive: true }).catch(() => undefined);
  const pool = new media.MediaPool({ cache: await cache.DeviceCache.open(), onChange: () => undefined });
  let doc = schema.newVideoDoc('16:9', 30);
  const r = timeline.addSource(doc, { kind: 'library', asset: REAL, version: 1, name: 'مصدر.mp4', media: 'video', duration: o.seconds * schema.US, w: 1920, h: 1080 });
  doc = timeline.addClip(r.doc, { source: r.id, start: 0, length: o.seconds * schema.US, in: 0 }).doc;
  doc = timeline.addClip(doc, { text: { ...defaultText('الاتصال المؤسسي 2026'), weight: 700, size: 96 }, start: 0, length: o.seconds * schema.US }).doc;
  doc = setShapes(doc, SHAPES.slice(1));
  pool.ensure(doc);
  for (let i = 0; i < 600 && pool.state(r.id)?.kind !== 'ready'; i++) await sleep(50);
  await loadFonts(usedFonts(doc));
  const docs = SHAPES.map((s) => docForShape(doc, s));
  const t0 = performance.now();
  for (const [i, d] of docs.entries()) await exportVideo(d, pool, { short: o.short, format: 'mp4', name: `alone-${i}.mp4` });
  const alone = Math.round(performance.now() - t0);
  const t1 = performance.now();
  await exportShapes(docs.map((d, i) => ({ doc: d, name: `together-${i}.mp4` })), pool, { short: o.short, format: 'mp4' });
  const together = Math.round(performance.now() - t1);
  pool.dispose();
  return { alone, together };
}

(window as unknown as { shapecheck: object }).shapecheck = { run, timed };

// Fixture of qa/studio-export-draw.cjs (Desktop_Power_Ideas.md P-07; MVP_draft.md 62.10): the export's drawing in
// workers (drawers.ts, export-draw.ts) against the page's. Every frame of the corpus (bench-docs.ts) is composed on
// the page, as the export composes it (a default 2D canvas at the output size), and by drawing workers from the same
// synthetic sources sent as ImageBitmaps; both are read back the same way (VideoFrame.copyTo) and hashed. Then real
// three-second exports with drawers and without, for the runner to compare packet by packet.
import { corpus } from '../../src/lib/studio/bench-docs.ts';
import { SyntheticSources } from '../../src/lib/studio/bench.ts';
import { composeFrame } from '../../src/lib/studio/compose.ts';
import * as schema from '../../src/lib/studio/schema.ts';
import * as timeline from '../../src/lib/studio/timeline.ts';
import * as media from '../../src/lib/studio/media.ts';
import * as cache from '../../src/lib/studio/cache.ts';
import { exportVideo } from '../../src/lib/studio/export.ts';
import { Drawers, loadedFaces } from '../../src/lib/studio/drawers.ts';
import { defaultText, loadFonts, usedFonts } from '../../src/lib/studio/text.ts';
import { sourceTime } from '../../src/lib/studio/speed.ts';
import { loadSticker, MotionRenderer } from '../../src/lib/studio/motion-adapter.ts';
import { loadAssets } from '../../src/lib/motion/renderers.js';
import { SYNTHETIC_IMAGE, SYNTHETIC_VIDEO } from '../../src/lib/studio/bench-docs.ts';

export const REAL = '00000000-0000-4000-8000-0000000000f1';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const make = () => new Worker('/export-draw.js', { type: 'module', name: 'export-draw' });

async function sha256(bytes: BufferSource): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return [...d].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function pixels(frame: VideoFrame, w: number, h: number): Promise<Uint8Array<ArrayBuffer>> {
  const rgba = new Uint8Array(w * h * 4);
  await frame.copyTo(rgba, { rect: { x: 0, y: 0, width: w, height: h }, format: 'RGBA', colorSpace: 'srgb' });
  frame.close();
  return rgba;
}

/** Where two frames differ: the largest difference of a channel, how many pixels, and the box around them. */
function difference(a: Uint8Array, b: Uint8Array, w: number) {
  let max = 0;
  let count = 0;
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  for (let i = 0; i < a.length; i += 4) {
    const d = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2]), Math.abs(a[i + 3] - b[i + 3]));
    if (!d) continue;
    count++;
    if (d > max) max = d;
    const p = i / 4;
    const x = p % w;
    const y = (p - x) / w;
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  return { max, pixels: count, box: count ? [x0, y0, x1, y1] : null };
}

export async function prepare() {
  await loadAssets();
  for (const k of schema.STICKERS) await loadSticker(k);
  const docs = corpus();
  const fonts = await loadFonts(docs.flatMap((c) => usedFonts(c.doc)));
  const faces = loadedFaces();
  return { fonts, faces: faces ? faces.length : null, docs: docs.map((c) => ({ name: c.name, frames: c.times.length })) };
}

/** Every frame of the corpus, composed on the page and by `count` drawing workers, hashed alike. */
export async function parity(count = 2) {
  const out: { name: string; i: number; size: string; page: string; worker: string; diff?: ReturnType<typeof difference> }[] = [];
  const src = new SyntheticSources(0);
  for (const c of corpus()) {
    const { w, h } = schema.canvasOf(c.doc);
    const picture = await createImageBitmap(src.picture() as ImageBitmapSource);
    const ids = new Map(c.doc.sources.map((s) => [s.id, s.kind === 'library' ? s.asset : '']));
    const pool = { image: (id: string) => (ids.get(id) === SYNTHETIC_IMAGE ? picture : null) } as unknown as media.MediaPool;
    const drawers = await Drawers.open(c.doc, pool, { w, h, watermark: null, count, make });
    if (!drawers) throw new Error(`no drawers for ${c.name}`);
    const motion = new MotionRenderer();
    try {
      for (let i = 0; i < c.times.length; i++) {
        const t = c.times[i];
        // the page, as the export draws: a default canvas
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d')!;
        composeFrame(ctx, c.doc, t, src.resolver(c.doc, motion), { scale: 1 });
        const pagePx = await pixels(new VideoFrame(canvas, { timestamp: t }), w, h);
        // the workers, from the same sources as the export sends them
        const frames: [string, ImageBitmap | null][] = [];
        for (const tr of c.doc.video?.tracks ?? []) {
          for (const clip of tr.clips) {
            if (t < clip.start || t >= clip.start + clip.length) continue;
            // the frame the compositor asks for: the clip's own source time (compose.ts, as the export decodes it)
            if (ids.get(clip.source ?? '') === SYNTHETIC_VIDEO) frames.push([clip.id, await createImageBitmap(src.videoAt(sourceTime(clip, t)) as ImageBitmapSource)]);
          }
        }
        const workerPx = await pixels(await drawers.draw(t, 33333, frames), w, h);
        const page = await sha256(pagePx);
        const worker = await sha256(workerPx);
        out.push({ name: c.name, i, size: `${w}x${h}`, page, worker, ...(page !== worker ? { diff: difference(pagePx, workerPx, w) } : {}) });
      }
    } finally {
      drawers.close();
      picture.close();
    }
  }
  return out;
}

/** A real three-second 1080p export, with `drawers` drawing workers or on the page; the file goes to the server. */
export async function exportReal(o: { tag: string; drawers: number; titled?: boolean; broken?: boolean }) {
  const root = await navigator.storage.getDirectory();
  for (const d of [cache.CACHE_DIR, 'studio-exports', 'studio-manifest.json']) await root.removeEntry(d, { recursive: true }).catch(() => undefined);
  const dc = await cache.DeviceCache.open();
  const pool = new media.MediaPool({ cache: dc, onChange: () => undefined });
  let doc = schema.newVideoDoc('16:9', 30);
  const r = timeline.addSource(doc, { kind: 'library', asset: REAL, version: 1, name: 'مصدر.mp4', media: 'video', duration: 3 * schema.US, w: 1920, h: 1080 });
  doc = timeline.addClip(r.doc, { source: r.id, start: 0, length: 3 * schema.US, in: 0 }).doc;
  // a title over it, so the workers draw Arabic text with the page's fonts
  if (o.titled) doc = timeline.addClip(doc, { text: { ...defaultText('الاتصال المؤسسي 2026'), weight: 700, size: 96 }, start: 0, length: 3 * schema.US }).doc;
  pool.ensure(doc);
  for (let i = 0; i < 400 && pool.state(r.id)?.kind !== 'ready'; i++) await sleep(50);
  await loadFonts(usedFonts(doc));
  const t0 = performance.now();
  // a worker whose file is missing: it cannot start, as where workers are refused
  const broken = () => new Worker('/missing-draw.js', { type: 'module' });
  const res = await exportVideo(doc, pool, { short: 1080, format: 'mp4', name: 'proof.mp4', drawers: o.drawers, makeDrawer: o.broken ? broken : make });
  const ms = Math.round(performance.now() - t0);
  await fetch(`/upload/${o.tag}.mp4`, { method: 'POST', body: res.file });
  pool.dispose();
  return { tag: o.tag, frames: res.frames, bytes: res.bytes, ms, via: res.via, drawers: res.drawers, steps: res.steps, yuvSimd: res.yuvSimd };
}

export async function engine() {
  const gl = document.createElement('canvas').getContext('webgl') as WebGLRenderingContext | null;
  const info = gl?.getExtension('WEBGL_debug_renderer_info');
  const mb = await import('mediabunny');
  return { renderer: gl && info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : null, onChip: await mb.canEncodeVideo('avc', { width: 1920, height: 1080, hardwareAcceleration: 'prefer-hardware' }) };
}

(window as unknown as { drawcheck: object }).drawcheck = { prepare, parity, exportReal, engine };

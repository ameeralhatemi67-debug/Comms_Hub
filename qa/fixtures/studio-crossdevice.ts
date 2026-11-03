// Fixture of the cross-device proof (Desktop_Power_Ideas.md P-37 and P-38, section 5.2; MVP_draft.md 63.6; phase D9),
// bundled by qa/studio-crossdevice.cjs from the real modules and run in Edge and inside the development package on
// each graphics chip. It draws the corpus of bench-docs.ts with the real compositor at each document's own size
// and times, from synthetic sources whose pixels are the same everywhere, and:
//   - hashes every composed frame, twice, in two different orders (the same machine must give the same frame);
//   - in the reference engine, hands each frame to the server as a PNG;
//   - elsewhere, compares each frame with the reference's, pixel by pixel;
//   - exports a real three-second video through the studio's own export (decoding included) for ffprobe.
import { corpus } from '../../src/lib/studio/bench-docs.ts';
import { SyntheticSources } from '../../src/lib/studio/bench.ts';
import { composeFrame } from '../../src/lib/studio/compose.ts';
import * as schema from '../../src/lib/studio/schema.ts';
import * as timeline from '../../src/lib/studio/timeline.ts';
import * as media from '../../src/lib/studio/media.ts';
import * as cache from '../../src/lib/studio/cache.ts';
import { exportVideo } from '../../src/lib/studio/export.ts';
import { loadFonts, usedFonts } from '../../src/lib/studio/text.ts';
import { loadSticker, MotionRenderer } from '../../src/lib/studio/motion-adapter.ts';
import { loadAssets } from '../../src/lib/motion/renderers.js';

export const REAL = '00000000-0000-4000-8000-0000000000f1';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Frame = { name: string; i: number; t: number; w: number; h: number; hash: string };

async function sha256(bytes: Uint8ClampedArray): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return [...d].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** A seeded shuffle, the same order on every machine. */
function shuffled<T>(xs: T[], seed = 9): T[] {
  const out = [...xs];
  let s = seed;
  for (let i = out.length - 1; i > 0; i--) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export async function prepare() {
  await loadAssets();
  for (const k of schema.STICKERS) await loadSticker(k);
  const docs = corpus();
  const fonts = docs.flatMap((c) => usedFonts(c.doc));
  return { fonts: await loadFonts(fonts), docs: docs.map((c) => ({ name: c.name, frames: c.times.length })) };
}

/** Draws one frame of a corpus document at its own size and returns its pixels. */
function drawFrame(doc: schema.ProjectDoc, t: number, src: SyntheticSources, motion: MotionRenderer): ImageData {
  const { w, h } = schema.canvasOf(doc);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  composeFrame(ctx, doc, t, src.resolver(doc, motion), { scale: 1 });
  return ctx.getImageData(0, 0, w, h);
}

/** Every frame of the corpus, in order or in the shuffled order; with `upload`, each also goes to the server as a PNG. */
export async function draw(o: { order: 'forward' | 'shuffled'; upload?: boolean }): Promise<Frame[]> {
  const all = corpus();
  const jobs = all.flatMap((c) => c.times.map((t, i) => ({ c, t, i })));
  const src = new SyntheticSources(0);
  const motions = new Map(all.map((c) => [c.name, new MotionRenderer()]));
  const out: Frame[] = [];
  for (const { c, t, i } of o.order === 'shuffled' ? shuffled(jobs) : jobs) {
    const img = drawFrame(c.doc, t, src, motions.get(c.name)!);
    out.push({ name: c.name, i, t, w: img.width, h: img.height, hash: await sha256(img.data) });
    if (o.upload) {
      const canvas = new OffscreenCanvas(img.width, img.height);
      canvas.getContext('2d')!.putImageData(img, 0, 0);
      const png = await canvas.convertToBlob({ type: 'image/png' });
      await fetch(`/frame/${c.name}/${i}`, { method: 'POST', body: png });
    }
  }
  return out.sort((a, b) => (a.name === b.name ? a.i - b.i : a.name < b.name ? -1 : 1));
}

/** Each frame against the reference's PNG: the largest difference of a channel, the share above 2 levels, PSNR. */
export async function compare(): Promise<{ name: string; i: number; maxDiff: number; over2: number; psnr: number }[]> {
  const all = corpus();
  const src = new SyntheticSources(0);
  const out = [];
  for (const c of all) {
    const motion = new MotionRenderer();
    for (let i = 0; i < c.times.length; i++) {
      const mine = drawFrame(c.doc, c.times[i], src, motion).data;
      const png = await (await fetch(`/ref/${c.name}/${i}.png`)).blob();
      const bmp = await createImageBitmap(png, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
      const canvas = new OffscreenCanvas(bmp.width, bmp.height);
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(bmp, 0, 0);
      const ref = ctx.getImageData(0, 0, bmp.width, bmp.height).data;
      let maxDiff = 0;
      let over = 0;
      let sum = 0;
      let n = 0;
      for (let p = 0; p < ref.length; p += 4) {
        for (let k = 0; k < 3; k++) {
          const d = Math.abs(ref[p + k] - mine[p + k]);
          if (d > maxDiff) maxDiff = d;
          if (d > 2) over++;
          sum += d * d;
          n++;
        }
      }
      const mse = sum / n;
      out.push({ name: c.name, i, maxDiff, over2: Math.round((over / n) * 1e6) / 1e4, psnr: mse === 0 ? 99 : Math.round(10 * Math.log10((255 * 255) / mse) * 100) / 100 });
    }
  }
  return out;
}

/** A real three-second video through the studio's export, decoding included; the file goes to the server. */
export async function exportReal(engine: string) {
  const root = await navigator.storage.getDirectory();
  for (const d of [cache.CACHE_DIR, 'studio-exports', 'studio-manifest.json']) await root.removeEntry(d, { recursive: true }).catch(() => undefined);
  const dc = await cache.DeviceCache.open();
  const pool = new media.MediaPool({ cache: dc, onChange: () => undefined });
  let doc = schema.newVideoDoc('16:9', 30);
  const r = timeline.addSource(doc, { kind: 'library', asset: REAL, version: 1, name: 'مصدر.mp4', media: 'video', duration: 3 * schema.US, w: 1920, h: 1080 });
  doc = timeline.addClip(r.doc, { source: r.id, start: 0, length: 3 * schema.US, in: 0 }).doc;
  pool.ensure(doc);
  for (let i = 0; i < 400 && pool.state(r.id)?.kind !== 'ready'; i++) await sleep(50);
  const t0 = performance.now();
  const res = await exportVideo(doc, pool, { short: 1080, format: 'mp4', name: 'proof.mp4' });
  const ms = Math.round(performance.now() - t0);
  await fetch(`/upload/${engine}.mp4`, { method: 'POST', body: res.file });
  pool.dispose();
  return { frames: res.frames, bytes: res.bytes, audio: res.audio, target: res.target, ms };
}

function renderer(): string {
  const gl = document.createElement('canvas').getContext('webgl');
  const ext = gl?.getExtension('WEBGL_debug_renderer_info');
  return gl && ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
}

Object.assign(window as unknown as Record<string, unknown>, { crossdevice: { prepare, draw, compare, exportReal, renderer } });

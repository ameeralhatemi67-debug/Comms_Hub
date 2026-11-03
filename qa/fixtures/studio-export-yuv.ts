// Fixture of qa/studio-export-yuv.cjs (MVP_draft.md 62.10; Desktop_Power_Ideas.md P-37): the export's BT.709 conversion
// in workers (yuv-pipe.ts) against the page's (rgbaToI420 over getImageData), frame by frame over the corpus of
// bench-docs.ts, and real three-second exports through the studio's export as it is and as it was at two earlier
// commits (the runner writes those files from git: 998ef0c, the page's conversion; 996a9b5, the canvas before it).
import { corpus } from '../../src/lib/studio/bench-docs.ts';
import { SyntheticSources } from '../../src/lib/studio/bench.ts';
import { composeFrame } from '../../src/lib/studio/compose.ts';
import * as schema from '../../src/lib/studio/schema.ts';
import * as timeline from '../../src/lib/studio/timeline.ts';
import * as media from '../../src/lib/studio/media.ts';
import * as cache from '../../src/lib/studio/cache.ts';
import { exportVideo } from '../../src/lib/studio/export.ts';
import { rgbaToI420 } from '../../src/lib/studio/yuv.ts';
import { YuvPipe } from '../../src/lib/studio/yuv-pipe.ts';
import { loadFonts, usedFonts } from '../../src/lib/studio/text.ts';
import { loadSticker, MotionRenderer } from '../../src/lib/studio/motion-adapter.ts';
import { loadAssets } from '../../src/lib/motion/renderers.js';
// written by the runner from git (qa/studio-export-yuv.cjs)
import { exportVideo as exportAt998 } from '@old998/export.ts';
// written by the runner from git (qa/studio-export-yuv.cjs)
import { exportVideo as exportAt996 } from '@old996/export.ts';

export const REAL = '00000000-0000-4000-8000-0000000000f1';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function sha256(bytes: BufferSource): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return [...d].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function prepare() {
  await loadAssets();
  for (const k of schema.STICKERS) await loadSticker(k);
  const docs = corpus();
  return { fonts: await loadFonts(docs.flatMap((c) => usedFonts(c.doc))), docs: docs.map((c) => ({ name: c.name, frames: c.times.length })) };
}

export async function engine() {
  const gl = document.createElement('canvas').getContext('webgl') as WebGLRenderingContext | null;
  const info = gl?.getExtension('WEBGL_debug_renderer_info');
  const renderer = gl && info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : null;
  const mb = await import('mediabunny');
  return { renderer, onChip: await mb.canEncodeVideo('avc', { width: 1920, height: 1080, hardwareAcceleration: 'prefer-hardware' }), cores: navigator.hardwareConcurrency };
}

/** Every composed frame of the corpus converted both ways: the page's bytes and the workers' bytes, by hash. */
export async function parity(workers = 2) {
  const out: { name: string; i: number; size: string; page: string; workers: string }[] = [];
  const src = new SyntheticSources(0);
  for (const c of corpus()) {
    const { w, h } = schema.canvasOf(c.doc);
    const pipe = YuvPipe.open(w, h, workers);
    if (!pipe) throw new Error('no worker here');
    const motion = new MotionRenderer();
    try {
      for (let i = 0; i < c.times.length; i++) {
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d')!;
        composeFrame(ctx, c.doc, c.times[i], src.resolver(c.doc, motion), { scale: 1 });
        const back = pipe.convert(new VideoFrame(canvas, { timestamp: i }));
        const page = await sha256(rgbaToI420(ctx.getImageData(0, 0, w, h).data, w, h));
        const frame = await back;
        const bytes = new Uint8Array(frame.allocationSize());
        await frame.copyTo(bytes);
        const space = frame.colorSpace.toJSON();
        frame.close();
        out.push({ name: c.name, i, size: `${w}x${h}`, page, workers: `${await sha256(bytes)}${space.matrix === 'bt709' && space.transfer === 'bt709' && space.fullRange === false ? '' : ':' + JSON.stringify(space)}` });
      }
    } finally {
      pipe.close();
    }
  }
  return out;
}

const EXPORTS = { now: exportVideo, at998: exportAt998, at996: exportAt996 } as Record<string, typeof exportVideo>;

/** A real three-second 1080p video through one of the exports (decoding included); the file goes to the server. */
export async function exportReal(o: { tag: string; code: 'now' | 'at998' | 'at996'; yuvWorkers?: number }) {
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
  const res = await EXPORTS[o.code](doc, pool, { short: 1080, format: 'mp4', name: 'proof.mp4', ...(o.yuvWorkers !== undefined ? { yuvWorkers: o.yuvWorkers } : {}) });
  const ms = Math.round(performance.now() - t0);
  await fetch(`/upload/${o.tag}.mp4`, { method: 'POST', body: res.file });
  pool.dispose();
  const x = res as { via?: string; yuvWorkers?: number };
  return { tag: o.tag, code: o.code, frames: res.frames, bytes: res.bytes, ms, via: x.via ?? 'canvas', yuvWorkers: x.yuvWorkers ?? 0 };
}

(window as unknown as { yuvcheck: object }).yuvcheck = { prepare, engine, parity, exportReal };

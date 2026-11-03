// Fixture of qa/studio-lanes.cjs (Desktop_Power_Ideas.md P-06 and P-35, section 9's D11 gate; MVP_draft.md 62.10): the
// same project exported with one, two and three lanes, every composed frame fingerprinted on its way to the encoder,
// and with faults forced in the lanes. The project is the runner's source with an Arabic title over it.
import * as schema from '../../src/lib/studio/schema.ts';
import * as timeline from '../../src/lib/studio/timeline.ts';
import * as media from '../../src/lib/studio/media.ts';
import * as cache from '../../src/lib/studio/cache.ts';
import { exportVideo, type Short } from '../../src/lib/studio/export.ts';
import { defaultText, loadFonts, usedFonts } from '../../src/lib/studio/text.ts';

export const REAL = '00000000-0000-4000-8000-0000000000f2';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A fingerprint of a frame's pixels: two 32-bit mixes over its words (a proof's, not a secret's). */
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

export async function exportWith(o: { tag: string; seconds: number; w: number; h: number; short: Short; lanes: number; hash: boolean; faults?: { configOf?: number; failAt?: number }; sample?: boolean[] | null }) {
  const root = await navigator.storage.getDirectory();
  for (const d of [cache.CACHE_DIR, 'studio-exports', 'studio-manifest.json', 'studio-lanes']) await root.removeEntry(d, { recursive: true }).catch(() => undefined);
  const pool = new media.MediaPool({ cache: await cache.DeviceCache.open(), onChange: () => undefined });
  let doc = schema.newVideoDoc('16:9', 30);
  const r = timeline.addSource(doc, { kind: 'library', asset: REAL, version: 1, name: 'مصدر.mp4', media: 'video', duration: o.seconds * schema.US, w: o.w, h: o.h });
  doc = timeline.addClip(r.doc, { source: r.id, start: 0, length: o.seconds * schema.US, in: 0 }).doc;
  // the title in the bottom quarter, so the picture above it can be measured against the source
  doc = timeline.addClip(doc, { text: { ...defaultText('الاتصال المؤسسي 2026'), weight: 700, size: 96 }, start: 0, length: o.seconds * schema.US, transform: { x: 960, y: 960, scale: 1, rotation: 0, opacity: 1 } }).doc;
  pool.ensure(doc);
  for (let i = 0; i < 1200 && pool.state(r.id)?.kind !== 'ready'; i++) await sleep(50);
  await loadFonts(usedFonts(doc));
  const prints: string[] = [];
  const t0 = performance.now();
  const res = await exportVideo(doc, pool, {
    short: o.short,
    format: 'mp4',
    name: 'lanes.mp4',
    lanes: o.lanes,
    faults: o.faults ? { ...o.faults } : undefined,
    inspect: o.hash
      ? async (n, frame) => {
          if (o.sample && !o.sample[n]) return frame.close();
          prints[n] = await fingerprint(frame);
        }
      : undefined,
  });
  const ms = Math.round(performance.now() - t0);
  // the file goes to the server in pieces (a ten-minute 4K file is too large for one request)
  const file = res.file;
  const piece = 64 << 20;
  for (let at = 0; at < file.size; at += piece) await fetch(`/upload/${o.tag}.mp4?at=${at}`, { method: 'POST', body: file.slice(at, at + piece) });
  pool.dispose();
  return { tag: o.tag, frames: res.frames, bytes: res.bytes, ms, via: res.via, lanes: res.lanes, steps: res.steps, prints: o.hash ? prints : null };
}

export async function engine() {
  const mb = await import('mediabunny');
  return { onChip: await mb.canEncodeVideo('avc', { width: 1920, height: 1080, hardwareAcceleration: 'prefer-hardware' }), cores: navigator.hardwareConcurrency };
}

(window as unknown as { lanecheck: object }).lanecheck = { exportWith, engine };

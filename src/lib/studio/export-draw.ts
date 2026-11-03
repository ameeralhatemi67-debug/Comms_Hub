// An export drawing worker (Desktop_Power_Ideas.md P-07; drawers.ts starts it). It composes frames of one project with
// the studio's own compositor (compose.ts, unchanged) on an OffscreenCanvas, from what the page sends: the project,
// the font faces the page has loaded, its pictures and, frame by frame, the decoded video frames as ImageBitmaps.
// Each composed frame goes back as a VideoFrame; the page encodes it exactly as it encodes its own canvas. A frame
// depends only on the project and its time (the cross-device proof draws them in any order), so several of these
// workers draw different frames at once. Worker only.
import './draw-shim.ts';
import type { ProjectDoc } from './schema.ts';
import { composeFrame, type Resolver } from './compose.ts';
import { MotionRenderer, loadSticker } from './motion-adapter.ts';
import { loadAssets } from '../motion/renderers.js';
import type { FaceSpec } from './drawers.ts';

type Init = { kind: 'init'; doc: ProjectDoc; w: number; h: number; scale: number; watermark: string | null; faces: FaceSpec[]; images: [string, ImageBitmap][]; stickers: string[]; motion: boolean };
type Draw = { kind: 'draw'; id: number; t: number; duration: number; frames: [string, ImageBitmap | null][] };

const scope = self as unknown as { onmessage: ((e: MessageEvent<Init | Draw>) => void) | null; postMessage: (m: unknown, t?: Transferable[]) => void; fonts: FontFaceSet };
let state: { doc: ProjectDoc; ctx: OffscreenCanvasRenderingContext2D; canvas: OffscreenCanvas; scale: number; watermark: string | null; images: Map<string, ImageBitmap>; motion: MotionRenderer } | null = null;
let ready: Promise<void> = Promise.resolve();

async function init(m: Init) {
  // the page's faces, each with its own file and range: drawn text falls back exactly as on the page
  const faces = m.faces.map((f) => new FontFace(f.family, f.src, { weight: f.weight, style: f.style, stretch: f.stretch, unicodeRange: f.unicodeRange }));
  for (const f of faces) scope.fonts.add(f);
  await Promise.all(faces.map((f) => f.load()));
  if (m.motion) await loadAssets();
  for (const k of m.stickers) await loadSticker(k as Parameters<typeof loadSticker>[0]);
  const canvas = new OffscreenCanvas(m.w, m.h);
  const ctx = canvas.getContext('2d')!;
  state = { doc: m.doc, ctx, canvas, scale: m.scale, watermark: m.watermark, images: new Map(m.images), motion: new MotionRenderer() };
}

function draw(m: Draw) {
  const s = state!;
  const frames = new Map(m.frames);
  const res: Resolver = { motion: s.motion, image: (id) => s.images.get(id) ?? null, videoFrame: (_s, _a, cid) => (cid ? (frames.get(cid) ?? null) : null) };
  composeFrame(s.ctx as unknown as CanvasRenderingContext2D, s.doc, m.t, res, { scale: s.scale, watermark: s.watermark });
  for (const f of frames.values()) f?.close();
  return new VideoFrame(s.canvas, { timestamp: m.t, duration: m.duration });
}

scope.onmessage = (e) => {
  const m = e.data;
  if (m.kind === 'init') {
    ready = init(m).then(
      () => scope.postMessage({ kind: 'ready' }),
      (err) => scope.postMessage({ kind: 'failed', error: String((err && err.message) || err) }),
    );
    return;
  }
  void ready.then(() => {
    try {
      const frame = draw(m);
      scope.postMessage({ kind: 'frame', id: m.id, frame }, [frame]);
    } catch (err) {
      for (const [, f] of m.frames) f?.close();
      scope.postMessage({ kind: 'frame', id: m.id, error: String((err as Error)?.message || err) });
    }
  });
};

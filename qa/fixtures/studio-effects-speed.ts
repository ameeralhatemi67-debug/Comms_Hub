// Fixture of the effects speed check (Desktop_Power_Ideas.md P-09; MVP_draft.md 62.15), bundled twice by
// qa/studio-effects-speed.cjs: once with the compositor as it is, once with compose.ts and cover.ts as they were
// before the effects (the canvas filters). Each bundle times the effects document of bench-docs.ts at 1080p over the
// synthetic 4K footage: drawn only (a one-pixel read waits for the chip), and drawn, made a VideoFrame and encoded,
// as an export does.
import { composeFrame } from '../../src/lib/studio/compose.ts';
import { CODECS, SyntheticSources, sizeAt } from '../../src/lib/studio/bench.ts';
import { effectsDoc } from '../../src/lib/studio/bench-docs.ts';
import { frameStart } from '../../src/lib/studio/time.ts';
import type { ProjectDoc } from '../../src/lib/studio/schema.ts';

const FPS = 30;
const US = 1_000_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// the footage repeats every 8 frames, painted once for the page, as «قياس قدرة الجهاز» does (bench.ts): the timing is the
// compositor's, and 8 frames of 4K stay well inside the chip's memory
const src = new SyntheticSources(8);
const made = new Map<string, ReturnType<typeof make>>();

/**
 * The document, or part of it, to tell the effects' costs apart: 'all'; 'colour', its two adjusted clips and caption
 * without the covers; 'covers', the covers without the adjustments; 'bare', neither; 'cross', all of it during the blurred
 * cross only (1.6 to 2.2 seconds); 'cross-fade', the same frames with the cross a plain fade (colour, no blur);
 * 'cross-plain', the blurred cross with no colour adjustments.
 */
export type Variant = 'all' | 'colour' | 'covers' | 'bare' | 'cross' | 'cross-fade' | 'cross-plain';
const faded = (d: ProjectDoc): ProjectDoc => ({
  ...d,
  video: { ...d.video!, tracks: d.video!.tracks.map((t) => ({ ...t, clips: t.clips.map((c) => (c.transition?.kind === 'blur' ? { ...c, transition: { ...c.transition, kind: 'fade' as const } } : c)) })) },
});
const without = (d: ProjectDoc, covers: boolean, adjust: boolean): ProjectDoc => ({
  ...d,
  video: { ...d.video!, tracks: d.video!.tracks.map((t) => ({ ...t, clips: t.clips.filter((c) => !(covers && c.cover)).map((c) => (adjust ? { ...c, adjust: undefined } : c)) })) },
});
const docOf = (v: Variant) =>
  v === 'colour' ? without(effectsDoc(), true, false)
  : v === 'covers' ? without(effectsDoc(), false, true)
  : v === 'bare' ? without(effectsDoc(), true, true)
  : v === 'cross-fade' ? faded(effectsDoc())
  : v === 'cross-plain' ? without(effectsDoc(), false, true)
  : effectsDoc();
const at = (v: Variant, n: number) => (v.startsWith('cross') ? Math.round(1.6 * US) + frameStart(n % 18, FPS) : frameStart(n, FPS) % (4 * US));

/**
 * Two canvases: the export's, a page canvas never read back as export.ts uses it (a page canvas read back each frame is
 * moved off the chip by Chromium), and an OffscreenCanvas for drawing alone, read one pixel a frame as bench.ts does.
 */
function make(v: Variant) {
  const doc = docOf(v);
  const { w, h, scale } = sizeAt(doc, 1080);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const res = src.resolver(doc);
  const ctx = canvas.getContext('2d')!;
  const off = new OffscreenCanvas(w, h).getContext('2d')! as unknown as CanvasRenderingContext2D;
  for (let n = 0; n < 30; n++) {
    composeFrame(ctx, doc, at(v, n), res, { scale });
    composeFrame(off, doc, at(v, n), res, { scale });
  }
  off.getImageData(0, 0, 1, 1);
  return { doc, w, h, scale, canvas, ctx, off, res };
}

const setup = (v: Variant) => made.get(v) ?? made.set(v, make(v)).get(v)!;

/** Milliseconds per frame, drawn only. */
export function drawOnly(frames: number, v: Variant = 'all'): number {
  const s = setup(v);
  const t0 = performance.now();
  for (let n = 0; n < frames; n++) {
    composeFrame(s.off, s.doc, at(v, n), s.res, { scale: s.scale });
    s.off.getImageData(0, 0, 1, 1);
  }
  return (performance.now() - t0) / frames;
}

/** Frames a second drawn, made a VideoFrame and encoded (H.264, 1080p, 10 Mbit/s), or null without an encoder. */
export async function exportLike(frames: number, v: Variant = 'all'): Promise<number | null> {
  const s = setup(v);
  let failed = false;
  const enc = new VideoEncoder({ output: () => undefined, error: () => (failed = true) });
  try {
    enc.configure({ codec: CODECS.h264, width: s.w, height: s.h, bitrate: 10e6, framerate: FPS });
    const t0 = performance.now();
    for (let n = 0; n < frames && !failed; n++) {
      composeFrame(s.ctx, s.doc, at(v, n), s.res, { scale: s.scale });
      const f = new VideoFrame(s.canvas, { timestamp: frameStart(n, FPS), duration: Math.round(US / FPS) });
      while (enc.encodeQueueSize > 6) await sleep(0);
      enc.encode(f, { keyFrame: n % 60 === 0 });
      f.close();
    }
    await enc.flush();
    return failed ? null : (frames / (performance.now() - t0)) * 1000;
  } catch {
    return null;
  } finally {
    if (enc.state !== 'closed') enc.close();
  }
}

function renderer(): string {
  const gl = document.createElement('canvas').getContext('webgl');
  const ext = gl?.getExtension('WEBGL_debug_renderer_info');
  return gl && ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
}

const name = (globalThis as unknown as { __speedName?: string }).__speedName ?? 'speed';
Object.assign(window as unknown as Record<string, unknown>, { [name]: { drawOnly, exportLike, renderer } });

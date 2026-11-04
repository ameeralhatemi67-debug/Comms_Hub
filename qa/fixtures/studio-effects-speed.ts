// Fixture of the effects speed check (Desktop_Power_Ideas.md P-09; MVP_draft.md 62.15), bundled twice by
// qa/studio-effects-speed.cjs: once with the compositor as it is, once with compose.ts and cover.ts as they were
// before the effects (the canvas filters). Each bundle times the effects document of bench-docs.ts at 1080p over the
// synthetic 4K footage: drawn only (a one-pixel read waits for the chip), and drawn, made a VideoFrame and encoded,
// as an export does. `effectSteps` times one full-frame clip's effect step by step, on today's effects only.
import { composeFrame, filterOf } from '../../src/lib/studio/compose.ts';
import { applyEffect, effectOf, layer } from '../../src/lib/studio/effects/index.ts';
import { blurStraight, colourStraight } from '../../src/lib/studio/effects/code.ts';
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

const ADJUST = { brightness: 12, contrast: 18, saturation: 25 };
/** A case's name, its colour, its blur, and whether a blur at full size keeps its weights instead of the three boxes. */
const STEP_CASES: [string, typeof ADJUST | undefined, number, boolean?][] = [
  ['colour', ADJUST, 0],
  ['blur 2.5 (boxes)', undefined, 2.5],
  ['blur 2.5 as weights (17 taps)', undefined, 2.5, true],
  ['blur 4 (boxes)', undefined, 4],
  ['blur 4 as weights (25 taps)', undefined, 4, true],
  ['blur 2.5 with colour', ADJUST, 2.5],
  ['blur 9 (reduced 4 times)', undefined, 9],
  ['blur 24 (reduced 8 times)', undefined, 24],
  ['blur 24 with colour', ADJUST, 24],
];

/**
 * One full-frame clip of the 4K footage drawn at 1080p with each effect, as drawEffected draws it (a layer the frame's
 * size with the blur's margin, the effect, the layer laid down), on the chip and in plain code, against the canvas filter
 * of before and against no effect at all; milliseconds a frame, a one-pixel read each frame. The plain code's steps are
 * timed apart: drawing the layer, reading it, the effect, writing it back, laying it down.
 */
export function effectSteps(frames: number) {
  const W = 1920;
  const H = 1080;
  const frame = new OffscreenCanvas(W, H).getContext('2d')!;
  const footage = src.videoAt(0);
  const wait = () => frame.getImageData(0, 0, 1, 1);
  const timed = (each: () => void) => {
    for (let n = 0; n < 3; n++) each();
    wait();
    const t0 = performance.now();
    for (let n = 0; n < frames; n++) {
      each();
      wait();
    }
    return Math.round(((performance.now() - t0) / frames) * 100) / 100;
  };
  const rows: Record<string, unknown>[] = [];
  rows.push({ case: 'no effect', path: 'drawn', ms: timed(() => {
    frame.clearRect(0, 0, W, H);
    frame.drawImage(footage, 0, 0, W, H);
  }) });
  for (const [name, adjust, blur, weights] of STEP_CASES) {
    const found = effectOf(adjust, blur)!;
    const plan = weights && found.blur ? { ...found, blur: { ...found.blur, boxes: null } } : found;
    const pad = plan.blur ? Math.ceil(plan.blur.reach / plan.blur.n) * plan.blur.n : 0;
    const filter = [adjust ? filterOf(adjust) : '', blur ? 'blur(' + blur.toFixed(2) + 'px)' : ''].filter(Boolean).join(' ');
    rows.push({ case: name, path: 'filter before', ms: timed(() => {
      frame.clearRect(0, 0, W, H);
      frame.filter = filter;
      frame.drawImage(footage, 0, 0, W, H);
      frame.filter = 'none';
    }) });
    for (const path of ['chip', 'code'] as const) {
      let offered = true;
      const ms = timed(() => {
        frame.clearRect(0, 0, W, H);
        const { canvas, ctx: g } = layer(0, W, H);
        g.drawImage(footage, 0, 0, W, H);
        const out = applyEffect(canvas, W, H, plan, { pad, path });
        if (!out) offered = false;
        else frame.drawImage(out, 0, 0, W, H, 0, 0, W, H);
      });
      if (offered) rows.push({ case: name, path, ms });
    }
    // the plain code step by step
    const parts = { draw: 0, read: 0, effect: 0, write: 0, lay: 0 };
    for (let n = 0; n < frames + 3; n++) {
      const t0 = performance.now();
      frame.clearRect(0, 0, W, H);
      const { canvas, ctx: g } = layer(0, W, H);
      g.drawImage(footage, 0, 0, W, H);
      g.getImageData(0, 0, 1, 1);
      const t1 = performance.now();
      const img = g.getImageData(0, 0, W, H);
      const t2 = performance.now();
      const out = plan.blur ? blurStraight(img.data, W, H, plan.blur, pad, plan.colour) : colourStraight(img.data, plan.colour!);
      const t3 = performance.now();
      g.putImageData(out === img.data ? img : new ImageData(out as Uint8ClampedArray<ArrayBuffer>, W, H), 0, 0);
      g.getImageData(0, 0, 1, 1);
      const t4 = performance.now();
      frame.drawImage(canvas, 0, 0, W, H, 0, 0, W, H);
      wait();
      const t5 = performance.now();
      if (n < 3) continue;
      parts.draw += t1 - t0;
      parts.read += t2 - t1;
      parts.effect += t3 - t2;
      parts.write += t4 - t3;
      parts.lay += t5 - t4;
    }
    const each = Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, Math.round((v / frames) * 100) / 100]));
    rows.push({ case: name, path: 'code, step by step', ...each });
  }
  return rows;
}

function renderer(): string {
  const gl = document.createElement('canvas').getContext('webgl');
  const ext = gl?.getExtension('WEBGL_debug_renderer_info');
  return gl && ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
}

const name = (globalThis as unknown as { __speedName?: string }).__speedName ?? 'speed';
Object.assign(window as unknown as Record<string, unknown>, { [name]: { drawOnly, exportLike, effectSteps, renderer } });

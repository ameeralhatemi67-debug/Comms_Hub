// The studio's picture effects (Desktop_Power_Ideas.md P-09 and H-03; MVP_draft.md 62.15): colour adjustments and
// blur, specified once as whole numbers (plan.ts), worked out on the graphics chip (chip.ts) or in plain code
// (code.ts), the two held equal byte for byte by qa/studio-effects-parity.cjs. 'auto' takes the chip where WebGL2
// runs on one and the plain code elsewhere, which is where the canvas itself is drawn by the processor and reading it
// back costs little: on a chip the composed picture is never read back. Before 2026-11-04 these were the canvas's own
// filters, drawn differently by each graphics chip. No DOM: usable in a worker, on an OffscreenCanvas.
import { effectsOnChip, fitted, type Room } from './chip.ts';
import { blurStraight, colourStraight } from './code.ts';
import type { EffectPlan } from './plan.ts';

export { blurPlan, colourPlan, effectOf, photoColourPlan, type BlurPlan, type ColourPlan, type EffectPlan } from './plan.ts';
export { effectsChip, effectsOnChip } from './chip.ts';

export type EffectPath = 'auto' | 'chip' | 'code';
let asked: EffectPath = 'auto';
/** The path every effect takes unless told otherwise: the browser check asks for each by name. */
export const setEffectPath = (p: EffectPath) => {
  asked = p;
};
type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type Scratch = HTMLCanvasElement | OffscreenCanvas;

const scratches: Scratch[] = [];
const rooms: Room[] = [];
/**
 * Scratch canvas `i` with its top left w by h cleared: the picture an effect is worked out from. It grows rather than
 * following each size (chip.ts fitted), since resizing a canvas reallocates it and a frame may ask for several sizes;
 * read and draw its corner with a source rect.
 */
export function layer(i: number, w: number, h: number): { canvas: Scratch; ctx: Ctx2D } {
  let c = scratches[i];
  if (!c) {
    c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : document.createElement('canvas');
    scratches[i] = c;
  }
  const fit = fitted((rooms[i] ??= { cw: c.width, ch: c.height, over: 0 }), w, h);
  if (fit) {
    c.width = fit[0];
    c.height = fit[1];
  }
  const ctx = c.getContext('2d') as Ctx2D;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.clearRect(0, 0, w, h);
  return { canvas: c, ctx };
}

/**
 * The plan in plain code over the w by h at `at` of a canvas, written into `into` (a scratch canvas, its top left), by
 * default the canvas itself.
 */
function onCode(canvas: Scratch, w: number, h: number, plan: EffectPlan, pad: number, at: [number, number], into: Scratch): Scratch {
  const img = (canvas.getContext('2d') as Ctx2D).getImageData(at[0], at[1], w, h);
  const ctx = into.getContext('2d') as Ctx2D;
  const px = img.data;
  // colour on straight colour gives colourPixels' bytes once the canvas premultiplies it (tests/studio-effect-kernels);
  // the blur premultiplies, blurs and gives straight colour again; both in WebAssembly lanes where they run, in one
  // memory, the picture copied in once and handed back from there
  const out = plan.blur ? blurStraight(px, w, h, plan.blur, pad, plan.colour) : colourStraight(px, plan.colour!);
  ctx.putImageData(out === px ? img : new ImageData(out as Uint8ClampedArray<ArrayBuffer>, w, h), 0, 0);
  return into;
}

/**
 * `plan` over the top left w by h of `canvas` (a scratch of layer()), as a picture whose top left w by h is the result
 * to draw back with a source rect: the chip's canvas, or `canvas` itself rewritten by the plain code; null when the
 * path asked for is not offered here. With `pad`, the picture is blurred as if surrounded by that much transparency (code.ts
 * blurPixels), rounded up to the plan's reduction. With `at`, the w by h is read from that place of `canvas` (the
 * picture being composed): the chip uploads it straight from there, and the plain code writes into scratch `into`.
 */
export function applyEffect(canvas: Scratch, w: number, h: number, plan: EffectPlan, o: { pad?: number; path?: EffectPath; at?: [number, number]; into?: number } = {}): CanvasImageSource | null {
  const n = plan.blur?.n ?? 1;
  const pad = plan.blur && o.pad ? Math.ceil(o.pad / n) * n : 0;
  const path = o.path ?? asked;
  const at = o.at ?? [0, 0];
  if (path !== 'code') {
    const chip = effectsOnChip(canvas, w, h, plan, pad, at);
    if (chip || path === 'chip') return chip;
  }
  return onCode(canvas, w, h, plan, pad, at, o.at ? layer(o.into ?? 1, w, h).canvas : canvas);
}

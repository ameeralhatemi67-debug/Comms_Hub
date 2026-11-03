// The studio's picture effects (Desktop_Power_Ideas.md P-09 and H-03; MVP_draft.md 62.15): colour adjustments and
// blur, specified once as whole numbers (plan.ts), worked out on the graphics chip (chip.ts) or in plain code
// (code.ts), the two held equal byte for byte by qa/studio-effects-parity.cjs. 'auto' takes the chip where WebGL2
// runs on one and the plain code elsewhere, which is where the canvas itself is drawn by the processor and reading it
// back costs little: on a chip the composed picture is never read back. Before 2026-11-04 these were the canvas's own
// filters, drawn differently by each graphics chip. No DOM: usable in a worker, on an OffscreenCanvas.
import { effectsOnChip } from './chip.ts';
import { blurPixels, colourPixels, toPremultiplied, toStraight } from './code.ts';
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
/** Scratch canvas `i`, w by h, cleared: the picture an effect is worked out from. */
export function layer(i: number, w: number, h: number): { canvas: Scratch; ctx: Ctx2D } {
  let c = scratches[i];
  if (!c) {
    c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : document.createElement('canvas');
    scratches[i] = c;
  }
  if (c.width !== w) c.width = w;
  if (c.height !== h) c.height = h;
  const ctx = c.getContext('2d') as Ctx2D;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.clearRect(0, 0, w, h);
  return { canvas: c, ctx };
}

/** The plan in plain code over a canvas's own pixels, written back into it. */
function onCode(canvas: Scratch, w: number, h: number, plan: EffectPlan, pad: number): Scratch {
  const ctx = canvas.getContext('2d') as Ctx2D;
  const img = ctx.getImageData(0, 0, w, h);
  const px = img.data;
  toPremultiplied(px);
  if (plan.colour) colourPixels(px, plan.colour);
  const out = plan.blur ? blurPixels(px, w, h, plan.blur, pad) : px;
  toStraight(out);
  ctx.putImageData(out === px ? img : new ImageData(out, w, h), 0, 0);
  return canvas;
}

/**
 * `plan` over the w by h picture on `canvas` (a scratch of layer()), as a picture of w by h to draw back: the chip's
 * canvas, or `canvas` itself rewritten by the plain code; null when the path asked for is not offered here. With
 * `pad`, the picture is blurred as if surrounded by that much transparency (code.ts blurPixels), rounded up to the
 * plan's reduction.
 */
export function applyEffect(canvas: Scratch, w: number, h: number, plan: EffectPlan, o: { pad?: number; path?: EffectPath } = {}): CanvasImageSource | null {
  const n = plan.blur?.n ?? 1;
  const pad = plan.blur && o.pad ? Math.ceil(o.pad / n) * n : 0;
  const path = o.path ?? asked;
  if (path !== 'code') {
    const chip = effectsOnChip(canvas, w, h, plan, pad);
    if (chip || path === 'chip') return chip;
  }
  return onCode(canvas, w, h, plan, pad);
}

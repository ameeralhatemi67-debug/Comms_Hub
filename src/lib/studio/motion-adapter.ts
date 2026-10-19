// The motion templates of «قوالب الحركة» (MVP_draft.md 57) as studio clips (section 62), drawn by the
// same renderers, unchanged. A clip keeps the template's id and only the parameters it changed; the
// template's own defaults fill the rest, so a later improvement of a template reaches old projects.
//
//   - Clip time to template time: ((t - start) + in) seconds, times the template's speed.
//   - The clip's length sets the showcase: `hold` for numbers, `tHold` for Repine and frames.
//   - Frame templates take the project's shape, and their window is real transparency: the video on
//     the tracks below shows through it.
//   - renderFrame clears its canvas, resets its transform and sets a module-wide render scale, with
//     layer caches keyed on that scale, so each clip draws into its own off-screen canvas at a steady
//     scale, and the result is laid onto the frame like a picture. Main thread only.
import { catalog } from '../motion/catalog.ts';
import { renderFrame, timingOf } from '../motion/renderers.js';
import type { Graphic, Params } from '../motion/types';
import { US, type Clip, type Micros, type NewClip, type Ratio, type StickerKey } from './schema.ts';

export const graphicById = (id: string): Graphic | undefined => catalog.find((g) => g.id === id);
export const motionCatalog = catalog;

const KNOWN = new Set(Object.keys(catalog[0]?.defaults ?? {}));

/** The parameters a clip draws with: the template's defaults, the clip's own changes, the project's shape. */
export function motionParams(g: Graphic, saved: Record<string, unknown> | undefined, ratio: Ratio): Params {
  const p: Params = { ...g.defaults };
  for (const [k, v] of Object.entries(saved ?? {})) if (KNOWN.has(k) && typeof v === typeof (g.defaults as Record<string, unknown>)[k]) (p as Record<string, unknown>)[k] = v;
  if (g.category === 'frames') p.ratio = ratio;
  return p;
}

/** Only the parameters that differ from the template's defaults: what a clip stores. */
export function changedParams(g: Graphic, p: Params): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(p)) if (k !== 'ratio' && (g.defaults as Record<string, unknown>)[k] !== v) out[k] = v;
  return out;
}

/** The template's drawing size: 1280x720 for numbers and Repine, the shape's size for frames. */
export const motionDims = (g: Graphic, p: Params) => g.dims?.(p) ?? { w: 1280, h: 720 };

/** The template's own length at its parameters, in microseconds of clip time. */
export const naturalLength = (g: Graphic, p: Params): Micros => Math.round((timingOf(g, p).total / Math.max(0.05, p.speed)) * US);

/** The parameter that holds the showcase. */
export const holdKey = (g: Graphic): 'hold' | 'tHold' => (g.category === 'numbers' ? 'hold' : 'tHold');

/** The parameters with the showcase stretched or shortened so the template lasts exactly `length`. */
export function fitToLength(g: Graphic, p: Params, length: Micros): Params {
  const key = holdKey(g);
  const want = (length / US) * p.speed;
  const total = timingOf(g, p).total;
  const hold = Math.min(900, Math.max(0, p[key] + (want - total)));
  return { ...p, [key]: Math.round(hold * 1000) / 1000 };
}

/** The shortest a template can be: its entry and exit with no showcase. */
export function minMotionLength(g: Graphic, p: Params): Micros {
  return naturalLength(g, { ...p, [holdKey(g)]: 0 });
}

/** Template time, in seconds, at timeline time t. */
export const templateTime = (clip: Pick<Clip, 'start' | 'in'>, t: Micros, p: Params) => (((t - clip.start) + (clip.in ?? 0)) / US) * p.speed;

/** The settled moment of a template: a still for photos and thumbnails (as the template tab does). */
export function settledSec(g: Graphic, p: Params): number {
  if (g.category === 'numbers') return 3.4;
  return Math.max(0.3, p.tIn) + 0.5;
}

/** A new motion clip at its natural length. */
export function motionClip(g: Graphic, ratio: Ratio, start: Micros = 0): NewClip {
  const p = motionParams(g, {}, ratio);
  return { start, length: naturalLength(g, p), motion: { template: g.id, params: {} } };
}

const quant = (s: number) => Math.max(0.125, Math.round(s * 8) / 8);

/**
 * Draws templates into off-screen canvases, one per clip, kept between frames. `scale` is the drawn
 * width over the template's width; it is rounded to eighths so the renderers' layer caches stay warm.
 */
export class MotionRenderer {
  private canvases = new Map<string, HTMLCanvasElement>();

  render(key: string, g: Graphic, p: Params, sec: number, scale: number): HTMLCanvasElement {
    const s = quant(scale);
    const d = motionDims(g, p);
    const w = Math.max(1, Math.round(d.w * s));
    const h = Math.max(1, Math.round(d.h * s));
    let c = this.canvases.get(key);
    if (!c) {
      c = document.createElement('canvas');
      this.canvases.set(key, c);
    }
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
    const ctx = c.getContext('2d')!;
    renderFrame(g, p, Math.max(0, sec), ctx, w / d.w, null);
    return c;
  }

  forget(keep: Set<string>) {
    for (const k of this.canvases.keys()) if (!keep.has(k)) this.canvases.delete(k);
  }
}

// ---------------------------------------------------------------------------
// Brand marks: the white masks of the template tab (public/motion), tinted.
// ---------------------------------------------------------------------------

export const STICKER_SRC: Record<StickerKey, string> = {
  emblem: '/motion/logo_src-emblem.png',
  wordmark: '/motion/logo_src-wordmark.png',
  tagline: '/motion/logo_src-tagline.png',
  verse1: '/motion/verse_src-verse1.png',
  verse2: '/motion/verse_src-verse2.png',
};

const masks = new Map<StickerKey, Promise<HTMLImageElement>>();
const tinted = new Map<string, HTMLCanvasElement>();
const ready = new Map<StickerKey, HTMLImageElement>();

export function loadSticker(key: StickerKey): Promise<HTMLImageElement> {
  let p = masks.get(key);
  if (!p) {
    p = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        ready.set(key, img);
        resolve(img);
      };
      img.onerror = () => reject(new Error('تعذّر تحميل علامة الهوية.'));
      img.src = STICKER_SRC[key];
    });
    masks.set(key, p);
  }
  return p;
}

/** The mark tinted in a colour, or null until its mask has loaded (call loadSticker first). */
export function sticker(key: StickerKey, color: string): HTMLCanvasElement | null {
  const img = ready.get(key);
  if (!img) return null;
  const k = `${key}|${color}`;
  let c = tinted.get(k);
  if (!c) {
    c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, c.width, c.height);
    tinted.set(k, c);
  }
  return c;
}

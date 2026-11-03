// Fixture of the effect identity check (Desktop_Power_Ideas.md P-09, H-03; MVP_draft.md 62.15), bundled by
// qa/studio-effects-parity.cjs from the real modules and run in Edge and inside the development package on each
// graphics chip and with none. In every engine:
//   - each effect of effects/, at several strengths, over three pictures (synthetic footage, an item with soft edges
//     and see-through parts, every straight colour at every opacity, all written from whole numbers), worked out on
//     the graphics chip and in plain code: the two must give the same bytes, and the same as in Edge;
//   - every frame of the proof's corpus composed with the chip path and with the plain code: the same hash;
//   - how far each effect moved from the canvas filter the studio drew with before (compose.ts filterOf), on this
//     engine's own filter: what a project saved before the change shows now.
import { corpus } from '../../src/lib/studio/bench-docs.ts';
import { SyntheticSources, basePixels } from '../../src/lib/studio/bench.ts';
import { composeFrame, filterOf } from '../../src/lib/studio/compose.ts';
import { applyEffect, blurPlan, effectOf, effectsChip, setEffectPath, type EffectPlan } from '../../src/lib/studio/effects/index.ts';
import { toPremultiplied } from '../../src/lib/studio/effects/code.ts';
import * as schema from '../../src/lib/studio/schema.ts';
import { loadFonts, usedFonts } from '../../src/lib/studio/text.ts';
import { loadSticker, MotionRenderer } from '../../src/lib/studio/motion-adapter.ts';
import { loadAssets } from '../../src/lib/motion/renderers.js';

const src = new SyntheticSources(0);

async function sha256(bytes: Uint8ClampedArray): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return [...d].map((b) => b.toString(16).padStart(2, '0')).join('');
}

type Picture = { name: string; canvas: OffscreenCanvas };

function canvasOf(w: number, h: number) {
  const c = new OffscreenCanvas(w, h);
  return { c, ctx: c.getContext('2d')! };
}

/**
 * The three pictures the effects are worked out on, written with putImageData from whole numbers so every engine
 * starts from the same bytes (drawing them scaled, turned or with text would differ by chip before any effect).
 */
function pictures(): Picture[] {
  const frame = canvasOf(1280, 720);
  frame.ctx.putImageData(basePixels(1280, 720, 2026), 0, 0);
  // an item: footage with soft edges fading out over 60 pixels, a see-through band and clear holes
  const item = canvasOf(900, 700);
  const it = basePixels(900, 700, 7);
  for (let y = 0; y < 700; y++) {
    for (let x = 0; x < 900; x++) {
      const edge = Math.min(x, y, 899 - x, 699 - y);
      const soft = edge >= 60 ? 255 : Math.floor((edge * 255) / 60);
      const band = y > 420 && y < 520 ? 94 : 255;
      it.data[(y * 900 + x) * 4 + 3] = ((x >> 5) + (y >> 5)) % 7 === 0 ? 0 : Math.floor((soft * band) / 255);
    }
  }
  item.ctx.putImageData(it, 0, 0);
  const ramp = canvasOf(256, 256);
  const img = new ImageData(256, 256);
  for (let a = 0; a < 256; a++) {
    for (let v = 0; v < 256; v++) {
      const i = (a * 256 + v) * 4;
      img.data[i] = v;
      img.data[i + 1] = 255 - v;
      img.data[i + 2] = (v * 7) & 255;
      img.data[i + 3] = a;
    }
  }
  ramp.ctx.putImageData(img, 0, 0);
  return [
    { name: 'frame', canvas: frame.c },
    { name: 'item', canvas: item.c },
    { name: 'ramp', canvas: ramp.c },
  ];
}

const COLOURS: [string, schema.Adjust][] = [
  ['effects A', { brightness: 12, contrast: 18, saturation: 25 }],
  ['effects B', { brightness: -8, contrast: 10, saturation: -30 }],
  ['grey', { brightness: 0, contrast: 0, saturation: -100 }],
  ...([-100, -50, 25, 50, 100] as const).map((v): [string, schema.Adjust] => [`brightness ${v}`, { brightness: v, contrast: 0, saturation: 0 }]),
  ...([-100, -50, 25, 50, 100] as const).map((v): [string, schema.Adjust] => [`contrast ${v}`, { brightness: 0, contrast: v, saturation: 0 }]),
  ...([-90, -50, 25, 50, 100] as const).map((v): [string, schema.Adjust] => [`saturation ${v}`, { brightness: 0, contrast: 0, saturation: v }]),
  ['all three', { brightness: 37, contrast: -63, saturation: 81 }],
];
const BLURS = [0.4, 1.5, 4, 4.5, 9, 30, 64, 100];

type Case = { name: string; plan: EffectPlan; pad: number; filter: string };
function cases(): Case[] {
  const out: Case[] = [];
  for (const [name, a] of COLOURS) out.push({ name, plan: effectOf(a)!, pad: 0, filter: filterOf(a) });
  for (const s of BLURS) {
    const plan = { colour: null, blur: blurPlan(s) };
    out.push({ name: `blur ${s}`, plan, pad: plan.blur!.reach, filter: `blur(${s.toFixed(2)}px)` });
  }
  const a = COLOURS[0][1];
  const both = effectOf(a, 9)!;
  out.push({ name: 'effects A and blur 9', plan: both, pad: both.blur!.reach, filter: `${filterOf(a)} blur(9.00px)` });
  return out;
}

/**
 * The bytes a canvas holds, premultiplied: getImageData's straight colour premultiplied again, which is exact. Its
 * straight colour itself is not: each engine divides by opacity its own way (measured on 2026-11-04), so straight
 * colour would compare engines, not effects.
 */
function held(ctx: OffscreenCanvasRenderingContext2D, w: number, h: number): Uint8ClampedArray {
  const px = ctx.getImageData(0, 0, w, h).data;
  toPremultiplied(px);
  return px;
}

/** The bytes of a picture drawn onto a fresh canvas, premultiplied (held). */
function read(img: CanvasImageSource, w: number, h: number): Uint8ClampedArray {
  const { ctx } = canvasOf(w, h);
  ctx.drawImage(img, 0, 0);
  return held(ctx, w, h);
}

/**
 * Two pictures premultiplied (held): `differing` counts channels that differ at all; the rest measures colour as it is
 * seen over black, and the opacity apart.
 */
function compare(a: Uint8ClampedArray, b: Uint8ClampedArray) {
  let differing = 0;
  let max = 0;
  let alphaMax = 0;
  let over2 = 0;
  let sum = 0;
  let n = 0;
  for (let p = 0; p < a.length; p += 4) {
    for (let k = 0; k < 4; k++) {
      const d = Math.abs(a[p + k] - b[p + k]);
      if (d) differing++;
      if (k === 3) {
        if (d > alphaMax) alphaMax = d;
        continue;
      }
      if (d > max) max = d;
      if (d > 2) over2++;
      sum += d * d;
      n++;
    }
  }
  const mse = sum / n;
  return { differing, max, alphaMax, over2: Math.round((over2 / n) * 1e6) / 1e4, psnr: mse === 0 ? 99 : Math.round(10 * Math.log10((255 * 255) / mse) * 100) / 100 };
}

/** Each effect on each picture: the chip against the plain code, and the plain code against this engine's old filter. */
export async function identity() {
  const chip = effectsChip();
  const out = [];
  for (const p of pictures()) {
    const { width: w, height: h } = p.canvas;
    for (const c of cases()) {
      const copy = () => {
        const x = canvasOf(w, h);
        x.ctx.drawImage(p.canvas, 0, 0);
        return x.c;
      };
      const code = read(applyEffect(copy(), w, h, c.plan, { pad: c.pad, path: 'code' })!, w, h);
      const onChip = chip ? applyEffect(copy(), w, h, c.plan, { pad: c.pad, path: 'chip' }) : null;
      const chipPx = onChip ? read(onChip, w, h) : null;
      // before: the canvas filter over the picture, as compose.ts and cover.ts drew it
      const old = canvasOf(w, h);
      old.ctx.filter = c.filter;
      old.ctx.drawImage(p.canvas, 0, 0);
      old.ctx.filter = 'none';
      const before = held(old.ctx, w, h);
      out.push({ picture: p.name, effect: c.name, chip: chipPx ? compare(chipPx, code) : null, sinceFilter: compare(before, code), hash: await sha256(code) });
    }
  }
  return { chip, cases: out };
}

export async function prepare() {
  await loadAssets();
  for (const k of schema.STICKERS) await loadSticker(k);
  const docs = corpus();
  return { fonts: await loadFonts(docs.flatMap((c) => usedFonts(c.doc))), docs: docs.length };
}

/** Every corpus frame composed with each path; the hashes per path. */
export async function corpusPaths() {
  const all = corpus();
  const paths = effectsChip() ? (['chip', 'code', 'auto'] as const) : (['code', 'auto'] as const);
  const out: Record<string, { name: string; i: number; hash: string }[]> = {};
  for (const path of paths) {
    setEffectPath(path);
    const frames = [];
    for (const c of all) {
      const motion = new MotionRenderer();
      const { w, h } = schema.canvasOf(c.doc);
      for (let i = 0; i < c.times.length; i++) {
        const cv = canvasOf(w, h);
        composeFrame(cv.ctx as unknown as CanvasRenderingContext2D, c.doc, c.times[i], src.resolver(c.doc, motion), { scale: 1 });
        frames.push({ name: c.name, i, hash: await sha256(cv.ctx.getImageData(0, 0, w, h).data) });
      }
    }
    out[path] = frames;
  }
  setEffectPath('auto');
  return out;
}

function renderer(): string {
  const gl = new OffscreenCanvas(1, 1).getContext('webgl');
  const ext = gl?.getExtension('WEBGL_debug_renderer_info');
  return gl && ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
}

Object.assign(window as unknown as Record<string, unknown>, { effectsParity: { prepare, identity, corpusPaths, renderer } });

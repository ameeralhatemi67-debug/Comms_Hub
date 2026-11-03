// Fixture of the effect identity check (Desktop_Power_Ideas.md P-09, H-03; MVP_draft.md 62.15), bundled by
// qa/studio-effects-parity.cjs from the real modules and run in Edge and inside the development package on each
// graphics chip and with none. In every engine:
//   - each effect of effects/, at several strengths, over three pictures (a frame of the synthetic 4K footage, an item
//     with soft edges and see-through parts, every straight colour at every opacity), worked out on the graphics chip
//     and in plain code: the two must give the same bytes;
//   - every frame of the proof's corpus composed with the chip path and with the plain code: the same hash;
//   - how far each effect moved from the canvas filter the studio drew with before (compose.ts filterOf), on this
//     engine's own filter: what a project saved before the change shows now.
import { corpus } from '../../src/lib/studio/bench-docs.ts';
import { SyntheticSources } from '../../src/lib/studio/bench.ts';
import { composeFrame, filterOf } from '../../src/lib/studio/compose.ts';
import { applyEffect, blurPlan, effectOf, effectsChip, setEffectPath, type EffectPlan } from '../../src/lib/studio/effects/index.ts';
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

/** The three pictures the effects are worked out on. */
function pictures(): Picture[] {
  const frame = canvasOf(1280, 720);
  frame.ctx.drawImage(src.videoAt(1_000_000) as CanvasImageSource, 0, 0, 1280, 720);
  const item = canvasOf(900, 700);
  item.ctx.save();
  item.ctx.translate(450, 350);
  item.ctx.rotate((12 * Math.PI) / 180);
  item.ctx.globalAlpha = 0.85;
  item.ctx.drawImage(src.picture() as CanvasImageSource, -300, -260, 600, 520);
  item.ctx.restore();
  item.ctx.fillStyle = 'rgba(200, 40, 90, 0.37)';
  item.ctx.beginPath();
  item.ctx.ellipse(250, 520, 180, 110, 0.4, 0, Math.PI * 2);
  item.ctx.fill();
  item.ctx.font = '700 72px "IBM Plex Sans Arabic", sans-serif';
  item.ctx.shadowColor = 'rgba(0,0,0,0.6)';
  item.ctx.shadowBlur = 14;
  item.ctx.fillStyle = '#f4ead2';
  item.ctx.fillText('مركز الاتصال', 420, 140);
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

/** The bytes of a picture as getImageData reads it, drawn onto a fresh canvas. */
function read(img: CanvasImageSource, w: number, h: number): Uint8ClampedArray {
  const { ctx } = canvasOf(w, h);
  ctx.drawImage(img, 0, 0);
  return ctx.getImageData(0, 0, w, h).data;
}

/**
 * Two pictures as getImageData reads them: `differing` counts channels that differ at all; the rest measures colour
 * premultiplied (the picture over black, as it is seen), since straight colour at an opacity of 1 or 2 is noise.
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
      const raw = Math.abs(a[p + k] - b[p + k]);
      if (raw) differing++;
      if (k === 3) {
        if (raw > alphaMax) alphaMax = raw;
        continue;
      }
      const d = Math.abs(Math.round((a[p + k] * a[p + 3]) / 255) - Math.round((b[p + k] * b[p + 3]) / 255));
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
      const before = old.ctx.getImageData(0, 0, w, h).data;
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

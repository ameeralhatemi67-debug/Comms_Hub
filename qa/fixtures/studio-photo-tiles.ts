// Fixture of the photo tiles check (Desktop_Power_Ideas.md P-17; MVP_draft.md 62.15), bundled by
// qa/studio-photo-tiles.cjs from the real photo.ts and run in Edge and inside the development package. An 8000 by 6000
// photo (the largest side the studio takes) and a smaller one with see-through parts, painted from integer arithmetic
// (bench.ts basePixels), are adjusted every way: by one worker as before, in bands across several workers, and on the
// graphics chip where the adjustment has no blur. Each result is hashed; each way is timed.
import { adjustImage } from '../../src/lib/studio/photo.ts';
import { basePixels } from '../../src/lib/studio/bench.ts';
import { effectsChip } from '../../src/lib/studio/effects/index.ts';
import { toPremultiplied } from '../../src/lib/studio/effects/code.ts';
import type { Adjust } from '../../src/lib/studio/schema.ts';

/** The bytes the canvas holds, premultiplied: each engine reads see-through pixels back to straight colour its own way. */
function held(c: HTMLCanvasElement): Uint8ClampedArray {
  const px = c.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, c.width, c.height).data;
  toPremultiplied(px);
  return px;
}

async function sha256(bytes: Uint8ClampedArray): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return [...d].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function picture(w: number, h: number, seeThrough: boolean): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const img = basePixels(w, h, 11);
  if (seeThrough) {
    // opacity falls across the picture, with fully clear holes
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4 + 3;
        img.data[i] = ((x >> 6) + (y >> 6)) % 5 === 0 ? 0 : Math.floor((255 * (x + y)) / (w + h));
      }
    }
  }
  c.getContext('2d')!.putImageData(img, 0, 0);
  return c;
}

const ADJUSTS: [string, Partial<Adjust>][] = [
  ['brightness', { brightness: 30 }],
  ['contrast', { contrast: -45 }],
  ['saturation', { saturation: 60 }],
  ['warmth', { warmth: -70 }],
  ['blur', { blur: 40 }],
  ['all', { brightness: 12, contrast: 20, saturation: -35, warmth: 40, blur: 25 }],
];

export async function run(o: { big: boolean }) {
  const cores = navigator.hardwareConcurrency || 1;
  // what scale.ts plans for «تلقائي» on this many cores once a profile exists: all but two of them, at most fourteen
  const planned = Math.max(1, Math.min(14, cores - 2));
  const counts = [...new Set([1, 2, 4, planned].filter((n) => n >= 1))].sort((a, b) => a - b);
  const pictures: [string, number, number, boolean][] = [o.big ? ['8000x6000', 8000, 6000, false] : ['4000x3000', 4000, 3000, false], ['2400x1600 see-through', 2400, 1600, true]];
  const out = [];
  for (const [name, w, h, see] of pictures) {
    const photo = picture(w, h, see);
    for (const [label, a] of ADJUSTS) {
      const adjust = { brightness: 0, contrast: 0, saturation: 0, warmth: 0, blur: 0, ...a } as Adjust;
      const ways: { way: string; ms: number; hash: string }[] = [];
      for (const n of counts) {
        const t0 = performance.now();
        const c = await adjustImage(photo, adjust, { workers: n, path: 'workers' });
        const ms = Math.round(performance.now() - t0);
        ways.push({ way: `${n} worker${n > 1 ? 's' : ''}`, ms, hash: await sha256(held(c)) });
      }
      if (!adjust.blur && effectsChip()) {
        const t0 = performance.now();
        const c = await adjustImage(photo, adjust, { path: 'chip' });
        const ms = Math.round(performance.now() - t0);
        ways.push({ way: 'chip', ms, hash: await sha256(held(c)) });
      }
      out.push({ picture: name, adjust: label, ways });
    }
  }
  return { cores, planned, counts, chip: effectsChip(), results: out };
}

function renderer(): string {
  const gl = new OffscreenCanvas(1, 1).getContext('webgl');
  const ext = gl?.getExtension('WEBGL_debug_renderer_info');
  return gl && ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
}

Object.assign(window as unknown as Record<string, unknown>, { photoTiles: { run, renderer } });

// Fixture of the frame check (Desktop_Power_Ideas.md P-09; MVP_draft.md 62.15), bundled twice by
// qa/studio-effects-frames.cjs: with the compositor as it is, and with compose.ts and cover.ts as they were (the canvas
// filters). It draws chosen frames of the cross-device corpus, each also with every colour adjustment taken out, so a
// difference between engines can be told apart: what picture scaling gives alone, what the old filter gave, what the
// effect gives. In Edge each frame goes to the server as a PNG; elsewhere each is compared with Edge's, pixel by pixel.
import { corpus } from '../../src/lib/studio/bench-docs.ts';
import { SyntheticSources } from '../../src/lib/studio/bench.ts';
import { composeFrame } from '../../src/lib/studio/compose.ts';
import { MotionRenderer } from '../../src/lib/studio/motion-adapter.ts';
import * as schema from '../../src/lib/studio/schema.ts';

const which = (globalThis as unknown as { __framesName?: string }).__framesName ?? 'after';
/** The frames looked at: the transitions document's worst frames with no graphics chip (qa/studio-crossdevice.json). */
export const FRAMES: [string, number][] = [['transitions', 0], ['transitions', 13], ['transitions', 15]];

const plain = (doc: schema.ProjectDoc): schema.ProjectDoc => ({ ...doc, video: { ...doc.video!, tracks: doc.video!.tracks.map((t) => ({ ...t, clips: t.clips.map((c) => ({ ...c, adjust: undefined })) })) } });

function draw(doc: schema.ProjectDoc, t: number): ImageData {
  const { w, h } = schema.canvasOf(doc);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  composeFrame(ctx, doc, t, new SyntheticSources(0).resolver(doc, new MotionRenderer()), { scale: 1 });
  return ctx.getImageData(0, 0, w, h);
}

async function refOf(key: string): Promise<Uint8ClampedArray> {
  const bmp = await createImageBitmap(await (await fetch(`/ref/${key}.png`)).blob(), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  const o = new OffscreenCanvas(bmp.width, bmp.height);
  const x = o.getContext('2d', { willReadFrequently: true })!;
  x.drawImage(bmp, 0, 0);
  return x.getImageData(0, 0, bmp.width, bmp.height).data;
}

/** Each frame, as it is and without its colour adjustments: uploaded (reference) or compared with the reference. */
export async function run(reference: boolean) {
  const all = corpus();
  const out = [];
  for (const [name, i] of FRAMES) {
    const c = all.find((d) => d.name === name)!;
    for (const [variant, doc] of [['as saved', c.doc], ['no colour', plain(c.doc)]] as const) {
      const img = draw(doc, c.times[i]);
      const key = `${which}-${name}-${i}-${variant === 'as saved' ? 'saved' : 'plain'}`;
      if (reference) {
        const o = new OffscreenCanvas(img.width, img.height);
        o.getContext('2d')!.putImageData(img, 0, 0);
        await fetch(`/frame/${key}`, { method: 'POST', body: await o.convertToBlob({ type: 'image/png' }) });
        out.push({ name, i, variant, compositor: which, uploaded: true });
        continue;
      }
      const ref = await refOf(key);
      const levels: Record<number, number> = {};
      let sum = 0;
      let n = 0;
      let over2 = 0;
      let max = 0;
      for (let p = 0; p < ref.length; p += 4) {
        for (let k = 0; k < 3; k++) {
          const d = Math.abs(ref[p + k] - img.data[p + k]);
          levels[d] = (levels[d] ?? 0) + 1;
          sum += d * d;
          n++;
          if (d > 2) over2++;
          if (d > max) max = d;
        }
      }
      const mse = sum / n;
      out.push({ name, i, t: c.times[i], variant, compositor: which, psnr: mse ? Math.round(10 * Math.log10((255 * 255) / mse) * 100) / 100 : 99, max, over2: Math.round((over2 / n) * 1e6) / 1e4, levels });
    }
  }
  return out;
}

function renderer(): string {
  const gl = document.createElement('canvas').getContext('webgl');
  const ext = gl?.getExtension('WEBGL_debug_renderer_info');
  return gl && ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
}

Object.assign(window as unknown as Record<string, unknown>, { [which === 'before' ? 'framesBefore' : 'framesAfter']: { run, renderer } });

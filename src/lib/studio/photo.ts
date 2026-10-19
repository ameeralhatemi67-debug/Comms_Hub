// Photo projects (MVP_draft.md 62): layers drawn bottom first by the shared compositor, and the
// picture adjustments (brightness, contrast, saturation, warmth, blur) as pixel functions, run in a
// worker so a large photo does not freeze the page, and used alike for the preview and the export (the
// canvas's own filter is not used for photos: Safari long ignored it, and it has no warmth). Pure apart
// from the worker.
import { PHOTO_MAX_SIDE, uid, type Adjust, type Content, type Layer, type ProjectDoc, type Transform } from './schema.ts';

export type NewLayer = Content & Partial<Omit<Layer, 'id' | 'transform' | keyof Content>> & { id?: string; transform?: Transform };

const body = (doc: ProjectDoc) => {
  if (doc.kind !== 'photo' || !doc.photo) throw new Error('NOT_PHOTO');
  return doc.photo;
};
const withLayers = (doc: ProjectDoc, layers: Layer[]): ProjectDoc => ({ ...doc, photo: { ...body(doc), layers } });

/** A new layer on top, centred unless placed. */
export function addLayer(doc: ProjectDoc, layer: NewLayer): { doc: ProjectDoc; id: string } {
  const p = body(doc);
  const id = layer.id ?? uid('l');
  const l = { ...layer, id, transform: layer.transform ?? { x: p.w / 2, y: p.h / 2, scale: 1, rotation: 0, opacity: 1 } } as Layer;
  return { doc: withLayers(doc, [...p.layers, l]), id };
}

export function updateLayer(doc: ProjectDoc, id: string, patch: Partial<Layer> | ((l: Layer) => Layer)): ProjectDoc {
  return withLayers(doc, body(doc).layers.map((l) => (l.id === id ? (typeof patch === 'function' ? patch(l) : { ...l, ...patch }) : l)));
}

export function removeLayer(doc: ProjectDoc, id: string): ProjectDoc {
  const l = body(doc).layers.find((x) => x.id === id);
  if (!l || l.locked) return doc;
  return withLayers(doc, body(doc).layers.filter((x) => x.id !== id));
}

export function duplicateLayer(doc: ProjectDoc, id: string): { doc: ProjectDoc; id: string | null } {
  const layers = body(doc).layers;
  const i = layers.findIndex((x) => x.id === id);
  if (i < 0) return { doc, id: null };
  const copy: Layer = { ...structuredClone(layers[i]), id: uid('l'), locked: false };
  copy.transform = { ...copy.transform, x: copy.transform.x + 24, y: copy.transform.y + 24 };
  const next = [...layers];
  next.splice(i + 1, 0, copy);
  return { doc: withLayers(doc, next), id: copy.id };
}

/** One step up or down the stack, or to its top or bottom. */
export function moveLayer(doc: ProjectDoc, id: string, to: 'up' | 'down' | 'top' | 'bottom'): ProjectDoc {
  const layers = [...body(doc).layers];
  const i = layers.findIndex((x) => x.id === id);
  if (i < 0) return doc;
  const [l] = layers.splice(i, 1);
  const j = to === 'up' ? Math.min(layers.length, i + 1) : to === 'down' ? Math.max(0, i - 1) : to === 'top' ? layers.length : 0;
  layers.splice(j, 0, l);
  return withLayers(doc, layers);
}

/** A new canvas size or background; layers keep their place relative to the canvas. */
export function setCanvas(doc: ProjectDoc, patch: { w?: number; h?: number; background?: string | null }): ProjectDoc {
  const p = body(doc);
  const w = patch.w !== undefined ? Math.min(PHOTO_MAX_SIDE, Math.max(16, Math.round(patch.w))) : p.w;
  const h = patch.h !== undefined ? Math.min(PHOTO_MAX_SIDE, Math.max(16, Math.round(patch.h))) : p.h;
  const kx = w / p.w;
  const ky = h / p.h;
  const layers = kx === 1 && ky === 1 ? p.layers : p.layers.map((l) => ({ ...l, transform: { ...l.transform, x: l.transform.x * kx, y: l.transform.y * ky } }));
  return { ...doc, photo: { ...p, w, h, layers, ...(patch.background !== undefined ? { background: patch.background } : {}) } };
}

/** A layer moved to an edge or the centre of the canvas, given its drawn size. */
export function alignLayer(doc: ProjectDoc, id: string, how: 'start' | 'centerX' | 'end' | 'top' | 'centerY' | 'bottom', size: { w: number; h: number }): ProjectDoc {
  const p = body(doc);
  return updateLayer(doc, id, (l) => {
    const t = { ...l.transform };
    // in the right-to-left page «البداية» is the right edge
    if (how === 'start') t.x = p.w - size.w / 2;
    if (how === 'end') t.x = size.w / 2;
    if (how === 'centerX') t.x = p.w / 2;
    if (how === 'top') t.y = size.h / 2;
    if (how === 'bottom') t.y = p.h - size.h / 2;
    if (how === 'centerY') t.y = p.h / 2;
    return { ...l, transform: t };
  });
}

/** Whether an adjustment changes anything. */
export const adjusts = (a: Adjust | undefined) => !!a && !!(a.brightness || a.contrast || a.saturation || a.warmth || a.blur);

// ---------------------------------------------------------------------------
// Pixel functions. Each is self-contained (no outside names), so the worker can run its source text.
// ---------------------------------------------------------------------------

/** Brightness, contrast, saturation and warmth (each -100 to 100), in place on RGBA bytes. */
export function adjustPixels(data: Uint8ClampedArray, a: { brightness?: number; contrast?: number; saturation?: number; warmth?: number }): void {
  const br = 1 + (a.brightness || 0) / 100;
  const ct = 1 + (a.contrast || 0) / 100;
  const sat = 1 + (a.saturation || 0) / 100;
  const wr = (a.warmth || 0) / 100;
  for (let i = 0; i < data.length; i += 4) {
    let r = data[i] * br;
    let g = data[i + 1] * br;
    let b = data[i + 2] * br;
    r = (r - 128) * ct + 128;
    g = (g - 128) * ct + 128;
    b = (b - 128) * ct + 128;
    const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    r = y + (r - y) * sat;
    g = y + (g - y) * sat;
    b = y + (b - y) * sat;
    r *= 1 + wr * 0.25;
    b *= 1 - wr * 0.25;
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
  }
}

/** A blur of the given radius in pixels: three box passes each way (close to a Gaussian). */
export function blurPixels(data: Uint8ClampedArray, w: number, h: number, radius: number): void {
  const r = Math.max(0, Math.round(radius));
  if (!r) return;
  const tmp = new Uint8ClampedArray(data.length);
  const pass = (src: Uint8ClampedArray, dst: Uint8ClampedArray, horizontal: boolean) => {
    const len = horizontal ? w : h;
    const lines = horizontal ? h : w;
    const span = 2 * r + 1;
    for (let line = 0; line < lines; line++) {
      for (let c = 0; c < 4; c++) {
        let acc = 0;
        const at = (k: number) => {
          const kk = k < 0 ? 0 : k >= len ? len - 1 : k;
          return horizontal ? (line * w + kk) * 4 + c : (kk * w + line) * 4 + c;
        };
        for (let k = -r; k <= r; k++) acc += src[at(k)];
        for (let k = 0; k < len; k++) {
          dst[at(k)] = acc / span;
          acc += src[at(k + r + 1)] - src[at(k - r)];
        }
      }
    }
  };
  for (let n = 0; n < 3; n++) {
    pass(data, tmp, true);
    pass(tmp, data, false);
  }
}

let worker: Worker | null = null;
let seq = 0;
const waiting = new Map<number, (d: ImageData) => void>();
const pending = new Map<number, { w: number }>();

function startWorker(): Worker | null {
  if (worker) return worker;
  if (typeof Worker === 'undefined' || typeof Blob === 'undefined') return null;
  const src = `const adjustPixels = ${adjustPixels.toString()};
const blurPixels = ${blurPixels.toString()};
self.onmessage = (e) => {
  const { id, data, w, h, a } = e.data;
  adjustPixels(data, a);
  if (a.blur) blurPixels(data, w, h, a.blur / 100 * Math.max(w, h) / 60);
  self.postMessage({ id, data }, [data.buffer]);
};`;
  try {
    worker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
    worker.onmessage = (e: MessageEvent<{ id: number; data: Uint8ClampedArray }>) => {
      const done = waiting.get(e.data.id);
      waiting.delete(e.data.id);
      if (done) done(new ImageData(e.data.data as Uint8ClampedArray<ArrayBuffer>, (pending.get(e.data.id) ?? { w: 1 }).w));
      pending.delete(e.data.id);
    };
  } catch {
    worker = null;
  }
  return worker;
}
/**
 * A picture with an adjustment applied, as a canvas: in the worker, or on this thread where workers are
 * refused. Blur is a share of the picture's longer side (100 is a sixtieth of it).
 */
export async function adjustImage(img: CanvasImageSource & { width: number; height: number }, a: Adjust): Promise<HTMLCanvasElement> {
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, c.width, c.height);
  const w = startWorker();
  let out: ImageData;
  if (w) {
    const id = ++seq;
    pending.set(id, { w: c.width });
    out = await new Promise<ImageData>((resolve) => {
      waiting.set(id, resolve);
      w.postMessage({ id, data: data.data, w: c.width, h: c.height, a }, [data.data.buffer]);
    });
  } else {
    adjustPixels(data.data, a);
    if (a.blur) blurPixels(data.data, c.width, c.height, (a.blur / 100) * (Math.max(c.width, c.height) / 60));
    out = data;
  }
  ctx.putImageData(out, 0, 0);
  return c;
}

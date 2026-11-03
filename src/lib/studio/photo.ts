// Photo projects (MVP_draft.md 62): layers drawn bottom first by the shared compositor, and the
// picture adjustments (brightness, contrast, saturation, warmth, blur) as pixel functions, run in
// workers so a large photo does not freeze the page, and used alike for the preview and the export (the
// canvas's own filter is not used for photos: Safari long ignored it, and it has no warmth). Since
// 2026-11-04 (Desktop_Power_Ideas.md P-17) the colour is whole numbers (effects/plan.ts photoColourPlan),
// the picture is cut into bands across as many workers as the computer's plan allows (scale.ts
// photoWorkers), each with the rows its blur reads, and an adjustment without blur is worked out on the
// graphics chip where there is one; every way gives the same bytes (qa/studio-photo-tiles.cjs). Pure apart
// from the workers.
import { PHOTO_MAX_SIDE, uid, type Adjust, type Content, type Layer, type ProjectDoc, type Transform } from './schema.ts';
import { effectsOnChip, photoColourPlan } from './effects/index.ts';
import { FLOOR } from './scale.ts';

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
  if (!l || l.locked || l.pinned) return doc;
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

/**
 * A photo's colour plan (`m` and `o`, effects/plan.ts photoColourPlan) in place on RGBA bytes as getImageData gives
 * them: colour is taken as the canvas holds it, premultiplied, back to straight colour as the graphics chip takes it
 * (effects/code.ts), so a see-through pixel comes out of the canvas the same either way.
 */
export function photoPixels(data: Uint8ClampedArray, m: Int32Array, o: Int32Array): void {
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (!a) continue;
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];
    if (a !== 255) {
      r = Math.min(255, Math.floor((Math.floor((r * a + 127) / 255) * 255 + (a >> 1)) / a));
      g = Math.min(255, Math.floor((Math.floor((g * a + 127) / 255) * 255 + (a >> 1)) / a));
      b = Math.min(255, Math.floor((Math.floor((b * a + 127) / 255) * 255 + (a >> 1)) / a));
    }
    const vr = m[0] * r + m[1] * g + m[2] * b + o[0];
    const vg = m[3] * r + m[4] * g + m[5] * b + o[1];
    const vb = m[6] * r + m[7] * g + m[8] * b + o[2];
    // rounded to the nearest, an exact half to the even neighbour, as the bytes of an ImageData round
    data[i] = vr <= 0 ? 0 : Math.min(255, (vr & 65535) === 32768 ? ((vr + 32768) >> 16) & ~1 : (vr + 32768) >> 16);
    data[i + 1] = vg <= 0 ? 0 : Math.min(255, (vg & 65535) === 32768 ? ((vg + 32768) >> 16) & ~1 : (vg + 32768) >> 16);
    data[i + 2] = vb <= 0 ? 0 : Math.min(255, (vb & 65535) === 32768 ? ((vb + 32768) >> 16) & ~1 : (vb + 32768) >> 16);
  }
}

/** Brightness, contrast, saturation and warmth (each -100 to 100), in place on RGBA bytes. */
export function adjustPixels(data: Uint8ClampedArray, a: { brightness?: number; contrast?: number; saturation?: number; warmth?: number }): void {
  const plan = photoColourPlan(a);
  if (plan) photoPixels(data, plan.matrix!, plan.offset!);
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

/** The blur radius of an adjustment, whole pixels, for a picture of w by h: 100 is a sixtieth of the longer side. */
export const blurRadius = (a: Pick<Adjust, 'blur'>, w: number, h: number) => (a.blur ? Math.max(0, Math.round((a.blur / 100) * (Math.max(w, h) / 60))) : 0);

/**
 * The picture's rows cut into `n` bands: each band works rows top to bottom and keeps rows y0 to y1. A blur of radius
 * r makes three passes each way, each reaching r rows, so a band reads 3r rows beyond what it keeps (fewer at the
 * picture's own edges, which every band treats as the whole picture does), and what it keeps is exact.
 */
export function bandsOf(h: number, n: number, radius: number): { top: number; y0: number; y1: number; bottom: number }[] {
  const k = Math.max(1, Math.min(Math.floor(n), h));
  const reach = 3 * radius;
  return Array.from({ length: k }, (_, i) => {
    const y0 = Math.floor((i * h) / k);
    const y1 = Math.floor(((i + 1) * h) / k);
    return { top: Math.max(0, y0 - reach), y0, y1, bottom: Math.min(h, y1 + reach) };
  });
}

/** One band's work: the colour plan, then the blur. Self-contained like the pixel functions it calls. */
const bandWork = `self.onmessage = (e) => {
  const { id, data, w, h, m, o, r } = e.data;
  photoPixels(data, m, o);
  if (r) blurPixels(data, w, h, r);
  self.postMessage({ id, data }, [data.buffer]);
};`;

/** Workers for photo adjustments: at most this many at once (scale.ts photoWorkers; the floor is one). */
let workersWanted = FLOOR.photoWorkers;
export const setPhotoWorkers = (n: number) => {
  workersWanted = Math.max(1, Math.min(16, Math.floor(n) || 1));
};

type Band = { data: Uint8ClampedArray; w: number; h: number; m: Int32Array; o: Int32Array; r: number };
const workers: Worker[] = [];
const waiting = new Map<number, (d: Uint8ClampedArray) => void>();
let seq = 0;
let refused = false;

function workerPool(n: number): Worker[] {
  if (refused || typeof Worker === 'undefined' || typeof Blob === 'undefined') return [];
  const src = `const photoPixels = ${photoPixels.toString()};\nconst blurPixels = ${blurPixels.toString()};\n${bandWork}`;
  try {
    while (workers.length < n) {
      const w = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
      w.onmessage = (e: MessageEvent<{ id: number; data: Uint8ClampedArray }>) => {
        const done = waiting.get(e.data.id);
        waiting.delete(e.data.id);
        done?.(e.data.data);
      };
      workers.push(w);
    }
  } catch {
    if (!workers.length) refused = true;
  }
  return workers.slice(0, n);
}

function inWorker(w: Worker, band: Band): Promise<Uint8ClampedArray> {
  const id = ++seq;
  return new Promise((resolve) => {
    waiting.set(id, resolve);
    w.postMessage({ id, ...band }, [band.data.buffer]);
  });
}

const IDENTITY = Int32Array.of(65536, 0, 0, 0, 65536, 0, 0, 0, 65536);
const NO_OFFSET = new Int32Array(3);

/** The chip's share of a large photo at a time: a canvas past its memory would get a smaller picture (chip.ts). */
const CHIP_TILE = 4096;
let tile: OffscreenCanvas | HTMLCanvasElement | null = null;

/**
 * A colour plan over the canvas on the graphics chip, a tile at a time (colour is pixel by pixel, so tiles are exact);
 * false when the chip declines a tile, the canvas then partly done.
 */
function colourOnChip(c: HTMLCanvasElement, ctx: CanvasRenderingContext2D, plan: NonNullable<ReturnType<typeof photoColourPlan>>): boolean {
  for (let y = 0; y < c.height; y += CHIP_TILE) {
    for (let x = 0; x < c.width; x += CHIP_TILE) {
      const tw = Math.min(CHIP_TILE, c.width - x);
      const th = Math.min(CHIP_TILE, c.height - y);
      tile ??= typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(tw, th) : document.createElement('canvas');
      if (tile.width !== tw) tile.width = tw;
      if (tile.height !== th) tile.height = th;
      const t = tile.getContext('2d') as CanvasRenderingContext2D;
      t.clearRect(0, 0, tw, th);
      t.drawImage(c, x, y, tw, th, 0, 0, tw, th);
      const out = effectsOnChip(tile, tw, th, { colour: plan, blur: null });
      if (!out) return false;
      ctx.clearRect(x, y, tw, th);
      ctx.drawImage(out, x, y);
    }
  }
  return true;
}

/**
 * A picture with an adjustment applied, as a canvas. Without blur, on the graphics chip where it runs; otherwise in
 * bands across up to `workers` workers (the plan's photoWorkers by default), or on this thread where workers are
 * refused. Every way gives the same bytes. `path` is for the browser check: 'chip' or 'workers' alone.
 */
export async function adjustImage(img: CanvasImageSource & { width: number; height: number }, a: Adjust, o: { workers?: number; path?: 'auto' | 'chip' | 'workers' } = {}): Promise<HTMLCanvasElement> {
  const c = document.createElement('canvas');
  const W = (c.width = img.width);
  const H = (c.height = img.height);
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);
  const plan = photoColourPlan(a);
  const r = blurRadius(a, W, H);
  const path = o.path ?? 'auto';
  if (plan && !r && path !== 'workers') {
    if (colourOnChip(c, ctx, plan)) return c;
    // a tile declined: the picture again as it was, for the workers
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(img, 0, 0);
    if (path === 'chip') throw new Error('NO_CHIP');
  }
  if (!plan && !r) return c;
  let pixels = ctx.getImageData(0, 0, W, H);
  const data = pixels.data;
  // with no colour, the identity: each engine reads a see-through pixel back to straight colour its own way, and
  // photoPixels puts it in one form before the blur reads it
  const m = plan?.matrix ?? IDENTITY;
  const off = plan?.offset ?? NO_OFFSET;
  const pool = workerPool(Math.max(1, Math.floor(o.workers ?? workersWanted)));
  if (!pool.length) {
    photoPixels(data, m, off);
    blurPixels(data, W, H, r);
  } else if (pool.length === 1) {
    // one worker: the whole picture, moved there and back without a copy, as before 2026-11-04
    pixels = new ImageData((await inWorker(pool[0], { data, w: W, h: H, m, o: off, r })) as Uint8ClampedArray<ArrayBuffer>, W, H);
  } else {
    const bands = bandsOf(H, pool.length, r);
    await Promise.all(
      bands.map(async (b, i) => {
        const out = await inWorker(pool[i], { data: data.slice(b.top * W * 4, b.bottom * W * 4), w: W, h: b.bottom - b.top, m, o: off, r });
        data.set(out.subarray((b.y0 - b.top) * W * 4, (b.y1 - b.top) * W * 4), b.y0 * W * 4);
      }),
    );
  }
  ctx.putImageData(pixels, 0, 0);
  return c;
}

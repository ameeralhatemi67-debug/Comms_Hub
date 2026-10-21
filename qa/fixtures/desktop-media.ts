// Light copies and editable copies by the studio's real modules inside the desktop application
// (qa/desktop-media.cjs; Desktop_App_Plan.md phase D5, DT-12): the corpus files are chosen in the page, made
// ready by the media pool (directly, or converted by the application when the browser cannot decode them),
// and every frame read is identified by the 12-bit gray code each file carries, so "the same frame" is
// exact. The preview's frames come from the light copy, the export's from the original; the export is sent
// back to the check for ffprobe. Results go back to the check by PUT or as return values.
import * as schema from '../../src/lib/studio/schema.ts';
import * as timeline from '../../src/lib/studio/timeline.ts';
import * as media from '../../src/lib/studio/media.ts';
import * as cache from '../../src/lib/studio/cache.ts';
import { exportVideo } from '../../src/lib/studio/export.ts';

const US = schema.US;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const BITS = 12;

/** The frame number a picture carries: twelve boxes across its middle, white for a one, in gray code. */
export function readGray(src: CanvasImageSource): number | null {
  const c = document.createElement('canvas');
  c.width = 320;
  c.height = 180;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(src, 0, 0, 320, 180);
  const px = g.getImageData(0, 0, 320, 180).data;
  let gray = 0;
  for (let k = 0; k < BITS; k++) {
    const x = Math.round((320 * (k + 2.45)) / 16);
    const y = 90;
    const i = (y * 320 + x) * 4;
    const lum = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
    if (lum > 128) gray |= 1 << k;
  }
  let n = 0;
  for (let v = gray; v; v >>= 1) n ^= v;
  return n;
}

type Opened = { name: string; id: string; doc: schema.ProjectDoc; pool: media.MediaPool; dc: cache.DeviceCache; key: string };
const opened = new Map<string, Opened>();
let dcShared: cache.DeviceCache | null = null;

async function settled(pool: media.MediaPool, id: string, ms = 600000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const s = pool.state(id);
    if (s && s.kind !== 'loading') return s;
    await sleep(100);
  }
  return pool.state(id);
}

/** Chooses every corpus file in the page and makes each one ready as the studio does. */
export async function openCorpus() {
  const files = [...(document.getElementById('corpus') as HTMLInputElement).files!];
  dcShared = (await cache.DeviceCache.open())!;
  const dc = dcShared;
  const out: Record<string, unknown>[] = [];
  for (const file of files) {
    // as the editor adds a file (editor.tsx addDevice): the browser's reading, else the application's
    const browserInfo = await media.probeFile(file).catch(() => null);
    const info = browserInfo ?? (await dc.probeInApp(file));
    const { key } = await dc.putLocal(file);
    // where the original's first frame is, as the browser reads it (null when it cannot read the file at all)
    let first: number | null = null;
    try {
      const mb = await media.mediabunny();
      const input = new mb.Input({ source: new mb.BlobSource(file), formats: mb.ALL_FORMATS });
      first = await (await input.getPrimaryVideoTrack())!.getFirstTimestamp();
    } catch {
      first = null;
    }
    const pool = new media.MediaPool({ cache: dc, onChange: () => undefined });
    const r = timeline.addSource(schema.newVideoDoc('16:9', 25), { kind: 'local', key, name: file.name, media: 'video', mime: file.type || 'video/mp4', size: file.size, w: info?.w ?? 1920, h: info?.h ?? 1080, duration: info?.duration ?? 8 * US });
    // the clip starts one second into the picture
    const doc = timeline.addClip(r.doc, { source: r.id, start: 0, length: 4 * US, in: Math.round(((first ?? 0) + 1) * US) }).doc;
    pool.ensure(doc);
    const state = await settled(pool, r.id);
    // the light copy's offer waits for the probe
    for (let i = 0; i < 50 && pool.tools(r.id) && !pool.tools(r.id)!.heavy && state?.kind === 'ready'; i++) await sleep(100);
    opened.set(file.name, { name: file.name, id: r.id, doc, pool, dc, key });
    out.push({ name: file.name, size: file.size, type: file.type, info, viaApp: !browserInfo && !!info, first, state, tools: pool.tools(r.id) });
  }
  return out;
}

/** «تحويل إلى نسخة قابلة للتحرير» for one file, then its state again. */
export async function convert(name: string) {
  const o = opened.get(name)!;
  const t0 = performance.now();
  const progress: number[] = [];
  const watch = setInterval(() => {
    const t = o.pool.tools(o.id);
    if (t?.convert.kind === 'making') progress.push(t.convert.done);
  }, 200);
  await o.pool.convert(o.id);
  clearInterval(watch);
  const state = await settled(o.pool, o.id);
  // the light copy's offer waits for the probe, which follows the source being ready
  for (let i = 0; i < 50 && state?.kind === 'ready' && !o.pool.tools(o.id)?.heavy && (o.pool.info(o.id)?.h ?? 0) > 1080; i++) await sleep(100);
  return { ms: Math.round(performance.now() - t0), state, tools: o.pool.tools(o.id), progress: progress.length, info: o.pool.info(o.id) };
}

/** «إنشاء نسخة خفيفة للمعاينة» for one file. */
export async function proxy(name: string) {
  const o = opened.get(name)!;
  const t0 = performance.now();
  await o.pool.makeProxy(o.id);
  return { ms: Math.round(performance.now() - t0), tools: o.pool.tools(o.id), inUse: [...o.pool.inUse(o.doc)] };
}

/** The frame the preview shows at `at` (from the light copy when there is one), waited for until it holds. */
async function previewFrame(pool: media.MediaPool, id: string, at: number): Promise<number | null> {
  let src: CanvasImageSource | null = null;
  for (let i = 0; i < 300; i++) {
    src = pool.frameNear(id, Math.round(at * US));
    await sleep(30);
    const again = pool.frameNear(id, Math.round(at * US));
    if (src && again === src) {
      await sleep(30);
      if (pool.frameNear(id, Math.round(at * US)) === src) break;
    }
  }
  return src ? readGray(src) : null;
}

/** For each time: the frame the preview shows and the frame the export reads (the original, exact). */
export async function frames(name: string, times: number[]) {
  const o = opened.get(name)!;
  const rows: { at: number; preview: number | null; exact: number | null }[] = [];
  for (const at of times) {
    const exact = await o.pool.frameAt(o.id, Math.round(at * US));
    const e = exact ? readGray(exact) : null;
    rows.push({ at, preview: await previewFrame(o.pool, o.id, at), exact: e });
  }
  const el = o.pool.element('probe-clip', o.id) as HTMLVideoElement | null;
  return { rows, elementSrc: el?.src ?? null, offset: o.pool.elementOffset(o.id) };
}

type Sink = { getCanvas: (...a: unknown[]) => unknown; canvases: (...a: unknown[]) => unknown };
type Inner = { url: string; sink?: Sink; passSink?: Sink; preview?: { url: string; sink: Sink } };

/** Counts the calls on a decoder's two ways of giving frames, until `undo` is called. */
function counting(sink: Sink | undefined, count: { n: number }) {
  if (!sink) return () => undefined;
  const get = sink.getCanvas;
  const all = sink.canvases;
  sink.getCanvas = (...a: unknown[]) => (count.n++, get.apply(sink, a));
  sink.canvases = (...a: unknown[]) => (count.n++, all.apply(sink, a));
  return () => {
    sink.getCanvas = get;
    sink.canvases = all;
  };
}

/** An export of the file's clip: which decoder gave its frames (the original's or the light copy's), and the file to the check. */
export async function exportFrom(name: string) {
  const o = opened.get(name)!;
  const l = (o.pool as unknown as { loaded: Map<string, Inner> }).loaded.get(o.id)!;
  const original = { n: 0 };
  const light = { n: 0 };
  const undo = [counting(l.sink, original), counting(l.passSink, original), counting(l.preview?.sink, light)];
  try {
    const t0 = performance.now();
    const r = await exportVideo(o.doc, o.pool, { short: 720, format: 'mp4', name: 'export.mp4' });
    const ms = Math.round(performance.now() - t0);
    undo.forEach((u) => u());
    const put = await fetch(`/upload?name=${encodeURIComponent(`export-${name}.mp4`)}`, { method: 'PUT', body: r.file });
    const hide = (u: string | undefined) => u?.replace(/[A-Za-z0-9_-]{43}$/, '<token>') ?? null;
    return { ms, frames: r.frames, bytes: r.bytes, uploaded: put.status, originalCalls: original.n, lightCalls: light.n, originalUrl: hide(l.url), lightUrl: hide(l.preview?.url) };
  } finally {
    undo.forEach((u) => u());
  }
}

/** Starts a light copy and returns once FFmpeg reports progress, for the quit check. */
export async function startLongProxy(name: string) {
  const o = opened.get(name)!;
  void o.pool.makeProxy(o.id);
  for (let i = 0; i < 600; i++) {
    const t = o.pool.tools(o.id);
    if (t?.proxy.kind === 'making' && t.proxy.done > 0) return { making: true, done: t.proxy.done, total: t.proxy.total };
    await sleep(100);
  }
  return { making: false, tools: o.pool.tools(o.id) };
}

export async function cancelProxy(name: string) {
  const o = opened.get(name)!;
  await o.pool.cancelCopy(o.id, 'proxy');
  for (let i = 0; i < 100 && o.pool.tools(o.id)?.proxy.kind === 'making'; i++) await sleep(100);
  return o.pool.tools(o.id);
}

export async function usage() {
  return dcShared ? dcShared.refreshFolder() : null;
}

Object.assign(window, { openCorpus, convert, proxy, frames, exportFrom, startLongProxy, cancelProxy, usage, readGray });

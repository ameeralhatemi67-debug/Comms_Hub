// The paused preview's scrubbing, by the studio's real modules (qa/studio-scrub.cjs; Desktop_Power_Ideas.md P-02,
// phase D10): a 4K source is read by the media pool as the editor reads it, a clip of it is drawn by the real player
// on a canvas the size of the stage, and every seek is timed from the player's seek to the moment the pool shows the
// frame for that time. The floor (no memory for frames) and the plan's memory run the same seeks. Each fixture frame
// carries its number as a 12-bit gray code, so "the same frame" is exact. Results go back as return values.
import * as schema from '../../src/lib/studio/schema.ts';
import * as timeline from '../../src/lib/studio/timeline.ts';
import * as media from '../../src/lib/studio/media.ts';
import { Player } from '../../src/lib/studio/preview.ts';
import { MotionRenderer } from '../../src/lib/studio/motion-adapter.ts';

const US = schema.US;
const BITS = 12;
const EPS = 1e-6;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The frame number a picture carries: twelve boxes across its middle, white for a one, in gray code. */
function readGray(src: CanvasImageSource): number {
  const c = document.createElement('canvas');
  c.width = 320;
  c.height = 180;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(src, 0, 0, 320, 180);
  const px = g.getImageData(0, 0, 320, 180).data;
  let gray = 0;
  for (let k = 0; k < BITS; k++) {
    const i = (90 * 320 + Math.round((320 * (k + 2.45)) / 16)) * 4;
    if (0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2] > 128) gray |= 1 << k;
  }
  let n = 0;
  for (let v = gray; v; v >>= 1) n ^= v;
  return n;
}

type Open = { pool: media.MediaPool; player: Player; doc: schema.ProjectDoc; id: string; fps: number; duration: number; changed: () => Promise<void>; canvas: HTMLCanvasElement };
let cur: Open | null = null;
const blobs = new Map<string, string>();

/** A seeded sequence in [0, 1), so the floor and the frame memory are asked the very same times. */
function rng(seed: number) {
  return () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
}

async function open(o: { file: string; cacheMB: number; ratio: schema.Ratio; canvasW: number }): Promise<Record<string, unknown>> {
  cur?.player.dispose();
  cur?.pool.dispose();
  // the file is read from memory, as the editor reads a copy on this device
  let url = blobs.get(o.file);
  if (!url) {
    url = URL.createObjectURL(await (await fetch(`/media/${o.file}`)).blob());
    blobs.set(o.file, url);
  }
  let notify: (() => void) | null = null;
  const pool = new media.MediaPool({ cache: null, onChange: () => notify?.(), url: () => url! });
  pool.setFrameCache(o.cacheMB);
  const info = await media.probeFile(await (await fetch(url)).blob());
  const r = timeline.addSource(schema.newVideoDoc(o.ratio, 30), { kind: 'library', asset: '00000000-0000-4000-8000-0000000000c1', version: 1, name: o.file, media: 'video', mime: 'video/mp4', size: 1, w: info!.w!, h: info!.h!, duration: info!.duration! });
  const doc = timeline.addClip(r.doc, { source: r.id, start: 0, length: info!.duration!, in: 0 }).doc;
  pool.ensure(doc);
  for (let i = 0; i < 600 && pool.state(r.id)?.kind !== 'ready'; i++) await sleep(50);
  const W = schema.canvasOf(doc).w;
  const canvas = document.createElement('canvas');
  canvas.width = o.canvasW;
  canvas.height = Math.round((o.canvasW * schema.canvasOf(doc).h) / W);
  document.body.append(canvas);
  const player = new Player({ canvas, pool, motion: new MotionRenderer(), getDoc: () => doc, scale: () => canvas.width / W, onTime: () => undefined });
  const changed = () => new Promise<void>((res) => (notify = () => ((notify = null), res())));
  cur = { pool, player, doc, id: r.id, fps: 30, duration: info!.duration! / US, changed, canvas };
  return { state: pool.state(r.id), info, canvas: [canvas.width, canvas.height], cache: pool.frameCache() };
}

/**
 * Seeks the player to `s` seconds and waits until the pool shows the frame for it (`right`, at any size: a small kept
 * frame counts) and until it shows it at the preview's size with nothing more to read (`sharp`); milliseconds each,
 * null on time out.
 */
async function seekAndWait(s: number, limit = 20000): Promise<{ right: number | null; sharp: number | null }> {
  const o = cur!;
  const at = Math.round(s * US);
  const t0 = performance.now();
  let right: number | null = null;
  const look = () => {
    const sp = o.pool.shownSpan(o.id);
    // the frame for `at`: the floor's frame by its own rule (it may take the next frame within 0.1 ms), the kept one by the export's
    const covers = !!sp && sp.from <= at / US + 1e-4 && at / US < sp.to + 1e-4;
    if (covers && right === null) right = performance.now() - t0;
    return covers && sp!.sharp && !sp!.busy;
  };
  while (performance.now() - t0 < limit) {
    const wait = o.changed();
    o.player.seek(at);
    if (look()) return { right, sharp: performance.now() - t0 };
    await Promise.race([wait, sleep(250)]);
    if (look()) return { right, sharp: performance.now() - t0 };
  }
  return { right, sharp: null };
}

const stats = (ms: number[]) => {
  if (!ms.length) return { n: 0, median: null, p95: null, max: null, mean: null };
  const a = [...ms].sort((x, y) => x - y);
  const q = (p: number) => Math.round(a[Math.min(a.length - 1, Math.floor(p * a.length))] * 10) / 10;
  return { n: a.length, median: q(0.5), p95: q(0.95), max: Math.round(a[a.length - 1] * 10) / 10, mean: Math.round((a.reduce((x, y) => x + y, 0) / a.length) * 10) / 10 };
};

/**
 * The paused preview left on the clip's first frame until its small frames stop growing (the editor open on the
 * project), at most `ms`: how long that took and what was kept.
 */
async function settle(o: { ms: number }) {
  const t0 = performance.now();
  await seekAndWait(0);
  let last = -1;
  let still = 0;
  while (performance.now() - t0 < o.ms) {
    await sleep(250);
    const n = cur!.pool.frameCache().small.frames;
    still = n === last ? still + 1 : 0;
    last = n;
    if (still >= 6) break;
  }
  return { ms: Math.round(performance.now() - t0), cache: cur!.pool.frameCache() };
}

/** `count` random seeks over the whole source (seeded), with `pause` ms between them, as a person jumping about. */
async function random(o: { count: number; seed: number; pause: number }) {
  const r = rng(o.seed);
  const right: number[] = [];
  const sharp: number[] = [];
  let timeouts = 0;
  for (let i = 0; i < o.count; i++) {
    const s = r() * (cur!.duration - 0.2);
    const t = await seekAndWait(s);
    if (t.right === null || t.sharp === null) timeouts++;
    if (t.right !== null) right.push(t.right);
    if (t.sharp !== null) sharp.push(t.sharp);
    if (o.pause) await sleep(o.pause);
  }
  return { ...stats(right), sharp: stats(sharp), timeouts, cache: cur!.pool.frameCache() };
}

/** From a random place, `count` steps of one frame forward, then as many back, as the arrow keys do. */
async function steps(o: { count: number; seed: number; pause: number }) {
  const r = rng(o.seed);
  const n0 = Math.floor(r() * (cur!.duration - 2 * o.count / 30 - 1) * 30) + o.count;
  const fwd: number[] = [];
  const back: number[] = [];
  let timeouts = 0;
  for (let i = 0; i <= o.count; i++) {
    const t = await seekAndWait((n0 + i + 0.5) / 30);
    if (t.sharp === null) timeouts++;
    else if (i) fwd.push(t.sharp);
    if (o.pause) await sleep(o.pause);
  }
  for (let i = o.count - 1; i >= 0; i--) {
    const t = await seekAndWait((n0 + i + 0.5) / 30);
    if (t.sharp === null) timeouts++;
    else back.push(t.sharp);
    if (o.pause) await sleep(o.pause);
  }
  return { forward: stats(fwd), back: stats(back), timeouts };
}

/**
 * The frame shown at 48 times (16 frames spread over the source: the middle and 2 ms inside each edge, as DT-12) against
 * the frame the decoder gives there (frameAt, the export's still decoder) and the number the time names; then the
 * exact microsecond a frame starts and the one before it, against the export's rule.
 */
async function identity() {
  const o = cur!;
  const times: number[] = [];
  for (let i = 0; i < 16; i++) {
    const n = Math.floor(((i + 0.5) / 16) * (o.duration - 0.5) * o.fps);
    times.push((n + 0.5) / o.fps, n / o.fps + 0.002, (n + 1) / o.fps - 0.002);
  }
  const rows: { s: number; expected: number; shown: number | null; decoder: number | null; small: number | null }[] = [];
  for (const s of times) {
    const at = Math.round(s * US);
    // the small frame kept for that time, if the stretch was filled (it is what a jump shows first)
    const small = o.pool.keptAt(o.id, at / US).small;
    await seekAndWait(s);
    const shown = o.pool.frameNear(o.id, at);
    const dec = await o.pool.frameAt(o.id, at);
    rows.push({ s, expected: Math.floor((at / US + EPS) * o.fps), shown: shown ? readGray(shown) : null, decoder: dec ? readGray(dec) : null, small: small ? readGray(small) : null });
  }
  const edges: { us: number; expected: number; shown: number | null }[] = [];
  for (let i = 0; i < 12; i++) {
    const n = 1 + Math.floor(((i + 0.5) / 12) * (o.duration - 0.5) * o.fps);
    for (const us of [Math.round((n * US) / o.fps), Math.round((n * US) / o.fps) - 1, Math.floor((n * US) / o.fps) - 2]) {
      await seekAndWait(us / US);
      const shown = o.pool.frameNear(o.id, us);
      edges.push({ us, expected: Math.floor((us / US + EPS) * o.fps), shown: shown ? readGray(shown) : null });
    }
  }
  return { rows, edges, cache: o.pool.frameCache() };
}

function renderer() {
  const gl = document.createElement('canvas').getContext('webgl');
  const ext = gl?.getExtension('WEBGL_debug_renderer_info');
  return gl && ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : null;
}

/** The row's media let go (its decoders end), so the page is quiet when the check measures how it draws. */
function close() {
  cur?.player.dispose();
  cur?.pool.dispose();
  cur?.canvas.remove();
  cur = null;
}

(window as unknown as { scrub: unknown }).scrub = { open, close, settle, random, steps, identity, renderer };

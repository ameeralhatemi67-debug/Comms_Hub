// Light copies made in idle time, by the studio's real modules inside the desktop application (qa/desktop-idle.cjs; D12,
// Desktop_Power_Ideas.md P-08 and P-30). The corpus is chosen in the page and opened by one media pool, as the editor
// opens a project, so the device cache names every video source to the application's queue on its own. The page reads
// the queue as the application tells it, says what it does when the check asks (playing, busy), asks for a copy the way
// «إنشاء نسخة خفيفة للمعاينة» does, and plays the project on the studio's own player to time the stage's frames.
import * as schema from '../../src/lib/studio/schema.ts';
import * as timeline from '../../src/lib/studio/timeline.ts';
import * as media from '../../src/lib/studio/media.ts';
import * as cache from '../../src/lib/studio/cache.ts';
import { Player } from '../../src/lib/studio/preview.ts';
import { MotionRenderer } from '../../src/lib/studio/motion-adapter.ts';
import { setActivity, type NativeQueueState } from '../../src/lib/native/index.ts';

const US = schema.US;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
type Bridge = { media: { queue(a: unknown): Promise<NativeQueueState>; queued(): Promise<NativeQueueState> }; life: { busy(r: string): Promise<boolean>; idle(): Promise<boolean> } };
const bridge = () => (window as unknown as { commsHubNative: Bridge }).commsHubNative;

let dc: cache.DeviceCache;
let pool: media.MediaPool;
let doc: schema.ProjectDoc;
const ids: { name: string; id: string }[] = [];
/** Every queue state the application sent, with when it arrived. */
const heard: { at: number; hold: string | null; states: string[] }[] = [];

/** Opens every chosen file in one project, one after another on the timeline, as the editor does. */
export async function openCorpus(): Promise<{ names: string[]; states: unknown[]; width: number | null }> {
  const files = [...(document.getElementById('corpus') as HTMLInputElement).files!];
  dc = (await cache.DeviceCache.open())!;
  dc.onQueue((s) => heard.push({ at: Date.now(), hold: s.hold, states: s.items.map((i) => i.state) }));
  pool = new media.MediaPool({ cache: dc, onChange: () => undefined });
  doc = schema.newVideoDoc('16:9', 25);
  let start = 0;
  for (const file of files) {
    const info = await media.probeFile(file).catch(() => null);
    const { key } = await dc.putLocal(file);
    const r = timeline.addSource(doc, { kind: 'local', key, name: file.name, media: 'video', mime: file.type || 'video/mp4', size: file.size, w: info?.w ?? 3840, h: info?.h ?? 2160, duration: info?.duration ?? 30 * US });
    // one clip after another on the same track, so none is moved for want of a free track
    doc = timeline.addClip(r.doc, { source: r.id, start, length: 8 * US, in: 0 }).doc;
    start += 8 * US;
    ids.push({ name: file.name, id: r.id });
  }
  pool.ensure(doc);
  for (const { id } of ids) {
    for (let i = 0; i < 600 && pool.state(id)?.kind === 'loading'; i++) await sleep(100);
  }
  return { names: ids.map((x) => x.name), states: ids.map((x) => pool.state(x.id)), width: dc.queued?.width ?? null };
}

/** The queue as the application has it now. */
export const queued = () => bridge().media.queued();
export const heardStates = () => heard.slice();

/** The sources as the application's media tools name them, for a queue the check sets itself (a width to compare). */
export function refs() {
  return doc.sources.map((s) => dc.mediaRef(s)).filter(Boolean);
}
export const queueWith = (width: number) => bridge().media.queue({ items: refs(), width });
/** A queue of these files only, in this order. */
export function queueOnly(files: string[], width: number) {
  const items = files.map((f) => doc.sources.find((s) => s.id === ids.find((x) => x.name === f)!.id)!).map((s) => dc.mediaRef(s)).filter(Boolean);
  return bridge().media.queue({ items, width });
}
/** Which file each light copy is of: the names the application gives them (media.copies). */
export async function copyNames() {
  const out: Record<string, string> = {};
  for (const { name, id } of ids) {
    const s = doc.sources.find((x) => x.id === id)!;
    const ref = dc.mediaRef(s);
    const c = ref ? await dc.copies(ref) : null;
    if (c) out[c.names.proxy['720']] = name;
  }
  return out;
}
/** «حذف ملفات المعاينة المؤقتة», sparing what the project uses now (a light copy the preview reads). */
export const clearCopies = () => dc.clearLibrary(pool.inUse(doc));
export const stopQueue = () => dc.stopQueue();
export const activity = (kind: 'none' | 'playing' | 'scrubbing' | 'measuring') => setActivity(kind);
export const busy = (on: boolean) => (on ? bridge().life.busy('export') : bridge().life.idle());

/** «إنشاء نسخة خفيفة للمعاينة» for one source, as the button does; resolves when it is made. */
export async function ask(name: string, height = 720) {
  const id = ids.find((x) => x.name === name)!.id;
  const t0 = performance.now();
  await pool.makeProxy(id, height);
  return { ms: Math.round(performance.now() - t0), tools: pool.tools(id) };
}

/**
 * Plays the project on the studio's player for `seconds` and times the stage: the gap between drawn frames, its median,
 * 95th percentile and worst. `muted` plays without sound (so the window is not heard), `say` tells the application.
 */
export async function play(seconds: number, o: { muted?: boolean; say?: boolean } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = 1280;
  canvas.height = 720;
  document.body.append(canvas);
  const pl = new Player({ canvas, pool, motion: new MotionRenderer(), getDoc: () => doc, scale: () => canvas.width / schema.canvasOf(doc).w, onTime: () => undefined });
  pl.muted = !!o.muted;
  if (o.say) await setActivity('playing');
  const gaps: number[] = [];
  let last = 0;
  let on = true;
  const tick = (t: number) => {
    if (last) gaps.push(t - last);
    last = t;
    if (on) requestAnimationFrame(tick);
  };
  pl.seek(0);
  pl.play();
  requestAnimationFrame(tick);
  // the clip playing a moment in: whether its element plays, and with sound
  await sleep(1500);
  const clip = doc.video?.tracks.flatMap((t) => t.clips).find((c) => c.start === 0);
  const el = clip ? pool.element(clip.id, clip.source) : null;
  const element = el ? { paused: el.paused, muted: el.muted, volume: el.volume, readyState: el.readyState, time: Math.round(el.currentTime * 100) / 100 } : null;
  await sleep(Math.max(0, seconds * 1000 - 1500));
  on = false;
  pl.pause();
  if (o.say) await setActivity('none');
  canvas.remove();
  // the first half second settles the elements
  const kept = gaps.slice(Math.min(gaps.length - 1, 30)).sort((a, b) => a - b);
  const q = (p: number) => Math.round(kept[Math.min(kept.length - 1, Math.floor(p * kept.length))] * 100) / 100;
  return { frames: kept.length, p50: q(0.5), p95: q(0.95), max: Math.round(kept[kept.length - 1] * 100) / 100, element };
}

declare global {
  interface Window {
    [k: string]: unknown;
  }
}
Object.assign(window, { openCorpus, queued, heardStates, refs, queueWith, queueOnly, copyNames, clearCopies, stopQueue, activity, busy, ask, play });

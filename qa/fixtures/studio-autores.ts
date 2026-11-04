// Playing three 4K tracks in the preview, by the studio's real modules inside the desktop application
// (qa/studio-autores.cjs; Desktop_Power_Ideas.md P-03 and P-04, phase D10): the files are chosen in the page and made
// ready by the media pool from this device, as the editor adds them; the light copies are made by the application's
// own tools; the real player plays a project of three video tracks (one across the frame, two pictures in it) on a
// canvas the size of the stage, which follows «تلقائية» as stage.tsx does. The measurement «قياس قدرة الجهاز» is the
// studio's own (bench.ts), kept through the bridge, and the plan is scale.ts's. Results go back as return values.
import * as schema from '../../src/lib/studio/schema.ts';
import * as timeline from '../../src/lib/studio/timeline.ts';
import * as media from '../../src/lib/studio/media.ts';
import * as cache from '../../src/lib/studio/cache.ts';
import { Player } from '../../src/lib/studio/preview.ts';
import { MotionRenderer } from '../../src/lib/studio/motion-adapter.ts';
import { AutoLevel, stepOf, streamBudget } from '../../src/lib/studio/playback.ts';
import { plan, PREVIEW_STEPS } from '../../src/lib/studio/scale.ts';
import { canvasWidth } from '../../src/lib/studio/handles.ts';
import { measureDevice } from '../../src/lib/studio/bench.ts';
import { native, type ProfileNumbers } from '../../src/lib/native/index.ts';
import { factsFromApp } from '../../src/lib/native/device.ts';
import { currentEntry } from '../../src/lib/native/device.ts';

const US = schema.US;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
type Opened = { dc: cache.DeviceCache; pool: media.MediaPool; doc: schema.ProjectDoc; ids: string[] };
let cur: Opened | null = null;

/** The studio's measurement, kept by the application under its own key; the numbers and the plan they give. */
async function measure(o: { runs?: number }) {
  const n = native();
  const numbers = await measureDevice({ runs: o.runs ?? 3 });
  await n.raw!.profile!.save!(numbers);
  return planned();
}

/** The plan of this application, chip and driver, from the measurement kept for them (null before one). */
async function planned() {
  const n = native();
  const entry = currentEntry(await n.raw!.profile!.read!());
  const facts = factsFromApp(await n.raw!.info!());
  if (!entry) return { entry: null, knobs: plan(null), budget: null };
  return { entry: { key: entry.key, decode: entry.numbers.decode, compose: entry.numbers.compose, spread: entry.numbers.spread }, knobs: plan(entry.numbers, { cores: facts?.cores, memory: facts?.memory }), budget: streamBudget(entry.numbers), numbers: entry.numbers };
}

async function settled(pool: media.MediaPool, id: string, ms = 600000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const s = pool.state(id);
    if (s && s.kind !== 'loading') return s;
    await sleep(100);
  }
  return pool.state(id);
}

/** The three chosen files as three tracks: the first across the frame, the second and third as pictures in it. */
async function open() {
  const files = [...(document.getElementById('files') as HTMLInputElement).files!];
  const dc = (await cache.DeviceCache.open())!;
  // the plays with and without light copies are this check's own: the idle-time queue of D12 is kept out of them (it
  // would make copies between plays), and the copies are made when the check asks (copies() below)
  (dc as unknown as { copyQueue: unknown }).copyQueue = null;
  const pool = new media.MediaPool({ cache: dc, onChange: () => undefined });
  let doc = schema.newVideoDoc('16:9', 30);
  const ids: string[] = [];
  for (const file of files) {
    const info = await media.probeFile(file);
    const { key } = await dc.putLocal(file);
    const r = timeline.addSource(doc, { kind: 'local', key, name: file.name, media: 'video', mime: 'video/mp4', size: file.size, w: info!.w!, h: info!.h!, duration: info!.duration! });
    doc = r.doc;
    ids.push(r.id);
  }
  // three video tracks (the most allowed): add the two more the new project lacks
  for (let i = doc.video!.tracks.filter((t) => t.kind === 'video').length; i < 3; i++) doc = timeline.addTrack(doc, 'video');
  const tracks = doc.video!.tracks.filter((t) => t.kind === 'video').map((t) => t.id);
  const place = [
    { x: 960, y: 540, scale: 1 },
    { x: 480, y: 270, scale: 0.45 },
    { x: 1440, y: 810, scale: 0.45 },
  ];
  ids.forEach((id, i) => {
    doc = timeline.addClip(doc, { source: id, start: 0, length: 20 * US, in: 0, transform: { ...place[i], rotation: 0, opacity: 1 } }, { trackId: tracks[i] }).doc;
  });
  pool.ensure(doc);
  const states = [];
  for (const id of ids) states.push(await settled(pool, id));
  cur = { dc, pool, doc, ids };
  const clips = doc.video!.tracks.flatMap((t) => t.clips).map((c) => ({ source: c.source, start: c.start, length: c.length, track: doc.video!.tracks.find((t) => t.clips.includes(c))!.id }));
  return { states, clips, tools: ids.map((id) => cur!.pool.tools(id)) };
}

/** «إنشاء نسخة خفيفة للمعاينة» for each source. */
async function copies() {
  const o = cur!;
  const t0 = performance.now();
  for (const id of o.ids) await o.pool.makeProxy(id, 720);
  return { ms: Math.round(performance.now() - t0), tools: o.ids.map((id) => o.pool.tools(id)) };
}

/**
 * Plays `seconds` from the start: `resolution` a share (fixed) or 'auto', starting at `start` (a share); `budget` the
 * stream budget or null. The canvas follows «تلقائية» as stage.tsx does. Returns the play's figures.
 */
/** The stage: one canvas and one player for the whole session, as the editor keeps them (the budget it lowered stays). */
let stage: { canvas: HTMLCanvasElement; player: Player; size: (share: number) => void; onAuto: (share: number) => void } | null = null;

/**
 * `fresh` starts «تلقائية» anew at `start` (the plan's start, nothing known); otherwise it goes on from the level the last
 * play ended on, as the editor keeps it for the session.
 */
async function play(o: { resolution: number | 'auto'; start: number; budget: number | null; seconds: number; fresh?: boolean }) {
  const c = cur!;
  if (!stage) {
    const canvas = document.createElement('canvas');
    canvas.className = 'stage';
    canvas.style.width = '1280px';
    canvas.style.height = '720px';
    document.body.append(canvas);
    const size = (share: number) => {
      canvas.width = canvasWidth(1920, 1280, 1, share);
      canvas.height = Math.round((canvas.width * 1080) / 1920);
    };
    const player = new Player({ canvas, pool: c.pool, motion: new MotionRenderer(), getDoc: () => c.doc, scale: () => canvas.width / 1920, onTime: () => undefined });
    stage = { canvas, player, size, onAuto: () => undefined };
    player.onAuto = (sh) => stage!.onAuto(sh);
  }
  const { player, size } = stage;
  player.budget = () => o.budget;
  // as the editor sets it with a plan
  player.steady = o.budget !== null;
  const levels: { at: number; share: number }[] = [];
  let share = o.resolution === 'auto' ? PREVIEW_STEPS[stepOf(PREVIEW_STEPS, o.start)] : o.resolution;
  let t0 = 0;
  if (o.resolution !== 'auto') player.auto = null;
  else if (o.fresh || !player.auto) player.auto = new AutoLevel(PREVIEW_STEPS, stepOf(PREVIEW_STEPS, o.start));
  if (player.auto) share = player.auto.value;
  stage.onAuto = (sh) => {
    share = sh;
    levels.push({ at: Math.round(performance.now() - t0), share: sh });
    size(sh);
  };
  size(share);
  player.seek(0);
  await sleep(1500);
  t0 = performance.now();
  player.play();
  // the elements count their frames from when they were made: this play's are the difference
  const q0 = player.quality();
  await sleep(o.seconds * 1000);
  const q1 = player.quality();
  const quality = { total: q1.total - q0.total, dropped: q1.dropped - q0.dropped };
  const stats = { ...player.stats };
  const playing = c.ids.map((id, i) => {
    const el = c.pool.elementOf(c.doc.video!.tracks.flatMap((t) => t.clips).find((x) => x.source === id)!.id) as HTMLVideoElement | null;
    return { source: i, copy: el?.dataset.copy === '1', width: el?.videoWidth ?? null };
  });
  player.pause();
  // the frames the elements never showed: three videos, each due as many frames as the project
  const due = stats.due * c.ids.length;
  const shortPct = Math.round(Math.max(0, 1 - quality.total / Math.max(1, due)) * 1000) / 10;
  return { stats, quality, levels, end: share, playing, missedPct: Math.round((stats.missed / Math.max(1, stats.due)) * 1000) / 10, droppedPct: quality.total ? Math.round((quality.dropped / quality.total) * 1000) / 10 : null, shortPct };
}

function renderer() {
  const gl = document.createElement('canvas').getContext('webgl');
  const ext = gl?.getExtension('WEBGL_debug_renderer_info');
  return gl && ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : null;
}

(window as unknown as { autores: unknown }).autores = { measure, planned, open, copies, play, renderer };
export type { ProfileNumbers };

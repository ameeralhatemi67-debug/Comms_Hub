// The preview in a window of its own, by the studio's real modules inside the desktop application
// (qa/desktop-windows.cjs; Desktop_App_Plan.md phase D6, DT-14). The editor's page ('/') runs the studio's
// player with the leader end of the link (src/lib/studio/preview-link.ts) as usePreviewLink does; the preview
// window's page (/motion/studio/<project>/preview), opened by the application through the bridge, runs a
// second player with the follower end as PreviewWindow does. Each page records the playhead it draws with the
// moment on the clock both windows share, and can read the frame it shows by the gray code the source carries.
import * as schema from '../../src/lib/studio/schema.ts';
import * as timeline from '../../src/lib/studio/timeline.ts';
import * as media from '../../src/lib/studio/media.ts';
import * as cache from '../../src/lib/studio/cache.ts';
import { Player } from '../../src/lib/studio/preview.ts';
import { MotionRenderer } from '../../src/lib/studio/motion-adapter.ts';
import { followClock, PreviewFollower, PreviewLeader, wallNow, type Clock } from '../../src/lib/studio/preview-link.ts';

const US = schema.US;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const PROJECT = '0a1b2c3d-0000-4000-8000-0000000000d6';

function readGray(src: HTMLCanvasElement): number {
  const c = document.createElement('canvas');
  c.width = 320;
  c.height = 180;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(src, 0, 0, 320, 180);
  const px = g.getImageData(0, 0, 320, 180).data;
  let gray = 0;
  for (let k = 0; k < 12; k++) {
    const i = (90 * 320 + Math.round((320 * (k + 2.45)) / 16)) * 4;
    if (0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2] > 128) gray |= 1 << k;
  }
  let n = 0;
  for (let v = gray; v; v >>= 1) n ^= v;
  return n;
}

type Side = { pl: Player; canvas: HTMLCanvasElement; pool: media.MediaPool; samples: [number, number, boolean][]; recording: boolean };
let side: Side | null = null;
let leader: PreviewLeader | null = null;
let follower: PreviewFollower | null = null;
const state = { present: false, leaderHere: false, keys: 0, docs: 0 };

function makeSide(getDoc: () => schema.ProjectDoc, pool: media.MediaPool): Side {
  const canvas = document.getElementById('stage') as HTMLCanvasElement;
  canvas.width = 640;
  canvas.height = 360;
  const s: Side = { pl: null as unknown as Player, canvas, pool, samples: [], recording: false };
  s.pl = new Player({ canvas, pool, motion: new MotionRenderer(), getDoc, scale: () => canvas.width / schema.canvasOf(getDoc()).w, onTime: () => undefined });
  // the playhead each drawn frame shows, with the shared moment it was drawn
  const draw = s.pl.draw.bind(s.pl);
  s.pl.draw = () => {
    draw();
    if (s.recording) s.samples.push([wallNow(), s.pl.t, s.pl.playing]);
  };
  return s;
}

async function ready(pool: media.MediaPool, id: string) {
  for (let i = 0; i < 600; i++) {
    const st = pool.state(id);
    if (st && st.kind !== 'loading') return st;
    await sleep(100);
  }
  return pool.state(id);
}

/** The editor's page: the source chosen in the page, a project of it, the player and the leader end. */
export async function startLeader() {
  const file = (document.getElementById('pick') as HTMLInputElement).files![0];
  const dc = (await cache.DeviceCache.open())!;
  const { key } = await dc.putLocal(file);
  const info = (await media.probeFile(file))!;
  const r = timeline.addSource(schema.newVideoDoc('16:9', 30), { kind: 'local', key, name: file.name, media: 'video', mime: file.type, size: file.size, w: info.w, h: info.h, duration: info.duration });
  const doc = timeline.addClip(r.doc, { source: r.id, start: 0, length: info.duration ?? 20 * US, in: 0 }).doc;
  const pool = new media.MediaPool({ cache: dc, onChange: () => undefined });
  pool.ensure(doc);
  const st = await ready(pool, r.id);
  side = makeSide(() => doc, pool);
  const pl = side.pl;
  leader = new PreviewLeader(PROJECT, { now: () => pl.clock(), onKey: () => (state.keys++, pl.toggle()), onPresence: (p) => (state.present = p) });
  leader.show(doc);
  pl.onClock = (c: Clock) => leader!.clock(c);
  window.addEventListener('pagehide', () => leader?.dispose());
  pl.draw();
  return { state: st, duration: info.duration };
}

/** The preview window's page: the follower end and a second player, silent. */
export async function startFollower() {
  const dc = (await cache.DeviceCache.open())!;
  let doc: schema.ProjectDoc | null = null;
  let last: Clock | null = null;
  follower = new PreviewFollower(PROJECT, {
    onDoc: (d) => {
      state.docs++;
      const first = !doc;
      doc = d;
      if (first) {
        const pool = new media.MediaPool({ cache: dc, onChange: () => side && !side.pl.playing && side.pl.draw() });
        pool.ensure(d);
        side = makeSide(() => doc!, pool);
        side.pl.muted = true;
        if (last) followClock(side.pl, last, schema.durationOf(d));
      }
    },
    onClock: (c) => {
      last = c;
      if (side && doc) followClock(side.pl, c, schema.durationOf(doc));
    },
    onLeader: (p) => {
      state.leaderHere = p;
      if (!p && side?.pl.playing) side.pl.pause();
    },
  });
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
      e.preventDefault();
      follower!.key('toggle');
    }
  });
  window.addEventListener('pagehide', () => follower?.dispose());
  return true;
}

export const play = () => side!.pl.play();
export const pause = () => side!.pl.pause();
export const seek = (seconds: number) => side!.pl.seek(Math.round(seconds * US));
export function record(on: boolean) {
  if (!side) return false;
  if (on) side.samples = [];
  side.recording = on;
  return true;
}
export const samples = () => side?.samples ?? [];
export const linkStatus = () => ({ ...state, t: side?.pl.t ?? null, playing: side?.pl.playing ?? null, hasPlayer: !!side });

/** The frame this page shows now, when its decoder has settled on it. */
export async function frameShown() {
  if (!side) return null;
  side.pl.draw();
  let prev = -1;
  for (let i = 0; i < 60; i++) {
    await sleep(100);
    side.pl.draw();
    const n = readGray(side.canvas);
    if (n === prev) return { frame: n, t: side.pl.t };
    prev = n;
  }
  return { frame: prev, t: side.pl.t };
}

export function leave() {
  leader?.dispose();
  leader = null;
  return window.commsHubNative?.windows?.close?.('preview');
}

Object.assign(window, { startLeader, startFollower, play, pause, seek, record, samples, frameShown, leave, PROJECT, linkStatus });

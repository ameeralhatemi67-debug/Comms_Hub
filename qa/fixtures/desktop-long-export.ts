// A long export by the studio's real modules (qa/desktop-studio-parity.cjs, DT-06 of Desktop_App_Plan.md
// section 12): one ten-minute library video put on a 16:9 timeline, whole or its beginning, and exported
// at 1080p as the export panel does it, with the laptop kept awake and the window marked busy through the
// site's own native helpers (src/lib/native). In a browser those helpers do what a browser can; in the
// desktop application they reach the bridge. `prepare` copies the source to the device cache first, as
// the studio does when a clip is added, long before anyone exports. The file goes back to the check by PUT.
import * as schema from '../../src/lib/studio/schema.ts';
import * as timeline from '../../src/lib/studio/timeline.ts';
import * as media from '../../src/lib/studio/media.ts';
import * as cache from '../../src/lib/studio/cache.ts';
import { exportVideo } from '../../src/lib/studio/export.ts';
import { keepAwake, markBusy } from '../../src/lib/native/index.ts';

const US = schema.US;
const LONG = '00000000-0000-4000-8000-0000000000d1';
/** The source's own length: ten minutes. An export may use only its beginning. */
const SOURCE_SECONDS = 600;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function project(seconds: number) {
  const dc = await cache.DeviceCache.open();
  const pool = new media.MediaPool({ cache: dc, onChange: () => undefined });
  let doc = schema.newVideoDoc('16:9', 30);
  const r = timeline.addSource(doc, { kind: 'library', asset: LONG, version: 1, name: 'طويل.mp4', media: 'video', duration: SOURCE_SECONDS * US, w: 1920, h: 1080 });
  doc = timeline.addClip(r.doc, { source: r.id, start: 0, length: seconds * US, in: 0 }).doc;
  pool.ensure(doc);
  const t0 = performance.now();
  for (let i = 0; i < 12000 && pool.state(r.id)?.kind !== 'ready'; i++) await sleep(50);
  if (pool.state(r.id)?.kind !== 'ready') throw new Error(`the source did not become ready: ${JSON.stringify(pool.state(r.id))}`);
  return { doc, pool, readyMs: Math.round(performance.now() - t0) };
}

/** Copies the source to the device cache, as adding the clip does. */
export async function prepare() {
  const root = await navigator.storage.getDirectory();
  await root.removeEntry('studio-exports', { recursive: true }).catch(() => undefined);
  return { readyMs: (await project(SOURCE_SECONDS)).readyMs };
}

export async function longExport({ name, seconds, busy }: { name: string; seconds: number; busy: boolean }) {
  const { doc, pool, readyMs } = await project(seconds);
  const awake = await keepAwake('export');
  const idle = busy ? await markBusy('export') : async () => undefined;
  const say = (window as unknown as { __say?: (t: string) => void }).__say;
  let lastSaid = 0;
  const t1 = performance.now();
  try {
    const out = await exportVideo(doc, pool, {
      short: 1080,
      format: 'mp4',
      name,
      onProgress: (p) => {
        if (say && p.phase === 'encode' && p.done - lastSaid >= 900) {
          lastSaid = p.done;
          say(`progress:${p.done}:${p.total}:${document.visibilityState}`);
        }
      },
    });
    const exportMs = Math.round(performance.now() - t1);
    const put = await fetch(`/upload?name=${encodeURIComponent(name)}`, { method: 'PUT', body: out.file });
    return { readyMs, exportMs, frames: out.frames, bytes: out.bytes, target: out.target, audio: out.audio, uploaded: put.status, visibilityAtEnd: document.visibilityState };
  } finally {
    await awake();
    await idle();
  }
}

Object.assign(window, { prepare, longExport });

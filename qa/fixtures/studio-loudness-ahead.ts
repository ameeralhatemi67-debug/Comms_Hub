// Fixture of qa/studio-loudness-ahead.cjs (Desktop_Power_Ideas.md P-15; MVP_draft.md 62.9): the loudness worked out
// ahead (loudness-ahead.ts) against the export's own measurement, and the time from pressing export to the first
// encoded frame with «توحيد مستوى الصوت», as it was (measured first) and with the figure worked out ahead.
import * as schema from '../../src/lib/studio/schema.ts';
import * as timeline from '../../src/lib/studio/timeline.ts';
import * as media from '../../src/lib/studio/media.ts';
import * as cache from '../../src/lib/studio/cache.ts';
import { exportVideo, ExportError, measureLoudness } from '../../src/lib/studio/export.ts';
import { normalizeGain } from '../../src/lib/studio/loudness.ts';
import { loudnessOf, soundKey, storedLoudness, workAhead } from '../../src/lib/studio/loudness-ahead.ts';

const US = schema.US;
const LONG = '00000000-0000-4000-8000-0000000000d1';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function project() {
  const root = await navigator.storage.getDirectory();
  for (const d of [cache.CACHE_DIR, 'studio-exports', 'studio-manifest.json']) await root.removeEntry(d, { recursive: true }).catch(() => undefined);
  const pool = new media.MediaPool({ cache: await cache.DeviceCache.open(), onChange: () => undefined });
  let doc = schema.newVideoDoc('16:9', 30);
  const r = timeline.addSource(doc, { kind: 'library', asset: LONG, version: 1, name: 'طويل.mp4', media: 'video', duration: 120 * US, w: 640, h: 360 });
  doc = timeline.addClip(r.doc, { source: r.id, start: 0, length: 120 * US, in: 0 }).doc;
  pool.ensure(doc);
  for (let i = 0; i < 600 && pool.state(r.id)?.kind !== 'ready'; i++) await sleep(50);
  return { doc, pool, ready: pool.state(r.id)?.kind === 'ready' };
}

/** From pressing export to its first encoded frame, the way the panel does it with «توحيد مستوى الصوت». */
async function toFirstFrame(doc: schema.ProjectDoc, pool: media.MediaPool, measure: 'before' | 'ahead') {
  const t0 = performance.now();
  const m = measure === 'before' ? { ...(await measureLoudness(doc, pool)), cached: false } : await loudnessOf(doc, pool);
  const ctl = new AbortController();
  let first = 0;
  try {
    await exportVideo(doc, pool, {
      short: 720,
      format: 'mp4',
      name: 'erst.mp4',
      gain: normalizeGain(m),
      signal: ctl.signal,
      onProgress: (p) => {
        if (p.phase === 'encode' && !first) {
          first = performance.now() - t0;
          ctl.abort();
        }
      },
    });
  } catch (e) {
    if (!(e instanceof ExportError && e.code === 'ABORTED')) throw e;
  }
  return { ms: Math.round(first), cached: m.cached, integrated: m.integrated, peakDb: m.peakDb };
}

export async function run() {
  const { doc, pool, ready } = await project();
  const out: Record<string, unknown> = { ready };
  out.before = await toFirstFrame(doc, pool, 'before');
  const t0 = performance.now();
  const ahead = await workAhead(doc, pool, new AbortController().signal);
  out.aheadMs = Math.round(performance.now() - t0);
  out.ahead = ahead;
  out.after = await toFirstFrame(doc, pool, 'ahead');
  // the export's own measurement again, as at export time
  out.fresh = await measureLoudness(doc, pool);
  // a change of volume is not served from the stored figure; a picture move is
  const quieter = timeline.updateClip(doc, doc.video!.tracks.flatMap((t) => t.clips)[0].id, { volume: 0.5 });
  out.quieterStored = storedLoudness(quieter) !== null;
  const q = await loudnessOf(quieter, pool);
  out.quieter = { cached: q.cached, integrated: q.integrated };
  const moved = timeline.updateClip(doc, doc.video!.tracks.flatMap((t) => t.clips)[0].id, { transform: { x: 100, y: 50, scale: 0.8, rotation: 0, opacity: 1 } });
  out.movedSameKey = soundKey(moved) === soundKey(doc);
  out.movedStored = storedLoudness(moved) !== null;
  pool.dispose();
  return out;
}

(window as unknown as { ahead: object }).ahead = { run };

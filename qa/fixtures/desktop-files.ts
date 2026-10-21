// Files used in place and the cache folder, by the studio's real modules inside the desktop application
// (qa/desktop-files.cjs; Desktop_App_Plan.md phase D4, DT-10 and DT-11): the device cache (cache.ts) gives a
// file chosen in the page a token instead of a copy, the media pool reads it at the application's address,
// a frame far past 4 GB is decoded and a piece of it exported; a library version is copied by the
// application into its folder with the page's session and read from there; an export is written straight
// to a file handle; «مسح بيانات هذا الجهاز» leaves nothing. Results go back to the check by PUT.
import * as schema from '../../src/lib/studio/schema.ts';
import * as timeline from '../../src/lib/studio/timeline.ts';
import * as media from '../../src/lib/studio/media.ts';
import * as cache from '../../src/lib/studio/cache.ts';
import { exportVideo } from '../../src/lib/studio/export.ts';

const US = schema.US;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
type Info = { duration: number; w: number; h: number };

async function ready(pool: media.MediaPool, id: string, ms = 120000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const s = pool.state(id);
    if (s && s.kind !== 'loading') return s;
    await sleep(100);
  }
  return pool.state(id);
}

/** The average colour of what the pool decodes at `at` seconds. */
async function colourAt(pool: media.MediaPool, id: string, at: number): Promise<number[] | null> {
  let src: CanvasImageSource | null = null;
  for (let i = 0; i < 300; i++) {
    src = pool.frameNear(id, Math.round(at * US));
    await sleep(100);
    const again = pool.frameNear(id, Math.round(at * US));
    if (src && again === src) break;
  }
  if (!src) return null;
  const c = document.createElement('canvas');
  c.width = 1;
  c.height = 1;
  const g = c.getContext('2d')!;
  g.drawImage(src as CanvasImageSource, 0, 0, 1, 1);
  return [...g.getImageData(0, 0, 1, 1).data.slice(0, 3)];
}

function videoDoc(source: Parameters<typeof timeline.addSource>[1], from: number, seconds: number) {
  const r = timeline.addSource(schema.newVideoDoc('16:9', 30), source);
  return { id: r.id, doc: timeline.addClip(r.doc, { source: r.id, start: 0, length: Math.round(seconds * US), in: Math.round(from * US) }).doc };
}

async function opfsBytes(): Promise<number> {
  let total = 0;
  const walk = async (dir: FileSystemDirectoryHandle) => {
    for await (const [, h] of (dir as unknown as { entries(): AsyncIterable<[string, FileSystemHandle]> }).entries()) {
      if (h.kind === 'file') total += (await (h as FileSystemFileHandle).getFile()).size;
      else await walk(h as FileSystemDirectoryHandle);
    }
  };
  await walk(await navigator.storage.getDirectory());
  return total;
}

/** DT-11: a large file from «هذا الجهاز», used where it is. */
export async function inPlace(o: { at: number; seconds: number }) {
  const file = (document.getElementById('pick') as HTMLInputElement).files![0];
  const before = await opfsBytes();
  const dc = (await cache.DeviceCache.open())!;
  const { key } = await dc.putLocal(file);
  const entry = dc.entries.find((e) => e.name === `local-${key}`)!;
  const info = (await media.probeFile(file)) as Info;
  const pool = new media.MediaPool({ cache: dc, onChange: () => undefined });
  const { id, doc } = videoDoc({ kind: 'local', key, name: file.name, media: 'video', mime: file.type, size: file.size, w: info.w, h: info.h, duration: info.duration }, o.at, o.seconds);
  pool.ensure(doc);
  const state = await ready(pool, id);
  const place = await dc.localPlace(key);
  const frame = await colourAt(pool, id, o.at + 1);
  const t0 = performance.now();
  const r = await exportVideo(doc, pool, { short: 720, format: 'mp4', name: 'in-place.mp4' });
  const exportMs = Math.round(performance.now() - t0);
  const put = await fetch('/upload?name=in-place.mp4', { method: 'PUT', body: r.file });
  // the export's own temporary file is the only thing this added to the private storage
  const exportBytes = r.bytes;
  const after = await opfsBytes();
  (window as unknown as { __key: string }).__key = key;
  return { key, size: file.size, token: !!entry.token, tokenLength: entry.token?.length ?? 0, state, place: place && 'url' in place ? place.url : null, frame, frames: r.frames, exportMs, uploaded: put.status, opfsBefore: before, opfsAfter: after, exportBytes, usage: dc.usage() };
}

/** The same project on a device that never had the file. */
export async function elsewhere(o: { key: string; name: string; size: number }) {
  const dc = (await cache.DeviceCache.open())!;
  const pool = new media.MediaPool({ cache: dc, onChange: () => undefined });
  const { id, doc } = videoDoc({ kind: 'local', key: o.key, name: o.name, media: 'video', mime: 'video/mp4', size: o.size, w: 1920, h: 1080, duration: 60 * US }, 0, 5);
  pool.ensure(doc);
  return { state: await ready(pool, id, 10000) };
}

/** A device file changed after it was chosen, then let go of. */
export async function changedAndForgotten() {
  const file = (document.getElementById('small') as HTMLInputElement).files![0];
  const dc = (await cache.DeviceCache.open())!;
  const { key } = await dc.putLocal(file);
  const token = dc.entries.find((e) => e.name === `local-${key}`)!.token!;
  const first = await dc.localPlace(key);
  await fetch('/change-small', { method: 'POST' });
  const changed = await dc.localPlace(key);
  const url = `commshub-file://local/${token}`;
  const afterChange = await fetch(url).then((r) => r.status, () => -1);
  await dc.removeLocal(key);
  const forgotten = await fetch(url).then((r) => r.status, () => -1);
  return { first: first && 'url' in first ? 'url' : first ? 'file' : null, changed, afterChange, forgotten, stillOnDisk: true };
}

/** A library version: copied into the application's folder with this page's session, read from there. */
export async function library(o: { asset: string; version: number }) {
  const dc = (await cache.DeviceCache.open())!;
  const progress: number[] = [];
  const place = await dc.libraryPlace(o.asset, o.version, media.contentUrl(o.asset, o.version), { label: 'مكتبة.mp4', onProgress: (d) => progress.push(d) });
  const pool = new media.MediaPool({ cache: dc, onChange: () => undefined });
  const { id, doc } = videoDoc({ kind: 'library', asset: o.asset, version: o.version, name: 'مكتبة.mp4', media: 'video', duration: 5 * US, w: 640, h: 360 }, 0, 5);
  pool.ensure(doc);
  const state = await ready(pool, id);
  const frame = await colourAt(pool, id, 1);
  const folder = await dc.refreshFolder();
  const denied = await dc.libraryPlace(o.asset, o.version + 1, media.contentUrl(o.asset, o.version + 1)).then(() => 'copied', (e) => ((e as { denied?: boolean }).denied ? 'denied' : (e as Error).message));
  return { place: 'url' in place ? place.url : null, progress: progress.length, state, frame, folder: folder && { library: folder.library, files: folder.files, isDefault: folder.isDefault, limit: folder.limit }, denied };
}

/** The size limit, and «حذف ملفات المعاينة المؤقتة» in the folder. */
export async function limitAndClear(o: { inUse: string[] }) {
  const dc = (await cache.DeviceCache.open())!;
  const limited = await dc.setLimit(10e9, new Set(o.inUse));
  const kept = await dc.clearLibrary(new Set(o.inUse));
  const after = await dc.refreshFolder();
  const cleared = await dc.clearLibrary(new Set());
  const empty = await dc.refreshFolder();
  return { limit: limited?.limit, keptInUse: after?.files, clearedNotInUse: kept.removed, clearedAll: cleared.removed, filesAfter: empty?.files };
}

/** An export written straight to a file handle (the file a save dialog would give). */
export async function straightToFile(o: { asset: string; version: number }) {
  const dc = (await cache.DeviceCache.open())!;
  const pool = new media.MediaPool({ cache: dc, onChange: () => undefined });
  const { id, doc } = videoDoc({ kind: 'library', asset: o.asset, version: o.version, name: 'مكتبة.mp4', media: 'video', duration: 5 * US, w: 640, h: 360 }, 0, 3);
  pool.ensure(doc);
  await ready(pool, id);
  const root = await navigator.storage.getDirectory();
  await root.removeEntry('studio-exports', { recursive: true }).catch(() => undefined);
  const chosen = await root.getFileHandle('chosen-by-the-person.mp4', { create: true });
  const r = await exportVideo(doc, pool, { short: 720, format: 'mp4', name: 'chosen.mp4', saveTo: chosen });
  const written = (await chosen.getFile()).size;
  let tempCopy = false;
  try {
    await root.getDirectoryHandle('studio-exports');
    tempCopy = true;
  } catch {
    tempCopy = false;
  }
  return { frames: r.frames, bytes: r.bytes, written, tempCopy };
}

Object.assign(window, { inPlace, elsewhere, changedAndForgotten, library, limitAndClear, straightToFile });

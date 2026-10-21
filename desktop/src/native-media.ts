// The bridge's `media` group (Desktop_App_Plan.md 5.2, phase D5; decision D-9), wired to Electron: FFmpeg's
// fixed jobs (media-jobs.ts) run in the utility process (media-worker.ts). The page names a source only as
// it already may: a device file's token, or a library version already copied into the cache folder. It
// never sends a path, a program or an argument. A light or converted copy is written beside the cache's
// other copies, under a name of the main process's own, first as a .part file that is never served, and
// is recorded only once FFmpeg finished it; the size limit then applies to it like any copy. Nothing FFmpeg
// prints leaves this process: the page is told the kind of failure only, and nothing is logged.
import fs from 'node:fs';
import { app, utilityProcess } from 'electron';
import type { UtilityProcess, WebContents } from 'electron';
import { libraryName, type CacheStore } from './cache-store.ts';
import { freeBytes } from './device.ts';
import type { FileStore } from './file-store.ts';
import { addressOf, CACHE_NAME, TOKEN } from './files.ts';
import { CHANNEL } from './ipc.ts';
import { convertArgs, estimateBytes, heavy, keepsTimes, outputName, PROXY_HEIGHTS, probeArgs, proxyArgs, sourceId, summarize, type Probe } from './media-jobs.ts';
import type { Out } from './media-worker.ts';
import type { Handle } from './native.ts';

const refused = () => new Error('refused');
const MAX_IN_USE = 2000;
type Source = { input: string; id: string; label: string };
type Waiter = { resolve: (stdout: string) => void; reject: (e: Error) => void; progress?: (seconds: number) => void };

function inUseOf(value: unknown): Set<string> {
  if (value === undefined) return new Set();
  if (!Array.isArray(value) || value.length > MAX_IN_USE) throw refused();
  return new Set(value.filter((n): n is string => typeof n === 'string' && CACHE_NAME.test(n)));
}

export function startMedia(o: { handle: Handle; files: FileStore; cache: CacheStore; onClear: (stop: () => void) => void; tools: { ffmpeg: string; ffprobe: string; tag: string }; worker: string }) {
  let worker: UtilityProcess | null = null;
  const waiting = new Map<string, Waiter>();
  const pids = new Map<string, number>();
  const jobs = new Map<string, Promise<{ name: string; url: string; bytes: number }>>();
  const listeners = new Map<string, Set<WebContents>>();
  let probes = 0;
  o.cache.cleanParts();

  function ensureWorker(): UtilityProcess {
    if (worker) return worker;
    const w = utilityProcess.fork(o.worker, [], { serviceName: 'Comms Hub media', stdio: 'ignore' });
    w.on('message', (m: Out) => {
      if (m.type === 'started') pids.set(m.id, m.pid);
      else if (m.type === 'progress') waiting.get(m.id)?.progress?.(m.seconds);
      else if (m.type === 'done') {
        const x = waiting.get(m.id);
        waiting.delete(m.id);
        pids.delete(m.id);
        if (m.ok) x?.resolve(m.stdout);
        else x?.reject(new Error(m.why));
      }
    });
    w.on('exit', () => {
      if (worker === w) worker = null;
      for (const x of waiting.values()) x.reject(new Error('failed'));
      waiting.clear();
      pids.clear();
    });
    worker = w;
    return w;
  }

  function run(id: string, exe: string, args: string[], encode: boolean, progress?: (seconds: number) => void): Promise<string> {
    if (!fs.existsSync(exe)) return Promise.reject(new Error('unavailable'));
    return new Promise((resolve, reject) => {
      waiting.set(id, { resolve, reject, progress });
      ensureWorker().postMessage({ type: 'run', id, exe, args, encode });
    });
  }

  /** The source a page names: a token it was given, or a library version already in the cache folder. */
  function sourceOf(ref: unknown): Source {
    const r = (ref ?? {}) as { token?: unknown; asset?: unknown; version?: unknown };
    if (typeof r.token === 'string') {
      if (!TOKEN.test(r.token)) throw refused();
      const found = o.files.lookup(r.token);
      if (!('record' in found)) throw new Error('missing');
      const id = sourceId({ fingerprint: found.record.fingerprint });
      if (!id) throw refused();
      return { input: found.record.path, id, label: found.record.name };
    }
    const name = libraryName(r.asset, r.version);
    if (!name) throw refused();
    const copy = o.cache.complete(name);
    if (!copy) throw new Error('missing');
    const id = sourceId({ asset: r.asset as string, version: r.version as number });
    if (!id) throw refused();
    return { input: copy.file, id, label: o.cache.entries().find((e) => e.name === name)?.label ?? name };
  }

  async function probe(s: Source): Promise<Probe> {
    const out = await run(`probe-${++probes}`, o.tools.ffprobe, probeArgs(s.input), false);
    let json: unknown = null;
    try {
      json = JSON.parse(out);
    } catch {
      json = null;
    }
    const p = summarize(json);
    if (!p) throw new Error('decode');
    return p;
  }

  const copyOf = (name: string) => {
    const c = o.cache.complete(name);
    return c ? { name, url: addressOf('cache', name), bytes: c.size } : null;
  };

  function make(kind: 'proxy' | 'convert', s: Source, height: number, inUse: Set<string>, sender: WebContents) {
    const name = outputName(kind, s.id, o.tools.tag, kind === 'proxy' ? height : undefined);
    if (!name) throw refused();
    const done = copyOf(name);
    if (done) return Promise.resolve(done);
    let who = listeners.get(name);
    if (!who) listeners.set(name, (who = new Set()));
    who.add(sender);
    const running = jobs.get(name);
    if (running) return running;
    const work = (async () => {
      const p = await probe(s);
      if (!p.video) throw new Error('decode');
      const need = estimateBytes(kind, height, p);
      let free: number | null = null;
      try {
        free = freeBytes(fs.statfsSync(o.cache.folder()));
      } catch {
        free = null;
      }
      if (free !== null && free < need) throw new Error('space');
      fs.mkdirSync(o.cache.folder(), { recursive: true });
      const part = o.cache.partOf(name);
      const keep = keepsTimes(p.container);
      const args = kind === 'proxy' ? proxyArgs(s.input, part, height, keep) : convertArgs(s.input, part, p.video.height, keep);
      try {
        await run(name, o.tools.ffmpeg, args, true, (seconds) => {
          for (const wc of listeners.get(name) ?? []) if (!wc.isDestroyed()) wc.send(CHANNEL.mediaProgress, { name, done: seconds, total: p.duration ?? 0 });
        });
        fs.renameSync(part, o.cache.pathOf(name));
      } catch (e) {
        fs.rmSync(part, { force: true });
        throw e;
      }
      o.cache.record(name, `${kind === 'proxy' ? `${height}p` : 'H.264'} · ${s.label}`.slice(0, 200), inUse);
      return copyOf(name) ?? Promise.reject(new Error('failed'));
    })();
    const held = o.cache.hold(name, work).finally(() => {
      jobs.delete(name);
      listeners.delete(name);
    });
    jobs.set(name, held);
    return held;
  }

  o.handle(CHANNEL.mediaProbe, async (_event, ref: unknown) => {
    const p = await probe(sourceOf(ref));
    return { ...p, heavy: heavy(p) };
  });
  // What a source has on this device, and the names its copies would be made under (so the page can follow
  // and cancel one, and keep it from the sweep while its project is open).
  o.handle(CHANNEL.mediaCopies, (_event, ref: unknown) => {
    const s = sourceOf(ref);
    let proxy: { name: string; url: string; bytes: number; height: number } | null = null;
    const names: { proxy: Record<string, string>; convert: string } = { proxy: {}, convert: outputName('convert', s.id, o.tools.tag) ?? '' };
    for (const height of PROXY_HEIGHTS) {
      const name = outputName('proxy', s.id, o.tools.tag, height) ?? '';
      names.proxy[height] = name;
      const c = copyOf(name);
      if (c && !proxy) proxy = { ...c, height };
    }
    return { proxy, convert: copyOf(names.convert), names };
  });
  o.handle(CHANNEL.mediaProxy, (event, ref: unknown, height: unknown, inUse: unknown) => {
    if (typeof height !== 'number' || !PROXY_HEIGHTS.includes(height)) throw refused();
    return make('proxy', sourceOf(ref), height, inUseOf(inUse), event.sender);
  });
  o.handle(CHANNEL.mediaConvert, (event, ref: unknown, inUse: unknown) => make('convert', sourceOf(ref), 0, inUseOf(inUse), event.sender));
  o.handle(CHANNEL.mediaCancel, (_event, name: unknown) => {
    if (typeof name !== 'string' || !CACHE_NAME.test(name)) throw refused();
    if (!jobs.has(name)) return false;
    worker?.postMessage({ type: 'cancel', id: name });
    return true;
  });

  // Nothing is left running behind the application: its FFmpeg processes end with it, and with «مسح بيانات هذا الجهاز».
  function stopAll() {
    for (const pid of pids.values()) {
      try {
        process.kill(pid);
      } catch {
        // already ended
      }
    }
    worker?.kill();
  }
  app.on('will-quit', stopAll);
  o.onClear(stopAll);
}

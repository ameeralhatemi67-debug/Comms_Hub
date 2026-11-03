// The bridge's `media` group (Desktop_App_Plan.md 5.2, phase D5; decision D-9), wired to Electron: FFmpeg's
// fixed jobs (media-jobs.ts) run in the utility process (media-worker.ts). The page names a source only as
// it already may: a device file's token, or a library version already copied into the cache folder. It
// never sends a path, a program or an argument. A light or converted copy is written beside the cache's
// other copies, under a name of the main process's own, first as a .part file that is never served, and
// is recorded only once FFmpeg finished it; the size limit then applies to it like any copy. Nothing FFmpeg
// prints leaves this process: the page is told the kind of failure only, and nothing is logged.
// From D12 (Desktop_Power_Ideas.md P-08, P-30) the idle-time broker: a window names the sources of its project
// (`media.queue`), the main process works out which need a light copy on this machine (heavyOn, with the device
// profile), and makes them while the laptop is free (idle.ts), as many at once as the page's plan says. Held, a
// copy is paused (its source is served over loopback, loopback.ts); held for minutes, or wanted by no window any
// more, it is stopped and leaves nothing behind. A copy the person asks for is never paused, and holds the rest.
import crypto from 'node:crypto';
import fs from 'node:fs';
import { app, utilityProcess, webContents as allContents } from 'electron';
import type { UtilityProcess, WebContents } from 'electron';
import { queueAskOf, type MediaRef } from './bridge.ts';
import { libraryName, type CacheStore } from './cache-store.ts';
import { CopyQueue } from './copy-queue.ts';
import { freeBytes } from './device.ts';
import type { FileStore } from './file-store.ts';
import { addressOf, CACHE_NAME, newToken, TOKEN } from './files.ts';
import { holdOf, quietAt, STOP_AFTER_MS, stepsFor, type Hold } from './idle.ts';
import { CHANNEL } from './ipc.ts';
import { servedUrl } from './loopback.ts';
import { convertArgs, estimateBytes, heavyOn, isMovie, keepsTimes, outputName, PROXY_HEIGHTS, probeArgs, proxyArgs, sourceId, summarize, type Probe } from './media-jobs.ts';
import type { Out } from './media-worker.ts';
import type { Handle, IdleFacts } from './native.ts';

const refused = () => new Error('refused');
const MAX_IN_USE = 2000;
/** The light copy made in idle time: the height the page offers first. */
const AUTO_HEIGHT = PROXY_HEIGHTS[0];
type Source = { input: string; id: string; label: string };
type Waiter = { resolve: (stdout: string) => void; reject: (e: Error) => void; progress?: (seconds: number) => void };
/** A copy being made: in idle time or asked for, paused, whether it can pause at all, and whether the broker is stopping it. */
type Live = { background: boolean; paused: boolean; pausable: boolean; stopping: boolean };

function inUseOf(value: unknown): Set<string> {
  if (value === undefined) return new Set();
  if (!Array.isArray(value) || value.length > MAX_IN_USE) throw refused();
  return new Set(value.filter((n): n is string => typeof n === 'string' && CACHE_NAME.test(n)));
}

export function startMedia(o: {
  handle: Handle;
  files: FileStore;
  cache: CacheStore;
  onClear: (stop: () => void) => void;
  tools: { ffmpeg: string; ffprobe: string; tag: string };
  worker: string;
  idle: IdleFacts;
  background: (state: { making: number; waiting: number; hold: Hold | null }) => void;
  /** 4K H.264 frames a second this Chromium decodes, from the device profile (profile.ts decodeCapacity), or null. */
  decode4k: () => number | null;
}) {
  let worker: UtilityProcess | null = null;
  /** The worker's loopback port, or 0 when it has none (copies then read the file, and a held copy is stopped). */
  let port: Promise<number> = Promise.resolve(0);
  const waiting = new Map<string, Waiter>();
  const pids = new Map<string, number>();
  const jobs = new Map<string, Promise<{ name: string; url: string; bytes: number }>>();
  const listeners = new Map<string, Set<WebContents>>();
  const live = new Map<string, Live>();
  let probes = 0;
  // the idle-time broker's state (below)
  const queue = new CopyQueue();
  let width = 1;
  let lastHold: Hold | null = null;
  let timer: NodeJS.Timeout | null = null;
  /** Names the broker stopped: their job ends as cancelled, and they wait again rather than fail. */
  const stopped = new Set<string>();
  const inUseBy = new Map<number, Set<string>>();
  const watched = new Set<number>();
  let probing: Promise<void> = Promise.resolve();
  o.cache.cleanParts();

  function ensureWorker(): UtilityProcess {
    if (worker) return worker;
    const w = utilityProcess.fork(o.worker, [], { serviceName: 'Comms Hub media', stdio: 'ignore' });
    let listening: (n: number) => void = () => undefined;
    port = new Promise<number>((resolve) => {
      listening = resolve;
      setTimeout(() => resolve(0), 5000);
    });
    w.on('message', (m: Out) => {
      if (m.type === 'listening') listening(m.port);
      else if (m.type === 'started') pids.set(m.id, m.pid);
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
      listening(0);
      if (worker === w) {
        worker = null;
        port = Promise.resolve(0);
      }
      for (const x of waiting.values()) x.reject(new Error('failed'));
      waiting.clear();
      pids.clear();
    });
    worker = w;
    return w;
  }

  function run(id: string, exe: string, args: string[], encode: boolean, progress?: (seconds: number) => void, extra: { background?: boolean; serve?: { token: string; file: string } } = {}): Promise<string> {
    if (!fs.existsSync(exe)) return Promise.reject(new Error('unavailable'));
    return new Promise((resolve, reject) => {
      waiting.set(id, { resolve, reject, progress });
      ensureWorker().postMessage({ type: 'run', id, exe, args, encode, ...extra });
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

  /** The windows told of a copy's progress: those that asked for it and those whose project wants it. */
  function audience(name: string): WebContents[] {
    const out = new Set(listeners.get(name) ?? []);
    for (const id of queue.owners(name)) {
      const wc = allContents.fromId(id);
      if (wc) out.add(wc);
    }
    return [...out].filter((wc) => !wc.isDestroyed());
  }

  function make(kind: 'proxy' | 'convert', s: Source, height: number, inUse: Set<string>, sender: WebContents | null, background = false) {
    const name = outputName(kind, s.id, o.tools.tag, kind === 'proxy' ? height : undefined);
    if (!name) throw refused();
    const done = copyOf(name);
    if (done) return Promise.resolve(done);
    if (sender) {
      let who = listeners.get(name);
      if (!who) listeners.set(name, (who = new Set()));
      who.add(sender);
    }
    const running = jobs.get(name);
    if (running) {
      if (!background) promote(name);
      return running;
    }
    live.set(name, { background, paused: false, pausable: false, stopping: false });
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
      // A light copy reads its source over loopback, so it can be paused; an editable copy reads the file, as in D5.
      const at = kind === 'proxy' ? await port : 0;
      const token = at ? newToken(crypto.randomBytes(32)) : null;
      const job = live.get(name);
      if (job) job.pausable = !!token;
      const args = kind === 'proxy' ? proxyArgs(token ? servedUrl(at, token) : s.input, part, height, keep) : convertArgs(s.input, part, p.video.height, keep);
      try {
        const ran = run(
          name,
          o.tools.ffmpeg,
          args,
          true,
          (seconds) => {
            queue.set(name, { done: seconds, total: p.duration ?? 0 });
            for (const wc of audience(name)) wc.send(CHANNEL.mediaProgress, { name, done: seconds, total: p.duration ?? 0 });
          },
          { background: live.get(name)?.background ?? false, serve: token ? { token, file: s.input } : undefined },
        );
        // held while it was being probed: it starts paused
        if (live.get(name)?.paused) worker?.postMessage({ type: 'pause', id: name });
        await ran;
        fs.renameSync(part, o.cache.pathOf(name));
      } catch (e) {
        fs.rmSync(part, { force: true });
        throw e;
      }
      o.cache.record(name, `${kind === 'proxy' ? `${height}p` : 'H.264'} · ${s.label}`.slice(0, 200), new Set([...inUse, ...wantedNames()]));
      if (queue.set(name, { state: 'ready', why: undefined })) tell();
      return copyOf(name) ?? Promise.reject(new Error('failed'));
    })();
    const held = o.cache.hold(name, work).finally(() => {
      jobs.delete(name);
      listeners.delete(name);
      live.delete(name);
      evaluate();
    });
    jobs.set(name, held);
    if (!background) evaluate();
    return held;
  }

  o.handle(CHANNEL.mediaProbe, async (_event, ref: unknown) => {
    const p = await probe(sourceOf(ref));
    return { ...p, heavy: heavyOn(p, o.decode4k()) };
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

  // --- the idle-time broker (D12, P-08 and P-30) -------------------------------------------------

  const wantedNames = () => new Set([...queue.ordered().map((e) => e.name), ...[...inUseBy.values()].flatMap((s) => [...s])]);

  function nameOf(ref: MediaRef): string | null {
    if ('token' in ref) {
      const found = o.files.lookup(ref.token);
      const id = 'record' in found ? sourceId({ fingerprint: found.record.fingerprint }) : null;
      return id ? outputName('proxy', id, o.tools.tag, AUTO_HEIGHT) : null;
    }
    const id = sourceId(ref);
    return id ? outputName('proxy', id, o.tools.tag, AUTO_HEIGHT) : null;
  }

  function queueView(owner: number) {
    return { hold: lastHold, width, items: queue.view(owner) };
  }
  function tell() {
    for (const id of watched) {
      const wc = allContents.fromId(id);
      if (wc && !wc.isDestroyed()) wc.send(CHANNEL.mediaQueueState, queueView(id));
    }
  }

  /** Whether a source needs a copy here, one source at a time (probes are quick, but two hundred at once are not). */
  function probeLater(name: string) {
    probing = probing.then(async () => {
      const e = queue.get(name);
      if (!e || e.state !== 'probing') return;
      let s: Source;
      try {
        s = sourceOf(JSON.parse(e.key));
      } catch (err) {
        queue.set(name, { state: (err as Error).message === 'missing' ? 'missing' : 'failed', why: (err as Error).message === 'missing' ? 'missing' : 'refused' });
        tell();
        return;
      }
      if (copyOf(name)) queue.set(name, { state: 'ready' });
      else {
        try {
          const p = await probe(s);
          queue.set(name, { state: isMovie(p) && heavyOn(p, o.decode4k()) ? 'waiting' : 'light', total: p.duration ?? 0 });
        } catch {
          queue.set(name, { state: 'failed', why: 'decode' });
        }
      }
      evaluate();
      tell();
    });
  }

  function startBackground(name: string) {
    const e = queue.get(name);
    if (!e) return;
    let s: Source;
    try {
      s = sourceOf(JSON.parse(e.key));
    } catch (err) {
      queue.set(name, { state: 'missing', why: (err as Error).message === 'missing' ? 'missing' : 'refused' });
      return;
    }
    queue.set(name, { state: 'running', done: 0 });
    make('proxy', s, AUTO_HEIGHT, new Set(), null, true).then(
      () => undefined,
      (err: Error) => {
        const why = err?.message || 'failed';
        if (stopped.delete(name)) queue.set(name, { state: 'waiting', done: 0 });
        else queue.set(name, { state: 'failed', why });
        tell();
      },
    );
  }

  function pause(name: string) {
    const j = live.get(name);
    if (!j?.background || j.stopping) return;
    // without loopback FFmpeg reads the file and cannot wait: stopping is the only way to hold it
    if (!j.pausable) return stop(name);
    j.paused = true;
    worker?.postMessage({ type: 'pause', id: name });
    queue.set(name, { state: 'paused', pausedAt: Date.now() });
  }
  function resume(name: string) {
    const j = live.get(name);
    if (!j?.paused) return;
    j.paused = false;
    worker?.postMessage({ type: 'resume', id: name });
    queue.set(name, { state: 'running' });
  }
  /** Ends a copy made in idle time; nothing of it is kept, and it waits again if a window still wants it. */
  function stop(name: string) {
    const j = live.get(name);
    if (!j) {
      queue.set(name, { state: 'waiting' });
      return;
    }
    j.stopping = true;
    stopped.add(name);
    worker?.postMessage({ type: 'cancel', id: name });
  }
  /** The person asked for a copy already being made in idle time: it is theirs now, and never paused. */
  function promote(name: string) {
    const j = live.get(name);
    if (!j?.background) return;
    j.background = false;
    if (j.paused) {
      j.paused = false;
      worker?.postMessage({ type: 'resume', id: name });
    }
    queue.set(name, { state: 'running' });
  }

  function evaluate() {
    if (timer) clearTimeout(timer);
    timer = null;
    const now = Date.now();
    const facts = { ...o.idle.facts(), asked: [...live.values()].some((j) => !j.background), now };
    const hold = holdOf(facts);
    const jobsNow = queue.ordered().flatMap((e) => {
      const j = live.get(e.name);
      if (j && (!j.background || j.stopping)) return [];
      return e.state === 'waiting' || e.state === 'running' || e.state === 'paused' ? [{ name: e.name, state: e.state, pausedAt: e.pausedAt }] : [];
    });
    const steps = stepsFor(jobsNow, hold, width, now);
    for (const name of steps.pause) pause(name);
    for (const name of steps.stop) stop(name);
    for (const name of steps.resume) resume(name);
    for (const name of steps.start) startBackground(name);
    const wakes = [quietAt(facts), ...queue.ordered().flatMap((e) => (e.state === 'paused' && e.pausedAt !== undefined ? [e.pausedAt + STOP_AFTER_MS] : []))].filter((t): t is number => t !== null);
    if (wakes.length) timer = setTimeout(evaluate, Math.max(50, Math.min(...wakes) - now + 20));
    const acted = steps.start.length + steps.pause.length + steps.resume.length + steps.stop.length > 0;
    const was = lastHold;
    lastHold = hold;
    if (acted || hold !== was) tell();
    const counts = queue.counts();
    o.background({ ...counts, hold: counts.making + counts.waiting ? hold : null });
  }
  o.idle.onChange(evaluate);

  function forget(owner: number) {
    inUseBy.delete(owner);
    for (const e of queue.forget(owner)) if (live.get(e.name)?.background) stop(e.name);
    evaluate();
  }
  function watch(wc: WebContents) {
    if (watched.has(wc.id)) return;
    const id = wc.id;
    watched.add(id);
    // a new document wants nothing until it says so again; moving inside the site keeps what it asked
    wc.on('did-navigate', () => forget(id));
    wc.once('destroyed', () => {
      watched.delete(id);
      forget(id);
    });
  }

  o.handle(CHANNEL.mediaQueue, (event, ask: unknown) => {
    const a = queueAskOf(ask);
    if (!a) throw refused();
    const owner = event.sender.id;
    inUseBy.set(owner, inUseOf((ask as { inUse?: unknown }).inUse));
    width = a.width;
    const items = a.items.flatMap((ref) => {
      const name = nameOf(ref);
      return name ? [{ name, key: JSON.stringify(ref) }] : [];
    });
    const { added, dropped } = queue.want(owner, items);
    for (const e of dropped) if (live.get(e.name)?.background) stop(e.name);
    for (const it of items) {
      const e = queue.get(it.name);
      if (!e || !(added.includes(e) || e.state === 'missing')) continue;
      queue.set(e.name, { state: 'probing', why: undefined });
      probeLater(e.name);
    }
    watch(event.sender);
    evaluate();
    return queueView(owner);
  });
  o.handle(CHANNEL.mediaQueued, (event) => queueView(event.sender.id));

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
  o.onClear(() => {
    for (const id of [...watched]) {
      inUseBy.delete(id);
      queue.forget(id);
    }
    stopAll();
    evaluate();
  });
}

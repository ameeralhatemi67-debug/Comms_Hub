// The studio's device cache (MVP_draft.md 62, Studio_Build_Plan.md section 4), in the browser's
// private storage (OPFS):
//   - studio-cache/: library versions, copied once in resumable 16 MB parts from the site's file route,
//     named by file and version (a version never changes), then read from the device. Ten days after
//     its last use a copy is removed when the studio next opens; «حذف ملفات المعاينة المؤقتة» removes
//     them at once. Nothing is lost: the library keeps the original.
//   - studio-local/: files from «هذا الجهاز», the only copy a project has of them on this device, so
//     never swept by age; removed only by the person.
//   - manifest.json: size, completeness and last use of each entry.
// Nothing here is scheduled: the sweep runs when the studio opens. The browser may still clear its
// storage on its own; persist() is asked for, and a missing copy is simply fetched again.
// Inside the desktop application (MVP_draft.md 63.3, Desktop_App_Plan.md D4) the library copies live in a
// folder of the application's instead, with a size limit and the same ten-day rule, and a file from «هذا
// الجهاز» is used where it is, through a token: nothing is copied. The page then reads them at the
// application's own addresses; a "place" is a File in a browser and such an address in the application.
// The application also makes light copies for the preview and editable copies of what the browser cannot
// decode (D5, MVP_draft.md 63.4), in the same folder; the media pool (media.ts) asks for them through here.
// From D12 (MVP_draft.md 63.9, Desktop_Power_Ideas.md P-08) every video source the pool opens is also named to the
// application's queue, which makes the light copies the sources need on this machine while the laptop is free, as
// many at once as scale.ts's plan says (copiesAtOnce).
import { currentEntry } from '../native/device.ts';
import { native, type NativeCacheUsage, type NativeCopies, type NativeCopy, type NativeMediaRef, type NativeProbe, type NativeQueueState } from '../native/index.ts';
import { isPerformance, plan } from './scale.ts';
import type { Source } from './schema.ts';

export const CACHE_DIR = 'studio-cache';
export const LOCAL_DIR = 'studio-local';
export const TEN_DAYS = 10 * 86_400_000;
export const PART = 16 * 1024 * 1024;

export type Entry = {
  name: string;
  kind: 'library' | 'local';
  bytes: number;
  total: number;
  complete: boolean;
  lastUsed: number;
  label?: string;
  /** A device file used where it is, in the desktop application: the token it was given. */
  token?: string;
};

/** Where a source is read from: a File in a browser, one of the application's own addresses in the desktop application. */
export type Place = { file: File; url?: undefined } | { url: string; file?: undefined };

/**
 * The cache folder as the studio shows it: «المجلد الافتراضي», or the chosen folder's last name. An application before
 * 0.8.1 sent the folder's path, so only its last part is ever shown (desktop/src/cache-store.ts folderLabel).
 */
export function folderLabelOf(u: Pick<NativeCacheUsage, 'folder' | 'isDefault'>): string {
  if (u.isDefault) return 'المجلد الافتراضي';
  // the chosen folder is the parent of the application's own «CommsHub Studio Cache»
  const parts = u.folder.split(/[\\/]+/).filter(Boolean);
  if (parts.length > 1 && parts[parts.length - 1] === 'CommsHub Studio Cache') parts.pop();
  return parts[parts.length - 1] ?? u.folder;
}

/** The application's name for a library copy (desktop/src/cache-store.ts libraryName); a light or converted copy already has its name. */
export const folderName = (name: string) => (/\.(bin|mp4)$/.test(name) ? name : `${name}.bin`);
export type Manifest = { v: 1; entries: Record<string, Entry> };

export const emptyManifest = (): Manifest => ({ v: 1, entries: {} });
export const libraryName = (asset: string, version: number) => `asset-${asset}-v${version}`;

/** The library copies due for removal: unused for ten days and not used by what is open now. */
export function dueForSweep(m: Manifest, now: number, inUse: Set<string>): string[] {
  return Object.values(m.entries)
    .filter((e) => e.kind === 'library' && !inUse.has(e.name) && now - e.lastUsed >= TEN_DAYS)
    .map((e) => e.name);
}

/** The next byte range to fetch for a partial copy, or null when it is complete. */
export function nextRange(e: Pick<Entry, 'bytes' | 'total'>, part = PART): { from: number; to: number } | null {
  if (e.total && e.bytes >= e.total) return null;
  const from = e.bytes;
  return { from, to: e.total ? Math.min(e.total, from + part) - 1 : from + part - 1 };
}

/** The total size from a Content-Range header ("bytes 0-99/1234"), or null. */
export function totalFromRange(h: string | null): number | null {
  const m = /\/(\d+)\s*$/.exec(h ?? '');
  return m ? Number(m[1]) : null;
}

/** A device file's key: a fingerprint of its size, name, date and its first and last 4 MB (sha-256). */
export async function fingerprint(file: File): Promise<string> {
  const head = await file.slice(0, 4 * 1024 * 1024).arrayBuffer();
  const tail = await file.slice(Math.max(0, file.size - 4 * 1024 * 1024)).arrayBuffer();
  const meta = new TextEncoder().encode(`${file.size}|${file.name}|${file.lastModified}|`);
  const all = new Uint8Array(meta.length + head.byteLength + tail.byteLength);
  all.set(meta, 0);
  all.set(new Uint8Array(head), meta.length);
  all.set(new Uint8Array(tail), meta.length + head.byteLength);
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', all));
  return [...d].map((b) => b.toString(16).padStart(2, '0')).join('');
}

type Fetcher = (url: string, init: RequestInit) => Promise<Response>;
type Bridge = NonNullable<ReturnType<typeof native>['raw']>;

/** «الأداء» as the studio keeps it (components/studio/prefs.ts), read outside React; «تلقائي» when there is none. */
function performancePref() {
  try {
    const v = JSON.parse(localStorage.getItem('studio.pref.performance') ?? 'null') as unknown;
    return isPerformance(v) ? v : 'auto';
  } catch {
    return 'auto';
  }
}

/** How many light copies the application makes at once on this machine: scale.ts's copiesAtOnce, from the profile. */
export async function copyWidth(): Promise<number> {
  const n = native();
  if (!n.has('profile') || !n.has('info')) return plan(null).copiesAtOnce;
  const [p, info] = await Promise.all([n.raw!.profile!.read!().catch(() => null), n.raw!.info!().catch(() => null)]);
  const facts = (info ?? {}) as { cores?: unknown; memory?: unknown };
  const machine = { cores: typeof facts.cores === 'number' ? facts.cores : null, memory: typeof facts.memory === 'number' ? facts.memory : null };
  return plan(currentEntry(p)?.numbers ?? null, machine, performancePref()).copiesAtOnce;
}

export class DeviceCache {
  private root!: FileSystemDirectoryHandle;
  private cache!: FileSystemDirectoryHandle;
  private local!: FileSystemDirectoryHandle;
  private manifest: Manifest = emptyManifest();
  private saving: Promise<void> | null = null;
  private pending = false;
  private downloads = new Map<string, Promise<File>>();
  /** The desktop application's files and cache folder, when it offers them (null in a browser). */
  private files: Bridge['files'] | null = null;
  private folderCache: Bridge['cache'] | null = null;
  private folderState: NativeCacheUsage | null = null;
  private progress = new Map<string, (done: number, total: number) => void>();
  /** The application's media tools (D5), when it offers them. */
  private mediaTools: Bridge['media'] | null = null;
  private mediaProgress = new Map<string, (done: number, total: number) => void>();
  /** The application's queue of light copies made in idle time (D12), when it offers one. */
  private copyQueue: Bridge['media'] | null = null;
  private queueNow: NativeQueueState | null = null;
  private queueListeners = new Set<(s: NativeQueueState) => void>();
  /** The video sources the pool opened, in the order it opened them, and the copies' width on this machine. */
  private wanted = new Map<string, NativeMediaRef>();
  private width = 1;
  private sending: ReturnType<typeof setTimeout> | null = null;

  /** The cache, or null where the browser has no private storage (some private windows, older Safari). */
  static async open(): Promise<DeviceCache | null> {
    try {
      if (typeof navigator === 'undefined' || !navigator.storage?.getDirectory) return null;
      const c = new DeviceCache();
      c.root = await navigator.storage.getDirectory();
      c.cache = await c.root.getDirectoryHandle(CACHE_DIR, { create: true });
      c.local = await c.root.getDirectoryHandle(LOCAL_DIR, { create: true });
      try {
        const f = await (await c.root.getFileHandle('studio-manifest.json')).getFile();
        const m = JSON.parse(await f.text()) as Manifest;
        if (m && m.v === 1 && m.entries) c.manifest = m;
      } catch {
        // no manifest yet
      }
      void navigator.storage.persist?.().catch(() => false);
      const n = native();
      if (n.has('files')) c.files = n.raw!.files!;
      if (n.has('cache')) {
        c.folderCache = n.raw!.cache!;
        c.folderCache.onProgress!((p) => c.progress.get(p.name)?.(p.done, p.total));
        await c.refreshFolder();
      }
      if (n.has('media')) {
        c.mediaTools = n.raw!.media!;
        c.mediaTools.onProgress!((p) => c.mediaProgress.get(p.name)?.(p.done, p.total));
      }
      if (n.has('copyQueue')) {
        c.copyQueue = n.raw!.media!;
        c.copyQueue.onQueue!((st) => {
          c.queueNow = st;
          for (const fn of c.queueListeners) fn(st);
        });
        c.width = await copyWidth().catch(() => 1);
      }
      return c;
    } catch {
      return null;
    }
  }

  get entries(): Entry[] {
    return Object.values(this.manifest.entries);
  }

  /** The desktop application's cache folder as last read: where it is, what it holds, its limit (null in a browser). */
  get folder(): NativeCacheUsage | null {
    return this.folderState;
  }

  /** Reads the folder's state again from the application. */
  async refreshFolder(): Promise<NativeCacheUsage | null> {
    if (this.folderCache) this.folderState = await this.folderCache.usage!().catch(() => this.folderState);
    return this.folderState;
  }

  async chooseFolder(): Promise<NativeCacheUsage | null> {
    if (this.folderCache?.choose) this.folderState = await this.folderCache.choose().catch(() => this.folderState);
    return this.folderState;
  }

  async defaultFolder(): Promise<NativeCacheUsage | null> {
    if (this.folderCache?.useDefault) this.folderState = await this.folderCache.useDefault().catch(() => this.folderState);
    return this.folderState;
  }

  async setLimit(bytes: number, inUse: Set<string> = new Set()): Promise<NativeCacheUsage | null> {
    if (this.folderCache?.limit) this.folderState = await this.folderCache.limit(bytes, [...inUse].map(folderName)).catch(() => this.folderState);
    return this.folderState;
  }

  /**
   * Where a library version is read from: the browser's private storage (as libraryFile), or, in the
   * desktop application, its cache folder, filled by the application with this window's session.
   */
  async libraryPlace(asset: string, version: number, url: string, opts: { label?: string; onProgress?: (done: number, total: number) => void; signal?: AbortSignal; fetcher?: Fetcher } = {}): Promise<Place> {
    if (!this.folderCache) return { file: await this.libraryFile(asset, version, url, opts) };
    const name = folderName(libraryName(asset, version));
    if (opts.onProgress) this.progress.set(name, opts.onProgress);
    const stop = () => void this.folderCache?.cancel?.(name).catch(() => false);
    opts.signal?.addEventListener('abort', stop, { once: true });
    try {
      const r = await this.folderCache.library!({ asset, version, label: opts.label });
      void this.refreshFolder();
      // a source waiting for its library copy can be looked at by the queue now
      if (this.wanted.size) this.sendQueue();
      return { url: r.url };
    } catch (e) {
      const m = (e as Error).message ?? '';
      if (/DENIED/.test(m)) throw Object.assign(new Error('DENIED'), { denied: true });
      if (/GONE/.test(m)) throw Object.assign(new Error('GONE'), { gone: true });
      throw e;
    } finally {
      this.progress.delete(name);
      opts.signal?.removeEventListener('abort', stop);
    }
  }

  private async save() {
    if (this.saving) {
      this.pending = true;
      return this.saving;
    }
    this.saving = (async () => {
      do {
        this.pending = false;
        try {
          const w = await (await this.root.getFileHandle('studio-manifest.json', { create: true })).createWritable();
          await w.write(JSON.stringify(this.manifest));
          await w.close();
        } catch {
          // the manifest is best effort; entries are re-measured from the files when needed
        }
      } while (this.pending);
    })();
    await this.saving;
    this.saving = null;
  }

  private touch(name: string) {
    const e = this.manifest.entries[name];
    if (e) {
      e.lastUsed = Date.now();
      void this.save();
    }
  }

  /**
   * A library version as a file on this device: from the cache when complete, otherwise fetched in
   * parts from `url` (the site's file route, which serves byte ranges), resuming a partial copy.
   */
  libraryFile(asset: string, version: number, url: string, opts: { label?: string; onProgress?: (done: number, total: number) => void; signal?: AbortSignal; fetcher?: Fetcher } = {}): Promise<File> {
    const name = libraryName(asset, version);
    const running = this.downloads.get(name);
    if (running) return running;
    const p = this.download(name, url, opts).finally(() => this.downloads.delete(name));
    this.downloads.set(name, p);
    return p;
  }

  private async download(name: string, url: string, opts: { label?: string; onProgress?: (done: number, total: number) => void; signal?: AbortSignal; fetcher?: Fetcher }): Promise<File> {
    const fetcher = opts.fetcher ?? ((u, i) => fetch(u, i));
    const handle = await this.cache.getFileHandle(name, { create: true });
    let e = this.manifest.entries[name];
    const onDisk = (await handle.getFile()).size;
    if (!e || e.bytes !== onDisk) e = { name, kind: 'library', bytes: onDisk, total: e?.total ?? 0, complete: false, lastUsed: Date.now(), label: opts.label };
    this.manifest.entries[name] = e;
    for (let r = nextRange(e); r; r = nextRange(e)) {
      if (opts.signal?.aborted) throw new DOMException('aborted', 'AbortError');
      const res = await fetcher(url, { headers: { Range: `bytes=${r.from}-${r.to}` }, signal: opts.signal, credentials: 'same-origin' });
      if (res.status !== 206 && res.status !== 200) throw new Error(`HTTP_${res.status}`);
      const total = res.status === 200 ? Number(res.headers.get('content-length') ?? 0) : (totalFromRange(res.headers.get('content-range')) ?? 0);
      const data = new Uint8Array(await res.arrayBuffer());
      const w = await handle.createWritable({ keepExistingData: true });
      if (res.status === 200) {
        // the server ignored the range: this is the whole file
        await w.truncate(0);
        await w.write({ type: 'write', position: 0, data });
        e.bytes = data.byteLength;
        e.total = data.byteLength;
      } else {
        await w.write({ type: 'write', position: r.from, data });
        e.bytes = r.from + data.byteLength;
        e.total = total || e.total;
      }
      await w.close();
      e.lastUsed = Date.now();
      opts.onProgress?.(e.bytes, e.total);
      await this.save();
      if (!data.byteLength) break;
    }
    e.complete = true;
    await this.save();
    return handle.getFile();
  }

  /** A library version already complete on this device, without fetching, or null. */
  async cachedLibraryFile(asset: string, version: number): Promise<File | null> {
    const name = libraryName(asset, version);
    const e = this.manifest.entries[name];
    if (!e?.complete) return null;
    try {
      const f = await (await this.cache.getFileHandle(name)).getFile();
      if (f.size !== e.total) return null;
      this.touch(name);
      return f;
    } catch {
      return null;
    }
  }

  /**
   * Keeps a file from «هذا الجهاز» (copied as a stream, never wholly in memory). Returns its key. In the
   * desktop application a file that is on the laptop is not copied: it is used where it is, by its token.
   */
  async putLocal(file: File): Promise<{ key: string; file: File }> {
    const key = await fingerprint(file);
    const name = `local-${key}`;
    if (this.files) {
      const t = await this.files.fromDropped!(file).catch(() => null);
      if (t) {
        this.manifest.entries[name] = { name, kind: 'local', bytes: file.size, total: file.size, complete: true, lastUsed: Date.now(), label: file.name, token: t.token };
        await this.save();
        return { key, file };
      }
    }
    const handle = await this.local.getFileHandle(name, { create: true });
    const existing = await handle.getFile();
    if (existing.size !== file.size) {
      const w = await handle.createWritable();
      await file.stream().pipeTo(w);
    }
    this.manifest.entries[name] = { name, kind: 'local', bytes: file.size, total: file.size, complete: true, lastUsed: Date.now(), label: file.name };
    await this.save();
    return { key, file: await handle.getFile() };
  }

  /** The application can make light and editable copies (D5). */
  get hasMedia(): boolean {
    return !!this.mediaTools;
  }

  /** How the application names a source to its media tools: its token, or its library version (already in the folder). */
  mediaRef(s: Source): NativeMediaRef | null {
    if (!this.mediaTools) return null;
    if (s.kind === 'library') return { asset: s.asset, version: s.version };
    const token = this.manifest.entries[`local-${s.key}`]?.token;
    return token ? { token } : null;
  }

  async copies(ref: NativeMediaRef): Promise<NativeCopies | null> {
    if (this.copyQueue) this.want(ref);
    return this.mediaTools ? this.mediaTools.copies!(ref).catch(() => null) : null;
  }

  /** The application makes light copies in idle time (D12): the open project's video sources are named to it. */
  get hasCopyQueue(): boolean {
    return !!this.copyQueue;
  }

  /** The queue as the application last told it (null in a browser or an older application). */
  get queued(): NativeQueueState | null {
    return this.queueNow;
  }

  onQueue(fn: (s: NativeQueueState) => void): () => void {
    this.queueListeners.add(fn);
    return () => void this.queueListeners.delete(fn);
  }

  private want(ref: NativeMediaRef) {
    const key = 'token' in ref ? `t:${ref.token}` : `a:${ref.asset}:${ref.version}`;
    if (this.wanted.has(key)) return;
    this.wanted.set(key, ref);
    this.sendQueue();
  }

  /** Names the wanted sources to the application, a moment after the last change (a project opens many at once). */
  private sendQueue() {
    if (!this.copyQueue || this.sending) return;
    this.sending = setTimeout(() => {
      this.sending = null;
      const items = [...this.wanted.values()].slice(0, 200);
      void this.copyQueue!.queue!({ items, width: this.width })
        .then((st) => {
          this.queueNow = st;
          for (const fn of this.queueListeners) fn(st);
        })
        .catch(() => undefined);
    }, 150);
  }

  /**
   * Files copied in from a camera's card (D12, P-20): their videos join the queue, so their light copies are made while
   * the laptop is free, before they are even added to the project.
   */
  wantFiles(files: { token: string; media: string }[]) {
    if (!this.copyQueue) return;
    for (const f of files) if (f.media === 'video') this.want({ token: f.token });
  }

  /** The open project is closed: the application stops making its copies (nothing of an unfinished copy is kept). */
  stopQueue() {
    if (!this.copyQueue) return;
    this.wanted.clear();
    if (this.sending) clearTimeout(this.sending);
    this.sending = null;
    void this.copyQueue.queue!({ items: [], width: this.width }).catch(() => undefined);
  }

  async probe(ref: NativeMediaRef): Promise<NativeProbe | null> {
    return this.mediaTools ? this.mediaTools.probe!(ref).catch(() => null) : null;
  }

  /**
   * A video file from «هذا الجهاز» the browser cannot read at all (MXF, say), as the application reads it:
   * its size and length for a new source, or null (and nothing kept) when the application cannot read it
   * either. Null in a browser, where such a file stays «غير مدعوم».
   */
  async probeInApp(file: File): Promise<{ media: 'video'; w: number; h: number; duration?: number } | null> {
    if (!this.mediaTools || !this.files) return null;
    const { key } = await this.putLocal(file);
    const token = this.manifest.entries[`local-${key}`]?.token;
    const p = token ? await this.probe({ token }) : null;
    if (!p?.video) {
      await this.removeLocal(key);
      return null;
    }
    return { media: 'video', w: p.video.width, h: p.video.height, ...(p.duration ? { duration: Math.round(p.duration * 1e6) } : {}) };
  }

  /**
   * Makes a light copy (`height`) or an editable one (no height) under `name`, the one copies() gave, with
   * progress in seconds of the source. Rejects with the application's word for why: space, decode, encode,
   * failed, cancelled or missing.
   */
  async makeCopy(ref: NativeMediaRef, name: string, o: { height?: number; inUse: Set<string>; onProgress?: (done: number, total: number) => void }): Promise<NativeCopy> {
    if (!this.mediaTools) throw new Error('unavailable');
    if (o.onProgress) this.mediaProgress.set(name, o.onProgress);
    const inUse = [...o.inUse].map(folderName);
    try {
      const r = o.height ? await this.mediaTools.proxy!(ref, o.height, inUse) : await this.mediaTools.convert!(ref, inUse);
      void this.refreshFolder();
      return r;
    } catch (e) {
      // Electron prefixes a handler's error; only the application's own word is kept
      const m = /(space|decode|encode|cancelled|missing|unavailable|refused)\s*$/.exec((e as Error).message ?? '');
      throw new Error(m ? m[1] : 'failed');
    } finally {
      this.mediaProgress.delete(name);
    }
  }

  async cancelCopy(name: string): Promise<void> {
    await this.mediaTools?.cancel?.(name).catch(() => false);
  }

  /** Where a device file is read from, or null when it is not on this device (or no longer where it was). */
  async localPlace(key: string): Promise<Place | null> {
    const e = this.manifest.entries[`local-${key}`];
    if (e?.token) {
      const c = this.files ? await this.files.check!(e.token).catch(() => null) : null;
      if (!c?.ok || !c.url) return null;
      this.touch(e.name);
      return { url: c.url };
    }
    const f = await this.localFile(key);
    return f ? { file: f } : null;
  }

  async localFile(key: string): Promise<File | null> {
    const name = `local-${key}`;
    try {
      const f = await (await this.local.getFileHandle(name)).getFile();
      this.touch(name);
      return f.size ? f : null;
    } catch {
      return null;
    }
  }

  /** Removes the library copies unused for ten days (not those in use), here and in the application's folder. */
  async sweep(inUse: Set<string> = new Set(), now = Date.now()): Promise<{ removed: number; bytes: number }> {
    const here = await this.remove(dueForSweep(this.manifest, now, inUse));
    if (!this.folderCache) return here;
    const there = await this.folderCache.sweep!([...inUse].map(folderName)).catch(() => ({ removed: 0, bytes: 0 }));
    await this.refreshFolder();
    return { removed: here.removed + there.removed, bytes: here.bytes + there.bytes };
  }

  /** «حذف ملفات المعاينة المؤقتة»: every library copy not in use now, here and in the application's folder. Device files stay. */
  async clearLibrary(inUse: Set<string> = new Set()): Promise<{ removed: number; bytes: number }> {
    const here = await this.remove(this.entries.filter((e) => e.kind === 'library' && !inUse.has(e.name)).map((e) => e.name));
    if (!this.folderCache) return here;
    const there = await this.folderCache.clear!([...inUse].map(folderName)).catch(() => ({ removed: 0, bytes: 0 }));
    await this.refreshFolder();
    return { removed: here.removed + there.removed, bytes: here.bytes + there.bytes };
  }

  /** A device file leaves the studio on this device; one used where it is stays where it is, only its token goes. */
  async removeLocal(key: string): Promise<void> {
    const e = this.manifest.entries[`local-${key}`];
    if (e?.token) await this.files?.forget?.(e.token).catch(() => false);
    await this.remove([`local-${key}`]);
  }

  private async remove(names: string[]): Promise<{ removed: number; bytes: number }> {
    let removed = 0;
    let bytes = 0;
    for (const name of names) {
      const e = this.manifest.entries[name];
      try {
        // a file used where it is was never copied here
        if (!e?.token) await (e?.kind === 'local' ? this.local : this.cache).removeEntry(name);
      } catch {
        // already gone
      }
      if (e && !e.token) bytes += e.bytes;
      delete this.manifest.entries[name];
      removed++;
    }
    if (removed) await this.save();
    return { removed, bytes };
  }

  /** Bytes kept, by kind: a file used where it is costs nothing here; the application's folder counts as library. */
  usage(): { library: number; local: number; inPlace: number; files: number } {
    let library = this.folderState ? this.folderState.library + this.folderState.proxy : 0;
    let local = 0;
    let inPlace = 0;
    for (const e of this.entries) {
      if (e.kind === 'library') library += e.bytes;
      else if (e.token) inPlace += e.bytes;
      else local += e.bytes;
    }
    return { library, local, inPlace, files: this.entries.length + (this.folderState?.files ?? 0) };
  }
}

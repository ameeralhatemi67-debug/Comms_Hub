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

export const CACHE_DIR = 'studio-cache';
export const LOCAL_DIR = 'studio-local';
export const TEN_DAYS = 10 * 86_400_000;
export const PART = 16 * 1024 * 1024;

export type Entry = { name: string; kind: 'library' | 'local'; bytes: number; total: number; complete: boolean; lastUsed: number; label?: string };
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

export class DeviceCache {
  private root!: FileSystemDirectoryHandle;
  private cache!: FileSystemDirectoryHandle;
  private local!: FileSystemDirectoryHandle;
  private manifest: Manifest = emptyManifest();
  private saving: Promise<void> | null = null;
  private pending = false;
  private downloads = new Map<string, Promise<File>>();

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
      return c;
    } catch {
      return null;
    }
  }

  get entries(): Entry[] {
    return Object.values(this.manifest.entries);
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

  /** Keeps a file from «هذا الجهاز» (copied as a stream, never wholly in memory). Returns its key. */
  async putLocal(file: File): Promise<{ key: string; file: File }> {
    const key = await fingerprint(file);
    const name = `local-${key}`;
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

  /** Removes the library copies unused for ten days (not those in use). Returns what was freed. */
  async sweep(inUse: Set<string> = new Set(), now = Date.now()): Promise<{ removed: number; bytes: number }> {
    return this.remove(dueForSweep(this.manifest, now, inUse));
  }

  /** «حذف ملفات المعاينة المؤقتة»: every library copy not in use now. Device files stay. */
  async clearLibrary(inUse: Set<string> = new Set()): Promise<{ removed: number; bytes: number }> {
    return this.remove(this.entries.filter((e) => e.kind === 'library' && !inUse.has(e.name)).map((e) => e.name));
  }

  async removeLocal(key: string): Promise<void> {
    await this.remove([`local-${key}`]);
  }

  private async remove(names: string[]): Promise<{ removed: number; bytes: number }> {
    let removed = 0;
    let bytes = 0;
    for (const name of names) {
      const e = this.manifest.entries[name];
      try {
        await (e?.kind === 'local' ? this.local : this.cache).removeEntry(name);
      } catch {
        // already gone
      }
      if (e) bytes += e.bytes;
      delete this.manifest.entries[name];
      removed++;
    }
    if (removed) await this.save();
    return { removed, bytes };
  }

  /** Bytes kept, by kind. */
  usage(): { library: number; local: number; files: number } {
    let library = 0;
    let local = 0;
    for (const e of this.entries) (e.kind === 'library' ? (library += e.bytes) : (local += e.bytes));
    return { library, local, files: this.entries.length };
  }
}

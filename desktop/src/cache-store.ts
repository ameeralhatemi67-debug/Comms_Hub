// The studio's disk cache in a folder on this laptop (Desktop_App_Plan.md 2 and 5.4, phase D4). In a
// browser the studio keeps its library copies in the browser's private storage, under a quota the
// browser may clear; in the application they are files in a folder the person may choose (another disk
// if wanted), with a size limit. A library version is copied once, in resumable parts (from D12 two at a time,
// P-29), from the site's own file route with the window's session, as the page would fetch it; the page then reads it at
// commshub-file://cache/<name>. The ten-day rule is the site's (src/lib/studio/cache.ts dueForSweep):
// a copy unused for ten days goes when the studio next opens; nothing is scheduled. Over the limit, the
// copies used longest ago go first; what the open project uses is never removed. From D5 the folder also
// keeps light copies (proxy-) and converted ones (convert-). Node only, no Electron: the download is
// given a fetch function, so it is tested with a local server.
import fs from 'node:fs';
import path from 'node:path';
import { CACHE_NAME } from './files.ts';

export const TEN_DAYS = 10 * 86_400_000;
export const PART = 16 * 1024 * 1024;
/** Parts asked for at once (D12, Desktop_Power_Ideas.md P-29); more only once a measured link shows the gain. */
export const RANGES = 2;
export const MAX_RANGES = 4;
/** The folder made inside a chosen folder; only its own files are ever removed. */
export const FOLDER_NAME = 'CommsHub Studio Cache';
export const LIMITS = Object.freeze([0, 10e9, 25e9, 50e9, 100e9, 250e9]);
/** What the page is told of the default folder, which lives in the profile under the Windows user's name. */
export const DEFAULT_LABEL = 'المجلد الافتراضي';

/**
 * The cache folder as the page may show it: «المجلد الافتراضي», or the last name of the folder the person chose (a
 * drive's letter for a drive), never a path (Desktop_Power_Ideas.md section 12).
 */
export function folderLabel(chosen: string | null): string {
  if (chosen === null) return DEFAULT_LABEL;
  const parent = path.dirname(chosen);
  return path.basename(parent) || parent.replace(/[\\/]+$/, '') || DEFAULT_LABEL;
}

export type CacheKind = 'library' | 'proxy' | 'convert';
export type CacheEntry = { name: string; kind: CacheKind; bytes: number; total: number; complete: boolean; lastUsed: number; label?: string };
type State = { v: 1; folder: string | null; limit: number; entries: Record<string, CacheEntry> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** The cache name of a library version, or null when the asset or version is not well formed. */
export function libraryName(asset: unknown, version: unknown): string | null {
  if (typeof asset !== 'string' || !UUID.test(asset)) return null;
  if (typeof version !== 'number' || !Number.isSafeInteger(version) || version < 1) return null;
  return `asset-${asset}-v${version}.bin`;
}

const kindOfName = (name: string): CacheKind => (name.startsWith('proxy-') ? 'proxy' : name.startsWith('convert-') ? 'convert' : 'library');

/** The copies due for removal: unused for ten days and not in use (the site's rule, every kind). */
export function dueForSweep(entries: Record<string, CacheEntry>, now: number, inUse: ReadonlySet<string>): string[] {
  return Object.values(entries)
    .filter((e) => !inUse.has(e.name) && now - e.lastUsed >= TEN_DAYS)
    .map((e) => e.name);
}

/** Over the limit: the complete copies used longest ago, until the rest fits; never one in use. */
export function overLimit(entries: Record<string, CacheEntry>, limit: number, inUse: ReadonlySet<string>): string[] {
  if (!limit) return [];
  let total = Object.values(entries).reduce((n, e) => n + e.bytes, 0);
  const out: string[] = [];
  for (const e of Object.values(entries).filter((x) => !inUse.has(x.name)).sort((a, b) => a.lastUsed - b.lastUsed)) {
    if (total <= limit) break;
    out.push(e.name);
    total -= e.bytes;
  }
  return out;
}

export function totalFromRange(h: string | null): number | null {
  const m = /\/(\d+)\s*$/.exec(h ?? '');
  return m ? Number(m[1]) : null;
}

export type CopyOptions = { label?: string; onProgress?: (done: number, total: number) => void; signal?: AbortSignal; inUse?: ReadonlySet<string>; ranges?: number };

export type Fetch = (url: string, init: { headers: Record<string, string>; signal?: AbortSignal }) => Promise<{ status: number; headers: { get(name: string): string | null }; arrayBuffer(): Promise<ArrayBuffer> }>;

export class CacheStore {
  private state: State;
  private readonly stateFile: string;
  private readonly defaultFolder: string;
  /** Copies being written now (a library copy, or a light or converted copy, D5): never removed meanwhile. */
  private running = new Map<string, Promise<unknown>>();

  constructor(stateFile: string, defaultFolder: string) {
    this.stateFile = stateFile;
    this.defaultFolder = defaultFolder;
    this.state = { v: 1, folder: null, limit: 0, entries: {} };
    try {
      const raw = JSON.parse(fs.readFileSync(stateFile, 'utf8')) as State;
      if (raw && raw.v === 1 && raw.entries && typeof raw.entries === 'object') {
        const entries: Record<string, CacheEntry> = {};
        for (const [name, e] of Object.entries(raw.entries)) if (CACHE_NAME.test(name) && e && typeof e.bytes === 'number') entries[name] = { ...e, name, kind: kindOfName(name) };
        this.state = { v: 1, folder: typeof raw.folder === 'string' && path.isAbsolute(raw.folder) ? raw.folder : null, limit: LIMITS.includes(raw.limit) ? raw.limit : 0, entries };
      }
    } catch {
      // a first start, or a damaged record: the folder's files are found again as they are used
    }
  }

  private save() {
    try {
      fs.writeFileSync(`${this.stateFile}.tmp`, JSON.stringify(this.state));
      fs.renameSync(`${this.stateFile}.tmp`, this.stateFile);
    } catch {
      // kept in memory until the application quits
    }
  }

  /** The folder in use: the chosen one's own subfolder, or the profile's default. */
  folder(): string {
    return this.state.folder ?? this.defaultFolder;
  }

  isDefault(): boolean {
    return this.state.folder === null;
  }

  /** The folder's name for the page (folderLabel): never its path. */
  label(): string {
    return folderLabel(this.state.folder);
  }

  private ensureFolder() {
    fs.mkdirSync(this.folder(), { recursive: true });
  }

  pathOf(name: string): string {
    if (!CACHE_NAME.test(name)) throw new Error('not a cache name');
    return path.join(this.folder(), name);
  }

  /** A complete copy's file and size, or null. */
  complete(name: string): { file: string; size: number } | null {
    const e = this.state.entries[name];
    if (!e?.complete) return null;
    try {
      const st = fs.statSync(this.pathOf(name));
      if (!st.isFile() || st.size !== e.total) return null;
      e.lastUsed = Date.now();
      this.save();
      return { file: this.pathOf(name), size: st.size };
    } catch {
      return null;
    }
  }

  entries(): CacheEntry[] {
    return Object.values(this.state.entries).map((e) => ({ ...e }));
  }

  usage(): { library: number; proxy: number; files: number; limit: number } {
    let library = 0;
    let proxy = 0;
    for (const e of Object.values(this.state.entries)) (e.kind === 'library' ? (library += e.bytes) : (proxy += e.bytes));
    return { library, proxy, files: Object.keys(this.state.entries).length, limit: this.state.limit };
  }

  /**
   * A library version in the folder: complete already, or copied now in parts from `url` with `fetch`,
   * resuming a partial copy. One copy at a time per name. From D12 (P-29) up to `ranges` parts are asked for at
   * once (RANGES unless said), each written where it belongs.
   */
  library(name: string, url: string, fetch: Fetch, opts: CopyOptions = {}): Promise<CacheEntry> {
    const running = this.running.get(name);
    if (running) return running as Promise<CacheEntry>;
    const p = this.copy(name, url, fetch, opts).finally(() => this.running.delete(name));
    this.running.set(name, p);
    return p;
  }

  private async copy(name: string, url: string, fetch: Fetch, opts: CopyOptions): Promise<CacheEntry> {
    this.ensureFolder();
    const file = this.pathOf(name);
    let e = this.state.entries[name];
    let onDisk = 0;
    try {
      onDisk = fs.statSync(file).size;
    } catch {
      onDisk = 0;
    }
    if (e?.complete && onDisk === e.total) {
      e.lastUsed = Date.now();
      this.save();
      return { ...e };
    }
    // Only the unbroken start of a copy is kept: parts fetched beyond a gap are fetched again. Without a record of
    // where that start ends, the copy starts over.
    const kept = e ? Math.min(e.bytes, onDisk) : 0;
    e = { name, kind: 'library', bytes: kept, total: e?.total ?? 0, complete: false, lastUsed: Date.now(), label: opts.label ?? e?.label };
    this.state.entries[name] = e;
    const entry = e;
    const fd = fs.openSync(file, onDisk ? 'r+' : 'w');
    if (onDisk > kept) fs.ftruncateSync(fd, kept);
    // A copy refused by the site, or one that failed before its first byte, leaves nothing behind; a
    // partial copy stays, to be resumed.
    const forgetIfEmpty = (err: unknown) => {
      const refused = !!(err && typeof err === 'object' && ('denied' in err || 'gone' in err));
      if (refused || entry.bytes === 0) {
        delete this.state.entries[name];
        this.save();
        try {
          fs.closeSync(fd);
        } catch {
          // already closed
        }
        fs.rmSync(file, { force: true });
        return true;
      }
      return false;
    };
    const ctl = new AbortController();
    const stop = () => ctl.abort();
    opts.signal?.addEventListener('abort', stop, { once: true });
    /** Parts written beyond the unbroken start, by where they begin. */
    const ahead = new Map<number, number>();
    let whole = false;
    const fetchPart = async (from: number) => {
      const to = entry.total ? Math.min(entry.total, from + PART) - 1 : from + PART - 1;
      const res = await fetch(url, { headers: { Range: `bytes=${from}-${to}` }, signal: ctl.signal });
      if (res.status === 401 || res.status === 403) throw Object.assign(new Error('DENIED'), { denied: true });
      if (res.status === 404) throw Object.assign(new Error('GONE'), { gone: true });
      if (res.status !== 206 && res.status !== 200) throw new Error(`HTTP_${res.status}`);
      const data = Buffer.from(await res.arrayBuffer());
      if (whole) return;
      if (res.status === 200) {
        // the server ignored the range: this is the whole file
        whole = true;
        fs.ftruncateSync(fd, 0);
        fs.writeSync(fd, data, 0, data.length, 0);
        ahead.clear();
        entry.bytes = data.length;
        entry.total = data.length;
      } else {
        fs.writeSync(fd, data, 0, data.length, from);
        entry.total = totalFromRange(res.headers.get('content-range')) ?? entry.total;
        if (data.length) ahead.set(from, data.length);
        while (ahead.has(entry.bytes)) {
          const n = ahead.get(entry.bytes)!;
          ahead.delete(entry.bytes);
          entry.bytes += n;
        }
        if (!data.length && !entry.total) entry.total = from;
      }
      entry.lastUsed = Date.now();
      opts.onProgress?.(entry.bytes + [...ahead.values()].reduce((a, b) => a + b, 0), entry.total);
      this.save();
    };
    const width = Math.max(1, Math.min(MAX_RANGES, Math.floor(opts.ranges ?? RANGES) || 1));
    try {
      if (opts.signal?.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' });
      // the first part alone, when the size is not known yet: it says the size
      if (!entry.total) await fetchPart(entry.bytes);
      while (!whole && entry.bytes < entry.total) {
        const before = entry.bytes;
        let next = entry.bytes;
        let failure: unknown = null;
        const running = new Set<Promise<void>>();
        const launch = () => {
          const from = next;
          next = Math.min(entry.total, next + PART);
          const p: Promise<void> = fetchPart(from)
            .catch((err) => {
              failure ??= err;
              ctl.abort();
            })
            .finally(() => running.delete(p));
          running.add(p);
        };
        for (;;) {
          while (!failure && !whole && running.size < width && next < entry.total) launch();
          if (!running.size) break;
          await Promise.race(running);
        }
        if (failure) throw opts.signal?.aborted ? Object.assign(new Error('aborted'), { name: 'AbortError' }) : failure;
        if (entry.bytes === before) throw new Error('HTTP_SHORT');
      }
    } catch (err) {
      opts.signal?.removeEventListener('abort', stop);
      if (forgetIfEmpty(err)) throw err;
      fs.closeSync(fd);
      throw err;
    }
    opts.signal?.removeEventListener('abort', stop);
    fs.closeSync(fd);
    entry.complete = true;
    this.save();
    this.enforceLimit(new Set([...(opts.inUse ?? []), name]));
    return { ...entry };
  }

  /** Where a light or converted copy is written before it is complete: never a cache name, so never served. */
  partOf(name: string): string {
    return `${this.pathOf(name)}.part`;
  }

  /** Marks a copy as being written until `work` settles, so no sweep, limit or clearing removes it. */
  hold<T>(name: string, work: Promise<T>): Promise<T> {
    if (!CACHE_NAME.test(name)) throw new Error('not a cache name');
    const p = work.finally(() => this.running.delete(name));
    this.running.set(name, p);
    return p;
  }

  isRunning(name: string): boolean {
    return this.running.has(name);
  }

  /** Records a file the main process wrote itself (a light or converted copy, D5), then keeps the limit. */
  record(name: string, label?: string, inUse: ReadonlySet<string> = new Set()) {
    const st = fs.statSync(this.pathOf(name));
    this.state.entries[name] = { name, kind: kindOfName(name), bytes: st.size, total: st.size, complete: true, lastUsed: Date.now(), label };
    this.save();
    this.enforceLimit(new Set([...inUse, name]));
  }

  /** Removes what an interrupted light or converted copy left behind (its .part file), unless it is being written. */
  cleanParts(): number {
    let removed = 0;
    let names: string[] = [];
    try {
      names = fs.readdirSync(this.folder());
    } catch {
      return 0;
    }
    for (const file of names) {
      const name = file.endsWith('.part') ? file.slice(0, -5) : '';
      if (!CACHE_NAME.test(name) || this.running.has(name)) continue;
      fs.rmSync(path.join(this.folder(), file), { force: true });
      removed++;
    }
    return removed;
  }

  private removeNames(names: string[]): { removed: number; bytes: number } {
    let removed = 0;
    let bytes = 0;
    for (const name of names) {
      const e = this.state.entries[name];
      if (!e || this.running.has(name)) continue;
      try {
        fs.rmSync(this.pathOf(name), { force: true });
      } catch {
        // already gone
      }
      bytes += e.bytes;
      delete this.state.entries[name];
      removed++;
    }
    if (removed) this.save();
    return { removed, bytes };
  }

  /** The ten-day rule, run when the studio opens. */
  sweep(inUse: ReadonlySet<string>, now = Date.now()) {
    return this.removeNames(dueForSweep(this.state.entries, now, inUse));
  }

  /** «حذف ملفات المعاينة المؤقتة»: every copy not in use now. */
  clear(inUse: ReadonlySet<string> = new Set()) {
    return this.removeNames(Object.keys(this.state.entries).filter((n) => !inUse.has(n)));
  }

  setLimit(bytes: number, inUse: ReadonlySet<string> = new Set()) {
    if (!LIMITS.includes(bytes)) throw new Error('not one of the offered limits');
    this.state.limit = bytes;
    this.save();
    return this.enforceLimit(inUse);
  }

  private enforceLimit(inUse: ReadonlySet<string>) {
    return this.removeNames(overLimit(this.state.entries, this.state.limit, inUse));
  }

  /**
   * Another folder: the cache moves to «CommsHub Studio Cache» inside it, starting empty; the copies in
   * the old folder are removed (they are copies; the library keeps every original). Null goes back to
   * the default folder.
   */
  setFolder(chosen: string | null) {
    if (chosen !== null && !path.isAbsolute(chosen)) throw new Error('not a folder');
    const next = chosen === null ? null : path.join(chosen, FOLDER_NAME);
    if (next === this.state.folder) return;
    this.clear();
    for (const name of Object.keys(this.state.entries)) delete this.state.entries[name];
    this.state.folder = next;
    this.save();
    this.ensureFolder();
  }
}

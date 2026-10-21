// The studio's disk cache in a folder on this laptop (Desktop_App_Plan.md 2 and 5.4, phase D4). In a
// browser the studio keeps its library copies in the browser's private storage, under a quota the
// browser may clear; in the application they are files in a folder the person may choose (another disk
// if wanted), with a size limit. A library version is copied once, in resumable parts, from the site's
// own file route with the window's session, as the page would fetch it; the page then reads it at
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
/** The folder made inside a chosen folder; only its own files are ever removed. */
export const FOLDER_NAME = 'CommsHub Studio Cache';
export const LIMITS = Object.freeze([0, 10e9, 25e9, 50e9, 100e9, 250e9]);

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

export type Fetch = (url: string, init: { headers: Record<string, string>; signal?: AbortSignal }) => Promise<{ status: number; headers: { get(name: string): string | null }; arrayBuffer(): Promise<ArrayBuffer> }>;

export class CacheStore {
  private state: State;
  private readonly stateFile: string;
  private readonly defaultFolder: string;
  private running = new Map<string, Promise<CacheEntry>>();

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
   * resuming a partial copy. One copy at a time per name.
   */
  library(name: string, url: string, fetch: Fetch, opts: { label?: string; onProgress?: (done: number, total: number) => void; signal?: AbortSignal; inUse?: ReadonlySet<string> } = {}): Promise<CacheEntry> {
    const running = this.running.get(name);
    if (running) return running;
    const p = this.copy(name, url, fetch, opts).finally(() => this.running.delete(name));
    this.running.set(name, p);
    return p;
  }

  private async copy(name: string, url: string, fetch: Fetch, opts: { label?: string; onProgress?: (done: number, total: number) => void; signal?: AbortSignal; inUse?: ReadonlySet<string> }): Promise<CacheEntry> {
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
    if (!e || e.bytes !== onDisk) e = { name, kind: 'library', bytes: onDisk, total: e?.total ?? 0, complete: false, lastUsed: Date.now(), label: opts.label };
    this.state.entries[name] = e;
    const fd = fs.openSync(file, onDisk ? 'r+' : 'w');
    // A copy refused by the site, or one that failed before its first byte, leaves nothing behind; a
    // partial copy stays, to be resumed.
    const forgetIfEmpty = (err: unknown) => {
      const refused = !!(err && typeof err === 'object' && ('denied' in err || 'gone' in err));
      if (refused || e.bytes === 0) {
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
    try {
      for (;;) {
        if (e.total && e.bytes >= e.total) break;
        if (opts.signal?.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' });
        const from = e.bytes;
        const to = e.total ? Math.min(e.total, from + PART) - 1 : from + PART - 1;
        const res = await fetch(url, { headers: { Range: `bytes=${from}-${to}` }, signal: opts.signal });
        if (res.status === 401 || res.status === 403) throw Object.assign(new Error('DENIED'), { denied: true });
        if (res.status === 404) throw Object.assign(new Error('GONE'), { gone: true });
        if (res.status !== 206 && res.status !== 200) throw new Error(`HTTP_${res.status}`);
        const data = Buffer.from(await res.arrayBuffer());
        if (res.status === 200) {
          // the server ignored the range: this is the whole file
          fs.ftruncateSync(fd, 0);
          fs.writeSync(fd, data, 0, data.length, 0);
          e.bytes = data.length;
          e.total = data.length;
        } else {
          fs.writeSync(fd, data, 0, data.length, from);
          e.bytes = from + data.length;
          e.total = totalFromRange(res.headers.get('content-range')) ?? e.total;
        }
        e.lastUsed = Date.now();
        opts.onProgress?.(e.bytes, e.total);
        this.save();
        if (!data.length) break;
      }
    } catch (err) {
      if (forgetIfEmpty(err)) throw err;
      fs.closeSync(fd);
      throw err;
    }
    fs.closeSync(fd);
    e.complete = true;
    this.save();
    this.enforceLimit(new Set([...(opts.inUse ?? []), name]));
    return { ...e };
  }

  /** Records a file the main process wrote itself (a light or converted copy, D5). */
  record(name: string, label?: string) {
    const st = fs.statSync(this.pathOf(name));
    this.state.entries[name] = { name, kind: kindOfName(name), bytes: st.size, total: st.size, complete: true, lastUsed: Date.now(), label };
    this.save();
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

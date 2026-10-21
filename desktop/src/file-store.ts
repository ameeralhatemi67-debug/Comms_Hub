// The record of the files chosen on this laptop (files.ts; Desktop_App_Plan.md 5.4, "File tokens"), kept in
// the profile as files.json: token, path, name, size, modification time, type and a fingerprint (SHA-256
// of the size and the first and last 4 MB, as the site's own cache keys a device file). The page sees
// none of the paths. Choosing the same unchanged file again gives the same token. A file that was changed,
// moved or removed is no longer served. Node only, no Electron, so it is tested with real files.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { kindOf, newToken, TOKEN, unchanged, type FileRecord } from './files.ts';

const EDGE = 4 * 1024 * 1024;

/** SHA-256 of the size and the first and last 4 MB, read without loading the file. */
export function fingerprintOf(file: string, size: number): string {
  const hash = crypto.createHash('sha256').update(`${size}|`);
  const fd = fs.openSync(file, 'r');
  try {
    const read = (at: number, length: number) => {
      const buf = Buffer.alloc(length);
      const n = fs.readSync(fd, buf, 0, length, at);
      hash.update(buf.subarray(0, n));
    };
    read(0, Math.min(EDGE, size));
    if (size > EDGE) read(Math.max(EDGE, size - EDGE), Math.min(EDGE, size - EDGE));
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest('hex');
}

export type Lookup = { record: FileRecord } | { missing: 'unknown' | 'gone' | 'changed' };

export class FileStore {
  private records = new Map<string, FileRecord>();
  private readonly file: string;
  private readonly random: (n: number) => Uint8Array;

  constructor(file: string, random: (n: number) => Uint8Array = (n) => crypto.randomBytes(n)) {
    this.file = file;
    this.random = random;
    try {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as { records?: FileRecord[] };
      for (const r of raw.records ?? []) if (r && TOKEN.test(r.token) && typeof r.path === 'string' && path.isAbsolute(r.path)) this.records.set(r.token, r);
    } catch {
      // nothing chosen yet, or a damaged record: start empty
    }
  }

  private save() {
    try {
      fs.writeFileSync(`${this.file}.tmp`, JSON.stringify({ v: 1, records: [...this.records.values()] }));
      fs.renameSync(`${this.file}.tmp`, this.file);
    } catch {
      // the record lasts until the application quits
    }
  }

  /**
   * Records a file the person chose. Null for anything that is not a regular file of a kind the studio
   * takes. The same unchanged file keeps its token.
   */
  add(file: string): FileRecord | null {
    if (typeof file !== 'string' || !path.isAbsolute(file)) return null;
    let stat: fs.Stats;
    try {
      stat = fs.statSync(file);
    } catch {
      return null;
    }
    if (!stat.isFile()) return null;
    const kind = kindOf(path.basename(file));
    if (!kind) return null;
    const known = [...this.records.values()].find((r) => r.path === file && unchanged(r, { size: stat.size, mtimeMs: stat.mtimeMs, isFile: true }));
    if (known) return known;
    const record: FileRecord = {
      token: newToken(this.random(32)),
      path: file,
      name: path.basename(file),
      size: stat.size,
      mtimeMs: stat.mtimeMs,
      type: kind.type,
      media: kind.media,
      fingerprint: fingerprintOf(file, stat.size),
    };
    this.records.set(record.token, record);
    this.save();
    return record;
  }

  /** The file behind a token, if it is still the one chosen. */
  lookup(token: string): Lookup {
    const record = this.records.get(token);
    if (!record) return { missing: 'unknown' };
    let stat: fs.Stats;
    try {
      stat = fs.statSync(record.path);
    } catch {
      return { missing: 'gone' };
    }
    return unchanged(record, { size: stat.size, mtimeMs: stat.mtimeMs, isFile: stat.isFile() }) ? { record } : { missing: 'changed' };
  }

  forget(token: string): boolean {
    const had = this.records.delete(token);
    if (had) this.save();
    return had;
  }

  /** «مسح بيانات هذا الجهاز»: every token, at once. Returns how many there were. */
  clear(): number {
    const n = this.records.size;
    this.records.clear();
    this.save();
    return n;
  }

  get size(): number {
    return this.records.size;
  }
}

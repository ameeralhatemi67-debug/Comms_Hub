// The downloads the main process saved from the site's file routes (downloads.ts; Desktop_Power_Ideas.md P-28), each
// under an id it gave at `will-download`: 32 random bytes, meaningless outside this run. Kept in memory only, the
// newest few, and forgotten with «مسح بيانات هذا الجهاز»; the files themselves stay where the person saved them.
// When a download is saved its mark of the web is checked, and written if Chromium left none, so the file carries
// Windows' Zone.Identifier like any file from the internet. A file opens only while that mark is still on it, it is
// still a plain file where it was saved, and its kind is on the fixed list. Node only, no Electron, so it is tested
// with real files.
import crypto from 'node:crypto';
import fs from 'node:fs';
import { isMarked, openKind, zoneText, type OpenKind, type OpenWhy } from './downloads.ts';
import { newToken, TOKEN } from './files.ts';

/** At most this many downloads are remembered, the newest. */
export const MAX_DOWNLOADS = 20;

export type DownloadRecord = {
  id: string;
  origin: string;
  from: 'library' | 'mail' | 'messaging';
  /** Where the person saved it; empty until the download is done. */
  file: string;
  kind: OpenKind | null;
  /** Whether the mark of the web was already on the saved file, written by the application, or could not be written. */
  mark: 'found' | 'written' | 'none' | null;
};

/** The Zone.Identifier stream of a file, or null when it has none (or the drive keeps no streams). */
export function markOf(file: string): string | null {
  try {
    return fs.readFileSync(`${file}:Zone.Identifier`, 'latin1');
  } catch {
    return null;
  }
}

/** Keeps the mark of the web on a saved file: the one Chromium wrote, or the application's own when there is none. */
export function ensureMark(file: string, origin: string): 'found' | 'written' | 'none' {
  if (isMarked(markOf(file))) return 'found';
  try {
    fs.writeFileSync(`${file}:Zone.Identifier`, zoneText(origin), 'latin1');
  } catch {
    return 'none';
  }
  return isMarked(markOf(file)) ? 'written' : 'none';
}

const plainFile = (file: string) => {
  try {
    return fs.lstatSync(file).isFile();
  } catch {
    return false;
  }
};

export class DownloadStore {
  private readonly list = new Map<string, DownloadRecord>();

  /** A download from one of the site's file routes has begun: its id. */
  start(origin: string, from: DownloadRecord['from']): string {
    const id = newToken(crypto.randomBytes(32));
    this.list.set(id, { id, origin, from, file: '', kind: null, mark: null });
    while (this.list.size > MAX_DOWNLOADS) this.list.delete(this.list.keys().next().value!);
    return id;
  }

  /** It was saved at `file`: its kind and its mark. Null when the id is no longer known. */
  finish(id: string, file: string): DownloadRecord | null {
    const r = this.list.get(id);
    if (!r || !file) return null;
    r.file = file;
    r.kind = openKind(file);
    r.mark = ensureMark(file, r.origin);
    return { ...r };
  }

  /** It was cancelled or failed. */
  drop(id: string): void {
    this.list.delete(id);
  }

  /** The file to open, or why not. */
  openable(id: string): { ok: true; file: string } | { ok: false; why: OpenWhy } {
    const r = TOKEN.test(id) ? this.list.get(id) : undefined;
    if (!r || !r.file || !plainFile(r.file)) return { ok: false, why: 'gone' };
    if (!openKind(r.file)) return { ok: false, why: 'kind' };
    if (!isMarked(markOf(r.file))) return { ok: false, why: 'unmarked' };
    return { ok: true, file: r.file };
  }

  /** The file to show in its folder, whatever its kind: showing runs nothing. */
  showable(id: string): { ok: true; file: string } | { ok: false; why: 'gone' } {
    const r = TOKEN.test(id) ? this.list.get(id) : undefined;
    if (!r || !r.file || !plainFile(r.file)) return { ok: false, why: 'gone' };
    return { ok: true, file: r.file };
  }

  /** «مسح بيانات هذا الجهاز»: every id is forgotten. */
  clear(): number {
    const n = this.list.size;
    this.list.clear();
    return n;
  }
}

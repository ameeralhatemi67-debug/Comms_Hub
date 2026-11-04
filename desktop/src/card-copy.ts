// Reading a camera's card and copying its recordings (Desktop_Power_Ideas.md P-20, phase D12; the rules are card.ts).
// The card is walked without following a link or a junction out of the chosen folder, to a bounded depth and count.
// A recording is copied as a .part file next to where it will live, its parts read in order (a split recording joins
// end to end), while a SHA-256 is taken of what was read; the copy is then read back from the disk and must give the
// same SHA-256 and the same size before it takes its name. A card pulled out mid-copy, a cancel or anything that does
// not match leaves no part file and no copy behind. Node only, no Electron: tested with real files.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { CARD_LIMITS, visibleName, type Found } from './card.ts';

/** The media files under `root` and every folder inside it, as card.ts takes them; links are never followed. */
export function listCard(root: string, limits = CARD_LIMITS): Found[] {
  const out: Found[] = [];
  const walk = (dir: string, rel: string, depth: number) => {
    if (depth > limits.depth || out.length >= limits.files) return;
    let names: string[];
    try {
      names = fs.readdirSync(dir).sort();
    } catch {
      return;
    }
    for (const name of names) {
      if (out.length >= limits.files) return;
      if (!visibleName(name)) continue;
      const full = path.join(dir, name);
      let st: fs.Stats;
      try {
        st = fs.lstatSync(full);
      } catch {
        continue;
      }
      // a link or a junction could lead anywhere on the laptop: never followed
      if (st.isSymbolicLink()) continue;
      const r = rel ? `${rel}/${name}` : name;
      if (st.isDirectory()) walk(full, r, depth + 1);
      else if (st.isFile()) out.push({ rel: r, size: st.size, mtimeMs: st.mtimeMs });
    }
  };
  walk(root, '', 0);
  return out;
}

/** The file a relative place on the card names, only when it stays inside the card. */
export function onCard(root: string, rel: string): string | null {
  const full = path.resolve(root, ...rel.split('/'));
  const within = path.relative(path.resolve(root), full);
  if (!within || within.startsWith('..') || path.isAbsolute(within)) return null;
  return full;
}

const CHUNK = 4 * 1024 * 1024;

async function sha256Of(file: string, signal?: AbortSignal): Promise<{ sha256: string; bytes: number }> {
  const hash = crypto.createHash('sha256');
  let bytes = 0;
  for await (const chunk of fs.createReadStream(file, { highWaterMark: CHUNK, signal })) {
    hash.update(chunk as Buffer);
    bytes += (chunk as Buffer).length;
  }
  return { sha256: hash.digest('hex'), bytes };
}

/**
 * Copies `parts`, in order, into one file `dest`, verified: the bytes read are hashed as they are written, the written
 * file is read back and hashed again, and only a match (and the sizes the parts had when the copy began) gives `dest`
 * its name. `onProgress` hears the bytes copied, then the bytes checked.
 */
export async function copyVerified(parts: readonly string[], dest: string, o: { onProgress?: (done: number, phase: 'copy' | 'check') => void; signal?: AbortSignal } = {}): Promise<{ bytes: number; sha256: string }> {
  const part = `${dest}.part`;
  const sizes = parts.map((p) => fs.statSync(p).size);
  const want = sizes.reduce((a, b) => a + b, 0);
  const hash = crypto.createHash('sha256');
  let done = 0;
  let out: fs.WriteStream | null = null;
  try {
    // what an interrupted copy left under this name goes first
    fs.rmSync(part, { force: true });
    out = fs.createWriteStream(part, { flags: 'wx' });
    const w = out;
    await new Promise<void>((resolve, reject) => {
      w.once('open', () => resolve());
      w.once('error', reject);
    });
    for (const p of parts) {
      for await (const chunk of fs.createReadStream(p, { highWaterMark: CHUNK, signal: o.signal })) {
        hash.update(chunk as Buffer);
        done += (chunk as Buffer).length;
        if (!w.write(chunk)) await new Promise<void>((r, j) => (w.once('drain', r), w.once('error', j)));
        o.onProgress?.(done, 'copy');
      }
    }
    await new Promise<void>((resolve, reject) => w.end((err?: Error | null) => (err ? reject(err) : resolve())));
    out = null;
    const read = hash.digest('hex');
    if (done !== want) throw Object.assign(new Error('changed'), { why: 'changed' });
    const back = await sha256Of(part, o.signal);
    o.onProgress?.(back.bytes, 'check');
    if (back.bytes !== want || back.sha256 !== read) throw Object.assign(new Error('mismatch'), { why: 'mismatch' });
    fs.renameSync(part, dest);
    return { bytes: back.bytes, sha256: back.sha256 };
  } catch (e) {
    // the part file is closed before it is removed (Windows keeps an open file)
    const w = out;
    if (w) {
      w.destroy();
      await new Promise<void>((r) => (w.closed ? r() : w.once('close', () => r())));
    }
    fs.rmSync(part, { force: true });
    throw e;
  }
}

// «استيراد من بطاقة الكاميرا» (Desktop_Power_Ideas.md P-20, phase D12): what a camera's card holds, as the studio takes
// it. The person picks the card or a folder of it in Windows' dialog; the main process lists the media files inside it
// (the kinds of files.ts TYPES, nothing hidden, no link followed out of it), and joins a recording the camera split into
// parts because the card's file system cannot hold one file that large (AVCHD's MTS and M2TS, which are a byte stream
// and join end to end). The page is told names, sizes and kinds; the paths stay in the main process. Pure; card-copy.ts
// copies and verifies, native-files.ts asks the dialogs.
import path from 'node:path';
import { kindOf, type Media } from './files.ts';

/** A media file found on the card: its place relative to the chosen folder, with `/` between folders. */
export type Found = { rel: string; size: number; mtimeMs: number };
/** One recording as the page is told it (`parts` stays in the main process). */
export type CardItem = { key: string; name: string; size: number; media: Media; modified: number; parts: string[] };

export const CARD_LIMITS = Object.freeze({ files: 5000, depth: 8 });
/**
 * Parts of a split recording are each at least this large, but the last: a card formatted FAT32 splits a recording at
 * about 2 GB or 4 GB (cameras differ), and only those cards' streams are joined.
 */
export const SPLIT_AT = 1.9e9;
const SPLITTABLE = ['.mts', '.m2ts'];
/** Folders a card or Windows keeps for itself. */
const SKIP = /^(\.|\$recycle\.bin$|system volume information$)/i;

/** Whether a name inside the card is worth looking at: nothing hidden, nothing Windows keeps for itself. */
export const visibleName = (name: string) => !SKIP.test(name) && !name.startsWith('._');

const stemNumber = (name: string) => {
  const m = /^(\d{1,8})\.[^.]+$/.exec(name);
  return m ? { n: Number(m[1]), width: m[1].length } : null;
};
const natural = (a: string, b: string) => a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' });

/** The recordings on a card, in the card's order, a split recording as one item with its parts in order. */
export function cardItems(found: readonly Found[], splitAt = SPLIT_AT): CardItem[] {
  const media = found.filter((f) => f.size > 0 && kindOf(path.posix.basename(f.rel))).sort((a, b) => natural(a.rel, b.rel));
  const items: CardItem[] = [];
  let open: { item: CardItem; dir: string; ext: string; n: number; width: number; last: number } | null = null;
  for (const f of media) {
    const name = path.posix.basename(f.rel);
    const dir = path.posix.dirname(f.rel);
    const ext = path.posix.extname(name).toLowerCase();
    const num = stemNumber(name);
    if (open && num && SPLITTABLE.includes(ext) && open.dir === dir && open.ext === ext && num.width === open.width && num.n === open.n + 1 && open.last >= splitAt) {
      open.item.parts.push(f.rel);
      open.item.size += f.size;
      open.n = num.n;
      open.last = f.size;
      continue;
    }
    const item: CardItem = { key: `c${items.length}`, name, size: f.size, media: kindOf(name)!.media, modified: Math.round(f.mtimeMs), parts: [f.rel] };
    items.push(item);
    open = num && SPLITTABLE.includes(ext) ? { item, dir, ext, n: num.n, width: num.width, last: f.size } : null;
  }
  return items;
}

/** What the page is told of a card's recordings: never a path. */
export function cardView(items: readonly CardItem[]): { key: string; name: string; size: number; media: Media; modified: number; parts: number }[] {
  return items.map((i) => ({ key: i.key, name: i.name, size: i.size, media: i.media, modified: i.modified, parts: i.parts.length }));
}

/** A name not yet taken in the destination folder: «name (2).ext», «name (3).ext» and so on. Case does not matter on Windows. */
export function freeName(taken: ReadonlySet<string>, name: string): string {
  const low = new Set([...taken].map((t) => t.toLowerCase()));
  if (!low.has(name.toLowerCase())) return name;
  const ext = path.posix.extname(name);
  const stem = name.slice(0, name.length - ext.length);
  for (let i = 2; ; i++) {
    const next = `${stem} (${i})${ext}`;
    if (!low.has(next.toLowerCase())) return next;
  }
}

/** The import's keys the page chose, each once, only of this import, or null for anything else. */
export function chosenKeys(value: unknown, items: readonly CardItem[]): string[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > items.length) return null;
  const known = new Set(items.map((i) => i.key));
  const out: string[] = [];
  for (const k of value) {
    if (typeof k !== 'string' || !known.has(k) || out.includes(k)) return null;
    out.push(k);
  }
  return out;
}

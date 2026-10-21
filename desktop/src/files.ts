// Files from «هذا الجهاز» used where they are (Desktop_App_Plan.md 5.2 `files`, phase D4; DT-10, DT-11).
// The person chooses a file (the system's dialog, a drop, or the page's own file field); the main
// process records where it is and hands the page a token, 32 random bytes meaningless outside this
// profile. The page reads the file at commshub-file://local/<token>, in ranges; it never sees the path,
// and nothing the page sends is ever taken as one. A token stops working when the person forgets it, when
// the file is changed, moved or removed, and with «مسح بيانات هذا الجهاز». The cache folder's copies are
// read at commshub-file://cache/<name>, under names the main process gives them. Pure; file-store.ts
// keeps the records and protocol.ts serves them.

export const SCHEME = 'commshub-file';
export const TOKEN = /^[A-Za-z0-9_-]{43}$/;
/** Names the main process gives the cache folder's copies: a library copy, a light copy or a converted one. */
export const CACHE_NAME = /^(asset|proxy|convert)-[a-z0-9-]{1,140}\.(bin|mp4)$/;

export type Media = 'video' | 'audio' | 'image';

/** A token from 32 random bytes, in base64url (43 characters). */
export function newToken(bytes: Uint8Array): string {
  if (bytes.length !== 32) throw new Error('a token is made of 32 random bytes');
  return Buffer.from(bytes).toString('base64url');
}

export function addressOf(kind: 'local' | 'cache', id: string): string {
  return `${SCHEME}://${kind}/${id}`;
}

/** What an address names, or null for anything that is not exactly one token or one cache name. */
export function parseAddress(url: string): { kind: 'local'; token: string } | { kind: 'cache'; name: string } | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== `${SCHEME}:` || u.username || u.password || u.port) return null;
  const segments = u.pathname.split('/');
  if (segments.length !== 2 || segments[0] !== '') return null;
  let id: string;
  try {
    id = decodeURIComponent(segments[1]);
  } catch {
    return null;
  }
  if (u.hostname === 'local' && TOKEN.test(id)) return { kind: 'local', token: id };
  if (u.hostname === 'cache' && CACHE_NAME.test(id)) return { kind: 'cache', name: id };
  return null;
}

/** The kinds of file the studio takes, by extension: what it is and the type the page is told. */
export const TYPES: Readonly<Record<string, { media: Media; type: string }>> = Object.freeze({
  '.mp4': { media: 'video', type: 'video/mp4' },
  '.m4v': { media: 'video', type: 'video/mp4' },
  '.mov': { media: 'video', type: 'video/quicktime' },
  '.webm': { media: 'video', type: 'video/webm' },
  '.mkv': { media: 'video', type: 'video/x-matroska' },
  '.mts': { media: 'video', type: 'video/mp2t' },
  '.m2ts': { media: 'video', type: 'video/mp2t' },
  '.ts': { media: 'video', type: 'video/mp2t' },
  '.mxf': { media: 'video', type: 'application/mxf' },
  '.avi': { media: 'video', type: 'video/x-msvideo' },
  '.mp3': { media: 'audio', type: 'audio/mpeg' },
  '.m4a': { media: 'audio', type: 'audio/mp4' },
  '.aac': { media: 'audio', type: 'audio/aac' },
  '.wav': { media: 'audio', type: 'audio/wav' },
  '.flac': { media: 'audio', type: 'audio/flac' },
  '.ogg': { media: 'audio', type: 'audio/ogg' },
  '.opus': { media: 'audio', type: 'audio/ogg' },
  '.png': { media: 'image', type: 'image/png' },
  '.jpg': { media: 'image', type: 'image/jpeg' },
  '.jpeg': { media: 'image', type: 'image/jpeg' },
  '.webp': { media: 'image', type: 'image/webp' },
  '.gif': { media: 'image', type: 'image/gif' },
});

export function kindOf(name: string): { media: Media; type: string } | null {
  const dot = name.lastIndexOf('.');
  return dot < 0 ? null : (TYPES[name.slice(dot).toLowerCase()] ?? null);
}

const LABEL: Record<Media, string> = { video: 'فيديو', audio: 'صوت', image: 'صور' };

/** The system dialog's filters for the kinds asked for (unknown kinds are dropped). */
export function dialogFilters(kinds: readonly unknown[]): { name: string; extensions: string[] }[] {
  const wanted = (['video', 'audio', 'image'] as Media[]).filter((k) => kinds.includes(k));
  return (wanted.length ? wanted : (['video', 'audio', 'image'] as Media[])).map((media) => ({
    name: LABEL[media],
    extensions: Object.entries(TYPES)
      .filter(([, t]) => t.media === media)
      .map(([ext]) => ext.slice(1)),
  }));
}

/** What the main process keeps of a chosen file. */
export type FileRecord = { token: string; path: string; name: string; size: number; mtimeMs: number; type: string; media: Media; fingerprint: string };

/** What the page is told: never the path. */
export function publicView(r: FileRecord): { token: string; name: string; size: number; type: string; media: Media; modified: number } {
  return { token: r.token, name: r.name, size: r.size, type: r.type, media: r.media, modified: Math.round(r.mtimeMs) };
}

/** A recorded file is still the one chosen: same size and the same modification time. */
export function unchanged(r: Pick<FileRecord, 'size' | 'mtimeMs'>, stat: { size: number; mtimeMs: number; isFile: boolean }): boolean {
  return stat.isFile && stat.size === r.size && Math.abs(stat.mtimeMs - r.mtimeMs) < 1;
}

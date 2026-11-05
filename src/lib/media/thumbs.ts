// Thumbnails of stored files (Director_Notes_Plan.md N-4, MVP_draft.md section 77): the limits, the addresses and the small
// decisions the browser, the route and the tests share. Client-safe and pure: no DOM, no fetch. The database holds the same
// limits (supabase/migrations/*file_thumbs*), and tests/thumbs.test.mjs keeps them equal.

/** The longest side of a thumbnail, in pixels. Twice a list's 160 px tile, for a sharp picture on a dense screen. */
export const THUMB_EDGE = 320;
/** The largest thumbnail the database keeps. */
export const THUMB_MAX_BYTES = 48 * 1024;
/** The smallest: anything less is not a picture. */
export const THUMB_MIN_BYTES = 64;
export const THUMB_TYPES = ['image/webp', 'image/jpeg', 'image/png'] as const;
export type ThumbType = (typeof THUMB_TYPES)[number];
/** The browser tries these qualities in turn until the picture fits. */
export const THUMB_QUALITIES = [0.72, 0.55, 0.4] as const;
/** A video's picture is taken a tenth of the way in, never later than this, so a fade from black is passed. */
export const FRAME_MAX_SECONDS = 3;
/** How long the browser waits for a video's frame before giving up (a codec it cannot read). */
export const FRAME_WAIT_MS = 8000;
/** The size the server asks Drive for, then a smaller one if that is over the limit. */
export const DRIVE_SIZES = [THUMB_EDGE, 200] as const;
/** After Drive had no picture, the server asks again a day later (a video may still have been processing). */
export const NONE_RETRY_MS = 24 * 3600e3;

/** What a thumbnail belongs to: a library version, or a file sent in mail or messaging. */
export type ThumbOf = { asset: string; version: number } | { mailFile: string };
/** The site's address of a thumbnail. The version is in it, so a thumbnail is cached for good. */
export const thumbUrl = (t: ThumbOf) =>
  'asset' in t ? `/api/thumb/media/${encodeURIComponent(t.asset)}?v=${t.version}` : `/api/thumb/mail/${encodeURIComponent(t.mailFile)}`;

/** The size a picture is drawn at: its longest side THUMB_EDGE, never larger than it is. */
export function fitSize(w: number, h: number, edge: number = THUMB_EDGE): { w: number; h: number } | null {
  if (!(w > 0 && h > 0) || !Number.isFinite(w) || !Number.isFinite(h)) return null;
  const k = Math.min(1, edge / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}

/** The moment of a video the picture is taken at. */
export const frameTime = (duration: number) => (Number.isFinite(duration) && duration > 0 ? Math.min(FRAME_MAX_SECONDS, duration / 10) : 0);

/** Which files the browser can draw a picture of at upload. */
export const drawable = (mime: string) => /^image\/(png|jpeg|webp|gif|bmp|avif)$/.test(mime) || /^video\//.test(mime);

/** A picture's type by its own first bytes, or null. The database checks the same. */
export function sniffImage(b: Uint8Array): ThumbType | null {
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50)
    return 'image/webp';
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a)
    return 'image/png';
  return null;
}

/** Whether bytes may be kept as a thumbnail of this type. */
export const thumbFits = (b: Uint8Array, mime: string) => b.length >= THUMB_MIN_BYTES && b.length <= THUMB_MAX_BYTES && sniffImage(b) === mime;

/**
 * Drive's thumbnail address at another size. Its links end in «=s220»; one without a size is left as it is. Only Google's
 * own picture hosts are accepted, so the server never fetches an address it does not expect.
 */
export function driveThumbAt(link: unknown, size: number): string | null {
  if (typeof link !== 'string' || link.length > 2048) return null;
  let u: URL;
  try {
    u = new URL(link);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' || !(u.hostname.endsWith('.googleusercontent.com') || u.hostname === 'drive.google.com')) return null;
  return /=s\d+$/.test(link) ? link.replace(/=s\d+$/, `=s${size}`) : link;
}

/** The extension a tile shows when there is no picture: at most five letters, upper case, or nothing. */
export function extOf(name: string | null | undefined): string {
  const m = /\.([A-Za-z0-9]{1,5})$/.exec(name ?? '');
  return m ? m[1].toUpperCase() : '';
}

/** The kind of a file by its type, for the tile's icon. */
export type FileKind = 'image' | 'video' | 'audio' | 'document' | 'other';
export function kindOfMime(mime: string | null | undefined): FileKind {
  const m = (mime ?? '').toLowerCase();
  if (m.startsWith('image/')) return 'image';
  if (m.startsWith('video/')) return 'video';
  if (m.startsWith('audio/')) return 'audio';
  if (/pdf|word|document|presentation|powerpoint|sheet|excel|text\/|rtf|opendocument/.test(m)) return 'document';
  return 'other';
}

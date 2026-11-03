// What the two «تجربة النشر» panels share (MVP_draft.md sections 71 and 72): the request wrapper that never throws, a
// refusal in words, sizes and times as the panels say them, and a device file's type from its name when the browser
// gives none. Client-safe.

/** The type of a file from this device, from its name when the browser gives none. */
const EXT: Record<string, string> = {
  mp4: 'video/mp4',
  m4v: 'video/x-m4v',
  mov: 'video/quicktime',
  webm: 'video/webm',
  mkv: 'video/x-matroska',
  avi: 'video/x-msvideo',
  mpeg: 'video/mpeg',
  mpg: 'video/mpeg',
  '3gp': 'video/3gpp',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
};
export const mimeOf = (f: File) => (f.type || EXT[f.name.split('.').pop()?.toLowerCase() ?? ''] || '').toLowerCase();
export const mb = (n: number) => `${(n / 1048576).toFixed(n < 10 * 1048576 ? 1 : 0)} ميغابايت`;
export const when = (iso: string) => new Date(iso).toLocaleString('ar-SA-u-nu-latn', { dateStyle: 'medium', timeStyle: 'short' });
/** Seconds as «m:ss». */
export const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export type Reply = { ok: boolean; b: Record<string, unknown> };
/** A request to the site's own routes. A lost connection is a reply too, marked to be tried again. */
export async function api(url: string, init: RequestInit): Promise<Reply> {
  try {
    const r = await fetch(url, init);
    const b = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: r.ok, b };
  } catch {
    return { ok: false, b: { error: 'تعذّر الوصول إلى الخادم.', retry: true } };
  }
}
export const said = (b: Record<string, unknown>) => (typeof b.error === 'string' && b.error ? b.error : 'تعذّر إتمام التجربة.');

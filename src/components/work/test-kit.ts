// What the «تجربة النشر» panels share (MVP_draft.md sections 71 to 73): the request wrapper that never throws, a refusal in
// words, sizes and times as the panels say them, a device file's type from its name when the browser gives none, a picture
// redrawn to JPEG, a video's length, and a file sent straight to the Drive upload the site opened. Client-safe.
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { TEST_ERROR_AR, type TestRow } from '@/lib/platforms/test-rules';

const UPLOAD_FAILED = TEST_ERROR_AR.TEMP_UPLOAD_FAILED;

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

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const DRIVE_CHUNK = 8 * 1024 * 1024;

/** A picture as JPEG, no wider than `width`, on white (JPEG has no transparency). Drops the file's metadata. */
export async function toJpeg(blob: Blob, width: number): Promise<{ jpeg: Blob; ratio: number }> {
  const bmp = await createImageBitmap(blob);
  const ratio = bmp.width / bmp.height;
  const scale = Math.min(1, width / bmp.width);
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  const g = c.getContext('2d')!;
  g.fillStyle = '#fff';
  g.fillRect(0, 0, c.width, c.height);
  g.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  const jpeg = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/jpeg', 0.9));
  if (!jpeg) throw new Error('تعذّر تحويل الصورة.');
  return { jpeg, ratio };
}

/** A video's length in seconds, from its own address; null when the browser cannot read it. */
export function videoSeconds(src: string): Promise<number | null> {
  return new Promise((done) => {
    const v = document.createElement('video');
    const end = (s: number | null) => {
      clearTimeout(timer);
      v.removeAttribute('src');
      v.load();
      done(s);
    };
    const timer = setTimeout(() => end(null), 8000);
    v.preload = 'metadata';
    v.muted = true;
    v.onloadedmetadata = () => end(Number.isFinite(v.duration) ? v.duration : null);
    v.onerror = () => end(null);
    v.src = src;
  });
}

/** Sends a file straight to the Drive upload the site opened, in pieces, and returns Drive's id for it. */
export async function sendToDrive(session: string, blob: Blob, onProgress: (f: number) => void, stopped: () => boolean): Promise<string> {
  let offset = 0;
  let failures = 0;
  for (;;) {
    if (stopped()) throw new Error('stopped');
    const end = Math.min(offset + DRIVE_CHUNK, blob.size);
    let res: Response;
    try {
      res = await fetch(session, { method: 'PUT', headers: { 'Content-Range': `bytes ${offset}-${end - 1}/${blob.size}` }, body: blob.slice(offset, end) });
    } catch {
      if (++failures > 5) throw new Error(UPLOAD_FAILED);
      await sleep(1000 * failures);
      continue;
    }
    if (res.status === 308) {
      const range = res.headers.get('Range');
      offset = range ? Number(range.split('-')[1]) + 1 : end;
      onProgress(offset / blob.size);
    } else if (res.ok) {
      onProgress(1);
      return ((await res.json()) as { id: string }).id;
    } else if (res.status >= 500 && ++failures <= 5) {
      await sleep(1000 * failures);
    } else {
      throw new Error(UPLOAD_FAILED);
    }
  }
}

/** An account's last five tests, as row level security shows them, and a way to read them again. */
export function useTests(account: string): [TestRow[], () => Promise<void>] {
  const [tests, setTests] = useState<TestRow[]>([]);
  const load = useCallback(async () => {
    const { data } = await supabase()
      .from('platform_tests')
      .select('id,privacy,title,kind,state,video_id,post_url,shown_privacy,error,link,scheduled_for,created_by,created_at,done_at,deleted_at')
      .eq('account_id', account)
      .order('created_at', { ascending: false })
      .limit(5);
    setTests((data ?? []) as TestRow[]);
  }, [account]);
  useEffect(() => {
    void load();
  }, [load]);
  return [tests, load];
}

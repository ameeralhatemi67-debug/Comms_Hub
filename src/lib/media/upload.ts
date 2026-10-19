'use client';
// Browser side of an upload: open a session through the Hub, send the file to Google
// in chunks (resumable), then ask the Hub to register it. Shared by new files and
// new versions.
import { CHUNK_BYTES } from '../drive/media';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Where Drive's session stands after a dropped connection; 0 when nothing is readable. */
async function resumeOffset(sessionUrl: string, size: number): Promise<number> {
  try {
    const probe = await fetch(sessionUrl, { method: 'PUT', headers: { 'Content-Range': `bytes */${size}` } });
    const range = probe.headers.get('Range');
    return probe.status === 308 && range ? Number(range.split('-')[1]) + 1 : 0;
  } catch {
    return 0;
  }
}

/** Sends a file to an open Drive session and returns the Drive file id. */
export async function sendToDrive(sessionUrl: string, file: File, onProgress: (fraction: number) => void): Promise<string> {
  let offset = 0;
  let failures = 0;
  while (true) {
    const end = Math.min(offset + CHUNK_BYTES, file.size);
    let res: Response;
    try {
      res = await fetch(sessionUrl, {
        method: 'PUT',
        headers: { 'Content-Range': `bytes ${offset}-${end - 1}/${file.size}` },
        body: file.slice(offset, end),
      });
    } catch {
      if (++failures > 5) throw new Error('انقطع الاتصال أثناء الرفع.');
      await sleep(1000 * failures);
      offset = await resumeOffset(sessionUrl, file.size);
      continue;
    }
    if (res.status === 308) {
      const range = res.headers.get('Range');
      offset = range ? Number(range.split('-')[1]) + 1 : end;
      onProgress(offset / file.size);
    } else if (res.ok) {
      onProgress(1);
      return ((await res.json()) as { id: string }).id;
    } else if (res.status >= 500 && ++failures <= 5) {
      await sleep(1000 * failures);
      offset = await resumeOffset(sessionUrl, file.size);
    } else {
      throw new Error('رفض Google Drive الملف.');
    }
  }
}

async function errorOf(res: Response, fallback: string): Promise<string> {
  const j = (await res.json().catch(() => null)) as { error?: string } | null;
  return j?.error ?? fallback;
}

export type Probe = { dims: string | null; duration: string | null };

/** Reads size and length from the file in the browser, so the record has them without a server. */
export function probeMedia(file: File): Promise<Probe> {
  return new Promise((resolve) => {
    const none = { dims: null, duration: null };
    if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) return resolve(none);
    const url = URL.createObjectURL(file);
    const done = (p: Probe) => {
      URL.revokeObjectURL(url);
      resolve(p);
    };
    const timer = setTimeout(() => done(none), 4000);
    if (file.type.startsWith('image/')) {
      const img = new Image();
      img.onload = () => {
        clearTimeout(timer);
        done({ dims: `${img.naturalWidth} × ${img.naturalHeight} px`, duration: null });
      };
      img.onerror = () => {
        clearTimeout(timer);
        done(none);
      };
      img.src = url;
    } else {
      const v = document.createElement('video');
      v.preload = 'metadata';
      v.onloadedmetadata = () => {
        clearTimeout(timer);
        const s = Math.round(v.duration || 0);
        done({
          dims: v.videoWidth ? `${v.videoWidth} × ${v.videoHeight}` : null,
          duration: s > 0 && s < 6000 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : null,
        });
      };
      v.onerror = () => {
        clearTimeout(timer);
        done(none);
      };
      v.src = url;
    }
  });
}

/** A brand-new asset in a folder. Returns the asset id. */
export async function uploadNewAsset(file: File, folderId: string, onProgress: (f: number) => void): Promise<string> {
  const probe = await probeMedia(file);
  const session = await fetch('/api/media/upload-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: file.name, mimeType: file.type, size: file.size, folderId }),
  });
  if (!session.ok) throw new Error(await errorOf(session, 'تعذّر بدء الرفع.'));
  const { sessionUrl } = (await session.json()) as { sessionUrl: string };
  const fileId = await sendToDrive(sessionUrl, file, onProgress);
  const done = await fetch('/api/media/complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileId, folderId, dims: probe.dims, duration: probe.duration }),
  });
  if (!done.ok) throw new Error(await errorOf(done, 'تعذّر تسجيل الملف.'));
  return ((await done.json()) as { id: string }).id;
}

/** A new version of an existing asset. Returns the version number it became (the studio records it). */
export async function uploadNewVersion(
  assetId: string,
  file: File,
  note: string,
  onProgress: (f: number) => void,
): Promise<number> {
  const session = await fetch(`/api/media/${assetId}/version`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: file.name, mimeType: file.type, size: file.size }),
  });
  if (!session.ok) throw new Error(await errorOf(session, 'تعذّر بدء الرفع.'));
  const { sessionUrl } = (await session.json()) as { sessionUrl: string };
  const fileId = await sendToDrive(sessionUrl, file, onProgress);
  const done = await fetch(`/api/media/${assetId}/version/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileId, note }),
  });
  if (!done.ok) throw new Error(await errorOf(done, 'تعذّر تسجيل الإصدار.'));
  return ((await done.json()) as { version: number }).version;
}

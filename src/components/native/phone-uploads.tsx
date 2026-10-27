'use client';
// Library uploads sent by the Android application in the background (MVP_draft.md 64.5; Android_Build_Plan.md A7).
// - startLibraryUpload: opens the Drive session through the site as a browser upload does (the site checks the folder's
//   «إنشاء» right), hands the held file and the session to the application, and keeps what the page needs to register
//   it on this phone.
// - PhoneUploads, mounted in the shell: registers each upload once it has arrived (/api/media/complete, then the work it
//   goes to, if any), whichever page is open and also at the next opening, and tells the library to read again.
// - useNativeUploads: the application's list, for the library's «جارٍ الرفع».
import { useEffect, useState } from 'react';
import type { NativeHeldFile } from '@/lib/native';
import { heldUrl, readMeta, uploadForget, uploadStart, uploadStatus, UPLOADS_KEY, type NativeUpload, type UploadMeta } from '@/lib/native/held';
import { supabase } from '@/lib/supabase/client';
import { useNativeFeature } from './use-native';

export const MEDIA_CHANGED = 'commshub:media-changed';

const metas = (): Record<string, UploadMeta> => {
  try {
    return readMeta(localStorage.getItem(UPLOADS_KEY));
  } catch {
    return {};
  }
};
const saveMetas = (m: Record<string, UploadMeta>) => {
  try {
    localStorage.setItem(UPLOADS_KEY, JSON.stringify(m));
  } catch {
    // without it the upload still arrives; registering it waits for a page that has it
  }
};

/** Size and length of a held picture or video, read by the page from the application's copy, as a browser upload does. */
function probe(h: NativeHeldFile): Promise<{ dims: string | null; duration: string | null }> {
  return new Promise((resolve) => {
    const none = { dims: null, duration: null };
    const t = setTimeout(() => resolve(none), 4000);
    if (h.type.startsWith('image/')) {
      const img = new Image();
      img.onload = () => (clearTimeout(t), resolve({ dims: `${img.naturalWidth} × ${img.naturalHeight} px`, duration: null }));
      img.onerror = () => (clearTimeout(t), resolve(none));
      img.src = heldUrl(h);
    } else if (h.type.startsWith('video/')) {
      const v = document.createElement('video');
      v.preload = 'metadata';
      v.onloadedmetadata = () => {
        clearTimeout(t);
        const s = Math.round(v.duration || 0);
        resolve({ dims: v.videoWidth ? `${v.videoWidth} × ${v.videoHeight}` : null, duration: s > 0 && s < 6000 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : null });
      };
      v.onerror = () => (clearTimeout(t), resolve(none));
      v.src = heldUrl(h);
    } else {
      clearTimeout(t);
      resolve(none);
    }
  });
}

/** Starts a background upload of a held file into a library folder (and, when given, links it to a work). */
export async function startLibraryUpload(h: NativeHeldFile, folderId: string, work: string | null = null): Promise<string> {
  const p = await probe(h);
  const session = await fetch('/api/media/upload-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: h.name, mimeType: h.type, size: h.size, folderId }),
  });
  if (!session.ok) throw new Error(((await session.json().catch(() => null)) as { error?: string } | null)?.error ?? 'تعذّر بدء الرفع.');
  const { sessionUrl } = (await session.json()) as { sessionUrl: string };
  const id = await uploadStart(h.token, sessionUrl);
  if (!id) throw new Error('لم يقبل التطبيق الرفع. حاول مرة أخرى.');
  saveMetas({ ...metas(), [id]: { folderId, name: h.name, dims: p.dims, duration: p.duration, work } });
  window.dispatchEvent(new Event(MEDIA_CHANGED));
  return id;
}

/** The application's uploads, read every two seconds while one is under way. */
export function useNativeUploads(): NativeUpload[] {
  const can = useNativeFeature('upload');
  const [list, setList] = useState<NativeUpload[]>([]);
  useEffect(() => {
    if (!can) return;
    let live = true;
    let t: ReturnType<typeof setTimeout> | undefined;
    const read = async () => {
      const now = await uploadStatus();
      if (!live) return;
      setList(now);
      t = setTimeout(read, now.some((u) => u.state === 'queued' || u.state === 'sending') ? 2000 : 8000);
    };
    void read();
    const again = () => void read();
    window.addEventListener(MEDIA_CHANGED, again);
    return () => {
      live = false;
      clearTimeout(t);
      window.removeEventListener(MEDIA_CHANGED, again);
    };
  }, [can]);
  return list;
}

/** The uploads being registered now: the list is read again meanwhile, and each is registered once. */
const registering = new Set<string>();

/** Registers what has arrived, once: the library record, then the work it goes to; then the application forgets it. */
export function PhoneUploads() {
  const list = useNativeUploads();
  useEffect(() => {
    const m = metas();
    const arrived = list.filter((u) => u.state === 'sent' && u.fileId && m[u.id] && !registering.has(u.id));
    if (!arrived.length) return;
    for (const u of arrived) registering.add(u.id);
    void (async () => {
      for (const u of arrived) {
        const meta = m[u.id];
        const done = await fetch('/api/media/complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileId: u.fileId, folderId: meta.folderId, dims: meta.dims, duration: meta.duration }),
        }).catch(() => null);
        if (!done?.ok) {
          // tried again at the next reading of the list
          registering.delete(u.id);
          continue;
        }
        const asset = ((await done.json().catch(() => null)) as { id?: string } | null)?.id;
        if (asset && meta.work) await supabase().rpc('work_asset_link', { p_work: meta.work, p_asset: asset, p_add: true });
        await uploadForget(u.id);
        const rest = metas();
        delete rest[u.id];
        saveMetas(rest);
        window.dispatchEvent(new Event(MEDIA_CHANGED));
      }
    })();
  }, [list]);
  return null;
}

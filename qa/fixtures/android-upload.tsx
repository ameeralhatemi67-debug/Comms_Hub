// The camera, files shared in, and uploads in the background (src/lib/native/held.ts,
// src/components/native/phone-uploads.tsx; MVP_draft.md 64.5), on a fixture page for qa/android-upload.cjs. The page's
// own functions are put on window.__qa for the check to call, and PhoneUploads registers what arrives, as the shell does.
import { createRoot } from 'react-dom/client';
import { capture, heldUrl, takeIncoming, uploadStart, uploadStatus } from '../../src/lib/native/held';
import type { NativeHeldFile } from '../../src/lib/native';
import { PhoneUploads, startLibraryUpload } from '../../src/components/native/phone-uploads';

async function sha256(buf: ArrayBuffer): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

(window as unknown as { __qa: unknown }).__qa = {
  capture,
  incoming: takeIncoming,
  status: uploadStatus,
  startRaw: uploadStart,
  start: (h: NativeHeldFile, folder: string, work: string | null) => startLibraryUpload(h, folder, work).then((id) => ({ id }), (e: Error) => ({ error: e.message })),
  /** The held file as the page reads it: the status, the headers, and the SHA-256 of the bytes, whole or a range. */
  read: async (h: NativeHeldFile, range?: string) => {
    const res = await fetch(heldUrl(h), range ? { headers: { Range: range } } : undefined);
    return { status: res.status, type: res.headers.get('content-type'), contentRange: res.headers.get('content-range'), sha: await sha256(await res.arrayBuffer()) };
  },
};

createRoot(document.getElementById('root')!).render(
  <main dir="rtl" style={{ padding: 16 }}>
    <h1 id="where">{location.pathname}</h1>
    <PhoneUploads />
  </main>,
);

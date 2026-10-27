// Files the Android application holds for the page (MVP_draft.md 64.5; Android_Build_Plan.md A7): a photo or a video
// taken with «تصوير», or files shared into the application from another one («استلام ملفات»). The application keeps
// each in its own folder and names it by a token; the page reads it at /__app/file/<token> on its own address, which
// the application answers itself and the site never serves, so no file's bytes cross the bridge. A library upload of a
// held file is sent by the application in the background (upload), through the same Drive session the page opens, and
// the page registers it once it has arrived. In a browser none of this exists. Plain TypeScript, tested in
// tests/native.test.mjs.
import { native, type NativeHeldFile } from './index.ts';

/** The path the application answers with a held file. Reserved: no page or route of the site starts with it. */
export const HELD_PATH = '/__app/file/';
const TOKEN = /^[0-9a-f]{64}$/;

/** A held file as the application describes it, or null for anything else. */
export function readHeld(v: unknown): NativeHeldFile | null {
  if (!v || typeof v !== 'object') return null;
  const h = v as Partial<NativeHeldFile>;
  if (typeof h.token !== 'string' || !TOKEN.test(h.token)) return null;
  if (typeof h.name !== 'string' || !h.name || h.name.length > 200 || /[\u0000-\u001f\u007f/\\]/.test(h.name)) return null;
  if (typeof h.size !== 'number' || !Number.isInteger(h.size) || h.size < 0) return null;
  if (typeof h.type !== 'string' || h.type.length > 200) return null;
  return { token: h.token, name: h.name, size: h.size, type: h.type || 'application/octet-stream' };
}

export const heldUrl = (h: Pick<NativeHeldFile, 'token'>) => `${HELD_PATH}${h.token}`;

/** «تصوير»: the phone's camera; the photo or video it took, or null when the person came back without one. */
export async function capture(kind: 'photo' | 'video'): Promise<NativeHeldFile | null> {
  const n = native();
  if (!n.has('capture')) return null;
  try {
    return readHeld(await n.raw!.capture!.take!(kind));
  } catch {
    return null;
  }
}

/** The files shared into the application that wait for «استلام ملفات»; asking hands them over once. */
export async function takeIncoming(): Promise<NativeHeldFile[]> {
  const n = native();
  if (!n.has('incoming')) return [];
  try {
    const list = await n.raw!.incoming!.take!();
    return Array.isArray(list) ? list.map(readHeld).filter((h): h is NativeHeldFile => !!h) : [];
  } catch {
    return [];
  }
}

/** A held file as a File the page's own uploads take (mail and messaging attachments, up to 25 MB). */
export async function heldFile(h: NativeHeldFile): Promise<File> {
  const res = await fetch(heldUrl(h));
  if (!res.ok) throw new Error('تعذّرت قراءة الملف من الهاتف.');
  return new File([await res.blob()], h.name, { type: h.type });
}

// --- uploads in the background -------------------------------------------------------------------------------

export type UploadState = 'queued' | 'sending' | 'sent' | 'failed';
export type NativeUpload = { id: string; token: string; name: string; size: number; done: number; state: UploadState; fileId: string | null; error: string | null };

const STATES: readonly UploadState[] = ['queued', 'sending', 'sent', 'failed'];

/** The application's list of uploads, read in its shape only. */
export function readUploads(v: unknown): NativeUpload[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((x) => {
    if (!x || typeof x !== 'object') return [];
    const u = x as Partial<NativeUpload>;
    if (typeof u.id !== 'string' || !/^[0-9a-f]{32}$/.test(u.id) || typeof u.token !== 'string' || !TOKEN.test(u.token)) return [];
    if (typeof u.name !== 'string' || typeof u.size !== 'number' || typeof u.done !== 'number' || !STATES.includes(u.state as UploadState)) return [];
    const fileId = typeof u.fileId === 'string' && /^[\w-]{10,200}$/.test(u.fileId) ? u.fileId : null;
    return [{ id: u.id, token: u.token, name: u.name, size: u.size, done: Math.min(u.done, u.size), state: u.state as UploadState, fileId, error: typeof u.error === 'string' ? u.error : null }];
  });
}

/** Hands a held file and its open Drive session to the application; the upload's id, or null when refused. */
export async function uploadStart(token: string, session: string): Promise<string | null> {
  const n = native();
  if (!n.has('upload')) return null;
  try {
    const id = await n.raw!.upload!.start!({ token, session });
    return typeof id === 'string' && /^[0-9a-f]{32}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

export async function uploadStatus(): Promise<NativeUpload[]> {
  const n = native();
  if (!n.has('upload')) return [];
  try {
    return readUploads(await n.raw!.upload!.status!());
  } catch {
    return [];
  }
}

/** Stops an upload under way, or forgets one that arrived and was registered. */
export async function uploadForget(id: string): Promise<boolean> {
  const n = native();
  if (!n.has('upload')) return false;
  try {
    return (await n.raw!.upload!.cancel!(id)) === true;
  } catch {
    return false;
  }
}

/**
 * What the page needs to register an upload once it has arrived, kept on this phone beside the application's list:
 * the folder, what the page read of the file, and the work it goes to, if any.
 */
export type UploadMeta = { folderId: string; name: string; dims: string | null; duration: string | null; work: string | null };
export const UPLOADS_KEY = 'commshub.uploads';

export function readMeta(raw: string | null): Record<string, UploadMeta> {
  try {
    const v = JSON.parse(raw ?? '{}') as Record<string, Partial<UploadMeta>>;
    const out: Record<string, UploadMeta> = {};
    for (const [id, m] of Object.entries(v && typeof v === 'object' ? v : {})) {
      if (!/^[0-9a-f]{32}$/.test(id) || !m || typeof m.folderId !== 'string' || typeof m.name !== 'string') continue;
      out[id] = { folderId: m.folderId, name: m.name, dims: m.dims ?? null, duration: m.duration ?? null, work: typeof m.work === 'string' ? m.work : null };
    }
    return out;
  } catch {
    return {};
  }
}

/** What the person sees of an upload: its share done, or why it stopped. */
export function uploadLine(u: NativeUpload): string {
  if (u.state === 'failed') return u.error === 'SESSION' ? 'انتهت جلسة الرفع. أعد الإرسال.' : 'توقف الرفع. أعد الإرسال.';
  if (u.state === 'sent') return 'وصل الملف، جارٍ تسجيله في المكتبة…';
  if (u.state === 'queued') return 'ينتظر الرفع…';
  return `جارٍ الرفع ${u.size ? Math.floor((u.done / u.size) * 100) : 0}٪`;
}

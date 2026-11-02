// What «ورقة الكتابة» asks of the site: versions and exports through `src/app/api/writing/`, and the draft, kept in this browser every
// few seconds and in a private Drive file about once a minute (Writing_Build_Plan.md W-7). The server decides everything;
// this is only the calls.
import { checkDoc, type Doc } from '@/lib/writing/doc';

const base = (work: string) => `/api/writing/${encodeURIComponent(work)}`;

/** `base` is the version it was written on, kept by this browser. The private Drive file holds the main text alone. */
export type Draft = { at: string; base?: number; tabs: Record<string, Doc | string> };
type Result<T> = ({ ok: true } & T) | { ok: false; error: string };

async function send<T>(url: string, init: RequestInit): Promise<Result<T>> {
  try {
    const r = await fetch(url, init);
    const body = (await r.json().catch(() => ({}))) as T & { error?: string };
    return r.ok ? ({ ok: true, ...body } as Result<T>) : { ok: false, error: body.error ?? 'تعذّر الحفظ. المسودة باقية عندك.' };
  } catch {
    return { ok: false, error: 'تعذّر الوصول إلى الخادم. المسودة باقية عندك.' };
  }
}
const json = (method: string, body: unknown): RequestInit => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

export const saveVersion = (work: string, doc: unknown, note: string) => send<{ n: number; reopened: boolean }>(`${base(work)}/save`, json('POST', { doc, note }));

/** The master of a version, or null when Drive cannot give it: the page then falls back on the plain copy. */
export async function loadVersion(work: string, n: number): Promise<Doc | null> {
  try {
    const r = await fetch(`${base(work)}/doc?n=${n}`, { cache: 'no-store' });
    if (!r.ok) return null;
    const c = checkDoc(((await r.json()) as { doc?: unknown }).doc);
    return c.ok ? c.doc : null;
  } catch {
    return null;
  }
}

const key = (work: string, me: string) => `comms-hub:draft:${me}:${work}`;

export function readLocalDraft(work: string, me: string): Draft | null {
  try {
    const raw = localStorage.getItem(key(work, me));
    return raw ? (JSON.parse(raw) as Draft) : null;
  } catch {
    return null;
  }
}

export function writeLocalDraft(work: string, me: string, draft: Draft | null) {
  try {
    if (draft) localStorage.setItem(key(work, me), JSON.stringify(draft));
    else localStorage.removeItem(key(work, me));
  } catch {
    // Private window or full storage: the private Drive file still holds the draft.
  }
}

export async function readRemoteDraft(work: string): Promise<Draft | null> {
  try {
    const r = await fetch(`${base(work)}/draft`, { cache: 'no-store' });
    if (!r.ok) return null;
    const b = (await r.json()) as { doc?: Doc | null; updated_at?: string | null };
    return b.doc && b.updated_at ? { at: b.updated_at, tabs: { main: b.doc } } : null;
  } catch {
    return null;
  }
}

/** Only a small request survives the page closing, and a long draft is safe in this browser meanwhile. */
export function writeRemoteDraft(work: string, doc: Doc) {
  const init = json('PUT', { doc });
  return send<object>(`${base(work)}/draft`, { ...init, keepalive: String(init.body).length < 60000 });
}

/** The site's server takes about 4 MB in one request. Library uploads go straight to Drive; these two pass through it. */
const ONE_REQUEST = 4 * 1024 * 1024;

export const uploadWord = async (work: string, n: number, blob: Blob) =>
  blob.size > ONE_REQUEST ? ({ ok: false, error: 'ملف Word أكبر مما يُرفع من الصفحة: قلّل الصور أو حجمها.' } as const) : send<object>(`${base(work)}/export?n=${n}`, { method: 'POST', body: blob });
export const makePdf = (work: string, n: number) => send<object>(`${base(work)}/pdf?n=${n}`, { method: 'POST' });
export const fileUrl = (work: string, kind: 'docx' | 'pdf' | 'txt') => `${base(work)}/file?kind=${kind}`;

/** A larger picture is redrawn smaller here, before it leaves the device. */
async function fitted(file: File) {
  if (file.size <= ONE_REQUEST) return file;
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 2400 / Math.max(bmp.width, bmp.height));
  const canvas = new OffscreenCanvas(Math.round(bmp.width * scale), Math.round(bmp.height * scale));
  canvas.getContext('2d')?.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.85 });
  return new File([blob], `${file.name.replace(/\.[^.]+$/, '')}.jpg`, { type: 'image/jpeg' });
}

export async function uploadImage(work: string, file: File) {
  const form = new FormData();
  form.append('file', await fitted(file).catch(() => file));
  return send<{ id: string }>(`${base(work)}/image`, { method: 'POST', body: form });
}

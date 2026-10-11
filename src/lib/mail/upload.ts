'use client';
// A file attached to mail or messaging: a Drive session through the Hub, the bytes
// straight to Google, then the Hub checks the file in Drive and registers it.
import { sendToDrive } from '../media/upload';
import { MAIL_ATTACH_BYTES } from './rules';

export type UploadedFile = { id: string; name: string; size_bytes: number; mime_type: string };

async function errorOf(res: Response, fallback: string) {
  return ((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? fallback;
}

export async function uploadAttachment(file: File, onProgress: (f: number) => void): Promise<UploadedFile> {
  if (file.size > MAIL_ATTACH_BYTES) throw new Error('المرفقات حتى 25 MB. للملفات الأكبر أضفها إلى مكتبة الوسائط وشاركها مرجعاً.');
  const session = await fetch('/api/mail/upload-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: file.name, mimeType: file.type || 'application/octet-stream', size: file.size }),
  });
  if (!session.ok) throw new Error(await errorOf(session, 'تعذّر بدء الرفع.'));
  const { sessionUrl } = (await session.json()) as { sessionUrl: string };
  const fileId = await sendToDrive(sessionUrl, file, onProgress);
  const done = await fetch('/api/mail/upload-complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileId }),
  });
  if (!done.ok) throw new Error(await errorOf(done, 'تعذّر تسجيل المرفق.'));
  const j = (await done.json()) as { id: string; name: string; size: number; mime: string };
  return { id: j.id, name: j.name, size_bytes: j.size, mime_type: j.mime };
}

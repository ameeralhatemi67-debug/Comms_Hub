import { StorageError, storageFor } from '@/lib/storage';
import { guard, fail } from '@/lib/drive/guard';
import { mediaKind } from '@/lib/drive/media';
import { readMailEnv } from '@/lib/mail/gmail';
import { serverClient } from '@/lib/supabase/server';
import { MAIL_ATTACH_BYTES } from '@/lib/mail/rules';

// Step 2 of a mail attachment: the server checks the file in Drive (made for this
// person, as a mail file, in the Hub's folder, an accepted type and size) and only
// then registers it. The browser's word is never taken for which file it is.
export async function POST(request: Request) {
  const g = await guard(request, { mutating: true, page: 'mail' });
  if (!g.ok) return g.response;
  const env = readMailEnv();
  if (!env.key) return fail(503, 'البريد غير مهيأ على الخادم بعد.');

  const body = (await request.json().catch(() => null)) as { fileId?: unknown } | null;
  if (!body || typeof body.fileId !== 'string' || !/^[\w-]{10,100}$/.test(body.fileId)) return fail(400, 'معرّف الملف غير صالح.');

  try {
    const drive = storageFor('mail');
    const info = await drive.info(body.fileId);
    const size = Number(info.size ?? 0);
    if (
      info.trashed ||
      !info.parents?.includes(await drive.rootFolder()) ||
      info.appProperties?.uploadedBy !== g.account.email ||
      info.appProperties?.assetId !== 'mail' ||
      !mediaKind(info.mimeType) ||
      !(size > 0 && size <= MAIL_ATTACH_BYTES)
    )
      return fail(422, 'الملف غير مقبول.');
    const supabase = await serverClient();
    const { data, error } = await supabase.rpc('mail_register_file', {
      p_key: env.key,
      p_drive: info.id,
      p_name: info.name,
      p_mime: info.mimeType,
      p_size: size,
      p_by: g.account.email,
    });
    if (error || !data) return fail(500, 'تعذّر تسجيل المرفق.');
    return Response.json({ id: data, name: info.name, size, mime: info.mimeType }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return fail(e instanceof StorageError && e.status === 404 ? 404 : 502, 'تعذّر التحقق من الملف في Google Drive.');
  }
}

import { DriveError, driveConfigured, getDrive } from '@/lib/drive/google';
import { guard, fail } from '@/lib/drive/guard';
import { MAX_UPLOAD_BYTES, cleanName, mediaKind } from '@/lib/drive/media';

// Step 1 of an upload: validate, then open a resumable session with Drive. The
// browser then sends the file itself, in chunks, straight to Google. The file never
// passes through this server, so its size is not limited by the host's body limit.
export async function POST(request: Request) {
  const g = await guard(request, { mutating: true, page: 'media', upload: true });
  if (!g.ok) return g.response;
  if (!driveConfigured()) return fail(503, 'لم يُربط Google Drive بعد.');

  const body = (await request.json().catch(() => null)) as { name?: unknown; mimeType?: unknown; size?: unknown } | null;
  if (!body || typeof body.name !== 'string' || typeof body.mimeType !== 'string' || typeof body.size !== 'number')
    return fail(400, 'بيانات الملف ناقصة.');
  if (!Number.isInteger(body.size) || body.size < 1) return fail(400, 'الملف فارغ.');
  if (body.size > MAX_UPLOAD_BYTES) return fail(413, 'الملف أكبر من الحد المسموح (5 غيغابايت).');
  if (!mediaKind(body.mimeType)) return fail(415, 'نوع الملف غير مدعوم.');

  try {
    const sessionUrl = await getDrive().startUpload({
      name: cleanName(body.name),
      mimeType: body.mimeType,
      size: body.size,
      origin: new URL(request.url).origin,
      uploadedBy: g.account.email,
    });
    return Response.json({ sessionUrl }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return fail(e instanceof DriveError && e.status === 503 ? 503 : 502, 'تعذّر بدء الرفع إلى Google Drive.');
  }
}

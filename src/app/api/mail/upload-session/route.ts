import { DriveError, driveConfigured, getDrive } from '@/lib/drive/google';
import { guard, fail } from '@/lib/drive/guard';
import { cleanName, mediaKind } from '@/lib/drive/media';
import { MAIL_ATTACH_BYTES } from '@/lib/mail/rules';

// Step 1 of a mail attachment: open a resumable Drive session in the Hub's folder,
// marked as a mail file of this person. The browser sends the bytes to Google.
export async function POST(request: Request) {
  const g = await guard(request, { mutating: true, page: 'mail' });
  if (!g.ok) return g.response;
  if (!driveConfigured()) return fail(503, 'لم يُربط Google Drive بعد، فلا تُرفق ملفات من الجهاز.');

  const body = (await request.json().catch(() => null)) as { name?: unknown; mimeType?: unknown; size?: unknown } | null;
  if (!body || typeof body.name !== 'string' || typeof body.mimeType !== 'string' || typeof body.size !== 'number')
    return fail(400, 'بيانات الملف ناقصة.');
  if (!Number.isInteger(body.size) || body.size < 1) return fail(400, 'الملف فارغ.');
  if (body.size > MAIL_ATTACH_BYTES) return fail(413, 'مرفقات البريد حتى 25 MB. للملفات الأكبر أضفها إلى مكتبة الوسائط وأرسلها مرجعاً.');
  if (!mediaKind(body.mimeType)) return fail(415, 'نوع الملف غير مدعوم.');

  try {
    const sessionUrl = await getDrive().startUpload({
      name: cleanName(body.name),
      mimeType: body.mimeType,
      size: body.size,
      origin: new URL(request.url).origin,
      uploadedBy: g.account.email,
      assetId: 'mail',
    });
    return Response.json({ sessionUrl }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return fail(e instanceof DriveError && e.status === 503 ? 503 : 502, 'تعذّر بدء الرفع إلى Google Drive.');
  }
}

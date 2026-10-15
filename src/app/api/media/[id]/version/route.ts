import { StorageError, storageConfigured, storageFor } from '@/lib/storage';
import { guard, fail } from '@/lib/drive/guard';
import { MAX_UPLOAD_BYTES, cleanName, mediaKind } from '@/lib/drive/media';
import { driveParentOf, isUuid } from '@/lib/drive/parents';
import { serverClient } from '@/lib/supabase/server';
import { overLimitText, uploadLimit } from '@/lib/integrations/limits';

// Step 1 of a new version: the same resumable upload as a new file, in the asset's own
// Drive folder. Earlier versions stay in Drive untouched.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard(request, { mutating: true, page: 'media' });
  if (!g.ok) return g.response;
  if (!(await storageConfigured('library'))) return fail(503, 'لم يُربط Google Drive بعد.');
  const { id } = await params;
  if (!isUuid(id)) return fail(404, 'غير موجود.');

  const body = (await request.json().catch(() => null)) as { name?: unknown; mimeType?: unknown; size?: unknown } | null;
  if (!body || typeof body.name !== 'string' || typeof body.mimeType !== 'string' || typeof body.size !== 'number')
    return fail(400, 'بيانات الملف ناقصة.');
  if (!Number.isInteger(body.size) || body.size < 1) return fail(400, 'الملف فارغ.');
  if (body.size > MAX_UPLOAD_BYTES) return fail(413, 'الملف أكبر من الحد المسموح (5 غيغابايت).');
  if (!mediaKind(body.mimeType)) return fail(415, 'نوع الملف غير مدعوم.');

  const supabase = await serverClient();
  // The limit the administrator set in «الإعدادات» (Step S1), under the 5 GB ceiling.
  const limit = await uploadLimit(supabase);
  if (body.size > limit) return fail(413, overLimitText(limit));
  const { data: asset } = await supabase.from('media_files').select('folder_id, stage').eq('id', id).maybeSingle();
  if (!asset) return fail(404, 'غير موجود.');
  if (asset.stage === 'published') return fail(409, 'الأصل المنشور لا يقبل إصداراً جديداً.');
  const { data: allowed } = await supabase.rpc('media_can_create', { p_folder: asset.folder_id });
  if (allowed !== true) return fail(403, 'رفع إصدار جديد يحتاج صلاحية «إنشاء»، وألا يكون المجلد مقفلاً.');

  try {
    const drive = storageFor('library');
    const sessionUrl = await drive.startUpload({
      name: cleanName(body.name),
      mimeType: body.mimeType,
      size: body.size,
      origin: new URL(request.url).origin,
      uploadedBy: g.account.email,
      parentId: await driveParentOf(supabase, drive, asset.folder_id),
      assetId: id,
    });
    return Response.json({ sessionUrl }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return fail(e instanceof StorageError && e.status === 503 ? 503 : 502, 'تعذّر بدء الرفع إلى Google Drive.');
  }
}

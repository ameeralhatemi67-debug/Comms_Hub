import { DriveError, getDrive } from '@/lib/drive/google';
import { guard, fail } from '@/lib/drive/guard';
import { MAX_UPLOAD_BYTES, mediaKind } from '@/lib/drive/media';
import { driveParentOf, isUuid } from '@/lib/drive/parents';
import { dbErrorText } from '@/lib/media/rules';
import { serverClient } from '@/lib/supabase/server';

// Step 3 of a new version: verify the Drive file, then register it. The database
// trigger makes it the asset's current file and returns the asset to review when it
// was already reviewed or approved (the approved version stays recorded).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard(request, { mutating: true, page: 'media' });
  if (!g.ok) return g.response;
  const { id } = await params;
  if (!isUuid(id)) return fail(404, 'غير موجود.');

  const body = (await request.json().catch(() => null)) as { fileId?: unknown; note?: unknown } | null;
  if (!body || typeof body.fileId !== 'string' || !/^[\w-]{10,100}$/.test(body.fileId)) return fail(400, 'معرّف الملف غير صالح.');
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 200) : null;

  try {
    const supabase = await serverClient();
    const drive = getDrive();
    const { data: asset } = await supabase.from('media_files').select('folder_id, current_version').eq('id', id).maybeSingle();
    if (!asset) return fail(404, 'غير موجود.');

    const info = await drive.fileInfo(body.fileId);
    const size = Number(info.size ?? 0);
    const parent = await driveParentOf(supabase, drive, asset.folder_id);
    if (
      info.trashed ||
      !info.parents?.includes(parent) ||
      info.appProperties?.uploadedBy !== g.account.email ||
      info.appProperties?.assetId !== id ||
      !mediaKind(info.mimeType) ||
      !(size > 0 && size <= MAX_UPLOAD_BYTES)
    )
      return fail(422, 'الملف غير مقبول.');

    const { error } = await supabase.from('media_versions').insert({
      asset_id: id,
      version: asset.current_version + 1,
      drive_file_id: info.id,
      size_bytes: size,
      mime_type: info.mimeType,
      uploaded_by: g.account.email,
      note,
    });
    if (error) return fail(403, dbErrorText(error.message));
    return Response.json({ ok: true, version: asset.current_version + 1 });
  } catch (e) {
    return fail(e instanceof DriveError && e.status === 404 ? 404 : 502, 'تعذّر التحقق من الملف في Google Drive.');
  }
}

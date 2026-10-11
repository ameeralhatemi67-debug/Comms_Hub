import { DriveError, getDrive } from '@/lib/drive/google';
import { guard, fail } from '@/lib/drive/guard';
import { MAX_UPLOAD_BYTES, mediaKind } from '@/lib/drive/media';
import { driveParentOf, isUuid } from '@/lib/drive/parents';
import { dbErrorText } from '@/lib/media/rules';
import { serverClient } from '@/lib/supabase/server';

// Step 3 of an upload: the browser says "this Drive file is done". The server does not
// take its word for it: it asks Drive, and registers the file only if it is in the
// folder's Drive folder, was created for this very person, and is an accepted type.
// The database then applies its own rule (create level, folder not locked).
export async function POST(request: Request) {
  const g = await guard(request, { mutating: true, page: 'media' });
  if (!g.ok) return g.response;

  const body = (await request.json().catch(() => null)) as
    | { fileId?: unknown; folderId?: unknown; dims?: unknown; duration?: unknown }
    | null;
  if (!body || typeof body.fileId !== 'string' || !/^[\w-]{10,100}$/.test(body.fileId) || !isUuid(body.folderId))
    return fail(400, 'معرّف الملف غير صالح.');
  const dims = typeof body.dims === 'string' ? body.dims.slice(0, 60) : null;
  const duration = typeof body.duration === 'string' && /^\d{1,2}:\d{2}$/.test(body.duration) ? body.duration : null;

  try {
    const supabase = await serverClient();
    const drive = getDrive();
    const info = await drive.fileInfo(body.fileId);
    const size = Number(info.size ?? 0);
    const kind = mediaKind(info.mimeType);
    const parent = await driveParentOf(supabase, drive, body.folderId);
    if (
      info.trashed ||
      !info.parents?.includes(parent) ||
      info.appProperties?.uploadedBy !== g.account.email ||
      !kind ||
      !(size > 0 && size <= MAX_UPLOAD_BYTES)
    )
      return fail(422, 'الملف غير مقبول.');

    const { data, error } = await supabase
      .from('media_files')
      .insert({
        drive_file_id: info.id,
        name: info.name,
        mime_type: info.mimeType,
        size_bytes: size,
        kind,
        uploaded_by: g.account.email,
        folder_id: body.folderId,
        dims,
        duration,
      })
      .select('id')
      .single();
    if (error) {
      const existing = await supabase.from('media_files').select('id').eq('drive_file_id', info.id).maybeSingle();
      if (existing.data) return Response.json({ id: existing.data.id });
      return fail(403, dbErrorText(error.message));
    }
    return Response.json({ id: data.id }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return fail(e instanceof DriveError && e.status === 404 ? 404 : 502, 'تعذّر التحقق من الملف في Google Drive.');
  }
}

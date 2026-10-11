import { DriveError, getDrive } from '@/lib/drive/google';
import { guard, fail } from '@/lib/drive/guard';
import { MAX_UPLOAD_BYTES, mediaKind } from '@/lib/drive/media';
import { serverClient } from '@/lib/supabase/server';

// Step 3 of an upload: the browser says "this Drive file is done". The server does
// not take its word for it: it asks Drive, and registers the file only if it is in
// the Hub's folder, was created for this very person, and is an accepted type.
export async function POST(request: Request) {
  const g = await guard(request, { mutating: true, page: 'media', upload: true });
  if (!g.ok) return g.response;

  const body = (await request.json().catch(() => null)) as { fileId?: unknown } | null;
  if (!body || typeof body.fileId !== 'string' || !/^[\w-]{10,100}$/.test(body.fileId))
    return fail(400, 'معرّف الملف غير صالح.');

  try {
    const drive = getDrive();
    const info = await drive.fileInfo(body.fileId);
    const size = Number(info.size ?? 0);
    const kind = mediaKind(info.mimeType);
    if (
      info.trashed ||
      !info.parents?.includes(await drive.rootFolder()) ||
      info.appProperties?.uploadedBy !== g.account.email ||
      !kind ||
      !(size > 0 && size <= MAX_UPLOAD_BYTES)
    )
      return fail(422, 'الملف غير مقبول.');

    const supabase = await serverClient();
    const { data, error } = await supabase
      .from('media_files')
      .insert({
        drive_file_id: info.id,
        name: info.name,
        mime_type: info.mimeType,
        size_bytes: size,
        kind,
        uploaded_by: g.account.email,
      })
      .select('id')
      .single();
    if (error) {
      // Registered already (a retried "complete"): hand back the existing row.
      const existing = await supabase.from('media_files').select('id').eq('drive_file_id', info.id).maybeSingle();
      if (existing.data) return Response.json({ id: existing.data.id });
      return fail(500, 'تعذّر تسجيل الملف.');
    }
    return Response.json({ id: data.id }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return fail(e instanceof DriveError && e.status === 404 ? 404 : 502, 'تعذّر التحقق من الملف في Google Drive.');
  }
}

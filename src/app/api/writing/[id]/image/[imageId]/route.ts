import { guard, fail } from '@/lib/drive/guard';
import { StorageError, openStored } from '@/lib/storage';
import { IMAGE_ID, WORK_ID, fileHeaders } from '@/lib/storage/writing';
import { serverClient } from '@/lib/supabase/server';

// A picture of a document, for anyone who may see the work (row level security on work_images), from wherever its live
// copies are. Its address never changes, so the browser may keep it for a while.
export async function GET(request: Request, { params }: { params: Promise<{ id: string; imageId: string }> }) {
  const g = await guard(request, { page: 'work' });
  if (!g.ok) return g.response;
  const { id, imageId } = await params;
  if (!WORK_ID.test(id) || !IMAGE_ID.test(imageId)) return fail(404, 'غير موجود.');

  const db = await serverClient();
  const { data: row } = await db.from('work_images').select('ref, name, mime_type').eq('id', imageId).eq('work_id', id).maybeSingle();
  if (!row) return fail(404, 'غير موجود.');

  try {
    const upstream = await openStored('library', row.ref, request.headers.get('range'));
    if (!upstream.ok && upstream.status !== 206) return fail(upstream.status === 404 ? 404 : 502, 'تعذّر قراءة الصورة.');
    const headers = fileHeaders(row.mime_type, row.name, 'inline', { 'Cache-Control': 'private, max-age=3600', 'Accept-Ranges': 'bytes' });
    for (const name of ['Content-Length', 'Content-Range']) {
      const value = upstream.headers.get(name);
      if (value) headers.set(name, value);
    }
    return new Response(upstream.body, { status: upstream.status, headers });
  } catch (e) {
    return fail(e instanceof StorageError && e.status === 503 ? 503 : 502, 'تعذّر قراءة الصورة.');
  }
}

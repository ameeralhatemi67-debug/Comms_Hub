import { cleanName } from '@/lib/drive/media';
import { guard, fail } from '@/lib/drive/guard';
import { serverKeyOrNull } from '@/lib/integrations/vault';
import { StorageError, storageConfigured, storageFor } from '@/lib/storage';
import { IMAGE_TYPES, MAX_IMAGE_BYTES, Refused, WORK_ID, ensureFolders, prepare, refusal, sniffImage } from '@/lib/storage/writing';
import { serverClient } from '@/lib/supabase/server';

export const maxDuration = 60;

// A picture from the device, as the field `file` of a form. PNG, JPEG, WebP and GIF only, never SVG, which can carry
// script: the type is what the bytes say, not what the browser claims. 5 MB at most.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard(request, { page: 'work', mutating: true });
  if (!g.ok) return g.response;
  const { id } = await params;
  if (!WORK_ID.test(id)) return fail(404, 'غير موجود.');
  const key = serverKeyOrNull();
  if (!key || !(await storageConfigured('library'))) return fail(503, 'لم يُربط Google Drive بعد.');

  const tooBig = 'الصورة أكبر من 5 ميغابايت.';
  if (Number(request.headers.get('content-length') ?? 0) > MAX_IMAGE_BYTES + 64 * 1024) return fail(413, tooBig);
  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File) || file.size < 1) return fail(400, 'اختر صورة.');
  if (file.size > MAX_IMAGE_BYTES) return fail(413, tooBig);
  if (!IMAGE_TYPES.includes(file.type)) return fail(415, 'الصور PNG أو JPEG أو WebP أو GIF فقط.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = sniffImage(bytes);
  if (!mime) return fail(415, 'الصور PNG أو JPEG أو WebP أو GIF فقط.');

  const db = await serverClient();
  const storage = storageFor('library');
  try {
    const prepared = await prepare(db, id, 'save');
    const docs = await ensureFolders({ db, storage, key }, id, prepared.title, prepared.docs);
    const name = cleanName(file.name);
    const ref = await storage.putSmall({ name, mimeType: mime, bytes, parentId: docs.images_ref, appProperties: { commsHubWork: id } });
    const { data, error } = await db.rpc('work_image_add', { p_key: key, p_work: id, p_ref: ref, p_name: name, p_size: bytes.length, p_mime: mime });
    if (error) {
      await storage.trash(ref).catch(() => undefined);
      return refusal(error.message);
    }
    return Response.json({ id: data, url: `/api/writing/${id}/image/${data}` }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    if (e instanceof Refused) return refusal(e.message);
    return fail(e instanceof StorageError && e.status === 503 ? 503 : 502, 'تعذّر رفع الصورة إلى Google Drive.');
  }
}

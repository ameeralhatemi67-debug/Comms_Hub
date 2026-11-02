import { guard, fail } from '@/lib/drive/guard';
import { serverKeyOrNull } from '@/lib/integrations/vault';
import { StorageError, storageConfigured, storageFor } from '@/lib/storage';
import { MAX_WORD_BYTES, Refused, WORD_MIME, WORK_ID, ensureFolders, isDocx, prepare, readCapped, refusal, workFileName, writeOver } from '@/lib/storage/writing';
import { serverClient } from '@/lib/supabase/server';

export const maxDuration = 60;

// The Word file of version `?n=`, built in the browser and sent as the raw body, into «الحالي» (W-8). Only the latest
// version is accepted: «الحالي» always holds the latest, and an earlier version is rebuilt from its master on request.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard(request, { page: 'work', mutating: true });
  if (!g.ok) return g.response;
  const { id } = await params;
  if (!WORK_ID.test(id)) return fail(404, 'غير موجود.');
  const key = serverKeyOrNull();
  if (!key || !(await storageConfigured('library'))) return fail(503, 'لم يُربط Google Drive بعد.');
  const n = Number(new URL(request.url).searchParams.get('n'));
  if (!Number.isInteger(n) || n < 1) return fail(400, 'حدّد الإصدار.');

  const db = await serverClient();
  const storage = storageFor('library');
  try {
    const prepared = await prepare(db, id, 'export');
    if (prepared.latest !== n) return refusal('EXPORT_STALE');
    const bytes = await readCapped(request, MAX_WORD_BYTES);
    if (!bytes) return fail(413, 'ملف Word أكبر من الحد المسموح.');
    if (!isDocx(bytes)) return fail(415, 'هذا ليس ملف Word.');
    const docs = await ensureFolders({ db, storage, key }, id, prepared.title, prepared.docs);
    const ref = await writeOver(storage, docs.current_ref, docs.word_ref, { name: workFileName(id, prepared.title, 'docx'), mimeType: WORD_MIME, bytes });
    const { error } = await db.rpc('work_doc_export', { p_key: key, p_work: id, p_kind: 'word', p_ref: ref, p_n: n });
    if (error) {
      if (ref !== docs.word_ref) await storage.trash(ref).catch(() => undefined);
      return refusal(error.message);
    }
    return Response.json({ n }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    if (e instanceof Refused) return refusal(e.message);
    return fail(e instanceof StorageError && e.status === 503 ? 503 : 502, 'تعذّر حفظ ملف Word في Google Drive.');
  }
}

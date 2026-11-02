import { guard, fail } from '@/lib/drive/guard';
import { serverKeyOrNull } from '@/lib/integrations/vault';
import { StorageError, storageConfigured, storageFor } from '@/lib/storage';
import { Refused, WORK_ID, prepare, refusal, workFileName, writeOver } from '@/lib/storage/writing';
import { serverClient } from '@/lib/supabase/server';

export const maxDuration = 60;

// The PDF of the latest version: Drive converts the Word file in «الحالي» (W-9), and the PDF goes beside it.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard(request, { page: 'work', mutating: true });
  if (!g.ok) return g.response;
  const { id } = await params;
  if (!WORK_ID.test(id)) return fail(404, 'غير موجود.');
  const key = serverKeyOrNull();
  if (!key || !(await storageConfigured('library'))) return fail(503, 'لم يُربط Google Drive بعد.');

  const db = await serverClient();
  const storage = storageFor('library');
  try {
    const prepared = await prepare(db, id, 'export');
    const docs = prepared.docs;
    if (!docs?.word_ref || docs.word_n !== prepared.latest) return refusal('EXPORT_STALE');
    const n = docs.word_n;
    const pdf = await storage.convertToPdf(await storage.read(docs.word_ref));
    const ref = await writeOver(storage, docs.current_ref, docs.pdf_ref, { name: workFileName(id, prepared.title, 'pdf'), mimeType: 'application/pdf', bytes: pdf });
    const { error } = await db.rpc('work_doc_export', { p_key: key, p_work: id, p_kind: 'pdf', p_ref: ref, p_n: n });
    if (error) {
      if (ref !== docs.pdf_ref) await storage.trash(ref).catch(() => undefined);
      return refusal(error.message);
    }
    return Response.json({ n }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    if (e instanceof Refused) return refusal(e.message);
    if (e instanceof StorageError && e.message === 'PDF_TOO_LARGE') return fail(413, 'الملف أكبر مما يحوّله Google Drive إلى PDF (10 ميغابايت). نزّله بصيغة Word.');
    return fail(e instanceof StorageError && e.status === 503 ? 503 : 502, 'تعذّر تحويل الملف إلى PDF.');
  }
}

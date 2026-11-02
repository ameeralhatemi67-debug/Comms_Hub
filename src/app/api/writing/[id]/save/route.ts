import { guard, fail } from '@/lib/drive/guard';
import { serverKeyOrNull } from '@/lib/integrations/vault';
import { StorageError, storageConfigured, storageFor, trashQuietly } from '@/lib/storage';
import { Refused, WORK_ID, prepare, readCapped, refusal, saveVersion, sha256 } from '@/lib/storage/writing';
import { serverClient } from '@/lib/supabase/server';
import { MAX_DOC_BYTES, checkDoc, docText } from '@/lib/writing/doc';

export const maxDuration = 60;

// A saved version (W-1, W-2): the document is checked here, so nothing but its known nodes is ever stored; its plain
// text goes to the database, its master to «الإصدارات», and the database decides whether the person may save it.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard(request, { page: 'work', mutating: true });
  if (!g.ok) return g.response;
  const { id } = await params;
  if (!WORK_ID.test(id)) return fail(404, 'غير موجود.');
  const key = serverKeyOrNull();
  if (!key || !(await storageConfigured('library'))) return fail(503, 'لم يُربط Google Drive بعد.');

  const raw = await readCapped(request, MAX_DOC_BYTES);
  if (!raw) return fail(413, 'المستند أكبر من الحد المسموح.');
  let body: { doc?: unknown; note?: unknown } | null = null;
  try {
    body = JSON.parse(new TextDecoder().decode(raw));
  } catch {
    body = null;
  }
  if (!body) return fail(400, 'المستند غير صالح.');
  const checked = checkDoc(body.doc);
  if (!checked.ok) return refusal(checked.error);
  const text = docText(checked.doc);
  if (!text) return refusal('TEXT_REQUIRED');
  const note = typeof body.note === 'string' ? body.note : null;
  const json = JSON.stringify(checked.doc);
  const checksum = sha256(json);

  const db = await serverClient();
  try {
    const prepared = await prepare(db, id, 'save');
    // Nothing is uploaded for a save that changes nothing. The database checks this again.
    if (prepared.checksum === checksum) return refusal('NO_CHANGE');
    const saved = await saveVersion(
      { db, storage: storageFor('library'), key, trashAll: (copies, refs) => trashQuietly('library', copies, refs) },
      { id, prepared, json, text, note, checksum },
    );
    return Response.json(saved, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    if (e instanceof Refused) return refusal(e.message);
    return fail(e instanceof StorageError && e.status === 503 ? 503 : 502, 'تعذّر حفظ المستند في Google Drive.');
  }
}

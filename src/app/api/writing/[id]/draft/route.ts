import { guard, fail } from '@/lib/drive/guard';
import { serverKeyOrNull } from '@/lib/integrations/vault';
import { StorageError, readStored, storageConfigured, storageFor } from '@/lib/storage';
import { Refused, WORK_ID, draftName, ensureFolders, prepare, readCapped, refusal, writeOver } from '@/lib/storage/writing';
import { serverClient } from '@/lib/supabase/server';
import { MAX_DOC_BYTES, checkDoc, type Doc } from '@/lib/writing/doc';

// The person's own draft of a work (W-7). Private: row level security gives a person only their own row, an
// administrator included. A draft is not a version, so it leaves no log and no notice.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard(request, { page: 'work' });
  if (!g.ok) return g.response;
  const { id } = await params;
  if (!WORK_ID.test(id)) return fail(404, 'غير موجود.');

  const db = await serverClient();
  const { data: row } = await db.from('work_drafts').select('ref, updated_at').eq('work_id', id).eq('email', g.account.email).maybeSingle();
  let doc: Doc | null = null;
  if (row) {
    try {
      const checked = checkDoc(JSON.parse(new TextDecoder().decode(await readStored('library', row.ref))));
      if (checked.ok) doc = checked.doc;
    } catch {
      doc = null;
    }
  }
  return Response.json({ doc, updated_at: doc ? row?.updated_at : null }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard(request, { page: 'work', mutating: true });
  if (!g.ok) return g.response;
  const { id } = await params;
  if (!WORK_ID.test(id)) return fail(404, 'غير موجود.');
  const key = serverKeyOrNull();
  if (!key || !(await storageConfigured('library'))) return fail(503, 'لم يُربط Google Drive بعد.');

  const raw = await readCapped(request, MAX_DOC_BYTES);
  if (!raw) return fail(413, 'المستند أكبر من الحد المسموح.');
  let body: { doc?: unknown } | null = null;
  try {
    body = JSON.parse(new TextDecoder().decode(raw));
  } catch {
    body = null;
  }
  if (!body) return fail(400, 'المستند غير صالح.');
  const checked = checkDoc(body.doc);
  if (!checked.ok) return refusal(checked.error);

  const db = await serverClient();
  const storage = storageFor('library');
  try {
    const prepared = await prepare(db, id, 'save');
    const docs = await ensureFolders({ db, storage, key }, id, prepared.title, prepared.docs);
    const { data: row } = await db.from('work_drafts').select('ref').eq('work_id', id).eq('email', g.account.email).maybeSingle();
    const ref = await writeOver(storage, docs.drafts_ref, row?.ref, {
      name: draftName(g.account.email),
      mimeType: 'application/json',
      bytes: new TextEncoder().encode(JSON.stringify(checked.doc)),
    });
    const { error } = await db.rpc('work_draft_set', { p_key: key, p_work: id, p_ref: ref });
    if (error) {
      if (ref !== row?.ref) await storage.trash(ref).catch(() => undefined);
      return refusal(error.message);
    }
    return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    if (e instanceof Refused) return refusal(e.message);
    return fail(e instanceof StorageError && e.status === 503 ? 503 : 502, 'تعذّر حفظ المسودة.');
  }
}

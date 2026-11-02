import { guard, fail } from '@/lib/drive/guard';
import { readStored } from '@/lib/storage';
import { WORK_ID } from '@/lib/storage/writing';
import { serverClient } from '@/lib/supabase/server';
import { checkDoc, type Doc } from '@/lib/writing/doc';

// A saved version, for anyone who may see the work (row level security on work_texts). `?n=` names one, and without it
// the latest comes back. `doc` is null for a version with no file, a pruned one, or while the provider does not answer:
// `body` still holds its text (W-2), so the page can always show it.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard(request, { page: 'work' });
  if (!g.ok) return g.response;
  const { id } = await params;
  if (!WORK_ID.test(id)) return fail(404, 'غير موجود.');
  const wanted = Number(new URL(request.url).searchParams.get('n'));

  const db = await serverClient();
  const q = db.from('work_texts').select('n, body, note, author, created_at, master_ref, pruned_at').eq('work_id', id);
  const { data: row } = await (Number.isInteger(wanted) && wanted > 0 ? q.eq('n', wanted) : q.order('n', { ascending: false }).limit(1)).maybeSingle();
  if (!row) return fail(404, 'غير موجود.');

  let doc: Doc | null = null;
  if (row.master_ref && !row.pruned_at) {
    try {
      const checked = checkDoc(JSON.parse(new TextDecoder().decode(await readStored('library', row.master_ref))));
      if (checked.ok) doc = checked.doc;
    } catch {
      doc = null;
    }
  }
  return Response.json(
    { n: row.n, body: row.body, note: row.note, author: row.author, created_at: row.created_at, pruned: Boolean(row.pruned_at), doc },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

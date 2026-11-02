import { guard, fail } from '@/lib/drive/guard';
import { StorageError, openStored } from '@/lib/storage';
import { WORD_MIME, WORK_ID, fileHeaders, refusal, workFileName } from '@/lib/storage/writing';
import { serverClient } from '@/lib/supabase/server';

// A current file of a work (W-8), as a download, for anyone who may see the work (row level security on work_docs).
// The text comes from the database, which always has the latest. A Word or PDF file behind the latest version is
// refused rather than served as if it were current: the page rebuilds it from the version.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard(request, { page: 'work' });
  if (!g.ok) return g.response;
  const { id } = await params;
  if (!WORK_ID.test(id)) return fail(404, 'غير موجود.');
  const kind = new URL(request.url).searchParams.get('kind');
  if (kind !== 'docx' && kind !== 'pdf' && kind !== 'txt') return fail(400, 'نوع الملف غير معروف.');

  const db = await serverClient();
  const { data: work } = await db.from('works').select('title').eq('id', id).maybeSingle();
  if (!work) return fail(404, 'غير موجود.');
  const { data: latest } = await db.from('work_texts').select('n, body').eq('work_id', id).order('n', { ascending: false }).limit(1).maybeSingle();
  if (!latest) return fail(404, 'لا نص محفوظ بعد.');

  if (kind === 'txt') {
    return new Response(latest.body, { headers: fileHeaders('text/plain; charset=utf-8', workFileName(id, work.title, 'txt'), 'attachment') });
  }

  const { data: docs } = await db.from('work_docs').select('word_ref, word_n, pdf_ref, pdf_n').eq('work_id', id).maybeSingle();
  const ref = kind === 'docx' ? docs?.word_ref : docs?.pdf_ref;
  if (!ref) return fail(404, 'لم يُجهَّز هذا الملف بعد.');
  if ((kind === 'docx' ? docs?.word_n : docs?.pdf_n) !== latest.n) return refusal('EXPORT_STALE');

  try {
    const upstream = await openStored('library', ref);
    if (!upstream.ok) return fail(upstream.status === 404 ? 404 : 502, 'تعذّر قراءة الملف.');
    const headers = fileHeaders(kind === 'docx' ? WORD_MIME : 'application/pdf', workFileName(id, work.title, kind), 'attachment');
    const size = upstream.headers.get('Content-Length');
    if (size) headers.set('Content-Length', size);
    return new Response(upstream.body, { headers });
  } catch (e) {
    return fail(e instanceof StorageError && e.status === 503 ? 503 : 502, 'تعذّر قراءة الملف.');
  }
}

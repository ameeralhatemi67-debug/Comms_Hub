import { getDrive } from '@/lib/drive/google';
import { guard, fail } from '@/lib/drive/guard';
import { isAdmin } from '@/lib/access';
import { serverClient } from '@/lib/supabase/server';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Removes a file from the library and moves it to the Drive trash (still recoverable
// from Drive for 30 days). Its uploader or an administrator only; the database
// policy says the same.
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard(request, { mutating: true, page: 'media' });
  if (!g.ok) return g.response;
  const { id } = await params;
  if (!UUID.test(id)) return fail(404, 'غير موجود.');

  const supabase = await serverClient();
  const { data: row } = await supabase
    .from('media_files')
    .select('drive_file_id, uploaded_by')
    .eq('id', id)
    .maybeSingle();
  if (!row) return fail(404, 'غير موجود.');
  if (row.uploaded_by !== g.account.email && !isAdmin(g.account))
    return fail(403, 'يحذف الملف من رفعه أو مسؤول النظام.');

  try {
    await getDrive().trash(row.drive_file_id);
  } catch {
    return fail(502, 'تعذّر نقل الملف إلى سلة Google Drive.');
  }
  const { error } = await supabase.from('media_files').delete().eq('id', id);
  if (error) return fail(500, 'نُقل الملف إلى السلة لكن تعذّر حذف سجله. أعد المحاولة.');
  return Response.json({ ok: true });
}

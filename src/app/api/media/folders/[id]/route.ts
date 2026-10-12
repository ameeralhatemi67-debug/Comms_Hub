import { getDrive } from '@/lib/drive/google';
import { guard, fail } from '@/lib/drive/guard';
import { cleanName } from '@/lib/drive/media';
import { isUuid } from '@/lib/drive/parents';
import { dbErrorText } from '@/lib/media/rules';
import { serverClient } from '@/lib/supabase/server';

// Renames a folder in the Hub and in Drive.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard(request, { mutating: true, page: 'media' });
  if (!g.ok) return g.response;
  const { id } = await params;
  if (!isUuid(id)) return fail(404, 'غير موجود.');

  const body = (await request.json().catch(() => null)) as { name?: unknown } | null;
  const name = typeof body?.name === 'string' ? cleanName(body.name).slice(0, 120) : '';
  if (!name) return fail(400, 'اكتب اسم المجلد.');

  const supabase = await serverClient();
  const { data: before } = await supabase.from('media_folders').select('name, drive_folder_id').eq('id', id).maybeSingle();
  if (!before) return fail(404, 'غير موجود.');
  if (before.name === name) return Response.json({ ok: true });

  const { error } = await supabase.from('media_folders').update({ name }).eq('id', id);
  if (error) return fail(403, dbErrorText(error.message));

  if (before.drive_folder_id) {
    try {
      await getDrive().rename(before.drive_folder_id, name);
    } catch {
      await supabase.rpc('undo_cancel_last');
      return fail(502, 'تعذّر تحديث Google Drive، لم يُحفظ التغيير.');
    }
  }
  return Response.json({ ok: true });
}

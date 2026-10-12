import { getDrive } from '@/lib/drive/google';
import { guard, fail } from '@/lib/drive/guard';
import { serverClient } from '@/lib/supabase/server';
import { syncDrive, touchesDrive, type RestoredRow } from '@/lib/media/drive-sync';
import { undoErrorText } from '@/lib/kit/undo';

// Undo one action. The database decides (the caller's own action, within the hour,
// nothing touched since, the rights still held) and puts the values back; Drive then
// follows names and folders. If Drive refuses, the action is taken forward again so the
// Hub and Drive agree, and it stays offered.
export async function POST(request: Request) {
  const g = await guard(request, { mutating: true, page: 'media' });
  if (!g.ok) return g.response;
  const body = (await request.json().catch(() => null)) as { tx?: unknown } | null;
  const tx = typeof body?.tx === 'number' || (typeof body?.tx === 'string' && /^\d{1,19}$/.test(body.tx)) ? String(body!.tx) : null;
  if (!tx) return fail(400, 'لا يوجد إجراء للتراجع عنه.');

  const supabase = await serverClient();
  const { data, error } = await supabase.rpc('undo_action', { p_tx: tx });
  if (error) return fail(409, undoErrorText(error.message));
  const result = data as { label: string; rows: RestoredRow[] };

  if (result.rows.some(touchesDrive)) {
    try {
      await syncDrive(supabase, getDrive(), result.rows);
    } catch {
      await supabase.rpc('undo_reapply', { p_tx: tx });
      return fail(502, 'تعذّر تحديث Google Drive، فلم يُتراجع عن الإجراء. أعد المحاولة.');
    }
  }
  return Response.json({ ok: true, label: result.label });
}

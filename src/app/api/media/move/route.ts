import { getDrive } from '@/lib/drive/google';
import { guard, fail } from '@/lib/drive/guard';
import { driveParentOf, isUuid } from '@/lib/drive/parents';
import { dbErrorText } from '@/lib/media/rules';
import { serverClient } from '@/lib/supabase/server';

// Move several files to one folder in a single change, so the move is one action to
// undo. The database decides first (edit in both folders, neither locked, approved
// versions frozen); Drive then follows, and the whole move is cancelled if it refuses.
export async function POST(request: Request) {
  const g = await guard(request, { mutating: true, page: 'media' });
  if (!g.ok) return g.response;
  const body = (await request.json().catch(() => null)) as { ids?: unknown; folderId?: unknown } | null;
  const ids = Array.isArray(body?.ids) ? (body!.ids as unknown[]).filter(isUuid) : [];
  const folderId = isUuid(body?.folderId) ? (body!.folderId as string) : null;
  if (!ids.length || ids.length > 200 || !folderId) return fail(400, 'لا يوجد ما يُنقل.');

  const supabase = await serverClient();
  const { data: before } = await supabase.from('media_files').select('id, folder_id').in('id', ids);
  const moving = (before ?? []).filter((r) => r.folder_id !== folderId);
  if (!moving.length) return Response.json({ ok: true, moved: 0 });

  const { error } = await supabase.from('media_files').update({ folder_id: folderId }).in('id', moving.map((r) => r.id as string));
  if (error) return fail(403, dbErrorText(error.message));

  try {
    const drive = getDrive();
    const to = await driveParentOf(supabase, drive, folderId);
    for (const r of moving) {
      const from = await driveParentOf(supabase, drive, r.folder_id as string);
      if (from === to) continue;
      const { data: versions } = await supabase.from('media_versions').select('drive_file_id').eq('asset_id', r.id);
      for (const v of versions ?? []) await drive.move(v.drive_file_id as string, from, to);
    }
    return Response.json({ ok: true, moved: moving.length });
  } catch {
    // Drive refused: the database puts the whole move back, so the Hub and Drive agree.
    await supabase.rpc('undo_cancel_last');
    return fail(502, 'تعذّر تحديث Google Drive، لم يُنقل شيء.');
  }
}

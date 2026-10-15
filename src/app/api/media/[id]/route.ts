import { copiesAt, storageFor, trashEverywhere } from '@/lib/storage';
import { guard, fail } from '@/lib/drive/guard';
import { cleanName } from '@/lib/drive/media';
import { driveParentOf, isUuid } from '@/lib/drive/parents';
import { dbErrorText } from '@/lib/media/rules';
import { serverClient } from '@/lib/supabase/server';

// Rename or move an asset. The database change comes first, so its rules (edit level,
// folder not locked, approved versions frozen) decide; Drive is then brought into
// step, and the database change is undone if Drive refuses.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard(request, { mutating: true, page: 'media' });
  if (!g.ok) return g.response;
  const { id } = await params;
  if (!isUuid(id)) return fail(404, 'غير موجود.');

  const body = (await request.json().catch(() => null)) as { name?: unknown; folderId?: unknown } | null;
  const newName = typeof body?.name === 'string' ? cleanName(body.name) : null;
  const newFolder = isUuid(body?.folderId) ? (body!.folderId as string) : null;
  if (!newName && !newFolder) return fail(400, 'لا يوجد تغيير.');

  const supabase = await serverClient();
  const { data: before } = await supabase
    .from('media_files')
    .select('name, folder_id, drive_file_id')
    .eq('id', id)
    .maybeSingle();
  if (!before) return fail(404, 'غير موجود.');

  const patch: Record<string, string> = {};
  if (newName && newName !== before.name) patch.name = newName;
  if (newFolder && newFolder !== before.folder_id) patch.folder_id = newFolder;
  if (!Object.keys(patch).length) return Response.json({ ok: true });

  const { error } = await supabase.from('media_files').update(patch).eq('id', id);
  if (error) return fail(403, dbErrorText(error.message));

  try {
    const drive = storageFor('library');
    const { data: versions } = await supabase.from('media_versions').select('drive_file_id').eq('asset_id', id);
    // The library's names and folders live in Drive only: they follow the Drive copies that are
    // still live (a copy at another provider is named by the file's id and has no folder).
    if (patch.name) for (const r of await copiesAt('google_drive', before.drive_file_id)) await drive.rename(r, patch.name);
    if (patch.folder_id) {
      const from = await driveParentOf(supabase, drive, before.folder_id);
      const to = await driveParentOf(supabase, drive, patch.folder_id);
      if (from !== to)
        for (const v of versions ?? [])
          for (const f of await copiesAt('google_drive', v.drive_file_id as string)) await drive.move(f, from, to);
    }
    return Response.json({ ok: true });
  } catch {
    // Drive refused: the database puts the change back (and forgets it, so it is not
    // offered as an undo), so the Hub and Drive agree.
    await supabase.rpc('undo_cancel_last');
    return fail(502, 'تعذّر تحديث Google Drive، لم يُحفظ التغيير.');
  }
}

// Removes an asset: the database decides first (manage level, not an approved version),
// then every live copy of every version goes to its provider's trash and the record goes.
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard(request, { mutating: true, page: 'media' });
  if (!g.ok) return g.response;
  const { id } = await params;
  if (!isUuid(id)) return fail(404, 'غير موجود.');

  const supabase = await serverClient();
  const { data: allowed } = await supabase.rpc('media_can_delete', { p_asset: id });
  if (allowed !== true) return fail(403, 'الحذف يحتاج صلاحية «إدارة» على المجلد، والإصدار المعتمد لا يُحذف.');

  const { data: versions } = await supabase.from('media_versions').select('drive_file_id').eq('asset_id', id);
  try {
    for (const v of versions ?? []) await trashEverywhere('library', v.drive_file_id as string);
  } catch {
    return fail(502, 'تعذّر نقل الملف إلى سلة مزود التخزين.');
  }
  const { error } = await supabase.from('media_files').delete().eq('id', id);
  if (error) return fail(500, 'نُقل الملف إلى السلة لكن تعذّر حذف سجله. أعد المحاولة.');
  return Response.json({ ok: true });
}

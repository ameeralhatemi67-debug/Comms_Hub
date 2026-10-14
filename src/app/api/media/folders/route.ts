import { storageFor } from '@/lib/storage';
import { guard, fail } from '@/lib/drive/guard';
import { cleanName } from '@/lib/drive/media';
import { driveParentOf, isUuid } from '@/lib/drive/parents';
import { dbErrorText } from '@/lib/media/rules';
import { serverClient } from '@/lib/supabase/server';

// Creates a folder in the Hub and the same folder in Drive. The database insert
// comes first so the person's level decides; the row is removed if Drive refuses.
export async function POST(request: Request) {
  const g = await guard(request, { mutating: true, page: 'media' });
  if (!g.ok) return g.response;

  const body = (await request.json().catch(() => null)) as
    | { name?: unknown; parentId?: unknown; restricted?: unknown }
    | null;
  const name = typeof body?.name === 'string' ? cleanName(body.name).slice(0, 120) : '';
  const parentId = isUuid(body?.parentId) ? (body!.parentId as string) : null;
  if (!name) return fail(400, 'اكتب اسم المجلد.');

  const supabase = await serverClient();
  const { data: row, error } = await supabase
    .from('media_folders')
    .insert({ name, parent_id: parentId, created_by: g.account.email })
    .select('id')
    .single();
  if (error) return fail(403, dbErrorText(error.message));

  try {
    const drive = storageFor('library');
    const driveId = await drive.createFolder(name, await driveParentOf(supabase, drive, parentId));
    const { error: upErr } = await supabase.from('media_folders').update({ drive_folder_id: driveId }).eq('id', row.id);
    if (upErr) throw new Error('link');

    if (body?.restricted === true) {
      // The creator keeps access first, then the folder stops inheriting.
      const g1 = await supabase
        .from('media_grants')
        .insert({ folder_id: row.id, subject_type: 'person', subject: g.account.email, level: 4 });
      const r1 = await supabase.from('media_folders').update({ restricted: true }).eq('id', row.id);
      if (g1.error || r1.error) return Response.json({ id: row.id, warning: 'restricted-failed' });
    }
    return Response.json({ id: row.id });
  } catch {
    await supabase.from('media_folders').delete().eq('id', row.id);
    return fail(502, 'تعذّر إنشاء المجلد في Google Drive.');
  }
}

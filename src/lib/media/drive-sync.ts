// Brings Google Drive into step with rows the database has just changed back (an undo):
// a file's name, a file's folder (every version moves), a folder's name.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { StorageProvider } from '@/lib/storage/provider';
import { driveParentOf } from '@/lib/drive/parents';

export type RestoredRow = {
  tbl: 'media_files' | 'media_folders' | 'media_grants';
  id: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
};

/** Only names and folders live in Drive too. */
export const touchesDrive = (r: RestoredRow) =>
  (r.tbl === 'media_files' && !!r.before && ('name' in r.before || 'folder_id' in r.before)) ||
  (r.tbl === 'media_folders' && !!r.before && 'name' in r.before);

export async function syncDrive(supabase: SupabaseClient, drive: StorageProvider, rows: RestoredRow[]): Promise<void> {
  for (const r of rows.filter(touchesDrive)) {
    const before = r.before ?? {};
    const after = r.after ?? {};
    if (r.tbl === 'media_folders') {
      const { data } = await supabase.from('media_folders').select('drive_folder_id').eq('id', r.id).maybeSingle();
      if (data?.drive_folder_id) await drive.rename(data.drive_folder_id as string, String(before.name));
      continue;
    }
    const { data: file } = await supabase.from('media_files').select('drive_file_id').eq('id', r.id).maybeSingle();
    if (!file) continue;
    if ('name' in before) await drive.rename(file.drive_file_id as string, String(before.name));
    if ('folder_id' in before) {
      const from = await driveParentOf(supabase, drive, (after.folder_id as string) ?? null);
      const to = await driveParentOf(supabase, drive, (before.folder_id as string) ?? null);
      if (from !== to) {
        const { data: versions } = await supabase.from('media_versions').select('drive_file_id').eq('asset_id', r.id);
        for (const v of versions ?? []) await drive.move(v.drive_file_id as string, from, to);
      }
    }
  }
}

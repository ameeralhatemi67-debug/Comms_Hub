// Which Drive folder a Hub folder lives in. A null Drive id is the Hub's root folder
// (the "unfiled" folder keeps files uploaded before folders existed).
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Drive } from './google';

export async function driveParentOf(
  supabase: SupabaseClient,
  drive: Drive,
  folderId: string | null,
): Promise<string> {
  if (!folderId) return drive.rootFolder();
  const { data } = await supabase.from('media_folders').select('drive_folder_id').eq('id', folderId).maybeSingle();
  return data?.drive_folder_id ?? drive.rootFolder();
}

export const isUuid = (v: unknown): v is string =>
  typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

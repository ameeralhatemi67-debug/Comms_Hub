// The library's upload limit set in «الإعدادات», «عام» (site_settings.upload_max_mb), under
// the 5 GB ceiling of the Drive path (MAX_UPLOAD_BYTES). Read by the upload routes.
import type { SupabaseClient } from '@supabase/supabase-js';
import { MAX_UPLOAD_BYTES } from '../drive/media.ts';

export const MB = 1024 ** 2;

/** The limit in bytes: the setting when it can be read, never above the ceiling. */
export function limitBytes(uploadMaxMb: number | null | undefined): number {
  const mb = Number(uploadMaxMb);
  return Number.isFinite(mb) && mb > 0 ? Math.min(mb * MB, MAX_UPLOAD_BYTES) : MAX_UPLOAD_BYTES;
}

export const overLimitText = (bytes: number) =>
  bytes >= MAX_UPLOAD_BYTES ? 'الملف أكبر من الحد المسموح (5 غيغابايت).' : `الملف أكبر من الحد الذي ضبطه مسؤول النظام (${Math.round(bytes / MB)} ميغابايت).`;

export async function uploadLimit(db: SupabaseClient): Promise<number> {
  const { data } = await db.from('site_settings').select('upload_max_mb').eq('id', 1).maybeSingle();
  return limitBytes((data as { upload_max_mb?: number } | null)?.upload_max_mb);
}

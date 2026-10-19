'use client';

// The studio and the media library (MVP_draft.md 62): the folders this person may create in (the
// library's own rule, canCreateAt: level create or manage, and not locked unless managing), uploading
// a file through the library's resumable upload (uploadNewAsset), and the library row of a file. The
// database decides again at upload (media_can_create) and at every read (row level security).
import { supabase } from '@/lib/supabase/client';
import { canCreateAt } from '@/lib/media/rules';
import { uploadNewAsset, uploadNewVersion } from '@/lib/media/upload';
import type { NewSource } from '@/lib/studio/schema';
import { parseDims, parseDuration } from './bin';

export type UploadFolder = { id: string; path: string };

type TreeRow = { id: string; parent_id: string | null; name: string; level: number; ghost: boolean; locked_by: string | null };

/** The folders a new file may go into, with their path for the picker, in tree order. */
export async function uploadFolders(): Promise<UploadFolder[]> {
  const { data, error } = await supabase().rpc('media_tree');
  if (error || !data) return [];
  const rows = data as TreeRow[];
  const byId = new Map(rows.map((r) => [r.id, r]));
  const pathOf = (r: TreeRow): string => {
    const parts: string[] = [];
    for (let x: TreeRow | undefined = r; x; x = x.parent_id ? byId.get(x.parent_id) : undefined) parts.unshift(x.name);
    return parts.join(' / ');
  };
  return rows
    .filter((r) => !r.ghost && canCreateAt(r.level, !!r.locked_by))
    .map((r) => ({ id: r.id, path: pathOf(r) }))
    .sort((a, b) => a.path.localeCompare(b.path, 'ar'));
}

export type AssetRow = { id: string; name: string; kind: string; current_version: number; mime_type: string; dims: string | null; duration: string | null; stage: string; approved_version: number | null };

export async function assetRow(id: string): Promise<AssetRow | null> {
  const { data } = await supabase().from('media_files').select('id,name,kind,current_version,mime_type,dims,duration,stage,approved_version').eq('id', id).maybeSingle();
  return (data as AssetRow | null) ?? null;
}

/** A library source of a file at its current version, from its row. */
export function librarySource(row: Pick<AssetRow, 'id' | 'name' | 'kind' | 'current_version' | 'mime_type' | 'dims' | 'duration'>): NewSource & { kind: 'library' } {
  const media: 'image' | 'audio' | 'video' = row.kind === 'image' ? 'image' : row.kind === 'audio' ? 'audio' : 'video';
  return { kind: 'library', asset: row.id, version: row.current_version, name: row.name, media, mime: row.mime_type, ...parseDims(row.dims), duration: parseDuration(row.duration) };
}

/** Uploads a file into a library folder and returns its row (the new file's version 1). */
export async function uploadToLibrary(file: File, folderId: string, onProgress: (f: number) => void): Promise<AssetRow> {
  const id = await uploadNewAsset(file, folderId, onProgress);
  const row = await assetRow(id);
  if (!row) throw new Error('رُفع الملف لكن تعذّرت قراءته من المكتبة.');
  return row;
}

/** Uploads a new version of a library file and returns the version number it became. */
export async function uploadVersion(assetId: string, file: File, note: string, onProgress: (f: number) => void): Promise<number> {
  return uploadNewVersion(assetId, file, note, onProgress);
}

/** The library files a project has exported to, newest first (studio_exports; the studio's own rows). */
export async function projectExports(projectId: string): Promise<{ asset_id: string; version: number; revision: number; created_at: string }[]> {
  const { data } = await supabase().from('studio_exports').select('asset_id,version,revision,created_at').eq('project_id', projectId).order('created_at', { ascending: false });
  return (data ?? []) as { asset_id: string; version: number; revision: number; created_at: string }[];
}

/** Stages of a file that has been in review: a new version sends it back to «قيد المراجعة». */
export const REVIEWED_STAGES = ['review', 'changes', 'rejected', 'ready', 'scheduled', 'partial', 'failed'];

import { getDrive } from '@/lib/drive/google';
import { guard, fail } from '@/lib/drive/guard';
import { isUuid } from '@/lib/drive/parents';
import { serverClient } from '@/lib/supabase/server';

// Streams a file from Drive to a signed-in person who may see the asset (database
// row level security decides). `?v=N` serves an earlier version, `?download=1`
// forces a download and records it in the log. Range is passed through so video
// can seek; the Drive address is never given out.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard(request, { page: 'media' });
  if (!g.ok) return g.response;
  const { id } = await params;
  if (!isUuid(id)) return fail(404, 'غير موجود.');

  const url = new URL(request.url);
  const wanted = Number(url.searchParams.get('v'));
  const supabase = await serverClient();

  const { data: asset } = await supabase
    .from('media_files')
    .select('drive_file_id, name, mime_type, current_version')
    .eq('id', id)
    .maybeSingle();
  if (!asset) return fail(404, 'غير موجود.');

  let driveFileId = asset.drive_file_id as string;
  let mime = asset.mime_type as string;
  if (Number.isInteger(wanted) && wanted > 0 && wanted !== asset.current_version) {
    const { data: v } = await supabase
      .from('media_versions')
      .select('drive_file_id, mime_type')
      .eq('asset_id', id)
      .eq('version', wanted)
      .maybeSingle();
    if (!v) return fail(404, 'غير موجود.');
    driveFileId = v.drive_file_id;
    mime = v.mime_type;
  }

  const upstream = await getDrive().open(driveFileId, request.headers.get('range'));
  if (!upstream.ok && upstream.status !== 206) return fail(upstream.status === 404 ? 404 : 502, 'تعذّر قراءة الملف.');

  const download = url.searchParams.get('download') === '1';
  if (download && !request.headers.get('range')) await supabase.rpc('media_record', { p_type: 'download', p_asset: id });

  const headers = new Headers({
    'Content-Type': mime,
    'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(asset.name)}`,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, no-store',
    // Files are user content served from the Hub's own address: never let them run.
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "sandbox; default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'",
  });
  for (const name of ['Content-Length', 'Content-Range']) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  return new Response(upstream.body, { status: upstream.status, headers });
}

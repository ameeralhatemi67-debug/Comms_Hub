import { getDrive } from '@/lib/drive/google';
import { guard, fail } from '@/lib/drive/guard';
import { serverClient } from '@/lib/supabase/server';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Streams a file from Drive to a signed-in person who may open the media library.
// The Drive address is never given out; Range is passed through so video can seek.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard(request, { page: 'media' });
  if (!g.ok) return g.response;
  const { id } = await params;
  if (!UUID.test(id)) return fail(404, 'غير موجود.');

  const supabase = await serverClient();
  const { data: row } = await supabase
    .from('media_files')
    .select('drive_file_id, name, mime_type')
    .eq('id', id)
    .maybeSingle();
  if (!row) return fail(404, 'غير موجود.');

  const upstream = await getDrive().open(row.drive_file_id, request.headers.get('range'));
  if (!upstream.ok && upstream.status !== 206) return fail(upstream.status === 404 ? 404 : 502, 'تعذّر قراءة الملف.');

  const download = new URL(request.url).searchParams.get('download') === '1';
  const headers = new Headers({
    'Content-Type': row.mime_type,
    'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(row.name)}`,
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

import { openStored } from '@/lib/storage';
import { guard, fail } from '@/lib/drive/guard';
import { isUuid } from '@/lib/drive/parents';
import { serverClient } from '@/lib/supabase/server';

// A picture, voice note or file sent in messaging, for members of a room it is in
// (the database decides). Pictures and voice notes play inline, with Range for
// seeking; anything else is a download. Nothing served here can run as a page.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard(request, { page: 'mail' });
  if (!g.ok) return g.response;
  const { id } = await params;
  if (!isUuid(id)) return fail(404, 'غير موجود.');

  const supabase = await serverClient();
  const { data } = await supabase.rpc('chat_file', { p_id: id });
  const row = Array.isArray(data) ? (data[0] as { drive_file_id: string; name: string; mime_type: string } | undefined) : undefined;
  if (!row) return fail(404, 'غير موجود.');

  const upstream = await openStored('chat', row.drive_file_id, request.headers.get('range'));
  if (!upstream.ok && upstream.status !== 206) return fail(upstream.status === 404 ? 404 : 502, 'تعذّر قراءة الملف.');
  const inline = /^(image\/(png|jpeg|webp|gif)|audio\/)/.test(row.mime_type);
  const headers = new Headers({
    'Content-Type': row.mime_type,
    'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(row.name)}`,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, max-age=3600',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "sandbox; default-src 'none'",
  });
  for (const name of ['Content-Length', 'Content-Range']) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  return new Response(upstream.body, { status: upstream.status, headers });
}

import { getDrive } from '@/lib/drive/google';
import { serverClient } from '@/lib/supabase/server';

// A review link: the file behind a valid, unexpired, unrevoked token, for someone
// without an account. It answers for the token alone, never lists anything, and gives
// the same answer for a wrong token as for an expired one.
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const notFound = () =>
    new Response('هذا الرابط غير صالح أو انتهت صلاحيته.', {
      status: 404,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  if (!/^[0-9a-f]{64}$/.test(token)) return notFound();

  const supabase = await serverClient();
  const { data } = await supabase.rpc('media_share_resolve', { p_token: token });
  const row = Array.isArray(data) ? data[0] : null;
  if (!row) return notFound();

  const upstream = await getDrive().open(row.drive_file_id, request.headers.get('range'));
  if (!upstream.ok && upstream.status !== 206) return notFound();

  const headers = new Headers({
    'Content-Type': row.mime_type,
    'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(row.name)}`,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'X-Robots-Tag': 'noindex, nofollow',
    'Content-Security-Policy': "sandbox; default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'",
  });
  for (const name of ['Content-Length', 'Content-Range']) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  return new Response(upstream.body, { status: upstream.status, headers });
}

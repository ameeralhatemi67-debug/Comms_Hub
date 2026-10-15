import { openStored } from '@/lib/storage';
import { guard, fail } from '@/lib/drive/guard';
import { isUuid } from '@/lib/drive/parents';
import { serverClient } from '@/lib/supabase/server';

// A file attached to mail from someone's computer, for a person who may see a
// message it is on (the database decides). Always a download, never run inline.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard(request, { page: 'mail' });
  if (!g.ok) return g.response;
  const { id } = await params;
  if (!isUuid(id)) return fail(404, 'غير موجود.');

  const supabase = await serverClient();
  const { data } = await supabase.rpc('mail_file', { p_id: id });
  const row = Array.isArray(data) ? (data[0] as { drive_file_id: string; name: string; mime_type: string } | undefined) : undefined;
  if (!row) return fail(404, 'غير موجود.');

  const upstream = await openStored('mail', row.drive_file_id);
  if (!upstream.ok) return fail(upstream.status === 404 ? 404 : 502, 'تعذّر قراءة الملف.');
  const headers = new Headers({
    'Content-Type': row.mime_type,
    'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(row.name)}`,
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "sandbox; default-src 'none'",
  });
  const len = upstream.headers.get('Content-Length');
  if (len) headers.set('Content-Length', len);
  return new Response(upstream.body, { status: 200, headers });
}

import { guard, fail } from '@/lib/drive/guard';
import { isUuid } from '@/lib/drive/parents';
import { inboundAttachment, mailboxConfigured, resolveMailEnv } from '@/lib/mail/gmail';
import { serverClient } from '@/lib/supabase/server';

// An attachment of mail received from outside. It stays in Gmail; the server reads it
// again for a person who may see the message. Always a download, never run inline.
export async function GET(request: Request, { params }: { params: Promise<{ id: string; index: string }> }) {
  const g = await guard(request, { page: 'mail' });
  if (!g.ok) return g.response;
  const { id, index } = await params;
  const i = Number(index);
  if (!isUuid(id) || !Number.isInteger(i) || i < 0 || i > 50) return fail(404, 'غير موجود.');
  const env = await resolveMailEnv();
  if (!mailboxConfigured(env)) return fail(503, 'صندوق القسم غير متصل.');

  const supabase = await serverClient();
  const { data } = await supabase.rpc('mail_inbound_file', { p_message: id, p_index: i });
  const ref = data as { uid?: number; index?: number } | null;
  if (!ref || typeof ref.uid !== 'number' || typeof ref.index !== 'number') return fail(404, 'غير موجود.');

  try {
    const file = await inboundAttachment(env, ref.uid, ref.index);
    if (!file) return fail(404, 'لم يعد المرفق موجوداً في Gmail.');
    return new Response(new Uint8Array(file.content), {
      headers: {
        'Content-Type': file.mime || 'application/octet-stream',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "sandbox; default-src 'none'",
      },
    });
  } catch {
    return fail(502, 'تعذّر قراءة المرفق من Gmail.');
  }
}

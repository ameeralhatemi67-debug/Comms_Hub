import { guard, fail } from '@/lib/drive/guard';
import { readMailEnv } from '@/lib/mail/gmail';
import { runSync } from '@/lib/mail/sync';
import { serverClient } from '@/lib/supabase/server';

// Reads new mail from the department mailbox and sends what is due. Called by the
// mail page when it opens, every minute while it is open, and right after a send.
export async function POST(request: Request) {
  const g = await guard(request, { mutating: true, page: 'mail' });
  if (!g.ok) return g.response;
  const body = (await request.json().catch(() => null)) as { force?: unknown } | null;
  const site = readMailEnv().site || new URL(request.url).origin;
  try {
    const result = await runSync(await serverClient(), site.replace(/\/+$/, ''), body?.force === true);
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return fail(502, 'تعذّر الاتصال بصندوق القسم في Gmail.');
  }
}

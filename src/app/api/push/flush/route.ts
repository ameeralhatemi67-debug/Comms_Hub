import { guard } from '@/lib/drive/guard';
import { resolveWaEnv, sameKey } from '@/lib/whatsapp/server';
import { flushNow } from '@/lib/push/server';

// The push outbox's only door (Mobile_Apps_Plan.md 5.5, decision M-3). Two starters, nothing
// scheduled: a signed-in page that has just written something (S-1, from this site only), or the
// WhatsApp bridge computer on its loop (S-2, with WHATSAPP_SERVER_KEY as a bearer token). Either way
// the claim and the report are made with the site's own server key, and the answer says only what
// happened, never a token, a destination or a text. When nothing waits it answers at once.
const no = (status: number, error: string) => Response.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } });

export async function POST(request: Request) {
  const given = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (given) {
    const env = await resolveWaEnv();
    if (!env.key || !sameKey(given, env.key)) return no(401, 'forbidden');
  } else {
    const g = await guard(request, { mutating: true });
    if (!g.ok) return g.response;
  }
  const result = await flushNow();
  if (!result) return no(503, 'not configured');
  return Response.json(result, { status: result.state === 'refused' ? 502 : 200, headers: { 'Cache-Control': 'no-store' } });
}

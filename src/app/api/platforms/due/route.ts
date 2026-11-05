import { guard } from '@/lib/drive/guard';
import { resolveWaEnv, sameKey } from '@/lib/whatsapp/server';
import { dueNow } from '@/lib/platforms/direct-due-server';

// The door of «مجدول» on Instagram (MVP_draft.md 76.5, Director_Notes_Plan.md answer Q3). Two starters, nothing scheduled in the
// site: the WhatsApp bridge computer on its loop, about once a minute, with WHATSAPP_SERVER_KEY as a bearer token, or Home opened
// by anyone signed in (from this site only), which fires what the bridge left, late. Either way the run is the server's own, with
// its key and no person's session, and the database decides what is due. The answer says only how many, never a post, a token or
// an address.
export const maxDuration = 60;

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
  const result = await dueNow(new URL(request.url).origin);
  if (!result) return no(503, 'not configured');
  return Response.json(result, { status: result.state === 'refused' ? 502 : 200, headers: { 'Cache-Control': 'no-store' } });
}

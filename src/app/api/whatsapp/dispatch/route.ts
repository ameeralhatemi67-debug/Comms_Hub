import { serverClient } from '@/lib/supabase/server';
import { readMailEnv } from '@/lib/mail/gmail';
import { DEFAULT_MAX_CHARS, type Claimed } from '@/lib/whatsapp/rules';
import { buildItems, readWaEnv, sameKey } from '@/lib/whatsapp/server';

// The pull bridge's only door (Permissions_Plan.md 8.1). The bridge, on the owner's computer,
// calls this every few seconds with WHATSAPP_SERVER_KEY: it reports what it sent, says it is
// alive, and claims what is queued. The site never calls the bridge, and there is no timer
// here: nothing moves unless the bridge asks. Destinations come from the claimed rows, which
// the database routed from room membership and verified links; nothing in the request can
// name one.
const no = (status: number, error: string) => Response.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

type Body = { reports?: { id?: unknown; ok?: unknown; error?: unknown }[]; note?: unknown; claim?: unknown };

export async function POST(request: Request) {
  const env = readWaEnv();
  if (!env.key || !env.secret) return no(503, 'not configured');
  const given = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!given || !sameKey(given, env.key)) return no(401, 'forbidden');
  const body = ((await request.json().catch(() => null)) ?? {}) as Body;
  const db = await serverClient();

  for (const r of (Array.isArray(body.reports) ? body.reports : []).slice(0, 50)) {
    if (typeof r?.id !== 'string' || !UUID.test(r.id)) continue;
    await db.rpc('wa_report', { p_key: env.key, p_id: r.id, p_ok: r.ok === true, p_error: typeof r.error === 'string' ? r.error.slice(0, 200) : null });
  }
  if (typeof body.note === 'string') await db.rpc('wa_heartbeat', { p_key: env.key, p_note: body.note.slice(0, 200) });

  const n = typeof body.claim === 'number' ? Math.max(0, Math.min(20, Math.floor(body.claim))) : 0;
  if (!n) return Response.json({ items: [] }, { headers: { 'Cache-Control': 'no-store' } });
  const { data, error } = await db.rpc('wa_claim', { p_key: env.key, p_limit: n });
  if (error) return no(502, 'claim failed');
  const { data: sys } = await db.rpc('wa_settings', { p_key: env.key });
  const site = (env.site || readMailEnv().site || new URL(request.url).origin).replace(/\/+$/, '');
  const items = buildItems((data ?? []) as Claimed[], {
    site,
    secret: env.secret,
    maxChars: (sys as { max_chars?: number } | null)?.max_chars ?? DEFAULT_MAX_CHARS,
    nowMs: Date.now(),
  });
  return Response.json({ items }, { headers: { 'Cache-Control': 'no-store' } });
}

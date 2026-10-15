import { fail, guard } from '@/lib/drive/guard';
import { checkAccount, loadApp, type DueAccount } from '@/lib/platforms/connect';
import type { Provider } from '@/lib/platforms/oauth';
import { isUuid, json } from '@/lib/platforms/route';
import { serverClient } from '@/lib/supabase/server';

// Asks each really-connected account's platform whether the token still works, and records the
// answer (state, time, expiry; TikTok's access token is renewed on the way). Any approved
// signed-in person can ask, which is how the channels page keeps the state fresh without a
// background worker: it runs for the accounts not checked in the last half hour, or for one
// account on request. Tokens are read by this route only and never returned.
export async function POST(request: Request) {
  const g = await guard(request, { mutating: true });
  if (!g.ok) return g.response;
  const body = (await request.json().catch(() => null)) as { account?: unknown; all?: unknown } | null;
  const db = await serverClient();

  const { data, error } = await db.rpc('platform_conn_due', { p_minutes: body?.account || body?.all ? 0 : 30 });
  if (error) return fail(500, 'تعذّر قراءة الحسابات.');
  let due = (data ?? []) as DueAccount[];
  if (isUuid(body?.account)) due = due.filter((d) => d.id === body!.account);
  if (!due.length) return json({ checked: 0, results: [] });

  const needed = new Set<Provider>(due.map((d) => (d.type === 'tiktok_user' ? 'tiktok' : 'meta')));
  const apps: Partial<Record<Provider, Awaited<ReturnType<typeof loadApp>>>> = {};
  for (const p of needed) apps[p] = await loadApp(db, p, 'فحص اتصال الحسابات');

  const results = [];
  for (const d of due.slice(0, 20)) results.push(await checkAccount(db, fetch, apps, d));
  return json({ checked: results.length, results });
}

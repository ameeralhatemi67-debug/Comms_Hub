// The guard and small helpers every /api/platforms route shares. Server only.
import { fail, guard } from '../drive/guard.ts';
import { serverClient } from '../supabase/server.ts';
import type { Provider } from './oauth.ts';

export const isProvider = (v: unknown): v is Provider => typeof v === 'string' && (['meta', 'tiktok', 'google', 'linkedin', 'x'] as string[]).includes(v);
export const isUuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

/**
 * Signed in, from this site when it changes something, and one who may connect accounts
 * (the database decides: the people who manage accounts, or «إدارة المنصات وتطبيقاتها»).
 */
export async function connectGuard(request: Request, mutating: boolean) {
  const g = await guard(request, { mutating });
  if (!g.ok) return g;
  const db = await serverClient();
  const { data } = await db.rpc('platform_conn_may');
  if (data !== true) return { ok: false as const, response: fail(403, 'لا تملك صلاحية ربط الحسابات.') };
  return { ok: true as const, account: g.account, db };
}

export const noStore = { 'Cache-Control': 'no-store' } as const;
export const json = (body: unknown, status = 200) => Response.json(body, { status, headers: noStore });

/** The address the platform sends the person back to. */
export const redirectUri = (request: Request, provider: Provider) => `${new URL(request.url).origin}/api/platforms/callback/${provider}`;

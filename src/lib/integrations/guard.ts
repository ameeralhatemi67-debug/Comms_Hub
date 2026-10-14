// Route guard for the integrations routes: signed in, from this site when it changes
// something, and holding a capability, which the database decides (has_capability).
import { guard, fail } from '../drive/guard.ts';
import { serverClient } from '../supabase/server.ts';

export async function capGuard(request: Request, cap: string, mutating: boolean) {
  const g = await guard(request, { mutating });
  if (!g.ok) return g;
  const db = await serverClient();
  const { data } = await db.rpc('has_capability', { p_cap: cap, p_scope: null });
  if (data !== true) return { ok: false as const, response: fail(403, 'لا تملك صلاحية هذا الإجراء.') };
  return { ok: true as const, account: g.account, db };
}

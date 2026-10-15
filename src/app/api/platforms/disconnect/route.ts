import { fail } from '@/lib/drive/guard';
import { connectGuard, isUuid, json } from '@/lib/platforms/route';

// Stops using a real connection: the token is destroyed in the vault and the authorisation ends
// now. The account, its works and approvals stay. Revoking the app on the platform's side is
// separate (the person's own settings there) and the page says so.
export async function POST(request: Request) {
  const g = await connectGuard(request, true);
  if (!g.ok) return g.response;
  const body = (await request.json().catch(() => null)) as { account?: unknown } | null;
  if (!isUuid(body?.account)) return fail(400, 'طلب غير صالح.');
  const { error } = await g.db.rpc('platform_conn_disconnect', { p_account: body!.account });
  if (error) return fail(403, 'تعذّر فصل الحساب.');
  return json({ ok: true });
}

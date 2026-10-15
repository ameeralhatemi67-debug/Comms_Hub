import { guard, fail } from '@/lib/drive/guard';
import { serverClient } from '@/lib/supabase/server';
import { normalisePhone, waError } from '@/lib/whatsapp/rules';
import { codeFor, codeHash, newNonce, resolveWaEnv } from '@/lib/whatsapp/server';

// The member asks for a code to prove a number (Permissions_Plan.md 8.3). The server makes
// the code from its secret and a fresh nonce, and gives the database only the nonce and the
// hash; the code itself leaves only through the system number, to that number. The browser
// never sees it.
export async function POST(request: Request) {
  const g = await guard(request, { mutating: true });
  if (!g.ok) return g.response;
  const env = await resolveWaEnv();
  if (!env.key || !env.secret) return fail(503, 'واتساب النظام غير مهيأ بعد. يكمل مسؤول النظام إعداده.');
  const body = (await request.json().catch(() => null)) as { phone?: unknown } | null;
  const phone = normalisePhone(typeof body?.phone === 'string' ? body.phone : '');
  if (!phone) return fail(400, waError('WA_PHONE_BAD'));
  const nonce = newNonce();
  const { data, error } = await (await serverClient()).rpc('wa_code_issue', {
    p_key: env.key,
    p_phone: phone,
    p_nonce: nonce,
    p_hash: codeHash(codeFor(env.secret, nonce), nonce),
  });
  if (error) return fail(400, waError(error.message));
  return Response.json({ expires_at: data }, { headers: { 'Cache-Control': 'no-store' } });
}

import { randomBytes } from 'node:crypto';
import { fail, guard } from '@/lib/drive/guard';
import { forgetCreds, serverKeyOrNull, vaultReachable } from '@/lib/integrations/vault';
import { sha256Hex } from '@/lib/whatsapp/server';
import { serverClient } from '@/lib/supabase/server';

// Makes the WhatsApp bridge's key and the link-signing secret in the site, once (replacing any
// earlier pair). Both go to the vault; the database keeps the key's fingerprint only. The key is
// returned in this response and nowhere else: the bridge computer's settings file is its only
// other home. For holders of «إدارة رقم واتساب النظام» and «إدخال أسرار التكاملات وتجديدها» (the
// Director and the administrator by default); the database decides again.
export async function POST(request: Request) {
  const g = await guard(request, { mutating: true });
  if (!g.ok) return g.response;
  if (!vaultReachable()) return fail(503, 'خزنة الأسرار غير متاحة: مفتاح الخادم غير مضبوط.');

  const db = await serverClient();
  const allowed = await Promise.all([db.rpc('has_capability', { p_cap: 'whatsapp.system.manage', p_scope: null }), db.rpc('has_capability', { p_cap: 'integrations.secrets', p_scope: null })]);
  if (allowed.some((a) => a.data !== true)) return fail(403, 'لا تملك صلاحية إعداد جسر واتساب.');

  const key = randomBytes(32).toString('hex');
  const secret = randomBytes(32).toString('hex');
  const { error } = await db.rpc('wa_bridge_issue', { p_key: serverKeyOrNull(), p_hash: sha256Hex(key), p_pair: JSON.stringify({ key, secret }) });
  if (error) return fail(error.message.includes('FORBIDDEN') ? 403 : 400, 'تعذّر إنشاء المفتاح.');
  forgetCreds('whatsapp_bridge');
  return Response.json({ key, site: new URL(request.url).origin }, { headers: { 'Cache-Control': 'no-store' } });
}

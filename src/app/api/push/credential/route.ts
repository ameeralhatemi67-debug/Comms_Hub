import { fail, guard } from '@/lib/drive/guard';
import { storeChecked, vaultReachable } from '@/lib/integrations/vault';
import { compactServiceAccount, fetchAccessToken, parseServiceAccount } from '@/lib/push/fcm';
import { forgetPushToken } from '@/lib/push/flush';
import { FCM_TYPE } from '@/lib/push/server';
import { json } from '@/lib/platforms/route';
import { serverClient } from '@/lib/supabase/server';

// The Firebase service account for push notices (MVP_draft.md 64.3), entered once in «الإعدادات»
// «الاتصالات» by a holder of «إدخال أسرار التكاملات وتجديدها». It is checked by asking Google for an
// access token with it before it is kept, goes to the vault, and is never returned or shown again:
// only the project id and the service account's address are kept beside it, to say which it is.
export async function POST(request: Request) {
  const g = await guard(request, { mutating: true });
  if (!g.ok) return g.response;
  if (!vaultReachable()) return fail(503, 'خزنة الأسرار غير متاحة: مفتاح الخادم غير مضبوط.');

  const body = (await request.json().catch(() => null)) as { json?: unknown } | null;
  const sa = parseServiceAccount(typeof body?.json === 'string' ? body.json.trim() : '');
  if (!sa) return fail(400, 'هذا ليس ملف حساب خدمة من Firebase. الصق محتوى ملف JSON الذي نزّلته من «حسابات الخدمة» كاملاً.');

  const db = await serverClient();
  const slot = await db.rpc('push_fcm_slot');
  if (slot.error || typeof slot.data !== 'string') return fail(403, 'لا تملك صلاحية إدخال أسرار التكاملات.');

  const kept = await storeChecked(db, slot.data, FCM_TYPE, compactServiceAccount(sa), async (secret) => {
    const again = parseServiceAccount(secret);
    if (!again) return { ok: false, error: 'BAD_JSON' };
    const t = await fetchAccessToken(again);
    return t.ok ? { ok: true, config: { project_id: again.project_id, client_email: again.client_email } } : { ok: false, error: t.error };
  });
  if (!kept.ok) {
    const text: Record<string, string> = {
      TOKEN_REFUSED: 'رفضت Google هذا المفتاح. أنشئ مفتاحاً جديداً لحساب الخدمة من Firebase والصقه هنا.',
      TOKEN_UNREACHABLE: 'تعذّر الوصول إلى Google الآن. أعد المحاولة بعد قليل.',
      FORBIDDEN: 'لا تملك صلاحية إدخال أسرار التكاملات.',
    };
    return fail(kept.error === 'FORBIDDEN' ? 403 : 400, text[kept.error] ?? 'تعذّر حفظ المفتاح في الخزنة.');
  }
  forgetPushToken();
  return json({ ok: true, project: sa.project_id, account: sa.client_email });
}

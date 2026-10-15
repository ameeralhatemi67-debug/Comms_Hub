import { fail, guard } from '@/lib/drive/guard';
import { serverKeyOrNull, vaultReachable } from '@/lib/integrations/vault';
import { metaAppCheck, tiktokAppCheck, TIKTOK_SCOPES, connErrorAr, PlatformCallError } from '@/lib/platforms/oauth';
import { googleAppCheck, linkedinAppCheck, xAppCheck } from '@/lib/platforms/oauth2';
import { isProvider, json } from '@/lib/platforms/route';
import { APP_TYPE } from '@/lib/platforms/oauth';
import { serverClient } from '@/lib/supabase/server';

// Enters a platform app's id and secret (Meta, TikTok, Google for YouTube and Drive, LinkedIn, X)
// once, into the vault. The secret is write-only: it is asked of the platform first where the
// platform can say (a pair that does not match is refused and nothing is stored), then stored,
// and never returned. Holders of «إدارة المنصات وتطبيقاتها» and «إدخال أسرار التكاملات
// وتجديدها» only; the database decides again.
const LABEL: Record<string, string> = {
  meta: 'تطبيق Meta (فيسبوك وإنستغرام)',
  tiktok: 'تطبيق TikTok',
  google: 'تطبيق Google (يوتيوب وDrive)',
  linkedin: 'تطبيق LinkedIn',
  x: 'تطبيق X',
};

export async function POST(request: Request) {
  const g = await guard(request, { mutating: true });
  if (!g.ok) return g.response;
  if (!vaultReachable()) return fail(503, 'خزنة الأسرار غير متاحة: مفتاح الخادم غير مضبوط.');

  const body = (await request.json().catch(() => null)) as { provider?: unknown; app_id?: unknown; secret?: unknown; scopes?: unknown } | null;
  if (!body || !isProvider(body.provider)) return fail(400, 'اختر منصة التطبيق.');
  const provider = body.provider;
  const appId = typeof body.app_id === 'string' ? body.app_id.trim() : '';
  const secret = typeof body.secret === 'string' ? body.secret.trim() : '';
  if (!/^[A-Za-z0-9_.-]{4,128}$/.test(appId)) return fail(400, 'المعرّف حروف وأرقام ونقاط وشرطات فقط، من 4 إلى 128 خانة.');
  if (!/^[^\s]{8,200}$/.test(secret)) return fail(400, 'السر من 8 إلى 200 خانة بلا مسافات.');
  // Custom scopes are a TikTok setting (its scopes are those added to the app in its console).
  const scopes =
    provider === 'tiktok' && Array.isArray(body.scopes) && body.scopes.every((s) => typeof s === 'string' && /^[a-z_.]{3,60}$/.test(s)) && body.scopes.length <= 12
      ? (body.scopes as string[])
      : null;

  const db = await serverClient();
  const allowed = await Promise.all([db.rpc('has_capability', { p_cap: 'platforms.manage', p_scope: null }), db.rpc('has_capability', { p_cap: 'integrations.secrets', p_scope: null })]);
  if (allowed.some((a) => a.data !== true)) return fail(403, 'لا تملك صلاحية إدخال أسرار التكاملات.');

  try {
    const checked =
      provider === 'meta'
        ? await metaAppCheck(fetch, appId, secret)
        : provider === 'tiktok'
          ? await tiktokAppCheck(fetch, appId, secret)
          : provider === 'google'
            ? await googleAppCheck(fetch, appId, secret)
            : provider === 'linkedin'
              ? await linkedinAppCheck(fetch, appId, secret)
              : await xAppCheck(fetch, appId, secret);
    if (!checked.ok) return fail(400, connErrorAr(checked.error));
  } catch (e) {
    return fail(502, connErrorAr(e instanceof PlatformCallError ? e.code : 'UNREACHABLE'));
  }

  const { data, error } = await db.rpc('platform_conn_app_set', {
    p_key: serverKeyOrNull(),
    p_type: APP_TYPE[provider],
    p_label: LABEL[provider],
    p_config: { app_id: appId, ...(scopes ? { scopes } : provider === 'tiktok' ? { scopes: [...TIKTOK_SCOPES] } : {}) },
    p_secret: secret,
  });
  if (error) return fail(error.message.includes('FORBIDDEN') ? 403 : 400, 'تعذّر حفظ السر.');
  return json({ ok: true, tail: String(data ?? '') });
}

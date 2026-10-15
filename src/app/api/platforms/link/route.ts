import { fail } from '@/lib/drive/guard';
import { serverKeyOrNull } from '@/lib/integrations/vault';
import { loadApp, loadSecret } from '@/lib/platforms/connect';
import { PlatformCallError, connErrorAr, metaDebugToken, metaPages, unpackTikTok } from '@/lib/platforms/oauth';
import { connectGuard, isUuid, json } from '@/lib/platforms/route';
import { workErrorText } from '@/lib/work/rules';

// Connects the accounts the person chose from their sign-in. Each becomes a platform account
// with its own token in the vault and its real expiry as the authorisation. A simulated account
// on the same platform and handle is upgraded in place, so its works and approvals stay. The
// person's passing user token is removed with the last one.
type Pick = { platform: 'facebook' | 'instagram' | 'tiktok'; id: string; label?: string };
type Result = { platform: string; id: string; ok: boolean; account?: string; error?: string; missing?: string[] };

const NEEDED: Record<string, string> = { facebook: 'pages_manage_posts', instagram: 'instagram_content_publish' };

export async function POST(request: Request) {
  const g = await connectGuard(request, true);
  if (!g.ok) return g.response;
  const body = (await request.json().catch(() => null)) as {
    offer?: unknown;
    picks?: unknown;
    purpose?: unknown;
    publishers?: unknown;
    mode?: unknown;
    account_id?: unknown;
  } | null;
  if (!body || !isUuid(body.offer) || !Array.isArray(body.picks) || body.picks.length < 1 || body.picks.length > 20) return fail(400, 'اختر ما تربطه.');
  const picks: Pick[] = [];
  for (const p of body.picks as Record<string, unknown>[]) {
    if (!['facebook', 'instagram', 'tiktok'].includes(String(p.platform)) || typeof p.id !== 'string' || !/^[A-Za-z0-9_.:-]{1,120}$/.test(p.id)) return fail(400, 'اختيار غير صالح.');
    picks.push({ platform: p.platform as Pick['platform'], id: p.id, label: typeof p.label === 'string' ? p.label.trim().slice(0, 60) : undefined });
  }
  const publishers = Array.isArray(body.publishers) ? (body.publishers as unknown[]).filter((x): x is string => typeof x === 'string').slice(0, 30) : [];
  const purpose = typeof body.purpose === 'string' ? body.purpose.slice(0, 200) : '';
  const mode = body.mode === 'ask' ? 'ask' : 'auto';
  const reconnect = isUuid(body.account_id) ? body.account_id : null;
  const key = serverKeyOrNull();
  if (!key) return fail(503, 'خزنة الأسرار غير متاحة.');

  const offerRow = (await g.db.rpc('platform_conn_offer', { p_id: body.offer })).data as { type: string; config: Record<string, unknown> } | null;
  if (!offerRow) return fail(404, 'انتهت صلاحية الربط. ابدأ من جديد.');
  const results: Result[] = [];
  const last = picks.length - 1;

  if (offerRow.type === 'tiktok_user_offer') {
    const secret = await loadSecret(g.db, body.offer, 'ربط حساب TikTok');
    const t = secret ? unpackTikTok(secret) : null;
    const pick = picks[0];
    if (!secret || !t || pick.platform !== 'tiktok') return fail(404, 'انتهت صلاحية الربط. ابدأ من جديد.');
    const c = offerRow.config;
    const username = typeof c.username === 'string' && c.username ? c.username : null;
    const { data, error } = await g.db.rpc('platform_conn_link', {
      p_key: key,
      p: {
        platform: 'tiktok',
        type: 'tiktok_user',
        label: pick.label || String(c.display_name ?? 'حساب TikTok').slice(0, 60),
        handle: username ? `@${username}` : `tt:${t.openId}`,
        purpose,
        publishers,
        mode,
        external_id: t.openId,
        external_name: String(c.display_name ?? ''),
        scopes: Array.isArray(c.scopes) ? c.scopes : [],
        expires_at: t.refreshExpiresAt || null,
        account_id: reconnect,
        offer: body.offer,
      },
      p_secret: secret,
    });
    results.push(error ? { platform: 'tiktok', id: pick.id, ok: false, error: workErrorText(error.message) } : { platform: 'tiktok', id: pick.id, ok: true, account: String(data) });
    return json({ results });
  }

  // Meta: the person's long-lived user token gives each page its own token, read here once.
  const app = await loadApp(g.db, 'meta', 'ربط صفحات');
  const userToken = await loadSecret(g.db, body.offer, 'ربط صفحات');
  if (!app || !userToken) return fail(404, 'انتهت صلاحية الربط. ابدأ من جديد.');
  let pages;
  try {
    pages = await metaPages(fetch, userToken);
  } catch (e) {
    return fail(502, connErrorAr(e instanceof PlatformCallError ? e.code : 'PLATFORM_ERROR'));
  }

  for (let i = 0; i < picks.length; i++) {
    const pick = picks[i];
    const page = pick.platform === 'facebook' ? pages.find((p) => p.id === pick.id) : pages.find((p) => p.instagram?.id === pick.id);
    if (!page || pick.platform === 'tiktok') {
      results.push({ platform: pick.platform, id: pick.id, ok: false, error: 'لم تعد هذه الصفحة ضمن ما تديره. ابدأ الربط من جديد.' });
      continue;
    }
    const info = await metaDebugToken(fetch, app.appId, app.secret, page.token);
    if (!info.valid) {
      results.push({ platform: pick.platform, id: pick.id, ok: false, error: connErrorAr(info.error) });
      continue;
    }
    const isIg = pick.platform === 'instagram';
    const username = isIg ? page.instagram?.username : page.username;
    const missing = info.scopes.length && !info.scopes.includes(NEEDED[pick.platform]) ? [NEEDED[pick.platform]] : [];
    const { data, error } = await g.db.rpc('platform_conn_link', {
      p_key: key,
      p: {
        platform: pick.platform,
        type: isIg ? 'meta_instagram' : 'meta_page',
        label: pick.label || (isIg ? (username ? `@${username}` : page.name) : page.name).slice(0, 60),
        handle: username ? `@${username}` : `${isIg ? 'ig' : 'fb'}:${pick.id}`,
        purpose,
        publishers,
        mode,
        external_id: pick.id,
        external_name: isIg ? (username ?? page.name) : page.name,
        scopes: info.scopes,
        expires_at: info.expiresAt,
        account_id: reconnect,
        offer: i === last ? body.offer : null,
      },
      p_secret: page.token,
    });
    results.push(error ? { platform: pick.platform, id: pick.id, ok: false, error: workErrorText(error.message) } : { platform: pick.platform, id: pick.id, ok: true, account: String(data), missing });
  }
  return json({ results });
}

import { NextResponse, type NextRequest } from 'next/server';
import { serverKeyOrNull } from '@/lib/integrations/vault';
import { loadApp } from '@/lib/platforms/connect';
import {
  OFFER_TYPE,
  PlatformCallError,
  metaLongLivedUserToken,
  packTikTok,
  tiktokExchangeCode,
  tiktokUserInfo,
} from '@/lib/platforms/oauth';
import { connectGuard, isProvider, redirectUri } from '@/lib/platforms/route';

// The platform sends the person back here with a one-time code. The code is exchanged for a
// token on the server, the token goes straight into the vault as a passing "offer" owned by the
// person, and the person is sent back to «الحسابات المرتبطة» to choose what to connect. No token
// is ever in a URL, a page or a log; only the id of the offer is.
export async function GET(request: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const url = new URL(request.url);
  const back = (code: string) => {
    const r = NextResponse.redirect(`${url.origin}/channels?connect_error=${code}`);
    r.cookies.delete({ name: 'platform_oauth_state', path: '/api/platforms' });
    return r;
  };
  if (!isProvider(provider)) return back('PLATFORM_ERROR');
  const g = await connectGuard(request, false);
  if (!g.ok) return g.response;

  const expected = request.cookies.get('platform_oauth_state')?.value;
  const state = url.searchParams.get('state');
  const code = url.searchParams.get('code');
  if (url.searchParams.get('error')) return back('CODE_REFUSED');
  if (!expected || !state || state !== expected || !code) return back('CODE_REFUSED');

  const app = await loadApp(g.db, provider, 'إكمال ربط حساب');
  if (!app) return back('APP_NOT_CONFIGURED');
  const to = redirectUri(request, provider);

  try {
    let secret: string;
    let config: Record<string, unknown>;
    if (provider === 'meta') {
      const t = await metaLongLivedUserToken(fetch, { appId: app.appId, secret: app.secret, redirectUri: to, code });
      secret = t.token;
      config = { provider, expires_at: t.expiresAt };
    } else {
      const t = await tiktokExchangeCode(fetch, { clientKey: app.appId, secret: app.secret, redirectUri: to, code });
      const me = await tiktokUserInfo(fetch, t.access);
      secret = packTikTok(t);
      config = {
        provider,
        open_id: t.openId,
        scopes: t.scope,
        refresh_expires_at: t.refreshExpiresAt,
        ...('error' in me ? {} : { display_name: me.displayName, username: me.username }),
      };
    }
    const { data, error } = await g.db.rpc('platform_conn_user_put', {
      p_key: serverKeyOrNull(),
      p_type: OFFER_TYPE[provider],
      p_label: provider === 'meta' ? 'دخول Meta بانتظار اختيار الصفحات' : 'دخول TikTok بانتظار الاختيار',
      p_config: config,
      p_secret: secret,
    });
    if (error || typeof data !== 'string') return back('PLATFORM_ERROR');
    const ok = NextResponse.redirect(`${url.origin}/channels?connect=${provider}&offer=${data}`);
    ok.cookies.delete({ name: 'platform_oauth_state', path: '/api/platforms' });
    return ok;
  } catch (e) {
    return back(e instanceof PlatformCallError ? e.code : 'PLATFORM_ERROR');
  }
}

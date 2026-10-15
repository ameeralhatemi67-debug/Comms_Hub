import { NextResponse } from 'next/server';
import { loadApp } from '@/lib/platforms/connect';
import { META_SCOPES, metaAuthUrl, tiktokAuthUrl, TIKTOK_SCOPES } from '@/lib/platforms/oauth';
import { connectGuard, isProvider, redirectUri } from '@/lib/platforms/route';

// Starts the platform's own sign-in for connecting accounts. The state value is kept in a
// short-lived cookie readable by this route only and checked again on the way back.
export async function GET(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const origin = new URL(request.url).origin;
  const back = (code: string) => NextResponse.redirect(`${origin}/channels?connect_error=${code}`);
  if (!isProvider(provider)) return back('PLATFORM_ERROR');
  const g = await connectGuard(request, false);
  if (!g.ok) return g.response;

  const app = await loadApp(g.db, provider, 'بدء ربط حساب');
  if (!app) return back('APP_NOT_CONFIGURED');

  const state = crypto.randomUUID();
  const to = redirectUri(request, provider);
  const url =
    provider === 'meta'
      ? metaAuthUrl({ appId: app.appId, redirectUri: to, state, scopes: META_SCOPES })
      : tiktokAuthUrl({ clientKey: app.appId, redirectUri: to, state, scopes: app.scopes?.length ? app.scopes : TIKTOK_SCOPES });
  const res = NextResponse.redirect(url);
  res.cookies.set('platform_oauth_state', state, {
    httpOnly: true,
    secure: origin.startsWith('https://'),
    sameSite: 'lax',
    path: '/api/platforms',
    maxAge: 600,
  });
  return res;
}

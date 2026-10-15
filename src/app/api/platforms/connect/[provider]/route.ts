import { NextResponse } from 'next/server';
import { loadApp } from '@/lib/platforms/connect';
import { META_SCOPES, metaAuthUrl, tiktokAuthUrl, TIKTOK_SCOPES } from '@/lib/platforms/oauth';
import { googleAuthUrl, linkedinAuthUrl, pkcePair, xAuthUrl } from '@/lib/platforms/oauth2';
import { connectGuard, isProvider, redirectUri } from '@/lib/platforms/route';

// Starts the platform's own sign-in for connecting accounts. The state value is kept in a
// short-lived cookie readable by this route only and checked again on the way back. X also needs
// the PKCE verifier, kept the same way: only its challenge goes to the platform.
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
  let verifier: string | null = null;
  let url: string;
  if (provider === 'meta') url = metaAuthUrl({ appId: app.appId, redirectUri: to, state, scopes: META_SCOPES });
  else if (provider === 'tiktok') url = tiktokAuthUrl({ clientKey: app.appId, redirectUri: to, state, scopes: app.scopes?.length ? app.scopes : TIKTOK_SCOPES });
  else if (provider === 'google') url = googleAuthUrl({ clientId: app.appId, redirectUri: to, state });
  else if (provider === 'linkedin') url = linkedinAuthUrl({ clientId: app.appId, redirectUri: to, state });
  else {
    const pair = await pkcePair();
    verifier = pair.verifier;
    url = xAuthUrl({ clientId: app.appId, redirectUri: to, state, challenge: pair.challenge });
  }
  const res = NextResponse.redirect(url);
  const cookie = { httpOnly: true, secure: origin.startsWith('https://'), sameSite: 'lax' as const, path: '/api/platforms', maxAge: 600 };
  res.cookies.set('platform_oauth_state', state, cookie);
  if (verifier) res.cookies.set('platform_oauth_pkce', verifier, cookie);
  return res;
}

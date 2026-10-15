import { NextResponse } from 'next/server';
import { capGuard } from '@/lib/integrations/guard';
import { integrationCreds } from '@/lib/integrations/vault';
import { onedriveAuthUrl } from '@/lib/storage/onedrive';

// Starts the connection of a OneDrive account: the person signs in on Microsoft's own page. For
// whoever holds «إدارة مزودي التخزين» (the Director and the administrator by default). The state
// value is kept in a short-lived cookie readable by this route only and checked on the way back.
export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  const back = (code: string) => NextResponse.redirect(`${origin}/settings?tab=connections&onedrive_error=${code}`);
  const g = await capGuard(request, 'storage.manage', false);
  if (!g.ok) return g.response;
  const app = await integrationCreds('microsoft_app', 'بدء ربط OneDrive');
  const clientId = typeof app?.config.app_id === 'string' ? app.config.app_id : '';
  if (!app || !clientId) return back('APP_NOT_CONFIGURED');

  const state = crypto.randomUUID();
  const res = NextResponse.redirect(onedriveAuthUrl({ clientId, redirectUri: `${origin}/api/onedrive/callback`, state }));
  res.cookies.set('onedrive_oauth_state', state, {
    httpOnly: true,
    secure: origin.startsWith('https://'),
    sameSite: 'lax',
    path: '/api/onedrive',
    maxAge: 600,
  });
  return res;
}

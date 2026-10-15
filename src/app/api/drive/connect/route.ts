import { NextResponse } from 'next/server';
import { authUrl, oauthConfigured, resolveDriveEnv } from '@/lib/drive/google';
import { capGuard } from '@/lib/integrations/guard';

// Starts the one-time connection of the Hub's Google account. For whoever holds «إدارة مزودي
// التخزين» (the Director and the administrator by default); the database decides again when the
// token is stored.
// The state value is kept in a short-lived cookie and checked again on the way back.
export async function GET(request: Request) {
  const g = await capGuard(request, 'storage.manage', false);
  if (!g.ok) return g.response;
  const env = await resolveDriveEnv();
  if (!oauthConfigured(env)) return Response.json({ error: 'لم يُدخل معرّف عميل Google وسره بعد. أدخلهما من «الإعدادات» ثم «الاتصالات».' }, { status: 503 });

  const origin = new URL(request.url).origin;
  const state = crypto.randomUUID();
  const hint = process.env.GOOGLE_DRIVE_ACCOUNT_HINT;
  const res = NextResponse.redirect(authUrl(env, origin, state, hint));
  res.cookies.set('drive_oauth_state', state, {
    httpOnly: true,
    secure: origin.startsWith('https://'),
    sameSite: 'lax',
    path: '/api/drive',
    maxAge: 600,
  });
  return res;
}

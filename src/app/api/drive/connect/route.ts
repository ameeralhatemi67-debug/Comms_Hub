import { NextResponse } from 'next/server';
import { authUrl, oauthConfigured, readDriveEnv } from '@/lib/drive/google';
import { guard } from '@/lib/drive/guard';

// Starts the one-time connection of the Hub's Google account. Administrators only.
// The state value is kept in a short-lived cookie and checked again on the way back.
export async function GET(request: Request) {
  const g = await guard(request, { admin: true });
  if (!g.ok) return g.response;
  if (!oauthConfigured()) return Response.json({ error: 'لم يُضبط عميل Google OAuth بعد.' }, { status: 503 });

  const origin = new URL(request.url).origin;
  const state = crypto.randomUUID();
  const hint = process.env.GOOGLE_DRIVE_ACCOUNT_HINT;
  const res = NextResponse.redirect(authUrl(readDriveEnv(), origin, state, hint));
  res.cookies.set('drive_oauth_state', state, {
    httpOnly: true,
    secure: origin.startsWith('https://'),
    sameSite: 'lax',
    path: '/api/drive',
    maxAge: 600,
  });
  return res;
}

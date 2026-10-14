import { DriveError, getDrive, driveConfigured, oauthConfigured } from '@/lib/drive/google';
import { recordHealth } from '@/lib/integrations/vault';
import { guard } from '@/lib/drive/guard';
import { isAdmin } from '@/lib/access';

const noStore = { 'Cache-Control': 'no-store' };

// What the Media page and the Admin integrations list show: is Drive connected.
export async function GET(request: Request) {
  const g = await guard(request);
  if (!g.ok) return g.response;
  const admin = isAdmin(g.account);

  if (!driveConfigured()) {
    return Response.json(
      { state: oauthConfigured() ? 'needs-connection' : 'not-configured', canConnect: admin && oauthConfigured() },
      { headers: noStore },
    );
  }
  try {
    const email = await getDrive().account();
    await recordHealth('google_drive', true, null, email ? { account: email } : undefined);
    return Response.json({ state: 'connected', account: admin ? email : undefined, canConnect: admin }, { headers: noStore });
  } catch (e) {
    // No token anywhere: not connected yet. Otherwise the token was revoked or the account
    // changed: connecting again fixes it. The check is recorded in the integrations core.
    const none = e instanceof DriveError && e.message === 'DRIVE_NOT_CONFIGURED';
    await recordHealth('google_drive', false, none ? 'NOT_CONNECTED' : e instanceof DriveError ? e.message : 'DRIVE_ERROR');
    if (none)
      return Response.json({ state: oauthConfigured() ? 'needs-connection' : 'not-configured', canConnect: admin && oauthConfigured() }, { headers: noStore });
    return Response.json({ state: 'error', canConnect: admin }, { headers: noStore });
  }
}

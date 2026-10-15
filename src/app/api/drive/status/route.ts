import { DriveError, getDrive, driveConfigured, oauthConfigured, resolveDriveEnv } from '@/lib/drive/google';
import { recordHealth } from '@/lib/integrations/vault';
import { guard } from '@/lib/drive/guard';
import { serverClient } from '@/lib/supabase/server';

const noStore = { 'Cache-Control': 'no-store' };

// What the Media page and the Admin integrations list show: is Drive connected.
export async function GET(request: Request) {
  const g = await guard(request);
  if (!g.ok) return g.response;
  // Who may connect: the capability, not the role (the Director holds it by default).
  const admin = (await (await serverClient()).rpc('has_capability', { p_cap: 'storage.manage', p_scope: null })).data === true;
  const env = await resolveDriveEnv();

  if (!driveConfigured(env)) {
    return Response.json(
      { state: oauthConfigured(env) ? 'needs-connection' : 'not-configured', canConnect: admin && oauthConfigured(env) },
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
      return Response.json({ state: oauthConfigured(env) ? 'needs-connection' : 'not-configured', canConnect: admin && oauthConfigured(env) }, { headers: noStore });
    return Response.json({ state: 'error', canConnect: admin }, { headers: noStore });
  }
}

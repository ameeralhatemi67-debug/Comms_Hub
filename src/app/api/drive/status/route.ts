import { getDrive, driveConfigured, oauthConfigured } from '@/lib/drive/google';
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
    return Response.json({ state: 'connected', account: admin ? email : undefined, canConnect: admin }, { headers: noStore });
  } catch {
    // The token was revoked or the account changed: connecting again fixes it.
    return Response.json({ state: 'error', canConnect: admin }, { headers: noStore });
  }
}

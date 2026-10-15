import { NextResponse, type NextRequest } from 'next/server';
import { capGuard } from '@/lib/integrations/guard';
import { forgetCreds, integrationCreds, serverKeyOrNull } from '@/lib/integrations/vault';
import { forgetProvider } from '@/lib/storage';
import { StorageError } from '@/lib/storage/provider';
import { onedriveExchangeCode } from '@/lib/storage/onedrive';

// Microsoft sends the person back here with a one-time code. The code is exchanged on the server,
// the refresh token goes straight into the vault as a storage provider (kind storage, type
// onedrive) and is never shown, in a URL or a page. A reconnection of the same account replaces
// its token in place, so the files already kept there stay attached.
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const back = (q: string) => {
    const r = NextResponse.redirect(`${url.origin}/settings?tab=connections&${q}`);
    r.cookies.delete({ name: 'onedrive_oauth_state', path: '/api/onedrive' });
    return r;
  };
  const g = await capGuard(request, 'storage.manage', false);
  if (!g.ok) return g.response;

  const expected = request.cookies.get('onedrive_oauth_state')?.value;
  const state = url.searchParams.get('state');
  const code = url.searchParams.get('code');
  if (url.searchParams.get('error')) return back('onedrive_error=CODE_REFUSED');
  if (!expected || !state || state !== expected || !code) return back('onedrive_error=CODE_REFUSED');

  const app = await integrationCreds('microsoft_app', 'إكمال ربط OneDrive');
  const clientId = typeof app?.config.app_id === 'string' ? app.config.app_id : '';
  if (!app || !clientId) return back('onedrive_error=APP_NOT_CONFIGURED');

  try {
    const t = await onedriveExchangeCode({ clientId, secret: app.secret, redirectUri: `${url.origin}/api/onedrive/callback`, code });
    const { data, error } = await g.db.rpc('onedrive_provider_set', {
      p_key: serverKeyOrNull(),
      p_account: t.account,
      p_label: `OneDrive ${t.account}`.slice(0, 60),
      p_secret: t.refresh,
    });
    if (error || typeof data !== 'string') return back(`onedrive_error=${error?.message.includes('PROVIDER_LIMIT') ? 'PROVIDER_LIMIT' : error?.message.includes('FORBIDDEN') ? 'FORBIDDEN' : 'SAVE_FAILED'}`);
    forgetProvider(data);
    forgetCreds('microsoft_app');
    return back('onedrive=connected');
  } catch (e) {
    return back(`onedrive_error=${e instanceof StorageError ? e.message : 'CODE_REFUSED'}`);
  }
}

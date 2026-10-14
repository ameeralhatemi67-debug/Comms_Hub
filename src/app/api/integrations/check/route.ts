import { DriveError, getDrive, oauthConfigured, resetDrive } from '@/lib/drive/google';
import { capGuard } from '@/lib/integrations/guard';
import { recordHealth } from '@/lib/integrations/vault';

// «فحص الآن» in Settings: asks each provider now and records the result in the integrations
// core. Today the one provider is Google Drive.
export async function POST(request: Request) {
  const g = await capGuard(request, 'settings.view', true);
  if (!g.ok) return g.response;
  resetDrive(); // read the token again, in case it was just stored
  let ok = false;
  let error: string | null = null;
  try {
    const email = await getDrive().account();
    ok = true;
    await recordHealth('google_drive', true, null, email ? { account: email } : undefined);
  } catch (e) {
    error = !oauthConfigured() ? 'NOT_CONFIGURED' : e instanceof DriveError && e.message === 'DRIVE_NOT_CONFIGURED' ? 'NOT_CONNECTED' : e instanceof DriveError ? e.message : 'DRIVE_ERROR';
    await recordHealth('google_drive', false, error);
  }
  return Response.json({ google_drive: { ok, error } }, { headers: { 'Cache-Control': 'no-store' } });
}

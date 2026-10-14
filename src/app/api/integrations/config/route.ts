import { driveRefreshToken } from '@/lib/drive/google';
import { capGuard } from '@/lib/integrations/guard';
import { vaultReachable } from '@/lib/integrations/vault';

// Which server settings are present, as yes or no only (Settings_Integrations_Plan.md 5,
// «عام»). Never a value, a length or a prefix.
const NAMES = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'MAIL_SERVER_KEY',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_DRIVE_REFRESH_TOKEN',
  'GMAIL_ADDRESS',
  'GMAIL_APP_PASSWORD',
  'MAIL_SITE_URL',
  'WHATSAPP_SERVER_KEY',
  'WHATSAPP_LINK_SECRET',
] as const;

export async function GET(request: Request) {
  const g = await capGuard(request, 'settings.view', false);
  if (!g.ok) return g.response;
  const present = Object.fromEntries(NAMES.map((n) => [n, Boolean(process.env[n])]));
  const { source } = await driveRefreshToken();
  return Response.json({ present, vault: vaultReachable(), driveToken: source }, { headers: { 'Cache-Control': 'no-store' } });
}

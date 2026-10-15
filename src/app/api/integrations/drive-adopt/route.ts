import { fail } from '@/lib/drive/guard';
import { createDrive, readDriveEnv, resetDrive, resolveDriveEnv } from '@/lib/drive/google';
import { capGuard } from '@/lib/integrations/guard';
import { DRIVE_INTEGRATION_ID, storeChecked } from '@/lib/integrations/vault';

// Moves the Drive refresh token the server already has in GOOGLE_DRIVE_REFRESH_TOKEN into the
// vault, without anyone seeing it: the server reads it, checks it against Google, and stores
// it. The environment variable stays as a fallback until the owner removes it.
export async function POST(request: Request) {
  const g = await capGuard(request, 'integrations.secrets', true);
  if (!g.ok) return g.response;
  const env = await resolveDriveEnv();
  const fallback = readDriveEnv().refreshToken;
  if (!fallback) return fail(404, 'لا يوجد رمز في متغيرات الخادم لنقله.');
  const stored = await storeChecked(g.db, DRIVE_INTEGRATION_ID, 'google_drive', fallback, async (t) => {
    const who = await createDrive({ env: { ...env, refreshToken: t } }).account().catch(() => null);
    return who ? { ok: true, config: { account: who } } : { ok: false, error: 'TOKEN_REFUSED' };
  });
  if (!stored.ok)
    return fail(stored.error === 'TOKEN_REFUSED' ? 409 : 503, stored.error === 'TOKEN_REFUSED' ? 'رفضت Google الرمز الحالي. اربط Drive من جديد.' : 'تعذّر الحفظ في خزنة الأسرار.');
  resetDrive();
  return Response.json({ tail: stored.tail }, { headers: { 'Cache-Control': 'no-store' } });
}

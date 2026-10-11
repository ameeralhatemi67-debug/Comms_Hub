import { NextResponse, type NextRequest } from 'next/server';
import { createDrive, exchangeCode, oauthConfigured, readDriveEnv } from '@/lib/drive/google';
import { guard } from '@/lib/drive/guard';

const entities: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => entities[c]);

function page(body: string, status = 200) {
  const html = `<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ربط Google Drive</title>
<body style="font-family:system-ui,Segoe UI,Tahoma,sans-serif;max-width:640px;margin:40px auto;padding:0 16px;line-height:1.9;color:#10241d">${body}</body></html>`;
  return new NextResponse(html, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' },
  });
}

// Google sends the person back here. The refresh token is shown once, to the
// administrator who connected, to be pasted into the server's environment. It is
// never stored by the Hub and never written to a log.
export async function GET(request: NextRequest) {
  const g = await guard(request, { admin: true });
  if (!g.ok) return g.response;
  if (!oauthConfigured()) return page('<p>لم يُضبط عميل Google OAuth.</p>', 503);

  const url = new URL(request.url);
  const expected = request.cookies.get('drive_oauth_state')?.value;
  const state = url.searchParams.get('state');
  const code = url.searchParams.get('code');
  if (url.searchParams.get('error'))
    return page('<h1>لم يكتمل الربط</h1><p>رُفض الطلب من Google. ارجع وحاول مجدداً.</p>', 400);
  if (!expected || !state || state !== expected || !code)
    return page('<h1>لم يكتمل الربط</h1><p>انتهت صلاحية الطلب أو لم يبدأ من هنا. ابدأ من «ربط Google Drive» مجدداً.</p>', 400);

  try {
    const env = readDriveEnv();
    const { refreshToken } = await exchangeCode(env, url.origin, code);
    if (!refreshToken)
      return page(
        '<h1>لم يصل رمز دائم</h1><p>افتح <a href="https://myaccount.google.com/permissions">أذونات حساب Google</a> وأزل «Comms Hub»، ثم ابدأ الربط من جديد.</p>',
        400,
      );
    const email = await createDrive({ env: { ...env, refreshToken } })
      .account()
      .catch(() => null);
    const res = page(`<h1>تم الربط</h1>
<p>الحساب المرتبط: <b dir="ltr">${esc(email ?? 'غير معروف')}</b></p>
<p>انسخ القيمة التالية إلى متغير البيئة <code dir="ltr">GOOGLE_DRIVE_REFRESH_TOKEN</code> في Vercel وفي <code dir="ltr">.env.local</code>، ثم أعد النشر. لا تشاركها مع أحد، ولا تضعها في المستودع.</p>
<textarea readonly dir="ltr" rows="5" style="width:100%;font-family:ui-monospace,Consolas,monospace;font-size:13px" onfocus="this.select()">${esc(refreshToken)}</textarea>
<p>يمكنك إغلاق هذه الصفحة بعد النسخ.</p>`);
    res.cookies.delete({ name: 'drive_oauth_state', path: '/api/drive' });
    return res;
  } catch {
    return page('<h1>لم يكتمل الربط</h1><p>تعذّر تبادل الرمز مع Google. تحقق من معرّف العميل والسر ثم حاول مجدداً.</p>', 502);
  }
}

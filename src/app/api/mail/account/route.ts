import { fail, guard } from '@/lib/drive/guard';
import { forgetCreds, serverKeyOrNull, vaultReachable } from '@/lib/integrations/vault';
import { testMailbox } from '@/lib/mail/gmail';
import { json } from '@/lib/platforms/route';
import { serverClient } from '@/lib/supabase/server';

// Enters the shared mailbox's address and app password once, into the vault. The site logs in to
// Gmail with them first and keeps nothing if Gmail refuses. Write-only: the password is never
// returned or shown again. For holders of «تعديل الإعدادات العامة للنظام» and «إدخال أسرار
// التكاملات وتجديدها» (the Director and the administrator by default); the database decides again.
export async function POST(request: Request) {
  const g = await guard(request, { mutating: true });
  if (!g.ok) return g.response;
  if (!vaultReachable()) return fail(503, 'خزنة الأسرار غير متاحة: مفتاح الخادم غير مضبوط.');

  const body = (await request.json().catch(() => null)) as { address?: unknown; password?: unknown } | null;
  const address = typeof body?.address === 'string' ? body.address.trim().toLowerCase() : '';
  const password = typeof body?.password === 'string' ? body.password.replace(/\s+/g, '') : '';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address) || address.length > 120) return fail(400, 'اكتب عنوان البريد كاملاً.');
  if (password.length < 8 || password.length > 200) return fail(400, 'كلمة مرور التطبيق من 8 إلى 200 خانة.');

  const db = await serverClient();
  const allowed = await Promise.all([db.rpc('has_capability', { p_cap: 'settings.manage', p_scope: null }), db.rpc('has_capability', { p_cap: 'integrations.secrets', p_scope: null })]);
  if (allowed.some((a) => a.data !== true)) return fail(403, 'لا تملك صلاحية إدخال أسرار التكاملات.');

  const checked = await testMailbox(address, password);
  if (!checked.ok)
    return fail(
      400,
      checked.error === 'MAIL_AUTH_REFUSED'
        ? 'رفض Gmail العنوان أو كلمة مرور التطبيق. تأكد من التحقق بخطوتين ومن كلمة مرور التطبيق، ومن تفعيل IMAP.'
        : 'تعذّر الوصول إلى Gmail الآن. أعد المحاولة بعد قليل.',
    );

  const { data, error } = await db.rpc('mail_account_set', { p_key: serverKeyOrNull(), p_address: address, p_secret: password });
  if (error) return fail(error.message.includes('FORBIDDEN') ? 403 : 400, 'تعذّر حفظ البريد.');
  forgetCreds('gmail_account');
  return json({ ok: true, tail: String(data ?? ''), address });
}

import { serverClient } from '@/lib/supabase/server';
import { fullWhen } from '@/lib/mail/rules';

// The page an outside party opens from the date buttons in our mail. The token is the
// only credential. Opening the page changes nothing (mail scanners open links on their
// own); only pressing a button here records an answer, once.

const page = (title: string, inner: string, status = 200) =>
  new Response(
    `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
      `<meta name="robots" content="noindex,nofollow"><title>${title}</title><style>` +
      `body{margin:0;background:#f4f6f2;color:#203e35;font:16px/1.9 Tahoma,Arial,sans-serif;padding:24px 16px}` +
      `main{max-width:520px;margin:40px auto;background:#fff;border:1px solid #dfe6e0;border-radius:14px;padding:28px}` +
      `h1{font-size:22px;margin:0 0 8px}p{margin:8px 0;color:#4a6258}b{color:#203e35}` +
      `button{font:inherit;min-height:44px;padding:8px 18px;border-radius:8px;border:1px solid #17634b;cursor:pointer}` +
      `.ok{background:#17634b;color:#fff}.alt{background:#fff;color:#17634b}input{font:inherit;padding:8px;border:1px solid #c9d4cb;border-radius:8px;width:100%;box-sizing:border-box;margin:6px 0 12px}` +
      `form{margin-top:18px}small{color:#64766b}</style></head><body><main>${inner}</main></body></html>`,
    {
      status,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'Referrer-Policy': 'no-referrer',
        'X-Robots-Tag': 'noindex, nofollow',
        'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'",
      },
    },
  );

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const gone = () => page('الرابط غير صالح', '<h1>الرابط غير صالح أو انتهت صلاحيته</h1><p>تواصل مع إدارة الاتصال المؤسسي بالرد على الرسالة.</p>', 404);
const valid = (t: string) => /^[0-9a-f]{64}$/.test(t);

type Peek = { name: string; proposed: string; state: string; used: boolean; channels: string[] };

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!valid(token)) return gone();
  const { data } = await (await serverClient()).rpc('mail_date_peek', { p_token: token });
  const p = data as Peek | null;
  if (!p) return gone();
  if (p.used || p.state !== 'pending')
    return page('تم تسجيل ردكم', `<h1>تم تسجيل ردكم</h1><p>وصل ردكم على موعد نشر «${esc(p.name)}». شكراً لكم.</p>`);
  return page(
    'تأكيد موعد النشر',
    `<h1>موعد نشر «${esc(p.name)}»</h1><p>الموعد المقترح: <b>${esc(fullWhen(p.proposed, true))}</b></p>` +
      `<form method="post"><input type="hidden" name="a" value="confirm"><button class="ok">تأكيد الموعد</button></form>` +
      `<form method="post"><input type="hidden" name="a" value="counter"><label for="when">أو اقترحوا موعداً آخر</label>` +
      `<input id="when" name="when" type="datetime-local" required><button class="alt">إرسال الموعد المقترح</button></form>` +
      `<p><small>يُسجَّل رد واحد فقط. الرابط صالح 72 ساعة من إرسال الرسالة.</small></p>`,
  );
}

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!valid(token)) return gone();
  const form = await request.formData().catch(() => null);
  const answer = form?.get('a');
  const when = form?.get('when');
  if (answer !== 'confirm' && answer !== 'counter') return gone();
  let counter: string | null = null;
  if (answer === 'counter') {
    // datetime-local carries no zone: the department works in Riyadh time (UTC+3).
    if (typeof when !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(when)) return gone();
    counter = new Date(`${when}:00+03:00`).toISOString();
  }
  const { data } = await (await serverClient()).rpc('mail_date_answer', { p_token: token, p_answer: answer, p_counter: counter });
  if (data !== true) return gone();
  return page(
    'تم تسجيل ردكم',
    answer === 'confirm'
      ? '<h1>تم تأكيد الموعد</h1><p>شكراً لكم. وصل التأكيد إلى فريق النشر.</p>'
      : `<h1>وصل اقتراحكم</h1><p>اقترحتم ${esc(fullWhen(counter!, true))}. سيتواصل معكم فريق النشر.</p>`,
  );
}

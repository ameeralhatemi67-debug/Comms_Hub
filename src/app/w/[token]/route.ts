import { readWaEnv, verifyLink } from '@/lib/whatsapp/server';

// The link at the end of a WhatsApp message (Permissions_Plan.md 8.6): a signed token of the
// outbox row, the recipient, the message, its room and an expiry. A valid one opens that
// conversation at that message; the page then applies row level security as always, so the
// link cannot show a room the person is not in. Opening it changes nothing.
const gone = () =>
  new Response(
    '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<meta name="robots" content="noindex,nofollow"><title>الرابط غير صالح</title><style>body{margin:0;background:#f4f6f2;color:#203e35;font:16px/1.9 Tahoma,Arial,sans-serif;padding:24px 16px}' +
      'main{max-width:520px;margin:40px auto;background:#fff;border:1px solid #dfe6e0;border-radius:14px;padding:28px}h1{font-size:22px;margin:0 0 8px}a{color:#17634b}</style></head>' +
      '<body><main><h1>الرابط غير صالح أو انتهت صلاحيته</h1><p>روابط رسائل واتساب صالحة أربعة عشر يوماً. افتح «المراسلة» في المركز لترى المحادثة.</p><p><a href="/mail/chat">فتح المراسلة</a></p></main></body></html>',
    {
      status: 404,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex, nofollow' },
    },
  );

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const secret = readWaEnv().secret;
  if (!secret) return gone();
  const p = verifyLink(secret, decodeURIComponent(token), Date.now());
  if (!p) return gone();
  // A relative location: the browser stays on the address the person opened.
  const to = `/mail/chat?${new URLSearchParams({ room: p.g, msg: p.m })}`;
  return new Response(null, { status: 303, headers: { Location: to, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
}

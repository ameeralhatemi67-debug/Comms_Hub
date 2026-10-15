import { guard, fail } from '@/lib/drive/guard';
import { inviteMessage, rejectedMessage } from '@/lib/entry';
import { mailboxConfigured, resolveMailEnv, sendNotice } from '@/lib/mail/gmail';
import { permError } from '@/lib/permissions';
import { serverClient } from '@/lib/supabase/server';

// Sends one email to a person an administrator added: the invitation (kind "invite"), or
// the short notice that an access request was refused (kind "rejected"). The database
// decides whether the caller may (members.invite, over a person they manage) and spaces
// invitations a minute apart; this route only sends and records that it did.
export async function POST(request: Request) {
  const g = await guard(request, { mutating: true });
  if (!g.ok) return g.response;

  const body = (await request.json().catch(() => null)) as { email?: unknown; kind?: unknown } | null;
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  const kind = body?.kind === 'rejected' ? 'rejected' : 'invite';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail(400, 'اكتب بريداً إلكترونياً صحيحاً.');

  const env = await resolveMailEnv();
  if (!mailboxConfigured(env)) return fail(503, 'صندوق البريد غير مضبوط على الخادم، فلا يُرسل الموقع رسائل.');
  const site = (env.site || new URL(request.url).origin).replace(/\/+$/, '');
  const db = await serverClient();

  if (kind === 'rejected') {
    const r = await db.rpc('request_reject_notice', { p_email: email });
    if (r.error) return fail(403, permError(r.error.message));
    const name = (r.data as { name?: string } | null)?.name;
    // Nothing to send: already told, or not refused just now.
    if (!name) return Response.json({ sent: false }, { headers: { 'Cache-Control': 'no-store' } });
    const m = rejectedMessage({ name });
    try {
      await sendNotice(env, { to: [email], ...m });
    } catch {
      return fail(502, 'تعذّر إرسال الرسالة عبر Gmail.');
    }
    return Response.json({ sent: true }, { headers: { 'Cache-Control': 'no-store' } });
  }

  const prep = await db.rpc('invite_prepare', { p_email: email });
  if (prep.error) return fail(400, permError(prep.error.message));
  const who = prep.data as { name: string; role: string; state: string };

  const m = inviteMessage({ name: who.name, role: who.role, email, site, by: g.account.name });
  try {
    await sendNotice(env, { to: [email], ...m });
  } catch {
    return fail(502, 'تعذّر إرسال الدعوة عبر Gmail. تحقق من كلمة مرور التطبيق ثم أعد المحاولة.');
  }
  const mark = await db.rpc('invite_mark', { p_email: email });
  // The email left; failing to record it must not look like a failed send.
  return Response.json({ sent: true, recorded: !mark.error, state: who.state }, { headers: { 'Cache-Control': 'no-store' } });
}

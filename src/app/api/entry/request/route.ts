import { fail } from '@/lib/drive/guard';
import { sameOrigin } from '@/lib/drive/media';
import { requestNoticeMessage } from '@/lib/entry';
import { mailboxConfigured, readMailEnv, sendNotice } from '@/lib/mail/gmail';
import { serverClient } from '@/lib/supabase/server';

// «طلب وصول» from the sign-in screen, which has no session. The database records the
// request and puts a notice in the leaders' drawer (request_access). This route then asks,
// with the server key, whom to email about it; the database answers once per new request,
// so a visitor cannot make the site send more than one message per request, and at most
// thirty requests an hour are accepted at all.
export async function POST(request: Request) {
  if (!sameOrigin(request.headers.get('origin'), request.url)) return fail(403, 'طلب من خارج النظام.');
  const b = (await request.json().catch(() => null)) as { email?: unknown; name?: unknown; note?: unknown } | null;
  const email = typeof b?.email === 'string' ? b.email.trim().toLowerCase() : '';
  const name = typeof b?.name === 'string' ? b.name.trim() : '';
  const note = typeof b?.note === 'string' ? b.note.trim() : '';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail(400, 'اكتب بريداً إلكترونياً صحيحاً.');
  if (name.length < 1 || name.length > 80) return fail(400, 'اكتب اسمك.');

  const db = await serverClient();
  const r = await db.rpc('request_access', { p_email: email, p_name: name, p_note: note.slice(0, 500) || null });
  if (r.error) {
    if (r.error.message.includes('INVALID_EMAIL')) return fail(400, 'اكتب بريداً إلكترونياً صحيحاً.');
    if (r.error.message.includes('INVALID_NAME')) return fail(400, 'اكتب اسمك.');
    return fail(502, 'تعذّر إرسال الطلب. حاول مجدداً بعد قليل.');
  }
  const result = String(r.data);

  // Best effort: the notice in the site already exists whether or not the email leaves.
  const env = readMailEnv();
  if (result === 'received' && mailboxConfigured(env)) {
    try {
      const t = await db.rpc('entry_notice_targets', { p_key: env.key, p_email: email });
      const rows = (t.data ?? []) as { to_email: string; full_name: string; applicant_email: string; note: string | null }[];
      if (rows.length) {
        const site = (env.site || new URL(request.url).origin).replace(/\/+$/, '');
        const m = requestNoticeMessage({ name: rows[0].full_name, email: rows[0].applicant_email, note: rows[0].note, site });
        await sendNotice(env, { to: [], bcc: rows.map((x) => x.to_email), ...m });
      }
    } catch {
      // The leaders still see the request in the site.
    }
  }
  return Response.json({ result }, { headers: { 'Cache-Control': 'no-store' } });
}

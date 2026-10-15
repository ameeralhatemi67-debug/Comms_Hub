// The department mailbox: one Gmail account reached over IMAP (reading) and SMTP
// (sending) with a Google app password. Server only. The address, the app password
// and the key the server shows the database live in environment variables and never
// reach a browser (disscussios/connected_account_secrets_management.md, section 33).
import { ImapFlow } from 'imapflow';
import nodemailer from 'nodemailer';
import { simpleParser, type AddressObject } from 'mailparser';
import { integrationCreds } from '../integrations/vault.ts';
import { fullWhen } from './rules.ts';

export type MailEnv = { address?: string; password?: string; key?: string; site?: string };

export const readMailEnv = (): MailEnv => ({
  address: process.env.GMAIL_ADDRESS,
  password: process.env.GMAIL_APP_PASSWORD?.replace(/\s+/g, ''),
  key: process.env.MAIL_SERVER_KEY,
  site: process.env.MAIL_SITE_URL,
});

/**
 * The mailbox the Director entered in the site wins over the environment, which stays as the
 * fallback. The app password is read from the vault for a stated purpose and lives here for a minute.
 */
export async function resolveMailEnv(): Promise<MailEnv> {
  const base = readMailEnv();
  const c = await integrationCreds('gmail_account', 'mail access');
  const address = typeof c?.config.address === 'string' ? c.config.address : '';
  return c && address ? { ...base, address, password: c.secret.replace(/\s+/g, '') } : base;
}

/** Which Gmail refusal is which, in a code the page has words for. */
export type MailboxCheck = { ok: true } | { ok: false; error: 'MAIL_AUTH_REFUSED' | 'MAIL_UNREACHABLE' };

/**
 * Logs in to the mailbox over IMAP and out again: the check made before an address and app password
 * are kept. `connect` is the client factory (tests pass a fake). Nothing is read from the mailbox.
 */
export async function testMailbox(
  address: string,
  password: string,
  connect: (a: string, p: string) => { connect(): Promise<void>; logout(): Promise<void> } = (a, p) => imapClient({ address: a, password: p }),
): Promise<MailboxCheck> {
  const client = connect(address, password.replace(/\s+/g, ''));
  try {
    await client.connect();
    await client.logout().catch(() => undefined);
    return { ok: true };
  } catch (e) {
    const x = e as { authenticationFailed?: boolean; responseText?: string };
    return { ok: false, error: x.authenticationFailed || /AUTHENTICATIONFAILED|Invalid credentials/i.test(x.responseText ?? '') ? 'MAIL_AUTH_REFUSED' : 'MAIL_UNREACHABLE' };
  }
}

/** The server can prove itself to the database (internal mail, files, outside answers). */
export const keyConfigured = (env: MailEnv = readMailEnv()) => Boolean(env.key);
/** The department mailbox is connected (outside mail in and out). */
export const mailboxConfigured = (env: MailEnv = readMailEnv()) => Boolean(env.address && env.password && env.key);

/** Messages read in one sync, at most. The first sync reads only the latest ones. */
const BATCH = 30;

function imapClient(env: MailEnv) {
  return new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: { user: env.address!, pass: env.password! },
    logger: false,
  });
}

const addresses = (a: AddressObject | AddressObject[] | undefined) =>
  (Array.isArray(a) ? a : a ? [a] : []).flatMap((x) => x.value.map((v) => (v.address ?? '').toLowerCase())).filter(Boolean);

export type Inbound = {
  gmail_id: string | null;
  refs: string[];
  from_email: string;
  from_name: string | null;
  to: string[];
  cc: string[];
  subject: string;
  body: string;
  at: string;
  files: { uid: number; index: number; name: string; size: number; mime: string }[];
};

/** New mail in the inbox since the last UID the Hub recorded. */
export async function fetchSince(env: MailEnv, lastUid: number, uidValidity: number | null) {
  const client = imapClient(env);
  await client.connect();
  const lock = await client.getMailboxLock('INBOX', { readOnly: true });
  const out: Inbound[] = [];
  let validity = uidValidity;
  let last = lastUid;
  try {
    const box = client.mailbox;
    if (!box) return { messages: out, lastUid: last, uidValidity: validity };
    const nowValidity = Number(box.uidValidity);
    const next = Number(box.uidNext);
    // A changed UIDVALIDITY means the old numbers are meaningless: start fresh.
    if (validity !== nowValidity) {
      validity = nowValidity;
      last = Math.max(0, next - 1 - BATCH);
    }
    if (next - 1 <= last) return { messages: out, lastUid: last, uidValidity: validity };
    const from = last + 1;
    const to = Math.min(next - 1, last + BATCH);
    for await (const msg of client.fetch(`${from}:${to}`, { uid: true, source: true }, { uid: true })) {
      if (!msg.source || msg.uid <= last) continue;
      const p = await simpleParser(msg.source);
      const sender = p.from?.value[0];
      const refs = [p.inReplyTo, ...(Array.isArray(p.references) ? p.references : p.references ? [p.references] : [])].filter(
        (x): x is string => Boolean(x),
      );
      out.push({
        gmail_id: p.messageId ?? null,
        refs,
        from_email: (sender?.address ?? '').toLowerCase(),
        from_name: sender?.name || null,
        to: addresses(p.to),
        cc: addresses(p.cc),
        subject: p.subject ?? '',
        body: (p.text ?? '').trim().slice(0, 20000),
        at: (p.date ?? new Date()).toISOString(),
        files: p.attachments
          .filter((a) => a.contentDisposition !== 'inline' || !a.contentId)
          .map((a, index) => ({ uid: msg.uid, index, name: a.filename ?? `مرفق-${index + 1}`, size: a.size, mime: a.contentType })),
      });
      last = Math.max(last, msg.uid);
    }
    last = Math.max(last, to);
  } finally {
    lock.release();
    await client.logout().catch(() => {});
  }
  return { messages: out, lastUid: last, uidValidity: validity };
}

/** One attachment of a received message, read again from Gmail. */
export async function inboundAttachment(env: MailEnv, uid: number, index: number) {
  const client = imapClient(env);
  await client.connect();
  const lock = await client.getMailboxLock('INBOX', { readOnly: true });
  try {
    const msg = await client.fetchOne(String(uid), { source: true }, { uid: true });
    if (!msg || !msg.source) return null;
    const p = await simpleParser(msg.source);
    const list = p.attachments.filter((a) => a.contentDisposition !== 'inline' || !a.contentId);
    const a = list[index];
    return a ? { name: a.filename ?? `مرفق-${index + 1}`, mime: a.contentType, content: a.content } : null;
  } finally {
    lock.release();
    await client.logout().catch(() => {});
  }
}

export type Outgoing = {
  id: string;
  subject: string;
  body: string;
  to: string[];
  cc: string[];
  bcc: string[];
  author_name: string | null;
  in_reply_to: string | null;
  references: string[];
  date_token: string | null;
  card: { type?: string; name?: string; proposed?: string } | null;
  refs: { name: string; drive: string; size: number; mime: string; version: number; link: string | null }[];
  files: { name: string; drive: string; size: number; mime: string }[];
};

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** The text and HTML of an outgoing message, with the review links and date buttons. */
export function composeOutgoing(item: Outgoing, site: string) {
  const lines: string[] = [item.body.trim()];
  const html: string[] = [`<div style="white-space:pre-wrap">${escapeHtml(item.body.trim())}</div>`];
  for (const r of item.refs.filter((x) => x.link)) {
    const url = `${site}/r/${r.link}`;
    lines.push('', `«${r.name}» (الإصدار ${r.version}): ${url}`, 'الرابط صالح سبعة أيام.');
    html.push(`<p>«${escapeHtml(r.name)}» (الإصدار ${r.version}): <a href="${url}">فتح الملف</a><br><small>الرابط صالح سبعة أيام.</small></p>`);
  }
  if (item.date_token && item.card?.type === 'date') {
    const ok = `${site}/m/${item.date_token}?a=confirm`;
    const other = `${site}/m/${item.date_token}`;
    const when = item.card.proposed ? fullWhen(item.card.proposed, true) : '';
    lines.push('', `موعد نشر «${item.card.name}» المقترح: ${when} (بتوقيت الرياض)`, `تأكيد الموعد: ${ok}`, `اقتراح موعد آخر: ${other}`);
    html.push(
      `<p>موعد نشر «${escapeHtml(item.card.name ?? '')}» المقترح: <b>${escapeHtml(when)}</b> (بتوقيت الرياض).</p>` +
        `<p><a href="${ok}" style="display:inline-block;padding:8px 16px;background:#17634b;color:#fff;border-radius:6px;text-decoration:none">تأكيد الموعد</a> ` +
        `<a href="${other}" style="display:inline-block;padding:8px 16px;border:1px solid #17634b;color:#17634b;border-radius:6px;text-decoration:none">اقتراح موعد آخر</a></p>` +
        '<p><small>الزران صالحان 72 ساعة.</small></p>',
    );
  }
  return {
    text: lines.join('\n'),
    html: `<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;font-size:15px;line-height:1.9;color:#203e35">${html.join('')}</div>`,
  };
}

/** Sends one message from the department mailbox. Returns its Message-ID. */
export async function sendOutgoing(
  env: MailEnv,
  item: Outgoing,
  attachments: { filename: string; content: Buffer; contentType: string }[],
  site: string,
): Promise<string> {
  const transport = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user: env.address!, pass: env.password! },
  });
  const { text, html } = composeOutgoing(item, site);
  const info = await transport.sendMail({
    from: { name: item.author_name ? `${item.author_name} · إدارة الاتصال المؤسسي` : 'إدارة الاتصال المؤسسي', address: env.address! },
    to: item.to,
    cc: item.cc.length ? item.cc : undefined,
    bcc: item.bcc.length ? item.bcc : undefined,
    subject: item.subject,
    text,
    html,
    inReplyTo: item.in_reply_to ?? undefined,
    references: item.references.length ? item.references : undefined,
    attachments,
  });
  return info.messageId;
}

/**
 * One notice from the department mailbox: the invitation, a request for the leaders, a
 * refusal. Plain text and HTML, no attachments, no thread. Bcc keeps recipients apart.
 */
export async function sendNotice(
  env: MailEnv,
  m: { to: string[]; bcc?: string[]; subject: string; text: string; html: string },
): Promise<void> {
  const transport = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user: env.address!, pass: env.password! },
  });
  await transport.sendMail({
    from: { name: 'مركز الاتصال', address: env.address! },
    to: m.to.length ? m.to : undefined,
    bcc: m.bcc?.length ? m.bcc : undefined,
    subject: m.subject,
    text: m.text,
    html: m.html,
  });
}

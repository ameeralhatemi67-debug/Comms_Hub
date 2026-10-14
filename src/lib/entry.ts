// The entry flow, as pure functions: how far a person got, the wording of the emails the
// site itself sends (the invitation, the notice to the leaders, the notice of a refusal),
// and how to read what Supabase puts on the address when a mailed link fails. Nothing here
// touches the network; the routes under src/app/api/entry do the sending.
import { roleAr } from './permissions.ts';

export type EntryState = 'not_started' | 'unconfirmed' | 'confirmed' | 'active';

export const ENTRY_STATE_AR: Record<EntryState, string> = {
  not_started: 'لم يعيّن كلمة مرور بعد',
  unconfirmed: 'بانتظار فتح رابط التأكيد',
  confirmed: 'أكّد بريده ولم يدخل بعد',
  active: 'دخل المركز',
};

/** What the person still has to do, in one sentence, for the member's card. */
export const ENTRY_NEXT_AR: Record<EntryState, string> = {
  not_started: 'يفتح الموقع ويختار «أول دخول» ويكتب بريده المعتمد وكلمة مرور.',
  unconfirmed: 'يفتح أحدث رسالة تأكيد وصلته، ثم يسجّل الدخول.',
  confirmed: 'يسجّل الدخول من تبويب «تسجيل الدخول».',
  active: '',
};

export const isEntryState = (v: unknown): v is EntryState =>
  v === 'not_started' || v === 'unconfirmed' || v === 'confirmed' || v === 'active';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const wrap = (inner: string) =>
  `<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;font-size:15px;line-height:1.9;color:#203e35">${inner}</div>`;

const button = (href: string, label: string) =>
  `<p><a href="${esc(href)}" style="display:inline-block;padding:8px 16px;background:#17634b;color:#fff;border-radius:6px;text-decoration:none">${esc(label)}</a></p>`;

export type Message = { subject: string; text: string; html: string };

/** The invitation: who added the person, the address, and the steps. */
export function inviteMessage(a: { name: string; role: string; email: string; site: string; by: string }): Message {
  const role = roleAr(a.role) || a.role;
  const steps = [
    `افتح الموقع: ${a.site}`,
    'اختر تبويب «أول دخول».',
    `اكتب هذا البريد (${a.email}) واختر كلمة مرور من 10 أحرف على الأقل.`,
    'سيصلك من النظام رابط تأكيد على البريد نفسه. افتح أحدث رسالة فقط، ثم سجّل الدخول بكلمة المرور التي اخترتها.',
  ];
  const text = [
    `مرحباً ${a.name}،`,
    '',
    `أضافك ${a.by} إلى مركز الاتصال بدور «${role}».`,
    '',
    'لتبدأ:',
    ...steps.map((s, i) => `${i + 1}. ${s}`),
    '',
    'إن لم تكن تتوقع هذه الرسالة فتجاهلها، فلا يُفتح حساب بلا كلمة مرور تختارها أنت.',
  ].join('\n');
  const html = wrap(
    `<p>مرحباً ${esc(a.name)}،</p>` +
      `<p>أضافك <b>${esc(a.by)}</b> إلى مركز الاتصال بدور «${esc(role)}».</p>` +
      `<p>لتبدأ:</p><ol>${steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>` +
      button(a.site, 'فتح مركز الاتصال') +
      '<p><small>إن لم تكن تتوقع هذه الرسالة فتجاهلها، فلا يُفتح حساب بلا كلمة مرور تختارها أنت.</small></p>',
  );
  return { subject: 'دعوة إلى مركز الاتصال', text, html };
}

/** To the leaders: a person asked for access. */
export function requestNoticeMessage(a: { name: string; email: string; note: string | null; site: string }): Message {
  const link = `${a.site}/accounts?tab=requests`;
  const text = [
    `طلب وصول جديد إلى مركز الاتصال من ${a.name} (${a.email}).`,
    a.note ? `السبب المكتوب: ${a.note}` : '',
    '',
    `للقبول أو الرفض: ${link}`,
  ]
    .filter((x, i) => x !== '' || i > 0)
    .join('\n');
  const html = wrap(
    `<p>طلب وصول جديد إلى مركز الاتصال من <b>${esc(a.name)}</b> (<bdi dir="ltr">${esc(a.email)}</bdi>).</p>` +
      (a.note ? `<p>السبب المكتوب: ${esc(a.note)}</p>` : '') +
      button(link, 'فتح طلبات الوصول'),
  );
  return { subject: `طلب وصول جديد: ${a.name}`, text, html };
}

/** To the applicant when the request is refused. No reason is promised; the leaders may add one by hand. */
export function rejectedMessage(a: { name: string }): Message {
  const text = [
    `مرحباً ${a.name}،`,
    '',
    'لم يُقبل طلب وصولك إلى مركز الاتصال هذه المرة.',
    'للاستفسار تواصل مع مسؤول النظام مباشرة.',
  ].join('\n');
  const html = wrap(`<p>مرحباً ${esc(a.name)}،</p><p>لم يُقبل طلب وصولك إلى مركز الاتصال هذه المرة.</p><p>للاستفسار تواصل مع مسؤول النظام مباشرة.</p>`);
  return { subject: 'طلب الوصول إلى مركز الاتصال', text, html };
}

export type LinkProblem = { kind: 'expired' | 'denied'; code: string };

/**
 * Supabase sends a failed or used link back to the site with the reason in the hash
 * (`#error=access_denied&error_code=otp_expired&...`) or, with a code exchange, in the
 * query string. Returns null for an address with no error in it.
 */
export function linkProblem(hash: string, search: string): LinkProblem | null {
  const read = (s: string) => new URLSearchParams(s.replace(/^[#?]/, ''));
  for (const p of [read(hash), read(search)]) {
    const error = p.get('error');
    const code = p.get('error_code');
    if (!error && !code) continue;
    const c = (code ?? error ?? '').toLowerCase();
    const expired = c.includes('expired') || c.includes('invalid') || (p.get('error_description') ?? '').toLowerCase().includes('expired');
    return { kind: expired ? 'expired' : 'denied', code: c };
  }
  return null;
}

/** Browser side: asks the site to send a person's invitation. Returns the failure in words, or null. */
export async function sendInvite(email: string): Promise<string | null> {
  try {
    const res = await fetch('/api/entry/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, kind: 'invite' }),
    });
    const out = (await res.json().catch(() => ({}))) as { error?: string };
    return res.ok ? null : (out.error ?? 'تعذّر إرسال الدعوة.');
  } catch {
    return 'تعذّر الاتصال بالموقع. حاول مجدداً.';
  }
}

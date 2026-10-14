// WhatsApp, the rules the interface and the dispatch route share (Permissions_Plan.md 8).
// Pure and safe for the browser: no secret, no crypto. The database decides every rule
// (supabase/migrations/20261014100000_whatsapp.sql); this words it and builds the text of a
// message at dispatch. Signing and the code live in ./server.ts, on the server only.
import { URGENCY_AR, type Urgency } from '../chat/rules.ts';

export type OutboxKind = 'urgent' | 'push' | 'code' | 'test';
export type OutboxState = 'queued' | 'sending' | 'sent' | 'failed';
export type OutboxRow = {
  id: string;
  kind: OutboxKind;
  message_id: string | null;
  room_id: string | null;
  recipient: string;
  sender: string | null;
  state: OutboxState;
  error: string | null;
  created_at: string;
  sent_at: string | null;
};

/** One row as wa_claim returns it: what the package needs, read at dispatch. */
export type Claimed = {
  id: string;
  kind: OutboxKind;
  recipient: string;
  to: string;
  nonce?: string | null;
  sender_name?: string | null;
  message_id?: string | null;
  room_id?: string | null;
  room_name?: string | null;
  urgency?: number | null;
  msg_kind?: string | null;
  body?: string | null;
  data?: Record<string, unknown> | null;
};

/** What the bridge receives: a destination taken from a claimed row, and the text. */
export type WaItem = { id: string; kind: OutboxKind; to: string; text: string };

export type WaMe = {
  on: boolean;
  phone: string | null;
  verified_at: string | null;
  from_level: 2 | 3;
  pushed: boolean;
  pending: { phone: string; expires_at: string; left: number } | null;
  mutes: string[];
  system: { enabled: boolean; online: boolean; heartbeat_at: string | null; name: string };
};

export const DEFAULT_MAX_CHARS = 1000;
export const CODE_MINUTES = 10;
export const LINK_DAYS = 14;

/**
 * A number in international form, +<country><number>, 8 to 15 digits. Accepts spaces,
 * dashes and brackets, and 00 for +. A local number without its country code is refused:
 * the system must not guess the country.
 */
export function normalisePhone(input: string): string | null {
  const s = (input ?? '').replace(/[\s\-().]/g, '').replace(/^00/, '+');
  return /^\+[1-9][0-9]{7,14}$/.test(s) ? s : null;
}

/** Shown to the number's owner and to an administrator only (D-12): the last digits stay readable. */
export const maskPhone = (p: string | null | undefined) => (p ? `${p.slice(0, 4)}${'•'.repeat(Math.max(0, p.length - 7))}${p.slice(-3)}` : '');

export const LEVEL_CHOICES: { v: 2 | 3; label: string }[] = [
  { v: 3, label: '«عاجل» فقط' },
  { v: 2, label: '«مهم» و«عاجل»' },
];

/** The connection line, from the bridge's last heartbeat. */
export function systemLine(s: Pick<WaMe['system'], 'enabled' | 'online' | 'heartbeat_at'>, now: number): string {
  if (!s.enabled) return 'واتساب النظام متوقف الآن، فلا يُرسل شيء.';
  if (s.online) return 'متصل';
  if (!s.heartbeat_at) return 'غير متصل بعد. ما يُرسل ينتظر حتى يتصل.';
  const min = Math.max(1, Math.round((now - Date.parse(s.heartbeat_at)) / 60000));
  const ago = min < 60 ? `${min} دقيقة` : min < 1440 ? `${Math.round(min / 60)} ساعة` : `${Math.round(min / 1440)} يوم`;
  return `غير متصل منذ ${ago}. ما يُرسل ينتظر ولا يضيع، ويصل حين يعود.`;
}

export const STATE_AR: Record<OutboxState, string> = {
  queued: 'لم تُسلَّم بعد',
  sending: 'تُرسل الآن',
  sent: 'أُرسلت',
  failed: 'تعذّرت',
};
export const KIND_AR: Record<OutboxKind, string> = { urgent: 'بحسب الدرجة', push: 'مدفوعة منك', code: 'رمز تحقق', test: 'رسالة تجربة' };

/** The delivery line under a message its author sent: counts by state. */
export function deliverySummary(rows: Pick<OutboxRow, 'state'>[]): { sent: number; waiting: number; failed: number; text: string } {
  const sent = rows.filter((r) => r.state === 'sent').length;
  const waiting = rows.filter((r) => r.state === 'queued' || r.state === 'sending').length;
  const failed = rows.filter((r) => r.state === 'failed').length;
  const parts = [sent && `أُرسلت إلى ${sent}`, waiting && `لم تُسلَّم بعد ${waiting}`, failed && `تعذّرت ${failed}`].filter(Boolean);
  return { sent, waiting, failed, text: parts.length ? `واتساب: ${parts.join(' · ')}` : '' };
}

/** Why a push to this person cannot be offered, without saying anything about their number. */
export function pushBlock(o: { hasCap: boolean; systemOn: boolean; author: boolean; target: { push: boolean } | undefined }): string {
  if (!o.author) return 'تُرسل إلى واتساب رسالتك أنت فقط.';
  if (!o.systemOn) return 'واتساب النظام متوقف الآن.';
  if (!o.hasCap) return 'الإرسال إلى واتساب زميل بصلاحية «إرسال رسالة إلى واتساب زميل»، وهي مقفلة حتى تُمنح.';
  if (!o.target?.push) return 'لا يستقبل هذا الزميل رسائل واتساب منك الآن.';
  return '';
}

const WA_ERRORS: Record<string, string> = {
  WA_OFF: 'فعّل «استلام رسائل واتساب» أولاً.',
  WA_SYSTEM_OFF: 'واتساب النظام متوقف الآن. يشغّله مسؤول النظام.',
  WA_PHONE_BAD: 'اكتب الرقم بصيغته الدولية، مثل +9665xxxxxxxx.',
  WA_PHONE_TAKEN: 'هذا الرقم مرتبط بحساب آخر.',
  WA_RATE: 'طلبت ثلاثة رموز خلال ساعة. انتظر قليلاً ثم أعد المحاولة.',
  WA_NO_CODE: 'اطلب رمزاً أولاً.',
  WA_CODE_EXPIRED: 'انتهت صلاحية الرمز. اطلب رمزاً جديداً.',
  WA_CODE_LOCKED: 'أخطأت الرمز خمس مرات. اطلب رمزاً جديداً.',
  WA_NOT_LINKED: 'لا يوجد رقم واتساب متحقق منه لهذا الحساب.',
  WA_NOT_AUTHOR: 'تُرسل إلى واتساب رسالتك أنت فقط.',
  WA_NOT_MEMBER: 'المستلم ليس عضواً في هذه المحادثة.',
  WA_UNAVAILABLE: 'لا يستقبل هذا الزميل رسائل واتساب منك الآن.',
  WA_ALREADY: 'أُرسلت هذه الرسالة إليه على واتساب من قبل.',
  WA_DAILY_CAP: 'بلغت حد الرسائل المدفوعة إلى واتساب اليوم.',
  WA_PUSH: 'الإرسال إلى واتساب زميل بصلاحية «إرسال رسالة إلى واتساب زميل».',
  WA_NOT_FAILED: 'هذه الرسالة لم تتعذّر، فلا حاجة لإعادتها.',
  FORBIDDEN: 'لا تملك هذا الإجراء.',
};
export function waError(message: string | null | undefined): string {
  const m = message ?? '';
  const code = Object.keys(WA_ERRORS).find((k) => k !== 'FORBIDDEN' && m.includes(k)) ?? (m.includes('FORBIDDEN') ? 'FORBIDDEN' : null);
  return code ? WA_ERRORS[code] : 'تعذّر تنفيذ الطلب. أعد المحاولة.';
}
export const WA_ERROR_CODES = Object.keys(WA_ERRORS);

/** The content of a message in words: a file is named, never attached (plan 8.5). */
export function contentOf(kind: string | null | undefined, body: string | null | undefined, data: Record<string, unknown> | null | undefined): string {
  const d = data ?? {};
  const b = (body ?? '').trim();
  const name = String(d.name ?? '');
  const withBody = (head: string) => (b ? `${head}\n${b}` : head);
  switch (kind) {
    case 'image':
    case 'file':
      return withBody(`مرفق: ${name}`);
    case 'voice':
      return `مرفق: رسالة صوتية ${name}`.trim();
    case 'asset':
      return withBody(`أصل من المكتبة: ${name}`);
    case 'work':
      return withBody(`عمل ${d.id ?? ''}: ${d.title ?? ''}`);
    case 'poll':
      return [`تصويت: ${d.q ?? ''}`, ...((d.options as string[] | undefined) ?? []).map((o, i) => `${i + 1}. ${o}`)].join('\n');
    case 'task':
      return `مهمة: ${d.what ?? ''}`;
    case 'approval':
      return `طلب اعتماد: ${name}`;
    default:
      return b;
  }
}

export const cap = (text: string, max: number) => (text.length <= max ? text : `${text.slice(0, Math.max(1, max - 1)).trimEnd()}…`);

/**
 * The text that goes out, plan 8.5: the sender's name (and the conversation, for a group),
 * the level when above 0, the full content up to the length cap, and the link. One way (D-6):
 * it says plainly that replies are not read.
 */
export function packageText(c: Claimed, o: { link: string | null; maxChars?: number; code?: string }): string {
  if (c.kind === 'code') return `رمز التحقق لربط واتساب بحسابك في مركز الاتصال: ${o.code}\nصالح ${CODE_MINUTES} دقائق. إن لم تطلبه فتجاهل هذه الرسالة، ولا تشاركه مع أحد.`;
  if (c.kind === 'test') return 'رسالة تجربة من واتساب النظام في مركز الاتصال. وصولها يعني أن الربط يعمل.';
  const lines = [c.room_name ? `${c.sender_name ?? ''} في «${c.room_name}»` : `${c.sender_name ?? ''}`];
  const u = (c.urgency ?? 0) as Urgency;
  if (u > 0) lines.push(`«${URGENCY_AR[u]}»`);
  lines.push(cap(contentOf(c.msg_kind, c.body, c.data), o.maxChars ?? DEFAULT_MAX_CHARS));
  lines.push('');
  lines.push('لا تُقرأ الردود هنا. للرد افتح المحادثة في المركز:');
  if (o.link) lines.push(o.link);
  return lines.join('\n');
}

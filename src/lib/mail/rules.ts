// Mail rules the interface needs to explain itself: folders, search, who must wait
// for approval, and the Arabic wording of errors and timeline lines. Pure, shared by
// the mail page and the server routes, and covered by tests/mail.test.mjs.
// The database (supabase/migrations/*mail*) enforces every rule; this file only
// predicts its answers so the interface can say them before a click.
import type { Role } from '../domain.ts';

export type ExtStatus = 'new' | 'assigned' | 'waiting' | 'closed';
export type MsgState = 'sent' | 'held' | 'returned' | 'outbox' | 'queued' | 'failed';

export type ThreadRow = {
  id: string;
  kind: 'internal' | 'external';
  subject: string;
  created_by: string;
  created_at: string;
  last_at: string;
  labels: string[];
  links: { type: 'work' | 'asset'; id: string; title?: string }[];
  contact_email: string | null;
  contact_name: string | null;
  ext_status: ExtStatus | null;
  assignee: string | null;
  reply_by: string | null;
  req_no: number | null;
};

export type Card =
  | { type: 'approval'; asset_id: string; name: string; version: number; by: string; state: 'pending' | 'approved' | 'changes' | 'rejected' | 'superseded'; dby?: string; dat?: string; note?: string | null; now?: number }
  | { type: 'date'; asset_id: string; name: string; proposed: string; was?: string | null; channels: string[]; askee: string; by: string; state: 'pending' | 'confirmed' | 'counter'; final?: string; counter?: string; dby?: string; cby?: string; dat?: string }
  | { type: 'task'; task_id: string; what: string; assignee: string; due: string; priority: 'normal' | 'urgent'; by: string; state: 'open' | 'done'; progress: number; asset_id?: string | null; dat?: string | null }
  | { type: 'progress'; asset_id: string; name: string; from: string; to: string; version: number; by: string };

export type SysData = { e: string; [k: string]: unknown };

export type MessageRow = {
  id: string;
  thread_id: string;
  kind: 'mail' | 'note' | 'sys';
  author: string | null;
  from_name: string | null;
  from_email: string | null;
  to_list: string[];
  cc_list: string[];
  bcc_list: string[];
  body: string;
  created_at: string;
  send_at: string | null;
  state: MsgState;
  hold_by: string | null;
  hold_note: string | null;
  ext_sent_at: string | null;
  error: string | null;
  refs: string[];
  files: string[];
  inbound_files: { name: string; size: number; mime: string }[];
  card: (Card | SysData) | null;
};

export type MemberRow = {
  thread_id: string;
  email: string;
  participant: boolean;
  read_at: string | null;
  starred: boolean;
  archived: boolean;
  trashed: boolean;
  muted: boolean;
  snooze_until: string | null;
};

// ---------------------------------------------------------------------------- roles

/** See the whole shared mailbox. Administrators act as any role. */
export const LEAD_ROLES: Role[] = ['director', 'assistant', 'publisher'];
/** Approve versions and outside mail. */
export const APPROVER_ROLES: Role[] = ['director', 'assistant'];
/** May attach a task to a message (the same rule as assigning on the Tasks page). */
export const TASK_ROLES: Role[] = ['director', 'assistant', 'producer'];

export const actsAs = (role: Role, list: Role[]) => role === 'admin' || list.includes(role);
export const isLead = (role: Role) => actsAs(role, LEAD_ROLES);
export const isApprover = (role: Role) => actsAs(role, APPROVER_ROLES);

/**
 * Outside mail from someone other than the director or the assistant waits for one
 * of them, unless it is a reply on a thread assigned to its author.
 */
export function needsApproval(p: { role: Role; me: string; external: boolean; newThread: boolean; assignee: string | null }) {
  return p.external && !isApprover(p.role) && (p.newThread || p.assignee !== p.me);
}

/** Mail attachments follow Gmail's limit inside the Hub too, so any message can go out. */
export const MAIL_ATTACH_BYTES = 25 * 1024 * 1024;

// ---------------------------------------------------------------------------- recipients

export const GROUPS = {
  production: { name: 'فريق الإنتاج', roles: ['producer', 'designer', 'writer'] as Role[] },
  leaders: { name: 'القيادة', roles: ['director', 'assistant'] as Role[] },
  all: { name: 'كل القسم', roles: null },
} as const;
export type GroupId = keyof typeof GROUPS;

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
export const isEmail = (s: string) => EMAIL.test(s.trim());
export const isExternalToken = (t: string) => t.startsWith('e:');
export const tokenOf = {
  person: (email: string) => `p:${email.toLowerCase()}`,
  group: (g: GroupId) => `g:${g}`,
  external: (email: string) => `e:${email.trim().toLowerCase()}`,
};

/** Members of a group, from the people list (administrators are never in a group). */
export function groupMembers(g: GroupId, people: { email: string; role: Role }[]) {
  const roles = GROUPS[g].roles;
  return people.filter((p) => p.role !== 'admin' && (!roles || roles.includes(p.role))).map((p) => p.email);
}

// ---------------------------------------------------------------------------- folders

export type FolderId =
  | 'inbox' | 'action' | 'mine' | 'waiting' | 'starred' | 'snoozed' | 'sent' | 'scheduled'
  | 'drafts' | 'gate' | 'archive' | 'trash' | 'shared:all' | 'shared:unassigned' | 'shared:closed' | `label:${string}`;

export const FOLDERS: { id: FolderId; label: string }[] = [
  { id: 'inbox', label: 'الوارد' },
  { id: 'action', label: 'يحتاج إجراءك' },
  { id: 'mine', label: 'المُسندة إليّ' },
  { id: 'waiting', label: 'بانتظار الرد' },
  { id: 'starred', label: 'المميّزة' },
  { id: 'snoozed', label: 'المؤجلة' },
  { id: 'sent', label: 'المرسلة' },
  { id: 'scheduled', label: 'المجدولة' },
  { id: 'drafts', label: 'المسودات' },
  { id: 'gate', label: 'بانتظار الاعتماد' },
  { id: 'archive', label: 'الأرشيف' },
  { id: 'trash', label: 'المهملات' },
];
export const SHARED_FOLDERS: { id: FolderId; label: string }[] = [
  { id: 'shared:all', label: 'كل المحادثات المفتوحة' },
  { id: 'shared:unassigned', label: 'غير المُسندة' },
  { id: 'shared:closed', label: 'المغلقة' },
];

export const extStatusLabels: Record<ExtStatus, string> = {
  new: 'جديد',
  assigned: 'مُسند',
  waiting: 'بانتظار الرد',
  closed: 'مغلق',
};
export const extStatusTone: Record<ExtStatus, string> = { new: 'info', assigned: 'review', waiting: 'schedule', closed: '' };

export type View = {
  thread: ThreadRow;
  /** Messages this person can see, oldest first. */
  messages: MessageRow[];
  member: MemberRow | null;
};

export const mails = (v: View) => v.messages.filter((m) => m.kind === 'mail');
const isFuture = (iso: string | null, now: number) => Boolean(iso && Date.parse(iso) > now);

export function isSnoozed(v: View, now: number) {
  return isFuture(v.member?.snooze_until ?? null, now);
}

/** The thread has mail from someone else that has reached this person. */
export function hasIncoming(v: View, me: string, now: number) {
  return mails(v).some((m) => m.author !== me && !isFuture(m.send_at, now) && m.state !== 'held' && m.state !== 'returned');
}

export function isUnread(v: View, me: string, now: number) {
  const seen = v.member?.read_at ? Date.parse(v.member.read_at) : 0;
  return v.messages.some(
    (m) => m.author !== me && m.kind !== 'sys' && !isFuture(m.send_at, now) && Date.parse(m.created_at) > seen,
  );
}

export function cardWaits(card: MessageRow['card'], me: string, role: Role): boolean {
  if (!card || !('type' in card)) return false;
  if (card.type === 'approval') return card.state === 'pending' && isApprover(role);
  if (card.type === 'date') return (card.state === 'pending' && card.askee === me) || (card.state === 'counter' && card.by === me);
  if (card.type === 'task') return card.state === 'open' && card.assignee === me;
  return false;
}

/** Something in the thread is waiting for this person to decide. */
export function awaiting(v: View, me: string, role: Role) {
  return v.messages.some(
    (m) => m.kind === 'mail' && (cardWaits(m.card, me, role) || (m.state === 'held' && isApprover(role) && m.author !== me)),
  );
}

export function replyMinutes(t: ThreadRow, now: number): number | null {
  if (t.kind !== 'external' || !t.reply_by || (t.ext_status !== 'new' && t.ext_status !== 'assigned')) return null;
  return (Date.parse(t.reply_by) - now) / 60000;
}

export function inFolder(v: View, f: FolderId, ctx: { me: string; role: Role; now: number }): boolean {
  const { me, role, now } = ctx;
  const m = v.member;
  const t = v.thread;
  const ms = mails(v);
  if (!ms.length) return false;
  const trashed = Boolean(m?.trashed);
  if (f === 'trash') return trashed;
  if (trashed) return false;
  const held = ms.some((x) => x.state === 'held' || x.state === 'returned');
  if (f === 'gate') return held && (isApprover(role) || ms.some((x) => (x.state === 'held' || x.state === 'returned') && x.author === me));
  if (f === 'action') return awaiting(v, me, role) && !isSnoozed(v, now);
  const onlyHeld = ms.every((x) => x.state === 'held' || x.state === 'returned');
  if (onlyHeld) return false;
  const scheduled = ms.some((x) => x.author === me && isFuture(x.send_at, now));
  if (f === 'scheduled') return scheduled;
  const onlyScheduled = ms.every((x) => isFuture(x.send_at, now));
  if (onlyScheduled) return false;
  if (f === 'snoozed') return isSnoozed(v, now);
  if (f === 'starred') return Boolean(m?.starred);
  if (f === 'sent') return ms.some((x) => x.author === me && x.state !== 'held' && x.state !== 'returned');
  if (f === 'archive') return Boolean(m?.archived);
  if (f === 'mine') return t.kind === 'external' && t.assignee === me && t.ext_status !== 'closed';
  if (f === 'waiting') return t.kind === 'external' && t.ext_status === 'waiting';
  if (f.startsWith('shared:')) {
    if (t.kind !== 'external' || !isLead(role)) return false;
    if (f === 'shared:all') return t.ext_status !== 'closed';
    if (f === 'shared:unassigned') return !t.assignee && t.ext_status !== 'closed';
    if (f === 'shared:closed') return t.ext_status === 'closed';
  }
  if (f.startsWith('label:')) return t.labels.includes(f.slice(6)) && !m?.archived;
  if (f === 'inbox') return !m?.archived && !isSnoozed(v, now) && hasIncoming(v, me, now);
  return false;
}

// ---------------------------------------------------------------------------- search

export type Query = { words: string[]; from: string[]; to: string[]; is: string[]; has: string[]; label: string[]; in: string[] };

/** Splits a search box into words and operators: from: to: is: has: label: in: */
export function parseQuery(q: string): Query {
  const out: Query = { words: [], from: [], to: [], is: [], has: [], label: [], in: [] };
  for (const w of q.trim().split(/\s+/).filter(Boolean)) {
    const m = w.match(/^(from|to|is|has|label|in):(.+)$/i);
    if (m) (out[m[1].toLowerCase() as keyof Omit<Query, 'words'>] as string[]).push(m[2].toLowerCase());
    else out.words.push(w.toLowerCase());
  }
  return out;
}

export function matches(v: View, q: Query, nameOf: (who: string) => string, me: string, now: number): boolean {
  const ms = mails(v);
  const who = (x: MessageRow) => [x.author ?? '', x.from_email ?? '', x.from_name ?? '', x.author ? nameOf(x.author) : ''].join(' ').toLowerCase();
  const tos = (x: MessageRow) => [...x.to_list, ...x.cc_list].map((t) => `${t} ${nameOf(t.slice(2))}`).join(' ').toLowerCase();
  if (q.from.some((f) => !ms.some((x) => who(x).includes(f)))) return false;
  if (q.to.some((f) => !ms.some((x) => tos(x).includes(f)))) return false;
  for (const s of q.is) {
    if (s === 'unread' && !isUnread(v, me, now)) return false;
    if (s === 'read' && isUnread(v, me, now)) return false;
    if (s === 'starred' && !v.member?.starred) return false;
  }
  for (const h of q.has) {
    if (h === 'attachment' && !ms.some((x) => x.files.length || x.refs.length || x.inbound_files.length)) return false;
    if (h === 'card' && !ms.some((x) => x.card)) return false;
  }
  if (q.label.some((l) => !v.thread.labels.some((x) => x.toLowerCase().includes(l)))) return false;
  if (q.in.includes('external') && v.thread.kind !== 'external') return false;
  if (q.in.includes('internal') && v.thread.kind !== 'internal') return false;
  if (q.words.length) {
    const hay = [v.thread.subject, v.thread.contact_name ?? '', v.thread.contact_email ?? '', ...v.messages.map((x) => `${x.body} ${who(x)}`)]
      .join(' ')
      .toLowerCase();
    if (!q.words.every((w) => hay.includes(w))) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------- wording

const ERRORS: Record<string, string> = {
  FORBIDDEN: 'لا يسمح دورك بهذا الإجراء.',
  BAD_RECIPIENT: 'أحد المستلمين غير صالح. تحقق من العناوين، والنسخة المخفية للعناوين الخارجية فقط.',
  TOO_MANY_RECIPIENTS: 'عدد المستلمين أكبر من 50.',
  EXTERNAL_NEEDS_NEW_THREAD: 'لإشراك جهة خارجية في محادثة داخلية، أعد توجيه الرسالة إليها في محادثة جديدة.',
  NO_RECIPIENT: 'أضف مستلماً واحداً على الأقل.',
  EMPTY_MESSAGE: 'الرسالة فارغة.',
  NO_SUBJECT: 'اكتب موضوعاً للرسالة.',
  BAD_SCHEDULE: 'موعد الإرسال يجب أن يكون في المستقبل وخلال 60 يوماً.',
  REF_FORBIDDEN: 'لا تملك وصولاً إلى أحد الأصول المرفقة.',
  REF_NOT_APPROVED: 'في الرسالة أصل لم يُعتمد بعد، والبريد الخارجي يحمل الإصدارات المعتمدة فقط.',
  FILE_FORBIDDEN: 'أحد المرفقات غير متاح لك.',
  CARD_INTERNAL_ONLY: 'بطاقات الاعتماد والمهام والتقدّم داخلية فقط.',
  CARD_NOT_SCHEDULABLE: 'لا تُجدول رسالة فيها مهمة أو طلب اعتماد أو تحديث تقدّم. أرسلها الآن.',
  TASK_ROLE: 'إسناد المهام لمدير الاتصال ومساعده والمنتج الإعلامي.',
  TASK_ASSIGNEE: 'مسؤول المهمة يجب أن يكون من مستلمي الرسالة داخل القسم.',
  NOT_IN_REVIEW: 'طلب الاعتماد لأصل «قيد المراجعة» فقط.',
  DATE_ASKEE: 'من يؤكد الموعد يجب أن يكون من مستلمي الرسالة.',
  STAGE_DENIED: 'لا يسمح دورك أو صلاحيتك على المجلد بهذه الخطوة.',
  BAD_CARD: 'البطاقة غير صالحة.',
  CANNOT_CANCEL: 'لا يمكن سحب هذه الرسالة الآن.',
  LEAD_ONLY: 'للقيادة ومسؤول المحادثة فقط.',
  NOTE_REQUIRED: 'اكتب ملاحظة.',
  CARD_CLOSED: 'حُسم هذا الطلب من قبل.',
  TASK_TERMS_LOCKED: 'موعد المهمة وأولويتها يغيّرهما من أسندها أو القيادة.',
  EDIT_LOCKED: 'المجلد مقفل أو لا تملك صلاحية التحرير.',
};

/** A database refusal as an Arabic sentence. Never shows a raw code. */
export function mailErrorText(message: string | null | undefined): string {
  const code = Object.keys(ERRORS).find((k) => (message ?? '').includes(k));
  return code ? ERRORS[code] : 'تعذّر تنفيذ الطلب. أعد المحاولة.';
}

const STAGE_AR: Record<string, string> = {
  draft: 'مسودة', production: 'قيد الإنتاج', review: 'قيد المراجعة', changes: 'بحاجة إلى تعديل', rejected: 'مرفوض',
  ready: 'جاهز للنشر', scheduled: 'مجدول', published: 'منشور', partial: 'نشر جزئي', failed: 'فشل النشر',
};
export const stageAr = (s: string) => STAGE_AR[s] ?? s;

export const MONTHS_AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
export const DAYS_AR = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const p2 = (n: number) => String(n).padStart(2, '0');

/** "14:05", "أمس" or "9 أكتوبر", for a list row. */
export function shortWhen(iso: string, now: number): string {
  const d = new Date(iso);
  const today = new Date(now);
  const yest = new Date(now - 86400000);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(d, today)) return `${p2(d.getHours())}:${p2(d.getMinutes())}`;
  if (same(d, yest)) return 'أمس';
  return `${d.getDate()} ${MONTHS_AR[d.getMonth()]}`;
}
/** "الخميس 15 أكتوبر · 19:00", in the viewer's time, or Riyadh time on the server. */
export function fullWhen(iso: string, riyadh = false): string {
  if (riyadh) {
    const d = new Date(Date.parse(iso) + 3 * 3600000);
    return `${DAYS_AR[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS_AR[d.getUTCMonth()]} · ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}`;
  }
  const d = new Date(iso);
  return `${DAYS_AR[d.getDay()]} ${d.getDate()} ${MONTHS_AR[d.getMonth()]} · ${p2(d.getHours())}:${p2(d.getMinutes())}`;
}
/** "3 س 20 د" */
export function hoursMinutes(mins: number): string {
  const m = Math.abs(Math.round(mins));
  const h = Math.floor(m / 60);
  const r = m % 60;
  return [h ? `${h} س` : '', r || !h ? `${r} د` : ''].filter(Boolean).join(' ');
}

/** A timeline line, phrased with nouns so it reads right for anyone who did it. */
export function sysText(d: SysData, nameOf: (email: string) => string): string {
  const by = (k = 'by') => (typeof d[k] === 'string' ? nameOf(d[k] as string) : '');
  const at = typeof d.at === 'string' ? fullWhen(d.at) : '';
  switch (d.e) {
    case 'assign':
      return `إسناد المحادثة إلى ${by('to')}${d.req ? `، رقم الطلب الخارجي #${d.req}` : ''}`;
    case 'unassign':
      return 'إلغاء إسناد المحادثة';
    case 'status':
      return `تغيير الحالة إلى «${extStatusLabels[d.to as ExtStatus] ?? d.to}»`;
    case 'work':
      return `تحويل الرسالة إلى العمل ${d.id}${d.title ? ` «${d.title}»` : ''}${d.req ? `، رقم الطلب الخارجي #${d.req}` : ''}`;
    case 'hold_ok':
      return d.queued
        ? `اعتماد رسالة ${by('author')}، ودخولها الطابور لأن البريد الصادر متوقف`
        : `اعتماد رسالة ${by('author')} وخروجها من صندوق القسم`;
    case 'hold_return':
      return `إعادة رسالة ${by('author')} مع ملاحظة`;
    case 'approval': {
      const op = d.op === 'approve' ? 'اعتماد' : d.op === 'changes' ? 'طلب تعديل' : 'رفض';
      return `${op} الإصدار ${d.version} من «${d.name}»`;
    }
    case 'date':
      return d.op === 'counter' ? `اقتراح موعد آخر لنشر «${d.name}»: ${at}` : `تأكيد موعد نشر «${d.name}»: ${at}`;
    case 'date_ext':
      return d.op === 'counter'
        ? `اقتراح من ${d.who} عبر الرابط الموقّع: ${at}`
        : `تأكيد ${d.who} للموعد عبر الرابط الموقّع: ${at}`;
    case 'progress':
      return `تحديث تقدّم المهمة «${d.what}» إلى ${d.pct}٪`;
    case 'done':
      return `إنجاز المهمة «${d.what}»`;
    case 'remind':
      return `تذكير ${by('to')} بالمهمة «${d.what}»`;
    default:
      return '';
  }
}

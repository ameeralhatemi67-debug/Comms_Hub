// Messaging rules the interface needs to explain itself: unread counts, timeline
// wording, presence, commands. Pure, covered by tests/chat.test.mjs. The database
// (supabase/migrations/*chat*) enforces every rule; this only predicts and words it.
import type { Role } from '../domain.ts';

export type RoomRow = {
  id: string;
  type: 'dm' | 'group' | 'channel';
  name: string | null;
  description: string | null;
  link: { type: 'campaign' } | { type: 'work'; id: string; title?: string } | null;
  dm_key: string | null;
  pinned_message: string | null;
  created_by: string;
  created_at: string;
  last_at: string;
};
export type MemberRow = {
  room_id: string;
  email: string;
  admin: boolean;
  joined_at: string;
  last_read_at: string;
  muted: boolean;
  pinned: boolean;
};
export type ChatKind = 'text' | 'voice' | 'image' | 'file' | 'asset' | 'work' | 'poll' | 'task' | 'approval' | 'sys' | 'permission';
export type ChatMessage = {
  id: string;
  room_id: string;
  author: string;
  kind: ChatKind;
  body: string;
  reply_to: string | null;
  forwarded: boolean;
  /** 0 none, 1 «للانتباه», 2 «مهم», 3 «عاجل» (Permissions_Plan.md 7). */
  urgency: Urgency;
  data: Record<string, unknown> | null;
  deleted: boolean;
  edited_at: string | null;
  created_at: string;
};
export type Presence = 'online' | 'busy' | 'shoot' | 'dnd';
export type ProfileRow = {
  email: string;
  avatar: string | null;
  headline: string | null;
  color: string | null;
  presence: Presence;
  presence_note: string | null;
  signature: string | null;
  enter_sends: boolean;
};

export const REACTIONS: [string, string][] = [
  ['check', 'تم'],
  ['eye', 'أطّلعت'],
  ['heart', 'شكراً'],
  ['flag', 'مهم'],
  ['clock', 'لاحقاً'],
];
export const PRESENCE_AR: Record<Presence, string> = { online: 'متاح', busy: 'في اجتماع', shoot: 'في تصوير', dnd: 'لا تزعج' };
export const NAME_COLORS = ['n1', 'n2', 'n3', 'n4', 'n5', 'n6'] as const;

/** The approval cards in messaging belong to the director and the assistant (and the administrator). */
export const canUrgent = (role: Role) => role === 'admin' || role === 'director' || role === 'assistant';
export const canChannel = canUrgent;
/** Same rule as assigning on the Tasks page. */
export const canAssign = (role: Role) => role === 'admin' || role === 'director' || role === 'assistant' || role === 'producer';

/**
 * Urgency of a message, 0 to 3 (Permissions_Plan.md 7, D-4, D-10). Level 1 is anyone's;
 * level 2 needs «رسائل «مهم»» (urgency.2, grantable, possibly once); level 3 is fixed to the
 * administrator, the director and the assistant (urgency.3) and asks each member to
 * acknowledge. The database (chat_send) decides; this only words and predicts it.
 */
export type Urgency = 0 | 1 | 2 | 3;
export const URGENCY_AR: Record<Urgency, string> = { 0: 'بلا درجة', 1: 'للانتباه', 2: 'مهم', 3: 'عاجل' };
export const URGENCY_HINT: Record<Urgency, string> = {
  0: 'رسالة عادية بلا تنبيه.',
  1: 'ينبّه أعضاء المحادثة في «انتباه»، إلا من كتمها.',
  2: 'ينبّه أعضاء المحادثة بعلامة «مهم»، إلا من كتمها.',
  3: 'يصل الجميع ولو كتموا المحادثة، ويطلب من كل عضو الإقرار بالاستلام.',
};
export const URGENCY_WHY: Record<2 | 3, string> = {
  2: 'رسائل «مهم» لمن يملك صلاحيتها: مدير الاتصال ومساعده افتراضياً، ويمنحها لغيرهم من يدير رتبتهم.',
  3: 'المستوى «عاجل» لمدير الاتصال ومساعده ومسؤول النظام فقط، حتى يبقى العاجل نادراً.',
};
export type UrgencyStep = { level: Urgency; label: string; hint: string; ok: boolean; cap: string | null; why: string };

/** The four steps of the composer's picker for this person, from what they hold now. */
export function urgencySteps(has: (cap: string) => boolean): UrgencyStep[] {
  return ([0, 1, 2, 3] as Urgency[]).map((level) => {
    const cap = level === 2 ? 'urgency.2' : level === 3 ? 'urgency.3' : null;
    const ok = !cap || has(cap);
    return { level, label: URGENCY_AR[level], hint: URGENCY_HINT[level], ok, cap, why: ok || level < 2 ? '' : URGENCY_WHY[level as 2 | 3] };
  });
}

/** A task card's priority in the urgency vocabulary: «عاجلة» shows as level 3 in messaging. */
export const cardUrgency = (priority: unknown): Urgency => (priority === 'urgent' ? 3 : 0);

/** Notice tier of a level, as chat_send writes it. */
export const urgencyTier = (u: Urgency) => (u === 3 ? 'decide' : u > 0 ? 'attention' : null);

/** Edits are allowed for a quarter of an hour, as the database enforces. */
export const EDIT_MINUTES = 15;
export const canEdit = (m: ChatMessage, me: string, now: number) =>
  m.author === me && m.kind === 'text' && !m.deleted && now - Date.parse(m.created_at) < EDIT_MINUTES * 60000;

export function unreadCount(messages: ChatMessage[], member: MemberRow | undefined, me: string) {
  if (!member) return 0;
  const seen = Date.parse(member.last_read_at);
  return messages.filter((m) => m.author !== me && m.kind !== 'sys' && Date.parse(m.created_at) > seen).length;
}

export function mentionsMe(messages: ChatMessage[], member: MemberRow | undefined, me: string, myName: string) {
  if (!member) return false;
  const seen = Date.parse(member.last_read_at);
  return messages.some((m) => m.author !== me && Date.parse(m.created_at) > seen && m.body.includes(`@${myName}`));
}

/** Members (other than the author) who have read a message. */
export function readers(m: ChatMessage, members: MemberRow[]) {
  const at = Date.parse(m.created_at);
  return members.filter((x) => x.email !== m.author && Date.parse(x.last_read_at) >= at).map((x) => x.email);
}

/** A slash command at the start of the composer, or a mention at the cursor. */
export function composerPopup(before: string, isDm: boolean): { kind: 'cmd' | 'men'; q: string } | null {
  const cmd = before.match(/^\/(\S*)$/);
  if (cmd) return { kind: 'cmd', q: cmd[1] };
  const men = !isDm && before.match(/@([^\s@]*)$/);
  return men ? { kind: 'men', q: men[1] } : null;
}

export const COMMANDS: { word: string; hint: string; id: 'task' | 'poll' | 'approval' | 'asset' | 'work' | 'urgent' | 'mail' | 'perm' }[] = [
  { word: 'مهمة', hint: 'أسند مهمة لعضو بموعد تسليم', id: 'task' },
  { word: 'تصويت', hint: 'اسأل الفريق واجمع الأصوات', id: 'poll' },
  { word: 'اعتماد', hint: 'اطلب اعتماد أصل قيد المراجعة', id: 'approval' },
  { word: 'أصل', hint: 'شارك معاينة من مكتبة الوسائط', id: 'asset' },
  { word: 'عمل', hint: 'شارك عملاً بحالته', id: 'work' },
  { word: 'عاجل', hint: 'رسالة عاجلة تطلب إقراراً', id: 'urgent' },
  { word: 'بريد', hint: 'انقل النقاش إلى البريد الرسمي', id: 'mail' },
  { word: 'صلاحية', hint: 'اطلب صلاحية ممن يقرر فيها لك', id: 'perm' },
];

export function snippet(m: ChatMessage, assetName: (id: string) => string = () => ''): string {
  if (m.deleted) return 'حُذفت هذه الرسالة';
  const d = (m.data ?? {}) as Record<string, unknown>;
  switch (m.kind) {
    case 'voice':
      return `رسالة صوتية ${duration(Number(d.dur ?? 0))}`;
    case 'image':
      return m.body ? `صورة: ${m.body}` : 'صورة';
    case 'file':
      return `ملف: ${d.name ?? ''}`;
    case 'asset':
      return `أصل: ${d.name ?? assetName(String(d.asset_id ?? ''))}`;
    case 'work':
      return `عمل ${d.id ?? ''}`;
    case 'poll':
      return `تصويت: ${d.q ?? ''}`;
    case 'task':
      return `مهمة: ${d.what ?? ''}`;
    case 'approval':
      return `طلب اعتماد: ${d.name ?? ''}`;
    default:
      return m.body;
  }
}

export function duration(seconds: number) {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Timeline lines, phrased with nouns so they read right for anyone. */
export function chatSysText(d: Record<string, unknown> | null, nameOf: (e: string) => string): string {
  if (!d) return '';
  const who = (k: string) => (typeof d[k] === 'string' ? nameOf(d[k] as string) : '');
  switch (d.e) {
    case 'created':
      return d.type === 'channel' ? 'إنشاء القناة' : 'إنشاء المجموعة';
    case 'added':
      return `انضمام ${who('who')}`;
    case 'removed':
      return `إزالة ${who('who')}`;
    case 'left':
      return `مغادرة ${who('who')}`;
    case 'pinned':
      return 'تثبيت رسالة';
    case 'poll_closed':
      return `إغلاق التصويت: ${d.q ?? ''}`;
    case 'approval':
      return `${d.op === 'approve' ? 'اعتماد' : 'طلب تعديل'} الإصدار ${d.version} من «${d.name}»`;
    case 'done':
      return `إنجاز المهمة «${d.what}»`;
    case 'remind':
      return `تذكير ${who('to')} بالمهمة «${d.what}»`;
    case 'to_mail':
      return 'نقل النقاش إلى البريد الرسمي';
    case 'perm':
      return d.approve ? `مُنحت ${who('who')} صلاحية «${d.label ?? ''}»${d.how ?? ''}` : `لم تُمنح ${who('who')} صلاحية «${d.label ?? ''}»`;
    default:
      return '';
  }
}

const CHAT_ERRORS: Record<string, string> = {
  CHANNEL_POST: 'الكتابة في هذه القناة لمشرفيها.',
  CHANNEL_ROLE: 'قنوات الإعلانات لمدير الاتصال ومساعده.',
  URGENT_ROLE: 'الرسائل العاجلة لمدير الاتصال ومساعده.',
  URGENCY_2: 'رسائل «مهم» لمن يملك صلاحيتها. اطلبها ممن يدير رتبتك.',
  BAD_URGENCY: 'درجة الأهمية من صفر إلى ثلاثة.',
  TASK_ROLE: 'إسناد المهام لمدير الاتصال ومساعده والمنتج الإعلامي.',
  TASK_ASSIGNEE: 'مسؤول المهمة يجب أن يكون عضواً في المحادثة.',
  NOT_IN_REVIEW: 'طلب الاعتماد لأصل «قيد المراجعة» فقط.',
  REF_FORBIDDEN: 'لا تملك وصولاً إلى هذا الأصل.',
  FILE_FORBIDDEN: 'هذا الملف غير متاح لك.',
  POLL_INVALID: 'اكتب السؤال وخيارين على الأقل.',
  EDIT_WINDOW: 'يُعدّل النص خلال ربع ساعة من إرساله فقط.',
  EMPTY_MESSAGE: 'الرسالة فارغة.',
  ADMIN_ONLY: 'لمشرفي المجموعة فقط.',
  NO_MEMBERS: 'اختر عضواً واحداً على الأقل.',
  NOTE_REQUIRED: 'اكتب ملاحظة.',
  CARD_CLOSED: 'حُسم هذا الطلب من قبل.',
  INVALID_NAME: 'اكتب اسماً بين حرف و80 حرفاً.',
  STAGE_DENIED: 'لا يسمح دورك أو صلاحيتك على المجلد بهذه الخطوة.',
  SELF_APPROVAL: 'لا تعتمد إصداراً رفعته بنفسك. يقرر فيه غيرك من القيادة.',
  FORBIDDEN: 'لا يسمح دورك بهذا الإجراء.',
};
export function chatErrorText(message: string | null | undefined) {
  const code = Object.keys(CHAT_ERRORS).find((k) => (message ?? '').includes(k));
  return code ? CHAT_ERRORS[code] : 'تعذّر تنفيذ الطلب. أعد المحاولة.';
}

/** Day separators: "اليوم", "أمس", or the date. */
export function dayLabel(iso: string, now: number) {
  const d = new Date(iso);
  const t = new Date(now);
  const y = new Date(now - 86400000);
  if (d.toDateString() === t.toDateString()) return 'اليوم';
  if (d.toDateString() === y.toDateString()) return 'أمس';
  const days = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  const months = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
  return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]}`;
}
export const hhmm = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/** Messages from one author within five minutes are grouped under one name. */
export function grouping(prev: ChatMessage | undefined, m: ChatMessage, next: ChatMessage | undefined) {
  const gap = (a: ChatMessage, b: ChatMessage) => Math.abs(Date.parse(b.created_at) - Date.parse(a.created_at)) > 5 * 60000;
  const first = !prev || prev.author !== m.author || prev.kind === 'sys' || gap(prev, m);
  const last = !next || next.author !== m.author || next.kind === 'sys' || gap(m, next);
  return { first, last };
}

/** Downsamples microphone levels (0..1) into the bars stored with a voice note. */
export function waveform(levels: number[], bars = 38): number[] {
  if (!levels.length) return Array.from({ length: bars }, () => 20);
  const out: number[] = [];
  const step = levels.length / bars;
  for (let i = 0; i < bars; i++) {
    const slice = levels.slice(Math.floor(i * step), Math.max(Math.floor((i + 1) * step), Math.floor(i * step) + 1));
    const peak = Math.max(...slice);
    out.push(Math.max(8, Math.min(100, Math.round(peak * 140))));
  }
  return out;
}

// The studio and the work (MVP_draft.md 62.12): what a project made for a work starts as (its kind, shape
// and the template groups shown first), where the work stands (its current stage, its dates said in plain
// words), whether it may be sent to review from the studio, and who decides next. Pure.
import type { Ratio } from './schema.ts';

export type WorkFacts = { id: string; title: string; type: string; status: string; due: string | null; proposed_at: string | null; sched_at: string | null; channels: string[]; assignee: string | null };
export type StageFacts = { id: string; pos: number; name: string; who: string | null; due_on: string | null; started_at: string | null; done_at: string | null; gate: boolean; gate_at: string | null };

const VIDEO_TYPES = ['video', 'event'];

/** What a new project for a work starts as: video or photo, its shape, and the template groups shown first. */
export function suggestFor(type: string, platforms: string[]): { kind: 'video' | 'photo'; ratio: Ratio; photo: { w: number; h: number }; categories: string[] } {
  const p = platforms.map((x) => x.toLowerCase());
  const kind: 'video' | 'photo' = VIDEO_TYPES.includes(type) || (type === 'post' && p.includes('youtube')) ? 'video' : 'photo';
  const wide = p.length > 0 && p.every((x) => ['youtube', 'x', 'linkedin'].includes(x));
  const ratio: Ratio = kind === 'video' ? (wide ? '16:9' : '9:16') : p.includes('instagram') ? '4:5' : wide ? '16:9' : '1:1';
  const photo = ratio === '4:5' ? { w: 1080, h: 1350 } : ratio === '16:9' ? { w: 1920, h: 1080 } : { w: 1080, h: 1080 };
  const categories = type === 'announce' ? ['numbers', 'repine'] : VIDEO_TYPES.includes(type) ? ['frames', 'repine'] : type === 'press' ? ['repine'] : ['repine', 'numbers'];
  return { kind, ratio, photo, categories };
}

/** Items with the suggested ids first, in the suggested order, then the others in their own order. */
export function suggestedFirst<T extends { id: string }>(items: T[], first: string[]): T[] {
  const want = first.filter((x, i) => first.indexOf(x) === i && items.some((g) => g.id === x));
  return [...want.map((x) => items.find((g) => g.id === x)!), ...items.filter((g) => !want.includes(g.id))];
}

/** The template groups a project suggests first (written when it was made for a work). */
export function suggestOf(doc: { suggest?: unknown }): string[] {
  const c = (doc.suggest as { categories?: unknown } | undefined)?.categories;
  return Array.isArray(c) ? c.filter((x): x is string => typeof x === 'string').slice(0, 3) : [];
}

/**
 * A YouTube copy with the project's chapter lines (MVP_draft.md 62.12): a chapter block already in it (lines
 * from «0:00» on, each starting with a time) is replaced, else the lines are added after a blank line.
 */
export function withChapters(copy: string, lines: string): string {
  const body = copy.replace(/\s+$/, '');
  const add = lines.trim();
  if (!add) return body;
  const rows = body.split('\n');
  const isTime = (l: string) => /^\s*\d{1,2}(:\d{2}){1,2}\s/.test(l);
  const start = rows.findIndex((l, i) => /^\s*0?0:00\s/.test(l) && rows.slice(i).filter((x) => x.trim()).every(isTime));
  const before = (start >= 0 ? rows.slice(0, start) : rows).join('\n').replace(/\s+$/, '');
  return before ? `${before}\n\n${add}` : add;
}

/** The stage being worked on: the first not finished, in order. */
export function currentStage(stages: StageFacts[]): StageFacts | null {
  return [...stages].sort((a, b) => a.pos - b.pos).find((s) => !s.done_at && !(s.gate && s.gate_at)) ?? null;
}

/** Whole days from `today` to a date (both «YYYY-MM-DD» or ISO), negative when past. */
export function daysUntil(date: string, today: string): number {
  const d = Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10));
  const t = Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 1, +today.slice(8, 10));
  return Math.round((d - t) / 86_400_000);
}

/** A date in plain words from today: «اليوم»، «غداً»، «بعد يومين»، «بعد 5 أيام»، «متأخر يوماً». */
export function dayWords(date: string, today: string): string {
  const n = daysUntil(date, today);
  if (n === 0) return 'اليوم';
  if (n === 1) return 'غداً';
  if (n === 2) return 'بعد يومين';
  if (n > 2) return n <= 10 ? `بعد ${n} أيام` : `بعد ${n} يوماً`;
  if (n === -1) return 'متأخر يوماً';
  if (n === -2) return 'متأخر يومين';
  return -n <= 10 ? `متأخر ${-n} أيام` : `متأخر ${-n} يوماً`;
}

/** Statuses from which the studio may send a work to review (work_submit allows these). */
export const SENDABLE = ['IN_PRODUCTION', 'CHANGES_REQUESTED'];
export const LIVE_AFTER = ['APPROVED', 'SCHEDULED'];

/** Why a work cannot be sent from the studio now, in Arabic, or null. */
export function sendBlock(status: string): string | null {
  if (SENDABLE.includes(status)) return null;
  if (status === 'DRAFT') return 'العمل مسودة لم تبدأ: ابدأه من صفحته أولاً، ثم يُرسل من هنا.';
  if (status === 'IN_REVIEW') return 'العمل قيد المراجعة الآن: ينتظر القرار قبل إرسال جديد.';
  if (LIVE_AFTER.includes(status)) return 'العمل معتمد أو مجدول: إصدار جديد للملف يعيده إلى المراجعة من تلقاء نفسه، دون إرسال من هنا.';
  return 'حال العمل لا تسمح بإرساله الآن.';
}

/**
 * What the work's page must settle before the studio can send it, said before the export rather than after
 * it (work_submit refuses a publishable work without accounts, CHANNEL_REQUIRED, and a past proposed time,
 * DATE_PAST; the studio sends the work's own and never changes them), or null.
 */
export function sendNeeds(w: Pick<WorkFacts, 'channels' | 'proposed_at'>, publishable: boolean, nowMs: number): string | null {
  if (!publishable) return null;
  if (!w.channels.length) return 'لم تُختر حسابات النشر لهذا العمل: اخترها من صفحته، ثم يُرسل من هنا.';
  if (w.proposed_at && Date.parse(w.proposed_at) < nowMs) return 'الموعد المقترح للنشر مضى: عدّله من صفحة العمل، ثم يُرسل من هنا.';
  return null;
}

/** Who decides next, said plainly: nobody approves what they sent, so the director's export goes to the assistant. */
export function decidesNext(senderRole: string): string {
  return senderRole === 'director' ? 'مساعد مدير الاتصال المؤسسي' : senderRole === 'assistant' ? 'مدير الاتصال المؤسسي' : 'مدير الاتصال المؤسسي أو مساعده';
}

// The tester feedback channel and error monitoring (Action_Plan.md section 5; database side in
// supabase/migrations/*feedback_errors*). Pure: wording, what is worth reporting, and how a caught
// error is turned into a message and a place. The database scrubs again; this keeps noise and
// personal text from being sent at all.

export const NOTE_KINDS = [
  ['idea', 'فكرة'],
  ['problem', 'مشكلة'],
  ['question', 'سؤال'],
] as const;
export type NoteKind = (typeof NOTE_KINDS)[number][0];

export const KIND_AR: Record<string, string> = { idea: 'فكرة', problem: 'مشكلة', question: 'سؤال', error: 'خطأ في الصفحة' };
export const STATE_AR: Record<string, string> = { new: 'جديد', seen: 'اطُّلع عليه', done: 'عولج' };
export const NOTE_MAX = 2000;
export const NOTES_PER_DAY = 20;
/** Errors sent from one visit, so a loop in a page cannot flood the channel. */
export const MAX_REPORTS_PER_VISIT = 5;

const ERRORS: Record<string, string> = {
  FORBIDDEN: 'لا تملك هذا الإجراء.',
  KIND_INVALID: 'اختر نوع الملاحظة.',
  TEXT_REQUIRED: 'اكتب ملاحظتك أولاً.',
  TEXT_TOO_LONG: `الملاحظة أطول من ${NOTE_MAX} حرف.`,
  FEEDBACK_LIMIT: `أرسلت ${NOTES_PER_DAY} ملاحظة اليوم. جرّب غداً، أو اجمع ما بقي في ملاحظة واحدة.`,
  STATE_INVALID: 'حالة غير معروفة.',
  NOT_FOUND: 'الملاحظة غير موجودة.',
};
export function feedbackErrorAr(message: string | null | undefined): string {
  const m = message ?? '';
  const code = Object.keys(ERRORS).find((k) => m.includes(k));
  return code ? ERRORS[code] : 'تعذّر الإرسال. أعد المحاولة.';
}

export type FeedbackRow = {
  id: string;
  kind: 'idea' | 'problem' | 'question' | 'error';
  author: string | null;
  author_name: string | null;
  page: string | null;
  body: string;
  place: string | null;
  count: number;
  state: 'new' | 'seen' | 'done';
  created_at: string;
  last_at: string;
  handled_by: string | null;
  handled_at: string | null;
};

// Errors that are the browser's own noise or a person's own doing, not the site's.
const IGNORED = [
  /ResizeObserver loop/i,
  /^Script error\.?$/i,
  /AbortError/i,
  /The user aborted a request/i,
  /Load failed/i,
  /Failed to fetch/i,
  /NetworkError/i,
  /cancel(l)?ed/i,
  /Non-Error promise rejection/i,
];

/** Worth sending to the inbox? */
export function worthReporting(message: string | null | undefined): boolean {
  const m = (message ?? '').trim();
  if (m.length < 3) return false;
  return !IGNORED.some((r) => r.test(m));
}

/**
 * The message and the place of a caught value. The place is the first stack frame reduced to the
 * function and the file's name, with no address, line or column.
 */
export function describeError(e: unknown, componentStack?: string | null): { message: string; where: string } {
  const message = e instanceof Error ? e.message : typeof e === 'string' ? e : '';
  let where = '';
  const frames = (componentStack ?? '').split('\n').map((l) => l.trim()).filter(Boolean);
  if (frames.length) where = frames[0].replace(/\(.*[\\/]/, '(').replace(/:\d+(:\d+)?\)?$/, '').replace(/^at\s+/, '');
  else if (e instanceof Error && e.stack) {
    const line = e.stack.split('\n').find((l) => /^\s*at\s/.test(l));
    if (line) {
      const m = /^\s*at\s+(?:(.+?)\s+\()?(?:.*[\\/])?([^\\/):]+?)(?::\d+)*\)?$/.exec(line);
      if (m) where = `${m[1] ? `${m[1]} ` : ''}(${m[2]})`;
    }
  }
  return { message: message.slice(0, 300), where: where.slice(0, 300) };
}

/** A visit's reports, kept apart from the module that sends them so it can be tested. */
export function reportGate() {
  const seen = new Set<string>();
  let sent = 0;
  return (message: string): boolean => {
    if (!worthReporting(message) || sent >= MAX_REPORTS_PER_VISIT || seen.has(message)) return false;
    seen.add(message);
    sent += 1;
    return true;
  };
}

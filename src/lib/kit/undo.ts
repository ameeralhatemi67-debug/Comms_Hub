// Undo, as the interface says it. The database keeps the steps and decides
// (supabase/migrations/20261012160000_interaction_kit.sql); this only words its answers.

export type UndoItem = { tx: number; label: string; n: number; at: string; ok: boolean };

/** How long an action stays undoable, and how many the button keeps. */
export const UNDO_WINDOW_MIN = 60;
export const UNDO_MAX = 15;

const ERRORS: Record<string, string> = {
  UNDO_CHANGED: 'لا يمكن التراجع: تغيّر شيء آخر في هذا العنصر بعد إجرائك.',
  UNDO_GONE: 'لا يمكن التراجع: مرّت ساعة على الإجراء، أو تراجعتَ عنه من قبل.',
  MOVE_DENIED: 'لا يمكن التراجع: لم تعد تملك التحرير في المجلدين.',
  NAME_LOCKED: 'لا يمكن التراجع: صار الاسم مقفلاً، لاعتماد أو قفل مجلد.',
  EDIT_LOCKED: 'لا يمكن التراجع: صار الملف أو المجلد مقفلاً.',
  MANAGE_REQUIRED: 'لا يمكن التراجع: يحتاج صلاحية «إدارة» على المجلد.',
  FORBIDDEN: 'لا يمكن التراجع: لم تعد تملك صلاحية هذا الإجراء.',
};
export function undoErrorText(message: string | null | undefined): string {
  const m = message ?? '';
  const code = Object.keys(ERRORS).find((k) => m.includes(k));
  if (code) return ERRORS[code];
  if (m.includes('duplicate key')) return 'لا يمكن التراجع: أُضيفت الصلاحية نفسها من جديد بعد إجرائك.';
  return 'تعذّر التراجع. أعد المحاولة.';
}

/** What the button works on: the newest action that can still be undone. One that is refused must not hide those before it. */
export const undoTarget = (items: UndoItem[]): UndoItem | null => items.find((x) => x.ok) ?? null;
export const undoable = (items: UndoItem[]) => items.filter((x) => x.ok);

const NOTHING_LEFT = 'لا يمكن التراجع: تغيّر شيء آخر بعد إجراءاتك.';

/** What to say when the button finds nothing to work on. */
export const undoNothing = (items: UndoItem[]) => (items.length ? NOTHING_LEFT : 'لا شيء للتراجع عنه.');

/** The undo button's title: the action it will undo, and how many before it. */
export function undoTip(items: UndoItem[]): string {
  if (!items.length) return 'لا شيء للتراجع عنه';
  const able = undoable(items);
  if (!able.length) return NOTHING_LEFT;
  const [last, ...rest] = able;
  return `تراجع عن: ${last.label}${rest.length ? ` · و${rest.length} قبله` : ''} · Ctrl+Z`;
}

/** Ctrl+Z belongs to text fields while one has the focus, to the mail page's own undo, and to the studio's own history (MVP_draft.md 62). */
export function undoKeyApplies(e: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean; key: string; code?: string }, target: { tagName?: string; isContentEditable?: boolean } | null, path: string): boolean {
  if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey) return false;
  if (!(e.code === 'KeyZ' || e.key === 'z' || e.key === 'Z')) return false;
  if (target && (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName ?? '') || target.isContentEditable)) return false;
  return !path.startsWith('/mail') && !path.startsWith('/motion/studio');
}

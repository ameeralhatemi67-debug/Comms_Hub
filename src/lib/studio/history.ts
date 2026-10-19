// The studio's own undo and redo (MVP_draft.md 62). The library's undo (undo_steps) covers library
// records only, and Ctrl+Z on /motion/studio is kept away from it (undoKeyApplies). Documents are
// changed immutably, so a step is just the previous document. Steady changes of one control (a slider
// being dragged, a clip being moved) join one step. Pure.

export const HISTORY_LIMIT = 200;
export const JOIN_MS = 800;

export type History<T> = { past: { doc: T; label: string }[]; present: T; label: string; future: { doc: T; label: string }[]; key: string | null; at: number };

export const historyOf = <T>(doc: T): History<T> => ({ past: [], present: doc, label: '', future: [], key: null, at: 0 });

/**
 * A new document. `key` names the control making it: repeated changes with the same key within
 * JOIN_MS become one step (the step keeps the document from before the first of them).
 */
export function record<T>(h: History<T>, doc: T, label: string, key: string | null = null, now = Date.now()): History<T> {
  if (doc === h.present) return h;
  if (key && key === h.key && now - h.at < JOIN_MS && h.past.length) return { ...h, present: doc, label, at: now, future: [] };
  const past = [...h.past, { doc: h.present, label }];
  if (past.length > HISTORY_LIMIT) past.splice(0, past.length - HISTORY_LIMIT);
  return { past, present: doc, label, future: [], key, at: now };
}

export function undo<T>(h: History<T>): History<T> {
  const last = h.past[h.past.length - 1];
  if (!last) return h;
  return { past: h.past.slice(0, -1), present: last.doc, label: last.label, future: [{ doc: h.present, label: last.label }, ...h.future], key: null, at: 0 };
}

export function redo<T>(h: History<T>): History<T> {
  const next = h.future[0];
  if (!next) return h;
  return { past: [...h.past, { doc: h.present, label: next.label }], present: next.doc, label: next.label, future: h.future.slice(1), key: null, at: 0 };
}

/** The button titles: what an undo or a redo would do. */
export const undoLabel = <T>(h: History<T>) => (h.past.length ? `تراجع عن: ${h.past[h.past.length - 1].label}` : 'لا شيء للتراجع عنه');
export const redoLabel = <T>(h: History<T>) => (h.future.length ? `إعادة: ${h.future[0].label}` : 'لا شيء لإعادته');

/** The keyboard: Ctrl+Z, Ctrl+Shift+Z and Ctrl+Y, outside text fields. */
export function historyKey(e: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; key: string; code?: string }, target: { tagName?: string; isContentEditable?: boolean } | null): 'undo' | 'redo' | null {
  if (!(e.ctrlKey || e.metaKey)) return null;
  if (target && (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName ?? '') || target.isContentEditable)) return null;
  const z = e.code === 'KeyZ' || e.key === 'z' || e.key === 'Z';
  const y = e.code === 'KeyY' || e.key === 'y' || e.key === 'Y';
  if (z) return e.shiftKey ? 'redo' : 'undo';
  if (y) return 'redo';
  return null;
}

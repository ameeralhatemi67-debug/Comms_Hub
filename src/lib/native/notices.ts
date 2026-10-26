// Which notices reach the desktop application's tray (Desktop_App_Plan.md 2 and 5.2 `notify`; DT-07).
// Only «يحتاج قرارك» items become native notices, the tier the attention model puts first
// (disscussios/notification_model.md); the taskbar badge counts those still unread. The first list read
// after the page opens raises nothing: it only learns what is already there. More than three new at once
// become one notice. The application shows them only when its window is not in front. Pure.

export type NoticeLike = { id: string; tier: string; body: string; read_at: string | null };

export const RAISE_AT_ONCE = 3;
export const DECIDE_TITLE = 'يحتاج قرارك';

/** The unread decisions not in `seen`; `seen` null means this is the first read, which raises nothing. */
export function freshDecisions<T extends NoticeLike>(seen: ReadonlySet<string> | null, list: readonly T[]): { raise: T[]; seen: Set<string> } {
  const next = new Set(list.map((n) => n.id));
  if (!seen) return { raise: [], seen: next };
  const raise = list.filter((n) => n.tier === 'decide' && !n.read_at && !seen.has(n.id));
  // Only the latest list is remembered: a notice that left it is older and cannot come back as new.
  return { raise, seen: next };
}

export function decisionCount(list: readonly NoticeLike[]): number {
  return list.filter((n) => n.tier === 'decide' && !n.read_at).length;
}

/** The native notices for the new decisions: one each up to three, otherwise one that counts them. */
export function noticesFor<T extends NoticeLike>(fresh: readonly T[], href: (n: T) => string): { title: string; body: string; go: string | null }[] {
  if (fresh.length > RAISE_AT_ONCE) return [{ title: DECIDE_TITLE, body: `إشعارات جديدة تحتاج قرارك: ${fresh.length}`, go: null }];
  return fresh.map((n) => ({ title: DECIDE_TITLE, body: n.body, go: href(n) }));
}

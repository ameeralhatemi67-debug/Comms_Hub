// The team panel of «سجل النشاط» (Action_Plan.md B2): what «المراقبة» promised and nothing else,
// each member of the department with their role, their last recorded action, how much they did in
// the last seven days and what is open for them. Read only, from rows the person's own row level
// security already returned; nothing is computed from sample data.

export type TeamPerson = { email: string; display_name: string; role: string };
export type TeamRow = { at: string; actor_email: string };
export type TeamTask = { assignee: string; status: 'open' | 'done'; due: string };

export type TeamLine = {
  email: string;
  name: string;
  role: string;
  /** ISO time of the member's latest action in the rows read, or null when there is none. */
  last: string | null;
  /** Actions in the seven days before `now`. */
  week: number;
  /** Tasks assigned to the member that are not done. */
  open: number;
  /** Of those, the ones past their due time. */
  late: number;
};

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * One line per person, the most recently active first and the people with no recorded action
 * last (by name among themselves). `rows` is the log as read, newest first and limited, so the
 * weekly count is "in what was read"; the page says so.
 */
export function teamSummary(
  people: readonly TeamPerson[],
  rows: readonly TeamRow[],
  tasks: readonly TeamTask[],
  now: Date = new Date(),
): TeamLine[] {
  const since = now.getTime() - WEEK_MS;
  const last = new Map<string, string>();
  const week = new Map<string, number>();
  for (const r of rows) {
    const prev = last.get(r.actor_email);
    if (!prev || r.at > prev) last.set(r.actor_email, r.at);
    if (new Date(r.at).getTime() >= since) week.set(r.actor_email, (week.get(r.actor_email) ?? 0) + 1);
  }
  const open = new Map<string, number>();
  const late = new Map<string, number>();
  for (const t of tasks) {
    if (t.status !== 'open') continue;
    open.set(t.assignee, (open.get(t.assignee) ?? 0) + 1);
    if (new Date(t.due).getTime() < now.getTime()) late.set(t.assignee, (late.get(t.assignee) ?? 0) + 1);
  }
  return people
    .map((p) => ({
      email: p.email,
      name: p.display_name,
      role: p.role,
      last: last.get(p.email) ?? null,
      week: week.get(p.email) ?? 0,
      open: open.get(p.email) ?? 0,
      late: late.get(p.email) ?? 0,
    }))
    .sort((a, b) => {
      if (a.last && b.last) return b.last.localeCompare(a.last);
      if (a.last) return -1;
      if (b.last) return 1;
      return a.name.localeCompare(b.name, 'ar');
    });
}

// The order of the works waiting for a decision (MVP_draft.md 62.13), used by «الموافقات والنشر» and by the
// review screen's ] and [: urgent first, then the oldest sent. For a leader, only what they may decide (not
// what they sent, not an urgent work they may not decide); for anyone else, everything in review. Pure.
import type { Role } from '../domain.ts';
import { decideBlock, isLead, type WorkRow } from './rules.ts';

export type QueueWork = Pick<WorkRow, 'id' | 'status' | 'review_cycle' | 'closed_at' | 'priority'>;
export type QueueCycle = { work_id: string; n: number; sent_by: string; sent_at: string };

/** The review cycle a work is in now, with who sent it and when. */
export const sentCycle = (cycles: readonly QueueCycle[], w: Pick<QueueWork, 'id' | 'review_cycle'>) => cycles.find((c) => c.work_id === w.id && c.n === w.review_cycle);

/** Urgent first, then the one sent first. */
export function queueOrder(cycles: readonly QueueCycle[]) {
  return (a: QueueWork, b: QueueWork): number => {
    const ua = a.priority === 'urgent' ? 0 : 1;
    const ub = b.priority === 'urgent' ? 0 : 1;
    if (ua !== ub) return ua - ub;
    const sa = sentCycle(cycles, a)?.sent_at ?? '';
    const sb = sentCycle(cycles, b)?.sent_at ?? '';
    return sa < sb ? -1 : sa > sb ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  };
}

/** The works in review that wait for this person, in queue order. */
export function reviewQueue<T extends QueueWork>(works: readonly T[], cycles: readonly QueueCycle[], me: string, role: Role): T[] {
  const lead = isLead(role);
  return works
    .filter((w) => !w.closed_at && w.status === 'IN_REVIEW')
    .filter((w) => !lead || !decideBlock(w, sentCycle(cycles, w)?.sent_by ?? null, me, role))
    .sort(queueOrder(cycles));
}

/** The next and previous work from this one; one no longer waiting has the first as its next. */
export function around(queue: readonly string[], id: string): { next: string | null; prev: string | null } {
  const i = queue.indexOf(id);
  if (i < 0) return { next: queue[0] ?? null, prev: null };
  return { next: queue[i + 1] ?? null, prev: queue[i - 1] ?? null };
}

// «التحليلات» (Action_Plan.md B5): what the page counts, as pure rules over the rows a person's own
// row level security returned (works and the department's platform accounts, and the platform
// registry). Nothing is sample data and nothing is sent anywhere. Publishing itself is still a
// simulation, so a publishing result here is a result of the simulation, and the page says so.
//
// The metrics were chosen for the owner (2026-10-15, "work on B5" without a list) from what the
// database holds, and each one names where it comes from:
//   - the flow of work: by status, late, due soon, made and published per week;
//   - review: how many are waiting, how many came back for changes, how many rounds a work takes;
//   - the platforms: accounts and their health, what was addressed to each, what the simulation
//     published and what failed.
import type { AccountRow, PlatformInfo, WorkRow, WorkStatus } from './rules.ts';

export const STATUS_ORDER: WorkStatus[] = [
  'DRAFT', 'IN_PRODUCTION', 'IN_REVIEW', 'CHANGES_REQUESTED', 'REJECTED',
  'APPROVED', 'SCHEDULED', 'PUBLISHING', 'PUBLISHED', 'PARTIAL', 'FAILED',
];

/** Statuses after which a work no longer has anything due. */
const ENDED: WorkStatus[] = ['PUBLISHED', 'PARTIAL', 'FAILED', 'REJECTED'];

const DAY = 24 * 60 * 60 * 1000;

export type WeekBucket = {
  /** First day of the seven (yyyy-mm-dd). */
  from: string;
  made: number;
  published: number;
};

export type PlatformLine = {
  key: string;
  label: string;
  /** Accounts the department holds on this platform, and how many are switched on. */
  accounts: number;
  active: number;
  /** Connected through the platform's own sign-in (not the simulated link). */
  connected: number;
  /** Needing a person: a broken connection, or an authorisation that ended. */
  attention: number;
  /** Authorisation ending within the next 14 days (and not yet ended). */
  expiring: number;
  /** Works that addressed an account of this platform. */
  addressed: number;
  /** Results of the publishing simulation for accounts of this platform. */
  ok: number;
  failed: number;
  /** The owner's readiness tracker for what the platform asks outside the site. */
  readiness: string | null;
};

export type Analysis = {
  total: number;
  open: number;
  byStatus: Record<WorkStatus, number>;
  late: number;
  dueSoon: number;
  weeks: WeekBucket[];
  review: {
    waiting: number;
    changes: number;
    /** Works that went to review at least once, and their mean number of rounds (null when none). */
    reviewed: number;
    meanRounds: number | null;
    /** Of the works that were approved or beyond, the share approved in the first round (null when none). */
    firstRound: number | null;
  };
  platforms: PlatformLine[];
  /** Results of the simulation across every platform. */
  published: { ok: number; failed: number };
};

const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** The number of whole days from `a` to `b` (yyyy-mm-dd), `b` later giving a positive number. */
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / DAY);

export function analyse(
  works: readonly WorkRow[],
  accounts: readonly AccountRow[],
  platforms: readonly PlatformInfo[],
  today: string,
  nowMs: number = Date.parse(`${today}T12:00:00Z`),
  weeks = 8,
): Analysis {
  const byStatus = Object.fromEntries(STATUS_ORDER.map((s) => [s, 0])) as Record<WorkStatus, number>;
  for (const w of works) if (w.status in byStatus) byStatus[w.status]++;

  const ended = (w: WorkRow) => ENDED.includes(w.status) || !!w.closed_at;
  const open = works.filter((w) => !ended(w));
  const late = open.filter((w) => w.due < today).length;
  const dueSoon = open.filter((w) => w.due >= today && daysBetween(today, w.due) <= 7).length;

  // Weekly buckets ending today: the last bucket is the seven days ending today.
  const start = Date.parse(`${today}T00:00:00Z`) - (weeks * 7 - 1) * DAY;
  const buckets: WeekBucket[] = Array.from({ length: weeks }, (_, i) => ({ from: isoDay(start + i * 7 * DAY), made: 0, published: 0 }));
  const slot = (iso: string | null) => {
    if (!iso) return -1;
    const day = Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
    const i = Math.floor((day - start) / (7 * DAY));
    return i >= 0 && i < weeks ? i : -1;
  };
  for (const w of works) {
    const m = slot(w.created_at);
    if (m >= 0) buckets[m].made++;
    if (w.status === 'PUBLISHED' || w.status === 'PARTIAL') {
      const p = slot(w.pub_at);
      if (p >= 0) buckets[p].published++;
    }
  }

  const reviewedWorks = works.filter((w) => (w.review_cycle ?? 0) > 0);
  const approvedOn = works.filter((w) => ['APPROVED', 'SCHEDULED', 'PUBLISHING', 'PUBLISHED', 'PARTIAL', 'FAILED'].includes(w.status) && (w.review_cycle ?? 0) > 0);
  const review = {
    waiting: byStatus.IN_REVIEW,
    changes: byStatus.CHANGES_REQUESTED,
    reviewed: reviewedWorks.length,
    meanRounds: reviewedWorks.length ? reviewedWorks.reduce((n, w) => n + (w.review_cycle ?? 0), 0) / reviewedWorks.length : null,
    firstRound: approvedOn.length ? approvedOn.filter((w) => w.review_cycle === 1).length / approvedOn.length : null,
  };

  const platformOf = new Map(accounts.map((a) => [a.id, a.platform]));
  const lines: PlatformLine[] = platforms.map((p) => {
    const mine = accounts.filter((a) => a.platform === p.key);
    const line: PlatformLine = {
      key: p.key,
      label: p.label_ar,
      accounts: mine.length,
      active: mine.filter((a) => a.active).length,
      connected: mine.filter((a) => a.conn_kind === 'oauth' && a.conn_state === 'connected').length,
      attention: mine.filter(
        (a) => a.active && (a.conn_state === 'needs_reconnect' || a.conn_state === 'error' || (!!a.authorized_until && Date.parse(a.authorized_until) <= nowMs)),
      ).length,
      expiring: mine.filter((a) => a.active && !!a.authorized_until && Date.parse(a.authorized_until) > nowMs && Date.parse(a.authorized_until) - nowMs <= 14 * DAY).length,
      addressed: 0,
      ok: 0,
      failed: 0,
      readiness: p.readiness ?? null,
    };
    return line;
  });
  const byKey = new Map(lines.map((l) => [l.key, l]));
  let ok = 0;
  let failed = 0;
  for (const w of works) {
    const seen = new Set<string>();
    for (const id of w.channels) {
      const key = platformOf.get(id);
      const line = key ? byKey.get(key) : undefined;
      if (line && !seen.has(key!)) {
        seen.add(key!);
        line.addressed++;
      }
    }
    for (const [id, r] of Object.entries(w.results ?? {})) {
      const line = byKey.get(platformOf.get(id) ?? '');
      if (!line) continue;
      if (r.ok) {
        line.ok++;
        ok++;
      } else {
        line.failed++;
        failed++;
      }
    }
  }

  return { total: works.length, open: open.length, byStatus, late, dueSoon, weeks: buckets, review, platforms: lines, published: { ok, failed } };
}

/** "3 of 4" style share as a whole percent, or null when there is nothing to divide. */
export const percent = (part: number, whole: number): number | null => (whole > 0 ? Math.round((part / whole) * 100) : null);

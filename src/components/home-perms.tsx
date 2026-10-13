'use client';
// Home's part of the permissions (Permissions_Plan.md 9, «Home»): for a granter, the
// permission requests waiting for their decision; for anyone, temporary permissions ending
// within 24 hours and one-time permissions not used yet. Read from the database through the
// shell's capabilities and perm_requests(); nothing here decides anything.
import Link from 'next/link';
import { Clock, KeyRound } from 'lucide-react';
import { capLabel, stamp } from '@/lib/permissions';
import { useCaps } from './caps';
import { usePermRequests } from './perm-requests';

export function HomePermissions() {
  const caps = useCaps();
  const reqs = usePermRequests();
  const now = Date.now();
  const waiting = reqs.list.filter((q) => q.can_decide);
  const ending = caps.grants.filter((g) => g.mode === 'timed' && g.until && Date.parse(g.until) > now && Date.parse(g.until) - now <= 864e5);
  const once = caps.grants.filter((g) => g.mode === 'once' && (g.uses ?? 0) > 0);
  if (!waiting.length && !ending.length && !once.length) return null;
  return (
    <div className="hp-perms" data-gd="homeperms">
      {waiting.length > 0 && (
        <Link className="wk-hint" href="/requests?tab=perm" role="status">
          <KeyRound />
          <span>
            {waiting.length === 1 ? `طلب صلاحية من ${waiting[0].requester_name} ينتظر قرارك` : `${waiting.length} طلبات صلاحيات تنتظر قرارك`}: «{waiting[0].label}»
            {waiting.length > 1 ? ' وغيرها' : ''}.
          </span>
        </Link>
      )}
      {ending.map((g) => (
        <Link key={g.id} className="wk-hint warn" href="/account" role="status">
          <Clock />
          <span>
            تنتهي صلاحيتك «{capLabel(g.k)}» في {stamp(g.until!)}.
          </span>
        </Link>
      ))}
      {once.length > 0 && (
        <Link className="wk-hint" href="/account" role="status">
          <KeyRound />
          <span>
            لديك {once.length === 1 ? `«${capLabel(once[0].k)}» لمرة واحدة لم تُستخدم بعد` : `${once.length} صلاحيات لمرة واحدة لم تُستخدم بعد`}.
          </span>
        </Link>
      )}
    </div>
  );
}

'use client';
// Urgency in messaging (Permissions_Plan.md 7): the four steps of the composer's picker and
// the mark a message carries. A step the person may not use stays visible as a locked control
// (src/lib/kit/need.ts): «مهم» offers the request, «عاجل» is fixed and explains itself.
// The database (chat_send) decides; this only shows what it will say.
import { useCaps } from '../caps';
import { needProps } from '@/lib/kit/need';
import { URGENCY_AR, urgencySteps, type Urgency } from '@/lib/chat/rules';

export function UrgencyMark({ level }: { level: Urgency }) {
  return (
    <span className={`cx-lvl-dot l${level}`} aria-hidden="true">
      {'!'.repeat(level)}
    </span>
  );
}

/** The mark of a message's level; level 3 also has the acknowledgement block beside it. */
export function UrgencyBadge({ level }: { level: Urgency }) {
  if (!level) return null;
  return (
    <span className={`cx-lvl l${level}`}>
      <UrgencyMark level={level} />
      {URGENCY_AR[level]}
    </span>
  );
}

/** The four steps, for a menu. */
export function UrgencyOptions({ value, onPick }: { value: Urgency; onPick: (u: Urgency) => void }) {
  const caps = useCaps();
  return (
    <div className="cx-lvls" role="group" aria-label="درجة الأهمية">
      {urgencySteps(caps.has).map((st) => (
        <button
          key={st.level}
          type="button"
          role="menuitemradio"
          aria-checked={value === st.level}
          className={`cx-lvl-opt l${st.level}`}
          data-level={st.level}
          {...(st.ok ? { onClick: () => onPick(st.level) } : needProps(st.cap!, st.why))}
        >
          <b>
            {st.level ? <UrgencyMark level={st.level} /> : null}
            {st.label}
          </b>
          <small>{st.ok ? st.hint : st.why}</small>
        </button>
      ))}
    </div>
  );
}

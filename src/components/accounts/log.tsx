'use client';
// «السجل»: every grant, removal, use, ending, role change and request, as the database
// wrote it (permission_events, append-only), filterable by person and by permission. What
// one sees follows row level security: one's own events, those of people one manages, and
// role changes for those who grant.
import { useMemo, useState } from 'react';
import { CAPABILITIES, EVENT_KINDS, eventText, stamp } from '@/lib/permissions';
import { useAccounts } from './data';

export function LogTab({ person }: { person?: string | null }) {
  const a = useAccounts();
  const [who, setWho] = useState(person ?? '');
  const [cap, setCap] = useState('');
  const [kind, setKind] = useState('');
  const list = useMemo(
    () => a.events.filter((e) => (!who || e.subject === who || e.actor === who) && (!cap || e.capability === cap) && (!kind || e.kind === kind)),
    [a.events, who, cap, kind],
  );
  return (
    <div className="pm-logtab">
      <div className="filters pm-filters">
        <select aria-label="الشخص" value={who} onChange={(e) => setWho(e.target.value)}>
          <option value="">كل الأشخاص</option>
          {a.members.map((m) => (
            <option key={m.email} value={m.email}>
              {m.display_name}
            </option>
          ))}
        </select>
        <select aria-label="الصلاحية" value={cap} onChange={(e) => setCap(e.target.value)}>
          <option value="">كل الصلاحيات</option>
          {CAPABILITIES.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label}
            </option>
          ))}
        </select>
        <select aria-label="النوع" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="">كل الأحداث</option>
          {Object.entries(EVENT_KINDS).map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
      </div>
      <ol className="pm-log">
        {list.map((e) => (
          <li key={e.id}>
            <small>
              <bdi dir="ltr">{stamp(e.at)}</bdi>
            </small>
            <span className="chip">{EVENT_KINDS[e.kind] ?? 'حدث'}</span>
            <span>{eventText(e, a.nameOf)}</span>
          </li>
        ))}
        {!list.length && <li className="muted">لا أحداث بهذه التصفية.</li>}
      </ol>
      <p className="muted">السجل يُكتب ولا يُعدَّل ولا يُحذف. الانتهاء يُسجَّل بوقته حين يفتح صاحبه صفحة بعده، فلا مهمة خلفية تراقب الوقت.</p>
    </div>
  );
}

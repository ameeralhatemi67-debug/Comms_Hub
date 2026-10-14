'use client';
// «السجل» in Settings (Settings_Integrations_Plan.md 5): every integration and settings event,
// append-only, never with a secret value. Filterable by kind.
import { useEffect, useMemo, useState } from 'react';
import { needProps } from '@/lib/kit/need';
import { supabase } from '@/lib/supabase/client';
import { EVENT_AR, eventLine, type IntEvent } from '@/lib/integrations/rules';
import { useCaps } from '../caps';

const when = (iso: string) => new Date(iso).toLocaleString('ar-SA-u-nu-latn', { dateStyle: 'short', timeStyle: 'short' });

export function AuditTab({ initial }: { initial?: IntEvent[] }) {
  const caps = useCaps();
  const [events, setEvents] = useState<IntEvent[] | null>(initial ?? null);
  const [kind, setKind] = useState('');
  const [refused, setRefused] = useState(false);
  useEffect(() => {
    if (initial) return;
    void supabase()
      .rpc('int_events', { p_limit: 300 })
      .then(({ data, error }) => (error ? setRefused(true) : setEvents(data as IntEvent[])));
  }, [initial]);
  const shown = useMemo(() => (events ?? []).filter((e) => !kind || e.kind === kind), [events, kind]);

  if (refused || (caps.ready && !caps.has('settings.view')))
    return (
      <div className="st-audit">
        <p className="muted">السجل لمن يملك «عرض صحة النظام وسجل الإعدادات».</p>
        <button type="button" className="secondary" {...needProps('settings.view', 'السجل لمسؤول النظام افتراضياً.')}>
          اطلب هذه الصلاحية
        </button>
      </div>
    );
  if (!events) return <p className="muted">جارٍ تحميل السجل…</p>;
  return (
    <div className="st-audit">
      <label htmlFor="st-audit-kind">
        النوع
        <select id="st-audit-kind" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="">كل الأحداث</option>
          {Object.entries(EVENT_AR).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
      </label>
      {shown.length === 0 ? (
        <p className="muted">لا أحداث بعد.</p>
      ) : (
        <ul className="st-events">
          {shown.map((e) => (
            <li key={e.id}>
              <span>{eventLine(e)}</span>
              <small>
                {e.actor_name ?? 'الخادم'} · <bdi dir="ltr">{when(e.at)}</bdi>
              </small>
            </li>
          ))}
        </ul>
      )}
      <p className="muted">السجل يُكتب ولا يُعدّل، ولا يحمل قيمة سرّ أبداً: يذكر من استعمل السر ولأي غرض فقط.</p>
    </div>
  );
}

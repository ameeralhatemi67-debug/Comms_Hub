'use client';
// سجل النشاط: every action by everyone, with what changed. Append-only in the database.
// Managers and administrators see all of it; everyone else sees their own actions.
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { describe, logTypeLabels, type LogRow } from '@/lib/media/log-text';
import { logAllRoles, riyadhStamp } from '@/lib/media/rules';
import { Title } from '../ui';
import { Avatar, Icon, StageChip, Ts } from './parts';
import { useMedia } from './provider';

const typeIcon: Record<string, string> = {
  upload: 'upload',
  version: 'history',
  approve: 'check',
  changes: 'pencil',
  reject: 'x',
  schedule: 'cal',
  publish: 'send',
  assign: 'users',
  done: 'check',
  copy: 'file',
  rename: 'pencil',
  move: 'move',
  remove: 'trash',
  tag: 'tag',
  access: 'shield',
  lock: 'lock',
  folder: 'folder',
  note: 'note',
  download: 'download',
  link: 'link',
  stage: 'board',
};

export function ActivityPage() {
  const m = useMedia();
  const [rows, setRows] = useState<LogRow[] | null>(null);
  const [who, setWho] = useState('all');
  const [type, setType] = useState('all');
  const [q, setQ] = useState('');
  const all = m.isAdmin || logAllRoles.includes(m.role);

  useEffect(() => {
    let live = true;
    void supabase()
      .from('activity_log')
      .select('*')
      .order('at', { ascending: false })
      .limit(500)
      .then(({ data }) => live && setRows((data as LogRow[]) ?? []));
    return () => {
      live = false;
    };
  }, [m.assets, m.tasks, m.folders]);

  const described = useMemo(() => (rows ?? []).map((r) => ({ r, d: describe(r, m.nameOf) })), [rows, m.nameOf]);
  const shown = described.filter(({ r, d }) => {
    if (who !== 'all' && r.actor_email !== who) return false;
    if (type !== 'all' && r.type !== type) return false;
    if (q && !`${d.text} ${d.before ?? ''} ${d.after ?? ''}`.includes(q)) return false;
    return true;
  });
  const today = riyadhStamp(new Date()).slice(0, 10);
  const days: string[] = [];
  const byDay = new Map<string, typeof shown>();
  for (const x of shown) {
    const day = riyadhStamp(x.r.at).slice(0, 10);
    if (!byDay.has(day)) {
      byDay.set(day, []);
      days.push(day);
    }
    byDay.get(day)!.push(x);
  }
  const counts = new Map<string, number>();
  shown.forEach((x) => counts.set(x.r.actor_email, (counts.get(x.r.actor_email) ?? 0) + 1));
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];

  if (m.status === 'loading' || rows === null) return <p role="status">جارٍ التحميل…</p>;

  return (
    <div className="mx" dir="rtl">
      <Title title="سجل" accent="النشاط" sub="كل إجراء يقوم به أي عضو، بوقته وصاحبه وما تغيّر.">
        <span className="mx-immut">
          <Icon name="lock" />
          سجل لا يُعدَّل ولا يُحذف
        </span>
      </Title>
      {!all && (
        <p className="warning" role="status">
          تعرض أنشطتك أنت وما جرى على الأصول التي تراها. السجل الكامل لمدير الاتصال ومساعده وAdmin.
        </p>
      )}
      <div className="mx-stats">
        <div className="mx-stat">
          <b>{shown.length}</b>
          <span>حدثاً مطابقاً</span>
        </div>
        <div className="mx-stat">
          <b>{shown.filter((x) => riyadhStamp(x.r.at).slice(0, 10) === today).length}</b>
          <span>اليوم</span>
        </div>
        <div className="mx-stat">
          <b>{top ? m.nameOf(top[0]) : '—'}</b>
          <span>الأكثر نشاطاً</span>
        </div>
      </div>
      <div className="mx-toolbar">
        <label className="mx-field">
          <Icon name="search" />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث في السجل…" aria-label="بحث في السجل" />
        </label>
        <select className="sel" value={who} onChange={(e) => setWho(e.target.value)} aria-label="الشخص">
          <option value="all">كل الأشخاص</option>
          {m.people.map((p) => (
            <option key={p.email} value={p.email}>
              {p.display_name}
            </option>
          ))}
        </select>
        <select className="sel" value={type} onChange={(e) => setType(e.target.value)} aria-label="الإجراء">
          <option value="all">كل الإجراءات</option>
          {Object.entries(logTypeLabels).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>

      {days.length ? (
        days.map((day) => (
          <div key={day}>
            <div className="mx-day">
              {day === today ? 'اليوم · ' : ''}
              <Ts>{day}</Ts>
            </div>
            <div className="mx-log">
              {byDay.get(day)!.map(({ r, d }) => {
                const a = r.asset_id ? m.assets.find((x) => x.id === r.asset_id) : null;
                return (
                  <div className="mx-lr" key={r.id}>
                    <time>{riyadhStamp(r.at).slice(11)}</time>
                    <Avatar name={m.nameOf(r.actor_email)} />
                    <span>
                      {d.text}
                      <span className="tg">
                        <span className="mx-chip plain">
                          <Icon name={typeIcon[r.type] ?? 'file'} />
                          {logTypeLabels[r.type] ?? r.type}
                        </span>
                        {a && (
                          <Link className="mx-link" href={`/media/${a.id}`}>
                            {a.name}
                          </Link>
                        )}
                      </span>
                      {(d.before || d.after) && (
                        <span className="mx-ba">
                          <s>{d.before ?? '—'}</s>
                          <span aria-hidden="true">←</span>
                          <b>{d.after ?? '—'}</b>
                        </span>
                      )}
                    </span>
                    <span>{d.stage && <StageChip stage={d.stage} />}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ))
      ) : (
        <div className="mx-empty">
          <span className="ei">
            <Icon name="history" />
          </span>
          <b>لا توجد أحداث مطابقة</b>
        </div>
      )}
    </div>
  );
}

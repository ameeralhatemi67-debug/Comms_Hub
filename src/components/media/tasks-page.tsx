'use client';
// المهام: what was assigned to this person, what they assigned, and (for managers) all.
import Link from 'next/link';
import { useState } from 'react';
import { riyadhStamp, taskKindLabels } from '@/lib/media/rules';
import { Title } from '../ui';
import { Icon, Ts } from './parts';
import { useMedia } from './provider';

const kindIcon: Record<string, string> = { copy: 'file', design: 'image', edit: 'film', review: 'eye', publish: 'send', other: 'tasks' };

export function TasksPage() {
  const m = useMedia();
  const manager = m.isAdmin || m.role === 'director' || m.role === 'assistant';
  const [tab, setTab] = useState<'mine' | 'by' | 'all'>('mine');
  const [busy, setBusy] = useState('');

  if (m.status === 'loading') return <p role="status">جارٍ التحميل…</p>;
  if (m.status === 'error') return <p className="warning">تعذّر تحميل المهام. أعد تحميل الصفحة.</p>;

  const list = m.tasks
    .filter((t) => (tab === 'mine' ? t.assignee === m.email : tab === 'by' ? t.assigned_by === m.email : true))
    .sort((a, b) => Number(a.status === 'done') - Number(b.status === 'done') || a.due.localeCompare(b.due));
  const open = list.filter((t) => t.status === 'open').length;
  const late = list.filter((t) => t.status === 'open' && new Date(t.due) < new Date()).length;
  const done = list.filter((t) => t.status === 'done').length;
  const tabs: ['mine' | 'by' | 'all', string][] = [['mine', 'مسندة إليّ'], ['by', 'أسندتها أنا'], ...(manager ? ([['all', 'كل المهام']] as ['all', string][]) : [])];

  return (
    <div className="mx" dir="rtl">
      <Title title="المهام" sub="ما أُسند إليك وما أسندته، مرتبطاً بالأصل الذي تخصه." />
      <div className="mx-stats">
        <div className="mx-stat">
          <b>{open}</b>
          <span>مهام مفتوحة</span>
        </div>
        <div className="mx-stat">
          <b>{late}</b>
          <span>متأخرة</span>
        </div>
        <div className="mx-stat">
          <b>{done}</b>
          <span>تمت</span>
        </div>
      </div>
      <div className="mx-seg" role="group" aria-label="المهام">
        {tabs.map(([id, label]) => (
          <button key={id} aria-pressed={tab === id} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>
      {list.length ? (
        <div className="mx-tasks">
          {list.map((t) => {
            const a = m.assets.find((x) => x.id === t.asset_id);
            const isLate = t.status === 'open' && new Date(t.due) < new Date();
            return (
              <div key={t.id} className={`mx-task ${t.status === 'done' ? 'done' : ''}`}>
                <span className="ti">
                  <Icon name={kindIcon[t.kind] ?? 'tasks'} />
                </span>
                <span>
                  <b>{t.what}</b>
                  <small>
                    {taskKindLabels[t.kind]}
                    {a && (
                      <>
                        {' · '}
                        <Link className="mx-link" href={`/media/${a.id}`}>
                          {a.name}
                        </Link>
                      </>
                    )}
                  </small>
                  <span className="meta">
                    <span>من {m.nameOf(t.assigned_by)}</span>
                    <span>إلى {m.nameOf(t.assignee)}</span>
                    <span className={isLate ? 'late' : ''}>
                      قبل <Ts>{riyadhStamp(t.due)}</Ts>
                      {isLate ? ' · متأخرة' : ''}
                    </span>
                    {t.priority === 'urgent' && <span className="mx-chip danger">عاجل</span>}
                  </span>
                  {t.note && <small>{t.note}</small>}
                </span>
                <span className="mx-toolbar">
                  {t.status === 'open' && (t.assignee === m.email || m.isAdmin || manager) && (
                    <button
                      className="primary"
                      disabled={busy === t.id}
                      onClick={async () => {
                        setBusy(t.id);
                        const r = await m.completeTask(t.id);
                        setBusy('');
                        m.say(r.ok ? `أُتمّت المهمة، وأُبلغ ${m.nameOf(t.assigned_by)}` : r.error);
                      }}
                    >
                      <Icon name="check" />
                      تمت
                    </button>
                  )}
                  {a && (
                    <Link className="button" href={`/media/${a.id}`}>
                      فتح الأصل
                    </Link>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mx-empty">
          <span className="ei">
            <Icon name="check" />
          </span>
          <b>لا توجد مهام هنا</b>
          <span>تُسند المهام من صفحة أي أصل أو من القائمة السريعة في المكتبة.</span>
        </div>
      )}
    </div>
  );
}

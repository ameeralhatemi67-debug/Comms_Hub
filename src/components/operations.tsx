'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { isMine, personById, roles, ready, type Work } from '@/lib/domain';
import { useHub } from '@/lib/store';
import { ReleaseHistory } from './release-history';
import { Title, Panel, StatusChip, Empty, MediaPreview, Modal, Tabs, LogoLoader } from './ui';

export function Approvals() {
  const { state, dispatch } = useHub();
  const params = useSearchParams();
  const actor = roles[state.role];
  const [tab, setTab] = useState(actor.publish ? 'publish' : 'review');
  const [id, setId] = useState(params.get('work') || '');
  const [dialog, setDialog] = useState('');
  const [reason, setReason] = useState('');
  const [date, setDate] = useState('2026-09-23T18:00');
  const [mode, setMode] = useState<'success' | 'partial' | 'failure'>('partial');

  const list = state.work.filter((w) =>
    tab === 'review'
      ? actor.review
        ? w.status === 'IN_REVIEW'
        : isMine(state.role, w) && !!w.release
      : ready(w),
  );
  const w = list.find((x) => x.id === id) || list[0];
  const close = () => {
    setDialog('');
    setReason('');
  };

  function publish(item: Work, retry = false) {
    dispatch({ type: retry ? 'retry' : 'publish', id: item.id });
    close();
    setTimeout(() => dispatch({ type: 'result', id: item.id, mode: retry ? 'success' : mode }), 900);
  }

  return (
    <>
      <Title title="الموافقات والنشر" sub="مراجعة الإصدار أولاً، ثم جدولة النشر بواسطة مسؤول النشر." />
      <Tabs
        value={tab}
        onChange={(v) => {
          setTab(v);
          setId('');
        }}
        items={[
          { id: 'review', label: actor.review ? 'يحتاج مراجعتي' : 'طلباتي للمراجعة' },
          { id: 'publish', label: 'النشر' },
        ]}
      />
      <div className="review-layout">
        <aside>
          <Panel title={tab === 'review' ? 'الإصدارات المرسلة' : 'الإصدارات المعتمدة'}>
            {list.map((x) => (
              <button
                className={`queue-item ${w?.id === x.id ? 'selected' : ''}`}
                key={x.id}
                onClick={() => setId(x.id)}
              >
                <b>{x.title}</b>
                <small>
                  الإصدار {x.revision} · {personById(x.assignee).name}
                </small>
                <StatusChip status={x.status} />
              </button>
            ))}
            {!list.length && (
              <Empty>
                {actor.admin ? 'Admin لا يملك سلطة اعتماد المحتوى.' : 'لا توجد إصدارات في هذه القائمة.'}
              </Empty>
            )}
          </Panel>
        </aside>
        {w ? (
          <Panel>
            <div className="between">
              <div>
                <span className="eyebrow">
                  {tab === 'review' ? 'أنت تراجع' : 'حزمة النشر'} · الإصدار {w.release?.revision}
                </span>
                <h2>{w.title}</h2>
              </div>
              <StatusChip status={w.status} />
            </div>
            <MediaPreview assetId={w.release?.assetId} version={w.release?.assetVersion} large />
            <p className="body-copy">{w.release?.body}</p>
            {w.release?.channels.map((c) => (
              <div key={c} className="variant-copy">
                <b>{c}</b>
                <p>{w.release?.variants[c] || w.release?.body}</p>
              </div>
            ))}
            <div className="release-note">
              الاعتماد مرتبط بهذا النص، وهذه الوسائط بإصداراتها، والقنوات المحددة. الجدولة هنا إجراء تنفيذي لاحق في
              نموذج UX.
            </div>
            {tab === 'review' ? (
              <div className="actions">
                {actor.review && w.status === 'IN_REVIEW' ? (
                  <>
                    <button className="primary" onClick={() => dispatch({ type: 'approve', id: w.id })}>
                      اعتماد الإصدار {w.revision}
                    </button>
                    <button onClick={() => setDialog('changes')}>طلب تعديل</button>
                    <button className="danger" onClick={() => setDialog('reject')}>
                      رفض
                    </button>
                  </>
                ) : (
                  <p className="muted">
                    {actor.admin ? 'سلطة النظام منفصلة عن اعتماد المحتوى.' : 'بانتظار قرار المراجع.'}
                  </p>
                )}
              </div>
            ) : (
              <>
                <p className="muted">
                  اعتمده {w.release?.approvedBy && roles[w.release.approvedBy].user} ·{' '}
                  {w.scheduled ? `${w.scheduled.replace('T', ' · ')} بتوقيت الرياض` : 'لم يُحدد موعد بعد'}
                </p>
                <div className="channel-results">
                  {w.channels.map((c) => (
                    <div key={c}>
                      <b>{c}</b>
                      <span className={w.results[c] === 'FAILED' ? 'danger' : 'success'}>
                        {w.results[c] === 'SUCCESS'
                          ? 'تم النشر'
                          : w.results[c] === 'FAILED'
                            ? 'فشل تجريبي · أعد المحاولة'
                            : w.status === 'PUBLISHING'
                              ? (
                                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                    <LogoLoader size={16} />
                                    جارٍ التنفيذ…
                                  </span>
                                )
                              : 'جاهز'}
                      </span>
                    </div>
                  ))}
                </div>
                {actor.publish && (
                  <div className="actions">
                    {['APPROVED', 'SCHEDULED'].includes(w.status) && (
                      <>
                        <button onClick={() => setDialog('schedule')}>جدولة</button>
                        <button className="primary" onClick={() => setDialog('publish')}>
                          محاكاة النشر
                        </button>
                      </>
                    )}
                    {['PARTIAL', 'FAILED'].includes(w.status) && (
                      <button className="primary" onClick={() => publish(w, true)}>
                        إعادة محاولة القنوات الفاشلة
                      </button>
                    )}
                    {w.status === 'PUBLISHING' && (
                      <span role="status" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                        <LogoLoader size={22} />
                        جارٍ النشر التجريبي…
                      </span>
                    )}
                  </div>
                )}
                {!actor.publish && <p className="warning">الجدولة والتنفيذ متاحان لمسؤول النشر وإدارة الحسابات.</p>}
              </>
            )}
            <ReleaseHistory work={w} />
            <Link className="text-link" href={`/work/${w.id}`}>
              تفاصيل العمل وسجل الإصدارات ←
            </Link>
          </Panel>
        ) : (
          <Panel>
            <Empty>سيظهر العمل هنا عند إرساله أو اعتماده.</Empty>
          </Panel>
        )}
      </div>
      {dialog && w && (
        <Modal
          title={
            dialog === 'schedule'
              ? 'جدولة الإصدار المعتمد'
              : dialog === 'publish'
                ? 'تأكيد محاكاة النشر'
                : dialog === 'changes'
                  ? 'سبب طلب التعديل'
                  : 'سبب الرفض'
          }
          onClose={close}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (dialog === 'schedule') dispatch({ type: 'schedule', id: w.id, date });
              else if (dialog === 'publish') {
                publish(w);
                return;
              } else dispatch({ type: dialog === 'changes' ? 'changes' : 'reject', id: w.id, text: reason });
              close();
            }}
          >
            {dialog === 'schedule' ? (
              <label>
                الموعد بتوقيت الرياض
                <input type="datetime-local" required value={date} onChange={(e) => setDate(e.target.value)} />
              </label>
            ) : dialog === 'publish' ? (
              <>
                <p>
                  سيُحاكى نشر الإصدار {w.revision} إلى {w.channels.join('، ')}. لا يُرسل شيء خارج المتصفح.
                </p>
                <label>
                  نتيجة المحاكاة
                  <select value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
                    <option value="success">نجاح جميع القنوات</option>
                    <option value="partial">فشل آخر قناة</option>
                    <option value="failure">فشل جميع القنوات</option>
                  </select>
                </label>
              </>
            ) : (
              <label>
                الملاحظات
                <textarea required value={reason} onChange={(e) => setReason(e.target.value)} />
              </label>
            )}
            <button className="primary">{dialog === 'publish' ? 'تأكيد المحاكاة' : 'تأكيد'}</button>
          </form>
        </Modal>
      )}
    </>
  );
}

/** Gregorian month names in Arabic. The native month input renders its own
 *  locale label, so the page states the month itself for Arabic readers. */
const monthNames = [
  'يناير',
  'فبراير',
  'مارس',
  'أبريل',
  'مايو',
  'يونيو',
  'يوليو',
  'أغسطس',
  'سبتمبر',
  'أكتوبر',
  'نوفمبر',
  'ديسمبر',
];

const weekdayNames = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

function shiftMonth(month: string, by: number) {
  const year = Number(month.slice(0, 4));
  const index = Number(month.slice(5, 7)) - 1 + by;
  const date = new Date(Date.UTC(year, index, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function Calendar() {
  const { state } = useHub();
  const [selected, setSelected] = useState<Work | null>(null);
  const [view, setView] = useState('month');
  const [filter, setFilter] = useState('all');
  const [month, setMonth] = useState('2026-09');

  const year = Number(month.slice(0, 4));
  const monthIndex = Number(month.slice(5, 7)) - 1;
  // Day count and starting weekday are read in UTC so the grid never shifts
  // with the viewer's local timezone.
  const days = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  // 0 = Sunday, which is the first column of the Arabic working week.
  const firstWeekday = new Date(Date.UTC(year, monthIndex, 1)).getUTCDay();
  const monthLabel = `${monthNames[monthIndex]} ${year}`;

  const events = state.work
    .flatMap((w) => [
      ...(filter !== 'publications' ? [{ w, date: w.due, kind: 'موعد تسليم' }] : []),
      ...(w.scheduled && filter !== 'tasks'
        ? [{ w, date: w.scheduled.slice(0, 10), kind: `نشر ${w.scheduled.slice(11)}` }]
        : []),
    ])
    .filter((e) => e.date.startsWith(month));

  return (
    <>
      <Title title="التقويم" sub="مواعيد العمل والنشر · جميع الأوقات بتوقيت الرياض">
        <div className="month-picker">
          <button type="button" aria-label="الشهر السابق" onClick={() => setMonth(shiftMonth(month, -1))}>
            ‹
          </button>
          <b aria-live="polite">{monthLabel}</b>
          <button type="button" aria-label="الشهر التالي" onClick={() => setMonth(shiftMonth(month, 1))}>
            ›
          </button>
          {/* Arabic selects rather than a native month input, whose label the
              browser renders in its own locale ("September 2026"). */}
          <select
            aria-label="اختيار الشهر"
            value={String(monthIndex)}
            onChange={(e) => setMonth(`${year}-${String(Number(e.target.value) + 1).padStart(2, '0')}`)}
          >
            {monthNames.map((name, i) => (
              <option key={name} value={i}>
                {name}
              </option>
            ))}
          </select>
          <select
            aria-label="اختيار السنة"
            value={String(year)}
            onChange={(e) => setMonth(`${e.target.value}-${String(monthIndex + 1).padStart(2, '0')}`)}
          >
            {[2025, 2026, 2027].map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
      </Title>
      <div className="filters">
        <button onClick={() => setView(view === 'month' ? 'agenda' : 'month')}>
          {view === 'month' ? 'عرض الأجندة' : 'عرض الشهر'}
        </button>
        <select aria-label="نوع الموعد" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="all">كل المواعيد</option>
          <option value="tasks">تسليم الأعمال</option>
          <option value="publications">النشر</option>
        </select>
      </div>
      {view === 'month' ? (
        <div className="calendar-grid" role="grid" aria-label={`تقويم ${monthLabel}`}>
          {weekdayNames.map((name) => (
            <div className="calendar-head" key={name} role="columnheader">
              {name}
            </div>
          ))}
          {Array.from({ length: firstWeekday }, (_, i) => (
            <div className="calendar-day calendar-pad" key={`pad-${i}`} aria-hidden="true" />
          ))}
          {Array.from({ length: days }, (_, i) => i + 1).map((day) => (
            <div className="calendar-day" key={day} role="gridcell">
              <b>{day}</b>
              {events
                .filter((e) => Number(e.date.slice(-2)) === day)
                .map((e, i) => (
                  <button key={e.w.id + i} onClick={() => setSelected(e.w)}>
                    <small>{e.kind}</small>
                    {e.w.title}
                  </button>
                ))}
            </div>
          ))}
        </div>
      ) : (
        <Panel>
          {events.map((e, i) => (
            <button className="queue-item" key={i} onClick={() => setSelected(e.w)}>
              {e.date} · {e.kind}
              <b>{e.w.title}</b>
            </button>
          ))}
          {!events.length && <Empty>لا توجد مواعيد في هذا الشهر.</Empty>}
        </Panel>
      )}
      {selected && (
        <Modal title={selected.title} onClose={() => setSelected(null)}>
          <StatusChip status={selected.status} />
          <p>التسليم: {selected.due}</p>
          <p>النشر: {selected.scheduled?.replace('T', ' · ') || 'غير مجدول'}</p>
          <Link href={`/work/${selected.id}`} className="button primary">
            فتح العمل
          </Link>
        </Modal>
      )}
    </>
  );
}

'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useIdentity } from '@/lib/use-identity';
import { addDays, channels, scenario, weekOf, channelRisks, riskText, roles, type Work } from '@/lib/domain';
import { useHub } from '@/lib/store';
import { Title, Panel, StatusChip, Empty, Modal } from './ui';

const dayNames = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

/**
 * Week view with a lane per channel and a lane for delivery dates (second design,
 * task 0.3.4.1). A scheduled item can be dragged to another day, or moved from its
 * dialog by keyboard; either way only a requested time is recorded.
 */
function WeekView({
  work,
  start,
  onShift,
  requests,
  canDrag,
  onRequest,
  onOpen,
}: {
  work: Work[];
  start: string;
  onShift: (by: number) => void;
  requests: Record<string, string>;
  canDrag: boolean;
  onRequest: (w: Work, when: string) => void;
  onOpen: (w: Work) => void;
}) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const [over, setOver] = useState('');
  const lanes: { id: string; label: string }[] = [
    ...channels.map((c) => ({ id: c, label: c })),
    { id: 'due', label: 'التسليم الداخلي' },
  ];
  const itemsFor = (lane: string, day: string) =>
    lane === 'due'
      ? work.filter((w) => w.due === day).map((w) => ({ w, time: '', pending: false }))
      : work
          .filter((w) => w.channels.includes(lane as Work['channels'][number]))
          .flatMap((w) => {
            const out: { w: Work; time: string; pending: boolean }[] = [];
            if (w.scheduled?.startsWith(day)) out.push({ w, time: w.scheduled.slice(11), pending: false });
            if (requests[w.id]?.startsWith(day)) out.push({ w, time: requests[w.id].slice(11), pending: true });
            return out;
          });
  const load = (day: string) => lanes.reduce((n, l) => n + itemsFor(l.id, day).length, 0);
  const most = Math.max(1, ...days.map(load));

  return (
    <div className="week-wrap">
      <div className="week-nav">
        <button type="button" onClick={() => onShift(-1)} aria-label="الأسبوع السابق">
          ‹
        </button>
        <b>
          {days[0]} – {days[6]}
        </b>
        <button type="button" onClick={() => onShift(1)} aria-label="الأسبوع التالي">
          ›
        </button>
        {canDrag && <small>اسحب موعد نشر إلى يوم آخر لطلب نقله. يؤكد مسؤول النشر كل نقل.</small>}
      </div>
      <div className="week-grid" role="grid" aria-label={`أسبوع ${days[0]}`}>
        <div className="week-corner" />
        {days.map((day, i) => (
          <div className={`week-head ${day === scenario.today ? 'today' : ''}`} key={day} role="columnheader">
            {dayNames[i]}
            <b>{Number(day.slice(8))}</b>
            <span className="heat" style={{ opacity: 0.15 + (load(day) / most) * 0.85 }} aria-hidden="true" />
          </div>
        ))}
        {lanes.map((lane) => (
          <div className="week-lane" key={lane.id} role="row">
            <div className="week-lane-label" role="rowheader">
              {lane.label}
            </div>
            {days.map((day) => (
              <div
                className={`week-cell ${over === lane.id + day ? 'over' : ''}`}
                key={day}
                role="gridcell"
                data-day={day}
                data-lane={lane.id}
                onDragOver={(e) => {
                  if (!canDrag || lane.id === 'due') return;
                  e.preventDefault();
                  setOver(lane.id + day);
                }}
                onDragLeave={() => setOver('')}
                onDrop={(e) => {
                  e.preventDefault();
                  setOver('');
                  const w = work.find((x) => x.id === e.dataTransfer.getData('text/plain'));
                  if (w?.scheduled) onRequest(w, `${day}T${w.scheduled.slice(11)}`);
                }}
              >
                {itemsFor(lane.id, day).map(({ w, time, pending }) => (
                  <button
                    type="button"
                    key={w.id + (pending ? '-req' : '')}
                    className={`ev ${pending ? 'pending' : ''} ev-${w.status}`}
                    draggable={canDrag && lane.id !== 'due' && !pending && !!w.scheduled}
                    onDragStart={(e) => e.dataTransfer.setData('text/plain', w.id)}
                    onClick={() => onOpen(w)}
                  >
                    <b>{w.title}</b>
                    <small>
                      {lane.id === 'due' ? 'تسليم' : time}
                      {pending ? ' · طلب نقل' : ''}
                    </small>
                  </button>
                ))}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
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
  const { state, dispatch } = useHub();
  const second = useIdentity();
  const actor = roles[state.role];
  const [selected, setSelected] = useState<Work | null>(null);
  // '' follows the design: the second design opens on the week, Direction A on the month.
  const [chosenView, setView] = useState('');
  const view = chosenView || (second ? 'week' : 'month');
  const [weekStart, setWeekStart] = useState(weekOf(scenario.today)[0]);
  // Requested publication times. Dragging only requests a move; the publishing
  // officer confirms it (task 0.3.4.1, assumption A12). Requests live in the shared
  // store, so they survive navigating away from the calendar.
  const requests = Object.fromEntries(state.moveRequests.map((r) => [r.workId, r.date]));
  const [moveTo, setMoveTo] = useState('');
  const canRequest = actor.review || actor.publish;
  const requestMove = (w: Work, when: string) => {
    if (!w.scheduled || when === w.scheduled) return;
    dispatch({ type: 'move-request', id: w.id, date: when });
  };
  const dropRequest = (id: string) => dispatch({ type: 'move-cancel', id });
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
        {second ? (
          <div className="seg" role="group" aria-label="عرض التقويم">
            {[
              ['week', 'أسبوع'],
              ['month', 'شهر'],
              ['agenda', 'أجندة'],
            ].map(([id, label]) => (
              <button type="button" key={id} aria-pressed={view === id} onClick={() => setView(id)}>
                {label}
              </button>
            ))}
          </div>
        ) : (
          <button onClick={() => setView(view === 'month' ? 'agenda' : 'month')}>
            {view === 'month' ? 'عرض الأجندة' : 'عرض الشهر'}
          </button>
        )}
        <select aria-label="نوع الموعد" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="all">كل المواعيد</option>
          <option value="tasks">تسليم الأعمال</option>
          <option value="publications">النشر</option>
        </select>
      </div>
      {view === 'week' && second ? (
        <WeekView
          work={state.work}
          start={weekStart}
          onShift={(by) => setWeekStart(addDays(weekStart, by * 7))}
          requests={requests}
          canDrag={canRequest}
          onRequest={requestMove}
          onOpen={setSelected}
        />
      ) : view === 'month' || view === 'week' ? (
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
      {second && Object.keys(requests).length > 0 && (
        <Panel title="طلبات نقل المواعيد">
          {Object.entries(requests).map(([id, when]) => {
            const w = state.work.find((x) => x.id === id)!;
            const risks = channelRisks(w.channels, when);
            return (
              <div className="move-request" key={id}>
                <span>
                  <b>{w.title}</b>
                  <small>
                    من {w.scheduled?.replace('T', ' ')} إلى {when.replace('T', ' ')}
                  </small>
                  {risks.map((r) => (
                    <small className="danger" key={r.channel}>
                      {riskText(r)}
                    </small>
                  ))}
                </span>
                {actor.publish ? (
                  <span className="actions">
                    <button
                      className="primary"
                      // Scheduling clears the request in the reducer.
                      onClick={() => dispatch({ type: 'schedule', id, date: when })}
                    >
                      تأكيد النقل
                    </button>
                    <button onClick={() => dropRequest(id)}>إلغاء الطلب</button>
                  </span>
                ) : (
                  <span className="muted">بانتظار تأكيد مسؤول النشر</span>
                )}
              </div>
            );
          })}
        </Panel>
      )}
      {selected && (
        <Modal
          title={selected.title}
          onClose={() => {
            setSelected(null);
            setMoveTo('');
          }}
        >
          <StatusChip status={selected.status} />
          <p>التسليم: {selected.due}</p>
          <p>النشر: {selected.scheduled?.replace('T', ' · ') || 'غير مجدول'}</p>
          {second && canRequest && selected.scheduled && (
            <form
              className="move-form"
              onSubmit={(e) => {
                e.preventDefault();
                requestMove(selected, moveTo || selected.scheduled!);
                setSelected(null);
                setMoveTo('');
              }}
            >
              <label>
                طلب موعد جديد بتوقيت الرياض
                <input
                  type="datetime-local"
                  required
                  value={moveTo || selected.scheduled}
                  onChange={(e) => setMoveTo(e.target.value)}
                />
              </label>
              <button type="submit">طلب النقل</button>
            </form>
          )}
          <Link href={`/work/${selected.id}`} className="button primary">
            فتح العمل
          </Link>
        </Modal>
      )}
    </>
  );
}

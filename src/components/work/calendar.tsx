'use client';
// «التقويم» on real data, after «النموذج المرجعي للمركز» version 5: day, week, month and a
// two-week list; a lane per connected account, then mail, events, and deliveries with tasks;
// project bands; stages and tasks that run across days; the team's load under each day; and
// warnings that do not block (an authorisation that will not cover the time, two works on one
// account within two hours, a day with seven or more entries). Moving a publish date is a
// request (only «موعد النشر» goes back to review); leaders move deliveries and stages
// directly. Dragging uses pointer events (src/lib/work/drag.ts), so a finger works too.
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Bell,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Flag,
  ListChecks,
  Mail,
  Plus,
  Send,
  Shield,
  Trash2,
  TriangleAlert,
  Users,
  X,
} from 'lucide-react';
import { installCellDrag } from '@/lib/work/drag';
import {
  accountName,
  accountState,
  authOk,
  canPublish,
  dueNote,
  fdate,
  isLead,
  riyadhStamp,
  stageLine,
  stageState,
  stageStateLabels,
  type StageRow,
  type WorkRow,
} from '@/lib/work/rules';
import {
  ALL_ON,
  BUSY_DAY,
  CAL_KIND,
  FILTERS,
  KEY_ORDER,
  WEEK_DAYS,
  bandsFor,
  calEntries,
  canCancelMove,
  canMoveDates,
  canRequestMove,
  dayCount,
  dayLoad,
  dayName,
  daysFrom,
  entryTitle,
  grouped,
  lanesOf,
  monthCells,
  moveBlock,
  moveOnlyDate,
  rangeTitle,
  shiftAnchor,
  spansFor,
  weekStart,
  type CalEntry,
  type CalFilter,
  type CalView,
  type PlanWork,
  whenText,
} from '@/lib/work/planning';
import { usePlanData, useWork, useWorkList } from './data';
import { AddDayDialog, DueDialog, EventDialog, MoveDialog, ReminderDialog, TaskDialog, TaskExtensionDialog, type DayPick } from './day-dialogs';
import { ExtensionDialog } from './item';
import { Av, Empty, Hint, Ic, PrioChip, StatusChip, Wid } from './parts';
import { ScheduleDialog } from './publish';

type Dialog =
  | { t: 'add'; date: string }
  | { t: 'move'; w: WorkRow; at?: string }
  | { t: 'due'; e: CalEntry; date?: string }
  | { t: 'task'; date: string }
  | { t: 'event'; date: string }
  | { t: 'rem'; date: string }
  | { t: 'sched'; w: WorkRow; at?: string }
  | { t: 'stageExt'; e: CalEntry }
  | { t: 'taskExt'; e: CalEntry };

const VIEWS: [CalView, string][] = [['day', 'يوم'], ['week', 'أسبوع'], ['month', 'شهر'], ['agenda', 'قائمة']];

export function CalendarPage() {
  const w = useWork();
  const { items, status, reload } = useWorkList();
  const plan = usePlanData();
  const params = useSearchParams();
  const [view, setView] = useState<CalView>((params.get('view') as CalView) || 'week');
  const [anchor, setAnchor] = useState(params.get('date') || w.today);
  const [filter, setFilter] = useState<CalFilter>(ALL_ON);
  const [mine, setMine] = useState(false);
  const [project, setProject] = useState(params.get('project') || 'all');
  const [sel, setSel] = useState<string | null>(null);
  const [dlg, setDlg] = useState<Dialog | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const nowIso = useMemo(() => new Date().toISOString(), [items, plan.tasks]); // eslint-disable-line react-hooks/exhaustive-deps

  // On a phone the list reads best, as in the reference.
  useEffect(() => {
    if (!params.get('view') && window.matchMedia('(max-width: 700px)').matches) setView('agenda');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const works: PlanWork[] = items;
  const all = useMemo(
    () => calEntries({ works, tasks: plan.tasks, events: plan.events, reminders: plan.reminders, accounts: w.accounts, me: w.me, today: w.today, nowIso, filter, mine, project }),
    [works, plan.tasks, plan.events, plan.reminders, w.accounts, w.me, w.today, nowIso, filter, mine, project],
  );
  const pendingOf = (id: string) => items.find((x) => x.w.id === id)?.pendingKeys;
  const stagesOf = (id: string) => items.find((x) => x.w.id === id)?.stages ?? [];

  const act = async (fn: string, args: Record<string, unknown>, ok: string): Promise<boolean> => {
    const r = await w.call(fn, args);
    if (!r.ok) {
      w.say(r.error);
      return false;
    }
    w.say(ok);
    await Promise.all([reload(), plan.reload(), w.reloadBase()]);
    return true;
  };
  const refresh = async (msg: string) => {
    w.say(msg);
    await Promise.all([reload(), plan.reload(), w.reloadBase()]);
  };

  // Drag an entry to another day: a publish date becomes a request, a delivery or stage a new date.
  const allRef = useRef(all);
  allRef.current = all;
  useEffect(() => {
    if (!wrap.current) return;
    return installCellDrag(wrap.current, {
      onDrop: (key, date) => {
        const e = allRef.current.find((x) => x.key === key);
        if (!e || e.date === date) return;
        setSel(null);
        if ((e.k === 'pub' || e.k === 'pubok') && e.w) setDlg({ t: 'move', w: e.w, at: `${date}T${e.time || '18:00'}` });
        else if ((e.k === 'due' || e.k === 'stage') && e.w) setDlg({ t: 'due', e, date });
      },
    });
  }, [view, status, plan.status]);

  // Escape closes the entry panel.
  useEffect(() => {
    if (!sel) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && !document.querySelector('dialog[open]') && setSel(null);
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [sel]);

  const canDrag = (e: CalEntry) =>
    !!e.w && (((e.k === 'pub' || e.k === 'pubok') && canRequestMove(e.w, w.me, w.role)) || ((e.k === 'due' || e.k === 'stage') && canMoveDates(w.role)));
  const lead = isLead(w.role);
  const entry = sel ? all.find((e) => e.key === sel) : undefined;
  const ready = items.map((x) => x.w).filter((x) => x.status === 'APPROVED' && !x.closed_at);

  const pickDay = (date: string, p: DayPick) => {
    if (p === 'task') setDlg({ t: 'task', date });
    else if (p === 'event') setDlg({ t: 'event', date });
    else if (p === 'rem') setDlg({ t: 'rem', date });
    else setDlg({ t: 'sched', w: p.ready, at: `${date}T${p.ready.proposed_at ? riyadhStamp(p.ready.proposed_at).slice(11, 16) : '18:00'}` });
  };

  const loading = status === 'loading' || plan.status === 'loading' || w.status === 'loading';
  const failed = status === 'error' || plan.status === 'error' || w.status === 'error';

  return (
    <div className="wk">
      <div className="wk-head">
        <div>
          <h1>التقويم</h1>
          <p>مواعيد النشر لكل حساب، والتسليم والمراحل والمهام والأحداث، في مكان واحد. نقل موعد نشر طلبٌ يُعتمد، ونقل التسليم والمراحل للقادة مباشرة.</p>
        </div>
        <div className="wk-acts">
          <span className="wk-today">
            <Ic i={CalendarDays} />
            اليوم: {fdate(w.today)}
          </span>
          <button type="button" className="wk-btn gold" onClick={() => setDlg({ t: 'add', date: anchor < w.today ? w.today : anchor })}>
            <Ic i={Plus} />
            إضافة
          </button>
        </div>
      </div>

      <div className="wk-tabs-row">
        <div className="wk-seg" role="group" aria-label="العرض" data-gd="calviews">
          {VIEWS.map(([id, label]) => (
            <button type="button" key={id} aria-pressed={view === id} onClick={() => setView(id)}>
              {label}
            </button>
          ))}
        </div>
        <div className="wk-calnav">
          <button type="button" className="wk-btn sm icon" aria-label="السابق" onClick={() => setAnchor(shiftAnchor(view, anchor, -1))}>
            <Ic i={ChevronRight} />
          </button>
          <button type="button" className="wk-btn sm" onClick={() => setAnchor(w.today)}>
            اليوم
          </button>
          <button type="button" className="wk-btn sm icon" aria-label="التالي" onClick={() => setAnchor(shiftAnchor(view, anchor, 1))}>
            <Ic i={ChevronLeft} />
          </button>
          <b>{rangeTitle(view, anchor)}</b>
        </div>
      </div>

      <div className="wk-calf">
        <div className="wk-pick" role="group" aria-label="ما يظهر">
          {FILTERS.map(([k, label]) => (
            <label key={k}>
              <input type="checkbox" checked={filter[k]} onChange={(e) => setFilter({ ...filter, [k]: e.target.checked })} />
              {label}
            </label>
          ))}
        </div>
        <label className="wk-sw">
          <input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} />
          عملي فقط
        </label>
        <select className="wk-sel" value={project} onChange={(e) => setProject(e.target.value)} aria-label="المشروع">
          <option value="all">كل المشاريع</option>
          {w.projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="wk-loading" role="status">
          جارٍ تحميل التقويم…
        </div>
      ) : failed ? (
        <Empty i={CalendarDays} title="تعذّر تحميل التقويم">
          أعد تحميل الصفحة. إن تكرر هذا فقد يكون الاتصال بقاعدة البيانات متوقفاً.
        </Empty>
      ) : (
        <div ref={wrap} className="wk-calwrap">
          {view === 'week' && (
            <Week all={all} anchor={anchor} works={works} filter={filter} mine={mine} project={project} nowIso={nowIso} canDrag={canDrag} onSel={setSel} onDay={(d) => { setView('day'); setAnchor(d); }} onAdd={(d) => setDlg({ t: 'add', date: d })} />
          )}
          {view === 'month' && <Month all={all} anchor={anchor} filter={filter} project={project} canDrag={canDrag} onSel={setSel} onDay={(d) => { setView('day'); setAnchor(d); }} onAdd={(d) => setDlg({ t: 'add', date: d })} />}
          {view === 'day' && <DayList all={all} day={anchor} filter={filter} project={project} onSel={setSel} onAdd={(d) => setDlg({ t: 'add', date: d })} />}
          {view === 'agenda' && <Agenda all={all} anchor={anchor} onSel={setSel} onDay={(d) => { setView('day'); setAnchor(d); }} />}
        </div>
      )}

      <div className="wk-legend">
        {KEY_ORDER.map((k) => (
          <span key={k} className={`wk-cchip ${CAL_KIND[k][1]} static`}>
            <span>{CAL_KIND[k][0]}</span>
          </span>
        ))}
        <span className="wk-cchip k-pub risk static">
          <Ic i={TriangleAlert} />
          <span>التفويض لا يغطي الموعد</span>
        </span>
        <span className="wk-cchip k-pub near static">
          <Ic i={Clock} />
          <span>قريب من منشور آخر</span>
        </span>
      </div>
      <p className="wk-col-hint">
        النشر في هذه المرحلة محاكاة: لا يصل شيء إلى المنصات.{' '}
        {lead || canPublish(w.role) ? `اسحب موعد نشر إلى يوم آخر لطلب نقله${lead ? '، واسحب التسليم أو المرحلة لتغييرهما مباشرة' : ''}. أو افتح أي موعد واختر الإجراء.` : 'افتح أي موعد لترى تفاصيله.'}
      </p>

      {entry && (
        <EntryDrawer
          e={entry}
          pendingKeys={entry.w ? pendingOf(entry.w.id) : undefined}
          stages={entry.w ? stagesOf(entry.w.id) : []}
          onClose={() => setSel(null)}
          open={setDlg}
          act={act}
        />
      )}

      {dlg?.t === 'add' && <AddDayDialog date={dlg.date} ready={ready} onClose={() => setDlg(null)} onPick={(p) => pickDay(dlg.date, p)} />}
      {dlg?.t === 'move' && <MoveDialog w={dlg.w} at={dlg.at} entries={all} onClose={() => setDlg(null)} act={act} />}
      {dlg?.t === 'due' && dlg.e.w && <DueDialog w={dlg.e.w} stages={stagesOf(dlg.e.w.id)} si={dlg.e.k === 'stage' ? (dlg.e.si ?? null) : null} date={dlg.date} onClose={() => setDlg(null)} act={act} />}
      {dlg?.t === 'task' && <TaskDialog date={dlg.date} project={project !== 'all' ? project : undefined} tasks={plan.tasks} onClose={() => setDlg(null)} done={refresh} />}
      {dlg?.t === 'event' && <EventDialog date={dlg.date} project={project !== 'all' ? project : undefined} onClose={() => setDlg(null)} act={act} />}
      {dlg?.t === 'rem' && <ReminderDialog date={dlg.date} onClose={() => setDlg(null)} act={act} />}
      {dlg?.t === 'sched' && <ScheduleDialog w={dlg.w} approvedParts={[]} at={dlg.at} onClose={() => setDlg(null)} act={act} />}
      {dlg?.t === 'stageExt' && dlg.e.w && dlg.e.si != null && <ExtensionDialog d={{ w: dlg.e.w }} stage={stagesOf(dlg.e.w.id)[dlg.e.si]} onClose={() => setDlg(null)} act={act} />}
      {dlg?.t === 'taskExt' && dlg.e.t && <TaskExtensionDialog t={dlg.e.t} onClose={() => setDlg(null)} act={act} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Entries
// ---------------------------------------------------------------------------
export function Chip({ e, compact, drag, onSel }: { e: CalEntry; compact?: boolean; drag: boolean; onSel: (k: string) => void }) {
  const [label, cls] = CAL_KIND[e.k];
  const res = e.k === 'done' && e.ch && e.w?.results[e.ch] ? (e.w.results[e.ch].ok ? ' ok' : ' bad') : '';
  // A stage on a day cell names the stage; its work is in the tooltip and the panel.
  const title = compact && e.k === 'stage' ? (e.sn ?? entryTitle(e)) : entryTitle(e);
  return (
    <button
      type="button"
      className={`wk-cchip ${cls}${res}${e.late ? ' late' : ''}${e.risk ? ' risk' : ''}${e.near ? ' near' : ''}${e.w && e.w.priority === 'urgent' && e.k !== 'done' ? ' urg' : ''}`}
      data-cdrag={drag ? e.key : undefined}
      title={`${label} · ${entryTitle(e)}${e.risk ? ' · التفويض لا يغطي الموعد' : ''}${e.near ? ` · قريب من «${e.near.title}»` : ''}`}
      onClick={() => onSel(e.key)}
    >
      {e.time && <time>{e.time}</time>}
      {e.risk || e.late ? <Ic i={TriangleAlert} /> : e.near ? <Ic i={Clock} /> : null}
      <span>{title}</span>
    </button>
  );
}

function DayHead({ d, all, onDay, onAdd }: { d: string; all: CalEntry[]; onDay: (d: string) => void; onAdd: (d: string) => void }) {
  const w = useWork();
  return (
    <div className={`cw-day ${d === w.today ? 'is-today' : ''}`} data-drop={d}>
      <button type="button" className="cw-dn" onClick={() => onDay(d)}>
        <span>{dayName(d)}</span>
        <b>{+d.slice(8, 10)}</b>
      </button>
      {dayCount(all, d) >= BUSY_DAY && <span className="wk-busy">يوم مزدحم</span>}
      <button type="button" className="cw-add" aria-label={`إضافة في ${fdate(d)}`} onClick={() => onAdd(d)}>
        <Ic i={Plus} />
      </button>
    </div>
  );
}

function Week(props: {
  all: CalEntry[];
  anchor: string;
  works: PlanWork[];
  filter: CalFilter;
  mine: boolean;
  project: string;
  nowIso: string;
  canDrag: (e: CalEntry) => boolean;
  onSel: (k: string) => void;
  onDay: (d: string) => void;
  onAdd: (d: string) => void;
}) {
  const w = useWork();
  const { all, anchor, works, filter, canDrag, onSel } = props;
  const ws = weekStart(anchor);
  const days = daysFrom(ws, 7);
  const bands = filter.camps ? bandsFor(w.projects, ws, 7, props.project) : [];
  const spans = spansFor({ works, tasks: tasksOf(all), me: w.me, today: w.today, nowIso: props.nowIso, mine: props.mine, project: props.project, filter }, ws, 7);
  const lanes = lanesOf(w.accounts, works.map((x) => x.w));
  const loads = days.map((d) => dayLoad(all, d));
  const max = Math.max(1, ...loads.map((l) => l.n));
  const overdue = filter.due ? works.filter((x) => !x.w.closed_at && x.w.assignee && dueNote(x.w, w.today).tone === 'late').length : 0;
  return (
    <div className="wk-cweek">
      <div className="cw-corner" />
      {days.map((d) => (
        <DayHead key={d} d={d} all={all} onDay={props.onDay} onAdd={props.onAdd} />
      ))}
      {bands.length > 0 && (
        <>
          <div className="cw-lab">المشاريع</div>
          <div className="cw-bands">
            {bands.map((b) => (
              <Link key={b.id} href={`/projects/${b.id}`} className={`wk-band t${b.tone}${b.cut0 ? ' cut0' : ''}${b.cut1 ? ' cut1' : ''}`} style={{ gridColumn: `${b.from + 1} / ${b.to + 2}` }}>
                {b.name}
              </Link>
            ))}
          </div>
        </>
      )}
      {spans.length > 0 && (
        <>
          <div className="cw-lab">مراحل ومهام ممتدة</div>
          <div className="cw-bands spans">
            {spans.map((s) => (
              <button
                type="button"
                key={s.key}
                className={`wk-band span s-${s.st}${s.late ? ' late' : ''}${s.cut0 ? ' cut0' : ''}${s.cut1 ? ' cut1' : ''}`}
                style={{ gridColumn: `${s.from + 1} / ${s.to + 2}` }}
                title={`${s.label} · ${w.nameOf(s.who)} · ${stageStateLabels[s.st]}`}
                onClick={() => onSel(s.key)}
              >
                <Av name={w.nameOf(s.who) || '؟'} size="sm" />
                <span>
                  {w.nameOf(s.who)} · {s.label}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
      {lanes.map(([id, name]) => {
        const a = w.accounts.find((x) => x.id === id);
        const st = a ? accountState(a, props.nowIso) : null;
        return (
          <LaneRow key={id}>
            <div className="cw-lab">
              <span>
                <Ic i={id === 'int' ? BriefcaseBusiness : id === 'ev' ? CalendarDays : id === 'mail' ? Mail : Send} />
                {name}
              </span>
              {st && (st[1] === 'danger' || st[1] === 'warn') && <small className={st[1] === 'danger' ? 'late' : 'soon'}>{st[0]}</small>}
            </div>
            {days.map((d) => (
              <div key={d} className={`cw-cell ${d === w.today ? 'is-today' : ''}`} data-drop={d}>
                {id === 'int' && d === w.today && overdue > 0 && (
                  <Link className="wk-cchip k-due late" href="/work?tab=all">
                    <Ic i={TriangleAlert} />
                    <span>{overdue} متأخرة عن التسليم</span>
                  </Link>
                )}
                {all
                  .filter((e) => e.date === d && e.lane === id && e.k !== 'held')
                  .map((e) => (
                    <Chip key={e.key} e={e} compact drag={canDrag(e)} onSel={onSel} />
                  ))}
              </div>
            ))}
          </LaneRow>
        );
      })}
      <div className="cw-lab">حمل الفريق</div>
      {loads.map((l, i) => (
        <div key={days[i]} className={`cw-load ${l.late ? 'late' : ''}`} title={`${l.n} مواعيد تسليم ومراحل ومهام`}>
          <i style={{ width: `${Math.round((l.n / max) * 100)}%` }} />
          <span>{l.n}</span>
        </div>
      ))}
    </div>
  );
}
const LaneRow = ({ children }: { children: ReactNode }) => <>{children}</>;
/** The tasks the entries were built from. */
const tasksOf = (all: CalEntry[]) => [...new Map(all.filter((e) => e.t).map((e) => [e.t!.id, e.t!])).values()];

function Month({ all, anchor, filter, project, canDrag, onSel, onDay, onAdd }: { all: CalEntry[]; anchor: string; filter: CalFilter; project: string; canDrag: (e: CalEntry) => boolean; onSel: (k: string) => void; onDay: (d: string) => void; onAdd: (d: string) => void }) {
  const w = useWork();
  const cells = monthCells(anchor);
  const month = anchor.slice(0, 7);
  const projects = filter.camps ? w.projects.filter((p) => project === 'all' || p.id === project) : [];
  return (
    <div className="wk-cmonth">
      {WEEK_DAYS.map((n) => (
        <div className="cm-h" key={n}>
          {n}
        </div>
      ))}
      {cells.map((d) => {
        const g = grouped(all.filter((e) => e.date === d && e.k !== 'held'));
        return (
          <div key={d} className={`cm-cell ${d.slice(0, 7) === month ? '' : 'out'} ${d === w.today ? 'is-today' : ''}`} data-drop={d}>
            <div className="cm-top">
              <button type="button" className="cm-n" onClick={() => onDay(d)}>
                {+d.slice(8, 10)}
              </button>
              <span className="cm-str">
                {bandsFor(projects, d, 1).map((b) => (
                  <i key={b.id} className={`t${b.tone}`} title={b.name} />
                ))}
              </span>
              {dayCount(all, d) >= BUSY_DAY && <span className="wk-busy">مزدحم</span>}
              <button type="button" className="cw-add" aria-label={`إضافة في ${fdate(d)}`} onClick={() => onAdd(d)}>
                <Ic i={Plus} />
              </button>
            </div>
            {g.slice(0, 3).map((x) => (
              <Chip key={x.e.key} e={x.e} compact drag={canDrag(x.e)} onSel={onSel} />
            ))}
            {g.length > 3 && (
              <button type="button" className="wk-lk more" onClick={() => onDay(d)}>
                و{g.length - 3} أخرى
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Row({ x, onSel }: { x: { e: CalEntry; chs: string[] }; onSel: (k: string) => void }) {
  const w = useWork();
  const e = x.e;
  const [label, cls] = CAL_KIND[e.k];
  return (
    <button type="button" className={`wk-crow ${cls}${e.late ? ' late' : ''}`} onClick={() => onSel(e.key)}>
      <time>{e.time || 'طوال اليوم'}</time>
      <span className="ck">{label}</span>
      <span className="ct">
        <b>{entryTitle(e)}</b>
        <small>
          {e.w && <Wid id={e.w.id} />}
          {e.k === 'stage' && e.w && e.si != null ? <span>مرحلة من «{e.w.title}»</span> : null}
          {e.k === 'task' ? <span>إلى {w.nameOf(e.t!.assignee)}</span> : e.k === 'event' ? <span>{e.w?.place ?? ''}</span> : e.w?.assignee ? <span>{w.nameOf(e.w.assignee)}</span> : null}
          {e.late && <span className="late">متأخر</span>}
          {e.risk && <span className="late">التفويض لا يغطي الموعد</span>}
          {e.near && (
            <span>
              قريب من «{e.near.title}» {e.near.time}
            </span>
          )}
        </small>
        {x.chs.length > 0 && (
          <span className="wk-chres">
            {x.chs.map((c) => {
              const a = w.accounts.find((y) => y.id === c);
              const r = e.k === 'done' ? e.w?.results[c] : undefined;
              const risk = !r && e.k !== 'done' && a && a.platform !== 'mail' && e.iso && !authOk(a, e.iso);
              return (
                <span key={c} className={`wk-cr ${r ? (r.ok ? 'ok' : 'bad') : risk ? 'risk' : ''}`}>
                  {accountName(a)}
                </span>
              );
            })}
          </span>
        )}
      </span>
    </button>
  );
}

function DayList({ all, day, filter, project, onSel, onAdd }: { all: CalEntry[]; day: string; filter: CalFilter; project: string; onSel: (k: string) => void; onAdd: (d: string) => void }) {
  const w = useWork();
  const list = all.filter((e) => e.date === day);
  const bands = filter.camps ? bandsFor(w.projects, day, 1, project) : [];
  return (
    <section className="wk-psec" data-drop={day}>
      {bands.length > 0 && (
        <div className="wk-parts">
          {bands.map((b) => (
            <Link key={b.id} href={`/projects/${b.id}`} className={`wk-band t${b.tone}`}>
              {b.name}
            </Link>
          ))}
        </div>
      )}
      {dayCount(all, day) >= BUSY_DAY && <Hint warn>يوم مزدحم: {dayCount(all, day)} مواعيد. تنبيه فقط.</Hint>}
      {list.length ? (
        <div className="wk-crows">
          {grouped(list).map((x) => (
            <Row key={x.e.key} x={x} onSel={onSel} />
          ))}
        </div>
      ) : (
        <Empty i={CalendarDays} title="لا مواعيد في هذا اليوم">
          أضف من زر «إضافة» أو غيّر التصفية.
        </Empty>
      )}
      <div>
        <button type="button" className="wk-btn sm" onClick={() => onAdd(day)}>
          <Ic i={Plus} />
          إضافة في هذا اليوم
        </button>
      </div>
    </section>
  );
}

function Agenda({ all, anchor, onSel, onDay }: { all: CalEntry[]; anchor: string; onSel: (k: string) => void; onDay: (d: string) => void }) {
  const w = useWork();
  const days = daysFrom(anchor, 14).filter((d) => d === w.today || all.some((e) => e.date === d));
  return (
    <div className="wk-agenda">
      {days.map((d) => {
        const list = all.filter((e) => e.date === d);
        return (
          <section key={d} className={`ag-day ${d === w.today ? 'is-today' : ''}`} data-drop={d}>
            <h3>
              <button type="button" className="wk-lk" onClick={() => onDay(d)}>
                {fdate(d)}
              </button>
              {d === w.today && <span className="wk-chip info">اليوم</span>}
              {dayCount(all, d) >= BUSY_DAY && <span className="wk-busy">يوم مزدحم</span>}
            </h3>
            {list.length ? (
              <div className="wk-crows">
                {grouped(list).map((x) => (
                  <Row key={x.e.key} x={x} onSel={onSel} />
                ))}
              </div>
            ) : (
              <p className="wk-col-hint">لا مواعيد.</p>
            )}
          </section>
        );
      })}
      {!days.length && (
        <Empty i={CalendarDays} title="لا مواعيد في هذين الأسبوعين">
          غيّر التصفية أو انتقل إلى مدى آخر.
        </Empty>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The entry panel: details, accounts and their authorisation, and this role's actions
// ---------------------------------------------------------------------------
export function EntryDrawer({ e, pendingKeys, stages, onClose, open, act }: { e: CalEntry; pendingKeys?: string[]; stages: StageRow[]; onClose: () => void; open: (d: Dialog) => void; act: (fn: string, args: Record<string, unknown>, ok: string) => Promise<boolean> }) {
  const x = useWork();
  const w = e.w;
  const [label, cls] = CAL_KIND[e.k];
  const lead = isLead(x.role);
  const pubKind = ['pub', 'pubok', 'plan', 'move', 'held', 'done'].includes(e.k);
  const st = e.k === 'stage' && e.si != null ? stages[e.si] : undefined;
  const block = w && (e.k === 'move' || e.k === 'held') ? moveBlock(w, x.me, x.role) : '';
  const only = w ? moveOnlyDate(w, pendingKeys) : false;
  return (
    <aside className="wk-drawer" role="dialog" aria-label="تفاصيل الموعد">
      <div className="dr-h">
        <span className={`wk-cchip ${cls} static`}>
          <span>{label}</span>
        </span>
        <button type="button" className="wk-btn icon quiet" aria-label="إغلاق" onClick={onClose}>
          <Ic i={X} />
        </button>
      </div>
      <h3>{entryTitle(e)}</h3>
      <p className="dr-when">
        <Ic i={Clock} />
        {fdate(e.date)} {e.time} <small>بتوقيت الرياض</small>
      </p>
      {w && (
        <div className="wk-parts">
          <Wid id={w.id} />
          <StatusChip status={w.status} />
          <PrioChip p={w.priority} />
        </div>
      )}
      {pubKind && w && (
        <div className="wk-chanlist">
          {w.channels.map((c) => {
            const a = x.accounts.find((y) => y.id === c);
            const r = w.results[c];
            const ok = !a || a.platform === 'mail' || !e.iso || authOk(a, e.iso);
            return (
              <div className="wk-chanrow" key={c}>
                <span>
                  <b>{accountName(a)}</b>
                  {a?.handle && <small className="ltr">{a.handle}</small>}
                </span>
                {e.k === 'done' && r ? (
                  <span className={`wk-cr ${r.ok ? 'ok' : 'bad'}`}>{r.ok ? 'نُشر (محاكاة)' : (r.why ?? 'فشل')}</span>
                ) : (
                  <span className={`wk-cr ${ok ? 'ok' : 'risk'}`}>{ok ? 'التفويض يغطي الموعد' : 'التفويض لا يغطي الموعد'}</span>
                )}
              </div>
            );
          })}
        </div>
      )}
      {e.near && (
        <Hint warn>
          على الحساب نفسه منشور آخر قريب: «{e.near.title}» {e.near.time}. تنبيه فقط.
        </Hint>
      )}
      {w && (e.k === 'move' || e.k === 'held') && (
        <Hint i={Send}>
          طلب {x.nameOf(w.move_by)} نقل الموعد من <b>{w.move_from ? whenText(w.move_from) : ''}</b> إلى <b>{w.proposed_at ? whenText(w.proposed_at) : ''}</b>. الموعد الحالي معلّق حتى يُعتمد الجديد أو يُسحب الطلب، وأُبلغ مسؤول النشر.
        </Hint>
      )}
      {w && (e.k === 'move' || e.k === 'held') && !only && <Hint i={Shield}>يُراجع مع أجزاء أخرى تغيّرت: القرار في شاشة المراجعة.</Hint>}
      {w && (e.k === 'move' || e.k === 'held') && only && block && lead && <Hint i={Shield}>{block}</Hint>}
      {e.k === 'plan' && <Hint i={Flag}>موعد مقترح مع العمل، ويصبح ملزماً عند اعتماده.</Hint>}
      {e.k === 'pubok' && <Hint i={Check}>اعتُمد الموعد، وينتظر أن يجدوله مسؤول النشر.</Hint>}
      {e.k === 'due' && w && (
        <Hint i={BriefcaseBusiness} warn={e.late}>
          تسليم {x.nameOf(w.assignee)} · {dueNote(w, x.today).text}. {stageLine(w, stages, x.today, x.nameOf).text}.
        </Hint>
      )}
      {st && w && (
        <Hint i={ListChecks} warn={e.late}>
          {x.nameOf(st.who) || 'غير مسندة'} · {st.start_on ? `${fdate(st.start_on)} – ` : ''}
          {st.due_on ? fdate(st.due_on) : ''} · {stageStateLabels[stageState(stages, e.si!)]}
          {e.late ? ' · متأخرة' : ''}. التسليم النهائي {fdate(w.due)}.
        </Hint>
      )}
      {e.k === 'task' && e.t && (
        <Hint i={ListChecks} warn={e.late}>
          من {x.nameOf(e.t.assigned_by)} إلى {x.nameOf(e.t.assignee)}
          {e.t.start_on ? ` · من ${fdate(e.t.start_on)}` : ''}
          {w ? ` · للعمل ${w.id}` : ''}. المهام تُدار من صفحة «المهام».
        </Hint>
      )}
      {e.k === 'event' && w && (
        <Hint i={CalendarDays}>
          {w.place ?? ''}. التغطية مسؤولية {x.nameOf(w.assignee ?? w.created_by)}.
        </Hint>
      )}
      {e.k === 'evt' && e.ev && (
        <Hint i={CalendarDays}>
          {e.ev.place ? `${e.ev.place} · ` : ''}من {whenText(e.ev.start_at)} إلى {whenText(e.ev.end_at)}
          {e.ev.project_id ? ` · ${x.projects.find((p) => p.id === e.ev!.project_id)?.name ?? ''}` : ''}. أضافه {x.nameOf(e.ev.created_by)}.
        </Hint>
      )}
      {e.k === 'rem' && <Hint i={Bell}>تذكير خاص بك، لا يراه غيرك.</Hint>}

      <div className="dr-acts">
        {w && (e.k === 'pub' || e.k === 'pubok') && canRequestMove(w, x.me, x.role) && (
          <button type="button" className="wk-btn" onClick={() => open({ t: 'move', w })}>
            <Ic i={Clock} />
            طلب نقل الموعد
          </button>
        )}
        {w && e.k === 'pubok' && canPublish(x.role) && (
          <button type="button" className="wk-btn gold" onClick={() => open({ t: 'sched', w })}>
            <Ic i={CalendarDays} />
            جدولة في الموعد المعتمد
          </button>
        )}
        {w && (e.k === 'move' || e.k === 'held') && only && !block && (
          <button
            type="button"
            className="wk-btn gold"
            onClick={() => void act('work_decide', { p_work: w.id, p_op: 'approve', p_parts: ['date'], p_note: null, p_close: false }, 'اعتُمد الموعد الجديد.').then((ok) => ok && onClose())}
          >
            <Ic i={Check} />
            اعتماد الموعد الجديد
          </button>
        )}
        {w && (e.k === 'move' || e.k === 'held') && canCancelMove(w, pendingKeys, x.me, x.role) && (
          <button type="button" className="wk-btn" onClick={() => void act('work_cancel_move', { p_work: w.id }, `سُحب طلب النقل. يبقى الموعد ${w.move_from ? whenText(w.move_from) : ''}.`).then((ok) => ok && onClose())}>
            <Ic i={X} />
            سحب طلب النقل
          </button>
        )}
        {w && (e.k === 'move' || e.k === 'held') && !only && (
          <Link className="wk-btn" href={`/approvals/${w.id}`}>
            شاشة المراجعة
          </Link>
        )}
        {w && e.k === 'due' && canMoveDates(x.role) && (
          <button type="button" className="wk-btn" onClick={() => open({ t: 'due', e })}>
            <Ic i={CalendarDays} />
            تغيير موعد التسليم
          </button>
        )}
        {w && st && canMoveDates(x.role) && (
          <button type="button" className="wk-btn" onClick={() => open({ t: 'due', e })}>
            <Ic i={CalendarDays} />
            تغيير موعد المرحلة
          </button>
        )}
        {w && st && st.who === x.me && !st.done_at && (
          <button type="button" className="wk-btn" onClick={() => open({ t: 'stageExt', e })}>
            <Ic i={Clock} />
            طلب تمديد
          </button>
        )}
        {e.k === 'task' && e.t && e.t.assignee === x.me && e.t.status !== 'done' && (
          <button type="button" className="wk-btn" onClick={() => open({ t: 'taskExt', e })}>
            <Ic i={Clock} />
            طلب تمديد
          </button>
        )}
        {e.k === 'task' && (
          <Link className="wk-btn quiet" href="/tasks">
            صفحة المهام
          </Link>
        )}
        {e.k === 'evt' && e.ev && (e.ev.created_by === x.me || lead) && (
          <button type="button" className="wk-btn danger" onClick={() => void act('event_delete', { p_id: e.ev!.id }, `حُذف الحدث «${e.ev!.title}».`).then((ok) => ok && onClose())}>
            <Ic i={Trash2} />
            حذف الحدث
          </button>
        )}
        {e.k === 'rem' && e.r && (
          <button type="button" className="wk-btn danger" onClick={() => void act('reminder_delete', { p_id: e.r!.id }, 'حُذف التذكير.').then((ok) => ok && onClose())}>
            <Ic i={Trash2} />
            حذف التذكير
          </button>
        )}
        {w && (
          <Link className="wk-btn quiet" href={`/work/${w.id}`}>
            <Ic i={Users} />
            فتح العمل
          </Link>
        )}
      </div>
    </aside>
  );
}


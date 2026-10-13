'use client';
// «المشاريع» and the project page on real data, after «النموذج المرجعي للمركز» version 5
// (renderProjects, renderProject, projGantt, projPeopleView, projTasksView, projModal):
// campaigns, events and initiatives with their progress, the timeline of every stage and
// task, who works on what and whom they hand over to, the works and the tasks. A new project
// can carry a works plan: each planned work is created by work_create in the same step
// (project_create), its stages given to the least busy person in each role and dated back
// from its due date.
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { ArrowRight, BriefcaseBusiness, CalendarDays, Clock, Flag, FolderKanban, ListChecks, Pencil, Plus, Users, X } from 'lucide-react';
import { roles } from '@/lib/domain';
import {
  TYPE_PLANS,
  canCreateWork,
  dayAdd,
  dayDiff,
  fdate,
  inDays,
  isLead,
  isOutstanding,
  projectTypeLabels,
  riyadhStamp,
  sdate,
  stageLate,
  stageState,
  stageStateLabels,
  typeLabels,
  type WorkType,
} from '@/lib/work/rules';
import {
  planWorks,
  projLate,
  projNext,
  projPeople,
  projProgress,
  projRange,
  projState,
  projTasks,
  projWorks,
  toneOf,
  type EventItem,
  type PlanDraft,
  type PlanWork,
  type TaskItem,
  whenText,
} from '@/lib/work/planning';
import { usePlanData, useWork, useWorkList, type Project } from './data';
import { EventDialog, TaskDialog, TaskExtensionDialog } from './day-dialogs';
import { WorkTable } from './list';
import { Av, Empty, Hint, Ic, Modal, StatusChip, Wid } from './parts';
import { staffOf } from './plan';

type Act = (fn: string, args: Record<string, unknown>, ok: string) => Promise<boolean>;

function useAct(reloads: (() => Promise<void>)[]): Act {
  const w = useWork();
  return async (fn, args, ok) => {
    const r = await w.call(fn, args);
    if (!r.ok) {
      w.say(r.error);
      return false;
    }
    w.say(ok);
    await Promise.all([...reloads.map((f) => f()), w.reloadBase()]);
    return true;
  };
}

function Stack({ people, max = 6 }: { people: string[]; max?: number }) {
  const w = useWork();
  const shown = people.slice(0, max);
  return (
    <span className="wk-avs">
      {shown.map((p) => (
        <span key={p} title={w.nameOf(p)}>
          <Av name={w.nameOf(p)} size="sm" />
        </span>
      ))}
      {people.length > max && <span className="wk-av sm more">+{people.length - max}</span>}
    </span>
  );
}

export function ProjectsPage() {
  const w = useWork();
  const { items, status, reload } = useWorkList();
  const plan = usePlanData();
  const router = useRouter();
  const [dlg, setDlg] = useState(false);
  const list = [...w.projects].sort((a, b) => (a.start_on < b.start_on ? 1 : -1));
  const loading = status === 'loading' || plan.status === 'loading' || w.status === 'loading';
  return (
    <div className="wk">
      <div className="wk-head">
        <div>
          <h1>المشاريع</h1>
          <p>الحملات والفعاليات والمبادرات التي يعمل عليها الفريق أسابيع أو شهراً: من يعمل على ماذا ومتى، وما ينتظر ماذا. الحملة نوع من المشاريع.</p>
        </div>
        <div className="wk-acts">
          <span className="wk-today">
            <Ic i={CalendarDays} />
            اليوم: {fdate(w.today)}
          </span>
          {isLead(w.role) && (
            <button type="button" className="wk-btn gold" onClick={() => setDlg(true)}>
              <Ic i={Plus} />
              مشروع جديد
            </button>
          )}
        </div>
      </div>
      {loading ? (
        <div className="wk-loading" role="status">
          جارٍ تحميل المشاريع…
        </div>
      ) : status === 'error' || w.status === 'error' ? (
        <Empty i={FolderKanban} title="تعذّر تحميل المشاريع">
          أعد تحميل الصفحة.
        </Empty>
      ) : !list.length ? (
        <Empty i={FolderKanban} title="لا مشاريع بعد">
          {isLead(w.role) ? 'ابدأ من «مشروع جديد»: حملة أو فعالية أو مبادرة، مع خطة أعمالها إن شئت.' : 'تظهر هنا المشاريع حين ينشئها مدير الاتصال أو مساعده.'}
        </Empty>
      ) : (
        <div className="wk-projgrid">
          {list.map((p) => {
            const ws = projWorks(p.id, items);
            const ts = projTasks(p.id, items, plan.tasks);
            const pr = projProgress(ws, ts);
            const late = projLate(ws, w.today);
            const nx = projNext(ws, plan.events.filter((e) => e.project_id === p.id), w.today);
            const [state, cls] = projState(p, w.today);
            return (
              <article className={`wk-projcard t${toneOf(p.id)}`} key={p.id}>
                <div className="pc-top">
                  <span className="wk-chip plain">{projectTypeLabels[p.type] ?? p.type}</span>
                  <span className={`wk-chip ${cls}`}>{state}</span>
                </div>
                <b>{p.name}</b>
                <small>
                  {fdate(p.start_on)} – {fdate(p.end_on)} · {inDays(dayDiff(p.end_on, p.start_on) + 1)} · المسؤول {w.nameOf(p.owner)}
                </small>
                {p.description && <p>{p.description}</p>}
                <div className="wk-prog" role="img" aria-label={`${pr}٪ منجز`}>
                  <i style={{ width: `${pr}%` }} />
                </div>
                <small>
                  {pr}٪ من المراحل والمهام منجزة · {ws.length} أعمال{late ? <span className="late"> · {late} متأخرة</span> : null}
                </small>
                {nx && (
                  <small>
                    <Ic i={Flag} /> التالي: {nx[1]} · {fdate(nx[0])}
                  </small>
                )}
                <div className="pc-foot">
                  <Stack people={projPeople(p.owner, ws, ts)} />
                  <Link className="wk-btn sm" href={`/projects/${p.id}`}>
                    فتح المشروع
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      )}
      {dlg && (
        <ProjectDialog
          onClose={() => setDlg(false)}
          onSaved={async (id, n) => {
            await Promise.all([reload(), plan.reload()]);
            setDlg(false);
            router.push(`/projects/${id}${n ? '?tab=people' : ''}`);
          }}
        />
      )}
    </div>
  );
}

type PTab = 'timeline' | 'people' | 'works' | 'tasks';
const PTABS: [PTab, string][] = [['timeline', 'الجدول الزمني'], ['people', 'من يعمل على ماذا'], ['works', 'الأعمال'], ['tasks', 'المهام']];

export function ProjectPage({ id }: { id: string }) {
  const w = useWork();
  const tab0 = useSearchParams().get('tab');
  const { items, status, reload } = useWorkList();
  const plan = usePlanData();
  const router = useRouter();
  const [tab, setTab] = useState<PTab>(PTABS.some((t) => t[0] === tab0) ? (tab0 as PTab) : 'timeline');
  const [dlg, setDlg] = useState<'' | 'edit' | 'task' | 'event' | { ext: TaskItem }>('');
  const act = useAct([reload, plan.reload]);
  const P = w.projects.find((p) => p.id === id);
  if (status === 'loading' || plan.status === 'loading' || w.status === 'loading')
    return (
      <div className="wk">
        <div className="wk-loading" role="status">
          جارٍ تحميل المشروع…
        </div>
      </div>
    );
  if (!P)
    return (
      <div className="wk">
        <Empty i={FolderKanban} title="المشروع غير موجود">
          قد يكون الرابط خطأ.{' '}
          <Link className="wk-lk" href="/projects">
            العودة إلى المشاريع
          </Link>
        </Empty>
      </div>
    );
  const ws = projWorks(id, items);
  const ts = projTasks(id, items, plan.tasks);
  const evs = plan.events.filter((e) => e.project_id === id);
  const people = projPeople(P.owner, ws, ts);
  const pr = projProgress(ws, ts);
  const start = w.today > P.start_on ? w.today : P.start_on;
  const lead = isLead(w.role);
  return (
    <div className="wk">
      <div className="wk-back">
        <Link className="wk-btn sm" href="/projects">
          <Ic i={ArrowRight} />
          العودة إلى المشاريع
        </Link>
        <div className="wk-crumb">
          <Link href="/projects">المشاريع</Link>
          <span aria-hidden="true">‹</span>
          <span className="cur">{P.name}</span>
        </div>
      </div>
      <section className="wk-ihead">
        <span className="ti">
          <Ic i={Flag} />
        </span>
        <div className="wk-pbody">
          <div className="top">
            <span className="wk-chip plain">{projectTypeLabels[P.type] ?? P.type}</span>
            <span className={`wk-band t${toneOf(P.id)}`}>
              {fdate(P.start_on)} – {fdate(P.end_on)}
            </span>
            <span className={`wk-chip ${projState(P, w.today)[1]}`}>{projState(P, w.today)[0]}</span>
          </div>
          <h2>{P.name}</h2>
          <div className="wk-facts">
            <span>
              <Ic i={Users} />
              المسؤول {w.nameOf(P.owner)}
            </span>
            <span>{ws.length} أعمال</span>
            <span>{ts.length} مهام</span>
            <span>{pr}٪ منجز</span>
          </div>
          {P.description && <p className="wk-pdesc">{P.description}</p>}
          <div className="wk-row-acts start">
            {canCreateWork(w.role) && (
              <Link className="wk-btn sm" href={`/create?project=${P.id}${P.end_on >= w.today ? `&due=${P.end_on}` : ''}`}>
                <Ic i={Plus} />
                عمل في المشروع
              </Link>
            )}
            <button type="button" className="wk-btn sm" onClick={() => setDlg('task')}>
              <Ic i={ListChecks} />
              مهمة
            </button>
            {lead && (
              <>
                <button type="button" className="wk-btn sm" onClick={() => setDlg('event')}>
                  <Ic i={CalendarDays} />
                  حدث
                </button>
                <button type="button" className="wk-btn sm quiet" onClick={() => setDlg('edit')}>
                  <Ic i={Pencil} />
                  تعديل المشروع
                </button>
              </>
            )}
            <Link className="wk-btn sm quiet" href={`/calendar?date=${start}&project=${P.id}&view=week`}>
              <Ic i={CalendarDays} />
              في التقويم
            </Link>
          </div>
        </div>
      </section>
      <div className="wk-tabs-row">
        <div className="wk-seg" role="group" aria-label="عرض المشروع" data-gd="ptabs">
          {PTABS.map(([k, label]) => (
            <button type="button" key={k} aria-pressed={tab === k} onClick={() => setTab(k)}>
              {label}
            </button>
          ))}
        </div>
      </div>
      {!isLead(w.role) && <Hint i={ListChecks}>المهام التي تظهر لك: ما أُسند إليك وما أسندته أنت. التقدم محسوب مما تراه.</Hint>}
      {tab === 'timeline' && <Gantt P={P} works={ws} tasks={ts} events={evs} />}
      {tab === 'people' && <PeopleView P={P} works={ws} tasks={ts} all={plan.tasks} people={people} />}
      {tab === 'works' &&
        (ws.length ? (
          <WorkTable list={ws} open={(wid) => router.push(`/work/${wid}`)} projectName={(pid) => w.projects.find((p) => p.id === pid)?.name ?? ''} />
        ) : (
          <Empty i={BriefcaseBusiness} title="لا أعمال بعد">
            {canCreateWork(w.role) ? 'أضف عملاً من «عمل في المشروع»، أو اربط عملاً قائماً من تفاصيله.' : 'تظهر هنا أعمال المشروع.'}
          </Empty>
        ))}
      {tab === 'tasks' && <TasksView tasks={ts} all={plan.tasks} onExt={(t) => setDlg({ ext: t })} onNew={() => setDlg('task')} />}

      {dlg === 'edit' && <ProjectDialog project={P} onClose={() => setDlg('')} onSaved={async () => setDlg('')} />}
      {dlg === 'task' && <TaskDialog date={start} project={P.id} tasks={plan.tasks} onClose={() => setDlg('')} done={async (msg) => { w.say(msg); await Promise.all([plan.reload(), w.reloadBase()]); }} />}
      {dlg === 'event' && <EventDialog date={start} project={P.id} onClose={() => setDlg('')} act={act} />}
      {typeof dlg === 'object' && <TaskExtensionDialog t={dlg.ext} onClose={() => setDlg('')} act={act} />}
    </div>
  );
}

/** The timeline: a row per work and per stage, then the project's tasks and events; today as a line. */
function Gantt({ P, works, tasks, events }: { P: Project; works: PlanWork[]; tasks: TaskItem[]; events: EventItem[] }) {
  const w = useWork();
  const router = useRouter();
  const open = works.filter((x) => !x.w.closed_at);
  const [from, to] = projRange(P, open);
  const span = dayDiff(to, from) + 1;
  const pct = (d: string) => `${((dayDiff(d, from) / span) * 100).toFixed(2)}%`;
  const wid = (a: string, b: string) => `${Math.max(1.2, ((dayDiff(b, a) + 1) / span) * 100).toFixed(2)}%`;
  const ticks: string[] = [];
  for (let d = from; d <= to; d = dayAdd(d, 1)) if (d === from || new Date(`${d}T00:00Z`).getUTCDay() === 0) ticks.push(d);
  const todayL = w.today >= from && w.today <= to ? <i className="gtoday" style={{ insetInlineStart: pct(w.today) }} /> : null;
  if (!open.length && !tasks.length && !events.length)
    return (
      <Empty i={CalendarDays} title="لا شيء على الجدول بعد">
        تظهر هنا مراحل أعمال المشروع ومهامه وأحداثه على مدته.
      </Empty>
    );
  const taskDay = (t: TaskItem) => riyadhStamp(t.due).slice(0, 10);
  return (
    <>
      <div className="wk-gwrap">
        <div className="wk-gantt">
          <div className="g-row gscale">
            <span className="glab" />
            <div className="gtrack">
              {ticks.map((d) => (
                <span key={d} className="gtick" style={{ insetInlineStart: pct(d) }}>
                  {sdate(d)}
                </span>
              ))}
            </div>
          </div>
          {open.map((x) => {
            const pub = x.w.sched_at ?? x.w.proposed_at;
            const pubDay = pub ? riyadhStamp(pub).slice(0, 10) : '';
            return (
              <div key={x.w.id} className="g-group">
                <div className="g-row ghead">
                  <Link className="glab" href={`/work/${x.w.id}`}>
                    <Wid id={x.w.id} /> <b>{x.w.title}</b> <StatusChip status={x.w.status} />
                  </Link>
                  <div className="gtrack">
                    {todayL}
                    <i className="gdue" style={{ insetInlineStart: pct(x.w.due) }} title={`التسليم ${fdate(x.w.due)}`} />
                    {pubDay && pubDay >= from && pubDay <= to && <i className="gpub" style={{ insetInlineStart: pct(pubDay) }} title={`النشر ${whenText(pub!)}`} />}
                  </div>
                </div>
                {x.stages.map((s, i) => {
                  const st = stageState(x.stages, i);
                  const late = stageLate(s, w.today) && isOutstanding(x.w);
                  const a = s.start_on ?? s.due_on ?? x.w.due;
                  const b = s.due_on ?? a;
                  return (
                    <div key={s.id} className="g-row">
                      <span className="glab sub">
                        {s.who && <Av name={w.nameOf(s.who)} size="sm" />}
                        <span>
                          {s.name}
                          <small>
                            {s.who ? w.nameOf(s.who) : 'غير مسندة'}
                            {s.after_pos.length ? ` · بعد ${s.after_pos.map((j) => `«${x.stages[j]?.name ?? ''}»`).join(' و')}` : ''}
                          </small>
                        </span>
                      </span>
                      <div className="gtrack">
                        {todayL}
                        <button
                          type="button"
                          className={`gbar ${st}${late ? ' late' : ''}`}
                          style={{ insetInlineStart: pct(a), width: wid(a, b) }}
                          title={`${s.name} · ${w.nameOf(s.who)} · ${sdate(a)} – ${sdate(b)} · ${stageStateLabels[st]}`}
                          onClick={() => router.push(`/work/${x.w.id}`)}
                        >
                          <span>{s.who ? w.nameOf(s.who) : s.name}</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
          {tasks.length > 0 && (
            <div className="g-group">
              <div className="g-row ghead">
                <span className="glab">
                  <b>مهام المشروع</b>
                </span>
                <div className="gtrack">{todayL}</div>
              </div>
              {tasks.map((t) => {
                const b = taskDay(t);
                const a = t.start_on ?? b;
                const waiting = t.after_ids.some((y) => tasks.some((o) => o.id === y && o.status !== 'done'));
                return (
                  <div key={t.id} className="g-row">
                    <span className="glab sub">
                      <Av name={w.nameOf(t.assignee)} size="sm" />
                      <span>
                        {t.what}
                        <small>{w.nameOf(t.assignee)}</small>
                      </span>
                    </span>
                    <div className="gtrack">
                      {todayL}
                      <Link
                        href="/tasks"
                        className={`gbar ${t.status === 'done' ? 'done' : waiting ? 'waiting' : 'ready'}${t.status !== 'done' && Date.parse(t.due) < Date.now() ? ' late' : ''}`}
                        style={{ insetInlineStart: pct(a < from ? from : a), width: wid(a < from ? from : a, b > to ? to : b) }}
                        title={`${t.what} · ${w.nameOf(t.assignee)} · ${sdate(a)}${a !== b ? ` – ${sdate(b)}` : ''}`}
                      >
                        <span>{w.nameOf(t.assignee)}</span>
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {events.length > 0 && (
            <div className="g-row ghead">
              <span className="glab">
                <b>الأحداث</b>
              </span>
              <div className="gtrack">
                {todayL}
                {events.map((e) => {
                  const a = riyadhStamp(e.start_at).slice(0, 10);
                  const b = riyadhStamp(e.end_at).slice(0, 10);
                  return (
                    <span key={e.id} className="gevt" style={{ insetInlineStart: pct(a < from ? from : a), width: wid(a < from ? from : a, b > to ? to : b) }} title={e.title}>
                      {e.title}
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="wk-legend gk">
        <span className="gkey done" />
        منتهية
        <span className="gkey active" />
        جارية
        <span className="gkey ready" />
        جاهزة للبدء
        <span className="gkey waiting" />
        تنتظر غيرها
        <span className="gkey late" />
        متأخرة
        <span className="gkey today" />
        اليوم
      </div>
    </>
  );
}

/** Who works on what, in order: each person's stages and tasks, what they wait for, and whom they hand over to. */
function PeopleView({ P, works, tasks, all, people }: { P: Project; works: PlanWork[]; tasks: TaskItem[]; all: TaskItem[]; people: string[] }) {
  const w = useWork();
  return (
    <div className="wk-tgrid">
      {people.map((p) => {
        const items: { a: string; b: string; t: string; st: string; late: boolean; href: string; after: string[]; to: string[]; key: string }[] = [];
        for (const x of works)
          x.stages.forEach((s, i) => {
            if (s.who !== p) return;
            const next = x.stages.map((d, k) => (d.after_pos.includes(i) ? k : -1)).filter((k) => k > -1);
            const st = stageState(x.stages, i);
            items.push({
              key: s.id,
              a: s.start_on ?? s.due_on ?? x.w.due,
              b: s.due_on ?? x.w.due,
              t: `«${s.name}» · ${x.w.title}`,
              st: stageStateLabels[st],
              late: stageLate(s, w.today) && isOutstanding(x.w),
              href: `/work/${x.w.id}`,
              after: s.after_pos.map((j) => `${w.nameOf(x.stages[j]?.who) || 'غير مسندة'} («${x.stages[j]?.name ?? ''}»)`),
              to: next.map((k) => `${w.nameOf(x.stages[k].who) || 'غير مسندة'} («${x.stages[k].name}»)`),
            });
          });
        for (const t of tasks) {
          if (t.assignee !== p) continue;
          const day = riyadhStamp(t.due).slice(0, 10);
          const waiting = t.after_ids.some((y) => all.some((o) => o.id === y && o.status !== 'done'));
          items.push({
            key: t.id,
            a: t.start_on ?? day,
            b: day,
            t: t.what,
            st: t.status === 'done' ? 'منجزة' : waiting ? 'تنتظر' : 'جاهزة',
            late: t.status !== 'done' && Date.parse(t.due) < Date.now(),
            href: '/tasks',
            after: t.after_ids.map((y) => all.find((o) => o.id === y)).filter((o): o is TaskItem => !!o).map((o) => `${w.nameOf(o.assignee)} («${o.what}»)`),
            to: all.filter((o) => o.after_ids.includes(t.id)).map((o) => `${w.nameOf(o.assignee)} («${o.what}»)`),
          });
        }
        items.sort((x, y) => x.a.localeCompare(y.a));
        const person = w.personOf(p);
        return (
          <section className="wk-pcard" key={p}>
            <div className="pc-h">
              <Av name={w.nameOf(p)} size="lg" />
              <span>
                <b>{w.nameOf(p)}</b>
                <small>
                  {person ? roles[person.role].name : ''}
                  {p === P.owner ? ' · مسؤول المشروع' : ''}
                </small>
              </span>
            </div>
            <div className="pc-items">
              {items.map((x) => (
                <Link className="pc-it" key={x.key} href={x.href}>
                  <b>{x.t}</b>
                  <span className={`wk-chip ${x.late ? 'danger' : ''}`}>{x.late ? 'متأخرة' : x.st}</span>
                  <small>
                    <span>
                      {sdate(x.a)}
                      {x.a !== x.b ? ` – ${sdate(x.b)}` : ''}
                    </span>
                    {x.after.length > 0 && <span>بعد {x.after.join('، ')}</span>}
                    {x.to.length > 0 && <span>ثم إلى {x.to.join('، ')}</span>}
                  </small>
                </Link>
              ))}
              {!items.length && <div className="pc-empty">لا مراحل أو مهام له هنا.</div>}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function TasksView({ tasks, all, onExt, onNew }: { tasks: TaskItem[]; all: TaskItem[]; onExt: (t: TaskItem) => void; onNew: () => void }) {
  const w = useWork();
  return (
    <>
      {tasks.length ? (
        <div className="wk-qcards">
          {tasks.map((t) => {
            const waiting = t.after_ids.some((y) => all.some((o) => o.id === y && o.status !== 'done'));
            return (
              <article className="wk-qcard" key={t.id}>
                <div className="qt">
                  <span className="wk-parts">
                    {t.status === 'done' ? <span className="wk-chip done">منجزة</span> : waiting ? <span className="wk-chip">تنتظر</span> : <span className="wk-chip approved">جاهزة</span>}
                    {t.group_key && <span className="wk-chip plain">ضمن مجموعة أيام</span>}
                  </span>
                  <b>{t.what}</b>
                  <span className="meta">
                    <span>{w.nameOf(t.assignee)}</span>
                    <span>
                      {t.start_on ? `${sdate(t.start_on)} – ` : ''}
                      {whenText(t.due)}
                    </span>
                    {t.after_ids.length > 0 && (
                      <span>
                        بعد{' '}
                        {t.after_ids
                          .map((y) => all.find((o) => o.id === y))
                          .filter((o): o is TaskItem => !!o)
                          .map((o) => `«${o.what}»`)
                          .join(' و')}
                      </span>
                    )}
                  </span>
                </div>
                <div className="acts">
                  {t.assignee === w.me && t.status !== 'done' && (
                    <button type="button" className="wk-btn sm" onClick={() => onExt(t)}>
                      <Ic i={Clock} />
                      طلب تمديد
                    </button>
                  )}
                  <Link className="wk-btn sm quiet" href="/tasks">
                    صفحة المهام
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <Empty i={ListChecks} title="لا مهام في المشروع" />
      )}
      <div>
        <button type="button" className="wk-btn sm" onClick={onNew}>
          <Ic i={Plus} />
          مهمة في المشروع
        </button>
      </div>
    </>
  );
}

/**
 * A new project, with an optional works plan; or editing a project. Leaders only. Each planned
 * work gets its stages from its type, given to the least busy person in each role and dated
 * back from its due date; all of it can be changed after.
 */
export function ProjectDialog({ project, onClose, onSaved }: { project?: Project; onClose: () => void; onSaved: (id: string, works: number) => Promise<void> }) {
  const w = useWork();
  const edit = !!project;
  const [name, setName] = useState(project?.name ?? '');
  const [type, setType] = useState(project?.type ?? 'campaign');
  const [start, setStart] = useState(project?.start_on ?? w.today);
  const [end, setEnd] = useState(project?.end_on ?? dayAdd(w.today, 30));
  const [owner, setOwner] = useState(project?.owner ?? (isLead(w.role) && w.role !== 'admin' ? w.me : (staffOf(w.people).find((p) => ['director', 'assistant'].includes(p.role))?.email ?? w.me)));
  const [desc, setDesc] = useState(project?.description ?? '');
  const [rows, setRows] = useState<PlanDraft[]>(edit ? [] : [{ title: '', type: 'post', due: '' }]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const staff = staffOf(w.people);
  const planned = planWorks(rows, w.load, w.today, w.accounts);
  const setRow = (i: number, patch: Partial<PlanDraft>) => setRows(rows.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  const save = async () => {
    if (!name.trim()) return setErr('اكتب اسم المشروع.');
    if (!start || !end || start > end) return setErr('اختر بداية ونهاية صحيحتين.');
    if (planned.issues.length) return setErr(planned.issues[0]);
    const p = { name, type, start, end, owner, description: desc };
    setBusy(true);
    if (edit) {
      const r = await w.call('project_save', { p_id: project!.id, p });
      setBusy(false);
      if (!r.ok) return setErr(r.error);
      await w.reloadBase();
      w.say('حُفظ المشروع.');
      return onSaved(project!.id, 0);
    }
    const r = await w.call<{ id: string; works: string[] }>('project_create', { p, p_works: planned.works });
    setBusy(false);
    if (!r.ok) return setErr(r.error);
    await w.reloadBase();
    const n = r.data.works.length;
    w.say(`أُنشئ المشروع${n ? ` و${n} أعمال (${r.data.works.join('، ')})، مراحلها مُسندة تلقائياً ومواعيدها محسوبة. راجع «من يعمل على ماذا».` : '.'}`);
    return onSaved(r.data.id, n);
  };
  return (
    <Modal title={edit ? 'تعديل المشروع' : 'مشروع جديد'} wide onClose={onClose}>
      <div className="wk-two">
        <label className="l">
          الاسم <small>مطلوب</small>
          <input className="wk-inp" value={name} maxLength={120} placeholder="مثلاً: معرض الاتصال المؤسسي" onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="l">
          النوع
          <select className="wk-inp" value={type} onChange={(e) => setType(e.target.value)}>
            {Object.entries(projectTypeLabels).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="wk-two">
        <label className="l">
          يبدأ
          <input className="wk-inp" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
        <label className="l">
          ينتهي
          <input className="wk-inp" type="date" min={start} value={end} onChange={(e) => setEnd(e.target.value)} />
        </label>
      </div>
      <div className="wk-two">
        <label className="l">
          المسؤول
          <select className="wk-inp" value={owner} onChange={(e) => setOwner(e.target.value)}>
            {staff.map((p) => (
              <option key={p.email} value={p.email}>
                {p.display_name} · {roles[p.role].name}
              </option>
            ))}
            {!staff.some((p) => p.email === owner) && <option value={owner}>{w.nameOf(owner)}</option>}
          </select>
        </label>
        <label className="l">
          الوصف
          <input className="wk-inp" value={desc} maxLength={2000} placeholder="ما الهدف وما يُسلَّم" onChange={(e) => setDesc(e.target.value)} />
        </label>
      </div>
      {!edit && (
        <div className="l">
          خطة الأعمال
          <small>اختيارية. لكل عمل نوع وموعد تسليم، فتُبنى مراحله من القالب وتُسند تلقائياً للأقل حملاً وتُحسب مواعيدها رجوعاً من التسليم. يمكن تعديل كل ذلك بعد الإنشاء.</small>
          <div className="wk-pplan">
            {rows.map((r, i) => {
              const pw = planned.works.find((x) => x.title === r.title.trim());
              return (
                <div className="pprow" key={i}>
                  <input className="wk-inp" value={r.title} maxLength={140} placeholder="عنوان العمل" aria-label={`عنوان العمل ${i + 1}`} onChange={(e) => setRow(i, { title: e.target.value })} />
                  <select className="wk-inp" value={r.type} aria-label="النوع" onChange={(e) => setRow(i, { type: e.target.value as WorkType })}>
                    {(Object.keys(TYPE_PLANS) as WorkType[]).map((k) => (
                      <option key={k} value={k}>
                        {typeLabels[k]}
                      </option>
                    ))}
                  </select>
                  <input className="wk-inp" type="date" min={w.today} value={r.due} aria-label="التسليم" onChange={(e) => setRow(i, { due: e.target.value })} />
                  <button type="button" className="wk-btn icon quiet" aria-label="حذف" onClick={() => setRows(rows.filter((_, k) => k !== i))}>
                    <Ic i={X} />
                  </button>
                  {pw && r.due && (
                    <small className="pppreview">
                      المسؤول {w.nameOf(pw.assignee) || 'لا أحد'} ·{' '}
                      {pw.stages.map((s) => `${s.n}: ${w.nameOf(s.who) || 'غير مسندة'} ${s.start ? sdate(s.start) : ''}${s.start !== s.due && s.due ? `–${sdate(s.due)}` : ''}`).join(' · ')}
                    </small>
                  )}
                </div>
              );
            })}
          </div>
          <div>
            <button type="button" className="wk-btn sm" onClick={() => setRows([...rows, { title: '', type: 'post', due: end >= w.today ? end : '' }])}>
              <Ic i={Plus} />
              عمل في الخطة
            </button>
          </div>
        </div>
      )}
      {planned.issues.length > 0 && rows.some((r) => r.title.trim()) && <Hint warn>{planned.issues[0]}</Hint>}
      {err && <p className="wk-err">{err}</p>}
      <div className="wk-row-acts">
        <button type="button" className="wk-btn quiet" onClick={onClose}>
          تراجع
        </button>
        <button type="button" className="wk-btn primary" disabled={busy} onClick={() => void save()}>
          {edit ? 'حفظ' : 'إنشاء المشروع'}
        </button>
      </div>
    </Modal>
  );
}

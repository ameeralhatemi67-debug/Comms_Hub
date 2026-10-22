'use client';
// «العمل»: the department's work on real data. Attention counts, tabs (team, all, mine,
// requests, closed), a list or a status board, and filters, after «النموذج المرجعي
// للمركز» version 5. What a person sees is decided by row level security: a restricted
// work is not in any list or count for those outside it.
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { BriefcaseBusiness, CalendarDays, Columns3, Flag, List, Plus, Search } from 'lucide-react';
import { roles } from '@/lib/domain';
import {
  ACTIVE,
  ACTIVE_WORKS,
  BOARD,
  STAGES,
  TASKS,
  attentionCounts,
  countOf,
  dueNote,
  fdate,
  inTab,
  involved,
  isLead,
  isOutstanding,
  isOverdue,
  isRequest,
  isSoon,
  lateN,
  lateStages,
  riyadhStamp,
  sdate,
  stageLine,
  statusLabels,
  tabsFor,
  typeLabels,
  workOrder,
  type WorkStatus,
  type WorkTab,
  type WorkType,
} from '@/lib/work/rules';
import { useWork, useWorkList, type ListItem } from './data';
import { Av, Empty, Hint, Ic, PrioChip, RestrictedChip, StatusChip, Wid } from './parts';

type Quick = '' | 'late' | 'soon' | 'stages' | 'review' | 'urgent';

export function WorkListPage() {
  const w = useWork();
  const { items, status } = useWorkList();
  const router = useRouter();
  const params = useSearchParams();
  const tabs = tabsFor(w.role);
  const [tabPick, setTab] = useState<WorkTab | ''>((params.get('tab') as WorkTab) || '');
  const tab: WorkTab = tabs.some((t) => t[0] === tabPick) ? (tabPick as WorkTab) : tabs[0][0];
  const [view, setView] = useState<'list' | 'board'>('list');
  const [quick, setQuick] = useState<Quick>('');
  const [q, setQ] = useState('');
  const [dueF, setDueF] = useState('all');
  const [proj, setProj] = useState('all');
  const [typeF, setTypeF] = useState('all');
  const [personF, setPersonF] = useState('all');
  const today = w.today;
  const projectName = (id: string) => w.projects.find((p) => p.id === id)?.name ?? '';

  const n = useMemo(() => attentionCounts(items.map((x) => ({ w: x.w, stages: x.stages })), today), [items, today]);
  const filtered = (t: WorkTab) =>
    items
      .filter((x) => {
        if (!inTab(x.w, x.stages, t, w.me, w.role)) return false;
        if (quick === 'late' && !isOverdue(x.w, today)) return false;
        if (quick === 'soon' && !isSoon(x.w, today)) return false;
        if (quick === 'review' && x.w.status !== 'IN_REVIEW') return false;
        if (quick === 'urgent' && !(x.w.priority === 'urgent' && isOutstanding(x.w))) return false;
        if (quick === 'stages' && !lateStages(x.w, x.stages, today).length) return false;
        if (dueF === 'late' && !isOverdue(x.w, today)) return false;
        if (dueF === 'soon' && !isSoon(x.w, today)) return false;
        if (proj === 'none' && x.projects.length) return false;
        if (proj !== 'all' && proj !== 'none' && !x.projects.includes(proj)) return false;
        if (typeF !== 'all' && x.w.type !== typeF) return false;
        if (personF !== 'all' && !involved(x.w, x.stages, personF)) return false;
        if (q.trim()) {
          const hay = `${x.w.id} ${x.w.title} ${x.w.brief ?? ''} ${w.nameOf(x.w.assignee)} ${x.projects.map(projectName).join(' ')}`;
          if (!hay.includes(q.trim())) return false;
        }
        return true;
      })
      .sort((a, b) => workOrder(a.w, b.w));
  const filteredOn = !!(quick || dueF !== 'all' || proj !== 'all' || typeF !== 'all' || personF !== 'all' || q.trim());
  const clear = () => {
    setQuick('');
    setDueF('all');
    setProj('all');
    setTypeF('all');
    setPersonF('all');
    setQ('');
  };
  const quickBtns: [Quick, string, number, boolean][] = [
    ['late', 'متأخر', n.late, true],
    ['soon', 'قريب الموعد', n.soon, false],
    ['stages', 'مراحل متأخرة', n.stages, true],
    ['review', 'بانتظار المراجعة', n.review, false],
    ['urgent', 'عاجل', n.urgent, true],
  ];
  const open = (id: string) => router.push(`/work/${id}`);
  const list = tab === 'team' ? [] : filtered(tab);

  return (
    <div className="wk">
      <div className="wk-head">
        <div>
          <h1>العمل</h1>
          <p>قائمة عمل الفريق: من يعمل على ماذا، وفي أي مرحلة، وما المتأخر، وما ينتظر المراجعة أو الاعتماد.</p>
        </div>
        <div className="wk-acts">
          <span className="wk-today">
            <Ic i={CalendarDays} />
            اليوم: {fdate(today)}
          </span>
          {roles[w.role].create && (
            <Link className="wk-btn gold" href="/create">
              <Ic i={Plus} />
              {w.role === 'member' ? 'طلب جديد' : 'إنشاء عمل'}
            </Link>
          )}
        </div>
      </div>

      <div className="wk-attn">
        <span className="lbl">يحتاج انتباهك:</span>
        {quickBtns.map(([id, label, count, hot]) => (
          <button
            type="button"
            key={id}
            className={`${quick === id ? 'on' : ''} ${hot && count ? 'hot' : ''}`}
            aria-pressed={quick === id}
            onClick={() => {
              setQuick(quick === id ? '' : id);
              if (tab === 'team') setTab('all');
            }}
          >
            <b>{count}</b>
            {label}
          </button>
        ))}
        {isLead(w.role) && n.requests > 0 && (
          <button type="button" onClick={() => setTab('requests')}>
            <b>{n.requests}</b>طلبات جديدة
          </button>
        )}
      </div>

      <div className="wk-tabs-row">
        <div className="wk-seg" role="group" aria-label="العرض" data-gd="tabs">
          {tabs.map(([id, label]) => (
            <button type="button" key={id} aria-pressed={tab === id} onClick={() => setTab(id)}>
              {label}
              {id !== 'team' && <span className="n">{filtered(id).length}</span>}
            </button>
          ))}
        </div>
        {tab !== 'team' && (
          <div className="wk-seg" role="group" aria-label="طريقة العرض" data-gd="views">
            <button type="button" aria-pressed={view === 'list'} onClick={() => setView('list')}>
              <Ic i={List} />
              قائمة
            </button>
            <button type="button" aria-pressed={view === 'board'} onClick={() => setView('board')}>
              <Ic i={Columns3} />
              لوحة الحالات
            </button>
          </div>
        )}
      </div>

      {tab !== 'team' && (
        <>
          <div className="wk-tools">
            <label className="wk-field">
              <Ic i={Search} />
              <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث بالعنوان أو الرقم أو الاسم…" aria-label="بحث" />
            </label>
            <select className="wk-sel" value={dueF} onChange={(e) => setDueF(e.target.value)} aria-label="الموعد">
              <option value="all">كل المواعيد</option>
              <option value="late">متأخر</option>
              <option value="soon">قريب الموعد</option>
            </select>
            <select className="wk-sel" value={proj} onChange={(e) => setProj(e.target.value)} aria-label="المشروع">
              <option value="all">كل المشاريع</option>
              {w.projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
              <option value="none">بلا مشروع</option>
            </select>
            <select className="wk-sel" value={typeF} onChange={(e) => setTypeF(e.target.value)} aria-label="النوع">
              <option value="all">كل الأنواع</option>
              {(Object.keys(typeLabels) as WorkType[]).map((k) => (
                <option key={k} value={k}>
                  {typeLabels[k]}
                </option>
              ))}
            </select>
            {isLead(w.role) && (
              <select className="wk-sel" value={personF} onChange={(e) => setPersonF(e.target.value)} aria-label="الشخص">
                <option value="all">كل الأشخاص</option>
                {w.people
                  .filter((p) => p.role !== 'admin')
                  .map((p) => (
                    <option key={p.email} value={p.email}>
                      {p.display_name}
                    </option>
                  ))}
              </select>
            )}
          </div>
          {filteredOn && (
            <div className="wk-filter-note">
              <Ic i={Flag} />
              <span>القائمة مصفّاة.</span>
              <button type="button" className="wk-lk" onClick={clear}>
                إظهار الكل
              </button>
            </div>
          )}
        </>
      )}

      {status === 'loading' || w.status === 'loading' ? (
        <div className="wk-loading" role="status">
          جارٍ تحميل الأعمال…
        </div>
      ) : status === 'error' || w.status === 'error' ? (
        <Empty i={BriefcaseBusiness} title="تعذّر تحميل الأعمال">
          أعد تحميل الصفحة. إن تكرر هذا فقد يكون الاتصال بقاعدة البيانات متوقفاً.
        </Empty>
      ) : tab === 'team' ? (
        <Team items={items} onTab={setTab} open={open} />
      ) : !list.length ? (
        <EmptyTab tab={tab} total={items.length} />
      ) : view === 'board' ? (
        <Board list={list} open={open} />
      ) : (
        <WorkTable list={list} open={open} projectName={projectName} />
      )}
    </div>
  );
}

function EmptyTab({ tab, total }: { tab: WorkTab; total: number }) {
  const w = useWork();
  if (!total)
    return (
      <Empty i={BriefcaseBusiness} title="لا أعمال بعد">
        {roles[w.role].create ? 'ابدأ من «إنشاء عمل»، أو حوّل رسالة بريد إلى عمل. يصدر المركز الرقم الأول CH-1.' : 'تظهر هنا الأعمال حين ينشئها الفريق.'}
      </Empty>
    );
  const [t, b] =
    tab === 'requests'
      ? ['لا توجد طلبات تنتظر الإسناد', 'تصل هنا طلبات الأعضاء والطلبات المحوّلة من البريد بلا مسؤول.']
      : tab === 'mine'
        ? ['لا يوجد عمل مسند إليك هنا', 'ما يُسند إليك أو تشارك فيه يظهر في هذا التبويب.']
        : tab === 'closed'
          ? ['لا توجد أعمال مغلقة', 'العمل المغلق يبقى هنا مع سبب إغلاقه ومن أغلقه.']
          : ['لا يطابق التصفية شيء', 'غيّر التصفية أو اضغط «إظهار الكل».'];
  return (
    <Empty i={BriefcaseBusiness} title={t}>
      {b}
    </Empty>
  );
}

/** The works as a table; also the project page's «الأعمال». */
export function WorkTable({ list, open, projectName }: { list: ListItem[]; open: (id: string) => void; projectName: (id: string) => string }) {
  const w = useWork();
  return (
    <div className="wk-table" role="table" aria-label="الأعمال">
      <div className="wk-row th" role="row">
        <span>العمل</span>
        <span>المشروع</span>
        <span>المسؤول</span>
        <span>الحالة</span>
        <span>المرحلة</span>
        <span>التسليم</span>
      </div>
      {list.map((x) => {
        const d = dueNote(x.w, w.today);
        const s = stageLine(x.w, x.stages, w.today, w.nameOf, { pending: x.pending, flags: x.flags });
        return (
          <div
            key={x.w.id}
            role="row"
            tabIndex={0}
            className={`wk-row ${x.w.priority === 'urgent' && isOutstanding(x.w) ? 'urgent' : ''} ${x.w.closed_at ? 'closed' : ''}`}
            onClick={() => open(x.w.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                open(x.w.id);
              }
            }}
          >
            <span className="w-t">
              <b>{x.w.title}</b>
              <small>
                <Wid id={x.w.id} />
                <span>{typeLabels[x.w.type]}</span>
                <PrioChip p={x.w.priority} />
                {x.w.restricted && <RestrictedChip />}
                {isRequest(x.w) && <span className="wk-chip info">طلب جديد</span>}
              </small>
            </span>
            <span className="wk-camps">
              {x.projects.length ? x.projects.map((p) => <span className="wk-camp" key={p}>{projectName(p)}</span>) : <span className="wk-col-hint">بلا مشروع</span>}
            </span>
            <span className="who-c">
              {x.w.assignee ? (
                <>
                  <Av name={w.nameOf(x.w.assignee)} size="sm" />
                  <span>{w.nameOf(x.w.assignee)}</span>
                </>
              ) : (
                <span className="wk-col-hint">لم يُسند</span>
              )}
            </span>
            <span>
              <StatusChip status={x.w.status} />
            </span>
            <span className={`stg-t ${s.tone}`}>{s.text}</span>
            <span className="due">
              <span className={d.tone}>{d.text}</span>
              <small>{x.w.closed_at ? sdate(riyadhStamp(x.w.closed_at)) : fdate(x.w.due)}</small>
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Board({ list, open }: { list: ListItem[]; open: (id: string) => void }) {
  const w = useWork();
  return (
    <div className="wk-board">
      {BOARD.map((st) => {
        const group: WorkStatus[] = st === 'PUBLISHED' ? ['PUBLISHING', 'PUBLISHED', 'PARTIAL', 'FAILED'] : [st];
        const col = list.filter((x) => group.includes(x.w.status) && !x.w.closed_at);
        return (
          <div className="wk-bcol" key={st}>
            <h4>
              {st === 'PUBLISHED' ? 'النشر' : statusLabels[st]}
              <span>{col.length}</span>
            </h4>
            {col.map((x) => {
              const d = dueNote(x.w, w.today);
              return (
                <button type="button" key={x.w.id} className={`wk-bcard ${x.w.priority === 'urgent' && isOutstanding(x.w) ? 'urgent' : ''}`} onClick={() => open(x.w.id)}>
                  <span className="r">
                    <Wid id={x.w.id} />
                    <PrioChip p={x.w.priority} />
                    {isRequest(x.w) && <span className="wk-chip info">طلب جديد</span>}
                  </span>
                  <b>{x.w.title}</b>
                  <span className="r">
                    {x.w.assignee ? (
                      <>
                        <Av name={w.nameOf(x.w.assignee)} size="sm" />
                        {w.nameOf(x.w.assignee)}
                      </>
                    ) : (
                      'لم يُسند'
                    )}
                    <span className={d.tone}>{d.text}</span>
                  </span>
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

/** One card per person: their work, their stages and tasks, and what is late. Leaders only. */
function Team({ items, onTab, open }: { items: ListItem[]; onTab: (t: WorkTab) => void; open: (id: string) => void }) {
  const w = useWork();
  const today = w.today;
  const people = w.people
    .filter((p) => p.role !== 'admin')
    .map((p) => {
      const mine = items.filter((x) => x.w.assignee === p.email && !x.w.closed_at);
      // Taking part means a stage or a place among the participants; asking for a work is not taking part.
      const part = items.filter(
        (x) => !x.w.closed_at && !!x.w.assignee && x.w.assignee !== p.email && isOutstanding(x.w)
          && (x.w.people.includes(p.email) || x.stages.some((s) => s.who === p.email)),
      );
      const steps = items.flatMap((x) => (x.w.closed_at || !isOutstanding(x.w) ? [] : x.stages.filter((s) => s.who === p.email && !s.done_at).map((s) => ({ x, s }))));
      const l = w.load.find((r) => r.email === p.email);
      return {
        p,
        mine,
        part,
        active: mine.filter((x) => isOutstanding(x.w)).length,
        late: mine.filter((x) => isOverdue(x.w, today)).length,
        soon: mine.filter((x) => isSoon(x.w, today)).length,
        review: mine.filter((x) => x.w.status === 'IN_REVIEW').length,
        steps: steps.length,
        lateSteps: steps.filter(({ s }) => s.due_on && s.due_on < today).length,
        tasks: l?.open_tasks ?? 0,
        lateTasks: l?.late_tasks ?? 0,
      };
    })
    .filter((x) => x.mine.length || x.part.length || x.tasks)
    .sort((a, b) => b.late - a.late || b.active - a.active);
  const max = Math.max(1, ...people.map((x) => x.active));
  const reqs = items.filter((x) => isRequest(x.w));
  return (
    <>
      {reqs.length > 0 && (
        <Hint i={Flag}>
          {reqs.length} طلب بانتظار الإسناد، أقدمها «{reqs[0].w.title}» من {w.nameOf(reqs[0].w.created_by)}.{' '}
          <button type="button" className="wk-lk" onClick={() => onTab('requests')}>
            افتح الطلبات
          </button>
        </Hint>
      )}
      {!people.length ? (
        <Empty i={BriefcaseBusiness} title="لا عمل نشط عند أحد">
          حين تُسند الأعمال والمراحل يظهر هنا حمل كل شخص.
        </Empty>
      ) : (
        <div className="wk-tgrid">
          {people.map((x) => {
            const order = [...x.mine.filter((i) => isOutstanding(i.w)), ...x.mine.filter((i) => !isOutstanding(i.w))];
            return (
              <section className={`wk-pcard ${x.late ? 'has-late' : ''}`} key={x.p.email}>
                <div className="pc-h">
                  <Av name={x.p.display_name} size="lg" />
                  <span>
                    <b>{x.p.display_name}</b>
                    <small>{roles[x.p.role].name}</small>
                  </span>
                </div>
                <div className="pc-n">
                  <span>{countOf(x.active, ACTIVE)}</span>
                  {x.steps > 0 && <span>{countOf(x.steps, STAGES)}</span>}
                  {x.tasks > 0 && <span>{countOf(x.tasks, TASKS)}{x.lateTasks ? ` · ${x.lateTasks} متأخرة` : ''}</span>}
                  {x.late > 0 && <span className="late">{x.late} متأخر</span>}
                  {x.soon > 0 && <span className="soon">{x.soon} قريب الموعد</span>}
                  {x.review > 0 && <span className="rev">{x.review} بانتظار المراجعة</span>}
                  {x.lateSteps > 0 && <span className="late">{lateN(x.lateSteps)}</span>}
                  {x.part.length > 0 && <span>يشارك في {x.part.length}</span>}
                </div>
                <div className={`wk-load ${x.late ? 'late' : ''}`} role="img" aria-label={`الحمل: ${countOf(x.active, ACTIVE_WORKS)}`}>
                  <i style={{ width: `${Math.round((x.active / max) * 100)}%` }} />
                </div>
                <div className="pc-items">
                  {order.map((i) => {
                    const d = dueNote(i.w, today);
                    const s = stageLine(i.w, i.stages, today, w.nameOf, { pending: i.pending, flags: i.flags });
                    return (
                      <button type="button" className="pc-it" key={i.w.id} onClick={() => open(i.w.id)}>
                        <b>{i.w.title}</b>
                        <StatusChip status={i.w.status} />
                        <small>
                          <Wid id={i.w.id} />
                          <span className={s.tone}>{s.text}</span>
                          <span className={d.tone}>{d.text}</span>
                          {i.w.priority === 'urgent' && <span className="late">عاجل</span>}
                        </small>
                      </button>
                    );
                  })}
                  {x.part.map((i) => {
                    const mineSteps = i.stages.filter((s) => s.who === x.p.email && !s.done_at);
                    return (
                      <button type="button" className="pc-it part" key={`p${i.w.id}`} onClick={() => open(i.w.id)}>
                        <b>
                          {mineSteps.length ? `مرحلة ${mineSteps.map((s) => `«${s.name}»`).join(' و')} في: ` : 'مشارك في: '}
                          {i.w.title}
                        </b>
                        <Wid id={i.w.id} />
                        <small>المسؤول {w.nameOf(i.w.assignee)}</small>
                      </button>
                    );
                  })}
                  {!order.length && !x.part.length && <div className="pc-empty">لا عمل نشط.</div>}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}

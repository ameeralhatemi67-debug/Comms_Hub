'use client';
// Home on real data (Step 5 of Reference_Build_Plan.md): what this role is asked to act on
// now, counted from the work cycle in the database, the works themselves, the next days on
// the calendar, and the team's load for the leaders. The earlier browser sample (campaign,
// sample works and their numbers) is gone from Home: every link here opens a real page.
import Link from 'next/link';
import { useMemo } from 'react';
import { BriefcaseBusiness, CalendarDays, Inbox, Plus, Shield, TriangleAlert, Users } from 'lucide-react';
import { roles } from '@/lib/domain';
import {
  OUTSTANDING,
  atRisk,
  accountName,
  dayAdd,
  dueNote,
  fdate,
  involved,
  isLead,
  isOverdue,
  isRequest,
  lateStages,
  openSteps,
  riyadhStamp,
  stageLine,
  workOrder,
} from '@/lib/work/rules';
import { CAL_KIND, calEntries, entryTitle,
  whenText,
} from '@/lib/work/planning';
import { usePlanData, useWork, useWorkList, type ListItem } from './work/data';
import { HomePermissions } from './home-perms';
import { Av, Empty, Ic, StatusChip, Wid } from './work/parts';

type Tile = { key: string; label: string; value: number; hint: string; href: string; hot?: boolean };

export function HomePage() {
  const w = useWork();
  const { items, status } = useWorkList();
  const plan = usePlanData();
  const role = w.role;
  const lead = isLead(role);
  const me = w.me;
  const open = items.filter((x) => !x.w.closed_at);
  const mine = open.filter((x) => (role === 'member' ? x.w.created_by === me : involved(x.w, x.stages, me)));
  const mySteps = open.flatMap((x) => openSteps(x.stages).filter((i) => x.stages[i].who === me).map((i) => ({ x, s: x.stages[i] })));
  const myTasks = plan.tasks.filter((t) => t.assignee === me && t.status !== 'done');
  const nowIso = useMemo(() => new Date().toISOString(), [items]); // eslint-disable-line react-hooks/exhaustive-deps

  const tiles: Tile[] = lead
    ? [
        { key: 'review', label: 'بانتظار المراجعة', value: open.filter((x) => x.w.status === 'IN_REVIEW').length, hint: 'القرار في «الموافقات والنشر»', href: '/approvals' },
        { key: 'late', label: 'متأخر عن التسليم', value: open.filter((x) => isOverdue(x.w, w.today)).length, hint: 'أعمال تجاوزت موعدها', href: '/work?tab=all', hot: true },
        { key: 'stages', label: 'مراحل متأخرة', value: open.reduce((n, x) => n + lateStages(x.w, x.stages, w.today).length, 0), hint: 'داخل أعمال لم تتأخر بعد', href: '/work?tab=all' },
        { key: 'requests', label: 'طلبات بلا مسؤول', value: open.filter((x) => isRequest(x.w)).length, hint: 'تُسند من «الطلبات»', href: '/requests' },
      ]
    : role === 'publisher'
      ? [
          { key: 'ready', label: 'جاهز للنشر', value: open.filter((x) => x.w.status === 'APPROVED').length, hint: 'معتمد بانتظار الجدولة', href: '/approvals?tab=publish' },
          { key: 'sched', label: 'مجدول', value: open.filter((x) => x.w.status === 'SCHEDULED').length, hint: 'على التقويم', href: '/calendar' },
          { key: 'confirm', label: 'بانتظار تأكيدك', value: open.filter((x) => x.w.confirm_pending).length, hint: 'حلّ موعده ولا يُنشر بلا تأكيد', href: '/approvals?tab=publish', hot: true },
          { key: 'failed', label: 'نشر جزئي أو فشل', value: open.filter((x) => ['PARTIAL', 'FAILED'].includes(x.w.status)).length, hint: 'إعادة المحاولة للفاشلة', href: '/approvals?tab=publish', hot: true },
        ]
      : role === 'member'
        ? [
            { key: 'mine', label: 'طلباتي المفتوحة', value: mine.filter((x) => OUTSTANDING.includes(x.w.status)).length, hint: 'ما طلبته من القسم', href: '/work?tab=mine' },
            { key: 'wait', label: 'بانتظار الإسناد', value: mine.filter((x) => isRequest(x.w)).length, hint: 'يسندها مدير الاتصال أو مساعده', href: '/requests' },
            { key: 'tasks', label: 'مهامي', value: myTasks.length, hint: 'ما أُسند إليك', href: '/tasks' },
          ]
        : [
            { key: 'mine', label: 'أعمالي النشطة', value: mine.filter((x) => OUTSTANDING.includes(x.w.status) && x.w.assignee).length, hint: 'أنا مسؤولها أو مشارك فيها', href: '/work?tab=mine' },
            { key: 'steps', label: 'مراحلي الجاهزة', value: mySteps.length, hint: 'أستطيع العمل عليها الآن', href: '/work?tab=mine' },
            { key: 'late', label: 'متأخر', value: mine.filter((x) => x.w.assignee === me && isOverdue(x.w, w.today)).length, hint: 'أعمال أنا مسؤولها تجاوزت موعدها', href: '/work?tab=mine', hot: true },
            { key: 'tasks', label: 'مهامي المفتوحة', value: myTasks.length, hint: 'من صفحة «المهام»', href: '/tasks' },
          ];

  // What this role is asked to act on, per MVP_draft.md section 6.
  const focus: ListItem[] = (
    lead
      ? open.filter((x) => x.w.status === 'IN_REVIEW' || isRequest(x.w) || isOverdue(x.w, w.today) || lateStages(x.w, x.stages, w.today).length > 0)
      : role === 'publisher'
        ? open.filter((x) => ['APPROVED', 'SCHEDULED', 'PARTIAL', 'FAILED'].includes(x.w.status))
        : mine.filter((x) => OUTSTANDING.includes(x.w.status))
  )
    .sort((a, b) => workOrder(a.w, b.w))
    .slice(0, 8);
  const focusTitle = lead ? 'يحتاج قرارك أو متابعتك' : role === 'publisher' ? 'جاهزيتك للنشر' : role === 'member' ? 'طلباتك' : 'أولويات عملك';

  const week = calEntries({ works: items, tasks: plan.tasks, events: plan.events, reminders: plan.reminders, accounts: w.accounts, me, today: w.today, nowIso, mine: !lead && role !== 'publisher' })
    .filter((e) => e.date >= w.today && e.date <= dayAdd(w.today, 6) && e.k !== 'held')
    .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
  const seen = new Set<string>();
  const upcoming = week.filter((e) => {
    const k = `${e.k}|${e.w?.id ?? e.key}|${e.date}|${e.time}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).slice(0, 7);
  const risky = role === 'publisher' || lead ? open.flatMap((x) => atRisk(x.w, w.accounts).map((a) => ({ x, a }))) : [];
  const staffLoad = w.load.filter((l) => l.role !== 'member');
  const most = Math.max(1, ...staffLoad.map((l) => l.active_works));
  const loading = status === 'loading' || plan.status === 'loading' || w.status === 'loading';

  return (
    <div className="wk">
      <div className="wk-head">
        <div>
          <h1>صباح الخير، {w.nameOf(me)}</h1>
          <p>{roles[role].priority}</p>
        </div>
        <div className="wk-acts">
          <span className="wk-today">
            <Ic i={CalendarDays} />
            اليوم: {fdate(w.today)}
          </span>
          {roles[role].create && (
            <Link className="wk-btn gold" href="/create">
              <Ic i={Plus} />
              {role === 'member' ? 'طلب جديد' : 'إنشاء عمل'}
            </Link>
          )}
        </div>
      </div>

      {loading ? (
        <div className="wk-loading" role="status">
          جارٍ التحميل…
        </div>
      ) : (
        <>
          <div className="wk-tiles">
            {tiles.map((t) => (
              <Link key={t.key} href={t.href} className={`wk-tile ${t.hot && t.value ? 'hot' : ''}`} data-tile={t.key}>
                <span>{t.label}</span>
                <strong>{t.value}</strong>
                <small>{t.hint}</small>
              </Link>
            ))}
          </div>

          {risky.length > 0 && (
            <Link className="wk-hint warn" href="/approvals?tab=publish" role="status">
              <Ic i={TriangleAlert} />
              <span>
                تحتاج انتباهك: تفويض {accountName(risky[0].a)} لا يغطي موعد «{risky[0].x.w.title}» {risky[0].x.w.sched_at ? whenText(risky[0].x.w.sched_at) : ''}
                {risky.length > 1 ? ` و${risky.length - 1} غيره` : ''}.
              </span>
            </Link>
          )}

          <HomePermissions />

          <div className="wk-home">
            <section className="wk-pn">
              <h3>
                {focusTitle} <small>{focus.length ? `${focus.length} أعمال` : ''}</small>
              </h3>
              {focus.length ? (
                <div className="wk-qlist">
                  {focus.map((x) => {
                    const d = dueNote(x.w, w.today);
                    const s = stageLine(x.w, x.stages, w.today, w.nameOf, { pending: x.pending, flags: x.flags });
                    return (
                      <Link key={x.w.id} className="wk-hrow" href={x.w.status === 'IN_REVIEW' && lead ? `/approvals/${x.w.id}` : `/work/${x.w.id}`}>
                        <span className="t">
                          <b>{x.w.title}</b>
                          <small>
                            <Wid id={x.w.id} />
                            <span className={s.tone}>{s.text}</span>
                            <span className={d.tone}>{d.text}</span>
                          </small>
                        </span>
                        <StatusChip status={x.w.status} />
                      </Link>
                    );
                  })}
                </div>
              ) : (
                <Empty i={BriefcaseBusiness} title={items.length ? 'لا شيء ينتظرك الآن' : 'لا أعمال بعد'}>
                  {items.length ? 'ما يحتاجك يظهر هنا حين يصل.' : roles[role].create ? 'ابدأ من «إنشاء عمل». يصدر المركز الرقم الأول CH-1.' : 'تظهر هنا الأعمال حين ينشئها الفريق.'}
                </Empty>
              )}
              <Link className="wk-lk" href="/work">
                كل الأعمال
              </Link>
            </section>

            <aside className="wk-col">
              <section className="wk-pn">
                <h3>
                  الأيام السبعة القادمة <small>من التقويم</small>
                </h3>
                {upcoming.length ? (
                  <div className="wk-qlist">
                    {upcoming.map((e) => (
                      <Link key={e.key} className="wk-hrow" href={`/calendar?date=${e.date}&view=day`}>
                        <span className="t">
                          <b>{entryTitle(e)}</b>
                          <small>
                            <span className={`wk-cchip ${CAL_KIND[e.k][1]} static`}>
                              <span>{CAL_KIND[e.k][0]}</span>
                            </span>
                            <span>
                              {fdate(e.date)} {e.time}
                            </span>
                            {e.late && <span className="late">متأخر</span>}
                          </small>
                        </span>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <p className="wk-col-hint">لا مواعيد في الأيام السبعة القادمة.</p>
                )}
                <Link className="wk-lk" href="/calendar">
                  فتح التقويم
                </Link>
              </section>

              {lead && (
                <section className="wk-pn">
                  <h3>حمل الفريق</h3>
                  <div className="wk-qlist">
                    {staffLoad.map((l) => (
                      <div className="wk-mem" key={l.email}>
                        <Av name={l.display_name} size="sm" />
                        <span className="grow">
                          <b>{l.display_name}</b>
                          <small>
                            {l.active_works} نشطة · {l.open_stages} مراحل · {l.open_tasks} مهام{l.late_works + l.late_stages ? <span className="late"> · {l.late_works + l.late_stages} متأخرة</span> : null}
                          </small>
                          <span className={`wk-load ${l.late_works ? 'late' : ''}`} aria-hidden="true">
                            <i style={{ width: `${Math.round((l.active_works / most) * 100)}%` }} />
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>
                  <Link className="wk-lk" href="/work">
                    <Ic i={Users} /> الفريق في صفحة العمل
                  </Link>
                </section>
              )}

              <section className="wk-pn">
                <h3>روابط سريعة</h3>
                <div className="wk-qlist">
                  <Link className="wk-hrow" href="/requests">
                    <span className="t">
                      <b>
                        <Ic i={Inbox} /> الطلبات
                      </b>
                      <small>التمديد والوصول ونقل المواعيد وطلبات العمل</small>
                    </span>
                  </Link>
                  <Link className="wk-hrow" href="/projects">
                    <span className="t">
                      <b>
                        <Ic i={BriefcaseBusiness} /> المشاريع
                      </b>
                      <small>{w.projects.length ? `${w.projects.length} مشاريع` : 'لا مشاريع بعد'}</small>
                    </span>
                  </Link>
                  {w.isAdmin && (
                    <Link className="wk-hrow" href="/accounts">
                      <span className="t">
                        <b>
                          <Ic i={Shield} /> الحسابات والصلاحيات
                        </b>
                        <small>إضافة الحسابات، ومنح الأدوار والصفحات، والبتّ في طلبات الوصول</small>
                      </span>
                    </Link>
                  )}
                </div>
              </section>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}

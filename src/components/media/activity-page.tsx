'use client';
// سجل النشاط (MVP_draft.md 66): every recorded action, from the three logs, with what changed. Append-only in the database.
// Whoever holds «عرض سجل النشاط كاملاً» (the Admin and the director by default, and anyone they give it to) switches
// between the whole log, with a panel of the team (Action_Plan.md B2), and their own actions. Everyone else sees their
// own actions and what happened on files they reach. «تقرير الشهر» is the holders of «تقرير الشهر عن الفريق». What each
// person may read is row level security; the tabs only choose among it.
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { riyadhStamp } from '@/lib/media/rules';
import type { LogRow } from '@/lib/media/log-text';
import type { PermEvent } from '@/lib/permissions';
import { teamSummary } from '@/lib/media/team';
import {
  ENTRY_KINDS,
  PERIODS,
  libraryEntry,
  mergePage,
  periodRange,
  permissionEntry,
  workEntry,
  type Entry,
  type EntryKind,
  type Period,
  type WorkLogRow,
} from '@/lib/activity/feed';
import { needProps } from '@/lib/kit/need';
import { roles, type Role } from '@/lib/domain';
import { Tabs, Title } from '../ui';
import { useCaps } from '../caps';
import { ActivityReport } from './activity-report';
import { Avatar, Icon, StageChip, Ts } from './parts';
import { useMedia } from './provider';

const typeIcon: Record<string, string> = {
  upload: 'upload',
  version: 'history',
  approve: 'check',
  approved: 'check',
  changes: 'pencil',
  reject: 'x',
  schedule: 'cal',
  publish: 'send',
  assign: 'users',
  done: 'check',
  stage_done: 'check',
  copy: 'file',
  text: 'file',
  submit: 'send',
  rename: 'pencil',
  move: 'move',
  remove: 'trash',
  tag: 'tag',
  access: 'shield',
  lock: 'lock',
  folder: 'folder',
  undo: 'history',
  note: 'note',
  download: 'download',
  link: 'link',
  stage: 'board',
  start: 'board',
  permission: 'shield',
};

const PAGE = 300;

/** Who saw the whole log before «عرض سجل النشاط كاملاً» existed: used only while the database does not know it yet. */
const BEFORE_THE_RIGHT: Role[] = ['director', 'assistant'];

type View = 'all' | 'mine' | 'report';

/** The part of a table query the three logs share. */
type LogQuery = {
  gte(column: string, value: string): LogQuery;
  lt(column: string, value: string): LogQuery;
  lte(column: string, value: string): LogQuery;
  eq(column: string, value: string): LogQuery;
  order(column: string, options: { ascending: boolean }): LogQuery;
  limit(count: number): PromiseLike<{ data: unknown; error: unknown }>;
};

export function ActivityPage() {
  const m = useMedia();
  const caps = useCaps();
  const all = caps.evalOf('activity.full') ? caps.has('activity.full') : m.isAdmin || BEFORE_THE_RIGHT.includes(m.role);
  const canReport = caps.has('activity.report');
  const [view, setView] = useState<View>('all');
  const shown: View = view === 'report' && canReport ? 'report' : view === 'mine' || !all ? 'mine' : 'all';
  const [rows, setRows] = useState<Entry[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [who, setWho] = useState('all');
  const [kind, setKind] = useState<EntryKind | 'all'>('all');
  const [period, setPeriod] = useState<Period>('all');
  const [q, setQ] = useState('');
  const nameOf = useRef(m.nameOf);
  nameOf.current = m.nameOf;
  // Someone without the whole log reads what row level security gives them, which is more than their own actions.
  const actor = shown === 'mine' && all ? m.email : shown === 'all' && who !== 'all' ? who : null;

  const read = useCallback(
    async (before: string | null) => {
      const { from, to } = periodRange(period, new Date());
      const db = supabase();
      const log = (table: string, columns: string, by: string) => {
        let q = db.from(table).select(columns) as unknown as LogQuery;
        if (from) q = q.gte('at', from);
        if (to) q = q.lt('at', to);
        if (before) q = q.lte('at', before);
        if (actor) q = q.eq(by, actor);
        return q.order('at', { ascending: false }).limit(PAGE);
      };
      // The permission log and the work log each have their own row level security: each reader sees what concerns them.
      const [a, w, p] = await Promise.all([
        log('activity_log', '*', 'actor_email'),
        log('work_log', 'id, work_id, at, actor, type, text, works(title)', 'actor'),
        log('permission_events', 'id, at, actor, subject, role, capability, kind, data', 'actor'),
      ]);
      if (a.error && w.error && p.error) throw a.error;
      const name = (e: string) => nameOf.current(e);
      return mergePage(
        [
          ((a.data as LogRow[]) ?? []).map((r) => libraryEntry(r, name)),
          ((w.data as unknown as WorkLogRow[]) ?? []).map((r) => workEntry(r, name)),
          ((p.data as PermEvent[]) ?? []).map((e) => permissionEntry(e, name)),
        ],
        PAGE,
      );
    },
    [actor, period],
  );

  useEffect(() => {
    if (shown === 'report') return;
    let live = true;
    setFailed(false);
    read(null)
      .then((page) => {
        if (!live) return;
        setRows(page.entries);
        setCursor(page.cursor);
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [read, shown, m.assets, m.tasks, m.folders]);

  const more = async () => {
    setBusy(true);
    try {
      const page = await read(cursor);
      setRows((had) => {
        const have = new Set((had ?? []).map((e) => e.key));
        return [...(had ?? []), ...page.entries.filter((e) => !have.has(e.key))];
      });
      setCursor(page.cursor);
    } catch {
      setFailed(true);
    }
    setBusy(false);
  };

  const list = (rows ?? []).filter((e) => {
    if (kind !== 'all' && e.kind !== kind) return false;
    if (q && !`${e.text} ${e.before ?? ''} ${e.after ?? ''} ${e.work?.label ?? ''}`.includes(q)) return false;
    return true;
  });
  const today = riyadhStamp(new Date()).slice(0, 10);
  const days: string[] = [];
  const byDay = new Map<string, Entry[]>();
  for (const e of list) {
    const day = riyadhStamp(e.at).slice(0, 10);
    if (!byDay.has(day)) {
      byDay.set(day, []);
      days.push(day);
    }
    byDay.get(day)!.push(e);
  }
  const counts = new Map<string, number>();
  list.forEach((e) => counts.set(e.actor, (counts.get(e.actor) ?? 0) + 1));
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];

  const panel = all && shown === 'all';
  const teamRows = useMemo(() => (rows ?? []).map((e) => ({ at: e.at, actor_email: e.actor })), [rows]);
  const team = useMemo(() => (panel ? teamSummary(m.people, teamRows, m.tasks) : []), [panel, m.people, teamRows, m.tasks]);

  const tabs = [
    ...(all ? [{ id: 'all', label: 'الكل' }] : []),
    ...(all || canReport ? [{ id: 'mine', label: 'نشاطي' }] : []),
    ...(canReport ? [{ id: 'report', label: 'تقرير الشهر' }] : []),
  ];

  if (m.status === 'loading' || (rows === null && shown !== 'report' && !failed)) return <p role="status">جارٍ التحميل…</p>;

  return (
    <div className="mx" dir="rtl">
      <Title title="سجل" accent="النشاط" sub="كل إجراء يقوم به أي عضو، بوقته وصاحبه وما تغيّر.">
        <span className="mx-immut">
          <Icon name="lock" />
          سجل لا يُعدَّل ولا يُحذف
        </span>
      </Title>
      {tabs.length > 1 && (
        <div className="mx-views">
          <Tabs items={tabs} value={shown} onChange={(id) => setView(id as View)} />
        </div>
      )}
      {shown === 'report' ? (
        <ActivityReport />
      ) : (
        <>
          {!all && (
            <p className="warning mx-limited" role="status">
              <span>تعرض أنشطتك أنت وما جرى على الأصول التي تراها.</span>
              <button type="button" className="mx-link" {...needProps('activity.full', 'السجل الكامل لمن يملك «عرض سجل النشاط كاملاً»: مدير الاتصال وAdmin افتراضياً، ولمن يمنحانه له.')}>
                السجل الكامل
              </button>
            </p>
          )}
          {failed && (
            <p className="warning" role="alert">
              تعذّر تحميل السجل. أعد تحميل الصفحة.
            </p>
          )}
          <div className="mx-stats">
            <div className="mx-stat">
              <b>{list.length}</b>
              <span>حدثاً مطابقاً</span>
            </div>
            <div className="mx-stat">
              <b>{list.filter((e) => riyadhStamp(e.at).slice(0, 10) === today).length}</b>
              <span>اليوم</span>
            </div>
            {shown === 'mine' ? (
              <div className="mx-stat">
                <b>{new Set(list.map((e) => riyadhStamp(e.at).slice(0, 10))).size}</b>
                <span>أيام فيها نشاط</span>
              </div>
            ) : (
              <div className="mx-stat">
                <b>{top ? m.nameOf(top[0]) : '—'}</b>
                <span>الأكثر نشاطاً</span>
              </div>
            )}
          </div>
          {panel && team.length > 0 && (
            <details className="mx-team" aria-label="الفريق">
              <summary className="mx-team-head">
                <b>الفريق</b>
                <span>آخر إجراء لكل عضو، وما أنجزه في الأسبوع الأخير، وما ينتظره من مهام.</span>
              </summary>
              <div className="mx-team-grid" role="table">
                <div className="mx-team-row head" role="row">
                  <span role="columnheader">العضو</span>
                  <span role="columnheader">الدور</span>
                  <span role="columnheader">آخر إجراء</span>
                  <span role="columnheader">إجراءات الأسبوع</span>
                  <span role="columnheader">مهام مفتوحة</span>
                </div>
                {team.map((t) => (
                  <div className={`mx-team-row ${who === t.email ? 'on' : ''}`} role="row" key={t.email}>
                    <span role="cell">
                      <button type="button" className="mx-team-who" aria-pressed={who === t.email} onClick={() => setWho(who === t.email ? 'all' : t.email)} title="اعرض أحداثه وحدها">
                        <Avatar name={t.name} />
                        <b>{t.name}</b>
                      </button>
                    </span>
                    <span role="cell">{roles[t.role as keyof typeof roles]?.name ?? t.role}</span>
                    <span role="cell">{t.last ? <Ts>{riyadhStamp(t.last)}</Ts> : <small className="muted">لا إجراء مسجلاً</small>}</span>
                    <span role="cell">{t.week}</span>
                    <span role="cell">
                      {t.open}
                      {t.late > 0 && <small className="late"> · متأخرة {t.late}</small>}
                    </span>
                  </div>
                ))}
              </div>
              <p className="muted">المحسوب مما حُمّل من السجل الآن؛ ما قبله لا يدخل في «آخر إجراء» ولا في أعداد الأسبوع.</p>
            </details>
          )}
          <div className="mx-toolbar">
            <label className="mx-field">
              <Icon name="search" />
              <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث في السجل…" aria-label="بحث في السجل" />
            </label>
            {shown === 'all' && (
              <select className="sel" value={who} onChange={(e) => setWho(e.target.value)} aria-label="الشخص">
                <option value="all">كل الأشخاص</option>
                {m.people.map((p) => (
                  <option key={p.email} value={p.email}>
                    {p.display_name}
                  </option>
                ))}
              </select>
            )}
            <select className="sel" value={kind} onChange={(e) => setKind(e.target.value as EntryKind | 'all')} aria-label="الإجراء">
              <option value="all">كل الإجراءات</option>
              {ENTRY_KINDS.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.label}
                </option>
              ))}
            </select>
            <select className="sel" value={period} onChange={(e) => setPeriod(e.target.value as Period)} aria-label="الفترة">
              {PERIODS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
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
                  {byDay.get(day)!.map((e) => {
                    const a = e.asset ? m.assets.find((x) => x.id === e.asset) : null;
                    return (
                      <div className="mx-lr" key={e.key}>
                        <time>{riyadhStamp(e.at).slice(11)}</time>
                        <Avatar name={m.nameOf(e.actor)} />
                        <span>
                          {e.text}
                          <span className="tg">
                            <span className="mx-chip plain">
                              <Icon name={typeIcon[e.type] ?? 'file'} />
                              {e.label}
                            </span>
                            {a && (
                              <Link className="mx-link" href={`/media/${a.id}`}>
                                {a.name}
                              </Link>
                            )}
                            {e.work && (
                              <Link className="mx-link" href={e.work.href}>
                                {e.work.label}
                              </Link>
                            )}
                          </span>
                          {(e.before || e.after) && (
                            <span className="mx-ba">
                              <s>{e.before ?? '—'}</s>
                              <span aria-hidden="true">←</span>
                              <b>{e.after ?? '—'}</b>
                            </span>
                          )}
                        </span>
                        <span>{e.stage && <StageChip stage={e.stage} />}</span>
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
              {cursor && <span>قد تكون فيما لم يُحمّل بعد.</span>}
            </div>
          )}
          {cursor && (
            <button type="button" className="secondary mx-more" disabled={busy} onClick={() => void more()}>
              {busy ? 'جارٍ التحميل…' : 'تحميل أحداث أقدم'}
            </button>
          )}
        </>
      )}
    </div>
  );
}

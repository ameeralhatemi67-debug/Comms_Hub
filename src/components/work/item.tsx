'use client';
// The work page on real data: stages with people, dates and approval points; the text and
// platform copies with their versions; media from the library; the review state of each
// part; publishing (read only until «الموافقات والنشر» is built); discussion; the append-only
// log; and the actions this person may take now. After «النموذج المرجعي للمركز» version 5.
// Every action is a database function, which checks the rule again.
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  BriefcaseBusiness,
  ChartGantt,
  Check,
  Clock,
  Eye,
  FileText,
  Film,
  Flag,
  History,
  Image as ImageIcon,
  Link as LinkIcon,
  Lock,
  LockOpen,
  Mail,
  MessagesSquare,
  Pencil,
  Play,
  Plus,
  Send,
  Settings,
  Shield,
  ShieldCheck,
  TriangleAlert,
  Upload,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import { roles } from '@/lib/domain';
import { HOLD } from '@/lib/kit/hold-reasons';
import {
  PLATFORM_ORDER,
  PUBLISHABLE_TYPES,
  actionOwners,
  authOk,
  cleared,
  dayAdd,
  dayDiff,
  dueNote,
  fdate,
  gatePending,
  isLead,
  isOutstanding,
  isRequest,
  isWhole,
  lateN,
  lateStages,
  nDays,
  partsOf,
  pendingParts,
  planPayload,
  platformLabels,
  priorityLabels,
  riyadhInstant,
  riyadhStamp,
  sdate,
  sourceLabels,
  stageLate,
  stageState,
  stageStateLabels,
  statusLabels,
  textEditable,
  textLabels,
  typeLabels,
  waitsFor,
  workActions,
  youtubeOk,
  type AccountRow,
  type ActionId,
  type Platform,
  type Priority,
  type StageRow,
  type WorkAction,
} from '@/lib/work/rules';
import { useWork, useWorkDetail, type WorkDetail } from './data';
import { Av, Empty, Hint, Ic, LibraryPicker, Modal, PrioChip, RestrictedChip, StatusChip, TYPE_ICON, Wid } from './parts';
import { PlanEditor, type EditRow } from './plan';

type Dialog =
  | { t: 'assign' }
  | { t: 'close' }
  | { t: 'submit' }
  | { t: 'text'; target: 'main' | Platform }
  | { t: 'details' }
  | { t: 'lib' }
  | { t: 'plan' }
  | { t: 'ext'; stage: StageRow };

const ACTION_ICON: Record<string, LucideIcon> = {
  reopen: LockOpen, assign: Users, details: Settings, start: Play, submit: Send, plan: ChartGantt, review: Eye, edittext: Pencil,
  lib: ImageIcon, publish: Upload, chat: MessagesSquare, restrict: Shield, close: Lock, stepdone: Check, wait: Clock,
};
const LOG_ICON: Record<string, LucideIcon> = {
  create: Plus, request: Send, start: Play, stage_start: Play, stage_done: Check, gate: ShieldCheck, gate_wait: ShieldCheck, plan: ChartGantt,
  text: Pencil, copy: Pencil, copy_ok: Check, asset: ImageIcon, asset_off: X, submit: Send, review: Eye, approve: Check, approved: Check,
  changes: TriangleAlert, reject: X, close: Lock, reopen: LockOpen, assign: Users, restrict: Shield, details: Settings, stage_due: Clock,
  link: LinkIcon, extension: Clock, move: Clock, move_off: Clock, schedule: Clock, publish: Upload, publish_no: X, due: Clock, unschedule: X,
};

export function WorkItemPage({ id }: { id: string }) {
  const w = useWork();
  const router = useRouter();
  const { detail: d, status, reload } = useWorkDetail(id);
  const [dlg, setDlg] = useState<Dialog | null>(null);
  const [busy, setBusy] = useState(false);

  /** Run a database function, report the result, reload what changed. */
  const act = async (fn: string, args: Record<string, unknown>, ok: string): Promise<boolean> => {
    setBusy(true);
    const r = await w.call(fn, args);
    setBusy(false);
    if (!r.ok) {
      w.say(r.error);
      return false;
    }
    w.say(ok);
    await Promise.all([reload(), w.reloadBase()]);
    return true;
  };

  if (status === 'loading' || w.status === 'loading')
    return (
      <div className="wk">
        <div className="wk-loading" role="status">
          جارٍ تحميل العمل…
        </div>
      </div>
    );
  if (status !== 'ready' || !d)
    return (
      <div className="wk">
        <Empty i={BriefcaseBusiness} title={status === 'missing' ? 'العمل غير موجود' : 'تعذّر تحميل العمل'}>
          {status === 'missing' ? 'قد يكون الرقم خطأ، أو العمل مقيّداً لا يراه إلا المعنيون والقادة. ' : 'أعد تحميل الصفحة. '}
          <Link className="wk-lk" href="/work">
            العودة إلى العمل
          </Link>
        </Empty>
      </div>
    );

  const x = d.w;
  const lead = isLead(w.role);
  const team = [x.assignee, ...x.people, ...d.stages.map((s) => s.who)].filter((p, i, a): p is string => !!p && a.indexOf(p) === i);
  const due = dueNote(x, w.today);
  const late = lateStages(x, d.stages, w.today);
  const acts = workActions({
    w: x,
    stages: d.stages.map((s) => ({ ...s, name: s.name })),
    me: w.me,
    role: w.role,
    hasText: d.texts.length > 0,
    pending: d.pending.length,
    total: d.parts.length,
    decideBlock: d.decideBlock,
    hasChat: d.chats.length > 0,
    nameOf: w.nameOf,
  });
  const owners = actionOwners(x, w.me, w.role, w.nameOf);
  const Type = TYPE_ICON[x.type];

  const run = async (a: WorkAction) => {
    const id0 = a.id as ActionId;
    if (id0.startsWith('stepdone:')) return finishStage(d.stages[Number(id0.split(':')[1])]);
    switch (id0) {
      case 'reopen':
        return void act('work_reopen', { p_work: x.id }, 'أُعيد فتح العمل.');
      case 'start':
        return void act('work_start', { p_work: x.id }, x.status === 'DRAFT' ? 'بدأ الإنتاج.' : 'عاد العمل إلى «قيد الإنتاج».');
      case 'restrict':
        return void act('work_set_restricted', { p_work: x.id, p_restricted: !x.restricted }, x.restricted ? 'أُلغي التقييد: يراه كل القسم.' : 'قُيّد العمل: يراه المعنيون والقادة فقط.');
      case 'chat': {
        const r = await w.call<string>('chat_create_room', {
          p_type: 'group',
          p_name: x.title.slice(0, 60),
          p_desc: `مجموعة العمل ${x.id}`,
          p_members: team.length ? team : [w.me],
          p_link: { type: 'work', id: x.id, title: x.title },
        });
        if (!r.ok) return w.say(r.error);
        w.say('فُتحت مجموعة مراسلة للعمل تضم المسؤول والمشاركين.');
        return router.push(`/mail/chat?room=${r.data}`);
      }
      case 'edittext':
        return setDlg({ t: 'text', target: 'main' });
      case 'assign':
      case 'close':
      case 'submit':
      case 'details':
      case 'lib':
      case 'plan':
        return setDlg({ t: id0 } as Dialog);
    }
  };
  const finishStage = async (s: StageRow) => {
    const ok = await act('work_stage_act', { p_stage: s.id, p_op: 'finish' }, s.gate ? `انتهت «${s.name}». هي نقطة اعتماد: ما بعدها ينتظر اعتماد مدير الاتصال أو مساعده، ووصلهما إشعار.` : `انتهت «${s.name}»، ووصل إشعار لمن بعدها.`);
    return ok;
  };

  return (
    <div className="wk">
      <div className="wk-back">
        <Link className="wk-btn sm" href="/work">
          <Ic i={ArrowRight} />
          العودة إلى العمل
        </Link>
        <div className="wk-crumb">
          <Link href="/work">العمل</Link>
          <span aria-hidden="true">‹</span>
          <span className="cur">{x.id}</span>
        </div>
      </div>

      <section className="wk-ihead">
        <span className="ti">
          <Ic i={Type} />
        </span>
        <div style={{ minWidth: 0, display: 'grid', gap: 8 }}>
          <div className="top">
            <Wid id={x.id} />
            <span className="wk-chip plain">{typeLabels[x.type]}</span>
            <StatusChip status={x.status} />
            <PrioChip p={x.priority} />
            {x.restricted && <RestrictedChip />}
            {isRequest(x) && <span className="wk-chip info">طلب جديد</span>}
          </div>
          <h2>{x.title}</h2>
          <div className="wk-facts">
            <span>
              <Ic i={Users} />
              {x.assignee ? `المسؤول ${w.nameOf(x.assignee)}` : 'لم يُسند بعد'}
            </span>
            <span className={due.tone === 'late' ? 'late' : ''}>
              <Ic i={Clock} />
              التسليم {fdate(x.due)} · <b className={due.tone}>{due.text}</b>
            </span>
            <span>
              <Ic i={Flag} />
              {sourceLabels[x.source] ?? x.source}
              {x.requester ? ` · ${x.requester}` : ''}
            </span>
          </div>
          {d.projects.length > 0 && (
            <div className="wk-camps">
              {d.projects.map((p) => (
                <span className="wk-camp" key={p}>
                  {w.projects.find((j) => j.id === p)?.name}
                </span>
              ))}
            </div>
          )}
        </div>
      </section>

      {x.closed_at && (
        <div className="wk-closed-bar">
          <Ic i={Lock} />
          <span>
            أغلقه <b>{w.nameOf(x.closed_by)}</b> {riyadhStamp(x.closed_at)}. السبب: {x.close_reason}
          </span>
        </div>
      )}
      {x.restricted && (
        <div className="wk-restrict-bar">
          <Ic i={Shield} />
          <span>
            عمل مقيّد: يراه {team.map(w.nameOf).join(' و') || 'المعنيون'} ومدير الاتصال ومساعده
            {!team.includes(x.created_by) ? ` و${w.nameOf(x.created_by)}` : ''} فقط. لا يظهر لغيرهم في أي قائمة أو عدّاد.
          </span>
        </div>
      )}

      <StagesPanel d={d} late={late.length} busy={busy} act={act} onExt={(s) => setDlg({ t: 'ext', stage: s })} onPlan={() => setDlg({ t: 'plan' })} />

      <div className="wk-grid">
        <div className="wk-col">
          <TextPanel d={d} onEdit={(target) => setDlg({ t: 'text', target })} act={act} />
          <MediaPanel d={d} onAdd={() => setDlg({ t: 'lib' })} act={act} />
          <ApprovalPanel d={d} />
          <PublishPanel d={d} />
          <Comments d={d} act={act} />
          <section className="wk-pn" data-gd="log">
            <h3>
              سجل العمل<small>{d.log.length} حدثاً · لا يُعدَّل ولا يُحذف</small>
            </h3>
            <ul className="wk-tl">
              {[...d.log].reverse().map((e) => (
                <li key={e.id}>
                  <span className="ti">
                    <Ic i={LOG_ICON[e.type] ?? History} />
                  </span>
                  <span className="tx">
                    <b>{w.nameOf(e.actor) || 'المركز'}</b> · {e.text}
                    <small className="ltr">{riyadhStamp(e.at)}</small>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>
        <div className="wk-col">
          <section className="wk-pn" data-gd="actions">
            <h3>
              الإجراءات<small>{roles[w.role].name}</small>
            </h3>
            <div className="wk-qlist">
              {acts.length ? (
                acts.map((a) => (
                  <button key={a.id} type="button" className={`wk-qbtn ${a.next ? 'next' : ''}`} disabled={a.disabled || busy} onClick={() => void run(a)}>
                    <span className="q-i">
                      <Ic i={ACTION_ICON[a.id.split(':')[0]] ?? Check} />
                    </span>
                    <span>
                      <b>{a.label}</b>
                      <small>{a.hint}</small>
                    </span>
                  </button>
                ))
              ) : (
                <p className="wk-col-hint">لا إجراءات لدورك على هذا العمل. يمكنك التعليق.</p>
              )}
              {owners && <p className="wk-qmore">{owners}</p>}
            </div>
          </section>
          <section className="wk-pn" data-gd="details">
            <h3>التفاصيل</h3>
            <dl className="wk-kv">
              <dt>المسؤول</dt>
              <dd>{x.assignee ? `${w.nameOf(x.assignee)} · ${roles[w.personOf(x.assignee)?.role ?? 'member'].name}` : 'لم يُسند'}</dd>
              <dt>المشاركون</dt>
              <dd>{x.people.length ? x.people.map(w.nameOf).join('، ') : '—'}</dd>
              <dt>طلبه</dt>
              <dd>
                {w.nameOf(x.created_by)}
                {x.requester ? ` عن ${x.requester}` : ''}
              </dd>
              <dt>المصدر</dt>
              <dd>{sourceLabels[x.source] ?? x.source}</dd>
              <dt>المشاريع</dt>
              <dd>{d.projects.length ? d.projects.map((p) => w.projects.find((j) => j.id === p)?.name).join('، ') : 'بلا مشروع'}</dd>
              <dt>الأولوية</dt>
              <dd>{priorityLabels[x.priority]}</dd>
              <dt>التسليم</dt>
              <dd>{fdate(x.due)}</dd>
              {x.type === 'event' && x.event_at && (
                <>
                  <dt>الحدث</dt>
                  <dd>
                    {riyadhStamp(x.event_at)}
                    {x.place ? ` · ${x.place}` : ''}
                  </dd>
                </>
              )}
              <dt>الرؤية</dt>
              <dd>{x.restricted ? 'مقيّد' : 'كل القسم'}</dd>
              <dt>أُنشئ</dt>
              <dd className="ltr">{riyadhStamp(x.created_at)}</dd>
            </dl>
            {x.brief && <p className="wk-col-hint">{x.brief}</p>}
          </section>
          <section className="wk-pn" data-gd="links">
            <h3>
              مرتبط به<small>{d.mail.length + d.chats.length}</small>
            </h3>
            <div className="wk-links">
              {d.mail.map((m) => (
                <Link className="wk-lnk" key={m.id} href={`/mail?thread=${m.id}`}>
                  <span className="li">
                    <Ic i={Mail} />
                  </span>
                  <span>
                    <b>{m.subject}</b>
                    <small>البريد{m.kind === 'external' ? (m.req_no ? ` · طلب خارجي #${m.req_no}` : ' · خارجي') : ' · داخلي'}</small>
                  </span>
                </Link>
              ))}
              {d.chats.map((c) => (
                <Link className="wk-lnk" key={c.id} href={`/mail/chat?room=${c.id}`}>
                  <span className="li">
                    <Ic i={MessagesSquare} />
                  </span>
                  <span>
                    <b>{c.name ?? 'مجموعة العمل'}</b>
                    <small>مجموعة مراسلة</small>
                  </span>
                </Link>
              ))}
              {!d.mail.length && !d.chats.length && <p className="wk-col-hint">لا رسائل أو محادثات مرتبطة تراها.</p>}
            </div>
          </section>
          <section className="wk-pn" data-gd="team">
            <h3>
              الفريق<small>{team.length}</small>
            </h3>
            <div className="wk-team">
              {team.length ? (
                team.map((p) => {
                  const l = w.load.find((r) => r.email === p);
                  const mine = d.stages.filter((s) => s.who === p);
                  return (
                    <div className="wk-mem" key={p}>
                      <Av name={w.nameOf(p)} size="lg" />
                      <span>
                        <b>{w.nameOf(p)}</b>
                        <small>
                          {p === x.assignee ? 'المسؤول' : mine.length ? `مرحلة ${mine.map((s) => `«${s.name}»`).join(' و')}` : 'مشارك'} ·{' '}
                          {roles[w.personOf(p)?.role ?? 'member'].name}
                        </small>
                      </span>
                      {l && (
                        <span className="cnt">
                          {l.active_works} نشطة{l.late_works ? <span className="late"> · {l.late_works} متأخر</span> : null}
                        </span>
                      )}
                    </div>
                  );
                })
              ) : (
                <p className="wk-col-hint">يحدد القادة المسؤول عند الإسناد.</p>
              )}
            </div>
          </section>
        </div>
      </div>

      {dlg?.t === 'assign' && <AssignDialog d={d} onClose={() => setDlg(null)} act={act} />}
      {dlg?.t === 'close' && <CloseDialog d={d} onClose={() => setDlg(null)} act={act} />}
      {dlg?.t === 'submit' && <SubmitDialog d={d} onClose={() => setDlg(null)} act={act} />}
      {dlg?.t === 'text' && <TextDialog d={d} target={dlg.target} onClose={() => setDlg(null)} act={act} />}
      {dlg?.t === 'details' && <DetailsDialog d={d} onClose={() => setDlg(null)} act={act} />}
      {dlg?.t === 'ext' && <ExtensionDialog d={d} stage={dlg.stage} onClose={() => setDlg(null)} act={act} />}
      {dlg?.t === 'lib' && (
        <LibraryPicker
          have={d.assets.map((a) => a.asset_id)}
          onClose={() => setDlg(null)}
          onPick={(f) => void act('work_asset_link', { p_work: x.id, p_asset: f.id, p_add: true }, `رُبط «${f.name}» بالعمل.`).then((ok) => ok && setDlg(null))}
        />
      )}
      {dlg?.t === 'plan' && (
        <PlanEditor
          title={x.title}
          type={x.type}
          due={x.due}
          initial={d.stages.map(
            (s): EditRow => ({
              id: s.id,
              n: s.name,
              role: s.role,
              who: s.who ?? '',
              start: s.start_on ?? '',
              due: s.due_on ?? '',
              after: [...s.after_pos],
              days: s.days > 1 ? s.days : 0,
              gate: s.gate,
              note: s.note ?? '',
              done: !!s.done_at,
            }),
          )}
          onClose={() => setDlg(null)}
          onSave={async (rows) => {
            const r = await w.call('work_save_plan', { p_work: x.id, p_rows: planPayload(rows) });
            if (!r.ok) return r.error;
            setDlg(null);
            w.say('حُفظت الخطة، وأُبلغ من تغيّرت مراحلهم.');
            await Promise.all([reload(), w.reloadBase()]);
            return null;
          }}
        />
      )}
    </div>
  );
}

type Act = (fn: string, args: Record<string, unknown>, ok: string) => Promise<boolean>;

// ---------------------------------------------------------------------------
// Stages
// ---------------------------------------------------------------------------
function StagesPanel({ d, late, busy, act, onExt, onPlan }: { d: WorkDetail; late: number; busy: boolean; act: Act; onExt: (s: StageRow) => void; onPlan: () => void }) {
  const w = useWork();
  const x = d.w;
  const S = d.stages;
  if (!S.length) return null;
  const from = S.reduce((m, s) => (s.start_on && s.start_on < m ? s.start_on : m), x.due < w.today ? x.due : w.today);
  const to = S.reduce((m, s) => (s.due_on && s.due_on > m ? s.due_on : m), x.due);
  const span = Math.max(1, dayDiff(to, from) + 1);
  const todayAt = (dayDiff(w.today, from) / span) * 100;
  const lead = isLead(w.role);
  const boss = lead || x.assignee === w.me;
  const canPlan = boss && !x.closed_at && isOutstanding(x);
  const working = !x.closed_at && !!x.assignee && ['DRAFT', 'IN_PRODUCTION'].includes(x.status);
  return (
    <section className="wk-pn" data-gd="steps">
      <h3>
        المراحل
        <small>
          {S.length} مراحل{late ? <span className="late"> · {lateN(late)}</span> : null}
        </small>
      </h3>
      <div className="wk-srange">
        <span>{fdate(from)}</span>
        <span>{fdate(to)}</span>
      </div>
      <div className="wk-slist">
        {S.map((s, i) => {
          const st = stageState(S, i);
          const isLate = stageLate(s, w.today) && isOutstanding(x);
          const gp = gatePending(s);
          const a = s.start_on || s.due_on || from;
          const b = s.due_on || s.start_on || from;
          const off = (dayDiff(a, from) / span) * 100;
          const wd = Math.max(2, ((dayDiff(b, a) + 1) / span) * 100);
          const wait = st === 'waiting'
            ? waitsFor(S, i).map((j) => `«${S[j].name}»${gatePending(S[j]) ? ' (بانتظار اعتمادها)' : S[j].who ? ` (${w.nameOf(S[j].who)})` : ''}`).join(' و')
            : '';
          const mine = s.who === w.me;
          const ext = d.extensions.find((e) => e.stage_id === s.id);
          return (
            <div className={`wk-srow s-${st} ${isLate ? 'late' : ''}`} key={s.id}>
              <span className="sn">{st === 'done' ? <Ic i={Check} /> : i + 1}</span>
              <span className="smeta">
                <b>{s.name}</b>
                <small>
                  {s.who ? (
                    <>
                      <Av name={w.nameOf(s.who)} size="sm" />
                      <span>{w.nameOf(s.who)}</span>
                    </>
                  ) : (
                    <span>غير مسندة</span>
                  )}
                  <span>
                    {s.start_on && s.start_on !== s.due_on ? `${sdate(s.start_on)} – ` : ''}
                    {s.due_on ? sdate(s.due_on) : 'بلا موعد'}
                  </span>
                  <span>{s.after_pos.length ? `بعد ${s.after_pos.map((j) => `«${S[j]?.name}»`).join(' و')}` : 'تبدأ وحدها'}</span>
                  {s.gate && (
                    <span className="wk-chip gatec">
                      <Ic i={ShieldCheck} />
                      نقطة اعتماد
                    </span>
                  )}
                </small>
                {s.note && <small className="snote">{s.note}</small>}
                {s.done_at ? (
                  <small>
                    أنهاها {w.nameOf(s.done_by)} <span className="ltr">{riyadhStamp(s.done_at).slice(5)}</span>
                    {s.gate_by ? ` · اعتمدها ${w.nameOf(s.gate_by)}` : ''}
                  </small>
                ) : wait ? (
                  <small className="waitn">تنتظر {wait}</small>
                ) : null}
              </span>
              <span className={`wk-chip ${gp ? 'gatec' : isLate ? 'danger' : st === 'done' ? 'done' : st === 'active' ? 'info' : st === 'ready' ? 'approved' : ''}`}>
                {gp ? 'بانتظار اعتماد المرحلة' : isLate ? `متأخرة ${nDays(-dayDiff(s.due_on!, w.today))}` : stageStateLabels[st]}
              </span>
              <span className="wk-sbar" aria-hidden="true">
                <i className={`${st} ${isLate ? 'late' : ''}`} style={{ insetInlineStart: `${off.toFixed(1)}%`, width: `${wd.toFixed(1)}%` }} />
                {todayAt >= 0 && todayAt <= 100 && <b style={{ insetInlineStart: `${todayAt.toFixed(1)}%` }} />}
              </span>
              <span className="sa">
                {gp && !x.closed_at ? (
                  lead && s.done_by !== w.me ? (
                    <button type="button" className="wk-btn sm primary" disabled={busy} onClick={() => void act('work_stage_act', { p_stage: s.id, p_op: 'gate' }, `اعتُمدت «${s.name}»، ووصل إشعار لمن بعدها.`)}>
                      <Ic i={Check} />
                      اعتماد المرحلة
                    </button>
                  ) : (
                    <span className="wk-chip gatec">{s.done_by === w.me ? 'لا تعتمد ما أنهيته بنفسك' : 'يعتمدها مدير الاتصال أو مساعده'}</span>
                  )
                ) : working ? (
                  <>
                    {st === 'ready' && (mine || boss) && (
                      <button type="button" className="wk-btn sm" disabled={busy} onClick={() => void act('work_stage_act', { p_stage: s.id, p_op: 'start' }, `بدأت «${s.name}».`)}>
                        <Ic i={Play} />
                        بدء
                      </button>
                    )}
                    {(st === 'ready' || st === 'active') && (mine || boss) && (
                      <button
                        type="button"
                        className="wk-btn sm primary"
                        disabled={busy}
                        onClick={() =>
                          void act('work_stage_act', { p_stage: s.id, p_op: 'finish' }, s.gate ? `انتهت «${s.name}». ما بعدها ينتظر اعتماد مدير الاتصال أو مساعده.` : `انتهت «${s.name}»، ووصل إشعار لمن بعدها.`)
                        }
                      >
                        <Ic i={Check} />
                        تمّت
                      </button>
                    )}
                    {st !== 'done' && mine && !ext && (
                      <button type="button" className="wk-btn sm quiet" onClick={() => onExt(s)}>
                        <Ic i={Clock} />
                        طلب تمديد
                      </button>
                    )}
                    {ext && <span className="wk-chip warn">طلب تمديد بانتظار القرار</span>}
                  </>
                ) : null}
              </span>
            </div>
          );
        })}
      </div>
      <p className="wk-col-hint">
        لكل مرحلة شخص وموعد. المرحلة التي تنتظر غيرها تبدأ حين تنتهي ما قبلها، ويصل إشعار لصاحبها. المراحل التي لا تنتظر بعضها تجري في وقت واحد. ونقطة الاعتماد لا يبدأ ما بعدها حتى يعتمدها مدير الاتصال أو مساعده.
      </p>
      {canPlan && (
        <div>
          <button type="button" className="wk-btn sm" onClick={onPlan}>
            <Ic i={ChartGantt} />
            تعديل خطة المراحل
          </button>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Text and copies
// ---------------------------------------------------------------------------
const latestVariant = (d: WorkDetail, p: string) => d.variants.filter((v) => v.platform === p).sort((a, b) => b.n - a.n)[0];
const chosenPlatforms = (d: WorkDetail, accounts: AccountRow[]) =>
  PLATFORM_ORDER.filter((p) => d.w.channels.some((c) => accounts.find((a) => a.id === c)?.platform === p) || d.variants.some((v) => v.platform === p));

function TextPanel({ d, onEdit, act }: { d: WorkDetail; onEdit: (t: 'main' | Platform) => void; act: Act }) {
  const w = useWork();
  const x = d.w;
  const [tab, setTab] = useState<'main' | Platform>('main');
  const cur = d.texts[d.texts.length - 1];
  const plats = chosenPlatforms(d, w.accounts);
  const stale = plats.filter((p) => {
    const v = latestVariant(d, p);
    return cur && v && v.body.trim() && v.base < cur.n;
  });
  const canEdit = (isLead(w.role) || x.assignee === w.me) && textEditable(x);
  if (!cur && !plats.length)
    return x.brief ? (
      <section className="wk-pn" data-gd="text">
        <h3>وصف العمل</h3>
        <div className="wk-textbox">{x.brief}</div>
        {canEdit && (
          <div>
            <button type="button" className="wk-btn sm" onClick={() => onEdit('main')}>
              <Ic i={Pencil} />
              كتابة {textLabels[x.type]}
            </button>
          </div>
        )}
      </section>
    ) : null;
  const t = tab !== 'main' && !plats.includes(tab) ? 'main' : tab;
  const v = t !== 'main' ? latestVariant(d, t) : null;
  const flag = t !== 'main' ? d.flags.find((f) => f.part === `v:${t}` && v && f.ver === `c${v.n}`) : d.flags.find((f) => f.part === 'text' && cur && f.ver === `t${cur.n}`);
  return (
    <section className="wk-pn" data-gd="text">
      <h3>
        {textLabels[x.type]} والنسخ<small>{plats.length ? 'نسخة لكل منصة' : ''}</small>
      </h3>
      {x.brief && <p className="wk-col-hint">{x.brief}</p>}
      <div className="wk-vtabs" role="group" aria-label="النسخ">
        <button type="button" aria-pressed={t === 'main'} onClick={() => setTab('main')}>
          {textLabels[x.type]}
        </button>
        {plats.map((p) => (
          <button type="button" key={p} aria-pressed={t === p} onClick={() => setTab(p)}>
            {platformLabels[p]}
            {stale.includes(p) && (
              <>
                <i className="flag" aria-hidden="true" />
                <span className="sr">تحتاج مراجعة</span>
              </>
            )}
          </button>
        ))}
      </div>
      {t === 'main' ? (
        cur ? (
          <>
            <div className="wk-textbox">{cur.body}</div>
            <div className="wk-vmeta">
              <span>
                الإصدار <b>{cur.n}</b>
              </span>
              <span>
                {cur.author !== x.assignee && x.assignee ? (
                  <>
                    عدّله <b>{w.nameOf(cur.author)}</b> · الكاتب {w.nameOf(x.assignee)}
                  </>
                ) : (
                  <>
                    كتبه <b>{w.nameOf(cur.author)}</b>
                  </>
                )}
              </span>
              <span className="ltr">{riyadhStamp(cur.created_at)}</span>
              {cur.note && <span>{cur.note}</span>}
              {canEdit && (
                <button type="button" className="wk-btn sm" onClick={() => onEdit('main')}>
                  <Ic i={Pencil} />
                  تعديل
                </button>
              )}
            </div>
            {flag && <Hint warn>طلب التعديل: «{flag.note}»</Hint>}
            {stale.length > 0 && (
              <div className="wk-stale">
                <Ic i={TriangleAlert} />
                <span>نسخ تحتاج مراجعة بعد تعديل النص الأساسي: {stale.map((p) => platformLabels[p]).join('، ')}</span>
              </div>
            )}
            {d.texts.length > 1 && (
              <details>
                <summary className="wk-lk">الإصدارات السابقة ({d.texts.length - 1})</summary>
                <ul className="wk-vers">
                  {d.texts
                    .slice(0, -1)
                    .reverse()
                    .map((tv) => (
                      <li key={tv.n}>
                        <b>الإصدار {tv.n}</b>
                        <small>
                          {w.nameOf(tv.author)} · <span className="ltr">{riyadhStamp(tv.created_at)}</span>
                          {tv.note ? ` · ${tv.note}` : ''}
                        </small>
                        <div className="wk-textbox">{tv.body}</div>
                      </li>
                    ))}
                </ul>
              </details>
            )}
          </>
        ) : (
          <div className="wk-textbox quiet">
            لم يُكتب {textLabels[x.type]} بعد.{' '}
            {canEdit && (
              <button type="button" className="wk-lk" onClick={() => onEdit('main')}>
                اكتبه الآن
              </button>
            )}
          </div>
        )
      ) : (
        <>
          {v?.body.trim() ? <div className="wk-textbox">{v.body}</div> : <div className="wk-textbox quiet">لا توجد نسخة خاصة. يُنشر النص الأساسي كما هو.</div>}
          {flag && <Hint warn>طلب التعديل: «{flag.note}»</Hint>}
          {stale.includes(t as Platform) && cur && v && (
            <div className="wk-stale">
              <Ic i={TriangleAlert} />
              <span>
                تحتاج مراجعة: كُتبت قبل تعديل النص الأساسي (الإصدار {v.base}، والحالي {cur.n}).
              </span>
              {canEdit && (
                <button type="button" className="wk-btn sm" onClick={() => void act('work_variant_confirm', { p_work: x.id, p_platform: t }, `أُكدت صياغة نسخة ${platformLabels[t as Platform]}.`)}>
                  تأكيد الصياغة
                </button>
              )}
            </div>
          )}
          <div className="wk-vmeta">
            <span>
              نسخة {platformLabels[t as Platform]}
              {v?.body.trim() ? ` · الصياغة ${v.n}` : ''}
            </span>
            {v?.body.trim() ? <span>{v.body.length} حرفاً</span> : null}
            {canEdit && x.channels.length > 0 && (
              <button type="button" className="wk-btn sm" onClick={() => onEdit(t as Platform)}>
                <Ic i={Pencil} />
                {v?.body.trim() ? 'تعديل النسخة' : 'كتابة نسخة خاصة'}
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Media, review state, publishing, discussion
// ---------------------------------------------------------------------------
const ASTAGE: Record<string, [string, string]> = {
  draft: ['مسودة', ''], production: ['قيد الإنتاج', 'info'], review: ['قيد المراجعة', 'review'], ready: ['جاهز للنشر', 'approved'],
  scheduled: ['مجدول', 'sched'], published: ['منشور', 'done'], changes: ['بحاجة إلى تعديل', 'warn'], rejected: ['مرفوض', 'danger'],
  partial: ['نشر جزئي', 'warn'], failed: ['فشل النشر', 'danger'],
};
function MediaPanel({ d, onAdd, act }: { d: WorkDetail; onAdd: () => void; act: Act }) {
  const w = useWork();
  const x = d.w;
  const open = !x.closed_at && ['DRAFT', 'IN_PRODUCTION', 'CHANGES_REQUESTED', 'REJECTED'].includes(x.status);
  const part = isLead(w.role) || x.assignee === w.me || x.created_by === w.me || x.people.includes(w.me) || d.stages.some((s) => s.who === w.me);
  return (
    <section className="wk-pn" data-gd="media">
      <h3>
        الوسائط<small>من مكتبة الوسائط</small>
      </h3>
      {d.assets.length ? (
        <div className="wk-alist">
          {d.assets.map((a) => {
            const f = a.file;
            const st = f ? ASTAGE[f.stage] : null;
            return (
              <div className="wk-arow" key={a.asset_id}>
                <span className="th">
                  <Ic i={f?.kind === 'video' ? Film : f?.kind === 'image' ? ImageIcon : FileText} />
                </span>
                {f ? (
                  <Link href={`/media/${f.id}`} style={{ minWidth: 0 }}>
                    <b>{f.name}</b>
                    <small>
                      الإصدار {f.current_version}
                      {f.approved_version === f.current_version && ['ready', 'scheduled', 'published'].includes(f.stage) ? ' · معتمد ومقفل' : ''} · افتح في المكتبة
                    </small>
                  </Link>
                ) : (
                  <span>
                    <b>ملف في مجلد لا تصل إليه</b>
                    <small>يراه من يملك الوصول إلى مجلده.</small>
                  </span>
                )}
                {st ? <span className={`wk-chip ${st[1]}`}>{st[0]}</span> : <span />}
                {open && part ? (
                  <button type="button" className="wk-btn sm quiet" aria-label="إزالة من العمل" title="إزالة من العمل" onClick={() => void act('work_asset_link', { p_work: x.id, p_asset: a.asset_id, p_add: false }, 'أُزيل الملف من العمل، ويبقى في المكتبة.')}>
                    <Ic i={X} />
                  </button>
                ) : (
                  <span />
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="wk-col-hint">لا وسائط مرتبطة بعد.</p>
      )}
      {open && part && (
        <div>
          <button type="button" className="wk-btn sm" onClick={onAdd}>
            <Ic i={Plus} />
            إضافة من المكتبة
          </button>
        </div>
      )}
    </section>
  );
}

function ApprovalPanel({ d }: { d: WorkDetail }) {
  const w = useWork();
  const x = d.w;
  if (!d.cycles.length && !d.parts.length) return null;
  const T: Record<string, string> = { approve: 'اعتماد', changes: 'طلب تعديل', reject: 'رفض', withdraw: 'سحب الطلب' };
  return (
    <section className="wk-pn" data-gd="approval">
      <h3>
        المراجعة والاعتماد<small>{d.cycles.length ? `الدورة ${d.cycles.length}` : 'لم يُرسل بعد'}</small>
      </h3>
      <p className="wk-col-hint">
        {isWhole(x.type)
          ? `السياسة: ${typeLabels[x.type]} يُعتمد حزمة كاملة، وأي تعديل يعيده كله إلى المراجعة.`
          : 'السياسة: اعتماد لكل جزء. ما اعتُمد ولم يتغيّر لا يُراجع مرة أخرى.'}
      </p>
      {d.parts.length > 0 && (
        <div className="wk-chanlist">
          {d.parts.map((p) => {
            const ok = d.approvals.some((a) => a.part === p.key && a.ver === p.ver);
            const flag = d.flags.find((f) => f.part === p.key && f.ver === p.ver);
            const by = d.approvals.find((a) => a.part === p.key);
            return (
              <div className="wk-chanrow" key={p.key}>
                <span>
                  <b>{p.label}</b>
                  <small>
                    {p.kind === 'text' ? `الإصدار ${p.ver.slice(1)}` : p.kind === 'copy' ? `الصياغة ${p.ver.slice(1)}` : p.kind === 'asset' ? p.ver : p.kind === 'date' ? riyadhStamp(`${p.ver.slice(2)}:00Z`) : 'الحسابات بعينها'}
                    {ok && by ? ` · اعتمده ${w.nameOf(by.approved_by)}` : by && !ok ? ' · تغيّر بعد اعتماده' : ''}
                  </small>
                </span>
                <span className={`wk-chip ${ok ? 'approved' : flag ? 'warn' : x.status === 'IN_REVIEW' ? 'review' : ''}`}>
                  {ok ? 'معتمد' : flag ? 'طُلب تعديله' : x.status === 'IN_REVIEW' ? 'بانتظار القرار' : 'غير معتمد'}
                </span>
              </div>
            );
          })}
        </div>
      )}
      {x.status === 'IN_REVIEW' && isLead(w.role) && <Hint i={Eye}>القرار على الأجزاء من شاشة المراجعة في «الموافقات والنشر»، وهي قيد البناء.</Hint>}
      {d.cycles.length > 0 && (
        <details>
          <summary className="wk-lk">دورات المراجعة ({d.cycles.length})</summary>
          <ul className="wk-cyc">
            {[...d.cycles].reverse().map((c) => {
              const ev = d.decisions.filter((e) => e.cycle === c.n);
              return (
                <li key={c.n}>
                  <span className="n">{c.n}</span>
                  <span>
                    أرسلها {w.nameOf(c.sent_by)} <span className="ltr">{riyadhStamp(c.sent_at)}</span>
                    {c.note ? ` · ${c.note}` : ''}
                    {ev.length ? (
                      ev.map((e) => (
                        <small key={e.id}>
                          <b>{T[e.op] ?? e.op}</b> · {w.nameOf(e.decided_by)} <span className="ltr">{riyadhStamp(e.decided_at)}</span> · {e.labels.join('، ')}
                          {e.note ? ` · «${e.note}»` : ''}
                        </small>
                      ))
                    ) : (
                      <small>بانتظار القرار</small>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </details>
      )}
    </section>
  );
}

function PublishPanel({ d }: { d: WorkDetail }) {
  const w = useWork();
  const x = d.w;
  if (!x.channels.length) return null;
  const mail = w.accounts.find((a) => a.id === x.channels[0])?.platform === 'mail';
  const when = x.sched_at ?? x.proposed_at;
  return (
    <section className="wk-pn" data-gd="publish">
      <h3>
        {mail ? 'الإرسال' : 'النشر'}
        <small>
          {x.status === 'SCHEDULED' && x.sched_at ? `مجدول ${riyadhStamp(x.sched_at)}` : x.proposed_at ? `الموعد المقترح ${riyadhStamp(x.proposed_at)}` : 'بلا موعد'}
        </small>
      </h3>
      {x.pending_sched && x.status === 'IN_REVIEW' && <Hint warn>الجدولة معلّقة حتى يُعتمد ما تغيّر، ثم تعود تلقائياً إلى موعدها.</Hint>}
      <div className="wk-chanlist">
        {x.channels.map((c) => {
          const a = w.accounts.find((y) => y.id === c);
          const r = x.results[c];
          return (
            <div className="wk-chanrow" key={c}>
              <span>
                <b>{a ? (a.platform === 'mail' ? 'البريد' : `${platformLabels[a.platform]} · ${a.label}`) : 'حساب محذوف'}</b>
                {a?.handle && <small className="ltr">{a.handle}</small>}
              </span>
              {r ? (
                <span className={r.ok ? 'ok' : 'late'}>{r.ok ? `نُشر ${riyadhStamp(r.at).slice(5)}` : (r.why ?? 'فشل')}</span>
              ) : when && a && !authOk(a, when) ? (
                <span className="late">التفويض ينتهي قبل الموعد</span>
              ) : (
                <span className="wk-col-hint">لم يُنشر</span>
              )}
            </div>
          );
        })}
      </div>
      <p className="wk-col-hint">{mail ? 'الإرسال في هذه المرحلة محاكاة.' : 'النشر في هذه المرحلة محاكاة: لا يصل شيء إلى المنصات.'}</p>
    </section>
  );
}

function Comments({ d, act }: { d: WorkDetail; act: Act }) {
  const w = useWork();
  const [text, setText] = useState('');
  return (
    <section className="wk-pn" data-gd="comments">
      <h3>
        النقاش<small>{d.comments.length}</small>
      </h3>
      <div className="wk-cmts">
        {d.comments.map((c) => (
          <div className="wk-cmt" key={c.id}>
            <Av name={w.nameOf(c.author)} size="sm" />
            <div className="bub">
              <small>
                <b>{w.nameOf(c.author)}</b> · <span className="ltr">{riyadhStamp(c.created_at)}</span>
              </small>
              {c.body}
            </div>
          </div>
        ))}
        {!d.w.closed_at && (
          <div className="wk-cnew">
            <textarea className="wk-inp" value={text} maxLength={2000} placeholder="اكتب تعليقاً للفريق…" aria-label="تعليق" onChange={(e) => setText(e.target.value)} />
            <button
              type="button"
              className="wk-btn primary"
              disabled={!text.trim()}
              onClick={() => void act('work_comment', { p_work: d.w.id, p_body: text }, 'أُرسل التعليق.').then((ok) => ok && setText(''))}
            >
              <Ic i={Send} />
              إرسال
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Dialogs
// ---------------------------------------------------------------------------
export function AssignDialog({ d, onClose, act }: { d: WorkDetail; onClose: () => void; act: Act }) {
  const w = useWork();
  const x = d.w;
  return (
    <Modal title={x.assignee ? 'إسناد إلى شخص آخر' : 'إسناد الطلب'} onClose={onClose}>
      <Hint i={BriefcaseBusiness}>
        {x.id} · {x.title}. يصل إشعار إلى المسؤول الجديد{x.assignee ? ` وإلى ${w.nameOf(x.assignee)}` : ''}.
      </Hint>
      <div className="wk-pick-list">
        {w.people
          .filter((p) => p.role !== 'member' && p.role !== 'admin')
          .map((p) => {
            const l = w.load.find((r) => r.email === p.email);
            return (
              <button
                type="button"
                key={p.email}
                disabled={p.email === x.assignee}
                onClick={() => void act('work_assign', { p_work: x.id, p_to: p.email }, `أُسند العمل إلى ${p.display_name}، ووصله إشعار.`).then((ok) => ok && onClose())}
              >
                <Av name={p.display_name} />
                <span className="grow">
                  <b>{p.display_name}</b> · <small>{roles[p.role].name}</small>
                </span>
                {l && (
                  <small>
                    {l.active_works} نشطة{l.late_works ? <span className="late"> · {l.late_works} متأخر</span> : null}
                  </small>
                )}
              </button>
            );
          })}
      </div>
    </Modal>
  );
}

export function CloseDialog({ d, onClose, act }: { d: WorkDetail; onClose: () => void; act: Act }) {
  const w = useWork();
  const [reason, setReason] = useState('');
  const [err, setErr] = useState('');
  const x = d.w;
  return (
    <Modal title="إغلاق العمل" onClose={onClose}>
      <Hint i={Lock}>
        يخرج «{x.title}» من القوائم النشطة ومن حمل {w.nameOf(x.assignee ?? x.created_by)}، ويبقى في «المغلقة» بحالته الأخيرة «{statusLabels[x.status]}». يمكن إعادة فتحه.
      </Hint>
      <label className="l">
        السبب <small>يظهر لكل من يرى العمل</small>
        <textarea className="wk-inp" value={reason} maxLength={500} placeholder="مثلاً: أُلغي الحدث، أو دُمج في عمل آخر" onChange={(e) => setReason(e.target.value)} />
      </label>
      {err && <p className="wk-err">{err}</p>}
      <div className="wk-row-acts">
        <button type="button" className="wk-btn quiet" onClick={onClose}>
          تراجع
        </button>
        <button
          type="button"
          className="wk-btn primary"
          data-hold={HOLD.closeWork}
          onClick={() => {
            if (!reason.trim()) return setErr('اكتب سبب الإغلاق.');
            void act('work_close', { p_work: x.id, p_reason: reason }, 'أُغلق العمل، ويبقى في «المغلقة».').then((ok) => ok && onClose());
          }}
        >
          <Ic i={Lock} />
          إغلاق العمل
        </button>
      </div>
    </Modal>
  );
}

export function SubmitDialog({ d, onClose, act }: { d: WorkDetail; onClose: () => void; act: Act }) {
  const w = useWork();
  const x = d.w;
  const pub = PUBLISHABLE_TYPES.includes(x.type);
  const usable = w.accounts.filter((a) => a.active && a.platform !== 'mail');
  const [chs, setChs] = useState<string[]>(x.channels.filter((c) => usable.some((a) => a.id === c)));
  const [when, setWhen] = useState(x.proposed_at ? riyadhStamp(x.proposed_at).replace(' ', 'T') : '');
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const left = x.status === 'IN_PRODUCTION' ? d.stages.filter((s) => !cleared(s)) : [];
  // The parts as they will stand with these accounts and this date: the same keys the database builds.
  const parts = useMemo(() => {
    const cur = d.texts[d.texts.length - 1];
    const channels = pub ? usable.filter((a) => chs.includes(a.id)) : w.accounts.filter((a) => x.channels.includes(a.id) || (a.platform === 'mail' && a.fixed && ['press', 'email'].includes(x.type)));
    const assets = d.parts.filter((p) => p.kind === 'asset').map((p) => ({ id: p.key.slice(2), name: p.label, current_version: Number(p.ver.slice(1)) }));
    const variants = PLATFORM_ORDER.map((p) => latestVariant(d, p)).filter(Boolean).map((v) => ({ platform: v!.platform as Platform, n: v!.n, body: v!.body }));
    return partsOf({ type: x.type, text: cur ? { n: cur.n } : null, variants, assets, channels, proposed_at: pub && when ? riyadhInstant(when) : null });
  }, [d, chs, when, pub, usable, w.accounts, x]);
  const pend = isWhole(x.type) ? parts : pendingParts(parts, d.approvals);
  const okp = isWhole(x.type) ? [] : parts.filter((p) => !pend.includes(p));
  const stuck = pend.filter((p) => d.flags.some((f) => f.part === p.key && f.ver === p.ver));
  const kinds = d.assets.map((a) => a.file?.kind ?? '');
  const send = () => {
    if (pub && !chs.length) return setErr('اختر حساباً واحداً على الأقل.');
    if (pub && !youtubeOk(x.type, usable.filter((a) => chs.includes(a.id)).map((a) => a.platform), kinds)) return setErr('يوتيوب يقبل الفيديو فقط. أضف فيديو من المكتبة أو أزل حساب يوتيوب.');
    if (!pend.length) return setErr('لا شيء جديداً للمراجعة: كل الأجزاء معتمدة.');
    void act('work_submit', { p_work: x.id, p_note: note, p_channels: pub ? chs : null, p_proposed: pub && when ? riyadhInstant(when) : null }, 'أُرسل العمل للمراجعة، ووصل إشعار إلى مدير الاتصال ومساعده.').then((ok) => ok && onClose());
  };
  return (
    <Modal title={d.cycles.length ? 'إعادة الإرسال للمراجعة' : 'إرسال للمراجعة'} onClose={onClose}>
      <Hint i={Send}>يصل إلى مدير الاتصال ومساعده. لا يعتمده من يرسله. يتوقف التعديل حتى القرار.</Hint>
      {left.length > 0 && <Hint warn>مراحل لم تُنهَ: {left.map((s) => s.name).join('، ')}. أرسله إن كانت المراجعة جزءاً منها.</Hint>}
      {pub ? (
        <>
          <div className="l">
            أين يُنشر؟ <small>الحساب بعينه، وقد يكون للمنصة أكثر من حساب</small>
            {usable.length ? (
              <div className="wk-pick">
                {usable.map((a) => (
                  <label key={a.id}>
                    <input type="checkbox" checked={chs.includes(a.id)} onChange={(e) => setChs(e.target.checked ? [...chs, a.id] : chs.filter((c) => c !== a.id))} />
                    {platformLabels[a.platform]} · {a.label} <small className="ltr">{a.handle}</small>
                    {a.platform === 'youtube' && <small> فيديو فقط</small>}
                  </label>
                ))}
              </div>
            ) : (
              <Hint warn>لا توجد حسابات مرتبطة بعد. يضيفها مدير الاتصال أو مساعده من «الحسابات المرتبطة» حين تُبنى، وحتى ذلك لا يُرسل هذا النوع للمراجعة.</Hint>
            )}
          </div>
          <label className="l">
            موعد النشر المقترح <small>اختياري، بتوقيت الرياض. إن اعتُمد صار ملزماً للجدولة</small>
            <input className="wk-inp" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
          </label>
        </>
      ) : ['press', 'email'].includes(x.type) ? (
        <Hint i={Mail}>بعد الاعتماد يُرسل من صندوق القسم المشترك.</Hint>
      ) : null}
      {!parts.length ? (
        <p className="wk-err">لا يوجد ما يُراجع بعد: اكتب النص أو أضف وسائط من المكتبة.</p>
      ) : (
        <>
          <div className="l">
            ما سيُراجع
            <div className="wk-parts">
              {isWhole(x.type) ? <span>الحزمة كاملة ({pend.length} أجزاء)</span> : pend.map((p) => <span key={p.key}>{p.label}</span>)}
              {!pend.length && <small>لا جزء تغيّر</small>}
            </div>
          </div>
          {okp.length > 0 && (
            <div className="l">
              معتمد ولن يُراجع مرة أخرى
              <div className="wk-parts">
                {okp.map((p) => (
                  <span className="ok" key={p.key}>
                    {p.label}
                  </span>
                ))}
              </div>
            </div>
          )}
          {stuck.length > 0 && <Hint warn>طُلب تعديل هذه ولم تتغيّر: {stuck.map((p) => p.label).join('، ')}.</Hint>}
        </>
      )}
      <label className="l">
        رسالة للمراجع <small>اختيارية</small>
        <textarea className="wk-inp" value={note} maxLength={1000} placeholder="ما الذي تغيّر أو ما يحتاج انتباهاً" onChange={(e) => setNote(e.target.value)} />
      </label>
      {err && <p className="wk-err">{err}</p>}
      <div className="wk-row-acts">
        <button type="button" className="wk-btn quiet" onClick={onClose}>
          تراجع
        </button>
        <button type="button" className="wk-btn primary" disabled={!parts.length} onClick={send}>
          <Ic i={Send} />
          إرسال للمراجعة
        </button>
      </div>
    </Modal>
  );
}

export function TextDialog({ d, target, onClose, act }: { d: WorkDetail; target: 'main' | Platform; onClose: () => void; act: Act }) {
  const w = useWork();
  const x = d.w;
  const isV = target !== 'main';
  const cur = d.texts[d.texts.length - 1];
  const v = isV ? latestVariant(d, target) : null;
  const label = isV ? `نسخة ${platformLabels[target as Platform]}` : textLabels[x.type];
  const [body, setBody] = useState(isV ? (v?.body ?? '') : (cur?.body ?? ''));
  const [note, setNote] = useState('');
  const after = ['APPROVED', 'SCHEDULED'].includes(x.status);
  const hasVariants = d.variants.some((y) => y.body.trim());
  return (
    <Modal title={`${(isV ? v?.body.trim() : cur) ? 'تعديل' : 'كتابة'} ${label}`} onClose={onClose}>
      {after && (
        <Hint warn>
          {isWhole(x.type) ? 'العمل معتمد. حفظ التعديل يعيد الحزمة كاملة إلى المراجعة.' : `العمل معتمد. حفظ التعديل يعيد «${label}» وحده إلى المراجعة، والأجزاء الأخرى تبقى معتمدة.`}
          {x.status === 'SCHEDULED' ? ' الجدولة تُعلَّق حتى الاعتماد، ثم تعود إلى موعدها.' : ''}
        </Hint>
      )}
      {!isV && cur && x.assignee && x.assignee !== w.me && (
        <Hint i={Pencil}>
          تعدّل نص {w.nameOf(x.assignee)}. يُحفظ إصداراً جديداً يقول «عدّله {w.nameOf(w.me)}»، ويبقى {w.nameOf(x.assignee)} كاتب العمل.
        </Hint>
      )}
      <label className="l">
        {label}
        {target === 'x' && <small>الحد المقترح 240 حرفاً · {body.length}</small>}
        <textarea className="wk-inp" rows={7} value={body} maxLength={isV ? 4000 : 8000} onChange={(e) => setBody(e.target.value)} />
      </label>
      {!isV && (
        <label className="l">
          ما الذي تغيّر؟ <small>اختياري، يظهر في الإصدارات</small>
          <input className="wk-inp" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} />
        </label>
      )}
      {!isV && hasVariants && cur && <Hint warn>نسخ المنصات المكتوبة ستُعلَّم «تحتاج مراجعة» حتى تُعاد صياغتها أو تُؤكَّد.</Hint>}
      <div className="wk-row-acts">
        <button type="button" className="wk-btn quiet" onClick={onClose}>
          تراجع
        </button>
        <button
          type="button"
          className="wk-btn primary"
          disabled={!body.trim() && !isV}
          onClick={() =>
            void act('work_text_save', { p_work: x.id, p_target: target, p_body: body, p_note: note }, after ? `حُفظ إصدار جديد، وعاد «${label}» إلى المراجعة.` : 'حُفظ إصدار جديد.').then((ok) => ok && onClose())
          }
        >
          {cur || isV ? 'حفظ إصدار جديد' : 'حفظ النص'}
        </button>
      </div>
    </Modal>
  );
}

export function DetailsDialog({ d, onClose, act }: { d: WorkDetail; onClose: () => void; act: Act }) {
  const w = useWork();
  const x = d.w;
  const lead = isLead(w.role);
  const [title, setTitle] = useState(x.title);
  const [brief, setBrief] = useState(x.brief ?? '');
  const [requester, setRequester] = useState(x.requester ?? '');
  const [due, setDue] = useState(x.due);
  const [prio, setPrio] = useState<Priority>(x.priority);
  const [projects, setProjects] = useState<string[]>(d.projects);
  const [dues, setDues] = useState<Record<string, string>>(Object.fromEntries(d.stages.map((s) => [s.id, s.due_on ?? ''])));
  const save = () => {
    const p: Record<string, unknown> = { title, brief, requester, due, priority: prio, projects };
    if (lead) p.stage_dues = Object.fromEntries(d.stages.filter((s) => !s.done_at && (s.due_on ?? '') !== dues[s.id]).map((s) => [s.id, dues[s.id]]));
    void act('work_update', { p_work: x.id, p }, 'حُفظت التفاصيل.').then((ok) => ok && onClose());
  };
  return (
    <Modal title={isRequest(x) && !lead ? 'تعديل الطلب' : 'التفاصيل والمواعيد'} onClose={onClose}>
      <label className="l">
        العنوان
        <input className="wk-inp" value={title} maxLength={140} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label className="l">
        الوصف
        <textarea className="wk-inp" value={brief} maxLength={4000} onChange={(e) => setBrief(e.target.value)} />
      </label>
      <label className="l">
        الجهة الطالبة <small>اختياري</small>
        <input className="wk-inp" value={requester} maxLength={120} onChange={(e) => setRequester(e.target.value)} />
      </label>
      {w.projects.length > 0 && (
        <div className="l">
          المشاريع
          <div className="wk-pick">
            {w.projects.map((p) => (
              <label key={p.id}>
                <input type="checkbox" checked={projects.includes(p.id)} onChange={(e) => setProjects(e.target.checked ? [...projects, p.id] : projects.filter((y) => y !== p.id))} />
                {p.name}
              </label>
            ))}
          </div>
        </div>
      )}
      <div className="wk-two">
        <label className="l">
          التسليم النهائي
          <input className="wk-inp" type="date" value={due} min={w.today} onChange={(e) => setDue(e.target.value)} />
        </label>
        <label className="l">
          الأولوية
          <select className="wk-inp" value={prio} onChange={(e) => setPrio(e.target.value as Priority)}>
            {(Object.keys(priorityLabels) as Priority[]).map((k) => (
              <option key={k} value={k}>
                {priorityLabels[k]}
              </option>
            ))}
          </select>
        </label>
      </div>
      {lead && d.stages.length > 0 && (
        <div className="l">
          مواعيد المراحل
          <div className="wk-sdates">
            {d.stages.map((s, i) => (
              <div className="r" key={s.id}>
                <i>{i + 1}</i>
                <span>
                  {s.name}
                  {s.done_at ? ' · منتهية' : ''}
                </span>
                <input className="wk-inp" type="date" value={dues[s.id]} disabled={!!s.done_at} aria-label={`موعد ${s.name}`} onChange={(e) => setDues({ ...dues, [s.id]: e.target.value })} />
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="wk-row-acts">
        <button type="button" className="wk-btn quiet" onClick={onClose}>
          تراجع
        </button>
        <button type="button" className="wk-btn primary" onClick={save}>
          حفظ
        </button>
      </div>
    </Modal>
  );
}

type Impact = { shifts: { stage: string; name: string; who: string | null; from: [string | null, string | null]; to: [string | null, string | null] }[]; max_end: string; over_due: boolean; over_pub: boolean; pub_day: string | null };
export function ExtensionDialog({ d, stage, onClose, act }: { d: WorkDetail; stage: StageRow; onClose: () => void; act: Act }) {
  const w = useWork();
  const cur = stage.due_on ?? d.w.due;
  const [to, setTo] = useState(dayAdd(cur, 2));
  const [reason, setReason] = useState('');
  const [err, setErr] = useState('');
  const [impact, setImpact] = useState<Impact | null>(null);
  const check = async (date: string) => {
    setTo(date);
    setImpact(null);
    if (!date || date <= cur) return;
    const r = await w.call<Impact>('work_step_impact', { p_stage: stage.id, p_to: date });
    if (r.ok) setImpact(r.data);
  };
  // The impact of the suggested date, once, when the dialog opens.
  useEffect(() => {
    void check(to);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const send = () => {
    if (!to || to <= cur) return setErr(`اختر موعداً بعد الموعد الحالي ${fdate(cur)}.`);
    if (!reason.trim()) return setErr('اكتب السبب.');
    void act('request_extension', { p_stage: stage.id, p_task: null, p_to: riyadhInstant(`${to}T12:00`), p_reason: reason }, 'أُرسل طلب التمديد إلى مدير الاتصال ومساعده ومسؤول العمل.').then((ok) => ok && onClose());
  };
  return (
    <Modal title="طلب تمديد" onClose={onClose}>
      <Hint i={Clock}>
        «{stage.name}» في «{d.w.title}». الموعد الحالي {fdate(cur)}. يصل الطلب إلى مدير الاتصال ومساعده ومسؤول العمل، ويُعتمد بنقرة.
      </Hint>
      <label className="l">
        الموعد الجديد
        <input className="wk-inp" type="date" min={dayAdd(cur, 1)} value={to} onChange={(e) => void check(e.target.value)} />
      </label>
      {impact &&
        (impact.shifts.length ? (
          <div className="l">
            ما يتحرك معه
            <div className="wk-chanlist">
              {impact.shifts.map((s) => (
                <div className="wk-chanrow" key={s.stage}>
                  <span>
                    <b>{s.name}</b>
                    <small>{w.nameOf(s.who)}</small>
                  </span>
                  <span className="late">
                    {s.from[1] ? sdate(s.from[1]) : ''} ← {s.to[1] ? sdate(s.to[1]) : ''}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <Hint i={Check}>لا يتحرك شيء بعدها: ما بعدها يبدأ بعد الموعد الجديد أصلاً.</Hint>
        ))}
      {impact?.over_due && <Hint warn>ينتهي آخر ما يتحرك {fdate(impact.max_end)}، بعد التسليم النهائي {fdate(d.w.due)}. يختار المعتمد مدّ التسليم أيضاً أو لا.</Hint>}
      {impact?.over_pub && impact.pub_day && <Hint warn>يتجاوز موعد النشر {fdate(impact.pub_day)}. نقل موعد النشر طلب مستقل يُعتمد في «الموافقات والنشر».</Hint>}
      <label className="l">
        السبب <small>مطلوب</small>
        <textarea className="wk-inp" value={reason} maxLength={500} placeholder="مثلاً: تأخر وصول المواد من الإدارة الأخرى" onChange={(e) => setReason(e.target.value)} />
      </label>
      {err && <p className="wk-err">{err}</p>}
      <div className="wk-row-acts">
        <button type="button" className="wk-btn quiet" onClick={onClose}>
          تراجع
        </button>
        <button type="button" className="wk-btn primary" onClick={send}>
          <Ic i={Send} />
          إرسال الطلب
        </button>
      </div>
    </Modal>
  );
}


'use client';
// «الطلبات» on real data, after «النموذج المرجعي للمركز» version 5 (inboxItems, renderRequests,
// reqCard, decideRequest, requestImpact, rqnoModal, reqAccModal): everything waiting for a
// decision in one place. Extension requests show what moves after them before anyone decides,
// and the approver chooses whether to extend the final due date too; folder access; publish
// date moves; work requests without an owner, to assign; and, as links to where they are
// decided, outside mail held for approval and ask-first publish confirmations. Delegation
// while away waits for the approval-rights work (owner decision of 2026-10-12).
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { BriefcaseBusiness, Check, Clock, Inbox, Lock, Mail, Plus, Send, Upload, Users, X } from 'lucide-react';
import { canCreateWork, fdate, isLead, riyadhStamp, sdate, type StageRow } from '@/lib/work/rules';
import {
  INBOX_TABS,
  INBOX_TYPE,
  STATUS_WORD,
  canCancelMove,
  inTabInbox,
  inboxItems,
  moveOnlyDate,
  type InboxItem,
  type InboxTab,
  type RequestRow,
  type TaskItem,
  whenText,
} from '@/lib/work/planning';
import { usePlanData, useRequestData, useWork, useWorkList } from './data';
import { TaskExtensionDialog, type Act } from './day-dialogs';
import { AssignDialog, ExtensionDialog } from './item';
import { Empty, Hint, Ic, Modal } from './parts';

type Dialog =
  | { t: 'new' }
  | { t: 'no'; q: RequestRow }
  | { t: 'assign'; id: string }
  | { t: 'stageExt'; workId: string; stage: StageRow }
  | { t: 'taskExt'; task: TaskItem }
  | { t: 'access'; folder: { id: string; name: string } };

const when = (iso: string) => {
  const s = riyadhStamp(iso);
  return `${sdate(s)} ${s.slice(11)}`;
};

export function RequestsPage() {
  const w = useWork();
  const list = useWorkList();
  const plan = usePlanData();
  const rq = useRequestData();
  const tab0 = useSearchParams().get('tab');
  const [tab, setTab] = useState<InboxTab>(INBOX_TABS.some((t) => t[0] === tab0) ? (tab0 as InboxTab) : 'mine');
  const [dlg, setDlg] = useState<Dialog | null>(null);
  const act: Act = async (fn, args, ok) => {
    const r = await w.call(fn, args);
    if (!r.ok) {
      w.say(r.error);
      return false;
    }
    w.say(ok);
    await Promise.all([list.reload(), plan.reload(), rq.reload(), w.reloadBase()]);
    return true;
  };
  const all = inboxItems({ requests: rq.requests, works: list.items, held: rq.held, me: w.me, role: w.role });
  const count = (t: InboxTab) => (t === 'mine' ? all.filter((x) => inTabInbox(x, 'mine')).length : t === 'sent' ? all.filter((x) => x.sent && x.status === 'pending').length : 0);
  const pick = all.filter((x) => inTabInbox(x, tab));
  const loading = [list.status, plan.status, rq.status, w.status].includes('loading');
  const failed = [list.status, rq.status, w.status].includes('error');
  return (
    <div className="wk">
      <div className="wk-head">
        <div>
          <h1>الطلبات</h1>
          <p>كل ما ينتظر قراراً في مكان واحد: التمديد، والوصول إلى المجلدات، ونقل مواعيد النشر، وطلبات العمل، والبريد الخارجي المحتجز، وتأكيد النشر. طلب التمديد يعرض قبل القرار ما يتحرك بعده.</p>
        </div>
        <div className="wk-acts">
          <button type="button" className="wk-btn gold" onClick={() => setDlg({ t: 'new' })}>
            <Ic i={Plus} />
            طلب جديد
          </button>
        </div>
      </div>
      <div className="wk-tabs-row">
        <div className="wk-seg" role="group" aria-label="الطلبات" data-gd="rqtabs">
          {INBOX_TABS.map(([k, label]) => (
            <button type="button" key={k} aria-pressed={tab === k} onClick={() => setTab(k)}>
              {label}
              {count(k) > 0 && <span className="n">{count(k)}</span>}
            </button>
          ))}
        </div>
      </div>
      {tab === 'deleg' ? (
        <section className="wk-pn" data-gd="deleg">
          <h3>
            تفويض الاعتماد أثناء الغياب <small>يأتي لاحقاً</small>
          </h3>
          <p className="wk-col-hint">
            في النموذج المرجعي يفوّض مدير الاتصال من يعتمد نيابة عنه حتى يوم محدد، ويظهر «نيابة عن» في كل قرار. لم يُبنَ بعد بقرار المالك (12 أكتوبر 2026): ينتظر العمل المستقل على منح حق الاعتماد لأشخاص آخرين. حتى ذلك يعتمد مدير الاتصال ومساعده، والعاجل كذلك.
          </p>
        </section>
      ) : loading ? (
        <div className="wk-loading" role="status">
          جارٍ تحميل الطلبات…
        </div>
      ) : failed ? (
        <Empty i={Inbox} title="تعذّر تحميل الطلبات">
          أعد تحميل الصفحة.
        </Empty>
      ) : !pick.length ? (
        <Empty i={Inbox} title={tab === 'mine' ? 'لا شيء ينتظر قرارك' : tab === 'sent' ? 'لم ترسل طلبات' : 'لا طلبات منتهية'}>
          {tab === 'sent' ? 'طلبات التمديد والوصول ونقل المواعيد وطلبات العمل التي ترسلها تظهر هنا بحالتها.' : ''}
        </Empty>
      ) : (
        <div className="wk-qcards">
          {pick.map((x) => (
            <Card key={x.key} x={x} pendingKeys={x.w ? list.items.find((i) => i.w.id === x.w!.id)?.pendingKeys : undefined} act={act} open={setDlg} />
          ))}
        </div>
      )}

      {dlg?.t === 'new' && <NewRequestDialog onClose={() => setDlg(null)} items={list.items} tasks={plan.tasks} locked={rq.locked} pending={rq.requests} open={setDlg} />}
      {dlg?.t === 'no' && <DeclineDialog q={dlg.q} onClose={() => setDlg(null)} act={act} />}
      {dlg?.t === 'assign' && list.items.find((i) => i.w.id === dlg.id) && <AssignDialog d={{ w: list.items.find((i) => i.w.id === dlg.id)!.w }} onClose={() => setDlg(null)} act={act} />}
      {dlg?.t === 'stageExt' && list.items.find((i) => i.w.id === dlg.workId) && <ExtensionDialog d={{ w: list.items.find((i) => i.w.id === dlg.workId)!.w }} stage={dlg.stage} onClose={() => setDlg(null)} act={act} />}
      {dlg?.t === 'taskExt' && <TaskExtensionDialog t={dlg.task} onClose={() => setDlg(null)} act={act} />}
      {dlg?.t === 'access' && <AccessDialog folder={dlg.folder} onClose={() => setDlg(null)} act={act} />}
    </div>
  );
}

type Impact = { shifts: { name?: string; what?: string; who: string | null; from: [string | null, string | null]; to: [string | null, string | null] }[]; max_end: string; over_due: boolean; over_pub: boolean; pub_day: string | null };

/** What moves if an extension is approved, computed by the database before the decision. */
function useImpact(q: RequestRow | undefined): Impact | null {
  const w = useWork();
  const [im, setIm] = useState<Impact | null>(null);
  useEffect(() => {
    let live = true;
    if (!q || q.kind !== 'extension' || q.status !== 'pending' || !q.to_at) return;
    const call = q.stage_id
      ? w.call<Impact>('work_step_impact', { p_stage: q.stage_id, p_to: riyadhStamp(q.to_at).slice(0, 10) })
      : w.call<Impact>('work_task_impact', { p_task: q.task_id, p_to: q.to_at });
    void call.then((r) => live && r.ok && setIm(r.data));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q?.id, q?.status]);
  return im;
}

function Card({ x, pendingKeys, act, open }: { x: InboxItem; pendingKeys?: string[]; act: Act; open: (d: Dialog) => void }) {
  const w = useWork();
  const [label, cls] = INBOX_TYPE[x.type];
  const q = x.q;
  const im = useImpact(q);
  const [extend, setExtend] = useState(true);
  const stamp = (d: string | null) => (!d ? '' : d.length > 10 ? sdate(riyadhStamp(d)) : sdate(d));
  const only = x.w ? moveOnlyDate(x.w, pendingKeys) : false;
  return (
    <article className={`wk-qcard ${x.w?.priority === 'urgent' ? 'urgent' : ''}`}>
      <div className="qt">
        <span className="wk-parts">
          <span className={`wk-chip ${cls}`}>{label}</span>
          {x.status !== 'pending' && <span className={`wk-chip ${STATUS_WORD[x.status][1]}`}>{STATUS_WORD[x.status][0]}</span>}
          {x.sent && x.status === 'pending' && <span className="wk-chip plain">أرسلته أنت</span>}
        </span>
        <b>{x.title}</b>
        <span className="meta">
          <span>من {x.by ? w.nameOf(x.by) : 'المركز'}</span>
          {x.at && <span>{when(x.at)}</span>}
        </span>
        {q && (
          <span className="meta">
            <span className="wk-why">{q.reason}</span>
          </span>
        )}
        {q?.kind === 'extension' && q.status === 'pending' && im && (
          <span className="meta">
            {im.shifts.length ? (
              <span className="wk-partl">
                يتحرك معه:
                {im.shifts.map((s, i) => (
                  <span className="wk-part chg" key={i}>
                    {s.name ?? s.what} · {w.nameOf(s.who)} {stamp(s.from[1])} ← {stamp(s.to[1])}
                  </span>
                ))}
              </span>
            ) : (
              <span className="wk-why">لا يتحرك شيء بعده.</span>
            )}
            {im.over_due && q.work_due && (
              <span className="late">
                يتجاوز التسليم النهائي {fdate(q.work_due)} إلى {fdate(im.max_end)}
              </span>
            )}
            {im.over_pub && im.pub_day && <span className="late">يتجاوز موعد النشر {fdate(im.pub_day)}، ونقله طلب مستقل</span>}
          </span>
        )}
        {q && q.status !== 'pending' && (
          <span className="meta">
            <span className="wk-why">
              {STATUS_WORD[q.status][0]}
              {q.decided_by && q.status !== 'withdrawn' ? ` من ${w.nameOf(q.decided_by)}` : ''} {q.decided_at ? when(q.decided_at) : ''}
              {q.decision_note ? ` · «${q.decision_note}»` : ''}
              {q.status === 'approved' && q.extend_work ? ' · ومُدّ التسليم النهائي' : ''}
            </span>
          </span>
        )}
        {x.src === 'move' && !only && <span className="wk-why">يُراجع مع أجزاء أخرى تغيّرت: القرار في شاشة المراجعة.</span>}
        {x.src === 'req' && q?.kind === 'extension' && q.status === 'pending' && !q.can_decide && !x.sent && (
          <span className="wk-why">القرار لمدير الاتصال ومساعده{q.stage_id ? ' ومسؤول العمل' : ' ومن أسند المهمة'}.</span>
        )}
      </div>
      <div className="acts">
        {q && x.mine && q.kind === 'extension' && (
          <>
            {im?.over_due && q.stage_id && (
              <label className="wk-sw">
                <input type="checkbox" checked={extend} onChange={(e) => setExtend(e.target.checked)} />
                مدّ التسليم النهائي أيضاً
              </label>
            )}
            <button
              type="button"
              className="wk-btn gold"
              onClick={() =>
                void act('request_decide', { p_id: q.id, p_approve: true, p_note: null, p_extend_work: !!(im?.over_due && extend) }, `اعتُمد التمديد${im?.shifts.length ? ` وتحرّك ${im.shifts.length} بعده، وأُبلغ أصحابها` : ''}. حُدّث التقويم.`)
              }
            >
              <Ic i={Check} />
              اعتماد
            </button>
            <button type="button" className="wk-btn" onClick={() => open({ t: 'no', q })}>
              رفض
            </button>
          </>
        )}
        {q && x.mine && q.kind === 'access' && (
          <>
            <button type="button" className="wk-btn gold" onClick={() => void act('request_decide', { p_id: q.id, p_approve: true, p_note: null, p_extend_work: false }, `مُنح ${w.nameOf(q.requested_by)} «عرض فقط» على المجلد، ووصله إشعار.`)}>
              <Ic i={Check} />
              منح «عرض فقط»
            </button>
            <button type="button" className="wk-btn" onClick={() => open({ t: 'no', q })}>
              رفض
            </button>
          </>
        )}
        {q && x.sent && q.status === 'pending' && (
          <button type="button" className="wk-btn quiet" onClick={() => void act('request_withdraw', { p_id: q.id }, 'سُحب الطلب.')}>
            <Ic i={X} />
            سحب الطلب
          </button>
        )}
        {q?.work_id && (
          <Link className="wk-btn quiet" href={`/work/${q.work_id}`}>
            فتح العمل
          </Link>
        )}
        {x.src === 'move' && x.w && (
          <>
            {x.mine && (
              <button type="button" className="wk-btn gold" onClick={() => void act('work_decide', { p_work: x.w!.id, p_op: 'approve', p_parts: ['date'], p_note: null, p_close: false }, 'اعتُمد الموعد الجديد.')}>
                <Ic i={Check} />
                اعتماد الموعد الجديد
              </button>
            )}
            {canCancelMove(x.w, pendingKeys, w.me, w.role) && (
              <button type="button" className="wk-btn" onClick={() => void act('work_cancel_move', { p_work: x.w!.id }, `سُحب طلب النقل. يبقى الموعد ${x.w!.move_from ? whenText(x.w!.move_from) : ''}.`)}>
                سحب الطلب
              </button>
            )}
            <Link className="wk-btn quiet" href={`/approvals/${x.w.id}`}>
              التفاصيل
            </Link>
          </>
        )}
        {x.src === 'work' && x.w && (
          <>
            {isLead(w.role) && (
              <button type="button" className="wk-btn gold" onClick={() => open({ t: 'assign', id: x.w!.id })}>
                <Ic i={Users} />
                إسناد
              </button>
            )}
            <Link className="wk-btn quiet" href={`/work/${x.w.id}`}>
              فتح
            </Link>
          </>
        )}
        {x.src === 'confirm' && x.w && (
          <Link className={`wk-btn ${x.mine ? 'gold' : ''}`} href="/approvals?tab=publish">
            <Ic i={Upload} />
            {x.mine ? 'التأكيد في «النشر»' : 'عرض في «النشر»'}
          </Link>
        )}
        {x.src === 'mail' && x.m && (
          <Link className={`wk-btn ${x.mine ? 'gold' : ''}`} href={`/mail?thread=${x.m.thread_id}`}>
            <Ic i={Mail} />
            افتح في البريد
          </Link>
        )}
      </div>
    </article>
  );
}

function DeclineDialog({ q, onClose, act }: { q: RequestRow; onClose: () => void; act: Act }) {
  const w = useWork();
  const [note, setNote] = useState('');
  return (
    <Modal title="رفض الطلب" onClose={onClose}>
      <Hint i={X}>
        {q.kind === 'access' ? `طلب وصول إلى «${q.folder_name ?? 'مجلد'}»` : `طلب تمديد «${q.stage_name ?? q.task_what ?? ''}»`} من {w.nameOf(q.requested_by)}. يصله إشعار بالقرار وسببه.
      </Hint>
      <label className="l">
        السبب <small>اختياري</small>
        <textarea className="wk-inp" value={note} maxLength={500} placeholder="مثلاً: الموعد لا يحتمل، اطلب مساعدة بدلاً من التمديد" onChange={(e) => setNote(e.target.value)} />
      </label>
      <div className="wk-row-acts">
        <button type="button" className="wk-btn quiet" onClick={onClose}>
          تراجع
        </button>
        <button type="button" className="wk-btn danger" onClick={() => void act('request_decide', { p_id: q.id, p_approve: false, p_note: note, p_extend_work: false }, `رُفض الطلب، وأُبلغ ${w.nameOf(q.requested_by)}.`).then((ok) => ok && onClose())}>
          رفض
        </button>
      </div>
    </Modal>
  );
}

function AccessDialog({ folder, onClose, act }: { folder: { id: string; name: string }; onClose: () => void; act: Act }) {
  const [reason, setReason] = useState('');
  const [err, setErr] = useState('');
  return (
    <Modal title={`طلب وصول إلى «${folder.name}»`} onClose={onClose}>
      <Hint i={Lock}>يصل الطلب إلى مدير الاتصال ومساعده. عند اعتماده تحصل على «عرض فقط».</Hint>
      <label className="l">
        لماذا تحتاجه؟ <small>مطلوب</small>
        <textarea className="wk-inp" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
      </label>
      {err && <p className="wk-err">{err}</p>}
      <div className="wk-row-acts">
        <button type="button" className="wk-btn quiet" onClick={onClose}>
          تراجع
        </button>
        <button
          type="button"
          className="wk-btn primary"
          onClick={() => {
            if (!reason.trim()) return setErr('اكتب السبب.');
            void act('request_folder_access', { p_folder: folder.id, p_reason: reason }, 'أُرسل طلب الوصول.').then((ok) => ok && onClose());
          }}
        >
          <Ic i={Send} />
          إرسال الطلب
        </button>
      </div>
    </Modal>
  );
}

/** A new request: an extension of one of my stages or tasks, access to a folder, or a new work. */
function NewRequestDialog({
  items,
  tasks,
  locked,
  pending,
  open,
  onClose,
}: {
  items: { w: import('@/lib/work/rules').WorkRow; stages: StageRow[] }[];
  tasks: TaskItem[];
  locked: { id: string; name: string }[];
  pending: RequestRow[];
  open: (d: Dialog) => void;
  onClose: () => void;
}) {
  const w = useWork();
  const mySteps = items.flatMap((x) => (x.w.closed_at ? [] : x.stages.filter((s) => s.who === w.me && !s.done_at).map((s) => ({ x, s }))));
  const myTasks = tasks.filter((t) => t.assignee === w.me && t.status !== 'done');
  const asked = (id: string) => pending.some((q) => q.status === 'pending' && q.requested_by === w.me && (q.stage_id === id || q.task_id === id || q.folder_id === id));
  return (
    <Modal title="طلب جديد" onClose={onClose}>
      <div className="l">
        تمديد مهلة
        {mySteps.length || myTasks.length ? (
          <div className="wk-pick-list">
            {mySteps.map(({ x, s }) => (
              <button type="button" key={s.id} onClick={() => open({ t: 'stageExt', workId: x.w.id, stage: s })}>
                <Ic i={Clock} />
                <span className="grow">
                  «{s.name}» في «{x.w.title}» · {fdate(s.due_on ?? x.w.due)}
                  {asked(s.id) && <small> · لك طلب بانتظار القرار</small>}
                </span>
              </button>
            ))}
            {myTasks.map((t) => (
              <button type="button" key={t.id} onClick={() => open({ t: 'taskExt', task: t })}>
                <Ic i={Clock} />
                <span className="grow">
                  مهمة «{t.what}» · {fdate(riyadhStamp(t.due).slice(0, 10))}
                  {asked(t.id) && <small> · لك طلب بانتظار القرار</small>}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <small>لا مراحل أو مهام مفتوحة لك.</small>
        )}
      </div>
      <div className="l">
        وصول إلى مجلد مقيّد <small>المجلدات التي تظهر لك في المكتبة ولا تصل إليها</small>
        {locked.length ? (
          <div className="wk-pick-list">
            {locked.map((f) => (
              <button type="button" key={f.id} disabled={asked(f.id)} onClick={() => open({ t: 'access', folder: f })}>
                <Ic i={Lock} />
                <span className="grow">
                  {f.name}
                  {asked(f.id) && <small> · طلبته من قبل</small>}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <small>لا مجلدات مقيّدة ظاهرة لك.</small>
        )}
      </div>
      {canCreateWork(w.role) && (
        <div className="l">
          عمل جديد
          <div className="wk-pick-list">
            <Link className="wk-pickrow" href="/create">
              <Ic i={BriefcaseBusiness} />
              <span className="grow">{w.role === 'member' ? 'طلب عمل من القسم' : 'إنشاء عمل'}</span>
            </Link>
          </div>
        </div>
      )}
    </Modal>
  );
}

'use client';
// «الموافقات والنشر» on real data, after «النموذج المرجعي للمركز» version 5. Approvals: what
// waits for this person's decision (urgent first, then oldest), what they sent, and the
// decision log, which nobody edits. Publishing: accounts and their authorisation, at-risk
// dates, ready, scheduled, partial or failed with a retry of the failed accounts only, and
// published. Approval is a decision on an exact version; publishing is a separate step for
// the publisher, and it is a simulation.
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import {
  CalendarDays,
  Check,
  CheckCheck,
  Clock,
  Eye,
  History,
  Link as LinkIcon,
  Lock,
  RefreshCw,
  Shield,
  TriangleAlert,
  Upload,
  Users,
  X,
} from 'lucide-react';
import { HOLD } from '@/lib/kit/hold-reasons';
import {
  accountName,
  accountState,
  atRisk,
  authOk,
  decideBlock,
  dueNote,
  fdate,
  isLead,
  isWhole,
  canPublish,
  riyadhStamp,
  typeLabels,
  type WorkRow,
} from '@/lib/work/rules';
import { queueOrder, reviewQueue } from '@/lib/work/queue';
import { useDecisions, useWork, useWorkList, type ListItem } from './data';
import { Av, Empty, Hint, Ic, PrioChip, StatusChip, Wid } from './parts';
import { PublishNowDialog, ScheduleDialog, isMailWork, publishOp } from './publish';

const DEC: Record<string, [string, string]> = { approve: ['اعتماد', 'approved'], changes: ['طلب تعديل', 'warn'], reject: ['رفض', 'danger'], withdraw: ['سحب الطلب', ''] };

export function ApprovalsPage() {
  const w = useWork();
  const params = useSearchParams();
  const [tab, setTab] = useState<'approvals' | 'publish'>(params.get('tab') === 'publish' || (canPublish(w.role) && !isLead(w.role)) ? 'publish' : 'approvals');
  const { items, status, reload } = useWorkList();
  const dec = useDecisions();
  const open = items.filter((x) => !x.w.closed_at);
  const nA = open.filter((x) => x.w.status === 'IN_REVIEW').length;
  const nP = open.filter((x) => ['APPROVED', 'SCHEDULED', 'PARTIAL', 'FAILED'].includes(x.w.status)).length;
  const act = async (fn: string, args: Record<string, unknown>, ok: string) => {
    const r = await w.call(fn, args);
    if (!r.ok) {
      w.say(r.error);
      return false;
    }
    w.say(ok);
    await Promise.all([reload(), dec.reload(), w.reloadBase()]);
    return true;
  };
  return (
    <div className="wk">
      <div className="wk-head">
        <div>
          <h1>الموافقات والنشر</h1>
          <p>الموافقة قرار على إصدار بعينه، والنشر خطوة منفصلة بعدها يتولاها مسؤول النشر.</p>
        </div>
        <div className="wk-acts">
          <span className="wk-today">
            <Ic i={CalendarDays} />
            اليوم: {fdate(w.today)}
          </span>
        </div>
      </div>
      <div className="wk-tabs-row">
        <div className="wk-seg" role="group" aria-label="القسم" data-gd="atabs">
          <button type="button" aria-pressed={tab === 'approvals'} onClick={() => setTab('approvals')}>
            الموافقات <span className="n">{nA}</span>
          </button>
          <button type="button" aria-pressed={tab === 'publish'} onClick={() => setTab('publish')}>
            النشر <span className="n">{nP}</span>
          </button>
        </div>
      </div>
      {status === 'loading' || w.status === 'loading' ? (
        <div className="wk-loading" role="status">
          جارٍ التحميل…
        </div>
      ) : status === 'error' ? (
        <Empty i={TriangleAlert} title="تعذّر التحميل">
          أعد تحميل الصفحة.
        </Empty>
      ) : tab === 'approvals' ? (
        <ApprovalsTab items={items} dec={dec} />
      ) : (
        <PublishTab items={items} dec={dec} act={act} />
      )}
    </div>
  );
}

type Dec = ReturnType<typeof useDecisions>;
const sentBy = (dec: Dec, x: WorkRow) => dec.cycles.find((c) => c.work_id === x.id && c.n === x.review_cycle);
const lastCycle = (dec: Dec, id: string) => dec.cycles.filter((c) => c.work_id === id).sort((a, b) => b.n - a.n)[0];

function ApprovalsTab({ items, dec }: { items: ListItem[]; dec: Dec }) {
  const w = useWork();
  const router = useRouter();
  const lead = isLead(w.role);
  const [sub, setSub] = useState<'mine' | 'sent' | 'done'>('mine');
  const [proj, setProj] = useState('all');
  const [prio, setPrio] = useState('all');
  const vis = items.filter((x) => !x.w.closed_at);
  const keep = (x: ListItem) => (proj === 'all' || x.projects.includes(proj)) && (prio === 'all' || x.w.priority === prio);
  const block = (x: ListItem) => decideBlock(x.w, sentBy(dec, x.w)?.sent_by ?? null, w.me, w.role);
  const inReview = vis.filter((x) => x.w.status === 'IN_REVIEW');
  // the queue of the review screen's ] and [ (queue.ts): what waits for this person, urgent first, then the oldest sent
  const waiting = new Set(reviewQueue(vis.map((x) => x.w), dec.cycles, w.me, w.role).map((x) => x.id));
  const mine = inReview.filter((x) => waiting.has(x.w.id));
  const order = queueOrder(dec.cycles);
  const sent = vis.filter((x) => lastCycle(dec, x.w.id)?.sent_by === w.me && ['IN_REVIEW', 'CHANGES_REQUESTED', 'REJECTED', 'APPROVED'].includes(x.w.status));
  const blocked = lead ? inReview.filter((x) => block(x) && keep(x)) : [];
  const list = (sub === 'sent' ? sent : mine).filter(keep).sort((a, b) => order(a.w, b.w));
  const byId = (id: string) => items.find((x) => x.w.id === id);
  const log = dec.decisions.filter((d) => {
    const x = byId(d.work_id);
    return x && keep(x);
  });
  return (
    <>
      <div className="wk-tabs-row">
        <div className="wk-seg" role="group" aria-label="الموافقات" data-gd="aq">
          <button type="button" aria-pressed={sub === 'mine'} onClick={() => setSub('mine')}>
            {lead ? 'بانتظار قراري' : 'بانتظار القرار'} <span className="n">{mine.length}</span>
          </button>
          <button type="button" aria-pressed={sub === 'sent'} onClick={() => setSub('sent')}>
            أرسلتها أنا <span className="n">{sent.length}</span>
          </button>
          <button type="button" aria-pressed={sub === 'done'} onClick={() => setSub('done')}>
            القرارات
          </button>
        </div>
        <div className="wk-tools">
          <select className="wk-sel" value={proj} onChange={(e) => setProj(e.target.value)} aria-label="المشروع">
            <option value="all">كل المشاريع</option>
            {w.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <select className="wk-sel" value={prio} onChange={(e) => setPrio(e.target.value)} aria-label="الأولوية">
            <option value="all">كل الأولويات</option>
            <option value="urgent">عاجل</option>
            <option value="high">مرتفعة</option>
            <option value="normal">عادية</option>
          </select>
        </div>
      </div>
      {sub === 'done' ? (
        log.length ? (
          <>
            <div className="wk-lg">
              {log.map((d) => {
                const x = byId(d.work_id)!;
                const t = DEC[d.op] ?? [d.op, ''];
                return (
                  <div className="wk-lg-r" key={d.id}>
                    <time>{riyadhStamp(d.decided_at).slice(5)}</time>
                    <Av name={w.nameOf(d.decided_by)} size="sm" />
                    <span>
                      <b>{w.nameOf(d.decided_by)}</b> · <span className={`wk-chip ${t[1]}`}>{t[0]}</span> ·{' '}
                      <Link className="wk-lk" href={`/work/${x.w.id}`}>
                        {x.w.title}
                      </Link>
                      <span className="tg">
                        <Wid id={x.w.id} />
                        <span>الدورة {d.cycle}</span>
                        <span>{d.labels.join('، ')}</span>
                      </span>
                      {d.note && <span className="ba">«{d.note}»</span>}
                    </span>
                  </div>
                );
              })}
            </div>
            <p className="wk-immut">
              <Ic i={Lock} />
              سجل القرارات لا يُعدَّل ولا يُحذف
            </p>
          </>
        ) : (
          <Empty i={History} title="لا قرارات بعد" />
        )
      ) : (
        <>
          {sub === 'mine' && blocked.length > 0 && (
            <Hint i={Shield}>
              {blocked.length} في المراجعة ولا تقرر فيها: {blocked.map((x) => `${x.w.title} (${block(x).replace(/\.$/, '')})`).join('؛ ')}.
            </Hint>
          )}
          {!list.length ? (
            <Empty i={Check} title={sub === 'sent' ? 'لم ترسل شيئاً للمراجعة' : 'لا شيء ينتظر قرارك'}>
              {sub === 'sent' ? 'ما ترسله للمراجعة يظهر هنا مع حالته.' : 'ما يُرسل للمراجعة يظهر هنا، الأقدم أولاً والعاجل قبل غيره.'}
            </Empty>
          ) : (
            <div className="wk-qcards">
              {list.map((x) => {
                const c = sentBy(dec, x.w) ?? lastCycle(dec, x.w.id);
                const d = dueNote(x.w, w.today);
                const can = x.w.status === 'IN_REVIEW' && lead && !block(x);
                const n = dec.cycles.filter((y) => y.work_id === x.w.id).length;
                return (
                  <article className={`wk-qcard ${x.w.priority === 'urgent' ? 'urgent' : ''}`} key={x.w.id}>
                    <div className="qt">
                      <span className="wk-partl">
                        <Wid id={x.w.id} />
                        <span>{typeLabels[x.w.type]}</span>
                        <StatusChip status={x.w.status} />
                        <PrioChip p={x.w.priority} />
                        {n > 1 && <span className="wk-why">الدورة {n}</span>}
                      </span>
                      <b>{x.w.title}</b>
                      <span className="meta">
                        {c && (
                          <span>
                            أرسلها {w.nameOf(c.sent_by)} · <span className="ltr">{riyadhStamp(c.sent_at)}</span>
                          </span>
                        )}
                        {x.projects.length > 0 && <span>{x.projects.map((p) => w.projects.find((j) => j.id === p)?.name).join('، ')}</span>}
                        {x.w.channels.length > 0 && <span>{x.w.channels.map((id) => accountName(w.accounts.find((a) => a.id === id))).join('، ')}</span>}
                        {x.w.proposed_at && (
                          <span>
                            <Ic i={Clock} />
                            {riyadhStamp(x.w.proposed_at)}
                          </span>
                        )}
                        <span className={d.tone}>{d.text}</span>
                      </span>
                      {x.w.status === 'IN_REVIEW' && (
                        <span className="wk-partl">
                          <span className="wk-why">يحتاج القرار:</span>
                          <span className="wk-part">{isWhole(x.w.type) ? 'الحزمة كاملة' : `${x.pending ?? 0} ${(x.pending ?? 0) === 1 ? 'جزء' : 'أجزاء'}`}</span>
                        </span>
                      )}
                    </div>
                    <div className="acts">
                      {x.w.status === 'IN_REVIEW' && lead && (
                        <button type="button" className={`wk-btn ${can ? 'gold' : ''}`} onClick={() => router.push(`/approvals/${x.w.id}`)}>
                          <Ic i={Eye} />
                          {can ? 'مراجعة' : 'عرض'}
                        </button>
                      )}
                      <Link className="wk-btn quiet" href={`/work/${x.w.id}`}>
                        فتح العمل
                      </Link>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}
    </>
  );
}

type Act = (fn: string, args: Record<string, unknown>, ok: string) => Promise<boolean>;
function PublishTab({ items, dec, act }: { items: ListItem[]; dec: Dec; act: Act }) {
  const w = useWork();
  const pub = canPublish(w.role);
  const [dlg, setDlg] = useState<{ t: 'schedule' | 'now'; w: WorkRow } | null>(null);
  const nowIso = useMemo(() => new Date().toISOString(), []);
  const vis = items.filter((x) => !x.w.closed_at);
  const ready = vis.filter((x) => x.w.status === 'APPROVED');
  const sched = vis
    .filter((x) => x.w.status === 'SCHEDULED' || (x.w.pending_sched && x.w.status === 'IN_REVIEW'))
    .sort((a, b) => ((a.w.sched_at ?? '') < (b.w.sched_at ?? '') ? -1 : 1));
  const done = vis.filter((x) => ['PUBLISHED', 'PUBLISHING'].includes(x.w.status));
  const bad = vis.filter((x) => ['PARTIAL', 'FAILED'].includes(x.w.status));
  const risks = sched.filter((x) => atRisk(x.w, w.accounts).length);
  const live = w.accounts.filter((a) => a.active && a.platform !== 'mail');
  const lastApprove = (id: string) => dec.decisions.find((d) => d.work_id === id && d.op === 'approve');

  const card = (x: ListItem) => {
    const y = x.w;
    const mail = isMailWork(y, w.accounts);
    const ap = lastApprove(y.id);
    return (
      <article className="wk-qcard" key={y.id}>
        <div className="qt">
          <span className="wk-partl">
            <Wid id={y.id} />
            <span>{typeLabels[y.type]}</span>
            <StatusChip status={y.status} />
          </span>
          <b>{y.title}</b>
          <span className="meta">
            {ap && (
              <span>
                <Ic i={Check} />
                اعتمده {w.nameOf(ap.decided_by)} <span className="ltr">{riyadhStamp(ap.decided_at).slice(5)}</span>
              </span>
            )}
            {y.status === 'SCHEDULED' && <span className={`wk-chip ${y.pub_mode === 'ask' ? 'warn' : 'plain'}`}>{y.pub_mode === 'ask' ? 'بتأكيد قبل النشر' : 'نشر تلقائي'}</span>}
            {y.confirm_pending && <span className="late">حلّ الموعد: ينتظر تأكيد مسؤول النشر</span>}
            {y.status === 'SCHEDULED' && y.sched_at ? (
              <span>
                <Ic i={Clock} />
                مجدول {riyadhStamp(y.sched_at)}
              </span>
            ) : y.status === 'IN_REVIEW' ? (
              <span className="late">معلّق: ينتظر اعتماد ما تغيّر{y.sched_at ? `، والموعد ${riyadhStamp(y.sched_at)}` : ''}</span>
            ) : y.proposed_at && y.status === 'APPROVED' ? (
              <span>
                <Ic i={Clock} />
                الموعد المعتمد {riyadhStamp(y.proposed_at)}
              </span>
            ) : y.pub_at ? (
              <span>
                <Ic i={Upload} />
                {riyadhStamp(y.pub_at)}
              </span>
            ) : (
              <span>بلا موعد معتمد</span>
            )}
          </span>
          <span className="wk-chres">
            {y.channels.map((c) => {
              const a = w.accounts.find((z) => z.id === c);
              const r = y.results[c];
              const when = y.sched_at ?? y.proposed_at;
              return (
                <span key={c} className={`wk-cr ${r ? (r.ok ? 'ok' : 'bad') : when && a && !authOk(a, when) ? 'risk' : ''}`}>
                  {accountName(a)}
                  {r ? (r.ok ? ` · نُشر ${riyadhStamp(r.at).slice(5)}` : ` · ${r.why ?? 'فشل'}`) : when && a && !authOk(a, when) ? ' · التفويض ينتهي قبل الموعد' : ''}
                </span>
              );
            })}
          </span>
        </div>
        <div className="acts">
          {pub && y.status === 'APPROVED' && (
            <>
              <button type="button" className="wk-btn gold" onClick={() => setDlg({ t: 'schedule', w: y })}>
                <Ic i={CalendarDays} />
                جدولة
              </button>
              <button type="button" className="wk-btn" onClick={() => setDlg({ t: 'now', w: y })}>
                <Ic i={Upload} />
                {mail ? 'إرسال الآن' : 'نشر الآن'}
              </button>
            </>
          )}
          {pub && y.status === 'SCHEDULED' && y.confirm_pending && (
            <>
              <button type="button" className="wk-btn gold" data-hold={HOLD.publishNow} onClick={() => void publishOp(act, y, 'confirm')}>
                <Ic i={Upload} />
                انشر الآن
              </button>
              <button type="button" className="wk-btn" onClick={() => void publishOp(act, y, 'decline')}>
                <Ic i={X} />
                لا تنشر
              </button>
            </>
          )}
          {pub && y.status === 'SCHEDULED' && !y.confirm_pending && (
            <>
              <button type="button" className="wk-btn" onClick={() => setDlg({ t: 'schedule', w: y })}>
                <Ic i={CalendarDays} />
                تغيير الموعد
              </button>
              <button type="button" className="wk-btn quiet" onClick={() => void publishOp(act, y, 'unschedule')}>
                إلغاء الجدولة
              </button>
            </>
          )}
          {pub && (y.status === 'PARTIAL' || y.status === 'FAILED') && (
            <button type="button" className="wk-btn gold" onClick={() => void publishOp(act, y, 'retry')}>
              <Ic i={RefreshCw} />
              إعادة المحاولة للفاشلة
            </button>
          )}
          <Link className="wk-btn quiet" href={`/work/${y.id}`}>
            فتح العمل
          </Link>
        </div>
      </article>
    );
  };
  const sec = (title: string, list: ListItem[], icon: typeof Check, empty: string, gd: string) => (
    <section className="wk-psec" data-gd={gd}>
      <h3>
        <Ic i={icon} />
        {title} <span className="n">{list.length}</span>
      </h3>
      {list.length ? <div className="wk-qcards">{list.map(card)}</div> : <p className="wk-col-hint">{empty}</p>}
    </section>
  );
  return (
    <>
      <p className="wk-simnote">
        <Ic i={TriangleAlert} />
        <span>النشر في هذه المرحلة محاكاة: لا يصل شيء إلى أي منصة، ولا تُرسل رسالة. التفويض ونتائج الحسابات تتصرف كما ستتصرف فعلاً.</span>
      </p>
      {live.length ? (
        <div className="wk-accts">
          {live.map((a) => {
            const [label, cls] = accountState(a, nowIso);
            return (
              <div className={`wk-acct ${cls === 'danger' ? 'bad' : cls === 'warn' ? 'warn' : ''}`} key={a.id}>
                <span className="dot" />
                <b>
                  {accountName(a)} <span className="ltr wk-why">{a.handle}</span>
                </b>
                <small>
                  <span>{label}</span>
                  {pub && cls !== 'approved' && (
                    <button type="button" className="wk-btn sm" onClick={() => void act('account_reconnect', { p_id: a.id }, `أُعيد ربط ${accountName(a)} 60 يوماً (محاكاة).`)}>
                      <Ic i={RefreshCw} />
                      إعادة الربط
                    </button>
                  )}
                </small>
              </div>
            );
          })}
        </div>
      ) : (
        <Hint i={LinkIcon}>لا حسابات مرتبطة بعد. تُضاف من «حسابات المنصات».</Hint>
      )}
      {(isLead(w.role) || pub) && (
        <div>
          <Link className="wk-btn sm quiet" href="/channels">
            <Ic i={LinkIcon} />
            إدارة حسابات المنصات
          </Link>
        </div>
      )}
      {risks.length > 0 && (
        <section className="wk-psec" data-gd="risk">
          <h3>
            <Ic i={TriangleAlert} />
            مواعيد معرضة للخطر <span className="n">{risks.length}</span>
          </h3>
          <div className="wk-chanlist">
            {risks.map((x) => (
              <div className="wk-riskrow" key={x.w.id}>
                <span>
                  <b>{x.w.title}</b> · {riyadhStamp(x.w.sched_at!)}
                  <br />
                  {atRisk(x.w, w.accounts)
                    .map((a) => `تفويض ${accountName(a)} ${a.authorized_until && authOk(a, nowIso) ? `ينتهي ${riyadhStamp(a.authorized_until)} قبل الموعد` : 'منتهٍ'}`)
                    .join('، ')}
                  . أعد ربط الحساب قبل الموعد.
                </span>
                <Link className="wk-btn sm" href={`/work/${x.w.id}`}>
                  فتح العمل
                </Link>
              </div>
            ))}
          </div>
        </section>
      )}
      {!pub && <Hint i={Users}>الجدولة والنشر لمسؤول النشر. تشاهد الحالة فقط.</Hint>}
      {sec('جاهز للنشر', ready, Check, 'لا شيء معتمد ينتظر الجدولة.', 'pub-ready')}
      {sec('مجدول', sched, CalendarDays, 'لا مواعيد قادمة.', 'pub-sched')}
      {sec('نشر جزئي أو فشل', bad, TriangleAlert, 'لا إخفاقات.', 'pub-bad')}
      {sec('منشور', done, CheckCheck, 'لم يُنشر شيء بعد.', 'pub-done')}
      {dlg?.t === 'schedule' && (
        <ScheduleDialog
          w={dlg.w}
          approvedParts={[]}
          onClose={() => setDlg(null)}
          act={act}
        />
      )}
      {dlg?.t === 'now' && <PublishNowDialog w={dlg.w} onClose={() => setDlg(null)} act={act} />}
    </>
  );
}

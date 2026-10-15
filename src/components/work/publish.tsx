'use client';
// Scheduling and publishing, after «النموذج المرجعي للمركز» version 5. Publishing is a
// simulation: each account succeeds only if it is active and its authorisation covers the
// moment, and nothing reaches a platform. Only the publisher named on the accounts may act
// (work_may_publish); an approved time binds, and another time sends «موعد النشر» alone back
// for approval, then schedules itself when it is approved (work_schedule).
import { useState } from 'react';
import { CalendarDays, Check, Lock, Send, ShieldCheck, TriangleAlert, Upload } from 'lucide-react';
import { HOLD } from '@/lib/kit/hold-reasons';
import { accountName, authOk, riyadhInstant, riyadhStamp, type AccountRow, type WorkRow } from '@/lib/work/rules';
import { useWork } from './data';
import { Hint, Ic, Modal } from './parts';
import { SendChecks, blocked, useCopySource, useSendChecks } from './post-preview';

type Act = (fn: string, args: Record<string, unknown>, ok: string) => Promise<boolean>;
const channelsOf = (w: WorkRow, accounts: AccountRow[]) => w.channels.map((c) => accounts.find((a) => a.id === c)).filter((a): a is AccountRow => !!a);
export const isMailWork = (w: WorkRow, accounts: AccountRow[]) => accounts.find((a) => a.id === w.channels[0])?.platform === 'mail';

/** Accounts of this work the person does not publish on (administrators publish on all). */
function notMine(w: WorkRow, accounts: AccountRow[], me: string, admin: boolean) {
  if (admin) return [];
  return channelsOf(w, accounts).filter((a) => a.platform !== 'mail' && !a.publishers.includes(me));
}

/** at: a Riyadh 'YYYY-MM-DDTHH:MM' to start from, when scheduling from a day of the calendar. */
export function ScheduleDialog({ w, approvedParts, at: from, onClose, act }: { w: WorkRow; approvedParts: string[]; at?: string; onClose: () => void; act: Act }) {
  const x = useWork();
  const chs = channelsOf(w, x.accounts);
  const start = w.sched_at ?? w.proposed_at;
  const [when, setWhen] = useState(from ?? (start ? riyadhStamp(start).replace(' ', 'T') : ''));
  const [mode, setMode] = useState<'auto' | 'ask'>(w.pub_mode ?? (chs.some((a) => a.mode === 'ask') ? 'ask' : 'auto'));
  const [err, setErr] = useState('');
  const at = when ? riyadhInstant(when) : '';
  const moved = !!w.proposed_at && !!at && Date.parse(at) !== Date.parse(w.proposed_at);
  const bad = notMine(w, x.accounts, x.me, x.isAdmin || x.role === 'admin');
  const mail = isMailWork(w, x.accounts);
  const src = useCopySource(w.id, w.type);
  const checks = useSendChecks(src, chs);
  const stop = blocked(checks);
  const go = () => {
    if (stop) return setErr('نسخة تتجاوز حدود منصتها. عدّلها وأعدها للاعتماد قبل الجدولة.');
    if (!at) return setErr('اختر التاريخ والوقت.');
    if (Date.parse(at) < Date.now()) return setErr('الموعد مضى. اختر موعداً قادماً.');
    void act(
      'work_schedule',
      { p_work: w.id, p_when: at, p_mode: mode },
      moved ? 'أُرسل الموعد الجديد للاعتماد. يُجدول العمل وحده حين يُعتمد.' : `جُدول ${mail ? 'الإرسال' : 'النشر'} ${riyadhStamp(at)} (محاكاة).`,
    ).then((ok) => ok && onClose());
  };
  return (
    <Modal title={w.status === 'SCHEDULED' ? 'تغيير الموعد' : `جدولة ${mail ? 'الإرسال' : 'النشر'}`} onClose={onClose}>
      <Hint i={ShieldCheck}>يُنشر ما اعتُمد بإصداراته فقط{approvedParts.length ? `: ${approvedParts.join('، ')}` : ''}.</Hint>
      {w.proposed_at && (
        <Hint i={CalendarDays}>
          الموعد المعتمد: <b>{riyadhStamp(w.proposed_at)}</b>. موعد آخر يعيد «موعد النشر» وحده إلى المراجعة، ثم يُجدول تلقائياً عند اعتماده.
        </Hint>
      )}
      <label className="l">
        التاريخ والوقت <small>بتوقيت الرياض</small>
        <input className="wk-inp" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
      </label>
      <div className="l">
        الحسابات المعتمدة <small>إضافة حساب تحتاج اعتماداً جديداً من صفحة العمل</small>
        <div className="wk-chanlist">
          {chs.map((a) => {
            const ok = !at || authOk(a, at);
            return (
              <div className="wk-chanrow" key={a.id}>
                <span>
                  <b>{accountName(a)}</b>
                  {a.handle && <small className="ltr">{a.handle}</small>}
                </span>
                <span className={`wk-cr ${ok ? 'ok' : 'risk'}`}>{ok ? 'التفويض يغطي الموعد' : 'التفويض ينتهي قبل الموعد'}</span>
              </div>
            );
          })}
        </div>
      </div>
      <div className="l">
        عند حلول الموعد
        <div className="wk-radios">
          <label>
            <input type="radio" name="sc-mode" checked={mode === 'auto'} onChange={() => setMode('auto')} />
            <span>
              نشر تلقائي في الموعد<small>يُنشر وحده إن كان التفويض يغطي الموعد. لا مهمة خلفية بعد: يُنشر حين يفتح أحد صفحات العمل بعد الموعد.</small>
            </span>
          </label>
          <label>
            <input type="radio" name="sc-mode" checked={mode === 'ask'} onChange={() => setMode('ask')} />
            <span>
              اسألني قبل النشر<small>يصل لمسؤول النشر طلب تأكيد عند الموعد، ولا يُنشر شيء بلا تأكيد.</small>
            </span>
          </label>
        </div>
        <small className="wk-why">الاختيار المبدئي من إعداد الحساب في «الحسابات المرتبطة».</small>
      </div>
      {!mail && <SendChecks rows={checks} />}
      {stop && <Hint warn>نسخة تتجاوز حدود منصتها: لا تُجدول حتى تُعدَّل. الحدود من «الإعدادات» «المنصات»، ويعدّلها من يملك «إدارة المنصات وتطبيقاتها».</Hint>}
      {bad.length > 0 && <Hint i={Lock} warn>لست ممن ينشر على: {bad.map(accountName).join('، ')}. يحدد ذلك من يدير الحسابات.</Hint>}
      {chs.filter((a) => at && !authOk(a, at)).map((a) => (
        <Hint warn key={a.id}>
          تفويض {accountName(a)} {a.authorized_until ? `ينتهي ${riyadhStamp(a.authorized_until)}` : 'منتهٍ'}، قبل موعد النشر. أعد ربط الحساب قبل الموعد.
        </Hint>
      ))}
      {moved && <Hint warn>الموعد يختلف عن المعتمد ({riyadhStamp(w.proposed_at!)}). يُرسل «موعد النشر» وحده للاعتماد، ويُجدول تلقائياً عند اعتماده.</Hint>}
      {err && <p className="wk-err">{err}</p>}
      <div className="wk-row-acts">
        <button type="button" className="wk-btn quiet" onClick={onClose}>
          تراجع
        </button>
        <button type="button" className="wk-btn primary" disabled={stop} onClick={go}>
          <Ic i={moved ? Send : CalendarDays} />
          {moved ? 'إرسال الموعد الجديد للاعتماد' : 'تأكيد الجدولة'}
        </button>
      </div>
    </Modal>
  );
}

export function PublishNowDialog({ w, onClose, act }: { w: WorkRow; onClose: () => void; act: Act }) {
  const x = useWork();
  const now = new Date().toISOString();
  const mail = isMailWork(w, x.accounts);
  const bad = notMine(w, x.accounts, x.me, x.isAdmin || x.role === 'admin');
  const src = useCopySource(w.id, w.type);
  const checks = useSendChecks(src, channelsOf(w, x.accounts));
  const stop = blocked(checks);
  return (
    <Modal title={mail ? 'تأكيد الإرسال' : 'تأكيد النشر'} onClose={onClose}>
      <Hint warn>محاكاة: لا يصل شيء إلى المنصات ولا تُرسل رسالة. يُنشر الإصدار المعتمد فقط.</Hint>
      <div className="wk-chanlist">
        {channelsOf(w, x.accounts).map((a) => {
          const ok = authOk(a, now);
          return (
            <div className="wk-chanrow" key={a.id}>
              <span>
                <b>{accountName(a)}</b>
                {a.handle && <small className="ltr">{a.handle}</small>}
              </span>
              <span className={`wk-cr ${ok ? 'ok' : 'bad'}`}>
                <Ic i={ok ? Check : TriangleAlert} />
                {ok ? 'جاهز' : 'التفويض منتهٍ: سيفشل'}
              </span>
            </div>
          );
        })}
      </div>
      {!mail && <SendChecks rows={checks} />}
      {stop && <Hint warn>نسخة تتجاوز حدود منصتها: لا تُنشر حتى تُعدَّل وتُعتمد من جديد.</Hint>}
      {bad.length > 0 && <Hint i={Lock} warn>لست ممن ينشر على: {bad.map(accountName).join('، ')}.</Hint>}
      <div className="wk-row-acts">
        <button type="button" className="wk-btn quiet" onClick={onClose}>
          إلغاء
        </button>
        <button
          type="button"
          className="wk-btn primary"
          disabled={stop}
          data-hold={HOLD.publishNow}
          onClick={() => void act('work_publish', { p_work: w.id, p_op: 'now' }, mail ? 'أُرسل من البريد (محاكاة).' : 'نُشر (محاكاة). النتيجة لكل حساب في صفحة العمل.').then((ok) => ok && onClose())}
        >
          <Ic i={Upload} />
          {mail ? 'إرسال الآن' : 'نشر الآن'}
        </button>
      </div>
    </Modal>
  );
}

/** The publishing operations that need no dialog. */
export function publishOp(act: Act, w: WorkRow, op: 'confirm' | 'decline' | 'retry' | 'unschedule') {
  const ok = {
    confirm: 'نُشر عند موعده بتأكيدك (محاكاة).',
    decline: 'لم يُنشر، وعاد «جاهز للنشر» بلا موعد.',
    retry: 'أُعيدت المحاولة للحسابات التي فشلت فقط.',
    unschedule: 'أُلغيت الجدولة، وعاد «جاهز للنشر».',
  }[op];
  return act('work_publish', { p_work: w.id, p_op: op }, ok);
}

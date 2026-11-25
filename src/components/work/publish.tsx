'use client';
// Scheduling and publishing, after «النموذج المرجعي للمركز» version 5. Publishing is a
// simulation: each account succeeds only if it is active and its authorisation covers the
// moment, and nothing reaches a platform. Only the publisher named on the accounts may act
// (work_may_publish); an approved time binds, and another time sends «موعد النشر» alone back
// for approval, then schedules itself when it is approved (work_schedule).
// YouTube's four choices (MVP_draft.md 78): «نشر الآن» asks each YouTube account «عام», «غير مدرج» or «خاص», from its default;
// «جدولة» is «مجدول», which YouTube makes public at the time. Approval does not change.
import { useState } from 'react';
import { CalendarDays, Check, ExternalLink, Lock, Send, ShieldCheck, TriangleAlert, Upload } from 'lucide-react';
import { HOLD } from '@/lib/kit/hold-reasons';
import { accountName, authOk, riyadhInstant, riyadhStamp, type AccountRow, type WorkRow } from '@/lib/work/rules';
import { NOW_CHOICES, SCHEDULED_LINE, choiceSub, choiceWord, defaultChoice, nowOptions, youtubeOf, type NowChoice } from '@/lib/work/youtube-choices';
import { useWork } from './data';
import { Hint, Ic, Modal } from './parts';
import { SendChecks, blocked, useCopySource, useSendChecks } from './post-preview';
import { XHandoff } from './x-handoff';

type Act = (fn: string, args: Record<string, unknown>, ok: string) => Promise<boolean>;
const channelsOf = (w: WorkRow, accounts: AccountRow[]) => w.channels.map((c) => accounts.find((a) => a.id === c)).filter((a): a is AccountRow => !!a);
/** Accounts of this work that are used by hand-off (X's link route, MVP_draft.md 81): nothing is sent to them, the person posts. */
export const linkAccounts = (w: WorkRow, accounts: AccountRow[]) => channelsOf(w, accounts).filter((a) => a.route === 'link');
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
      {linkAccounts(w, x.accounts).length > 0 && (
        <Hint i={ExternalLink}>
          {linkAccounts(w, x.accounts).map(accountName).join('، ')}: حساب X بالرابط. عند الموعد يصير العمل «جارٍ النشر» وينتظر نشرك بنفسك على X، فلا يُنشر وحده. وX نفسه يتيح الجدولة من صفحة النشر عنده إن شئت.
        </Hint>
      )}
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
                {a.platform === 'youtube' && (
                  <small className="wk-yt-line" data-yt-sched={a.id}>
                    {SCHEDULED_LINE}
                  </small>
                )}
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
        <small className="wk-why">الاختيار المبدئي من إعداد الحساب في «حسابات المنصات».</small>
      </div>
      {!mail && <SendChecks rows={checks} choices={Object.fromEntries(chs.filter((a) => a.platform === 'youtube').map((a) => [a.id, 'scheduled' as const]))} />}
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
  // Each YouTube account starts at its default; the publisher may narrow or widen it (MVP_draft.md 78).
  const [picked, setPicked] = useState<Record<string, NowChoice>>({});
  const tubes = youtubeOf(w, x.accounts);
  const options = nowOptions(w, x.accounts, picked);
  const bad = notMine(w, x.accounts, x.me, x.isAdmin || x.role === 'admin');
  const src = useCopySource(w.id, w.type);
  const checks = useSendChecks(src, channelsOf(w, x.accounts));
  const stop = blocked(checks);
  const links = linkAccounts(w, x.accounts);
  return (
    <Modal title={mail ? 'تأكيد الإرسال' : 'تأكيد النشر'} onClose={onClose}>
      <Hint warn>محاكاة: لا يصل شيء إلى المنصات ولا تُرسل رسالة. يُنشر الإصدار المعتمد فقط.</Hint>
      {links.length > 0 && (
        <Hint i={ExternalLink}>
          {links.map(accountName).join('، ')}: حساب X بالرابط لا يُحاكى. بعد «نشر الآن» يصير العمل «جارٍ النشر» وتظهر حزمة النشر لتنشر منها على X بنفسك ثم تلصق رابط المنشور.
        </Hint>
      )}
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
                {a.route === 'link' ? (ok ? 'بالرابط: تنشر أنت' : 'الحساب موقوف: سيفشل') : ok ? 'جاهز' : 'التفويض منتهٍ: سيفشل'}
              </span>
              {a.platform === 'youtube' && (
                <div className="wk-yt-pick" data-yt-now={a.id}>
                  <div className="wk-seg" role="group" aria-label={`الظهور على ${accountName(a)}`}>
                    {NOW_CHOICES.map((c) => (
                      <button key={c} type="button" aria-pressed={options[a.id] === c} data-choice={c} onClick={() => setPicked({ ...picked, [a.id]: c })}>
                        {choiceWord(c)}
                      </button>
                    ))}
                  </div>
                  <small>
                    {choiceSub(options[a.id])}
                    {options[a.id] === defaultChoice(a) && a.default_privacy ? ' الاختيار المبدئي لهذه القناة.' : ''}
                  </small>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {tubes.length > 0 && <small className="wk-why">«مجدول» هو الاختيار الرابع: من «جدولة»، ويجعله يوتيوب عاماً في موعده.</small>}
      {!mail && <SendChecks rows={checks} choices={options} />}
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
          onClick={() =>
            void act(
              'work_publish',
              tubes.length ? { p_work: w.id, p_op: 'now', p_options: options } : { p_work: w.id, p_op: 'now' },
              mail ? 'أُرسل من البريد (محاكاة).' : links.length ? 'صار العمل «جارٍ النشر». أكمل النشر على X من صفحة العمل أو من «إكمال النشر على X».' : 'نُشر (محاكاة). النتيجة لكل حساب في صفحة العمل.',
            ).then((ok) => ok && onClose())
          }
        >
          <Ic i={Upload} />
          {mail ? 'إرسال الآن' : 'نشر الآن'}
        </button>
      </div>
    </Modal>
  );
}

/**
 * X's link route (MVP_draft.md 81): the work's X accounts that wait for their publisher, each with its hand-off in one window. The window
 * closes when one is settled, so the list it shows is always the list that is still waiting.
 */
export function HandoffDialog({ w, onClose, act }: { w: WorkRow; onClose: () => void; act: Act }) {
  const x = useWork();
  const waiting = channelsOf(w, x.accounts).filter((a) => w.results[a.id]?.pending);
  return (
    <Modal title={`النشر على X: ${w.title}`} wide onClose={onClose}>
      {waiting.length === 0 && <Hint i={Check}>لا حساب ينتظر نشراً في هذا العمل.</Hint>}
      {waiting.map((a) => (
        <section key={a.id} className="wk-xh-sec">
          <h4>{accountName(a)}</h4>
          <XHandoff w={w} account={a} act={act} onDone={onClose} />
        </section>
      ))}
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

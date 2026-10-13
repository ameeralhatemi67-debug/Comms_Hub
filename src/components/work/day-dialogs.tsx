'use client';
// Dialogs the calendar and the project page share, after «النموذج المرجعي للمركز» version 5
// (calModal, taskModal, eventModal, moveWarn): a request to move a publish date, a new
// delivery or stage date for a leader, a task (one day, days in a row, or chosen days each
// with its person), an event, a private reminder, a task extension with what moves after it,
// and «إضافة» from a day. Every save is a database function; the dialog only says first what
// the database will answer.
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Bell, BriefcaseBusiness, CalendarDays, Check, Clock, Flag, ListChecks, Send, Upload, Users, WandSparkles } from 'lucide-react';
import { roles } from '@/lib/domain';
import {
  KIND_ROLE,
  accountName,
  authOk,
  autoPick,
  canAssignTasksToOthers,
  canCreateWork,
  canPublish,
  dayAdd,
  fdate,
  isLead,
  riyadhInstant,
  riyadhStamp,
  sdate,
  taskKindLabels,
  type StageRow,
  type WorkRow,
} from '@/lib/work/rules';
import { dueMoveIssue, moveWarnings, type CalEntry, type TaskItem,
  whenText,
} from '@/lib/work/planning';
import { useWork } from './data';
import { Hint, Ic, Modal } from './parts';

export type Act = (fn: string, args: Record<string, unknown>, ok: string) => Promise<boolean>;

/** A request to move a publish date: only «موعد النشر» goes back to review. */
export function MoveDialog({ w, at, entries, onClose, act }: { w: WorkRow; at?: string; entries: CalEntry[]; onClose: () => void; act: Act }) {
  const x = useWork();
  const cur = w.sched_at ?? w.proposed_at;
  const [when, setWhen] = useState(at ?? (cur ? riyadhStamp(cur).replace(' ', 'T') : ''));
  const [reason, setReason] = useState('');
  const [err, setErr] = useState('');
  const iso = when ? riyadhInstant(when) : '';
  const chs = w.channels.map((c) => x.accounts.find((a) => a.id === c)).filter((a) => !!a);
  const warns = iso ? moveWarnings(w, iso, x.accounts, entries, new Date().toISOString()) : [];
  const send = () => {
    if (!iso) return setErr('اختر الموعد الجديد.');
    if (Date.parse(iso) < Date.now()) return setErr('الموعد مضى. اختر موعداً قادماً.');
    if (cur && Date.parse(iso) === Date.parse(cur)) return setErr('هذا هو الموعد الحالي.');
    void act('work_request_move', { p_work: w.id, p_when: iso, p_reason: reason }, `أُرسل طلب النقل إلى ${whenText(iso)}. يقرر فيه مدير الاتصال أو مساعده، وأُبلغ مسؤول النشر.`).then((ok) => ok && onClose());
  };
  return (
    <Modal title="طلب نقل موعد النشر" onClose={onClose}>
      <Hint i={Send}>
        «{w.title}» {w.status === 'SCHEDULED' ? 'مجدول' : 'معتمد'} {cur ? whenText(cur) : ''}. يعود «موعد النشر» وحده للاعتماد، والموعد الحالي معلّق حتى القرار. يُبلَّغ مسؤول النشر.
      </Hint>
      <label className="l">
        الموعد الجديد <small>بتوقيت الرياض</small>
        <input className="wk-inp" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
      </label>
      <div className="wk-chanlist">
        {chs.map((a) => {
          const ok = a!.platform === 'mail' || !iso || authOk(a!, iso);
          return (
            <div className="wk-chanrow" key={a!.id}>
              <b>{accountName(a)}</b>
              <span className={`wk-cr ${ok ? 'ok' : 'risk'}`}>{ok ? 'التفويض يغطي الموعد' : 'التفويض لا يغطي الموعد'}</span>
            </div>
          );
        })}
      </div>
      {warns.map((t) => (
        <Hint warn key={t}>
          {t} تنبيه فقط.
        </Hint>
      ))}
      <label className="l">
        السبب <small>اختياري، يراه المعتمد</small>
        <input className="wk-inp" value={reason} maxLength={300} placeholder="مثلاً: تأخر وصول الصور من إدارة الفعاليات" onChange={(e) => setReason(e.target.value)} />
      </label>
      {err && <p className="wk-err">{err}</p>}
      <div className="wk-row-acts">
        <button type="button" className="wk-btn quiet" onClick={onClose}>
          تراجع
        </button>
        <button type="button" className="wk-btn primary" onClick={send}>
          <Ic i={Send} />
          إرسال طلب النقل
        </button>
      </div>
    </Modal>
  );
}

/** A delivery or a stage date, moved directly by a leader: an internal date that needs no approval. */
export function DueDialog({ w, stages, si, date, onClose, act }: { w: WorkRow; stages: StageRow[]; si: number | null; date?: string; onClose: () => void; act: Act }) {
  const x = useWork();
  const st = si === null ? null : stages[si];
  const [d, setD] = useState(date ?? (st ? (st.due_on ?? w.due) : w.due));
  const [err, setErr] = useState('');
  const issue = dueMoveIssue(w, stages, si, d);
  const save = () => {
    if (issue) return setErr(issue);
    if (d < x.today) return setErr('اختر يوماً من اليوم فصاعداً.');
    const p = st ? { stage_dues: { [st.id]: d } } : { due: d };
    void act('work_update', { p_work: w.id, p }, `تغيّر الموعد إلى ${fdate(d)} وأُبلغ ${x.nameOf(st?.who ?? w.assignee)}.`).then((ok) => ok && onClose());
  };
  return (
    <Modal title={st ? `موعد مرحلة «${st.name}»` : 'موعد التسليم'} onClose={onClose}>
      <Hint i={BriefcaseBusiness}>
        موعد داخلي لا يحتاج اعتماداً. يُسجَّل في سجل العمل ويُبلَّغ {x.nameOf(st?.who ?? w.assignee) || 'المسؤول'}. {st ? `التسليم النهائي ${fdate(w.due)}.` : ''}
      </Hint>
      <label className="l">
        التاريخ
        <input className="wk-inp" type="date" min={x.today} value={d} onChange={(e) => setD(e.target.value)} />
      </label>
      {issue && d && <Hint warn>{issue}</Hint>}
      {err && !issue && <p className="wk-err">{err}</p>}
      <div className="wk-row-acts">
        <button type="button" className="wk-btn quiet" onClick={onClose}>
          تراجع
        </button>
        <button type="button" className="wk-btn primary" disabled={!!issue} onClick={save}>
          حفظ
        </button>
      </div>
    </Modal>
  );
}

/** A task: one day, days in a row, or chosen days each with its own person. */
export function TaskDialog({ date, project, tasks, onClose, done }: { date: string; project?: string; tasks: TaskItem[]; onClose: () => void; done: (msg: string) => Promise<void> }) {
  const x = useWork();
  const others = canAssignTasksToOthers(x.role);
  const staff = x.people.filter((p) => p.role !== 'admin' && (p.role !== 'member' || p.email === x.me));
  const [what, setWhat] = useState('');
  const [kind, setKind] = useState('other');
  const [proj, setProj] = useState(project ?? '');
  const [who, setWho] = useState(others ? '' : x.me);
  const [auto, setAuto] = useState(false);
  const [mode, setMode] = useState<'one' | 'span' | 'days'>(project ? 'span' : 'one');
  const [due, setDue] = useState(`${date}T17:00`);
  const [start, setStart] = useState(date);
  const [end, setEnd] = useState(dayAdd(date, 2));
  const [days, setDays] = useState<Record<string, string>>({});
  const [after, setAfter] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const role = KIND_ROLE[kind];
  const pick = role ? autoPick(role, x.load) : { who: '', why: '' };
  // The least busy person in the kind's role, until someone is chosen by hand.
  useEffect(() => {
    if (!others) return;
    if (pick.who && (auto || !who)) {
      setWho(pick.who);
      setAuto(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);
  const open = tasks.filter((t) => t.status !== 'done' && (!proj || t.project_id === proj)).slice(0, 12);
  const days14 = Array.from({ length: 14 }, (_, i) => dayAdd(date, i));
  const busyOf = (email: string) => {
    const l = x.load.find((r) => r.email === email);
    return l ? l.open_stages + l.open_tasks : 0;
  };
  const opts = staff.map((p) => (
    <option key={p.email} value={p.email}>
      {p.display_name} · {roles[p.role].name} ({busyOf(p.email)})
    </option>
  ));
  const save = async () => {
    if (!what.trim()) return setErr('اكتب المطلوب.');
    const base = { what: what.trim(), kind, project: proj || null, after, note: note.trim(), priority: 'normal' };
    const rows: Record<string, unknown>[] = [];
    if (mode === 'one') {
      if (!due) return setErr('اختر الموعد.');
      if (!who) return setErr('اختر من ينفذها.');
      rows.push({ ...base, assignee: who, due: riyadhInstant(due) });
    } else if (mode === 'span') {
      if (!start || !end) return setErr('اختر البداية والنهاية.');
      if (start > end) return setErr('النهاية قبل البداية.');
      if (!who) return setErr('اختر من ينفذها.');
      rows.push({ ...base, assignee: who, start, due: riyadhInstant(`${end}T17:00`) });
    } else {
      const ds = Object.keys(days).sort();
      if (!ds.length) return setErr('اختر يوماً واحداً على الأقل.');
      const g = `g-${Date.now().toString(36)}`;
      ds.forEach((d) => rows.push({ ...base, assignee: others ? days[d] || who || x.me : x.me, due: riyadhInstant(`${d}T17:00`), group: g, note: base.note || fdate(d) }));
    }
    setBusy(true);
    for (const p of rows) {
      const r = await x.call('task_create', { p });
      if (!r.ok) {
        setBusy(false);
        return setErr(r.error);
      }
    }
    setBusy(false);
    const names = [...new Set(rows.map((r) => x.nameOf(r.assignee as string)))];
    await done(rows.length > 1 ? `أُنشئت ${rows.length} مهام لأيام محددة: ${names.join('، ')}.` : `أُسندت المهمة إلى ${names[0]}${after.length ? '، وتبدأ بعد ما تنتظره' : ''}${auto && others ? ' (اختيار تلقائي)' : ''}.`);
    onClose();
  };
  return (
    <Modal title="مهمة جديدة" wide onClose={onClose}>
      <label className="l">
        المطلوب <small>مطلوب</small>
        <input className="wk-inp" value={what} maxLength={140} placeholder="مثلاً: تغطية يومية للمعرض" onChange={(e) => setWhat(e.target.value)} />
      </label>
      <div className="wk-two">
        <label className="l">
          النوع
          <select className="wk-inp" value={kind} onChange={(e) => setKind(e.target.value)}>
            {Object.entries(taskKindLabels).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="l">
          المشروع
          <select className="wk-inp" value={proj} onChange={(e) => setProj(e.target.value)}>
            <option value="">بلا مشروع</option>
            {x.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {others ? (
        <label className="l">
          إلى من
          <small>
            {role ? (
              auto && who === pick.who ? (
                <>
                  <Ic i={WandSparkles} size={13} /> تلقائي: {pick.why}
                </>
              ) : (
                `الاقتراح التلقائي: ${x.nameOf(pick.who) || 'لا أحد'}`
              )
            ) : (
              'هذا النوع بلا توزيع تلقائي'
            )}
          </small>
          <select
            className="wk-inp"
            value={who}
            onChange={(e) => {
              setWho(e.target.value);
              setAuto(false);
            }}
          >
            <option value="">اختر</option>
            {opts}
          </select>
        </label>
      ) : (
        <Hint i={Users}>المهمة لك. إسناد المهام لغيرك لمدير الاتصال ومساعده والمنتج الإعلامي.</Hint>
      )}
      <div className="l">
        المدة
        <div className="wk-pick" role="radiogroup" aria-label="المدة">
          {(
            [
              ['one', 'يوم واحد'],
              ['span', 'أيام متصلة'],
              ['days', 'أيام محددة'],
            ] as const
          ).map(([k, v]) => (
            <label key={k}>
              <input type="radio" name="tk-mode" checked={mode === k} onChange={() => setMode(k)} />
              {v}
            </label>
          ))}
        </div>
      </div>
      {mode === 'one' && (
        <label className="l">
          الموعد <small>بتوقيت الرياض</small>
          <input className="wk-inp" type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} />
        </label>
      )}
      {mode === 'span' && (
        <>
          <div className="wk-two">
            <label className="l">
              من
              <input className="wk-inp" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            </label>
            <label className="l">
              إلى
              <input className="wk-inp" type="date" min={start} value={end} onChange={(e) => setEnd(e.target.value)} />
            </label>
          </div>
          <small className="wk-why">تظهر شريطاً عبر الأيام في التقويم، وتُحسب في حمل صاحبها كل الأيام.</small>
        </>
      )}
      {mode === 'days' && (
        <div className="l">
          اختر الأيام{others ? ' ومن يعمل في كل يوم' : ''}
          <div className="wk-dpick">
            {days14.map((d) => {
              const on = d in days;
              return (
                <div className={`drow ${on ? 'on' : ''}`} key={d}>
                  <label>
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={(e) => {
                        const n = { ...days };
                        if (e.target.checked) n[d] = who || x.me;
                        else delete n[d];
                        setDays(n);
                      }}
                    />
                    {fdate(d)}
                  </label>
                  {on && others && (
                    <select className="wk-inp" aria-label={`من يعمل ${fdate(d)}`} value={days[d]} onChange={(e) => setDays({ ...days, [d]: e.target.value })}>
                      {opts}
                    </select>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
      {open.length > 0 && (
        <div className="l">
          تبدأ بعد إنجاز <small>اختياري: تنتظر هذه المهام، ويصل إشعار لصاحبها حين تنتهي</small>
          <div className="wk-pick">
            {open.map((t) => (
              <label key={t.id}>
                <input type="checkbox" checked={after.includes(t.id)} onChange={(e) => setAfter(e.target.checked ? [...after, t.id] : after.filter((y) => y !== t.id))} />
                {t.what} · {x.nameOf(t.assignee)}
              </label>
            ))}
          </div>
        </div>
      )}
      <label className="l">
        تفاصيل <small>اختيارية</small>
        <textarea className="wk-inp" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
      </label>
      {err && <p className="wk-err">{err}</p>}
      <div className="wk-row-acts">
        <button type="button" className="wk-btn quiet" onClick={onClose}>
          تراجع
        </button>
        <button type="button" className="wk-btn primary" disabled={busy} onClick={() => void save()}>
          <Ic i={ListChecks} />
          إسناد المهمة
        </button>
      </div>
    </Modal>
  );
}

/** An event for the team: a meeting or an exhibition, one day or more. */
export function EventDialog({ date, project, onClose, act }: { date: string; project?: string; onClose: () => void; act: Act }) {
  const x = useWork();
  const [title, setTitle] = useState('');
  const [a, setA] = useState(`${date}T09:00`);
  const [b, setB] = useState(`${date}T17:00`);
  const [place, setPlace] = useState('');
  const [proj, setProj] = useState(project ?? '');
  const [err, setErr] = useState('');
  const save = () => {
    if (!title.trim() || !a || !b) return setErr('اكتب العنوان واختر البداية والنهاية.');
    if (b < a) return setErr('النهاية قبل البداية.');
    const days = (Date.parse(`${b.slice(0, 10)}T00:00Z`) - Date.parse(`${a.slice(0, 10)}T00:00Z`)) / 864e5 + 1;
    void act(
      'event_save',
      { p_id: null, p: { title, start: riyadhInstant(a), end: riyadhInstant(b), place, project: proj || null } },
      `أُضيف الحدث «${title.trim()}»${days > 1 ? ` ويمتد ${days} أيام` : ''}.`,
    ).then((ok) => ok && onClose());
  };
  return (
    <Modal title="حدث جديد" onClose={onClose}>
      <label className="l">
        العنوان <small>مطلوب</small>
        <input className="wk-inp" value={title} maxLength={140} placeholder="مثلاً: معرض الاتصال المؤسسي" onChange={(e) => setTitle(e.target.value)} />
      </label>
      <div className="wk-two">
        <label className="l">
          يبدأ
          <input className="wk-inp" type="datetime-local" value={a} onChange={(e) => setA(e.target.value)} />
        </label>
        <label className="l">
          ينتهي <small>يمكن أن يمتد أياماً</small>
          <input className="wk-inp" type="datetime-local" value={b} onChange={(e) => setB(e.target.value)} />
        </label>
      </div>
      <div className="wk-two">
        <label className="l">
          المكان
          <input className="wk-inp" value={place} maxLength={120} placeholder="مثلاً: مركز المعارض" onChange={(e) => setPlace(e.target.value)} />
        </label>
        <label className="l">
          المشروع
          <select className="wk-inp" value={proj} onChange={(e) => setProj(e.target.value)}>
            <option value="">بلا مشروع</option>
            {x.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <Hint i={CalendarDays}>الحدث موعد للفريق. إن احتاج تغطية فأنشئ له «تغطية حدث» أو مهام لكل يوم من زر «إضافة».</Hint>
      {err && <p className="wk-err">{err}</p>}
      <div className="wk-row-acts">
        <button type="button" className="wk-btn quiet" onClick={onClose}>
          تراجع
        </button>
        <button type="button" className="wk-btn primary" onClick={save}>
          <Ic i={CalendarDays} />
          إضافة الحدث
        </button>
      </div>
    </Modal>
  );
}

/** A reminder for this person alone. */
export function ReminderDialog({ date, onClose, act }: { date: string; onClose: () => void; act: Act }) {
  const [body, setBody] = useState('');
  const [at, setAt] = useState(`${date}T09:00`);
  const [err, setErr] = useState('');
  return (
    <Modal title="تذكير لي" onClose={onClose}>
      <label className="l">
        بماذا أذكّرك؟
        <input className="wk-inp" value={body} maxLength={300} placeholder="مثلاً: اتصال بإدارة الفعاليات" onChange={(e) => setBody(e.target.value)} />
      </label>
      <label className="l">
        الوقت <small>بتوقيت الرياض</small>
        <input className="wk-inp" type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} />
      </label>
      <Hint i={Bell}>لا يراه غيرك، ولا مسؤول النظام.</Hint>
      {err && <p className="wk-err">{err}</p>}
      <div className="wk-row-acts">
        <button type="button" className="wk-btn quiet" onClick={onClose}>
          تراجع
        </button>
        <button
          type="button"
          className="wk-btn primary"
          onClick={() => {
            if (!body.trim() || !at) return setErr('اكتب نص التذكير واختر الوقت.');
            void act('reminder_add', { p_at: riyadhInstant(at), p_body: body }, 'حُفظ التذكير. لا يراه غيرك.').then((ok) => ok && onClose());
          }}
        >
          <Ic i={Bell} />
          حفظ التذكير
        </button>
      </div>
    </Modal>
  );
}

type TaskImpact = { shifts: { task: string; what: string; who: string; from: [string | null, string]; to: [string | null, string] }[] };
/** A task extension: what moves after it is shown before the request is sent. */
export function TaskExtensionDialog({ t, onClose, act }: { t: TaskItem; onClose: () => void; act: Act }) {
  const x = useWork();
  const cur = riyadhStamp(t.due).slice(0, 10);
  const [to, setTo] = useState(dayAdd(cur, 2));
  const [reason, setReason] = useState('');
  const [err, setErr] = useState('');
  const [impact, setImpact] = useState<TaskImpact | null>(null);
  const toIso = useMemo(() => (to ? riyadhInstant(`${to}T${riyadhStamp(t.due).slice(11, 16)}`) : ''), [to, t.due]);
  useEffect(() => {
    let live = true;
    setImpact(null);
    if (!toIso || to <= cur) return;
    void x.call<TaskImpact>('work_task_impact', { p_task: t.id, p_to: toIso }).then((r) => live && r.ok && setImpact(r.data));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toIso]);
  const send = () => {
    if (!to || to <= cur) return setErr(`اختر موعداً بعد الموعد الحالي ${fdate(cur)}.`);
    if (!reason.trim()) return setErr('اكتب السبب.');
    void act('request_extension', { p_stage: null, p_task: t.id, p_to: toIso, p_reason: reason }, `أُرسل طلب التمديد إلى ${x.nameOf(t.assigned_by)} ومدير الاتصال ومساعده.`).then((ok) => ok && onClose());
  };
  return (
    <Modal title="طلب تمديد مهمة" onClose={onClose}>
      <Hint i={Clock}>
        «{t.what}». الموعد الحالي {whenText(t.due)}. يصل الطلب إلى {x.nameOf(t.assigned_by)} ومدير الاتصال ومساعده.
      </Hint>
      <label className="l">
        الموعد الجديد
        <input className="wk-inp" type="date" min={dayAdd(cur, 1)} value={to} onChange={(e) => setTo(e.target.value)} />
      </label>
      {impact &&
        (impact.shifts.length ? (
          <div className="l">
            ما يتحرك معه
            <div className="wk-chanlist">
              {impact.shifts.map((s) => (
                <div className="wk-chanrow" key={s.task}>
                  <span>
                    <b>{s.what}</b>
                    <small>{x.nameOf(s.who)}</small>
                  </span>
                  <span className="late">
                    {sdate(riyadhStamp(s.from[1]))} ← {sdate(riyadhStamp(s.to[1]))}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <Hint i={Check}>لا يتحرك شيء بعدها.</Hint>
        ))}
      <label className="l">
        السبب <small>مطلوب</small>
        <textarea className="wk-inp" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
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

export type DayPick = 'task' | 'event' | 'rem' | { ready: WorkRow };
/** «إضافة» from a day: what this role may add there. */
export function AddDayDialog({ date, ready, onPick, onClose }: { date: string; ready: WorkRow[]; onPick: (p: DayPick) => void; onClose: () => void }) {
  const x = useWork();
  const [sched, setSched] = useState(false);
  const past = date < x.today;
  const member = x.role === 'member';
  if (sched)
    return (
      <Modal title={`جدولة يوم ${fdate(date)}`} onClose={onClose}>
        {ready.length ? (
          <div className="wk-pick-list">
            {ready.map((w) => (
              <button type="button" key={w.id} onClick={() => onPick({ ready: w })}>
                <span className="grow">
                  <b>{w.title}</b>
                  <small> · {w.proposed_at ? `الموعد المعتمد ${whenText(w.proposed_at)}` : 'بلا موعد معتمد'} · {w.channels.map((c) => accountName(x.accounts.find((a) => a.id === c))).join('، ')}</small>
                </span>
              </button>
            ))}
          </div>
        ) : (
          <p className="wk-col-hint">لا أعمال معتمدة بانتظار الجدولة.</p>
        )}
      </Modal>
    );
  return (
    <Modal title={`إضافة في ${fdate(date)}`} onClose={onClose}>
      <div className="wk-pick-list wk-dayadd">
        {canCreateWork(x.role) && (
          <Link className="wk-pickrow" href={past ? '#' : `/create?due=${date}`} aria-disabled={past} onClick={(e) => past && e.preventDefault()}>
            <Ic i={BriefcaseBusiness} />
            <span className="grow">
              <b>{member ? 'طلب يُسلَّم في هذا اليوم' : 'عمل يُسلَّم في هذا اليوم'}</b>
              <small>{past ? 'يوم مضى: التسليم من اليوم فصاعداً.' : 'يفتح «إنشاء» بموعد التسليم'}</small>
            </span>
          </Link>
        )}
        {canCreateWork(x.role) && (
          <Link className="wk-pickrow" href={past ? '#' : `/create?type=event&due=${date}`} aria-disabled={past} onClick={(e) => past && e.preventDefault()}>
            <Ic i={CalendarDays} />
            <span className="grow">
              <b>تغطية حدث في هذا اليوم</b>
              <small>عمل من نوع «تغطية حدث» بيوم الحدث</small>
            </span>
          </Link>
        )}
        {canPublish(x.role) && (
          <button type="button" onClick={() => setSched(true)}>
            <Ic i={Upload} />
            <span className="grow">
              <b>جدولة عمل جاهز للنشر</b>
              <small>{ready.length} أعمال معتمدة بانتظار الجدولة</small>
            </span>
          </button>
        )}
        <button type="button" onClick={() => onPick('task')}>
          <Ic i={ListChecks} />
          <span className="grow">
            <b>مهمة</b>
            <small>{canAssignTasksToOthers(x.role) ? 'ليوم، أو أيام متصلة، أو أيام محددة لكل منها شخص' : 'مهمة لك في هذا اليوم أو أكثر'}</small>
          </span>
        </button>
        {isLead(x.role) && (
          <button type="button" onClick={() => onPick('event')}>
            <Ic i={Flag} />
            <span className="grow">
              <b>حدث</b>
              <small>اجتماع أو معرض، ليوم أو أكثر</small>
            </span>
          </button>
        )}
        <button type="button" onClick={() => onPick('rem')}>
          <Ic i={Bell} />
          <span className="grow">
            <b>تذكير لي</b>
            <small>لا يراه غيرك</small>
          </span>
        </button>
      </div>
    </Modal>
  );
}

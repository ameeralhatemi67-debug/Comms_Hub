'use client';
// The plan editor of «النموذج المرجعي للمركز» version 5: the simple editor (a person, a
// start and an end per stage, what it waits for, drag or arrows to reorder) and the free
// editor (role, duration, note and approval point per stage, insert and copy, ready-made
// stages, chain or parallel, dates from durations, templates, and a live timeline). The
// same rows appear, shorter, in «إنشاء». Every rule is in src/lib/work/rules.ts and the
// database checks the plan again when it is saved.
import { useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  CalendarDays,
  ChartGantt,
  Check,
  Clock,
  Copy,
  Plus,
  ShieldCheck,
  Trash2,
  TriangleAlert,
  WandSparkles,
  X,
} from 'lucide-react';
import { roles } from '@/lib/domain';
import {
  STAGES,
  STAGE_LIBRARY,
  TYPE_PLANS,
  autoPick,
  countOf,
  dayAdd,
  dayDiff,
  fdate,
  nDays,
  planCalc,
  planChain,
  planCopy,
  planInsert,
  planIssues,
  planMove,
  planParallel,
  planRemove,
  planWithTemplate,
  stepDays,
  templateFromPlan,
  typeLabels,
  typeTemplate,
  type PlanRow,
  type StageRole,
  type WorkType,
} from '@/lib/work/rules';
import { installRowDrag } from '@/lib/work/drag';
import { useWork, type Load, type Person } from './data';
import { Hint, Ic, Modal } from './parts';

export type EditRow = PlanRow & { k?: string; auto?: boolean; why?: string };
const PLAN_ROLES: Exclude<StageRole, ''>[] = ['writer', 'designer', 'producer', 'assistant', 'director', 'publisher'];
let seq = 0;
/** Every row gets a stable key for the list, kept through moves. */
export const keyed = (rows: EditRow[]): EditRow[] => rows.map((r) => (r.k ? r : { ...r, k: `r${++seq}` }));
export const staffOf = (people: Person[]) => people.filter((p) => p.role !== 'member' && p.role !== 'admin');
export const busyOf = (load: Load[], email: string) => {
  const l = load.find((x) => x.email === email);
  return l ? l.open_stages + l.open_tasks : 0;
};
/** Give each stage with a role and nobody on it the least busy person in that role. */
export function autoFill(rows: EditRow[], load: Load[], onlyEmpty = true): EditRow[] {
  return rows.map((s) => {
    if (s.done || (onlyEmpty && s.who) || !s.role) return s;
    const a = autoPick(s.role, load);
    return a.who ? { ...s, who: a.who, auto: true, why: a.why } : s;
  });
}

function Grip() {
  return (
    <svg viewBox="0 0 10 16" aria-hidden="true">
      {[3, 8, 13].flatMap((y) => [3, 7].map((x) => <circle key={`${x}${y}`} cx={x} cy={y} r="1.4" />))}
    </svg>
  );
}

/** The stage rows, with a grip to drag and arrows for keyboard and touch. */
export function PlanRows({
  rows,
  onChange,
  adv = false,
  compact = false,
}: {
  rows: EditRow[];
  onChange: (rows: EditRow[], notice?: string) => void;
  adv?: boolean;
  compact?: boolean;
}) {
  const { people, load, nameOf, today } = useWork();
  const staff = staffOf(people);
  const listRef = useRef<HTMLDivElement>(null);
  const live = useRef({ rows, onChange });
  live.current = { rows, onChange };
  const [moved, setMoved] = useState<string | null>(null);

  const move = (from: number, to: number) => {
    const P = live.current.rows;
    if (to < 0 || to >= P.length || P[from]?.done) return;
    const { plan, dropped } = planMove(P, from, to);
    setMoved(P[from].k ?? null);
    live.current.onChange(plan, `نُقلت «${P[from].n}» إلى الموضع ${to + 1}.${dropped.length ? ` ${dropped.join('؛ ')}.` : ''}`);
  };
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    return installRowDrag(el, { onMove: (from, to) => move(from, to) });
    // The engine reads the rows through a ref, so it is installed once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!moved) return;
    const t = setTimeout(() => setMoved(null), 1000);
    return () => clearTimeout(t);
  }, [moved]);

  const set = (i: number, patch: Partial<EditRow>) =>
    onChange(rows.map((r, k) => (k === i ? { ...r, ...patch, ...('who' in patch ? { auto: false } : {}) } : r)));
  const toggleAfter = (i: number, j: number, on: boolean) =>
    set(i, { after: on ? [...rows[i].after, j].sort((a, b) => a - b) : rows[i].after.filter((x) => x !== j) });

  return (
    <>
      <div className={`wk-phead ${compact ? 'compact' : ''}`} aria-hidden="true">
        <span />
        <span>#</span>
        <span>المرحلة</span>
        <span>من يعمل عليها</span>
        <span>من</span>
        <span>إلى</span>
        <span>بعد المرحلة</span>
        <span />
      </div>
      <div className={`wk-plist ${compact ? 'compact' : ''}`} ref={listRef} data-plist={compact ? 'create' : 'modal'}>
        {rows.map((s, i) => {
          const dis = !!s.done;
          const sug = s.role && !s.done ? autoPick(s.role, load) : null;
          return (
            <div key={s.k ?? i} className={`wk-prow ${s.done ? 'done' : ''} ${s.gate ? 'gate' : ''} ${moved && moved === s.k ? 'moved' : ''}`} data-prow={i}>
              <span className={`wk-pgrip ${dis ? 'off' : ''}`} {...(dis ? {} : { 'data-pdrag': i, title: 'اسحب لتغيير الترتيب' })}>
                <Grip />
              </span>
              <span className="sn">{i + 1}</span>
              {compact ? (
                <span className="pname">{s.n}</span>
              ) : (
                <input className="wk-inp" value={s.n} disabled={dis} aria-label={`اسم المرحلة ${i + 1}`} onChange={(e) => set(i, { n: e.target.value })} />
              )}
              <select className="wk-inp" value={s.who} disabled={dis} aria-label={`من يعمل على ${s.n}`} onChange={(e) => set(i, { who: e.target.value })}>
                <option value="">غير مسندة</option>
                {staff.map((p) => (
                  <option key={p.email} value={p.email}>
                    {p.display_name} · {roles[p.role].name} ({busyOf(load, p.email)})
                  </option>
                ))}
                {s.who && !staff.some((p) => p.email === s.who) && <option value={s.who}>{nameOf(s.who)}</option>}
              </select>
              <input className="wk-inp" type="date" value={s.start} disabled={dis} aria-label={`بداية ${s.n}`} onChange={(e) => set(i, { start: e.target.value })} />
              <input className="wk-inp" type="date" value={s.due} disabled={dis} aria-label={`نهاية ${s.n}`} onChange={(e) => set(i, { due: e.target.value })} />
              <span className="pafter">
                {i === 0 ? (
                  <small>تبدأ وحدها</small>
                ) : (
                  rows.slice(0, i).map((o, j) => (
                    <label key={j} title={`تنتظر «${o.n}»`}>
                      <input type="checkbox" checked={s.after.includes(j)} disabled={dis} aria-label={`«${s.n}» تنتظر «${o.n}»`} onChange={(e) => toggleAfter(i, j, e.target.checked)} />
                      {j + 1}
                    </label>
                  ))
                )}
              </span>
              <span className="pctl">
                {s.done ? (
                  <small className="wk-col-hint">منتهية</small>
                ) : (
                  <>
                    <button type="button" className="wk-btn quiet" title="لأعلى" aria-label={`نقل «${s.n}» لأعلى`} disabled={i === 0} onClick={() => move(i, i - 1)}>
                      <Ic i={ArrowUp} />
                    </button>
                    <button type="button" className="wk-btn quiet" title="لأسفل" aria-label={`نقل «${s.n}» لأسفل`} disabled={i === rows.length - 1} onClick={() => move(i, i + 1)}>
                      <Ic i={ArrowDown} />
                    </button>
                    {!compact && (
                      <button
                        type="button"
                        className="wk-btn quiet"
                        title="حذف"
                        aria-label={`حذف «${s.n}»`}
                        onClick={() => onChange(planRemove(rows, i), `حُذفت «${s.n}»، وأُزيلت من انتظار ما بعدها.`)}
                      >
                        <Ic i={X} />
                      </button>
                    )}
                  </>
                )}
              </span>
              <small className="pauto">
                {s.auto && s.who ? (
                  <>
                    <Ic i={WandSparkles} />
                    تلقائي: {s.why}
                  </>
                ) : sug?.who && sug.who !== s.who ? (
                  `الاقتراح التلقائي: ${nameOf(sug.who)}`
                ) : null}
                {compact && s.gate && (
                  <>
                    {' '}
                    <Ic i={ShieldCheck} />
                    نقطة اعتماد
                  </>
                )}
                {compact && s.note ? ` · ${s.note}` : null}
              </small>
              {adv && (
                <div className="padv">
                  <label>
                    الدور
                    <select className="wk-inp" value={s.role} disabled={dis} onChange={(e) => set(i, { role: e.target.value as StageRole })}>
                      <option value="">بلا دور</option>
                      {PLAN_ROLES.map((r) => (
                        <option key={r} value={r}>
                          {roles[r].name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    المدة
                    <input
                      className="wk-inp"
                      type="number"
                      min={1}
                      max={90}
                      value={stepDays(s)}
                      disabled={dis}
                      onChange={(e) => set(i, { days: Math.max(1, Math.min(90, Number(e.target.value) || 1)) })}
                    />
                    يوم
                  </label>
                  <label title="لا يبدأ ما بعدها حتى يعتمدها مدير الاتصال أو مساعده">
                    <input type="checkbox" checked={s.gate} disabled={dis} onChange={(e) => set(i, { gate: e.target.checked })} />
                    نقطة اعتماد
                  </label>
                  <input
                    className="wk-inp pnote"
                    value={s.note}
                    disabled={dis}
                    maxLength={300}
                    placeholder="ملاحظة أو تعليمات لصاحب المرحلة"
                    aria-label={`ملاحظة المرحلة ${i + 1}`}
                    onChange={(e) => set(i, { note: e.target.value })}
                  />
                  {!dis && (
                    <>
                      <button
                        type="button"
                        className="wk-btn sm quiet"
                        onClick={() => {
                          const st = s.due ? dayAdd(s.due, 1) : today;
                          onChange(keyed(planInsert(rows, i + 1, { n: 'مرحلة جديدة', role: '', who: '', start: st, due: st, after: [i], days: 1, gate: false, note: '' })), `أُدرجت مرحلة جديدة بعد «${s.n}»، وتنتظرها.`);
                        }}
                      >
                        <Ic i={Plus} />
                        مرحلة بعدها
                      </button>
                      <button type="button" className="wk-btn sm quiet" onClick={() => onChange(keyed(planCopy(rows, i)), `نُسخت «${s.n}» بالشخص والمواعيد وما تنتظره نفسها.`)}>
                        <Ic i={Copy} />
                        نسخ
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

/** The live timeline under the editor, with what stops a save and what only warns. */
export function PlanTimeline({ rows, due }: { rows: EditRow[]; due: string }) {
  const { today, nameOf } = useWork();
  const dates = [today, ...(due ? [due] : []), ...rows.flatMap((s) => [s.start, s.due].filter(Boolean))].sort();
  const from = dates[0];
  const to = dates[dates.length - 1];
  const span = Math.max(1, dayDiff(to, from) + 1);
  const pc = (d: string) => `${((dayDiff(d, from) / span) * 100).toFixed(1)}%`;
  const { errs, warns } = planIssues(rows, due || undefined);
  return (
    <div className="wk-pprev">
      <h4>
        المعاينة الزمنية
        <small>
          {fdate(from)} – {fdate(to)} · الخط الأحمر التسليم والذهبي اليوم
        </small>
      </h4>
      {rows.map((s, i) => {
        const a = s.start || s.due;
        const b = s.due || s.start;
        const bad = (due && s.due && s.due > due) || (s.start && s.due && s.start > s.due);
        return (
          <div className="wk-ppr" key={s.k ?? i}>
            <span title={s.n}>
              {s.n || '—'}
              {s.who ? ` · ${nameOf(s.who)}` : ''}
            </span>
            <span className="trk">
              {a && b && a <= b && (
                <i
                  className={`${s.done ? 'done' : bad ? 'bad' : ''} ${s.gate ? 'gate' : ''}`}
                  style={{ insetInlineStart: pc(a), width: `${Math.max(1.5, ((dayDiff(b, a) + 1) / span) * 100).toFixed(1)}%` }}
                />
              )}
              {due && <b style={{ insetInlineStart: pc(due) }} title="التسليم" />}
              <u style={{ insetInlineStart: pc(today) }} title="اليوم" />
            </span>
          </div>
        );
      })}
      <ul className="wk-pwarn">
        {errs.map((e, k) => (
          <li key={`e${k}`} className="bad">
            <Ic i={TriangleAlert} />
            <span>{e.text}</span>
          </li>
        ))}
        {warns.map((t, k) => (
          <li key={`w${k}`}>
            <Ic i={Clock} />
            <span>{t}</span>
          </li>
        ))}
        {!errs.length && !warns.length && (
          <li className="ok">
            <Ic i={Check} />
            <span>الخطة متسقة: لا تداخل ولا تجاوز للتسليم، وكل مرحلة مسندة.</span>
          </li>
        )}
      </ul>
    </div>
  );
}

/** The plan editor dialog, for a work or for the new work in «إنشاء». */
export function PlanEditor({
  title,
  type,
  due,
  initial,
  advanced = false,
  onSave,
  onClose,
}: {
  title: string;
  type: WorkType;
  due: string;
  initial: EditRow[];
  /** Open on the free editor. */
  advanced?: boolean;
  /** Returns the reason the plan was refused, or null when saved. */
  onSave: (rows: EditRow[]) => Promise<string | null>;
  onClose: () => void;
}) {
  const w = useWork();
  const lead = ['director', 'assistant', 'admin'].includes(w.role);
  const [rows, setRows] = useState<EditRow[]>(() => keyed(initial));
  const [adv, setAdv] = useState(advanced);
  const [notice, setNotice] = useState('');
  const [err, setErr] = useState('');
  const [tpl, setTpl] = useState(`type:${type}`);
  const [tplName, setTplName] = useState('');
  const [busy, setBusy] = useState(false);
  const change = (next: EditRow[], n?: string) => {
    setRows(keyed(next));
    setNotice(n ?? '');
    setErr('');
  };
  const saved = w.templates.find((t) => `c:${t.id}` === tpl);

  const applyTemplate = () => {
    const src = tpl.startsWith('type:') ? typeTemplate(tpl.slice(5) as WorkType) : (saved?.rows ?? []);
    if (!src.length) return;
    const next = planCalc(autoFill(keyed(planWithTemplate(rows, src)), w.load), due ? 'back' : 'fwd', w.today, due || undefined);
    const label = tpl.startsWith('type:') ? `قالب ${typeLabels[tpl.slice(5) as WorkType]} الأساسي` : saved?.name;
    change(next, `طُبّق «${label}»: ${countOf(src.length, STAGES)} مُسندة تلقائياً ومواعيدها محسوبة${rows.some((s) => s.done) ? '، والمراحل المنتهية كما هي' : ''}.`);
  };
  const saveTemplate = async () => {
    if (!tplName.trim()) return setNotice('اكتب اسماً للقالب.');
    const r = await w.call<string>('plan_template_save', { p_name: tplName.trim(), p_type: type, p_rows: templateFromPlan(rows) });
    if (!r.ok) return setErr(r.error);
    await w.reloadBase();
    setTpl(`c:${r.data}`);
    setNotice(`حُفظ القالب «${tplName.trim()}». يظهر في قائمة القوالب لكل الأنواع، ويطبقه أي قائد.`);
    setTplName('');
  };
  const deleteTemplate = async () => {
    if (!saved) return;
    const r = await w.call('plan_template_delete', { p_id: saved.id });
    if (!r.ok) return setErr(r.error);
    await w.reloadBase();
    setTpl(`type:${type}`);
    setNotice(`حُذف القالب «${saved.name}».`);
  };
  const save = async () => {
    const { errs } = planIssues(rows, due || undefined);
    if (errs.length) return setErr(errs[0].text);
    setBusy(true);
    const e = await onSave(rows);
    setBusy(false);
    if (e) setErr(e);
  };

  return (
    <Modal title={`خطة المراحل · ${title}`} wide onClose={onClose}>
      <div className="wk-tabs-row">
        <div className="wk-seg" role="group" aria-label="المحرر">
          <button type="button" aria-pressed={!adv} onClick={() => setAdv(false)}>
            المحرر البسيط
          </button>
          <button type="button" aria-pressed={adv} onClick={() => setAdv(true)}>
            المحرر الحر
          </button>
        </div>
        <span className="wk-today">{due ? `التسليم النهائي ${fdate(due)}` : 'لم يُحدد التسليم بعد'}</span>
      </div>
      <Hint i={ChartGantt}>
        {adv
          ? 'كل ما في المحرر البسيط، ومعه: الدور والمدة ونقطة الاعتماد والملاحظة لكل مرحلة، وإدراج مرحلة بعد أخرى أو نسخها، ومكتبة مراحل جاهزة، وحساب المواعيد من المدد، والقوالب. المعاينة في الأسفل تتحدث وأنت تعدّل.'
          : 'لكل مرحلة شخص وموعد بداية ونهاية، و«بعد» يحدد ما تنتظره. اسحب المقبض لتغيير الترتيب، أو استخدم السهمين. التوزيع التلقائي يختار من الدور المناسب الأقل حملاً، والرقم بين القوسين حمله الآن.'}
      </Hint>
      {adv && (
        <>
          <div className="wk-ptools">
            <span className="lbl">الانتظار</span>
            <button type="button" className="wk-btn sm" onClick={() => change(planChain(rows), 'صارت كل مرحلة تنتظر التي قبلها. احسب المواعيد من المدد لتتسق التواريخ.')}>
              اجعلها متتابعة
            </button>
            <button type="button" className="wk-btn sm" onClick={() => change(planParallel(rows), 'لم تعد أي مرحلة تنتظر غيرها: تجري كلها في وقت واحد.')}>
              كلها بالتوازي
            </button>
            <span className="sep" />
            <span className="lbl">المواعيد من المدد</span>
            <button type="button" className="wk-btn sm" onClick={() => change(planCalc(rows, 'fwd', w.today), 'حُسبت المواعيد للأمام من اليوم بمدة كل مرحلة وما تنتظره.')}>
              <Ic i={CalendarDays} />
              للأمام من اليوم
            </button>
            {due && (
              <button
                type="button"
                className="wk-btn sm"
                onClick={() => change(planCalc(rows, 'back', w.today, due), `حُسبت المواعيد رجوعاً من التسليم ${fdate(due)} بمدة كل مرحلة وما تنتظره.`)}
              >
                <Ic i={CalendarDays} />
                رجوعاً من التسليم
              </button>
            )}
          </div>
          <div className="wk-ptools">
            <span className="lbl">أضف من المكتبة</span>
            <div className="wk-plib">
              {STAGE_LIBRARY.map(([n, role, days]) => (
                <button
                  type="button"
                  key={n}
                  title={`${roles[role as Exclude<StageRole, ''>].name} · ${nDays(days)}`}
                  onClick={() => {
                    const last = rows.length - 1;
                    const prev = last > -1 ? rows[last] : null;
                    let st = prev?.due ? dayAdd(prev.due, 1) : w.today;
                    if (st < w.today) st = w.today;
                    const a = autoPick(role, w.load);
                    change(
                      [...rows, { n, role, who: a.who, auto: !!a.who, why: a.why, days, after: last > -1 ? [last] : [], start: st, due: dayAdd(st, days - 1), gate: false, note: '' }],
                      `أُضيفت «${n}» في آخر الخطة${a.who ? `، وأُسندت تلقائياً إلى ${w.nameOf(a.who)}` : ''}.`,
                    );
                  }}
                >
                  <Ic i={Plus} />
                  {n}
                </button>
              ))}
            </div>
          </div>
          <div className="wk-ptools">
            <span className="lbl">القوالب</span>
            <select className="wk-inp" value={tpl} aria-label="القالب" onChange={(e) => setTpl(e.target.value)}>
              {(Object.keys(TYPE_PLANS) as WorkType[]).map((k) => (
                <option key={k} value={`type:${k}`}>
                  قالب {typeLabels[k]} الأساسي
                </option>
              ))}
              {w.templates.map((t) => (
                <option key={t.id} value={`c:${t.id}`}>
                  {t.name} · {typeLabels[t.type]} · {w.nameOf(t.created_by)}
                </option>
              ))}
            </select>
            <button type="button" className="wk-btn sm" onClick={applyTemplate}>
              تطبيق القالب
            </button>
            {lead && saved && (
              <button type="button" className="wk-btn sm quiet" onClick={() => void deleteTemplate()} aria-label={`حذف القالب «${saved.name}»`}>
                <Ic i={Trash2} />
              </button>
            )}
            {lead && (
              <>
                <span className="sep" />
                <input className="wk-inp" value={tplName} maxLength={80} placeholder="اسم القالب الجديد" aria-label="اسم القالب" onChange={(e) => setTplName(e.target.value)} />
                <button type="button" className="wk-btn sm" onClick={() => void saveTemplate()}>
                  حفظ الخطة قالباً
                </button>
              </>
            )}
          </div>
        </>
      )}
      {notice && (
        <p className="wk-pnotice" role="status">
          {notice}
        </p>
      )}
      <PlanRows rows={rows} adv={adv} onChange={change} />
      <div className="wk-row-acts start">
        <button
          type="button"
          className="wk-btn sm"
          onClick={() => change([...rows, { n: 'مرحلة جديدة', role: '', who: '', start: w.today, due: due || '', after: rows.length ? [rows.length - 1] : [], days: 1, gate: false, note: '' }])}
        >
          <Ic i={Plus} />
          إضافة مرحلة
        </button>
        <button type="button" className="wk-btn sm" onClick={() => change(autoFill(rows, w.load), 'وُزّعت المراحل غير المسندة على الأقل حملاً في كل دور.')}>
          <Ic i={WandSparkles} />
          توزيع تلقائي للمراحل غير المسندة
        </button>
      </div>
      <PlanTimeline rows={rows} due={due} />
      {err && (
        <p className="wk-err" role="alert">
          {err}
        </p>
      )}
      <div className="wk-row-acts">
        <button type="button" className="wk-btn quiet" onClick={onClose}>
          تراجع
        </button>
        <button type="button" className="wk-btn primary" disabled={busy} onClick={() => void save()}>
          حفظ الخطة
        </button>
      </div>
    </Modal>
  );
}

'use client';
// The cost calculator of X's paid API (MVP_draft.md section 82): the director says how much the account would post, with how many
// links and pictures, over how many months, and reads what X would charge, line by line, with the lines X leaves unpriced named
// as such. It decides nothing and sends nothing: the rules and the prices are src/lib/platforms/x-cost.ts. Tokens only, no emoji.
import { useId, useMemo, useState, type ReactNode } from 'react';
import { CircleAlert } from 'lucide-react';
import {
  BASIS_AR,
  DEFAULT_INPUT,
  LINE_AR,
  PER_AR,
  PERIODS,
  PRICE,
  RANGE,
  SCENARIOS,
  X_CAN,
  X_FREE_CREDITS,
  X_PRICES_READ,
  X_UNKNOWN,
  clampInput,
  compare,
  coverDays,
  estimate,
  periodAr,
  usd,
  type CostInput,
  type Per,
} from '@/lib/platforms/x-cost';
import { Rich } from '../guide-text';

const n = (v: number) => v.toLocaleString('en-US');
const Money = ({ mills }: { mills: number }) => <bdi dir="ltr">{usd(mills)}</bdi>;

/** A number a person can clear and type again: it is brought into its range only when they leave the field. */
function Num({ label, value, onChange, hint, end }: { label: string; value: number; onChange: (v: number) => void; hint?: string; end?: string }) {
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <div className="xc-f">
      <label htmlFor={id}>{label}</label>
      <span className="xc-num">
        <input
          id={id}
          className="ltr"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={draft ?? String(value)}
          onChange={(e) => {
            setDraft(e.target.value);
            const v = Number(e.target.value);
            if (e.target.value.trim() !== '' && Number.isFinite(v)) onChange(v);
          }}
          onBlur={() => setDraft(null)}
        />
        {end && <small>{end}</small>}
      </span>
      {hint && (
        <small className="xc-hint">
          <Rich text={hint} />
        </small>
      )}
    </div>
  );
}

function Share({ label, value, onChange, hint }: { label: string; value: number; onChange: (v: number) => void; hint?: ReactNode }) {
  const id = useId();
  return (
    <div className="xc-f">
      <label htmlFor={id}>
        {label} <b className="xc-pct">{value}%</b>
      </label>
      <input id={id} type="range" min={RANGE.share[0]} max={RANGE.share[1]} step={5} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      {hint && <small className="xc-hint">{hint}</small>}
    </div>
  );
}

export function XCostCalculator() {
  const [input, setInput] = useState<CostInput>(DEFAULT_INPUT);
  const [balance, setBalance] = useState(25);
  const set = (patch: Partial<CostInput>) => setInput((cur) => clampInput({ ...cur, ...patch }));
  const r = useMemo(() => estimate(input), [input]);
  const rows = useMemo(() => compare(input), [input]);
  const days = coverDays(balance, r);
  const perPostWord = r.perPost === null ? null : r.perPost;

  return (
    <section className="xc" aria-label="حاسبة تكلفة واجهة X">
      <p className="xc-lead">
        <Rich text="تقدير لما قد تدفعه X إن نشر الموقع عبر واجهتها المدفوعة. النشر بالرابط لا يدخل هنا: هو مجاني. وما يُحاسَب اليوم هو فحص الاتصال وحده، إن رُبط حساب." />
      </p>

      <div className="xc-scn" role="group" aria-label="ابدأ من حالة جاهزة">
        <span>ابدأ من</span>
        <span className="seg">
          {SCENARIOS.map((s) => (
            <button key={s.id} type="button" title={s.note} onClick={() => setInput(clampInput({ ...DEFAULT_INPUT, months: input.months, ...s.input }))}>
              {s.label}
            </button>
          ))}
        </span>
        <small>{SCENARIOS.map((s) => `${s.label}: ${s.note}`).join(' · ')}</small>
      </div>

      <div className="xc-grid">
        <div className="xc-f xc-wide">
          <span id="xc-period" className="xc-label">
            المدة
          </span>
          <div className="xc-period">
            <span className="seg" role="group" aria-labelledby="xc-period">
              {PERIODS.map((m) => (
                <button key={m} type="button" aria-pressed={input.months === m} onClick={() => set({ months: m })}>
                  {periodAr(m)}
                </button>
              ))}
            </span>
            <Num label="أو بالأشهر" value={input.months} onChange={(v) => set({ months: v })} end="شهراً" />
          </div>
        </div>

        <div className="xc-f xc-wide">
          <div className="xc-period">
            <Num label="عدد المنشورات" value={input.posts} onChange={(v) => set({ posts: v })} />
            <span className="seg" role="group" aria-label="في كل">
              {(['day', 'week', 'month'] as Per[]).map((p) => (
                <button key={p} type="button" aria-pressed={input.per === p} onClick={() => set({ per: p })}>
                  {PER_AR[p]}
                </button>
              ))}
            </span>
          </div>
        </div>

        <Share
          label="المنشورات التي فيها رابط"
          value={input.linkShare}
          onChange={(v) => set({ linkShare: v })}
          hint={
            <>
              المنشور الذي فيه رابط يكلّف <Money mills={PRICE.postWithUrl} /> بدل <Money mills={PRICE.post} />: نحو {Math.floor(PRICE.postWithUrl / PRICE.post)} ضعفاً.
            </>
          }
        />
        <Share label="المنشورات التي فيها صورة أو فيديو" value={input.mediaShare} onChange={(v) => set({ mediaShare: v })} hint={<Rich text="لا تسعّر X رفع الصور والفيديو في صفحة أسعارها. التفاصيل أدناه." />} />
      </div>

      <details className="xc-more">
        <summary>تفاصيل أدق</summary>
        <div className="xc-grid">
          <Num label="الصور في المنشور الواحد الذي فيه صور" value={input.mediaPerPost} onChange={(v) => set({ mediaPerPost: v })} hint="حتى 4 صور في المنشور. الفيديو والصورة المتحركة واحد." />
          <div className="xc-f">
            <label className="switch" htmlFor="xc-media-billed">
              <input id="xc-media-billed" type="checkbox" checked={input.mediaBilled} onChange={(e) => set({ mediaBilled: e.target.checked })} />
              <i aria-hidden="true" />
              <span>الرقم الأحوط للوسائط</span>
            </label>
            <small className="xc-hint">
              يضيف <Money mills={PRICE.mediaMetadata} /> لكل صورة أو مقطع، وهو سعر <Rich text="Media Metadata" />، أقرب سطر في أسعار <Rich text="X" />.
            </small>
          </div>
          <Num label="منشورات تُحذف في الشهر" value={input.deletes} onChange={(v) => set({ deletes: v })} />
          <Num label="فحوصات الاتصال في اليوم" value={input.checksPerDay} onChange={(v) => set({ checksPerDay: v })} hint="يفحص الموقع الحساب حين تُفتح صفحة الحسابات، ولا يعيد قبل نصف ساعة." />
          <Num label="قراءات أرقام المنشورات في الشهر" value={input.reads} onChange={(v) => set({ reads: v })} hint="الموقع لا يقرأ أرقام X اليوم. اترك صفراً ما لم يُبنَ ذلك." />
        </div>
      </details>

      <div className="xc-result">
        <p className="xc-total" role="status" aria-live="polite">
          <span>نحو</span> <b><Money mills={r.total} /></b> <span>خلال {periodAr(r.input.months)}</span>
        </p>
        <p className="xc-sub">
          <Money mills={r.perMonth} /> في الشهر · <Money mills={r.perDay} /> في اليوم · {n(r.posts)} منشوراً
          {perPostWord !== null && (
            <>
              {' '}
              · متوسط المنشور <Money mills={perPostWord} />
            </>
          )}
        </p>
        <p className="xc-insight">
          {r.posts === 0 ? (
            'لا منشورات هنا: ما تراه هو فحص الاتصال وما أضفته من بنود.'
          ) : r.linkPosts > 0 ? (
            <>
              الروابط: {n(r.linkPosts)} منشوراً ({r.input.linkShare}% من المنشورات) تكلّف {r.linkShareOfCost}% من المجموع. بلا روابط يصير المجموع <Money mills={r.withoutLinks} />.
            </>
          ) : (
            <>
              لا روابط في هذا الفرض، فكل منشور <Money mills={PRICE.post} />.
            </>
          )}
        </p>

        <ul className="xc-lines">
          {r.lines
            .filter((l) => l.count > 0)
            .map((l) => (
              <li key={l.id} data-line={l.id}>
                <div className="xc-line-head">
                  <b>{LINE_AR[l.id]}</b>
                  <span className="xc-basis" data-basis={l.basis}>
                    {BASIS_AR[l.basis]}
                  </span>
                </div>
                <div className="xc-bar" aria-hidden="true">
                  <i style={{ width: `${r.total > 0 ? Math.max(l.total > 0 ? 2 : 0, Math.round((l.total * 100) / r.total)) : 0}%` }} />
                </div>
                <div className="xc-line-fig">
                  <bdi dir="ltr">
                    {n(l.count)} × {l.unit > 0 ? usd(l.unit) : '?'}
                  </bdi>
                  <b>{l.unit > 0 ? <Money mills={l.total} /> : 'بلا سعر معلن'}</b>
                </div>
              </li>
            ))}
        </ul>

        <p className="xc-free">
          بالرابط، المسار المجاني: <Money mills={0} /> للنشر. يجهّز الموقع النص، ويفتح مسؤول النشر <Rich text="X" /> وينشر بيده ثم يلصق رابط المنشور. يُضاف الحساب بالرابط من «حسابات المنصات».
        </p>
      </div>

      <div className="xc-box xc-tbl">
        <div className="gd-scroll">
          <table>
            <caption>الفترات نفسها بالنشاط نفسه</caption>
            <thead>
              <tr>
                <th scope="col">المدة</th>
                <th scope="col">المجموع</th>
                <th scope="col">في الشهر</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((x) => (
                <tr key={x.months} aria-current={x.months === input.months ? 'true' : undefined}>
                  <td>{periodAr(x.months)}</td>
                  <td>
                    <Money mills={x.total} />
                  </td>
                  <td>
                    <Money mills={Math.round(x.total / x.months)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="xc-box xc-budget">
        <Num label="رصيد تفكر في شحنه (بالدولار)" value={balance} onChange={(v) => setBalance(Math.min(100000, Math.max(0, Math.round(v))))} end="دولار" />
        <p role="status">
          {days === null ? (
            'لا إنفاق في هذا الفرض: الرصيد لا ينفد.'
          ) : days === 0 ? (
            'لا رصيد.'
          ) : (
            <>
              يكفي هذا الرصيد نحو {n(days)} يوماً ({(days / 30.4375).toFixed(1)} شهراً) بهذا الإنفاق.
            </>
          )}
        </p>
        {r.total > 0 && (
          <p>
            حد إنفاق شهري يُقترح وضعه في وحدة المطوّرين: <bdi dir="ltr">${n(r.limitDollars)}</bdi>، أي تكلفة الشهر وخُمسها زيادة. إن بلغته <Rich text="X" /> أوقفت الطلبات حتى الدورة التالية.
          </p>
        )}
        <small>
          <Rich text={X_FREE_CREDITS} />
        </small>
      </div>

      <details className="xc-more">
        <summary>
          <Rich text="ما الذي تتيحه واجهة X وما يكلّفه" />
        </summary>
        <ul className="xc-can">
          {X_CAN.map((row) => (
            <li key={row.what}>
              <div className="xc-line-head">
                <b>
                  <Rich text={row.what} />
                </b>
                <span className="xc-basis" data-basis={row.basis}>
                  {row.cost}
                </span>
              </div>
              <p>
                <Rich text={row.note} />
              </p>
            </li>
          ))}
        </ul>
      </details>

      <aside className="xc-unknown" aria-label="ما لم تقله X">
        <b>
          <CircleAlert aria-hidden="true" /> <Rich text="ما لا تقوله X، وكيف يُحسم" />
        </b>
        <ul>
          {X_UNKNOWN.map((t) => (
            <li key={t}>
              <Rich text={t} />
            </li>
          ))}
        </ul>
        <small>
          <Rich text={`الأسعار من صفحة أسعار X (docs.x.com) كما قُرئت في ${X_PRICES_READ}، وتتغير. هذا تقدير حسابي من إدخالك، لا فاتورة.`} />
        </small>
      </aside>
    </section>
  );
}

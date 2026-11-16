'use client';
// A setup guide shown as one page (MVP_draft.md section 67.10), the director's choice of 2026-11-16, for the guides in
// WHOLE_GUIDES: the list of steps with their parts on one side, and every step on the other, one after another, each with
// its name, why, its link, its actions, and each picture under the actions it shows, small, opening at its own size on a
// click. Where each piece goes is src/lib/guide-layout.ts. Saving a step, the keys and a review are the sheet's own
// (platform-sheet.tsx, keys-form.tsx): this file only draws them. The list comes first in the document, so the sides follow
// the language, as in the step sheet.
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Check, Copy, ExternalLink, FileText, ZoomIn } from 'lucide-react';
import { SHOT_MAX, layoutStep, phaseOf, phasesOf, shotCount, type CopyValue, type KeyField } from '@/lib/guide-layout';
import { plainText } from '@/lib/guide-text';
import type { Guide, GuideShot, GuideStep } from '@/lib/setup-guides';
import { GuideInfo, GuideTables, Rich } from '../guide-text';
import { useKeysForm, type KeysForm, type KeysProps } from './keys-form';

const TOP = 'top';
const FINISH = 'finish';
const reduce = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function GuideDoc({
  guide,
  ids,
  done,
  at,
  start,
  failed,
  finish,
  keys,
  submitted,
  bar,
  onPick,
}: {
  guide: Guide;
  ids: string[];
  done: Set<string>;
  /** The step reached: when it changes, the page goes to it. */
  at: string | null;
  /** Where the page opens: a step's id, or the top. */
  start: string | null;
  failed: boolean;
  /** The finishing summary, first on the page when it is shown. */
  finish: ReactNode | null;
  /** The keys form, for the keys step; null when the platform has no app. */
  keys: KeysProps | null;
  /** A review was reported as submitted. */
  submitted: boolean;
  /** The buttons under a step that is not the keys step. */
  bar: (step: GuideStep, id: string) => ReactNode;
  onPick: (id: string) => void;
}) {
  const base = useId();
  const sid = useCallback((id: string) => `${base}-${id}`, [base]);
  const rootRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  const [cur, setCur] = useState<string>(start ?? (finish ? FINISH : TOP));
  const [narrow] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 820px)').matches);
  const [zoom, setZoom] = useState<{ step: GuideStep; i: number } | null>(null);
  const total = ids.length;
  const left = total - done.size;
  const hasFinish = Boolean(finish);

  /** The element that scrolls: the steps' column, or the whole body on a phone. */
  const scroller = useCallback(() => {
    const main = mainRef.current;
    if (main && /(auto|scroll)/.test(getComputedStyle(main).overflowY)) return main;
    return rootRef.current;
  }, []);
  const go = useCallback(
    (id: string, smooth: boolean) => {
      const box = scroller();
      const sec = document.getElementById(sid(id));
      if (!box || !sec) return;
      const top = box.scrollTop + sec.getBoundingClientRect().top - box.getBoundingClientRect().top - 8;
      box.scrollTo({ top: Math.max(0, top), behavior: smooth && !reduce() ? 'smooth' : 'auto' });
    },
    [scroller, sid],
  );

  // Opening: straight to where the person stopped, once the sheet is open (it opens after this effect, so on the next frame).
  const opening = useRef(start ?? (finish ? FINISH : TOP));
  useEffect(() => {
    const f = requestAnimationFrame(() => go(opening.current, false));
    return () => cancelAnimationFrame(f);
  }, [go]);
  // A step finished, or picked from the list: go to the one reached.
  const last = useRef(at);
  useEffect(() => {
    if (last.current === at) return;
    last.current = at;
    go(at ?? (hasFinish ? FINISH : TOP), true);
  }, [at, hasFinish, go]);

  // The list marks the section being read.
  useEffect(() => {
    const box = scroller();
    if (!box || typeof IntersectionObserver === 'undefined') return;
    const seen = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setCur((e.target as HTMLElement).dataset.step ?? TOP);
      },
      { root: box, rootMargin: '-6% 0px -72% 0px' },
    );
    for (const s of box.querySelectorAll('.gdoc-sec')) seen.observe(s);
    return () => seen.disconnect();
  }, [scroller, hasFinish]);

  const pick = (id: string) => {
    go(id, true);
    if (id !== TOP && id !== FINISH) onPick(id);
  };
  const tocItem = (id: string, n: ReactNode, label: ReactNode, extra?: ReactNode, state = '') => (
    <button type="button" className={`gdoc-ti ${state}${cur === id ? ' cur' : ''}`} data-to={id} aria-current={cur === id ? 'location' : undefined} onClick={() => pick(id)}>
      <span className="gdoc-ti-n">{n}</span>
      <span className="gdoc-ti-t">{label}</span>
      {extra}
    </button>
  );

  return (
    <div className="gdoc" ref={rootRef}>
      <nav className="gdoc-toc" aria-label="الخطوات">
        <div className="gdoc-toc-top">
          <b>{left === 0 ? 'اكتملت الخطوات' : `أُنجز ${done.size} وبقي ${left}`}</b>
          {failed ? (
            <span className="pf-saved bad" role="alert">
              تعذّر حفظ التقدم، فأعد المحاولة قبل الإغلاق.
            </span>
          ) : (
            <span className="pf-saved">
              <Check aria-hidden="true" />
              يُحفظ تقدمك، فتغلق وتعود متى شئت
            </span>
          )}
        </div>
        <details className="gdoc-toc-list" open={!narrow}>
          <summary>كل الخطوات</summary>
          {finish && tocItem(FINISH, <Check aria-hidden="true" />, 'كل شيء جاهز', undefined, 'done')}
          {tocItem(TOP, <FileText aria-hidden="true" />, 'قبل البدء')}
          {phasesOf(guide).map((ph, pi) => (
            <div className="gdoc-ph" key={ph.t ?? pi}>
              {ph.t && <span className="gdoc-phl">{ph.t}</span>}
              <ol>
                {ph.steps.map((s) => {
                  const id = ids[guide.steps.indexOf(s)];
                  const ok = done.has(id);
                  return (
                    <li key={id}>
                      {tocItem(
                        id,
                        ok ? <Check aria-hidden="true" /> : guide.steps.indexOf(s) + 1,
                        <Rich text={s.t} />,
                        s.tag ? (
                          <small className="pf-tag">
                            <Rich text={s.tag} />
                          </small>
                        ) : undefined,
                        ok ? 'done' : '',
                      )}
                    </li>
                  );
                })}
              </ol>
            </div>
          ))}
        </details>
      </nav>
      <div className="gdoc-main" ref={mainRef}>
        {finish && (
          <section className="gdoc-sec gdoc-finish" id={sid(FINISH)} data-step={FINISH}>
            {finish}
          </section>
        )}
        <section className="gdoc-sec" id={sid(TOP)} data-step={TOP}>
          <header className="gdoc-head">
            <span className="gdoc-eye">قبل أن تبدأ</span>
            <h3>
              <Rich text={guide.title} />
            </h3>
            <p className="gdoc-why">
              <Rich text={guide.intro} />
            </p>
            <dl className="gdoc-facts">
              <div>
                <dt>الخطوات</dt>
                <dd>{total}</dd>
              </div>
              <div>
                <dt>الصور</dt>
                <dd>{shotCount(guide)}</dd>
              </div>
              {guide.link && (
                <div>
                  <dt>صفحة المنصة</dt>
                  <dd>
                    <a className="pf-link" href={guide.link.href} target="_blank" rel="noopener noreferrer">
                      <Rich text={guide.link.label} />
                      <ExternalLink aria-hidden="true" />
                    </a>
                  </dd>
                </div>
              )}
            </dl>
          </header>
          {guide.notes && guide.notes.length > 0 && (
            <div className="gdoc-notes">
              <h4>ملاحظات مهمة</h4>
              <GuideInfo items={guide.notes} />
            </div>
          )}
        </section>
        {guide.steps.map((s, i) =>
          s.kind === 'keys' && keys ? (
            <KeysSection key={ids[i]} sid={sid(ids[i])} id={ids[i]} guide={guide} step={s} n={i + 1} done={done.has(ids[i])} keys={keys} onZoom={(z) => setZoom({ step: s, i: z })} />
          ) : (
            <StepSection key={ids[i]} sid={sid(ids[i])} id={ids[i]} guide={guide} step={s} n={i + 1} done={done.has(ids[i])} submitted={submitted} bar={bar(s, ids[i])} onZoom={(z) => setZoom({ step: s, i: z })} />
          ),
        )}
      </div>
      {zoom && <ShotViewer title={plainText(zoom.step.t)} shots={zoom.step.shots ?? []} index={zoom.i} onIndex={(i) => setZoom({ step: zoom.step, i })} onClose={() => setZoom(null)} />}
    </div>
  );
}

type SectionProps = { sid: string; id: string; guide: Guide; step: GuideStep; n: number; done: boolean; onZoom: (i: number) => void };

function KeysSection({ keys, ...p }: SectionProps & { keys: KeysProps }) {
  const form = useKeysForm(keys);
  return <StepSection {...p} form={form} bar={form.button} />;
}

/** One step: its head, its actions with what they ask for, the pictures under the actions they show, and its button. */
function StepSection({ sid, id, guide, step, n, done, submitted, form, bar, onZoom }: SectionProps & { submitted?: boolean; form?: KeysForm; bar: ReactNode }) {
  const laid = layoutStep(step, { keys: form?.keys });
  const rings = new Set((step.shots ?? []).flatMap((s) => s.rings ?? []));
  const numbered = [...rings].some((r) => r !== 'x');
  const shots = step.shots ?? [];
  const phase = phaseOf(guide, id);
  const field = (f: KeyField) => (form ? <div key={f}>{form.field[f]}</div> : null);
  const nothing = !step.todo?.length && !step.copy && !step.kind;
  return (
    <section className={`gdoc-sec${done ? ' done' : ''}`} id={sid} data-step={id} aria-labelledby={`${sid}-h`}>
      <header className="gdoc-head">
        <span className="gdoc-eye">
          الخطوة {n} من {guide.steps.length}
          {phase && ` · ${phase}`}
        </span>
        <div className="gdoc-title">
          <span className="gdoc-num" aria-hidden="true">
            {done ? <Check /> : n}
          </span>
          <h3 id={`${sid}-h`}>
            <Rich text={step.t} />
          </h3>
          {step.tag && (
            <small className="pf-tag">
              <Rich text={step.tag} />
            </small>
          )}
        </div>
        {step.b && (
          <p className="gdoc-why">
            <Rich text={step.b} />
          </p>
        )}
        {(step.link || shots.length > 0) && (
          <div className="gdoc-go">
            {step.link && (
              <a className="pf-btn gdoc-link" href={step.link.href} target="_blank" rel="noopener noreferrer">
                <Rich text={`افتح ${step.link.label}`} />
                <ExternalLink aria-hidden="true" />
              </a>
            )}
            {shots.length > 0 && (
              <span className="gd-legend gdoc-legend">
                {numbered && (
                  <span>
                    <i className="gd-ring">1</i>
                    رقم الحلقة هو رقم العمل في القائمة
                  </span>
                )}
                {rings.has('x') && (
                  <span>
                    <i className="gd-ring x" aria-hidden="true" />
                    الحلقة الحمراء: لا تفعل هذا
                  </span>
                )}
                <span>
                  <ZoomIn aria-hidden="true" />
                  اضغط الصورة لتكبيرها
                </span>
              </span>
            )}
          </div>
        )}
        {done && <p className="pf-note ok">أنجزت هذه الخطوة من قبل. راجعها إن شئت ثم تابع.</p>}
      </header>
      {form?.top}
      {laid.parts.map((part, pi) => (
        <div className="gdoc-part" key={pi}>
          {part.acts.length > 0 && (
            <ol className="gdoc-acts">
              {part.acts.map((a) => (
                <li key={a.n} value={a.n} className={a.ringed ? 'ringed' : undefined}>
                  <span className="gdoc-n" aria-hidden="true">
                    {a.n}
                  </span>
                  <div className="gdoc-act">
                    <p>
                      <Rich text={a.t} copy />
                    </p>
                    {a.copies.map((c) => (
                      <CopyBlock key={c.label} c={c} />
                    ))}
                    {a.fields.map(field)}
                  </div>
                </li>
              ))}
            </ol>
          )}
          {part.shots.length > 0 && (
            <div className="gdoc-shots">
              {part.shots.map((s) => (
                <Shot key={s.src} shot={s} n={s.i + 1} of={shots.length} onZoom={() => onZoom(s.i)} />
              ))}
            </div>
          )}
        </div>
      ))}
      <div className="gdoc-more">
        {nothing && <p className="gdoc-plain">لا يحتاج الموقع منك شيئاً هنا. أنجزها في الصفحة التي فتحتها، ثم عُد وأكّد.</p>}
        {step.kind === 'review' && <p className="gdoc-plain">لا تخبر المنصة الموقع بما قررت، فقل له أنت أين وصل الطلب.</p>}
        {laid.copies.map((c) => (
          <CopyBlock key={c.label} c={c} />
        ))}
        {laid.fields.map(field)}
        {step.info && step.info.length > 0 && <GuideInfo items={step.info} />}
        {step.tables && step.tables.length > 0 && <GuideTables tables={step.tables} />}
        {form?.after}
        {step.kind === 'review' && submitted && <p className="pf-note info">قُدّم الطلب، وننتظر قرار المنصة.</p>}
      </div>
      <div className="gdoc-bar pf-acts">{bar}</div>
    </section>
  );
}

/** A value to copy exactly, whole, wrapping between words. */
function CopyBlock({ c }: { c: CopyValue }) {
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const prose = (c.value.match(/ /g) ?? []).length > 6;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(c.value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // A page without clipboard access: leave the value selected for Ctrl+C.
      const r = document.createRange();
      if (!ref.current) return;
      r.selectNodeContents(ref.current);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(r);
    }
  };
  return (
    <div className="gdoc-copy" role="group" aria-label={plainText(c.label)}>
      <span className="gdoc-copy-l">
        <Rich text={c.label} />
      </span>
      <div className="gdoc-copy-row">
        <div ref={ref} className={`gdoc-copy-v${prose ? ' prose' : ''}`} dir="ltr">
          {c.value}
        </div>
        <button type="button" className="pf-btn" onClick={() => void copy()}>
          <Copy aria-hidden="true" />
          {copied ? 'نُسخ' : 'نسخ'}
        </button>
      </div>
    </div>
  );
}

/** A picture of the platform's page, drawn small; a click opens it at its own size. */
function Shot({ shot, n, of, onZoom }: { shot: GuideShot; n: number; of: number; onZoom: () => void }) {
  return (
    <figure className="gdoc-shot" style={{ maxWidth: Math.min(shot.w, SHOT_MAX) }} data-rings={(shot.rings ?? []).join(' ')}>
      <button type="button" className="gdoc-zoom" aria-label={`${shot.alt}. اضغط لتكبير الصورة`} onClick={onZoom}>
        <img src={shot.src} alt={shot.alt} width={shot.w} height={shot.h} loading="lazy" decoding="async" />
        <span className="gdoc-zoom-i" aria-hidden="true">
          <ZoomIn />
        </span>
      </button>
      {(of > 1 || shot.caption) && (
        <figcaption>
          {of > 1 && <b className="gd-order">{`الصورة ${n} من ${of}`}</b>}
          {shot.caption && <Rich text={shot.caption} />}
        </figcaption>
      )}
    </figure>
  );
}

/** The step's pictures at their own size, one at a time, over the sheet. Escape closes this alone. */
function ShotViewer({ title, shots, index, onIndex, onClose }: { title: string; shots: GuideShot[]; index: number; onIndex: (i: number) => void; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [actual, setActual] = useState(false);
  useEffect(() => {
    const d = ref.current;
    d?.showModal();
    return () => d?.close();
  }, []);
  useEffect(() => setActual(false), [index]);
  // The arrow keys page through, wherever the focus is: the viewer is modal, so every key is its own. In Arabic the left arrow goes on.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      const rtl = ref.current ? getComputedStyle(ref.current).direction === 'rtl' : true;
      const i = index + ((e.key === 'ArrowLeft') === rtl ? 1 : -1);
      if (i >= 0 && i < shots.length) onIndex(i);
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [index, shots.length, onIndex]);
  const s = shots[index];
  if (!s) return null;
  const move = (d: number) => {
    const i = index + d;
    if (i >= 0 && i < shots.length) onIndex(i);
  };
  // An end is said, not disabled: a disabled button would drop the focus out of the viewer.
  const end = (at: boolean) => (at ? { 'aria-disabled': true as const } : {});
  return (
    <dialog
      ref={ref}
      className="gdoc-view"
      aria-label={`${title}: الصورة ${index + 1} من ${shots.length}`}
      // The sheet is a dialog too: what happens here stays here.
      onCancel={(e) => {
        e.stopPropagation();
        e.preventDefault();
        onClose();
      }}
      onClose={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="gdoc-view-bar">
        <p>
          <b>{`${title} · الصورة ${index + 1} من ${shots.length}`}</b>
          <Rich text={s.caption ?? s.alt} />
        </p>
        <div className="pf-acts">
          <button type="button" className="pf-btn" {...end(index === 0)} onClick={() => move(-1)}>
            السابقة
          </button>
          <button type="button" className="pf-btn" {...end(index === shots.length - 1)} onClick={() => move(1)}>
            التالية
          </button>
          <button type="button" className="pf-btn pri" onClick={onClose}>
            إغلاق
          </button>
        </div>
      </div>
      <div className={`gdoc-view-pic${actual ? ' actual' : ''}`}>
        <img src={s.src} alt={s.alt} width={s.w} height={s.h} onClick={() => setActual((a) => !a)} />
      </div>
    </dialog>
  );
}

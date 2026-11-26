'use client';
// The setup sheet of «المنصات» (MVP_draft.md section 67): the steps with their links on one side, what the site needs on
// the other, and a bar. Every step taken is saved in the database (platform_setup_save), so closing loses nothing, on
// any device. A secret is never part of that: it goes to the vault when the platform accepts it, through the same route
// as the app block of «الاتصالات». The steps are the guides of src/lib/setup-guides.ts, one place for the sheet and the
// circled "!"; the rules are the database's. The guides in WHOLE_GUIDES are drawn as one page (guide-doc.tsx, MVP_draft.md
// section 67.10) with the same saving, keys and review as the step sheet.
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Check } from 'lucide-react';
import type { needProps } from '@/lib/kit/need';
import { supabase } from '@/lib/supabase/client';
import { GUIDES, resolveGuide, type GuideStep } from '@/lib/setup-guides';
import { isWholeGuide } from '@/lib/guide-layout';
import { expiryLineAr, expiryOf, riyadhToday } from '@/lib/integrations/expiry';
import type { Integration } from '@/lib/integrations/rules';
import { providerOf, type ConnProvider } from '@/lib/platforms/provider';
import { CHIP_CLASS, chipOf, countAccounts, doneSteps, firstOpen, setupGuideOf, stepId, type PlatformState, type SetupRow } from '@/lib/platforms/setup';
import type { PlatformInfo } from '@/lib/work/rules';
import { PlatformTile } from '../platform-icon';
import { GuideInfo, GuideShots, GuideTables, GuideTodo, Rich } from '../guide-text';
import { GuideTool } from '../guide-tool';
import { CopyField, Sheet, SheetHead, SheetProgress, SheetSteps } from '../sheet';
import { GuideDoc } from './guide-doc';
import { useKeysForm, type KeysProps } from './keys-form';

export type SheetTo = 'first' | 'keys' | 'review' | 'finish';
type Act = (fn: string, args: Record<string, unknown>, ok: string) => Promise<boolean>;
type Lock = (why: string) => ReturnType<typeof needProps>;
type Fields = SetupRow['fields'];

const SUB: Record<string, string> = {
  meta: 'تُجرى مرة واحدة. بعدها تُضاف الحسابات من «حسابات المنصات» بتسجيل دخول واحد.',
  facebook: 'تُجرى مرة واحدة. بعدها تُضاف الصفحات من «حسابات المنصات» بتسجيل دخول واحد.',
  google: 'تطبيق Google واحد يخدم يوتيوب وDrive، فلا تُنشئ تطبيقين.',
  manual: 'لا ربط تلقائي: يُنشر من تطبيق المنصة بحزمة جاهزة، ويؤكد مسؤول النشر أنه نُشر.',
};
const SUB_DEFAULT = 'تُجرى مرة واحدة. بعدها تُضاف الحسابات من «حسابات المنصات» بلا أي من هذه الخطوات.';
const LOCKED = 'إكمال الإعداد لمن يملك «إدارة المنصات وتطبيقاتها».';

export function PlatformSheet({
  p,
  app,
  setup,
  state,
  accounts,
  to,
  canManage,
  canSecrets,
  lock,
  act,
  onClose,
  onChanged,
  say,
  children,
}: {
  p: PlatformInfo;
  app: Integration | undefined;
  setup: SetupRow | null;
  state: PlatformState;
  accounts: number;
  to: SheetTo;
  canManage: boolean;
  canSecrets: boolean;
  lock: Lock;
  act: Act;
  onClose: () => void;
  onChanged: () => Promise<void>;
  say: (text: string) => void;
  /** «خيارات متقدمة», drawn by the tab. */
  children: ReactNode;
}) {
  const guideKey = setupGuideOf(p.key);
  const provider = providerOf(p.key);
  const [origin, setOrigin] = useState('');
  useEffect(() => setOrigin(window.location.origin), []);
  const guide = useMemo(() => resolveGuide(GUIDES[guideKey ?? 'manual'], origin || 'https://موقعك', provider ?? undefined), [guideKey, origin, provider]);
  const steps = guide.steps;
  const hasKeys = app?.has_secret === true;
  const ids = steps.map(stepId);
  const [saved, setSaved] = useState<string[]>(setup?.done ?? []);
  const [fields, setFields] = useState<Fields>(setup?.fields ?? {});
  const [failed, setFailed] = useState(false);
  const done = useMemo(() => (guideKey ? doneSteps(steps, { done: saved }, hasKeys) : new Set(ids)), [guideKey, steps, saved, hasKeys, ids]);
  const find = (kind: GuideStep['kind']) => {
    const i = steps.findIndex((s) => s.kind === kind);
    return i < 0 ? null : ids[i];
  };
  const [at, setAt] = useState<string | null>(() => {
    if (!guideKey || to === 'finish') return null;
    if (to === 'keys') return find('keys');
    if (to === 'review') return find('review');
    return setup?.step && ids.includes(setup.step) && !done.has(setup.step) ? setup.step : firstOpen(steps, done);
  });
  // A guide drawn as one page opens where the person stopped, or at its top when nothing was started.
  const [startAt] = useState<string | null>(() => (to === 'finish' ? null : to !== 'first' || setup !== null || done.size > 0 ? at : null));
  const [finishShown, setFinishShown] = useState(to === 'finish');
  const cur = at === null ? null : (steps[ids.indexOf(at)] ?? null);
  const pct = Math.round((done.size / steps.length) * 100);
  const marks = ids.map((id) => (id === at ? 'cur' : done.has(id) ? 'done' : 'todo')) as ('done' | 'cur' | 'todo')[];
  const left = steps.length - done.size;
  const n = at === null ? 0 : ids.indexOf(at) + 1;

  const persist = async (nextDone: string[], nextAt: string | null, nextFields: Fields) => {
    if (!guideKey || !canManage) return;
    const { error } = await supabase().rpc('platform_setup_save', { p_key: p.key, p_done: nextDone, p_step: nextAt, p_fields: nextFields });
    setFailed(Boolean(error));
  };
  const open = (id: string | null) => {
    setAt(id);
    void persist(saved, id, fields);
  };
  /** The step is done: on to the next one still open. */
  const finishStep = async (id: string, nextFields: Fields = fields) => {
    const nextDone = [...new Set([...saved, id])];
    const next = firstOpen(steps, doneSteps(steps, { done: nextDone }, hasKeys || id === find('keys')));
    setSaved(nextDone);
    setFields(nextFields);
    setAt(next);
    if (next === null) setFinishShown(true);
    await persist(nextDone, next, nextFields);
  };
  const close = () => {
    const total = steps.length;
    if (guideKey && done.size > 0 && done.size < total && state !== 'ok') say(`حُفظ تقدمك: ${done.size} من ${total}. تعود إليه من سطر ${p.label_ar}.`);
    onClose();
  };
  const keysProps = (k: Omit<KeysProps, 'provider'>): KeysProps | null => (provider ? { provider, ...k } : null);
  const onKeysSaved = (id: string) => async (f: Fields) => {
    if (!p.enabled) await act('platform_set_enabled', { p_key: p.key, p_on: true }, `فُعّلت ${p.label_ar}.`);
    await onChanged();
    await finishStep(id, { ...fields, ...f });
  };
  const reviewState = (id: string) => async (next: 'submitted' | 'approved') => {
    const ok = await act('platform_set_readiness', { p_key: p.key, p_state: next, p_note: null }, next === 'submitted' ? `سُجّل أن الطلب قُدّم. يبقى الربط محدوداً إلى أن توافق المنصة.` : 'سُجّلت موافقة المنصة.');
    if (ok) await finishStep(id);
  };
  const finishPanel = (
    <FinishPanel p={p} app={app} provider={provider} accounts={accounts} hasGuide={Boolean(guideKey)} onReplace={provider ? () => setAt(find('keys')) : undefined}>
      {children}
    </FinishPanel>
  );
  const head = (
    <SheetHead
      tile={<PlatformTile k={p.key} />}
      title={at === null ? p.label_ar : `إعداد ${p.label_ar}`}
      sub={<Rich text={(guideKey && SUB[guideKey]) || (guideKey ? SUB_DEFAULT : SUB.manual)} />}
      chip={<span className={`pf-chip ${CHIP_CLASS[state]}`}>{chipOf(state, done.size, steps.length)}</span>}
      onClose={close}
    />
  );

  if (guideKey && isWholeGuide(guideKey)) {
    // The summary stays on the page once shown: picking a step from the list no longer hides it.
    const showFinish = finishShown || at === null;
    return (
      <Sheet label={guide.title} onClose={close}>
        {head}
        <GuideDoc
          guide={guide}
          ids={ids}
          done={done}
          at={at}
          start={startAt}
          failed={failed}
          finish={showFinish ? finishPanel : null}
          keys={keysProps({ app, fields, problem: state === 'issue', canSecrets, lock, onSaved: onKeysSaved(find('keys') ?? 'keys') })}
          submitted={p.readiness === 'submitted'}
          bar={(s, id) =>
            s.kind === 'review' ? (
              <ReviewButtons step={s} submitted={p.readiness === 'submitted'} canManage={canManage} lock={lock} onSkip={() => void finishStep(id)} onState={reviewState(id)} />
            ) : (
              <button type="button" className="pf-btn pri" {...(canManage ? { onClick: () => void finishStep(id) } : lock(LOCKED))}>
                {done.has(id) ? 'متابعة' : <Rich text={s.ok ?? 'تمت'} />}
              </button>
            )
          }
          onPick={open}
        />
      </Sheet>
    );
  }

  return (
    <Sheet label={guide.title} onClose={close}>
      {head}
      {guideKey && (
        <SheetProgress
          at={at === null ? 'اكتملت الخطوات' : `الخطوة ${n} من ${steps.length}`}
          count={left === 0 ? undefined : `أُنجز ${done.size} وبقي ${left}`}
          marks={marks}
          pct={pct}
          saved={
            failed ? (
              <span className="pf-saved bad" role="alert">
                تعذّر حفظ التقدم، فأعد المحاولة قبل الإغلاق.
              </span>
            ) : (
              <span className="pf-saved">
                <Check aria-hidden="true" />
                يُحفظ تقدمك، فتغلق وتعود متى شئت
              </span>
            )
          }
        />
      )}
      <div className="pf-body">
        <SheetSteps steps={steps.map((s, i) => ({ id: ids[i], t: s.t, b: s.b, tag: s.tag, link: s.link, done: done.has(ids[i]) }))} at={at} onPick={guideKey ? open : (id) => setAt(id)}>
          {guide.notes && guide.notes.length > 0 && (
            <details className="pf-notes">
              <summary>ملاحظات مهمة</summary>
              <ul>
                {guide.notes.map((n) => (
                  <li key={n}>
                    <Rich text={n} />
                  </li>
                ))}
              </ul>
            </details>
          )}
        </SheetSteps>
        <div className="pf-input">
          {cur?.kind === 'keys' && provider ? (
            <KeysPanel
              key={at}
              step={cur}
              n={n}
              done={done.has(at!)}
              keys={keysProps({ app, fields, problem: state === 'issue', canSecrets, lock, onSaved: onKeysSaved(at!) })!}
            />
          ) : cur?.kind === 'review' ? (
            <ReviewPanel
              step={cur}
              n={n}
              done={done.has(at!)}
              submitted={p.readiness === 'submitted'}
              canManage={canManage}
              lock={lock}
              onSkip={() => void finishStep(at!)}
              onState={reviewState(at!)}
            />
          ) : cur ? (
            <StepPanel step={cur} n={n} done={done.has(at!)} canGoBack={ids.indexOf(at!) > 0} canManage={canManage} lock={lock} onDone={() => void finishStep(at!)} onBack={() => open(ids[ids.indexOf(at!) - 1])} manual={!guideKey} />
          ) : (
            finishPanel
          )}
        </div>
      </div>
    </Sheet>
  );
}

/** One step, as one card: its number and name, what to do, what to copy, the pictures, and the button that says it is done, which stays in view while the pictures scroll. */
function StepCard({ n, eyebrow, step, done, foot, children }: { n: number; eyebrow: string; step: GuideStep; done: boolean; foot?: ReactNode; children: ReactNode }) {
  return (
    <article className={`pf-card${done ? ' done' : ''}`} data-card={n}>
      <header className="pf-card-head">
        <span className="pf-card-num" aria-hidden="true">
          {done ? <Check /> : n}
        </span>
        <div className="pf-card-title">
          <span className="pf-eyebrow">{eyebrow}</span>
          <h3>
            <Rich text={step.t} />
          </h3>
        </div>
        {step.tag && (
          <small className="pf-tag">
            <Rich text={step.tag} />
          </small>
        )}
      </header>
      <div className="pf-card-body">{children}</div>
      {foot && <div className="pf-acts pf-card-foot">{foot}</div>}
    </article>
  );
}

function StepPanel({ step, n, done, canGoBack, canManage, lock, onDone, onBack, manual }: { step: GuideStep; n: number; done: boolean; canGoBack: boolean; canManage: boolean; lock: Lock; onDone: () => void; onBack: () => void; manual: boolean }) {
  const hasCopy = Boolean(step.copy);
  const todo = step.todo ?? [];
  return (
    <StepCard
      n={n}
      eyebrow={hasCopy ? 'انسخ هذا إلى صفحة المنصة' : 'في هذه الخطوة'}
      step={step}
      done={done}
      foot={
        manual ? undefined : (
          <>
            <button type="button" className="pf-btn pri" {...(canManage ? { onClick: onDone } : lock(LOCKED))}>
              {done ? 'متابعة' : (step.ok ?? 'تمت')}
            </button>
            {canGoBack && (
              <button type="button" className="pf-btn ghost" onClick={onBack}>
                السابق
              </button>
            )}
          </>
        )
      }
    >
      {done && !manual && <p className="pf-note ok">أنجزت هذه الخطوة من قبل. راجعها إن شئت ثم تابع.</p>}
      {todo.length > 0 && <GuideTodo items={todo} shots={step.shots} />}
      {step.info && step.info.length > 0 && <GuideInfo items={step.info} />}
      {step.tables && step.tables.length > 0 && <GuideTables tables={step.tables} />}
      {!hasCopy && !manual && todo.length === 0 &&<p>لا يحتاج الموقع منك شيئاً هنا. أنجزها في الصفحة التي فتحتها، ثم عُد وأكّد.</p>}
      {manual && (
        <p>
          <Rich text={step.b ?? ''} />
        </p>
      )}
      {step.copy && <CopyField label={step.copyLabel ?? 'العنوان'} value={step.copy} />}
      {step.more?.map((m) => <CopyField key={m.label} label={m.label} value={m.copy} />)}
      {step.shots && step.shots.length > 0 && <GuideShots shots={step.shots} />}
      {step.tool && <GuideTool tool={step.tool} />}
    </StepCard>
  );
}

/** The buttons of a review step: the platform decides, and the person says where the request is. */
function ReviewButtons({ step, submitted, canManage, lock, onSkip, onState }: { step: GuideStep; submitted: boolean; canManage: boolean; lock: Lock; onSkip: () => void; onState: (s: 'submitted' | 'approved') => void }) {
  return (
    <>
      {!submitted && (
        <button type="button" className="pf-btn pri" {...(canManage ? { onClick: () => onState('submitted') } : lock(LOCKED))}>
          قدّمت الطلب
        </button>
      )}
      <button type="button" className={`pf-btn ${submitted ? 'pri' : ''}`} {...(canManage ? { onClick: () => onState('approved') } : lock(LOCKED))}>
        وافقت المنصة
      </button>
      {step.ok && (
        <button type="button" className="pf-btn ghost" {...(canManage ? { onClick: onSkip } : lock(LOCKED))}>
          {step.ok}
        </button>
      )}
    </>
  );
}

function ReviewPanel({ step, n, done, submitted, canManage, lock, onSkip, onState }: { step: GuideStep; n: number; done: boolean; submitted: boolean; canManage: boolean; lock: Lock; onSkip: () => void; onState: (s: 'submitted' | 'approved') => void }) {
  return (
    <StepCard n={n} eyebrow="خارج الموقع: قرار المنصة" step={step} done={done} foot={<ReviewButtons step={step} submitted={submitted} canManage={canManage} lock={lock} onSkip={onSkip} onState={onState} />}>
      <p>لا تخبر المنصة الموقع بما قررت، فقل له أنت أين وصل الطلب.</p>
      {step.copy && <CopyField label={step.copyLabel ?? 'الرابط'} value={step.copy} />}
      {step.more?.map((m) => <CopyField key={m.label} label={m.label} value={m.copy} />)}
      {submitted && <p className="pf-note info">قُدّم الطلب، وننتظر قرار المنصة.</p>}
    </StepCard>
  );
}

function KeysPanel({ step, n, done, keys }: { step: GuideStep; n: number; done: boolean; keys: KeysProps }) {
  const k = useKeysForm(keys);
  return (
    <StepCard n={n} eyebrow="ما يحتاجه الموقع منك" step={step} done={done} foot={k.button}>
      {step.todo && step.todo.length > 0 && <GuideTodo items={step.todo} shots={step.shots} />}
      {step.shots && step.shots.length > 0 && <GuideShots shots={step.shots} />}
      {k.top}
      {k.field.id}
      {k.field.secret}
      {k.field.config}
      {k.field.more}
      {k.after}
    </StepCard>
  );
}

function FinishPanel({ p, app, provider, accounts, hasGuide, onReplace, children }: { p: PlatformInfo; app: Integration | undefined; provider: ConnProvider | null; accounts: number; hasGuide: boolean; onReplace?: () => void; children: ReactNode }) {
  const expiry = expiryOf(app?.config, riyadhToday());
  const line = expiryLineAr(expiry);
  return (
    <>
      <span className="pf-eyebrow">{hasGuide ? 'كل شيء جاهز' : 'لا يحتاج إعداداً'}</span>
      <h3>{hasGuide ? `${p.label_ar} جاهزة` : 'مسار يدوي'}</h3>
      <p>{hasGuide ? 'انتهى الإعداد. كل حساب بعد هذا يُضاف بتسجيل الدخول عند المنصة نفسها.' : 'لا مفاتيح هنا: أضف الحساب بالاسم، ويُنشر عليه من تطبيق المنصة بحزمة جاهزة.'}</p>
      <dl className="pf-facts">
        {app?.has_secret && (
          <div>
            <dt>السر</dt>
            <dd>
              في الخزنة (<bdi dir="ltr">{app.secret_tail ?? ''}</bdi>)
            </dd>
          </div>
        )}
        <div>
          <dt>الحسابات</dt>
          <dd>{countAccounts(accounts)}</dd>
        </div>
      </dl>
      {line && <p className={`pf-note ${expiry.state === 'ok' ? 'info' : 'bad'}`}>{line}</p>}
      <div className="pf-acts">
        {p.kind === 'social' && (
          <a className="pf-btn pri" href="/channels">
            حسابات {p.label_ar}
          </a>
        )}
        {provider && onReplace && app?.has_secret && (
          <button type="button" className="pf-btn" onClick={onReplace}>
            استبدال السر
          </button>
        )}
      </div>
      {children}
    </>
  );
}

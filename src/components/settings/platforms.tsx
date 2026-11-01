'use client';
// «المنصات» in Settings (MVP_draft.md section 67): every connection on one line, with one state worked out from what is
// stored and the one button it asks for. «إضافة منصة» opens every option, and a setup runs in the sheet of
// platform-sheet.tsx. What used to fill each card (limits, publishing path, the log, what a platform asks of the
// department) is folded under «خيارات متقدمة». Publishing is still a simulation for every platform, and the page says so.
// Every rule is in the database (platform_save and its neighbours); this page explains and asks.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, Plus } from 'lucide-react';
import { needProps } from '@/lib/kit/need';
import { HOLD } from '@/lib/kit/hold-reasons';
import { supabase } from '@/lib/supabase/client';
import { GUIDES } from '@/lib/setup-guides';
import {
  KNOWLEDGE,
  MODE_AR,
  MODE_HELP_AR,
  platformError,
  platformEventLine,
} from '@/lib/platforms/info';
import { limitsOf, limitsToAccepts } from '@/lib/platforms/limits';
import { APP_INTEGRATION_TYPE, CONN_PROVIDERS, PROVIDER_COPY, providerOf, type ConnProvider } from '@/lib/platforms/provider';
import { CHIP_CLASS, actionOf, addOptions, chipOf, doneSteps, firstOpen, lineOf, listed, needsYou, platformState, setupGuideOf, stateRank, stepId, type AddOption, type PlatformState, type SetupRow } from '@/lib/platforms/setup';
import { STATE_AR, STATE_TONE, type Integration } from '@/lib/integrations/rules';
import { expiryLineAr, expiryOf, riyadhToday } from '@/lib/integrations/expiry';
import type { PlatformInfo, PublishMode } from '@/lib/work/rules';
import { useCaps } from '../caps';
import { PlatformTile } from '../platform-icon';
import { Modal } from '../ui';
import { SetupGuide } from '../setup-guide';
import { PlatformSheet, type SheetTo } from './platform-sheet';

type Impact = { accounts: number; active_accounts: number; open_works: number; copies: number };
type LogRow = { id: number; at: string; kind: string; actor: string | null; actor_name: string | null; data: Record<string, unknown> };
type Apps = Partial<Record<ConnProvider, Integration>>;

const when = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString('ar-SA-u-nu-latn', { dateStyle: 'medium', timeStyle: 'short' }) : '');
const COLUMNS = 'key,label_ar,kind,sort,accepts,publish_mode,scheduling,requires_review,token_life_days,enabled,builtin,docs_url,readiness,readiness_note,readiness_at,readiness_by';

/** `initial` lets a check draw the tab without the database (qa/permissions-pages.cjs, qa/platforms-flow.cjs). */
export function PlatformsTab({ initial }: { initial?: { list: PlatformInfo[]; impact: Record<string, Impact>; apps?: Apps; setup?: Record<string, SetupRow>; open?: { key: string; to: SheetTo } } }) {
  const caps = useCaps();
  const [list, setList] = useState<PlatformInfo[] | null>(initial?.list ?? null);
  const [impact, setImpact] = useState<Record<string, Impact>>(initial?.impact ?? {});
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [apps, setApps] = useState<Apps>(initial?.apps ?? {});
  const [setup, setSetup] = useState<Record<string, SetupRow>>(initial?.setup ?? {});
  const [menu, setMenu] = useState(false);
  const [open, setOpen] = useState<{ key: string; to: SheetTo } | null>(initial?.open ?? null);
  const [dlg, setDlg] = useState<{ t: 'add' } | { t: 'edit'; p: PlatformInfo } | { t: 'delete'; p: PlatformInfo } | null>(null);
  const canManage = caps.has('platforms.manage');
  const canSecrets = caps.has('integrations.secrets') && canManage;
  const today = riyadhToday();

  const load = useCallback(async () => {
    const db = supabase();
    const { data, error } = await db.from('platforms').select(COLUMNS).order('sort');
    if (error) return setNote({ ok: false, text: 'تعذّر تحميل المنصات.' });
    const rows = data as PlatformInfo[];
    setList(rows);
    // What each platform holds: only those who may read it can ask.
    const out: Record<string, Impact> = {};
    await Promise.all(
      rows.map(async (r) => {
        const x = await db.rpc('platform_impact', { p_key: r.key });
        if (!x.error) out[r.key] = x.data as Impact;
      }),
    );
    setImpact(out);
    // The apps' non-secret half (the secret is never read back): which are entered, and their state.
    const ints = await db.rpc('int_list');
    if (!ints.error) {
      const rows = (ints.data ?? []) as Integration[];
      setApps(Object.fromEntries(CONN_PROVIDERS.map((p) => [p, rows.find((r) => r.type === APP_INTEGRATION_TYPE[p])])) as Apps);
    }
    // Saved progress. Before its migration the table is not there: the page works, and a save says it failed.
    const saved = await db.from('platform_setup').select('key,done,step,fields');
    if (!saved.error) setSetup(Object.fromEntries(((saved.data ?? []) as SetupRow[]).map((s) => [s.key, s])));
  }, []);
  useEffect(() => {
    if (!initial) void load();
  }, [initial, load]);

  useEffect(() => {
    if (!menu) return;
    const shut = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !(e.target as HTMLElement).closest('.pf-add')) setMenu(false);
    };
    document.addEventListener('click', shut);
    document.addEventListener('keydown', shut);
    return () => {
      document.removeEventListener('click', shut);
      document.removeEventListener('keydown', shut);
    };
  }, [menu]);

  const act = async (fn: string, args: Record<string, unknown>, ok: string) => {
    setBusy(true);
    const { error } = await supabase().rpc(fn, args);
    setBusy(false);
    if (error) {
      setNote({ ok: false, text: platformError(error.message) });
      return false;
    }
    setNote({ ok: true, text: ok });
    await load();
    return true;
  };

  const facts = useCallback(
    (p: PlatformInfo) => {
      const provider = providerOf(p.key);
      return { provider, app: provider ? apps[provider] : undefined, row: setup[p.key] ?? null, accounts: impact[p.key]?.accounts ?? 0 };
    },
    [apps, setup, impact],
  );
  const stateOf = useCallback(
    (p: PlatformInfo): PlatformState => {
      const { app, row } = facts(p);
      return platformState({ p, app, setup: row, today });
    },
    [facts, today],
  );

  const views = useMemo(
    () =>
      (list ?? [])
        .filter((p) => {
          const { app, row, accounts } = facts(p);
          return listed(p, { app, setup: row, accounts });
        })
        .map((p) => {
          const { provider, app, row, accounts } = facts(p);
          const state = stateOf(p);
          const guide = setupGuideOf(p.key);
          const steps = guide ? GUIDES[guide].steps : [];
          const done = doneSteps(steps, row, app?.has_secret === true);
          const open = firstOpen(steps, done);
          const next = open === null ? null : (steps[steps.map(stepId).indexOf(open)]?.t ?? null);
          return { p, state, accounts, chip: chipOf(state, done.size, steps.length), line: lineOf(state, { accounts, next, app, today, provider }) };
        })
        .sort((a, b) => stateRank(a.state) - stateRank(b.state) || a.p.sort - b.p.sort),
    [list, facts, stateOf, today],
  );
  const shown = useMemo(() => new Set(views.map((v) => v.p.key)), [views]);
  const options = useMemo(
    () => addOptions(list ?? [], (key) => (shown.has(key) ? stateOf((list ?? []).find((p) => p.key === key)!) : null)),
    [list, shown, stateOf],
  );

  if (!list) return <p className="muted">جارٍ تحميل المنصات…</p>;
  const lock = (why: string) => needProps('platforms.manage', why);
  const opened = open ? list.find((p) => p.key === open.key) : undefined;

  const pick = async (o: AddOption) => {
    setMenu(false);
    if (o.kind === 'custom') return setDlg({ t: 'add' });
    if (o.kind === 'open') return setOpen({ key: o.key, to: 'first' });
    const t = o.template;
    const saved = await act('platform_save', { p_key: t.key, p: { label_ar: t.label_ar, publish_mode: t.publish_mode, video_only: t.video_only, requires_review: t.requires_review, docs_url: null, ...limitsToAccepts(t.limits) } }, `أُضيفت «${t.label_ar}».`);
    if (!saved) return;
    if (o.manual) await act('platform_set_enabled', { p_key: t.key, p_on: true }, `أُضيفت «${t.label_ar}». أضف حسابها من «حسابات المنصات».`);
    else setOpen({ key: t.key, to: 'first' });
  };

  const todo = views.filter((v) => needsYou(v.state));
  const rest = views.filter((v) => !needsYou(v.state));
  const group = (title: string, rows: typeof views) =>
    rows.length > 0 && (
      <section className="pf-group" aria-label={title}>
        <h3>
          {title} <span>{rows.length}</span>
        </h3>
        {rows.map(({ p, state, accounts, chip, line }) => {
          const action = actionOf(state);
          return (
            <article className="pf-row" data-platform={p.key} data-state={state} key={p.key}>
              <PlatformTile k={p.key} />
              <div className="pf-row-text">
                <b>{p.label_ar}</b>
                <small>{line}</small>
              </div>
              <div className="pf-row-chip">
                <span className={`pf-chip ${CHIP_CLASS[state]}`}>{chip}</span>
              </div>
              <div className="pf-row-acts">
                {action && (
                  <button
                    type="button"
                    className={`pf-btn ${action.tone}`}
                    disabled={busy}
                    {...(canManage
                      ? { onClick: () => (action.to === 'enable' ? void act('platform_set_enabled', { p_key: p.key, p_on: true }, `فُعّلت ${p.label_ar}.`) : setOpen({ key: p.key, to: action.to as SheetTo })) }
                      : lock('إعداد المنصات لمن يملك «إدارة المنصات وتطبيقاتها».'))}
                  >
                    {action.label}
                  </button>
                )}
                {(state === 'ok' || state === 'soon' || state === 'manual') && (
                  <a className="pf-btn" href="/channels">
                    الحسابات {accounts}
                  </a>
                )}
                {(state === 'ok' || state === 'soon' || state === 'manual' || state === 'off' || state === 'mail' || state === 'wait') && (
                  <button type="button" className="pf-btn ghost" onClick={() => setOpen({ key: p.key, to: 'finish' })}>
                    التفاصيل
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </section>
    );
  const firstOf = (kinds: AddOption['kind'][], manual?: boolean) => options.filter((o) => kinds.includes(o.kind) && (o.kind !== 'template' || (manual === undefined ? true : o.manual === manual)));
  const menuGroup = (title: string, rows: AddOption[]) =>
    rows.length > 0 && (
      <div key={title}>
        <span className="pf-menu-h">{title}</span>
        {rows.map((o) => (
          <button type="button" className="pf-menu-item" role="menuitem" data-add={o.key} key={o.key} onClick={() => void pick(o)}>
            <PlatformTile k={o.kind === 'custom' ? 'other' : o.key} />
            <span>
              <b>{o.label}</b>
              <small>{o.hint}</small>
            </span>
          </button>
        ))}
      </div>
    );

  return (
    <div className="st-platforms">
      <div className="pf-top">
        <p className="muted">تُجهَّز كل منصة مرة واحدة، ثم تُضاف حساباتها من «حسابات المنصات».</p>
        <div className="pf-add">
          <button
            type="button"
            className="pf-btn pri st-add"
            aria-haspopup="menu"
            aria-expanded={menu}
            {...(canManage ? { onClick: () => setMenu((m) => !m) } : lock('إضافة المنصات لمن يملك «إدارة المنصات وتطبيقاتها»: مسؤول النظام افتراضياً.'))}
          >
            <Plus aria-hidden="true" />
            إضافة منصة
            <ChevronDown aria-hidden="true" />
          </button>
          {menu && (
            <div className="pf-menu" role="menu" aria-label="إضافة منصة">
              {menuGroup('تحتاج إعداداً مرة واحدة', firstOf(['open']).concat(firstOf(['template'], false)))}
              {menuGroup('بلا ربط', firstOf(['template'], true))}
              {menuGroup('غير ذلك', firstOf(['custom']))}
            </div>
          )}
        </div>
      </div>
      <p className="wk-simnote st-simnote pf-sim">النشر على كل المنصات محاكاة في هذه المرحلة: لا يصل شيء إلى أي منصة.</p>
      {note && (
        <p className={note.ok ? 'ml-hint' : 'ml-err'} role="status">
          {note.text}
        </p>
      )}
      {group('تحتاج منك خطوة', todo)}
      {group('لا شيء مطلوب منك الآن', rest)}

      {opened && open && (
        <PlatformSheet
          key={opened.key}
          p={opened}
          app={facts(opened).app}
          setup={facts(opened).row}
          state={stateOf(opened)}
          accounts={facts(opened).accounts}
          to={open.to}
          canManage={canManage}
          canSecrets={canSecrets}
          lock={lock}
          act={act}
          onClose={() => {
            setOpen(null);
            if (!initial) void load();
          }}
          onChanged={load}
          say={(text) => setNote({ ok: true, text })}
        >
          <Advanced
            p={opened}
            impact={impact[opened.key]}
            canManage={canManage}
            busy={busy}
            lock={lock}
            act={act}
            onEdit={() => setDlg({ t: 'edit', p: opened })}
            onDelete={() => setDlg({ t: 'delete', p: opened })}
          />
        </PlatformSheet>
      )}
      {dlg?.t === 'add' && <AddDialog onClose={() => setDlg(null)} act={act} />}
      {dlg?.t === 'edit' && <EditDialog p={dlg.p} onClose={() => setDlg(null)} act={act} />}
      {dlg?.t === 'delete' && <DeleteDialog p={dlg.p} impact={impact[dlg.p.key]} onClose={() => { setDlg(null); setOpen(null); }} act={act} />}
    </div>
  );
}

type Act = (fn: string, args: Record<string, unknown>, ok: string) => Promise<boolean>;

/** What used to fill a card: all of it stays, folded until someone needs it. */
function Advanced({ p, impact, canManage, busy, lock, act, onEdit, onDelete }: { p: PlatformInfo; impact: Impact | undefined; canManage: boolean; busy: boolean; lock: (why: string) => ReturnType<typeof needProps>; act: Act; onEdit: () => void; onDelete: () => void }) {
  const k = KNOWLEDGE[p.key];
  const [log, setLog] = useState<LogRow[] | null>(null);
  const social = p.kind === 'social';
  const inUse = (impact?.accounts ?? 0) > 0 || (impact?.copies ?? 0) > 0;
  const liveAccounts = social && p.enabled && (impact?.active_accounts ?? 0) > 0;

  const showLog = async () => {
    const { data } = await supabase().rpc('platform_log', { p_key: p.key, p_limit: 20 });
    setLog((data ?? []) as LogRow[]);
  };

  return (
    <details className="pf-more st-advanced">
      <summary>خيارات متقدمة</summary>
      <div className="table st-plat-facts">
        <div className="between">
          <span>النشر الآن</span>
          <b>محاكاة</b>
        </div>
        {social && (
          <div className="between">
            <span>المسار المخطط</span>
            <b title={MODE_HELP_AR[p.publish_mode]}>{MODE_AR[p.publish_mode]}</b>
          </div>
        )}
        {social && (
          <div className="between">
            <span>تقبل</span>
            <b>{p.accepts.video_only ? 'الفيديو فقط' : 'نصاً وصورة وفيديو'}</b>
          </div>
        )}
        {social && <LimitsFact p={p} />}
        {impact && (
          <div className="between st-plat-use">
            <span>الحسابات</span>
            <b>
              {impact.accounts}
              {impact.accounts !== impact.active_accounts ? ` (فعّال ${impact.active_accounts})` : ''} · نسخ نصوص {impact.copies}
            </b>
          </div>
        )}
      </div>

      {social && !providerOf(p.key) && p.publish_mode === 'manual' && (
        <p className="st-manual-guide muted">
          <SetupGuide guide="manual" label="كيف يُنشر على هذه المنصة" /> مسار يدوي: يُنشر من تطبيق المنصة بحزمة جاهزة، وتؤكد أنت أنه نُشر.
        </p>
      )}

      {k && (
        <details className="st-info">
          <summary>ما تقدمه وما تطلبه</summary>
          <dl className="wk-kv">
            <dt>ما تنشره</dt>
            <dd>{k.can}</dd>
            <dt>ما لا تنشره أو تقيّده</dt>
            <dd>{k.cannot}</dd>
            <dt>ما تطلبه خارج الموقع</dt>
            <dd>
              <ul className="st-req">
                {k.requires.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </dd>
            <dt>المدة المعتادة</dt>
            <dd>{k.lead}</dd>
            <dt>كيف يتصل الحساب</dt>
            <dd>{k.connect}</dd>
            {(p.docs_url ?? k.docs) && (
              <>
                <dt>وثائق المنصة</dt>
                <dd>
                  <a href={p.docs_url ?? k.docs ?? '#'} target="_blank" rel="noopener noreferrer" dir="ltr">
                    {p.docs_url ?? k.docs}
                  </a>
                </dd>
              </>
            )}
          </dl>
          <small className="muted">
            {k.checked ? `روجعت من وثائق المنصة الرسمية في ${k.checked}.` : 'لم تُراجع هذه المعلومات من وثائق المنصة الرسمية بعد، وتتغير كثيراً. تحقق منها هناك قبل الاعتماد عليها.'}
          </small>
        </details>
      )}

      <div className="pf-acts">
        {social && (
          <>
            <button type="button" className="pf-btn st-edit" disabled={busy} {...(canManage ? { onClick: onEdit } : lock('تعديل المنصات لمن يملك «إدارة المنصات وتطبيقاتها».'))}>
              تعديل
            </button>
            <button
              type="button"
              className="pf-btn st-toggle"
              disabled={busy}
              {...(canManage
                ? { onClick: () => void act('platform_set_enabled', { p_key: p.key, p_on: !p.enabled }, p.enabled ? 'أُوقفت المنصة لإضافة حسابات جديدة.' : 'فُعّلت المنصة لإضافة حسابات.') }
                : lock('التفعيل لمن يملك «إدارة المنصات وتطبيقاتها».'))}
            >
              {p.enabled ? 'إيقاف' : 'تفعيل'}
            </button>
            {!p.builtin && (
              <button type="button" className="pf-btn fix st-delete" disabled={busy} {...(canManage ? { onClick: onDelete } : lock('الحذف لمن يملك «إدارة المنصات وتطبيقاتها».'))}>
                حذف
              </button>
            )}
          </>
        )}
        <button type="button" className="pf-btn st-log-btn" onClick={() => void showLog()}>
          سجل المنصة
        </button>
      </div>
      {liveAccounts && <small className="muted">لا تُوقف منصة عليها حسابات فعّالة: أوقف حساباتها من «حسابات المنصات» أولاً.</small>}
      {social && !p.builtin && inUse && <small className="muted">لا تُحذف منصة عليها حسابات أو نسخ نصوص.</small>}
      {log && (
        <ol className="st-plat-log">
          {log.map((e) => (
            <li key={e.id}>
              <small>
                <bdi dir="ltr">{when(e.at)}</bdi>
              </small>{' '}
              {platformEventLine(e)}
            </li>
          ))}
          {!log.length && <li className="muted">لا أحداث بعد.</li>}
        </ol>
      )}
    </details>
  );
}

/** «منصة أخرى…»: by name, stopped until it is switched on. A platform with a template comes from the menu. */
function AddDialog({ onClose, act }: { onClose: () => void; act: Act }) {
  const [key, setKey] = useState('');
  const [label, setLabel] = useState('');
  const [mode, setMode] = useState<PublishMode>('manual');
  const [video, setVideo] = useState(false);
  const [review, setReview] = useState(false);
  const finalKey = key.trim().toLowerCase();
  const finalLabel = label.trim();
  return (
    <Modal title="إضافة منصة" onClose={onClose}>
      <div className="wk-two">
        <label className="l">
          الاسم بالعربية
          <input className="wk-inp" value={label} maxLength={40} onChange={(e) => setLabel(e.target.value)} />
        </label>
        <label className="l">
          المعرّف <small>حروف إنجليزية صغيرة وأرقام</small>
          <input className="wk-inp ltr" value={key} maxLength={30} onChange={(e) => setKey(e.target.value)} />
        </label>
      </div>
      <details>
        <summary>خيارات أخرى</summary>
        <label className="l">
          المسار المخطط للنشر
          <select className="wk-inp" value={mode} onChange={(e) => setMode(e.target.value as PublishMode)}>
            {(['auto', 'assisted', 'manual'] as PublishMode[]).map((m) => (
              <option key={m} value={m}>
                {MODE_AR[m]}
              </option>
            ))}
          </select>
          <small>{MODE_HELP_AR[mode]}</small>
        </label>
        <label className="l ml-check">
          <input type="checkbox" checked={video} onChange={(e) => setVideo(e.target.checked)} /> تقبل الفيديو فقط
        </label>
        <label className="l ml-check">
          <input type="checkbox" checked={review} onChange={(e) => setReview(e.target.checked)} /> تطلب مراجعة التطبيق قبل النشر
        </label>
      </details>
      <p className="muted">
        تُضاف موقوفة: لا تُعرض لإضافة حسابات حتى تفعّلها. النشر عليها محاكاة كبقية المنصات إلى أن يُبنى ربطها.
      </p>
      <div className="actions">
        <button
          type="button"
          className="primary"
          disabled={!finalKey || !finalLabel}
          onClick={() =>
            void act('platform_save', { p_key: finalKey, p: { label_ar: finalLabel, publish_mode: mode, video_only: video, requires_review: review, docs_url: null } }, `أُضيفت «${finalLabel}». فعّلها لتظهر عند إضافة حساب.`).then(
              (ok) => ok && onClose(),
            )
          }
        >
          إضافة
        </button>
        <button type="button" className="secondary" onClick={onClose}>
          إلغاء
        </button>
      </div>
    </Modal>
  );
}

function EditDialog({ p, onClose, act }: { p: PlatformInfo; onClose: () => void; act: Act }) {
  const [label, setLabel] = useState(p.label_ar);
  const [mode, setMode] = useState<PublishMode>(p.publish_mode);
  const [video, setVideo] = useState(p.accepts.video_only === true);
  const [review, setReview] = useState(p.requires_review);
  const [life, setLife] = useState(p.token_life_days ? String(p.token_life_days) : '');
  const [docs, setDocs] = useState(p.docs_url ?? '');
  const l0 = limitsOf(p.accepts);
  const [lim, setLim] = useState<Record<LimitField, string>>(() => Object.fromEntries(LIMIT_FIELDS.map(([k]) => [k, l0[k] != null ? String(l0[k]) : ''])) as Record<LimitField, string>);
  const [limNote, setLimNote] = useState(l0.note ?? '');
  const [limChecked, setLimChecked] = useState(l0.checked ?? '');
  return (
    <Modal title={`تعديل ${p.label_ar}`} onClose={onClose}>
      <label className="l">
        الاسم بالعربية
        <input className="wk-inp" value={label} maxLength={40} disabled={p.builtin} onChange={(e) => setLabel(e.target.value)} />
        {p.builtin && <small>منصة أساسية: يبقى اسمها كما هو.</small>}
      </label>
      <label className="l">
        المسار المخطط للنشر
        <select className="wk-inp" value={mode} onChange={(e) => setMode(e.target.value as PublishMode)}>
          {(['auto', 'assisted', 'manual'] as PublishMode[]).map((m) => (
            <option key={m} value={m}>
              {MODE_AR[m]}
            </option>
          ))}
        </select>
        <small>{MODE_HELP_AR[mode]}</small>
      </label>
      <label className="l ml-check">
        <input type="checkbox" checked={video} onChange={(e) => setVideo(e.target.checked)} /> تقبل الفيديو فقط
      </label>
      <small className="muted">يُفرض هذا فوراً: لا يُرسل للمراجعة عمل بلا فيديو إلى حساب على هذه المنصة.</small>
      <label className="l ml-check">
        <input type="checkbox" checked={review} onChange={(e) => setReview(e.target.checked)} /> تطلب مراجعة التطبيق قبل النشر
      </label>
      <div className="wk-two">
        <label className="l">
          مدة التفويض بالأيام
          <input className="wk-inp ltr" inputMode="numeric" value={life} onChange={(e) => setLife(e.target.value.replace(/\D/g, ''))} />
        </label>
        <label className="l">
          رابط وثائق المنصة
          <input className="wk-inp ltr" value={docs} maxLength={300} placeholder="https://" onChange={(e) => setDocs(e.target.value)} />
        </label>
      </div>
      <fieldset className="st-limits">
        <legend>حدود المنشور (تظهر في المعاينة وعند الإرسال)</legend>
        <div className="wk-two">
          {LIMIT_FIELDS.map(([k, name]) => (
            <label className="l" key={k}>
              {name}
              <input className="wk-inp ltr" inputMode="numeric" value={lim[k]} placeholder="بلا حد" onChange={(e) => setLim({ ...lim, [k]: e.target.value.replace(/\D/g, '') })} />
            </label>
          ))}
        </div>
        <label className="l">
          مصدر الأرقام
          <input className="wk-inp" value={limNote} maxLength={300} placeholder="من أي وثيقة أُخذت هذه الأرقام" onChange={(e) => setLimNote(e.target.value)} />
        </label>
        <label className="l">
          آخر مراجعة من وثائق المنصة
          <input className="wk-inp ltr" type="date" value={limChecked} onChange={(e) => setLimChecked(e.target.value)} />
        </label>
      </fieldset>
      <div className="actions">
        <button
          type="button"
          className="primary"
          onClick={() =>
            void act(
              'platform_save',
              {
                p_key: p.key,
                p: {
                  label_ar: label,
                  publish_mode: mode,
                  video_only: video,
                  requires_review: review,
                  token_life_days: life || null,
                  docs_url: docs.trim() || null,
                  ...lim,
                  limits_note: limNote.trim() || null,
                  limits_checked: limChecked || null,
                },
              },
              'حُفظت المنصة.',
            ).then((ok) => ok && onClose())
          }
        >
          حفظ
        </button>
        <button type="button" className="secondary" onClick={onClose}>
          إلغاء
        </button>
      </div>
    </Modal>
  );
}

/** The platform app's credentials: entered once, checked with the platform, kept in the vault, never read back. */
export function AppBlock({ provider, app, canSecrets, onSaved, lock }: { provider: ConnProvider; app: Integration | undefined; canSecrets: boolean; onSaved: () => Promise<void>; lock: (why: string) => ReturnType<typeof needProps> }) {
  const c = PROVIDER_COPY[provider];
  const [id, setId] = useState('');
  const [secret, setSecret] = useState('');
  const [scopes, setScopes] = useState('');
  const [expires, setExpires] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [origin, setOrigin] = useState('');
  useEffect(() => setOrigin(window.location.origin), []);
  const redirect = `${origin}/api/platforms/callback/${provider}`;
  const expiry = expiryOf(app?.config, riyadhToday());
  const save = async () => {
    setBusy(true);
    setNote(null);
    try {
      const r = await fetch('/api/platforms/app', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, app_id: id, secret, scopes: scopes.trim() ? scopes.split(/[\s,]+/).filter(Boolean) : undefined, secret_expires_on: expires || undefined }),
      });
      const b = (await r.json()) as { error?: string; tail?: string };
      if (!r.ok) return setNote({ ok: false, text: b.error ?? 'تعذّر الحفظ.' });
      setSecret('');
      setExpires('');
      setNote({ ok: true, text: `حُفظ السر في الخزنة (${b.tail ?? ''}) بعد أن قبلته المنصة. لا يُعرض بعد الآن.` });
      await onSaved();
    } catch {
      setNote({ ok: false, text: 'تعذّر الوصول إلى الخادم.' });
    } finally {
      setBusy(false);
    }
  };
  const have = app?.has_secret === true;
  return (
    <section className="st-app" aria-label={c.name} data-app={provider}>
      <div className="between">
        <b>
          {c.name} <SetupGuide guide={provider} provider={provider} label="خطوات تجهيز هذا التطبيق" />
        </b>
        <span className={`mx-chip ${have ? STATE_TONE[app!.state] : ''}`}>{have ? STATE_AR[app!.state] : 'لم يُدخل بعد'}</span>
      </div>
      <small className="muted">
        {have
          ? `المعرّف ${String(app!.config?.app_id ?? '')}، والسر محفوظ في الخزنة (${app!.secret_tail ?? ''}). لا يُقرأ منه شيء بعد الحفظ.`
          : 'لم يُدخل معرّف هذا التطبيق وسره. بدونه لا يبدأ ربط حساب حقيقي، ويبقى الربط محاكى.'}
      </small>
      {have && expiry.state !== 'none' && (
        <small className={expiry.state === 'ok' ? 'muted' : 'ml-err'} role={expiry.state === 'ok' ? undefined : 'status'} data-expiry={expiry.state}>
          {expiryLineAr(expiry)}
        </small>
      )}
      <small className="muted">
        عنوان العودة الذي تسجّله في لوحة المطوّرين: <bdi dir="ltr">{redirect}</bdi>
      </small>
      {provider === 'google' && (
        <small className="muted">
          وعنوان العودة لـ Google Drive، في القائمة نفسها: <bdi dir="ltr">{origin}/api/drive/callback</bdi>
        </small>
      )}
      <div className="wk-two">
        <label className="l">
          {c.idLabel}
          <input className="wk-inp ltr" value={id} autoComplete="off" disabled={!canSecrets || busy} onChange={(e) => setId(e.target.value)} />
        </label>
        <label className="l">
          {c.secretLabel}
          <input className="wk-inp ltr" type="password" value={secret} autoComplete="new-password" disabled={!canSecrets || busy} onChange={(e) => setSecret(e.target.value)} />
        </label>
      </div>
      <label className="l">
        ينتهي السر في <small>اختياري، ويذكّرك الموقع قبله بشهر{provider === 'microsoft' ? ' (سر Microsoft ينتهي خلال 6 إلى 24 شهراً بحسب ما اخترته)' : ''}</small>
        <input className="wk-inp ltr st-app-expires" type="date" value={expires} disabled={!canSecrets || busy} onChange={(e) => setExpires(e.target.value)} />
      </label>
      {provider === 'tiktok' && (
        <label className="l">
          الصلاحيات المطلوبة <small>مفصولة بفواصل، وتكون ممّا أضفته إلى التطبيق</small>
          <input className="wk-inp ltr" value={scopes} placeholder="user.info.basic,video.publish,video.upload" disabled={!canSecrets || busy} onChange={(e) => setScopes(e.target.value)} />
        </label>
      )}
      <small className="muted">{c.where}</small>
      <div className="actions">
        <button
          type="button"
          className="secondary st-app-save"
          disabled={busy || (canSecrets && (!id.trim() || !secret.trim()))}
          {...(canSecrets ? { onClick: () => void save() } : lock('إدخال الأسرار لمن يملك «إدارة المنصات وتطبيقاتها» و«إدخال أسرار التكاملات وتجديدها».'))}
        >
          {have ? 'استبدال بعد الفحص' : 'فحص وحفظ'}
        </button>
      </div>
      {note && (
        <p className={note.ok ? 'ml-hint' : 'ml-err'} role="status">
          {note.text}
        </p>
      )}
    </section>
  );
}

const LIMIT_FIELDS = [
  ['max_chars', 'أطول نص (حرفاً)'],
  ['max_hashtags', 'أكثر وسوم'],
  ['max_images', 'أكثر صور'],
  ['max_videos', 'أكثر ملفات فيديو'],
  ['max_media', 'أكثر عناصر (صور وفيديو معاً)'],
] as const;
type LimitField = (typeof LIMIT_FIELDS)[number][0];

/** The limits the preview checks a copy against, with where they came from. */
function LimitsFact({ p }: { p: PlatformInfo }) {
  const l = limitsOf(p.accepts);
  const parts = [
    l.max_chars ? `نص حتى ${l.max_chars} حرفاً` : '',
    l.title_max ? `عنوان حتى ${l.title_max}` : '',
    l.description_max_bytes ? `وصف حتى ${l.description_max_bytes} بايت` : '',
    l.max_hashtags ? `${l.max_hashtags} وسماً` : '',
    l.max_images ? `${l.max_images} صور` : '',
    l.max_videos ? `${l.max_videos} فيديو` : '',
    l.max_media ? `${l.max_media} عناصر` : '',
  ].filter(Boolean);
  return (
    <div className="between st-limits-fact">
      <span>حدود المنشور</span>
      <b title={l.note}>
        {parts.length ? parts.join(' · ') : 'لا حدود مسجلة'}
        {l.checked ? <small className="muted"> · روجعت {l.checked}</small> : parts.length ? <small className="muted"> · لم تُراجع من الوثائق</small> : null}
      </b>
    </div>
  );
}

function DeleteDialog({ p, impact, onClose, act }: { p: PlatformInfo; impact: Impact | undefined; onClose: () => void; act: Act }) {
  const blocked = (impact?.accounts ?? 0) > 0 || (impact?.copies ?? 0) > 0;
  return (
    <Modal title={`حذف ${p.label_ar}`} onClose={onClose}>
      <p>تُحذف المنصة من القائمة، ويبقى في سجلها أنها كانت. لا يُحذف حساب ولا نص بهذا الإجراء.</p>
      {impact && (
        <div className="table">
          <div className="between">
            <span>حسابات عليها</span>
            <b>{impact.accounts}</b>
          </div>
          <div className="between">
            <span>أعمال مفتوحة تستعملها</span>
            <b>{impact.open_works}</b>
          </div>
          <div className="between">
            <span>نسخ نصوص لها</span>
            <b>{impact.copies}</b>
          </div>
        </div>
      )}
      {blocked && <p className="warning">عليها حسابات أو نسخ نصوص، فلا تُحذف. أوقفها بدل الحذف.</p>}
      <div className="actions">
        <button
          type="button"
          className="primary danger"
          disabled={blocked}
          data-hold={HOLD.platformDelete}
          onClick={() => void act('platform_delete', { p_key: p.key }, 'حُذفت المنصة.').then((ok) => ok && onClose())}
        >
          حذف
        </button>
        <button type="button" className="secondary" onClick={onClose}>
          إلغاء
        </button>
      </div>
    </Modal>
  );
}

'use client';
// «المنصات» in Settings (Settings_Integrations_Plan.md 8): the registry the whole work cycle
// reads. One card per platform with what it can publish, what it asks of the department outside
// the site, the owner's readiness tracker, and the controls to add, edit, switch on or off and
// delete. Publishing is still a simulation for every platform, and the card says so. Every rule
// is in the database (platform_save and its neighbours); this page explains and asks.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { needProps } from '@/lib/kit/need';
import { HOLD } from '@/lib/kit/hold-reasons';
import { supabase } from '@/lib/supabase/client';
import {
  KIND_AR,
  KNOWLEDGE,
  MODE_AR,
  MODE_HELP_AR,
  PLATFORM_TEMPLATES,
  READINESS_AR,
  READINESS_HELP_AR,
  READINESS_ORDER,
  READINESS_TONE,
  platformError,
  platformEventLine,
} from '@/lib/platforms/info';
import type { PlatformInfo, PublishMode, Readiness } from '@/lib/work/rules';
import { useCaps } from '../caps';
import { Modal } from '../ui';

type Impact = { accounts: number; active_accounts: number; open_works: number; copies: number };
type LogRow = { id: number; at: string; kind: string; actor: string | null; actor_name: string | null; data: Record<string, unknown> };

const when = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString('ar-SA-u-nu-latn', { dateStyle: 'medium', timeStyle: 'short' }) : '');
const COLUMNS = 'key,label_ar,kind,sort,accepts,publish_mode,scheduling,requires_review,token_life_days,enabled,builtin,docs_url,readiness,readiness_note,readiness_at,readiness_by';

/** `initial` lets a check draw the tab without the database (qa/permissions-pages.cjs). */
export function PlatformsTab({ initial }: { initial?: { list: PlatformInfo[]; impact: Record<string, Impact> } }) {
  const caps = useCaps();
  const [list, setList] = useState<PlatformInfo[] | null>(initial?.list ?? null);
  const [impact, setImpact] = useState<Record<string, Impact>>(initial?.impact ?? {});
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [dlg, setDlg] = useState<{ t: 'add' } | { t: 'edit'; p: PlatformInfo } | { t: 'delete'; p: PlatformInfo } | null>(null);
  const canManage = caps.has('platforms.manage');

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
  }, []);
  useEffect(() => {
    if (!initial) void load();
  }, [initial, load]);

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

  const ordered = useMemo(() => [...(list ?? [])].sort((a, b) => (a.kind === b.kind ? a.sort - b.sort : a.kind === 'mail' ? 1 : -1)), [list]);
  if (!list) return <p className="muted">جارٍ تحميل المنصات…</p>;
  const lock = (why: string) => needProps('platforms.manage', why);

  return (
    <div className="st-platforms">
      <p className="wk-simnote st-simnote">
        النشر على كل المنصات محاكاة في هذه المرحلة: لا يصل شيء إلى أي منصة. «المسار المخطط» هو ما سيكون عليه النشر حين يُبنى ربط المنصة، و«التجهيز» تتبّعٌ لما تطلبه المنصة خارج الموقع.
      </p>
      <div className="actions">
        <button type="button" className="primary st-add" {...(canManage ? { onClick: () => setDlg({ t: 'add' }) } : lock('إضافة المنصات لمن يملك «إدارة المنصات وتطبيقاتها»: مسؤول النظام افتراضياً.'))}>
          إضافة منصة
        </button>
      </div>

      {ordered.map((p) => (
        <PlatformCard
          key={p.key}
          p={p}
          impact={impact[p.key]}
          canManage={canManage}
          busy={busy}
          lock={lock}
          onEdit={() => setDlg({ t: 'edit', p })}
          onDelete={() => setDlg({ t: 'delete', p })}
          act={act}
        />
      ))}

      {note && (
        <p className={note.ok ? 'ml-hint' : 'ml-err'} role="status">
          {note.text}
        </p>
      )}
      {dlg?.t === 'add' && <AddDialog existing={list.map((x) => x.key)} onClose={() => setDlg(null)} act={act} />}
      {dlg?.t === 'edit' && <EditDialog p={dlg.p} onClose={() => setDlg(null)} act={act} />}
      {dlg?.t === 'delete' && <DeleteDialog p={dlg.p} impact={impact[dlg.p.key]} onClose={() => setDlg(null)} act={act} />}
    </div>
  );
}

type Act = (fn: string, args: Record<string, unknown>, ok: string) => Promise<boolean>;

function PlatformCard({
  p,
  impact,
  canManage,
  busy,
  lock,
  onEdit,
  onDelete,
  act,
}: {
  p: PlatformInfo;
  impact: Impact | undefined;
  canManage: boolean;
  busy: boolean;
  lock: (why: string) => ReturnType<typeof needProps>;
  onEdit: () => void;
  onDelete: () => void;
  act: Act;
}) {
  const k = KNOWLEDGE[p.key];
  const [state, setState] = useState<Readiness>(p.readiness);
  const [text, setText] = useState(p.readiness_note ?? '');
  const [log, setLog] = useState<LogRow[] | null>(null);
  const social = p.kind === 'social';
  const inUse = (impact?.accounts ?? 0) > 0 || (impact?.copies ?? 0) > 0;

  const showLog = async () => {
    const { data } = await supabase().rpc('platform_log', { p_key: p.key, p_limit: 20 });
    setLog((data ?? []) as LogRow[]);
  };

  return (
    <article className={`st-plat ${p.enabled || !social ? '' : 'off'}`} data-platform={p.key}>
      <header className="between">
        <b>
          {p.label_ar} <small>· {KIND_AR[p.kind]}</small>
        </b>
        <span className={`mx-chip ${p.enabled ? 'success' : ''}`}>{!social ? 'قائمة' : p.enabled ? 'مفعّلة' : 'موقوفة'}</span>
      </header>

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
        {social && (
          <div className="between">
            <span>مراجعة المنصة للتطبيق</span>
            <b>{p.requires_review ? 'تطلبها' : 'لا تطلبها'}</b>
          </div>
        )}
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

      {social && (
        <section className="st-ready" aria-label={`تجهيز ${p.label_ar}`}>
          <div className="between">
            <b>التجهيز</b>
            <span className={`mx-chip ${READINESS_TONE[p.readiness]}`}>{READINESS_AR[p.readiness]}</span>
          </div>
          <div className="st-ready-steps" role="list">
            {READINESS_ORDER.map((r) => (
              <span key={r} role="listitem" className={`${r === p.readiness ? 'on' : ''} ${READINESS_ORDER.indexOf(r) < READINESS_ORDER.indexOf(p.readiness) ? 'done' : ''}`}>
                {READINESS_AR[r]}
              </span>
            ))}
          </div>
          <small className="muted">{READINESS_HELP_AR[p.readiness]}</small>
          {p.readiness_at && (
            <small className="muted">
              آخر تحديث {when(p.readiness_at)}
              {p.readiness_note ? `: ${p.readiness_note}` : ''}
            </small>
          )}
          <div className="st-ready-form">
            <select
              aria-label={`حالة تجهيز ${p.label_ar}`}
              value={state}
              disabled={!canManage || busy}
              {...(!canManage ? lock('تحديث التجهيز لمن يملك «إدارة المنصات وتطبيقاتها».') : {})}
              onChange={(e) => setState(e.target.value as Readiness)}
            >
              {READINESS_ORDER.map((r) => (
                <option key={r} value={r}>
                  {READINESS_AR[r]}
                </option>
              ))}
            </select>
            <input
              aria-label={`ملاحظة تجهيز ${p.label_ar}`}
              value={text}
              maxLength={300}
              placeholder="ملاحظة: ماذا قُدّم ومتى وإلى من"
              disabled={!canManage || busy}
              onChange={(e) => setText(e.target.value)}
            />
            <button
              type="button"
              className="secondary st-ready-save"
              disabled={busy || (state === p.readiness && text.trim() === (p.readiness_note ?? ''))}
              {...(canManage
                ? { onClick: () => void act('platform_set_readiness', { p_key: p.key, p_state: state, p_note: text }, 'حُفظ التجهيز.') }
                : lock('تحديث التجهيز لمن يملك «إدارة المنصات وتطبيقاتها».'))}
            >
              حفظ التجهيز
            </button>
          </div>
        </section>
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

      <div className="actions">
        {social && (
          <>
            <button type="button" className="secondary st-edit" disabled={busy} {...(canManage ? { onClick: onEdit } : lock('تعديل المنصات لمن يملك «إدارة المنصات وتطبيقاتها».'))}>
              تعديل
            </button>
            <button
              type="button"
              className="secondary st-toggle"
              disabled={busy}
              {...(canManage
                ? { onClick: () => void act('platform_set_enabled', { p_key: p.key, p_on: !p.enabled }, p.enabled ? 'أُوقفت المنصة لإضافة حسابات جديدة.' : 'فُعّلت المنصة لإضافة حسابات.') }
                : lock('التفعيل لمن يملك «إدارة المنصات وتطبيقاتها».'))}
            >
              {p.enabled ? 'إيقاف' : 'تفعيل'}
            </button>
            {!p.builtin && (
              <button
                type="button"
                className="secondary danger st-delete"
                disabled={busy}
                {...(canManage ? { onClick: onDelete } : lock('الحذف لمن يملك «إدارة المنصات وتطبيقاتها».'))}
              >
                حذف
              </button>
            )}
          </>
        )}
        <button type="button" className="secondary st-log-btn" onClick={() => void showLog()}>
          سجل المنصة
        </button>
      </div>
      {social && p.enabled && (impact?.active_accounts ?? 0) > 0 && (
        <small className="muted">لا تُوقف منصة عليها حسابات فعّالة: أوقف حساباتها من «الحسابات المرتبطة» أولاً.</small>
      )}
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
    </article>
  );
}

function AddDialog({ existing, onClose, act }: { existing: string[]; onClose: () => void; act: Act }) {
  const templates = PLATFORM_TEMPLATES.filter((t) => !existing.includes(t.key));
  const [pick, setPick] = useState(templates[0]?.key ?? 'custom');
  const [key, setKey] = useState('');
  const [label, setLabel] = useState('');
  const t = templates.find((x) => x.key === pick);
  const [mode, setMode] = useState<PublishMode>(t?.publish_mode ?? 'assisted');
  const [video, setVideo] = useState(t?.video_only ?? false);
  const [review, setReview] = useState(t?.requires_review ?? false);
  const pickTemplate = (v: string) => {
    setPick(v);
    const x = templates.find((y) => y.key === v);
    if (x) {
      setMode(x.publish_mode);
      setVideo(x.video_only);
      setReview(x.requires_review);
    }
  };
  const custom = pick === 'custom';
  const finalKey = custom ? key.trim().toLowerCase() : pick;
  const finalLabel = custom ? label.trim() : (t?.label_ar ?? '');
  return (
    <Modal title="إضافة منصة" onClose={onClose}>
      <label className="l">
        المنصة
        <select className="wk-inp" value={pick} onChange={(e) => pickTemplate(e.target.value)}>
          {templates.map((x) => (
            <option key={x.key} value={x.key}>
              {x.label_ar}
            </option>
          ))}
          <option value="custom">منصة أخرى…</option>
        </select>
      </label>
      {custom && (
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
      )}
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
      <div className="actions">
        <button
          type="button"
          className="primary"
          onClick={() =>
            void act(
              'platform_save',
              { p_key: p.key, p: { label_ar: label, publish_mode: mode, video_only: video, requires_review: review, token_life_days: life || null, docs_url: docs.trim() || null } },
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

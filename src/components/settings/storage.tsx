'use client';
// «التخزين» in Settings (Settings_Integrations_Plan.md 6): where the Hub's files are kept, which
// provider serves which role, whether each stored copy is still there, a second provider
// (S3-compatible), and the move engine that carries files between providers. Read from the
// database (storage_overview); a check asks the provider, and only the server records what it
// said. Backups are a later step and are said to be so.
import { useCallback, useEffect, useState } from 'react';
import { needProps } from '@/lib/kit/need';
import { supabase } from '@/lib/supabase/client';
import {
  COMING_PROVIDERS,
  PROVIDER_TYPE_AR,
  STATE_AR,
  STATE_TONE,
  STORAGE_ROLE_AR,
  errorAr,
  intError,
  moveError,
  sizeAr,
  type MoveReport,
  type MoveRow,
  type StorageOverview,
  type VerifyResult,
} from '@/lib/integrations/rules';
import { useCaps } from '../caps';
import { ProviderControls, ProviderForm } from './storage-provider';
import { MovePanel, type FolderRow } from './storage-move';

const when = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString('ar-SA-u-nu-latn', { dateStyle: 'medium', timeStyle: 'short' }) : '');

/** `initial` lets a check draw the tab without the database (qa/storage-move-pages.cjs). */
export function StorageTab({
  initial,
  initialMoves,
  initialReport,
  initialFolders,
}: {
  initial?: StorageOverview;
  initialMoves?: MoveRow[];
  initialReport?: MoveReport | null;
  initialFolders?: FolderRow[];
}) {
  const caps = useCaps();
  const [data, setData] = useState<StorageOverview | null>(initial ?? null);
  const [refused, setRefused] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  // The provider form: closed, a new provider, or the settings of one.
  const [form, setForm] = useState<{ id: string | null } | null>(null);

  const load = useCallback(async () => {
    const { data: d, error } = await supabase().rpc('storage_overview');
    if (error) return setRefused(true);
    setData(d as StorageOverview);
  }, []);
  useEffect(() => {
    if (!initial) void load();
  }, [initial, load]);

  const verify = async () => {
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch('/api/storage/verify', { method: 'POST' });
      const body = (await res.json().catch(() => ({}))) as Partial<VerifyResult> & { error?: string };
      if (!res.ok) setNote({ ok: false, text: body.error ?? 'تعذّر الفحص.' });
      else if (!body.checked) setNote({ ok: true, text: 'لا ملفات للفحص.' });
      else
        setNote({
          ok: !body.missing && !body.failed,
          text: `فُحص ${body.checked}: سليم ${body.ok}، مفقود ${body.missing}، يحتاج انتباهاً ${body.failed}.`,
        });
      await load();
    } catch {
      setNote({ ok: false, text: intError('') });
    } finally {
      setBusy(false);
    }
  };

  if (refused || (caps.ready && !caps.has('settings.view') && !caps.has('storage.manage') && !caps.has('storage.migrate')))
    return (
      <div className="st-storage">
        <p className="muted">أين تُحفظ الملفات لمن يملك «عرض صحة النظام وسجل الإعدادات» أو «إدارة مزودي التخزين»: مسؤول النظام افتراضياً.</p>
        <button type="button" className="secondary" {...needProps('storage.manage', 'التخزين لمسؤول النظام افتراضياً، ويمنحها لغيره لمدة.')}>
          اطلب هذه الصلاحية
        </button>
      </div>
    );
  if (!data) return <p className="muted">جارٍ تحميل التخزين…</p>;

  const editing = form?.id ? data.providers.find((p) => p.id === form.id) ?? null : null;
  const done = (text: string, ok: boolean) => {
    setNote({ ok, text });
    setForm(null);
    void load();
  };
  const canMigrate = data.can_migrate ?? false;

  return (
    <div className="st-storage">
      {data.unrecorded > 0 && (
        <p className="warning st-unrecorded" role="alert">
          {data.unrecorded} {data.unrecorded === 1 ? 'ملف' : 'ملفات'} بلا موضع مسجّل. لا يؤثر هذا في فتحها، لكنه يعني أن السجل ناقص ويجب مراجعته.
        </p>
      )}

      <section className="st-block st-providers" aria-label="مزودو التخزين">
        <h3>مزودو التخزين</h3>
        {data.providers.map((p) => (
          <article key={p.id} className={`st-int ${STATE_TONE[p.state]}`}>
            <header className="between">
              <b>{p.label}</b>
              <span className={`mx-chip ${STATE_TONE[p.state]}`}>{STATE_AR[p.state]}</span>
            </header>
            <small>
              {PROVIDER_TYPE_AR[p.type] ?? p.type}
              {p.type === 's3_compatible' && p.config?.bucket ? (
                <>
                  {' · الحاوية '}
                  <bdi dir="ltr">{String(p.config.bucket)}</bdi>
                </>
              ) : null}
            </small>
            {p.account ? (
              <small>
                الحساب: <bdi dir="ltr">{p.account}</bdi>
              </small>
            ) : null}
            {p.type === 's3_compatible' && (
              <small>
                مفتاح الوصول: {p.has_secret ? <bdi dir="ltr">{p.secret_tail ?? '••••'}</bdi> : 'لم يُدخل بعد'}
              </small>
            )}
            <div className="table st-copies">
              <div className="between">
                <span>نسخ محفوظة هنا</span>
                <b>
                  {p.files} · {sizeAr(p.bytes)}
                </b>
              </div>
              <div className="between">
                <span>منها إصدارات مكتبة الوسائط</span>
                <b>{p.library_files}</b>
              </div>
              <div className="between">
                <span>منها مرفقات البريد والمراسلة</span>
                <b>{p.mail_files}</b>
              </div>
              {(p.replicas ?? 0) > 0 && (
                <div className="between">
                  <span>منها نسخ محفوظة بعد نقل (ليست الأصل)</span>
                  <b>{p.replicas}</b>
                </div>
              )}
              <div className="between st-verified">
                <span>آخر تحقق</span>
                <b>{p.last_verified_at ? when(p.last_verified_at) : 'لم يُتحقق من شيء بعد'}</b>
              </div>
              <div className="between">
                <span>لم تُفحص بعد</span>
                <b>{p.unverified}</b>
              </div>
              {(p.missing > 0 || p.failed > 0) && (
                <div className="between st-bad">
                  <span>مفقودة أو تحتاج انتباهاً</span>
                  <b className="danger">
                    {p.missing} · {p.failed}
                  </b>
                </div>
              )}
            </div>
            {p.last_error ? <small>{errorAr(p.last_error) || moveError(p.last_error)}</small> : null}
            <div className="actions">
              <button
                type="button"
                className="primary st-verify"
                disabled={busy || p.files === 0}
                {...(data.can_manage ? { onClick: () => void verify() } : needProps('storage.manage', 'الفحص لمن يملك «إدارة مزودي التخزين»: مسؤول النظام افتراضياً.'))}
              >
                {busy ? 'جارٍ الفحص…' : 'تحقق من عينة'}
              </button>
            </div>
            {p.type === 's3_compatible' && (
              <ProviderControls p={p} canManage={data.can_manage} onEdit={() => setForm({ id: p.id })} onDone={done} />
            )}
            <small className="muted">
              يسأل المزود عن أقدم الملفات فحصاً (حتى عشرين في المرة، من أي مزود) ويسجّل أهي موجودة وبحجمها. لا يغيّر ولا ينقل ولا يحذف شيئاً.
            </small>
          </article>
        ))}
        {note && (
          <p className={note.ok ? 'ml-hint' : 'ml-err'} role="status">
            {note.text}
          </p>
        )}
        {form ? (
          <ProviderForm key={form.id ?? 'new'} provider={editing} canSecrets={data.can_secrets ?? false} onDone={done} onCancel={() => setForm(null)} />
        ) : (
          <div className="actions">
            <button
              type="button"
              className="secondary st-provider-add"
              {...(data.can_manage ? { onClick: () => setForm({ id: null }) } : needProps('storage.manage', 'إضافة مزود لمن يملك «إدارة مزودي التخزين»: مسؤول النظام افتراضياً.'))}
            >
              إضافة مزود تخزين
            </button>
          </div>
        )}
      </section>

      <MovePanel
        providers={data.providers}
        canMigrate={canMigrate}
        initialMoves={initialMoves}
        initialReport={initialReport}
        initialFolders={initialFolders}
        onChanged={() => void load()}
      />

      <section className="st-block st-roles" aria-label="أدوار التخزين">
        <h3>ما يخدمه كل مزود</h3>
        <div className="table">
          {data.roles.map((r) => (
            <div className="between" key={r.role}>
              <span>{STORAGE_ROLE_AR[r.role]}</span>
              <b>{r.label ?? 'لا مزود بعد'}</b>
            </div>
          ))}
        </div>
        <p className="muted">
          هذه الخريطة للقراءة: الرفع الجديد يذهب إلى مزود كل دور كما هو، والملفات المنقولة تُخدَّم من موضعها الجديد بالمعرّف نفسه، فلا تنكسر
          الروابط ولا صفحات المراجعة. تغيير مزود دور بعينه يأتي مع النسخ الاحتياطي.
        </p>
      </section>

      <section className="st-block st-coming" aria-label="مزودون قادمون">
        <h3>غير متاح بعد</h3>
        <ul className="st-yesno">
          {COMING_PROVIDERS.map((c) => (
            <li key={c.id} className="no">
              <span>{c.label}</span>
              <b>{c.why}</b>
            </li>
          ))}
        </ul>
        <p className="muted">النسخ الاحتياطي المجدول لم يُبنَ بعد. لا شيء يُحذف من مكانه بالنقل: المصدر يبقى نسخة محفوظة حتى تُحيله بنفسك إلى التقاعد.</p>
      </section>
    </div>
  );
}

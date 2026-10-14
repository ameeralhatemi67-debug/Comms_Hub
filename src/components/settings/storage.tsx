'use client';
// «التخزين» in Settings (Settings_Integrations_Plan.md 6): where the Hub's files are kept, which
// provider serves which role, and whether each stored copy is still there. Read from the
// database (storage_overview); a check asks the provider, and only the server records what it
// said. Moving files between providers and backups are later steps and are said to be so.
import { useCallback, useEffect, useState } from 'react';
import { needProps } from '@/lib/kit/need';
import { supabase } from '@/lib/supabase/client';
import {
  COMING_PROVIDERS,
  STATE_AR,
  STATE_TONE,
  STORAGE_ROLE_AR,
  errorAr,
  intError,
  sizeAr,
  type StorageOverview,
  type VerifyResult,
} from '@/lib/integrations/rules';
import { useCaps } from '../caps';

const when = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString('ar-SA-u-nu-latn', { dateStyle: 'medium', timeStyle: 'short' }) : '');

/** `initial` lets a check draw the tab without the database (qa/storage-pages.cjs). */
export function StorageTab({ initial }: { initial?: StorageOverview }) {
  const caps = useCaps();
  const [data, setData] = useState<StorageOverview | null>(initial ?? null);
  const [refused, setRefused] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

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

  if (refused || (caps.ready && !caps.has('settings.view') && !caps.has('storage.manage')))
    return (
      <div className="st-storage">
        <p className="muted">أين تُحفظ الملفات لمن يملك «عرض صحة النظام وسجل الإعدادات» أو «إدارة مزودي التخزين»: مسؤول النظام افتراضياً.</p>
        <button type="button" className="secondary" {...needProps('storage.manage', 'التخزين لمسؤول النظام افتراضياً، ويمنحها لغيره لمدة.')}>
          اطلب هذه الصلاحية
        </button>
      </div>
    );
  if (!data) return <p className="muted">جارٍ تحميل التخزين…</p>;

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
            {p.account ? (
              <small>
                الحساب: <bdi dir="ltr">{p.account}</bdi>
              </small>
            ) : null}
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
            {p.last_error ? <small>{errorAr(p.last_error)}</small> : null}
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
            <small className="muted">
              يسأل المزود عن أقدم الملفات فحصاً (حتى عشرين في المرة) ويسجّل أهي موجودة وبحجمها. لا يغيّر ولا ينقل ولا يحذف شيئاً.
            </small>
          </article>
        ))}
        {note && (
          <p className={note.ok ? 'ml-hint' : 'ml-err'} role="status">
            {note.text}
          </p>
        )}
      </section>

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
          هذه الخريطة للقراءة الآن: مزود واحد يخدم كل شيء. تغيير مزود دور أو مجلد يأتي مع مزود ثانٍ ومحرك النقل.
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
        <p className="muted">
          نقل الملفات بين المزودين (كلياً أو لمجلد) والنسخ الاحتياطي لم يُبنيا بعد. حتى يأتيا، لا يُنقل ملف ولا يُحذف من مكانه.
        </p>
      </section>
    </div>
  );
}

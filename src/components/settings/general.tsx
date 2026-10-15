'use client';
// «عام» in Settings (Settings_Integrations_Plan.md 5): the health of what the Hub is connected
// to, which server settings are present (yes or no only), what is stored, backups, the
// system number, and the general settings an administrator runs the site with. Every rule is
// in the database; this page explains and asks.
import { useCallback, useEffect, useState } from 'react';
import { needProps } from '@/lib/kit/need';
import { HOLD } from '@/lib/kit/hold-reasons';
import { supabase } from '@/lib/supabase/client';
import {
  CONFIG_AR,
  KIND_AR,
  STATE_AR,
  STATE_TONE,
  TOKEN_SOURCE_AR,
  ageAr,
  errorAr,
  intError,
  sizeAr,
  type ConfigView,
  type Integration,
  type Overview,
} from '@/lib/integrations/rules';
import { useCaps } from '../caps';

const when = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString('ar-SA-u-nu-latn', { dateStyle: 'medium', timeStyle: 'short' }) : '');

export type GeneralInitial = { list: Integration[]; overview: Overview; config: ConfigView | null; settings: { maintenance_on: boolean; maintenance_text: string | null; upload_max_mb: number } };

/** `initial` lets a check draw the tab without the database (qa/settings-pages.cjs). */
export function GeneralTab({ initial }: { initial?: GeneralInitial }) {
  const caps = useCaps();
  const [list, setList] = useState<Integration[] | null>(initial?.list ?? null);
  const [overview, setOverview] = useState<Overview | null>(initial?.overview ?? null);
  const [config, setConfig] = useState<ConfigView | null>(initial?.config ?? null);
  const [form, setForm] = useState(initial?.settings ?? { maintenance_on: false, maintenance_text: '', upload_max_mb: 5120 });
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState(false);

  const load = useCallback(async () => {
    const db = supabase();
    const [l, o, s] = await Promise.all([db.rpc('int_list'), db.rpc('settings_overview'), db.from('site_settings').select('maintenance_on, maintenance_text, upload_max_mb').eq('id', 1).maybeSingle()]);
    if (l.error) return setRefused(true);
    setList(l.data as Integration[]);
    setOverview(o.data as Overview);
    if (s.data) setForm({ ...(s.data as GeneralInitial['settings']), maintenance_text: (s.data as GeneralInitial['settings']).maintenance_text ?? '' });
    const c = await fetch('/api/integrations/config').then((r) => (r.ok ? r.json() : null)).catch(() => null);
    setConfig(c as ConfigView | null);
  }, []);
  useEffect(() => {
    if (!initial) void load();
  }, [initial, load]);

  const act = async (run: () => Promise<{ error?: string | null }>, ok: string) => {
    setBusy(true);
    const r = await run();
    setBusy(false);
    setNote(r.error ? { ok: false, text: r.error } : { ok: true, text: ok });
    if (!r.error) await load();
  };
  const post = (url: string) => async () => {
    const res = await fetch(url, { method: 'POST' });
    if (res.ok) return {};
    const b = (await res.json().catch(() => ({}))) as { error?: string };
    return { error: b.error ?? 'تعذّر تنفيذ الطلب.' };
  };
  const rpc = (fn: string, args: Record<string, unknown>) => async () => {
    const { error } = await supabase().rpc(fn, args);
    return { error: error ? intError(error.message) : null };
  };

  if (refused || (caps.ready && !caps.has('settings.view')))
    return (
      <div className="st-general">
        <p className="muted">صحة النظام وإعداداته العامة لمن يملك «عرض صحة النظام وسجل الإعدادات»: مسؤول النظام افتراضياً.</p>
        <button type="button" className="secondary" {...needProps('settings.view', 'صحة النظام لمسؤول النظام افتراضياً، ويمنحها لغيره لمدة.')}>
          اطلب هذه الصلاحية
        </button>
      </div>
    );
  if (!list || !overview) return <p className="muted">جارٍ تحميل صحة النظام…</p>;
  const canManage = caps.has('settings.manage');
  const canSecrets = caps.has('integrations.secrets');

  return (
    <div className="st-general">
      <section className="st-block st-health" aria-label="ما يتصل به المركز">
        <h3>ما يتصل به المركز</h3>
        {list.map((i) => (
          <article key={i.id} className={`st-int ${STATE_TONE[i.state]}`}>
            <header className="between">
              <b>
                {i.label} <small>· {KIND_AR[i.kind]}</small>
              </b>
              <span className={`mx-chip ${STATE_TONE[i.state]}`}>{STATE_AR[i.state]}</span>
            </header>
            {i.config.account ? (
              <small>
                الحساب: <bdi dir="ltr">{String(i.config.account)}</bdi>
              </small>
            ) : null}
            <small className="st-secret">
              الرمز الدائم:{' '}
              {i.type === 'google_drive' && config ? TOKEN_SOURCE_AR[config.driveToken] : i.has_secret ? 'في خزنة الأسرار' : 'لا رمز في الخزنة'}
              {i.has_secret && i.secret_tail ? (
                <>
                  {' '}
                  <bdi dir="ltr">{i.secret_tail}</bdi> منذ {when(i.secret_set_at)}
                </>
              ) : null}
              {i.pending ? ' · سر جديد بانتظار الفحص' : ''}
            </small>
            <small>
              {i.last_check_at ? `آخر فحص ${when(i.last_check_at)}` : 'لم يُفحص بعد'}
              {i.last_ok_at && i.state !== 'connected' ? ` · آخر نجاح ${when(i.last_ok_at)}` : ''}
              {i.last_error ? ` · ${errorAr(i.last_error)}` : ''}
            </small>
            <div className="actions">
              <button type="button" className="secondary st-check" disabled={busy} onClick={() => void act(post('/api/integrations/check'), 'فُحص الآن.')}>
                فحص الآن
              </button>
              {i.type === 'google_drive' && config?.driveToken === 'env' && (
                <button
                  type="button"
                  className="primary st-adopt"
                  disabled={busy}
                  {...(canSecrets ? { onClick: () => void act(post('/api/integrations/drive-adopt'), 'نُقل الرمز إلى خزنة الأسرار بعد فحصه. يبقى المتغير احتياطياً حتى تحذفه.') } : needProps('integrations.secrets', 'إدخال الأسرار لمسؤول النظام.'))}
                >
                  نقل الرمز إلى خزنة الأسرار
                </button>
              )}
              {i.type === 'google_drive' && (
                <a className="button secondary" href="/api/drive/connect">
                  {i.state === 'connected' ? 'ربط حساب آخر' : 'ربط Google Drive'}
                </a>
              )}
              {i.state === 'disabled' ? (
                <button type="button" className="secondary" disabled={busy} onClick={() => void act(rpc('int_set_enabled', { p_id: i.id, p_on: true }), 'شُغّل.')}>
                  تشغيل
                </button>
              ) : (
                <button type="button" className="secondary danger st-disable" disabled={busy} data-hold={HOLD.intDisable} onClick={() => void act(rpc('int_set_enabled', { p_id: i.id, p_on: false }), 'أُوقف.')}>
                  إيقاف
                </button>
              )}
            </div>
          </article>
        ))}
        {overview.whatsapp && (
          <article className="st-int">
            <header className="between">
              <b>
                واتساب النظام <small>· مراسلة</small>
              </b>
              <span className={`mx-chip ${overview.whatsapp.enabled ? 'success' : ''}`}>{overview.whatsapp.enabled ? 'مشغّل' : 'متوقف'}</span>
            </header>
            <small>{overview.whatsapp.heartbeat_at ? `آخر اتصال للجسر ${when(overview.whatsapp.heartbeat_at)}` : 'لم يتصل الجسر بعد.'} تفاصيله في «واتساب النظام».</small>
          </article>
        )}
      </section>

      <section className="st-block st-config" aria-label="إعدادات الخادم">
        <h3>إعدادات الخادم</h3>
        <p className="muted">موجودة أو غير موجودة فقط. القيم نفسها لا تظهر هنا أبداً.</p>
        {config ? (
          <ul className="st-yesno">
            {Object.entries(config.present).map(([k, on]) => (
              <li key={k} className={on ? 'yes' : 'no'}>
                <span>{CONFIG_AR[k] ?? k}</span>
                <b>{on ? 'موجود' : 'غير موجود'}</b>
              </li>
            ))}
            <li className={config.vault ? 'yes' : 'no'}>
              <span>خزنة الأسرار</span>
              <b>{config.vault ? 'يصل إليها الخادم' : 'لا يصل إليها الخادم'}</b>
            </li>
          </ul>
        ) : (
          <p className="muted">تعذّر سؤال الخادم.</p>
        )}
      </section>

      <section className="st-block st-usage" aria-label="التخزين والنسخ">
        <h3>التخزين والنسخ الاحتياطي</h3>
        <div className="table">
          <div className="between">
            <span>إصدارات ملفات المكتبة</span>
            <b>
              {overview.library_files} · {sizeAr(overview.library_bytes)}
            </b>
          </div>
          <div className="between">
            <span>مرفقات البريد والمراسلة</span>
            <b>
              {overview.mail_files} · {sizeAr(overview.mail_bytes)}
            </b>
          </div>
          <div className="between st-backup">
            <span>آخر نسخة احتياطية</span>
            <b className={overview.backup_stale ? 'danger' : ''}>
              {overview.last_backup ? `${ageAr(overview.last_backup)}${overview.backup_stale ? ' · متقادمة لبعض الأنواع' : ''}` : 'لا توجد نسخة بعد'}
            </b>
          </div>
        </div>
        <p className="muted">النسخ الاحتياطي من تبويب «النسخ الاحتياطي»، وأين يُحفظ كل ملف ظاهر في «التخزين».</p>
      </section>

      <section className="st-block st-site" aria-label="الإعدادات العامة">
        <h3>الإعدادات العامة</h3>
        {!canManage && <p className="muted">للقراءة: تعديلها لمن يملك «تعديل الإعدادات العامة للنظام».</p>}
        <label className="ml-check st-maint">
          <input type="checkbox" checked={form.maintenance_on} disabled={!canManage || busy} onChange={(e) => setForm({ ...form, maintenance_on: e.target.checked })} />
          شريط صيانة أعلى كل الصفحات
        </label>
        <label htmlFor="st-maint-text">
          نص الشريط
          <input id="st-maint-text" maxLength={200} value={form.maintenance_text ?? ''} disabled={!canManage} placeholder="مثال: صيانة الليلة من 10 إلى 11" onChange={(e) => setForm({ ...form, maintenance_text: e.target.value })} />
        </label>
        <label htmlFor="st-upload">
          أقصى حجم لملف في المكتبة بالميغابايت <small>حتى 5120 (5 غيغابايت). يُفرض عند بدء الرفع.</small>
          <input id="st-upload" type="number" min={1} max={5120} value={form.upload_max_mb} disabled={!canManage} onChange={(e) => setForm({ ...form, upload_max_mb: Number(e.target.value) })} />
        </label>
        {canManage && (
          <div className="actions">
            <button type="button" className="primary" disabled={busy} onClick={() => void act(rpc('settings_update', { p: form }), 'حُفظت الإعدادات العامة.')}>
              حفظ
            </button>
          </div>
        )}
      </section>
      {note && (
        <p className={note.ok ? 'ml-hint' : 'ml-err'} role="status">
          {note.text}
        </p>
      )}
    </div>
  );
}

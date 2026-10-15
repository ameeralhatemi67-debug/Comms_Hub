'use client';
// A second storage provider, an S3-compatible store (Settings_Integrations_Plan.md 6.1): its
// address and bucket, its key pair, its connection check. The key pair is write-only: it goes to
// the server, which tries a small write, read and delete against the store before the vault
// accepts it, and it is never shown again (only its last four characters).
import { useState } from 'react';
import { HOLD } from '@/lib/kit/hold-reasons';
import { needProps } from '@/lib/kit/need';
import { supabase } from '@/lib/supabase/client';
import { storageGuideKey } from '@/lib/setup-guides';
import { SetupGuide } from '../setup-guide';
import { FLAVORS, intError, type S3Flavor, type S3Settings, type StorageProviderRow } from '@/lib/integrations/rules';

type Reply = { error?: string; stored?: boolean; ok?: boolean; id?: string; tail?: string };
async function post(body: Record<string, unknown>): Promise<{ ok: boolean; data: Reply }> {
  try {
    const res = await fetch('/api/storage/provider', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { ok: res.ok, data: (await res.json().catch(() => ({}))) as Reply };
  } catch {
    return { ok: false, data: { error: intError('') } };
  }
}

const settingsOf = (p: StorageProviderRow | null): S3Settings => {
  const c = (p?.config ?? {}) as Partial<S3Settings>;
  return {
    endpoint: c.endpoint ?? '',
    bucket: c.bucket ?? '',
    region: c.region ?? '',
    prefix: c.prefix ?? '',
    path_style: c.path_style !== false,
    flavor: (c.flavor as S3Flavor) ?? 'supabase',
  };
};

/** The form: a new provider, or the settings of one (a key pair left empty is kept as it is). */
export function ProviderForm({ provider, canSecrets, onDone, onCancel }: { provider: StorageProviderRow | null; canSecrets: boolean; onDone: (text: string, ok: boolean) => void; onCancel: () => void }) {
  const start = settingsOf(provider);
  const [label, setLabel] = useState(provider?.label ?? '');
  const [s, setS] = useState<S3Settings>(start);
  const [key, setKey] = useState('');
  const [secret, setSecret] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const flavor = FLAVORS.find((f) => f.id === s.flavor) ?? FLAVORS[FLAVORS.length - 1];

  const save = async () => {
    setBusy(true);
    setErr('');
    const { ok, data } = await post({
      action: 'save',
      id: provider?.id,
      label,
      config: { ...s, path_style: s.path_style },
      accessKeyId: key || undefined,
      secretAccessKey: secret || undefined,
    });
    setBusy(false);
    if (!ok) return setErr(data.error ?? intError(''));
    if (data.error) {
      setErr(data.error);
      return;
    }
    setSecret('');
    onDone(data.stored ? `حُفظ المزود وفُحص اتصاله (المفتاح ${data.tail ?? ''}).` : 'حُفظت إعدادات المزود. أدخل المفتاح لفحص الاتصال.', true);
  };

  return (
    <form
      className="st-int st-provider-form"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <h4>
        {provider ? 'تعديل مزود التخزين' : 'إضافة مزود تخزين'} <SetupGuide guide={storageGuideKey(s.flavor)} label="خطوات إعداد هذا المزود" />
      </h4>
      <label>
        النوع
        <select value={s.flavor} onChange={(e) => setS({ ...s, flavor: e.target.value as S3Flavor })}>
          {FLAVORS.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
        </select>
      </label>
      <small className="muted">{flavor.note}</small>
      <label>
        الاسم الظاهر
        <input value={label} maxLength={60} onChange={(e) => setLabel(e.target.value)} placeholder="مثل: تخزين Supabase" required />
      </label>
      <label>
        عنوان واجهة S3
        <input dir="ltr" value={s.endpoint} onChange={(e) => setS({ ...s, endpoint: e.target.value })} placeholder={flavor.endpoint} required />
      </label>
      <div className="st-provider-row">
        <label>
          الحاوية
          <input dir="ltr" value={s.bucket} onChange={(e) => setS({ ...s, bucket: e.target.value })} placeholder="comms-hub-files" required />
        </label>
        <label>
          المنطقة
          <input dir="ltr" value={s.region} onChange={(e) => setS({ ...s, region: e.target.value })} placeholder={flavor.region} />
        </label>
        <label>
          مسار بادئ (اختياري)
          <input dir="ltr" value={s.prefix} onChange={(e) => setS({ ...s, prefix: e.target.value })} placeholder="comms-hub" />
        </label>
      </div>
      <label className="check">
        <input type="checkbox" checked={s.path_style} onChange={(e) => setS({ ...s, path_style: e.target.checked })} /> عنوان بنمط المسار (الصحيح لمعظم المزودات المتوافقة)
      </label>
      {canSecrets ? (
        <fieldset className="st-provider-keys">
          <legend>مفتاح الوصول {provider?.has_secret ? `(محفوظ ${provider.secret_tail ?? ''}: اتركه فارغاً للإبقاء عليه)` : ''}</legend>
          <label>
            معرّف المفتاح
            <input dir="ltr" value={key} onChange={(e) => setKey(e.target.value)} autoComplete="off" spellCheck={false} />
          </label>
          <label>
            المفتاح السري
            <input dir="ltr" type="password" value={secret} onChange={(e) => setSecret(e.target.value)} autoComplete="new-password" spellCheck={false} />
          </label>
          <small className="muted">يُجرَّب المفتاح بكتابة ملف صغير وقراءته وحذفه عند المزود، ولا يُحفظ في الخزنة إلا إن نجح. لا يُعرض بعد ذلك أبداً.</small>
        </fieldset>
      ) : (
        <p className="ml-hint">إدخال المفتاح يحتاج «إدخال أسرار التكاملات وتجديدها»: مسؤول النظام افتراضياً. يمكنك حفظ الإعدادات الآن.</p>
      )}
      {err && (
        <p className="ml-err" role="alert">
          {err}
        </p>
      )}
      <div className="actions">
        <button type="submit" className="primary st-provider-save" disabled={busy}>
          {busy ? 'جارٍ الفحص…' : key || secret ? 'حفظ وفحص الاتصال' : 'حفظ الإعدادات'}
        </button>
        <button type="button" className="secondary" onClick={onCancel} disabled={busy}>
          إلغاء
        </button>
      </div>
    </form>
  );
}

/** The buttons of a second provider's card: check, edit, switch off, remove when empty. */
export function ProviderControls({
  p,
  canManage,
  onEdit,
  onDone,
}: {
  p: StorageProviderRow;
  canManage: boolean;
  onEdit: () => void;
  onDone: (text: string, ok: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);
  const lock = (why: string) => needProps('storage.manage', why);

  const check = async () => {
    setBusy(true);
    const { data } = await post({ action: 'check', id: p.id });
    setBusy(false);
    onDone(data.ok ? 'اتصال المزود سليم: كُتب ملف تجريبي وقُرئ وحُذف.' : data.error ?? intError(''), Boolean(data.ok));
  };
  const toggle = async (on: boolean) => {
    setBusy(true);
    const { error } = await supabase().rpc('int_set_enabled', { p_id: p.id, p_on: on });
    setBusy(false);
    onDone(error ? intError(error.message) : on ? 'شُغّل المزود، افحص اتصاله.' : 'أُوقف المزود.', !error);
  };
  const remove = async () => {
    setBusy(true);
    const { data } = await post({ action: 'remove', id: p.id });
    setBusy(false);
    onDone(data.ok ? 'حُذف المزود.' : data.error ?? intError(''), Boolean(data.ok));
  };

  return (
    <div className="actions st-provider-actions">
      <button type="button" className="secondary st-provider-check" disabled={busy || p.state === 'disabled'} {...(canManage ? { onClick: () => void check() } : lock('فحص الاتصال لمن يملك «إدارة مزودي التخزين».'))}>
        فحص الاتصال
      </button>
      <button type="button" className="secondary st-provider-edit" disabled={busy} {...(canManage ? { onClick: onEdit } : lock('تعديل المزود لمن يملك «إدارة مزودي التخزين».'))}>
        تعديل
      </button>
      {p.state === 'disabled' ? (
        <button type="button" className="secondary" disabled={busy} {...(canManage ? { onClick: () => void toggle(true) } : lock('التشغيل لمن يملك «إدارة مزودي التخزين».'))}>
          تشغيل
        </button>
      ) : (
        <button type="button" className="secondary danger st-disable" disabled={busy} data-hold={HOLD.intDisable} onClick={() => void toggle(false)}>
          إيقاف
        </button>
      )}
      {p.files === 0 && (
        <button type="button" className="secondary danger st-provider-remove" disabled={busy} data-hold={HOLD.providerRemove} onClick={() => void remove()}>
          حذف المزود
        </button>
      )}
    </div>
  );
}

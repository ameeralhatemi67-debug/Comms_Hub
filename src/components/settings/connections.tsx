'use client';
// «الاتصالات» in Settings (Action_Plan.md B9): the connections that are not a platform's accounts,
// entered by the Director in the site instead of in the server's environment: the shared mailbox
// (Gmail, an app password), the Google app (client id and secret, shared by Google Drive and
// YouTube) and the Drive connection itself. Each value is checked with its own service before it
// is kept, goes to the vault, and is never shown again. OneDrive joins here (Action_Plan.md B10): the
// Microsoft app, then the accounts connected through Microsoft's own sign-in. Each block has the
// circled "!" with the steps and the links.
import { useCallback, useEffect, useState } from 'react';
import { needProps } from '@/lib/kit/need';
import { supabase } from '@/lib/supabase/client';
import { STATE_AR, STATE_TONE, type Integration } from '@/lib/integrations/rules';
import { useCaps } from '../caps';
import { SetupGuide } from '../setup-guide';
import { AppBlock } from './platforms';

type Present = Record<string, boolean>;
type DriveState = { state: 'connected' | 'needs-connection' | 'not-configured' | 'error' | 'loading'; account?: string | null; canConnect?: boolean };

const when = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString('ar-SA-u-nu-latn', { dateStyle: 'medium', timeStyle: 'short' }) : '');

export function ConnectionsTab({ initial }: { initial?: { rows: Integration[]; present: Present; drive: DriveState } }) {
  const caps = useCaps();
  const [rows, setRows] = useState<Integration[]>(initial?.rows ?? []);
  const [present, setPresent] = useState<Present>(initial?.present ?? {});
  const [drive, setDrive] = useState<DriveState>(initial?.drive ?? { state: 'loading' });
  const canMail = caps.has('settings.manage') && caps.has('integrations.secrets');
  const canGoogle = caps.has('platforms.manage') && caps.has('integrations.secrets');
  const canDrive = caps.has('storage.manage');

  const load = useCallback(async () => {
    const ints = await supabase().rpc('int_list');
    if (!ints.error) setRows((ints.data ?? []) as Integration[]);
    void fetch('/api/integrations/config', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((b: { present?: Present } | null) => b?.present && setPresent(b.present))
      .catch(() => undefined);
    void fetch('/api/drive/status', { cache: 'no-store' })
      .then((r) => r.json() as Promise<DriveState>)
      .then(setDrive)
      .catch(() => setDrive({ state: 'error' }));
  }, []);
  useEffect(() => {
    if (!initial) void load();
  }, [initial, load]);

  const mail = rows.find((r) => r.type === 'gmail_account');
  const google = rows.find((r) => r.type === 'google_app');
  const microsoft = rows.find((r) => r.type === 'microsoft_app');
  const onedrives = rows.filter((r) => r.type === 'onedrive');
  const lock = (why: string) => needProps('integrations.secrets', why);

  return (
    <div className="st-connections">
      <p className="muted">
        ما يُدخل هنا يُفحص عند الخدمة نفسها قبل حفظه، ويُحفظ في خزنة الأسرار، ولا يُعرض بعد ذلك. ما كان في متغيرات الخادم يبقى احتياطاً إلى أن تُدخل القيمة هنا.
      </p>
      <MailBlock row={mail} envPresent={Boolean(present.GMAIL_ADDRESS && present.GMAIL_APP_PASSWORD)} canEdit={canMail} onSaved={load} lock={lock} />
      <AppBlock provider="google" app={google} canSecrets={canGoogle} onSaved={load} lock={lock} />
      <DriveBlock drive={drive} googleReady={Boolean(google?.has_secret) || Boolean(present.GOOGLE_CLIENT_ID && present.GOOGLE_CLIENT_SECRET)} canConnect={canDrive || Boolean(drive.canConnect)} />
      <AppBlock provider="microsoft" app={microsoft} canSecrets={canGoogle} onSaved={load} lock={lock} />
      <OneDriveBlock accounts={onedrives} appReady={Boolean(microsoft?.has_secret)} canConnect={canDrive} onChecked={load} />
    </div>
  );
}

function MailBlock({ row, envPresent, canEdit, onSaved, lock }: { row: Integration | undefined; envPresent: boolean; canEdit: boolean; onSaved: () => Promise<void>; lock: (why: string) => ReturnType<typeof needProps> }) {
  const [address, setAddress] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const have = row?.has_secret === true;

  const save = async () => {
    setBusy(true);
    setNote(null);
    try {
      const r = await fetch('/api/mail/account', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ address, password }) });
      const b = (await r.json()) as { error?: string; tail?: string; address?: string };
      if (!r.ok) return setNote({ ok: false, text: b.error ?? 'تعذّر الحفظ.' });
      setPassword('');
      setNote({ ok: true, text: `سجّل الموقع الدخول إلى ${b.address ?? 'الصندوق'} وحُفظت كلمة المرور في الخزنة (${b.tail ?? ''}). لا تُعرض بعد الآن.` });
      await onSaved();
    } catch {
      setNote({ ok: false, text: 'تعذّر الوصول إلى الخادم.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="st-app st-mail" aria-label="صندوق بريد القسم" data-app="mail">
      <div className="between">
        <b>
          صندوق بريد القسم (Gmail) <SetupGuide guide="mail" label="خطوات ربط صندوق البريد" />
        </b>
        <span className={`mx-chip ${have ? STATE_TONE[row!.state] : ''}`}>{have ? STATE_AR[row!.state] : envPresent ? 'من متغيرات الخادم' : 'لم يُدخل بعد'}</span>
      </div>
      <small className="muted">
        {have
          ? `العنوان ${String(row!.config?.address ?? '')}، وكلمة المرور محفوظة في الخزنة (${row!.secret_tail ?? ''}).${row!.last_ok_at ? ` آخر نجاح ${when(row!.last_ok_at)}.` : ''}`
          : envPresent
            ? 'الصندوق مضبوط في متغيرات الخادم. أدخله هنا ليُدار من الموقع.'
            : 'لم يُربط صندوق. بدونه لا يصل البريد الخارجي ولا تُرسل الدعوات من الموقع.'}
      </small>
      <div className="wk-two">
        <label className="l">
          عنوان الصندوق
          <input className="wk-inp ltr" type="email" value={address} autoComplete="off" placeholder="department@gmail.com" disabled={!canEdit || busy} onChange={(e) => setAddress(e.target.value)} />
        </label>
        <label className="l">
          كلمة مرور التطبيق (16 حرفاً)
          <input className="wk-inp ltr" type="password" value={password} autoComplete="new-password" disabled={!canEdit || busy} onChange={(e) => setPassword(e.target.value)} />
        </label>
      </div>
      <div className="actions">
        <button
          type="button"
          className="secondary st-mail-save"
          disabled={busy || (canEdit && (!address.trim() || !password.trim()))}
          {...(canEdit ? { onClick: () => void save() } : lock('إدخال بريد القسم لمن يملك «تعديل الإعدادات العامة للنظام» و«إدخال أسرار التكاملات وتجديدها».'))}
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

function DriveBlock({ drive, googleReady, canConnect }: { drive: DriveState; googleReady: boolean; canConnect: boolean }) {
  const text =
    drive.state === 'connected'
      ? `متصل${drive.account ? ` بحساب ${drive.account}` : ''}.`
      : drive.state === 'needs-connection'
        ? 'تطبيق Google مُدخل، ولم يُربط حساب بعد.'
        : drive.state === 'not-configured'
          ? 'لم يُدخل معرّف عميل Google وسره بعد: أدخلهما في البطاقة أعلاه.'
          : drive.state === 'loading'
            ? 'جارٍ السؤال…'
            : 'تعذّر الفحص. أعد المحاولة.';
  const tone = drive.state === 'connected' ? 'success' : drive.state === 'error' ? 'danger' : '';
  return (
    <section className="st-app st-drive" aria-label="Google Drive" data-app="drive">
      <div className="between">
        <b>
          Google Drive <SetupGuide guide="drive" label="خطوات ربط Google Drive" />
        </b>
        <span className={`mx-chip ${tone}`}>{drive.state === 'connected' ? 'متصل' : drive.state === 'needs-connection' ? 'يحتاج ربطاً' : drive.state === 'not-configured' ? 'لم يُجهَّز' : drive.state === 'loading' ? '…' : 'خطأ'}</span>
      </div>
      <small className="muted">{text}</small>
      <small className="muted">يحفظ الموقع في Drive ملفات المكتبة ومرفقات البريد في مجلد «Comms Hub». النقل إلى مزود آخر والنسخ الاحتياطي من «التخزين» و«النسخ الاحتياطي».</small>
      <div className="actions">
        {canConnect && googleReady ? (
          <a className="button secondary st-drive-connect" href="/api/drive/connect">
            {drive.state === 'connected' ? 'إعادة ربط حساب Google' : 'ربط Google Drive'}
          </a>
        ) : (
          <button type="button" className="secondary" disabled title={googleReady ? 'لا تملك «إدارة مزودي التخزين».' : 'أدخل تطبيق Google أولاً.'}>
            ربط Google Drive
          </button>
        )}
      </div>
    </section>
  );
}

const ONEDRIVE_NOTE: Record<string, string> = {
  APP_NOT_CONFIGURED: 'لم يُدخل معرّف تطبيق Microsoft وسره بعد: أدخلهما في بطاقة «تطبيق Microsoft».',
  CODE_REFUSED: 'لم يكتمل الربط: رفضت Microsoft الدخول أو انتهت مهلته. ابدأ من جديد.',
  REFRESH_MISSING: 'لم تُعطِ Microsoft رمزاً دائماً. أزل وصول التطبيق من حسابك على Microsoft ثم أعد الربط.',
  ACCOUNT_UNKNOWN: 'تعذّر معرفة صاحب الحساب. أعد المحاولة.',
  PROVIDER_LIMIT: 'بلغت الحد من حسابات OneDrive (3). أزل حساباً لا يحفظ ملفات.',
  FORBIDDEN: 'لا تملك صلاحية ربط مزودي التخزين.',
  SAVE_FAILED: 'تعذّر حفظ الحساب. أعد المحاولة.',
};

function OneDriveBlock({ accounts, appReady, canConnect, onChecked }: { accounts: Integration[]; appReady: boolean; canConnect: boolean; onChecked: () => Promise<void> }) {
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  // The connection returns here with the result in the address.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get('onedrive') === 'connected') setNote({ ok: true, text: 'رُبط حساب OneDrive. افحص اتصاله، ثم انقل إليه ملفات من «التخزين».' });
    else if (q.get('onedrive_error')) setNote({ ok: false, text: ONEDRIVE_NOTE[q.get('onedrive_error')!] ?? 'لم يكتمل ربط OneDrive.' });
  }, []);
  const check = async (id: string) => {
    setBusy(id);
    try {
      const r = await fetch('/api/storage/provider', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'check', id }) });
      const b = (await r.json()) as { ok?: boolean; error?: string };
      setNote(b.ok ? { ok: true, text: 'اتصال OneDrive سليم.' } : { ok: false, text: b.error ?? 'تعذّر الفحص.' });
      await onChecked();
    } catch {
      setNote({ ok: false, text: 'تعذّر الوصول إلى الخادم.' });
    } finally {
      setBusy('');
    }
  };
  return (
    <section className="st-app st-onedrive" aria-label="OneDrive" data-app="onedrive">
      <div className="between">
        <b>
          OneDrive <SetupGuide guide="onedrive" label="خطوات ربط OneDrive" />
        </b>
        <span className={`mx-chip ${accounts.some((a) => a.state === 'connected') ? 'success' : ''}`}>{accounts.length ? `${accounts.length} حساب` : 'لم يُربط بعد'}</span>
      </div>
      <small className="muted">
        مزود تخزين ثانٍ: تُنقل إليه ملفات المكتبة والبريد أو تُحفظ نسخاً احتياطية، وتُخدَّم منه بالروابط نفسها. الرفع الجديد يبقى إلى Google Drive. لم يُجرَّب مع حساب Microsoft حقيقي بعد.
      </small>
      {accounts.map((a) => (
        <div className="between st-onedrive-row" key={a.id}>
          <span>
            <bdi dir="ltr">{String(a.config?.account ?? a.label)}</bdi> · <small className="muted">{STATE_AR[a.state]}</small>
            {a.last_ok_at ? <small className="muted"> · آخر نجاح {when(a.last_ok_at)}</small> : null}
          </span>
          <button type="button" className="secondary st-onedrive-check" disabled={busy === a.id} onClick={() => void check(a.id)}>
            {busy === a.id ? 'جارٍ الفحص…' : 'فحص الاتصال'}
          </button>
        </div>
      ))}
      <div className="actions">
        {canConnect && appReady ? (
          <a className="button secondary st-onedrive-connect" href="/api/onedrive/connect">
            {accounts.length ? 'ربط حساب آخر أو إعادة ربط' : 'ربط OneDrive'}
          </a>
        ) : (
          <button type="button" className="secondary" disabled title={appReady ? 'لا تملك «إدارة مزودي التخزين».' : 'أدخل تطبيق Microsoft أولاً.'}>
            ربط OneDrive
          </button>
        )}
      </div>
      {note && (
        <p className={note.ok ? 'ml-hint' : 'ml-err'} role="status">
          {note.text}
        </p>
      )}
    </section>
  );
}

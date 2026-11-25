'use client';
// The app's identifier and secret, entered in a setup (MVP_draft.md section 67). One form for the step sheet (KeysPanel in
// platform-sheet.tsx) and the guide shown as one page (guide-doc.tsx), which puts each field under the action that names it.
// The secret goes to /api/platforms/app, which asks the platform first and keeps it in the vault; it is never progress and
// never shown again.
import { useState, type ReactNode } from 'react';
import type { needProps } from '@/lib/kit/need';
import type { KeyField } from '@/lib/guide-layout';
import { expiryLineAr, expiryOf, riyadhToday } from '@/lib/integrations/expiry';
import type { Integration } from '@/lib/integrations/rules';
import { PROVIDER_COPY, type ConnProvider } from '@/lib/platforms/provider';
import type { SetupRow } from '@/lib/platforms/setup';
import { Rich } from '../guide-text';

type Lock = (why: string) => ReturnType<typeof needProps>;
export type Fields = SetupRow['fields'];
export type KeysProps = { provider: ConnProvider; app: Integration | undefined; fields: Fields; problem: boolean; canSecrets: boolean; lock: Lock; onSaved: (f: Fields) => Promise<void> };
export type KeysForm = {
  /** What is known about the stored secret, said before anything is entered. */
  top: ReactNode;
  field: Record<KeyField, ReactNode>;
  /** The fields this platform asks for, in their order. */
  keys: KeyField[];
  /** What happens on the button, and a refusal. */
  after: ReactNode;
  button: ReactNode;
};

export function useKeysForm({ provider, app, fields, problem, canSecrets, lock, onSaved }: KeysProps): KeysForm {
  const c = PROVIDER_COPY[provider];
  const have = app?.has_secret === true;
  const [id, setId] = useState(fields.app_id ?? (typeof app?.config?.app_id === 'string' ? app.config.app_id : ''));
  const [config, setConfig] = useState(fields.config_id ?? (typeof app?.config?.config_id === 'string' ? app.config.config_id : ''));
  const [secret, setSecret] = useState('');
  const [expires, setExpires] = useState('');
  const [scopes, setScopes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [tail, setTail] = useState('');
  const needsConfig = provider === 'meta';
  const expiry = expiryOf(app?.config, riyadhToday());
  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const r = await fetch('/api/platforms/app', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, app_id: id, secret, config_id: config || undefined, scopes: scopes.trim() ? scopes.split(/[\s,]+/).filter(Boolean) : undefined, secret_expires_on: expires || undefined }),
      });
      const b = (await r.json()) as { error?: string; tail?: string };
      if (!r.ok) return setError(b.error ?? 'تعذّر الحفظ.');
      setSecret('');
      setTail(b.tail ?? '');
      await onSaved({ app_id: id.trim(), ...(config.trim() ? { config_id: config.trim() } : {}) });
    } catch {
      setError('تعذّر الوصول إلى الخادم.');
    } finally {
      setBusy(false);
    }
  };
  return {
    top: (
      <>
        {problem && !tail && <p className="pf-note bad">{expiry.state === 'expired' ? expiryLineAr(expiry) : 'رفضت المنصة المعرّف أو السر المحفوظ. أدخلهما من جديد.'}</p>}
        {have && !problem && (
          <p className="pf-note ok">
            السر محفوظ في الخزنة (<bdi dir="ltr">{app?.secret_tail ?? ''}</bdi>). أدخله من جديد لتستبدله فقط.
          </p>
        )}
      </>
    ),
    field: {
      id: (
        <label className="pf-f">
          <Rich text={c.idLabel} />
          <input className="ltr" value={id} autoComplete="off" disabled={!canSecrets || busy} onChange={(e) => setId(e.target.value)} />
        </label>
      ),
      secret: (
        <label className="pf-f">
          <Rich text={c.secretLabel} />
          <input className="ltr" type="password" value={secret} autoComplete="new-password" disabled={!canSecrets || busy} onChange={(e) => setSecret(e.target.value)} />
        </label>
      ),
      config: needsConfig ? (
        <label className="pf-f">
          <Rich text="معرّف الإعداد (Configuration ID)" />
          <input className="ltr" inputMode="numeric" value={config} autoComplete="off" disabled={!canSecrets || busy} onChange={(e) => setConfig(e.target.value.replace(/\D/g, ''))} />
        </label>
      ) : null,
      more: (
        <details className="pf-more">
          <summary>خيارات أخرى</summary>
          <label className="pf-f">
            ينتهي السر في <small>اختياري، ويذكّرك الموقع قبله بشهر</small>
            <input className="ltr st-app-expires" type="date" value={expires} disabled={!canSecrets || busy} onChange={(e) => setExpires(e.target.value)} />
          </label>
          {provider === 'tiktok' && (
            <label className="pf-f">
              الصلاحيات المطلوبة <small>مفصولة بفواصل، وتكون ممّا أضفته إلى التطبيق</small>
              <input className="ltr" value={scopes} placeholder="user.info.basic,video.publish,video.upload" disabled={!canSecrets || busy} onChange={(e) => setScopes(e.target.value)} />
            </label>
          )}
        </details>
      ),
    },
    keys: needsConfig ? ['id', 'secret', 'config', 'more'] : ['id', 'secret', 'more'],
    after: (
      <>
        <p className="pf-note info">يسأل الموقع المنصة أولاً، ولا يحفظ شيئاً إن رفضت. السر يذهب إلى الخزنة ولا يُعرض بعد ذلك، فإن أغلقت قبل الفحص أعدت إدخاله وحده.</p>
        {error && (
          <p className="pf-note bad" role="alert">
            {error}
          </p>
        )}
      </>
    ),
    button: (
      <button
        type="button"
        className="pf-btn pri st-app-save"
        disabled={busy || (canSecrets && (!id.trim() || !secret.trim() || (needsConfig && !config.trim())))}
        {...(canSecrets ? { onClick: () => void save() } : lock('إدخال الأسرار لمن يملك «إدارة المنصات وتطبيقاتها» و«إدخال أسرار التكاملات وتجديدها».'))}
      >
        {busy ? 'جارٍ الفحص…' : have ? 'استبدال بعد الفحص' : 'فحص وحفظ'}
      </button>
    ),
  };
}

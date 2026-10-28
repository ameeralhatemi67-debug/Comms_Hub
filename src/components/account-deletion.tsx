'use client';
// «حذف الحساب» on «الحساب» (MVP_draft.md 64.6; Android_Build_Plan.md A8), in the application and in a browser alike.
// A person asks for their account to be deleted, with an optional note; those who may remove them are told in
// «يحتاج قرارك» and carry it out with «إزالة» in «الحسابات». While the request is open it can be withdrawn. Who is
// told, who sees what and what goes with the account are the database's (supabase/migrations/*account_deletion*).
// A person who cannot sign in uses the public page, which says how.
import { useCallback, useEffect, useState } from 'react';
import { Trash2, Undo2 } from 'lucide-react';
import { useAccount } from '@/lib/account-context';
import { supabase } from '@/lib/supabase/client';
import { kickPush } from '@/lib/push/kick';
import { HOLD } from '@/lib/kit/hold-reasons';
import { DELETED, DELETION_PAGE, deletionError, KEPT, NOTE_MAX, type DeletionRequest } from '@/lib/account-deletion';
import { Panel } from './ui';

const day = (iso: string) => new Date(iso).toLocaleString('sv-SE', { timeZone: 'Asia/Riyadh' }).slice(0, 16);

export function AccountDeletionPanel() {
  const me = useAccount();
  const [state, setState] = useState<'loading' | 'none' | 'open' | 'error'>('loading');
  const [open, setOpen] = useState<DeletionRequest | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState('');

  const read = useCallback(async () => {
    const { data, error } = await supabase()
      .from('account_deletions')
      .select('id, email, name, note, status, created_at')
      .eq('email', me.email)
      .eq('status', 'open')
      .maybeSingle();
    if (error) return setState('error');
    setOpen((data as DeletionRequest | null) ?? null);
    setState(data ? 'open' : 'none');
  }, [me.email]);

  useEffect(() => {
    void read();
  }, [read]);

  const ask = async () => {
    setBusy(true);
    setSaid('');
    const { error } = await supabase().rpc('account_deletion_request', { p_note: note.trim() || null });
    if (error) setSaid(deletionError(error.message));
    else {
      kickPush();
      setNote('');
      setSaid('وصل طلبك إلى من يملك إزالة حسابك.');
      await read();
    }
    setBusy(false);
  };
  const withdraw = async () => {
    setBusy(true);
    setSaid('');
    const { error } = await supabase().rpc('account_deletion_withdraw');
    setSaid(error ? 'تعذّر سحب الطلب الآن. أعد المحاولة.' : 'سُحب طلب الحذف، ويبقى حسابك كما هو.');
    await read();
    setBusy(false);
  };

  return (
    <Panel title="حذف الحساب" className="ac-delete-panel">
      {state === 'loading' ? null : state === 'open' && open ? (
        <>
          <p>
            طلبت حذف حسابك في <bdi dir="ltr">{day(open.created_at)}</bdi>. وصل الطلب إلى من يملك إزالة حسابك، وعند تنفيذه يُلغى دخولك من كل جهاز ويُحذف
            ملفك الشخصي.
          </p>
          {open.note && <p className="muted">ملاحظتك: {open.note}</p>}
          <div className="actions">
            <button type="button" className="secondary ac-delete-withdraw" disabled={busy} onClick={() => void withdraw()}>
              <Undo2 aria-hidden="true" />
              سحب الطلب
            </button>
          </div>
        </>
      ) : (
        <>
          <p>تستطيع أن تطلب حذف حسابك من المركز، في التطبيق أو في المتصفح. يصل طلبك إلى من يملك إزالة حسابك: مسؤول النظام، ومدير الاتصال لمن دونه.</p>
          <details className="ac-delete-what">
            <summary>ما يُحذف وما يبقى</summary>
            <b>يُحذف مع حسابك:</b>
            <ul>
              {DELETED.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
            <b>يبقى في المركز سجلاً للمؤسسة:</b>
            <ul>
              {KEPT.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </details>
          <label>
            ملاحظة لمن ينفّذ الطلب (اختيارية)
            <textarea className="ac-delete-note" rows={2} maxLength={NOTE_MAX} value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <div className="actions">
            <button type="button" className="secondary danger ac-delete-ask" disabled={busy || state === 'error'} data-hold={HOLD.deletionRequest} onClick={() => void ask()}>
              <Trash2 aria-hidden="true" />
              طلب حذف حسابي
            </button>
          </div>
          {state === 'error' && (
            <p className="muted" role="status">
              تعذّر قراءة طلبات الحذف الآن. أعد تحميل الصفحة، أو اتبع الطريقة الثانية في صفحة حذف الحساب.
            </p>
          )}
        </>
      )}
      {said && (
        <p className="ml-hint" role="status">
          {said}
        </p>
      )}
      <p className="muted">
        إن لم تستطع الدخول إلى المركز، فصفحة{' '}
        <a href={DELETION_PAGE}>
          حذف الحساب
        </a>{' '}
        تقول كيف تطلبه من بريد حسابك.
      </p>
    </Panel>
  );
}

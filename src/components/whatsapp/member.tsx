'use client';
// «واتساب» on the account page (Permissions_Plan.md 8.3): the member opts in, proves a number
// with a six-digit code sent from the system's own number, and chooses from which level
// messages reach them, whether pushed messages do, and whom to mute. The number is seen only
// by its owner and an administrator (D-12). The database decides every step (wa_* functions);
// the code is made on the server and never reaches this page.
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { LEVEL_CHOICES, maskPhone, normalisePhone, systemLine, waError, type WaMe } from '@/lib/whatsapp/rules';
import { PeopleProvider, usePeople } from '../people';

/** `initial` lets a check draw the section without the database (qa/permissions-pages.cjs). */
export function WhatsAppSettings({ initial }: { initial?: WaMe }) {
  return (
    <PeopleProvider>
      <Section initial={initial} />
    </PeopleProvider>
  );
}

function Section({ initial }: { initial?: WaMe }) {
  const people = usePeople();
  const [me, setMe] = useState<WaMe | null>(initial ?? null);
  const [error, setError] = useState('');
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [changing, setChanging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [muteWho, setMuteWho] = useState('');
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    const { data, error: e } = await supabase().rpc('wa_me');
    if (e) return setError(waError(e.message));
    setError('');
    setMe(data as WaMe);
    setNow(Date.now());
  }, []);
  useEffect(() => {
    void load();
    const back = () => document.visibilityState === 'visible' && void load();
    document.addEventListener('visibilitychange', back);
    const t = setInterval(() => void load(), 60_000);
    return () => {
      document.removeEventListener('visibilitychange', back);
      clearInterval(t);
    };
  }, [load]);

  const rpc = async (fn: string, args: Record<string, unknown>, ok?: string) => {
    setBusy(true);
    const { data, error: e } = await supabase().rpc(fn, args);
    setBusy(false);
    if (e) {
      setNote({ ok: false, text: waError(e.message) });
      return null;
    }
    if (ok) setNote({ ok: true, text: ok });
    await load();
    return data ?? true;
  };

  const askCode = async () => {
    const p = normalisePhone(phone);
    if (!p) return setNote({ ok: false, text: waError('WA_PHONE_BAD') });
    setBusy(true);
    const res = await fetch('/api/whatsapp/code', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: p }) });
    setBusy(false);
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) return setNote({ ok: false, text: body.error ?? 'تعذّر إرسال الرمز.' });
    setCode('');
    setNote({ ok: true, text: 'أُرسل الرمز من رقم النظام إلى هذا الرقم على واتساب. اكتبه هنا خلال عشر دقائق.' });
    await load();
  };

  const verify = async () => {
    const r = (await rpc('wa_code_verify', { p_code: code.trim() })) as { ok?: boolean; left?: number } | null;
    if (!r) return;
    if (r.ok) {
      setChanging(false);
      setPhone('');
      setCode('');
      setNote({ ok: true, text: 'تحقق الرقم. تصلك الآن رسائل واتساب بحسب اختياراتك أدناه.' });
    } else setNote({ ok: false, text: `الرمز غير صحيح. بقي ${r.left ?? 0} من المحاولات.` });
  };

  if (error) return <p className="ml-err">{error}</p>;
  if (!me) return <p className="muted">جارٍ تحميل إعدادات واتساب…</p>;
  const others = people.people.filter((p) => p.email !== people.me?.email && !me.mutes.includes(p.email));
  const askingNumber = me.on && (!me.phone || changing);

  return (
    <div className="wa-member pf ml">
      <p className="wa-sys muted">
        واتساب النظام: <b>{systemLine(me.system, now)}</b>
      </p>
      <label className="ml-check wa-toggle">
        <input type="checkbox" checked={me.on} disabled={busy} onChange={(e) => void rpc('wa_set', { p: { on: e.target.checked } }, e.target.checked ? 'فُعّل. أضف رقمك وتحقق منه.' : 'أُوقف، وحُذف رقمك من المركز.')} />
        استلام رسائل واتساب
      </label>
      <p className="muted">
        يرسل المركز إلى رقمك رسالة في حالتين فقط: رسالة بدرجة تختارها أدناه، أو رسالة دفعها إليك زميل يملك صلاحية ذلك. الإرسال باتجاه واحد: لا يقرأ المركز الردود. إيقاف هذا الخيار يحذف رقمك.
      </p>

      {me.on && me.phone && !changing && (
        <div className="wa-number between">
          <span>
            رقمك المتحقق منه: <bdi dir="ltr">{me.phone}</bdi>
          </span>
          <button type="button" className="ml-btn quiet" onClick={() => setChanging(true)}>
            تغيير الرقم
          </button>
        </div>
      )}

      {askingNumber && (
        <div className="wa-number">
          <label htmlFor="wa-phone">
            رقم واتساب بالصيغة الدولية <small>مثل +9665xxxxxxxx. يرى رقمك أنت ومسؤول النظام فقط.</small>
            <input id="wa-phone" dir="ltr" inputMode="tel" autoComplete="tel" value={phone} placeholder="+9665" onChange={(e) => setPhone(e.target.value)} />
          </label>
          <div className="actions">
            <button type="button" className="ml-btn primary" disabled={busy || !phone.trim()} onClick={() => void askCode()}>
              إرسال الرمز
            </button>
            {changing && (
              <button type="button" className="ml-btn quiet" onClick={() => setChanging(false)}>
                إلغاء
              </button>
            )}
          </div>
        </div>
      )}

      {me.on && me.pending && (
        <div className="wa-code">
          <label htmlFor="wa-code">
            الرمز المرسل إلى <bdi dir="ltr">{maskPhone(me.pending.phone)}</bdi> <small>ستة أرقام، صالح عشر دقائق، وبقي {me.pending.left} من المحاولات.</small>
            <input id="wa-code" dir="ltr" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
          </label>
          <button type="button" className="ml-btn primary" disabled={busy || code.length !== 6} onClick={() => void verify()}>
            تحقق
          </button>
        </div>
      )}

      {me.on && (
        <>
          <label htmlFor="wa-level" className="wa-level">
            أرسل لي من درجة
            <select id="wa-level" value={me.from_level} disabled={busy} onChange={(e) => void rpc('wa_set', { p: { from_level: Number(e.target.value) } }, 'حُفظ.')}>
              {LEVEL_CHOICES.map((c) => (
                <option key={c.v} value={c.v}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label className="ml-check wa-pushed">
            <input type="checkbox" checked={me.pushed} disabled={busy} onChange={(e) => void rpc('wa_set', { p: { pushed: e.target.checked } }, 'حُفظ.')} />
            الرسائل التي يدفعها إليّ زميل
          </label>
          <div className="wa-mutes">
            <span>زملاء لا تصلني منهم رسائل واتساب</span>
            {me.mutes.length === 0 && <small className="muted">لا أحد.</small>}
            <ul>
              {me.mutes.map((m) => (
                <li key={m} className="between">
                  {people.nameOf(m)}
                  <button type="button" className="ml-btn quiet" disabled={busy} onClick={() => void rpc('wa_mute', { p_sender: m, p_on: false }, 'أُلغي الكتم.')}>
                    إلغاء الكتم
                  </button>
                </li>
              ))}
            </ul>
            <div className="actions">
              <select aria-label="زميل للكتم" value={muteWho} onChange={(e) => setMuteWho(e.target.value)}>
                <option value="">اختر زميلاً…</option>
                {others.map((p) => (
                  <option key={p.email} value={p.email}>
                    {p.display_name}
                  </option>
                ))}
              </select>
              <button type="button" className="ml-btn" disabled={busy || !muteWho} onClick={() => void rpc('wa_mute', { p_sender: muteWho, p_on: true }, 'لن تصلك منه رسائل واتساب. تبقى رسائله في المركز.').then(() => setMuteWho(''))}>
                كتم
              </button>
            </div>
          </div>
        </>
      )}
      {note && <p className={note.ok ? 'ml-hint' : 'ml-err'} role="status">{note.text}</p>}
    </div>
  );
}

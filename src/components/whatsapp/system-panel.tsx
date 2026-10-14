'use client';
// «واتساب النظام» in Settings (Permissions_Plan.md 8.2): the system number's switch, the name
// and about line the messages are signed with, the daily cap on pushed messages per sender,
// the length cap of a message, the bridge's last heartbeat, counts, the last failures and a
// test send to the manager's own number. For «إدارة رقم واتساب النظام» (the administrator by
// default). No key, token or number is ever shown or stored here: the server key lives in the
// server's environment and only its sha256 is in the database.
import { useCallback, useEffect, useState } from 'react';
import { needProps } from '@/lib/kit/need';
import { supabase } from '@/lib/supabase/client';
import { KIND_AR, systemLine, waError, type OutboxKind } from '@/lib/whatsapp/rules';
import { useCaps } from '../caps';

type View = {
  enabled: boolean;
  display_name: string;
  about: string | null;
  daily_cap: number;
  max_chars: number;
  heartbeat_at: string | null;
  bridge_note: string | null;
  online: boolean;
  linked: number;
  queued: number;
  sent_day: number;
  failed_day: number;
  failures: { kind: OutboxKind; error: string | null; at: string; who: string }[];
};

const when = (iso: string) => new Date(iso).toLocaleString('ar-SA-u-nu-latn', { dateStyle: 'short', timeStyle: 'short' });

export type SystemView = View;

/** `initial` lets a check draw the panel without the database (qa/permissions-pages.cjs). */
export function WhatsAppSystemPanel({ initial }: { initial?: View }) {
  const caps = useCaps();
  const [v, setV] = useState<View | null>(initial ?? null);
  const [form, setForm] = useState(() =>
    initial ? { display_name: initial.display_name, about: initial.about ?? '', daily_cap: initial.daily_cap, max_chars: initial.max_chars } : { display_name: '', about: '', daily_cap: 10, max_chars: 1000 },
  );
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase().rpc('wa_system_view');
    if (error) return setRefused(true);
    const d = data as View;
    setRefused(false);
    setV(d);
    setForm({ display_name: d.display_name, about: d.about ?? '', daily_cap: d.daily_cap, max_chars: d.max_chars });
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const call = async (fn: string, args: Record<string, unknown>, ok: string) => {
    setBusy(true);
    const { error } = await supabase().rpc(fn, args);
    setBusy(false);
    setNote(error ? { ok: false, text: waError(error.message) } : { ok: true, text: ok });
    if (!error) await load();
  };

  if (refused || (caps.ready && !caps.has('whatsapp.system.manage')))
    return (
      <div className="wa-system">
        <p className="muted">
          إدارة رقم واتساب النظام لمن يملك «إدارة رقم واتساب النظام»: مسؤول النظام افتراضياً. حالة الاتصال تظهر لكل عضو في صفحة «الحساب».
        </p>
        <button type="button" className="secondary" {...needProps('whatsapp.system.manage', 'إدارة رقم واتساب النظام لمسؤول النظام افتراضياً، ويمنحها لغيره.')}>
          اطلب هذه الصلاحية
        </button>
      </div>
    );
  if (!v) return <p className="muted">جارٍ تحميل واتساب النظام…</p>;

  return (
    <div className="wa-system">
      <div className="wa-sys-state notice">
        <b>{systemLine(v, Date.now())}</b>
        {v.bridge_note && <small>آخر ما قاله الجسر: {v.bridge_note}</small>}
        <small>
          يعمل الإرسال عبر جسر على جهاز يبقى مشغّلاً، يسأل الموقع كل بضع ثوانٍ عمّا ينتظر. ربط الرقم أول مرة بمسح رمز QR من هاتف الرقم نفسه، ولا يتم من هنا.
        </small>
      </div>

      <label className="ml-check wa-sys-switch">
        <input type="checkbox" checked={v.enabled} disabled={busy} onChange={(e) => void call('wa_system_update', { p: { enabled: e.target.checked } }, e.target.checked ? 'شُغّل واتساب النظام.' : 'أُوقف واتساب النظام. ما في الطابور يبقى حتى يعود.')} />
        تشغيل واتساب النظام
      </label>

      <div className="wa-sys-form">
        <label htmlFor="wa-sys-name">
          الاسم الذي تُوقَّع به الرسائل
          <input id="wa-sys-name" maxLength={60} value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} />
        </label>
        <label htmlFor="wa-sys-about">
          نبذة <small>تُضبط على الرقم نفسه من الهاتف، وتُحفظ هنا للتذكير.</small>
          <input id="wa-sys-about" maxLength={140} value={form.about} onChange={(e) => setForm({ ...form, about: e.target.value })} />
        </label>
        <label htmlFor="wa-sys-cap">
          حد الرسائل المدفوعة لكل مرسل في اليوم
          <input id="wa-sys-cap" type="number" min={0} max={200} value={form.daily_cap} onChange={(e) => setForm({ ...form, daily_cap: Number(e.target.value) })} />
        </label>
        <label htmlFor="wa-sys-max">
          أقصى طول للرسالة بالأحرف <small>ما زاد يُختصر ويُكمل من الرابط.</small>
          <input id="wa-sys-max" type="number" min={200} max={4000} step={100} value={form.max_chars} onChange={(e) => setForm({ ...form, max_chars: Number(e.target.value) })} />
        </label>
        <p className="muted">الصورة والاسم الظاهر في واتساب نفسه يُضبطان من هاتف الرقم، فطريقة الربط المجانية لا تغيّرهما.</p>
        <div className="actions">
          <button type="button" className="primary" disabled={busy} onClick={() => void call('wa_system_update', { p: form }, 'حُفظت إعدادات واتساب النظام.')}>
            حفظ
          </button>
          <button type="button" className="secondary wa-sys-test" disabled={busy || !v.enabled} onClick={() => void call('wa_test_send', {}, 'وُضعت رسالة تجربة إلى رقمك في الطابور. تصل حين يسأل الجسر.')}>
            رسالة تجربة إلى رقمي
          </button>
        </div>
      </div>

      <div className="wa-sys-counts table">
        <div className="between">
          <span>أعضاء ربطوا أرقامهم</span>
          <b>{v.linked}</b>
        </div>
        <div className="between">
          <span>تنتظر الإرسال الآن</span>
          <b>{v.queued}</b>
        </div>
        <div className="between">
          <span>أُرسلت خلال يوم</span>
          <b>{v.sent_day}</b>
        </div>
        <div className="between">
          <span>تعذّرت خلال يوم</span>
          <b>{v.failed_day}</b>
        </div>
      </div>

      <div className="wa-sys-fails">
        <b>آخر ما تعذّر</b>
        {v.failures.length === 0 ? (
          <p className="muted">لا شيء.</p>
        ) : (
          <ul>
            {v.failures.map((f, i) => (
              <li key={i}>
                {KIND_AR[f.kind]} إلى {f.who} · {f.error ?? 'تعذّر الإرسال.'} · <bdi dir="ltr">{when(f.at)}</bdi>
              </li>
            ))}
          </ul>
        )}
        <small className="muted">لا تظهر هنا نصوص الرسائل ولا الأرقام: الطابور يحفظ المعرّفات فقط.</small>
      </div>
      {note && (
        <p className={note.ok ? 'ml-hint' : 'ml-err'} role="status">
          {note.text}
        </p>
      )}
    </div>
  );
}

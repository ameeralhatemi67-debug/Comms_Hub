'use client';
// «واتساب النظام» in Settings (Permissions_Plan.md 8.2): the system number's switch, the name
// and about line the messages are signed with, the daily cap on pushed messages per sender,
// the length cap of a message, the bridge's last heartbeat, counts, the last failures and a
// test send to the manager's own number. For «إدارة رقم واتساب النظام» (the administrator by
// default). The bridge's key is made here (Action_Plan.md B9): shown once, kept in the vault, and
// only its sha256 is in the database. No number is ever shown or stored here.
import { useCallback, useEffect, useState } from 'react';
import { needProps } from '@/lib/kit/need';
import { supabase } from '@/lib/supabase/client';
import { KIND_AR, systemLine, waError, type OutboxKind } from '@/lib/whatsapp/rules';
import { useCaps } from '../caps';
import { SetupGuide } from '../setup-guide';
import { Modal } from '../ui';

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
  const [bridge, setBridge] = useState<{ tail: string | null; at: string | null } | null | undefined>(undefined);

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
  // Whether a key was made in the site (the settings list; whoever may open this panel may read it).
  const loadBridge = useCallback(async () => {
    try {
      const r = await supabase().rpc('int_list');
      const row = ((r.data ?? []) as { type: string; secret_tail: string | null; secret_set_at: string | null }[]).find((x) => x.type === 'whatsapp_bridge');
      setBridge(row ? { tail: row.secret_tail, at: row.secret_set_at } : null);
    } catch {
      setBridge(null);
    }
  }, []);
  useEffect(() => {
    if (!initial) void loadBridge();
  }, [initial, loadBridge]);

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

      <BridgeKeyBlock bridge={bridge} onIssued={loadBridge} />

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

/** The bridge's key: made in the site, shown once, never read back. */
function BridgeKeyBlock({ bridge, onIssued }: { bridge: { tail: string | null; at: string | null } | null | undefined; onIssued: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [shown, setShown] = useState<{ key: string; site: string } | null>(null);
  const [asking, setAsking] = useState(false);
  const [copied, setCopied] = useState('');
  const make = async () => {
    setBusy(true);
    setErr('');
    try {
      const r = await fetch('/api/whatsapp/bridge-key', { method: 'POST' });
      const b = (await r.json()) as { key?: string; site?: string; error?: string };
      if (!r.ok || !b.key) return setErr(b.error ?? 'تعذّر إنشاء المفتاح.');
      setAsking(false);
      setShown({ key: b.key, site: b.site ?? window.location.origin });
      await onIssued();
    } catch {
      setErr('تعذّر الوصول إلى الخادم.');
    } finally {
      setBusy(false);
    }
  };
  const copy = async (text: string, tag: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(tag);
    } catch {
      setCopied('');
    }
  };
  const have = Boolean(bridge);
  const env = shown ? `COMMS_SITE_URL=${shown.site}\nWHATSAPP_SERVER_KEY=${shown.key}` : '';
  return (
    <section className="wa-sys-bridge notice" aria-label="مفتاح الجسر">
      <div className="between">
        <b>
          مفتاح الجسر <SetupGuide guide="whatsapp" label="خطوات إعداد واتساب النظام" />
        </b>
        <span className="mx-chip">{bridge === undefined ? '…' : have ? 'أُنشئ' : 'لم يُنشأ بعد'}</span>
      </div>
      <small className="muted">
        {have
          ? `المفتاح محفوظ في الخزنة (${bridge!.tail ?? ''})${bridge!.at ? ` منذ ${when(bridge!.at)}` : ''}. لا يُعرض بعد إنشائه. هو ما يضعه جهاز الجسر في ملف إعداده.`
          : 'يُنشأ هنا بدل الأوامر والمحرّر: يظهر مرة واحدة لتضعه في ملف إعداد جهاز الجسر، ولا يُحفظ في أي مكان آخر.'}
      </small>
      {err && (
        <p className="ml-err" role="status">
          {err}
        </p>
      )}
      <div className="actions">
        <button type="button" className="secondary wa-sys-keygen" disabled={busy} onClick={() => (have ? setAsking(true) : void make())}>
          {have ? 'إنشاء مفتاح جديد' : 'إنشاء مفتاح الجسر'}
        </button>
      </div>
      {asking && (
        <Modal title="إنشاء مفتاح جديد؟" onClose={() => setAsking(false)}>
          <p>المفتاح الحالي يتوقف عن العمل فوراً، فلا يرسل الجسر القائم شيئاً حتى تضع المفتاح الجديد في ملف إعداده. ما في الطابور ينتظر ولا يضيع.</p>
          <div className="actions">
            <button type="button" className="primary" disabled={busy} onClick={() => void make()}>
              إنشاء مفتاح جديد
            </button>
            <button type="button" className="secondary" onClick={() => setAsking(false)}>
              تراجع
            </button>
          </div>
        </Modal>
      )}
      {shown && (
        <Modal title="مفتاح الجسر" onClose={() => setShown(null)}>
          <p>انسخ السطرين إلى ملف <bdi dir="ltr">.env</bdi> في مجلد الجسر على الجهاز المشغّل. لن يظهر المفتاح مرة ثانية؛ إن ضاع أنشئ غيره.</p>
          <textarea readOnly dir="ltr" rows={3} className="wa-sys-keybox" value={env} onFocus={(e) => e.currentTarget.select()} />
          <div className="actions">
            <button type="button" className="primary" onClick={() => void copy(env, 'env')}>
              {copied === 'env' ? 'نُسخ' : 'نسخ السطرين'}
            </button>
            <button type="button" className="secondary" onClick={() => setShown(null)}>
              تم، أغلق
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}

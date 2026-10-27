'use client';
// «أجهزتي» and «إعدادات التنبيهات» on «الحساب» (MVP_draft.md 64.3; Mobile_Apps_Plan.md 5.3 and 5.4,
// decisions M-4, M-5 and M-13). A person sees and manages only their own devices: the list is the
// view my_devices, which has no token, and every change is a database function. Removing a device
// stops its notices at once; the application finds itself removed the next time it opens, and
// signs out there.
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { HOLD } from '@/lib/kit/hold-reasons';
import { deviceErrorText, deviceLine, prefsOf, type MyDevice } from '@/lib/push/devices';
import { Panel } from '../ui';

export function MyDevicesPanels() {
  const [list, setList] = useState<MyDevice[] | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [now] = useState(() => Date.now());

  const load = useCallback(async () => {
    const { data, error } = await supabase()
      .from('my_devices')
      .select('id,platform,version,name,push_ready,attention,hide_text,created_at,seen_at')
      .order('seen_at', { ascending: false });
    setList(error ? [] : ((data ?? []) as MyDevice[]));
    if (error) setNote({ ok: false, text: 'تعذّر تحميل أجهزتك.' });
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const act = async (fn: string, args: Record<string, unknown>, done: string) => {
    setBusy(true);
    setNote(null);
    const { error } = await supabase().rpc(fn, args);
    setBusy(false);
    if (error) return setNote({ ok: false, text: deviceErrorText(error.message) });
    setNote({ ok: true, text: done });
    setEditing(null);
    await load();
  };

  const prefs = prefsOf(list ?? []);
  return (
    <>
      <Panel title="أجهزتي" className="dv-panel">
        <div className="dv-devices">
          <p className="muted">
            الهواتف التي سجّلت الدخول فيها بتطبيق المركز. تراها أنت وحدك، ولا يرى أحد غيرك أسماءها. الإزالة توقف تنبيهات الجهاز فوراً، ويخرج التطبيق منه في المرة التالية التي يُفتح فيها؛ إن فقدت هاتفاً فاستعمل أيضاً «الخروج من الأجهزة الأخرى».
          </p>
          {list === null ? (
            <p className="muted">جارٍ التحميل…</p>
          ) : !list.length ? (
            <p className="muted dv-empty">لا أجهزة بعد. ثبّت «تطبيق الهاتف» وسجّل الدخول فيه ليظهر هنا وتصله التنبيهات.</p>
          ) : (
            <ul className="dv-list">
              {list.map((d) => (
                <li key={d.id} className="dv-row">
                  <div className="between">
                    {editing === d.id ? (
                      <input className="wk-inp dv-name" value={name} maxLength={60} autoFocus aria-label="اسم الجهاز" onChange={(e) => setName(e.target.value)} />
                    ) : (
                      <b>{d.name}</b>
                    )}
                    <span className={`mx-chip ${d.push_ready ? 'success' : ''}`}>{d.push_ready ? 'تصله التنبيهات' : 'لا تصله التنبيهات'}</span>
                  </div>
                  <small className="muted">{deviceLine(d, now)}</small>
                  <div className="actions">
                    {editing === d.id ? (
                      <>
                        <button type="button" className="secondary dv-save" disabled={busy || !name.trim()} onClick={() => void act('device_rename', { p_device: d.id, p_name: name }, 'تغيّر اسم الجهاز.')}>
                          حفظ الاسم
                        </button>
                        <button type="button" className="secondary" disabled={busy} onClick={() => setEditing(null)}>
                          إلغاء
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="secondary dv-rename"
                        disabled={busy}
                        onClick={() => {
                          setEditing(d.id);
                          setName(d.name);
                        }}
                      >
                        تغيير الاسم
                      </button>
                    )}
                    <button
                      type="button"
                      className="secondary danger dv-remove"
                      data-hold={HOLD.deviceRemove}
                      disabled={busy}
                      onClick={() => void act('device_remove', { p_device: d.id }, 'أُزيل الجهاز. لن تصله تنبيهات بعد الآن.')}
                    >
                      إزالة الجهاز
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {note && (
            <p className={note.ok ? 'ml-hint' : 'ml-err'} role="status">
              {note.text}
            </p>
          )}
        </div>
      </Panel>
      <Panel title="إعدادات التنبيهات" className="dv-panel">
        <div className="dv-prefs">
          <p className="muted">
            «يحتاج قرارك» يصل إلى هاتفك دائماً وبصوت. «للعلم» لا يصل إليه أبداً، ويبقى في المركز. الرسائل المباشرة والإشارات إليك وبطاقات البريد الموجهة إليك تصل بسطر «رسالة جديدة من …» فقط، دون نصها.
          </p>
          {!list?.length ? (
            <p className="muted">تظهر هذه الإعدادات بعد أن تسجّل الدخول في تطبيق الهاتف.</p>
          ) : (
            <>
              <label className="ml-check dv-attention">
                <input type="checkbox" checked={prefs.attention} disabled={busy} onChange={(e) => void act('device_prefs', { p_device: null, p_attention: e.target.checked, p_hide_text: null }, e.target.checked ? 'ستصلك تنبيهات «يحتاج انتباهك» صامتة.' : 'لن تصلك تنبيهات «يحتاج انتباهك» على الهاتف.')} />
                تنبيهات «يحتاج انتباهك» على الهاتف (بلا صوت)
              </label>
              <label className="ml-check dv-hide">
                <input type="checkbox" checked={prefs.hide_text} disabled={busy} onChange={(e) => void act('device_prefs', { p_device: null, p_attention: null, p_hide_text: e.target.checked }, e.target.checked ? 'تظهر التنبيهات بسطر عام دون نصها.' : 'تظهر التنبيهات بنصها.')} />
                إخفاء نص التنبيهات (يظهر «لديك إشعار جديد في المركز.» بدل النص، ولا يظهر اسم المرسل)
              </label>
              {prefs.mixed && <small className="muted">أجهزتك مختلفة الإعدادات الآن؛ أي تغيير هنا يسري عليها كلها.</small>}
            </>
          )}
        </div>
      </Panel>
    </>
  );
}

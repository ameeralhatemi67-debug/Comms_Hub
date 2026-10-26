'use client';
// «تطبيق سطح المكتب» on «الحساب» (MVP_draft.md 63.2; Desktop_App_Plan.md 6 and 7.4, phase D3). In a browser it
// offers the newest release of the Windows application from the public bucket, with what SmartScreen will
// ask while the pilot is unsigned. Inside the application it says which version runs, how its own update
// stands, and offers «إعادة التشغيل للتحديث» once one is ready (refused during an export). The banner asks
// an application older than the site needs to update. Inside the application it also offers «مسح بيانات
// هذا الجهاز» (decision D-11, 63.3), held down like every action that cannot be undone. Every signed-in
// person sees it; it reads nothing about anyone.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Download, Eraser, MonitorDown, RotateCw } from 'lucide-react';
import { HOLD } from '@/lib/kit/hold-reasons';
import { native } from '@/lib/native';
import { downloadUrl, newer, parseLatest, tooOld, updateLine, DESKTOP_FEED, type Release, type UpdateView } from '@/lib/native/releases';
import { formatBytes } from '@/lib/studio/support';
import { useNativeFeature, useNativePlatform, useNativeVersion } from './use-native';

function useLatest(): Release | null | undefined {
  const [latest, setLatest] = useState<Release | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    fetch(`${DESKTOP_FEED}/latest.yml`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.text() : ''))
      .then((t) => live && setLatest(parseLatest(t)))
      .catch(() => live && setLatest(null));
    return () => {
      live = false;
    };
  }, []);
  return latest;
}

export function DesktopAppPanel() {
  const version = useNativeVersion();
  // Only the desktop application speaks of itself here; the Android application has its own panel.
  const inApp = useNativePlatform() === 'desktop' && version !== null;
  const canUpdate = useNativeFeature('update');
  const latest = useLatest();
  const [update, setUpdate] = useState<UpdateView | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (!canUpdate) return;
    const n = native();
    let live = true;
    const read = () => n.raw!.update!.status!().then((s) => live && setUpdate(s as UpdateView), () => undefined);
    void read();
    const t = setInterval(read, 2000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [canUpdate]);

  if (inApp) {
    return (
      <div className="dv-app">
        <p>
          تعمل الآن في تطبيق سطح المكتب، الإصدار <bdi dir="ltr">{version}</bdi>.
        </p>
        {tooOld(version) && <p className="warning">هذا الإصدار أقدم مما يحتاجه المركز الآن، فحدّثه ليعمل كل شيء كما ينبغي.</p>}
        {update && <p className="muted">{updateLine(update)}</p>}
        {!update && newer(latest ?? null, version) && <p className="muted">يتوفر الإصدار {latest!.version}.</p>}
        {update?.state === 'ready' && (
          <div className="actions">
            <button
              type="button"
              className="primary"
              onClick={async () => {
                const r = await native().raw!.update!.restart!().catch(() => 'nothing');
                if (r === 'busy') setNote('لا يُعاد تشغيل التطبيق أثناء العمل: انتظر حتى ينتهي التصدير، أو أنهِ التطبيق ليُثبَّت التحديث.');
              }}
            >
              <RotateCw aria-hidden="true" />
              إعادة التشغيل للتحديث
            </button>
          </div>
        )}
        {note && <p className="muted" role="status">{note}</p>}
        {native().has('clearData') && (
          <div className="dv-clear">
            <p className="muted">
              «مسح بيانات هذا الجهاز» يمسح من هذا الحاسوب الدخول، ونسخ ملفات المكتبة المؤقتة، وما يتذكره الاستوديو من ملفات «هذا الجهاز» (تبقى الملفات نفسها في أماكنها)، ثم يعود التطبيق إلى صفحة الدخول. لا يُمس شيء في المركز نفسه.
            </p>
            <div className="actions">
              <button type="button" data-hold={HOLD.desktopClearData} onClick={() => void native().raw!.data!.clear!().catch(() => setNote('تعذّر المسح الآن.'))}>
                <Eraser aria-hidden="true" />
                مسح بيانات هذا الجهاز
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="dv-app">
      <p>تطبيق «مركز الاتصال المؤسسي» لنظام Windows (x64): يفتح المركز في نافذته، ويستمر التصدير والنافذة مصغّرة، وتصل إشعارات «يحتاج قرارك» إلى الحاسوب.</p>
      {latest === undefined && <p className="muted" role="status">جارٍ البحث عن آخر إصدار…</p>}
      {latest === null && <p className="muted">لم يُنشر إصدار للتنزيل بعد.</p>}
      {latest && (
        <>
          <div className="actions">
            <a className="primary button" href={downloadUrl(latest)} download>
              <Download aria-hidden="true" />
              تنزيل التطبيق
            </a>
          </div>
          <p className="muted">
            الإصدار <bdi dir="ltr">{latest.version}</bdi>
            {latest.size ? `، نحو ${formatBytes(latest.size)}` : ''}. يُثبَّت لحسابك وحده دون صلاحيات المسؤول. النسخة التجريبية غير موقّعة بعد، فيسأل Windows مرة واحدة: اختر «مزيد من المعلومات» ثم «تشغيل على أي حال».
          </p>
        </>
      )}
    </div>
  );
}

/** Across the top of every page, only inside an application older than the site needs. */
export function DesktopUpdateBanner() {
  const version = useNativeVersion();
  const platform = useNativePlatform();
  if (platform !== 'desktop' || !tooOld(version, 'desktop')) return null;
  return (
    <div className="warning dv-banner" role="status">
      <MonitorDown aria-hidden="true" />
      إصدار تطبيق سطح المكتب أقدم مما يحتاجه المركز الآن. <Link href="/account">حدّثه من «الحساب»</Link>.
    </div>
  );
}

'use client';

// The studio's note when this device has no measurement it follows (MVP_draft.md 63.6.1), inside the desktop application
// only: never measured, or measured for another application version, graphics chip or driver, so the studio runs at its
// floor. One line, «قياس قدرة الجهاز», which opens «معلومات الجهاز» at the measurement, and «لاحقاً», which hides it on this
// device for the current key only. It never measures by itself, and it is not shown while this page exports or uploads,
// nor in the preview's own window. A browser and an older application show nothing.
import { useCallback, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Gauge } from 'lucide-react';
import { native, onPageBusy, pageBusy, type ProfileEntry, type ProfileKey } from '@/lib/native';
import { measureKeyId, measureLine, measureState, PROFILE_SAVED } from '@/lib/native/device';
import { isPanelWindow } from '@/lib/studio/preview-link';
import { usePref } from '../studio/prefs';
import { DeviceInfoDialog } from './device-info';

export function MeasureNote() {
  const path = usePathname();
  const [profile, setProfile] = useState<{ current: ProfileKey; entries: ProfileEntry[] } | null>(null);
  const [kept, setKept] = usePref<string>('measureLater', '', (v): v is string => typeof v === 'string');
  const [busy, setBusy] = useState(pageBusy());
  const [open, setOpen] = useState(false);

  const read = useCallback(() => {
    const n = native();
    if (!n.has('profile') || !n.raw?.profile?.read) return;
    void n.raw.profile.read().then(
      (p) => setProfile(p),
      () => setProfile(null),
    );
  }, []);
  useEffect(() => {
    read();
    window.addEventListener(PROFILE_SAVED, read);
    const stop = onPageBusy(() => setBusy(pageBusy()));
    return () => {
      window.removeEventListener(PROFILE_SAVED, read);
      stop();
    };
  }, [read]);

  const line = measureLine(measureState(profile));
  const key = profile ? measureKeyId(profile.current) : '';
  if (!line || !profile || busy || isPanelWindow(path) || kept === key) return open ? <DeviceInfoDialog onClose={() => setOpen(false)} focus="measure" /> : null;
  return (
    <>
      <div className="st-banner st-banner-view" role="note" data-measure-note>
        <Gauge aria-hidden="true" />
        <span>{line}</span>
        <button type="button" className="st-mini" onClick={() => setOpen(true)}>
          قياس قدرة الجهاز
        </button>
        <button type="button" className="st-mini" onClick={() => setKept(key)}>
          لاحقاً
        </button>
      </div>
      {open && (
        <DeviceInfoDialog
          focus="measure"
          onClose={() => {
            setOpen(false);
            read();
          }}
        />
      )}
    </>
  );
}

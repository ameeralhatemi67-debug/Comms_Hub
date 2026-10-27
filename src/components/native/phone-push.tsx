'use client';
// Push notices on this phone (MVP_draft.md 64.3; Android_Build_Plan.md A5), inside the Android application only.
// - At each opening and each return to the application, the phone is registered for the signed-in person in
//   «أجهزتي», with its token when notices are allowed; a phone removed from «أجهزتي» signs out here.
// - Before Android asks for the notices permission, the site says why, once; «ليس الآن» puts it off a week.
// What a push opens and what it refreshes is wired in src/components/notices.tsx.
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { phoneSeen, registerPhone, signOutRemoved } from '@/lib/native/device-push';
import { EXPLAIN, pushState, requestPush, shouldExplain } from '@/lib/native/push';
import { useNativePlatform, useNativeVersion } from './use-native';

const LATER_KEY = 'commshub.push.later';
const laterAt = (): number | null => {
  try {
    const v = Number(localStorage.getItem(LATER_KEY));
    return v > 0 ? v : null;
  } catch {
    return null;
  }
};
const putOff = () => {
  try {
    localStorage.setItem(LATER_KEY, String(Date.now()));
  } catch {
    // asked again at the next opening
  }
};

export function PhonePush() {
  const platform = useNativePlatform();
  const version = useNativeVersion();
  const router = useRouter();
  const [explain, setExplain] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (platform !== 'android' || !version) return;
    let live = true;
    let last = 0;
    const check = async () => {
      // At each opening, then at most every ten minutes when the person comes back to the application.
      if (Date.now() - last < 10 * 60 * 1000) return;
      last = Date.now();
      const seen = await phoneSeen();
      const answer = seen === 'removed' ? 'removed' : await registerPhone();
      if (!live) return;
      if (answer === 'removed') {
        await signOutRemoved();
        router.refresh();
        return;
      }
      // Never over another window of the page, such as the update window: asked at a later opening instead.
      if (shouldExplain(await pushState(), laterAt(), Date.now()) && !document.querySelector('dialog[open]')) setExplain(true);
    };
    void check();
    const again = () => document.visibilityState === 'visible' && void check();
    document.addEventListener('visibilitychange', again);
    return () => {
      live = false;
      document.removeEventListener('visibilitychange', again);
    };
  }, [platform, version, router]);

  if (!explain) return null;
  return (
    <PushDialog
      busy={busy}
      onAllow={async () => {
        setBusy(true);
        const state = await requestPush();
        if (state === 'granted') await registerPhone();
        else putOff();
        setBusy(false);
        setExplain(false);
      }}
      onLater={() => {
        putOff();
        setExplain(false);
      }}
    />
  );
}

function PushDialog({ busy, onAllow, onLater }: { busy: boolean; onAllow: () => void; onLater: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    return () => d?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="apk-window phone-push"
      dir="rtl"
      aria-label={EXPLAIN.title}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onLater();
      }}
    >
      <h2>{EXPLAIN.title}</h2>
      <p>{EXPLAIN.body}</p>
      <div className="actions">
        <button type="button" className="primary" data-push="allow" disabled={busy} onClick={onAllow}>
          {EXPLAIN.allow}
        </button>
        <button type="button" data-push="later" disabled={busy} onClick={onLater}>
          {EXPLAIN.later}
        </button>
      </div>
    </dialog>
  );
}

'use client';
// The application lock on the phone (MVP_draft.md 64.4; Android_Build_Plan.md A6), inside the Android application
// only.
// - PhoneLockPanel: «قفل التطبيق» on «الحساب», with «تشغيل القفل» or «إيقاف القفل»; Android asks either way.
// - PhoneLockOffer: once after signing in, when the phone can lock and the question about notices is settled.
// The lock itself, and the screen that covers the page, are the application's (AppLock.java).
import { useEffect, useRef, useState } from 'react';
import { Lock } from 'lucide-react';
import { LOCK, lockState, setLock, shouldOfferLock, type LockState } from '@/lib/native/lock';
import { pushState } from '@/lib/native/push';
import { Panel } from '../ui';
import { useNativeFeature } from './use-native';

const OFFERED_KEY = 'commshub.lock.offered';
const offered = () => {
  try {
    return localStorage.getItem(OFFERED_KEY) === '1';
  } catch {
    return false;
  }
};
const markOffered = () => {
  try {
    localStorage.setItem(OFFERED_KEY, '1');
  } catch {
    // offered again at a later opening
  }
};

export function PhoneLockPanel() {
  const can = useNativeFeature('lock');
  const [state, setState] = useState<LockState | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  useEffect(() => {
    if (can) void lockState().then(setState);
  }, [can]);
  if (!can || !state) return null;
  const toggle = async () => {
    setBusy(true);
    setNote('');
    const ok = await setLock(!state.on);
    const now = await lockState();
    setState(now);
    setNote(ok ? (now?.on ? LOCK.turnedOn : LOCK.turnedOff) : LOCK.unchanged);
    setBusy(false);
  };
  return (
    <Panel title={LOCK.title} className="phone-lock-panel">
      <p>{!state.available && !state.on ? LOCK.unavailable : state.on ? LOCK.on : LOCK.off}</p>
      {(state.available || state.on) && (
        <div className="actions">
          <button type="button" className={state.on ? 'secondary' : 'primary'} data-lock={state.on ? 'off' : 'on'} disabled={busy} onClick={() => void toggle()}>
            <Lock />
            {state.on ? LOCK.turnOff : LOCK.turnOn}
          </button>
        </div>
      )}
      {note && (
        <p className="muted" role="status">
          {note}
        </p>
      )}
    </Panel>
  );
}

export function PhoneLockOffer() {
  const can = useNativeFeature('lock');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!can || offered()) return;
    let live = true;
    // After the page has settled, and never over another window of the page.
    const t = setTimeout(async () => {
      const [state, push] = await Promise.all([lockState(), pushState()]);
      if (live && shouldOfferLock(state, offered(), push) && !document.querySelector('dialog[open]')) setShow(true);
    }, 2500);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [can]);
  if (!show) return null;
  const close = () => {
    markOffered();
    setShow(false);
  };
  return (
    <LockDialog
      busy={busy}
      onOn={async () => {
        setBusy(true);
        await setLock(true);
        setBusy(false);
        close();
      }}
      onLater={close}
    />
  );
}

function LockDialog({ busy, onOn, onLater }: { busy: boolean; onOn: () => void; onLater: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    return () => d?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="apk-window phone-lock"
      dir="rtl"
      aria-label={LOCK.title}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onLater();
      }}
    >
      <h2>{LOCK.title}</h2>
      <p>{LOCK.offer}</p>
      <div className="actions">
        <button type="button" className="primary" data-lock="offer-on" disabled={busy} onClick={onOn}>
          {LOCK.turnOn}
        </button>
        <button type="button" data-lock="offer-later" disabled={busy} onClick={onLater}>
          {LOCK.later}
        </button>
      </div>
    </dialog>
  );
}

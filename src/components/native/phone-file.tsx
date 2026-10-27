'use client';
// The site's files on the phone (MVP_draft.md 64.2; Android_Build_Plan.md A4): «فتح الملف», «حفظ في الهاتف» and
// «مشاركة» inside the Android application, for a library file, a mail attachment or a file in «المراسلة».
// - PhoneFileButtons: the buttons themselves, where a page has room for them (the asset page, a picture's window).
// - PhoneFileLink: a file's link as it was; inside the application a tap asks which of the three, in a small
//   window the back key closes. In a browser it is the plain link and nothing else changes.
// The application fetches the file itself and says how it went; the page only waits for its answer.
import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { Download, FileText, Share2 } from 'lucide-react';
import { native } from '@/lib/native';
import { ACTION_BUSY, ACTION_LABEL, onPhone, phoneActions, type PhoneAction, type PhoneFile } from '@/lib/native/files';
import { useNativeFeature } from './use-native';

const ICON: Record<PhoneAction, ReactNode> = { open: <FileText />, save: <Download />, share: <Share2 /> };

/** What this phone offers for a file; nothing in a browser. */
export function usePhoneActions(inPage: boolean): PhoneAction[] {
  const download = useNativeFeature('download');
  const share = useNativeFeature('share');
  return phoneActions((f) => (f === 'download' ? download : f === 'share' ? share : false), inPage);
}

function useRun(file: PhoneFile, after?: () => void) {
  const [busy, setBusy] = useState<PhoneAction | null>(null);
  const run = async (action: PhoneAction) => {
    if (busy) return;
    setBusy(action);
    try {
      await onPhone(action, file);
    } finally {
      setBusy(null);
      after?.();
    }
  };
  return { busy, run };
}

/**
 * The phone's buttons for a file, or `fallback` (the browser's link) where there are none. `only` narrows them,
 * as for an earlier version, which is only opened.
 */
export function PhoneFileButtons({ file, inPage, small = false, only, fallback = null }: { file: PhoneFile; inPage: boolean; small?: boolean; only?: PhoneAction[]; fallback?: ReactNode }) {
  const actions = usePhoneActions(inPage).filter((a) => !only || only.includes(a));
  const { busy, run } = useRun(file);
  if (!actions.length) return <>{fallback}</>;
  return (
    <>
      {actions.map((a) => (
        <button key={a} type="button" className={small ? 'phone-file-btn sm' : 'phone-file-btn'} data-phone-action={a} disabled={busy !== null} aria-busy={busy === a} onClick={() => void run(a)}>
          {ICON[a]}
          {busy === a ? ACTION_BUSY[a] : ACTION_LABEL[a]}
        </button>
      ))}
    </>
  );
}

function PhoneFileSheet({ file, inPage, onClose }: { file: PhoneFile; inPage: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const actions = usePhoneActions(inPage);
  const { busy, run } = useRun(file, onClose);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    return () => d?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="phone-file"
      dir="rtl"
      aria-label={file.name}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
      // The window sits inside a message or a mail in the page's tree: its taps stay its own.
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.stopPropagation()}
    >
      <h2>
        <bdi>{file.name}</bdi>
      </h2>
      <div className="phone-file-list">
        {actions.map((a) => (
          <button key={a} type="button" data-phone-action={a} disabled={busy !== null} aria-busy={busy === a} onClick={() => void run(a)}>
            {ICON[a]}
            {busy === a ? ACTION_BUSY[a] : ACTION_LABEL[a]}
          </button>
        ))}
        <button type="button" className="phone-file-cancel" disabled={busy !== null} onClick={onClose}>
          إلغاء
        </button>
      </div>
    </dialog>
  );
}

/**
 * A file's link. In a browser, and in an application without these features, it is the link as it always was
 * (the application saves a tapped link to Downloads, A2). Inside the Android application a tap asks which.
 */
export function PhoneFileLink({ file, inPage = false, className, children }: { file: PhoneFile; inPage?: boolean; className?: string; children: ReactNode }) {
  const actions = usePhoneActions(inPage);
  const [asking, setAsking] = useState(false);
  const click = (e: MouseEvent<HTMLAnchorElement>) => {
    if (!actions.length || !native().has('download')) return;
    e.preventDefault();
    setAsking(true);
  };
  return (
    <>
      <a className={className} href={file.downloadPath ?? file.path} onClick={click}>
        {children}
      </a>
      {asking && <PhoneFileSheet file={file} inPage={inPage} onClose={() => setAsking(false)} />}
    </>
  );
}

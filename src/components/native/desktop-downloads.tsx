'use client';
// «فتح بالبرنامج الافتراضي» (MVP_draft.md 63.10; Desktop_Power_Ideas.md P-28), mounted in the shell. Inside the desktop
// application, once a library, mail or messaging download is saved, a small notice names the file and offers to open it
// in its program, for the document, picture, sound and video kinds the application allows, and to show it in its folder.
// The page knows the download by the id the application gave it, never by where it was saved; the application decides
// what opens and keeps Windows' mark of the web on the file. Nothing in a browser or an older application.
import { useEffect, useState } from 'react';
import { FileText, FolderOpen, X } from 'lucide-react';
import { actOnDownload, onDownloadDone, type NativeDownload } from '@/lib/native';
import { NEVER_OPENS, OPEN_LABEL, SAVED_AFTER, SAVED_BEFORE, SHOW_LABEL, WHY_LINE } from '@/lib/native/downloads';
import { useNativeFeature } from './use-native';

export function DesktopDownloads() {
  const can = useNativeFeature('openDownload');
  const [last, setLast] = useState<NativeDownload | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!can) return;
    return onDownloadDone((d) => {
      setLast(d);
      setNote(null);
    });
  }, [can]);

  if (!last) return null;
  const run = async (action: 'open' | 'show') => {
    if (busy) return;
    setBusy(true);
    setNote(null);
    const a = await actOnDownload(action, last.id);
    setBusy(false);
    if (!a.ok) setNote(WHY_LINE[a.why]);
  };
  return (
    <div className="dv-download" role="status" data-download-note>
      <p>
        {SAVED_BEFORE}
        <bdi>{last.name}</bdi>
        {SAVED_AFTER}
      </p>
      {last.kind === null && <p className="muted">{NEVER_OPENS}</p>}
      <div className="actions">
        {last.kind !== null && (
          <button type="button" className="primary" disabled={busy} data-download="open" onClick={() => void run('open')}>
            <FileText aria-hidden="true" />
            {OPEN_LABEL}
          </button>
        )}
        <button type="button" disabled={busy} data-download="show" onClick={() => void run('show')}>
          <FolderOpen aria-hidden="true" />
          {SHOW_LABEL}
        </button>
        <button type="button" className="dv-download-close" aria-label="إغلاق" onClick={() => setLast(null)}>
          <X aria-hidden="true" />
        </button>
      </div>
      {note && <p className="muted">{note}</p>}
    </div>
  );
}

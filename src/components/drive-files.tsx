'use client';
// The Hub's real files in Google Drive: upload, preview, download and removal.
// Bytes go from the browser straight to Google in chunks (resumable upload); only
// small JSON calls pass through the Hub's server.
import { useCallback, useEffect, useRef, useState } from 'react';
import { FileText, Music, Trash2, Upload, Download } from 'lucide-react';
import { isAdmin } from '@/lib/access';
import { useAccount } from '@/lib/account-context';
import { useHub } from '@/lib/store';
import { supabase } from '@/lib/supabase/client';
import {
  CHUNK_BYTES,
  MAX_UPLOAD_BYTES,
  canUpload,
  formatBytes,
  kindLabels,
  mediaKind,
  type MediaKind,
} from '@/lib/drive/media';
import { Empty, Modal, Panel } from './ui';

type DriveStatus = {
  state: 'loading' | 'not-configured' | 'needs-connection' | 'connected' | 'error';
  account?: string | null;
  canConnect?: boolean;
};

type FileRow = {
  id: string;
  name: string;
  mime_type: string;
  size_bytes: number;
  kind: MediaKind;
  uploaded_by: string;
  created_at: string;
};

type Transfer = { key: string; name: string; progress: number; error?: string };

export function useDriveStatus(): DriveStatus {
  const [status, setStatus] = useState<DriveStatus>({ state: 'loading' });
  useEffect(() => {
    let live = true;
    fetch('/api/drive/status', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { state: 'error' }))
      .catch(() => ({ state: 'error' }))
      .then((s) => live && setStatus(s));
    return () => {
      live = false;
    };
  }, []);
  return status;
}

const stateText: Record<DriveStatus['state'], string> = {
  loading: 'جارٍ التحقق من الاتصال…',
  'not-configured': 'لم يُضبط Google Drive بعد. يضيف مسؤول النظام معرّف العميل وسره في إعدادات الخادم.',
  'needs-connection': 'لم يُربط حساب Google بعد.',
  connected: 'متصل',
  error: 'تعذّر الاتصال بـ Google Drive. أعد ربط الحساب.',
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Where Drive's session stands, after a dropped connection. 0 when nothing is readable. */
async function resumeOffset(sessionUrl: string, size: number): Promise<number> {
  try {
    const probe = await fetch(sessionUrl, { method: 'PUT', headers: { 'Content-Range': `bytes */${size}` } });
    const range = probe.headers.get('Range');
    return probe.status === 308 && range ? Number(range.split('-')[1]) + 1 : 0;
  } catch {
    return 0;
  }
}

async function sendFile(file: File, onProgress: (fraction: number) => void): Promise<string> {
  const session = await fetch('/api/media/upload-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: file.name, mimeType: file.type, size: file.size }),
  });
  if (!session.ok) throw new Error(((await session.json().catch(() => null)) as { error?: string } | null)?.error ?? 'تعذّر بدء الرفع.');
  const { sessionUrl } = (await session.json()) as { sessionUrl: string };

  let offset = 0;
  let failures = 0;
  let driveId: string | null = null;
  while (driveId === null) {
    const end = Math.min(offset + CHUNK_BYTES, file.size);
    let res: Response;
    try {
      res = await fetch(sessionUrl, {
        method: 'PUT',
        headers: { 'Content-Range': `bytes ${offset}-${end - 1}/${file.size}` },
        body: file.slice(offset, end),
      });
    } catch {
      if (++failures > 5) throw new Error('انقطع الاتصال أثناء الرفع.');
      await sleep(1000 * failures);
      offset = await resumeOffset(sessionUrl, file.size);
      continue;
    }
    if (res.status === 308) {
      // Accepted. The Range header says how far Drive got; without it the chunk counts as taken.
      const range = res.headers.get('Range');
      offset = range ? Number(range.split('-')[1]) + 1 : end;
      onProgress(offset / file.size);
    } else if (res.ok) {
      driveId = ((await res.json()) as { id: string }).id;
      onProgress(1);
    } else if (res.status >= 500 && ++failures <= 5) {
      await sleep(1000 * failures);
      offset = await resumeOffset(sessionUrl, file.size);
    } else {
      throw new Error('رفض Google Drive الملف.');
    }
  }

  const done = await fetch('/api/media/complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileId: driveId }),
  });
  if (!done.ok) throw new Error(((await done.json().catch(() => null)) as { error?: string } | null)?.error ?? 'تعذّر تسجيل الملف.');
  return driveId;
}

function Thumb({ file }: { file: FileRow }) {
  const src = `/api/media/${file.id}/content`;
  if (file.kind === 'image')
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={file.name} loading="lazy" />;
  if (file.kind === 'video') return <video src={src} controls preload="metadata" />;
  if (file.kind === 'audio')
    return (
      <div className="drive-icon">
        <Music />
        <audio src={src} controls preload="none" />
      </div>
    );
  return (
    <div className="drive-icon">
      <FileText />
    </div>
  );
}

export function DriveFiles() {
  const account = useAccount();
  const { dispatch } = useHub();
  const drive = useDriveStatus();
  const [files, setFiles] = useState<FileRow[] | null>(null);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [removing, setRemoving] = useState<FileRow | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const say = (text: string) => dispatch({ type: 'notify', text });

  const load = useCallback(async () => {
    const { data, error } = await supabase()
      .from('media_files')
      .select('id, name, mime_type, size_bytes, kind, uploaded_by, created_at')
      .order('created_at', { ascending: false });
    if (!error) setFiles(data as FileRow[]);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const mayUpload = canUpload(account) && drive.state === 'connected';

  const start = async (list: FileList | null) => {
    if (!list || !mayUpload) return;
    for (const file of Array.from(list)) {
      const key = `${file.name}-${file.size}-${Date.now()}`;
      const update = (patch: Partial<Transfer>) =>
        setTransfers((all) => all.map((t) => (t.key === key ? { ...t, ...patch } : t)));
      setTransfers((all) => [...all, { key, name: file.name, progress: 0 }]);
      if (!mediaKind(file.type)) {
        update({ error: 'نوع الملف غير مدعوم.' });
        continue;
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        update({ error: 'الملف أكبر من 5 غيغابايت.' });
        continue;
      }
      try {
        await sendFile(file, (progress) => update({ progress }));
        setTransfers((all) => all.filter((t) => t.key !== key));
        say(`رُفع ${file.name} إلى Google Drive.`);
        await load();
      } catch (e) {
        update({ error: e instanceof Error ? e.message : 'تعذّر الرفع.' });
      }
    }
    if (input.current) input.current.value = '';
  };

  const remove = async () => {
    if (!removing) return;
    const res = await fetch(`/api/media/${removing.id}`, { method: 'DELETE' });
    setRemoving(null);
    if (!res.ok) return say(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? 'تعذّر الحذف.');
    say('نُقل الملف إلى سلة Google Drive.');
    await load();
  };

  return (
    <Panel title="ملفات Google Drive">
      <div className="between drive-bar">
        <p className="muted">
          {drive.state === 'connected'
            ? `متصل${drive.account ? ` بحساب ${drive.account}` : ''}. تُحفظ الملفات في مجلد «Comms Hub».`
            : stateText[drive.state]}
        </p>
        <span className="actions">
          {drive.canConnect && drive.state !== 'connected' && drive.state !== 'loading' && (
            <a className="button primary" href="/api/drive/connect">
              ربط Google Drive
            </a>
          )}
          <input
            ref={input}
            type="file"
            multiple
            hidden
            onChange={(e) => void start(e.target.files)}
            aria-label="اختيار ملفات للرفع"
          />
          <button
            className="primary"
            disabled={!mayUpload}
            title={!canUpload(account) ? 'هذا الدور لا يضيف ملفات' : drive.state !== 'connected' ? 'Google Drive غير متصل' : ''}
            onClick={() => input.current?.click()}
          >
            <Upload />
            رفع ملفات
          </button>
        </span>
      </div>

      {transfers.map((t) => (
        <div className={`notice ${t.error ? 'danger' : ''}`} key={t.key} role={t.error ? 'alert' : 'status'}>
          <b>{t.name}</b>
          {t.error ? (
            <small>{t.error}</small>
          ) : (
            <progress value={Math.round(t.progress * 100)} max={100} aria-label={`تقدم رفع ${t.name}`} />
          )}
        </div>
      ))}

      {files && files.length === 0 && drive.state !== 'loading' && <Empty>لا توجد ملفات مرفوعة بعد.</Empty>}
      <div className="drive-grid">
        {(files ?? []).map((file) => (
          <div className="drive-card" key={file.id}>
            <div className="drive-thumb">
              <Thumb file={file} />
            </div>
            <div className="drive-meta">
              <b title={file.name}>{file.name}</b>
              <small>
                {kindLabels[file.kind]} · {formatBytes(file.size_bytes)}
              </small>
              <span className="actions">
                <a
                  className="button"
                  href={`/api/media/${file.id}/content?download=1`}
                  aria-label={`تنزيل ${file.name}`}
                >
                  <Download />
                  تنزيل
                </a>
                {(file.uploaded_by === account.email || isAdmin(account)) && (
                  <button className="danger" onClick={() => setRemoving(file)} aria-label={`حذف ${file.name}`}>
                    <Trash2 />
                    حذف
                  </button>
                )}
              </span>
            </div>
          </div>
        ))}
      </div>

      {removing && (
        <Modal title="حذف ملف" onClose={() => setRemoving(null)}>
          <p>
            سيُنقل <b>{removing.name}</b> إلى سلة Google Drive ويختفي من المكتبة. يمكن استرجاعه من السلة خلال 30
            يوماً.
          </p>
          <div className="actions">
            <button className="primary danger" onClick={() => void remove()}>
              تأكيد الحذف
            </button>
            <button className="secondary" onClick={() => setRemoving(null)}>
              إلغاء
            </button>
          </div>
        </Modal>
      )}
    </Panel>
  );
}

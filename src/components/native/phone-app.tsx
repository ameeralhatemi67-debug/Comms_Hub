'use client';
// The Android application on the site (MVP_draft.md 64.1; Android_Build_Plan.md A3).
// - «تطبيق الهاتف» on «الحساب»: in a browser, the newest APK from the public bucket and how to install it; inside
//   the application, its version and where its update stands, with «تحديث الآن».
// - The update window, on every page and on the sign-in screen, inside the application only: an update that
//   must be installed first, a newer release to take now or «لاحقاً», or what changed after an update.
// The application fetches and checks the APK itself; Android asks the person to confirm the installation.
// «لاحقاً» and the version already seen are remembered on this phone only.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Download, RotateCw } from 'lucide-react';
import { native } from '@/lib/native';
import { ANDROID_FEED, apkDownloadUrl, parseAndroidLatest, type AndroidRelease } from '@/lib/native/releases';
import { apkLine, apkStartAnswer, apkWindow, LATER_MS, newerRelease, readApkStatus, type ApkStatus, type Later } from '@/lib/native/app-update';
import { formatBytes } from '@/lib/studio/support';
import { useNativeFeature, useNativePlatform, useNativeVersion } from './use-native';

const LATER_KEY = 'commshub.apk.later';
const SEEN_KEY = 'commshub.apk.seen';

const stored = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const store = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // a phone that keeps nothing asks again next time
  }
};

/** The application's own report, read every two seconds while a page shows it; null in a browser. */
function useApkStatus(): ApkStatus | null {
  const can = useNativeFeature('appUpdate');
  const [status, setStatus] = useState<ApkStatus | null>(null);
  useEffect(() => {
    if (!can) return;
    let live = true;
    const read = () =>
      native()
        .raw!.appUpdate!.status!()
        .then((v) => live && setStatus(readApkStatus(v)), () => undefined);
    void read();
    const t = setInterval(read, 2000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [can]);
  return status;
}

/** Asks the application for a release; returns what to say, or null when the progress line says it. */
async function startUpdate(r: AndroidRelease): Promise<string | null> {
  const answer = await native()
    .raw!.appUpdate!.start!({ version: r.version, file: r.file, size: r.size, sha256: r.sha256 })
    .catch(() => 'refused');
  return apkStartAnswer(String(answer));
}

const working = (s: ApkStatus | null) => !!s && (s.state === 'downloading' || s.state === 'verifying' || s.state === 'installing');

function Notes({ notes }: { notes: string[] }) {
  if (!notes.length) return null;
  return (
    <ul className="apk-notes">
      {notes.map((n, i) => (
        <li key={i}>{n}</li>
      ))}
    </ul>
  );
}

function UpdateDialog({ title, closable, onClose, children }: { title: string; closable: boolean; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    return () => d?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="apk-window"
      dir="rtl"
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        if (closable) onClose();
      }}
    >
      <h2>{title}</h2>
      {children}
    </dialog>
  );
}

export function AppUpdateWindow() {
  const status = useApkStatus();
  const [ready, setReady] = useState(false);
  const [later, setLater] = useState<Later | null>(null);
  const [seen, setSeen] = useState<string | null>(null);
  const [answer, setAnswer] = useState<string | null>(null);
  const [closed, setClosed] = useState(false);

  useEffect(() => {
    try {
      const l = JSON.parse(stored(LATER_KEY) ?? 'null') as Later | null;
      if (l && typeof l.version === 'string' && typeof l.until === 'number') setLater(l);
    } catch {
      // nothing remembered
    }
    setSeen(stored(SEEN_KEY));
    setReady(true);
  }, []);

  // The first opening after installing remembers the version without a word.
  useEffect(() => {
    if (ready && status && !seen) {
      store(SEEN_KEY, status.current);
      setSeen(status.current);
    }
  }, [ready, status, seen]);

  if (!ready || !status || closed) return null;
  const w = apkWindow({ status, now: Date.now(), later, seen });
  if (w.kind === 'none') return null;
  const line = apkLine(status);

  if (w.kind === 'whatsNew') {
    const done = () => {
      store(SEEN_KEY, w.version);
      setSeen(w.version);
    };
    return (
      <UpdateDialog title={`ما الجديد في الإصدار ${w.version}`} closable onClose={done}>
        {w.notes.length ? <Notes notes={w.notes} /> : <p>حُدِّث التطبيق إلى هذا الإصدار.</p>}
        <div className="actions">
          <button type="button" className="primary" onClick={done}>
            حسناً
          </button>
        </div>
      </UpdateDialog>
    );
  }

  const release = w.release;
  const update = release && (
    <button type="button" className="primary" disabled={working(status)} onClick={async () => setAnswer(await startUpdate(release))}>
      <RotateCw aria-hidden="true" />
      تحديث الآن
    </button>
  );

  if (w.kind === 'required') {
    return (
      <UpdateDialog title="يجب تحديث التطبيق" closable={false} onClose={() => undefined}>
        <p>هذا الإصدار من التطبيق أقدم مما يحتاجه المركز الآن، فحدّثه ليعمل كل شيء كما ينبغي.</p>
        {release ? (
          <>
            <p className="muted">
              الإصدار <bdi dir="ltr">{release.version}</bdi>، نحو {formatBytes(release.size)}.
            </p>
            <Notes notes={release.notes} />
            <div className="actions">{update}</div>
          </>
        ) : (
          <p className="muted">تعذّر الوصول إلى التحديث الآن. تحقّق من اتصالك ثم افتح التطبيق مرة أخرى.</p>
        )}
        {line && <p className="muted" role="status">{line}</p>}
        {answer && <p className="muted" role="status">{answer}</p>}
      </UpdateDialog>
    );
  }

  const putOff = () => {
    const l = { version: w.release.version, until: Date.now() + LATER_MS };
    store(LATER_KEY, JSON.stringify(l));
    setLater(l);
    setClosed(true);
  };
  return (
    <UpdateDialog title="يتوفر إصدار جديد من التطبيق" closable={!working(status)} onClose={putOff}>
      <p>
        الإصدار <bdi dir="ltr">{w.release.version}</bdi> جاهز، نحو {formatBytes(w.release.size)}.
      </p>
      <Notes notes={w.release.notes} />
      <div className="actions">
        {update}
        <button type="button" className="secondary" disabled={working(status)} onClick={putOff}>
          لاحقاً
        </button>
      </div>
      {line && <p className="muted" role="status">{line}</p>}
      {answer && <p className="muted" role="status">{answer}</p>}
    </UpdateDialog>
  );
}

/** The newest APK in the public bucket, for a browser; undefined while asking, null before the first release. */
function useLatestApk(wanted: boolean): AndroidRelease | null | undefined {
  const [latest, setLatest] = useState<AndroidRelease | null | undefined>(undefined);
  useEffect(() => {
    if (!wanted) return;
    let live = true;
    fetch(`${ANDROID_FEED}/latest.json`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.text() : ''))
      .then((t) => live && setLatest(parseAndroidLatest(t)))
      .catch(() => live && setLatest(null));
    return () => {
      live = false;
    };
  }, [wanted]);
  return latest;
}

export function PhoneAppPanel() {
  const platform = useNativePlatform();
  const version = useNativeVersion();
  const status = useApkStatus();
  const latest = useLatestApk(platform !== 'android');
  const [answer, setAnswer] = useState<string | null>(null);

  if (platform === 'android') {
    const newer = newerRelease(status);
    const line = apkLine(status);
    return (
      <div className="dv-app">
        <p>
          تعمل الآن في تطبيق الهاتف، الإصدار <bdi dir="ltr">{version}</bdi>.
        </p>
        {line && (
          <p className="muted" role="status">
            {line}
          </p>
        )}
        {newer ? (
          <>
            <p className="muted">
              يتوفر الإصدار <bdi dir="ltr">{newer.version}</bdi>، نحو {formatBytes(newer.size)}.
            </p>
            <div className="actions">
              <button type="button" className="primary" disabled={working(status)} onClick={async () => setAnswer(await startUpdate(newer))}>
                <RotateCw aria-hidden="true" />
                تحديث الآن
              </button>
            </div>
          </>
        ) : (
          <p className="muted">{status?.feed ? 'هذا أحدث إصدار.' : 'يبحث التطبيق عن تحديث عند فتحه، وعند عودتك إليه بعد أربع ساعات أو أكثر.'}</p>
        )}
        {answer && (
          <p className="muted" role="status">
            {answer}
          </p>
        )}
      </div>
    );
  }
  return (
    <div className="dv-app">
      <p>تطبيق «مركز الاتصال المؤسسي» لهواتف Android: يفتح المركز في نافذته على الهاتف، ويحفظ ملفاته في مجلد التنزيلات، ويحدّث نفسه.</p>
      {latest === undefined && (
        <p className="muted" role="status">
          جارٍ البحث عن آخر إصدار…
        </p>
      )}
      {latest === null && <p className="muted">لم يُنشر إصدار للتنزيل بعد.</p>}
      {latest && (
        <>
          <div className="actions">
            <a className="primary button" href={apkDownloadUrl(latest)} download>
              <Download aria-hidden="true" />
              تنزيل التطبيق
            </a>
          </div>
          <p className="muted">
            الإصدار <bdi dir="ltr">{latest.version}</bdi>، نحو {formatBytes(latest.size)}، ويحتاج Android 10 أو أحدث. افتح الملف بعد تنزيله على الهاتف واختر التثبيت، وإن سألك Android فاسمح للمتصفح بتثبيت التطبيقات. وقد يقترح Google Play Protect فحص التطبيق لأنه لم يره من قبل، فاختر الفحص ثم أكمل التثبيت.
          </p>
        </>
      )}
    </div>
  );
}

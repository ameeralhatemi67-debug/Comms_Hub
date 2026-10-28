'use client';
// The Android application on the site (MVP_draft.md 64.1; Android_Build_Plan.md A3).
// - «تطبيق الهاتف» on «الحساب»: in a browser, the newest APK from the public bucket and how to install it; inside
//   the application, its version and where its update stands, with «تحديث الآن».
// - The update window, on every page and on the sign-in screen, inside the application only: an update that
//   must be installed first, a newer release to take now or «لاحقاً», or what changed after an update.
// The application fetches and checks the APK itself; Android asks the person to confirm the installation.
// Google Play's copy (A8, MVP_draft.md 64.6) has no APK of its own: the same window and panel show what Play says,
// and Play's own window asks the person.
// «لاحقاً» and the version already seen are remembered on this phone only.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Download, RotateCw } from 'lucide-react';
import { native } from '@/lib/native';
import { ANDROID_FEED, apkDownloadUrl, parseAndroidLatest, type AndroidRelease } from '@/lib/native/releases';
import { apkLine, apkStartAnswer, apkWindow, LATER_MS, newerRelease, readApkStatus, type ApkStatus, type Later } from '@/lib/native/app-update';
import { playIdleLine, playLine, playStartAnswer, playWindow, playWorking, readPlayStatus, versionOfCode, type PlayLater, type PlayStatus } from '@/lib/native/play-update';
import { formatBytes } from '@/lib/studio/support';
import { useNativeFeature, useNativePlatform, useNativeVersion } from './use-native';

const LATER_KEY = 'commshub.apk.later';
const PLAY_LATER_KEY = 'commshub.play.later';
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

/** What Google Play's copy reports of Play, read every two seconds while a page shows it; null elsewhere. */
function usePlayStatus(): PlayStatus | null {
  const can = useNativeFeature('playUpdate');
  const [status, setStatus] = useState<PlayStatus | null>(null);
  useEffect(() => {
    if (!can) return;
    let live = true;
    const read = () =>
      native()
        .raw!.playUpdate!.status!()
        .then((v) => live && setStatus(readPlayStatus(v)), () => undefined);
    void read();
    const t = setInterval(read, 2000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [can]);
  return status;
}

/** Asks Play for a flexible or the immediate update, or to restart into a downloaded one; returns what to say. */
async function askPlay(what: 'flexible' | 'immediate' | 'complete'): Promise<string | null> {
  const p = native().raw!.playUpdate!;
  const answer = await (what === 'complete' ? p.complete!() : p.start!(what)).catch(() => 'refused');
  return playStartAnswer(String(answer));
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

/** The update window of whichever channel the application is: Google Play's, or the APK's own. */
export function AppUpdateWindow() {
  return useNativeFeature('playUpdate') ? <PlayUpdateWindow /> : <ApkUpdateWindow />;
}

function PlayUpdateWindow() {
  const status = usePlayStatus();
  const [ready, setReady] = useState(false);
  const [later, setLater] = useState<PlayLater | null>(null);
  const [seen, setSeen] = useState<string | null>(null);
  const [answer, setAnswer] = useState<string | null>(null);
  // The window put aside, by its kind and release: a later window (the restart once Play has downloaded) still shows.
  const [closed, setClosed] = useState<string | null>(null);

  useEffect(() => {
    try {
      const l = JSON.parse(stored(PLAY_LATER_KEY) ?? 'null') as PlayLater | null;
      if (l && typeof l.code === 'number' && typeof l.until === 'number' && (l.kind === 'offer' || l.kind === 'restart')) setLater(l);
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

  if (!ready || !status) return null;
  const w = playWindow({ status, now: Date.now(), later, seen });
  if (w.kind === 'none' || (w.kind !== 'required' && closed === `${w.kind}:${'code' in w ? w.code : w.version}`)) return null;
  const line = playLine(status);
  const busy = playWorking(status);
  const putOff = (code: number | null, kind: PlayLater['kind']) => {
    if (code !== null) {
      const l: PlayLater = { code, until: Date.now() + LATER_MS, kind };
      store(PLAY_LATER_KEY, JSON.stringify(l));
      setLater(l);
    }
    setClosed(`${w.kind}:${code}`);
  };
  const said = (
    <>
      {line && <p className="muted" role="status">{line}</p>}
      {answer && <p className="muted" role="status">{answer}</p>}
    </>
  );

  if (w.kind === 'whatsNew') {
    const done = () => {
      store(SEEN_KEY, w.version);
      setSeen(w.version);
    };
    return (
      <UpdateDialog title={`ما الجديد في الإصدار ${w.version}`} closable onClose={done}>
        <p>حدّث Google Play التطبيق إلى هذا الإصدار، وما تغيّر فيه مكتوب في صفحته على Google Play.</p>
        <div className="actions">
          <button type="button" className="primary" onClick={done}>
            حسناً
          </button>
        </div>
      </UpdateDialog>
    );
  }

  if (w.kind === 'required') {
    return (
      <UpdateDialog title="يجب تحديث التطبيق" closable={false} onClose={() => undefined}>
        <p>هذا الإصدار من التطبيق أقدم مما يحتاجه المركز الآن، فحدّثه ليعمل كل شيء كما ينبغي.</p>
        {w.version && (
          <p className="muted">
            الإصدار <bdi dir="ltr">{w.version}</bdi> في Google Play.
          </p>
        )}
        {w.can ? (
          <div className="actions">
            <button type="button" className="primary" disabled={busy} onClick={async () => setAnswer(await askPlay(w.can === 'restart' ? 'complete' : 'immediate'))}>
              <RotateCw aria-hidden="true" />
              {w.can === 'restart' ? 'إعادة التشغيل الآن' : 'تحديث الآن'}
            </button>
          </div>
        ) : (
          !busy && <p className="muted">تعذّر الوصول إلى التحديث في Google Play الآن. تحقّق من اتصالك ثم افتح التطبيق مرة أخرى.</p>
        )}
        {said}
      </UpdateDialog>
    );
  }

  if (w.kind === 'restart') {
    return (
      <UpdateDialog title="التحديث جاهز" closable={!busy} onClose={() => putOff(w.code, 'restart')}>
        <p>
          نزّل Google Play {w.version ? <>الإصدار <bdi dir="ltr">{w.version}</bdi></> : 'التحديث'}. أعد تشغيل التطبيق لإكماله، وتبقى داخلاً كما أنت.
        </p>
        <div className="actions">
          <button type="button" className="primary" disabled={busy} onClick={async () => setAnswer(await askPlay('complete'))}>
            <RotateCw aria-hidden="true" />
            إعادة التشغيل الآن
          </button>
          <button type="button" className="secondary" disabled={busy} onClick={() => putOff(w.code, 'restart')}>
            لاحقاً
          </button>
        </div>
        {said}
      </UpdateDialog>
    );
  }

  return (
    <UpdateDialog title="يتوفر إصدار جديد من التطبيق" closable onClose={() => putOff(w.code, 'offer')}>
      <p>
        {w.version ? <>الإصدار <bdi dir="ltr">{w.version}</bdi></> : 'إصدار جديد'} جاهز في Google Play. يُنزَّل وأنت تعمل، ثم تعيد تشغيل التطبيق لإكماله.
      </p>
      <div className="actions">
        <button
          type="button"
          className="primary"
          onClick={async () => {
            const reply = await askPlay('flexible');
            // Play's own window now asks the person; this one is not shown again for this release today.
            if (reply === null) putOff(w.code, 'offer');
            else setAnswer(reply);
          }}
        >
          <RotateCw aria-hidden="true" />
          تحديث الآن
        </button>
        <button type="button" className="secondary" onClick={() => putOff(w.code, 'offer')}>
          لاحقاً
        </button>
      </div>
      {said}
    </UpdateDialog>
  );
}

function ApkUpdateWindow() {
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
  const play = usePlayStatus();
  const fromPlay = useNativeFeature('playUpdate');
  const latest = useLatestApk(platform !== 'android');
  const [answer, setAnswer] = useState<string | null>(null);

  if (platform === 'android' && fromPlay) {
    const line = playLine(play);
    const offered = play?.state === 'available' && (play.flexible || play.immediate) ? (versionOfCode(play.code) ?? 'الجديد') : null;
    return (
      <div className="dv-app">
        <p>
          تعمل الآن في تطبيق الهاتف من Google Play، الإصدار <bdi dir="ltr">{version}</bdi>.
        </p>
        {line && (
          <p className="muted" role="status">
            {line}
          </p>
        )}
        {play?.state === 'downloaded' ? (
          <div className="actions">
            <button type="button" className="primary" onClick={async () => setAnswer(await askPlay('complete'))}>
              <RotateCw aria-hidden="true" />
              إعادة التشغيل الآن
            </button>
          </div>
        ) : offered ? (
          <>
            <p className="muted">
              يتوفر الإصدار <bdi dir="ltr">{offered}</bdi> في Google Play.
            </p>
            <div className="actions">
              <button type="button" className="primary" disabled={playWorking(play)} onClick={async () => setAnswer(await askPlay(play!.flexible ? 'flexible' : 'immediate'))}>
                <RotateCw aria-hidden="true" />
                تحديث الآن
              </button>
            </div>
          </>
        ) : (
          !line && <p className="muted">{playIdleLine(play)}</p>
        )}
        {answer && (
          <p className="muted" role="status">
            {answer}
          </p>
        )}
      </div>
    );
  }

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

// The update rules of update.ts wired to electron-updater (Desktop_App_Plan.md 7.4, phase D3). The feed is
// the compiled one; the downloaded installer's SHA-512 is checked against latest.yml before anything runs;
// a signature is checked too once releases are signed (D-7: electron-updater reads the publisher from
// app-update.yml, which an unsigned pilot build does not name). The updater's own log is off, so no
// address or path is written anywhere. Only the Windows updater is taken from electron-updater: its
// index would bring every other system's updater into the bundle too.
import { app } from 'electron';
import { NsisUpdater } from 'electron-updater/out/NsisUpdater.js';
import { CHECK_EVERY_MS, FIRST_CHECK_MS, nextStatus, restartAction, START, type UpdateEvent, type UpdateStatus } from './update.ts';

export type Updates = {
  status(): UpdateStatus;
  /** «إعادة التشغيل للتحديث»: 'busy' while a window works, 'nothing' without an update ready. */
  restart(): 'restart' | 'busy' | 'nothing';
};

export function startUpdates(o: { feed: string; busy: () => boolean; beforeRestart: () => void; onChange: (s: UpdateStatus, was: UpdateStatus) => void }): Updates {
  let status: UpdateStatus = START;
  const apply = (e: UpdateEvent) => {
    const was = status;
    status = nextStatus(status, e);
    if (status !== was) o.onChange(status, was);
  };
  const autoUpdater = new NsisUpdater({ provider: 'generic', url: o.feed });
  autoUpdater.logger = null;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowDowngrade = false;
  autoUpdater.allowPrerelease = false;
  autoUpdater.on('checking-for-update', () => apply({ type: 'checking' }));
  autoUpdater.on('update-available', (info) => apply({ type: 'available', version: info.version }));
  autoUpdater.on('update-not-available', () => apply({ type: 'none' }));
  autoUpdater.on('download-progress', (p) => apply({ type: 'progress', percent: p.percent }));
  autoUpdater.on('update-downloaded', (info) => apply({ type: 'downloaded', version: info.version }));
  autoUpdater.on('error', () => apply({ type: 'error' }));

  const check = () => {
    if (!app.isPackaged) return;
    autoUpdater.checkForUpdates().catch(() => apply({ type: 'error' }));
  };
  setTimeout(check, FIRST_CHECK_MS);
  setInterval(check, CHECK_EVERY_MS);

  return {
    status: () => status,
    restart() {
      const action = restartAction(status, o.busy());
      if (action === 'restart') {
        o.beforeRestart();
        autoUpdater.quitAndInstall(true, true);
      }
      return action;
    },
  };
}

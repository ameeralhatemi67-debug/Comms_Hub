// The native layer of phase D2 (Desktop_App_Plan.md 5.2, bridge version 1; decision D-10), wired to
// Electron: the bridge's handlers, each registered through sender.ts's guard(); the tray and its Arabic
// menu; native notices; the taskbar badge; the laptop kept awake; a busy window hidden on close, and a
// question before quitting during work. The rules are the pure modules it imports.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, Notification, powerSaveBlocker, Tray } from 'electron';
import type { IpcMainInvokeEvent, NativeImage } from 'electron';
import { badgeBitmap, withDot } from './badge.ts';
import { badgeOf, holdIdOf, noticeOf, reasonOf, type NoticeRequest, type Reason } from './bridge.ts';
import { deviceInfo, freeBytes } from './device.ts';
import { PRODUCT_NAME } from './identity.ts';
import { CHANNEL } from './ipc.ts';
import { closeAction, quitAction, Registry, shouldNotify } from './life.ts';
import { guard } from './sender.ts';
import { parseSettings, type Settings } from './settings.ts';
import { decisionsLine, HIDDEN_BUSY, HIDDEN_KEPT, QUIT_QUESTION, TRAY_KEEP, TRAY_OPEN, TRAY_QUIT, trayTooltip } from './words.ts';

export type NativeOptions = {
  allowed: readonly string[];
  /** The web contents of every window that shows the site. */
  windows: () => ReadonlySet<number>;
  mainWindow: () => BrowserWindow | null;
  version: string;
  /** The brand mark as a PNG, for the tray and the notices. */
  iconPath: string;
};

export type Native = {
  /** Every site window passes through here once: closing it may hide it, and its holds end with it. */
  attachWindow(win: BrowserWindow, isMain: boolean): void;
  /** Brings a window forward, out of the tray if it was hidden. */
  reveal(win: BrowserWindow): void;
};

const BRIDGE = 1;
// Notices Windows has not shown or dismissed yet are kept referenced, or their click would be lost.
const LIVE_NOTICES = 20;

export function startNative(o: NativeOptions): Native {
  const registry = new Registry();
  const settingsPath = path.join(app.getPath('userData'), 'settings.json');
  let settings: Settings = readSettings();
  let decisions = 0;
  let quitting = false;
  let asking = false;
  let keptNoticeShown = false;
  /** Windows hidden while busy; the tray's «فتح» brings them back with the main one. */
  const hiddenForWork = new Set<BrowserWindow>();
  const told = new Set<number>();
  const live = new Set<Notification>();

  function readSettings(): Settings {
    try {
      return parseSettings(JSON.parse(fs.readFileSync(settingsPath, 'utf8')));
    } catch {
      return parseSettings(null);
    }
  }
  function writeSettings() {
    try {
      fs.writeFileSync(`${settingsPath}.tmp`, JSON.stringify(settings));
      fs.renameSync(`${settingsPath}.tmp`, settingsPath);
    } catch {
      // A setting that cannot be written lasts until the application quits.
    }
  }

  // --- pictures ----------------------------------------------------------------------------------
  const mark = nativeImage.createFromPath(o.iconPath);
  const sized = (size: number) => mark.resize({ width: size, height: size, quality: 'best' });
  function trayImage(dot: boolean): NativeImage {
    const one = dot ? nativeImage.createFromBitmap(withDot(sized(16).toBitmap(), 16), { width: 16, height: 16, scaleFactor: 1 }) : sized(16);
    const two = dot ? nativeImage.createFromBitmap(withDot(sized(32).toBitmap(), 32), { width: 32, height: 32, scaleFactor: 2 }) : sized(32);
    const image = nativeImage.createFromBitmap(one.toBitmap(), { width: 16, height: 16, scaleFactor: 1 });
    image.addRepresentation({ scaleFactor: 2, width: 32, height: 32, buffer: two.toPNG() });
    return image;
  }
  function overlay(n: number): NativeImage | null {
    const one = badgeBitmap(n, 16);
    const two = badgeBitmap(n, 32);
    if (!one || !two) return null;
    const image = nativeImage.createFromBitmap(one, { width: 16, height: 16, scaleFactor: 1 });
    image.addRepresentation({ scaleFactor: 2, width: 32, height: 32, buffer: nativeImage.createFromBitmap(two, { width: 32, height: 32, scaleFactor: 2 }).toPNG() });
    return image;
  }

  // --- the tray ------------------------------------------------------------------------------------
  const tray = new Tray(trayImage(false));
  function refreshTray() {
    tray.setToolTip(trayTooltip(registry.busyReason(), decisions));
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: TRAY_OPEN, click: () => revealAll() },
        {
          label: TRAY_KEEP,
          type: 'checkbox',
          checked: settings.keepInTray,
          click: (item) => {
            settings = { ...settings, keepInTray: item.checked };
            writeSettings();
          },
        },
        { type: 'separator' },
        { label: TRAY_QUIT, click: () => app.quit() },
      ]),
    );
  }
  function refreshBadge() {
    tray.setImage(trayImage(decisions > 0));
    const main = o.mainWindow();
    if (main && !main.isDestroyed()) main.setOverlayIcon(overlay(decisions), decisions > 0 ? decisionsLine(decisions) : '');
    refreshTray();
  }
  tray.on('click', () => revealAll());
  refreshTray();

  // --- windows -------------------------------------------------------------------------------------
  function reveal(win: BrowserWindow) {
    if (win.isDestroyed()) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
    hiddenForWork.delete(win);
  }
  function revealAll() {
    const main = o.mainWindow();
    if (main) reveal(main);
    for (const win of [...hiddenForWork]) reveal(win);
  }
  function raise(owner: BrowserWindow | null, n: NoticeRequest) {
    if (!Notification.isSupported()) return false;
    const note = new Notification({ title: n.title, body: n.body, icon: mark });
    live.add(note);
    if (live.size > LIVE_NOTICES) live.delete(live.values().next().value as Notification);
    const forget = () => live.delete(note);
    note.on('click', () => {
      forget();
      const target = owner && !owner.isDestroyed() ? owner : o.mainWindow();
      if (!target) return;
      reveal(target);
      if (n.go) target.webContents.send(CHANNEL.open, n.go);
    });
    note.on('close', forget);
    note.on('failed', forget);
    note.show();
    return true;
  }
  function hide(win: BrowserWindow, isMain: boolean) {
    const id = win.webContents.id;
    const busy = registry.busyOf(id);
    win.hide();
    if (busy) {
      hiddenForWork.add(win);
      if (!told.has(id)) {
        told.add(id);
        raise(win, { ...HIDDEN_BUSY[busy], go: null });
      }
    } else if (isMain && !keptNoticeShown) {
      keptNoticeShown = true;
      raise(win, { ...HIDDEN_KEPT, go: null });
    }
  }
  function drop(id: number) {
    const { blockers, wasBusy } = registry.releaseAll(id);
    for (const blocker of blockers) powerSaveBlocker.stop(blocker);
    told.delete(id);
    if (wasBusy || blockers.length) refreshTray();
  }

  function attachWindow(win: BrowserWindow, isMain: boolean) {
    const contents = win.webContents;
    const id = contents.id;
    // A new document, a crash or the end of the window ends every hold the page had.
    contents.on('did-navigate', () => drop(id));
    contents.on('render-process-gone', () => drop(id));
    contents.once('destroyed', () => {
      drop(id);
      hiddenForWork.delete(win);
    });
    win.on('close', (event) => {
      const action = closeAction({ quitting, busy: registry.isBusy(id), isMain, keepInTray: settings.keepInTray });
      if (action === 'close') return;
      event.preventDefault();
      hide(win, isMain);
    });
    if (isMain && decisions > 0) win.setOverlayIcon(overlay(decisions), decisionsLine(decisions));
  }

  // --- quitting ------------------------------------------------------------------------------------
  async function askBeforeQuit(reason: Reason) {
    if (asking) return;
    asking = true;
    const q = QUIT_QUESTION[reason];
    const parent = o.mainWindow();
    const options = { type: 'warning' as const, title: PRODUCT_NAME, message: q.message, detail: q.detail, buttons: [q.stay, q.quit], defaultId: 0, cancelId: 0, noLink: true };
    try {
      const answer = parent && parent.isVisible() ? await dialog.showMessageBox(parent, options) : await dialog.showMessageBox(options);
      if (answer.response === 1) {
        quitting = true;
        app.quit();
      }
    } finally {
      asking = false;
    }
  }
  app.on('before-quit', (event) => {
    if (quitting) return;
    const reason = registry.busyReason();
    if (quitAction(reason, false) === 'ask' && reason) {
      event.preventDefault();
      void askBeforeQuit(reason);
      return;
    }
    quitting = true;
  });
  app.on('will-quit', () => {
    tray.destroy();
  });

  // --- the bridge's handlers -----------------------------------------------------------------------
  const handle = <A extends unknown[]>(channel: string, handler: (event: IpcMainInvokeEvent, ...args: A) => unknown) =>
    ipcMain.handle(channel, guard(o.allowed, o.windows, handler));
  const refused = () => new Error('refused');

  handle(CHANNEL.info, async () => {
    let gpu: unknown = null;
    try {
      gpu = await app.getGPUInfo('complete');
    } catch {
      gpu = null;
    }
    let freeDisk: number | null = null;
    try {
      freeDisk = freeBytes(fs.statfsSync(app.getPath('userData')));
    } catch {
      freeDisk = null;
    }
    return deviceInfo({ version: o.version, bridge: BRIDGE, os: process.platform, osVersion: os.release(), arch: process.arch, cpus: os.cpus(), memory: os.totalmem(), freeDisk, gpu });
  });

  handle(CHANNEL.keepAwake, (event, reason: unknown) => {
    const r = reasonOf(reason);
    if (!r) throw refused();
    const blocker = powerSaveBlocker.start('prevent-app-suspension');
    return registry.addHold(event.sender.id, blocker, r);
  });
  handle(CHANNEL.release, (event, value: unknown) => {
    const id = holdIdOf(value);
    if (id === null) throw refused();
    const blocker = registry.release(event.sender.id, id);
    if (blocker === null) return false;
    powerSaveBlocker.stop(blocker);
    return true;
  });

  handle(CHANNEL.busy, (event, reason: unknown) => {
    const r = reasonOf(reason);
    if (!r) throw refused();
    registry.setBusy(event.sender.id, r);
    // While busy the window is never throttled: an export runs at full speed minimised or hidden.
    event.sender.setBackgroundThrottling(false);
    refreshTray();
    return true;
  });
  handle(CHANNEL.idle, (event) => {
    const was = registry.clearBusy(event.sender.id);
    event.sender.setBackgroundThrottling(true);
    told.delete(event.sender.id);
    refreshTray();
    return was;
  });

  handle(CHANNEL.notify, (event, value: unknown) => {
    const n = noticeOf(value, event.senderFrame?.url ?? '', o.allowed);
    if (!n) throw refused();
    const owner = BrowserWindow.fromWebContents(event.sender);
    const state = owner ? { focused: owner.isFocused(), visible: owner.isVisible(), minimized: owner.isMinimized() } : null;
    if (!shouldNotify(state)) return false;
    return raise(owner, n);
  });
  handle(CHANNEL.badge, (_event, value: unknown) => {
    const n = badgeOf(value);
    if (n === null) throw refused();
    if (n !== decisions) {
      decisions = n;
      refreshBadge();
    }
    return true;
  });

  return { attachWindow, reveal };
}

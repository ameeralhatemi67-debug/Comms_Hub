// The native layer of phase D2 (Desktop_App_Plan.md 5.2, bridge version 1; decision D-10), wired to
// Electron: the bridge's handlers, each registered through sender.ts's guard(); the tray and its Arabic
// menu; native notices; the taskbar badge; the laptop kept awake; a busy window hidden on close, and a
// question before quitting during work. From D9 (Desktop_Power_Ideas.md P-01, P-33) also the graphics chip's
// choice and the device profile. From D12 (P-30) also what the idle-time broker reads: what each window says it is
// doing, the last key or click, mains or battery and the processor's speed limit; native-media.ts runs the jobs. The
// rules are the pure modules it imports.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, Notification, powerMonitor, powerSaveBlocker, Tray } from 'electron';
import type { IpcMainInvokeEvent, NativeImage } from 'electron';
import { badgeBitmap, withDot } from './badge.ts';
import { activityOf, badgeOf, holdIdOf, noticeOf, reasonOf, type Activity, type NoticeRequest, type Reason } from './bridge.ts';
import { activeChip, deviceInfo, freeBytes } from './device.ts';
import { gpuChoiceOf, measuredPick, switchFor, type GpuSwitch, type Power } from './gpu.ts';
import { isWork, type Facts, type Hold } from './idle.ts';
import { profileOf, type ProfileKey, type ProfileStore } from './profile.ts';
import { PRODUCT_NAME } from './identity.ts';
import { BRIDGE_VERSION, CHANNEL } from './ipc.ts';
import { closeAction, quitAction, Registry, shouldNotify } from './life.ts';
import { guard } from './sender.ts';
import { parseSettings, type Settings } from './settings.ts';
import { feedAllowed, START } from './update.ts';
import { startUpdates, type Updates } from './updater.ts';
import { decisionsLine, HIDDEN_BUSY, HIDDEN_KEPT, QUIT_QUESTION, TRAY_KEEP, TRAY_OPEN, TRAY_QUIT, TRAY_RESTART, trayTooltip, UPDATE_WAITS, updateReady } from './words.ts';

export type NativeOptions = {
  allowed: readonly string[];
  /** The web contents of every window that shows the site. */
  windows: () => ReadonlySet<number>;
  mainWindow: () => BrowserWindow | null;
  version: string;
  /** The brand mark as a PNG, for the tray and the notices. */
  iconPath: string;
  /** The compiled update feed (update.ts), and whether this is the update check's own package. */
  feed: string;
  qa: boolean;
  /** A development build never updates itself: it is the working copy, and it would share the real updater's folder. */
  dev: boolean;
  /** The graphics chip's switch Chromium started with (main.ts), and whether it came from the command line. */
  gpu: { active: GpuSwitch; given: boolean };
  /** The device profile (profile.ts), kept by main.ts, which also reads it before Chromium is ready. */
  profiles: ProfileStore;
};

export type Handle = <A extends unknown[]>(channel: string, handler: (event: IpcMainInvokeEvent, ...args: A) => unknown) => void;

/** What the idle-time broker reads (idle.ts), and a call whenever any of it changes. */
export type IdleFacts = { facts(): Omit<Facts, 'asked' | 'now'>; onChange(fn: () => void): void };

export type Native = {
  /** Every site window passes through here once: closing it may hide it, and its holds end with it. */
  attachWindow(win: BrowserWindow, isMain: boolean): void;
  /** Brings a window forward, out of the tray if it was hidden. */
  reveal(win: BrowserWindow): void;
  /** Registers a bridge handler through guard(), for the other groups (native-files.ts). */
  handle: Handle;
  idle: IdleFacts;
  /** The light copies made in idle time, for the tray's tooltip (native-media.ts). */
  background(state: { making: number; waiting: number; hold: Hold | null }): void;
};

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
  /** Set once the tray exists (updates, D3); the tray's menu reads it. */
  let updates: Updates | null = null;
  // --- what the idle-time broker reads (D12, P-30) ------------------------------------------------
  const activities = new Map<number, Activity>();
  let lastInput = 0;
  let speedLimit = 100;
  const idleListeners: (() => void)[] = [];
  const idleChanged = () => {
    for (const fn of idleListeners) fn();
  };
  let copies: { making: number; waiting: number; hold: Hold | null } = { making: 0, waiting: 0, hold: null };

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
    tray.setToolTip(trayTooltip(registry.busyReason(), decisions, copies));
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: TRAY_OPEN, click: () => revealAll() },
        ...(updates?.status().state === 'ready' ? [{ label: TRAY_RESTART, click: () => restartForUpdate() }] : []),
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
    const had = activities.delete(id);
    if (wasBusy || blockers.length) refreshTray();
    if (wasBusy || had) idleChanged();
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
    // A key or a click in any window of the site holds background work for a few seconds (idle.ts); only the time is kept.
    contents.on('input-event', (_event, input) => {
      if (!isWork(input)) return;
      const was = lastInput;
      lastInput = Date.now();
      if (lastInput - was > 250) idleChanged();
    });
    win.on('close', (event) => {
      const action = closeAction({ quitting, busy: registry.isBusy(id), isMain, keepInTray: settings.keepInTray });
      if (action === 'close') return;
      event.preventDefault();
      hide(win, isMain);
    });
    if (isMain && decisions > 0) win.setOverlayIcon(overlay(decisions), decisionsLine(decisions));
  }

  // --- updates (D3) ------------------------------------------------------------------------------
  // A feed this build may not carry is never asked (update.ts feedAllowed), and a development build asks none.
  if (!o.dev && feedAllowed(o.feed, o.qa)) updates = startUpdates({
    feed: o.feed,
    busy: () => registry.busyReason() !== null,
    beforeRestart: () => {
      quitting = true;
    },
    onChange: (s, was) => {
      refreshTray();
      if (s.state !== 'ready' || was.state === 'ready' || !s.version) return;
      const main = o.mainWindow();
      const state = main ? { focused: main.isFocused(), visible: main.isVisible(), minimized: main.isMinimized() } : null;
      if (shouldNotify(state)) raise(main, { ...updateReady(s.version), go: '/account' });
    },
  });
  function restartForUpdate() {
    const action = updates ? updates.restart() : 'nothing';
    if (action === 'busy') raise(o.mainWindow(), { ...UPDATE_WAITS, go: null });
    return action;
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
  const handle: Handle = (channel, handler) => ipcMain.handle(channel, guard(o.allowed, o.windows, handler));
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
    return deviceInfo({ version: o.version, bridge: BRIDGE_VERSION, os: process.platform, osVersion: os.release(), arch: process.arch, cpus: os.cpus(), memory: os.totalmem(), freeDisk, gpu });
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
    idleChanged();
    return true;
  });
  handle(CHANNEL.idle, (event) => {
    const was = registry.clearBusy(event.sender.id);
    event.sender.setBackgroundThrottling(true);
    told.delete(event.sender.id);
    refreshTray();
    idleChanged();
    return was;
  });
  // What a page says it is doing (D12, P-30): a word from a fixed list, kept for its window until `none`, another
  // document or the window's end.
  handle(CHANNEL.activity, (event, kind: unknown) => {
    const a = activityOf(kind);
    if (!a) throw refused();
    const id = event.sender.id;
    if (a === 'none' ? !activities.delete(id) : activities.get(id) === a) return true;
    if (a !== 'none') activities.set(id, a);
    idleChanged();
    return true;
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

  handle(CHANNEL.updateStatus, () => ({ ...(updates ? updates.status() : START) }));
  handle(CHANNEL.updateRestart, () => restartForUpdate());

  // --- the graphics chip and the device profile (D9) ---------------------------------------------
  // Chromium's switch is chosen before the power state can be read, so the last state seen is kept.
  const powerNow = (): Power => (powerMonitor.isOnBatteryPower() ? 'battery' : 'ac');
  function notePower() {
    const power = powerNow();
    if (settings.lastPower === power) return;
    settings = { ...settings, lastPower: power };
    writeSettings();
  }
  notePower();
  powerMonitor.on('on-ac', () => (notePower(), idleChanged()));
  powerMonitor.on('on-battery', () => (notePower(), idleChanged()));
  // Windows' advertised speed limit for the processor: below 100 when it is held back for heat or power.
  powerMonitor.on('speed-limit-change', (details) => {
    const limit = Number((details as { limit?: unknown }).limit);
    if (!Number.isFinite(limit) || limit === speedLimit) return;
    speedLimit = limit;
    idleChanged();
  });
  const idle: IdleFacts = {
    facts: () => ({ power: powerNow(), speedLimit, busy: registry.busyReason(), activities: [...activities.values()], lastInput }),
    onChange: (fn) => void idleListeners.push(fn),
  };
  function background(state: { making: number; waiting: number; hold: Hold | null }) {
    if (state.making === copies.making && state.waiting === copies.waiting && state.hold === copies.hold) return;
    copies = state;
    refreshTray();
  }

  function gpuState() {
    const pick = measuredPick(o.profiles.entries(), process.versions.chrome);
    const power = powerNow();
    const next = o.gpu.given ? o.gpu.active : switchFor({ choice: settings.gpu, pick, power });
    return { choice: settings.gpu, active: o.gpu.active, given: o.gpu.given, pick, power, next, restart: next !== o.gpu.active };
  }
  handle(CHANNEL.gpuState, () => gpuState());
  handle(CHANNEL.gpuChoose, (_event, value: unknown) => {
    const choice = gpuChoiceOf(value);
    if (!choice) throw refused();
    if (choice !== settings.gpu) {
      settings = { ...settings, gpu: choice };
      writeSettings();
    }
    return gpuState();
  });
  // A restart for the chip: never during work, and only when it would change the chip.
  handle(CHANNEL.gpuRestart, () => {
    if (registry.busyReason() !== null) return 'busy';
    if (!gpuState().restart) return 'nothing';
    quitting = true;
    app.relaunch();
    app.quit();
    return 'restart';
  });

  /** What a measurement taken now is true for: never anything the page says. */
  async function currentKey(): Promise<ProfileKey> {
    let gpu: unknown = null;
    try {
      gpu = await app.getGPUInfo('complete');
    } catch {
      gpu = null;
    }
    const chip = activeChip(gpu) ?? { vendorId: 0, deviceId: 0, vendor: 'software', name: 'software', driver: '' };
    return { app: o.version, chrome: process.versions.chrome, chip, switch: o.gpu.active, power: powerNow() };
  }
  handle(CHANNEL.profileRead, async () => ({ current: await currentKey(), entries: o.profiles.entries() }));
  handle(CHANNEL.profileSave, async (_event, value: unknown) => {
    const numbers = profileOf(value);
    if (!numbers) throw refused();
    return o.profiles.save(await currentKey(), numbers);
  });

  return { attachWindow, reveal, handle, idle, background };
}

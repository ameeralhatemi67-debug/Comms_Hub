// The application's main process (Desktop_App_Plan.md sections 5 and 9, phases D1 and D2). It opens the
// live site in one window on its own private profile and keeps a small, locked layer around it: the
// compiled address list, links and outside connections to the system browser, the permission policy,
// downloads through the save dialog, one instance, the window's place, the Arabic connection screen
// and the few keys of 11.1. From D2 the bridge's handlers, the tray, native notices and the laptop kept
// awake during an export live in native.ts. It holds no secret and decides nothing about people: every
// page, rule and check stays the website's. The rules themselves are the plain functions beside this file.
import fs from 'node:fs';
import path from 'node:path';
import { app, BrowserWindow, Menu, nativeTheme, screen, session, shell } from 'electron';
import type { WebContents, WebPreferences } from 'electron';
import { ALLOWED, DEV, QA, UPDATE_FEED, VERSION } from './compiled.ts';
import { saveDialogFor } from './downloads.ts';
import { dataFolderName, PRODUCT_NAME, productNameFor, userAgentFor, windowsAppId } from './identity.ts';
import { keyAction, nextZoom, type KeyAction } from './keys.ts';
import { startNative, type Native } from './native.ts';
import { decideNavigation, loadFailure, type Decision } from './navigation.ts';
import { DEVELOPMENT_ORIGIN, isAllowed, PRODUCTION_ORIGIN } from './origins.ts';
import { permissionGranted } from './permissions.ts';
import { refusedSwitch } from './switches.ts';
import { parseState, placeWindow, MIN_SIZE, type WindowState } from './window-state.ts';

const PARTITION = 'persist:comms-hub';
// The connection note is a local page with no session of its own worth keeping.
const NOTE_PARTITION = 'comms-hub-note';

// 1. Never start with a switch that ignores certificates, weakens the sandbox or, in a release build,
// opens remote debugging.
const refused = refusedSwitch((name) => app.commandLine.hasSwitch(name), DEV);
if (refused) {
  process.stderr.write(`refused to start with --${refused}\n`);
  app.exit(2);
}

// 2. The profile lives in a folder named by the fixed id, whatever name Windows shows. A development
// build may be pointed at a throwaway folder by the checks in qa/desktop-shell.cjs.
const devData = __COMMS_HUB_DEV__ ? process.env.COMMS_HUB_DEV_DATA : undefined;
app.setPath('userData', devData && path.isAbsolute(devData) ? devData : path.join(app.getPath('appData'), dataFolderName(DEV, QA)));
app.setName(productNameFor(DEV, QA));
if (process.platform === 'win32') app.setAppUserModelId(windowsAppId(DEV, QA));

const lock = app.requestSingleInstanceLock();
if (!lock) app.quit();

let main: BrowserWindow | null = null;
let native: Native | null = null;
/** Windows that show the site and may carry the bridge: the main one and those the site opened. */
const siteWindows = new Set<number>();
/** The site address to load again from the connection screen, per window. */
const retryOf = new WeakMap<WebContents, string>();

const pagePath = (name: string) => path.join(__dirname, name);
const background = () => (nativeTheme.shouldUseDarkColors ? '#07130e' : '#f4f6f2');

function startAddress(): string {
  if (__COMMS_HUB_DEV__) {
    const asked = process.env.COMMS_HUB_START;
    if (asked && isAllowed(asked, ALLOWED)) return asked;
    return `${DEVELOPMENT_ORIGIN}/`;
  }
  return `${PRODUCTION_ORIGIN}/`;
}

function sitePreferences(): WebPreferences {
  return {
    partition: PARTITION,
    preload: pagePath('preload.js'),
    contextIsolation: true,
    sandbox: true,
    nodeIntegration: false,
    nodeIntegrationInSubFrames: false,
    nodeIntegrationInWorker: false,
    webviewTag: false,
    devTools: DEV,
    navigateOnDragDrop: false,
    safeDialogs: true,
  };
}

// --- the session: user agent, permissions, devices, downloads --------------------------------------

function prepareSession() {
  const site = session.fromPartition(PARTITION);
  const agent = userAgentFor(site.getUserAgent(), VERSION);
  site.setUserAgent(agent);
  app.userAgentFallback = agent;

  site.setPermissionRequestHandler((_contents, permission, callback, details) => {
    const mediaTypes = 'mediaTypes' in details ? details.mediaTypes : undefined;
    callback(permissionGranted({ permission, url: details.requestingUrl, mediaTypes }, ALLOWED));
  });
  site.setPermissionCheckHandler((_contents, permission, requestingOrigin, details) =>
    permissionGranted({ permission, url: details.requestingUrl ?? requestingOrigin, mediaType: details.mediaType }, ALLOWED),
  );
  // USB, serial and HID devices are never offered, and every chooser is cancelled.
  site.setDevicePermissionHandler(() => false);
  site.on('select-hid-device', (event, _details, callback) => {
    event.preventDefault();
    callback();
  });
  site.on('select-usb-device', (event, _details, callback) => {
    event.preventDefault();
    callback();
  });
  site.on('select-serial-port', (event, _ports, _contents, callback) => {
    event.preventDefault();
    callback('');
  });

  site.on('will-download', (_event, item) => {
    item.setSaveDialogOptions(saveDialogFor(app.getPath('downloads'), item.getFilename()));
  });
  // Certificate errors are never ignored: there is no 'certificate-error' handler and no
  // setCertificateVerifyProc, so Chromium refuses the page and the connection screen says why.
}

// --- leaving the site ------------------------------------------------------------------------------

function openOutside(decision: Extract<Decision, { action: 'browser' }>, owner: BrowserWindow) {
  if (decision.note) showConnectNote(owner, decision.url);
  else void shell.openExternal(decision.url).catch(() => undefined);
}

/**
 * The note before an outside connection (5.1). Its «متابعة في المتصفح» is a plain link to the same
 * address; following it opens the system browser and closes the note. Nothing else leaves it.
 */
function showConnectNote(owner: BrowserWindow, address: string) {
  const note = new BrowserWindow({
    parent: owner,
    modal: true,
    width: 480,
    height: 260,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    show: false,
    title: PRODUCT_NAME,
    backgroundColor: background(),
    webPreferences: { partition: NOTE_PARTITION, contextIsolation: true, sandbox: true, nodeIntegration: false, webviewTag: false, devTools: DEV },
  });
  note.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  note.webContents.on('will-navigate', (event) => {
    event.preventDefault();
    const decision = decideNavigation(event.url, ALLOWED);
    if (decision.action === 'browser' && decision.note && decision.url === address) {
      void shell.openExternal(address).catch(() => undefined);
    }
    note.close();
  });
  note.once('ready-to-show', () => note.show());
  void note.loadFile(pagePath('connect-note.html'), { query: { go: address } });
}

// --- the rules on every window that shows the site -------------------------------------------------

function showConnectionScreen(contents: WebContents, kind: 'offline' | 'certificate', failed: string) {
  retryOf.set(contents, isAllowed(failed, ALLOWED) ? failed : startAddress());
  void contents.loadFile(pagePath('offline.html'), { query: { kind, retry: retryOf.get(contents) as string } });
}

function perform(action: KeyAction, contents: WebContents, owner: BrowserWindow) {
  switch (action) {
    case 'zoom-in':
      contents.setZoomFactor(nextZoom(contents.getZoomFactor(), 1));
      return;
    case 'zoom-out':
      contents.setZoomFactor(nextZoom(contents.getZoomFactor(), -1));
      return;
    case 'zoom-reset':
      contents.setZoomFactor(1);
      return;
    case 'full-screen':
      owner.setFullScreen(!owner.isFullScreen());
      return;
    case 'reload':
    case 'reload-fresh': {
      const retry = retryOf.get(contents);
      if (contents.getURL().startsWith('file:') && retry) void contents.loadURL(retry);
      else if (action === 'reload') contents.reload();
      else contents.reloadIgnoringCache();
      return;
    }
    case 'devtools':
      if (__COMMS_HUB_DEV__) contents.toggleDevTools();
      return;
  }
}

function attachSiteRules(owner: BrowserWindow, isMain = false) {
  const contents = owner.webContents;
  siteWindows.add(contents.id);
  contents.once('destroyed', () => siteWindows.delete(contents.id));
  native?.attachWindow(owner, isMain);

  contents.on('will-navigate', (event) => {
    const decision = decideNavigation(event.url, ALLOWED);
    if (decision.action === 'stay') return;
    event.preventDefault();
    if (decision.action === 'browser') openOutside(decision, owner);
  });
  contents.on('will-redirect', (event) => {
    if (!event.isMainFrame) return;
    const decision = decideNavigation(event.url, ALLOWED);
    if (decision.action === 'stay') return;
    event.preventDefault();
    if (decision.action === 'browser') openOutside(decision, owner);
  });
  contents.setWindowOpenHandler(({ url }) => {
    const decision = decideNavigation(url, ALLOWED);
    if (decision.action === 'stay') {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: { width: 1200, height: 800, minWidth: MIN_SIZE.width, minHeight: MIN_SIZE.height, title: PRODUCT_NAME, backgroundColor: background(), webPreferences: sitePreferences() },
      };
    }
    if (decision.action === 'browser') openOutside(decision, owner);
    return { action: 'deny' };
  });
  // A window the site opened on its own address keeps every rule of the first.
  contents.on('did-create-window', (child) => attachSiteRules(child));

  contents.on('did-fail-load', (_event, code, _description, failed, isMainFrame) => {
    if (!isMainFrame) return;
    const kind = loadFailure(code);
    if (kind !== 'ignore') showConnectionScreen(contents, kind, failed);
  });
  contents.on('before-input-event', (event, input) => {
    const action = keyAction(input, DEV);
    if (!action) return;
    event.preventDefault();
    perform(action, contents, owner);
  });
  contents.on('select-bluetooth-device', (event, _devices, callback) => {
    event.preventDefault();
    callback('');
  });
}

// --- the main window and its place ----------------------------------------------------------------

const statePath = () => path.join(app.getPath('userData'), 'window-state.json');

function readState(): WindowState | null {
  try {
    return parseState(JSON.parse(fs.readFileSync(statePath(), 'utf8')));
  } catch {
    return null;
  }
}

function writeState(win: BrowserWindow) {
  const state: WindowState = { bounds: win.getNormalBounds(), maximized: win.isMaximized() };
  try {
    fs.writeFileSync(`${statePath()}.tmp`, JSON.stringify(state));
    fs.renameSync(`${statePath()}.tmp`, statePath());
  } catch {
    // The place is a convenience; a failed write only means the default place next time.
  }
}

function createMainWindow() {
  const place = placeWindow(readState(), screen.getAllDisplays().map((d) => d.workArea), screen.getPrimaryDisplay().workArea);
  const win = new BrowserWindow({
    x: place.x,
    y: place.y,
    width: place.width,
    height: place.height,
    minWidth: MIN_SIZE.width,
    minHeight: MIN_SIZE.height,
    show: false,
    title: PRODUCT_NAME,
    backgroundColor: background(),
    webPreferences: sitePreferences(),
  });
  // At a display scale other than 100% Windows can widen a new window by a few pixels; setting the
  // stored bounds once more puts it exactly where it was (qa/desktop-shell.cjs measured 1100 to 1104 at 125%).
  if (place.x !== undefined && place.y !== undefined) win.setBounds({ x: place.x, y: place.y, width: place.width, height: place.height });
  main = win;
  attachSiteRules(win, true);
  win.on('close', () => writeState(win));
  win.on('closed', () => {
    if (main === win) main = null;
  });
  if (place.maximized) win.maximize();
  win.show();
  void win.loadURL(startAddress());
}

app.on('second-instance', () => {
  if (main) native?.reveal(main);
});

app.on('web-contents-created', (_event, contents) => {
  contents.on('will-attach-webview', (event) => event.preventDefault());
});

app.on('window-all-closed', () => app.quit());

if (lock && !refused) {
  void app.whenReady().then(() => {
    // No native menu bar (11.1): the site and the studio keep their own menus and keys.
    Menu.setApplicationMenu(null);
    prepareSession();
    native = startNative({ allowed: ALLOWED, windows: () => siteWindows, mainWindow: () => main, version: VERSION, iconPath: pagePath('icon.png'), feed: UPDATE_FEED, qa: QA, dev: DEV });
    createMainWindow();
  });
}

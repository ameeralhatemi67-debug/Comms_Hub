// Application check of the desktop shell (Desktop_App_Plan.md phase D1; DT-01 to DT-04 of section 12).
//
// Part 1 drives the development package (desktop/dist/dev) with Playwright's Electron support. It differs
// from the release package only in its compiled list (the local site added), the developer tools and the
// inspector fuse that Playwright attaches through. Two local servers stand in for the site: an allowed
// fixture at 127.0.0.1:3000 and a foreign one on another port. It also opens the real production sign-in
// page, signed out (never signed in), and a self-signed certificate for the production name.
// Keys are sent with webContents.sendInputEvent, the browser-side path a real key takes: Playwright's own
// key presses enter below the point where the application sees keys.
//
// Part 2 reads the fuses of both packages back, then installs the release package silently, proves at run
// time that the closed fuses and refused switches hold, opens the production address, and uninstalls it,
// checking that the profile is gone (D-11). If this laptop already has an installation or a profile of the
// application, part 2's installation is skipped and nothing of it is touched.
//
// Usage: node qa/desktop-shell.cjs   (writes qa/desktop-shell.json; screenshots in qa/artifacts/desktop-shell)
// Needs: `npm run pack:dev` and `npm run pack` in desktop/ first.
const fs = require('node:fs');
const http = require('node:http');
const https = require('node:https');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { dependency } = require('./runtime.cjs');
const { _electron } = dependency('playwright');

const root = path.resolve(__dirname, '..');
const desktop = path.join(root, 'desktop');
const pkg = JSON.parse(fs.readFileSync(path.join(desktop, 'package.json'), 'utf8'));
const devExe = path.join(desktop, 'dist', 'dev', 'win-unpacked', 'CommsHub.exe');
const releaseUnpacked = path.join(desktop, 'dist', 'release', 'win-unpacked');
const releaseExe = path.join(releaseUnpacked, 'CommsHub.exe');
const installer = path.join(desktop, 'dist', 'release', `CommsHub-Setup-${pkg.version}-x64.exe`);
const PRODUCT_NAME = 'مركز الاتصال المؤسسي';
const PRODUCTION = 'https://comms-hub-three.vercel.app';
const CONNECT_NOTE = 'يكتمل الربط في المتصفح. سجّل الدخول إلى المركز هناك إن طُلب منك، ثم ارجع إلى التطبيق.';
const shots = path.join(__dirname, 'artifacts', 'desktop-shell');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'comms-hub-desktop-qa-'));

const result = { script: 'qa/desktop-shell.cjs', run: new Date().toISOString(), version: pkg.version, packages: {}, fuses: {}, install: {}, checks: [], notes: [] };
const check = (name, pass, detail = '') => {
  const entry = { name, pass: Boolean(pass), detail: typeof detail === 'string' ? detail : JSON.stringify(detail) };
  result.checks.push(entry);
  console.log(`${entry.pass ? 'pass' : 'FAIL'}  ${name}${entry.pass ? '' : ` | ${entry.detail}`}`);
};
const note = (text) => result.notes.push(text);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 10000, step = 150) {
  const end = Date.now() + ms;
  let last;
  while (Date.now() < end) {
    try {
      last = await fn();
      if (last) return last;
    } catch {
      // the page may be between documents
    }
    await sleep(step);
  }
  return last;
}
const sizeOf = (dir) => fs.readdirSync(dir, { withFileTypes: true }).reduce((sum, e) => sum + (e.isDirectory() ? sizeOf(path.join(dir, e.name)) : fs.statSync(path.join(dir, e.name)).size), 0);
const countFiles = (dir) => fs.readdirSync(dir, { withFileTypes: true }).reduce((n, e) => n + (e.isDirectory() ? countFiles(path.join(dir, e.name)) : 1), 0);
const mb = (bytes) => `${(bytes / 1048576).toFixed(1)} MB`;

// PowerShell with Arabic in and out: the command goes as UTF-16 base64, the answer comes back as UTF-8.
function ps(command) {
  const encoded = Buffer.from(`[Console]::OutputEncoding=[Text.Encoding]::UTF8; ${command}`, 'utf16le').toString('base64');
  const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], { encoding: 'utf8', timeout: 60000 });
  return (r.stdout || '').trim();
}

// A local server that remembers what it was asked for.
function server(handler) {
  const seen = [];
  const s = http.createServer((req, res) => {
    seen.push(req.url);
    handler(req, res);
  });
  return { s, seen };
}
const listen = (s, port = 0) => new Promise((resolve, reject) => {
  s.once('error', reject);
  s.listen(port, '127.0.0.1', () => resolve(s.address().port));
});
const portAnswers = (port) => new Promise((resolve) => {
  const socket = net.connect(port, '127.0.0.1');
  socket.once('connect', () => { socket.destroy(); resolve(true); });
  socket.once('error', () => resolve(false));
  setTimeout(() => { socket.destroy(); resolve(false); }, 400);
});
const freePort = async () => {
  const s = net.createServer();
  const port = await listen(s);
  await new Promise((r) => s.close(r));
  return port;
};

// --- the fixture pages ------------------------------------------------------------------------------

function fixtures(foreignPort) {
  const foreign = `http://127.0.0.1:${foreignPort}`;
  const page = (title, body) => `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${title}</title></head><body>${body}</body></html>`;
  const main = page('صفحة الفحص', `
    <h1>صفحة الفحص على العنوان المسموح به</h1>
    <a id="foreign" href="${foreign}/landing">رابط خارجي</a>
    <a id="mail" href="mailto:team@example.com?subject=qa">بريد</a>
    <a id="settings" href="ms-settings:privacy">إعدادات النظام</a>
    <a id="file" href="file:///C:/Windows/win.ini">ملف محلي</a>
    <a id="redirect" href="/redirect-out">تحويل إلى الخارج</a>
    <a id="second" href="/second">صفحة ثانية</a>
    <a id="drive" href="/api/drive/connect">ربط Drive</a>
    <a id="onedrive" href="/api/onedrive/connect">ربط OneDrive</a>
    <a id="download" href="/file.txt">تنزيل</a>
    <button id="hid">hid</button><button id="serial">serial</button><button id="usb">usb</button><button id="bt">bt</button><button id="full">full</button>
    <iframe id="same" src="/frame" title="same"></iframe>
    <iframe id="other" src="${foreign}/frame" title="other"></iframe>
    <script>
      window.keys = [];
      addEventListener('keydown', (e) => keys.push((e.ctrlKey ? 'Ctrl+' : '') + (e.shiftKey ? 'Shift+' : '') + e.code));
      document.cookie = 'qa=1; path=/';
      const ask = (id, fn) => document.getElementById(id).addEventListener('click', async () => {
        try { window['__' + id] = await fn(); } catch (e) { window['__' + id] = 'refused:' + e.name; }
      });
      ask('hid', async () => 'devices:' + (await navigator.hid.requestDevice({ filters: [] })).length);
      ask('serial', async () => 'port:' + Boolean(await navigator.serial.requestPort()));
      ask('usb', async () => 'device:' + Boolean(await navigator.usb.requestDevice({ filters: [] })));
      ask('bt', async () => navigator.bluetooth ? 'device:' + Boolean(await navigator.bluetooth.requestDevice({ acceptAllDevices: true })) : 'refused:not-offered');
      ask('full', async () => { await document.documentElement.requestFullscreen(); await document.exitFullscreen(); return 'granted'; });
    </script>`);
  const allowed = server((req, res) => {
    const url = req.url.split('?')[0];
    if (url === '/') return res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }), res.end(main);
    if (url === '/second') return res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }), res.end(page('الثانية', '<h1>الصفحة الثانية</h1>'));
    if (url === '/frame') return res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }), res.end(page('إطار', '<p>إطار من العنوان نفسه</p>'));
    if (url === '/redirect-out') return res.writeHead(302, { location: `${foreign}/redirected` }), res.end();
    if (url === '/file.txt') return res.writeHead(200, { 'content-type': 'text/plain', 'content-disposition': 'attachment; filename="comms-hub-check.txt"' }), res.end('comms hub desktop check');
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not here');
  });
  const outside = server((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(page('خارجي', `<h1>صفحة خارجية</h1><p>${req.url}</p>`));
  });
  return { allowed, outside, foreign };
}

// --- part 1: the development package, driven -----------------------------------------------------

// Every application this check starts, so a part that fails halfway still closes what it opened.
const running = new Set();
async function closeAll() {
  for (const app of running) {
    const pid = app.process().pid;
    await Promise.race([app.close().catch(() => undefined), sleep(10000)]);
    spawnSync('taskkill', ['/PID', String(pid), '/T', '/F']);
    running.delete(app);
  }
}

async function launchDev(data, { args = [], env = {} } = {}) {
  const app = await _electron.launch({ executablePath: devExe, args, env: { ...process.env, COMMS_HUB_DEV_DATA: data, ...env }, timeout: 60000 });
  running.add(app);
  app.once('close', () => running.delete(app));
  const win = await app.firstWindow();
  const mainId = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].id);
  const inMain = (fn, arg) => app.evaluate(fn, [mainId, arg]);
  return { app, win, mainId, inMain };
}

async function partOne() {
  if (!fs.existsSync(devExe)) {
    check('the development package exists (npm run pack:dev in desktop/)', false, devExe);
    return;
  }
  const foreignPort = await freePort();
  const { allowed, outside, foreign } = fixtures(foreignPort);
  await listen(outside.s, foreignPort);
  const portFree = !(await portAnswers(3000));
  check('port 3000 is free for the allowed fixture', portFree, portFree ? '' : 'something already answers on 127.0.0.1:3000; stop it and run again');
  if (!portFree) return;
  const data = path.join(scratch, 'dev-profile');
  fs.mkdirSync(shots, { recursive: true });

  // 1. Nothing answers at the address: the connection screen, without the bridge.
  let { app, win, mainId, inMain } = await launchDev(data, { args: ['--use-fake-device-for-media-stream'] });
  result.electron = await app.evaluate(() => ({ electron: process.versions.electron, chrome: process.versions.chrome, node: process.versions.node }));
  await until(() => win.url().includes('offline.html'), 20000);
  const offline = await win.evaluate(() => ({ dir: document.documentElement.dir, lang: document.documentElement.lang, h1: document.querySelector('h1').textContent, button: document.getElementById('retry').textContent, bridge: typeof window.commsHubNative, title: document.title }));
  check('the connection screen appears when the address cannot be reached', win.url().startsWith('file:') && offline.h1 === 'تعذّر الوصول إلى المركز', offline);
  check('the connection screen is Arabic, right to left, with «إعادة المحاولة»', offline.dir === 'rtl' && offline.lang === 'ar' && offline.button === 'إعادة المحاولة', offline);
  check('the connection screen gets no bridge', offline.bridge === 'undefined', offline.bridge);
  await win.screenshot({ path: path.join(shots, 'offline.png') });

  // 2. The address comes back: «إعادة المحاولة» loads it.
  await listen(allowed.s, 3000);
  await win.click('#retry');
  await until(() => win.url() === 'http://127.0.0.1:3000/', 15000);
  await win.waitForLoadState('load');
  check('«إعادة المحاولة» loads the site once it answers', win.url() === 'http://127.0.0.1:3000/', win.url());

  // 3. The bridge: on the allowed top-level page only.
  const bridge = await win.evaluate(() => ({ value: window.commsHubNative, keys: Object.keys(window.commsHubNative || {}), frozen: Object.isFrozen(window.commsHubNative) }));
  check('the bridge exists on an allowed page, with exactly platform, shell, version and bridge', JSON.stringify(bridge.value) === JSON.stringify({ platform: 'desktop', shell: 'electron', version: pkg.version, bridge: 1 }) && bridge.keys.length === 4, bridge);
  check('the bridge object cannot be changed by the page', bridge.frozen, String(bridge.frozen));
  await until(() => win.frames().length >= 3, 10000);
  const frameOf = (prefix) => win.frames().find((f) => f.url().startsWith(prefix));
  const sameFrame = frameOf('http://127.0.0.1:3000/frame');
  const otherFrame = frameOf(`${foreign}/frame`);
  const inSame = sameFrame ? await sameFrame.evaluate(() => typeof window.commsHubNative) : 'no frame';
  const inOther = otherFrame ? await otherFrame.evaluate(() => typeof window.commsHubNative) : 'no frame';
  check('a frame on the same address gets no bridge', inSame === 'undefined', inSame);
  check('a frame from a foreign address gets no bridge', inOther === 'undefined', inOther);

  // 4. Leaving the site: the system browser (stubbed), the window stays where it was.
  await app.evaluate(({ shell }) => {
    globalThis.__opened = [];
    shell.openExternal = async (url) => {
      globalThis.__opened.push(url);
    };
  });
  const opened = () => app.evaluate(() => globalThis.__opened.slice());
  const clickIn = (id) => win.evaluate((x) => document.getElementById(x).click(), id);
  const windowsNow = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length);
  const before = await windowsNow();
  await clickIn('foreign');
  await until(async () => (await opened()).length >= 1, 5000);
  check('a foreign link opens in the system browser', (await opened()).includes(`${foreign}/landing`), await opened());
  check('a foreign link leaves the window where it was', win.url() === 'http://127.0.0.1:3000/', win.url());
  const popup = await win.evaluate((u) => window.open(u) === null, `${foreign}/popup`);
  await until(async () => (await opened()).length >= 2, 5000);
  check('window.open of a foreign address opens in the system browser and makes no window', popup && (await opened()).includes(`${foreign}/popup`) && (await windowsNow()) === before, { opened: await opened(), windows: await windowsNow() });
  await clickIn('mail');
  await until(async () => (await opened()).length >= 3, 5000);
  check('a mail link goes to the system', (await opened()).includes('mailto:team@example.com?subject=qa'), await opened());
  await clickIn('redirect');
  await until(async () => (await opened()).length >= 4, 5000);
  check('a redirect out of the list goes to the system browser, the window stays', (await opened()).includes(`${foreign}/redirected`) && win.url() === 'http://127.0.0.1:3000/', { opened: await opened(), url: win.url() });
  const countBefore = (await opened()).length;
  await clickIn('settings');
  await clickIn('file');
  await sleep(800);
  check('any other kind of address (ms-settings:, file:) is refused: nothing opens, the window stays', (await opened()).length === countBefore && win.url() === 'http://127.0.0.1:3000/', { opened: await opened(), url: win.url() });
  check('the foreign pages were never loaded inside the application', !outside.seen.some((u) => ['/landing', '/popup', '/redirected'].includes(u)), outside.seen);

  // 5. Staying on the site: a link in place, window.open in a new window of the application.
  // From here on links are clicked through the page and buttons with the low-level mouse: after a
  // refused navigation Playwright's own actions keep waiting for a navigation that never comes.
  await clickIn('second');
  await win.waitForURL('http://127.0.0.1:3000/second');
  check('a link on the list stays in the window', win.url() === 'http://127.0.0.1:3000/second', win.url());
  await win.goBack();
  await win.waitForURL('http://127.0.0.1:3000/');
  const childEvent = app.waitForEvent('window');
  await win.evaluate(() => {
    window.open('/second');
  });
  const child = await childEvent;
  await child.waitForLoadState('load');
  const childState = await child.evaluate(() => ({ bridge: typeof window.commsHubNative, cookie: document.cookie, h1: document.querySelector('h1').textContent }));
  check('window.open on the list opens a window of the application, with the bridge and the same session', child.url() === 'http://127.0.0.1:3000/second' && childState.bridge === 'object' && childState.cookie.includes('qa=1'), { url: child.url(), ...childState });
  check('the first window stays where it was', win.url() === 'http://127.0.0.1:3000/', win.url());
  await child.close();

  // 6. Outside connections: the note, then the system browser; never loaded inside.
  const openedBefore = (await opened()).length;
  let noteEvent = app.waitForEvent('window');
  await clickIn('drive');
  let notePage = await noteEvent;
  await notePage.waitForLoadState('load');
  const noteState = await notePage.evaluate(() => ({ text: document.getElementById('note').textContent, dir: document.documentElement.dir, bridge: typeof window.commsHubNative }));
  const modal = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().filter((w) => w.isModal()).map((w) => w.getParentWindow() && w.getParentWindow().id));
  check('an outside connection first shows the Arabic note, verbatim, over the window', noteState.text === CONNECT_NOTE && noteState.dir === 'rtl' && modal.includes(mainId), { ...noteState, modal });
  check('the note gets no bridge', noteState.bridge === 'undefined', noteState.bridge);
  await notePage.screenshot({ path: path.join(shots, 'connect-note.png') });
  await notePage.evaluate(() => document.getElementById('go').click());
  await until(async () => (await opened()).length > openedBefore && notePage.isClosed(), 5000);
  check('«متابعة في المتصفح» opens /api/drive/connect in the system browser and closes the note', (await opened()).includes('http://127.0.0.1:3000/api/drive/connect') && notePage.isClosed(), await opened());
  noteEvent = app.waitForEvent('window');
  await win.evaluate(() => {
    window.location.href = '/api/platforms/connect/facebook';
  });
  notePage = await noteEvent;
  await notePage.waitForLoadState('load');
  const openedMid = (await opened()).length;
  await notePage.evaluate(() => document.getElementById('cancel').click());
  await until(() => notePage.isClosed(), 5000);
  check('«إلغاء» closes the note and opens nothing (a platform connection started by the page)', notePage.isClosed() && (await opened()).length === openedMid, await opened());
  noteEvent = app.waitForEvent('window');
  await clickIn('onedrive');
  notePage = await noteEvent;
  await notePage.waitForLoadState('load');
  await notePage.evaluate(() => document.getElementById('go').click());
  await until(async () => (await opened()).includes('http://127.0.0.1:3000/api/onedrive/connect'), 5000);
  check('/api/onedrive/connect goes to the system browser the same way', (await opened()).includes('http://127.0.0.1:3000/api/onedrive/connect'), await opened());
  check('no connection route was ever loaded inside the application', !allowed.seen.some((u) => u.startsWith('/api/')), allowed.seen);
  check('after the connections the window is still where it was', win.url() === 'http://127.0.0.1:3000/', win.url());

  // 7. Permissions on the allowed page.
  const media = (constraints) => win.evaluate(async (c) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia(c);
      const kinds = stream.getTracks().map((t) => t.kind);
      stream.getTracks().forEach((t) => t.stop());
      return `granted:${kinds.join(',')}`;
    } catch (e) {
      return `refused:${e.name}`;
    }
  }, constraints);
  const mic = await media({ audio: true });
  const camera = await media({ video: true });
  const both = await media({ audio: true, video: true });
  check('the microphone is granted (Chromium\'s fake device)', mic === 'granted:audio', mic);
  check('the camera is refused', camera.startsWith('refused:'), camera);
  check('the camera is refused even asked for together with the microphone', both.startsWith('refused:'), both);
  const notify = await win.evaluate(() => Notification.requestPermission());
  check('notifications are granted', notify === 'granted', notify);
  const clip = await win.evaluate(() => navigator.permissions.query({ name: 'clipboard-read' }).then((s) => s.state, (e) => `error:${e.name}`));
  check('the clipboard is granted (read, by query, so nothing on this laptop\'s clipboard is touched)', clip === 'granted', clip);
  const geo = await win.evaluate(() => new Promise((r) => navigator.geolocation.getCurrentPosition(() => r('granted'), (e) => r(`refused:${e.code}`), { timeout: 8000 })));
  check('location is refused', geo === 'refused:1', geo);
  const midi = await win.evaluate(() => navigator.requestMIDIAccess().then(() => 'granted', (e) => `refused:${e.name}`));
  check('MIDI is refused', midi.startsWith('refused:'), midi);
  const persist = await win.evaluate(() => navigator.storage.persist());
  const wake = await win.evaluate(() => navigator.wakeLock.request('screen').then((l) => (l.release(), 'granted'), (e) => `refused:${e.name}`));
  check('permissions not on the list are refused too (persistent storage, the screen wake lock)', persist === false && wake.startsWith('refused:'), { persist, wake });
  // A real press (a user gesture) for each device chooser.
  for (const id of ['hid', 'serial', 'usb', 'bt', 'full']) {
    const box = await win.evaluate((x) => {
      const r = document.getElementById(x).getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }, id);
    await win.mouse.click(box.x, box.y);
    await sleep(300);
  }
  const devices = await until(() => win.evaluate(() => (['hid', 'serial', 'usb', 'bt', 'full'].every((k) => window[`__${k}`]) ? { hid: window.__hid, serial: window.__serial, usb: window.__usb, bt: window.__bt, full: window.__full } : null)), 10000);
  check('HID offers no device', devices && (devices.hid === 'devices:0' || devices.hid.startsWith('refused:')), devices);
  check('serial is refused', devices && devices.serial.startsWith('refused:'), devices);
  check('USB is refused', devices && devices.usb.startsWith('refused:'), devices);
  check('Bluetooth is refused', devices && devices.bt.startsWith('refused:'), devices);
  check('full screen is granted to the page', devices && devices.full === 'granted', devices);

  // 8. A foreign page in the window (loaded by the main process itself): no bridge, no microphone.
  await inMain(({ BrowserWindow }, [id, url]) => BrowserWindow.fromId(id).webContents.loadURL(url), `${foreign}/foreign`);
  const foreignState = await win.evaluate(async () => {
    let mic;
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      s.getTracks().forEach((t) => t.stop());
      mic = 'granted';
    } catch (e) {
      mic = `refused:${e.name}`;
    }
    const notifications = await navigator.permissions.query({ name: 'notifications' }).then((s) => s.state);
    return { bridge: typeof window.commsHubNative, mic, notifications };
  });
  check('a foreign top-level page gets no bridge', win.url().startsWith(foreign) && foreignState.bridge === 'undefined', { url: win.url(), ...foreignState });
  check('a foreign page gets no permission (microphone, notifications)', foreignState.mic.startsWith('refused:') && foreignState.notifications !== 'granted', foreignState);
  await inMain(({ BrowserWindow }, [id]) => BrowserWindow.fromId(id).webContents.loadURL('http://127.0.0.1:3000/'));

  // 9. The window: settings, profile, no menu, user agent.
  const prefs = await inMain(({ BrowserWindow, Menu }, [id]) => {
    const w = BrowserWindow.fromId(id);
    const p = w.webContents.getLastWebPreferences() || {};
    return { contextIsolation: p.contextIsolation, sandbox: p.sandbox, nodeIntegration: p.nodeIntegration, nodeIntegrationInSubFrames: p.nodeIntegrationInSubFrames, webviewTag: p.webviewTag, menu: Menu.getApplicationMenu(), persistent: w.webContents.session.isPersistent(), storage: w.webContents.session.getStoragePath() };
  });
  check('the window runs isolated and sandboxed, without Node.js and without webview', prefs.contextIsolation === true && prefs.sandbox === true && prefs.nodeIntegration === false && prefs.nodeIntegrationInSubFrames === false && prefs.webviewTag === false, prefs);
  check('the site lives in the persistent profile persist:comms-hub', prefs.persistent === true && /Partitions[\\/]comms-hub$/.test(prefs.storage || ''), prefs.storage);
  check('there is no native menu bar', prefs.menu === null, String(prefs.menu));
  const agent = await win.evaluate(() => navigator.userAgent);
  check('the user agent ends with CommsHubDesktop/<version> and carries no Electron token', agent.endsWith(` CommsHubDesktop/${pkg.version}`) && !/Electron\//.test(agent), agent);

  // 10. Keys, through the browser-side input path.
  await app.evaluate(({ BrowserWindow }, [id]) => {
    globalThis.__keys = [];
    BrowserWindow.fromId(id).webContents.on('before-input-event', (event, input) => {
      if (input.type === 'keyDown') globalThis.__keys.push({ code: input.code, ctrl: input.control, prevented: event.defaultPrevented });
    });
  }, [mainId]);
  const send = (keyCode, modifiers = []) => inMain(({ BrowserWindow }, [id, [k, m]]) => {
    const contents = BrowserWindow.fromId(id).webContents;
    contents.sendInputEvent({ type: 'keyDown', keyCode: k, modifiers: m });
    contents.sendInputEvent({ type: 'keyUp', keyCode: k, modifiers: m });
  }, [keyCode, modifiers]);
  const pageKeys = () => win.evaluate(() => window.keys.slice());
  const ready = await until(async () => {
    await send('F24');
    return (await pageKeys()).includes('F24');
  }, 15000, 400);
  check('keys reach the page once the window has settled (a neutral F24)', ready, await pageKeys());
  const seen = () => app.evaluate(() => globalThis.__keys.slice());
  await send('Z', ['control']);
  await send('Z', ['control', 'shift']);
  await send('K', ['control']);
  await send('S');
  await until(async () => (await pageKeys()).includes('KeyS'), 3000);
  const passed = await pageKeys();
  const zSeen = (await seen()).find((k) => k.code === 'KeyZ');
  check('Ctrl+Z reaches the page; the application does not hold it back', passed.includes('Ctrl+KeyZ') && zSeen && zSeen.prevented === false, { page: passed, app: zSeen });
  check('the studio\'s keys reach the page (Ctrl+Shift+Z, Ctrl+K, S)', ['Ctrl+Shift+KeyZ', 'Ctrl+KeyK', 'KeyS'].every((k) => passed.includes(k)), passed);
  const zoom = () => inMain(({ BrowserWindow }, [id]) => BrowserWindow.fromId(id).webContents.getZoomFactor());
  await send('=', ['control']);
  const zoomIn = await until(async () => ((await zoom()) > 1.05 ? zoom() : null), 3000);
  await send('-', ['control']);
  await send('-', ['control']);
  const zoomOut = await until(async () => ((await zoom()) < 0.95 ? zoom() : null), 3000);
  await send('0', ['control']);
  const zoomReset = await until(async () => ((await zoom()) === 1 ? 1 : null), 3000);
  check('Ctrl with plus, minus and zero zoom in, out and back', zoomIn === 1.1 && zoomOut === 0.9 && zoomReset === 1, { zoomIn, zoomOut, zoomReset });
  const zoomKeys = (await seen()).filter((k) => ['Equal', 'Minus', 'Digit0'].includes(k.code));
  check('the zoom keys are the application\'s: held back from the page', zoomKeys.length === 4 && zoomKeys.every((k) => k.prevented) && !(await pageKeys()).some((k) => /Equal|Minus|Digit0/.test(k)), zoomKeys);
  const full = () => inMain(({ BrowserWindow }, [id]) => BrowserWindow.fromId(id).isFullScreen());
  await send('F11');
  const fullOn = await until(full, 4000);
  await send('F11');
  const fullOff = await until(async () => !(await full()), 4000);
  check('F11 puts the window in full screen and takes it out', fullOn === true && fullOff === true, { fullOn, fullOff });
  await send('F12');
  const tools = await until(() => inMain(({ BrowserWindow }, [id]) => BrowserWindow.fromId(id).webContents.isDevToolsOpened()), 4000);
  check('F12 opens the developer tools in a development build', tools === true, String(tools));
  await inMain(({ BrowserWindow }, [id]) => BrowserWindow.fromId(id).webContents.closeDevTools());
  await win.evaluate(() => {
    window.__marker = 1;
  });
  const loadsBefore = allowed.seen.filter((u) => u === '/').length;
  await send('F5');
  const reloaded = await until(async () => (await win.evaluate(() => window.__marker)) === undefined && allowed.seen.filter((u) => u === '/').length > loadsBefore, 8000);
  check('F5 reloads the page', reloaded === true, `${allowed.seen.filter((u) => u === '/').length - loadsBefore} new load(s)`);
  await win.waitForLoadState('load');

  // 11. Downloads go through the save dialog, starting in Downloads (the check saves to a scratch folder).
  const saved = path.join(scratch, 'saved.txt');
  await app.evaluate(({ BrowserWindow, app: application }, [id, target]) => {
    globalThis.__download = null;
    BrowserWindow.fromId(id).webContents.session.on('will-download', (_event, item) => {
      globalThis.__download = { options: item.getSaveDialogOptions(), downloads: application.getPath('downloads'), name: item.getFilename() };
      item.setSavePath(target);
      item.once('done', (_e, state) => {
        globalThis.__download.state = state;
      });
    });
  }, [mainId, saved]);
  await clickIn('download');
  const download = await until(() => app.evaluate(() => (globalThis.__download && globalThis.__download.state ? globalThis.__download : null)), 10000);
  const expected = download ? path.join(download.downloads, 'comms-hub-check.txt') : '';
  check('a download opens the save dialog in Downloads under its own name, titled «حفظ الملف»', download && download.options.defaultPath === expected && download.options.title === 'حفظ الملف', download);
  check('the download completes and the window stays where it was', download && download.state === 'completed' && fs.existsSync(saved) && win.url() === 'http://127.0.0.1:3000/', { state: download && download.state, url: win.url() });

  // 12. One instance: a second launch brings the open window forward and leaves.
  await app.evaluate(({ app: application }) => {
    globalThis.__second = 0;
    application.on('second-instance', () => {
      globalThis.__second += 1;
    });
  });
  const second = spawnSync(devExe, [], { env: { ...process.env, COMMS_HUB_DEV_DATA: data }, timeout: 30000 });
  const secondSeen = await until(() => app.evaluate(() => globalThis.__second), 5000);
  check('a second launch leaves at once and the open window is brought forward', second.status === 0 && secondSeen === 1 && (await windowsNow()) === 1, { exit: second.status, secondInstance: secondSeen, windows: await windowsNow() });

  // 13. The window's place is remembered.
  const placed = await inMain(({ BrowserWindow, screen }, [id]) => {
    const display = screen.getPrimaryDisplay();
    const bounds = { x: display.workArea.x + 140, y: display.workArea.y + 100, width: 1100, height: 720 };
    BrowserWindow.fromId(id).setBounds(bounds);
    return { asked: bounds, scaleFactor: display.scaleFactor };
  });
  await sleep(500);
  const applied = await inMain(({ BrowserWindow }, [id]) => BrowserWindow.fromId(id).getNormalBounds());
  await app.close();
  const stored = JSON.parse(fs.readFileSync(path.join(data, 'window-state.json'), 'utf8'));
  ({ app, win, mainId, inMain } = await launchDev(data));
  const back = await inMain(({ BrowserWindow }, [id]) => BrowserWindow.fromId(id).getNormalBounds());
  const near = (a, b, d) => ['x', 'y', 'width', 'height'].every((k) => Math.abs(a[k] - b[k]) <= d);
  // Windows places a window in whole pixels, so at a scale factor other than 1 a size can move by a
  // few device-independent pixels on the way in; what was stored must come back as it was stored.
  check('size and position come back at the next launch, as stored', near(stored.bounds, applied, 1) && near(back, stored.bounds, 1) && near(back, placed.asked, 8), { asked: placed.asked, scaleFactor: placed.scaleFactor, applied, stored: stored.bounds, back });
  await inMain(({ BrowserWindow }, [id]) => BrowserWindow.fromId(id).maximize());
  await sleep(500);
  await app.close();
  ({ app, win, mainId, inMain } = await launchDev(data));
  const maximized = await until(() => inMain(({ BrowserWindow }, [id]) => BrowserWindow.fromId(id).isMaximized()), 5000);
  check('the maximised state comes back too', maximized === true, String(maximized));
  await app.close();

  // 14. The production sign-in page, signed out, right to left; never signed in.
  ({ app, win } = await launchDev(path.join(scratch, 'prod-profile'), { env: { COMMS_HUB_START: `${PRODUCTION}/` } }));
  await win.waitForSelector('input[type="password"]', { timeout: 45000 });
  const prod = await win.evaluate(() => ({ url: location.href, dir: document.documentElement.dir, lang: document.documentElement.lang, h1: (document.querySelector('h1') || {}).textContent, password: Boolean(document.querySelector('input[type="password"]')), bridge: window.commsHubNative && window.commsHubNative.platform, title: document.title }));
  check('the production sign-in page loads right to left, signed out', prod.url.startsWith(`${PRODUCTION}/`) && prod.dir === 'rtl' && prod.lang === 'ar' && /تسجيل الدخول/.test(prod.h1 || '') && prod.password, prod);
  check('the production page carries the bridge (it is on the list)', prod.bridge === 'desktop', prod.bridge);
  await win.screenshot({ path: path.join(shots, 'production-sign-in.png') });
  note('The production sign-in page was opened signed out and left untouched; no account was used.');
  await app.close();

  // 15. A certificate the system does not trust, for the production name: never shown.
  const openssl = ['openssl', 'C:\\Program Files\\Git\\mingw64\\bin\\openssl.exe', 'C:\\Program Files\\Git\\usr\\bin\\openssl.exe'].find((c) => spawnSync(c, ['version']).status === 0);
  if (!openssl) {
    note('Not driven: the certificate case needs openssl to make a self-signed certificate, and none was found.');
  } else {
    const key = path.join(scratch, 'key.pem');
    const cert = path.join(scratch, 'cert.pem');
    spawnSync(openssl, ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', cert, '-days', '1', '-subj', '/CN=comms-hub-three.vercel.app', '-addext', 'subjectAltName=DNS:comms-hub-three.vercel.app']);
    const served = [];
    const tls = https.createServer({ key: fs.readFileSync(key), cert: fs.readFileSync(cert) }, (req, res) => {
      served.push(req.url);
      res.end('should never be shown');
    });
    const tlsPort = await listen(tls);
    ({ app, win } = await launchDev(path.join(scratch, 'cert-profile'), { args: [`--host-resolver-rules=MAP comms-hub-three.vercel.app 127.0.0.1:${tlsPort}`], env: { COMMS_HUB_START: `${PRODUCTION}/` } }));
    await until(() => win.url().includes('offline.html'), 20000);
    const certState = await win.evaluate(() => ({ h1: document.querySelector('h1').textContent, kind: new URLSearchParams(location.search).get('kind'), bridge: typeof window.commsHubNative }));
    check('a certificate the system does not trust is never accepted: the page is not shown and the screen says why', certState.kind === 'certificate' && certState.h1 === 'تعذّر التحقق من أمان الاتصال' && served.length === 0, { ...certState, served });
    await win.screenshot({ path: path.join(shots, 'certificate.png') });
    await app.close();
    tls.close();
  }

  allowed.s.close();
  outside.s.close();
}

// --- part 2: the release package --------------------------------------------------------------------

function readFuses(exe) {
  const cli = path.join(desktop, 'node_modules', '@electron', 'fuses', 'dist', 'bin.js');
  const r = spawnSync(process.execPath, [cli, 'read', '--app', exe], { encoding: 'utf8' });
  const out = `${r.stdout}${r.stderr}`;
  const fuses = {};
  for (const m of out.matchAll(/^\s+(\w+) is (Enabled|Disabled)/gm)) fuses[m[1]] = m[2] === 'Enabled';
  return { fuses, raw: out.trim() };
}

function startRelease(exe, { args = [], env = {} } = {}) {
  const child = spawn(exe, args, { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  const run = { child, pid: child.pid, out: '', exited: false, code: null };
  child.stdout.on('data', (d) => { run.out += d; });
  child.stderr.on('data', (d) => { run.out += d; });
  child.on('exit', (code) => { run.exited = true; run.code = code; });
  return run;
}
async function stopRelease(run) {
  if (run.exited) return;
  spawnSync('taskkill', ['/PID', String(run.pid), '/T']);
  if (!(await until(() => run.exited, 10000))) spawnSync('taskkill', ['/PID', String(run.pid), '/T', '/F']);
  await until(() => run.exited, 5000);
  await sleep(500);
}
const titleOf = (pid) => ps(`(Get-Process -Id ${pid} -ErrorAction SilentlyContinue).MainWindowTitle`);
function filesMention(dir, text) {
  if (!fs.existsSync(dir)) return false;
  const needle = Buffer.from(text);
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).some((e) => {
    const p = path.join(d, e.name);
    if (e.isDirectory()) return walk(p);
    try {
      return fs.statSync(p).size < 50 * 1048576 && fs.readFileSync(p).includes(needle);
    } catch {
      return false;
    }
  });
  return walk(dir);
}

async function partTwo() {
  if (!fs.existsSync(releaseExe) || !fs.existsSync(installer)) {
    check('the release package and installer exist (npm run pack in desktop/)', false, installer);
    return;
  }
  result.packages = {
    installer: path.relative(root, installer).replace(/\\/g, '/'),
    installerBytes: fs.statSync(installer).size,
    installerSize: mb(fs.statSync(installer).size),
    unpackedBytes: sizeOf(releaseUnpacked),
    unpackedSize: mb(sizeOf(releaseUnpacked)),
  };
  const release = readFuses(releaseExe);
  const dev = fs.existsSync(devExe) ? readFuses(devExe) : { fuses: {}, raw: 'missing' };
  result.fuses = { release: release.fuses, dev: dev.fuses, releaseRaw: release.raw };
  const want = { RunAsNode: false, EnableNodeOptionsEnvironmentVariable: false, EnableNodeCliInspectArguments: false, EnableCookieEncryption: true, EnableEmbeddedAsarIntegrityValidation: true, OnlyLoadAppFromAsar: true };
  for (const [fuse, value] of Object.entries(want)) check(`release fuse ${fuse} is ${value ? 'on' : 'off'}, read back from the packaged application`, release.fuses[fuse] === value, String(release.fuses[fuse]));
  const devDiff = Object.keys(release.fuses).filter((k) => release.fuses[k] !== dev.fuses[k]);
  check('the development package differs from the release package in the inspector fuse only', JSON.stringify(devDiff) === JSON.stringify(['EnableNodeCliInspectArguments']), devDiff);

  const installDir = path.join(process.env.LOCALAPPDATA, 'Programs', 'sa.commshub.desktop');
  const dataDir = path.join(process.env.APPDATA, 'sa.commshub.desktop');
  if (fs.existsSync(installDir) || fs.existsSync(dataDir)) {
    note(`Skipped: install, run and uninstall of the release package, because this laptop already has ${fs.existsSync(installDir) ? installDir : dataDir}. The check never touches an existing installation or profile.`);
    return;
  }
  const folders = JSON.parse(ps("@{ desktop = [Environment]::GetFolderPath('Desktop'); programs = [Environment]::GetFolderPath('Programs') } | ConvertTo-Json"));
  const desktopLink = path.join(folders.desktop, `${PRODUCT_NAME}.lnk`);
  const startLink = path.join(folders.programs, `${PRODUCT_NAME}.lnk`);
  const uninstallEntry = () => ps(`Get-ChildItem HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall | ForEach-Object { Get-ItemProperty $_.PSPath } | Where-Object { $_.DisplayName -eq '${PRODUCT_NAME}' } | Select-Object PSChildName, DisplayName, DisplayVersion, Publisher, InstallLocation | ConvertTo-Json -Compress`);

  // Install, silently, as this user.
  const started = Date.now();
  const installed = spawnSync(installer, ['/S'], { timeout: 300000 });
  await until(() => fs.existsSync(path.join(installDir, 'CommsHub.exe')), 60000);
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  check('the installer runs as this user, without administrator rights, and installs', installed.status === 0 && fs.existsSync(path.join(installDir, 'CommsHub.exe')), { exit: installed.status, installDir, seconds });
  const launched = ps(`Get-Process CommsHub -ErrorAction SilentlyContinue | Where-Object { $_.Path -like '${installDir}*' } | Select-Object -ExpandProperty Id`);
  if (launched) {
    note('The silent installer started the application; the check closed it before going on.');
    for (const pid of launched.split(/\s+/)) spawnSync('taskkill', ['/PID', pid, '/T', '/F']);
    await sleep(1500);
  }
  result.install = { installDir, seconds: Number(seconds), installedBytes: sizeOf(installDir), installedSize: mb(sizeOf(installDir)), files: countFiles(installDir) };
  const entry = uninstallEntry();
  check('Start menu and desktop shortcuts carry the Arabic name', fs.existsSync(startLink) && fs.existsSync(desktopLink), { startLink, desktopLink });
  check('Windows lists it under «مركز الاتصال المؤسسي», version 0.1.0, for this user', entry.includes(`"DisplayName":"${PRODUCT_NAME}"`) && entry.includes(`"DisplayVersion":"${pkg.version}"`), entry);
  const installedExe = path.join(installDir, 'CommsHub.exe');

  // The closed fuses and the refused switches hold at run time.
  const debugPort = await freePort();
  let run = startRelease(installedExe, { args: [`--remote-debugging-port=${debugPort}`] });
  let answered = false;
  await until(async () => {
    if (await portAnswers(debugPort)) answered = true;
    return run.exited;
  }, 10000, 100);
  check('a release build refuses to start with remote debugging, and the port never opens', run.exited && run.code === 2 && !answered && run.out.includes('refused to start with --remote-debugging-port'), { exited: run.exited, code: run.code, answered, out: run.out.trim() });
  await stopRelease(run);
  run = startRelease(installedExe, { args: ['--ignore-certificate-errors'] });
  await until(() => run.exited, 10000);
  check('every build refuses to start with --ignore-certificate-errors', run.exited && run.code === 2, { code: run.code, out: run.out.trim() });
  await stopRelease(run);
  const inspectPort = await freePort();
  run = startRelease(installedExe, { args: [`--inspect=127.0.0.1:${inspectPort}`] });
  await sleep(6000);
  const inspectOpen = await portAnswers(inspectPort);
  check('the Node.js inspector cannot be opened (EnableNodeCliInspectArguments off)', !inspectOpen && !run.out.includes('Debugger listening'), { port: inspectOpen, running: !run.exited });
  await stopRelease(run);
  const marker = path.join(scratch, 'ran-as-node.txt');
  run = startRelease(installedExe, { args: ['-e', `require('fs').writeFileSync(${JSON.stringify(marker)}, 'ran')`], env: { ELECTRON_RUN_AS_NODE: '1' } });
  await sleep(6000);
  check('ELECTRON_RUN_AS_NODE does not turn it into Node.js (RunAsNode off)', !fs.existsSync(marker), { marker: fs.existsSync(marker), startedAsApplication: !run.exited });
  await stopRelease(run);
  const marker2 = path.join(scratch, 'node-options.txt');
  const evil = path.join(scratch, 'node-options.cjs');
  fs.writeFileSync(evil, `require('fs').writeFileSync(${JSON.stringify(marker2)}, 'ran')`);
  run = startRelease(installedExe, { env: { NODE_OPTIONS: `--require ${evil}` } });
  await sleep(6000);
  check('NODE_OPTIONS cannot load code into it (EnableNodeOptionsEnvironmentVariable off)', !fs.existsSync(marker2), { marker: fs.existsSync(marker2), startedAsApplication: !run.exited });
  await stopRelease(run);

  // It opens the production address in its own profile, named by the fixed id.
  run = startRelease(installedExe);
  const title = await until(async () => {
    const t = titleOf(run.pid);
    return t && t !== '' ? t : null;
  }, 20000, 1000);
  await sleep(8000);
  const finalTitle = titleOf(run.pid);
  await stopRelease(run);
  const partition = path.join(dataDir, 'Partitions', 'comms-hub');
  const fromProduction = filesMention(partition, 'comms-hub-three.vercel.app');
  check('the release application opens the production address: the site\'s title, and its profile holds the production site', finalTitle === PRODUCT_NAME && fromProduction, { firstTitle: title, title: finalTitle, partition, fromProduction });
  check('its data folder is %APPDATA%\\sa.commshub.desktop, with the persist:comms-hub profile', fs.existsSync(partition), partition);

  // Uninstall, silently: the program, the shortcuts, the entry and the data are gone (D-11).
  const uninstaller = fs.readdirSync(installDir).find((n) => /^Uninstall .*\.exe$/i.test(n));
  spawnSync(path.join(installDir, uninstaller), ['/S'], { timeout: 120000 });
  const gone = await until(() => !fs.existsSync(path.join(installDir, 'CommsHub.exe')) && !fs.existsSync(dataDir), 90000, 500);
  await sleep(1500);
  const left = { program: fs.existsSync(path.join(installDir, 'CommsHub.exe')), installDir: fs.existsSync(installDir), data: fs.existsSync(dataDir), startLink: fs.existsSync(startLink), desktopLink: fs.existsSync(desktopLink), entry: uninstallEntry() };
  check('uninstalling removes the program, both shortcuts and the Windows entry', gone && !left.program && !left.startLink && !left.desktopLink && left.entry === '', left);
  check('uninstalling removes the application\'s data, the session included (D-11)', !left.data, left);
}

(async () => {
  for (const [name, part] of [['part 1, the development package', partOne], ['part 2, the release package', partTwo]]) {
    try {
      await part();
    } catch (error) {
      check(`${name} ran to its end`, false, String((error && error.stack) || error));
    } finally {
      await closeAll();
    }
  }
  const failed = result.checks.filter((c) => !c.pass);
  result.total = result.checks.length;
  result.passed = result.total - failed.length;
  result.failed = failed.length;
  fs.writeFileSync(path.join(__dirname, 'desktop-shell.json'), `${JSON.stringify(result, null, 2)}\n`);
  console.log(`${result.passed} of ${result.total} passed`);
  for (const n of result.notes) console.log('NOTE', n);
  // The scratch profiles go last; a process still closing may hold one for a moment.
  await until(() => {
    fs.rmSync(scratch, { recursive: true, force: true });
    return !fs.existsSync(scratch);
  }, 20000, 1000);
  if (fs.existsSync(scratch)) console.log(`NOTE the scratch folder ${scratch} could not be removed yet`);
  process.exit(failed.length ? 1 : 0);
})();

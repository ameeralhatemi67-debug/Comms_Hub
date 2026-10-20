// Shared pieces of the desktop application's checks from D2 on (qa/desktop-*.cjs): the result record,
// waiting, local servers, and launching the development package (desktop/dist/dev) under Playwright's
// Electron support with a throwaway profile. `instrument` replaces, inside the main process, the few
// system calls a check must observe without acting on this laptop: native notices are recorded instead
// of shown, dialogs answer as told, and the system's sleep blocker, the taskbar overlay and the tray's
// tooltip are recorded on their way through. No sign-in, no stored session, no secret.
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { dependency } = require('./runtime.cjs');
const { _electron } = dependency('playwright');

const root = path.resolve(__dirname, '..');
const desktop = path.join(root, 'desktop');
const pkg = JSON.parse(fs.readFileSync(path.join(desktop, 'package.json'), 'utf8'));
const devExe = path.join(desktop, 'dist', 'dev', 'win-unpacked', 'CommsHub.exe');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function record(script) {
  const result = { script, run: new Date().toISOString(), version: pkg.version, checks: [], notes: [] };
  const check = (name, pass, detail = '') => {
    const entry = { name, pass: Boolean(pass), detail: typeof detail === 'string' ? detail : JSON.stringify(detail) };
    result.checks.push(entry);
    console.log(`${entry.pass ? 'pass' : 'FAIL'}  ${name}${entry.pass ? '' : ` | ${entry.detail}`}`);
  };
  const finish = (file) => {
    const stray = removeTestShortcuts();
    if (stray.length) result.notes.push(`Removed Start menu shortcuts Electron had written for this worktree's packages: ${stray.join(', ')}.`);
    const failed = result.checks.filter((c) => !c.pass);
    result.total = result.checks.length;
    result.passed = result.total - failed.length;
    result.failed = failed.length;
    fs.writeFileSync(file, JSON.stringify(result, null, 2));
    console.log(`${result.passed} of ${result.total} passed`);
    return failed.length;
  };
  return { result, check, note: (text) => result.notes.push(text), finish };
}

/**
 * Windows shows an application's notices only with a Start menu shortcut, and Electron writes one when a
 * notice is made and none exists. A check's packages are never installed, so any shortcut that points into
 * this worktree's dist/ was written during a check, and is removed when the check ends.
 */
function removeTestShortcuts() {
  const dir = path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs');
  const marker = path.join(desktop, 'dist');
  const removed = [];
  if (!fs.existsSync(dir)) return removed;
  for (const name of fs.readdirSync(dir)) {
    if (!name.toLowerCase().endsWith('.lnk')) continue;
    const file = path.join(dir, name);
    const bytes = fs.readFileSync(file);
    if (bytes.toString('latin1').includes(marker) || bytes.toString('utf16le').includes(marker)) {
      fs.rmSync(file, { force: true });
      removed.push(name);
    }
  }
  return removed;
}

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

const listen = (server, port = 0) =>
  new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server.address().port));
  });
const portAnswers = (port) =>
  new Promise((resolve) => {
    const socket = net.connect(port, '127.0.0.1');
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
    setTimeout(() => {
      socket.destroy();
      resolve(false);
    }, 400);
  });

/** A page server: `routes` maps a path to [type, body] or to a handler (req, res). */
function pages(routes) {
  const seen = [];
  const server = http.createServer((req, res) => {
    const url = req.url.split('?')[0];
    seen.push(req.url);
    const route = routes[url];
    if (typeof route === 'function') return route(req, res);
    if (route) {
      res.writeHead(200, { 'content-type': route[0], 'cache-control': 'no-store' });
      return res.end(route[1]);
    }
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not here');
  });
  return { server, seen };
}

const running = new Set();
async function closeAll() {
  for (const app of running) {
    const pid = app.process().pid;
    await Promise.race([app.close().catch(() => undefined), sleep(10000)]);
    spawnSync('taskkill', ['/PID', String(pid), '/T', '/F']);
    running.delete(app);
  }
}

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'comms-hub-desktop-qa-'));

/** Launches the development package on its own profile folder; `settings` is written there first. */
async function launchDev(name, { args = [], env = {}, settings = null, exe = devExe } = {}) {
  const data = path.join(scratch, name);
  fs.mkdirSync(data, { recursive: true });
  if (settings) fs.writeFileSync(path.join(data, 'settings.json'), JSON.stringify(settings));
  const app = await _electron.launch({ executablePath: exe, args, env: { ...process.env, COMMS_HUB_DEV_DATA: data, ...env }, timeout: 60000 });
  running.add(app);
  app.once('close', () => running.delete(app));
  const win = await app.firstWindow();
  const mainId = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].id);
  const inMain = (fn, arg) => app.evaluate(fn, [mainId, arg]);
  return { app, win, mainId, inMain, data };
}

/** Records, inside the main process, what a check must see of the system without acting on it. */
function instrument(app) {
  return app.evaluate(({ BrowserWindow, Notification, Tray, dialog, powerSaveBlocker, shell }) => {
    const g = globalThis;
    Object.assign(g, { __blockers: [], __notes: [], __overlays: [], __tips: [], __images: 0, __dialogs: [], __answer: 0, __opened: [] });
    const start = powerSaveBlocker.start.bind(powerSaveBlocker);
    const stop = powerSaveBlocker.stop.bind(powerSaveBlocker);
    powerSaveBlocker.start = (type) => {
      const id = start(type);
      g.__blockers.push({ id, type, stopped: false });
      return id;
    };
    powerSaveBlocker.stop = (id) => {
      const b = g.__blockers.find((x) => x.id === id);
      if (b) b.stopped = true;
      return stop(id);
    };
    Notification.prototype.show = function show() {
      g.__notes.push(this);
    };
    const overlay = BrowserWindow.prototype.setOverlayIcon;
    BrowserWindow.prototype.setOverlayIcon = function setOverlayIcon(image, description) {
      g.__overlays.push({ empty: !image || image.isEmpty(), factors: image && !image.isEmpty() ? image.getScaleFactors() : null, bytes: image && !image.isEmpty() ? [image.toBitmap({ scaleFactor: 1 }).length, image.toBitmap({ scaleFactor: 2 }).length] : null, description });
      return overlay.call(this, image, description);
    };
    const tip = Tray.prototype.setToolTip;
    Tray.prototype.setToolTip = function setToolTip(text) {
      g.__tray = this;
      g.__tips.push(text);
      return tip.call(this, text);
    };
    const image = Tray.prototype.setImage;
    Tray.prototype.setImage = function setImage(img) {
      g.__images++;
      return image.call(this, img);
    };
    dialog.showMessageBox = async (...args) => {
      const o = args.length > 1 ? args[1] : args[0];
      g.__dialogs.push({ message: o.message, detail: o.detail, buttons: o.buttons, defaultId: o.defaultId, cancelId: o.cancelId });
      return { response: g.__answer, checkboxChecked: false };
    };
    shell.openExternal = async (url) => {
      g.__opened.push(url);
    };
  });
}

// --- the application with nothing attached ---------------------------------------------------------
// Playwright's attachment keeps every page visible and unthrottled, even minimised or hidden (measured
// on 2026-10-20: a minimised window still said "visible" and kept its timers). What a minimised window
// really does is therefore measured on a plainly started application: the page takes commands from the
// fixture server by long polling and reports back, and Windows' own ShowWindow minimises the window.

const ps = (command) => spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { encoding: 'utf8', timeout: 60000 }).stdout.trim();

/** A command line the page reads (GET /cmd, held until there is one) and the reports it sends back (/say). */
function commandChannel() {
  const queue = [];
  const waiting = [];
  const said = [];
  const listeners = [];
  const routes = {
    '/cmd': (req, res) => {
      const send = (cmd) => {
        res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
        res.end(cmd);
      };
      if (queue.length) return send(queue.shift());
      waiting.push(send);
      // A page that went away (its application closed) must not take the next command with it.
      res.on('close', () => {
        const at = waiting.indexOf(send);
        if (at >= 0 && !res.writableEnded) waiting.splice(at, 1);
      });
    },
    '/say': (req, res) => {
      const text = decodeURIComponent(req.url.split('?')[1] || '');
      said.push({ at: Date.now(), text });
      for (const l of listeners.slice()) l();
      res.writeHead(204);
      res.end();
    },
  };
  const send = (cmd) => (waiting.length ? waiting.shift()(cmd) : queue.push(cmd));
  /**
   * Waits for a report matching `test`, said after `since`. One listener and one timer per wait, both
   * removed when it ends (an earlier version re-armed both on every look and grew without bound).
   */
  const heard = (test, ms = 15000, since = 0) =>
    new Promise((resolve) => {
      const end = Date.now() + ms;
      let timer = null;
      const look = () => {
        const hit = said.find((s) => s.at >= since && test(s.text));
        if (!hit && Date.now() <= end) return;
        clearInterval(timer);
        const at = listeners.indexOf(look);
        if (at >= 0) listeners.splice(at, 1);
        resolve(hit ?? null);
      };
      listeners.push(look);
      timer = setInterval(look, 250);
      look();
    });
  return { routes, send, heard, said };
}

/** The page side of commandChannel: runs commands from `handlers` and says what each returned. */
const commandLoop = (handlers) => `
  <script>
    const say = (text) => fetch('/say?' + encodeURIComponent(text));
    const handlers = ${handlers};
    (async function loop() {
      for (;;) {
        let cmd;
        try { cmd = await (await fetch('/cmd', { cache: 'no-store' })).text(); } catch { await new Promise((r) => setTimeout(r, 500)); continue; }
        const [name, arg] = cmd.split(':');
        try { say(name + '=' + JSON.stringify(await handlers[name](arg))); } catch (e) { say(name + '!' + (e && e.message)); }
      }
    })();
    window.__say = say;
    say('ready=' + JSON.stringify(document.visibilityState));
  </script>`;

/** Starts the development package with nothing attached. */
function launchPlain(name, { env = {}, settings = null } = {}) {
  const data = path.join(scratch, name);
  fs.mkdirSync(data, { recursive: true });
  if (settings) fs.writeFileSync(path.join(data, 'settings.json'), JSON.stringify(settings));
  const { spawn } = require('node:child_process');
  const child = spawn(devExe, [], { env: { ...process.env, COMMS_HUB_DEV_DATA: data, ...env }, stdio: 'ignore' });
  const show = (mode) =>
    ps(
      `Add-Type -Name W -Namespace U -MemberDefinition '[DllImport("user32.dll")] public static extern bool ShowWindow(System.IntPtr h, int c);'; ` +
        `$h = (Get-Process -Id ${child.pid}).MainWindowHandle; if ($h -eq 0) { 'none' } else { [U.W]::ShowWindow($h, ${mode}) | Out-Null; 'ok' }`,
    );
  return {
    child,
    data,
    minimise: () => show(6),
    restore: () => show(9),
    close: () => {
      spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F']);
    },
  };
}

/** What was recorded so far, as plain data. */
const recorded = (app) =>
  app.evaluate(() => {
    const g = globalThis;
    return {
      blockers: g.__blockers.slice(),
      notes: g.__notes.map((n) => ({ title: n.title, body: n.body })),
      overlays: g.__overlays.slice(),
      tips: g.__tips.slice(),
      images: g.__images,
      dialogs: g.__dialogs.slice(),
      opened: g.__opened.slice(),
    };
  });

module.exports = { removeTestShortcuts, root, desktop, pkg, devExe, sleep, record, until, listen, portAnswers, pages, launchDev, instrument, recorded, closeAll, scratch, running, ps, commandChannel, commandLoop, launchPlain };

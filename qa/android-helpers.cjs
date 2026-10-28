// Shared pieces of the Android application's checks (qa/android-*.cjs, Android_Build_Plan.md): the result
// record, waiting, and the site's own production build served on 127.0.0.1:3000 for a check to open. The
// emulator's pieces are added by the phases that need them. Nothing here signs in, stores a session or holds
// a secret; the checks open signed-out pages only.
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function record(script) {
  const result = { script, run: new Date().toISOString(), checks: [], notes: [] };
  const check = (name, pass, detail = '') => {
    const entry = { name, pass: Boolean(pass), detail: typeof detail === 'string' ? detail : JSON.stringify(detail) };
    result.checks.push(entry);
    console.log(`${entry.pass ? 'pass' : 'FAIL'}  ${name}${entry.pass ? '' : ` | ${entry.detail}`}`);
  };
  const finish = (file) => {
    const failed = result.checks.filter((c) => !c.pass);
    result.total = result.checks.length;
    result.passed = result.total - failed.length;
    result.failed = failed.length;
    // How often the emulator's System UI stopped responding and was answered with «Wait» (screenNodes).
    if (module.exports.systemUiWaits) result.systemUiWaits = module.exports.systemUiWaits;
    fs.writeFileSync(file, JSON.stringify(result, null, 2) + '\n');
    console.log(`${result.passed} of ${result.total} passed`);
    return failed.length;
  };
  return { result, check, note: (text) => result.notes.push(text), finish };
}

async function until(fn, ms = 10000, step = 150) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      const last = await fn();
      if (last) return last;
    } catch {
      // not yet
    }
    await sleep(step);
  }
  return null;
}

const portAnswers = (port) =>
  new Promise((resolve) => {
    const socket = net.connect(port, '127.0.0.1');
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
  });

/**
 * `next start` of the build in .next on 127.0.0.1:3000, with the checkout's own environment file, so the
 * sign-in page is the real one. Returns the function that stops it.
 */
async function startSite() {
  if (!fs.existsSync(path.join(root, '.next', 'BUILD_ID'))) throw new Error('npm run build first');
  if (await portAnswers(3000)) throw new Error('something already answers on 127.0.0.1:3000');
  const server = spawn(process.execPath, [path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next'), 'start', '-p', '3000', '-H', '127.0.0.1'], {
    cwd: root,
    env: { ...process.env, NODE_ENV: 'production' },
    stdio: 'ignore',
  });
  if (!(await until(() => portAnswers(3000), 60000, 500))) {
    server.kill();
    throw new Error('next start did not answer');
  }
  return async () => {
    server.kill();
    await until(async () => !(await portAnswers(3000)), 10000, 200);
  };
}

// --- the emulator (A2 on) -----------------------------------------------------------------------------
// The checks run on an emulator started read-only (`emulator -avd Pixel_9_Pro -read-only -no-snapshot`), so
// nothing they install or change is kept, and only the check package sa.commshub.app.qa is installed.

const { spawnSync } = require('node:child_process');
const SDK = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || '';
const adbPath = path.join(SDK, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb');
const APP = 'sa.commshub.app.qa';
const ACTIVITY = `${APP}/sa.commshub.app.MainActivity`;
const apkOf = (kind, channel = 'direct') => {
  const dir = path.join(root, 'mobile', 'android', 'app', 'build', 'outputs', 'apk', channel, kind);
  const file = fs.existsSync(dir) ? fs.readdirSync(dir).find((f) => f.endsWith('.apk')) : null;
  return file ? path.join(dir, file) : null;
};

/** adb with its output as text; throws when adb fails. */
function adb(args, { allowFail = false } = {}) {
  const r = spawnSync(adbPath, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (!allowFail && r.status !== 0) throw new Error(`adb ${args.join(' ')}: ${(r.stderr || r.stdout || '').trim()}`);
  return (r.stdout || '').trim();
}
const shell = (cmd, opts) => adb(['shell', cmd], opts);

async function emulatorReady(ms = 240000) {
  return until(() => adb(['devices'], { allowFail: true }).split('\n').some((l) => /^emulator-\d+\s+device$/.test(l.trim())) && shell('getprop sys.boot_completed', { allowFail: true }) === '1', ms, 2000);
}

/** The package and activity in front, as Android reports it. */
function resumed() {
  const out = shell('dumpsys activity activities', { allowFail: true });
  const m = /(?:topResumedActivity|mResumedActivity|ResumedActivity)[^\n]*?\{[^}]*?\s([\w.]+)\/([\w.$]+)/.exec(out);
  return m ? `${m[1]}/${m[2]}` : null;
}

/**
 * The nodes of the screen as UI Automator reads them: text, description and centre. The software-drawn emulator's
 * System UI sometimes stops responding for a while, and Android then covers the screen with «System UI isn't
 * responding»; the dialog is answered with «Wait» and the screen read again (counted in `systemUiWaits`).
 */
function screenNodes() {
  const nodes = readNodes();
  const wait = nodes.find((n) => n.pkg === 'android' && /^(Wait|انتظار)$/.test(n.text));
  if (!wait || !nodes.some((n) => n.pkg === 'android' && /responding|لا يستجيب/i.test(n.text))) return nodes;
  module.exports.systemUiWaits++;
  shell(`input tap ${wait.x} ${wait.y}`, { allowFail: true });
  shell('sleep 2', { allowFail: true });
  return readNodes();
}

function readNodes() {
  shell('uiautomator dump /sdcard/qa-ui.xml', { allowFail: true });
  const xml = shell('cat /sdcard/qa-ui.xml', { allowFail: true });
  shell('rm -f /sdcard/qa-ui.xml', { allowFail: true });
  return [...xml.matchAll(/<node [^>]*?text="([^"]*)"[^>]*?resource-id="([^"]*)"[^>]*?class="([^"]*)"[^>]*?package="([^"]*)"[^>]*?content-desc="([^"]*)"[^>]*?bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/g)].map((m) => ({
    text: m[1],
    id: m[2],
    cls: m[3],
    pkg: m[4],
    desc: m[5],
    bounds: [Number(m[6]), Number(m[7]), Number(m[8]), Number(m[9])],
    x: Math.round((Number(m[6]) + Number(m[8])) / 2),
    y: Math.round((Number(m[7]) + Number(m[9])) / 2),
  }));
}

/**
 * The application's web view on the screen, read until it is there: while the emulator's System UI is not answering,
 * UI Automator's dump may come back without it, and screenNodes answers that dialog with «Wait» first.
 */
async function webViewNode(ms = 30000) {
  return until(() => screenNodes().find((n) => n.cls === 'android.webkit.WebView'), ms, 1000);
}

function tap(x, y) {
  shell(`input tap ${x} ${y}`);
}

function screenshot(file) {
  const r = spawnSync(adbPath, ['exec-out', 'screencap', '-p'], { maxBuffer: 64 * 1024 * 1024 });
  if (r.status === 0 && r.stdout && r.stdout.length) fs.writeFileSync(file, r.stdout);
}

/** One file of an APK, read with the system's own zip reader. */
function apkEntry(apk, entry) {
  const tar = process.platform === 'win32' ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe') : 'unzip';
  const args = process.platform === 'win32' ? ['-xOf', apk, entry] : ['-p', apk, entry];
  const r = spawnSync(tar, args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  return r.status === 0 ? r.stdout : null;
}

module.exports = { root, sleep, record, until, portAnswers, startSite, adb, shell, adbPath, APP, ACTIVITY, apkOf, emulatorReady, resumed, screenNodes, webViewNode, tap, screenshot, apkEntry, systemUiWaits: 0 };

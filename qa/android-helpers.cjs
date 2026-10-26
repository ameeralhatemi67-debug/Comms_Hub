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

module.exports = { root, sleep, record, until, portAnswers, startSite };

// The compiled application (scripts/build.mjs): what a release build carries, and what it must not.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildApp } from '../scripts/build.mjs';

const out = fs.mkdtempSync(path.join(os.tmpdir(), 'comms-hub-desktop-build-'));
const release = path.join(out, 'release');
const dev = path.join(out, 'dev');
await buildApp('release', release);
await buildApp('dev', dev);
const read = (dir, name) => fs.readFileSync(path.join(dir, name), 'utf8');
const { version } = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
test.after(() => fs.rmSync(out, { recursive: true, force: true }));

test('a release build has no way to the local site, no test variables and no developer tools', () => {
  for (const name of ['main.js', 'preload.js']) {
    const code = read(release, name);
    for (const banned of ['127.0.0.1', 'COMMS_HUB_START', 'COMMS_HUB_DEV_DATA', 'toggleDevTools', 'openDevTools']) {
      assert.equal(code.includes(banned), false, `${name} holds ${banned}`);
    }
    assert.ok(code.includes('https://comms-hub-three.vercel.app'), name);
  }
  assert.match(read(release, 'main.js'), /DEV = !1/);
  assert.ok(read(dev, 'main.js').includes('127.0.0.1') && read(dev, 'preload.js').includes('127.0.0.1'), 'the development build does open the local site');
});

test('the bridge carries the four fields of D1 and nothing more', () => {
  const preload = read(release, 'preload.js');
  const exposed = /exposeInMainWorld\("commsHubNative", Object\.freeze\(\{([^}]*)\}\)\)/.exec(preload);
  assert.ok(exposed, 'the bridge is exposed in one place');
  assert.deepEqual(exposed[1].split(',').map((field) => field.split(':')[0].trim()), ['platform', 'shell', 'version', 'bridge']);
  assert.match(exposed[1], /platform: "desktop", shell: "electron", version: VERSION, bridge: 1/);
  assert.ok(preload.includes(`VERSION = "${version}"`));
  assert.match(preload, /window\.top === window && isAllowed\(window\.location\.href, ALLOWED\)/, 'top-level page on the list only');
  assert.equal(/ipcRenderer|require\("(?!electron")/.test(preload), false, 'no message channel and no other module in D1');
});

test('the window is isolated and sandboxed, on its own persistent profile, and certificates are never overridden', () => {
  const main = read(release, 'main.js');
  assert.match(main, /PARTITION = "persist:comms-hub"/);
  for (const setting of ['contextIsolation: !0', 'sandbox: !0', 'nodeIntegration: !1', 'nodeIntegrationInSubFrames: !1', 'nodeIntegrationInWorker: !1', 'webviewTag: !1', 'devTools: DEV']) {
    assert.ok(main.includes(setting), setting);
  }
  assert.equal(main.includes('setCertificateVerifyProc'), false);
  assert.equal(/["']certificate-error["']/.test(main), false, 'no certificate-error handler');
  assert.ok(main.includes('"ignore-certificate-errors"'), 'the switch that would ignore them is refused');
  assert.ok(main.includes('setApplicationMenu(null)'));
  assert.ok(main.includes('requestSingleInstanceLock'));
});

test('the pages are copied beside the code with the brand mark filled in', () => {
  for (const page of ['offline.html', 'connect-note.html']) {
    const html = read(release, page);
    assert.equal(html.includes('<!-- logo -->'), false);
    if (page === 'offline.html') assert.match(html, /<svg[^>]*viewBox="0 0 512 512"/);
  }
});

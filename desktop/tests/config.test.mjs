// The packaging (electron-builder.release.cjs, electron-builder.dev.cjs) and the pins (package.json).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { APP_ID, PRODUCT_NAME, productNameFor } from '../src/identity.ts';
import { PRODUCTION_FEED } from '../src/update.ts';

const require = createRequire(import.meta.url);
const release = require('../electron-builder.release.cjs');
const dev = require('../electron-builder.dev.cjs');
const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

test('the release package is the fixed id under the Arabic name, Windows x64 only, unsigned, publishing nothing itself', () => {
  assert.equal(release.appId, APP_ID);
  assert.equal(release.productName, PRODUCT_NAME);
  assert.deepEqual(release.win.target, [{ target: 'nsis', arch: ['x64'] }]);
  assert.equal(release.win.executableName, 'CommsHub');
  assert.equal(release.win.requestedExecutionLevel, 'asInvoker');
  assert.ok(fs.existsSync(release.win.icon), 'the icon is public/brand/comms-hub-logo-512.png');
  assert.match(release.win.icon.replace(/\\/g, '/'), /public\/brand\/comms-hub-logo-512\.png$/);
  // The feed names where releases go (D3); nothing is uploaded from here (--publish never).
  assert.deepEqual(release.publish, [{ provider: 'generic', url: PRODUCTION_FEED }]);
  assert.match(pkg.scripts.pack, /--publish never$/);
  assert.match(pkg.scripts['pack:dev'], /--publish never$/);
  assert.equal(release.mac, undefined);
  assert.equal(release.linux, undefined);
  assert.deepEqual(release.files, ['build/**/*', 'package.json']);
  assert.equal(release.asar, true);
});

test('the pinned LGPL FFmpeg goes beside the application with its licence, fetched and checked before every package', async () => {
  assert.deepEqual(release.extraResources, [
    { from: 'vendor/ffmpeg', to: 'ffmpeg', filter: ['ffmpeg.exe', 'ffprobe.exe', '*.dll', 'LICENSE.txt', 'PINNED.json'] },
    { from: 'build/THIRD_PARTY_LICENSES.txt', to: 'THIRD_PARTY_LICENSES.txt' },
  ]);
  assert.match(pkg.scripts.pack, /^npm run ffmpeg && /);
  assert.match(pkg.scripts['pack:dev'], /^npm run ffmpeg && /);
  assert.equal(pkg.scripts.ffmpeg, 'node scripts/fetch-ffmpeg.mjs');
  const lock = JSON.parse(fs.readFileSync(new URL('../ffmpeg.lock.json', import.meta.url), 'utf8'));
  assert.match(lock.file, /^ffmpeg-n[\d.]+-\d+-g[0-9a-f]+-win64-lgpl-shared-[\d.]+\.zip$/, 'the LGPL shared build, never the GPL one');
  assert.equal(lock.url, `https://github.com/BtbN/FFmpeg-Builds/releases/download/${lock.release}/${lock.file}`);
  assert.match(lock.sha256, /^[0-9a-f]{64}$/);
  assert.ok(Number.isSafeInteger(lock.size) && lock.size > 1e6);
  assert.match(lock.tag, /^[a-z0-9]{1,16}$/);
  // what the archive holds and what the application ships: the two programs, their libraries, the licence
  const { SHIPPED } = await import('../scripts/fetch-ffmpeg.mjs');
  for (const name of ['ffmpeg.exe', 'ffprobe.exe', 'avcodec-63.dll', 'LICENSE.txt']) assert.match(name, SHIPPED, name);
  for (const name of ['ffplay.exe', 'avcodec.lib', 'README.txt', '../x.dll', 'doc']) assert.equal(SHIPPED.test(name), false, name);
  const gitignore = fs.readFileSync(new URL('../.gitignore', import.meta.url), 'utf8');
  assert.match(gitignore, /^vendor\/$/m, 'never committed');
});

test('the six fuses are flipped as the plan says', () => {
  assert.deepEqual(release.electronFuses, {
    runAsNode: false,
    enableCookieEncryption: true,
    enableNodeOptionsEnvironmentVariable: false,
    enableNodeCliInspectArguments: false,
    enableEmbeddedAsarIntegrityValidation: true,
    onlyLoadAppFromAsar: true,
  });
});

test('the installer is per user, Arabic, with both shortcuts, and removes the data on uninstall', () => {
  const nsis = release.nsis;
  assert.equal(nsis.oneClick, true);
  assert.equal(nsis.perMachine, false, 'no administrator rights');
  assert.equal(nsis.createDesktopShortcut, true);
  assert.equal(nsis.createStartMenuShortcut, true);
  assert.equal(nsis.shortcutName, PRODUCT_NAME);
  assert.equal(nsis.uninstallDisplayName, PRODUCT_NAME);
  assert.equal(nsis.language, '1025', 'Arabic (Saudi Arabia)');
  assert.deepEqual(nsis.installerLanguages, ['ar_SA']);
  assert.equal(nsis.deleteAppDataOnUninstall, true, 'D-11');
  // The uninstaller removes %APPDATA%\<package name>; the profile is %APPDATA%\<id>. They must agree.
  assert.equal(pkg.name, APP_ID);
});

test('the development package differs only in its folder, its unpacked form, its name and the inspector fuse', () => {
  assert.equal(dev.directories.output, 'dist/dev');
  assert.deepEqual(dev.win.target, [{ target: 'dir', arch: ['x64'] }]);
  assert.deepEqual(dev.electronFuses, { ...release.electronFuses, enableNodeCliInspectArguments: true });
  const same = (key) => assert.deepEqual(dev[key], release[key], key);
  for (const key of ['appId', 'files', 'asar', 'nsis', 'publish']) same(key);
  assert.equal(dev.productName, productNameFor(true), 'the name the development build gives itself');
});

test('every tool is pinned exactly and the application ships no dependency', () => {
  assert.equal(pkg.version, '0.5.0');
  assert.equal(pkg.dependencies, undefined, 'esbuild bundles everything into build/');
  assert.equal(pkg.devDependencies.electron, '44.5.1');
  for (const [name, version] of Object.entries(pkg.devDependencies)) {
    assert.match(version, /^\d+\.\d+\.\d+$/, `${name} ${version}`);
  }
  const lock = JSON.parse(fs.readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'));
  assert.equal(lock.packages['node_modules/electron'].version, '44.5.1');
});

test('the update check\'s package: its own id, name, data folder, version and feed, and nothing else changed', () => {
  assert.throws(() => require('../electron-builder.qa.cjs'), /COMMS_HUB_QA_VERSION/, 'not built without a version and a local feed');
  process.env.COMMS_HUB_QA_VERSION = '9.9.9';
  process.env.COMMS_HUB_QA_FEED = 'http://127.0.0.1:4555/feed';
  try {
    delete require.cache[require.resolve('../electron-builder.qa.cjs')];
    const qa = require('../electron-builder.qa.cjs');
    assert.equal(qa.appId, `${APP_ID}.qa`);
    assert.deepEqual(qa.extraMetadata, { name: `${APP_ID}.qa`, version: '9.9.9' });
    assert.equal(qa.productName, productNameFor(false, true), 'the name it gives itself when it runs');
    assert.equal(qa.nsis.createDesktopShortcut, false);
    assert.deepEqual(qa.publish, [{ provider: 'generic', url: 'http://127.0.0.1:4555/feed' }]);
    for (const key of ['electronFuses', 'files', 'asar', 'win']) assert.deepEqual(qa[key], release[key], key);
    assert.equal(qa.nsis.deleteAppDataOnUninstall, true);
  } finally {
    delete process.env.COMMS_HUB_QA_VERSION;
    delete process.env.COMMS_HUB_QA_FEED;
  }
});

test('the uninstaller also removes the installer\'s own copy and the updater\'s folder, never during an update', () => {
  assert.match(release.nsis.include.split(path.sep).join('/'), /resources\/installer\.nsh$/);
  const nsh = fs.readFileSync(release.nsis.include, 'utf8');
  assert.match(nsh, /!macro customUnInstall/);
  assert.ok(nsh.includes('${ifNot} ${isUpdated}\n    RMDir /r "$LOCALAPPDATA\\${COMMS_HUB_UPDATER_DIR}"'), 'removed only outside an update');
  assert.ok(nsh.includes('!searchreplace COMMS_HUB_UPDATER_DIR "${APP_INSTALLER_STORE_FILE}" "\\installer.exe" ""'), 'the folder the installer copies itself to');
});

// The packaging (electron-builder.release.cjs, electron-builder.dev.cjs) and the pins (package.json).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { APP_ID, PRODUCT_NAME } from '../src/identity.ts';

const require = createRequire(import.meta.url);
const release = require('../electron-builder.release.cjs');
const dev = require('../electron-builder.dev.cjs');
const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

test('the release package is the fixed id under the Arabic name, Windows x64 only, unsigned and unpublished', () => {
  assert.equal(release.appId, APP_ID);
  assert.equal(release.productName, PRODUCT_NAME);
  assert.deepEqual(release.win.target, [{ target: 'nsis', arch: ['x64'] }]);
  assert.equal(release.win.executableName, 'CommsHub');
  assert.equal(release.win.requestedExecutionLevel, 'asInvoker');
  assert.ok(fs.existsSync(release.win.icon), 'the icon is public/brand/comms-hub-logo-512.png');
  assert.match(release.win.icon.replace(/\\/g, '/'), /public\/brand\/comms-hub-logo-512\.png$/);
  assert.equal(release.publish, null);
  assert.equal(release.mac, undefined);
  assert.equal(release.linux, undefined);
  assert.deepEqual(release.files, ['build/**/*', 'package.json']);
  assert.equal(release.asar, true);
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

test('the development package differs only in its folder, its unpacked form and the inspector fuse', () => {
  assert.equal(dev.directories.output, 'dist/dev');
  assert.deepEqual(dev.win.target, [{ target: 'dir', arch: ['x64'] }]);
  assert.deepEqual(dev.electronFuses, { ...release.electronFuses, enableNodeCliInspectArguments: true });
  const same = (key) => assert.deepEqual(dev[key], release[key], key);
  for (const key of ['appId', 'productName', 'files', 'asar', 'nsis', 'publish']) same(key);
});

test('every tool is pinned exactly and the application ships no dependency', () => {
  assert.equal(pkg.version, '0.2.0');
  assert.equal(pkg.dependencies, undefined, 'esbuild bundles everything into build/');
  assert.equal(pkg.devDependencies.electron, '44.5.1');
  for (const [name, version] of Object.entries(pkg.devDependencies)) {
    assert.match(version, /^\d+\.\d+\.\d+$/, `${name} ${version}`);
  }
  const lock = JSON.parse(fs.readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'));
  assert.equal(lock.packages['node_modules/electron'].version, '44.5.1');
});

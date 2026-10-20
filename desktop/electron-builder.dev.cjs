// The development package: the same application built with `npm run build:dev` (the local site on
// the address list, developer tools on F12), unpacked only, never installed or handed out. It differs
// from the release package in one fuse: the Node.js inspector stays on, because Playwright's Electron
// support attaches through it (qa/desktop-shell.cjs drives this package). Its profile is its own
// folder, apart from the release one.
// Usage: npm run pack:dev   (writes dist/dev/)
const release = require('./electron-builder.release.cjs');

/** @type {import('electron-builder').Configuration} */
module.exports = {
  ...release,
  directories: { ...release.directories, output: 'dist/dev' },
  electronFuses: { ...release.electronFuses, enableNodeCliInspectArguments: true },
  win: { ...release.win, target: [{ target: 'dir', arch: ['x64'] }] },
};

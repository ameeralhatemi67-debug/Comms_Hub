// The update check's package (qa/desktop-update.cjs, Desktop_App_Plan.md phase D3), never handed out. It is
// the release package built from `buildApp('qa')`: the same code, fuses and installer, but under its own
// id, name and data folder, so that installing, updating and removing it never touches a real
// installation, and with the version and the update feed on this laptop that the check gives it.
// Usage (by the check only): COMMS_HUB_QA_VERSION=x.y.z COMMS_HUB_QA_FEED=http://127.0.0.1:<port>/feed
//   electron-builder --config electron-builder.qa.cjs --win --x64 --publish never
const release = require('./electron-builder.release.cjs');

const version = process.env.COMMS_HUB_QA_VERSION;
const feed = process.env.COMMS_HUB_QA_FEED;
if (!/^\d+\.\d+\.\d+$/.test(version || '') || !/^http:\/\/127\.0\.0\.1:\d+\//.test(feed || '')) {
  throw new Error('the update check package needs COMMS_HUB_QA_VERSION and a COMMS_HUB_QA_FEED on this laptop');
}
// The same name the package gives itself when it runs (src/identity.ts productNameFor).
const NAME = 'مركز الاتصال المؤسسي، فحص التحديث';

/** @type {import('electron-builder').Configuration} */
module.exports = {
  ...release,
  appId: 'sa.commshub.desktop.qa',
  productName: NAME,
  extraMetadata: { name: 'sa.commshub.desktop.qa', version },
  directories: { ...release.directories, output: `dist/qa/${version}` },
  nsis: { ...release.nsis, createDesktopShortcut: false, shortcutName: NAME, uninstallDisplayName: NAME, artifactName: 'CommsHub-QA-Setup-${version}-x64.${ext}' },
  publish: [{ provider: 'generic', url: feed }],
};

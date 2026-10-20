// The release package (Desktop_App_Plan.md 7.1 and 11.1): Windows x64 only, an NSIS installer per
// user with no administrator rights, Arabic, Start menu and desktop shortcuts, unsigned for the pilot
// (D-7). The application's data is removed on uninstall (D-11), but never on an update. Fuses are
// flipped here, at packaging, and read back by qa/desktop-shell.cjs. The generic feed (D3, decision D-6)
// makes electron-builder write latest.yml and the blockmap beside the installer, the files a release
// uploads to the bucket; nothing is published from here (--publish never). The application reads the
// same feed from its compiled copy (src/update.ts).
// Usage: npm run pack   (writes dist/release/)
const path = require('node:path');

/** The same address as PRODUCTION_FEED in src/update.ts (tests/config.test.mjs holds them equal). */
const FEED = 'https://hrghmioxvgkjpnydrxrk.supabase.co/storage/v1/object/public/desktop-releases/windows-x64';

/** @type {import('electron-builder').Configuration} */
module.exports = {
  appId: 'sa.commshub.desktop',
  productName: 'مركز الاتصال المؤسسي',
  copyright: 'مركز الاتصال المؤسسي',
  directories: { output: 'dist/release', buildResources: 'resources' },
  files: ['build/**/*', 'package.json'],
  asar: true,
  npmRebuild: false,
  electronLanguages: ['ar', 'en-US'],
  electronFuses: {
    runAsNode: false,
    enableCookieEncryption: true,
    enableNodeOptionsEnvironmentVariable: false,
    enableNodeCliInspectArguments: false,
    enableEmbeddedAsarIntegrityValidation: true,
    onlyLoadAppFromAsar: true,
  },
  win: {
    target: [{ target: 'nsis', arch: ['x64'] }],
    icon: path.resolve(__dirname, '..', 'public', 'brand', 'comms-hub-logo-512.png'),
    executableName: 'CommsHub',
    requestedExecutionLevel: 'asInvoker',
  },
  nsis: {
    oneClick: true,
    perMachine: false,
    deleteAppDataOnUninstall: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: 'مركز الاتصال المؤسسي',
    uninstallDisplayName: 'مركز الاتصال المؤسسي',
    language: '1025',
    installerLanguages: ['ar_SA'],
    multiLanguageInstaller: false,
    artifactName: 'CommsHub-Setup-${version}-x64.${ext}',
    // removes the updater's folder on uninstall, never on an update (resources/installer.nsh)
    include: path.join(__dirname, 'resources', 'installer.nsh'),
  },
  publish: [{ provider: 'generic', url: FEED }],
};

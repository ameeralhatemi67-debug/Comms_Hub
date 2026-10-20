// The release package (Desktop_App_Plan.md 7.1 and 11.1): Windows x64 only, an NSIS installer per
// user with no administrator rights, Arabic, Start menu and desktop shortcuts, unsigned for the pilot
// (D-7). The application's data is removed on uninstall (D-11), but never on an update. Fuses are
// flipped here, at packaging, and read back by qa/desktop-shell.cjs.
// Usage: npm run pack   (writes dist/release/)
const path = require('node:path');

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
  },
  publish: null,
};

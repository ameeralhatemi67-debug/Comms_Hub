// Runs one of the studio's browser checks inside the desktop application instead of Edge, unchanged
// (DT-05 of Desktop_App_Plan.md section 12). Loaded before the check with `node -r`, it replaces
// Playwright's chromium.launch with the development package (desktop/dist/dev) and its first window, so
// the check's own pages, fixtures and expectations run in the application's Chromium. The application's
// system calls are recorded, never acted on (qa/desktop-helpers.cjs), so no page can open this laptop's
// browser. The check's JSON result is written to DESKTOP_PARITY_OUT, never over the studio's own record.
// With DESKTOP_PARITY_SHELL=edge the check runs in Edge as usual and only its result is redirected, so the
// reference run of the same moment sits beside the application's.
// Usage: DESKTOP_PARITY_OUT=<folder> [DESKTOP_PARITY_SHELL=edge] node -r ./qa/desktop-parity-hook.cjs qa/studio-export.cjs
const fs = require('node:fs');
const path = require('node:path');
const { dependency } = require('./runtime.cjs');
const h = require('./desktop-helpers.cjs');

const out = process.env.DESKTOP_PARITY_OUT;
if (!out) throw new Error('DESKTOP_PARITY_OUT names the folder for the application\'s results');
fs.mkdirSync(out, { recursive: true });

const playwright = dependency('playwright');
if (process.env.DESKTOP_PARITY_SHELL !== 'edge') playwright.chromium.launch = async () => {
  const { app, win } = await h.launchDev(`parity-${process.pid}`);
  await h.instrument(app);
  // The application opens its own address first; nothing answers there, so it shows its connection
  // screen. That load must be over before the check navigates, or it interrupts the check's own.
  await h.until(() => win.url().startsWith('file:') || win.url().startsWith('http'), 20000);
  await win.waitForLoadState('load');
  const versions = await app.evaluate(() => ({ electron: process.versions.electron, chrome: process.versions.chrome }));
  fs.writeFileSync(path.join(out, `engine-${path.basename(process.argv[1], '.cjs')}.json`), JSON.stringify(versions));
  return {
    newPage: async () => win,
    newContext: async () => ({ newPage: async () => win, close: async () => undefined }),
    close: () => h.closeAll(),
  };
};

const write = fs.writeFileSync;
fs.writeFileSync = function writeFileSync(file, ...rest) {
  if (typeof file === 'string' && /[\\/]qa[\\/]studio-[\w-]+\.json$/.test(file)) file = path.join(out, path.basename(file));
  return write.call(this, file, ...rest);
};

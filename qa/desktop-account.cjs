// Browser and application check of «تطبيق سطح المكتب» on «الحساب» and the banner for an old application
// (Desktop_App_Plan.md phase D3; MVP_draft.md 63.2). The real component (src/components/native/desktop-app.tsx)
// on a fixture page, signed out: the account page itself needs a signed-in person, which no check has.
//   In Edge, as a browser: with a release in the feed, the download, its size and what SmartScreen asks; with
//   none, «لم يُنشر إصدار للتنزيل بعد.»; with an old application's bridge put on the page, the banner and the
//   panel's warning.
//   Inside the development package: the version running and its own update state, with no banner. A
//   development build never updates itself, so its state is the idle line; the updater itself is proven by
//   qa/desktop-update.cjs on the update check's own installed package.
// The feed (the public bucket's latest.yml) is answered by the check through Playwright's routing in Edge.
// Usage: node qa/desktop-account.cjs   (writes qa/desktop-account.json)   Needs: npm run pack:dev in desktop/.
const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');
const { dependency, launchOptions } = require('./runtime.cjs');
const { chromium } = dependency('playwright');
const h = require('./desktop-helpers.cjs');

const { check, note, result, finish } = h.record('qa/desktop-account.cjs');
const out = path.join(__dirname, 'artifacts', 'desktop-account');
const FEED = 'https://hrghmioxvgkjpnydrxrk.supabase.co/storage/v1/object/public/desktop-releases/windows-x64';
const latest = `version: 0.3.0
files:
  - url: CommsHub-Setup-0.3.0-x64.exe
    sha512: abc==
    size: 111527803
path: CommsHub-Setup-0.3.0-x64.exe
sha512: abc==
releaseDate: '2026-10-21T08:00:00.000Z'
`;
const page = (before = '') => `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>الحساب</title></head><body>${before}<div id="root"></div><script type="module" src="/account.js"></script></body></html>`;
const text = (tab) => tab.evaluate(() => document.body.innerText);
// A picture is kept as evidence, not checked: a window behind others may take long to paint, so it is tried
// twice and a miss is noted instead of failing the check.
async function picture(tab, file) {
  for (let i = 0; i < 2; i++) {
    try {
      await tab.screenshot({ path: path.join(out, file), timeout: 15000 });
      return;
    } catch {
      await h.sleep(1000);
    }
  }
  note(`No picture of ${file}: the window did not paint in time.`);
}

(async () => {
  let site;
  try {
    fs.rmSync(out, { recursive: true, force: true });
    fs.mkdirSync(out, { recursive: true });
    await esbuild.build({
      entryPoints: [path.join(__dirname, 'fixtures', 'desktop-account.tsx')],
      bundle: true,
      format: 'esm',
      platform: 'browser',
      target: 'es2022',
      jsx: 'automatic',
      outfile: path.join(out, 'account.js'),
      alias: { 'next/navigation': path.join(__dirname, 'fixtures', 'fake-next.tsx'), 'next/link': path.join(__dirname, 'fixtures', 'fake-next.tsx') },
      define: { 'process.env.NODE_ENV': '"production"' },
      logLevel: 'silent',
      absWorkingDir: h.root,
    });
    const old = `<script>window.commsHubNative = Object.freeze({ platform: 'desktop', shell: 'electron', version: '0.1.0', bridge: 1 });</script>`;
    site = h.pages({ '/': ['text/html; charset=utf-8', page()], '/old': ['text/html; charset=utf-8', page(old)], '/account.js': ['text/javascript; charset=utf-8', fs.readFileSync(path.join(out, 'account.js'), 'utf8')] });
    if (await h.portAnswers(3000)) throw new Error('something already answers on 127.0.0.1:3000');
    await h.listen(site.server, 3000);

    // Edge, as a browser.
    const browser = await chromium.launch(launchOptions);
    try {
      const ctx = await browser.newContext();
      let release = true;
      await ctx.route(`${FEED}/latest.yml`, (route) => (release ? route.fulfill({ status: 200, contentType: 'text/yaml', body: latest }) : route.fulfill({ status: 400, body: '{"error":"Bucket not found"}' })));
      const tab = await ctx.newPage();
      await tab.goto('http://127.0.0.1:3000/');
      await h.until(() => tab.evaluate(() => !!document.querySelector('#panel a, #panel p.muted')), 10000);
      await h.until(async () => (await text(tab)).includes('تنزيل التطبيق'), 10000);
      const t1 = await text(tab);
      const href = await tab.evaluate(() => document.querySelector('#panel a')?.getAttribute('href'));
      check('in a browser, with a release in the feed: «تنزيل التطبيق» to the installer in the bucket', href === `${FEED}/CommsHub-Setup-0.3.0-x64.exe`, href);
      check('the version, its size and what SmartScreen asks are said', t1.includes('0.3.0') && t1.includes('112 م.ب') && t1.includes('«مزيد من المعلومات» ثم «تشغيل على أي حال»'), t1);
      check('no banner in a browser', !t1.includes('أقدم مما يحتاجه المركز'), t1);
      await picture(tab, 'browser.png');
      release = false;
      await tab.reload();
      const none = await h.until(async () => (await text(tab)).includes('لم يُنشر إصدار للتنزيل بعد.'), 10000);
      check('with no release (the bucket not there yet): «لم يُنشر إصدار للتنزيل بعد.», and no link', !!none && !(await tab.evaluate(() => !!document.querySelector('#panel a'))), await text(tab));
      await tab.goto('http://127.0.0.1:3000/old');
      const oldText = await h.until(async () => {
        const t = await text(tab);
        return t.includes('أقدم مما يحتاجه المركز الآن') ? t : null;
      }, 10000);
      check('an application older than the site needs (0.1.0, the D1 bridge) gets the banner and the panel\'s warning', !!oldText && oldText.includes('حدّثه من «الحساب»') && oldText.includes('الإصدار 0.1.0') && oldText.includes('هذا الإصدار أقدم مما يحتاجه المركز الآن'), oldText);
      await picture(tab, 'old-app.png');
    } finally {
      await browser.close();
    }

    // Inside the application.
    const { win } = await h.launchDev('account');
    await h.until(() => win.url() === 'http://127.0.0.1:3000/', 20000);
    await win.waitForLoadState('load');
    const appText = await h.until(async () => {
      const t = await text(win);
      return t.includes(`الإصدار ${h.pkg.version}`) && t.includes('يبحث التطبيق عن تحديث عند بدئه وكل أربع ساعات.') ? t : null;
    }, 20000);
    check(`inside the application: «تعمل الآن في تطبيق سطح المكتب، الإصدار ${h.pkg.version}» and its update state (a development build: idle)`, !!appText, appText || (await text(win)));
    await h.sleep(12000);
    const later = await text(win);
    check('a development build never asks the feed: still idle after the first ten seconds, and no restart offered', later.includes('يبحث التطبيق عن تحديث عند بدئه') && !(await win.evaluate(() => [...document.querySelectorAll('button')].some((b) => b.textContent.includes('إعادة التشغيل للتحديث')))), later);
    check('no banner inside a current application', !(await text(win)).includes('أقدم مما يحتاجه المركز'), await text(win));
    await picture(win, 'app.png');
  } catch (e) {
    check('the check ran to its end', false, String((e && e.stack) || e));
  } finally {
    await h.closeAll();
    site?.server.close();
  }
  const failed = finish(path.join(__dirname, 'desktop-account.json'));
  process.exit(failed ? 1 : 0);
})();

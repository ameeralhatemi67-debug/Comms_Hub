// The check of phase A3 of the Android application (Android_Build_Plan.md; MVP_draft.md 64.1): the update
// window and the application's own updates, on the emulator, with the check package sa.commshub.app.qa.
// It builds the check package at 0.1.0 and at 0.1.1, and a copy of 0.1.1 signed with a throwaway key made
// for the run, and serves latest.json and the APKs at http://127.0.0.1:3002/android (the check package's
// compiled feed, through adb reverse). The site's production build is at http://127.0.0.1:3000. Signed-out
// pages only; nothing signs in. In order:
//   1. a newer release is offered on the sign-in screen with its notes; «لاحقاً» puts it off;
//   2. «تحديث الآن» before Android allows the application to install sends the person to Android's setting;
//   3. a file whose SHA-256 is not the one latest.json states is refused, and nothing is installed;
//   4. an APK signed with another key is refused, and nothing is installed;
//   5. a release whose floor is above the installed version cannot be put off: no «لاحقاً», the back key
//      does not close it;
//   6. «تحديث الآن» downloads, checks and hands the APK to Android, which asks the person; after it, 0.1.1 is
//      installed, the site's cookie is kept, and «ما الجديد في الإصدار 0.1.1» is said once.
// Usage: npm run build; start the emulator read-only; then node qa/android-update.cjs (writes
// qa/android-update.json). It needs COMMSHUB_JAVA_HOME as mobile/README.md says.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { dependency } = require('./runtime.cjs');
const { _android } = dependency('playwright');
const h = require('./android-helpers.cjs');

const { check, result, note, finish } = h.record('qa/android-update.cjs');
const SITE = 'http://127.0.0.1:3000';
const out = path.join(__dirname, 'artifacts', 'android-update');
const shot = (name) => h.screenshot(path.join(out, `${name}.png`));
const ours = () => (h.resumed() || '').startsWith(`${h.APP}/`);
const NOTES = ['نسخة الفحص 0.1.1.', 'سطر ثانٍ من «ما الجديد».'];
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

function buildAt(version) {
  const r = spawnSync(process.execPath, [path.join(h.root, 'mobile', 'scripts', 'build.mjs'), 'qa'], { cwd: path.join(h.root, 'mobile'), env: { ...process.env, COMMSHUB_CHECK_VERSION: version }, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`build ${version}: ${(r.stdout || '').slice(-800)}${(r.stderr || '').slice(-800)}`);
  const to = path.join(out, `commshub-qa-${version}.apk`);
  fs.copyFileSync(h.apkOf('qa'), to);
  return to;
}

/** A copy of an APK signed with a throwaway key made for this run (never a key of the application). */
function signedElsewhere(apk) {
  const jdk = process.env.COMMSHUB_JAVA_HOME || process.env.JAVA_HOME || '';
  const keytool = path.join(jdk, 'bin', process.platform === 'win32' ? 'keytool.exe' : 'keytool');
  const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
  const tools = fs.readdirSync(path.join(sdk, 'build-tools')).sort().pop();
  const apksigner = path.join(sdk, 'build-tools', tools, process.platform === 'win32' ? 'apksigner.bat' : 'apksigner');
  const ks = path.join(out, 'throwaway.jks');
  const pass = crypto.randomBytes(12).toString('hex');
  fs.rmSync(ks, { force: true });
  const k = spawnSync(keytool, ['-genkeypair', '-keystore', ks, '-alias', 'throwaway', '-keyalg', 'RSA', '-keysize', '2048', '-validity', '1', '-storepass', pass, '-keypass', pass, '-dname', 'CN=throwaway'], { encoding: 'utf8' });
  if (k.status !== 0) throw new Error(`keytool: ${k.stderr || k.stdout}`);
  const to = path.join(out, 'commshub-qa-0.1.1-other-key.apk');
  const s = spawnSync(apksigner, ['sign', '--ks', ks, '--ks-pass', `pass:${pass}`, '--key-pass', `pass:${pass}`, '--out', to, apk], { encoding: 'utf8', shell: process.platform === 'win32', env: { ...process.env, JAVA_HOME: jdk } });
  fs.rmSync(ks, { force: true });
  if (s.status !== 0) throw new Error(`apksigner: ${s.stderr || s.stdout}`);
  return to;
}

async function webPage(device, ms = 60000) {
  const view = await device.webView({ pkg: h.APP }, { timeout: ms });
  return view.page();
}

/**
 * The application started afresh, so it reads the feed again. A forced stop may come before the web view
 * writes its storage to disk, so «لاحقاً» of an earlier step is cleared on the page and the page loaded again.
 */
/** Playwright's handle on the phone, taken again by relaunch when Android stopped Playwright's driver. */
let phone = null;

async function relaunch() {
  for (let attempt = 0; ; attempt++) {
    try {
      h.shell(`am force-stop ${h.APP}`);
      await h.sleep(800);
      h.shell(`am start -W -n ${h.ACTIVITY}`);
      const page = await webPage(phone);
      await page.waitForSelector('.auth-card', { timeout: 60000 });
      await page.evaluate(() => localStorage.removeItem('commshub.apk.later'));
      await page.reload();
      await page.waitForSelector('.auth-card', { timeout: 60000 });
      return page;
    } catch (e) {
      // Playwright's driver and UI Automator's screen dumps share Android's one accessibility connection, and on a
      // busy computer Android may stop the driver ("Target page, context or browser has been closed"; the crash log
      // shows UiAutomation, not the application). The phone is then taken again, once.
      if (attempt > 0 || !/has been closed/.test(String(e && e.message))) throw e;
      note(`Playwright's handle on the phone was lost during a relaunch (${String(e.message).split('\n')[0]}); it was taken again and the step repeated.`);
      [phone] = await _android.devices({ omitDriverInstall: true });
    }
  }
}

async function windowOf(page, ms = 20000) {
  return h.until(
    () =>
      page.evaluate(() => {
        const d = document.querySelector('dialog.apk-window[open]');
        if (!d) return null;
        return { title: d.querySelector('h2')?.textContent ?? '', text: d.innerText, buttons: [...d.querySelectorAll('button')].map((b) => b.textContent.trim()), notes: [...d.querySelectorAll('.apk-notes li')].map((li) => li.textContent) };
      }),
    ms,
    500,
  );
}

async function tapButton(page, label) {
  const rect = await page.evaluate((label) => {
    const b = [...document.querySelectorAll('dialog.apk-window[open] button')].find((x) => x.textContent.trim() === label);
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, ratio: window.devicePixelRatio };
  }, label);
  if (!rect) throw new Error(`no button «${label}»`);
  const web = await h.webViewNode();
  h.tap(Math.round(web.bounds[0] + rect.x * rect.ratio), Math.round(web.bounds[1] + rect.y * rect.ratio));
}

const installed = () => (/versionName=([\d.]+)/.exec(h.shell(`dumpsys package ${h.APP}`, { allowFail: true })) || [])[1] || null;

(async () => {
  let stopSite;
  let feedServer;
  let device;
  let feed = null;
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  try {
    const v010 = buildAt('0.1.0');
    const v011 = buildAt('0.1.1');
    const other = signedElsewhere(v011);
    const good = { version: '0.1.1', code: 101, file: path.basename(v011), size: fs.statSync(v011).size, sha256: sha256(v011), notes: NOTES, date: new Date().toISOString() };
    result.apks = { '0.1.0': fs.statSync(v010).size, '0.1.1': good.size };

    if (!(await h.emulatorReady())) throw new Error('no emulator ready');
    stopSite = await h.startSite();
    feedServer = http.createServer((req, res) => {
      const name = decodeURIComponent((req.url || '').split('?')[0].replace(/^\/android\//, ''));
      if (name === 'latest.json' && feed) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(feed));
      }
      const file = path.join(out, path.basename(name));
      if (name.endsWith('.apk') && fs.existsSync(file)) {
        res.writeHead(200, { 'Content-Type': 'application/vnd.android.package-archive', 'Content-Length': fs.statSync(file).size });
        return fs.createReadStream(file).pipe(res);
      }
      res.writeHead(404);
      res.end();
    });
    await new Promise((r) => feedServer.listen(3002, '127.0.0.1', r));
    h.adb(['reverse', 'tcp:3000', 'tcp:3000']);
    h.adb(['reverse', 'tcp:3002', 'tcp:3002']);

    h.adb(['uninstall', h.APP], { allowFail: true });
    h.adb(['install', '-r', v010]);
    check('the check package 0.1.0 is installed', installed() === '0.1.0', installed());
    [device] = await _android.devices({ omitDriverInstall: true });
    phone = device;

    // 1. offered, and put off
    feed = good;
    let page = await relaunch();
    let w = await windowOf(page);
    shot('01-offered');
    check('a newer release is offered on the sign-in screen, with its notes, «تحديث الآن» and «لاحقاً»', w?.title === 'يتوفر إصدار جديد من التطبيق' && w.notes.join('|') === NOTES.join('|') && w.buttons.includes('تحديث الآن') && w.buttons.includes('لاحقاً'), w);
    await tapButton(page, 'لاحقاً');
    await h.sleep(800);
    await page.reload();
    await page.waitForSelector('.auth-card', { timeout: 30000 });
    const putOff = await windowOf(page, 6000);
    check('«لاحقاً» puts it off: not shown again on the next page', !putOff, putOff);
    await page.evaluate(() => localStorage.removeItem('commshub.apk.later'));

    // 2. Android's permission first
    page = await relaunch();
    await windowOf(page);
    await tapButton(page, 'تحديث الآن');
    const settings = await h.until(() => /settings/i.test(h.resumed() || '') && h.resumed(), 15000, 400);
    shot('02-permission');
    check('before Android allows it, «تحديث الآن» opens Android\'s own setting for this application', !!settings, h.resumed());
    h.shell('input keyevent 4');
    await h.until(() => ours(), 10000, 300);
    h.shell(`appops set ${h.APP} REQUEST_INSTALL_PACKAGES allow`);

    // 3. a file that is not the one stated
    feed = { ...good, sha256: 'f'.repeat(64) };
    page = await relaunch();
    await windowOf(page);
    await tapButton(page, 'تحديث الآن');
    const mismatch = await h.until(() => page.evaluate(() => document.querySelector('dialog.apk-window[open]')?.innerText.includes('لا يطابق الإصدار المعلن')), 30000, 500);
    shot('03-mismatch');
    check('a file whose SHA-256 is not the one stated is refused, and nothing is installed', !!mismatch && installed() === '0.1.0', { mismatch, installed: installed() });

    // 4. another key
    feed = { ...good, file: path.basename(other), size: fs.statSync(other).size, sha256: sha256(other) };
    page = await relaunch();
    await windowOf(page);
    await tapButton(page, 'تحديث الآن');
    const signature = await h.until(() => page.evaluate(() => document.querySelector('dialog.apk-window[open]')?.innerText.includes('ليس موقّعاً بمفتاحه')), 30000, 500);
    shot('04-other-key');
    check('an APK signed with another key is refused, and nothing is installed', !!signature && installed() === '0.1.0', { signature, installed: installed() });

    // 5. required
    feed = { ...good, minimum: '0.1.1' };
    page = await relaunch();
    await page.evaluate(() => {
      document.cookie = 'qa_a3=kept; max-age=3600; path=/';
    });
    w = await windowOf(page);
    h.shell('input keyevent 4');
    await h.sleep(1000);
    const still = await windowOf(page, 3000);
    shot('05-required');
    check('a release whose floor is above this version cannot be put off: no «لاحقاً», the back key does not close it', w?.title === 'يجب تحديث التطبيق' && !w.buttons.includes('لاحقاً') && !!still && ours(), { w, still: !!still });

    // 6. installed
    await tapButton(page, 'تحديث الآن');
    let confirm = null;
    for (let i = 0; i < 60 && !confirm; i++) {
      await h.sleep(1000);
      const nodes = h.screenNodes();
      confirm = nodes.find((n) => /^(Update|Install|تحديث|تثبيت)$/i.test(n.text) && !n.pkg.startsWith(h.APP));
    }
    shot('06-android-asks');
    check('Android asks the person to confirm the update, in its own dialog', !!confirm, confirm && { text: confirm.text, pkg: confirm.pkg });
    if (confirm) h.tap(confirm.x, confirm.y);
    // Google Play Protect asks about an application it has not seen ("App scan recommended", with «Scan app»
    // and «Don't install app»). «Scan app» would send the APK to Google; the check sends nothing, and takes
    // «More details» then «Install without scanning». What Android shows is recorded.
    const seen = [];
    let protect = false;
    let now = null;
    for (let i = 0; i < 90 && !now; i++) {
      await h.sleep(1000);
      if (installed() === '0.1.1') {
        now = true;
        break;
      }
      const nodes = h.screenNodes().filter((n) => !n.pkg.startsWith(h.APP) && n.text);
      const texts = nodes.map((n) => `${n.pkg}: ${n.text}`);
      if (texts.length && texts.join('|') !== (seen[seen.length - 1] || []).join('|')) seen.push(texts);
      if (nodes.some((n) => /Play Protect/i.test(n.text))) protect = true;
      // «Install without scanning» is a link at the end of a paragraph: its own line is tapped.
      const link = nodes.find((n) => /Install without scanning$/i.test(n.text) && n.text.trim() !== 'Install without scanning');
      const go = nodes.find((n) => /^(Install without scanning|Install anyway|Update anyway)$/i.test(n.text)) || (link ? null : nodes.find((n) => /^More details$/i.test(n.text)));
      if (link) {
        shot(`06-protect-${seen.length}`);
        h.tap(link.x, link.bounds[3] - 28);
        await h.sleep(1500);
      } else if (go) {
        shot(`06-protect-${seen.length}`);
        h.tap(go.x, go.y);
        await h.sleep(1500);
      }
    }
    result.afterConfirm = seen.slice(0, 12);
    if (protect) note('Google Play Protect asked to scan the application before the update ("App scan recommended"); the check took «More details» and «Install without scanning», sending nothing to Google. A pilot phone will see the same until Google knows the application.');
    check('after it, 0.1.1 is installed', !!now, { installed: installed(), seen: seen.slice(-3) });
    h.shell(`am start -W -n ${h.ACTIVITY}`);
    try {
      page = await webPage(phone);
      await page.waitForSelector('.auth-card', { timeout: 60000 });
    } catch (e) {
      // The update restarted the application; on a busy computer Android may stop Playwright's driver too (as in
      // relaunch). The phone is taken again, once, without restarting the application, so its cookie is still read.
      if (!/has been closed/.test(String(e && e.message))) throw e;
      note(`Playwright's handle on the phone was lost after the update (${String(e.message).split('\n')[0]}); it was taken again.`);
      [phone] = await _android.devices({ omitDriverInstall: true });
      page = await webPage(phone);
      await page.waitForSelector('.auth-card', { timeout: 60000 });
    }
    const kept = await page.evaluate(() => document.cookie);
    check('the site\'s cookie is kept through the update', kept.includes('qa_a3=kept'), kept);
    const id = await page.evaluate(() => window.commsHubNative?.version);
    w = await windowOf(page);
    shot('07-whats-new');
    check('«ما الجديد في الإصدار 0.1.1» is said, with the notes, and the page sees the new version', id === '0.1.1' && w?.title === 'ما الجديد في الإصدار 0.1.1' && w.notes.join('|') === NOTES.join('|'), { id, w });
    await tapButton(page, 'حسناً');
    await h.sleep(800);
    await page.reload();
    await page.waitForSelector('.auth-card', { timeout: 30000 });
    check('it is said once', !(await windowOf(page, 5000)));
  } catch (e) {
    check('the check ran to its end', false, String(e && e.stack ? e.stack : e));
  } finally {
    try {
      h.adb(['reverse', '--remove', 'tcp:3000'], { allowFail: true });
      h.adb(['reverse', '--remove', 'tcp:3002'], { allowFail: true });
      h.adb(['uninstall', h.APP], { allowFail: true });
      note(`After the check: ${h.shell(`pm list packages ${h.APP}`, { allowFail: true }) || 'the check package is uninstalled'}.`);
    } catch {
      // the emulator may be gone
    }
    if (phone && phone !== device) await phone.close().catch(() => undefined);
    if (device) await device.close().catch(() => undefined);
    if (feedServer) feedServer.close();
    if (stopSite) await stopSite();
    for (const f of fs.existsSync(out) ? fs.readdirSync(out) : []) if (f.endsWith('.apk') || f.endsWith('.jks') || f.endsWith('.idsig')) fs.rmSync(path.join(out, f), { force: true });
  }
  process.exitCode = finish(path.join(__dirname, 'android-update.json')) ? 1 : 0;
})();

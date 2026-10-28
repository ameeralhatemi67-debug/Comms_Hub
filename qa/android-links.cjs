// The check of phase A6 of the Android application (Android_Build_Plan.md; MVP_draft.md 64.4): links of the site that
// open the application, and the application lock, on the emulator, with the check package sa.commshub.app.qa. Nothing
// signs in. Two parts, the lock first:
//   Links, with the site's own production build on 127.0.0.1:3000:
//     1. the site serves /.well-known/assetlinks.json as JSON, where it is, with no redirect;
//     2. before Android lets the application open the site's links, links.verified says no; once the person allows
//        it in Android's settings (as `pm set-app-links-user-selection` does here), yes;
//     3. a page of the site, a member's WhatsApp link and the sign-in return open in the application, on the address
//        the build opens (the check package opens the local site), with their query;
//     4. a page for outside people and the site's root open in the browser;
//     5. an intent naming a link that climbs out of a page, or another site, opens nothing.
//   The lock, with the real component (src/components/native/phone-lock.tsx) on a fixture page and a screen PIN set
//   on the emulator for the run (the check package locks after five seconds away, a release after five minutes):
//     6. offered once after the notices question, «تشغيل القفل» asks Android first;
//     7. away long enough, the page is covered by «المركز مقفل» and Android asks; the PIN opens it;
//     8. put off, the cover stays with «فتح القفل», which asks again;
//     9. a short absence does not lock; a cold start does;
//    10. «إيقاف القفل» on «الحساب» asks Android, and then nothing locks.
// Usage: npm run build; start the emulator read-only; build the check package (mobile: npm run build:qa); then
// node qa/android-links.cjs (writes qa/android-links.json).
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const esbuild = require('esbuild');
const { dependency } = require('./runtime.cjs');
const { _android } = dependency('playwright');
const h = require('./android-helpers.cjs');

const { check, result, note, finish } = h.record('qa/android-links.cjs');
const SITE = 'http://127.0.0.1:3000';
const PRODUCTION = 'https://comms-hub-three.vercel.app';
const PIN = '4826';
const out = path.join(__dirname, 'artifacts', 'android-links');
const shot = (name) => h.screenshot(path.join(out, `${name}.png`));
const ours = () => (h.resumed() || '').startsWith(`${h.APP}/`);
const browser = () => /chrome|browser/i.test(h.resumed() || '');

/** A new connection to the phone, after closing the old one: Playwright does not open a second one beside it. */
async function retake() {
  if (phone) await phone.close().catch(() => undefined);
  const [d] = await _android.devices({ omitDriverInstall: true });
  return d;
}

async function webPage(device, ms = 60000) {
  const view = await device.webView({ pkg: h.APP }, { timeout: ms });
  return view.page();
}

/** Playwright's handle on the phone, taken again when Android stopped its driver (see qa/android-update.cjs). */
let phone = null;
async function front(ms = 30000) {
  await h.until(() => ours(), 15000, 300);
  try {
    return await webPage(phone, ms);
  } catch (e) {
    if (!/has been closed|Timeout/.test(String(e && e.message))) throw e;
    note(`Playwright's handle on the phone was taken again (${String(e.message).split('\n')[0]}).`);
    phone = await retake();
    return webPage(phone, ms);
  }
}

/** A link opened the way another application or a mail would open it; Android chooses who opens it. */
function openLink(url) {
  h.shell(`am start -W -a android.intent.action.VIEW -c android.intent.category.BROWSABLE -d '${url}'`, { allowFail: true });
}

/**
 * Runs in the application's page, with a handle taken afresh each time: a held handle can go stale across a
 * navigation that follows a redirect, and Playwright's driver may be stopped by Android. Tried three times.
 */
async function inPage(fn, arg) {
  for (let i = 0; ; i++) {
    try {
      const page = await front();
      return await page.evaluate(fn, arg);
    } catch (e) {
      if (i >= 2 || !/has been closed|Timeout|Execution context was destroyed/.test(String(e && e.message))) throw e;
      await h.sleep(1500);
      phone = await retake();
    }
  }
}
const here = async () => {
  const u = new URL(await inPage(() => location.href));
  return `${u.origin}${u.pathname}${u.search}`;
};
const waitFor = (selector, ms) => h.until(() => inPage((s) => !!document.querySelector(s), selector).catch(() => false), ms, 500);

async function tapOn(selector) {
  await h.sleep(300);
  const rect = await inPage((s) => {
    const el = document.querySelector(s);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, ratio: window.devicePixelRatio };
  }, selector);
  if (!rect) throw new Error(`nothing at ${selector}`);
  const web = await h.webViewNode();
  if (!web) throw new Error('no web view on the screen');
  h.tap(Math.round(web.bounds[0] + rect.x * rect.ratio), Math.round(web.bounds[1] + rect.y * rect.ratio));
}

/**
 * The screen's nodes, after answering «Wait» when the software-drawn emulator shows that System UI is not
 * responding (it draws Android's own question; the first run of this check hung on it).
 */
function nodes() {
  const all = h.screenNodes();
  const wait = all.find((n) => n.pkg === 'android' && /^(Wait|انتظار)$/.test(n.text));
  if (!wait) return all;
  note('Android said System UI was not responding; the check answered «Wait».');
  h.tap(wait.x, wait.y);
  return h.screenNodes();
}
const onScreen = (text) => nodes().find((n) => n.text === text || n.desc === text);
/** Android's own question (the system's window, titled as the application asked); the PIN answers it. */
const asking = () => nodes().some((n) => n.pkg === 'com.android.systemui' && /فتح مركز الاتصال المؤسسي|تشغيل قفل التطبيق|إيقاف قفل التطبيق/.test(n.text));
async function answerPin() {
  const up = await h.until(() => asking(), 15000, 600);
  if (!up) return false;
  await h.sleep(800);
  h.shell(`input text ${PIN}`);
  h.shell('input keyevent 66');
  return !!(await h.until(() => !asking(), 10000, 600));
}

const lockPage = () =>
  '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>القفل</title>' +
  '<style>body{font-family:sans-serif;margin:0}button{min-height:44px;padding:8px 14px;font-size:15px}dialog{width:min(420px,calc(100% - 30px))}.actions{display:flex;gap:8px;flex-wrap:wrap}svg{width:18px;height:18px}</style>' +
  '</head><body><div id="root"></div><script type="module" src="/lock.js"></script></body></html>';

(async () => {
  let stopSite;
  let fixture;
  let device;
  let pinSet = false;
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  try {
    const qaApk = h.apkOf('qa');
    if (!qaApk) throw new Error('build the check package first (mobile: npm run build:qa)');
    if (!(await h.emulatorReady())) throw new Error('no emulator ready');
    result.device = { model: h.shell('getprop ro.product.model'), android: h.shell('getprop ro.build.version.release'), sdk: h.shell('getprop ro.build.version.sdk') };

    // --- the lock ---
    await esbuild.build({
      entryPoints: [path.join(__dirname, 'fixtures', 'android-lock.tsx')],
      bundle: true,
      format: 'esm',
      platform: 'browser',
      target: 'es2020',
      jsx: 'automatic',
      outfile: path.join(out, 'lock.js'),
      define: { 'process.env.NODE_ENV': '"production"' },
      logLevel: 'silent',
      absWorkingDir: h.root,
    });
    const bundle = fs.readFileSync(path.join(out, 'lock.js'), 'utf8');
    fixture = http.createServer((req, res) => {
      if (req.url === '/lock.js') {
        res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
        return res.end(bundle);
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(lockPage());
    });
    if (await h.portAnswers(3000)) throw new Error('something already answers on 127.0.0.1:3000');
    await new Promise((r, j) => {
      fixture.once('error', j);
      fixture.listen(3000, '127.0.0.1', r);
    });
    h.adb(['reverse', 'tcp:3000', 'tcp:3000']);
    h.adb(['uninstall', h.APP], { allowFail: true });
    h.adb(['install', '-r', qaApk]);
    // A run cut off earlier may have left its PIN on the emulator.
    h.shell(`locksettings clear --old ${PIN}`, { allowFail: true });
    const pinOut = h.shell(`locksettings set-pin ${PIN}`, { allowFail: true });
    pinSet = /set to/i.test(pinOut) || pinOut === '';
    result.pin = pinOut;
    h.shell(`pm grant ${h.APP} android.permission.POST_NOTIFICATIONS`, { allowFail: true });
    h.shell(`am start -W -n ${h.ACTIVITY}`);
    [device] = await _android.devices({ omitDriverInstall: true });
    if (!device) throw new Error('Playwright sees no device');
    phone = device;
    await front(60000);
    if (!(await waitFor('#where', 60000))) throw new Error('the lock fixture did not load in the application');
    const state = await inPage(() => window.commsHubNative.lock.state());
    check('6a. with a screen PIN on the phone the lock can be used, and it is off', state.available === true && state.on === false, state);
    const offer = await h.until(() => inPage(() => document.querySelector('dialog.phone-lock[open]')?.innerText ?? null), 10000, 400);
    check('6b. once the notices question is settled, the lock is offered: «قفل التطبيق», «تشغيل القفل», «ليس الآن»', !!offer && offer.includes('قفل التطبيق') && offer.includes('تشغيل القفل') && offer.includes('ليس الآن'), offer);
    shot('03-offer');
    await tapOn('dialog.phone-lock [data-lock="offer-on"]');
    const answered = await answerPin();
    await front();
    await h.sleep(1000);
    const after = await inPage(async () => ({ state: await window.commsHubNative.lock.state(), offered: localStorage.getItem('commshub.lock.offered'), open: !!document.querySelector('dialog.phone-lock[open]') }));
    check('6c. «تشغيل القفل» asks Android first; with the PIN the lock is on, and it is not offered again', answered && after.state.on === true && after.offered === '1' && !after.open, after);

    h.shell('input keyevent 3');
    await h.sleep(6500);
    h.shell(`am start -n ${h.ACTIVITY}`);
    const covered = await h.until(() => asking() || onScreen('المركز مقفل'), 15000, 600);
    shot('04-locked');
    check('7a. back after longer than the lock waits, Android asks before the page shows', !!covered);
    const opened = await answerPin();
    await h.sleep(1200);
    check('7b. the PIN opens it, and the page is there again', opened && !onScreen('المركز مقفل') && ours());

    h.shell('input keyevent 3');
    await h.sleep(6500);
    h.shell(`am start -n ${h.ACTIVITY}`);
    await h.until(() => asking(), 15000, 600);
    h.shell('input keyevent 4');
    const stays = await h.until(() => (onScreen('فتح القفل') && onScreen('المركز مقفل') ? true : null), 10000, 600);
    shot('05-put-off');
    check('8a. put off, the page stays covered by «المركز مقفل» with «فتح القفل»', !!stays);
    const button = onScreen('فتح القفل');
    if (button) h.tap(button.x, button.y);
    const again = await answerPin();
    await h.sleep(1200);
    check('8b. «فتح القفل» asks again, and the PIN opens it', again && !onScreen('المركز مقفل'));

    h.shell('input keyevent 3');
    await h.sleep(1000);
    h.shell(`am start -n ${h.ACTIVITY}`);
    await h.sleep(2500);
    check('9a. a short absence does not lock', ours() && !asking() && !onScreen('المركز مقفل'));
    h.shell(`am force-stop ${h.APP}`);
    h.shell(`am start -n ${h.ACTIVITY}`);
    const cold = await h.until(() => asking() || onScreen('المركز مقفل'), 20000, 600);
    const coldOpen = cold ? await answerPin() : false;
    check('9b. opened afresh, the application asks first', !!cold && coldOpen);

    await front(60000);
    await waitFor('[data-lock="off"]', 30000);
    await tapOn('[data-lock="off"]');
    const offAnswered = await answerPin();
    await front();
    await h.sleep(1000);
    const off = await inPage(async () => ({ state: await window.commsHubNative.lock.state(), note: document.querySelector('.phone-lock-panel [role="status"]')?.textContent ?? '' }));
    h.shell('input keyevent 3');
    await h.sleep(6500);
    h.shell(`am start -n ${h.ACTIVITY}`);
    await h.sleep(3000);
    check('10. «إيقاف القفل» asks Android, and then nothing locks', offAnswered && off.state.on === false && off.note.includes('أُوقف') && ours() && !asking() && !onScreen('المركز مقفل'), off);
    fixture.close();
    fixture = null;

    // --- links ---
    stopSite = await h.startSite();
    const file = JSON.parse(fs.readFileSync(path.join(h.root, 'public', '.well-known', 'assetlinks.json'), 'utf8'));
    const served = await fetch(`${SITE}/.well-known/assetlinks.json`, { redirect: 'manual' });
    const body = served.status === 200 ? await served.json().catch(() => null) : null;
    check('1. the site serves /.well-known/assetlinks.json as JSON, where it is, with no redirect', served.status === 200 && /application\/json/.test(served.headers.get('content-type') || '') && JSON.stringify(body) === JSON.stringify(file), { status: served.status, type: served.headers.get('content-type') });
    if (file[0].target.sha256_cert_fingerprints.includes('OWNER_RELEASE_KEY_SHA256')) note('assetlinks.json still names the stand-in OWNER_RELEASE_KEY_SHA256: Android cannot verify the links of a release until the owner puts the release key\'s fingerprint there (a signed release build refuses until then).');

    // A fresh installation, so nothing of the lock part remains.
    h.adb(['uninstall', h.APP], { allowFail: true });
    h.adb(['install', '-r', qaApk]);
    h.adb(['reverse', 'tcp:3000', 'tcp:3000']);
    h.shell(`am start -W -n ${h.ACTIVITY}`);
    phone = await retake();
    device = phone;
    await front(60000);
    await waitFor('.auth-card', 60000);
    const bridge = await inPage(async () => ({ bridge: window.commsHubNative.bridge, verified: await window.commsHubNative.links.verified() }));
    const declared = h.shell(`pm get-app-links ${h.APP}`, { allowFail: true });
    result.appLinks = declared;
    check('2a. bridge version 5 or later; before Android lets the application open the site\'s links, links.verified says no', bridge.bridge >= 5 && bridge.verified === false && declared.includes('comms-hub-three.vercel.app'), { bridge, declared });
    const sel = h.shell(`pm set-app-links-user-selection --user cur --package ${h.APP} true comms-hub-three.vercel.app`, { allowFail: true });
    const verified = await inPage(() => window.commsHubNative.links.verified());
    check('2b. once the person allows it in Android\'s settings, links.verified says yes', verified === true, { sel, verified });

    openLink(`${PRODUCTION}/work/CH-101?tab=texts`);
    await front();
    await h.until(async () => (await here()) === `${SITE}/work/CH-101?tab=texts`, 15000, 400);
    check('3a. a page of the site opens in the application, on the address the build opens, with its query', ours() && (await here()) === `${SITE}/work/CH-101?tab=texts`, await here());
    openLink(`${PRODUCTION}/app/return?qa=a6`);
    await front();
    await h.until(async () => (await here()) === `${SITE}/?qa=a6`, 15000, 400);
    check('3b. the return of a mailed sign-in link opens in the application and forwards to the sign-in page with its query', ours() && (await here()) === `${SITE}/?qa=a6`, await here());
    openLink(`${PRODUCTION}/w/qa-not-a-real-token`);
    await front();
    await h.until(async () => (await here()).startsWith(`${SITE}/w/`), 15000, 400);
    check('3c. a member\'s WhatsApp link opens in the application', ours() && (await here()).startsWith(`${SITE}/w/qa-not-a-real-token`), await here());
    shot('01-link-in-app');
    openLink(`${PRODUCTION}/r/qa-review-token`);
    const toBrowser = await h.until(() => (browser() ? h.resumed() : null), 15000, 500);
    check('4a. a review link for outside people opens in the browser', !!toBrowser, h.resumed());
    shot('02-outside-in-browser');
    h.shell('am force-stop com.android.chrome', { allowFail: true });
    openLink(`${PRODUCTION}/`);
    const rootBrowser = await h.until(() => (browser() ? h.resumed() : null), 15000, 500);
    check('4b. the site\'s root opens in the browser', !!rootBrowser, h.resumed());
    h.shell('am force-stop com.android.chrome', { allowFail: true });
    // A page that stays where it is (the WhatsApp page of a signed-out person moves on to the sign-in page by itself).
    openLink(`${PRODUCTION}/work/CH-202`);
    await front();
    await h.until(async () => (await here()) === `${SITE}/work/CH-202`, 15000, 400);
    await h.sleep(1500);
    const before = await here();
    for (const bad of [`${PRODUCTION}/work/%2e%2e/api/media`, `${PRODUCTION}/work/../api/media`, 'https://evil.example/work/CH-1', `${PRODUCTION}.evil.example/work/CH-1`]) {
      h.shell(`am start -W -n ${h.ACTIVITY} -a android.intent.action.VIEW -d '${bad}'`, { allowFail: true });
    }
    await h.sleep(2500);
    await front();
    check('5. an intent naming a link that climbs out of a page, or another site, opens nothing', ours() && (await here()) === before, { before, after: await here() });

  } catch (e) {
    check('the check ran to its end', false, String(e && e.stack ? e.stack : e));
  } finally {
    try {
      if (pinSet) note(`After the check: ${h.shell(`locksettings clear --old ${PIN}`, { allowFail: true }) || 'the screen PIN is cleared'}.`);
      h.adb(['reverse', '--remove', 'tcp:3000'], { allowFail: true });
      h.adb(['uninstall', h.APP], { allowFail: true });
      note(`After the check: ${h.shell(`pm list packages ${h.APP}`, { allowFail: true }) || 'the check package is uninstalled'}.`);
    } catch {
      // the emulator may be gone
    }
    if (phone && phone !== device) await phone.close().catch(() => undefined);
    if (device) await device.close().catch(() => undefined);
    if (fixture) fixture.close();
    if (stopSite) await stopSite();
  }
  process.exitCode = finish(path.join(__dirname, 'android-links.json')) ? 1 : 0;
})();

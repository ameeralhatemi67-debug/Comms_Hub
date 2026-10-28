// The gate of phase A2 of the Android application (Android_Build_Plan.md; MVP_draft.md 64). The check
// package sa.commshub.app.qa on the emulator (Pixel_9_Pro, Android 16, started read-only), opening the
// site's own production build on this computer at http://127.0.0.1:3000 through `adb reverse`, driven over
// adb and Playwright's Android support. Signed-out pages only; nothing signs in.
//   1. the release APK opens the production address alone; the check APK the local site;
//   2. the page sees window.commsHubNative (platform android, version, bridge 1), frozen, in the top frame
//      only, and not on another address; Capacitor's routes to files on the phone answer 404;
//   3. no Content-Security-Policy violation with the bridge there;
//   4. the file chooser opens Android's picker; the microphone is asked of the person and works; the
//      camera through the page and location are refused;
//   5. another site and the pages for outside people open the browser; an outside connection shows the
//      note first; the back key goes back, then leaves;
//   6. a file of the site is downloaded to Downloads with the same bytes; a file made inside the page is not;
//   7. the window keeps clear of the status bar, the gesture bar and the keyboard;
//   8. when the site cannot be reached the Arabic connection screen shows, and «إعادة المحاولة» comes back
//      (the local site is stopped for it: traffic through adb reverse does not go over the phone's
//      network, so airplane mode would not cut it, and an open connection outlives removing the route);
//      a page of the site that answers with an error is shown as the site wrote it;
//   9. a cookie of the site survives the application being closed and stopped.
// Usage: npm run build; cd mobile && npm run build:qa && npm run pack:release; start the emulator; then
// node qa/android-shell.cjs   (writes qa/android-shell.json)
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { dependency } = require('./runtime.cjs');
const { _android } = dependency('playwright');
const h = require('./android-helpers.cjs');

const { check, result, note, finish } = h.record('qa/android-shell.cjs');
const SITE = 'http://127.0.0.1:3000';
const OTHER = 'http://127.0.0.1:3001';
const reverse = (port) => h.adb(['reverse', `tcp:${port}`, `tcp:${port}`]);
const unreverse = (port) => h.adb(['reverse', '--remove', `tcp:${port}`], { allowFail: true });
const PRODUCTION = 'https://comms-hub-three.vercel.app';
const NOTE = 'يكتمل الربط في المتصفح. سجّل الدخول إلى المركز هناك إن طُلب منك، ثم ارجع إلى التطبيق.';
const out = path.join(__dirname, 'artifacts', 'android-shell');
const shot = (name) => h.screenshot(path.join(out, `${name}.png`));
const ours = () => (h.resumed() || '').startsWith(`${h.APP}/`);

const watch = () => {
  window.__violations = [];
  document.addEventListener('securitypolicyviolation', (e) => window.__violations.push({ directive: e.violatedDirective, blocked: e.blockedURI }));
};

async function webPage(device, ms = 60000) {
  const view = await device.webView({ pkg: h.APP }, { timeout: ms });
  return view.page();
}

async function atGate(page) {
  await page.waitForSelector('.auth-card', { timeout: 60000 });
}

/** A link put into the page and clicked, as a person's tap would. */
async function follow(page, href, extra = '') {
  await page.evaluate(
    ({ href, extra }) => {
      document.getElementById('qa-link')?.remove();
      const a = document.createElement('a');
      a.id = 'qa-link';
      a.href = href;
      if (extra) a.setAttribute('download', extra);
      a.textContent = 'qa';
      a.style.cssText = 'position:fixed;top:40%;left:40%;z-index:99999;padding:20px;background:#ff0;display:block';
      document.body.appendChild(a);
    },
    { href, extra },
  );
  await tapOn(page, '#qa-link');
}

/**
 * A person's tap on an element, through Android's own input at the element's place on the screen. The
 * application may cancel the navigation it starts (it opens the browser or a note instead); what happened
 * is read from Android afterwards.
 */
async function tapOn(page, selector) {
  await h.sleep(300);
  const rect = await page.evaluate((s) => {
    const r = document.querySelector(s).getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, ratio: window.devicePixelRatio };
  }, selector);
  const web = await h.webViewNode();
  if (!web) {
    shot('no-web-view');
    throw new Error(`no web view on the screen; in front: ${h.resumed()}; on the screen: ${h.screenNodes().filter((n) => n.text).map((n) => n.text).slice(0, 12).join(' | ')}`);
  }
  h.tap(Math.round(web.bounds[0] + rect.x * rect.ratio), Math.round(web.bounds[1] + rect.y * rect.ratio));
}

/** The elements a check put into the page, removed. */
async function tidy(page) {
  await page.evaluate(() => ['qa-link', 'qa-blob', 'qa-file'].forEach((id) => document.getElementById(id)?.remove())).catch(() => undefined);
}

/** Back to the application after another one was in front; Playwright's handle on the web view is taken again. */
async function backToApp(device) {
  // The browser's step is already recorded. Chrome's first-run screen (the emulator starts read-only, so Chrome is
  // never set up) can come back over the application a moment after it returned; Chrome is stopped first.
  h.shell('am force-stop com.android.chrome', { allowFail: true });
  h.shell(`am start -W -n ${h.ACTIVITY}`, { allowFail: true });
  await h.until(() => ours(), 15000, 300);
  await h.sleep(800);
  // The web view's handle is taken again; once more if it does not come back at once.
  const page = await webPage(device, 20000).catch(async () => {
    h.shell(`am start -W -n ${h.ACTIVITY}`, { allowFail: true });
    await h.sleep(1500);
    const [again] = await _android.devices({ omitDriverInstall: true });
    return webPage(again);
  });
  await page.waitForLoadState('domcontentloaded').catch(() => undefined);
  return page;
}

(async () => {
  let stopSite;
  let other;
  let device;
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  try {
    // 1. the two builds
    const qaApk = h.apkOf('qa');
    const releaseApk = h.apkOf('release');
    if (!qaApk || !releaseApk) throw new Error('build the check APK and the release APK first (mobile: npm run build:qa, npm run pack:release)');
    const relConfig = JSON.parse(h.apkEntry(releaseApk, 'assets/capacitor.config.json') || '{}');
    const qaConfig = JSON.parse(h.apkEntry(qaApk, 'assets/capacitor.config.json') || '{}');
    check('the release APK opens the production address alone, over https, uninspectable', relConfig.server?.url === PRODUCTION && !relConfig.server?.cleartext && relConfig.android?.webContentsDebuggingEnabled === false, relConfig.server);
    check('the check APK opens the local site through the emulator', qaConfig.server?.url === SITE && qaConfig.android?.webContentsDebuggingEnabled === true, qaConfig.server);
    result.apk = { release: { bytes: fs.statSync(releaseApk).size }, qa: { bytes: fs.statSync(qaApk).size } };

    if (!(await h.emulatorReady())) throw new Error('no emulator ready');
    result.device = { model: h.shell('getprop ro.product.model'), android: h.shell('getprop ro.build.version.release'), sdk: h.shell('getprop ro.build.version.sdk'), webview: h.shell('dumpsys webviewupdate | grep "Current WebView package"', { allowFail: true }) };

    stopSite = await h.startSite();
    other = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<!doctype html><html><body><p id="other">another site</p></body></html>');
    });
    await new Promise((r) => other.listen(3001, '127.0.0.1', r));
    reverse(3000);
    reverse(3001);

    h.adb(['uninstall', h.APP], { allowFail: true });
    h.adb(['install', '-r', qaApk]);
    check('the check package is installed under its own id, apart from a real installation', h.shell(`pm list packages ${h.APP}`).includes(`package:${h.APP}`));
    h.shell(`am start -W -n ${h.ACTIVITY}`);
    [device] = await _android.devices({ omitDriverInstall: true });
    if (!device) throw new Error('Playwright sees no device');
    let page = await webPage(device);
    await atGate(page);
    check('the application opens the site\'s sign-in page', page.url().startsWith(`${SITE}/`), page.url());
    shot('01-sign-in');

    // 2. the bridge
    const id = await page.evaluate(() => {
      const n = window.commsHubNative;
      let replaced = false;
      try {
        window.commsHubNative = { platform: 'web' };
        replaced = window.commsHubNative?.platform === 'web';
      } catch {
        replaced = false;
      }
      return { n: n ? { ...n } : null, frozen: Object.isFrozen(n), replaced, capacitor: typeof window.Capacitor };
    });
    check('the page sees window.commsHubNative: platform android, shell capacitor, the installed version and its bridge', id.n?.platform === 'android' && id.n?.shell === 'capacitor' && /^\d+\.\d+\.\d+$/.test(id.n?.version ?? '') && Number.isInteger(id.n?.bridge) && id.n.bridge >= 1, id);
    check('the bridge is frozen and cannot be replaced by the page', id.frozen && !id.replaced, id);
    const frame = await page.evaluate(
      () =>
        new Promise((resolve) => {
          const f = document.createElement('iframe');
          f.src = '/health';
          f.onload = () => resolve({ native: typeof f.contentWindow.commsHubNative, same: f.contentWindow.location.origin === location.origin });
          document.body.appendChild(f);
          setTimeout(() => resolve({ timeout: true }), 15000);
        }),
    );
    check('a frame of the same address has no bridge', frame.same === true && frame.native === 'undefined', frame);
    const capFile = await page.evaluate(async () => {
      const a = await fetch('/_capacitor_file_/data/data/sa.commshub.app.qa/shared_prefs/').then((r) => r.status, (e) => `x ${e.message}`);
      const b = await fetch('/_capacitor_content_/x').then((r) => r.status, (e) => `x ${e.message}`);
      return { a, b };
    });
    check('Capacitor\'s routes to files on the phone answer 404', capFile.a === 404 && capFile.b === 404, capFile);

    // 3. the page policy
    await page.addInitScript(watch);
    await page.reload();
    await atGate(page);
    await h.sleep(1500);
    const policy = await page.evaluate(() => ({ violations: window.__violations || [], native: !!window.commsHubNative, capacitor: typeof window.Capacitor }));
    check('no Content-Security-Policy violation with the bridge there', policy.violations.length === 0 && policy.native && policy.capacitor === 'object', policy);

    // 2 again: another address
    await page.goto(`${OTHER}/`);
    const away = await page.evaluate(() => ({ native: typeof window.commsHubNative, capacitor: typeof window.Capacitor, text: document.body.innerText }));
    check('another address has neither the bridge nor Capacitor', away.text.includes('another site') && away.native === 'undefined' && away.capacitor === 'undefined', away);
    await page.goto(`${SITE}/`);
    await atGate(page);

    // 8 (second half): the site's own error page
    await page.goto(`${SITE}/w/not-a-token`);
    await h.sleep(1500);
    const notFound = await page.evaluate(() => ({ text: document.body.innerText, url: location.href }));
    check('a page of the site that answers with an error is shown as the site wrote it, not as the connection screen', notFound.text.includes('الرابط غير صالح') && !notFound.url.includes('offline.html'), notFound);
    await page.goto(`${SITE}/`);
    await atGate(page);

    // 4. file chooser, microphone, camera, location
    await page.evaluate(() => {
      const i = document.createElement('input');
      i.type = 'file';
      i.id = 'qa-file';
      i.style.cssText = 'position:fixed;top:30%;left:30%;z-index:99999;width:200px;height:60px';
      document.body.appendChild(i);
    });
    await tapOn(page, '#qa-file');
    const picker = await h.until(() => /documentsui/i.test(h.resumed() || '') && h.resumed(), 15000, 300);
    shot('02-file-chooser');
    check('the file chooser opens Android\'s picker', !!picker, h.resumed());
    h.shell('input keyevent 4');
    await h.until(() => ours(), 10000, 300);
    const mic = page
      .evaluate(() =>
        navigator.mediaDevices
          .getUserMedia({ audio: true })
          .then((s) => {
            const tracks = s.getAudioTracks().length;
            s.getTracks().forEach((t) => t.stop());
            return { ok: true, tracks };
          })
          .catch((e) => ({ ok: false, error: e.name })),
      )
      .catch((e) => ({ ok: false, error: String(e) }));
    let asked = null;
    for (let i = 0; i < 20 && !asked; i++) {
      await h.sleep(500);
      const allow = h.screenNodes().find((n) => /^(While using the app|Only this time|Allow|أثناء استخدام التطبيق|هذه المرة فقط|السماح)$/i.test(n.text));
      if (allow) {
        shot('03-microphone-asked');
        asked = allow.text;
        h.tap(allow.x, allow.y);
      }
    }
    const micResult = await mic;
    check('the microphone is asked of the person by Android, then works', !!asked && micResult.ok && micResult.tracks === 1, { asked, micResult });
    const refused = await page.evaluate(async () => {
      const video = await navigator.mediaDevices.getUserMedia({ video: true }).then(() => 'granted', (e) => e.name);
      const geo = await new Promise((r) => navigator.geolocation.getCurrentPosition(() => r('granted'), (e) => r(`code ${e.code}`), { timeout: 8000 }));
      return { video, geo };
    });
    check('the camera through the page and location are refused', refused.video !== 'granted' && refused.geo !== 'granted', refused);

    // 5. links
    await follow(page, 'https://example.com/');
    const outside = await h.until(() => !ours() && h.resumed(), 15000, 300);
    check('another site opens in the phone\'s browser', !!outside && !outside.startsWith(h.APP), outside);
    page = await backToApp(device);
    await follow(page, `${SITE}/r/qa-review-link`);
    const review = await h.until(() => !ours() && h.resumed(), 15000, 300);
    check('a review link for outside people opens in the browser', !!review, review);
    page = await backToApp(device);
    await follow(page, `${SITE}/api/drive/connect`);
    let dialog = null;
    for (let i = 0; i < 20 && !dialog; i++) {
      await h.sleep(400);
      const nodes = h.screenNodes();
      if (nodes.some((n) => n.text === NOTE)) dialog = nodes;
    }
    shot('04-connect-note');
    check('an outside connection shows the note first, with «متابعة في المتصفح» and «إلغاء»', !!dialog && dialog.some((n) => n.text === 'متابعة في المتصفح') && dialog.some((n) => n.text === 'إلغاء'), dialog ? dialog.filter((n) => n.text).map((n) => n.text) : null);
    if (dialog) {
      const cancel = dialog.find((n) => n.text === 'إلغاء');
      h.tap(cancel.x, cancel.y);
      await h.sleep(800);
      check('«إلغاء» keeps the page where it was', ours() && page.url().startsWith(`${SITE}/`) && !h.screenNodes().some((n) => n.text === NOTE), page.url());
      await follow(page, `${SITE}/api/platforms/connect/meta`);
      await h.until(() => h.screenNodes().some((n) => n.text === NOTE), 8000, 400);
      const go = h.screenNodes().find((n) => n.text === 'متابعة في المتصفح');
      if (go) h.tap(go.x, go.y);
      const connected = await h.until(() => !ours() && h.resumed(), 15000, 300);
      check('«متابعة في المتصفح» opens the connection in the browser', !!connected, connected);
      page = await backToApp(device);
    }
    await page.goto(`${SITE}/`);
    await atGate(page);
    await follow(page, `${SITE}/app/return?qa=back`);
    await page.waitForURL(/qa=back/, { timeout: 20000 });
    h.shell('input keyevent 4');
    await h.until(() => !page.url().includes('qa=back'), 10000, 300);
    check('the back key goes back through the site\'s pages', !page.url().includes('qa=back') && ours(), page.url());
    await page.evaluate(() => {
      const d = document.createElement('dialog');
      d.id = 'qa-dialog';
      d.textContent = 'qa';
      document.body.appendChild(d);
      d.showModal();
    });
    const where = page.url();
    h.shell('input keyevent 4');
    await h.sleep(1000);
    const dialogClosed = await page.evaluate(() => !document.getElementById('qa-dialog').open);
    check('the back key first closes an open window of the page, as Escape does, and the page stays', dialogClosed && ours() && page.url() === where, { dialogClosed, url: page.url() });
    await page.evaluate(() => document.getElementById('qa-dialog')?.remove());

    // 6. downloads
    const brand = fs.readFileSync(path.join(h.root, 'public', 'brand', 'comms-hub-logo-512.png'));
    const want = crypto.createHash('sha256').update(brand).digest('hex');
    const NAME = 'comms-hub-logo-512.png';
    h.shell(`rm -f "/sdcard/Download/${NAME}"`, { allowFail: true });
    await follow(page, '/brand/comms-hub-logo-512.png', 'download');
    const saved = await h.until(() => {
      const sum = h.shell(`sha256sum "/sdcard/Download/${NAME}"`, { allowFail: true });
      return /^[0-9a-f]{64}/.test(sum) ? sum.slice(0, 64) : null;
    }, 30000, 700);
    check('a file of the site is saved to Downloads under the name in its address, with the same bytes', saved === want, { saved, want });
    h.shell(`rm -f "/sdcard/Download/${NAME}"`, { allowFail: true });
    const before = h.shell('ls /sdcard/Download', { allowFail: true });
    await page.evaluate(() => {
      const a = document.createElement('a');
      a.id = 'qa-blob';
      a.href = URL.createObjectURL(new Blob(['made in the page'], { type: 'text/plain' }));
      a.download = 'من-الصفحة.txt';
      a.textContent = 'blob';
      a.style.cssText = 'position:fixed;top:50%;left:40%;z-index:99999;padding:20px;background:#0ff;display:block';
      document.body.appendChild(a);
    });
    await tapOn(page, '#qa-blob');
    await h.sleep(2500);
    check('a file made inside the page is not saved, and the window stays', h.shell('ls /sdcard/Download', { allowFail: true }) === before && ours() && page.url().startsWith(`${SITE}/`));
    note('The Arabic message for a file made inside the page is an Android toast, which UI Automator cannot read; it was not read by this check.');

    // 7. the system bars and the keyboard
    await tidy(page);
    const size = /(\d+)x(\d+)/.exec(h.shell('wm size')).slice(1).map(Number);
    const web = await h.webViewNode();
    check('the window keeps clear of the status bar and the gesture bar', !!web && web.bounds[1] > 0 && web.bounds[3] < size[1], { web: web?.bounds, screen: size });
    shot('05-clear-of-bars');
    // UI Automator keeps reporting the web view's place from before the keyboard, so the page's own
    // height is measured instead.
    // A field pinned to the foot of the page, as the create bar and the message box are: without the
    // window shrinking above the keyboard it would sit under it.
    const open = await page.evaluate(() => {
      const i = document.createElement('input');
      i.id = 'qa-low';
      i.style.cssText = 'position:fixed;bottom:10px;left:20px;width:200px;height:40px;z-index:99999';
      document.body.appendChild(i);
      return window.innerHeight;
    });
    await tapOn(page, '#qa-low');
    const field = await h.until(async () => {
      const f = await page.evaluate(() => ({ bottom: document.getElementById('qa-low').getBoundingClientRect().bottom, inner: window.innerHeight, focused: document.activeElement?.id }));
      return f.inner < open - 100 ? f : null;
      // The software-drawn emulator may take its time to resize the page once the keyboard is up.
    }, 20000, 400);
    const keyboard = /mInputShown=true/.test(h.shell('dumpsys input_method', { allowFail: true }));
    shot('06-keyboard');
    check('with the keyboard open the page shrinks above it, and a field at its foot stays in view', keyboard && !!field && field.bottom <= field.inner && field.focused === 'qa-low', { keyboard, before: open, field });
    await page.evaluate(() => {
      document.activeElement?.blur();
      document.getElementById('qa-low')?.remove();
    });
    await h.sleep(800);

    // 8. the site cannot be reached
    await page.goto(`${SITE}/`);
    await atGate(page);
    // The site is stopped: an open connection through adb reverse would outlive removing the route.
    await stopSite();
    stopSite = null;
    await h.sleep(1000);
    await page.reload().catch(() => undefined);
    await h.until(() => page.url().includes('offline.html'), 30000, 500);
    await h.sleep(800);
    const offline = await page.evaluate(() => document.body.innerText).catch(() => '');
    shot('07-offline');
    check('when the site cannot be reached the Arabic connection screen shows', offline.includes('تعذّر الوصول إلى المركز') && offline.includes('إعادة المحاولة'), offline.slice(0, 120));
    stopSite = await h.startSite();
    await tapOn(page, '#again');
    await h.until(() => page.url().startsWith(`${SITE}/`), 30000, 500);
    await atGate(page).catch(() => undefined);
    check('«إعادة المحاولة» opens the site again once connected', page.url().startsWith(`${SITE}/`) && !page.url().includes('offline.html'), page.url());

    // 9. the session's store survives
    await page.evaluate(() => {
      document.cookie = 'qa_a2=kept; max-age=3600; path=/';
    });
    h.shell('input keyevent 3');
    await h.sleep(1500);
    h.shell(`am force-stop ${h.APP}`);
    await h.sleep(1000);
    h.shell(`am start -W -n ${h.ACTIVITY}`);
    page = await webPage(device);
    await atGate(page);
    const kept = await page.evaluate(() => document.cookie);
    check('a cookie of the site survives the application being closed and stopped', kept.includes('qa_a2=kept'), kept);
  } catch (e) {
    check('the check ran to its end', false, String(e && e.stack ? e.stack : e));
  } finally {
    try {
      unreverse(3000);
      unreverse(3001);
      h.adb(['uninstall', h.APP], { allowFail: true });
      note(`After the check: ${h.shell(`pm list packages ${h.APP}`, { allowFail: true }) || 'the check package is uninstalled'}.`);
    } catch {
      // the emulator may be gone
    }
    if (device) await device.close().catch(() => undefined);
    if (other) other.close();
    if (stopSite) await stopSite();
  }
  process.exitCode = finish(path.join(__dirname, 'android-shell.json')) ? 1 : 0;
})();

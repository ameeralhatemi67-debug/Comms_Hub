// The check of phase A8 of the Android application (Android_Build_Plan.md; MVP_draft.md 64.6): Google Play's copy.
// Part 1, the release: the App Bundle of the play channel is built (unsigned: the key is the owner's) and its manifest
// read with bundletool from Gradle's cache: the application's id and Android levels, the permissions it asks, and
// nothing of the APK channel's installer or of the check package.
// Part 2, on the emulator, with Google Play's copy of the check package sa.commshub.app.qa, which asks Play's own
// FakeAppUpdateManager instead of Play (an application not installed from Play has nothing to ask Play about). The check
// plays Play's part through the package's receiver (src/playQa/QaPlay.java). The page is the real update window and
// «تطبيق الهاتف» (src/components/native/phone-app.tsx) on a fixture page at http://127.0.0.1:3000; «الحساب» itself
// needs a signed-in person. Signed-out pages only; nothing signs in. In order:
//   1. the bridge is version 7 with playUpdate and without appUpdate; with nothing in Play, no window and the panel
//      says it is the newest;
//   2. a release in Play is offered with its version («تحديث الآن», «لاحقاً»); «لاحقاً» holds after a reload;
//   3. «تحديث الآن» opens Play's own window; once accepted, Play downloads while the page shows no window and the
//      panel shows the share; a downloaded update asks for the restart, which «لاحقاً» puts off without hiding the
//      panel's button; «إعادة التشغيل الآن» hands the install to Play;
//   4. a release Play marks as required cannot be put off (no «لاحقاً», the back key leaves it) and «تحديث الآن»
//      opens Play's immediate window; declined, the window stays.
// Usage: start the emulator read-only; then node qa/android-play.cjs (writes qa/android-play.json). It needs
// COMMSHUB_JAVA_HOME as mobile/README.md says.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { spawnSync } = require('node:child_process');
const esbuild = require('esbuild');
const { dependency } = require('./runtime.cjs');
const { _android } = dependency('playwright');
const h = require('./android-helpers.cjs');

const { check, result, note, finish } = h.record('qa/android-play.cjs');
const out = path.join(__dirname, 'artifacts', 'android-play');
const shot = (name) => h.screenshot(path.join(out, `${name}.png`));
const ours = () => (h.resumed() || '').startsWith(`${h.APP}/`);
const RECEIVER = `${h.APP}/sa.commshub.app.QaPlay`;
const css = fs.readFileSync(path.join(h.root, 'src', 'app', 'globals.css'), 'utf8').replace(/@import[^;]+;/g, '').replace(/@theme\{[^}]*\}/g, '');
const page = () =>
  `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>تطبيق الهاتف</title><style>${css}</style></head>` +
  '<body><div id="root"></div><script type="module" src="/play.js"></script></body></html>';

function build(kind) {
  const env = { ...process.env };
  delete env.COMMSHUB_KEYSTORE_PROPERTIES;
  const r = spawnSync(process.execPath, [path.join(h.root, 'mobile', 'scripts', 'build.mjs'), kind, 'play'], { cwd: path.join(h.root, 'mobile'), env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`build ${kind} play: ${(r.stdout || '').slice(-800)}${(r.stderr || '').slice(-800)}`);
  return JSON.parse(/\{\s*"(?:apk|aab)"[\s\S]*?\}/.exec(r.stdout)[0]);
}

/** bundletool, as the Android Gradle plugin keeps it in Gradle's cache, with the libraries it needs beside it. */
function bundletool(args) {
  const cache = path.join(os.homedir(), '.gradle', 'caches', 'modules-2', 'files-2.1');
  const jars = [];
  const walk = (d) => {
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.jar') && !e.name.endsWith('-sources.jar')) jars.push(p);
    }
  };
  const tools = fs.readdirSync(path.join(cache, 'com.android.tools.build', 'bundletool')).sort().pop();
  walk(path.join(cache, 'com.android.tools.build', 'bundletool', tools));
  for (const g of [['com.google.protobuf', 'protobuf-java'], ['com.google.guava', 'guava'], ['com.google.guava', 'failureaccess'], ['com.android.tools.build', 'aapt2-proto'], ['com.google.dagger', 'dagger'], ['javax.inject'], ['org.bitbucket.b_c'], ['com.google.auto.value']]) walk(path.join(cache, ...g));
  const jdk = process.env.COMMSHUB_JAVA_HOME || process.env.JAVA_HOME || '';
  const java = path.join(jdk, 'bin', process.platform === 'win32' ? 'java.exe' : 'java');
  const r = spawnSync(java, ['-cp', jars.join(path.delimiter), 'com.android.tools.build.bundletool.BundleToolMain', ...args], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`bundletool ${args[0]}: ${(r.stderr || r.stdout || '').slice(0, 600)}`);
  result.bundletool = tools;
  return r.stdout;
}

/** One step of Play's stand-in; answers what Play would be showing. Values are plain ASCII: no shell quoting needed. */
function play(step, extra = {}) {
  const args = Object.entries(extra).map(([k, v]) => `${typeof v === 'number' && k !== 'code' && k !== 'priority' ? '--el' : '--ei'} ${k} ${v}`).join(' ');
  const said = h.shell(`am broadcast -n ${RECEIVER} --es step ${step} ${args}`, { allowFail: true });
  const m = /data="(\{.*\})"/.exec(said);
  return m ? JSON.parse(m[1]) : { raw: said };
}

async function webPage(device, ms = 60000) {
  const view = await device.webView({ pkg: h.APP }, { timeout: ms });
  return view.page();
}

/** The phone taken again when Android stopped Playwright's driver, as in qa/android-update.cjs. */
let phone = null;
async function front(ms = 60000) {
  await h.until(() => ours(), 15000, 300);
  try {
    const p = await webPage(phone, ms);
    await p.waitForSelector('#where', { timeout: ms });
    return p;
  } catch (e) {
    if (!/has been closed/.test(String(e && e.message))) throw e;
    note(`Playwright's handle on the phone was lost (${String(e.message).split('\n')[0]}); it was taken again.`);
    [phone] = await _android.devices({ omitDriverInstall: true });
    const p = await webPage(phone, ms);
    await p.waitForSelector('#where', { timeout: ms });
    return p;
  }
}

async function windowOf(p, ms = 15000) {
  return h.until(
    () =>
      p.evaluate(() => {
        const d = document.querySelector('dialog.apk-window[open]');
        return d ? { title: d.querySelector('h2')?.textContent ?? '', text: d.innerText, buttons: [...d.querySelectorAll('button')].map((b) => b.textContent.trim()) } : null;
      }),
    ms,
    400,
  );
}
const panel = (p) => p.evaluate(() => document.querySelector('#panel')?.innerText ?? '');

async function tapButton(p, scope, label) {
  await h.sleep(300);
  const rect = await p.evaluate(
    ({ scope, label }) => {
      const b = [...document.querySelectorAll(`${scope} button`)].find((x) => x.textContent.trim() === label);
      if (!b) return null;
      const r = b.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, ratio: window.devicePixelRatio };
    },
    { scope, label },
  );
  if (!rect) throw new Error(`no button «${label}» in ${scope}`);
  const web = await h.webViewNode();
  if (!web) throw new Error('no web view on the screen');
  h.tap(Math.round(web.bounds[0] + rect.x * rect.ratio), Math.round(web.bounds[1] + rect.y * rect.ratio));
}

(async () => {
  let site;
  let device;
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  try {
    // Part 1: the bundle
    const aab = build('release');
    result.bundle = { bytes: aab.size, sha256: aab.sha256 };
    const manifest = bundletool(['dump', 'manifest', '--bundle', aab.aab]);
    const asked = [...manifest.matchAll(/<uses-permission android:name="([^"]+)"/g)].map((m) => m[1]).sort();
    result.permissions = asked;
    check('the bundle is sa.commshub.app for Android 10 (API 29) and newer, targeting Android 16 (API 36)', /package="sa\.commshub\.app"/.test(manifest) && /android:minSdkVersion="29"/.test(manifest) && /android:targetSdkVersion="36"/.test(manifest), manifest.slice(0, 400));
    check('Google Play\'s copy asks no permission to install packages, and has no installer of its own', !asked.includes('android.permission.REQUEST_INSTALL_PACKAGES') && !/sa\.commshub\.app\.InstallReceiver/.test(manifest), asked);
    check('nothing of the check package is in it', !/QaPlay|QaPush|QaFiles/.test(manifest));
    const expected = ['android.permission.ACCESS_NETWORK_STATE', 'android.permission.FOREGROUND_SERVICE', 'android.permission.FOREGROUND_SERVICE_DATA_SYNC', 'android.permission.INTERNET', 'android.permission.MODIFY_AUDIO_SETTINGS', 'android.permission.POST_NOTIFICATIONS', 'android.permission.RECEIVE_BOOT_COMPLETED', 'android.permission.RECORD_AUDIO', 'android.permission.USE_BIOMETRIC', 'android.permission.USE_FINGERPRINT', 'android.permission.WAKE_LOCK', 'com.google.android.c2dm.permission.RECEIVE', 'sa.commshub.app.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION'];
    check('it asks exactly what the Play Console drafts list: no camera, location, contacts, media or advertising id', JSON.stringify(asked) === JSON.stringify(expected), asked);
    check('the data-sync foreground task is declared, as the Play Console declaration says', /SystemForegroundService/.test(manifest) && /android:foregroundServiceType="0x00000001"/.test(manifest));

    // Part 2: Google Play's copy on the emulator
    const qa = build('qa');
    result.apk = { bytes: qa.size };
    await esbuild.build({
      entryPoints: [path.join(__dirname, 'fixtures', 'android-play.tsx')],
      bundle: true,
      format: 'esm',
      platform: 'browser',
      target: 'es2020',
      jsx: 'automatic',
      outfile: path.join(out, 'play.js'),
      define: { 'process.env.NODE_ENV': '"production"' },
      logLevel: 'silent',
      absWorkingDir: h.root,
    });
    const bundle = fs.readFileSync(path.join(out, 'play.js'), 'utf8');
    if (await h.portAnswers(3000)) throw new Error('something already answers on 127.0.0.1:3000');
    site = http.createServer((req, res) => {
      if (req.url === '/play.js') {
        res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
        return res.end(bundle);
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(page());
    });
    await new Promise((r) => site.listen(3000, '127.0.0.1', r));

    if (!(await h.emulatorReady())) throw new Error('no emulator ready');
    result.device = { model: h.shell('getprop ro.product.model'), android: h.shell('getprop ro.build.version.release'), sdk: h.shell('getprop ro.build.version.sdk') };
    h.adb(['reverse', 'tcp:3000', 'tcp:3000']);
    h.adb(['uninstall', h.APP], { allowFail: true });
    h.adb(['install', '-r', qa.apk]);
    h.shell(`am start -W -n ${h.ACTIVITY}`);
    [device] = await _android.devices({ omitDriverInstall: true });
    if (!device) throw new Error('Playwright sees no device');
    phone = device;

    // 1. the bridge, and nothing in Play
    let p = await front();
    const id = await p.evaluate(() => {
      const n = window.commsHubNative;
      return { platform: n?.platform, bridge: n?.bridge, play: ['status', 'start', 'complete'].map((m) => typeof n?.playUpdate?.[m]), appUpdate: 'appUpdate' in (n ?? {}), frozen: Object.isFrozen(n?.playUpdate) };
    });
    check('bridge version 7 with playUpdate (status, start, complete), frozen, and no appUpdate', id.platform === 'android' && id.bridge === 7 && id.play.every((t) => t === 'function') && id.frozen && !id.appUpdate, id);
    await h.until(async () => (await panel(p)).includes('Google Play'), 10000, 400);
    let text = await panel(p);
    check('with nothing in Play: no window, and «تطبيق الهاتف» says it is the newest in Google Play', !(await windowOf(p, 4000)) && text.includes('من Google Play') && text.includes('هذا أحدث إصدار في Google Play.'), text);
    shot('01-newest');

    // 2. offered, and put off
    play('available', { code: 101, priority: 0 });
    let w = await windowOf(p);
    shot('02-offered');
    check('a release in Play is offered with its version: «تحديث الآن» and «لاحقاً»', w?.title === 'يتوفر إصدار جديد من التطبيق' && w.text.includes('0.1.1') && w.text.includes('Google Play') && w.buttons.includes('تحديث الآن') && w.buttons.includes('لاحقاً'), w);
    text = await panel(p);
    check('«تطبيق الهاتف» offers it too', text.includes('يتوفر الإصدار 0.1.1 في Google Play.'), text);
    await tapButton(p, 'dialog.apk-window[open]', 'لاحقاً');
    await h.sleep(800);
    await p.reload();
    await p.waitForSelector('#where', { timeout: 30000 });
    check('«لاحقاً» holds after a reload', !(await windowOf(p, 6000)));
    await p.evaluate(() => localStorage.removeItem('commshub.play.later'));
    await p.reload();
    await p.waitForSelector('#where', { timeout: 30000 });

    // 3. the flexible update
    w = await windowOf(p);
    await tapButton(p, 'dialog.apk-window[open]', 'تحديث الآن');
    const asked1 = await h.until(() => {
      const s = play('look');
      return s.confirmation ? s : null;
    }, 10000, 500);
    check('«تحديث الآن» opens Play\'s own window, which asks the person', !!asked1, asked1);
    check('and this window steps aside for it', !(await windowOf(p, 4000)));
    play('accept');
    play('download', { total: 1000 });
    play('progress', { done: 400 });
    const share = await h.until(async () => ((await panel(p)).includes('(40٪)') ? panel(p) : null), 10000, 400);
    shot('03-downloading');
    check('while Play downloads: no window, and the panel shows the share', !!share && share.includes('جارٍ تنزيل التحديث من Google Play (40٪)…') && !(await windowOf(p, 1500)), share);
    play('downloaded');
    w = await windowOf(p);
    shot('04-ready');
    check('a downloaded update asks for the restart: «إعادة التشغيل الآن» and «لاحقاً»', w?.title === 'التحديث جاهز' && w.buttons.includes('إعادة التشغيل الآن') && w.buttons.includes('لاحقاً'), w);
    await tapButton(p, 'dialog.apk-window[open]', 'لاحقاً');
    await h.sleep(800);
    await p.reload();
    await p.waitForSelector('#where', { timeout: 30000 });
    text = await h.until(async () => ((await panel(p)).includes('إعادة التشغيل الآن') ? panel(p) : null), 8000, 400);
    check('«لاحقاً» puts the restart off, and «تطبيق الهاتف» still offers it', !(await windowOf(p, 4000)) && !!text && text.includes('نُزِّل التحديث'), text);
    await tapButton(p, '#panel', 'إعادة التشغيل الآن');
    const installing = await h.until(() => {
      const s = play('look');
      return s.splash ? s : null;
    }, 10000, 500);
    shot('05-installing');
    check('«إعادة التشغيل الآن» hands the install to Play', !!installing, installing);
    play('installed');
    await h.sleep(1500);

    // 4. required
    h.shell(`am force-stop ${h.APP}`);
    await h.sleep(800);
    h.shell(`am start -W -n ${h.ACTIVITY}`);
    p = await front();
    await p.evaluate(() => localStorage.removeItem('commshub.play.later'));
    play('available', { code: 102, priority: 5 });
    w = await windowOf(p);
    h.shell('input keyevent 4');
    await h.sleep(1200);
    const still = await windowOf(p, 3000);
    shot('06-required');
    check('a release Play marks as required cannot be put off: no «لاحقاً», the back key leaves it', w?.title === 'يجب تحديث التطبيق' && w.text.includes('0.1.2') && w.buttons.includes('تحديث الآن') && !w.buttons.includes('لاحقاً') && !!still && ours(), { w, still: !!still });
    await tapButton(p, 'dialog.apk-window[open]', 'تحديث الآن');
    const immediate = await h.until(() => {
      const s = play('look');
      return s.immediate ? s : null;
    }, 10000, 500);
    check('«تحديث الآن» opens Play\'s immediate window', !!immediate, immediate);
    play('reject');
    await h.sleep(2500);
    w = await windowOf(p, 5000);
    check('declined in Play, the window stays, with «تحديث الآن» again', w?.title === 'يجب تحديث التطبيق' && w.buttons.includes('تحديث الآن'), w);
  } catch (e) {
    check('the check ran to its end', false, String(e && e.stack ? e.stack : e));
  } finally {
    try {
      h.adb(['reverse', '--remove', 'tcp:3000'], { allowFail: true });
      h.adb(['uninstall', h.APP], { allowFail: true });
      note(`After the check: ${h.shell(`pm list packages ${h.APP}`, { allowFail: true }) || 'the check package is uninstalled'}.`);
    } catch {
      // the emulator may be gone
    }
    if (phone && phone !== device) await phone.close().catch(() => undefined);
    if (device) await device.close().catch(() => undefined);
    if (site) site.close();
  }
  process.exitCode = finish(path.join(__dirname, 'android-play.json')) ? 1 : 0;
})();

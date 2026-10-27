// The check of the application's half of phase A5 (Android_Build_Plan.md; MVP_draft.md 64.3): push notices on the
// emulator, with the check package sa.commshub.app.qa, without a Firebase project. The real component
// (src/components/native/phone-push.tsx) and the listeners src/components/notices.tsx uses are compiled into a fixture
// page served at http://127.0.0.1:3000, with a stand-in for the database client that records what the page asks.
// A push is handed to the application through the check package's own receiver (src/qa, QaPush.java), which calls
// the same PushService.handle that Firebase's messages reach. Nothing signs in. In order:
//   1. in Edge, as a browser: nothing asked, nothing registered;
//   2. inside the application: bridge version 4 with push; the three channels with their Arabic names and levels;
//   3. the phone registered for the person with no token while notices are not allowed;
//   4. the site's explanation before Android asks; «ليس الآن» puts it off; «السماح بالتنبيهات» brings Android's
//      question, and once allowed the phone is registered again (no token: this build has no Firebase project);
//   5. a push while the application is in front shows nothing and the page reads its notices again;
//   6. in the background: a decision with sound, an attention notice silent, a message in «الرسائل», `info` never;
//   7. a tap opens the push's page in the open page; a page that is not the site's is never opened;
//   8. with the application closed, a tap opens it at the push's page;
//   9. another application's intent with a page, with or without a wrong key, opens nothing;
//  10. a phone removed from «أجهزتي» signs out at its next opening.
// Usage: start the emulator read-only; build the check package (mobile: npm run build:qa); then
// node qa/android-push.cjs (writes qa/android-push.json).
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const esbuild = require('esbuild');
const { dependency, launchOptions } = require('./runtime.cjs');
const { _android, chromium } = dependency('playwright');
const h = require('./android-helpers.cjs');

const { check, result, note, finish } = h.record('qa/android-push.cjs');
const SITE = 'http://127.0.0.1:3000';
const out = path.join(__dirname, 'artifacts', 'android-push');
const shot = (name) => h.screenshot(path.join(out, `${name}.png`));
const ours = () => (h.resumed() || '').startsWith(`${h.APP}/`);
const RECEIVER = `${h.APP}/sa.commshub.app.QaPush`;
const DEVICE = '0a4d4c6b-9e7f-4a2b-8c4d-0000000000d1';

const page = () =>
  '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>تنبيهات</title>' +
  '<style>body{font-family:sans-serif;margin:0}button{min-height:44px;padding:8px 14px;font-size:15px}dialog{width:min(420px,calc(100% - 30px))}.actions{display:flex;gap:8px;flex-wrap:wrap}</style>' +
  '</head><body><div id="root"></div><script type="module" src="/push.js"></script></body></html>';

/** A push handed in as Firebase would hand it; values are plain ASCII so no shell quoting is needed. */
function push(fields) {
  const args = Object.entries(fields).map(([k, v]) => `--es ${k} '${v}'`).join(' ');
  return h.shell(`am broadcast -n ${RECEIVER} ${args}`, { allowFail: true });
}

/** The application's notices now posted, by title: channel, importance and whether they would sound. */
function posted() {
  const dump = h.shell('dumpsys notification --noredact', { allowFail: true });
  return dump
    .split('NotificationRecord(')
    .filter((r) => r.includes(`pkg=${h.APP} `) || r.includes(`pkg=${h.APP}\n`) || r.includes(`pkg=${h.APP}:`))
    .map((r) => ({
      title: (/android\.title=String \(([^)]*)\)/.exec(r) || [])[1] ?? null,
      channel: (/Notification\(channel=([^\s]+)/.exec(r) || [])[1] ?? null,
      importance: Number((/importance=(\d)/.exec(r) || [])[1] ?? -1),
    }))
    .filter((n) => n.title);
}

/** The application's channels as Android keeps them. */
function channels() {
  const dump = h.shell('dumpsys notification --noredact', { allowFail: true });
  const found = {};
  for (const m of dump.matchAll(/NotificationChannel\{mId='(decide|attention|messages)', mName=([^,]+), mDescription=[^,]*, mImportance=(\d)/g)) {
    found[m[1]] = { name: m[2], importance: Number(m[3]) };
  }
  return found;
}

async function webPage(device, ms = 60000) {
  const view = await device.webView({ pkg: h.APP }, { timeout: ms });
  return view.page();
}

/** The phone taken again when Android stopped Playwright's driver, as in qa/android-update.cjs. */
let phone = null;
async function front(ms = 30000) {
  await h.until(() => ours(), 15000, 300);
  try {
    return await webPage(phone, ms);
  } catch (e) {
    if (!/has been closed/.test(String(e && e.message))) throw e;
    note(`Playwright's handle on the phone was lost (${String(e.message).split('\n')[0]}); it was taken again.`);
    [phone] = await _android.devices({ omitDriverInstall: true });
    return webPage(phone, ms);
  }
}

async function tapOn(page, selector) {
  await h.sleep(300);
  const rect = await page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, ratio: window.devicePixelRatio };
  }, selector);
  if (!rect) throw new Error(`nothing at ${selector}`);
  const web = h.screenNodes().find((n) => n.cls === 'android.webkit.WebView');
  if (!web) throw new Error('no web view on the screen');
  h.tap(Math.round(web.bounds[0] + rect.x * rect.ratio), Math.round(web.bounds[1] + rect.y * rect.ratio));
}

/**
 * Taps a notice in the shade by its title. A notice of «يحتاج قرارك» first drops in over the screen for a few
 * seconds and then moves into the shade; a tap during that move lands on whatever is under it. So the shade is
 * opened once the notice has settled, read once it has opened, and the tap tried again if the application did
 * not come to the front.
 */
async function tapNotice(title) {
  await h.sleep(6000);
  for (let attempt = 0; attempt < 2; attempt++) {
    h.shell('cmd statusbar expand-notifications', { allowFail: true });
    await h.sleep(1500);
    const node = await h.until(() => h.screenNodes().find((n) => n.text === title && n.pkg === 'com.android.systemui'), 8000, 500);
    if (!node) break;
    h.tap(node.x, node.y);
    if (await h.until(() => ours(), 8000, 300)) return true;
  }
  h.shell('cmd statusbar collapse', { allowFail: true });
  return ours();
}

const events = (page) => page.evaluate(() => window.__events.slice());
const rpc = (page) => page.evaluate(() => window.__rpc.slice());
const where = (page) => page.evaluate(() => location.pathname + location.search);
const dialogShown = (page) => page.evaluate(() => !!document.querySelector('dialog.phone-push[open]'));

(async () => {
  let site;
  let device;
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  try {
    const qaApk = h.apkOf('qa');
    if (!qaApk) throw new Error('build the check package first (mobile: npm run build:qa)');
    await esbuild.build({
      entryPoints: [path.join(__dirname, 'fixtures', 'android-push.tsx')],
      bundle: true,
      format: 'esm',
      platform: 'browser',
      target: 'es2020',
      jsx: 'automatic',
      outfile: path.join(out, 'push.js'),
      alias: { '@/lib/supabase/client': path.join(__dirname, 'fixtures', 'fake-push-supabase.ts'), 'next/navigation': path.join(__dirname, 'fixtures', 'fake-next.tsx') },
      define: { 'process.env.NODE_ENV': '"production"' },
      logLevel: 'silent',
      absWorkingDir: h.root,
    });
    const bundle = fs.readFileSync(path.join(out, 'push.js'), 'utf8');
    if (await h.portAnswers(3000)) throw new Error('something already answers on 127.0.0.1:3000');
    site = http.createServer((req, res) => {
      if (req.url === '/push.js') {
        res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
        return res.end(bundle);
      }
      // Every page of this fixture is the same page, which shows its own address.
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(page());
    });
    await new Promise((r) => site.listen(3000, '127.0.0.1', r));

    // 1. Edge, as a browser.
    const browser = await chromium.launch(launchOptions);
    try {
      const tab = await (await browser.newContext()).newPage();
      await tab.goto(`${SITE}/`);
      await tab.waitForSelector('#where', { timeout: 15000 });
      await h.sleep(1500);
      const r = await tab.evaluate(() => ({ rpc: window.__rpc.length, dialog: !!document.querySelector('dialog[open]') }));
      check('in a browser: no explanation and no registration', r.rpc === 0 && !r.dialog, r);
    } finally {
      await browser.close();
    }

    // 2. inside the application
    if (!(await h.emulatorReady())) throw new Error('no emulator ready');
    result.device = { model: h.shell('getprop ro.product.model'), android: h.shell('getprop ro.build.version.release'), sdk: h.shell('getprop ro.build.version.sdk') };
    h.adb(['reverse', 'tcp:3000', 'tcp:3000']);
    h.adb(['uninstall', h.APP], { allowFail: true });
    h.adb(['install', '-r', qaApk]);
    h.shell(`am start -W -n ${h.ACTIVITY}`);
    [device] = await _android.devices({ omitDriverInstall: true });
    if (!device) throw new Error('Playwright sees no device');
    phone = device;
    let p = await front(60000);
    await p.waitForSelector('#where', { timeout: 60000 });
    const bridge = await p.evaluate(async () => {
      const n = window.commsHubNative;
      return { bridge: n?.bridge, methods: ['state', 'request', 'token', 'onOpen', 'onReceive'].map((m) => typeof n?.push?.[m]), frozen: Object.isFrozen(n?.push), state: await n.push.state() };
    });
    check('bridge version 4 with push (state, request, token, onOpen, onReceive), frozen, and notices still to be asked', bridge.bridge === 4 && bridge.methods.every((t) => t === 'function') && bridge.frozen && bridge.state === 'prompt', bridge);
    const ch = channels();
    result.channels = ch;
    check('the channels «يحتاج قرارك» (high, with sound), «للانتباه» (low, silent) and «الرسائل» (default), as Android\'s settings show them', ch.decide?.name === 'يحتاج قرارك' && ch.decide.importance === 4 && ch.attention?.name === 'للانتباه' && ch.attention.importance === 2 && ch.messages?.name === 'الرسائل' && ch.messages.importance === 3, ch);

    // 3. registered without a token
    const first = await h.until(async () => (await rpc(p)).find((c) => c.name === 'device_register'), 15000, 300);
    const version = (/versionName=([\d.]+)/.exec(h.shell(`dumpsys package ${h.APP}`, { allowFail: true })) || [])[1];
    check('at its opening the phone is registered for the person: Android, the installed version, no token yet', !!first && first.args.p_platform === 'android' && first.args.p_version === version && first.args.p_token === null && first.args.p_device === null, first);

    // 4. the explanation, then Android's question
    const shownFirst = await h.until(() => dialogShown(p), 10000, 300);
    const text = await p.evaluate(() => document.querySelector('dialog.phone-push')?.innerText ?? '');
    check('the site says why before Android asks: «تنبيهات الهاتف», «السماح بالتنبيهات» and «ليس الآن»', !!shownFirst && text.includes('تنبيهات الهاتف') && text.includes('السماح بالتنبيهات') && text.includes('ليس الآن') && text.includes('شاشة القفل'), text);
    shot('01-explanation');
    await tapOn(p, 'dialog.phone-push [data-push="later"]');
    await h.sleep(800);
    await p.reload();
    await p.waitForSelector('#where', { timeout: 30000 });
    await h.sleep(2500);
    check('«ليس الآن» puts it off: not asked again at the next opening', !(await dialogShown(p)) && (await p.evaluate(() => Number(localStorage.getItem('commshub.push.later')) > 0)));
    await p.evaluate(() => localStorage.removeItem('commshub.push.later'));
    await p.reload();
    await p.waitForSelector('dialog.phone-push[open]', { timeout: 30000 });
    await tapOn(p, 'dialog.phone-push [data-push="allow"]');
    const ask = await h.until(() => h.screenNodes().find((n) => /^(Allow|السماح)$/.test(n.text) && /permissioncontroller/.test(n.pkg)), 15000, 500);
    shot('02-android-asks');
    check('«السماح بالتنبيهات» brings Android\'s own question', !!ask, ask);
    if (ask) h.tap(ask.x, ask.y);
    p = await front();
    const after = await h.until(async () => {
      const calls = (await rpc(p)).filter((c) => c.name === 'device_register');
      return calls.length >= 2 ? calls : null;
    }, 15000, 400);
    const state = await p.evaluate(() => window.commsHubNative.push.state());
    const token = await p.evaluate(() => window.commsHubNative.push.token());
    check('once allowed, the state is granted and the phone is registered again with its remembered id', state === 'granted' && !!after && after[after.length - 1].args.p_device === DEVICE && !(await dialogShown(p)), { state, after });
    check('this build has no Firebase project, so the token is null and nothing is made with Google', token === null && after?.[after.length - 1].args.p_token === null, { token });

    // 5. in front
    await p.evaluate(() => (window.__events.length = 0));
    push({ kind: 'notice', tier: 'decide', title: 'qa-front', body: 'qa-body', go: '/front', tag: 't0' });
    const received = await h.until(async () => (await events(p)).some((e) => e[0] === 'receive'), 8000, 300);
    check('a push while the application is in front shows nothing, and the page reads its notices again', !!received && !posted().some((n) => n.title === 'qa-front'), { events: await events(p), posted: posted() });

    // 6 and 7. in the background, one notice at a time for the taps: Android bundles four or more notices of an
    // application into one group, and a tap on a line of the group opens the group, not the notice.
    await p.evaluate(() => (window.__events.length = 0));
    h.shell('input keyevent 3');
    await h.sleep(1200);
    push({ kind: 'notice', tier: 'decide', title: 'qa-decide', body: 'qa-decide-body', go: '/opened-decide?n=1', tag: 't1' });
    await h.sleep(1500);
    const decide = posted().find((n) => n.title === 'qa-decide');
    check('a decision is shown in «يحتاج قرارك», with sound', decide?.channel === 'decide' && decide.importance === 4, decide);
    shot('03-decision');
    const tapped = await tapNotice('qa-decide');
    p = await front();
    const opened = await h.until(async () => (await events(p)).find((e) => e[0] === 'open'), 10000, 300);
    check('a tap opens the push\'s page in the page that is open', tapped && !!opened && opened[1] === '/opened-decide?n=1', { tapped, opened, events: await events(p), where: await where(p) });
    await p.evaluate(() => (window.__events.length = 0));
    const before = await where(p);
    h.shell('input keyevent 3');
    await h.sleep(1200);
    push({ kind: 'notice', tier: 'decide', title: 'qa-elsewhere', body: 'x', go: 'https://evil.example/', tag: 't5' });
    await h.sleep(1500);
    const tappedElsewhere = await tapNotice('qa-elsewhere');
    p = await front();
    await h.sleep(1500);
    check('a push naming another site opens the application where it was, and no page of another site', tappedElsewhere && !(await events(p)).some((e) => e[0] === 'open') && (await where(p)) === before, { tappedElsewhere, events: await events(p), where: await where(p) });
    h.shell('input keyevent 3');
    await h.sleep(1200);
    push({ kind: 'notice', tier: 'attention', title: 'qa-attention', body: 'qa-attention-body', go: '/opened-attention', tag: 't2' });
    push({ kind: 'notice', tier: 'info', title: 'qa-info', body: 'x', go: '/x', tag: 't3' });
    push({ kind: 'chat', tier: 'decide', title: 'qa-chat', body: 'qa-chat-body', go: '/n/chat/1', tag: 't4' });
    await h.sleep(2000);
    const list = posted();
    result.posted = list;
    const by = (t) => list.find((n) => n.title === t);
    check('an attention notice is shown in «للانتباه», silent', by('qa-attention')?.channel === 'attention' && by('qa-attention').importance === 2, by('qa-attention'));
    check('a message is shown in «الرسائل»', by('qa-chat')?.channel === 'messages', by('qa-chat'));
    check('`info` is never shown', !by('qa-info'));
    shot('04-background');

    // 8. closed
    h.shell(`am force-stop ${h.APP}`);
    await h.sleep(1000);
    push({ kind: 'notice', tier: 'decide', title: 'qa-cold', body: 'x', go: '/opened-cold?n=2', tag: 't6' });
    await h.sleep(2500);
    const coldShown = posted().some((n) => n.title === 'qa-cold');
    const tappedCold = await tapNotice('qa-cold');
    p = await front(60000);
    const coldWhere = await h.until(async () => ((await where(p)) === '/opened-cold?n=2' ? true : null), 20000, 500);
    check('with the application closed, a push is shown, and a tap opens the application at its page', coldShown && tappedCold && !!coldWhere, { coldShown, tappedCold, where: await where(p).catch(() => null) });
    shot('05-cold');

    // 9. another application's intent
    const now = await where(p);
    h.shell(`am start -n ${h.ACTIVITY} --es sa.commshub.app.GO /forged`, { allowFail: true });
    await h.sleep(2500);
    h.shell(`am start -n ${h.ACTIVITY} --es sa.commshub.app.GO /forged-key --es sa.commshub.app.PUSH_KEY ${'0'.repeat(64)}`, { allowFail: true });
    await h.sleep(2500);
    p = await front();
    check('an intent from outside naming a page, without the key or with a wrong one, opens nothing', (await where(p)) === now, { before: now, after: await where(p) });

    // 10. removed from «أجهزتي»
    await p.evaluate(() => {
      localStorage.setItem('qa.seen', 'removed');
    });
    await p.reload();
    await p.waitForSelector('#where', { timeout: 30000 });
    const out2 = await h.until(async () => {
      const r = await p.evaluate(() => ({ signOut: window.__signOut.slice(), device: localStorage.getItem('commshub.device'), calls: window.__rpc.map((c) => c.name) }));
      return r.signOut.length ? r : null;
    }, 15000, 400);
    check('a phone removed from «أجهزتي» signs out here at its next opening, forgets its id, and registers nothing', !!out2 && JSON.stringify(out2.signOut[0]) === '{"scope":"local"}' && out2.device === null && out2.calls.join(',') === 'device_seen', out2);
    note('Real delivery through Firebase, to a locked phone, waits for the owner\'s Firebase project: this build has none, so no token was made and nothing was sent to Google.');
  } catch (e) {
    check('the check ran to its end', false, String(e && e.stack ? e.stack : e));
  } finally {
    try {
      h.shell('cmd statusbar collapse', { allowFail: true });
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
  process.exitCode = finish(path.join(__dirname, 'android-push.json')) ? 1 : 0;
})();

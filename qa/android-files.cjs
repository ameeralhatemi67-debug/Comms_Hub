// The check of phase A4 of the Android application (Android_Build_Plan.md; MVP_draft.md 64.2): the site's files
// on the phone, on the emulator, with the check package sa.commshub.app.qa. The real component
// (src/components/native/phone-file.tsx) is compiled into a fixture page served by this check at
// http://127.0.0.1:3000, the check package's compiled local address, together with fixture files at the site's
// own file routes (a PDF, a PNG, a text file, a video, a large file, a slow one, one that redirects to another
// address). Nothing signs in: the files are the check's own, and a cookie set by the page stands for the
// session. In order:
//   1. in Edge, as a browser: no phone button, the «تنزيل» link as it was, a tap on a file follows its link;
//   2. inside the application: bridge version 3 with download and share; the buttons in their order;
//   3. «حفظ في الهاتف»: a document to Downloads, a picture and a video to the gallery, each with its bytes,
//      fetched with the site's cookie and the download address the library records;
//   4. a tap on a mail or messaging file asks which, and the back key closes the window;
//   5. «فتح الملف»: the phone's viewer opens a copy in the application's cache folder;
//   6. «مشاركة»: Android's share sheet, with the same copy; a file over 50 MB says its size first, and «إلغاء»
//      fetches nothing;
//   7. a redirect to another address is followed without the cookie;
//   8. a page cannot name anything but a file route of its own site;
//   9. while a file arrives, a notice shows its progress once notices are allowed, and goes when it ends.
// Usage: start the emulator read-only; build the check package (mobile: npm run build:qa); then
// node qa/android-files.cjs (writes qa/android-files.json).
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const esbuild = require('esbuild');
const { dependency, launchOptions } = require('./runtime.cjs');
const { _android, chromium } = dependency('playwright');
const h = require('./android-helpers.cjs');

const { check, result, note, finish } = h.record('qa/android-files.cjs');
const SITE = 'http://127.0.0.1:3000';
const OTHER_PORT = 3001;
const out = path.join(__dirname, 'artifacts', 'android-files');
const shot = (name) => h.screenshot(path.join(out, `${name}.png`));
const ours = () => (h.resumed() || '').startsWith(`${h.APP}/`);
const reverse = (port) => h.adb(['reverse', `tcp:${port}`, `tcp:${port}`]);
const unreverse = (port) => h.adb(['reverse', '--remove', `tcp:${port}`], { allowFail: true });
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const ALBUM = 'مركز الاتصال المؤسسي';

const IDS = {
  doc: '0a4d4c6b-9e7f-4a2b-8c4d-000000000001',
  image: '0a4d4c6b-9e7f-4a2b-8c4d-000000000002',
  mail: '0a4d4c6b-9e7f-4a2b-8c4d-000000000003',
  video: '0a4d4c6b-9e7f-4a2b-8c4d-000000000004',
  large: '0a4d4c6b-9e7f-4a2b-8c4d-000000000005',
  away: '0a4d4c6b-9e7f-4a2b-8c4d-000000000006',
  slow: '0a4d4c6b-9e7f-4a2b-8c4d-000000000007',
};

/** A small PDF any viewer opens. */
function pdf() {
  const stream = 'BT /F1 18 Tf 24 70 Td (Comms Hub A4 check) Tj ET';
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let s = '%PDF-1.4\n';
  const at = [];
  objs.forEach((o, i) => {
    at.push(Buffer.byteLength(s, 'latin1'));
    s += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(s, 'latin1');
  s += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${at.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  s += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(s, 'latin1');
}

const PDF = pdf();
const PNG = fs.readFileSync(path.join(h.root, 'public', 'brand', 'comms-hub-logo-512.png'));
const TXT = Buffer.from('ملاحظات الاجتماع: فحص المرحلة A4.\n', 'utf8');
const VIDEO = Buffer.concat([Buffer.from([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 2, 0, 0x69, 0x73, 0x6f, 0x6d, 0x6d, 0x70, 0x34, 0x31]), crypto.randomBytes(200 * 1024)]);
const AWAY = Buffer.from('from another address\n', 'utf8');
const LARGE_SIZE = 60 * 1024 * 1024;
const SLOW = crypto.randomBytes(3 * 1024 * 1024);

/** The fixture files, by the address the page names them by: the bytes, the type, the name and how it is sent. */
const FILES = {
  [`/api/media/${IDS.doc}/content?v=2`]: { body: PDF, type: 'application/pdf', name: 'تقرير الربع.pdf', disposition: 'inline' },
  [`/api/media/${IDS.doc}/content?download=1`]: { body: PDF, type: 'application/pdf', name: 'تقرير الربع.pdf', disposition: 'attachment' },
  [`/api/media/${IDS.image}/content?v=1`]: { body: PNG, type: 'image/png', name: 'شعار المركز.png', disposition: 'inline' },
  [`/api/media/${IDS.image}/content?download=1`]: { body: PNG, type: 'image/png', name: 'شعار المركز.png', disposition: 'attachment' },
  [`/api/mail/file/${IDS.mail}`]: { body: TXT, type: 'text/plain; charset=utf-8', name: 'ملاحظات الاجتماع.txt', disposition: 'attachment' },
  [`/api/chat/file/${IDS.video}`]: { body: VIDEO, type: 'video/mp4', name: 'مقطع.mp4', disposition: 'attachment' },
  [`/api/chat/file/${IDS.large}`]: { large: true, type: 'application/octet-stream', name: 'نسخة كبيرة.bin', disposition: 'attachment' },
  [`/api/chat/file/${IDS.away}`]: { redirect: `http://127.0.0.1:${OTHER_PORT}/elsewhere.txt` },
  [`/api/chat/file/${IDS.slow}`]: { body: SLOW, slow: true, type: 'application/octet-stream', name: 'بطيء.bin', disposition: 'attachment' },
};

const page = () =>
  '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ملفات</title>' +
  '<style>body{font-family:sans-serif;margin:0}button,.button{display:inline-flex;gap:6px;align-items:center;min-height:44px;padding:8px 14px;border:1px solid #888;border-radius:7px;background:#fff;color:#111;font-size:15px;text-decoration:none}svg{width:18px;height:18px}.actions{display:flex;flex-wrap:wrap;gap:8px}dialog{width:min(420px,calc(100% - 30px))}.phone-file-list{display:grid;gap:8px}.phone-file-list button{width:100%}</style>' +
  '</head><body><div id="root"></div><script type="module" src="/files.js"></script></body></html>';

function siteServer(bundle, seen) {
  return http.createServer((req, res) => {
    seen.push({ port: 3000, path: req.url, cookie: req.headers.cookie || null, ua: req.headers['user-agent'] || null });
    if (req.url === '/' || req.url.startsWith('/?')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(page());
    }
    if (req.url === '/files.js') {
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
      return res.end(bundle);
    }
    const f = FILES[req.url];
    if (!f) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('not found');
    }
    if (f.redirect) {
      res.writeHead(302, { Location: f.redirect });
      return res.end();
    }
    const head = { 'Content-Type': f.type, 'Content-Disposition': `${f.disposition}; filename*=UTF-8''${encodeURIComponent(f.name)}`, 'Cache-Control': 'private, no-store' };
    if (f.large) {
      res.writeHead(200, { ...head, 'Content-Length': String(LARGE_SIZE) });
      const chunk = Buffer.alloc(1024 * 1024);
      let sent = 0;
      const pump = () => {
        while (sent < LARGE_SIZE) {
          sent += chunk.length;
          if (!res.write(chunk)) return res.once('drain', pump);
        }
        res.end();
      };
      res.on('close', () => (sent = LARGE_SIZE));
      return pump();
    }
    res.writeHead(200, { ...head, 'Content-Length': String(f.body.length) });
    if (!f.slow) return res.end(f.body);
    // Six seconds for three megabytes: long enough to see the notice of its progress.
    let i = 0;
    const step = 128 * 1024;
    const t = setInterval(() => {
      if (i >= f.body.length || res.destroyed) {
        clearInterval(t);
        return res.end();
      }
      res.write(f.body.subarray(i, i + step));
      i += step;
    }, 250);
  });
}

async function webPage(device, ms = 60000) {
  const view = await device.webView({ pkg: h.APP }, { timeout: ms });
  return view.page();
}

/** A person's tap on an element, through Android's own input at the element's place on the screen. */
async function tapOn(page, selector) {
  await h.sleep(300);
  const rect = await page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return null;
    el.scrollIntoView({ block: 'center' });
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, ratio: window.devicePixelRatio };
  }, selector);
  if (!rect) throw new Error(`nothing at ${selector}`);
  const web = h.screenNodes().find((n) => n.cls === 'android.webkit.WebView');
  if (!web) throw new Error('no web view on the screen');
  h.tap(Math.round(web.bounds[0] + rect.x * rect.ratio), Math.round(web.bounds[1] + rect.y * rect.ratio));
}

async function backToApp(device) {
  h.shell(`am start -W -n ${h.ACTIVITY}`, { allowFail: true });
  await h.until(() => ours(), 15000, 300);
  await h.sleep(800);
  const page = await webPage(device, 20000).catch(async () => {
    h.shell(`am start -W -n ${h.ACTIVITY}`, { allowFail: true });
    await h.sleep(1500);
    const [again] = await _android.devices({ omitDriverInstall: true });
    return webPage(again);
  });
  await page.waitForLoadState('domcontentloaded').catch(() => undefined);
  return page;
}

/** The files under a folder of the phone's storage, by their SHA-256; the folder is named without Arabic on the command line. */
function sums(glob) {
  const text = h.shell(`for f in ${glob}; do [ -f "$f" ] && sha256sum "$f"; done`, { allowFail: true });
  return text
    .split('\n')
    .map((l) => /^([0-9a-f]{64})\s+(.+)$/.exec(l.trim()))
    .filter(Boolean)
    .map((m) => ({ sum: m[1], file: m[2] }));
}
/** The copies in the application's own cache folder, read as the application (the check package is debuggable). */
function sharedCopies() {
  const text = h.shell(`run-as ${h.APP} sh -c 'find cache/shared -type f -exec sha256sum {} +' 2>/dev/null`, { allowFail: true });
  return text
    .split('\n')
    .map((l) => /^([0-9a-f]{64})\s+(.+)$/.exec(l.trim()))
    .filter(Boolean)
    .map((m) => ({ sum: m[1], file: m[2] }));
}

async function waitFor(fn, ms = 30000) {
  return h.until(fn, ms, 700);
}

const actionsIn = (page, sel) => page.evaluate((s) => [...document.querySelectorAll(`${s} [data-phone-action]`)].map((b) => b.getAttribute('data-phone-action')), sel);
const sheet = (page) =>
  page.evaluate(() => {
    const d = document.querySelector('dialog.phone-file[open]');
    return d ? { name: d.querySelector('h2')?.textContent ?? '', actions: [...d.querySelectorAll('[data-phone-action]')].map((b) => b.getAttribute('data-phone-action')), cancel: !!d.querySelector('.phone-file-cancel') } : null;
  });

(async () => {
  let site;
  let other;
  let device;
  const seen = [];
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  try {
    const qaApk = h.apkOf('qa');
    if (!qaApk) throw new Error('build the check package first (mobile: npm run build:qa)');
    await esbuild.build({
      entryPoints: [path.join(__dirname, 'fixtures', 'android-files.tsx')],
      bundle: true,
      format: 'esm',
      platform: 'browser',
      target: 'es2020',
      jsx: 'automatic',
      outfile: path.join(out, 'files.js'),
      define: { 'process.env.NODE_ENV': '"production"' },
      logLevel: 'silent',
      absWorkingDir: h.root,
    });
    const bundle = fs.readFileSync(path.join(out, 'files.js'), 'utf8');
    for (const port of [3000, OTHER_PORT]) if (await h.portAnswers(port)) throw new Error(`something already answers on 127.0.0.1:${port}`);
    site = siteServer(bundle, seen);
    await new Promise((r) => site.listen(3000, '127.0.0.1', r));
    other = http.createServer((req, res) => {
      seen.push({ port: OTHER_PORT, path: req.url, cookie: req.headers.cookie || null });
      if (req.url === '/frame.html') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end('<!doctype html><html><body><p id="other">another address</p></body></html>');
      }
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent('بعيد.txt')}` });
      res.end(AWAY);
    });
    await new Promise((r) => other.listen(OTHER_PORT, '127.0.0.1', r));

    // 1. Edge, as a browser.
    const browser = await chromium.launch(launchOptions);
    try {
      const ctx = await browser.newContext({ acceptDownloads: true });
      const tab = await ctx.newPage();
      await tab.goto(`${SITE}/`);
      await tab.waitForSelector('#browser-download', { timeout: 15000 });
      const none = await tab.evaluate(() => document.querySelectorAll('[data-phone-action]').length);
      check('in a browser: no phone button, and the asset page keeps «تنزيل» with its download address', none === 0 && (await tab.getAttribute('#browser-download', 'href')) === `/api/media/${IDS.doc}/content?download=1`, { none });
      const [download] = await Promise.all([tab.waitForEvent('download', { timeout: 10000 }), tab.click('#mail a')]);
      const asked = await tab.evaluate(() => !!document.querySelector('dialog[open]'));
      check('in a browser: a tap on a mail attachment follows its link, and nothing asks which', !asked && download.url() === `${SITE}/api/mail/file/${IDS.mail}`, { asked, url: download.url() });
      await tab.screenshot({ path: path.join(out, '00-browser.png') });
    } finally {
      await browser.close();
    }

    // 2. inside the application
    if (!(await h.emulatorReady())) throw new Error('no emulator ready');
    result.device = { model: h.shell('getprop ro.product.model'), android: h.shell('getprop ro.build.version.release'), sdk: h.shell('getprop ro.build.version.sdk') };
    reverse(3000);
    reverse(OTHER_PORT);
    h.adb(['uninstall', h.APP], { allowFail: true });
    h.adb(['install', '-r', qaApk]);
    h.shell(`am start -W -n ${h.ACTIVITY}`);
    [device] = await _android.devices({ omitDriverInstall: true });
    if (!device) throw new Error('Playwright sees no device');
    let page = await webPage(device);
    await page.waitForSelector('#asset-doc [data-phone-action]', { timeout: 60000 });
    await page.evaluate(() => {
      document.cookie = 'qa_a4=session-stand-in; max-age=3600; path=/';
    });
    const bridge = await page.evaluate(() => {
      const n = window.commsHubNative;
      return { bridge: n?.bridge, save: typeof n?.download?.save, open: typeof n?.download?.open, share: typeof n?.share?.file, frozen: Object.isFrozen(n?.download) && Object.isFrozen(n?.share) };
    });
    check('the application offers bridge version 3 or later with download (save, open) and share (file), frozen', bridge.bridge >= 3 && bridge.save === 'function' && bridge.open === 'function' && bridge.share === 'function' && bridge.frozen, bridge);
    const docActions = await actionsIn(page, '#asset-doc');
    const imgActions = await actionsIn(page, '#asset-image');
    check('a document offers «فتح الملف», «حفظ في الهاتف» and «مشاركة», in that order, in place of «تنزيل»', JSON.stringify(docActions) === '["open","save","share"]' && !(await page.$('#browser-download')), docActions);
    check('a picture, which shows in the page, offers «حفظ في الهاتف» and «مشاركة» only', JSON.stringify(imgActions) === '["save","share"]', imgActions);
    shot('01-buttons');
    // Capacitor's own Java interfaces would reach every frame of every address; the application takes them off.
    const INTERFACES = ['CapacitorCookiesAndroidInterface', 'CapacitorHttpAndroidInterface', 'androidBridge'];
    const inTop = await page.evaluate((names) => names.map((n) => typeof window[n]), INTERFACES);
    await page.evaluate(
      (src) =>
        new Promise((resolve) => {
          const f = document.createElement('iframe');
          f.id = 'qa-frame';
          f.src = src;
          f.onload = () => resolve(true);
          document.body.appendChild(f);
          setTimeout(() => resolve(false), 15000);
        }),
      `http://127.0.0.1:${OTHER_PORT}/frame.html`,
    );
    const frame = page.frames().find((f) => f.url().startsWith(`http://127.0.0.1:${OTHER_PORT}/`));
    const inFrame = frame ? await frame.evaluate((names) => names.map((n) => typeof window[n]).concat(typeof window.commsHubNative), INTERFACES) : null;
    check('Capacitor\'s cookie and HTTP interfaces are not in the site\'s page, and nothing native is in a frame of another address', inTop[0] === 'undefined' && inTop[1] === 'undefined' && !!inFrame && inFrame.every((t) => t === 'undefined'), { inTop, inFrame });
    await page.evaluate(() => document.getElementById('qa-frame')?.remove());

    // 3. «حفظ في الهاتف»
    h.shell('rm -rf /sdcard/Download/* /sdcard/Pictures/* /sdcard/Movies/*', { allowFail: true });
    const mark = seen.length;
    await tapOn(page, '#asset-doc [data-phone-action="save"]');
    const docSaved = await waitFor(() => sums('/sdcard/Download/*').find((f) => f.sum === sha(PDF)));
    check('«حفظ في الهاتف» puts a document in Downloads under the site\'s Arabic name, with its bytes', !!docSaved && docSaved.file.endsWith('/Download/تقرير الربع.pdf'), docSaved);
    const docReq = seen.slice(mark).find((r) => r.path.startsWith(`/api/media/${IDS.doc}/`));
    check('it is fetched from the download address the library records, with the site\'s cookie, by the application', !!docReq && docReq.path === `/api/media/${IDS.doc}/content?download=1` && (docReq.cookie || '').includes('qa_a4=session-stand-in'), docReq);
    await tapOn(page, '#asset-image [data-phone-action="save"]');
    const imgSaved = await waitFor(() => sums('/sdcard/Pictures/*/*').find((f) => f.sum === sha(PNG)));
    check('a picture goes to the gallery, in the application\'s album, with its bytes', !!imgSaved && imgSaved.file === `/sdcard/Pictures/${ALBUM}/شعار المركز.png`, imgSaved);
    await tapOn(page, '#chat a');
    const chatSheet = await waitFor(() => sheet(page), 10000);
    check('a tap on a file in «المراسلة» asks which, with the file\'s name, the three actions and «إلغاء»', !!chatSheet && chatSheet.name === 'مقطع.mp4' && JSON.stringify(chatSheet.actions) === '["open","save","share"]' && chatSheet.cancel, chatSheet);
    shot('02-which');
    await tapOn(page, 'dialog.phone-file[open] [data-phone-action="save"]');
    const vidSaved = await waitFor(() => sums('/sdcard/Movies/*/*').find((f) => f.sum === sha(VIDEO)));
    check('a video goes to the gallery, in the application\'s album, with its bytes', !!vidSaved && vidSaved.file === `/sdcard/Movies/${ALBUM}/مقطع.mp4`, vidSaved);
    const closedAfter = await waitFor(async () => !(await sheet(page)), 8000);
    check('the window closes once the action is done', !!closedAfter);

    // 4. the back key
    await tapOn(page, '#mail a');
    await waitFor(() => sheet(page), 10000);
    h.shell('input keyevent 4');
    await h.sleep(1000);
    check('the back key closes the window that asks, and the page stays', !(await sheet(page)) && ours() && page.url().startsWith(`${SITE}/`), page.url());

    // 5. «فتح الملف»
    const viewers = h.shell('cmd package query-activities --brief -a android.intent.action.VIEW -t application/pdf -d content://x/y.pdf', { allowFail: true });
    result.pdfViewers = viewers;
    await tapOn(page, '#asset-doc [data-phone-action="open"]');
    const opened = await waitFor(() => (!ours() ? h.resumed() : null), 20000);
    const copies = sharedCopies();
    check('«فتح الملف» opens the phone\'s own viewer, outside the application', !!opened, { opened, viewers });
    check('the viewer reads a copy in the application\'s cache folder, with the file\'s bytes and name', copies.some((c) => c.sum === sha(PDF) && c.file.endsWith('/تقرير الربع.pdf')), copies);
    shot('03-viewer');
    const openReq = seen.find((r) => r.path === `/api/media/${IDS.doc}/content?v=2`);
    check('opening asks for the version shown, not the download the library would record', !!openReq && (openReq.cookie || '').includes('qa_a4='), openReq);
    page = await backToApp(device);

    // 6. «مشاركة»
    await page.waitForSelector('#mail a', { timeout: 30000 });
    await tapOn(page, '#mail a');
    await waitFor(() => sheet(page), 10000);
    await tapOn(page, 'dialog.phone-file[open] [data-phone-action="share"]');
    const chooser = await waitFor(() => (!ours() || /ChooserActivity|intentresolver/i.test(h.resumed() || '') ? h.resumed() : null), 20000);
    shot('04-share-sheet');
    check('«مشاركة» opens Android\'s share sheet', !!chooser && /chooser|intentresolver/i.test(chooser), chooser);
    check('the share sheet is given a copy in the application\'s cache folder, with the file\'s bytes', sharedCopies().some((c) => c.sum === sha(TXT) && c.file.endsWith('/ملاحظات الاجتماع.txt')));
    h.shell('input keyevent 4');
    await h.sleep(1200);
    page = await backToApp(device);
    await page.waitForSelector('#large a', { timeout: 30000 });
    const before = sharedCopies().length;
    await tapOn(page, '#large a');
    await waitFor(() => sheet(page), 10000);
    await tapOn(page, 'dialog.phone-file[open] [data-phone-action="share"]');
    const question = await waitFor(() => h.screenNodes().find((n) => n.text.includes('ميغابايت')), 20000);
    shot('05-large');
    check('a file over 50 MB says its size before it is fetched to share', !!question && question.text.includes('60 ميغابايت') && question.text.includes('هل تتابع'), question?.text);
    const cancel = h.screenNodes().find((n) => n.text === 'إلغاء' && n.pkg === h.APP);
    if (cancel) h.tap(cancel.x, cancel.y);
    await h.sleep(1500);
    check('«إلغاء» fetches nothing and keeps nothing', !!cancel && sharedCopies().length === before && ours(), { before, after: sharedCopies().length });

    // 7. a redirect away from the list
    page = await backToApp(device);
    await page.waitForSelector('#away a', { timeout: 30000 });
    const markAway = seen.length;
    await tapOn(page, '#away a');
    await waitFor(() => sheet(page), 10000);
    await tapOn(page, 'dialog.phone-file[open] [data-phone-action="save"]');
    const awaySaved = await waitFor(() => sums('/sdcard/Download/*').find((f) => f.sum === sha(AWAY)));
    const hops = seen.slice(markAway);
    const first = hops.find((r) => r.port === 3000 && r.path === `/api/chat/file/${IDS.away}`);
    const second = hops.find((r) => r.port === OTHER_PORT);
    check('a redirect to another address is followed without the site\'s cookie', !!awaySaved && !!first && (first.cookie || '').includes('qa_a4=') && !!second && second.cookie === null, { first, second });

    // 8. what a page may name
    const markTries = seen.length;
    const tries = await page.evaluate(async (id) => {
      const out = {};
      const asks = {
        'a page of the site': '/privacy.html',
        'another address': 'http://127.0.0.1:3001/elsewhere.txt',
        'a path that climbs': `/api/media/${id}/../../files.js`,
        'another site written as a path': `//127.0.0.1:3001/api/chat/file/${id}`,
        'a query the route does not take': `/api/media/${id}/content?v=2&x=1`,
        'nothing': undefined,
      };
      for (const [k, p] of Object.entries(asks)) {
        for (const [what, fn] of [['save', window.commsHubNative.download.save], ['open', window.commsHubNative.download.open], ['share', window.commsHubNative.share.file]]) {
          try {
            await fn({ path: p, name: 'x' });
            out[`${k} (${what})`] = 'answered';
          } catch (e) {
            out[`${k} (${what})`] = String(e && e.message);
          }
        }
      }
      return out;
    }, IDS.doc);
    const refused = Object.values(tries).every((v) => v === 'refused');
    const askedServer = seen.slice(markTries);
    check('a page can name only a file route of its own site: everything else is refused and nothing is fetched', refused && askedServer.length === 0, { tries, fetched: askedServer });

    // 9. the progress notice
    h.shell(`pm grant ${h.APP} android.permission.POST_NOTIFICATIONS`, { allowFail: true });
    await tapOn(page, '#slow a');
    await waitFor(() => sheet(page), 10000);
    await tapOn(page, 'dialog.phone-file[open] [data-phone-action="save"]');
    const showing = await waitFor(() => {
      const n = h.shell('dumpsys notification --noredact', { allowFail: true });
      return n.split('NotificationRecord').some((r) => r.includes(`pkg=${h.APP}`) && r.includes('downloads') && r.includes('بطيء.bin')) ? true : null;
    }, 8000);
    const slowSaved = await waitFor(() => sums('/sdcard/Download/*').find((f) => f.sum === sha(SLOW)), 30000);
    await h.sleep(1500);
    const gone = !h.shell('dumpsys notification --noredact', { allowFail: true }).split('NotificationRecord').some((r) => r.includes(`pkg=${h.APP}`) && r.includes('بطيء.bin'));
    check('once notices are allowed, a notice shows a file\'s progress in «التنزيلات» and goes when it ends', !!showing && !!slowSaved && gone, { showing, saved: !!slowSaved, gone });
    note('The application\'s short messages (started, done, failed) are Android toasts, which UI Automator cannot read; they were not read by this check.');
    note(`Viewers of a PDF on this emulator: ${viewers.split('\n').filter((l) => l.includes('/')).join(', ') || 'none listed'}.`);
  } catch (e) {
    check('the check ran to its end', false, String(e && e.stack ? e.stack : e));
  } finally {
    try {
      unreverse(3000);
      unreverse(OTHER_PORT);
      h.adb(['uninstall', h.APP], { allowFail: true });
      note(`After the check: ${h.shell(`pm list packages ${h.APP}`, { allowFail: true }) || 'the check package is uninstalled'}.`);
    } catch {
      // the emulator may be gone
    }
    if (device) await device.close().catch(() => undefined);
    if (site) site.close();
    if (other) other.close();
  }
  process.exitCode = finish(path.join(__dirname, 'android-files.json')) ? 1 : 0;
})();

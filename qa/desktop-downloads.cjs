// Browser and application check of «فتح بالبرنامج الافتراضي» (Desktop_Power_Ideas.md P-28; MVP_draft.md 63.10;
// desktop/src/downloads.ts, download-store.ts, native-files.ts; src/components/native/desktop-downloads.tsx). Signed out, on
// a fixture site at 127.0.0.1:3000 that answers three of the site's file routes (a library PDF, a mail attachment, a file
// named tool.exe in «المراسلة») and one address that is not a file route. Nothing is opened for real: inside the
// application's main process `shell.openPath` and `shell.showItemInFolder` are recorded instead, and the save dialog is
// answered with a scratch folder.
//   - bridge version 10 with downloads.open, show and onDone;
//   - each route's download heard by the page with an id, its saved name and its kind, never a path; nothing for the other
//     address;
//   - every saved file carries Windows' Zone.Identifier in the internet zone (who wrote it is recorded);
//   - a PDF opens and shows; tool.exe is refused («kind») and only shows; a PDF whose mark was taken off is refused
//     («unmarked»); an unknown id is «gone»; an id that is not one is refused by the bridge;
//   - the notice: its line and «فتح بالبرنامج الافتراضي» for the PDF, which opens; for tool.exe no open button, its words and
//     «إظهار في المجلد»; nothing in Edge.
// Usage: node qa/desktop-downloads.cjs   (writes qa/desktop-downloads.json)   Needs: npm run pack:dev in desktop/.
const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');
const { dependency, launchOptions } = require('./runtime.cjs');
const { chromium } = dependency('playwright');
const h = require('./desktop-helpers.cjs');
const LINKS = require('./fixtures/desktop-downloads-links.json');

const { check, note, result, finish } = h.record('qa/desktop-downloads.cjs');
const out = path.join(__dirname, 'artifacts', 'desktop-downloads');
const css = fs.readFileSync(path.join(h.root, 'src', 'app', 'globals.css'), 'utf8').replace(/^@import[^\n]*\n/m, '').replace(/^@theme\{[^\n]*\}\n/m, '');
const fontDir = (pkg) => path.join(h.root, 'node_modules', '@fontsource', pkg);
const fontCss = [['ibm-plex-sans-arabic', '400'], ['ibm-plex-sans-arabic', '600']]
  .map(([pkg, w]) => fs.readFileSync(path.join(fontDir(pkg), `${w}.css`), 'utf8').replace(/url\(\.\/files\//g, `url(/fonts/${pkg}/`))
  .join('\n');
const html = (body) => `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>التنزيلات</title><style>${fontCss}\n${css}\nbody{font-family:"IBM Plex Sans Arabic",sans-serif}</style></head><body>${body}</body></html>`;
// the plain page: the links, and the page's own listener in place of the notice, so the check knows each id
const plain = html(`<h1 id="ready">التنزيلات</h1>${LINKS.map((l) => `<p><a id="${l.id}" href="${l.href}">${l.label}</a></p>`).join('')}
<script>window.__heard = []; if (window.commsHubNative && window.commsHubNative.downloads) window.commsHubNative.downloads.onDone((d) => window.__heard.push(d));</script>`);
const noticePage = html('<div id="root"></div><script type="module" src="/notice.js"></script>');
const OPEN = 'فتح بالبرنامج الافتراضي';
const SHOW = 'إظهار في المجلد';
const NEVER = 'لا يُفتح هذا النوع من الملفات من داخل التطبيق، ويمكن إظهاره في مجلده.';
const mark = (file) => {
  try {
    return fs.readFileSync(`${file}:Zone.Identifier`, 'latin1');
  } catch {
    return null;
  }
};
const zone = (text) => (text && /^\s*\[ZoneTransfer\]/im.test(text) ? Number((/^\s*ZoneId\s*=\s*(\d+)/im.exec(text) || [])[1]) : null);
async function picture(tab, file) {
  try {
    await tab.screenshot({ path: path.join(out, file), timeout: 15000 });
  } catch {
    note(`No picture of ${file}.`);
  }
}

(async () => {
  let site;
  try {
    fs.rmSync(out, { recursive: true, force: true });
    fs.mkdirSync(out, { recursive: true });
    await esbuild.build({
      entryPoints: [path.join(__dirname, 'fixtures', 'desktop-downloads.tsx')],
      bundle: true,
      format: 'esm',
      platform: 'browser',
      target: 'es2022',
      jsx: 'automatic',
      splitting: true,
      outdir: out,
      entryNames: 'notice',
      alias: { 'next/navigation': path.join(__dirname, 'fixtures', 'fake-next.tsx'), 'next/link': path.join(__dirname, 'fixtures', 'fake-next.tsx') },
      define: { 'process.env.NODE_ENV': '"production"' },
      logLevel: 'silent',
      absWorkingDir: h.root,
    });
    const routes = { '/': ['text/html; charset=utf-8', plain], '/notice': ['text/html; charset=utf-8', noticePage] };
    for (const l of LINKS) {
      routes[l.href.split('?')[0]] = (_req, res) => {
        res.writeHead(200, { 'content-type': l.type, 'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(l.name)}`, 'cache-control': 'no-store' });
        res.end(l.body);
      };
    }
    site = h.pages(routes);
    const base = site.server.listeners('request')[0];
    site.server.removeAllListeners('request');
    site.server.on('request', (req, res) => {
      const p = req.url.split('?')[0];
      const js = /^\/([\w-]+\.js)$/.exec(p);
      if (js && fs.existsSync(path.join(out, js[1]))) return (res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' }), res.end(fs.readFileSync(path.join(out, js[1]))));
      const font = /^\/fonts\/([a-z-]+)\/(.+\.woff2?)$/.exec(p);
      if (font) return (res.writeHead(200, { 'content-type': 'font/woff2' }), res.end(fs.readFileSync(path.join(fontDir(font[1]), 'files', font[2]))));
      return base(req, res);
    });
    if (await h.portAnswers(3000)) throw new Error('something already answers on 127.0.0.1:3000');
    await h.listen(site.server, 3000);

    // Edge: a browser's download, and no notice
    const browser = await chromium.launch(launchOptions);
    try {
      const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1000, height: 600 } });
      const tab = await ctx.newPage();
      await tab.goto('http://127.0.0.1:3000/notice');
      await tab.waitForSelector('#ready', { timeout: 15000 });
      const [dl] = await Promise.all([tab.waitForEvent('download', { timeout: 15000 }), tab.click('#library')]);
      await dl.path();
      await h.sleep(1500);
      check('in a browser the download is the browser\'s, and there is no notice', (await tab.locator('[data-download-note]').count()) === 0, { file: dl.suggestedFilename() });
    } finally {
      await browser.close();
    }

    // the application: the save dialog answered with a scratch folder, opening and showing recorded
    const { app, win } = await h.launchDev('downloads', { settings: { keepInTray: false, gpu: 'auto' } });
    await h.until(() => win.url().startsWith('http://127.0.0.1:3000'), 30000);
    await win.waitForSelector('#ready', { timeout: 20000 });
    const saved = path.join(h.scratch, 'saved');
    const into = async (folder) => {
      fs.mkdirSync(folder, { recursive: true });
      await app.evaluate(({}, f) => {
        globalThis.__dir = f;
      }, folder);
    };
    await app.evaluate(({ session, shell }, sep) => {
      const g = globalThis;
      Object.assign(g, { __saved: [], __openedPaths: [], __shownPaths: [] });
      shell.openPath = async (p) => (g.__openedPaths.push(p), '');
      shell.showItemInFolder = (p) => void g.__shownPaths.push(p);
      // after the application's own listeners: no save dialog, the file goes to the check's folder
      session.fromPartition('persist:comms-hub').on('will-download', (_e, item) => {
        item.setSavePath(`${g.__dir}${sep}${item.getFilename()}`);
        item.once('done', (_d, state) => g.__saved.push({ name: item.getFilename(), state, file: item.getSavePath() }));
      });
    }, path.sep);
    await into(path.join(saved, 'plain'));
    const recorded = () => app.evaluate(() => ({ saved: globalThis.__saved, opened: globalThis.__openedPaths, shown: globalThis.__shownPaths }));
    const bridge = await win.evaluate(() => ({ bridge: window.commsHubNative.bridge, downloads: Object.keys(window.commsHubNative.downloads || {}) }));
    check('the bridge is version 10 or later, with downloads.open, show and onDone', bridge.bridge >= 10 && ['open', 'show', 'onDone'].every((m) => bridge.downloads.includes(m)), bridge);

    // each route's download, heard by its id, name and kind
    const heardAfter = async (id, count) => {
      await win.click(`#${id}`);
      return h.until(async () => {
        const heard = await win.evaluate(() => window.__heard);
        return heard.length >= count ? heard : null;
      }, 20000);
    };
    let heard = await heardAfter('library', 1);
    heard = await heardAfter('mail', 2);
    heard = await heardAfter('messaging', 3);
    const by = Object.fromEntries((heard || []).map((d) => [d.name, d]));
    const shapes = (heard || []).map((d) => Object.keys(d).sort().join(','));
    check(
      'a library, a mail and a messaging download are each heard once saved: an id of 43 characters, the saved name and the kind, nothing else',
      heard &&
        heard.length === 3 &&
        shapes.every((s) => s === 'id,kind,name') &&
        heard.every((d) => /^[A-Za-z0-9_-]{43}$/.test(d.id)) &&
        new Set(heard.map((d) => d.id)).size === 3 &&
        by['تقرير الحملة.pdf']?.kind === 'document' &&
        by['ملاحظات.txt']?.kind === 'document' &&
        by['tool.exe']?.kind === null,
      heard,
    );
    let r = await recorded();
    const fileOf = (name) => r.saved.find((s) => s.name === name)?.file;
    const marks = Object.fromEntries(LINKS.slice(0, 3).map((l) => [l.name, mark(fileOf(l.name))]));
    result.marks = marks;
    check(
      'every saved download carries Windows\' Zone.Identifier in the internet zone, the PDF, the text file and tool.exe alike',
      Object.values(marks).every((m) => zone(m) === 3),
      { marks, by: Object.fromEntries(Object.entries(marks).map(([k, m]) => [k, m && /ReferrerUrl|HostUrl=http:\/\/127\.0\.0\.1:3000\/api/.test(m) ? 'Chromium' : 'the application'])) },
    );
    result.markWrittenBy = Object.values(marks).every((m) => m && /ReferrerUrl|HostUrl=http:\/\/127\.0\.0\.1:3000\/api/.test(m)) ? 'Chromium' : 'the application, at least for one';

    // opening and showing
    const pdf = by['تقرير الحملة.pdf'];
    const exe = by['tool.exe'];
    const ask = (action, id) => win.evaluate(([a, i]) => window.commsHubNative.downloads[a](i).then((x) => x, (e) => ({ threw: String(e && e.message) })), [action, id]);
    const opened = await ask('open', pdf.id);
    const shown = await ask('show', pdf.id);
    r = await recorded();
    check('the PDF opens in its program and shows in its folder, by its id', opened.ok === true && shown.ok === true && r.opened.length === 1 && r.opened[0] === fileOf('تقرير الحملة.pdf') && r.shown[0] === fileOf('تقرير الحملة.pdf'), { opened, shown, r: { opened: r.opened.length, shown: r.shown.length } });
    const exeOpen = await ask('open', exe.id);
    const exeShow = await ask('show', exe.id);
    r = await recorded();
    check('tool.exe is refused for its kind and never handed to Windows; it can still be shown in its folder', exeOpen.ok === false && exeOpen.why === 'kind' && r.opened.length === 1 && exeShow.ok === true && r.shown.length === 2 && r.shown[1] === fileOf('tool.exe'), { exeOpen, exeShow, opened: r.opened });
    fs.rmSync(`${fileOf('تقرير الحملة.pdf')}:Zone.Identifier`);
    const unmarked = await ask('open', pdf.id);
    r = await recorded();
    check('a PDF whose mark of the web was taken off is no longer opened', unmarked.ok === false && unmarked.why === 'unmarked' && r.opened.length === 1, unmarked);
    const unknown = await ask('open', 'A'.repeat(43));
    const notAnId = await ask('open', 12);
    const aPath = await ask('open', fileOf('ملاحظات.txt'));
    check('an unknown id is «gone»; a number or a path in place of an id is refused by the bridge', unknown.ok === false && unknown.why === 'gone' && !!notAnId.threw && !!aPath.threw, { unknown, notAnId, aPath });

    // an address that is not one of the site's file routes: saved by Chromium, not offered
    await win.click('#other');
    await h.until(async () => ((await recorded()).saved.some((s) => s.name === 'elsewhere.pdf') ? true : null), 20000);
    await h.sleep(1500);
    check('a download from an address that is not one of the site\'s file routes is saved and not offered', (await win.evaluate(() => window.__heard.length)) === 3 && (await recorded()).saved.some((s) => s.name === 'elsewhere.pdf' && s.state === 'completed'));

    // the notice
    await into(path.join(saved, 'notice'));
    await win.goto('http://127.0.0.1:3000/notice');
    await win.waitForSelector('#ready', { timeout: 20000 });
    await win.setViewportSize({ width: 1000, height: 600 }).catch(() => undefined);
    await win.click('#library');
    await win.waitForSelector('[data-download-note]', { timeout: 20000 });
    const noteText = () => win.evaluate(() => document.querySelector('[data-download-note]').innerText);
    const buttons = () => win.evaluate(() => [...document.querySelectorAll('[data-download-note] [data-download]')].map((b) => b.textContent.trim()));
    const t1 = await noteText();
    const b1 = await buttons();
    await picture(win, 'notice-pdf.png');
    const before = (await recorded()).opened.length;
    await win.click('[data-download="open"]');
    await h.until(async () => ((await recorded()).opened.length > before ? true : null), 10000);
    r = await recorded();
    check('the notice says «حُفظ «تقرير الحملة.pdf».» with «فتح بالبرنامج الافتراضي» and «إظهار في المجلد», and its open button opens the file', t1.includes('حُفظ «تقرير الحملة.pdf».') && JSON.stringify(b1) === JSON.stringify([OPEN, SHOW]) && r.opened.at(-1) === r.saved.at(-1).file, { t1, b1, last: r.opened.at(-1) });
    await win.click('#messaging');
    await h.until(async () => ((await noteText()).includes('tool.exe') ? true : null), 20000);
    const t2 = await noteText();
    const b2 = await buttons();
    await picture(win, 'notice-exe.png');
    await win.click('[data-download="show"]');
    await h.until(async () => ((await recorded()).shown.at(-1)?.endsWith('tool.exe') ? true : null), 10000);
    check('for tool.exe the notice has no open button, says it never opens, and shows it in its folder', t2.includes('حُفظ «tool.exe».') && t2.includes(NEVER) && JSON.stringify(b2) === JSON.stringify([SHOW]) && (await recorded()).shown.at(-1).endsWith('tool.exe'), { t2, b2 });
    check('no emoji in what the notice shows', !/\p{Extended_Pictographic}/u.test(`${t1}${t2}`));
  } catch (e) {
    check('the check ran to its end', false, String((e && e.stack) || e));
  } finally {
    await h.closeAll();
    site?.server.close();
  }
  const failed = finish(path.join(__dirname, 'desktop-downloads.json'));
  process.exit(failed ? 1 : 0);
})();

// Browser and application check of «معلومات الجهاز» with D9's part (Desktop_Power_Ideas.md P-01, P-33, P-36;
// MVP_draft.md 63.6). The real component (src/components/native/device-info.tsx) on a fixture page, signed out: the
// studio's home needs a signed-in person, which no check has.
//   In Edge, as a browser: the facts as before, and nothing of D9.
//   Inside the development package, on a fresh profile: «بطاقة الرسوميات للاستوديو» with «تلقائي» chosen, its hint,
//   «قياس قدرة الجهاز» pressed and followed to its line, «التفاصيل» opened with the figures, «الأداء» and the plan;
//   «أخف على الجهاز» lowers no knob above «تلقائي» and is remembered; «الأقوى» asks for a restart. Pictures are kept.
// Usage: node qa/desktop-device-panel.cjs   (writes qa/desktop-device-panel.json)   Needs: npm run pack:dev in desktop/.
const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');
const { dependency, launchOptions } = require('./runtime.cjs');
const { chromium } = dependency('playwright');
const h = require('./desktop-helpers.cjs');

const { check, note, result, finish } = h.record('qa/desktop-device-panel.cjs');
const out = path.join(__dirname, 'artifacts', 'desktop-device-panel');
const css = [
  fs.readFileSync(path.join(h.root, 'src', 'app', 'globals.css'), 'utf8').replace(/^@import[^\n]*\n/m, '').replace(/^@theme\{[^\n]*\}\n/m, ''),
  fs.readFileSync(path.join(h.root, 'src', 'components', 'studio', 'studio.css'), 'utf8'),
].join('\n');
const fontDir = (pkg) => path.join(h.root, 'node_modules', '@fontsource', pkg);
const fontCss = [['ibm-plex-sans-arabic', '400'], ['ibm-plex-sans-arabic', '600'], ['reem-kufi', '600'], ['aref-ruqaa', '700']]
  .map(([pkg, w]) => fs.readFileSync(path.join(fontDir(pkg), `${w}.css`), 'utf8').replace(/url\(\.\/files\//g, `url(/fonts/${pkg}/`))
  .join('\n');
const page = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>معلومات الجهاز</title><style>${fontCss}\n${css}\nbody{font-family:"IBM Plex Sans Arabic",sans-serif}</style></head><body><div id="root"></div><script type="module" src="/panel.js"></script></body></html>`;
const text = (tab) => tab.evaluate(() => document.querySelector('#panel').innerText);
const pressed = (tab, group) => tab.evaluate((g) => [...document.querySelectorAll(`[aria-labelledby="${g}"] button[aria-pressed="true"]`)].map((b) => b.textContent), group);
const lines = (tab, scope) =>
  tab.evaluate((s) => Object.fromEntries([...document.querySelectorAll(`${s} li`)].map((li) => { const t = li.innerText; const at = t.indexOf(':'); return [t.slice(0, at).trim(), t.slice(at + 1).trim()]; })), scope);

async function picture(tab, file) {
  for (let i = 0; i < 2; i++) {
    try {
      await tab.screenshot({ path: path.join(out, file), fullPage: true, timeout: 15000 });
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
      entryPoints: [path.join(__dirname, 'fixtures', 'desktop-device-panel.tsx')],
      bundle: true,
      format: 'esm',
      platform: 'browser',
      target: 'es2022',
      jsx: 'automatic',
      splitting: true,
      outdir: out,
      entryNames: 'panel',
      alias: { 'next/navigation': path.join(__dirname, 'fixtures', 'fake-next.tsx'), 'next/link': path.join(__dirname, 'fixtures', 'fake-next.tsx') },
      define: { 'process.env.NODE_ENV': '"production"' },
      logLevel: 'silent',
      absWorkingDir: h.root,
    });
    const site0 = h.pages({ '/': ['text/html; charset=utf-8', page] });
    const routes = site0.server.listeners('request')[0];
    site0.server.removeAllListeners('request');
    site0.server.on('request', (req, res) => {
      const p = req.url.split('?')[0];
      const js = /^\/([\w-]+\.js)$/.exec(p);
      if (js && fs.existsSync(path.join(out, js[1]))) return (res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' }), res.end(fs.readFileSync(path.join(out, js[1]))));
      const font = /^\/fonts\/([a-z-]+)\/(.+\.woff2?)$/.exec(p);
      if (font) return (res.writeHead(200, { 'content-type': 'font/woff2' }), res.end(fs.readFileSync(path.join(fontDir(font[1]), 'files', font[2]))));
      return routes(req, res);
    });
    site = site0;
    if (await h.portAnswers(3000)) throw new Error('something already answers on 127.0.0.1:3000');
    await h.listen(site.server, 3000);

    // Edge, as a browser: nothing of D9.
    const browser = await chromium.launch(launchOptions);
    try {
      const tab = await browser.newPage({ viewport: { width: 900, height: 900 } });
      await tab.goto('http://127.0.0.1:3000/');
      await h.until(async () => (await text(tab)).includes('يعمل في'), 15000);
      const t = await text(tab);
      check('in a browser the panel shows the facts as before, and no chip choice, measurement or details', t.includes('المتصفح') && !t.includes('قياس قدرة الجهاز') && !t.includes('بطاقة الرسوميات للاستوديو') && !t.includes('التفاصيل'), t);
      await picture(tab, 'browser.png');
    } finally {
      await browser.close();
    }

    // The application, on a fresh profile.
    const { app, win } = await h.launchDev('panel', { settings: { keepInTray: false, gpu: 'auto' } });
    await h.instrument(app);
    await h.until(() => win.url().startsWith('http://127.0.0.1:3000'), 30000);
    await win.setViewportSize({ width: 900, height: 900 }).catch(() => undefined);
    await h.until(async () => (await text(win)).includes('قياس قدرة الجهاز'), 20000);
    let t = await text(win);
    const info = await win.evaluate(() => window.commsHubNative.info());
    const two = info.gpu.chips.length >= 2;
    check('inside the application: the chip choice (on a laptop with two chips), «تلقائي» chosen, its hint, the measurement and its words', (!two || (t.includes('بطاقة الرسوميات للاستوديو') && JSON.stringify(await pressed(win, 'dv-gpu')) === JSON.stringify(['تلقائي']) && t.includes('بعد قياس البطاقتين') && t.includes('لقياس البطاقة الأخرى'))) && t.includes('يقيس التطبيق ما يقدر عليه هذا الجهاز في نحو نصف دقيقة. لا يُرسل شيء خارج الجهاز.') && !t.includes('التفاصيل'), { two, chips: info.gpu.chips, text: t });
    check('inside the application the Windows guide to the stronger chip gives way to the choice', !t.includes('أداء عالٍ'), t);
    await picture(win, 'app-before.png');

    // «قياس قدرة الجهاز», followed to its line
    await win.getByRole('button', { name: 'قياس قدرة الجهاز' }).click();
    const progressed = await h.until(async () => /جارٍ القياس \d+٪/.test(await text(win)), 10000);
    check('while measuring: the progress and «إلغاء»', !!progressed && (await text(win)).includes('إلغاء'), await text(win));
    const done = await h.until(async () => (await text(win)).includes('سرعة التصدير المرجعية'), 240000, 1000);
    t = await text(win);
    check('after measuring: one line with the reference export, and «التفاصيل»', !!done && /سرعة التصدير المرجعية [\d.]+ إطار\/ث \(1080p\) على /.test(t) && t.includes('التفاصيل'), t);

    // «التفاصيل»
    await win.locator('.dv-details > summary').click();
    const figures = await lines(win, '.dv-details > ul:first-of-type');
    check('«التفاصيل»: the figures in Arabic, with the chip and the power it was measured on', ['قيس على', 'سرعة التصدير المرجعية', 'ترميز H.264 بمقاس 1080p', 'ترميز H.264 بمقاس 4K', 'فك ترميز H.264 بمقاس 4K', 'مرمّزات تعمل معاً (1080p)', 'رسم إطار 1080p', 'ثبات القياس'].every((k) => k in figures) && /موصول بالكهرباء|على البطارية/.test(figures['قيس على']), figures);
    const planOf = () => lines(win, '.dv-details > ul:last-of-type');
    const auto = await planOf();
    check('«التفاصيل»: «الأداء» at «تلقائي», and the plan under its note', JSON.stringify(await pressed(win, 'dv-perf')) === JSON.stringify(['تلقائي']) && (await text(win)).includes('هذه القيم خطة الاستوديو على هذا الجهاز: يتبعها في المعاينة والتصدير والنسخ الخفيفة وتعديل الصور') && !(await text(win)).includes('المراحل القادمة') && Object.keys(auto).length === 5, auto);
    await picture(win, 'app-details.png');
    await win.getByRole('button', { name: 'أخف على الجهاز' }).click();
    await h.sleep(300);
    const light = await planOf();
    const lanes = (p) => Number(p['مسارات التصدير معاً']);
    const workers = (p) => Number(p['عمّال تعديل الصور']);
    const stored = await win.evaluate(() => localStorage.getItem('studio.pref.performance'));
    check('«أخف على الجهاز»: no lane or worker above «تلقائي», and the choice is remembered on this device', lanes(light) <= lanes(auto) && workers(light) <= workers(auto) && stored === '"light"', { auto, light, stored });

    // «الأقوى» asks for a restart (not pressed: the check does not restart the application)
    if (two) {
      await win.getByRole('button', { name: 'الأقوى', exact: true }).click();
      const asked = await h.until(async () => (await text(win)).includes('تُطبَّق بعد إعادة تشغيل التطبيق.'), 5000);
      const state = await win.evaluate(() => window.commsHubNative.gpu.state());
      check('«الأقوى»: kept by the application, and «إعادة التشغيل الآن» offered', !!asked && state.choice === 'strong' && (await text(win)).includes('إعادة التشغيل الآن'), state);
      await picture(win, 'app-restart.png');
    }
    check('no emoji in what the panel shows', !/\p{Extended_Pictographic}/u.test(await text(win)));
  } catch (e) {
    check('the check ran to its end', false, String((e && e.stack) || e));
  } finally {
    await h.closeAll();
    if (site) site.server.close();
  }
  const failed = finish(path.join(__dirname, 'desktop-device-panel.json'));
  process.exit(failed ? 1 : 0);
})();

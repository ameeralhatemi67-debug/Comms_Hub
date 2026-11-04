// Browser and application check of the studio's note when the device is not measured or its measurement is stale
// (MVP_draft.md 63.6.1; src/lib/native/device.ts measureState, src/components/native/measure-note.tsx). The real
// component on a fixture page, signed out (the studio's home and the editors need a signed-in person, which no check has):
//   - in Edge: nothing;
//   - in the development package on a fresh profile: «لم يُقَس هذا الجهاز بعد…», its button opening «معلومات الجهاز» at the
//     measurement, the note hidden while the page is busy, «لاحقاً» kept across a reload and shown again under another
//     chip switch (a new key);
//   - with a profile measured under another key: the stale note for each reason (the application, the chip, the driver), and
//     the same words in «معلومات الجهاز» beside its button; and a laptop where only the other chip was measured (the
//     application started on the other switch, with no entry for the chip it runs on);
//   - with a measurement for the current key, or once one is saved: no note.
// Usage: node qa/desktop-measure-note.cjs   (writes qa/desktop-measure-note.json)   Needs: npm run pack:dev in desktop/.
const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');
const { dependency, launchOptions } = require('./runtime.cjs');
const { chromium } = dependency('playwright');
const h = require('./desktop-helpers.cjs');

const { check, result, finish } = h.record('qa/desktop-measure-note.cjs');
const out = path.join(__dirname, 'artifacts', 'desktop-measure-note');
const css = [
  fs.readFileSync(path.join(h.root, 'src', 'app', 'globals.css'), 'utf8').replace(/^@import[^\n]*\n/m, '').replace(/^@theme\{[^\n]*\}\n/m, ''),
  fs.readFileSync(path.join(h.root, 'src', 'components', 'studio', 'studio.css'), 'utf8'),
].join('\n');
const fontDir = (pkg) => path.join(h.root, 'node_modules', '@fontsource', pkg);
const fontCss = [['ibm-plex-sans-arabic', '400'], ['ibm-plex-sans-arabic', '600']]
  .map(([pkg, w]) => fs.readFileSync(path.join(fontDir(pkg), `${w}.css`), 'utf8').replace(/url\(\.\/files\//g, `url(/fonts/${pkg}/`))
  .join('\n');
const page = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>الاستوديو</title><style>${fontCss}\n${css}\nbody{font-family:"IBM Plex Sans Arabic",sans-serif}</style></head><body><div id="root"></div><script type="module" src="/note.js"></script></body></html>`;

const NEVER = 'لم يُقَس هذا الجهاز بعد، فيعمل الاستوديو بأبسط إعداداته. القياس نحو نصف دقيقة، ولا يُرسل شيء خارج الجهاز.';
const STALE = (reason) => `${reason} منذ آخر قياس، فعاد الاستوديو إلى أبسط إعداداته حتى يُقاس الجهاز من جديد.`;
const numbers = {
  v: 1,
  encode: { h264_1080: { hw: 300, sw: 60 }, h264_2160: { hw: 90, sw: 15 } },
  decode: { h264_2160: { hw: 200, sw: 40 } },
  lanes: [74.3, 115.2],
  compose: { plain: 3, text: 4, effects: 9 },
  exportFps: 76.7,
  support: { hevcEncode: true, av1Encode: false, tenBitEncode: false, hevcDecode: true, av1Decode: true },
  runs: 3,
  spread: 4,
  seconds: 30,
  renderer: 'ANGLE',
};
const noteText = (tab) => tab.evaluate(() => document.querySelector('[data-measure-note] span')?.textContent ?? null);
async function picture(tab, file) {
  try {
    await tab.screenshot({ path: path.join(out, file), fullPage: true, timeout: 15000 });
  } catch {
    // a picture is a convenience
  }
}
/** A profile folder holding one measurement under `key`, before the application starts on it. */
function profileWith(name, key) {
  const dir = path.join(h.scratch, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'profile.json'), JSON.stringify({ v: 1, entries: [{ at: Date.now() - 86_400_000, key, numbers }] }));
}
async function open(name, args = []) {
  const run = await h.launchDev(name, { args, settings: { keepInTray: false, gpu: 'auto' } });
  await h.until(() => run.win.url().startsWith('http://127.0.0.1:3000'), 30000);
  await run.win.waitForSelector('#ready', { timeout: 20000 });
  return run;
}
const close = (run) => Promise.race([run.app.close().catch(() => undefined), h.sleep(10000)]);

(async () => {
  let site;
  try {
    fs.rmSync(out, { recursive: true, force: true });
    fs.mkdirSync(out, { recursive: true });
    await esbuild.build({
      entryPoints: [path.join(__dirname, 'fixtures', 'desktop-measure-note.tsx')],
      bundle: true,
      format: 'esm',
      platform: 'browser',
      target: 'es2022',
      jsx: 'automatic',
      splitting: true,
      outdir: out,
      entryNames: 'note',
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

    // Edge: no application, no note
    const browser = await chromium.launch(launchOptions);
    try {
      const tab = await browser.newPage({ viewport: { width: 1000, height: 600 } });
      await tab.goto('http://127.0.0.1:3000/');
      await tab.waitForSelector('#ready', { timeout: 15000 });
      await h.sleep(2000);
      check('in a browser there is no note', (await tab.locator('[data-measure-note]').count()) === 0);
    } finally {
      await browser.close();
    }

    // the application on a fresh profile: never measured
    let run = await open('note-never');
    const shown = await h.until(() => noteText(run.win), 15000);
    check('never measured: the note says so, in one line', shown === NEVER, shown);
    await picture(run.win, 'never.png');
    const current = (await run.win.evaluate(() => window.commsHubNative.profile.read())).current;
    result.key = current;
    // the other chip's switch, as «الأقوى» or «الموفّرة للطاقة» starts it
    const otherFlag = current.switch === 'low' ? '--force_high_performance_gpu' : '--force_low_power_gpu';
    await run.win.click('[data-measure-note] button:has-text("قياس قدرة الجهاز")');
    const focused = await h.until(() => run.win.evaluate(() => (document.activeElement && document.activeElement.hasAttribute('data-measure') ? document.activeElement.textContent.trim() : null)), 20000);
    check('«قياس قدرة الجهاز» opens «معلومات الجهاز» at the measurement, its button ready', focused === 'قياس قدرة الجهاز', focused);
    await picture(run.win, 'dialog.png');
    await run.win.keyboard.press('Escape');
    await h.until(async () => ((await run.win.locator('[role="dialog"]').count()) === 0 ? true : null), 5000);
    const busy = await run.win.evaluate(async () => {
      const end = await window.__markBusy('export');
      await new Promise((r) => setTimeout(r, 300));
      const during = !!document.querySelector('[data-measure-note]');
      await end();
      await new Promise((r) => setTimeout(r, 300));
      return { during, after: !!document.querySelector('[data-measure-note]') };
    });
    check('while the page exports the note is not shown, and it comes back after', !busy.during && busy.after, busy);
    await run.win.click('[data-measure-note] button:has-text("لاحقاً")');
    const hidden = await h.until(async () => ((await run.win.locator('[data-measure-note]').count()) === 0 ? true : null), 5000);
    await run.win.reload();
    await run.win.waitForSelector('#ready', { timeout: 20000 });
    await h.sleep(2500);
    const afterReload = await run.win.locator('[data-measure-note]').count();
    check('«لاحقاً» hides it, and it stays hidden after a reload', !!hidden && afterReload === 0, { afterReload });
    await close(run);
    // the same device under another chip switch: another key, so the note comes back
    run = await open('note-never', [otherFlag]);
    const again = await h.until(() => noteText(run.win), 15000);
    const other = (await run.win.evaluate(() => window.commsHubNative.profile.read())).current;
    check(`never measured, «لاحقاً» given, then started with ${otherFlag} (another key): the note shows again`, again === NEVER && JSON.stringify(other) !== JSON.stringify(current), { again, other: { switch: other.switch, chip: other.chip.name } });
    await close(run);

    // a profile measured under another key: the stale note, each reason, and the same words in «معلومات الجهاز»
    const amd = { vendorId: 4098, deviceId: 5761, vendor: 'AMD', name: 'AMD Radeon(TM) Graphics', driver: '31.0.12044.3' };
    const cases = [
      ['app', 'تغيّر إصدار التطبيق', { ...current, app: '0.7.1' }],
      ['chip', 'تغيّرت بطاقة الرسوميات', { ...current, switch: current.switch === 'low' ? 'high' : 'low', chip: current.chip.vendorId === amd.vendorId ? { ...amd, vendorId: 4318, deviceId: 9634, vendor: 'NVIDIA', name: 'NVIDIA GeForce RTX 3050 Laptop GPU' } : amd }],
      ['driver', 'تغيّر برنامج تشغيل البطاقة', { ...current, chip: { ...current.chip, driver: '1.0.0.0' } }],
    ];
    for (const [why, what, key] of cases) {
      profileWith(`note-stale-${why}`, key);
      run = await open(`note-stale-${why}`);
      const line = await h.until(() => noteText(run.win), 15000);
      await run.win.click('[data-measure-note] button:has-text("قياس قدرة الجهاز")');
      const beside = await h.until(() => run.win.evaluate(() => document.querySelector('[data-measure-why]')?.textContent ?? null), 20000);
      check(`stale, ${why}: the note says «${what}…», and «معلومات الجهاز» says the same beside its button`, line === STALE(what) && beside === STALE(what), { line, beside });
      if (why === 'app') await picture(run.win, 'stale-app.png');
      await close(run);
    }

    // a laptop where only the other chip was measured: one measurement of the chip the application starts on by default, and
    // the application started on the other switch, as «الأقوى» or «الموفّرة للطاقة» does at the next start
    profileWith('note-other-chip', current);
    run = await open('note-other-chip', [otherFlag]);
    const otherLine = await h.until(() => noteText(run.win), 15000);
    const running = await run.win.evaluate(() => window.commsHubNative.profile.read());
    const onRunning = running.entries.filter((e) => e.key.switch === running.current.switch && e.key.chip.vendorId === running.current.chip.vendorId && e.key.chip.deviceId === running.current.chip.deviceId);
    await run.win.click('[data-measure-note] button:has-text("قياس قدرة الجهاز")');
    const otherBeside = await h.until(() => run.win.evaluate(() => document.querySelector('[data-measure-why]')?.textContent ?? null), 20000);
    result.otherChip = { flag: otherFlag, measured: { switch: current.switch, chip: current.chip.name }, running: { switch: running.current.switch, chip: running.current.chip.name } };
    check(
      `only the other chip measured (one entry for the default start, the application started with ${otherFlag}): no entry for the running chip, and the note and «معلومات الجهاز» say «تغيّرت بطاقة الرسوميات…»`,
      running.entries.length === 1 && onRunning.length === 0 && otherLine === STALE('تغيّرت بطاقة الرسوميات') && otherBeside === otherLine,
      { otherLine, otherBeside, entries: running.entries.length, onRunning: onRunning.length, ...result.otherChip },
    );
    await close(run);

    // a measurement for the current key: no note; and saving one takes the note away at once
    profileWith('note-measured', current);
    run = await open('note-measured');
    await h.sleep(3000);
    check('with a measurement for the current key there is no note', (await run.win.locator('[data-measure-note]').count()) === 0);
    await close(run);
    run = await open('note-save');
    const before = await h.until(() => noteText(run.win), 15000);
    await run.win.evaluate(async (n) => {
      await window.commsHubNative.profile.save(n);
      window.dispatchEvent(new Event('commshub:profile-saved'));
    }, numbers);
    const gone = await h.until(async () => ((await run.win.locator('[data-measure-note]').count()) === 0 ? true : null), 5000);
    check('once a measurement is saved the note goes at once, nothing measured by itself', before === NEVER && !!gone, { before });
    await close(run);
  } catch (e) {
    check('the check ran to its end', false, String((e && e.stack) || e));
  } finally {
    await h.closeAll();
    site?.server.close();
  }
  const failed = finish(path.join(__dirname, 'desktop-measure-note.json'));
  process.exit(failed ? 1 : 0);
})();

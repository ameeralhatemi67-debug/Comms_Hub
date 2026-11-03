// The device profile and the graphics chip's choice (Desktop_Power_Ideas.md P-01, P-33, P-34, P-38; MVP_draft.md
// 63.6; phase D9). The real measurement (src/lib/studio/bench.ts, bundled from qa/fixtures/desktop-profile.ts) runs
// in Edge as the reference, then inside the development package on each graphics chip, chosen the way the person
// chooses it (settings.json's `gpu`, applied before Chromium is ready), and its numbers go through the real bridge
// to the application, which keeps them with its own key. Then «تلقائي» starts on the chip the rule picks, the
// bridge refuses what is not its shape, a restart for the chip waits for an export, «مسح بيانات هذا الجهاز» removes
// the profile, and a weak machine emulated on this laptop (no graphics chip, a slowed processor) gets a lower plan.
// No sign-in, no stored session, no secret; the application's own system calls are recorded, not acted on.
// Usage: node qa/desktop-profile.cjs   (writes qa/desktop-profile.json)
// Needs: npm run pack:dev in desktop/, nothing on 127.0.0.1:3000.
const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');
const { dependency, launchOptions } = require('./runtime.cjs');
const { chromium } = dependency('playwright');
const h = require('./desktop-helpers.cjs');

const { check, note, result, finish } = h.record('qa/desktop-profile.cjs');
const out = path.join(__dirname, 'artifacts', 'desktop-profile');
const fontDir = (pkg) => path.join(h.root, 'node_modules', '@fontsource', pkg);
const fontCss = [['ibm-plex-sans-arabic', '600'], ['reem-kufi', '600'], ['aref-ruqaa', '700']]
  .map(([pkg, w]) => fs.readFileSync(path.join(fontDir(pkg), `${w}.css`), 'utf8').replace(/url\(\.\/files\//g, `url(/fonts/${pkg}/`))
  .join('\n');
const AMD = 0x1002;
const NVIDIA = 0x10de;
const MINUTES = (n) => n * 60000;

async function serve() {
  await esbuild.build({ entryPoints: [path.join(__dirname, 'fixtures', 'desktop-profile.ts')], bundle: true, format: 'esm', platform: 'browser', target: 'es2022', outfile: path.join(out, 'bundle.js'), logLevel: 'silent', absWorkingDir: h.root });
  const page = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>قياس قدرة الجهاز</title><style>${fontCss}</style></head><body><script type="module" src="/bundle.js"></script></body></html>`;
  const site = h.pages({
    '/': ['text/html; charset=utf-8', page],
    '/bundle.js': ['text/javascript; charset=utf-8', fs.readFileSync(path.join(out, 'bundle.js'), 'utf8')],
    '/favicon.ico': (req, res) => (res.writeHead(204), res.end()),
  });
  const routes = site.server.listeners('request')[0];
  site.server.removeAllListeners('request');
  site.server.on('request', (req, res) => {
    const font = /^\/fonts\/([a-z-]+)\/(.+\.woff2?)$/.exec(req.url.split('?')[0]);
    if (font) {
      res.writeHead(200, { 'content-type': 'font/woff2' });
      return res.end(fs.readFileSync(path.join(fontDir(font[1]), 'files', font[2])));
    }
    return routes(req, res);
  });
  await h.listen(site.server, 3000);
  return site;
}

const ready = (page) => page.waitForFunction(() => typeof window.measure === 'function', null, { timeout: 60000 });
const renderer = (page) => page.evaluate(() => {
  const gl = document.createElement('canvas').getContext('webgl');
  const ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
  return gl && ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
});
/** The processor's load across the whole laptop, percent, as Windows reports it: the conditions of a measurement. */
const load = () => Number(h.ps('(Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average')) || null;
const measure = async (page, runs = 3) => {
  const before = load();
  const m = await page.evaluate((r) => window.measure({ runs: r }), runs);
  return { ...m, load: { before, after: load() } };
};
/** Each figure's coefficient of variation across its timed runs, percent, from the series the fixture handed back. */
const spreads = (series) =>
  Object.fromEntries(
    Object.entries(series).map(([k, xs]) => {
      const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
      const sd = xs.length > 1 ? Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (xs.length - 1)) : 0;
      return [k, { values: xs.map((x) => Math.round(x * 100) / 100), cv: mean ? Math.round((sd / mean) * 1000) / 10 : 0 }];
    }),
  );
const bridge = (page, fn, arg) => page.evaluate(fn, arg);

/** Launches the development package on the shared profile folder with `settings`, on the fixture page. */
async function appOn(name, settings, args = []) {
  const { app, win } = await h.launchDev(name, { settings, args });
  await h.instrument(app);
  await h.until(() => win.url().startsWith('http://127.0.0.1:3000'), 30000);
  await win.waitForLoadState('load');
  await ready(win);
  return { app, win };
}

const summary = (n) => n && { exportFps: n.exportFps, encode: n.encode, decode: n.decode, lanes: n.lanes, compose: n.compose, support: n.support, spread: n.spread, seconds: n.seconds, renderer: n.renderer };

(async () => {
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  let site = null;
  const runs = {};
  try {
    if (!fs.existsSync(h.devExe)) throw new Error(`the development package is missing: ${h.devExe} (npm run pack:dev in desktop/)`);
    if (await h.portAnswers(3000)) throw new Error('something already answers on 127.0.0.1:3000; stop it and run again');
    site = await serve();

    // --- Edge, the reference --------------------------------------------------------------------
    const browser = await chromium.launch(launchOptions);
    try {
      const tab = await browser.newPage();
      await tab.goto('http://127.0.0.1:3000/');
      await ready(tab);
      const m = await measure(tab);
      runs.edge = { renderer: await renderer(tab), numbers: m.numbers, spreads: spreads(m.series), load: m.load };
      check('Edge measures with the studio\'s own modules: an export rate, encoders and the compositor', runs.edge.numbers.exportFps > 0 && runs.edge.numbers.compose.effects > 0 && runs.edge.numbers.lanes.length === 3, summary(runs.edge.numbers));
    } finally {
      await browser.close();
    }

    // --- the application on the saving chip, then the strong one ---------------------------------------
    const engine = {};
    for (const [choice, sw, vendor, label] of [['saving', 'low', AMD, 'AMD'], ['strong', 'high', NVIDIA, 'NVIDIA']]) {
      const { app, win } = await appOn('profile', { keepInTray: false, gpu: choice });
      try {
        Object.assign(engine, await app.evaluate(() => ({ electron: process.versions.electron, chrome: process.versions.chrome })));
        const state = await bridge(win, () => window.commsHubNative.gpu.state());
        const info = await bridge(win, () => window.commsHubNative.info());
        const seen = await renderer(win);
        check(`«${choice === 'saving' ? 'الموفّرة للطاقة' : 'الأقوى'}»: Chromium started with its switch and draws on the ${label} chip`, state.active === sw && !state.given && (info.gpu.active || '').toUpperCase().includes(label) && seen.toUpperCase().includes(label), { state, active: info.gpu.active, renderer: seen });
        const { numbers, series, load: during } = await measure(win);
        const entry = await bridge(win, (n) => window.commsHubNative.profile.save(n), numbers);
        runs[choice] = { state, chip: info.gpu.active, renderer: seen, numbers, key: entry.key, spreads: spreads(series), load: during };
        check(`«${choice}»: the application keeps the numbers under its own key: its version, its Chromium, the ${label} chip and driver, the switch`, entry.key.app === h.pkg.version && entry.key.chrome === engine.chrome && entry.key.chip.vendorId === vendor && entry.key.switch === sw && /^\d/.test(entry.key.chip.driver) && entry.numbers.exportFps === numbers.exportFps, entry.key);
        const deciding = ['lane1', 'lane2', 'lane3', 'd2160hw', 'd2160sw', 'effects'];
        const widest = (only) => Object.entries(runs[choice].spreads).filter(([k]) => !only || deciding.includes(k)).sort((a, b) => b[1].cv - a[1].cv).slice(0, 3);
        check(`«${choice}»: every figure timed three times; those the plan decides on (export lanes, 4K decoding, the effects drawing) spread at most 10%`, numbers.runs === 3 && numbers.spread <= 10 && widest(true).every(([, s]) => s.cv <= 10), { spread: numbers.spread, seconds: numbers.seconds, load: during, deciding: widest(true), all: widest(false) });
        if (choice === 'saving') {
          // what the bridge refuses
          const refusals = await bridge(win, async (n) => {
            const tries = [() => window.commsHubNative.profile.save({ v: 1 }), () => window.commsHubNative.profile.save({ ...n, lanes: [] }), () => window.commsHubNative.profile.save({ ...n, exportFps: 1e12 }), () => window.commsHubNative.gpu.choose('turbo'), () => window.commsHubNative.gpu.choose({ choice: 'strong' })];
            const outcome = [];
            for (const t of tries) outcome.push(await t().then(() => 'kept', (e) => (/refused/.test(String(e && e.message)) ? 'refused' : String(e))));
            const kept = await window.commsHubNative.profile.save({ ...n, path: 'C:\\\\Users\\\\x', extra: 1 });
            return { outcome, extraKept: 'path' in kept.numbers || 'extra' in kept.numbers, entries: (await window.commsHubNative.profile.read()).entries.length };
          }, numbers);
          check('the bridge refuses numbers out of their shape and a choice off its list; nothing beyond the shape is kept', refusals.outcome.every((o) => o === 'refused') && !refusals.extraKept && refusals.entries === 1, refusals);
          // a choice is written, and the restart waits for an export
          const chosen = await bridge(win, () => window.commsHubNative.gpu.choose('strong'));
          check('choosing «الأقوى» is kept and asks for a restart', chosen.choice === 'strong' && chosen.next === 'high' && chosen.restart === true, chosen);
          await app.evaluate(({ app: a }) => {
            globalThis.__relaunched = 0;
            globalThis.__quits = 0;
            a.relaunch = () => void globalThis.__relaunched++;
            a.quit = () => void globalThis.__quits++;
          });
          const busy = await bridge(win, async () => {
            await window.commsHubNative.life.busy('export');
            const r = await window.commsHubNative.gpu.restart();
            await window.commsHubNative.life.idle();
            return r;
          });
          const idle = await bridge(win, () => window.commsHubNative.gpu.restart());
          const calls = await app.evaluate(() => ({ relaunched: globalThis.__relaunched, quits: globalThis.__quits }));
          check('the restart for the chip is refused during an export, and relaunches the application when idle', busy === 'busy' && idle === 'restart' && calls.relaunched === 1 && calls.quits === 1, { busy, idle, calls });
        }
      } finally {
        await h.closeAll();
      }
    }

    // --- «تلقائي»: the chip the rule picks from both measurements ---------------------------------
    {
      const power = runs.strong.state.power;
      const a = runs.saving.numbers.exportFps;
      const b = runs.strong.numbers.exportFps;
      const expected = power !== 'ac' ? 'none' : b >= a * 1.1 ? 'high' : a >= b * 1.1 ? 'low' : 'none';
      const { win } = await appOn('profile', { keepInTray: false, gpu: 'auto', lastPower: power });
      try {
        const state = await bridge(win, () => window.commsHubNative.gpu.state());
        const read = await bridge(win, () => window.commsHubNative.profile.read());
        runs.auto = { state, expected, power, exportFps: { saving: a, strong: b }, entries: read.entries.length };
        check('«تلقائي» starts on the chip the rule picks from the two measurements on this power', state.choice === 'auto' && state.active === expected && (expected === 'none' ? state.pick === null || power !== 'ac' : state.pick === expected), runs.auto);
        // «مسح بيانات هذا الجهاز» removes the profile with the rest
        await bridge(win, () => window.commsHubNative.data.clear());
        await h.sleep(1500);
        await win.waitForLoadState('load');
        await ready(win);
        const after = await bridge(win, () => window.commsHubNative.profile.read());
        const file = path.join(h.scratch, 'profile', 'profile.json');
        check('«مسح بيانات هذا الجهاز» removes the device profile: nothing read back, no file', after.entries.length === 0 && !fs.existsSync(file), { entries: after.entries.length, file: fs.existsSync(file) });
      } finally {
        await h.closeAll();
      }
      if (power !== 'ac') note(`The laptop was on battery during the run, so «تلقائي» kept Chromium's own choice by rule; the pick on mains power was not seen.`);
    }

    // --- a weak machine, emulated (P-38): no graphics chip, the processor slowed four times -----------
    {
      const { app, win } = await appOn('weak', { keepInTray: false, gpu: 'auto' }, ['--disable-gpu']);
      try {
        const cdp = await win.context().newCDPSession(win);
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
        const info = await bridge(win, () => window.commsHubNative.info());
        const { numbers } = await measure(win, 1);
        runs.weak = { software: info.gpu.software, renderer: await renderer(win), numbers };
        const machine = { cores: 12, memory: 16e9 };
        // the same laptop's cores and memory for both: only what was measured differs
        const knobs = await win.evaluate(([w, s, m]) => ({ weak: window.plan(w, m), strong: window.plan(s, m) }), [numbers, runs.strong.numbers, machine]);
        runs.weak.knobs = knobs;
        check('emulated weak machine: the measurement still completes, slower than either chip', numbers.exportFps > 0 && numbers.exportFps < Math.min(runs.saving.numbers.exportFps, runs.strong.numbers.exportFps), summary(numbers));
        check('emulated weak machine: its plan is never above the strong chip\'s, knob by knob', Object.keys(knobs.weak).every((k) => knobs.weak[k] <= knobs.strong[k]), knobs);
        await app.evaluate(() => undefined);
      } finally {
        await h.closeAll();
      }
    }
  } catch (e) {
    check('the check ran to its end', false, String((e && e.stack) || e));
  } finally {
    await h.closeAll();
    if (site) site.server.close();
  }
  result.runs = Object.fromEntries(Object.entries(runs).map(([k, v]) => [k, v && v.numbers ? { ...v, numbers: summary(v.numbers) } : v]));
  const failed = finish(path.join(__dirname, 'desktop-profile.json'));
  process.exit(failed ? 1 : 0);
})();

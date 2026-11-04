// The effects speed check (Desktop_Power_Ideas.md P-09; MVP_draft.md 62.15): the effects document at 1080p over the
// synthetic 4K footage, timed with the compositor as it is and as it was before the effects (compose.ts and cover.ts
// of the fork's base, 998ef0c, the canvas filters), in one page, alternately, three times each, so both see the same
// laptop. Drawn only, and drawn and encoded as an export does. In Edge and inside the development package on the
// saving chip, the strong chip and with no chip, with the processor's load before and after each engine, since a busy
// laptop times badly. Run it in a quiet moment. Nothing is checked against a number: the figures are the record.
// Usage: node qa/studio-effects-speed.cjs   (writes qa/studio-effects-speed.json)
//        node qa/studio-effects-speed.cjs --edge 3104   (Edge alone on that port, writes qa/artifacts/studio-effects-speed/edge.json)
// Needs: npm run pack:dev in desktop/, git, nothing on 127.0.0.1:3000.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const esbuild = require('esbuild');
const { dependency, launchOptions } = require('./runtime.cjs');
const { chromium } = dependency('playwright');
const h = require('./desktop-helpers.cjs');

const { check, note, result, finish } = h.record('qa/studio-effects-speed.cjs');
const out = path.join(__dirname, 'artifacts', 'studio-effects-speed');
const studio = path.join(h.root, 'src', 'lib', 'studio');
const BASE = '998ef0c';
const edgeOnly = process.argv.indexOf('--edge') > 0 ? Number(process.argv[process.argv.indexOf('--edge') + 1]) || 3104 : 0;
const PORT = edgeOnly || 3000;
const FRAMES = 240;
const RUNS = 3;
const load = () => Number(h.ps('(Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average')) || null;

/** compose.ts and cover.ts as they were at the base, read from git, imported in place of today's. */
function before() {
  const old = path.join(out, 'old');
  fs.mkdirSync(old, { recursive: true });
  for (const f of ['compose.ts', 'cover.ts']) {
    const r = spawnSync('git', ['show', `${BASE}:src/lib/studio/${f}`], { cwd: h.root, encoding: 'utf8', maxBuffer: 1 << 24 });
    if (r.status !== 0) throw new Error(`git show ${BASE}:${f}: ${r.stderr}`);
    fs.writeFileSync(path.join(old, f), r.stdout);
  }
  return {
    name: 'before',
    setup(b) {
      b.onResolve({ filter: /(compose|cover)\.ts$/ }, (args) => {
        const at = path.resolve(args.resolveDir, args.path);
        if (at === path.join(studio, 'compose.ts') || at === path.join(studio, 'cover.ts')) return { path: path.join(old, path.basename(at)) };
        return undefined;
      });
      // their own imports resolve from where they lived
      b.onLoad({ filter: /[\\/]old[\\/](compose|cover)\.ts$/ }, (args) => ({ contents: fs.readFileSync(args.path, 'utf8'), loader: 'ts', resolveDir: studio }));
    },
  };
}

async function serve() {
  const entry = path.join(__dirname, 'fixtures', 'studio-effects-speed.ts');
  const common = { entryPoints: [entry], bundle: true, format: 'esm', platform: 'browser', target: 'es2022', logLevel: 'silent', absWorkingDir: h.root };
  await esbuild.build({ ...common, outfile: path.join(out, 'after.js'), banner: { js: "globalThis.__speedName = 'speedAfter';" } });
  await esbuild.build({ ...common, outfile: path.join(out, 'before.js'), banner: { js: "globalThis.__speedName = 'speedBefore';" }, plugins: [before()] });
  const page = '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>سرعة المؤثرات</title></head><body><script type="module" src="/before.js"></script><script type="module" src="/after.js"></script></body></html>';
  const http = require('node:http');
  const server = http.createServer((req, res) => {
    const p = new URL(req.url, 'http://x').pathname;
    if (p === '/') return (res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }), res.end(page));
    if (p === '/before.js' || p === '/after.js') return (res.writeHead(200, { 'content-type': 'text/javascript' }), res.end(fs.readFileSync(path.join(out, p.slice(1)))));
    res.writeHead(404);
    res.end();
  });
  await h.listen(server, PORT);
  return server;
}

async function runIn(page) {
  await page.waitForFunction(() => !!window.speedBefore && !!window.speedAfter, null, { timeout: 60000 });
  const renderer = await page.evaluate(() => window.speedAfter.renderer());
  const loadBefore = load();
  const series = { before: { draw: [], export: [] }, after: { draw: [], export: [] } };
  for (let i = 0; i < RUNS; i++) {
    for (const which of i % 2 ? ['after', 'before'] : ['before', 'after']) {
      const g = which === 'before' ? 'speedBefore' : 'speedAfter';
      series[which].draw.push(await page.evaluate(([n, f]) => window[n].drawOnly(f), [g, FRAMES]));
      series[which].export.push(await page.evaluate(([n, f]) => window[n].exportLike(f), [g, FRAMES]));
    }
  }
  return { renderer, series, load: { before: loadBefore, after: load() } };
}

const median = (xs) => {
  const s = xs.filter((x) => typeof x === 'number').sort((a, b) => a - b);
  return s.length ? s[s.length >> 1] : null;
};

(async () => {
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  let server = null;
  const runs = {};
  try {
    if (!edgeOnly && !fs.existsSync(h.devExe)) throw new Error(`the development package is missing: ${h.devExe} (npm run pack:dev in desktop/)`);
    if (await h.portAnswers(PORT)) throw new Error(`something already answers on 127.0.0.1:${PORT}; stop it and run again`);
    server = await serve();
    const browser = await chromium.launch(launchOptions);
    try {
      const tab = await browser.newPage();
      await tab.goto(`http://127.0.0.1:${PORT}/`);
      runs.edge = { engine: { browser: browser.version() }, ...(await runIn(tab)) };
    } finally {
      await browser.close();
    }
    for (const [engine, settings, args] of edgeOnly ? [] : [
      ['app-saving', { keepInTray: false, gpu: 'saving' }, []],
      ['app-strong', { keepInTray: false, gpu: 'strong' }, []],
      ['app-software', { keepInTray: false, gpu: 'auto' }, ['--disable-gpu']],
    ]) {
      const { app, win } = await h.launchDev(`speed-${engine}`, { settings, args });
      try {
        await h.instrument(app);
        await h.until(() => win.url().startsWith('http://127.0.0.1:3000'), 30000);
        await win.waitForLoadState('load');
        const versions = await app.evaluate(() => ({ electron: process.versions.electron, chrome: process.versions.chrome }));
        runs[engine] = { engine: versions, ...(await runIn(win)) };
      } finally {
        await h.closeAll();
      }
    }
    for (const [engine, r] of Object.entries(runs)) {
      const m = (w, k) => median(r.series[w][k]);
      r.median = { drawMs: { before: m('before', 'draw'), after: m('after', 'draw') }, exportFps: { before: m('before', 'export'), after: m('after', 'export') } };
      check(`${engine}: the effects document was timed both ways, ${RUNS} times each (median export ${r.median.exportFps.before?.toFixed(1)} frames a second before, ${r.median.exportFps.after?.toFixed(1)} after; drawing ${r.median.drawMs.before?.toFixed(2)} ms and ${r.median.drawMs.after?.toFixed(2)} ms a frame; processor ${r.load.before}% then ${r.load.after}%)`, r.series.before.draw.length === RUNS && r.series.after.draw.length === RUNS, { renderer: r.renderer, median: r.median, series: r.series, load: r.load });
    }
  } catch (e) {
    check('the check ran to its end', false, String((e && e.stack) || e));
  } finally {
    await h.closeAll();
    if (server) server.close();
  }
  result.runs = Object.fromEntries(Object.entries(runs).map(([e, r]) => [e, { engine: r.engine, renderer: r.renderer, median: r.median, series: r.series, load: r.load }]));
  note(`Before is compose.ts and cover.ts of ${BASE}; ${FRAMES} frames a run. The figures mean something only beside the load recorded with them.`);
  const failed = finish(edgeOnly ? path.join(out, 'edge.json') : path.join(__dirname, 'studio-effects-speed.json'));
  process.exit(failed ? 1 : 0);
})();

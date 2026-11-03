// The photo tiles check (Desktop_Power_Ideas.md P-17; MVP_draft.md 62.15): a photo's adjustment worked out by one
// worker as before, in bands across several workers (each band with the rows its blur reads), and on the graphics chip
// where the adjustment has no blur, must give the same bytes. The fixture (qa/fixtures/studio-photo-tiles.ts) adjusts
// an 8000 by 6000 photo and a see-through 2400 by 1600 one in brightness, contrast, saturation, warmth, blur and all
// together, in Edge and inside the development package on the saving chip, the strong chip and with no chip. Each way
// is timed, with the processor's load before and after, since a busy laptop times badly. No sign-in, no session.
// Usage: node qa/studio-photo-tiles.cjs   (writes qa/studio-photo-tiles.json)
//        node qa/studio-photo-tiles.cjs --edge 3104   (Edge alone on that port, writes qa/artifacts/studio-photo-tiles/edge.json)
// Needs: npm run pack:dev in desktop/, nothing on 127.0.0.1:3000.
const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');
const { dependency, launchOptions } = require('./runtime.cjs');
const { chromium } = dependency('playwright');
const h = require('./desktop-helpers.cjs');

const { check, note, result, finish } = h.record('qa/studio-photo-tiles.cjs');
const out = path.join(__dirname, 'artifacts', 'studio-photo-tiles');
const edgeOnly = process.argv.indexOf('--edge') > 0 ? Number(process.argv[process.argv.indexOf('--edge') + 1]) || 3104 : 0;
const PORT = edgeOnly || 3000;
/** The processor's load across the whole laptop, percent, as Windows reports it (qa/desktop-profile.cjs). */
const load = () => Number(h.ps('(Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average')) || null;

async function serve() {
  await esbuild.build({ entryPoints: [path.join(__dirname, 'fixtures', 'studio-photo-tiles.ts')], bundle: true, format: 'esm', platform: 'browser', target: 'es2022', outfile: path.join(out, 'bundle.js'), logLevel: 'silent', absWorkingDir: h.root });
  const page = '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>تعديل الصور في أجزاء</title></head><body><script type="module" src="/bundle.js"></script></body></html>';
  const http = require('node:http');
  const server = http.createServer((req, res) => {
    const p = new URL(req.url, 'http://x').pathname;
    if (p === '/') return (res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }), res.end(page));
    if (p === '/bundle.js') return (res.writeHead(200, { 'content-type': 'text/javascript' }), res.end(fs.readFileSync(path.join(out, 'bundle.js'))));
    res.writeHead(404);
    res.end();
  });
  await h.listen(server, PORT);
  return server;
}

async function runIn(page) {
  await page.waitForFunction(() => !!window.photoTiles, null, { timeout: 60000 });
  const renderer = await page.evaluate(() => window.photoTiles.renderer());
  const before = load();
  const r = await page.evaluate(() => window.photoTiles.run({ big: true }));
  return { renderer, ...r, load: { before, after: load() } };
}

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
      const { app, win } = await h.launchDev(`tiles-${engine}`, { settings, args });
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

    // --- the checks ---------------------------------------------------------------------------------
    const ref = runs.edge;
    check('Edge adjusted the 8000 by 6000 photo and the see-through one in six ways each, by one worker and by several', ref.results.length === 12 && ref.counts.length >= 2, { cores: ref.cores, counts: ref.counts, chip: ref.chip, renderer: ref.renderer });
    for (const [engine, r] of Object.entries(runs)) {
      const bad = r.results.filter((x) => x.ways.some((w) => w.hash !== x.ways[0].hash)).map((x) => `${x.picture}: ${x.adjust} (${x.ways.filter((w) => w.hash !== x.ways[0].hash).map((w) => w.way).join(', ')})`);
      const ways = [...new Set(r.results.flatMap((x) => x.ways.map((w) => w.way)))];
      check(`${engine}: every way (${ways.join(', ')}) gives one worker's bytes, every adjustment, both photos`, bad.length === 0, { bad, chip: r.chip, renderer: r.renderer });
    }
    for (const [engine, r] of Object.entries(runs)) {
      const differ = r.results.filter((x, i) => x.ways[0].hash !== ref.results[i]?.ways[0].hash).map((x) => `${x.picture}: ${x.adjust}`);
      check(`${engine}: one worker gives Edge's bytes for every adjustment`, differ.length === 0, { differ });
    }
  } catch (e) {
    check('the check ran to its end', false, String((e && e.stack) || e));
  } finally {
    await h.closeAll();
    if (server) server.close();
  }
  // the times, per engine and way: the sums over the six adjustments of the large photo
  result.runs = Object.fromEntries(Object.entries(runs).map(([e, r]) => {
    const big = r.results.filter((x) => x.picture === '8000x6000');
    const sums = {};
    for (const x of big) for (const w of x.ways) sums[w.way] = (sums[w.way] ?? 0) + w.ms;
    return [e, { engine: r.engine, renderer: r.renderer, cores: r.cores, chip: r.chip, load: r.load, msLargePhoto: sums, results: r.results.map((x) => ({ picture: x.picture, adjust: x.adjust, ms: Object.fromEntries(x.ways.map((w) => [w.way, w.ms])) })) }];
  }));
  note('Times are worth reading only beside the load recorded with them: a laptop busy with other work times badly.');
  const failed = finish(edgeOnly ? path.join(out, 'edge.json') : path.join(__dirname, 'studio-photo-tiles.json'));
  process.exit(failed ? 1 : 0);
})();

// The effect identity check (Desktop_Power_Ideas.md P-09 and H-03; MVP_draft.md 62.15): colour adjustments and blur
// are worked out with whole numbers (src/lib/studio/effects/), on the graphics chip where there is one and in plain
// code where there is not, and the two must give the same bytes. The fixture (qa/fixtures/studio-effects-parity.ts)
// runs in Edge and inside the development package on the saving chip, on the strong chip and with no chip at all:
//   1. every effect, at several strengths, over three pictures (footage, an item with soft and see-through edges,
//      every colour at every opacity): chip against plain code, byte for byte, wherever the chip path is offered, and
//      the plain code's colour in WebAssembly lanes (effects/simd.ts) against the same arithmetic a pixel at a time;
//   2. every frame of the cross-device corpus composed with each path: the same hash;
//   3. the plain code is the same everywhere: each case's hash equals Edge's;
//   4. how far each effect moved from the canvas filter used before, on each engine's own filter (recorded, and held
//      to the proof's tolerance against the reference engine's filter for the colour adjustments and the blurs).
// No sign-in, no session, no secret.
// Usage: node qa/studio-effects-parity.cjs   (writes qa/studio-effects-parity.json)
//        node qa/studio-effects-parity.cjs --edge 3104   (Edge alone on that port, writes qa/artifacts/studio-effects-parity/edge.json)
// Needs: npm run pack:dev in desktop/, nothing on 127.0.0.1:3000.
const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');
const { dependency, launchOptions } = require('./runtime.cjs');
const { chromium } = dependency('playwright');
const h = require('./desktop-helpers.cjs');

const { check, note, result, finish } = h.record('qa/studio-effects-parity.cjs');
const out = path.join(__dirname, 'artifacts', 'studio-effects-parity');
const fontDir = (pkg) => path.join(h.root, 'node_modules', '@fontsource', pkg);
const fontCss = [['ibm-plex-sans-arabic', '600'], ['ibm-plex-sans-arabic', '700'], ['reem-kufi', '600'], ['aref-ruqaa', '700']]
  .map(([pkg, w]) => fs.readFileSync(path.join(fontDir(pkg), `${w}.css`), 'utf8').replace(/url\(\.\/files\//g, `url(/fonts/${pkg}/`))
  .join('\n');
/** The proof's tolerance (qa/studio-crossdevice.cjs): PSNR at least 50 dB, at most 0.1% of channels more than 2 apart. */
const MIN_PSNR = 50;
const MAX_OVER2 = 0.1;
/**
 * A blur cannot keep the proof's tolerance against the old filter: inside a picture it stays within 2 levels, but
 * where a blur fades into transparency at a picture's edge, and where it follows a colour adjustment, Skia worked in
 * its own way. The bound is the old filter's own spread, measured on 2026-11-04 between Edge and the application on
 * the saving chip, the strong chip and no chip, over the same footage: up to 5 levels and 49.6 dB.
 */
const SPREAD_MAX = 6;
const SPREAD_PSNR = 49;
/** --edge <port>: Edge alone, on another port, while the application's port is taken. */
const edgeOnly = process.argv.indexOf('--edge') > 0 ? Number(process.argv[process.argv.indexOf('--edge') + 1]) || 3104 : 0;
const PORT = edgeOnly || 3000;

async function serve() {
  await esbuild.build({ entryPoints: [path.join(__dirname, 'fixtures', 'studio-effects-parity.ts')], bundle: true, format: 'esm', platform: 'browser', target: 'es2022', outfile: path.join(out, 'bundle.js'), logLevel: 'silent', absWorkingDir: h.root });
  const page = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>تطابق المؤثرات</title><style>${fontCss}</style></head><body><script type="module" src="/bundle.js"></script></body></html>`;
  const http = require('node:http');
  const send = (res, file, type) => {
    const data = fs.readFileSync(file);
    res.writeHead(200, { 'content-type': type, 'content-length': data.length });
    res.end(data);
  };
  const server = http.createServer((req, res) => {
    const p = new URL(req.url, 'http://x').pathname;
    if (p === '/') return (res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }), res.end(page));
    if (p === '/bundle.js') return send(res, path.join(out, 'bundle.js'), 'text/javascript');
    if (p.startsWith('/motion/') && !p.includes('..')) return send(res, path.join(h.root, 'public', p), p.endsWith('.json') ? 'application/json' : 'image/png');
    const font = /^\/fonts\/([a-z-]+)\/([a-z0-9-]+\.woff2?)$/.exec(p);
    if (font) return send(res, path.join(fontDir(font[1]), 'files', font[2]), 'font/woff2');
    res.writeHead(404);
    res.end();
  });
  await h.listen(server, PORT);
  return server;
}

const ready = (page) => page.waitForFunction(() => !!window.effectsParity, null, { timeout: 60000 });

async function runIn(page) {
  const prepared = await page.evaluate(() => window.effectsParity.prepare());
  const renderer = await page.evaluate(() => window.effectsParity.renderer());
  const identity = await page.evaluate(() => window.effectsParity.identity());
  const corpus = await page.evaluate(() => window.effectsParity.corpusPaths());
  return { prepared, renderer, identity, corpus };
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
      await ready(tab);
      runs.edge = { engine: { browser: browser.version() }, ...(await runIn(tab)) };
    } finally {
      await browser.close();
    }
    for (const [engine, settings, args] of edgeOnly ? [] : [
      ['app-saving', { keepInTray: false, gpu: 'saving' }, []],
      ['app-strong', { keepInTray: false, gpu: 'strong' }, []],
      ['app-software', { keepInTray: false, gpu: 'auto' }, ['--disable-gpu']],
    ]) {
      const { app, win } = await h.launchDev(`effects-${engine}`, { settings, args });
      try {
        await h.instrument(app);
        await h.until(() => win.url().startsWith('http://127.0.0.1:3000'), 30000);
        await win.waitForLoadState('load');
        await ready(win);
        const versions = await app.evaluate(() => ({ electron: process.versions.electron, chrome: process.versions.chrome }));
        runs[engine] = { engine: versions, ...(await runIn(win)) };
      } finally {
        await h.closeAll();
      }
    }

    // --- the checks ---------------------------------------------------------------------------------
    const ref = runs.edge;
    check('Edge loaded the fonts and the corpus, and worked out every case', ref.prepared.fonts === true && ref.identity.cases.length > 60, { prepared: ref.prepared, cases: ref.identity.cases.length, renderer: ref.renderer });
    for (const [engine, r] of Object.entries(runs)) {
      const cases = r.identity.cases;
      if (!r.identity.chip) {
        check(`${engine}: with no usable graphics chip the effects take the plain code`, cases.every((c) => c.chip === null), { renderer: r.renderer });
        continue;
      }
      const bad = cases.filter((c) => c.chip.differing !== 0);
      check(`${engine}: every effect on the graphics chip equals the plain code byte for byte (${cases.length} cases)`, bad.length === 0, { renderer: r.renderer, bad: bad.map((c) => ({ picture: c.picture, effect: c.effect, ...c.chip })) });
    }
    for (const [engine, r] of Object.entries(runs)) {
      const withLanes = r.identity.cases.filter((c) => c.lanes);
      const bad = withLanes.filter((c) => !c.lanes.offered || c.lanes.differing !== 0);
      check(`${engine}: the colour in WebAssembly lanes equals the plain code one pixel at a time (${withLanes.length} cases)`, withLanes.length > 0 && bad.length === 0, { bad: bad.map((c) => ({ picture: c.picture, effect: c.effect, ...c.lanes })) });
    }
    for (const [engine, r] of Object.entries(runs)) {
      const differ = r.identity.cases.filter((c, i) => c.hash !== ref.identity.cases[i]?.hash).map((c) => `${c.picture}: ${c.effect}`);
      check(`${engine}: the plain code gives Edge's bytes for every case`, differ.length === 0, { differ });
    }
    for (const [engine, r] of Object.entries(runs)) {
      const paths = Object.keys(r.corpus);
      const first = r.corpus[paths[0]];
      const differ = [];
      for (const p of paths.slice(1)) r.corpus[p].forEach((f, i) => f.hash !== first[i].hash && differ.push(`${p} ${f.name}#${f.i}`));
      check(`${engine}: every corpus frame is the same whichever path works out its effects (${paths.join(', ')}; ${first.length} frames)`, differ.length === 0, { differ });
    }
    // how far the effects moved from the reference engine's canvas filter
    const moved = ref.identity.cases.filter((c) => c.picture !== 'ramp');
    const colours = moved.filter((c) => !c.effect.includes('blur'));
    const offColour = colours.filter((c) => c.sinceFilter.psnr < MIN_PSNR || c.sinceFilter.over2 > MAX_OVER2);
    check(`against Edge's canvas filter, every colour adjustment on footage and on an item within the proof's tolerance (PSNR at least ${MIN_PSNR} dB, at most ${MAX_OVER2}% of channels more than 2 apart)`, offColour.length === 0, {
      worst: [...colours].sort((a, b) => a.sinceFilter.psnr - b.sinceFilter.psnr).slice(0, 4).map((c) => ({ picture: c.picture, effect: c.effect, ...c.sinceFilter })),
      off: offColour.map((c) => `${c.picture}: ${c.effect}`),
    });
    const blurs = moved.filter((c) => c.effect.includes('blur'));
    const offBlur = blurs.filter((c) => c.sinceFilter.psnr < SPREAD_PSNR || c.sinceFilter.max > SPREAD_MAX);
    check(`against Edge's canvas filter, every blur moved no further than the filter itself differed between this laptop's engines (at most ${SPREAD_MAX} levels, PSNR at least ${SPREAD_PSNR} dB)`, offBlur.length === 0, {
      worst: [...blurs].sort((a, b) => a.sinceFilter.psnr - b.sinceFilter.psnr).slice(0, 4).map((c) => ({ picture: c.picture, effect: c.effect, ...c.sinceFilter })),
      off: offBlur.map((c) => `${c.picture}: ${c.effect}`),
    });
  } catch (e) {
    check('the check ran to its end', false, String((e && e.stack) || e));
  } finally {
    await h.closeAll();
    if (server) server.close();
  }
  result.runs = Object.fromEntries(Object.entries(runs).map(([e, r]) => [e, {
    engine: r.engine,
    renderer: r.renderer,
    chip: r.identity?.chip,
    cases: r.identity?.cases.map((c) => ({ picture: c.picture, effect: c.effect, chip: c.chip, lanes: c.lanes, sinceFilter: c.sinceFilter })),
    corpus: r.corpus ? Object.fromEntries(Object.entries(r.corpus).map(([p, fr]) => [p, fr.length])) : null,
  }]));
  note('The chip path and the plain code are compared byte for byte; how far each effect moved from the canvas filter is measured against each engine\'s own filter, and checked against Edge\'s.');
  const failed = finish(edgeOnly ? path.join(out, 'edge.json') : path.join(__dirname, 'studio-effects-parity.json'));
  process.exit(failed ? 1 : 0);
})();

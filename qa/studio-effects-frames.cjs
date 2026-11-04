// The frame check (Desktop_Power_Ideas.md P-09; MVP_draft.md 62.15): where a frame of the cross-device corpus differs
// between engines, how much comes from picture scaling and how much from the effects. The fixture
// (qa/fixtures/studio-effects-frames.ts) is built twice, with the compositor as it is and with compose.ts and cover.ts of
// the fork's base (998ef0c, the canvas filters), and draws each chosen frame as saved and with its colour adjustments
// taken out. Edge draws the reference; the development package with no graphics chip, and on the strong chip, compare
// with it pixel by pixel: PSNR, the largest difference, the share more than 2 levels apart, and how many channels differ
// by each number of levels. Nothing is checked against a number beyond the run ending: the figures are the record.
// Usage: node qa/studio-effects-frames.cjs   (writes qa/studio-effects-frames.json)
// Needs: npm run pack:dev in desktop/, git, nothing on 127.0.0.1:3000.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const esbuild = require('esbuild');
const { dependency, launchOptions } = require('./runtime.cjs');
const { chromium } = dependency('playwright');
const h = require('./desktop-helpers.cjs');

const { check, note, result, finish } = h.record('qa/studio-effects-frames.cjs');
const out = path.join(__dirname, 'artifacts', 'studio-effects-frames');
const studio = path.join(h.root, 'src', 'lib', 'studio');
const BASE = '998ef0c';

/** compose.ts and cover.ts as they were at the base, read from git, imported in place of today's (as qa/studio-effects-speed.cjs). */
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
      b.onLoad({ filter: /[\\/]old[\\/](compose|cover)\.ts$/ }, (args) => ({ contents: fs.readFileSync(args.path, 'utf8'), loader: 'ts', resolveDir: studio }));
    },
  };
}

async function serve() {
  const entry = path.join(__dirname, 'fixtures', 'studio-effects-frames.ts');
  const common = { entryPoints: [entry], bundle: true, format: 'esm', platform: 'browser', target: 'es2022', logLevel: 'silent', absWorkingDir: h.root };
  await esbuild.build({ ...common, outfile: path.join(out, 'after.js'), banner: { js: "globalThis.__framesName = 'after';" } });
  await esbuild.build({ ...common, outfile: path.join(out, 'before.js'), banner: { js: "globalThis.__framesName = 'before';" }, plugins: [before()] });
  fs.mkdirSync(path.join(out, 'ref'), { recursive: true });
  const page = '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>إطارات المؤثرات</title></head><body><script type="module" src="/before.js"></script><script type="module" src="/after.js"></script></body></html>';
  const http = require('node:http');
  const server = http.createServer((req, res) => {
    const p = new URL(req.url, 'http://x').pathname;
    if (p === '/') return (res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }), res.end(page));
    if (p === '/before.js' || p === '/after.js') return (res.writeHead(200, { 'content-type': 'text/javascript' }), res.end(fs.readFileSync(path.join(out, p.slice(1)))));
    const frame = /^\/frame\/([a-z0-9-]+)$/.exec(p);
    if (frame && req.method === 'POST') {
      const w = fs.createWriteStream(path.join(out, 'ref', `${frame[1]}.png`));
      req.pipe(w);
      return w.on('finish', () => (res.writeHead(204), res.end()));
    }
    const ref = /^\/ref\/([a-z0-9-]+)\.png$/.exec(p);
    if (ref && fs.existsSync(path.join(out, 'ref', `${ref[1]}.png`))) return (res.writeHead(200, { 'content-type': 'image/png' }), res.end(fs.readFileSync(path.join(out, 'ref', `${ref[1]}.png`))));
    res.writeHead(404);
    res.end();
  });
  await h.listen(server, 3000);
  return server;
}

async function runIn(page, reference) {
  await page.waitForFunction(() => !!window.framesBefore && !!window.framesAfter, null, { timeout: 60000 });
  return {
    renderer: await page.evaluate(() => window.framesAfter.renderer()),
    before: await page.evaluate((r) => window.framesBefore.run(r), reference),
    after: await page.evaluate((r) => window.framesAfter.run(r), reference),
  };
}

(async () => {
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  let server = null;
  const runs = {};
  try {
    if (!fs.existsSync(h.devExe)) throw new Error(`the development package is missing: ${h.devExe} (npm run pack:dev in desktop/)`);
    if (await h.portAnswers(3000)) throw new Error('something already answers on 127.0.0.1:3000; stop it and run again');
    server = await serve();
    const browser = await chromium.launch(launchOptions);
    try {
      const tab = await browser.newPage();
      await tab.goto('http://127.0.0.1:3000/');
      runs.edge = { engine: { browser: browser.version() }, ...(await runIn(tab, true)) };
    } finally {
      await browser.close();
    }
    for (const [engine, settings, args] of [
      ['app-software', { keepInTray: false, gpu: 'auto' }, ['--disable-gpu']],
      ['app-strong', { keepInTray: false, gpu: 'strong' }, []],
    ]) {
      const { app, win } = await h.launchDev(`frames-${engine}`, { settings, args });
      try {
        await h.instrument(app);
        await h.until(() => win.url().startsWith('http://127.0.0.1:3000'), 30000);
        await win.waitForLoadState('load');
        const versions = await app.evaluate(() => ({ electron: process.versions.electron, chrome: process.versions.chrome }));
        runs[engine] = { engine: versions, ...(await runIn(win, false)) };
      } finally {
        await h.closeAll();
      }
    }
    for (const engine of ['app-software', 'app-strong']) {
      const r = runs[engine];
      const rows = [...r.before, ...r.after];
      check(`${engine}: every chosen frame drawn both ways, as saved and without colour, and compared with Edge's pixel by pixel`, rows.length === 12 && rows.every((x) => typeof x.psnr === 'number'), {
        renderer: r.renderer,
        frames: rows.map((x) => ({ frame: `${x.name}#${x.i}`, compositor: x.compositor, variant: x.variant, psnr: x.psnr, max: x.max, over2: x.over2 })),
      });
    }
  } catch (e) {
    check('the check ran to its end', false, String((e && e.stack) || e));
  } finally {
    await h.closeAll();
    if (server) server.close();
  }
  result.runs = Object.fromEntries(Object.entries(runs).filter(([e]) => e !== 'edge').map(([e, r]) => [e, { engine: r.engine, renderer: r.renderer, frames: [...r.before, ...r.after] }]));
  note(`"before" is compose.ts and cover.ts of ${BASE}, the canvas filters; "no colour" is the same frame with every colour adjustment taken out, so it differs between engines by picture scaling alone.`);
  const failed = finish(path.join(__dirname, 'studio-effects-frames.json'));
  process.exit(failed ? 1 : 0);
})();

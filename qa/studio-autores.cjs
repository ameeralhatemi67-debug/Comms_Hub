// The gate of «تلقائية» and the stream budget (Desktop_Power_Ideas.md P-03 and P-04 and section 9, phase D10;
// MVP_draft.md 62.5): three 4K tracks played in the preview inside the development package, on the saving chip, on
// the strong chip and with no graphics chip. The real media pool, player and light copies run on a fixture page
// (qa/fixtures/studio-autores.ts); the plan comes from the studio's own measurement, kept by the application.
//   The project: 16:9, three video tracks of 4K at 30 frames a second (H.264, 60 Mbit/s, 20 s), one across the frame
//   and two pictures in it, on a stage canvas of 1280 x 720 at «كاملة».
//   Each play is 18 s from the start. Recorded: the project frames the stage did not draw in time, the frames the
//   elements say they dropped, the elements put back in step, the levels «تلقائية» moved through, and which streams
//   played their light copy.
//   Plays: «كاملة» as before (the floor); «تلقائية» with the budget; then, with a light copy of each source made by the
//   application, «كاملة» (every copy plays, as D5 did) and «تلقائية» with the budget, cold and then from where it ended.
//   Gate: «تلقائية» with the budget and the copies at most 2% of frames missed and at most 2% dropped, on every run.
//   The processor's load is recorded before and after each play, since a busy laptop measures badly.
// Usage: node qa/studio-autores.cjs [--only=app-saving|app-strong|app-software] [--quick]   (writes qa/studio-autores.json)
// Needs: npm run pack:dev in desktop/, ffmpeg with libx264, 127.0.0.1:3000 free (the lock).
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const os = require('node:os');
const esbuild = require('esbuild');
const h = require('./desktop-helpers.cjs');
const { make4k } = require('./studio-4k.cjs');

const { check, note, result, finish } = h.record('qa/studio-autores.cjs');
const out = path.join(__dirname, 'artifacts', 'studio-autores');
const scrubOut = path.join(__dirname, 'artifacts', 'studio-scrub');
const only = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7);
const quick = process.argv.includes('--quick');
const LOCK = path.join(process.env.TEMP || os.tmpdir(), 'comms-hub-port3000.lock');
const SECONDS = quick ? 8 : 18;
const MAX_PCT = 2;
const NAMES = ['track-a.mp4', 'track-b.mp4', 'track-c.mp4'];
const load = () => Number(h.ps('(Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average')) || null;

/** Three 4K sources: the scrub check's 2 s key-frame fixture under three names (each its own source and decoder). */
function makeFixtures() {
  fs.mkdirSync(out, { recursive: true });
  fs.mkdirSync(scrubOut, { recursive: true });
  const src = path.join(scrubOut, 'gop2.mp4');
  make4k(src, 60);
  for (const n of NAMES) if (!fs.existsSync(path.join(out, n))) fs.copyFileSync(src, path.join(out, n));
}

async function serve() {
  await esbuild.build({ entryPoints: [path.join(__dirname, 'fixtures', 'studio-autores.ts')], bundle: true, format: 'esm', platform: 'browser', target: 'es2022', outfile: path.join(out, 'bundle.js'), logLevel: 'silent', absWorkingDir: h.root });
  const page = '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>تشغيل ثلاثة مسارات</title><style>body{margin:0;background:#000}canvas{display:block}</style></head><body><input type="file" id="files" multiple><script type="module" src="/bundle.js"></script></body></html>';
  const server = http.createServer((req, res) => {
    const p = new URL(req.url, 'http://x').pathname;
    if (p === '/') return (res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }), res.end(page));
    if (p === '/favicon.ico') return (res.writeHead(204), res.end());
    if (p === '/bundle.js') {
      res.writeHead(200, { 'content-type': 'text/javascript' });
      return res.end(fs.readFileSync(path.join(out, 'bundle.js')));
    }
    res.writeHead(404);
    res.end();
  });
  await h.listen(server, 3000);
  return server;
}

async function playIn(win, o) {
  const before = load();
  const r = await win.evaluate((x) => window.autores.play(x), { ...o, seconds: SECONDS });
  r.load = { before, after: load() };
  console.log(`  ${o.label}: missed ${r.missedPct}% of ${r.stats.due}, dropped ${r.droppedPct}% of ${r.quality.total}, reseeks ${r.stats.reseeks}, levels ${JSON.stringify(r.levels)}, copies ${r.playing.map((p) => (p.copy ? 1 : 0)).join('')}; load ${before} -> ${r.load.after}`);
  return { label: o.label, ...r };
}

(async () => {
  const runs = {};
  let server = null;
  let locked = false;
  try {
    makeFixtures();
    if (!fs.existsSync(h.devExe)) throw new Error(`the development package is missing: ${h.devExe} (npm run pack:dev in desktop/)`);
    // the lock of 127.0.0.1:3000: taken here, or already held for this branch by whoever runs the checks in a row
    try {
      fs.writeFileSync(LOCK, 'claude/power-preview-b15ae2', { flag: 'wx' });
      locked = true;
    } catch {
      if (fs.readFileSync(LOCK, 'utf8').trim() !== 'claude/power-preview-b15ae2') throw new Error(`${LOCK} exists: another check holds 127.0.0.1:3000`);
    }
    if (await h.portAnswers(3000)) throw new Error('something already answers on 127.0.0.1:3000');
    server = await serve();
    const apps = [
      ['app-saving', { keepInTray: false, gpu: 'saving' }, []],
      ['app-strong', { keepInTray: false, gpu: 'strong' }, []],
      ['app-software', { keepInTray: false, gpu: 'auto' }, ['--disable-gpu']],
    ].filter(([n]) => !only || only === n);
    for (const [engine, settings, args] of apps) {
      console.log(engine);
      const { app, win } = await h.launchDev(`autores-${engine}`, { settings, args });
      try {
        await h.until(() => win.url().startsWith('http://127.0.0.1:3000'), 30000);
        await win.waitForLoadState('load');
        await win.waitForFunction(() => !!window.autores, null, { timeout: 60000 });
        await win.setViewportSize?.({ width: 1300, height: 760 }).catch(() => undefined);
        const versions = await app.evaluate(() => ({ electron: process.versions.electron, chrome: process.versions.chrome }));
        const r = { engine: { ...versions, renderer: await win.evaluate(() => window.autores.renderer()) } };
        await win.setInputFiles('#files', NAMES.map((n) => path.join(out, n)));
        r.opened = await win.evaluate(() => window.autores.open());
        const before = load();
        r.plan = await win.evaluate((runs) => window.autores.measure({ runs }), quick ? 1 : 3);
        r.plan.load = { before, after: load() };
        const start = r.plan.knobs.previewStart;
        const budget = r.plan.budget;
        console.log(`  plan: start ${start}, frame memory ${r.plan.knobs.frameCacheMB} MB, budget ${budget && budget.toFixed(2)} streams of 4K30; renderer ${r.engine.renderer}`);
        r.plays = [];
        r.plays.push(await playIn(win, { label: 'floor', resolution: 1, start: 1, budget: null }));
        r.plays.push(await playIn(win, { label: 'auto', resolution: 'auto', start, budget }));
        r.copies = await win.evaluate(() => window.autores.copies());
        r.plays.push(await playIn(win, { label: 'floor-copies', resolution: 1, start: 1, budget: null }));
        const cold = await playIn(win, { label: 'auto-copies', resolution: 'auto', start, budget });
        r.plays.push(cold);
        r.plays.push(await playIn(win, { label: 'auto-copies-again', resolution: 'auto', start: cold.end, budget }));
        runs[engine] = r;
      } finally {
        await h.closeAll();
      }
    }

    // --- the checks ------------------------------------------------------------------------------------
    for (const [engine, r] of Object.entries(runs)) {
      check(`${engine}: three 4K sources ready and a light copy of each made by the application`, r.opened.states.every((s) => s.kind === 'ready') && r.copies.tools.every((t) => t && t.proxy.kind === 'ready'), { states: r.opened.states, copies: r.copies });
      for (const label of ['auto-copies', 'auto-copies-again']) {
        const p = r.plays.find((x) => x.label === label);
        check(`${engine}, «تلقائية» with the budget and light copies (${label === 'auto-copies' ? 'from the plan\'s start' : 'from where the last play ended'}): at most ${MAX_PCT}% missed and ${MAX_PCT}% dropped (${p.missedPct}% of ${p.stats.due}, ${p.droppedPct}% of ${p.quality.total})`, p.missedPct <= MAX_PCT && (p.droppedPct === null || p.droppedPct <= MAX_PCT), { stats: p.stats, quality: p.quality, levels: p.levels, playing: p.playing, load: p.load });
      }
      const f = r.plays.find((x) => x.label === 'floor');
      const a = r.plays.find((x) => x.label === 'auto');
      note(`${engine}: «كاملة» with no copies missed ${f.missedPct}% and dropped ${f.droppedPct}%; «تلقائية» with no copies ${a.missedPct}% and ${a.droppedPct}% (levels ${JSON.stringify(a.levels)}); «كاملة» with copies ${r.plays[2].missedPct}% and ${r.plays[2].droppedPct}%.`);
    }
  } catch (e) {
    check('the check ran to the end', false, e.stack || String(e));
  } finally {
    await h.closeAll();
    if (server) server.close();
    if (locked) fs.rmSync(LOCK, { force: true });
    result.settings = { seconds: SECONDS, project: '16:9, three video tracks of 4K30 H.264 60 Mbit/s, stage canvas 1280 x 720', maxPct: MAX_PCT };
    result.runs = runs;
    process.exitCode = finish(path.join(__dirname, 'studio-autores.json')) ? 1 : 0;
  }
})();

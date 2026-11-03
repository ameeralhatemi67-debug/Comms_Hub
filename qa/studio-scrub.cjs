// The gate of «ذاكرة الإطارات للتنقل» (Desktop_Power_Ideas.md P-02 and section 9, phase D10; MVP_draft.md 62.5): scrubbing
// a 4K source in the paused preview, with the floor (no memory for frames, today's decoder) and with the plan's memory,
// on the very same seeks. The real media pool and player run on a fixture page (qa/fixtures/studio-scrub.ts) in Edge
// and inside the development package on the saving chip, on the strong chip and with no graphics chip.
//   The fixtures: 20 s of 4K at 30 frames a second, H.264 at 60 Mbit/s, one with a key frame every 2 s and one every
//   10 s, a moving test picture with each frame's number as a 12-bit gray code across the middle.
//   Speed: 200 random seeks (seeded, the same for both), and 60 steps of one frame forward and back; the time from the
//   player's seek to the pool showing the frame for that time. Gate: the median at least three times faster.
//   Identity: at 48 times (DT-12's: frame middles and 2 ms inside each edge) the shown frame is the frame the decoder
//   gives and the frame the time names; at frame starts to the microsecond, the export's rule. Gate: 48 of 48.
//   The processor's load is recorded before and after each run, since a busy laptop measures badly.
// Usage: node qa/studio-scrub.cjs [--only=edge|app-saving|app-strong|app-software] [--quick]   (writes qa/studio-scrub.json)
// Needs: ffmpeg with libx264; for the application, npm run pack:dev in desktop/ and 127.0.0.1:3000 free (the lock).
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { spawnSync } = require('node:child_process');
const esbuild = require('esbuild');
const { dependency, launchOptions } = require('./runtime.cjs');
const { chromium } = dependency('playwright');
const h = require('./desktop-helpers.cjs');
const { make4k } = require('./studio-4k.cjs');

const { check, note, result, finish } = h.record('qa/studio-scrub.cjs');
const out = path.join(__dirname, 'artifacts', 'studio-scrub');
const only = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7);
const quick = process.argv.includes('--quick');
const LOCK = path.join(process.env.TEMP || require('node:os').tmpdir(), 'comms-hub-port3000.lock');
/** The pilot laptop's plan: 16 GB at 64 MB a gigabyte (scale.ts plan, «تلقائي»). */
const CACHE_MB = 1024;
const SEEKS = quick ? 40 : 200;
const STEPS = quick ? 20 : 60;
const FIXTURES = [
  { name: 'gop2.mp4', gop: 60 },
  { name: 'gop10.mp4', gop: 300 },
];

function makeFixtures() {
  fs.mkdirSync(out, { recursive: true });
  for (const f of FIXTURES) make4k(path.join(out, f.name), f.gop);
}
const probe = (file) => JSON.parse(spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name,profile,width,height,r_frame_rate,bit_rate,nb_frames:format=duration,bit_rate', '-of', 'json', file], { encoding: 'utf8' }).stdout);
const keyFrames = (file) => spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-skip_frame', 'nokey', '-show_entries', 'frame=pts_time', '-of', 'csv=p=0', file], { encoding: 'utf8' }).stdout.trim().split(/\s+/).map(Number);
const load = () => Number(h.ps('(Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average')) || null;

function send(req, res, file, type) {
  const size = fs.statSync(file).size;
  const m = /bytes=(\d+)-(\d*)/.exec(req.headers.range || '');
  if (m) {
    const a = Number(m[1]);
    const b = Math.min(size - 1, m[2] ? Number(m[2]) : size - 1);
    res.writeHead(206, { 'content-type': type, 'content-range': `bytes ${a}-${b}/${size}`, 'content-length': b - a + 1, 'accept-ranges': 'bytes' });
    return fs.createReadStream(file, { start: a, end: b }).pipe(res);
  }
  res.writeHead(200, { 'content-type': type, 'content-length': size, 'accept-ranges': 'bytes' });
  fs.createReadStream(file).pipe(res);
}

async function serve(port) {
  await esbuild.build({ entryPoints: [path.join(__dirname, 'fixtures', 'studio-scrub.ts')], bundle: true, format: 'esm', platform: 'browser', target: 'es2022', outfile: path.join(out, 'bundle.js'), logLevel: 'silent', absWorkingDir: h.root });
  const page = '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>التنقل في المعاينة</title></head><body><script type="module" src="/bundle.js"></script></body></html>';
  const server = http.createServer((req, res) => {
    const p = new URL(req.url, 'http://x').pathname;
    if (p === '/') return (res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }), res.end(page));
    if (p === '/favicon.ico') return (res.writeHead(204), res.end());
    if (p === '/bundle.js') return send(req, res, path.join(out, 'bundle.js'), 'text/javascript');
    const m = /^\/media\/(gop\d+\.mp4)$/.exec(p);
    if (m) return send(req, res, path.join(out, m[1]), 'video/mp4');
    res.writeHead(404);
    res.end();
  });
  await h.listen(server, port);
  return server;
}

/** The same seeks with the floor and with the plan's memory, on each fixture: the 16:9 project drawn on a 1280-wide stage. */
async function runIn(page) {
  await page.waitForFunction(() => !!window.scrub, null, { timeout: 60000 });
  const run = { renderer: await page.evaluate(() => window.scrub.renderer()), fixtures: {} };
  for (const f of FIXTURES) {
    const r = {};
    for (const [mode, cacheMB] of [['floor', 0], ['kept', CACHE_MB]]) {
      const before = load();
      const opened = await page.evaluate((o) => window.scrub.open(o), { file: f.name, cacheMB, ratio: '16:9', canvasW: 1280 });
      // cold: jumps as soon as the project opens; then the preview left open on the clip (the small frames fill), then
      // the frames checked, then other jumps (warm), then steps
      const cold = await page.evaluate((o) => window.scrub.random(o), { count: SEEKS, seed: 20261104, pause: 0 });
      const settled = await page.evaluate((o) => window.scrub.settle(o), { ms: 60000 });
      const identity = await page.evaluate(() => window.scrub.identity());
      const random = await page.evaluate((o) => window.scrub.random(o), { count: SEEKS, seed: 1104, pause: 0 });
      const steps = await page.evaluate((o) => window.scrub.steps(o), { count: STEPS, seed: 7, pause: 0 });
      r[mode] = { opened, cold, settled, identity, random, steps, load: { before, after: load() } };
      console.log(`${f.name} ${mode}: cold median ${cold.median} (sharp ${cold.sharp.median}); settled ${settled.ms} ms; warm median ${random.median} (sharp ${random.sharp.median}, p95 ${random.p95}); steps forward ${steps.forward.median}, back ${steps.back.median}; load ${before} -> ${r[mode].load.after}`);
    }
    run.fixtures[f.name] = r;
  }
  return run;
}

const BRANCH = 'claude/power-preview-b15ae2';
/** The lock of 127.0.0.1:3000: taken here, or already held for this branch by whoever runs the checks in a row. */
function takeLock() {
  try {
    fs.writeFileSync(LOCK, BRANCH, { flag: 'wx' });
    return 'taken';
  } catch {
    return fs.readFileSync(LOCK, 'utf8').trim() === BRANCH ? 'held' : null;
  }
}

(async () => {
  const runs = {};
  let server = null;
  let locked = false;
  try {
    makeFixtures();
    result.fixtures = Object.fromEntries(FIXTURES.map((f) => {
      const file = path.join(out, f.name);
      const p = probe(file);
      const keys = keyFrames(file);
      return [f.name, { bytes: fs.statSync(file).size, video: p.streams[0], duration: Number(p.format.duration), mbit: Math.round(Number(p.format.bit_rate) / 1e5) / 10, keyFrames: keys.length, keyEvery: keys.length > 1 ? Math.round((keys[1] - keys[0]) * 100) / 100 : null }];
    }));
    result.settings = { cacheMB: CACHE_MB, seeks: SEEKS, steps: STEPS, project: '16:9, a 4K clip contained, stage canvas 1280 x 720', pauseBetweenSeeksMs: 0 };

    if (!only || only === 'edge') {
      server = await serve(3102);
      const browser = await chromium.launch(launchOptions);
      try {
        const tab = await browser.newPage();
        await tab.goto('http://127.0.0.1:3102/');
        runs.edge = { engine: { browser: browser.version() }, ...(await runIn(tab)) };
      } finally {
        await browser.close();
        server.close();
        server = null;
      }
    }

    const apps = [
      ['app-saving', { keepInTray: false, gpu: 'saving' }, []],
      ['app-strong', { keepInTray: false, gpu: 'strong' }, []],
      ['app-software', { keepInTray: false, gpu: 'auto' }, ['--disable-gpu']],
    ].filter(([n]) => !only || only === n);
    if (apps.length) {
      if (!fs.existsSync(h.devExe)) throw new Error(`the development package is missing: ${h.devExe} (npm run pack:dev in desktop/)`);
      const lock = takeLock();
      if (!lock) throw new Error(`${LOCK} exists: another check holds 127.0.0.1:3000`);
      locked = lock === 'taken';
      if (await h.portAnswers(3000)) throw new Error('something already answers on 127.0.0.1:3000');
      server = await serve(3000);
      for (const [engine, settings, args] of apps) {
        const { app, win } = await h.launchDev(`scrub-${engine}`, { settings, args });
        try {
          await h.until(() => win.url().startsWith('http://127.0.0.1:3000'), 30000);
          await win.waitForLoadState('load');
          const versions = await app.evaluate(() => ({ electron: process.versions.electron, chrome: process.versions.chrome }));
          runs[engine] = { engine: versions, ...(await runIn(win)) };
          runs[engine].memory = await app.evaluate(({ app: a }) => a.getAppMetrics().map((m) => ({ type: m.type, mb: Math.round(m.memory.workingSetSize / 1024) })));
        } finally {
          await h.closeAll();
        }
      }
    }

    // --- the checks ------------------------------------------------------------------------------------
    for (const [engine, r] of Object.entries(runs)) {
      for (const [name, f] of Object.entries(r.fixtures)) {
        const fl = f.floor.random;
        const kp = f.kept.random;
        const ratio = Math.round((fl.median / Math.max(0.1, kp.median)) * 10) / 10;
        f.ratio = { right: ratio, sharp: Math.round((fl.sharp.median / Math.max(0.1, kp.sharp.median)) * 10) / 10, cold: Math.round((f.floor.cold.median / Math.max(0.1, f.kept.cold.median)) * 10) / 10 };
        check(`${engine}, ${name}: the median of ${SEEKS} random seeks to the right frame is at least three times faster with the frame memory, the preview having been open on the clip (${fl.median} ms against ${kp.median} ms, ${ratio} times; the sharp frame ${fl.sharp.median} against ${kp.sharp.median}; just opened ${f.floor.cold.median} against ${f.kept.cold.median})`, ratio >= 3 && !fl.timeouts && !kp.timeouts, { floor: fl, kept: kp, cold: [f.floor.cold, f.kept.cold], settled: f.kept.settled, load: [f.floor.load, f.kept.load] });
        // the person sees the sharp frame: it must not come later than today's (10% and 5 ms for noise and the timer)
        const notLater = (kept, floor) => kept <= floor * 1.1 + 5;
        check(`${engine}, ${name}: the sharp frame after a jump comes no later than today's (${kp.sharp.median} ms against ${fl.sharp.median})`, notLater(kp.sharp.median, fl.sharp.median), { kept: kp.sharp, floor: fl.sharp });
        check(`${engine}, ${name}: a jump right after the project opens comes no later than today's (${f.kept.cold.median} ms against ${f.floor.cold.median})`, notLater(f.kept.cold.median, f.floor.cold.median), { kept: f.kept.cold, floor: f.floor.cold });
        const id = f.kept.identity;
        const same = id.rows.filter((x) => x.shown === x.decoder && x.shown === x.expected).length;
        check(`${engine}, ${name}: at 48 times the kept frame is the frame the decoder gives and the time names (${same} of ${id.rows.length})`, same === 48 && id.rows.length === 48, id.rows.filter((x) => !(x.shown === x.decoder && x.shown === x.expected)));
        const smalls = id.rows.filter((x) => x.small !== null);
        check(`${engine}, ${name}: at the same times the small kept frame, shown first after a jump, is the same frame (${smalls.filter((x) => x.small === x.expected).length} of ${smalls.length} kept)`, smalls.length === 48 && smalls.every((x) => x.small === x.expected), smalls.filter((x) => x.small !== x.expected));
        const edges = id.edges.filter((x) => x.shown === x.expected).length;
        check(`${engine}, ${name}: at a frame's first microsecond and just before it, the kept frame is the one the export takes (${edges} of ${id.edges.length})`, edges === id.edges.length, id.edges.filter((x) => x.shown !== x.expected));
        const flid = f.floor.identity.rows.filter((x) => x.shown === x.decoder && x.shown === x.expected).length;
        note(`${engine}, ${name}, the floor: ${flid} of 48 identity times; frame starts to the microsecond ${f.floor.identity.edges.filter((x) => x.shown === x.expected).length} of ${f.floor.identity.edges.length}. Steps forward ${f.floor.steps.forward.median} -> ${f.kept.steps.forward.median} ms, back ${f.floor.steps.back.median} -> ${f.kept.steps.back.median} ms. Memory held ${Math.round(kp.cache.bytes / 1048576)} MB in ${kp.cache.frames} frames.`);
      }
    }
  } catch (e) {
    check('the check ran to the end', false, e.stack || String(e));
  } finally {
    await h.closeAll();
    if (server) server.close();
    if (locked) fs.rmSync(LOCK, { force: true });
    result.runs = runs;
    process.exitCode = finish(path.join(__dirname, 'studio-scrub.json')) ? 1 : 0;
  }
})();

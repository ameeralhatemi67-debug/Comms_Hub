// Export lanes and their step-down ladder (Desktop_Power_Ideas.md P-06 and P-35; section 9, D11's gate; MVP_draft.md
// 62.10). One project, the runner's testsrc2 source with an Arabic title over it, exported with one lane (the floor),
// two and three, in Edge and inside the development package (no chip, the saving chip, the strong chip):
//   - every composed frame's fingerprint equals one lane's, frame by frame;
//   - the files' structure is one lane's exactly (codec, profile, size, pixel format, rate, every video timestamp, the
//     sound's packets);
//   - each frame at a segment's boundary (its first frame and the one before) is within 0.5 dB of one lane's, as PSNR
//     against the source over the picture above the title;
//   - forced faults each end in a valid file of exact structure and the same composed frames: a lane given another
//     H.264 profile (the join's guard refuses it, one lane runs), a lane failing once mid-segment (its segment runs
//     again on the lanes left), the first segment's lane failing (the export runs again with a lane fewer);
//   - with QUIET=1, in a quiet window only, each lane count is timed again without fingerprints, with the load beside it.
// SECONDS (default 20) and SIZE (1080 or 2160) choose the fixture; the gate's are ten minutes at 1080p and at 4K.
// ENGINES (a comma list of edge, edge-nochip, app-nochip, app-saving, app-strong; default all) chooses where; FAULTS=0
// leaves out the forced faults; EVERY=n fingerprints every n-th frame and the 30 frames each side of a boundary (default
// 1: every frame), for the long 4K runs, and says so in the record.
// Usage: SECONDS=600 SIZE=1080 node qa/studio-lanes.cjs   (writes qa/studio-lanes-<SIZE>-<SECONDS>s.json; ONLY=edge, Edge alone)
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const esbuild = require('esbuild');
const { dependency, launchOptions } = require('./runtime.cjs');
const { chromium } = dependency('playwright');
const h = require('./desktop-helpers.cjs');

/**
 * A covered window draws about once a second (Fork 2, 2026-11-04), which would stretch a long export: the application
 * starts with Windows' occlusion tracking off, and its window is brought in front of the others.
 */
const UNCOVERED = ['--disable-features=CalculateNativeWinOcclusion'];
const toFront = (app) =>
  app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0];
    w.show();
    if (w.isMinimized()) w.restore();
    w.moveTop();
    w.focus();
  });

const { check, note, result, finish } = h.record('qa/studio-lanes.cjs');
const SECONDS = Number(process.env.SECONDS || 20);
const SIZE = Number(process.env.SIZE || 1080);
const QUIET = process.env.QUIET === '1';
const EDGE_ONLY = process.env.ONLY === 'edge';
const ENGINES = (process.env.ENGINES || 'edge,edge-nochip,app-nochip,app-saving,app-strong').split(',');
const FAULTS = process.env.FAULTS !== '0';
const EVERY = Math.max(1, Number(process.env.EVERY || 1));
const W = SIZE === 2160 ? 3840 : 1920;
const H = SIZE === 2160 ? 2160 : 1080;
const out = path.join(__dirname, 'artifacts', `studio-lanes-${SIZE}-${SECONDS}s`);
const REAL = '00000000-0000-4000-8000-0000000000f2';
const SOURCE = path.join(out, 'source.mp4');
const LOCK = path.join(process.env.TEMP || os.tmpdir(), 'comms-hub-port3000.lock');
const BRANCH = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: h.root, encoding: 'utf8' }).stdout.trim();
const fontDir = (pkg) => path.join(h.root, 'node_modules', '@fontsource', pkg);
const fontCss = [['ibm-plex-sans-arabic', '600'], ['ibm-plex-sans-arabic', '700']]
  .map(([pkg, w]) => fs.readFileSync(path.join(fontDir(pkg), `${w}.css`), 'utf8').replace(/url\(\.\/files\//g, `url(/fonts/${pkg}/`))
  .join('\n');

function send(req, res, file, type) {
  const size = fs.statSync(file).size;
  const m = /bytes=(\d+)-(\d*)/.exec(req.headers.range || '');
  const from = m ? Number(m[1]) : 0;
  const to = m ? Math.min(size - 1, m[2] ? Number(m[2]) : size - 1) : size - 1;
  res.writeHead(m ? 206 : 200, { 'content-type': type, 'content-length': to - from + 1, 'accept-ranges': 'bytes', ...(m ? { 'content-range': `bytes ${from}-${to}/${size}` } : {}) });
  fs.createReadStream(file, { start: from, end: to }).pipe(res);
}

function serve(port) {
  const http = require('node:http');
  const page = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>المسارات</title><style>${fontCss}</style></head><body><script type="module" src="/bundle.js"></script></body></html>`;
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    const p = url.pathname;
    if (p === '/') return (res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }), res.end(page));
    if (p === '/favicon.ico') return (res.writeHead(204), res.end());
    if (p === '/bundle.js') return send(req, res, path.join(out, 'bundle.js'), 'text/javascript');
    if (p === `/api/media/${REAL}/content`) return send(req, res, SOURCE, 'video/mp4');
    const font = /^\/fonts\/([a-z-]+)\/(.+\.woff2?)$/.exec(p);
    if (font) return send(req, res, path.join(fontDir(font[1]), 'files', font[2]), 'font/woff2');
    const up = /^\/upload\/([\w-]+\.mp4)$/.exec(p);
    if (up && req.method === 'POST') {
      const file = path.join(out, up[1]);
      const at = Number(url.searchParams.get('at') || 0);
      if (at === 0) fs.writeFileSync(file, '');
      const w = fs.createWriteStream(file, { flags: 'r+', start: at });
      req.pipe(w);
      return w.on('finish', () => (res.writeHead(204), res.end()));
    }
    res.writeHead(404);
    res.end();
  });
  return h.listen(server, port).then((got) => Object.assign(server, { port: got }));
}

function makeSource() {
  const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', `testsrc2=size=${W}x${H}:rate=30:duration=${SECONDS}`, '-f', 'lavfi', '-i', `sine=frequency=440:sample_rate=48000:duration=${SECONDS}`,
    '-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
    '-c:v', 'libx264', '-preset', SECONDS > 60 ? 'ultrafast' : 'veryfast', '-crf', SECONDS > 60 ? '23' : '18', '-g', '30', '-c:a', 'aac', '-b:a', '128k', '-shortest', SOURCE], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`ffmpeg could not make the source: ${r.stderr}`);
}

function structure(file) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name,profile,width,height,pix_fmt,r_frame_rate,sample_rate,channels:packet=stream_index,pts_time,flags', '-of', 'json', file], { encoding: 'utf8', maxBuffer: 1 << 30 });
  const j = JSON.parse(r.stdout);
  const v = j.streams.find((s) => s.codec_type === 'video') || {};
  const a = j.streams.find((s) => s.codec_type === 'audio') || {};
  const vi = j.streams.indexOf(v);
  const ai = j.streams.indexOf(a);
  const vp = j.packets.filter((p) => p.stream_index === vi);
  return {
    video: { codec: v.codec_name, profile: v.profile, width: v.width, height: v.height, pix_fmt: v.pix_fmt, rate: v.r_frame_rate },
    audio: { codec: a.codec_name, rate: a.sample_rate, channels: a.channels },
    pts: vp.map((p) => p.pts_time).sort((x, y) => Number(x) - Number(y)),
    keys: vp.filter((p) => p.flags.startsWith('K')).map((p) => p.pts_time).sort((x, y) => Number(x) - Number(y)),
    audioPackets: j.packets.filter((p) => p.stream_index === ai).length,
  };
}

/** PSNR of every frame of a file against the source, in order, over the top three quarters (the title is below). */
function framePsnr(file) {
  const name = `${path.basename(file)}.psnr.txt`;
  const stats = path.join(out, name);
  // run in the folder, so the filter's file name needs no drive letter (its colon would need escaping)
  spawnSync('ffmpeg', ['-hide_banner', '-v', 'error', '-i', file, '-i', SOURCE, '-lavfi', `[0:v]crop=iw:ih*3/4:0:0[a];[1:v]crop=iw:ih*3/4:0:0[b];[a][b]psnr=stats_file=${name}`, '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 1 << 26, cwd: out });
  return fs.readFileSync(stats, 'utf8').split('\n').filter(Boolean).map((l) => Number((/psnr_avg:([\d.]+|inf)/.exec(l) || [])[1] === 'inf' ? 99 : (/psnr_avg:([\d.]+)/.exec(l) || [0, NaN])[1]));
}

const load = () => Number(h.ps('(Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average')) || null;
const ready = (page) => page.waitForFunction(() => !!window.lanecheck, null, { timeout: 60000 });
const short = SIZE;

async function inEngine(page, name, url) {
  await page.goto(`${url}/`);
  await ready(page);
  const r = { engine: await page.evaluate(() => window.lanecheck.engine()), runs: {} };
  const total = SECONDS * 30;
  const seg = (k) => {
    const group = 60;
    const groups = Math.ceil(total / group);
    const out = [];
    let at = 0;
    for (let i = 0; i < Math.min(k, groups); i++) {
      const take = Math.floor(groups / Math.min(k, groups)) + (i < groups % Math.min(k, groups) ? 1 : 0);
      out.push(at);
      at = Math.min(total, at + take * group);
    }
    return out;
  };
  // the frames fingerprinted: every EVERY-th, and 30 each side of every boundary of two and three lanes
  const near = new Set([...seg(2), ...seg(3)].filter((b) => b > 0).flatMap((b) => Array.from({ length: 60 }, (_, i) => b - 30 + i)));
  const sample = EVERY === 1 ? null : Array.from({ length: total }, (_, n) => n % EVERY === 0 || near.has(n));
  const exp = async (tag, lanes, faults, hash = true) => {
    const e = await page.evaluate((o) => window.lanecheck.exportWith(o), { tag: `${name}-${tag}`, seconds: SECONDS, w: W, h: H, short, lanes, hash, faults, sample });
    const file = path.join(out, `${name}-${tag}.mp4`);
    return { ...e, file, structure: structure(file), psnr: framePsnr(file) };
  };
  r.runs.one = await exp('k1', 1);
  r.runs.two = await exp('k2', 2);
  r.runs.three = await exp('k3', 3);
  if (FAULTS) {
    r.runs.guard = await exp('guard', 3, { configOf: 1 });
    r.runs.lateFault = await exp('late', 3, { failAt: seg(3)[1] + 10 });
    r.runs.firstFault = await exp('first', 3, { failAt: 10 });
  }
  r.starts = { two: seg(2), three: seg(3) };
  if (QUIET) {
    r.timing = { loadBefore: load(), rounds: [] };
    for (let i = 0; i < 3; i++) {
      const round = {};
      for (const k of [1, 2, 3]) round[k] = (await page.evaluate((o) => window.lanecheck.exportWith(o), { tag: `${name}-t${i}-${k}`, seconds: SECONDS, w: W, h: H, short, lanes: k, hash: false })).ms;
      r.timing.rounds.push(round);
    }
    r.timing.loadAfter = load();
    const med = (k) => [...r.timing.rounds.map((x) => x[k])].sort((a, b) => a - b)[1];
    r.timing.median = { 1: med(1), 2: med(2), 3: med(3) };
    r.timing.ratio = { 2: Math.round((med(1) / med(2)) * 100) / 100, 3: Math.round((med(1) / med(3)) * 100) / 100 };
  }
  for (const x of Object.values(r.runs)) fs.rmSync(x.file, { force: true });
  return r;
}

function takeLock() {
  try {
    const fd = fs.openSync(LOCK, 'wx');
    fs.writeSync(fd, BRANCH);
    fs.closeSync(fd);
    return true;
  } catch {
    return false;
  }
}

(async () => {
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  const servers = [];
  const engines = {};
  let locked = false;
  try {
    if (!EDGE_ONLY && !fs.existsSync(h.devExe)) throw new Error(`the development package is missing: ${h.devExe} (npm run pack:dev in desktop/)`);
    if (!EDGE_ONLY && (await h.portAnswers(3000))) throw new Error('something already answers on 127.0.0.1:3000; run again when it is free');
    if (!EDGE_ONLY && !(locked = takeLock())) throw new Error(`the port-3000 lock is held (${fs.readFileSync(LOCK, 'utf8')}); run again when it is free`);
    makeSource();
    await esbuild.build({ entryPoints: [path.join(__dirname, 'fixtures', 'studio-lanes.ts')], bundle: true, format: 'esm', platform: 'browser', target: 'es2022', outfile: path.join(out, 'bundle.js'), logLevel: 'silent', absWorkingDir: h.root });
    const edge = await serve(0);
    servers.push(edge);
    if (!EDGE_ONLY) servers.push(await serve(3000));
    for (const [name, args] of [['edge', []], ['edge-nochip', ['--disable-gpu']]].filter(([n]) => ENGINES.includes(n))) {
      const browser = await chromium.launch({ ...launchOptions, args });
      try {
        engines[name] = { browser: browser.version(), ...(await inEngine(await browser.newPage(), name, `http://127.0.0.1:${edge.port}`)) };
      } finally {
        await browser.close();
      }
    }
    for (const [name, settings, args] of (EDGE_ONLY ? [] : [
      ['app-nochip', { keepInTray: false, gpu: 'auto' }, ['--disable-gpu']],
      ['app-saving', { keepInTray: false, gpu: 'saving' }, []],
      ['app-strong', { keepInTray: false, gpu: 'strong' }, []],
    ]).filter(([n]) => ENGINES.includes(n))) {
      const { app, win } = await h.launchDev(`lanes-${name}`, { settings, args: [...args, ...UNCOVERED] });
      await toFront(app);
      try {
        await h.until(() => win.url().startsWith('http://127.0.0.1:3000'), 30000);
        await win.waitForLoadState('load');
        const versions = await app.evaluate(() => ({ electron: process.versions.electron, chrome: process.versions.chrome }));
        engines[name] = { versions, ...(await inEngine(win, name, 'http://127.0.0.1:3000')) };
      } finally {
        await h.closeAll();
      }
    }

    // --- the checks ---------------------------------------------------------------------------------
    for (const [name, e] of Object.entries(engines)) {
      const one = e.runs.one;
      const frames = SECONDS * 30;
      const printed = one.prints.filter(Boolean).length;
      check(`${name}: one lane is the floor (${frames} frames, ${EVERY === 1 ? 'every one' : `${printed}`} fingerprinted)`, one.lanes === 1 && one.steps.length === 0 && one.prints.length >= frames - EVERY && printed > 0 && (EVERY > 1 || printed === frames), { via: one.via, ms: one.ms, printed });
      const sameStructure = (x) => JSON.stringify(x.structure.video) === JSON.stringify(one.structure.video) && JSON.stringify(x.structure.audio) === JSON.stringify(one.structure.audio) && JSON.stringify(x.structure.pts) === JSON.stringify(one.structure.pts) && x.structure.audioPackets === one.structure.audioPackets && x.structure.pts.length === frames;
      const samePrints = (x) => x.prints.length === one.prints.length && one.prints.every((p, i) => p === x.prints[i]);
      const firstDiff = (x) => x.prints.findIndex((p, i) => p !== one.prints[i]);
      for (const [key, k] of [['two', 2], ['three', 3]]) {
        const x = e.runs[key];
        check(`${name}, ${k} lanes: every composed frame is one lane's, the structure is one lane's exactly`, x.lanes === k && x.steps.length === 0 && samePrints(x) && sameStructure(x), { lanes: x.lanes, steps: x.steps, firstDiff: firstDiff(x), keys: x.structure.keys.length, ms: [one.ms, x.ms] });
        const bounds = e.starts[key].slice(1).flatMap((s) => [s - 1, s]);
        const worst = bounds.map((i) => ({ frame: i, one: one.psnr[i], lanes: x.psnr[i], delta: Math.round((x.psnr[i] - one.psnr[i]) * 100) / 100 }));
        check(`${name}, ${k} lanes: each frame at a segment's boundary is within 0.5 dB of one lane's (PSNR against the source)`, worst.length > 0 && worst.every((b) => Math.abs(b.delta) <= 0.5), worst);
      }
      if (!FAULTS) {
        if (e.timing) note(`${name}: time with 1, 2 and 3 lanes (medians of three, ms): ${JSON.stringify(e.timing.median)}, speed-up ${JSON.stringify(e.timing.ratio)}, load ${e.timing.loadBefore}% before and ${e.timing.loadAfter}% after.`);
        continue;
      }
      const g = e.runs.guard;
      check(`${name}: a lane with another H.264 profile is refused by the join's guard; the export runs with one lane and its file is the floor's`, g.lanes === 1 && g.steps.join() === 'LANE:LANES' && samePrints(g) && sameStructure(g), { lanes: g.lanes, steps: g.steps });
      const l = e.runs.lateFault;
      check(`${name}: a lane failing once mid-segment: its segment runs again on the lanes left, and the file is exact`, l.lanes === 3 && l.steps.join() === 'ENCODER' && samePrints(l) && sameStructure(l), { lanes: l.lanes, steps: l.steps, firstDiff: firstDiff(l) });
      const f = e.runs.firstFault;
      check(`${name}: the first segment's lane failing: the export runs again with a lane fewer, and the file is exact`, f.lanes === 2 && f.steps.join() === 'LANE:ENCODER' && samePrints(f) && sameStructure(f), { lanes: f.lanes, steps: f.steps });
      if (e.timing) note(`${name}: time with 1, 2 and 3 lanes (medians of three, ms): ${JSON.stringify(e.timing.median)}, speed-up ${JSON.stringify(e.timing.ratio)}, load ${e.timing.loadBefore}% before and ${e.timing.loadAfter}% after.`);
    }
  } catch (err) {
    check('the check ran to its end', false, String((err && err.stack) || err));
  } finally {
    await h.closeAll();
    for (const s of servers) s.close();
    if (locked && fs.existsSync(LOCK) && fs.readFileSync(LOCK, 'utf8') === BRANCH) fs.rmSync(LOCK);
  }
  result.fixture = { seconds: SECONDS, size: `${W}x${H}`, short, engines: ENGINES, faults: FAULTS, fingerprinted: EVERY === 1 ? 'every frame' : `every ${EVERY}th frame and 30 each side of every boundary` };
  result.engines = Object.fromEntries(Object.entries(engines).map(([n, e]) => [n, { browser: e.browser, versions: e.versions, engine: e.engine, starts: e.starts, timing: e.timing ?? null, runs: Object.fromEntries(Object.entries(e.runs).map(([k, x]) => [k, { lanes: x.lanes, steps: x.steps, ms: x.ms, bytes: x.bytes, via: x.via, keys: x.structure.keys.length, frames: x.structure.pts.length }])) }]));
  if (!EDGE_ONLY) note(`The application started with ${UNCOVERED.join(' ')}, its window in front.`);
  // a run of chosen engines is its own record, so one engine at a time keeps the others'
  const which = process.env.ENGINES ? `-${ENGINES.join('+')}` : '';
  const failed = finish(path.join(__dirname, `studio-lanes-${SIZE}-${SECONDS}s${which}${EDGE_ONLY ? '-edge' : QUIET ? '-speed' : ''}.json`));
  process.exit(failed ? 1 : 0);
})();

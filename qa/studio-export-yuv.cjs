// The export's encoder settings, its BT.709 conversion in workers and the colour it writes (MVP_draft.md 62.10;
// Desktop_Power_Ideas.md 5.2; 2026-11-04). Run in Edge with and without its graphics chip, and inside the development
// package with no graphics chip, on the saving chip and on the strong chip:
//   - every composed frame of the corpus (bench-docs.ts) converted to I420 by the workers is the page's conversion
//     byte for byte, from the bundle as it is and from a minified bundle (the workers are made from a function's text);
//   - with no graphics chip, a real three-second 1080p export with workers and with the page's conversion carry the
//     same video packets, at least 40 dB from the source and within 15% of the 10 Mbit/s the export aims at;
//   - on a graphics chip, the export as it is and as it was at 998ef0c carry the same video packets (the encoder
//     settings did not change there), and the file says BT.709 (Edge's said iec61966-2-1);
//   - with QUIET=1 (only in a quiet window: speed figures are worthless on a busy laptop), three rounds of the no-chip
//     export as it is, at 998ef0c (the page's conversion) and at 996a9b5 (the canvas, before BT.709), timed, with the
//     processor's load beside them; the target is at most 1.2 times the canvas's time.
// The earlier exports are written from git into qa/artifacts and bundled with today's other modules.
// Usage: node qa/studio-export-yuv.cjs [QUIET=1]   (writes qa/studio-export-yuv.json)
// Needs: npm run pack:dev in desktop/, ffmpeg and ffprobe, the port-3000 lock free (the runner takes it).
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const esbuild = require('esbuild');
const { dependency, launchOptions } = require('./runtime.cjs');
const { chromium } = dependency('playwright');
const h = require('./desktop-helpers.cjs');

const { check, note, result, finish } = h.record('qa/studio-export-yuv.cjs');
const out = path.join(__dirname, 'artifacts', 'studio-export-yuv');
const REAL = '00000000-0000-4000-8000-0000000000f1';
const SOURCE = path.join(out, 'source.mp4');
const QUIET = process.env.QUIET === '1';
/** ONLY=edge runs Edge alone (port 3101, no lock): a quick look, never the record. */
const EDGE_ONLY = process.env.ONLY === 'edge';
const LOCK = path.join(process.env.TEMP || os.tmpdir(), 'comms-hub-port3000.lock');
const BRANCH = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: h.root, encoding: 'utf8' }).stdout.trim();
const fontDir = (pkg) => path.join(h.root, 'node_modules', '@fontsource', pkg);
const fontCss = [['ibm-plex-sans-arabic', '600'], ['ibm-plex-sans-arabic', '700'], ['reem-kufi', '600'], ['aref-ruqaa', '700']]
  .map(([pkg, w]) => fs.readFileSync(path.join(fontDir(pkg), `${w}.css`), 'utf8').replace(/url\(\.\/files\//g, `url(/fonts/${pkg}/`))
  .join('\n');

/** An earlier commit's export.ts, its own imports pointed at today's modules. */
function oldExport(rev) {
  const dir = path.join(out, `at-${rev}`);
  fs.mkdirSync(dir, { recursive: true });
  const text = spawnSync('git', ['show', `${rev}:src/lib/studio/export.ts`], { cwd: h.root, encoding: 'utf8' }).stdout;
  const studio = path.join(h.root, 'src', 'lib', 'studio').replace(/\\/g, '/');
  fs.writeFileSync(path.join(dir, 'export.ts'), text.replace(/from '\.\/([\w-]+\.ts)'/g, `from '${studio}/$1'`));
  return dir;
}

async function bundle() {
  const alias = { '@old998': oldExport('998ef0c'), '@old996': oldExport('996a9b5') };
  const base = { entryPoints: [path.join(__dirname, 'fixtures', 'studio-export-yuv.ts')], bundle: true, format: 'esm', platform: 'browser', target: 'es2022', logLevel: 'silent', absWorkingDir: h.root, alias, nodePaths: [path.join(h.root, 'node_modules')] };
  await esbuild.build({ ...base, outfile: path.join(out, 'bundle.js') });
  await esbuild.build({ ...base, outfile: path.join(out, 'bundle.min.js'), minify: true });
}

function send(req, res, file, type) {
  const data = fs.readFileSync(file);
  const m = /bytes=(\d+)-(\d*)/.exec(req.headers.range || '');
  if (m) {
    const from = Number(m[1]);
    const to = Math.min(data.length - 1, m[2] ? Number(m[2]) : data.length - 1);
    res.writeHead(206, { 'content-type': type, 'content-range': `bytes ${from}-${to}/${data.length}`, 'content-length': to - from + 1, 'accept-ranges': 'bytes' });
    return res.end(data.subarray(from, to + 1));
  }
  res.writeHead(200, { 'content-type': type, 'content-length': data.length, 'accept-ranges': 'bytes' });
  res.end(data);
}

function serve(port) {
  const http = require('node:http');
  const page = (min) => `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>تحويل الألوان</title><style>${fontCss}</style></head><body><script type="module" src="/${min ? 'bundle.min.js' : 'bundle.js'}"></script></body></html>`;
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    const p = url.pathname;
    if (p === '/') return (res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }), res.end(page(url.searchParams.get('min') === '1')));
    if (p === '/favicon.ico') return (res.writeHead(204), res.end());
    if (p === '/bundle.js' || p === '/bundle.min.js') return send(req, res, path.join(out, p.slice(1)), 'text/javascript');
    if (p === `/api/media/${REAL}/content`) return send(req, res, SOURCE, 'video/mp4');
    if (p.startsWith('/motion/')) return send(req, res, path.join(h.root, 'public', p), p.endsWith('.json') ? 'application/json' : 'image/png');
    const font = /^\/fonts\/([a-z-]+)\/(.+\.woff2?)$/.exec(p);
    if (font) return send(req, res, path.join(fontDir(font[1]), 'files', font[2]), 'font/woff2');
    const up = /^\/upload\/([\w-]+\.mp4)$/.exec(p);
    if (up && req.method === 'POST') {
      const w = fs.createWriteStream(path.join(out, up[1]));
      req.pipe(w);
      return w.on('finish', () => (res.writeHead(204), res.end()));
    }
    res.writeHead(404);
    res.end();
  });
  return h.listen(server, port).then(() => server);
}

function makeSource() {
  const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=1920x1080:rate=30:duration=3', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=3',
    '-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '16', '-g', '30', '-c:a', 'aac', '-b:a', '128k', '-shortest', SOURCE], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`ffmpeg could not make the source: ${r.stderr}`);
}

/** The video packets of a file, hashed one by one (the container's own times differ from run to run). */
function packets(file) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-map', '0:v', '-c', 'copy', '-f', 'framemd5', '-'], { encoding: 'utf8', maxBuffer: 1 << 26 });
  const lines = r.stdout.split('\n').filter((l) => l && !l.startsWith('#'));
  return { count: lines.length, hash: crypto.createHash('sha256').update(lines.join('\n')).digest('hex').slice(0, 16) };
}
function probe(file) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v', '-show_entries', 'stream=profile,color_space,color_primaries,color_transfer,color_range:format=duration', '-of', 'json', file], { encoding: 'utf8' });
  const j = JSON.parse(r.stdout);
  const s = j.streams[0] || {};
  const bytes = fs.statSync(file).size;
  return { profile: s.profile, colour: { space: s.color_space, primaries: s.color_primaries, transfer: s.color_transfer, range: s.color_range }, mbps: Math.round(((bytes * 8) / Number(j.format.duration)) / 1e4) / 100 };
}
function psnr(file) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-i', file, '-i', SOURCE, '-lavfi', '[0:v][1:v]psnr', '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 1 << 24 });
  const m = /average:([\d.]+|inf)/.exec(r.stderr);
  return m ? (m[1] === 'inf' ? 99 : Number(m[1])) : null;
}
const load = () => Number(h.ps('(Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average')) || null;
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const ready = (page) => page.waitForFunction(() => !!window.yuvcheck, null, { timeout: 60000 });

/** What one engine does: both parity runs, then its exports. */
async function inEngine(page, name, url, chip) {
  const r = { name };
  await page.goto(`${url}/?min=1`);
  await ready(page);
  await page.evaluate(() => window.yuvcheck.prepare());
  r.parityMin = await page.evaluate(() => window.yuvcheck.parity(2));
  await page.goto(`${url}/`);
  await ready(page);
  r.prepared = await page.evaluate(() => window.yuvcheck.prepare());
  r.engine = await page.evaluate(() => window.yuvcheck.engine());
  r.parity = await page.evaluate(() => window.yuvcheck.parity(2));
  const exp = async (tag, code, yuvWorkers) => {
    const e = await page.evaluate((o) => window.yuvcheck.exportReal(o), { tag: `${name}-${tag}`, code, yuvWorkers });
    const file = path.join(out, `${name}-${tag}.mp4`);
    return { ...e, packets: packets(file), ...probe(file), psnr: psnr(file) };
  };
  r.exports = {};
  if (chip) {
    r.exports.now = await exp('now', 'now');
    r.exports.at998 = await exp('at998', 'at998');
  } else {
    r.exports.workers = await exp('workers', 'now');
    r.exports.page = await exp('page', 'now', 0);
    if (QUIET) {
      r.timing = { loadBefore: load(), rounds: [] };
      for (let i = 0; i < 3; i++) {
        const round = {};
        for (const [tag, code] of [['at996', 'at996'], ['at998', 'at998'], ['now', 'now']]) round[tag] = (await exp(`t${i}-${tag}`, code)).ms;
        r.timing.rounds.push(round);
      }
      r.timing.loadAfter = load();
      r.timing.median = Object.fromEntries(['at996', 'at998', 'now'].map((k) => [k, median(r.timing.rounds.map((x) => x[k]))]));
    }
  }
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
  const runs = {};
  let locked = false;
  try {
    if (!fs.existsSync(h.devExe)) throw new Error(`the development package is missing: ${h.devExe} (npm run pack:dev in desktop/)`);
    if (!EDGE_ONLY && (await h.portAnswers(3000))) throw new Error('something already answers on 127.0.0.1:3000; run again when it is free');
    if (!EDGE_ONLY && !(locked = takeLock())) throw new Error(`the port-3000 lock is held (${fs.readFileSync(LOCK, 'utf8')}); run again when it is free`);
    makeSource();
    await bundle();
    servers.push(await serve(3101));
    if (!EDGE_ONLY) servers.push(await serve(3000));

    // Edge: with its graphics chip, then without
    for (const [name, args, chip] of [['edge', [], true], ['edge-nochip', ['--disable-gpu'], false]]) {
      const browser = await chromium.launch({ ...launchOptions, args });
      try {
        const tab = await browser.newPage();
        runs[name] = { browser: browser.version(), ...(await inEngine(tab, name, 'http://127.0.0.1:3101', chip)) };
      } finally {
        await browser.close();
      }
    }
    // the application: no chip, the saving chip, the strong chip
    for (const [name, settings, args, chip] of EDGE_ONLY ? [] : [
      ['app-nochip', { keepInTray: false, gpu: 'auto' }, ['--disable-gpu'], false],
      ['app-saving', { keepInTray: false, gpu: 'saving' }, [], true],
      ['app-strong', { keepInTray: false, gpu: 'strong' }, [], true],
    ]) {
      const { app, win } = await h.launchDev(`yuv-${name}`, { settings, args });
      try {
        await h.instrument(app);
        await h.until(() => win.url().startsWith('http://127.0.0.1:3000'), 30000);
        await win.waitForLoadState('load');
        const versions = await app.evaluate(() => ({ electron: process.versions.electron, chrome: process.versions.chrome }));
        runs[name] = { versions, ...(await inEngine(win, name, 'http://127.0.0.1:3000', chip)) };
      } finally {
        await h.closeAll();
      }
    }

    // --- the checks ---------------------------------------------------------------------------------
    for (const [name, r] of Object.entries(runs)) {
      const frames = r.prepared.docs.reduce((n, d) => n + d.frames, 0);
      for (const [kind, list] of [['the bundle', r.parity], ['a minified bundle', r.parityMin]]) {
        const differing = list.filter((f) => f.page !== f.workers).map((f) => `${f.name}#${f.i}`);
        check(`${name}, ${kind}: every composed frame of the corpus converted by the workers is the page's conversion byte for byte, labelled BT.709 limited range`, list.length === frames && differing.length === 0, { frames: list.length, differing, sizes: [...new Set(list.map((f) => f.size))] });
      }
    }
    for (const [name, r] of Object.entries(runs)) {
      const x = r.exports;
      if (x.workers) {
        check(`${name}: the export takes the BT.709 way with two workers, and with none when asked`, r.engine.onChip === false && x.workers.via === 'yuv' && x.workers.yuvWorkers === 2 && x.page.via === 'yuv' && x.page.yuvWorkers === 0, { engine: r.engine, workers: x.workers.yuvWorkers, page: x.page.yuvWorkers });
        check(`${name}: with workers and on the page, the same ${x.workers.packets.count} video packets`, x.workers.packets.count === 90 && x.workers.packets.hash === x.page.packets.hash, { workers: x.workers.packets, page: x.page.packets });
        check(`${name}: the file is at least 40 dB from its source and within 15% of the 10 Mbit/s aimed at`, x.workers.psnr >= 40 && Math.abs(x.workers.mbps - 10) <= 1.5, { psnr: x.workers.psnr, mbps: x.workers.mbps, bytes: x.workers.bytes });
        check(`${name}: the file says BT.709 limited range`, JSON.stringify(x.workers.colour) === JSON.stringify({ space: 'bt709', primaries: 'bt709', transfer: 'bt709', range: 'tv' }), x.workers.colour);
      } else {
        check(`${name}: the export takes the canvas way`, r.engine.onChip === true && x.now.via === 'canvas' && x.at998.via === 'canvas', { engine: r.engine });
        check(`${name}: the export as it is and as it was at 998ef0c carry the same ${x.now.packets.count} video packets`, x.now.packets.count === 90 && x.now.packets.hash === x.at998.packets.hash, { now: { ...x.now.packets, psnr: x.now.psnr, mbps: x.now.mbps }, at998: { ...x.at998.packets, psnr: x.at998.psnr, mbps: x.at998.mbps } });
        check(`${name}: the file says BT.709 limited range`, JSON.stringify(x.now.colour) === JSON.stringify({ space: 'bt709', primaries: 'bt709', transfer: 'bt709', range: 'tv' }), { now: x.now.colour, at998: x.at998.colour });
      }
    }
    const said = Object.entries(runs).map(([n, r]) => [n, (r.exports.now ?? r.exports.workers).colour]);
    check('every engine, the browser and the application, chip or none, writes the same colour description', said.every(([, c]) => JSON.stringify(c) === JSON.stringify(said[0][1])), Object.fromEntries(said));
    if (QUIET) {
      for (const name of ['edge-nochip', 'app-nochip'].filter((n) => runs[n])) {
        const t = runs[name].timing;
        const ratio = Math.round((t.median.now / t.median.at996) * 100) / 100;
        t.ratio = ratio;
        check(`${name}: the BT.709 export with workers takes at most 1.2 times the canvas's time (medians of three, ms)`, ratio <= 1.2, { ...t.median, ratio, pageToCanvas: Math.round((t.median.at998 / t.median.at996) * 100) / 100, load: [t.loadBefore, t.loadAfter], rounds: t.rounds });
      }
    } else note('Speed not measured (QUIET=1 is for a quiet window only).');
  } catch (e) {
    check('the check ran to its end', false, String((e && e.stack) || e));
  } finally {
    await h.closeAll();
    for (const s of servers) s.close();
    if (locked && fs.existsSync(LOCK) && fs.readFileSync(LOCK, 'utf8') === BRANCH) fs.rmSync(LOCK);
  }
  result.runs = Object.fromEntries(Object.entries(runs).map(([n, r]) => [n, { browser: r.browser, versions: r.versions, engine: r.engine, exports: r.exports, timing: r.timing ?? null, frames: r.parity?.length ?? 0 }]));
  const failed = finish(EDGE_ONLY ? path.join(out, 'edge-only.json') : path.join(__dirname, 'studio-export-yuv.json'));
  process.exit(failed ? 1 : 0);
})();

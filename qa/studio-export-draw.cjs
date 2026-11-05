// The export's drawing in workers (Desktop_Power_Ideas.md P-07; MVP_draft.md 62.10; 2026-11-04). Run in Edge with and
// without its graphics chip, and inside the development package with no graphics chip, on the saving chip and on the
// strong chip:
//   - every frame of the corpus (bench-docs.ts: shapes, Arabic text, effects and covers over 4K footage, sixteen
//     transitions, a keyed picture, a motion template with the brand marks) composed by drawing workers is the frame
//     the page composes, byte for byte, read back the same way;
//   - a real three-second 1080p export with a title, drawn by two workers and on the page, carries the same video
//     packets, and so does one whose drawing workers cannot start (the export steps down to the page and says so).
// The worker's own file is bundled apart and served where the fixture starts it.
// Measured on 2026-11-04 (progress.md): the corpus is not exact everywhere. With a graphics chip the worker thread's
// raster differs by 1 level on some shape and brand-mark edges; with none, an OffscreenCanvas, the worker's kind of
// canvas, differs from the page's canvas element in blur and filters. So the drawing in workers stays off by default
// (the manager's decision (A)), and this check says on which engine it is exact.
// Usage: node qa/studio-export-draw.cjs   (writes qa/studio-export-draw.json; ONLY=edge, Edge alone, qa/studio-export-draw-edge.json)
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

const { check, note, result, finish } = h.record('qa/studio-export-draw.cjs');
const out = path.join(__dirname, 'artifacts', 'studio-export-draw');
const REAL = '00000000-0000-4000-8000-0000000000f1';
const SOURCE = path.join(out, 'source.mp4');
const EDGE_ONLY = process.env.ONLY === 'edge';
// the shared lock lives in the user's own temp folder, even when TEMP is pointed elsewhere for a run's files
const LOCK = path.join(process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Temp') : os.tmpdir(), 'comms-hub-port3000.lock');
const BRANCH = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: h.root, encoding: 'utf8' }).stdout.trim();
const fontDir = (pkg) => path.join(h.root, 'node_modules', '@fontsource', pkg);
const fontCss = [['ibm-plex-sans-arabic', '600'], ['ibm-plex-sans-arabic', '700'], ['reem-kufi', '600'], ['aref-ruqaa', '700']]
  .map(([pkg, w]) => fs.readFileSync(path.join(fontDir(pkg), `${w}.css`), 'utf8').replace(/url\(\.\/files\//g, `url(/fonts/${pkg}/`))
  .join('\n');

async function bundle() {
  const base = { bundle: true, format: 'esm', platform: 'browser', target: 'es2022', logLevel: 'silent', absWorkingDir: h.root };
  await esbuild.build({ ...base, entryPoints: [path.join(__dirname, 'fixtures', 'studio-export-draw.ts')], outfile: path.join(out, 'bundle.js') });
  await esbuild.build({ ...base, entryPoints: [path.join(h.root, 'src', 'lib', 'studio', 'export-draw.ts')], outfile: path.join(out, 'export-draw.js') });
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
  const page = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>الرسم في العمال</title><style>${fontCss}</style></head><body><script type="module" src="/bundle.js"></script></body></html>`;
  const server = http.createServer((req, res) => {
    const p = new URL(req.url, 'http://x').pathname;
    if (p === '/') return (res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }), res.end(page));
    if (p === '/favicon.ico') return (res.writeHead(204), res.end());
    if (p === '/bundle.js' || p === '/export-draw.js') return send(req, res, path.join(out, p.slice(1)), 'text/javascript');
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
  return h.listen(server, port).then((got) => Object.assign(server, { port: got }));
}

function makeSource() {
  const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=1920x1080:rate=30:duration=3', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=3',
    '-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '16', '-g', '30', '-c:a', 'aac', '-b:a', '128k', '-shortest', SOURCE], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`ffmpeg could not make the source: ${r.stderr}`);
}

function packets(file) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-map', '0:v', '-c', 'copy', '-f', 'framemd5', '-'], { encoding: 'utf8', maxBuffer: 1 << 26 });
  const lines = r.stdout.split('\n').filter((l) => l && !l.startsWith('#'));
  return { count: lines.length, hash: crypto.createHash('sha256').update(lines.join('\n')).digest('hex').slice(0, 16) };
}
const ready = (page) => page.waitForFunction(() => !!window.drawcheck, null, { timeout: 60000 });

async function inEngine(page, name, url) {
  const r = { name };
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${url}/`);
  await ready(page);
  r.prepared = await page.evaluate(() => window.drawcheck.prepare());
  r.engine = await page.evaluate(() => window.drawcheck.engine());
  r.parity = await page.evaluate(() => window.drawcheck.parity(2));
  const exp = async (tag, drawers, extra = {}) => {
    const e = await page.evaluate((o) => window.drawcheck.exportReal(o), { tag: `${name}-${tag}`, drawers, titled: true, ...extra });
    return { ...e, packets: packets(path.join(out, `${name}-${tag}.mp4`)) };
  };
  r.exports = { page: await exp('page', 0), workers: await exp('workers', 2), broken: await exp('broken', 2, { broken: true }) };
  r.errors = errors;
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
    // Edge needs no fixed port (only the application opens 127.0.0.1:3000): a free one, so other checks can run
    const edge = await serve(0);
    servers.push(edge);
    if (!EDGE_ONLY) servers.push(await serve(3000));
    for (const [name, args] of [['edge', []], ['edge-nochip', ['--disable-gpu']]]) {
      const browser = await chromium.launch({ ...launchOptions, args });
      try {
        runs[name] = { browser: browser.version(), ...(await inEngine(await browser.newPage(), name, `http://127.0.0.1:${edge.port}`)) };
      } finally {
        await browser.close();
      }
    }
    for (const [name, settings, args] of EDGE_ONLY ? [] : [
      ['app-nochip', { keepInTray: false, gpu: 'auto' }, ['--disable-gpu']],
      ['app-saving', { keepInTray: false, gpu: 'saving' }, []],
      ['app-strong', { keepInTray: false, gpu: 'strong' }, []],
    ]) {
      const { app, win, data } = await h.launchDev(`draw-${name}`, { settings, args: [...args, ...UNCOVERED] });
      await toFront(app);
      try {
        await h.instrument(app);
        await h.until(() => win.url().startsWith('http://127.0.0.1:3000'), 30000);
        await win.waitForLoadState('load');
        const versions = await app.evaluate(() => ({ electron: process.versions.electron, chrome: process.versions.chrome }));
        runs[name] = { versions, ...(await inEngine(win, name, 'http://127.0.0.1:3000')) };
      } finally {
        await h.closeAll();
        // the profile holds the private copies of the sources and exports (gigabytes for the long runs)
        fs.rmSync(data, { recursive: true, force: true });
      }
    }

    // --- the checks ---------------------------------------------------------------------------------
    for (const [name, r] of Object.entries(runs)) {
      const frames = r.prepared.docs.reduce((n, d) => n + d.frames, 0);
      const differing = r.parity.filter((f) => f.page !== f.worker);
      const byDoc = {};
      for (const f of differing) byDoc[f.name] = [...(byDoc[f.name] ?? []), { i: f.i, ...f.diff }];
      check(`${name}: every frame of the corpus composed by drawing workers is the page's, byte for byte`, r.parity.length === frames && differing.length === 0, { frames: r.parity.length, faces: r.prepared.faces, fonts: r.prepared.fonts, differing: byDoc });
      const x = r.exports;
      check(`${name}: an export drawn by two workers carries the page's ${x.page.packets.count} video packets`, x.workers.drawers === 2 && x.workers.steps.length === 0 && x.page.drawers === 0 && x.page.packets.count === 90 && x.workers.packets.hash === x.page.packets.hash, { via: x.workers.via, page: x.page.packets, workers: x.workers.packets, ms: [x.page.ms, x.workers.ms] });
      check(`${name}: where the drawing workers cannot start, the export draws on the page, says so, and carries the same packets`, x.broken.steps.join() === 'DRAW_WORKER' && x.broken.packets.hash === x.page.packets.hash, { steps: x.broken.steps, packets: x.broken.packets });
      check(`${name}: no page errors`, r.errors.length === 0, r.errors);
    }
  } catch (e) {
    check('the check ran to its end', false, String((e && e.stack) || e));
  } finally {
    await h.closeAll();
    for (const s of servers) s.close();
    if (locked && fs.existsSync(LOCK) && fs.readFileSync(LOCK, 'utf8') === BRANCH) fs.rmSync(LOCK);
  }
  note('Timings in the record are of a loaded laptop and are not speed figures.');
  result.runs = Object.fromEntries(Object.entries(runs).map(([n, r]) => [n, { browser: r.browser, versions: r.versions, engine: r.engine, exports: r.exports, differing: r.parity?.filter((f) => f.page !== f.worker) ?? [] }]));
  const failed = finish(path.join(__dirname, EDGE_ONLY ? 'studio-export-draw-edge.json' : 'studio-export-draw.json'));
  process.exit(failed ? 1 : 0);
})();

// One pass, several shapes (Desktop_Power_Ideas.md P-05; MVP_draft.md 62.10). A project with a 1080p source and an
// Arabic title, in 16:9, 9:16, 1:1 and 4:5, exported one shape after another (as before) and all four in one pass
// (shapes.ts), in Edge with and without its chip and inside the development package (no chip, the saving chip, the
// strong chip). For each shape: every composed frame's fingerprint equals its own export's, and the file's structure
// (ffprobe: codec, profile, size, pixel format, rate, every video timestamp, the sound's packets) is its own export's.
// Whether the video packets are the same too is recorded: they are where the encoder takes a quantizer; four processor
// encoders at once did not make the same bits (Edge with no chip, 2026-11-04), and the record says how far apart. The time of both ways is recorded; with QUIET=1, in a quiet window
// only, three interleaved rounds without fingerprints, with the load beside them.
// Usage: node qa/studio-shapes-onepass.cjs   (writes qa/studio-shapes-onepass.json; ONLY=edge, Edge alone,
// qa/studio-shapes-onepass-edge.json; ENGINES chooses, as in qa/studio-lanes.cjs)
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

const { check, note, result, finish } = h.record('qa/studio-shapes-onepass.cjs');
const SECONDS = Number(process.env.SECONDS || 6);
const QUIET = process.env.QUIET === '1';
const EDGE_ONLY = process.env.ONLY === 'edge';
const ENGINES = (process.env.ENGINES || 'edge,edge-nochip,app-nochip,app-saving,app-strong').split(',');
const out = path.join(__dirname, 'artifacts', 'studio-shapes-onepass');
const REAL = '00000000-0000-4000-8000-0000000000f3';
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
  const page = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>الأشكال معاً</title><style>${fontCss}</style></head><body><script type="module" src="/bundle.js"></script></body></html>`;
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
  const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', `testsrc2=size=1920x1080:rate=30:duration=${SECONDS}`, '-f', 'lavfi', '-i', `sine=frequency=440:sample_rate=48000:duration=${SECONDS}`,
    '-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-g', '30', '-c:a', 'aac', '-b:a', '128k', '-shortest', SOURCE], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`ffmpeg could not make the source: ${r.stderr}`);
}

function structure(file) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name,profile,width,height,pix_fmt,r_frame_rate,sample_rate,channels:packet=stream_index,pts_time', '-of', 'json', file], { encoding: 'utf8', maxBuffer: 1 << 28 });
  const j = JSON.parse(r.stdout);
  const v = j.streams.find((s) => s.codec_type === 'video') || {};
  const a = j.streams.find((s) => s.codec_type === 'audio') || {};
  const vi = j.streams.indexOf(v);
  const ai = j.streams.indexOf(a);
  return {
    video: { codec: v.codec_name, profile: v.profile, width: v.width, height: v.height, pix_fmt: v.pix_fmt, rate: v.r_frame_rate },
    audio: { codec: a.codec_name, rate: a.sample_rate, channels: a.channels },
    pts: j.packets.filter((p) => p.stream_index === vi).map((p) => p.pts_time).sort((x, y) => Number(x) - Number(y)),
    audioPackets: j.packets.filter((p) => p.stream_index === ai).length,
  };
}
function packets(file) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-map', '0:v', '-c', 'copy', '-f', 'framemd5', '-'], { encoding: 'utf8', maxBuffer: 1 << 28 });
  return crypto.createHash('sha256').update(r.stdout.split('\n').filter((l) => l && !l.startsWith('#')).join('\n')).digest('hex').slice(0, 16);
}
/** PSNR of one file against another, over every frame. */
function apart(a, b) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-i', a, '-i', b, '-lavfi', '[0:v][1:v]psnr', '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 1 << 24 });
  const m = /average:([\d.]+|inf)/.exec(r.stderr);
  return m ? (m[1] === 'inf' ? 99 : Number(m[1])) : null;
}
const load = () => Number(h.ps('(Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average')) || null;
const ready = (page) => page.waitForFunction(() => !!window.shapecheck, null, { timeout: 60000 });

async function inEngine(page, name, url) {
  await page.goto(`${url}/`);
  await ready(page);
  const r = await page.evaluate((o) => window.shapecheck.run(o), { seconds: SECONDS, short: 1080 });
  r.files = r.shapes.map((_, i) => {
    const alone = path.join(out, `alone-${i}.mp4`);
    const together = path.join(out, `together-${i}.mp4`);
    const x = { alone: { structure: structure(alone), packets: packets(alone) }, together: { structure: structure(together), packets: packets(together) } };
    x.apart = x.alone.packets === x.together.packets ? null : apart(alone, together);
    fs.renameSync(alone, path.join(out, `${name}-alone-${i}.mp4`));
    fs.renameSync(together, path.join(out, `${name}-together-${i}.mp4`));
    return x;
  });
  if (QUIET) {
    r.timing = { loadBefore: load(), rounds: [] };
    for (let i = 0; i < 3; i++) r.timing.rounds.push(await page.evaluate((o) => window.shapecheck.timed(o), { seconds: SECONDS, short: 1080 }));
    r.timing.loadAfter = load();
    const med = (k) => [...r.timing.rounds.map((x) => x[k])].sort((a, b) => a - b)[1];
    r.timing.median = { alone: med('alone'), together: med('together') };
    r.timing.ratio = Math.round((med('alone') / med('together')) * 100) / 100;
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
  const engines = {};
  let locked = false;
  const apps = EDGE_ONLY ? [] : [['app-nochip', { keepInTray: false, gpu: 'auto' }, ['--disable-gpu']], ['app-saving', { keepInTray: false, gpu: 'saving' }, []], ['app-strong', { keepInTray: false, gpu: 'strong' }, []]].filter(([n]) => ENGINES.includes(n));
  try {
    if (apps.length && !fs.existsSync(h.devExe)) throw new Error(`the development package is missing: ${h.devExe} (npm run pack:dev in desktop/)`);
    if (apps.length && (await h.portAnswers(3000))) throw new Error('something already answers on 127.0.0.1:3000; run again when it is free');
    if (apps.length && !(locked = takeLock())) throw new Error(`the port-3000 lock is held (${fs.readFileSync(LOCK, 'utf8')}); run again when it is free`);
    makeSource();
    await esbuild.build({ entryPoints: [path.join(__dirname, 'fixtures', 'studio-shapes-onepass.ts')], bundle: true, format: 'esm', platform: 'browser', target: 'es2022', outfile: path.join(out, 'bundle.js'), logLevel: 'silent', absWorkingDir: h.root });
    const edge = await serve(0);
    servers.push(edge);
    if (apps.length) servers.push(await serve(3000));
    for (const [name, args] of [['edge', []], ['edge-nochip', ['--disable-gpu']]].filter(([n]) => ENGINES.includes(n))) {
      const browser = await chromium.launch({ ...launchOptions, args });
      try {
        engines[name] = { browser: browser.version(), ...(await inEngine(await browser.newPage(), name, `http://127.0.0.1:${edge.port}`)) };
      } finally {
        await browser.close();
      }
    }
    for (const [name, settings, args] of apps) {
      const { app, win, data } = await h.launchDev(`shapes-${name}`, { settings, args: [...args, ...UNCOVERED] });
      await toFront(app);
      try {
        await h.until(() => win.url().startsWith('http://127.0.0.1:3000'), 30000);
        await win.waitForLoadState('load');
        const versions = await app.evaluate(() => ({ electron: process.versions.electron, chrome: process.versions.chrome }));
        engines[name] = { versions, ...(await inEngine(win, name, 'http://127.0.0.1:3000')) };
      } finally {
        await h.closeAll();
        // the profile holds the private copies of the sources and exports (gigabytes for the long runs)
        fs.rmSync(data, { recursive: true, force: true });
      }
    }
    for (const [name, e] of Object.entries(engines)) {
      const frames = SECONDS * 30;
      for (const [i, shape] of e.shapes.entries()) {
        const a = e.alone[i];
        const t = e.together[i];
        const f = e.files[i];
        const firstDiff = a.prints.findIndex((p, n) => p !== t.prints[n]);
        const sameStructure = JSON.stringify(f.alone.structure) === JSON.stringify(f.together.structure);
        check(`${name}, ${shape}: in one pass, every composed frame and the file's structure are the shape's own export's`, a.prints.length === frames && t.prints.length === frames && firstDiff === -1 && sameStructure && t.steps.length === 0, { via: [a.via, t.via], steps: t.steps, firstDiff, sameStructure, size: `${f.together.structure.video.width}x${f.together.structure.video.height}` });
        // the encoded bits: the same where the encoder takes a quantizer (the chips); the processor's encoders, four at
        // once, need not make the same bits from the same frames, so how far apart the two files are is recorded
        const samePackets = f.alone.packets === f.together.packets;
        note(`${name}, ${shape}: video packets ${samePackets ? 'identical' : `differ, the two files ${f.apart} dB apart (PSNR of one against the other)`} (${a.via}).`);
      }
      note(`${name}: four shapes one after another ${e.aloneMs} ms, in one pass ${e.togetherMs} ms, both with every frame fingerprinted (not a speed figure).`);
      if (e.timing) note(`${name}: speed, medians of three without fingerprints: one after another ${e.timing.median.alone} ms, one pass ${e.timing.median.together} ms, ${e.timing.ratio} times; load ${e.timing.loadBefore}% before and ${e.timing.loadAfter}% after.`);
    }
  } catch (err) {
    check('the check ran to its end', false, String((err && err.stack) || err));
  } finally {
    await h.closeAll();
    for (const s of servers) s.close();
    if (locked && fs.existsSync(LOCK) && fs.readFileSync(LOCK, 'utf8') === BRANCH) fs.rmSync(LOCK);
  }
  result.engines = Object.fromEntries(Object.entries(engines).map(([n, e]) => [n, { browser: e.browser, versions: e.versions, aloneMs: e.aloneMs, togetherMs: e.togetherMs, timing: e.timing ?? null, files: e.files }]));
  if (!EDGE_ONLY) note(`The application started with ${UNCOVERED.join(' ')}, its window in front.`);
  const which = process.env.ENGINES ? `-${ENGINES.join('+')}` : '';
  const failed = finish(path.join(__dirname, `studio-shapes-onepass${which}${EDGE_ONLY ? '-edge' : QUIET ? '-speed' : ''}.json`));
  process.exit(failed ? 1 : 0);
})();

// The cross-device proof (Desktop_Power_Ideas.md P-37 and P-38, section 5.2; MVP_draft.md 63.6; phase D9): "a stronger
// machine changes speed, never the video", checked rather than promised. The corpus of src/lib/studio/bench-docs.ts
// (eight documents: shapes on keys, Arabic text with reveals, effects over 4K footage, all sixteen transitions,
// covers, a keyed picture, a motion template with the brand marks, a landscape picture) is drawn by the real
// compositor (qa/fixtures/studio-crossdevice.ts) in Edge, the reference, and inside the development package on the
// saving chip, on the strong chip, and with no graphics chip at all (a weak machine, emulated). Three levels:
//   1. structure, exact everywhere: a real three-second export through the studio's own path, decoding included,
//      read by ffprobe (codec, profile, size, pixel format, rate, every video timestamp, sound);
//   2. composed frames, exact on one machine: every frame hashed twice, in two orders, must match;
//      within a stated tolerance across machines: each frame against the reference, pixel by pixel;
//   3. the encoded file: PSNR against its source at least 40 dB.
// Each run records the engine (Electron, Chromium), the renderer and the encoder preference used, so a file says
// what made it. No sign-in, no session, no secret; the application's own system calls are recorded, not acted on.
// Usage: node qa/studio-crossdevice.cjs   (writes qa/studio-crossdevice.json)
// Needs: npm run pack:dev in desktop/, ffmpeg and ffprobe, nothing on 127.0.0.1:3000.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const esbuild = require('esbuild');
const { dependency, launchOptions } = require('./runtime.cjs');
const { chromium } = dependency('playwright');
const h = require('./desktop-helpers.cjs');

const { check, note, result, finish } = h.record('qa/studio-crossdevice.cjs');
const out = path.join(__dirname, 'artifacts', 'studio-crossdevice');
const REAL = '00000000-0000-4000-8000-0000000000f1';
const SOURCE = path.join(out, 'source.mp4');
const fontDir = (pkg) => path.join(h.root, 'node_modules', '@fontsource', pkg);
const fontCss = [['ibm-plex-sans-arabic', '600'], ['ibm-plex-sans-arabic', '700'], ['reem-kufi', '600'], ['aref-ruqaa', '700']]
  .map(([pkg, w]) => fs.readFileSync(path.join(fontDir(pkg), `${w}.css`), 'utf8').replace(/url\(\.\/files\//g, `url(/fonts/${pkg}/`))
  .join('\n');
/**
 * Across machines, a frame passes at PSNR >= MIN_PSNR with at most MAX_OVER2 percent of channels more than 2 levels
 * apart: the strict start of Desktop_Power_Ideas.md 5.2, loosened only with a recorded reason. Checked document by
 * document, so the record names what depends on the machine.
 */
const MIN_PSNR = 50;
const MAX_OVER2 = 0.1;
/**
 * Between the processor's drawing (no graphics chip, `--disable-gpu`) and a chip's, the manager's stated tolerance of
 * 2026-11-05: PSNR >= 48 dB and at most 2.5% of channels more than 2 levels apart. Chromium's software rasterizer smooths the
 * edges of text, shapes and pictures by its own rule (keys, brand, landscape-keys), and turns a decoded video frame into
 * colour with its own rounding, a few levels across the whole picture; the whole-number effects then carry that input
 * exactly (effects frame 0: 50.43 dB with 2.02% over 2 levels; frame 2: 48.54 dB; transitions 48.77). Before the effects
 * the same frames were 3.01% and 48.21 dB. Nothing a speed knob does is in it: the same machine is still held exact in any
 * order, and the chips against each other at 50 dB and 0.1%.
 */
const NOCHIP = new Set(['app-software']);
const tolOf = (engine) => (NOCHIP.has(engine) ? { psnr: 48, over2: 2.5 } : { psnr: MIN_PSNR, over2: MAX_OVER2 });

function send(req, res, file, type) {
  const data = fs.readFileSync(file);
  const m = /bytes=(\d+)-(\d*)/.exec(req.headers.range || '');
  if (m) {
    const from = Number(m[1]);
    const to = Math.min(data.length - 1, m[2] ? Number(m[2]) : data.length - 1);
    res.writeHead(206, { 'content-type': type, 'content-range': `bytes ${from}-${to}/${data.length}`, 'content-length': to - from + 1, 'accept-ranges': 'bytes', 'access-control-allow-origin': '*' });
    return res.end(data.subarray(from, to + 1));
  }
  res.writeHead(200, { 'content-type': type, 'content-length': data.length, 'accept-ranges': 'bytes' });
  res.end(data);
}

function receive(req, res, file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const w = fs.createWriteStream(file);
  req.pipe(w);
  w.on('finish', () => {
    res.writeHead(204);
    res.end();
  });
}

async function serve() {
  await esbuild.build({ entryPoints: [path.join(__dirname, 'fixtures', 'studio-crossdevice.ts')], bundle: true, format: 'esm', platform: 'browser', target: 'es2022', outfile: path.join(out, 'bundle.js'), logLevel: 'silent', absWorkingDir: h.root });
  const page = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>البرهان بين الأجهزة</title><style>${fontCss}</style></head><body><script type="module" src="/bundle.js"></script></body></html>`;
  const http = require('node:http');
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    const p = url.pathname;
    if (p === '/') return (res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }), res.end(page));
    if (p === '/favicon.ico') return (res.writeHead(204), res.end());
    if (p === '/bundle.js') return send(req, res, path.join(out, 'bundle.js'), 'text/javascript');
    if (p === `/api/media/${REAL}/content`) return send(req, res, SOURCE, 'video/mp4');
    if (p.startsWith('/motion/')) return send(req, res, path.join(h.root, 'public', p), p.endsWith('.json') ? 'application/json' : 'image/png');
    const font = /^\/fonts\/([a-z-]+)\/(.+\.woff2?)$/.exec(p);
    if (font) return send(req, res, path.join(fontDir(font[1]), 'files', font[2]), 'font/woff2');
    const frame = /^\/frame\/([a-z-]+)\/(\d+)$/.exec(p);
    if (frame && req.method === 'POST') return receive(req, res, path.join(out, 'ref', `${frame[1]}-${frame[2]}.png`));
    const ref = /^\/ref\/([a-z-]+)\/(\d+)\.png$/.exec(p);
    if (ref) return send(req, res, path.join(out, 'ref', `${ref[1]}-${ref[2]}.png`), 'image/png');
    const up = /^\/upload\/([a-z-]+\.mp4)$/.exec(p);
    if (up && req.method === 'POST') return receive(req, res, path.join(out, up[1]));
    res.writeHead(404);
    res.end();
  });
  await h.listen(server, 3000);
  return server;
}

/**
 * The source, described as BT.709 limited range like the studio's exports: an untagged file is read with one matrix
 * by ffmpeg and another by Chromium (measured on 2026-11-03: green at 19 dB), which would test the tags, not the studio.
 */
function makeSource() {
  const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=1920x1080:rate=30:duration=3', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=3',
    '-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '16', '-g', '30', '-c:a', 'aac', '-b:a', '128k', '-shortest', SOURCE], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`ffmpeg could not make the source: ${r.stderr}`);
}

/** What ffprobe says of a file, every video timestamp included. */
function structure(file) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name,profile,width,height,pix_fmt,r_frame_rate,sample_rate,channels,color_space,color_primaries,color_transfer,color_range:packet=stream_index,pts_time', '-of', 'json', file], { encoding: 'utf8', maxBuffer: 1 << 26 });
  const j = JSON.parse(r.stdout);
  const v = j.streams.find((s) => s.codec_type === 'video') || {};
  const a = j.streams.find((s) => s.codec_type === 'audio') || {};
  const vi = j.streams.indexOf(v);
  const ai = j.streams.indexOf(a);
  return {
    video: { codec: v.codec_name, profile: v.profile, width: v.width, height: v.height, pix_fmt: v.pix_fmt, rate: v.r_frame_rate },
    colour: { space: v.color_space, primaries: v.color_primaries, transfer: v.color_transfer, range: v.color_range },
    audio: { codec: a.codec_name, rate: a.sample_rate, channels: a.channels },
    pts: j.packets.filter((p) => p.stream_index === vi).map((p) => p.pts_time).sort((x, y) => Number(x) - Number(y)),
    audioPackets: j.packets.filter((p) => p.stream_index === ai).length,
  };
}

function psnr(file) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-i', file, '-i', SOURCE, '-lavfi', '[0:v][1:v]psnr', '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 1 << 24 });
  const m = /average:([\d.]+|inf)/.exec(r.stderr);
  return m ? (m[1] === 'inf' ? 99 : Number(m[1])) : null;
}

const ready = (page) => page.waitForFunction(() => !!window.crossdevice, null, { timeout: 60000 });

async function runIn(page, engine, reference) {
  const prepared = await page.evaluate(() => window.crossdevice.prepare());
  const renderer = await page.evaluate(() => window.crossdevice.renderer());
  const first = await page.evaluate((up) => window.crossdevice.draw({ order: 'forward', upload: up }), reference);
  const second = await page.evaluate(() => window.crossdevice.draw({ order: 'shuffled' }));
  const compared = reference ? null : await page.evaluate(() => window.crossdevice.compare());
  const exported = await page.evaluate((e) => window.crossdevice.exportReal(e), engine);
  const squares = await page.evaluate(() => window.crossdevice.squaresParity());
  return { prepared, renderer, first, second, compared, exported, squares };
}

(async () => {
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  let server = null;
  const runs = {};
  try {
    if (!fs.existsSync(h.devExe)) throw new Error(`the development package is missing: ${h.devExe} (npm run pack:dev in desktop/)`);
    if (await h.portAnswers(3000)) throw new Error('something already answers on 127.0.0.1:3000; stop it and run again');
    makeSource();
    server = await serve();

    // the reference: Edge, as a browser is the floor
    const browser = await chromium.launch(launchOptions);
    try {
      const tab = await browser.newPage();
      await tab.goto('http://127.0.0.1:3000/');
      await ready(tab);
      runs.edge = { engine: { browser: browser.version() }, ...(await runIn(tab, 'edge', true)) };
    } finally {
      await browser.close();
    }

    // the application: each chip, then no chip at all
    for (const [engine, settings, args] of [
      ['app-saving', { keepInTray: false, gpu: 'saving' }, []],
      ['app-strong', { keepInTray: false, gpu: 'strong' }, []],
      ['app-software', { keepInTray: false, gpu: 'auto' }, ['--disable-gpu']],
    ]) {
      const { app, win } = await h.launchDev(`cross-${engine}`, { settings, args });
      try {
        await h.instrument(app);
        await h.until(() => win.url().startsWith('http://127.0.0.1:3000'), 30000);
        await win.waitForLoadState('load');
        await ready(win);
        const versions = await app.evaluate(() => ({ electron: process.versions.electron, chrome: process.versions.chrome }));
        const gpu = await win.evaluate(() => window.commsHubNative.gpu.state());
        runs[engine] = { engine: { ...versions, switch: gpu.active }, ...(await runIn(win, engine, false)) };
      } finally {
        await h.closeAll();
      }
    }

    // --- the checks ---------------------------------------------------------------------------------
    const ref = runs.edge;
    check('the reference loaded the shipped fonts, the template assets and the marks, and drew every frame of the eight documents', ref.prepared.fonts === true && ref.prepared.docs.length >= 8 && ref.first.length === ref.prepared.docs.reduce((n, d) => n + d.frames, 0), { prepared: ref.prepared, frames: ref.first.length, renderer: ref.renderer });
    for (const [engine, r] of Object.entries(runs)) {
      const same = r.first.length === r.second.length && r.first.every((f, i) => f.hash === r.second[i].hash);
      const differing = r.first.filter((f, i) => f.hash !== r.second[i]?.hash).map((f) => `${f.name}#${f.i}`);
      check(`${engine}: every composed frame is the same when drawn again in another order (exact, by hash)`, same, { frames: r.first.length, differing, renderer: r.renderer });
    }
    for (const [engine, r] of Object.entries(runs)) {
      const chip = r.squares.filter((s) => s.chip);
      check(`${engine}: «إخفاء بالمربعات» on the graphics chip equals the plain-code squares byte for byte (or the chip path is not offered here)`, chip.every((s) => s.differing === 0), { offered: chip.length > 0, cases: r.squares });
    }
    for (const [engine, r] of Object.entries(runs)) {
      if (!r.compared) continue;
      const identical = r.compared.filter((c) => c.maxDiff === 0).length;
      r.summary = { frames: r.compared.length, identical, minPsnr: Math.min(...r.compared.map((c) => c.psnr)), maxOver2: Math.max(...r.compared.map((c) => c.over2)), maxDiff: Math.max(...r.compared.map((c) => c.maxDiff)) };
      for (const name of [...new Set(r.compared.map((c) => c.name))]) {
        const mine = r.compared.filter((c) => c.name === name);
        const tol = tolOf(engine);
        const bad = mine.filter((c) => c.psnr < tol.psnr || c.over2 > tol.over2);
        const worst = [...mine].sort((a, b) => a.psnr - b.psnr)[0];
        check(`${engine}, «${name}»: every frame within the tolerance of the reference (PSNR at least ${tol.psnr} dB, at most ${tol.over2}% of channels more than 2 levels apart)`, bad.length === 0, { frames: mine.length, identical: mine.filter((c) => c.maxDiff === 0).length, worst, bad: bad.length });
      }
    }
    const probes = Object.fromEntries(Object.keys(runs).map((e) => [e, structure(path.join(out, `${e}.mp4`))]));
    const base = probes.edge;
    for (const [engine, p] of Object.entries(probes)) {
      const same = JSON.stringify(p.video) === JSON.stringify(base.video) && JSON.stringify(p.audio) === JSON.stringify(base.audio) && JSON.stringify(p.pts) === JSON.stringify(base.pts) && p.audioPackets === base.audioPackets;
      check(`${engine}: the real export's structure is the reference's exactly (codec, profile, size, pixel format, rate, ${base.pts.length} video timestamps, sound)`, same && p.pts.length === 90 && p.video.codec === 'h264' && p.video.width === 1920, { video: p.video, audio: p.audio, frames: p.pts.length, audioPackets: p.audioPackets, firstPts: p.pts.slice(0, 3), lastPts: p.pts.slice(-2) });
      const q = psnr(path.join(out, `${engine}.mp4`));
      runs[engine].psnr = q;
      check(`${engine}: the encoded file is at least 40 dB from its source`, q !== null && q >= 40, { psnr: q, bytes: runs[engine].exported.bytes, ms: runs[engine].exported.ms });
    }
    // the colour description written into the file: the same on every chip of one Chromium; the browser's may differ
    const apps = Object.entries(probes).filter(([e]) => e.startsWith('app-'));
    check('the application writes the same colour description on every chip and with no chip', apps.every(([, p]) => JSON.stringify(p.colour) === JSON.stringify(apps[0][1].colour)), Object.fromEntries(apps.map(([e, p]) => [e, p.colour])));
    check('the browser and the application write the same colour description', apps.every(([, p]) => JSON.stringify(p.colour) === JSON.stringify(base.colour)), { edge: base.colour, application: apps[0]?.[1].colour, engines: { edge: runs.edge.engine, application: runs[apps[0]?.[0]]?.engine } });
    result.probes = Object.fromEntries(Object.entries(probes).map(([e, p]) => [e, { ...p, pts: `${p.pts.length} timestamps, ${p.pts[0]} to ${p.pts[p.pts.length - 1]}` }]));
  } catch (e) {
    check('the check ran to its end', false, String((e && e.stack) || e));
  } finally {
    await h.closeAll();
    if (server) server.close();
  }
  // the record keeps every frame's hash per engine, and the comparisons; the PNGs stay in qa/artifacts
  result.reference = runs.edge ? runs.edge.first.map((f) => ({ name: f.name, i: f.i, t: f.t, size: `${f.w}x${f.h}`, hash: f.hash })) : [];
  result.runs = Object.fromEntries(Object.entries(runs).map(([e, r]) => [e, { engine: r.engine, renderer: r.renderer, exported: r.exported, psnr: r.psnr, summary: r.summary ?? null, sameAsReference: r.first.filter((f, i) => f.hash === runs.edge?.first[i]?.hash).length, squares: r.squares, compared: r.compared }]));
  note(`Tolerance across machines: PSNR at least ${MIN_PSNR} dB and at most ${MAX_OVER2}% of channels more than 2 levels apart, per frame; between no graphics chip and a chip, at least 48 dB and at most 2.5% (the processor's own edge smoothing and video colour). Exact equality is asked only of the same machine.`);
  const failed = finish(path.join(__dirname, 'studio-crossdevice.json'));
  process.exit(failed ? 1 : 0);
})();

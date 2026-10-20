// The studio at full strength in the desktop application (Desktop_App_Plan.md phase D2; DT-05 and DT-06 of
// section 12).
//
// DT-05, parity: the studio's own fixture checks, qa/studio-engine.cjs and qa/studio-export.cjs, run twice
// at the same moment, unchanged: in Edge as always, and inside the development package through
// qa/desktop-parity-hook.cjs. Every check must have the same name and pass in both. Neither run touches
// the studio's own records (qa/studio-*.json): both results go to qa/artifacts/desktop-parity.
//
// DT-06, a long export minimised: a ten-minute 1080p source (made here by ffmpeg) exported whole at 1080p
// by the studio's real modules (qa/fixtures/desktop-long-export.ts), once in Edge and once in the
// application with its window minimised the whole time. The application is started plainly, with nothing
// attached, because Playwright keeps every page visible (qa/desktop-helpers.cjs); its page takes commands
// from the fixture server. ffprobe must read both files the same, and the frames must match the source.
// Timing is recorded both ways, and, for contrast, a one-minute export minimised with and without the
// window marked busy, which is what a browser tab would suffer.
//
// Usage: node qa/desktop-studio-parity.cjs   (writes qa/desktop-studio-parity.json)
// Needs: npm run pack:dev in desktop/, ffmpeg and ffprobe, about 3 GB free on the system disk.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const esbuild = require('esbuild');
const { dependency, launchOptions } = require('./runtime.cjs');
const { chromium } = dependency('playwright');
const h = require('./desktop-helpers.cjs');

const { check, note, result, finish } = h.record('qa/desktop-studio-parity.cjs');
const out = path.join(__dirname, 'artifacts', 'desktop-parity');
const LONG = '00000000-0000-4000-8000-0000000000d1';
const SOURCE = path.join(out, 'source-600s-1080p.mp4');
const MINUTES = (n) => n * 60000;

function runCheck(script, shell) {
  const folder = path.join(out, shell);
  fs.rmSync(folder, { recursive: true, force: true });
  const t0 = Date.now();
  const r = spawnSync(process.execPath, ['-r', './qa/desktop-parity-hook.cjs', script], {
    cwd: h.root,
    env: { ...process.env, DESKTOP_PARITY_OUT: folder, DESKTOP_PARITY_SHELL: shell },
    encoding: 'utf8',
    timeout: MINUTES(20),
    maxBuffer: 1 << 26,
  });
  const file = path.join(folder, `${path.basename(script, '.cjs')}.json`);
  const json = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
  const engine = path.join(folder, `engine-${path.basename(script, '.cjs')}.json`);
  return { json, ms: Date.now() - t0, status: r.status, tail: (r.stdout || '').split('\n').slice(-3).join(' | '), engine: fs.existsSync(engine) ? JSON.parse(fs.readFileSync(engine, 'utf8')) : null };
}

function parity() {
  result.parity = {};
  for (const script of ['qa/studio-engine.cjs', 'qa/studio-export.cjs']) {
    const edge = runCheck(script, 'edge');
    const app = runCheck(script, 'desktop');
    const names = (r) => (r.json ? r.json.checks.map((c) => c.name) : []);
    const failed = (r) => (r.json ? r.json.checks.filter((c) => !c.pass).map((c) => c.name) : ['no result']);
    const same = JSON.stringify(names(edge)) === JSON.stringify(names(app));
    result.parity[script] = {
      edge: { passed: edge.json?.passed, total: edge.json?.total, failed: failed(edge), seconds: Math.round(edge.ms / 1000), timing: edge.json?.timing ?? null },
      desktop: { passed: app.json?.passed, total: app.json?.total, failed: failed(app), seconds: Math.round(app.ms / 1000), timing: app.json?.timing ?? null, engine: app.engine },
    };
    check(`DT-05: ${script} has the same checks in Edge and in the application`, same && names(edge).length > 0, { edge: names(edge).length, desktop: names(app).length });
    check(`DT-05: ${script} passes every check in Edge (the reference, run at the same moment)`, edge.json && failed(edge).length === 0, { failed: failed(edge), tail: edge.tail });
    check(`DT-05: ${script} passes every check inside the application`, app.json && failed(app).length === 0, { failed: failed(app), tail: app.tail, engine: app.engine });
  }
}

// --- DT-06 ---------------------------------------------------------------------------------------

function makeSource() {
  if (fs.existsSync(SOURCE) && fs.statSync(SOURCE).size > 1e7) return;
  const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=1920x1080:rate=30:duration=600', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=600',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '26', '-g', '60', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-shortest', SOURCE], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`ffmpeg could not make the source: ${r.stderr}`);
}

function probe(file) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-count_packets', '-show_entries', 'stream=codec_type,codec_name,profile,width,height,pix_fmt,r_frame_rate,nb_read_packets,sample_rate,channels:format=duration,size', '-of', 'json', file], { encoding: 'utf8', maxBuffer: 1 << 24 });
  const j = JSON.parse(r.stdout);
  const v = j.streams.find((s) => s.codec_type === 'video') || {};
  const a = j.streams.find((s) => s.codec_type === 'audio') || {};
  return {
    video: { codec: v.codec_name, profile: v.profile, width: v.width, height: v.height, pix_fmt: v.pix_fmt, rate: v.r_frame_rate, packets: Number(v.nb_read_packets) },
    audio: { codec: a.codec_name, rate: a.sample_rate, channels: a.channels, packets: Number(a.nb_read_packets) },
    duration: Number(j.format.duration),
    bytes: Number(j.format.size),
  };
}

/** The average colour of the frame at `t` seconds, as [r, g, b]. */
function colourAt(file, t) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-ss', String(t), '-i', file, '-frames:v', '1', '-vf', 'scale=1:1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 1 << 20 });
  return [...r.stdout.subarray(0, 3)];
}

function sourceRoute(req, res) {
  const size = fs.statSync(SOURCE).size;
  const m = /bytes=(\d+)-(\d*)/.exec(req.headers.range || '');
  if (!m) {
    res.writeHead(200, { 'content-type': 'video/mp4', 'content-length': size, 'accept-ranges': 'bytes' });
    return fs.createReadStream(SOURCE).pipe(res);
  }
  const from = Number(m[1]);
  const to = Math.min(size - 1, m[2] ? Number(m[2]) : size - 1);
  res.writeHead(206, { 'content-type': 'video/mp4', 'content-range': `bytes ${from}-${to}/${size}`, 'content-length': to - from + 1, 'accept-ranges': 'bytes' });
  fs.createReadStream(SOURCE, { start: from, end: to }).pipe(res);
}

function uploadRoute(req, res) {
  const name = path.basename(new URL(req.url, 'http://x').searchParams.get('name') || 'upload.bin');
  const file = fs.createWriteStream(path.join(out, name));
  req.pipe(file);
  file.on('finish', () => {
    res.writeHead(200);
    res.end();
  });
}

async function longExport(state) {
  makeSource();
  state.source = probe(SOURCE);
  await esbuild.build({ entryPoints: [path.join(__dirname, 'fixtures', 'desktop-long-export.ts')], bundle: true, format: 'esm', platform: 'browser', target: 'es2022', outfile: path.join(out, 'long.js'), logLevel: 'silent', absWorkingDir: h.root });
  const channel = h.commandChannel();
  const page = (body) => `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>تصدير طويل</title></head><body>${body}<script type="module" src="/long.js"></script></body></html>`;
  const appPage = page(
    h.commandLoop(`{
      prepare: () => window.prepare(),
      long: () => window.longExport({ name: 'app-600.mp4', seconds: 600, busy: true }),
      busy60: () => window.longExport({ name: 'app-60-busy.mp4', seconds: 60, busy: true }),
      idle60: () => window.longExport({ name: 'app-60-idle.mp4', seconds: 60, busy: false }),
    }`),
  );
  const routes = {
    '/': ['text/html; charset=utf-8', appPage],
    '/edge': ['text/html; charset=utf-8', page(`<script>window.__say = (t) => fetch('/say?' + encodeURIComponent(t));</script>`)],
    '/long.js': ['text/javascript; charset=utf-8', fs.readFileSync(path.join(out, 'long.js'), 'utf8')],
    [`/api/media/${LONG}/content`]: sourceRoute,
    '/upload': uploadRoute,
    ...channel.routes,
    // progress, printed as it comes so a long run can be watched
    '/say': (req, res) => {
      const text = decodeURIComponent(req.url.split('?')[1] || '');
      if (text.startsWith('progress:')) console.log(`${new Date().toISOString().slice(11, 19)} ${text}`);
      channel.routes['/say'](req, res);
    },
  };
  const site = h.pages(routes);
  await h.listen(site.server, 3000);
  const timing = {};
  try {
    // Edge, as the reference, on a profile on disk: a plain Playwright context keeps its storage in
    // memory with a small quota, which a ten-minute source does not fit (measured: «exceed its storage quota»).
    const edgeProfile = path.join(h.scratch, 'edge-profile');
    const browser = await chromium.launchPersistentContext(edgeProfile, launchOptions);
    try {
      const tab = browser.pages()[0] || (await browser.newPage());
      await tab.goto('http://127.0.0.1:3000/edge');
      await tab.waitForFunction(() => typeof window.longExport === 'function');
      await tab.evaluate(() => window.prepare());
      state.edge600 = await tab.evaluate(() => window.longExport({ name: 'edge-600.mp4', seconds: 600, busy: true }));
      state.edge60 = await tab.evaluate(() => window.longExport({ name: 'edge-60.mp4', seconds: 60, busy: true }));
      timing.edge600 = state.edge600.exportMs;
      timing.edge60 = state.edge60.exportMs;
    } finally {
      await browser.close();
    }

    // The application, started plainly, its window minimised for every export.
    const app = h.launchPlain('long');
    try {
      const ask = async (cmd, ms) => {
        const since = Date.now();
        channel.send(cmd);
        const hit = await channel.heard((t) => t.startsWith(`${cmd}=`) || t.startsWith(`${cmd}!`), ms, since);
        if (!hit) return { error: 'no answer' };
        return hit.text.startsWith(`${cmd}=`) ? JSON.parse(hit.text.slice(cmd.length + 1)) : { error: hit.text };
      };
      const up = await channel.heard((t) => t.startsWith('ready='), 30000);
      check('DT-06: the application started plainly, with nothing attached, and its page answers', !!up, up && up.text);
      state.prepare = await ask('prepare', MINUTES(10));
      const run = async (cmd) => {
        app.minimise();
        await h.sleep(1500);
        const since = Date.now();
        const r = await ask(cmd, MINUTES(45));
        const progress = channel.said.filter((s) => s.at >= since && s.text.startsWith('progress:')).map((s) => s.text.split(':')[3]);
        app.restore();
        await h.sleep(1000);
        return { ...r, progressSeen: progress.length, visibility: [...new Set(progress)] };
      };
      state.app600 = await run('long');
      state.app60busy = await run('busy60');
      state.app60idle = await run('idle60');
      timing.app600Minimised = state.app600.exportMs;
      timing.app60BusyMinimised = state.app60busy.exportMs;
      timing.app60IdleMinimised = state.app60idle.exportMs;
    } finally {
      app.close();
    }
  } finally {
    site.server.close();
  }
  result.timing = timing;
  result.long = { source: state.source, edge600: state.edge600, app600: state.app600, app60busy: state.app60busy, app60idle: state.app60idle };

  const a = state.app600 || {};
  check('DT-06: the ten-minute 1080p export completes in the application with its window minimised throughout', a.frames === 18000 && a.uploaded === 200 && a.target === 'device', a);
  check('DT-06: minimised and busy, the page stayed visible to itself the whole export (never slowed)', a.progressSeen >= 10 && JSON.stringify(a.visibility) === '["visible"]', { progressSeen: a.progressSeen, visibility: a.visibility });
  const pe = probe(path.join(out, 'edge-600.mp4'));
  const pa = probe(path.join(out, 'app-600.mp4'));
  result.long.probe = { edge: pe, app: pa };
  check(
    'DT-06: ffprobe reads both exports the same: H.264 1920x1080 at 30 frames, 18000 frames, AAC 48 kHz stereo, ten minutes',
    JSON.stringify({ ...pe.video }) === JSON.stringify({ ...pa.video }) && pa.video.codec === 'h264' && pa.video.width === 1920 && pa.video.height === 1080 && pa.video.packets === 18000 && pa.video.rate === '30/1' &&
      JSON.stringify(pe.audio.codec + pe.audio.rate + pe.audio.channels) === JSON.stringify(pa.audio.codec + pa.audio.rate + pa.audio.channels) && pa.audio.codec === 'aac' && pa.audio.rate === '48000' && pa.audio.channels === 2 &&
      Math.abs(pe.duration - pa.duration) < 0.05 && Math.abs(pa.duration - 600) < 0.1,
    { edge: pe, app: pa },
  );
  const times = [1, 150, 300.5, 450, 599];
  const frames = times.map((t) => ({ t, source: colourAt(SOURCE, t), edge: colourAt(path.join(out, 'edge-600.mp4'), t), app: colourAt(path.join(out, 'app-600.mp4'), t) }));
  result.long.frames = frames;
  const near = (x, y, tol) => x.length === 3 && y.length === 3 && x.every((v, i) => Math.abs(v - y[i]) <= tol);
  check('DT-06: the application\'s frames match Edge\'s and the source\'s at five moments across the ten minutes', frames.every((f) => near(f.app, f.edge, 6) && near(f.app, f.source, 12)), frames);
  const b = state.app60busy || {};
  const i = state.app60idle || {};
  check('for contrast: a one-minute export minimised and busy stayed visible; without busy the page was hidden, as a browser tab would be', JSON.stringify(b.visibility) === '["visible"]' && (i.visibility || []).includes('hidden') && b.frames === 1800 && i.frames === 1800, { busy: b, idle: i });
  note(`Timing, milliseconds of export: Edge ten minutes ${timing.edge600}, application minimised ${timing.app600Minimised}; one minute: Edge ${timing.edge60}, application minimised and busy ${timing.app60BusyMinimised}, minimised without busy ${timing.app60IdleMinimised}.`);
}

(async () => {
  const state = {};
  fs.mkdirSync(out, { recursive: true });
  try {
    if (!fs.existsSync(h.devExe)) throw new Error(`the development package is missing: ${h.devExe} (npm run pack:dev in desktop/)`);
    if (await h.portAnswers(3000)) throw new Error('something already answers on 127.0.0.1:3000; stop it and run again');
    if (!process.argv.includes('--long-only')) parity();
    if (!process.argv.includes('--parity-only')) await longExport(state);
  } catch (e) {
    check('the check ran to its end', false, String((e && e.stack) || e));
  } finally {
    await h.closeAll();
    for (const f of fs.readdirSync(out)) if (/^(edge|app)-.*\.mp4$/.test(f)) fs.rmSync(path.join(out, f), { force: true });
  }
  // A run of one part keeps the other part's checks from the last run, and says when each part ran.
  const file = path.join(__dirname, 'desktop-studio-parity.json');
  const only = process.argv.includes('--parity-only') ? 'parity' : process.argv.includes('--long-only') ? 'long' : null;
  const previous = only && fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
  const isParity = (c) => c.name.startsWith('DT-05');
  result.runs = { ...(previous?.runs ?? {}), ...(only ? { [only]: result.run } : { parity: result.run, long: result.run }) };
  if (previous) {
    const kept = previous.checks.filter((c) => (only === 'long' ? isParity(c) : !isParity(c)));
    result.checks = only === 'long' ? [...kept, ...result.checks] : [...result.checks, ...kept];
    for (const key of only === 'long' ? ['parity'] : ['timing', 'long']) if (previous[key] !== undefined && result[key] === undefined) result[key] = previous[key];
  }
  const failed = finish(file);
  process.exit(failed ? 1 : 0);
})();

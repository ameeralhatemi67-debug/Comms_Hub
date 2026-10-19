// Browser check of the studio's export (Studio_Build_Plan.md Phase 4; MVP_draft.md 62). The real modules
// (qa/fixtures/studio-export.ts, bundled by esbuild) export projects in headless Edge; each file comes
// back to Node and is read by ffprobe and decoded by ffmpeg, the reference tools:
//   A: colours split at 2 s and the second part moved to 3 s: H.264 and AAC, 7 s, 210 frames, frame 59
//      red, frames 60 and 89 the black background, frame 90 green; sound in [0,2) and [3,7), silence in
//      between.
//   C: the same at half volume: about 6 dB quieter.
//   B: one white frame and a 100 ms beep at 1 s and at 3 s: picture and sound still in step.
//   D: a still at 5 s: a PNG, blue.
// Usage: node qa/studio-export.cjs   (writes qa/studio-export.json)
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync: spawn } = require('node:child_process');
// decoded sound and frames are larger than spawnSync's 1 MB default
const spawnSync = (cmd, args) => spawn(cmd, args, { maxBuffer: 1 << 30 });
const { dependency, launchOptions } = require('./runtime.cjs');
const { chromium } = dependency('playwright');
const esbuild = require('esbuild');
const { IDS, makeMedia, serve, root } = require('./studio-media.cjs');

const out = path.join(__dirname, 'artifacts', 'studio-export');
const result = { script: 'qa/studio-export.cjs', run: new Date().toISOString(), checks: [] };
const check = (name, pass, detail = '') => result.checks.push({ name, pass: Boolean(pass), detail: String(detail) });
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
makeMedia(out);
// one white frame and a 100 ms beep at 1 s and 3 s, over 5 s of black and silence
const ff = (args) => {
  const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', ...args]);
  if (r.status !== 0) throw new Error(`ffmpeg: ${r.stderr}`);
  return r;
};
ff(['-f', 'lavfi', '-i', 'color=c=black:s=640x360:r=30:d=5', '-f', 'lavfi', '-i', 'sine=frequency=1000:sample_rate=48000:duration=5',
  '-vf', "drawbox=x=0:y=0:w=iw:h=ih:color=white:t=fill:enable='between(n,30,30)+between(n,90,90)'",
  '-af', "volume=enable='not(between(t,1,1.1)+between(t,3,3.1))':volume=0",
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-g', '15', '-c:a', 'aac', '-shortest', path.join(out, 'sync.mp4')]);
IDS['00000000-0000-4000-8000-0000000000c1'] = 'sync.mp4';

const probe = (file) => JSON.parse(spawnSync('ffprobe', ['-v', 'error', '-count_frames', '-show_entries', 'stream=codec_type,codec_name,nb_read_frames,width,height,sample_rate,channels:format=duration', '-of', 'json', file]).stdout.toString());
/** The average colour of chosen frames (by index), as [r,g,b] each. */
function frameColours(file, idx) {
  const sel = idx.map((n) => `eq(n\\,${n})`).join('+');
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-vf', `select='${sel}',scale=1:1`, '-fps_mode', 'passthrough', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']);
  const b = r.stdout;
  const outc = [];
  for (let i = 0; i + 2 < b.length; i += 3) outc.push([b[i], b[i + 1], b[i + 2]]);
  return outc;
}
/** RMS level in dBFS of each 0.5 s of the sound. */
function rmsPerHalfSecond(file) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-vn', '-ac', '1', '-ar', '48000', '-f', 'f32le', '-']);
  const f = new Float32Array(r.stdout.buffer, r.stdout.byteOffset, Math.floor(r.stdout.length / 4));
  const win = 24000;
  const out = [];
  for (let i = 0; i < f.length; i += win) {
    let s = 0;
    const end = Math.min(f.length, i + win);
    for (let j = i; j < end; j++) s += f[j] * f[j];
    out.push(10 * Math.log10(s / Math.max(1, end - i) + 1e-12));
  }
  return out;
}
/** Times (s) the picture turns white and the sound starts, from decoded frames and samples. */
function syncTimes(file) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-vf', 'scale=8:8,format=gray', '-fps_mode', 'passthrough', '-f', 'rawvideo', '-']);
  const fr = r.stdout;
  const flashes = [];
  for (let n = 0; n * 64 < fr.length; n++) {
    let s = 0;
    for (let i = 0; i < 64; i++) s += fr[n * 64 + i];
    if (s / 64 > 128) flashes.push(n / 30);
  }
  const a = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-vn', '-ac', '1', '-ar', '48000', '-f', 'f32le', '-']).stdout;
  const f = new Float32Array(a.buffer, a.byteOffset, Math.floor(a.length / 4));
  const onsets = [];
  let quiet = 0;
  for (let i = 0; i < f.length; i++) {
    if (Math.abs(f[i]) > 0.05) {
      if (quiet > 4800) onsets.push(i / 48000);
      quiet = 0;
    } else quiet++;
  }
  return { flashes, onsets };
}

(async () => {
  await esbuild.build({ entryPoints: [path.join(__dirname, 'fixtures', 'studio-export.ts')], bundle: true, format: 'esm', platform: 'browser', target: 'es2022', outfile: path.join(out, 'bundle.js'), logLevel: 'silent', absWorkingDir: root });
  const { server, base } = await serve(out, { '/': '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"></head><body><script type="module" src="/bundle.js"></script></body></html>' });
  const browser = await chromium.launch(launchOptions);
  const errors = [];
  try {
    const tab = await browser.newPage();
    tab.on('pageerror', (e) => errors.push(e.message));
    tab.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await tab.goto(base + '/');
    await tab.waitForFunction(() => typeof window.studioExport === 'function');
    const r = await tab.evaluate(() => window.studioExport());
    const save = (k, ext) => {
      const f = path.join(out, `export-${k}.${ext}`);
      fs.writeFileSync(f, Buffer.from(r[k].b64, 'base64'));
      return f;
    };
    const fa = save('a', 'mp4');
    const fc = save('c', 'mp4');
    const fb = save('b', 'mp4');
    const fd = save('d', 'png');
    result.timing = { exportMs: r.a.ms, bytes: r.a.bytes, estimate: r.a.estimate };

    const pa = probe(fa);
    const v = pa.streams.find((x) => x.codec_type === 'video');
    const au = pa.streams.find((x) => x.codec_type === 'audio');
    check('the export is H.264 at 1280x720 with AAC sound at 48 kHz stereo', v?.codec_name === 'h264' && v.width === 1280 && v.height === 720 && au?.codec_name === 'aac' && au.sample_rate === '48000' && au.channels === 2, JSON.stringify(pa.streams));
    check('it has every frame: 7 s at 30 frames, 210 frames', Number(v?.nb_read_frames) === 210 && r.a.frames === 210, v?.nb_read_frames);
    check('its length is 7 s within one frame', Math.abs(Number(pa.format.duration) - 7) <= 1 / 30 + 0.03, pa.format.duration);
    check('the progress reached the last frame', r.a.lastProgress === 210, r.a.lastProgress);
    check('the file was written through the browser\'s private storage, not memory', r.a.target === 'device' && r.opfs.length >= 1, `${r.a.target} ${r.opfs.join(',')}`);
    const cols = frameColours(fa, [59, 60, 89, 90]);
    const near = (p, q, t = 45) => p && p.every((x, i) => Math.abs(x - q[i]) <= t);
    check('frames on each side of the split and the gap are exact: 59 red, 60 and 89 black, 90 green', near(cols[0], [255, 0, 0]) && near(cols[1], [0, 0, 0]) && near(cols[2], [0, 0, 0]) && near(cols[3], [0, 255, 0]), JSON.stringify(cols));
    const rms = rmsPerHalfSecond(fa);
    const loud = (i) => rms[i] > -20;
    check('sound plays in [0,2) and [3,7) and is silent in the gap', loud(1) && loud(2) && !loud(4) && !loud(5) && loud(7) && loud(12), rms.map((x) => x.toFixed(1)).join(' '));
    const rmsC = rmsPerHalfSecond(fc);
    const drop = rms[2] - rmsC[2];
    check('a clip at half volume is about 6 dB quieter', Math.abs(drop - 6.02) < 1, `${drop.toFixed(2)} dB`);
    const st = syncTimes(fb);
    const flashes = st.flashes;
    const onsets = st.onsets;
    const inStep = flashes.length === 2 && onsets.length === 2 && flashes.every((t, i) => Math.abs(t - onsets[i]) <= 0.045);
    check('picture and sound stay in step: flashes and beeps at 1 s and 3 s within 45 ms', inStep && Math.abs(flashes[0] - 1) < 0.04 && Math.abs(flashes[1] - 3) < 0.04, JSON.stringify(st));
    const still = spawnSync('ffmpeg', ['-v', 'error', '-i', fd, '-vf', 'scale=1:1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']).stdout;
    const sp = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_name,width,height', '-of', 'csv=p=0', fd]).stdout.toString().trim();
    check('a still is a PNG of the project size showing the frame at 5 s (blue)', r.d.type === 'image/png' && sp === 'png,1920,1080' && near([still[0], still[1], still[2]], [0, 0, 255]), `${sp} ${[...still].join(',')}`);
  } catch (e) {
    check('the fixture ran to its end', false, String((e && e.stack) || e));
  } finally {
    check('no page errors', errors.length === 0, errors.join(' | '));
    await browser.close();
    server.close();
  }
  const failed = result.checks.filter((c) => !c.pass);
  result.total = result.checks.length;
  result.passed = result.total - failed.length;
  result.failed = failed.length;
  fs.writeFileSync(path.join(__dirname, 'studio-export.json'), JSON.stringify(result, null, 2));
  console.log(`${result.passed} of ${result.total} passed`);
  for (const f of failed) console.log('FAIL', f.name, '|', f.detail);
  process.exit(failed.length ? 1 : 0);
})();

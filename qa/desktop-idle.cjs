// Application check of the idle-time broker and the light copies it makes (Desktop_Power_Ideas.md P-30 and P-08, phase
// D12; MVP_draft.md 63.9). It drives the development package on a fixture page at 127.0.0.1:3000 with the studio's own
// cache, media pool and player (qa/fixtures/desktop-idle.ts). The corpus is four 4K sources of 30 s: two with grain, at
// the bitrate a camera writes (about 30 Mbit/s), and two still pictures that compress to almost nothing.
//   - the sources of a project are named to the application's queue by the device cache on its own, and their light
//     copies are made while nothing happens;
//   - a copy the person asks for is made at once, is never held, and holds the rest;
//   - a running copy of a grainy source pauses within a second of a click, of an export («busy»), of the page saying
//     «playing», of the window making sound, of the laptop going on battery and of Windows lowering the processor's speed
//     limit, makes no progress from a second on, and goes on from where it was once released (a click: three seconds
//     later);
//   - a copy of a still source, which FFmpeg reads whole before any pause can hold it, is stopped instead within about a
//     second and a half, no FFmpeg left, and made again once released;
//   - every copy keeps every frame of its source in order (the 12-bit gray code each source carries); the tray says what
//     is being made;
//   - a project that wants nothing any more, and quitting, leave no FFmpeg running and no part file.
// With --speed (only in a quiet window, the laptop otherwise idle): the stage's frame times while the project plays,
// with nothing to make, with copies to make but held, and, for contrast, with copies running; and the time to make
// the copies one, two and three at a time. The processor's load is recorded beside every figure.
// Usage: node qa/desktop-idle.cjs [--speed]   (writes qa/desktop-idle.json)   Needs: npm run pack:dev in desktop/, a
// local ffmpeg with libx264 (fixtures only), port 3000 free.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const esbuild = require('esbuild');
const h = require('./desktop-helpers.cjs');

const { check, note, result, finish } = h.record('qa/desktop-idle.cjs');
const out = path.join(__dirname, 'artifacts', 'desktop-idle');
const SPEED = process.argv.includes('--speed');
const SECONDS = 30;
const FPS = 25;
const BITS = 12;
const CORPUS = [
  { name: 'grain-1.mp4', grain: true },
  { name: 'grain-2.mp4', grain: true },
  { name: 'still-3.mp4', grain: false },
  { name: 'still-4.mp4', grain: false },
];
const NAMES = CORPUS.map((c) => c.name);

const grayBoxes = Array.from({ length: BITS }, (_, k) => {
  const p = 2 ** k;
  return `drawbox=x=iw*${k + 2}/16:y=ih*7/16:w=iw/16-4:h=ih/8:color=white:t=fill:enable='eq(mod(floor(n/${p})+floor(n/${2 * p}),2),1)'`;
}).join(',');
/** The corpus's ffmpeg arguments; exported for the scratch script that makes it ahead at idle priority. */
function corpusArgs(c, i, file) {
  return ['-hide_banner', '-y', '-loglevel', 'error', '-f', 'lavfi', '-i', `color=c=black:s=3840x2160:r=${FPS}:d=${SECONDS}`, '-f', 'lavfi', '-i', `sine=frequency=${330 + 110 * i}:sample_rate=48000:duration=${SECONDS}`, '-vf', c.grain ? `noise=alls=24:allf=t,${grayBoxes}` : grayBoxes, '-shortest', '-c:v', 'libx264', '-preset', 'veryfast', '-b:v', '30M', '-pix_fmt', 'yuv420p', '-g', '25', '-c:a', 'aac', '-b:a', '128k', file];
}
function makeCorpus() {
  fs.mkdirSync(out, { recursive: true });
  CORPUS.forEach((c, i) => {
    const file = path.join(out, c.name);
    if (fs.existsSync(file) && fs.statSync(file).size > 0) return;
    const r = spawnSync('ffmpeg', corpusArgs(c, i, file), { encoding: 'utf8', maxBuffer: 1 << 24 });
    if (r.status !== 0) throw new Error(`ffmpeg: ${r.stderr}`);
  });
}
/** The frame numbers ffmpeg reads from a file's pictures, in order. */
function grayFrames(file) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-vf', 'scale=320:180', '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], { maxBuffer: 1 << 30 });
  const px = r.stdout;
  const frames = [];
  for (let at = 0; at + 320 * 180 <= px.length; at += 320 * 180) {
    let gray = 0;
    for (let k = 0; k < BITS; k++) if (px[at + 90 * 320 + Math.round((320 * (k + 2.45)) / 16)] > 128) gray |= 1 << k;
    let n = 0;
    for (let v = gray; v; v >>= 1) n ^= v;
    frames.push(n);
  }
  return frames;
}
const ffmpegLeft = () => Number(h.ps(`@(Get-Process ffmpeg,ffprobe -ErrorAction SilentlyContinue | Where-Object { $_.Path -like '*${h.desktop.replace(/'/g, "''")}*' }).Count`));
const load = () => Number(h.ps('(Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average')) || null;

async function main() {
  let site = null;
  try {
    if (!fs.existsSync(h.devExe)) throw new Error(`the development package is missing: ${h.devExe} (npm run pack:dev in desktop/)`);
    if (await h.portAnswers(3000)) throw new Error('something already answers on 127.0.0.1:3000; stop it and run again');
    const t0 = Date.now();
    makeCorpus();
    result.corpus = Object.fromEntries(NAMES.map((n) => [n, Math.round(fs.statSync(path.join(out, n)).size / 1e5) / 10]));
    note(`The corpus (four 4K H.264 sources of ${SECONDS} s at ${FPS} frames a second, each with its frame numbers; megabytes ${JSON.stringify(result.corpus)}) took ${Math.round((Date.now() - t0) / 1000)} s to make or was kept.`);

    await esbuild.build({ entryPoints: [path.join(__dirname, 'fixtures', 'desktop-idle.ts')], bundle: true, format: 'esm', platform: 'browser', target: 'es2022', outfile: path.join(out, 'idle.js'), logLevel: 'silent', absWorkingDir: h.root });
    const page = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>نسخ في وقت الفراغ</title></head><body>
      <input type="file" id="corpus" multiple><script type="module" src="/idle.js"></script></body></html>`;
    site = h.pages({ '/': ['text/html; charset=utf-8', page], '/idle.js': ['text/javascript; charset=utf-8', fs.readFileSync(path.join(out, 'idle.js'), 'utf8')] });
    await h.listen(site.server, 3000);

    const { app, win, mainId, data } = await h.launchDev('idle');
    await h.instrument(app);
    // Windows' own speed limit for the processor, as the application hears it (a hot laptop lowers it)
    await app.evaluate(({ powerMonitor }) => {
      globalThis.__limits = [];
      powerMonitor.on('speed-limit-change', (d) => globalThis.__limits.push({ at: Date.now(), limit: d.limit }));
    });
    await app.evaluate(({ BrowserWindow }, id) => {
      globalThis.__audible = [];
      BrowserWindow.fromId(id).webContents.on('audio-state-changed', (e) => globalThis.__audible.push({ at: Date.now(), audible: e.audible }));
    }, mainId);
    await h.until(() => win.url() === 'http://127.0.0.1:3000/', 20000);
    await win.waitForLoadState('load');
    await win.waitForFunction(() => typeof window.openCorpus === 'function');
    /** Keeps Windows' own speed-limit changes away from the application (the limit held at 100), or lets them through again. */
    const realLimits = (on) =>
      app.evaluate(({ powerMonitor }, pass) => {
        if (!globalThis.__emit) {
          globalThis.__emit = powerMonitor.emit;
          powerMonitor.emit = function emit(name, ...args) {
            if (name === 'speed-limit-change' && globalThis.__blockLimits && !globalThis.__ours) return false;
            return globalThis.__emit.call(this, name, ...args);
          };
        }
        globalThis.__blockLimits = !pass;
        if (!pass) {
          globalThis.__ours = true;
          powerMonitor.emit('speed-limit-change', { limit: 100 });
          globalThis.__ours = false;
        }
      }, on);
    const bridge = await win.evaluate(() => ({ bridge: window.commsHubNative.bridge, life: Object.keys(window.commsHubNative.life), media: Object.keys(window.commsHubNative.media) }));
    check('the bridge is version 7 or later, with life.activity and media.queue, queued and onQueue', bridge.bridge >= 7 && bridge.life.includes('activity') && ['queue', 'queued', 'onQueue'].every((m) => bridge.media.includes(m)), bridge);
    const folder = path.join(data, 'StudioCache');
    const q = () => win.evaluate(() => window.queued());
    const parts = () => (fs.existsSync(folder) ? fs.readdirSync(folder).filter((f) => f.endsWith('.part')) : []);
    const clearCopies = () => win.evaluate(() => window.clearCopies());

    await win.setInputFiles('#corpus', NAMES.map((n) => path.join(out, n)));
    const opened = await win.evaluate(() => window.openCorpus());
    result.opened = opened;
    const named = await h.until(async () => {
      const s = await q();
      return s.items.length === NAMES.length && s.items.every((i) => i.state !== 'probing') ? s : null;
    }, 30000, 200);
    check('the studio named its four video sources to the queue on its own, and the application found each needs a light copy here (4K, no profile)', !!named && named.items.every((i) => ['waiting', 'running', 'ready'].includes(i.state)), { opened, named });
    const fileOf = await win.evaluate(() => window.copyNames());
    const nameOf = Object.fromEntries(Object.entries(fileOf).map(([copy, file]) => [file, copy]));

    // a copy the person asks for: made at once, never held, and it holds the rest
    const runningOne = await h.until(async () => (await q()).items.find((i) => i.state === 'running' && i.done > 0.5) ?? null, 60000, 100);
    const askedName = nameOf['still-4.mp4'];
    const waitingNow = (await q()).items.find((i) => i.name === askedName)?.state;
    if (runningOne && waitingNow === 'waiting') {
      const asked = win.evaluate(() => window.ask('still-4.mp4'));
      const during = await h.until(async () => {
        const s = await q();
        return s.hold === 'asked' && s.items.find((i) => i.name === runningOne.name)?.state === 'paused' ? s : null;
      }, 5000, 50);
      const r = await asked;
      const after = await q();
      check('a copy the person asks for is made at once and holds the copies made in idle time («asked»)', !!during && after.items.find((i) => i.name === askedName)?.state === 'ready' && r.tools?.proxy?.kind === 'ready', { during: during && { hold: during.hold, states: during.items.map((i) => i.state) }, ms: r.ms, after: after.items.map((i) => i.state) });
    } else check('a copy was being made and «still-4» was waiting when the person asked', false, { runningOne, waitingNow });

    /** A copy of a grainy source running now, a second or more into its work. */
    const grainy = new Set([nameOf['grain-1.mp4'], nameOf['grain-2.mp4']]);
    const runningCopy = (names = grainy) =>
      h.until(async () => {
        const s = await q();
        return s.items.find((i) => names.has(i.name) && i.state === 'running' && i.done >= 1) ?? null;
      }, 180000, 150);
    const doneOf = async (name) => (await q()).items.find((i) => i.name === name)?.done ?? null;
    result.holds = {};
    /** Holds a running copy one way, and releases it: paused within a second, no progress from a second on, then on again. */
    async function held(label, hold, release, want, since = null) {
      const it = await runningCopy();
      if (!it) return check(`${label}: a copy of a grainy source was being made`, false, await q());
      let start = Date.now();
      await hold();
      // a hold that starts later than asked (sound starts once the element plays) is timed from its own moment
      if (since) start = (await h.until(since, 5000, 25)) ?? start;
      const paused = await h.until(async () => {
        const s = await q();
        return s.items.find((i) => i.name === it.name && i.state === 'paused') ? s : null;
      }, 5000, 25);
      const pausedMs = Date.now() - start;
      await h.sleep(Math.max(0, 1000 - (Date.now() - start)));
      const a = await doneOf(it.name);
      await h.sleep(1500);
      const b = await doneOf(it.name);
      const state = (await q()).items.find((i) => i.name === it.name)?.state;
      const released = Date.now();
      await release();
      const goes = await h.until(async () => {
        const s = await q();
        const x = s.items.find((i) => i.name === it.name);
        return x && ((x.state === 'running' && x.done > b + 0.2) || x.state === 'ready') ? x : null;
      }, 15000, 50);
      const resumedMs = Date.now() - released;
      const sinceHold = Date.now() - start;
      result.holds[label] = { name: it.name.replace(/[0-9a-f]{40}/, '<fingerprint>'), at: it.done, pausedMs, hold: paused?.hold ?? null, progressHeld: [a, b], state, resumedMs, sinceHold, after: goes?.done ?? null };
      check(`${label}: the running copy pauses within a second (${pausedMs} ms), the hold is «${want}», and it makes no progress from a second on (${a} s, then ${b} s)`, !!paused && paused.hold === want && pausedMs <= 1000 && a !== null && b === a && state === 'paused', result.holds[label]);
      check(`${label}: released, it goes on from where it was (${resumedMs} ms)`, !!goes && goes.done >= b, result.holds[label]);
      return result.holds[label];
    }

    const click = () => app.evaluate(({ BrowserWindow }, id) => {
      const wc = BrowserWindow.fromId(id).webContents;
      wc.sendInputEvent({ type: 'mouseDown', x: 20, y: 20, button: 'left', clickCount: 1 });
      wc.sendInputEvent({ type: 'mouseUp', x: 20, y: 20, button: 'left', clickCount: 1 });
    }, mainId);
    await realLimits(false);
    const input = await held('a click', click, async () => undefined, 'input');
    if (input) check(`a click holds only a few seconds: the copy goes on by itself ${input.sinceHold} ms after it (three seconds of quiet)`, input.sinceHold >= 3000 && input.sinceHold <= 5000, input);
    await held('an export (busy)', () => win.evaluate(() => window.busy(true)), () => win.evaluate(() => window.busy(false)), 'export');
    await held('the page says «playing»', () => win.evaluate(() => window.activity('playing')), () => win.evaluate(() => window.activity('none')), 'playing');
    let playing = null;
    const sound = await held(
      'the window makes sound (a steady tone; the page says nothing)',
      async () => {
        await app.evaluate(() => (globalThis.__audible = []));
        playing = win.evaluate(() => window.tone(6));
      },
      async () => {
        await playing;
      },
      'playing',
      () => app.evaluate(() => globalThis.__audible.find((x) => x.audible)?.at ?? null),
    );
    result.audible = await app.evaluate(() => globalThis.__audible.slice());
    // the studio's own player, with sound: heard, though on this laptop in short bursts while its 4K element stalls
    await app.evaluate(() => (globalThis.__audible = []));
    result.soundPlay = await win.evaluate(() => window.play(4, { file: 'still-3.mp4' }));
    result.playerAudible = await app.evaluate(() => globalThis.__audible.slice());
    note(`The tone was heard: ${JSON.stringify(result.audible.map((x) => x.audible))}. The studio's player, playing with sound, was heard too: ${JSON.stringify(result.playerAudible.map((x) => x.audible))}; its element ${JSON.stringify(result.soundPlay && result.soundPlay.element)}.`);
    check('the studio\'s player playing with sound makes the window heard', result.playerAudible.some((x) => x.audible), result.playerAudible);
    await held(
      'on battery (simulated in the main process)',
      () => app.evaluate(({ powerMonitor }) => {
        globalThis.__onBattery = powerMonitor.isOnBatteryPower;
        powerMonitor.isOnBatteryPower = () => true;
        powerMonitor.emit('on-battery');
      }),
      () => app.evaluate(({ powerMonitor }) => {
        powerMonitor.isOnBatteryPower = globalThis.__onBattery;
        powerMonitor.emit('on-ac');
      }),
      'battery',
    );
    await realLimits(true);
    await held(
      'Windows lowers the processor\'s speed limit (simulated)',
      () => app.evaluate(({ powerMonitor }) => void powerMonitor.emit('speed-limit-change', { limit: 70 })),
      () => app.evaluate(({ powerMonitor }) => void powerMonitor.emit('speed-limit-change', { limit: 100 })),
      'throttled',
    );

    // a still source: FFmpeg reads it whole at once, so a pause cannot hold it; it is stopped instead and made again later
    await win.evaluate(() => window.stopQueue());
    await h.until(async () => (ffmpegLeft() === 0 ? true : null), 10000, 200);
    await clearCopies();
    const still = nameOf['still-3.mp4'];
    await win.evaluate(() => window.queueOnly(['still-3.mp4'], 1));
    const runningStill = await runningCopy(new Set([still]));
    if (runningStill) {
      const start = Date.now();
      await win.evaluate(() => window.activity('playing'));
      const stopped = await h.until(async () => ((await q()).items.find((i) => i.name === still)?.state === 'waiting' ? Date.now() - start : null), 5000, 25);
      await h.sleep(500);
      const left = ffmpegLeft();
      const meanwhile = (await q()).items.find((i) => i.name === still);
      await win.evaluate(() => window.activity('none'));
      const again = await h.until(async () => {
        const x = (await q()).items.find((i) => i.name === still);
        return x && (x.state === 'running' || x.state === 'ready') ? x : null;
      }, 15000, 50);
      result.readAhead = { at: runningStill.done, stoppedMs: stopped, left, meanwhile, again };
      check(`a copy of a still source, which FFmpeg had read whole, is stopped when held (${stopped} ms), no FFmpeg left and no part file, and made again once released`, stopped !== null && stopped <= 2000 && left === 0 && parts().length === 0 && meanwhile?.state === 'waiting' && !!again, result.readAhead);
    } else check('a copy of a still source was being made', false, await q());

    // every copy, made in the end
    await win.evaluate(() => window.queueWith(1));
    const all = await h.until(async () => {
      const s = await q();
      return s.items.length === NAMES.length && s.items.every((i) => i.state === 'ready') ? s : null;
    }, 900000, 500);
    check('every light copy was made', !!all, await q());
    const tips = (await h.recorded(app)).tips;
    check('the tray says what is being made in idle time, and why it waits when it does', tips.some((t) => /نسخ خفيفة للمعاينة: تُنشأ \d+ من \d+ في وقت فراغ الجهاز/.test(t)) && tips.some((t) => /نسخ خفيفة للمعاينة: \d+ تنتظر/.test(t)), tips.filter((t) => t.includes('نسخ')).slice(-6));
    const copies = fs.readdirSync(folder).filter((f) => /^proxy-.*-720-r1-.*\.mp4$/.test(f));
    note(`The copies, by source: ${JSON.stringify(Object.fromEntries(copies.map((f) => [f.replace(/[0-9a-f]{40}/, '<fingerprint>'), fileOf[f]])))}`);
    const frames = copies.map((f) => grayFrames(path.join(folder, f)));
    check(`each of the ${copies.length} copies keeps every frame of its source, in order (${SECONDS * FPS} frames)`, copies.length === NAMES.length && frames.every((g) => g.length === SECONDS * FPS && g.every((n, i) => n === i)), frames.map((g) => ({ frames: g.length, wrong: g.filter((n, i) => n !== i).length })));
    check('no part file is left in the folder', parts().length === 0, parts());

    // what a project that wants nothing leaves
    await clearCopies();
    await win.evaluate(() => window.queueWith(1));
    const again = await runningCopy(new Set(Object.keys(fileOf)));
    const partWhile = parts();
    const ffWhile = ffmpegLeft();
    await win.evaluate(() => window.stopQueue());
    await h.sleep(2000);
    const emptied = await q();
    check('a project that wants nothing any more stops its copy: no FFmpeg running and no part file a moment later', !!again && partWhile.length === 1 && ffWhile >= 1 && ffmpegLeft() === 0 && parts().length === 0 && emptied.items.length === 0, { again, partWhile, ffWhile, now: ffmpegLeft(), parts: parts(), items: emptied.items.length });

    // --speed: the stage while copies are made, and the time to make them
    if (SPEED) {
      result.speed = { load: [] };
      const loaded = (label) => result.speed.load.push({ label, percent: load() });
      loaded('before');
      // the elements warm up once
      await win.evaluate(() => window.play(3, {}));
      await win.evaluate(() => window.stopQueue());
      await h.until(async () => (ffmpegLeft() === 0 ? true : null), 10000, 200);
      await clearCopies();
      loaded('nothing to make');
      // three rounds, each of: nothing to make; copies held at widths 1 and 3; a copy running. Windows' own speed limit is
      // kept out while a copy runs for contrast, so it runs throughout.
      const ROUND = 8;
      const prepare = async (width) => {
        await win.evaluate(() => window.stopQueue());
        await h.until(async () => (ffmpegLeft() === 0 ? true : null), 10000, 200);
        await clearCopies();
        if (width) {
          await win.evaluate((w) => window.queueWith(w), width);
          await runningCopy(new Set(Object.keys(fileOf)));
        }
      };
      result.speed.rounds = [];
      for (let round = 1; round <= 3; round++) {
        const row = { round };
        await prepare(0);
        loaded(`round ${round}: nothing to make`);
        row.nothing = await win.evaluate((n) => window.play(n, {}), ROUND);
        for (const width of [1, 3]) {
          await prepare(width);
          loaded(`round ${round}: copies at width ${width}, held`);
          row[`held${width}`] = await win.evaluate((n) => window.play(n, { say: true }), ROUND);
          row[`held${width}`].states = (await q()).items.map((i) => i.state);
        }
        await prepare(1);
        await realLimits(false);
        loaded(`round ${round}: a copy running (contrast)`);
        row.running = await win.evaluate((n) => window.play(n, { muted: true }), ROUND);
        row.running.states = (await q()).items.map((i) => i.state);
        await realLimits(true);
        result.speed.rounds.push(row);
      }
      loaded('after the rounds');
      const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
      const p95 = (k) => median(result.speed.rounds.map((r) => r[k].p95));
      result.speed.medians = { nothing: p95('nothing'), held1: p95('held1'), held3: p95('held3'), running: p95('running') };
      const m = result.speed.medians;
      note(`The stage's 95th-percentile frame time, median of three ${ROUND} s plays each: nothing to make ${m.nothing} ms, copies held at width 1 ${m.held1} ms and at width 3 ${m.held3} ms, a copy running ${m.running} ms; every play: ${JSON.stringify(result.speed.rounds.map((r) => [r.nothing.p95, r.held1.p95, r.held3.p95, r.running.p95]))}.`);
      for (const width of [1, 3]) check(`width ${width}: the stage's 95th-percentile frame time while copies wait is that of a stage with nothing to make (median ${m[`held${width}`]} ms against ${m.nothing} ms, within 10%; a copy running: ${m.running} ms)`, m[`held${width}`] <= m.nothing * 1.1, result.speed);
      // the time to make the copies at each width, Windows' own speed limit kept out: what a width can give on this laptop
      result.speed.widths = {};
      await realLimits(false);
      for (const width of [1, 2, 3]) {
        await prepare(0);
        const l = load();
        const start = Date.now();
        await win.evaluate((w) => window.queueWith(w), width);
        const done = await h.until(async () => ((await q()).items.every((i) => i.state === 'ready') ? true : null), 900000, 250);
        result.speed.widths[width] = { ms: Date.now() - start, loadBefore: l, loadAfter: load(), done: !!done };
      }
      await realLimits(true);
      note(`Time to make the copies not in use (${SECONDS} s of 4K each), one, two and three at a time: ${JSON.stringify(result.speed.widths)}`);
      check('every width made every copy', Object.values(result.speed.widths).every((w) => w.done), result.speed.widths);
    } else note('Speed figures not taken (run with --speed in a quiet window).');
    result.speedLimits = await app.evaluate(() => globalThis.__limits.slice());
    note(`Windows' speed limit for the processor during the run, as the application heard it: ${result.speedLimits.length ? JSON.stringify(result.speedLimits.map((x) => x.limit)) : 'no change (100%)'}.`);

    await clearCopies();
    await win.evaluate(() => window.queueWith(1));
    const long = await runningCopy(new Set(Object.keys(fileOf)));
    const partQuit = parts();
    await Promise.race([app.close(), h.sleep(20000)]);
    await h.sleep(1500);
    const ffAfter = ffmpegLeft();
    const second = await h.launchDev('idle');
    await h.until(() => second.win.url() === 'http://127.0.0.1:3000/', 20000);
    await h.sleep(1000);
    check('quitting while a copy is made in idle time leaves no FFmpeg running, and the next start removes its part file', !!long && partQuit.length === 1 && ffAfter === 0 && parts().length === 0, { long, partQuit, ffAfter, parts: parts() });
    await second.app.close().catch(() => undefined);
  } catch (e) {
    check('the check ran to its end', false, String((e && e.stack) || e));
  } finally {
    await h.closeAll();
    site?.server.close();
  }
  const failed = finish(path.join(__dirname, 'desktop-idle.json'));
  process.exit(failed ? 1 : 0);
}

if (require.main === module) void main();
module.exports = { CORPUS, corpusArgs, out };

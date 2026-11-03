// Application check of the idle-time broker and the light copies it makes (Desktop_Power_Ideas.md P-30 and P-08, phase
// D12; MVP_draft.md 63.9). It drives the development package on a fixture page at 127.0.0.1:3000 with the studio's own
// cache, media pool and player (qa/fixtures/desktop-idle.ts):
//   - the four 4K sources of a project are named to the application's queue by the device cache on its own, and their
//     light copies are made while nothing happens;
//   - a running copy pauses within a second of a click, of an export («busy»), of the page saying «playing», of the
//     window making sound, of the laptop going on battery and of Windows lowering the processor's speed limit, makes
//     no progress while held, and goes on from where it was once released (a click: three seconds later);
//   - a copy the person asks for is never held and holds the rest; the tray says what is being made;
//   - every copy keeps every frame of its source in order (the 12-bit gray code each source carries);
//   - a project that wants nothing any more, and quitting, leave no FFmpeg running and no part file.
// With --speed (only in a quiet window, the laptop otherwise idle): the stage's frame times while the project plays,
// with nothing to make, with copies to make but held, and, for contrast, with copies running; and the time to make
// every copy one, two and three at a time. The processor's load is recorded beside every figure.
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
const NAMES = ['shoot-1.mp4', 'shoot-2.mp4', 'shoot-3.mp4', 'shoot-4.mp4'];

const grayBoxes = Array.from({ length: BITS }, (_, k) => {
  const p = 2 ** k;
  return `drawbox=x=iw*${k + 2}/16:y=ih*7/16:w=iw/16-4:h=ih/8:color=white:t=fill:enable='eq(mod(floor(n/${p})+floor(n/${2 * p}),2),1)'`;
}).join(',');
function makeCorpus() {
  fs.mkdirSync(out, { recursive: true });
  NAMES.forEach((name, i) => {
    const file = path.join(out, name);
    if (fs.existsSync(file) && fs.statSync(file).size > 0) return;
    const r = spawnSync('ffmpeg', ['-hide_banner', '-y', '-loglevel', 'error', '-f', 'lavfi', '-i', `color=c=black:s=3840x2160:r=${FPS}:d=${SECONDS}`, '-f', 'lavfi', '-i', `sine=frequency=${330 + 110 * i}:sample_rate=48000:duration=${SECONDS}`, '-vf', grayBoxes, '-shortest', '-c:v', 'libx264', '-preset', 'veryfast', '-b:v', '30M', '-pix_fmt', 'yuv420p', '-g', '25', '-c:a', 'aac', '-b:a', '128k', file], { encoding: 'utf8', maxBuffer: 1 << 24 });
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

(async () => {
  let site = null;
  try {
    if (!fs.existsSync(h.devExe)) throw new Error(`the development package is missing: ${h.devExe} (npm run pack:dev in desktop/)`);
    if (await h.portAnswers(3000)) throw new Error('something already answers on 127.0.0.1:3000; stop it and run again');
    const t0 = Date.now();
    makeCorpus();
    note(`The corpus (four 4K H.264 sources of ${SECONDS} s at ${FPS} frames a second, 30 Mbit/s, each with its frame numbers) took ${Math.round((Date.now() - t0) / 1000)} s to make or was kept.`);

    await esbuild.build({ entryPoints: [path.join(__dirname, 'fixtures', 'desktop-idle.ts')], bundle: true, format: 'esm', platform: 'browser', target: 'es2022', outfile: path.join(out, 'idle.js'), logLevel: 'silent', absWorkingDir: h.root });
    const page = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>نسخ في وقت الفراغ</title></head><body>
      <input type="file" id="corpus" multiple><script type="module" src="/idle.js"></script></body></html>`;
    site = h.pages({ '/': ['text/html; charset=utf-8', page], '/idle.js': ['text/javascript; charset=utf-8', fs.readFileSync(path.join(out, 'idle.js'), 'utf8')] });
    await h.listen(site.server, 3000);

    let { app, win, mainId, data } = await h.launchDev('idle');
    await h.instrument(app);
    await h.until(() => win.url() === 'http://127.0.0.1:3000/', 20000);
    await win.waitForLoadState('load');
    await win.waitForFunction(() => typeof window.openCorpus === 'function');
    const bridge = await win.evaluate(() => ({ bridge: window.commsHubNative.bridge, life: Object.keys(window.commsHubNative.life), media: Object.keys(window.commsHubNative.media) }));
    check('the bridge is version 7, with life.activity and media.queue, queued and onQueue', bridge.bridge === 7 && bridge.life.includes('activity') && ['queue', 'queued', 'onQueue'].every((m) => bridge.media.includes(m)), bridge);
    const folder = path.join(data, 'StudioCache');
    const q = () => win.evaluate(() => window.queued());
    const parts = () => (fs.existsSync(folder) ? fs.readdirSync(folder).filter((f) => f.endsWith('.part')) : []);

    await win.setInputFiles('#corpus', NAMES.map((n) => path.join(out, n)));
    const opened = await win.evaluate(() => window.openCorpus());
    result.opened = opened;
    const named = await h.until(async () => {
      const s = await q();
      return s.items.length === NAMES.length && s.items.every((i) => i.state !== 'probing') ? s : null;
    }, 30000, 200);
    check('the studio named its four video sources to the queue on its own, and the application found each needs a light copy here (4K, no profile)', !!named && named.items.every((i) => ['waiting', 'running', 'ready'].includes(i.state)), { opened, named });

    /** A copy running now, a second or more into its work. */
    const runningCopy = () =>
      h.until(async () => {
        const s = await q();
        return s.items.find((i) => i.state === 'running' && i.done >= 1) ?? null;
      }, 180000, 150);
    const doneOf = async (name) => (await q()).items.find((i) => i.name === name)?.done ?? null;
    result.holds = {};
    /** Holds a running copy one way, and releases it. */
    async function held(label, hold, release, want, since = null) {
      const it = await runningCopy();
      if (!it) return check(`${label}: a copy was being made`, false, await q());
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
      const released = Date.now();
      await release();
      const goes = await h.until(async () => {
        const s = await q();
        const x = s.items.find((i) => i.name === it.name);
        return x && ((x.state === 'running' && x.done > b + 0.2) || x.state === 'ready') ? x : null;
      }, 15000, 50);
      const resumedMs = Date.now() - released;
      const sinceHold = Date.now() - start;
      result.holds[label] = { name: it.name.replace(/[0-9a-f]{40}/, '<fingerprint>'), at: it.done, pausedMs, hold: paused?.hold ?? null, progressHeld: [a, b], resumedMs, sinceHold, after: goes?.done ?? null };
      check(`${label}: the running copy pauses within a second (${pausedMs} ms), the hold is «${want}», and it makes no progress from a second on (${a} s, then ${b} s)`, !!paused && paused.hold === want && pausedMs <= 1000 && a !== null && b === a, result.holds[label]);
      check(`${label}: released, it goes on from where it was (${resumedMs} ms)`, !!goes && goes.done >= b, result.holds[label]);
      return result.holds[label];
    }

    const click = () => app.evaluate(({ BrowserWindow }, id) => {
      const wc = BrowserWindow.fromId(id).webContents;
      wc.sendInputEvent({ type: 'mouseDown', x: 20, y: 20, button: 'left', clickCount: 1 });
      wc.sendInputEvent({ type: 'mouseUp', x: 20, y: 20, button: 'left', clickCount: 1 });
    }, mainId);
    const input = await held('a click', click, async () => undefined, 'input');
    check(`a click holds only a few seconds: the copy goes on by itself ${input.sinceHold} ms after it (three seconds of quiet)`, input.sinceHold >= 3000 && input.sinceHold <= 5000, input);
    await held('an export (busy)', () => win.evaluate(() => window.busy(true)), () => win.evaluate(() => window.busy(false)), 'export');
    await held('the page says «playing»', () => win.evaluate(() => window.activity('playing')), () => win.evaluate(() => window.activity('none')), 'playing');
    let playing = null;
    await app.evaluate(({ BrowserWindow }, id) => {
      globalThis.__audible = [];
      BrowserWindow.fromId(id).webContents.on('audio-state-changed', (e) => globalThis.__audible.push({ at: Date.now(), audible: e.audible }));
    }, mainId);
    await held(
      'the window makes sound (the studio playing, not saying so)',
      async () => {
        playing = win.evaluate(() => window.play(6, {}));
      },
      async () => {
        await playing;
      },
      'playing',
      () => app.evaluate(() => globalThis.__audible.find((x) => x.audible)?.at ?? null),
    );
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
    await held(
      'Windows lowers the processor\'s speed limit (simulated)',
      () => app.evaluate(({ powerMonitor }) => void powerMonitor.emit('speed-limit-change', { limit: 70 })),
      () => app.evaluate(({ powerMonitor }) => void powerMonitor.emit('speed-limit-change', { limit: 100 })),
      'throttled',
    );

    // a copy the person asks for: never held, and it holds the rest
    const fileOf = await win.evaluate(() => window.copyNames());
    const before = await q();
    const waitingOne = before.items.find((i) => i.state === 'waiting');
    const runningOne = before.items.find((i) => i.state === 'running');
    if (waitingOne && runningOne) {
      const which = fileOf[waitingOne.name];
      const asked = win.evaluate((n) => window.ask(n), which);
      const during = await h.until(async () => {
        const s = await q();
        return s.hold === 'asked' && s.items.find((i) => i.name === runningOne.name)?.state === 'paused' ? s : null;
      }, 5000, 50);
      await click();
      const clicked = await h.until(async () => {
        const s = await q();
        return s.items.find((i) => i.name === waitingOne.name)?.state === 'running' ? s : null;
      }, 2000, 100);
      const r = await asked;
      const after = await q();
      check('a copy the person asks for is made at once and holds the copies made in idle time («asked»); a click does not hold it', !!during && !!clicked && after.items.find((i) => i.name === waitingOne.name)?.state === 'ready' && r.tools?.proxy?.kind === 'ready', { during: during && { hold: during.hold, states: during.items.map((i) => i.state) }, ms: r.ms, after: after.items.map((i) => i.state) });
    } else note(`No copy was waiting when the asked copy was tried: ${JSON.stringify(before.items.map((i) => i.state))}; that check was skipped.`);

    const tips = (await h.recorded(app)).tips;
    check('the tray says what is being made in idle time, and why it waits when it does', tips.some((t) => /نسخ خفيفة للمعاينة: تُنشأ \d+ من \d+ في وقت فراغ الجهاز/.test(t)) && tips.some((t) => /نسخ خفيفة للمعاينة: \d+ تنتظر/.test(t)), tips.filter((t) => t.includes('نسخ')).slice(-6));

    const all = await h.until(async () => {
      const s = await q();
      return s.items.every((i) => i.state === 'ready') ? s : null;
    }, 600000, 500);
    check('every light copy was made', !!all, await q());
    const copies = fs.readdirSync(folder).filter((f) => /^proxy-.*-720-r1-.*\.mp4$/.test(f));
    note(`The copies, by source: ${JSON.stringify(Object.fromEntries(copies.map((f) => [f.replace(/[0-9a-f]{40}/, '<fingerprint>'), fileOf[f]])))}`);
    const frames = copies.map((f) => grayFrames(path.join(folder, f)));
    check(`each of the ${copies.length} copies keeps every frame of its source, in order (${SECONDS * FPS} frames)`, copies.length === NAMES.length && frames.every((g) => g.length === SECONDS * FPS && g.every((n, i) => n === i)), frames.map((g) => ({ frames: g.length, wrong: g.filter((n, i) => n !== i).length })));
    check('no part file is left in the folder', parts().length === 0, parts());

    // what a cancel and a quit leave
    const clearCopies = () => win.evaluate(() => window.clearCopies());
    await clearCopies();
    await win.evaluate(() => window.queueWith(1));
    const again = await runningCopy();
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
      await h.until(async () => ffmpegLeft() === 0, 10000, 200);
      await clearCopies();
      loaded('nothing to make');
      result.speed.nothing = await win.evaluate(() => window.play(12, {}));
      await win.evaluate(() => window.queueWith(1));
      await h.until(async () => (await q()).items.some((i) => i.state === 'waiting' || i.state === 'running'), 30000, 200);
      loaded('copies to make, held');
      result.speed.held = await win.evaluate(() => window.play(12, { say: true }));
      const s = await q();
      result.speed.heldStates = s.items.map((i) => i.state);
      await runningCopy();
      loaded('copies running (contrast)');
      result.speed.running = await win.evaluate(() => window.play(12, { muted: true }));
      loaded('after the plays');
      const { nothing, held: heldPlay, running } = result.speed;
      check(`the stage's 95th-percentile frame time while copies wait is that of a stage with nothing to make (${heldPlay.p95} ms against ${nothing.p95} ms, within 10%; with copies running instead: ${running.p95} ms)`, heldPlay.p95 <= nothing.p95 * 1.1, result.speed);
      result.speed.widths = {};
      for (const width of [1, 2, 3]) {
        await win.evaluate(() => window.stopQueue());
        await h.until(async () => ffmpegLeft() === 0, 10000, 200);
        await clearCopies();
        const l = load();
        const start = Date.now();
        await win.evaluate((w) => window.queueWith(w), width);
        const done = await h.until(async () => ((await q()).items.every((i) => i.state === 'ready') ? true : null), 900000, 250);
        result.speed.widths[width] = { ms: Date.now() - start, loadBefore: l, loadAfter: load(), done: !!done };
      }
      note(`Time to make the copies not in use (${SECONDS} s of 4K each), one, two and three at a time: ${JSON.stringify(result.speed.widths)}`);
      check('every width made every copy', Object.values(result.speed.widths).every((w) => w.done), result.speed.widths);
    } else note('Speed figures not taken (run with --speed in a quiet window).');

    await clearCopies();
    await win.evaluate(() => window.queueWith(1));
    const long = await runningCopy();
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
})();

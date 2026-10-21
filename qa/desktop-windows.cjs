// Application check of the preview in a window of its own (Desktop_App_Plan.md phase D6; DT-14 of section 12;
// MVP_draft.md 63.5). It drives the development package on fixture pages at 127.0.0.1:3000 with the studio's
// own player, media pool and link (qa/fixtures/desktop-windows.ts): the editor's page, and the preview window
// the application opens through the bridge at /motion/studio/<project>/preview.
//   The bridge: the screens; a refused panel or project; the window opened on the project's own address.
//   DT-14: while playing, the preview window's playhead and the editor's, compared at the same moments on the
//   clock both windows share, stay within one frame; a jump while playing is followed at once; standing
//   still, both show the same frame (read from the gray code the source carries). Space in the preview window
//   plays and pauses the editor. Full screen and back. The editor reloaded is found again; the editor leaving
//   closes the window.
// Usage: node qa/desktop-windows.cjs   (writes qa/desktop-windows.json)   Needs: npm run pack:dev, ffmpeg.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const esbuild = require('esbuild');
const h = require('./desktop-helpers.cjs');

const { check, note, result, finish } = h.record('qa/desktop-windows.cjs');
const out = path.join(__dirname, 'artifacts', 'desktop-windows');
const SOURCE = path.join(out, 'gray-720p30.mp4');
const PROJECT = '0a1b2c3d-0000-4000-8000-0000000000d6';
const FPS = 30;
const FRAME_MS = 1000 / FPS;

const grayBoxes = Array.from({ length: 12 }, (_, k) => `drawbox=x=iw*${k + 2}/16:y=ih*7/16:w=iw/16-4:h=ih/8:color=white:t=fill:enable='eq(mod(floor(n/${2 ** k})+floor(n/${2 ** (k + 1)}),2),1)'`).join(',');

function makeSource() {
  fs.mkdirSync(out, { recursive: true });
  if (fs.existsSync(SOURCE)) return;
  const r = spawnSync('ffmpeg', ['-hide_banner', '-y', '-loglevel', 'error', '-f', 'lavfi', '-i', `color=c=black:s=1280x720:r=${FPS}:d=20`, '-vf', grayBoxes, '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-g', '15', SOURCE], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`ffmpeg: ${r.stderr}`);
}

/** The editor's playhead at `wall`: its last drawn one, moved on by the time since if it was playing then. */
function leaderAt(samples, wall) {
  let last = null;
  for (const s of samples) {
    if (s[0] > wall) break;
    last = s;
  }
  if (!last) return null;
  return last[2] ? last[1] + (wall - last[0]) * 1000 : last[1];
}

/** Differences in milliseconds between the preview window's drawn playheads and the editor's at the same moments. */
function compare(lead, follow, skip = []) {
  const diffs = [];
  // the frames the preview window drew while playing; a still one is compared by its picture instead
  for (const [w, t, playing] of follow) {
    if (!playing || skip.some(([a, b]) => w >= a && w <= b)) continue;
    const l = leaderAt(lead, w);
    if (l === null) continue;
    diffs.push(Math.abs(t - l) / 1000);
  }
  diffs.sort((a, b) => a - b);
  const at = (q) => (diffs.length ? Math.round(diffs[Math.min(diffs.length - 1, Math.floor(q * diffs.length))] * 100) / 100 : null);
  return { count: diffs.length, mean: diffs.length ? Math.round((diffs.reduce((a, b) => a + b, 0) / diffs.length) * 100) / 100 : null, p95: at(0.95), max: at(1) };
}

(async () => {
  let site;
  try {
    if (await h.portAnswers(3000)) throw new Error('something already answers on 127.0.0.1:3000');
    makeSource();
    await esbuild.build({ entryPoints: [path.join(__dirname, 'fixtures', 'desktop-windows.ts')], bundle: true, format: 'esm', platform: 'browser', target: 'es2022', outfile: path.join(out, 'windows.js'), logLevel: 'silent', absWorkingDir: h.root });
    const page = (body, start) => `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>نوافذ</title>
      <style>body{margin:0;background:#000}canvas{width:640px;height:360px;display:block}</style></head><body>${body}<canvas id="stage"></canvas>
      <script type="module">import '/windows.js'; ${start}</script></body></html>`;
    site = h.pages({
      '/': ['text/html; charset=utf-8', page('<input type="file" id="pick" accept="video/*">', '')],
      [`/motion/studio/${PROJECT}/preview`]: ['text/html; charset=utf-8', page('', 'window.startFollower();')],
      '/windows.js': ['text/javascript; charset=utf-8', fs.readFileSync(path.join(out, 'windows.js'), 'utf8')],
    });
    await h.listen(site.server, 3000);

    const { app, win } = await h.launchDev('windows');
    await h.until(() => win.url() === 'http://127.0.0.1:3000/', 20000);
    await win.waitForLoadState('load');
    await win.waitForFunction(() => typeof window.startLeader === 'function');
    await win.setInputFiles('#pick', SOURCE);
    const led = await win.evaluate(() => window.startLeader());
    check('the editor\'s page has its project ready (a 20 s source with its frame numbers)', led.state && led.state.kind === 'ready', led);

    // The bridge.
    const bridge = await win.evaluate(async () => {
      const w = window.commsHubNative.windows;
      const screens = await w.screens();
      const refuse = async (ask) => w.popOut(ask).then(() => 'opened', (e) => (String(e.message).includes('refused') ? 'refused' : String(e.message)));
      return { bridge: window.commsHubNative.bridge, keys: Object.keys(w), screens, timeline: await refuse({ panel: 'timeline', project: window.PROJECT }), badProject: await refuse({ panel: 'preview', project: '../../x' }) };
    });
    result.screens = bridge.screens;
    check('the bridge is version 5, with windows: screens, popOut and close', bridge.bridge === 5 && JSON.stringify(bridge.keys) === JSON.stringify(['screens', 'popOut', 'close']), bridge);
    check('the screens: at least one, exactly one holding the editor, each with its bounds and scale', bridge.screens.length >= 1 && bridge.screens.filter((s) => s.current).length === 1 && bridge.screens.every((s) => s.bounds.width > 0 && s.scaleFactor > 0 && Object.keys(s).join() === 'id,label,primary,current,bounds,workArea,scaleFactor'), bridge.screens);
    check('another panel, or a project that is not one, is refused', bridge.timeline === 'refused' && bridge.badProject === 'refused', bridge);
    note(`Screens on this laptop: ${bridge.screens.length} (${bridge.screens.map((s) => `${s.label || 'unnamed'} ${s.bounds.width}x${s.bounds.height} at ${s.scaleFactor}`).join('; ')}). A second screen was ${bridge.screens.length > 1 ? '' : 'not '}connected.`);

    // The preview window.
    const opened = app.waitForEvent('window', { timeout: 20000 });
    const popped = await win.evaluate(() => window.commsHubNative.windows.popOut({ panel: 'preview', project: window.PROJECT }));
    const pop = await opened;
    await pop.waitForLoadState('load');
    await h.until(async () => (await win.evaluate(() => window.linkStatus())).present && (await pop.evaluate(() => window.linkStatus())).hasPlayer, 20000);
    const placed = await app.evaluate(({ BrowserWindow }, address) => {
      const w = BrowserWindow.getAllWindows().find((x) => x.webContents.getURL() === address);
      return w ? { bounds: w.getBounds(), full: w.isFullScreen(), visible: w.isVisible() } : null;
    }, `http://127.0.0.1:3000/motion/studio/${PROJECT}/preview`);
    result.opened = { popped, placed };
    check('«فتح المعاينة في نافذة مستقلة» opens a second window on the project\'s own address, and the two find each other', pop.url() === `http://127.0.0.1:3000/motion/studio/${PROJECT}/preview` && placed && placed.visible && !placed.full, { url: pop.url(), popped, placed });

    // Standing still: the same frame.
    await win.evaluate(() => window.seek(7.3));
    await h.sleep(800);
    const stillL = await win.evaluate(() => window.frameShown());
    const stillF = await pop.evaluate(() => window.frameShown());
    result.still = { editor: stillL, preview: stillF, expected: Math.floor(7.3 * FPS) };
    check('DT-14, standing still: the preview window shows the editor\'s frame (219 at 7.3 s)', stillL && stillF && stillL.frame === 219 && stillF.frame === 219 && stillL.t === stillF.t, result.still);

    // Playing: within one frame at every drawn moment.
    await win.evaluate(() => window.record(true));
    await pop.evaluate(() => window.record(true));
    await win.evaluate(() => window.play());
    await h.sleep(8000);
    await win.evaluate(() => window.pause());
    await h.sleep(500);
    const leadSamples = await win.evaluate(() => (window.record(false), window.samples()));
    const followSamples = await pop.evaluate(() => (window.record(false), window.samples()));
    const playing = compare(leadSamples, followSamples);
    result.playing = { ...playing, editorFrames: leadSamples.length, previewFrames: followSamples.length };
    check(`DT-14, playing 8 s: at each of the preview window's ${followSamples.length} drawn frames its playhead is within one frame (${FRAME_MS.toFixed(1)} ms) of the editor's: mean ${playing.mean} ms, p95 ${playing.p95} ms, max ${playing.max} ms`, playing.count > 200 && playing.max !== null && playing.max <= FRAME_MS, result.playing);
    const stopL = await win.evaluate(() => window.frameShown());
    const stopF = await pop.evaluate(() => window.frameShown());
    result.stopped = { editor: stopL, preview: stopF };
    check('paused, both stop on the same frame', stopL && stopF && stopL.frame === stopF.frame && stopL.t === stopF.t, result.stopped);

    // A jump while playing.
    await win.evaluate(() => window.record(true));
    await pop.evaluate(() => window.record(true));
    await win.evaluate(() => window.play());
    await h.sleep(1500);
    const jumpAt = await win.evaluate(() => (window.seek(15), performance.timeOrigin + performance.now()));
    await h.sleep(1500);
    await win.evaluate(() => window.pause());
    const lj = await win.evaluate(() => (window.record(false), window.samples()));
    const fj = await pop.evaluate(() => (window.record(false), window.samples()));
    const followedAt = fj.find(([w, t]) => w >= jumpAt && t >= 15e6 - 1);
    const jump = { ...compare(lj, fj, [[jumpAt - 1, jumpAt + 50]]), followedInMs: followedAt ? Math.round((followedAt[0] - jumpAt) * 10) / 10 : null };
    result.jump = jump;
    check(`a jump to 15 s while playing is followed in ${jump.followedInMs} ms, and the two stay within one frame on both sides of it (max ${jump.max} ms)`, jump.followedInMs !== null && jump.followedInMs <= 50 && jump.max !== null && jump.max <= FRAME_MS, jump);

    // Space in the preview window plays and pauses the editor.
    await pop.bringToFront();
    await pop.keyboard.press('Space');
    await h.until(async () => (await win.evaluate(() => window.linkStatus())).playing === true, 5000).catch(() => undefined);
    const afterSpace = await win.evaluate(() => window.linkStatus());
    await pop.keyboard.press('Space');
    await h.until(async () => (await win.evaluate(() => window.linkStatus())).playing === false, 5000).catch(() => undefined);
    const afterSecond = await win.evaluate(() => window.linkStatus());
    check('space in the preview window plays the editor, and again pauses it', afterSpace.playing === true && afterSecond.playing === false && afterSecond.keys === 2, { afterSpace, afterSecond });

    // Full screen on the screen asked for, and back to a window.
    const here = bridge.screens.find((s) => s.current);
    await win.evaluate((id) => window.commsHubNative.windows.popOut({ panel: 'preview', project: window.PROJECT, screen: id, full: true }), here.id);
    await h.sleep(1500);
    const full = await app.evaluate(({ BrowserWindow, screen }, address) => {
      const w = BrowserWindow.getAllWindows().find((x) => x.webContents.getURL() === address);
      return w ? { full: w.isFullScreen(), display: screen.getDisplayMatching(w.getBounds()).id, windows: BrowserWindow.getAllWindows().length } : null;
    }, `http://127.0.0.1:3000/motion/studio/${PROJECT}/preview`);
    await win.evaluate(() => window.commsHubNative.windows.popOut({ panel: 'preview', project: window.PROJECT, full: false }));
    await h.sleep(1500);
    const windowed = await app.evaluate(({ BrowserWindow }, address) => {
      const w = BrowserWindow.getAllWindows().find((x) => x.webContents.getURL() === address);
      return w ? { full: w.isFullScreen(), bounds: w.getBounds() } : null;
    }, `http://127.0.0.1:3000/motion/studio/${PROJECT}/preview`);
    result.fullScreen = { full, windowed };
    check('full screen on the screen asked for, then back to a window; asking again moves the same window, never a second one', full && full.full === true && full.display === here.id && full.windows === 2 && windowed && windowed.full === false, result.fullScreen);

    // The editor reloaded: found again.
    const docsBefore = (await pop.evaluate(() => window.linkStatus())).docs;
    await win.reload();
    await win.waitForFunction(() => typeof window.startLeader === 'function');
    await h.until(async () => (await pop.evaluate(() => window.linkStatus())).leaderHere === false, 10000).catch(() => undefined);
    const gone = await pop.evaluate(() => window.linkStatus());
    await win.setInputFiles('#pick', SOURCE);
    await win.evaluate(() => window.startLeader());
    await h.until(async () => (await win.evaluate(() => window.linkStatus())).present, 10000).catch(() => undefined);
    const back = { editor: await win.evaluate(() => window.linkStatus()), preview: await pop.evaluate(() => window.linkStatus()) };
    result.reload = { gone, back, docsBefore };
    check('the editor reloaded: the preview window hears it leave, then finds the new one and gets the project again', gone.leaderHere === false && back.editor.present === true && back.preview.leaderHere === true && back.preview.docs > docsBefore, result.reload);

    // The editor leaving closes the window.
    const closed = pop.waitForEvent('close', { timeout: 10000 }).then(() => true, () => false);
    await win.evaluate(() => window.leave());
    const didClose = await closed;
    const left = await h.until(async () => ((await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed()).length)) === 1 ? 1 : 0), 5000).then((n) => n || app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length));
    check('the editor leaving closes the preview window', didClose && left === 1, { didClose, left });
  } catch (e) {
    check('the check ran to its end', false, String((e && e.stack) || e));
  } finally {
    await h.closeAll();
    site?.server.close();
  }
  const failed = finish(path.join(__dirname, 'desktop-windows.json'));
  process.exit(failed ? 1 : 0);
})();

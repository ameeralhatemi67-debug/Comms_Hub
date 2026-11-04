// A light copy made in idle time, taken up by an open editor (Desktop_Power_Handoff.md 3.2, idea 1; phases D10 and D12;
// MVP_draft.md 63.7 and 63.9). The real studio, bundled as qa/studio-ui.cjs bundles it, runs inside the development
// package with no device profile, so a 4K source needs a light copy (media-jobs.ts heavyOn falls back to heavy()).
//   The source is the D10 4K fixture (qa/studio-4k.cjs: 20 s at 30 frames a second, each frame's number as a gray code,
//   no sound), added from «هذا الجهاز» and used from this device only. The editor names it to the application's queue
//   on its own; nothing asks for a copy.
//   The broker's words: the page plays (the check presses «تشغيل» from inside the page, so no input is counted and the
//   source is silent, so «playing» can only be the page's own word) and scrubs (a real drag on the ruler); the queue's
//   hold is read from the application while it happens and after.
//   Taken up at the pause; the next play runs from the copy. This is D10's design: media.ts takes a copy up only while
//   paused (copiesReady, never in the middle of a play; there is no swap in mid-play). So the paused
//   frame at 4 s is read from the original, the copy is made while nothing happens, and the paused frames at the same
//   times are read again from the copy; then the next play's element is the copy's, its frames are checked against
//   the player's clock, and the copy's element is shown to give the original's frame at every time it is sent to.
//   The application is kept on mains power and at Windows' full speed limit for the run (as qa/desktop-idle.cjs does),
//   so those holds stay out; that check proves them.
// The page is watched from the check alone: an init script records the video elements made, the reads of the
// application's file addresses (as "original" or "copy", never the address or its token) and reads the gray code from
// one row of the stage canvas. Nothing in the site is changed for it.
// Usage: node qa/studio-copy-swap.cjs   (writes qa/studio-copy-swap.json)   Needs: npm run pack:dev in desktop/, ffmpeg
// with libx264, 127.0.0.1:3000 free (the lock). Run with TEMP and TMP in qa/artifacts/tmp (Desktop_Power_Handoff.md 6).
const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');
const h = require('./desktop-helpers.cjs');
const { make4k } = require('./studio-4k.cjs');
const { makeMedia, fontCss, serve, root } = require('./studio-media.cjs');
const d10 = require('./studio-d10.cjs');

const { check, note, result, finish } = h.record('qa/studio-copy-swap.cjs');
const out = path.join(__dirname, 'artifacts', 'studio-copy-swap');
const SOURCE = path.join(__dirname, 'artifacts', 'studio-scrub', 'gop2.mp4');
const FPS = 30;
/** preview.ts DRIFT (s) and SCRUB_QUIET (ms), and idle.ts QUIET_MS: an element is put back in step beyond the first. */
const DRIFT = 0.12;
const SCRUB_QUIET = 400;
const QUIET_MS = 3000;
/** Frames an element may be off the clock before the player puts it back in step, plus the frame being drawn. */
const IN_RULE = Math.ceil(DRIFT * FPS) + 1;
const PLAY_MS = 3000;
const AT = 4;
const mask = (s) => (typeof s === 'string' ? s.replace(/[0-9a-f]{40}/g, '<fingerprint>') : s);

const page = `<!doctype html><html lang="ar" dir="rtl" data-identity="emerald" data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="/css/globals.css"><link rel="stylesheet" href="/css/identity.css"><link rel="stylesheet" href="/bundle.css">
<style>${fontCss()} body{font-family:var(--font-sans,"IBM Plex Sans Arabic")} main{padding:16px}</style></head>
<body><div id="root"></div><script type="module" src="/bundle.js"></script></body></html>`;

async function build() {
  await esbuild.build({
    entryPoints: [path.join(__dirname, 'fixtures', 'studio-ui.tsx')],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    jsx: 'automatic',
    outfile: path.join(out, 'bundle.js'),
    alias: {
      'next/navigation': path.join(__dirname, 'fixtures', 'fake-next.tsx'),
      'next/link': path.join(__dirname, 'fixtures', 'fake-next.tsx'),
      '@/lib/supabase/client': path.join(__dirname, 'fixtures', 'fake-supabase.ts'),
    },
    define: { 'process.env.NODE_ENV': '"production"' },
    loader: { '.png': 'file', '.woff2': 'file', '.woff': 'file' },
    logLevel: 'silent',
    absWorkingDir: root,
  });
}

/** Runs in the page before its scripts: what the check watches (elements, reads, the stage's frame number). */
function watch() {
  const els = [];
  const reads = [];
  const make = Document.prototype.createElement;
  Document.prototype.createElement = function createElement(tag, o) {
    const el = make.call(this, tag, o);
    if (typeof tag === 'string' && tag.toLowerCase() === 'video') els.push({ el, at: performance.now() });
    return el;
  };
  const placeOf = (u) => (u.startsWith('commshub-file://cache/') ? 'copy' : u.startsWith('commshub-file://local/') ? 'original' : u.startsWith('blob:') ? 'blob' : 'other');
  const f = window.fetch;
  window.fetch = function fetch(input, init) {
    const u = typeof input === 'string' ? input : input instanceof URL ? input.href : input && input.url;
    if (typeof u === 'string' && u.startsWith('commshub-file:')) reads.push({ at: performance.now(), place: placeOf(u) });
    return f.apply(this, arguments);
  };
  /** The frame number the stage shows: the 12-bit gray code across its middle row (qa/studio-4k.cjs). */
  const gray = () => {
    const c = document.querySelector('.st-canvas');
    if (!c || !c.width) return null;
    const row = c.getContext('2d').getImageData(0, Math.floor(c.height / 2), c.width, 1).data;
    let g = 0;
    for (let k = 0; k < 12; k++) if (row[Math.round((c.width * (k + 2.45)) / 16) * 4] > 128) g |= 1 << k;
    let n = 0;
    for (let v = g; v; v >>= 1) n ^= v;
    return n;
  };
  /** The playhead in frames, from the stage's «00:04.00 / 00:20.00». */
  const playhead = () => {
    const m = /^(?:(\d+):)?(\d+):(\d+)\.(\d+)/.exec((document.querySelector('.st-time')?.textContent || '').trim());
    return m ? ((Number(m[1] || 0) * 60 + Number(m[2])) * 60 + Number(m[3])) * 30 + Number(m[4]) : null;
  };
  /** The clip's element: the last video element the media pool made (it marks its own with data-source). */
  const clipEl = () => [...els].reverse().find((x) => x.el.dataset.source)?.el ?? null;
  const elInfo = (el) => (el ? { place: placeOf(el.currentSrc || el.src || ''), copy: el.dataset.copy ?? null, ready: el.readyState, time: Math.round(el.currentTime * 1000) / 1000 } : null);
  window.__swap = {
    gray,
    playhead,
    reads: () => ({ original: reads.filter((r) => r.place === 'original').length, copy: reads.filter((r) => r.place === 'copy').length, blob: reads.filter((r) => r.place === 'blob').length, firstCopy: reads.find((r) => r.place === 'copy')?.at ?? null }),
    elements: () => els.filter((x) => x.el.dataset.source).map((x) => ({ ...elInfo(x.el), at: Math.round(x.at) })),
    /** Presses a button of the play row from inside the page (no input event reaches the application). */
    press: (label) => {
      const b = document.querySelector(`.st-transport button[aria-label="${label}"]`);
      if (!b) throw new Error(`no button «${label}»`);
      b.click();
    },
    /** Waits until the stage shows the same frame for 300 ms after a seek, up to `ms`: that frame and the playhead's. */
    settled: async (ms = 8000) => {
      const t0 = performance.now();
      let last = null;
      let since = t0;
      while (performance.now() - t0 < ms) {
        await new Promise((r) => setTimeout(r, 50));
        const n = gray();
        if (n !== last) {
          last = n;
          since = performance.now();
        } else if (performance.now() - since >= 300 && performance.now() - t0 >= 400) break;
      }
      return { shown: last, playhead: playhead(), ms: Math.round(performance.now() - t0) };
    },
    /**
     * Plays for `ms` from where the playhead is, pressing «تشغيل» from the page, and reads every frame the stage draws:
     * its number, the player's clock (from the press: the player starts its clock inside the press), and the clip's
     * element. Then pauses.
     */
    play: async (ms) => {
      const start = playhead();
      const before = els.length;
      const p0 = performance.now();
      document.querySelector('.st-play').click();
      const p1 = performance.now();
      const frames = [];
      await new Promise((done) => {
        const f = (now) => {
          const el = clipEl();
          // the clock as the player has it at this refresh, from either side of the press
          const lo = Math.floor(start + ((now - p1) * 30) / 1000 + 1e-9);
          const hi = Math.floor(start + ((now - p0) * 30) / 1000 + 1e-9);
          frames.push({ at: Math.round((now - p0) * 10) / 10, shown: gray(), lo, hi, ready: el ? el.readyState : -1, copy: el ? el.dataset.copy : null });
          if (now - p0 < ms) requestAnimationFrame(f);
          else done();
        };
        requestAnimationFrame(f);
      });
      const el = clipEl();
      const q = el && el.getVideoPlaybackQuality ? el.getVideoPlaybackQuality() : null;
      document.querySelector('.st-play').click();
      return { start, press: Math.round((p1 - p0) * 10) / 10, frames, made: els.slice(before).filter((x) => x.el.dataset.source).map((x) => elInfo(x.el)), element: elInfo(el), quality: q && { total: q.totalVideoFrames, dropped: q.droppedVideoFrames } };
    },
    /** Sends the clip's element (paused) to each time and reads the frame it gives, drawn on a canvas of its own. */
    elementFrames: async (times) => {
      const el = clipEl();
      if (!el) return null;
      const c = document.createElement('canvas');
      c.width = 640;
      c.height = 360;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      const outs = [];
      for (const t of times) {
        await new Promise((r) => {
          el.addEventListener('seeked', r, { once: true });
          el.currentTime = t;
        });
        // a paused element may have shown its frame before «seeked»: never wait on it for long
        await Promise.race([new Promise((r) => el.requestVideoFrameCallback?.(() => r())), new Promise((r) => setTimeout(r, 150))]);
        ctx.drawImage(el, 0, 0, 640, 360);
        const row = ctx.getImageData(0, 180, 640, 1).data;
        let g = 0;
        for (let k = 0; k < 12; k++) if (row[Math.round((640 * (k + 2.45)) / 16) * 4] > 128) g |= 1 << k;
        let n = 0;
        for (let v = g; v; v >>= 1) n ^= v;
        outs.push({ t, frame: n });
      }
      return { element: elInfo(el), frames: outs };
    },
  };
}

/** The frames of a play, judged against the clock: the warm-up until the element is in step, and every frame after. */
function judgePlay(p, label) {
  const off = (f) => (f.shown === null ? null : f.shown < f.lo ? f.shown - f.lo : f.shown > f.hi ? f.shown - f.hi : 0);
  const frames = p.frames.map((f) => ({ ...f, off: off(f) }));
  // in step by the player's own rule: the element shows frames and is no further off the clock than DRIFT allows
  const steady = frames.findIndex((f) => f.ready >= 2 && f.off !== null && Math.abs(f.off) <= IN_RULE);
  const after = steady < 0 ? [] : frames.slice(steady);
  const offs = after.map((f) => f.off).filter((x) => x !== null);
  const sorted = offs.map(Math.abs).sort((a, b) => a - b);
  const back = after.slice(1).filter((f, i) => f.shown !== null && after[i].shown !== null && f.shown < after[i].shown).length;
  const r = {
    label,
    start: p.start,
    first: frames[0] ? { shown: frames[0].shown, lo: frames[0].lo, hi: frames[0].hi, ready: frames[0].ready } : null,
    inStepMs: steady < 0 ? null : frames[steady].at,
    warmup: frames.slice(0, Math.max(0, steady)).map((f) => f.off),
    drawn: frames.length,
    after: after.length,
    medianOff: sorted.length ? sorted[Math.floor(sorted.length / 2)] : null,
    worstOff: sorted.length ? sorted[sorted.length - 1] : null,
    outside: offs.filter((x) => Math.abs(x) > IN_RULE).length,
    back,
    element: p.element,
    made: p.made,
    quality: p.quality,
    press: p.press,
  };
  return r;
}

(async () => {
  let server = null;
  // the lock of 127.0.0.1:3000, named after this worktree's branch and freed however the process ends
  const port = d10.portLock();
  try {
    fs.rmSync(out, { recursive: true, force: true });
    fs.mkdirSync(out, { recursive: true });
    fs.mkdirSync(path.dirname(SOURCE), { recursive: true });
    make4k(SOURCE, 60);
    makeMedia(out);
    await build();
    if (!fs.existsSync(h.devExe)) throw new Error(`the development package is missing: ${h.devExe} (npm run pack:dev in desktop/)`);
    if (!port.take()) throw new Error(`${port.file} exists: another check holds 127.0.0.1:3000`);
    if (await h.portAnswers(3000)) throw new Error('something already answers on 127.0.0.1:3000');
    const pages = (p) => (p === '/' || p.startsWith('/motion/studio') ? page : undefined);
    const s = await serve(out, pages);
    server = s.server;
    // the development package opens 127.0.0.1:3000 only: the same server, on that port
    await new Promise((r) => server.close(r));
    await h.listen(server, 3000);
    const base = 'http://127.0.0.1:3000';

    const { app, win } = await h.launchDev('copy-swap', { settings: { keepInTray: false, gpu: 'strong' }, args: [...d10.VISIBLE_ARGS] });
    // a «leave with unsaved changes?» prompt is answered, never left to the driver
    win.on('dialog', (d) => void d.accept().catch(() => undefined));
    await win.addInitScript(watch);
    // mains power and Windows' full speed limit for the run: the holds of D12's own check stay out of this one.
    // Electron hands Windows' own events to a copy of emit bound when the first listener was added, so replacing
    // powerMonitor.emit holds nothing back (a hot laptop's real limit reached the application on 2026-11-05). The
    // application's listeners are taken off instead, told 100 once, and Windows' own changes are only recorded.
    await app.evaluate(({ powerMonitor }) => {
      powerMonitor.isOnBatteryPower = () => false;
      const theirs = powerMonitor.listeners('speed-limit-change');
      powerMonitor.removeAllListeners('speed-limit-change');
      globalThis.__limits = [];
      powerMonitor.on('speed-limit-change', (d) => globalThis.__limits.push({ at: Date.now(), limit: d && d.limit }));
      for (const l of theirs) l.call(powerMonitor, { limit: 100 });
      powerMonitor.emit('on-ac');
    });
    await h.until(() => win.url().startsWith(base), 30000);
    await win.waitForLoadState('load');
    await d10.toFront(app, win);
    const bridge = await win.evaluate(() => ({ bridge: window.commsHubNative.bridge, profile: !!window.commsHubNative.profile }));
    check('the application\'s bridge is version 9, as main has it (life.activity and the copy queue from 7)', bridge.bridge >= 9, bridge);

    // --- the editor, on a 4K source from this device --------------------------------------------------
    await win.goto(base + '/motion/studio');
    await win.evaluate(() => window.__db.reset());
    await win.reload();
    await win.getByRole('button', { name: 'مشروع فيديو جديد' }).click({ timeout: 20000 });
    await win.getByLabel('اسم المشروع').fill('نسخة في وقت الفراغ');
    await win.getByRole('radio', { name: /عرضي 16:9/ }).click();
    await win.getByRole('button', { name: 'إنشاء وفتح' }).click();
    await win.locator('.st-editor').waitFor({ timeout: 20000 });
    await win.locator('.st-bin [role="tab"]', { hasText: 'هذا الجهاز' }).click();
    await win.locator('.st-device input[type="file"]').setInputFiles(SOURCE);
    await win.getByRole('button', { name: 'استخدامه من هذا الجهاز فقط' }).click();
    await win.locator('.st-clip[data-kind="video"]').waitFor({ timeout: 30000 });
    await win.waitForFunction(() => !document.querySelector('.st-clip-load'), null, { timeout: 60000 });
    const queued = () => win.evaluate(() => window.commsHubNative.media.queued());
    const item = async () => (await queued()).items[0] ?? null;
    const named = await h.until(async () => {
      const st = await queued();
      return st.items.length === 1 && st.items[0].state !== 'probing' ? st : null;
    }, 30000, 200);
    const copyName = named?.items[0]?.name ?? null;
    check('the editor named its 4K source to the application\'s queue on its own, and the application found it needs a light copy here (no profile)', !!named && ['waiting', 'running', 'paused'].includes(named.items[0].state), { ...named, items: named?.items.map((i) => ({ ...i, name: mask(i.name) })) });

    // the paused frame at 4 s, read from the original before any copy exists
    const at = async (label) => win.evaluate((l) => window.__swap.press(l), label);
    await at('إلى البداية');
    for (let i = 0; i < AT; i++) await at('تقدم ثانية');
    const before = await win.evaluate(() => window.__swap.settled());
    const readsBefore = await win.evaluate(() => window.__swap.reads());
    const stateBefore = (await item())?.state;
    // the identity proven is the stage against its own playhead; the frames read here (120, 122, 150) start on or just
    // after their exact times, where the transport's timecode (frameAt) and the export's rule (frameShown) agree
    check(`paused at the playhead, the stage shows the playhead's frame (${before.playhead}) from the original (no read of a copy yet)`, before.shown !== null && before.shown === before.playhead && readsBefore.copy === 0 && stateBefore !== 'ready', { before, readsBefore, stateBefore });
    check(`four presses of «تقدم ثانية» from the start land on frame ${AT * FPS} (whole frames, time.ts stepFrames)`, before.playhead === AT * FPS, before);

    // --- «playing»: the page's own word -----------------------------------------------------------
    await d10.assertDrawing(win, 'the editor');
    const running = await h.until(async () => {
      const it = await item();
      return it && ((it.state === 'running' && it.done >= 0.5) || it.state === 'ready') ? it : null;
    }, 30000, 150);
    const playA = win.evaluate((ms) => window.__swap.play(ms), PLAY_MS);
    const holdsA = [];
    const tA = Date.now();
    while (Date.now() - tA < PLAY_MS - 200) {
      const st = await queued();
      holdsA.push({ ms: Date.now() - tA, hold: st.hold, state: st.items[0]?.state, done: st.items[0]?.done });
      await h.sleep(150);
    }
    const a = judgePlay(await playA, 'the original');
    const afterA = [];
    const tA2 = Date.now();
    while (Date.now() - tA2 < 1200) {
      const st = await queued();
      afterA.push({ ms: Date.now() - tA2, hold: st.hold, state: st.items[0]?.state });
      await h.sleep(100);
    }
    result.playing = { copyBefore: running && { state: running.state, done: running.done }, during: holdsA, after: afterA, play: a };
    const heldA = holdsA.filter((x) => x.ms >= 400);
    check('while the editor plays, the application reads «playing» (the page\'s own word: the source is silent and «تشغيل» was pressed from the page)', heldA.length > 0 && heldA.every((x) => x.hold === 'playing'), holdsA);
    const pausedA = heldA.filter((x) => x.ms >= 1000 && x.state === 'paused');
    if (running?.state === 'running') check('the copy being made in idle time is paused while the editor plays, and makes no progress from a second on', pausedA.length > 0 && new Set(pausedA.map((x) => x.done)).size === 1, holdsA);
    else note(`The copy was already ${running ? running.state : 'not running'} when the editor played, so its pause was not seen here (qa/desktop-idle.cjs proves it).`);
    const freeA = afterA.find((x) => x.hold === null);
    check('once paused, nothing is held (no input was counted: the play and the pause were pressed from the page)', !!freeA && freeA.ms <= 600, afterA);
    check('that play was the original\'s element', a.element?.place === 'original' || a.element?.copy === '0', a.element);

    // --- «scrubbing»: a real drag on the ruler --------------------------------------------------------
    const ruler = await win.locator('.st-tl-ruler').boundingBox();
    const y = ruler.y + ruler.height / 2;
    const holdsB = [];
    await win.mouse.move(ruler.x + ruler.width * 0.7, y);
    await win.mouse.down();
    const tB = Date.now();
    for (let i = 0; i <= 16; i++) {
      await win.mouse.move(ruler.x + ruler.width * (0.7 - i * 0.025), y, { steps: 2 });
      await h.sleep(60);
      const st = await queued();
      holdsB.push({ ms: Date.now() - tB, hold: st.hold, state: st.items[0]?.state });
    }
    await win.mouse.up();
    const lastMove = Date.now();
    const afterB = [];
    while (Date.now() - lastMove < QUIET_MS + 2500) {
      const st = await queued();
      afterB.push({ ms: Date.now() - lastMove, hold: st.hold, state: st.items[0]?.state });
      await h.sleep(100);
    }
    result.scrubbing = { during: holdsB, after: afterB };
    const heldB = holdsB.slice(1);
    check('while the ruler is dragged, the application reads «scrubbing» (above the input the drag also is)', heldB.length > 0 && heldB.every((x) => x.hold === 'scrubbing'), holdsB);
    const noScrub = afterB.find((x) => x.hold !== 'scrubbing');
    const lateScrub = afterB.filter((x) => x.hold === 'scrubbing' && x.ms > SCRUB_QUIET + 400);
    check(`the drag stopped, «scrubbing» ends within ${SCRUB_QUIET + 400} ms (the page says «none» ${SCRUB_QUIET} ms after the last move)`, !!noScrub && lateScrub.length === 0, afterB);
    const freeB = afterB.find((x) => x.hold === null);
    check(`and nothing is held once the drag's own input is ${QUIET_MS / 1000} s old`, !!freeB && freeB.ms <= QUIET_MS + 1000 && afterB.filter((x) => x.ms >= freeB.ms).every((x) => x.hold === null), { freeAt: freeB?.ms ?? null, after: afterB });

    // --- the copy made in idle time, taken up at the pause ----------------------------------------------
    await at('إلى البداية');
    for (let i = 0; i < AT; i++) await at('تقدم ثانية');
    await win.evaluate(() => window.__swap.settled());
    const t0 = Date.now();
    const ready = await h.until(async () => ((await item())?.state === 'ready' ? true : null), 600000, 500);
    const madeMs = Date.now() - t0;
    const takenUp = await h.until(async () => ((await win.evaluate(() => window.__swap.reads())).copy > 0 ? true : null), 15000, 100);
    const readsAt = await win.evaluate(() => window.__swap.reads());
    check('the light copy was made while nothing happened, with nothing asked, and taken up at the pause (the paused editor\'s decoder reads the copy)', !!ready && !!takenUp, { madeMs, readsAt, item: mask(JSON.stringify(await item())) });
    const still = await win.evaluate(() => window.__swap.settled(3000));
    await at('تقدم ثانية');
    const next = await win.evaluate(() => window.__swap.settled());
    await at('رجوع ثانية');
    const again = await win.evaluate(() => window.__swap.settled());
    await at('إطار للأمام');
    await at('إطار للأمام');
    const two = await win.evaluate(() => window.__swap.settled());
    await at('إطار للخلف');
    await at('إطار للخلف');
    const back = await win.evaluate(() => window.__swap.settled());
    const readsAfter = await win.evaluate(() => window.__swap.reads());
    result.takenUpAtPause = { before, still, next, again, two, back, readsAt, readsAfter, madeMs };
    // the seeks after the take-up are the copy's: it was read for them, or the original was not (its reads may be cached)
    const fromCopy = readsAfter.copy > readsAt.copy || readsAfter.original === readsAt.original;
    const p0 = before.playhead;
    const reads = [still, next, again, two, back];
    check(`taken up at the pause, the paused frame keeps its identity: frame ${before.shown} from the original, and from the copy ${again.shown} again, ${next.shown} a second on and ${two.shown} two frames on, each the playhead's`, reads.every((r) => r.shown !== null && r.shown === r.playhead) && still.shown === before.shown && again.shown === before.shown && back.shown === before.shown && next.playhead === p0 + FPS && two.playhead === p0 + 2 && fromCopy, result.takenUpAtPause);

    // --- the next play: the copy's element ---------------------------------------------------------
    await d10.assertDrawing(win, 'the editor');
    const playE = win.evaluate((ms) => window.__swap.play(ms), PLAY_MS);
    await h.sleep(PLAY_MS / 2);
    const holdE = (await queued()).hold;
    const e = judgePlay(await playE, 'the copy');
    result.copyPlay = { hold: holdE, play: e };
    check('the next play runs from the copy: its element is the light copy\'s, and no element of the original is made for it',e.made.length >= 1 && e.made.every((m) => m.place === 'copy' && m.copy === '1') && e.element?.place === 'copy', { made: e.made, element: e.element });
    check(`its frames keep their identity by the player's own rule: in step ${e.inStepMs} ms after the press, then every drawn frame within ${IN_RULE} frames of the clock (preview.ts DRIFT ${DRIFT} s) and none going back; median ${e.medianOff} and worst ${e.worstOff} frames off (the original: ${a.medianOff} and ${a.worstOff}, in step after ${a.inStepMs} ms)`, e.inStepMs !== null && e.inStepMs <= 1000 && e.outside === 0 && e.back === 0, { copy: e, original: { inStepMs: a.inStepMs, medianOff: a.medianOff, worstOff: a.worstOff, outside: a.outside, back: a.back } });
    check('it plays at the same frame of the clock as the original\'s play did, or nearer (median offset, frames)', a.medianOff === null || (e.medianOff !== null && e.medianOff <= Math.max(1, a.medianOff)), { original: a.medianOff, copy: e.medianOff });
    note(`The press to the element in step: the original ${a.inStepMs} ms (warm-up offsets ${JSON.stringify(a.warmup)}), the copy ${e.inStepMs} ms (${JSON.stringify(e.warmup)}); frames drawn ${a.drawn} and ${e.drawn}; the elements' own count ${JSON.stringify(a.quality)} and ${JSON.stringify(e.quality)}. A play starts its element as it starts, from the original or the copy alike; until then the stage shows the paused decoder's frame.`);

    const ef = await win.evaluate(({ times }) => window.__swap.elementFrames(times), { times: [AT, 5.5, 10, 15.5].map((t) => t + 0.001) });
    result.copyElement = ef;
    check('the copy\'s element gives the original\'s frame at every time it is sent to (its timestamps are the original\'s)', !!ef && ef.element.place === 'copy' && ef.frames.every((f) => f.frame === Math.floor((f.t - 0.001) * FPS + 1e-9)), ef);

    const afterE = [];
    const tE = Date.now();
    while (Date.now() - tE < 1200) {
      const st = await queued();
      afterE.push({ ms: Date.now() - tE, hold: st.hold, items: st.items.map((i) => i.state) });
      await h.sleep(100);
    }
    result.end = { hold: holdE, after: afterE };
    check('the application read «playing» during that play too, and after it nothing is held and nothing is being made', holdE === 'playing' && afterE.slice(-5).every((x) => x.hold === null && x.items.every((s) => s === 'ready')), result.end);
    const sys = await win.evaluate(() => ({ dpr: window.devicePixelRatio, canvas: document.querySelector('.st-canvas').width, renderer: (() => { const g = document.createElement('canvas').getContext('webgl'); const x = g?.getExtension('WEBGL_debug_renderer_info'); return g && x ? g.getParameter(x.UNMASKED_RENDERER_WEBGL) : null; })() }));
    note(`Inside the development package with no device profile: ${JSON.stringify(sys)}; the copy ${mask(copyName)}, made in ${madeMs} ms after the editor was left alone at ${AT} s.`);
    const limits = await app.evaluate(() => globalThis.__limits.map((x) => x.limit));
    result.windowsLimits = limits;
    note(limits.length ? `Windows changed the processor's speed limit ${limits.length} times during the run (${limits.join(', ')}); the application was kept at 100.` : "Windows did not change the processor's speed limit during the run.");
  } catch (e) {
    check('the check ran to the end', false, e.stack || String(e));
  } finally {
    await h.closeAll();
    if (server) server.close();
    port.free();
    process.exitCode = finish(path.join(__dirname, 'studio-copy-swap.json')) ? 1 : 0;
  }
})();

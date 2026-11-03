// Application check of the media tools (Desktop_App_Plan.md phase D5; DT-12 and DT-13 of section 12; MVP_draft.md
// 63.4). It drives the development package on a fixture page at 127.0.0.1:3000 with the studio's own cache, media
// pool and export (qa/fixtures/desktop-media.ts):
//   The corpus: ProRes 422 and HEVC 10-bit at 4K, DNxHR HQ, a camera's MTS (H.264 with AC-3 sound) and an MXF
//   (MPEG-2 4:2:2), made here by the local ffmpeg as fixtures only, each carrying its frame number as a 12-bit
//   gray code. Each opens in the studio: as it is where the browser decodes it, or after «تحويل إلى نسخة قابلة
//   للتحرير»; a converted copy keeps every frame, and the frame read at a time is the frame that time names.
//   DT-12: «إنشاء نسخة خفيفة للمعاينة» on a heavy 4K source: the preview's frame (from the light copy) and the
//   export's frame (from the original) are the same frame at every time tried, frame boundaries included; the
//   playing element plays the light copy; an export reads the original only and passes ffprobe, its frames the
//   source's own.
//   A light copy cancelled leaves nothing; quitting mid-copy leaves no FFmpeg running and no .part file.
//   DT-13: the licence audit of the FFmpeg the package carries: LGPL v3, no GPL or nonfree part, its configure
//   line recorded, the encoders the jobs name present.
// From D12 the application also makes light copies of heavy sources by itself while the laptop is free (P-08); this check
// is of the copies asked for, so it holds that broker (a simulated speed limit), and qa/desktop-idle.cjs checks the rest.
// Usage: node qa/desktop-media.cjs   (writes qa/desktop-media.json)   Needs: npm run pack:dev, a local ffmpeg with
// libx264, libx265, prores_ks, dnxhd, mpeg2video and ac3 (fixtures only).
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const esbuild = require('esbuild');
const h = require('./desktop-helpers.cjs');

const { check, note, result, finish } = h.record('qa/desktop-media.cjs');
const out = path.join(__dirname, 'artifacts', 'desktop-media');
const shipped = path.join(h.desktop, 'dist', 'dev', 'win-unpacked', 'resources', 'ffmpeg');
const SECONDS = 8;
const BITS = 12;

/** Twelve boxes across the middle of the picture, white for a one: the frame number in gray code. */
const grayBoxes = Array.from({ length: BITS }, (_, k) => {
  const p = 2 ** k;
  return `drawbox=x=iw*${k + 2}/16:y=ih*7/16:w=iw/16-4:h=ih/8:color=white:t=fill:enable='eq(mod(floor(n/${p})+floor(n/${2 * p}),2),1)'`;
}).join(',');

const CORPUS = [
  { name: 'gray-4k-h264.mp4', fps: 25, size: '3840x2160', args: ['-c:v', 'libx264', '-preset', 'veryfast', '-b:v', '60M', '-pix_fmt', 'yuv420p', '-g', '25', '-c:a', 'aac', '-b:a', '128k'] },
  { name: 'prores-422-4k.mov', fps: 25, size: '3840x2160', args: ['-c:v', 'prores_ks', '-profile:v', '2', '-c:a', 'pcm_s24le'] },
  { name: 'dnxhr-hq.mov', fps: 25, size: '1920x1080', args: ['-c:v', 'dnxhd', '-profile:v', 'dnxhr_hq', '-pix_fmt', 'yuv422p', '-c:a', 'pcm_s16le'] },
  { name: 'hevc-10bit-4k.mp4', fps: 25, size: '3840x2160', args: ['-c:v', 'libx265', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p10le', '-tag:v', 'hvc1', '-x265-params', 'log-level=error', '-c:a', 'aac'] },
  { name: 'camera-aac.mts', fps: 25, size: '1920x1080', args: ['-c:v', 'libx264', '-preset', 'veryfast', '-b:v', '16M', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-f', 'mpegts'] },
  { name: 'camera.mts', fps: 50, size: '1920x1080', args: ['-c:v', 'libx264', '-preset', 'veryfast', '-b:v', '24M', '-pix_fmt', 'yuv420p', '-c:a', 'ac3', '-b:a', '256k', '-f', 'mpegts'] },
  { name: 'xdcam.mxf', fps: 25, size: '1920x1080', args: ['-c:v', 'mpeg2video', '-pix_fmt', 'yuv422p', '-b:v', '50M', '-minrate', '50M', '-maxrate', '50M', '-bufsize', '36M', '-g', '12', '-c:a', 'pcm_s16le', '-ar', '48000', '-f', 'mxf'] },
];

const ff = (args) => {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-y', '-loglevel', 'error', ...args], { encoding: 'utf8', maxBuffer: 1 << 24 });
  if (r.status !== 0) throw new Error(`ffmpeg: ${r.stderr}`);
};
function makeCorpus() {
  fs.mkdirSync(out, { recursive: true });
  for (const c of CORPUS) {
    const file = path.join(out, c.name);
    if (fs.existsSync(file) && fs.statSync(file).size > 0) continue;
    ff(['-f', 'lavfi', '-i', `color=c=black:s=${c.size}:r=${c.fps}:d=${SECONDS}`, '-f', 'lavfi', '-i', `sine=frequency=440:sample_rate=48000:duration=${SECONDS}`, '-vf', grayBoxes, '-shortest', ...c.args, file]);
  }
}

/** The frame numbers ffmpeg reads from a file's pictures, in order. */
function grayFrames(file, select = null) {
  const args = ['-v', 'error', '-i', file, ...(select ? ['-vf', `select='${select}',scale=320:180`, '-fps_mode', 'passthrough'] : ['-vf', 'scale=320:180']), '-f', 'rawvideo', '-pix_fmt', 'gray', '-'];
  const raw = spawnSync('ffmpeg', args, { maxBuffer: 1 << 30 }).stdout;
  const frames = [];
  for (let at = 0; at + 320 * 180 <= raw.length; at += 320 * 180) {
    let gray = 0;
    for (let k = 0; k < BITS; k++) if (raw[at + 90 * 320 + Math.round((320 * (k + 2.45)) / 16)] > 128) gray |= 1 << k;
    let n = 0;
    for (let v = gray; v; v >>= 1) n ^= v;
    frames.push(n);
  }
  return frames;
}
const probe = (file) => JSON.parse(spawnSync('ffprobe', ['-v', 'error', '-count_frames', '-show_entries', 'stream=codec_type,codec_name,width,height,nb_read_frames,pix_fmt:format=duration,format_name', '-of', 'json', file], { encoding: 'utf8' }).stdout);
const videoOf = (p) => p.streams.find((s) => s.codec_type === 'video');
const audioOf = (p) => p.streams.find((s) => s.codec_type === 'audio');

/** Times at frame middles and just inside both edges of frames spread over the clip, from the source's first frame. */
function timesFor(fps, count = 16, first = 0) {
  const t = [];
  for (let i = 0; i < count; i++) {
    const n = Math.floor(((i + 0.5) / count) * (SECONDS - 0.5) * fps);
    t.push((n + 0.5) / fps, n / fps + 0.002, (n + 1) / fps - 0.002);
  }
  return t.map((x) => Math.round((x + first) * 1e6) / 1e6);
}

const ffmpegLeft = () => h.ps(`@(Get-Process ffmpeg,ffprobe -ErrorAction SilentlyContinue | Where-Object { $_.Path -like '*${h.desktop.replace(/'/g, "''")}*' }).Count`);

(async () => {
  let site;
  try {
    if (await h.portAnswers(3000)) throw new Error('something already answers on 127.0.0.1:3000');
    // DT-13: the licence audit of what the package carries.
    const version = spawnSync(path.join(shipped, 'ffmpeg.exe'), ['-hide_banner', '-version'], { encoding: 'utf8' }).stdout;
    const configure = (/configuration: (.*)/.exec(version) || [])[1] || '';
    const encoders = spawnSync(path.join(shipped, 'ffmpeg.exe'), ['-hide_banner', '-encoders'], { encoding: 'utf8' }).stdout;
    const licence = fs.readFileSync(path.join(shipped, 'LICENSE.txt'), 'utf8');
    const pinned = JSON.parse(fs.readFileSync(path.join(shipped, 'PINNED.json'), 'utf8'));
    result.licence = { version: (/ffmpeg version (\S+)/.exec(version) || [])[1], configure, pinned, licenceFirstLine: licence.trim().split('\n')[0].trim(), files: fs.readdirSync(shipped).sort() };
    check('DT-13: the package carries the pinned FFmpeg, LGPL v3: --enable-version3, no --enable-gpl, no --enable-nonfree', /--enable-version3/.test(configure) && !/--enable-gpl|--enable-nonfree/.test(configure) && /GNU LESSER GENERAL PUBLIC LICENSE/.test(licence) && /Version 3/.test(licence) && pinned.file.includes('-lgpl-shared-'), result.licence);
    check('DT-13: the encoders the jobs name are in it (Media Foundation H.264 and AAC)', / h264_mf /.test(encoders) && / aac_mf /.test(encoders), 'h264_mf, aac_mf');
    check('DT-13: only the two programs, their libraries, the licence and the pin are packaged', result.licence.files.every((f) => /^(ffmpeg\.exe|ffprobe\.exe|[a-z0-9_-]+-\d+\.dll|LICENSE\.txt|PINNED\.json)$/i.test(f)) && !result.licence.files.includes('ffplay.exe'), result.licence.files);

    const t0 = Date.now();
    makeCorpus();
    result.corpus = Object.fromEntries(CORPUS.map((c) => {
      const p = probe(path.join(out, c.name));
      const v = videoOf(p);
      const a = audioOf(p);
      return [c.name, { bytes: fs.statSync(path.join(out, c.name)).size, container: p.format.format_name, video: `${v.codec_name} ${v.width}x${v.height} ${v.pix_fmt}`, frames: Number(v.nb_read_frames), audio: a ? a.codec_name : null }];
    }));
    note(`The corpus took ${Math.round((Date.now() - t0) / 1000)} s to make (or was kept from an earlier run): ${JSON.stringify(result.corpus)}`);
    for (const c of CORPUS) {
      const g = grayFrames(path.join(out, c.name));
      check(`the fixture ${c.name} carries its frame numbers (${g.length} frames, each its own number)`, g.length === SECONDS * c.fps && g.every((n, i) => n === i), { frames: g.length, wrong: g.map((n, i) => [i, n]).filter(([i, n]) => i !== n).slice(0, 5) });
    }

    await esbuild.build({ entryPoints: [path.join(__dirname, 'fixtures', 'desktop-media.ts')], bundle: true, format: 'esm', platform: 'browser', target: 'es2022', outfile: path.join(out, 'media.js'), logLevel: 'silent', absWorkingDir: h.root });
    const page = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>وسائط</title></head><body>
      <input type="file" id="corpus" multiple><script type="module" src="/media.js"></script></body></html>`;
    site = h.pages({
      '/': ['text/html; charset=utf-8', page],
      '/media.js': ['text/javascript; charset=utf-8', fs.readFileSync(path.join(out, 'media.js'), 'utf8')],
      '/upload': (req, res) => {
        const name = path.basename(new URL(req.url, 'http://x').searchParams.get('name') || 'x.bin');
        const w = fs.createWriteStream(path.join(out, name));
        req.pipe(w);
        w.on('finish', () => (res.writeHead(200), res.end()));
      },
    });
    await h.listen(site.server, 3000);

    const { app, win, data } = await h.launchDev('media');
    // the copies made in idle time wait (D12): this check makes its copies by asking
    await app.evaluate(({ powerMonitor }) => void powerMonitor.emit('speed-limit-change', { limit: 50 }));
    await h.until(() => win.url() === 'http://127.0.0.1:3000/', 20000);
    await win.waitForLoadState('load');
    await win.waitForFunction(() => typeof window.openCorpus === 'function');
    const bridge = await win.evaluate(() => ({ bridge: window.commsHubNative.bridge, media: Object.keys(window.commsHubNative.media || {}) }));
    check('the bridge is version 4 or later, with the media group', bridge.bridge >= 4 && ['probe', 'copies', 'proxy', 'convert', 'cancel', 'onProgress'].every((m) => bridge.media.includes(m)), bridge);
    await win.setInputFiles('#corpus', CORPUS.map((c) => path.join(out, c.name)));
    const opened = await win.evaluate(() => window.openCorpus());
    result.opened = opened;
    const byName = Object.fromEntries(opened.map((o) => [o.name, o]));
    const folder = path.join(data, 'StudioCache');

    // The corpus opens in the studio: as it is, or converted by the application.
    result.converted = {};
    for (const c of CORPUS) {
      const o = byName[c.name];
      const direct = o.state && o.state.kind === 'ready' && !(o.tools && o.tools.audioUnsupported);
      const offered = !direct && o.tools && o.tools.convertible;
      note(`${c.name}: the browser ${direct ? 'decodes it as it is' : o.tools && o.tools.audioUnsupported ? 'decodes its picture but not its sound' : 'cannot decode it'}; ${offered ? 'the application offers «تحويل إلى نسخة قابلة للتحرير»' : 'nothing offered'}.`);
      if (!direct) {
        check(`${c.name}: what the browser cannot decode is offered for conversion`, offered, o);
        const r = await win.evaluate((name) => window.convert(name), c.name);
        result.converted[c.name] = r;
        const name = fs.readdirSync(folder).find((f) => f.startsWith('convert-') && !f.endsWith('.part') && !Object.values(result.converted).some((x) => x.file === f));
        r.file = name;
        const p = name ? probe(path.join(folder, name)) : null;
        const v = p && videoOf(p);
        const a = p && audioOf(p);
        r.probe = p && { video: `${v.codec_name} ${v.width}x${v.height} ${v.pix_fmt}`, frames: Number(v.nb_read_frames), audio: a ? a.codec_name : null };
        check(`${c.name}: converted (${r.ms} ms) to an editable H.264 and AAC copy with every frame, and ready in the studio`, r.state && r.state.kind === 'ready' && r.tools && r.tools.converted && v && v.codec_name === 'h264' && (!a || a.codec_name === 'aac') && Number(v.nb_read_frames) === result.corpus[c.name].frames, r);
        const g = grayFrames(path.join(folder, name));
        check(`${c.name}: the converted copy's frames are the original's, in order`, g.length === result.corpus[c.name].frames && g.every((n, i) => n === i), { frames: g.length, wrong: g.map((n, i) => [i, n]).filter(([i, n]) => i !== n).slice(0, 5) });
      }
      if (c.name === 'xdcam.mxf') check('xdcam.mxf: the browser cannot read it at all, so it is added through the reading of the application, as the editor now does', o.viaApp && o.info && o.info.w === 1920 && o.info.h === 1080 && o.first === null, { viaApp: o.viaApp, info: o.info, first: o.first });
      // a time in the source names the frame shown from there: the original's first frame is where the browser reads it
      const first = o.first ?? 0;
      const f = await win.evaluate(({ name, times }) => window.frames(name, times), { name: c.name, times: timesFor(c.fps, 6, first) });
      const wrong = f.rows.filter((r) => r.exact !== Math.floor((r.at - first) * c.fps + 1e-6));
      check(`${c.name}: opens in the studio${o.viaApp ? ' (the browser does not take it as a video, so the application reads it to add it)' : ''}, and the frame read at each time is the frame that time names, from ${first} s (${f.rows.length} times)`, wrong.length === 0, { wrong: wrong.slice(0, 5), offset: f.offset, first });
    }

    // DT-12: a light copy of a heavy source; the preview reads it, the export the original.
    for (const name of ['gray-4k-h264.mp4', 'prores-422-4k.mov', 'camera-aac.mts']) {
      const c = CORPUS.find((x) => x.name === name);
      const before = await win.evaluate(({ n, at }) => window.frames(n, [at]), { n: name, at: (byName[name].first ?? 0) + 1.5 });
      const first = byName[name].first ?? 0;
      if (name !== 'camera-aac.mts') check(`${name}: heavy, so the light copy is offered first`, byName[name].tools && (byName[name].tools.heavy || (result.converted[name] && result.converted[name].tools.heavy)), byName[name].tools);
      const p = await win.evaluate((n) => window.proxy(n), name);
      result[`proxy ${name}`] = p;
      const proxyFile = fs.readdirSync(folder).find((f) => f.startsWith('proxy-') && f.includes('-720-') && !f.endsWith('.part') && p.inUse.includes(f));
      const pp = proxyFile ? probe(path.join(folder, proxyFile)) : null;
      const pv = pp && videoOf(pp);
      check(`${name}: «إنشاء نسخة خفيفة للمعاينة» made a 720p H.264 copy in ${p.ms} ms, kept from the sweep while the project is open`, p.tools && p.tools.proxy.kind === 'ready' && pv && pv.codec_name === 'h264' && pv.height === 720 && Number(pv.nb_read_frames) === result.corpus[name].frames, { tools: p.tools, proxyFile, probe: pv && `${pv.codec_name} ${pv.width}x${pv.height} ${pv.nb_read_frames}` });
      const times = timesFor(c.fps, 16, first);
      const f = await win.evaluate(({ n, times }) => window.frames(n, times), { n: name, times });
      const differ = f.rows.filter((r) => r.preview !== r.exact);
      const named = f.rows.filter((r) => r.exact !== Math.floor((r.at - first) * c.fps + 1e-6));
      result[`cuts ${name}`] = { times: f.rows.length, differ, named, offset: f.offset, elementSrc: f.elementSrc && f.elementSrc.replace(/[A-Za-z0-9_-]{43}$/, '<token>') };
      check(`DT-12, ${name}: at ${f.rows.length} times (frame middles and both edges) the preview's frame from the light copy is the export's frame from the original`, differ.length === 0 && named.length === 0 && f.rows.length >= 48, result[`cuts ${name}`]);
      check(`${name}: while playing, the clip's element plays the light copy`, /^commshub-file:\/\/cache\/proxy-/.test(f.elementSrc || '') && /^commshub-file:\/\/(local|cache)\//.test(before.elementSrc || '') && !/proxy-/.test(before.elementSrc || ''), { before: before.elementSrc && before.elementSrc.replace(/[A-Za-z0-9_-]{43}$/, '<token>'), after: f.elementSrc });
      const e = await win.evaluate((n) => window.exportFrom(n), name);
      result[`export ${name}`] = e;
      check(`${name}: the export (${e.frames} frames, ${e.ms} ms) took its frames from the ${result.converted[name] ? 'converted copy' : 'original'}'s decoder and never from the light copy's`, e.originalCalls > 0 && e.lightCalls === 0 && (result.converted[name] ? /^commshub-file:\/\/cache\/convert-/ : /^commshub-file:\/\/local\/<token>$/).test(e.originalUrl || '') && /^commshub-file:\/\/cache\/proxy-/.test(e.lightUrl || ''), e);
      const ex = path.join(out, `export-${name}.mp4`);
      const ep = probe(ex);
      const ev = videoOf(ep);
      const eg = grayFrames(ex);
      const shift = 1 * c.fps; // the clip starts one second into the source
      check(`${name}: the export passes ffprobe (1280x720, 100 frames, 4 s) and its frames are the source's own, in order`, ev && ev.width === 1280 && ev.height === 720 && Number(ev.nb_read_frames) === 100 && Math.abs(Number(ep.format.duration) - 4) < 0.1 && eg.length === 100 && eg.every((n, i) => n === shift + i), { probe: ev && `${ev.width}x${ev.height} ${ev.nb_read_frames}`, duration: ep.format.duration, wrong: eg.map((n, i) => [i, n]).filter(([i, n]) => n !== shift + i).slice(0, 5) });
    }

    // How fast, on a busy picture: the corpus is black with white boxes, which costs FFmpeg almost nothing.
    const speedFile = path.join(out, 'speed-prores-4k.mov');
    const SPEED_SECONDS = 10;
    if (!fs.existsSync(speedFile)) ff(['-f', 'lavfi', '-i', `testsrc2=size=3840x2160:rate=25:duration=${SPEED_SECONDS}`, '-f', 'lavfi', '-i', `sine=frequency=440:sample_rate=48000:duration=${SPEED_SECONDS}`, '-shortest', '-c:v', 'prores_ks', '-profile:v', '2', '-c:a', 'pcm_s24le', speedFile]);
    await win.setInputFiles('#corpus', [speedFile]);
    await win.evaluate(() => window.openCorpus());
    const sc = await win.evaluate((n) => window.convert(n), 'speed-prores-4k.mov');
    const sp = await win.evaluate((n) => window.proxy(n), 'speed-prores-4k.mov');
    result.speed = { source: `ProRes 422, 3840x2160, 25 fps, ${SPEED_SECONDS} s, ${fs.statSync(speedFile).size} bytes (testsrc2)`, convertMs: sc.ms, convertSpeed: Math.round((SPEED_SECONDS * 1000 * 100) / sc.ms) / 100, proxyMs: sp.ms, proxySpeed: Math.round((SPEED_SECONDS * 1000 * 100) / sp.ms) / 100 };
    check(`a busy 4K ProRes source: converted in ${sc.ms} ms (${result.speed.convertSpeed} times real time), then a light copy of it in ${sp.ms} ms (${result.speed.proxySpeed} times)`, sc.state && sc.state.kind === 'ready' && sc.tools && sc.tools.converted && sp.tools && sp.tools.proxy.kind === 'ready', result.speed);

    // A light copy cancelled leaves nothing; then quitting mid-copy leaves no FFmpeg running, and the next
    // start removes the .part. Both on a three-minute busy source, long enough to be caught in the middle.
    const longFile = path.join(out, 'long-1080p.mp4');
    if (!fs.existsSync(longFile)) ff(['-f', 'lavfi', '-i', 'testsrc2=size=1920x1080:rate=25:duration=180', '-c:v', 'libx264', '-preset', 'ultrafast', '-b:v', '20M', '-pix_fmt', 'yuv420p', longFile]);
    await win.setInputFiles('#corpus', [longFile]);
    await win.evaluate(() => window.openCorpus());
    const before = fs.readdirSync(folder).sort();
    const started = await win.evaluate((n) => window.startLongProxy(n), 'long-1080p.mp4');
    const cancelled = await win.evaluate((n) => window.cancelProxy(n), 'long-1080p.mp4');
    await h.sleep(500);
    const after = fs.readdirSync(folder).sort();
    check('a light copy cancelled while it is made leaves no file and no entry behind', started.making && cancelled.proxy.kind === 'failed' && cancelled.proxy.why === 'cancelled' && JSON.stringify(before) === JSON.stringify(after), { started, cancelled, added: after.filter((f) => !before.includes(f)) });
    const used = await win.evaluate(() => window.usage());
    result.folder = used && { library: used.library, proxy: used.proxy, files: used.files, entries: used.entries.map((x) => `${x.kind} ${x.name.replace(/[0-9a-f]{40}/, '<fingerprint>')} ${x.bytes}`) };
    note(`The cache folder after the corpus: ${JSON.stringify(result.folder)}`);

    const long = await win.evaluate((n) => window.startLongProxy(n), 'long-1080p.mp4');
    const partWhile = fs.readdirSync(folder).filter((f) => f.endsWith('.part'));
    const runningWhile = Number(ffmpegLeft());
    await Promise.race([app.close(), h.sleep(20000)]);
    await h.sleep(1500);
    const runningAfter = Number(ffmpegLeft());
    check('quitting while a light copy is made leaves no FFmpeg of the application running', long.making && partWhile.length === 1 && runningWhile >= 1 && runningAfter === 0, { long, partWhile, runningWhile, runningAfter });
    const again = await h.launchDev('media');
    await again.app.evaluate(({ powerMonitor }) => void powerMonitor.emit('speed-limit-change', { limit: 50 }));
    await h.until(() => again.win.url() === 'http://127.0.0.1:3000/', 20000);
    await h.sleep(1000);
    const partsAfter = fs.readdirSync(folder).filter((f) => f.endsWith('.part'));
    check('the next start removes what the interrupted copy left (its .part file)', partsAfter.length === 0, partsAfter);
    await again.app.close().catch(() => undefined);
  } catch (e) {
    check('the check ran to its end', false, String((e && e.stack) || e));
  } finally {
    await h.closeAll();
    site?.server.close();
    for (const f of fs.existsSync(out) ? fs.readdirSync(out) : []) if (f.startsWith('export-')) fs.rmSync(path.join(out, f), { force: true });
  }
  const failed = finish(path.join(__dirname, 'desktop-media.json'));
  process.exit(failed ? 1 : 0);
})();

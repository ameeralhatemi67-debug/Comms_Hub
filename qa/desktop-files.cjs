// Application check of files used in place and the cache folder (Desktop_App_Plan.md phase D4; DT-10 and DT-11
// of section 12; MVP_draft.md 63.3). It drives the development package on a fixture page at 127.0.0.1:3000 with
// the studio's own cache, media pool and export (qa/fixtures/desktop-files.ts):
//   DT-11: a video over 4 GB, made here by ffmpeg on this disk, chosen in the page's file field, is used where
//   it is: a token, no copy (the profile's private storage measured before and after), a frame decoded past
//   4 GB that matches ffmpeg's, and a piece of it exported and read back by ffprobe. The same project on a
//   device that never had the file shows it as «على هذا الجهاز فقط». A file changed after it was chosen is no
//   longer served; one let go of is no longer served, and stays where it was.
//   The cache folder: a library version copied by the application with the page's own session cookie, read
//   from the folder; refused when the site refuses (401); the size limit; clearing what is not in use.
//   An export written straight to a file handle, with no temporary copy.
//   «مسح بيانات هذا الجهاز» (D-11): tokens, the folder's copies, the private storage and the session cookie,
//   all gone, and the window back at its start.
// Usage: node qa/desktop-files.cjs   (writes qa/desktop-files.json)   Needs: npm run pack:dev, ffmpeg, 5 GB on D:.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const esbuild = require('esbuild');
const h = require('./desktop-helpers.cjs');

const { check, note, result, finish } = h.record('qa/desktop-files.cjs');
const out = path.join(__dirname, 'artifacts', 'desktop-files');
const BIG = path.join(out, 'big-over-4gb.mp4');
const SMALL = path.join(out, 'small.mp4');
const LIB = path.join(out, 'library.mp4');
const ASSET = '0a1b2c3d-0000-4000-8000-00000000abcd';
const GiB4 = 4 * 1024 ** 3;

const ff = (args) => {
  const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', ...args], { encoding: 'utf8', maxBuffer: 1 << 24 });
  if (r.status !== 0) throw new Error(`ffmpeg: ${r.stderr}`);
};
function makeMedia() {
  fs.mkdirSync(out, { recursive: true });
  if (!fs.existsSync(BIG) || fs.statSync(BIG).size <= GiB4 + 1e8) {
    // testsrc2 at a constant 120 Mbit/s for five minutes: about 4.5 GB
    ff(['-f', 'lavfi', '-i', 'testsrc2=size=1920x1080:rate=30:duration=300', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=300',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-x264-params', 'nal-hrd=cbr', '-b:v', '120M', '-minrate', '120M', '-maxrate', '120M', '-bufsize', '120M', '-pix_fmt', 'yuv420p', '-g', '30', '-c:a', 'aac', '-b:a', '128k', BIG]);
  }
  ff(['-f', 'lavfi', '-i', 'color=c=orange:s=320x180:r=30:d=2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', SMALL]);
  if (!fs.existsSync(LIB)) ff(['-f', 'lavfi', '-i', 'color=c=blue:s=640x360:r=30:d=5', '-f', 'lavfi', '-i', 'sine=frequency=880:sample_rate=48000:duration=5', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', LIB]);
}
const frameColour = (file, t) => [...spawnSync('ffmpeg', ['-v', 'error', '-ss', String(t), '-i', file, '-frames:v', '1', '-vf', 'scale=1:1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 1 << 20 }).stdout.subarray(0, 3)];
const probe = (file) => JSON.parse(spawnSync('ffprobe', ['-v', 'error', '-count_packets', '-show_entries', 'stream=codec_type,width,height,nb_read_packets:format=duration', '-of', 'json', file], { encoding: 'utf8' }).stdout);
const near = (a, b, tol) => Array.isArray(a) && a.length === 3 && a.every((v, i) => Math.abs(v - b[i]) <= tol);
const sizeOf = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).reduce((n, e) => n + (e.isDirectory() ? sizeOf(path.join(dir, e.name)) : fs.statSync(path.join(dir, e.name)).size), 0) : 0);

function servePart(file, req, res) {
  const size = fs.statSync(file).size;
  const m = /bytes=(\d+)-(\d*)/.exec(req.headers.range || '');
  const from = m ? Number(m[1]) : 0;
  const to = m && m[2] ? Math.min(size - 1, Number(m[2])) : size - 1;
  res.writeHead(m ? 206 : 200, { 'content-type': 'video/mp4', 'content-length': to - from + 1, ...(m ? { 'content-range': `bytes ${from}-${to}/${size}` } : {}), 'accept-ranges': 'bytes' });
  fs.createReadStream(file, { start: from, end: to }).pipe(res);
}

(async () => {
  const seenCookies = [];
  let site;
  try {
    if (await h.portAnswers(3000)) throw new Error('something already answers on 127.0.0.1:3000');
    const t0 = Date.now();
    makeMedia();
    result.media = { big: fs.statSync(BIG).size, seconds: Math.round((Date.now() - t0) / 1000) };
    await esbuild.build({ entryPoints: [path.join(__dirname, 'fixtures', 'desktop-files.ts')], bundle: true, format: 'esm', platform: 'browser', target: 'es2022', outfile: path.join(out, 'files.js'), logLevel: 'silent', absWorkingDir: h.root });
    const page = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>ملفات</title></head><body>
      <input type="file" id="pick" accept="video/*"><input type="file" id="small" accept="video/*">
      <script>if (location.search.includes('login')) document.cookie = 'sb=session1; path=/';</script>
      <script type="module" src="/files.js"></script></body></html>`;
    site = h.pages({
      '/': ['text/html; charset=utf-8', page],
      '/files.js': ['text/javascript; charset=utf-8', fs.readFileSync(path.join(out, 'files.js'), 'utf8')],
      [`/api/media/${ASSET}/content`]: (req, res) => {
        seenCookies.push(req.headers.cookie || '');
        const v = new URL(req.url, 'http://x').searchParams.get('v');
        if (!/sb=session1/.test(req.headers.cookie || '') || v !== '1') {
          res.writeHead(401);
          return res.end();
        }
        servePart(LIB, req, res);
      },
      '/upload': (req, res) => {
        const name = path.basename(new URL(req.url, 'http://x').searchParams.get('name') || 'x.bin');
        const w = fs.createWriteStream(path.join(out, name));
        req.pipe(w);
        w.on('finish', () => (res.writeHead(200), res.end()));
      },
      '/change-small': (req, res) => {
        fs.appendFileSync(SMALL, Buffer.alloc(10));
        res.writeHead(204);
        res.end();
      },
    });
    await h.listen(site.server, 3000);

    // DT-11: over 4 GB, used where it is.
    const { app, win, data } = await h.launchDev('files');
    await h.until(() => win.url() === 'http://127.0.0.1:3000/', 20000);
    await win.waitForLoadState('load');
    await win.waitForFunction(() => typeof window.inPlace === 'function');
    await win.setInputFiles('#pick', BIG);
    await win.setInputFiles('#small', SMALL);
    const diskBefore = sizeOf(data);
    const AT = 290;
    const p = await win.evaluate((o) => window.inPlace(o), { at: AT, seconds: 5 });
    const diskAfter = sizeOf(data);
    result.inPlace = { ...p, diskBefore, diskAfter };
    check('DT-11: the file is over 4 GB', p.size > GiB4, p.size);
    check('DT-11: chosen in the page, it is given a token (43 characters), not copied', p.token && p.tokenLength === 43 && /^commshub-file:\/\/local\/[A-Za-z0-9_-]{43}$/.test(p.place || ''), { token: p.token, place: p.place });
    check('DT-11: the media pool reads it where it is and is ready', p.state && p.state.kind === 'ready', p.state);
    const ref = frameColour(BIG, AT + 1);
    result.inPlace.reference = ref;
    check(`DT-11: the frame at ${AT + 1} s, past 4 GB into the file, matches ffmpeg's decode of the same moment`, near(p.frame, ref, 12), { app: p.frame, ffmpeg: ref });
    const e = probe(path.join(out, 'in-place.mp4'));
    const v = e.streams.find((s) => s.codec_type === 'video');
    check('DT-11: five seconds from there export to a 1280x720 file of 150 frames', p.frames === 150 && v && v.width === 1280 && v.height === 720 && Number(v.nb_read_packets) === 150 && Math.abs(Number(e.format.duration) - 5) < 0.1, { frames: p.frames, probe: e });
    check('DT-11: no copy was made: the private storage grew by the export\'s own file only, and the profile on disk far less than the source', p.opfsAfter - p.opfsBefore <= p.exportBytes + 2e6 && diskAfter - diskBefore < p.exportBytes + 1e8 && diskAfter - diskBefore < p.size / 10, { opfsBefore: p.opfsBefore, opfsAfter: p.opfsAfter, exportBytes: p.exportBytes, diskBefore, diskAfter, source: p.size });
    note(`DT-11: profile on disk ${diskBefore} bytes before, ${diskAfter} after, for a ${p.size}-byte source; the export took ${p.exportMs} ms.`);

    const c = await win.evaluate(() => window.changedAndForgotten());
    check('a file changed after it was chosen is no longer served (410), the studio sees it as gone from this device', c.first === 'url' && c.changed === null && c.afterChange === 410, c);
    check('a file let go of is no longer served (404), and stays where it was on the disk', c.forgotten === 404 && fs.existsSync(SMALL), { forgotten: c.forgotten, onDisk: fs.existsSync(SMALL) });

    // Another device: a fresh profile never had the file.
    const other = await h.launchDev('files-elsewhere');
    await h.until(() => other.win.url() === 'http://127.0.0.1:3000/', 20000);
    await other.win.waitForLoadState('load');
    await other.win.waitForFunction(() => typeof window.elsewhere === 'function');
    const el = await other.win.evaluate((o) => window.elsewhere(o), { key: p.key, name: 'big-over-4gb.mp4', size: p.size });
    const editor = fs.readFileSync(path.join(h.root, 'src', 'components', 'studio', 'editor.tsx'), 'utf8');
    check('the same project on another device: the file is «على هذا الجهاز فقط» (the pool says missing on this device, and the editor says so)', el.state && el.state.kind === 'missing' && el.state.why === 'device' && editor.includes("s.why === 'device' ? 'هذا الملف على جهاز آخر («على هذا الجهاز فقط» حيث أُضيف)، فلا يُعرض هنا.'"), el);
    await other.app.close().catch(() => undefined);

    // The cache folder.
    await win.goto('http://127.0.0.1:3000/?login');
    await win.waitForFunction(() => typeof window.library === 'function');
    const L = await win.evaluate((o) => window.library(o), { asset: ASSET, version: 1 });
    result.library = { ...L, cookies: seenCookies.slice() };
    check('a library version is copied into the application\'s folder and read from there', /^commshub-file:\/\/cache\/asset-0a1b2c3d-0000-4000-8000-00000000abcd-v1\.bin$/.test(L.place || '') && L.state && L.state.kind === 'ready' && near(L.frame, [0, 0, 255], 40), L);
    check('the copy is fetched with the page\'s own session cookie, as the page would fetch it', seenCookies.length > 0 && seenCookies.every((x) => /sb=session1/.test(x)), seenCookies);
    check('when the site refuses (401) the copy is refused too, and the studio says the file is not open to this person', L.denied === 'denied', L.denied);
    check('the folder is counted: one copy, the default folder, no limit yet', L.folder && L.folder.files === 1 && L.folder.isDefault === true && L.folder.limit === 0 && L.folder.library > 0, L.folder);
    const lc = await win.evaluate((o) => window.limitAndClear(o), { inUse: [`asset-${ASSET}-v1`] });
    check('the size limit is kept, and clearing spares what the open project uses, then clears the rest', lc.limit === 10e9 && lc.keptInUse === 1 && lc.clearedNotInUse === 0 && lc.clearedAll === 1 && lc.filesAfter === 0, lc);
    const st = await win.evaluate((o) => window.straightToFile(o), { asset: ASSET, version: 1 });
    check('an export is written straight to the chosen file, with no temporary copy', st.frames === 90 && st.written === st.bytes && st.written > 0 && st.tempCopy === false, st);

    // «مسح بيانات هذا الجهاز».
    const before = await win.evaluate(async () => ({ cookie: document.cookie, usage: await window.commsHubNative.cache.usage() }));
    const cleared = await win.evaluate(() => window.commsHubNative.data.clear());
    await h.until(() => win.url() === 'http://127.0.0.1:3000/', 15000);
    await win.waitForLoadState('load');
    const afterClear = await win.evaluate(async () => {
      const root = await navigator.storage.getDirectory();
      let entries = 0;
      for await (const _ of root.entries()) entries++;
      return { cookie: document.cookie, usage: await window.commsHubNative.cache.usage(), opfsEntries: entries };
    });
    const tokenAfter = await win.evaluate((t) => window.commsHubNative.files.check(t).catch((e) => String(e)), p.place.split('/').pop());
    result.clear = { before: { cookie: before.cookie, files: before.usage.files }, cleared, after: { cookie: afterClear.cookie, files: afterClear.usage.files, opfsEntries: afterClear.opfsEntries }, tokenAfter };
    check('«مسح بيانات هذا الجهاز»: the session cookie, the private storage, the folder\'s copies and every token are gone, and the window is back at its start', before.cookie.includes('sb=session1') && afterClear.cookie === '' && afterClear.opfsEntries === 0 && afterClear.usage.files === 0 && tokenAfter && tokenAfter.ok === false && fs.existsSync(BIG), result.clear);
  } catch (e) {
    check('the check ran to its end', false, String((e && e.stack) || e));
  } finally {
    await h.closeAll();
    site?.server.close();
    for (const f of ['in-place.mp4']) fs.rmSync(path.join(out, f), { force: true });
  }
  const failed = finish(path.join(__dirname, 'desktop-files.json'));
  process.exit(failed ? 1 : 0);
})();

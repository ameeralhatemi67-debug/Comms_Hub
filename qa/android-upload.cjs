// The check of phase A7 of the Android application (Android_Build_Plan.md; MVP_draft.md 64.5): the camera, files
// shared in, and library uploads in the background, on the emulator, with the check package sa.commshub.app.qa. The
// page's own functions (src/lib/native/held.ts, src/components/native/phone-uploads.tsx) run on a fixture page at
// http://127.0.0.1:3000, which also answers the two site routes an upload uses (/api/media/upload-session and
// /api/media/complete) as the site would for a folder the person may add to. A stand-in of Google Drive's resumable
// protocol listens at http://127.0.0.1:3004/upload/, the check package's only other upload address; it drops the
// connection once in the middle. Nothing signs in and nothing reaches Google. In order:
//   1. bridge version 6 with capture, incoming and upload;
//   2. files shared in (from the check package's own provider: Android does not let the shell grant another
//      application's files) are held and «استلام ملفات» opens; the page
//      takes them once; a file address naming the application's own storage is refused;
//   3. the page reads a held file at /__app/file/<token>, whole and by a byte range, with the same bytes;
//   4. a large file is sent in the background with the application in the background: the stand-in receives every
//      byte (SHA-256 equal) after the dropped connection, the notice «جارٍ رفع الملفات» shows meanwhile, and the page
//      registers it (/api/media/complete with the Drive file's id) and links it to its work, then the application
//      forgets it;
//   5. an upload to another address, or of a file the application does not hold, is refused;
//   6. «تصوير»: the phone's camera application writes a photo into a held file.
// Usage: start the emulator read-only; build the check package (mobile: npm run build:qa); then
// node qa/android-upload.cjs (writes qa/android-upload.json).
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const esbuild = require('esbuild');
const { dependency } = require('./runtime.cjs');
const { _android } = dependency('playwright');
const h = require('./android-helpers.cjs');

const { check, result, note, finish } = h.record('qa/android-upload.cjs');
const out = path.join(__dirname, 'artifacts', 'android-upload');
const shot = (name) => h.screenshot(path.join(out, `${name}.png`));
const ours = () => (h.resumed() || '').startsWith(`${h.APP}/`);
const FOLDER = '0a4d4c6b-9e7f-4a2b-8c4d-0000000000f1';

async function webPage(device, ms = 60000) {
  const view = await device.webView({ pkg: h.APP }, { timeout: ms });
  return view.page();
}
let phone = null;
async function retake() {
  if (phone) await phone.close().catch(() => undefined);
  const [d] = await _android.devices({ omitDriverInstall: true });
  return d;
}
async function front(ms = 30000) {
  await h.until(() => ours(), 15000, 300);
  return webPage(phone, ms);
}
/** Runs in the application's page with a handle taken afresh, three tries (see qa/android-links.cjs). */
async function inPage(fn, arg) {
  for (let i = 0; ; i++) {
    try {
      const page = await front();
      return await page.evaluate(fn, arg);
    } catch (e) {
      if (i >= 2 || !/has been closed|Timeout|Execution context was destroyed/.test(String(e && e.message))) throw e;
      await h.sleep(1500);
      phone = await retake();
    }
  }
}

const page = () =>
  '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>رفع</title></head>' +
  '<body><div id="root"></div><script type="module" src="/upload.js"></script></body></html>';

/** The SHA-256 of a file QaFiles makes: the same xorshift, byte by byte. */
function made(size, seed) {
  let x = seed | 0 || 1;
  const hash = crypto.createHash('sha256');
  const buf = Buffer.alloc(65536);
  let left = size;
  while (left > 0) {
    const n = Math.min(buf.length, left);
    for (let i = 0; i < n; i++) {
      x ^= x << 13;
      x ^= x >>> 17;
      x ^= x << 5;
      buf[i] = x & 0xff;
    }
    hash.update(buf.subarray(0, n));
    left -= n;
  }
  return hash.digest('hex');
}

/** Google Drive's resumable protocol, as src/lib/media/upload.ts and UploadWorker.java use it. */
function driveStub() {
  const sessions = new Map();
  let puts = 0;
  let cut = 0;
  const server = http.createServer((req, res) => {
    const m = /^\/upload\/(\w+)$/.exec(req.url);
    const s = m && sessions.get(m[1]);
    if (!s || req.method !== 'PUT') {
      res.writeHead(404);
      return res.end();
    }
    const cr = req.headers['content-range'] || '';
    const range = () => (s.received > 0 ? { Range: `bytes=0-${s.received - 1}` } : {});
    if (/^bytes \*\/\d+$/.test(cr)) {
      req.resume();
      if (s.received === s.size) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ id: s.fileId }));
      }
      res.writeHead(308, range());
      return res.end();
    }
    const r = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(cr);
    puts++;
    const chunks = [];
    let got = 0;
    // Once, in the middle of the fourth piece, the connection is dropped, as a phone losing its network would.
    const dropAt = !cut && puts === 4 ? 3 * 1024 * 1024 : -1;
    req.on('data', (c) => {
      chunks.push(c);
      got += c.length;
      if (dropAt >= 0 && got >= dropAt && !cut) {
        cut = 1;
        s.cuts++;
        req.socket.destroy();
      }
    });
    req.on('end', () => {
      if (!r || Number(r[1]) !== s.received) {
        res.writeHead(308, range());
        return res.end();
      }
      const body = Buffer.concat(chunks);
      if (body.length !== Number(r[2]) - Number(r[1]) + 1) {
        res.writeHead(400);
        return res.end();
      }
      s.hash.update(body);
      s.received += body.length;
      s.pieces++;
      if (s.received === s.size) {
        s.sha = s.hash.digest('hex');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ kind: 'drive#file', id: s.fileId, name: s.name }));
      }
      res.writeHead(308, range());
      res.end();
    });
  });
  return {
    server,
    sessions,
    open(name, size) {
      const id = crypto.randomBytes(8).toString('hex');
      sessions.set(id, { name, size, received: 0, pieces: 0, cuts: 0, hash: crypto.createHash('sha256'), sha: null, fileId: `qa-drive-${id}` });
      return `http://127.0.0.1:3004/upload/${id}`;
    },
  };
}

(async () => {
  let site;
  let stub;
  let device;
  const asked = { session: [], complete: [] };
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  try {
    const qaApk = h.apkOf('qa');
    if (!qaApk) throw new Error('build the check package first (mobile: npm run build:qa)');
    if (!(await h.emulatorReady())) throw new Error('no emulator ready');
    result.device = { model: h.shell('getprop ro.product.model'), android: h.shell('getprop ro.build.version.release'), sdk: h.shell('getprop ro.build.version.sdk') };
    await esbuild.build({
      entryPoints: [path.join(__dirname, 'fixtures', 'android-upload.tsx')],
      bundle: true,
      format: 'esm',
      platform: 'browser',
      target: 'es2020',
      jsx: 'automatic',
      outfile: path.join(out, 'upload.js'),
      alias: { '@/lib/supabase/client': path.join(__dirname, 'fixtures', 'fake-push-supabase.ts') },
      define: { 'process.env.NODE_ENV': '"production"' },
      logLevel: 'silent',
      absWorkingDir: h.root,
    });
    const bundle = fs.readFileSync(path.join(out, 'upload.js'), 'utf8');
    const drive = driveStub();
    stub = drive.server;
    for (const port of [3000, 3004]) if (await h.portAnswers(port)) throw new Error(`something already answers on 127.0.0.1:${port}`);
    site = http.createServer((req, res) => {
      if (req.url === '/upload.js') {
        res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
        return res.end(bundle);
      }
      if (req.method === 'POST' && (req.url === '/api/media/upload-session' || req.url === '/api/media/complete')) {
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', () => {
          const j = JSON.parse(body || '{}');
          res.writeHead(200, { 'Content-Type': 'application/json' });
          if (req.url === '/api/media/upload-session') {
            asked.session.push(j);
            return res.end(JSON.stringify({ sessionUrl: drive.open(j.name, j.size) }));
          }
          asked.complete.push(j);
          res.end(JSON.stringify({ id: '0a4d4c6b-9e7f-4a2b-8c4d-0000000000a7' }));
        });
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(page());
    });
    await new Promise((r, j) => {
      site.once('error', j);
      site.listen(3000, '127.0.0.1', r);
    });
    await new Promise((r, j) => {
      stub.once('error', j);
      stub.listen(3004, '127.0.0.1', r);
    });
    h.adb(['uninstall', h.APP], { allowFail: true });
    h.adb(['install', '-r', qaApk]);
    h.adb(['reverse', 'tcp:3000', 'tcp:3000']);
    h.adb(['reverse', 'tcp:3004', 'tcp:3004']);
    h.shell(`pm grant ${h.APP} android.permission.POST_NOTIFICATIONS`, { allowFail: true });
    h.shell(`am start -W -n ${h.ACTIVITY}`);
    phone = await retake();
    device = phone;
    await front(60000);
    const bridge = await inPage(() => ({ bridge: window.commsHubNative.bridge, capture: typeof window.commsHubNative.capture?.take, incoming: typeof window.commsHubNative.incoming?.take, upload: ['start', 'status', 'cancel'].map((k) => typeof window.commsHubNative.upload?.[k]) }));
    check('1. bridge version 6 with capture (take), incoming (take) and upload (start, status, cancel)', bridge.bridge === 6 && bridge.capture === 'function' && bridge.incoming === 'function' && bridge.upload.every((t) => t === 'function'), bridge);

    // 2. shared in, from the check package's own provider of made files (QaFiles.java): Android does not let the shell
    // grant another application's files to this one. Only the application's own copy takes room on the emulator.
    const free = Number((/\s(\d+)\s+\d+%\s+\/data/.exec(h.shell('df -k /data', { allowFail: true })) || [])[1] || 0) * 1024;
    const MB = Math.max(64, Math.min(2048, Math.floor(free / 1048576 / 2) - 64));
    result.bigFile = { mb: MB, freeBefore: free };
    if (MB < 2048) note(`The large file was ${MB} MB, not the plan's 2 GB: the emulator had ${Math.round(free / 1048576)} MB free for the application's copy.`);
    const BIG = MB * 1048576;
    const bigSum = made(BIG, 4242);
    const smallSum = made(30, 7);
    const head = made(1024, 4242);
    const qaFile = (size, seed, name) => `content://${h.APP}.qafiles/${size}/${seed}/${name}`;
    // Android's `am` cannot put a list of addresses in an intent (SEND_MULTIPLE), so the two files come as two SENDs,
    // which the application reads through the same path.
    h.shell(`am start -n ${h.ACTIVITY} -a android.intent.action.SEND -t video/mp4 --eu android.intent.extra.STREAM ${qaFile(BIG, 4242, 'qa-big.mp4')}`);
    const atShare = await h.until(async () => ((await inPage(() => location.pathname).catch(() => '')) === '/share' ? true : null), 180000, 1500);
    h.shell(`am start -n ${h.ACTIVITY} -a android.intent.action.SEND -t text/plain --eu android.intent.extra.STREAM ${qaFile(30, 7, 'qa-small.txt')}`);
    await h.sleep(5000);
    await h.until(async () => ((await inPage(() => document.readyState).catch(() => '')) === 'complete' ? true : null), 30000, 1000);
    shot('01-share');
    const taken = await inPage(() => window.__qa.incoming());
    const again = await inPage(() => window.__qa.incoming());
    const big = taken.find((x) => x.name === 'qa-big.mp4');
    const small = taken.find((x) => x.name === 'qa-small.txt');
    check('2a. files shared in from another application are held, «استلام ملفات» opens, and the page takes them once', !!atShare && taken.length === 2 && !!big && big.size === BIG && !!small && again.length === 0, { atShare, taken, again });
    const copies = h.shell(`run-as ${h.APP} sh -c 'find cache/held -type f -exec sha256sum {} +' 2>/dev/null`, { allowFail: true });
    check('2b. the held copies have the bytes that were shared', copies.includes(bigSum) && copies.includes(smallSum), { copies, bigSum, smallSum });
    h.shell(`am start -n ${h.ACTIVITY} -a android.intent.action.SEND -t '*/*' --eu android.intent.extra.STREAM file:///data/data/${h.APP}/shared_prefs/held.xml`);
    await h.sleep(4000);
    const forged = await inPage(() => window.__qa.incoming());
    check('2c. a file address naming the application\'s own storage is refused', forged.length === 0, forged);

    // 3. read by the page
    const whole = await inPage((s) => window.__qa.read(s), small);
    const part = await inPage((b) => window.__qa.read(b, 'bytes=0-1023'), big);
    check('3. the page reads a held file at /__app/file/<token>, whole and by a byte range, with the same bytes', whole.status === 200 && whole.sha === smallSum && part.status === 206 && part.sha === head && part.contentRange === `bytes 0-1023/${big.size}`, { whole, part });

    // 4. in the background
    const started = await inPage(({ b, f }) => window.__qa.start(b, f, 'CH-7'), { b: big, f: FOLDER });
    check('4a. the page opens the session through the site for the folder, and the application takes the upload', !!started.id && asked.session.length === 1 && asked.session[0].folderId === FOLDER && asked.session[0].size === big.size, { started, session: asked.session });
    h.shell('input keyevent 3');
    const showing = await h.until(() => {
      const n = h.shell('dumpsys notification --noredact', { allowFail: true });
      return n.split('NotificationRecord(').some((r) => r.includes(`pkg=${h.APP}`) && r.includes('channel=uploads')) ? true : null;
    }, 30000, 1000);
    shot('02-uploading');
    const s = [...drive.sessions.values()][0];
    const arrived = await h.until(() => (s && s.sha ? true : null), 900000, 2000);
    check('4b. with the application in the background, every byte arrives after one dropped connection, with the same SHA-256', !!arrived && s.sha === bigSum && s.cuts === 1 && s.received === big.size, { sha: s && s.sha, want: bigSum, cuts: s && s.cuts, pieces: s && s.pieces });
    check('4c. the notice «جارٍ رفع الملفات» shows while it is sent', !!showing);
    h.shell(`am start -W -n ${h.ACTIVITY}`);
    await front();
    const registered = await h.until(async () => {
      const left = await inPage(() => window.__qa.status());
      const linked = await inPage(() => window.__rpc.filter((c) => c.name === 'work_asset_link'));
      return asked.complete.length && linked.length && !left.length ? { left, linked } : null;
    }, 60000, 2000);
    check('4d. the page registers it with the Drive file\'s id and links it to its work, and the application forgets it', !!registered && asked.complete[0].fileId === s.fileId && asked.complete[0].folderId === FOLDER && registered.linked[0].args.p_work === 'CH-7', { complete: asked.complete, registered });

    // 5. refused
    const refused = await inPage((t) => Promise.all([window.__qa.startRaw(t, 'https://evil.example/upload/x'), window.__qa.startRaw(t, 'https://www.googleapis.com.evil.example/upload/drive/x'), window.__qa.startRaw('f'.repeat(64), 'http://127.0.0.1:3004/upload/x')]), small.token);
    check('5. an upload to another address, or of a file the application does not hold, is refused', refused.every((x) => x === null), refused);

    // 6. the camera
    const shooting = inPage(() => window.__qa.capture('photo')).catch((e) => ({ error: String(e) }));
    const camera = await h.until(() => (!ours() ? h.resumed() : null), 15000, 500);
    await h.sleep(4000);
    h.shell('input keyevent 27');
    await h.sleep(3000);
    const done = await h.until(() => h.screenNodes().find((n) => /^(Done|OK|تم|حسناً)$/i.test(n.text) || /done|confirm|ok/i.test(n.desc) || /done_button|btn_done|confirm/i.test(n.id)), 15000, 1000);
    if (done) h.tap(done.x, done.y);
    shot('03-camera');
    const photo = await Promise.race([shooting, h.sleep(30000).then(() => ({ timeout: true }))]);
    if (photo && photo.token) {
      const shown = await inPage((p) => window.__qa.read(p), photo);
      check('6. «تصوير»: the phone\'s camera application writes a photo into a held file the page reads', photo.type === 'image/jpeg' && photo.size > 0 && /^صورة-\d{8}-\d{6}\.jpg$/.test(photo.name) && shown.status === 200, { camera, photo, shown });
    } else {
      check('6. «تصوير»: the phone\'s camera application writes a photo into a held file the page reads', false, { camera, photo, done: done && { text: done.text, id: done.id } });
    }
  } catch (e) {
    check('the check ran to its end', false, String(e && e.stack ? e.stack : e));
  } finally {
    try {
      h.adb(['reverse', '--remove', 'tcp:3000'], { allowFail: true });
      h.adb(['reverse', '--remove', 'tcp:3004'], { allowFail: true });
      h.adb(['uninstall', h.APP], { allowFail: true });
      note(`After the check: ${h.shell(`pm list packages ${h.APP}`, { allowFail: true }) || 'the check package is uninstalled'}`);
    } catch {
      // the emulator may be gone
    }
    if (phone) await phone.close().catch(() => undefined);
    if (site) site.close();
    if (stub) stub.close();
  }
  process.exitCode = finish(path.join(__dirname, 'android-upload.json')) ? 1 : 0;
})();

// Application check of «استيراد من بطاقة الكاميرا» (Desktop_Power_Ideas.md P-20, phase D12; MVP_draft.md 63.9). It drives the
// development package on a fixture page at 127.0.0.1:3000 with a folder shaped like a camera's card:
//   DCIM/100CANON/MVI_0001.MP4 and its .THM; PRIVATE/AVCHD/BDMV/STREAM/00000.MTS and 00001.MTS, one MPEG-TS recording of
//   over 1.9 GB split at a packet boundary as an AVCHD camera splits it, with its CLIPINF; a hidden folder, a macOS
//   resource file and a junction out of the card to a folder holding a video.
// Windows' two dialogs are answered inside the main process (the card, then the destination). Checked: the listing (two
// recordings, the split one as one, nothing hidden, nothing through the junction, no path told to the page); the copy
// verified, the joined recording byte for byte the original stream (SHA-256), tokens the page reads; the time per GB; a
// cancel, a part pulled out mid-copy and a destination on the card itself, each leaving no part file and no copy.
// Usage: node qa/desktop-card-import.cjs   (writes qa/desktop-card-import.json)   Needs: npm run pack:dev, a local
// ffmpeg (fixtures only), port 3000 free, about 7 GB free on the system disk (removed at the end).
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const h = require('./desktop-helpers.cjs');

const { check, note, result, finish } = h.record('qa/desktop-card-import.cjs');
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'comms-hub-card-qa-'));
const card = path.join(work, 'EOS_DIGITAL');
const outside = path.join(work, 'outside');
const SPLIT = 1.9e9;

const ff = (args) => {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-y', '-loglevel', 'error', ...args], { encoding: 'utf8', maxBuffer: 1 << 24 });
  if (r.status !== 0) throw new Error(`ffmpeg: ${r.stderr}`);
};
const sha = (file) => {
  const hash = crypto.createHash('sha256');
  const fd = fs.openSync(file, 'r');
  const buf = Buffer.alloc(8 << 20);
  for (let n; (n = fs.readSync(fd, buf, 0, buf.length, null)); ) hash.update(buf.subarray(0, n));
  fs.closeSync(fd);
  return hash.digest('hex');
};
/** Copies `from` bytes [start, end) of `src` into `dest`. */
function slice(src, dest, start, end) {
  const i = fs.openSync(src, 'r');
  const o = fs.openSync(dest, 'w');
  const buf = Buffer.alloc(8 << 20);
  for (let at = start; at < end; ) {
    const n = fs.readSync(i, buf, 0, Math.min(buf.length, end - at), at);
    fs.writeSync(o, buf, 0, n);
    at += n;
  }
  fs.closeSync(i);
  fs.closeSync(o);
}

function makeCard() {
  const stream = path.join(card, 'PRIVATE', 'AVCHD', 'BDMV', 'STREAM');
  fs.mkdirSync(path.join(card, 'DCIM', '100CANON'), { recursive: true });
  fs.mkdirSync(stream, { recursive: true });
  fs.mkdirSync(path.join(card, 'PRIVATE', 'AVCHD', 'BDMV', 'CLIPINF'), { recursive: true });
  fs.mkdirSync(path.join(card, '.Trashes'), { recursive: true });
  fs.mkdirSync(outside, { recursive: true });
  const mp4 = path.join(card, 'DCIM', '100CANON', 'MVI_0001.MP4');
  ff(['-f', 'lavfi', '-i', 'testsrc2=size=1920x1080:rate=25:duration=4', '-f', 'lavfi', '-i', 'sine=duration=4', '-shortest', '-c:v', 'libx264', '-preset', 'veryfast', '-c:a', 'aac', mp4]);
  fs.writeFileSync(path.join(card, 'DCIM', '100CANON', 'MVI_0001.THM'), 'thumb');
  fs.copyFileSync(mp4, path.join(card, 'DCIM', '100CANON', '._MVI_0001.MP4'));
  fs.copyFileSync(mp4, path.join(card, '.Trashes', 'deleted.mp4'));
  fs.copyFileSync(mp4, path.join(outside, 'private.mp4'));
  fs.writeFileSync(path.join(card, 'PRIVATE', 'AVCHD', 'BDMV', 'CLIPINF', '00000.CPI'), 'clip info');
  // one recording of over 1.9 GB as a camera writes it: an MPEG-TS stream, here a short stream repeated end to end
  const base = path.join(work, 'base.ts');
  ff(['-f', 'lavfi', '-i', 'testsrc2=size=1920x1080:rate=25:duration=10', '-f', 'lavfi', '-i', 'sine=duration=10', '-shortest', '-c:v', 'mpeg2video', '-q:v', '2', '-c:a', 'mp2', '-f', 'mpegts', base]);
  const whole = path.join(work, 'recording.mts');
  const one = fs.readFileSync(base);
  const fd = fs.openSync(whole, 'w');
  let size = 0;
  while (size < SPLIT + 150e6) {
    fs.writeSync(fd, one);
    size += one.length;
  }
  fs.closeSync(fd);
  // split where the camera would, at a 188-byte packet boundary past the card's size limit
  const at = Math.ceil(SPLIT / 188) * 188;
  slice(whole, path.join(stream, '00000.MTS'), 0, at);
  slice(whole, path.join(stream, '00001.MTS'), at, size);
  let linked = false;
  try {
    fs.symlinkSync(outside, path.join(card, 'PRIVATE', 'LINK'), 'junction');
    linked = true;
  } catch {
    linked = false;
  }
  return { mp4, whole, size, linked, mp4Sha: sha(mp4), wholeSha: sha(whole) };
}

(async () => {
  let site = null;
  try {
    if (!fs.existsSync(h.devExe)) throw new Error(`the development package is missing: ${h.devExe} (npm run pack:dev in desktop/)`);
    if (await h.portAnswers(3000)) throw new Error('something already answers on 127.0.0.1:3000; stop it and run again');
    const t0 = Date.now();
    const fx = makeCard();
    note(`The card took ${Math.round((Date.now() - t0) / 1000)} s to make: a recording of ${(fx.size / 1e9).toFixed(2)} GB split in two parts; the junction out of the card ${fx.linked ? 'was made' : 'could not be made'}.`);
    const page = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>بطاقة</title></head><body><script>
      window.__progress = [];
      window.commsHubNative.files.onCard((p) => window.__progress.push(p));
    </script></body></html>`;
    site = h.pages({ '/': ['text/html; charset=utf-8', page] });
    await h.listen(site.server, 3000);
    const { app, win } = await h.launchDev('card');
    await h.until(() => win.url() === 'http://127.0.0.1:3000/', 20000);
    await win.waitForLoadState('load');
    const answer = (paths) =>
      app.evaluate(({ dialog }, list) => {
        globalThis.__answers = list.slice();
        dialog.showOpenDialog = async () => {
          const next = globalThis.__answers.shift();
          return next ? { canceled: false, filePaths: [next] } : { canceled: true, filePaths: [] };
        };
      }, paths);
    const bridge = await win.evaluate(() => ({ bridge: window.commsHubNative.bridge, files: Object.keys(window.commsHubNative.files) }));
    check('the bridge is version 9 or later, with the card import', bridge.bridge >= 9 && ['importCard', 'copyCard', 'cancelCard', 'onCard'].every((m) => bridge.files.includes(m)), bridge);

    // the listing
    await answer([card]);
    const listed = await win.evaluate(() => window.commsHubNative.files.importCard());
    const view = JSON.stringify(listed);
    check('the card lists its two recordings, the split one as one of two parts, and nothing hidden, Windows\' own, a side file or through the junction', listed.items.length === 2 && listed.items.some((i) => i.name === 'MVI_0001.MP4' && i.parts === 1) && listed.items.some((i) => i.name === '00000.MTS' && i.parts === 2 && i.size === fx.size), listed);
    check('the page is told no place: not the card\'s, the folders\' or the Windows user name', !view.includes('\\\\') && !view.includes('PRIVATE') && !view.includes(os.userInfo().username) && listed.label === 'EOS_DIGITAL', { label: listed.label });

    // the copy, verified
    const dest = path.join(work, 'نسخ التصوير');
    fs.mkdirSync(dest);
    await answer([dest]);
    const start = Date.now();
    const copied = await win.evaluate((id) => window.commsHubNative.files.copyCard({ id, keys: ['c0', 'c1'] }), listed.id);
    const ms = Date.now() - start;
    const gb = (fx.size + fs.statSync(fx.mp4).size) / 1e9;
    result.timing = { ms, gb: Math.round(gb * 1000) / 1000, secondsPerGb: Math.round((ms / 1000 / gb) * 100) / 100, includes: 'reading the card, writing the copy, reading the copy back' };
    const files = fs.readdirSync(dest);
    check('both recordings are copied and verified: each named once it read back the same, no part file left', copied.results.every((r) => r.ok) && files.sort().join() === ['00000.MTS', 'MVI_0001.MP4'].sort().join(), { results: copied.results.map((r) => ({ key: r.key, ok: r.ok, why: r.why })), files });
    check('the joined recording is the camera\'s stream byte for byte (SHA-256), and the other file the card\'s', sha(path.join(dest, '00000.MTS')) === fx.wholeSha && sha(path.join(dest, 'MVI_0001.MP4')) === fx.mp4Sha);
    const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=format_name', '-of', 'csv=p=0', path.join(dest, '00000.MTS')], { encoding: 'utf8' }).stdout.trim();
    check('the joined recording is read as one MPEG-TS stream', probe === 'mpegts', probe);
    const tokens = copied.results.filter((r) => r.ok).map((r) => r.file.token);
    const reads = await win.evaluate(async (ts) => Promise.all(ts.map(async (t) => {
      const c = await window.commsHubNative.files.check(t);
      const r = c.ok ? await fetch(c.url, { headers: { Range: 'bytes=0-187' } }) : null;
      return { ok: c.ok, status: r && r.status, bytes: r ? (await r.arrayBuffer()).byteLength : 0 };
    })), tokens);
    check('the page gets a token for each copy, and reads it where it is', reads.length === 2 && reads.every((r) => r.ok && r.status === 206 && r.bytes === 188), reads);
    note(`Copied and verified ${result.timing.gb} GB in ${(ms / 1000).toFixed(1)} s: ${result.timing.secondsPerGb} s a GB on this laptop's disk (read, write, read back).`);

    // a cancel
    const dest2 = path.join(work, 'cancelled');
    fs.mkdirSync(dest2);
    await answer([card]);
    const again = await win.evaluate(() => window.commsHubNative.files.importCard());
    await answer([dest2]);
    await win.evaluate(() => (window.__progress = []));
    const cancelling = win.evaluate((id) => {
      const p = window.commsHubNative.files.copyCard({ id, keys: ['c1'] });
      const t = setInterval(() => {
        if (window.__progress.length) {
          clearInterval(t);
          window.commsHubNative.files.cancelCard(id);
        }
      }, 20);
      return p;
    }, again.id);
    const cancelled = await cancelling;
    check('a cancel mid-copy leaves no part file and no copy', cancelled.results[0].ok === false && cancelled.results[0].why === 'cancelled' && fs.readdirSync(dest2).length === 0, { results: cancelled.results, left: fs.readdirSync(dest2) });

    // the card pulled out while its first part is copied: the second part goes
    const dest3 = path.join(work, 'pulled');
    fs.mkdirSync(dest3);
    await answer([card]);
    const third = await win.evaluate(() => window.commsHubNative.files.importCard());
    await answer([dest3]);
    await win.evaluate(() => (window.__progress = []));
    const second = path.join(card, 'PRIVATE', 'AVCHD', 'BDMV', 'STREAM', '00001.MTS');
    const pulling = win.evaluate((id) => window.commsHubNative.files.copyCard({ id, keys: ['c1'] }), third.id);
    await h.until(async () => ((await win.evaluate(() => window.__progress.length)) ? true : null), 30000, 50);
    fs.renameSync(second, `${second}.away`);
    const pulled = await pulling;
    fs.renameSync(`${second}.away`, second);
    check('a part pulled out mid-copy fails that recording and leaves no part file and no copy', pulled.results[0].ok === false && ['gone', 'changed'].includes(pulled.results[0].why) && fs.readdirSync(dest3).length === 0, { results: pulled.results, left: fs.readdirSync(dest3) });

    // onto the card itself
    await answer([card]);
    const fourth = await win.evaluate(() => window.commsHubNative.files.importCard());
    await answer([path.join(card, 'DCIM')]);
    const inside = await win.evaluate((id) => window.commsHubNative.files.copyCard({ id, keys: ['c0'] }), fourth.id);
    check('nothing is copied onto the card itself', inside.results[0].ok === false && inside.results[0].why === 'inside', inside.results);
    const refused = await win.evaluate(async (id) => {
      const out = [];
      for (const ask of [{ id, keys: ['c9'] }, { id, keys: [] }, { id: 'A'.repeat(43), keys: ['c0'] }, { id, keys: ['../x'] }, null]) out.push(await window.commsHubNative.files.copyCard(ask).then(() => 'copied', () => 'refused'));
      return out;
    }, fourth.id);
    check('a key not of this listing, an empty choice and another listing are refused', refused.every((r) => r === 'refused'), refused);
    await app.close().catch(() => undefined);
  } catch (e) {
    check('the check ran to its end', false, String((e && e.stack) || e));
  } finally {
    await h.closeAll();
    site?.server.close();
    fs.rmSync(work, { recursive: true, force: true });
  }
  const failed = finish(path.join(__dirname, 'desktop-card-import.json'));
  process.exit(failed ? 1 : 0);
})();

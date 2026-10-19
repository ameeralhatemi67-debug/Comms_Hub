// Phase 0 trial of the studio's media base (Studio_Build_Plan.md section 3): Mediabunny, pinned in
// package.json, runs in headless Edge over a local http server (the browser's private storage needs a
// secure origin, which file:// is not). The page draws 60 numbered frames and a 440 Hz tone, encodes them
// to MP4 (H.264 and AAC) straight into a file of the browser's private storage, reads that file back with
// Mediabunny, and hands it to ffprobe. A second run registers @mediabunny/aac-encoder (the fallback for
// browsers without native AAC) and checks that it encodes too.
// Usage: node qa/studio-trial.cjs   (writes qa/studio-trial.json and qa/artifacts/studio-trial/)
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { dependency, launchOptions } = require('./runtime.cjs');
const { chromium } = dependency('playwright');

const root = path.resolve(__dirname, '..');
const out = path.join(__dirname, 'artifacts', 'studio-trial');
const result = { script: 'qa/studio-trial.cjs', run: new Date().toISOString(), checks: [] };
const check = (name, pass, detail = '') => result.checks.push({ name, pass: Boolean(pass), detail: String(detail) });
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

const files = {
  '/mb.mjs': path.join(root, 'node_modules/mediabunny/dist/bundles/mediabunny.min.mjs'),
  '/aac.mjs': path.join(root, 'node_modules/@mediabunny/aac-encoder/dist/bundles/mediabunny-aac-encoder.min.mjs'),
};
const page = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<script type="importmap">{"imports":{"mediabunny":"/mb.mjs"}}</script></head><body><canvas id="c" width="640" height="360"></canvas>
<script type="module">
import * as mb from 'mediabunny';
window.trial = async (useExtension) => {
  if (useExtension) { const { registerAacEncoder } = await import('/aac.mjs'); registerAacEncoder(); }
  const report = { secure: isSecureContext };
  report.avc = await mb.canEncodeVideo('avc', { width: 640, height: 360 });
  report.aac = await mb.canEncodeAudio('aac');
  const dir = await navigator.storage.getDirectory();
  const name = useExtension ? 'trial-ext.mp4' : 'trial.mp4';
  const handle = await dir.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  const output = new mb.Output({ format: new mb.Mp4OutputFormat({ fastStart: false }), target: new mb.StreamTarget(writable, { chunked: true }) });
  const canvas = document.getElementById('c');
  const ctx = canvas.getContext('2d');
  const video = new mb.CanvasSource(canvas, { codec: 'avc', quality: mb.QUALITY_HIGH });
  const audio = new mb.AudioBufferSource({ codec: 'aac', quality: mb.QUALITY_MEDIUM });
  output.addVideoTrack(video, { frameRate: 30 });
  output.addAudioTrack(audio);
  await output.start();
  for (let i = 0; i < 60; i++) {
    ctx.fillStyle = 'hsl(' + (i * 6) + ' 70% 45%)'; ctx.fillRect(0, 0, 640, 360);
    ctx.fillStyle = '#fff'; ctx.font = '120px sans-serif'; ctx.fillText(String(i), 220, 230);
    await video.add(i / 30, 1 / 30);
  }
  const rate = 48000, buffer = new AudioBuffer({ length: rate * 2, numberOfChannels: 2, sampleRate: rate });
  for (let ch = 0; ch < 2; ch++) { const d = buffer.getChannelData(ch); for (let s = 0; s < d.length; s++) d[s] = 0.4 * Math.sin(2 * Math.PI * 440 * s / rate); }
  await audio.add(buffer);
  await output.finalize();
  const file = await handle.getFile();
  report.bytes = file.size;
  const input = new mb.Input({ source: new mb.BlobSource(file), formats: mb.ALL_FORMATS });
  report.duration = await input.computeDuration();
  const vt = await input.getPrimaryVideoTrack();
  report.videoCodec = vt.codec;
  let packets = 0; for await (const p of new mb.EncodedPacketSink(vt).packets()) packets++;
  report.packets = packets;
  const at = await input.getPrimaryAudioTrack();
  report.audioCodec = at && at.codec;
  const sink = new mb.CanvasSink(vt, { width: 160 });
  const still = await sink.getCanvas(1.0);
  report.stillAt1 = still ? Number(still.timestamp.toFixed(3)) : null;
  const bytes = new Uint8Array(await file.arrayBuffer());
  let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  report.base64 = btoa(bin);
  await dir.removeEntry(name);
  return report;
};
window.ready = true;
</script></body></html>`;

const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (url === '/') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); return res.end(page); }
  const file = files[url];
  if (!file) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': 'text/javascript' });
  fs.createReadStream(file).pipe(res);
});

function probe(file) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name,nb_frames,sample_rate,channels:format=duration', '-of', 'json', file]);
  if (r.status !== 0) return null;
  return JSON.parse(r.stdout.toString());
}

(async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch(launchOptions);
  const errors = [];
  try {
    const tab = await browser.newPage();
    tab.on('pageerror', (e) => errors.push(e.message));
    await tab.goto(base);
    await tab.waitForFunction(() => window.ready === true);
    for (const ext of [false, true]) {
      const label = ext ? 'with the AAC extension' : 'native';
      const r = await tab.evaluate((e) => window.trial(e), ext);
      const file = path.join(out, ext ? 'trial-ext.mp4' : 'trial.mp4');
      fs.writeFileSync(file, Buffer.from(r.base64, 'base64'));
      delete r.base64;
      check(`${label}: the page runs on a secure origin and the browser can encode H.264`, r.secure && r.avc, JSON.stringify({ secure: r.secure, avc: r.avc, aac: r.aac }));
      check(`${label}: the MP4 was written into the browser's private storage and read back`, r.bytes > 10000 && r.videoCodec === 'avc' && r.audioCodec === 'aac', `${r.bytes} bytes, ${r.videoCodec} + ${r.audioCodec}`);
      check(`${label}: Mediabunny reads back 60 video packets and a 2 s duration`, r.packets === 60 && Math.abs(r.duration - 2) < 0.05, `${r.packets} packets, ${r.duration} s`);
      check(`${label}: a frame is decoded at 1.0 s for a thumbnail`, r.stillAt1 !== null && Math.abs(r.stillAt1 - 1) < 0.04, String(r.stillAt1));
      const p = probe(file);
      const v = p && p.streams.find((s) => s.codec_type === 'video');
      const a = p && p.streams.find((s) => s.codec_type === 'audio');
      check(`${label}: ffprobe reads H.264 with 60 frames and AAC at 48 kHz stereo`, v && v.codec_name === 'h264' && Number(v.nb_frames) === 60 && a && a.codec_name === 'aac' && a.sample_rate === '48000' && a.channels === 2,
        p ? JSON.stringify(p.streams) : 'ffprobe failed');
      check(`${label}: ffprobe duration is 2 s within one frame`, p && Math.abs(Number(p.format.duration) - 2) <= 1 / 30 + 0.03, p && p.format.duration);
    }
    check('no page errors', errors.length === 0, errors.join(' | '));
  } finally {
    await browser.close();
    server.close();
  }
  const failed = result.checks.filter((c) => !c.pass);
  result.mediabunny = require(path.join(root, 'node_modules/mediabunny/package.json')).version;
  result.total = result.checks.length;
  result.passed = result.total - failed.length;
  result.failed = failed.length;
  fs.writeFileSync(path.join(__dirname, 'studio-trial.json'), JSON.stringify(result, null, 2));
  console.log(`${result.passed} of ${result.total} passed`);
  for (const f of failed) console.log('FAIL', f.name, '|', f.detail);
  process.exit(failed.length ? 1 : 0);
})();

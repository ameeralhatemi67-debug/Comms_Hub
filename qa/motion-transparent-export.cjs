// Run: node qa/motion-transparent-export.cjs        (no site sign-in needed: the export code is served directly from src/lib/motion)
// The transparent MOV used to hold PNG frames, which Windows players and most editors cannot open ("encoded in png format which
// isn't supported", 0xC00D5212). It is now ProRes 4444. This script runs the real export code in a real browser for the design the
// problem was reported on (rp-editorial, 1080p, 30 fps) and for a numbers design, then has ffmpeg decode the files.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { execFileSync } = require('node:child_process');
const ts = require('typescript');
const { dependency, launchOptions } = require('./runtime.cjs');
const { chromium } = dependency('playwright');
const libDir = path.join(__dirname, '..', 'src', 'lib', 'motion');
const out = path.join(__dirname, 'artifacts', 'motion-transparent'); fs.mkdirSync(out, { recursive: true });
const checks = [];
const check = (name, pass, detail = '') => { checks.push({ name, pass, detail }); if (!pass) throw new Error(`${name}: ${JSON.stringify(detail)}`); };

const page = `<!doctype html><meta charset="utf-8"><body><script type="module">
import { catalog } from '/lib/catalog.js'; import { exportDesign } from '/lib/export.js';
window.run = async (id, shortSide, fps) => {
  const g = catalog.find(c => c.id === id), t0 = performance.now(), seen = [];
  const r = await exportDesign(g, { ...g.defaults }, { format: 'mov', shortSide, fps, time: 0, keyColor: '#00ff00' }, new AbortController().signal, p => seen.push(p.phase));
  const buf = new Uint8Array(await r.blob.arrayBuffer()); let bin = ''; for (let i = 0; i < buf.length; i += 32768) bin += String.fromCharCode(...buf.subarray(i, i + 32768));
  return { b64: btoa(bin), name: r.name, method: r.method, frames: r.frames, w: r.w, h: r.h, seconds: (performance.now() - t0) / 1000, phases: [...new Set(seen)] };
};
window.ready = true;
</script>`;
const server = http.createServer((req, res) => {
  if (req.url === '/') { res.setHeader('content-type', 'text/html'); return res.end(page); }
  const name = req.url.replace(/^\/lib\//, '').split('?')[0], file = path.join(libDir, name.replace(/\.js$/, fs.existsSync(path.join(libDir, name)) ? '.js' : '.ts'));
  if (!fs.existsSync(file)) { res.statusCode = 404; return res.end(); }
  let body = fs.readFileSync(file, 'utf8'); if (file.endsWith('.ts')) body = ts.transpileModule(body, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  res.setHeader('content-type', 'text/javascript'); res.end(body);
});

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch(launchOptions), errors = [];
  try {
    const tab = await (await browser.newContext()).newPage();
    tab.on('pageerror', e => errors.push(String(e))); tab.on('console', m => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) errors.push(m.text()); });
    await tab.goto(base); await tab.waitForFunction('window.ready === true', null, { timeout: 30000 });
    const probe = file => JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name,codec_tag_string,profile,width,height,nb_read_frames,pix_fmt,r_frame_rate', '-of', 'json', file]).toString()).streams[0];
    const alphaStats = (file, at) => {
      const raw = path.join(out, 'frame.rgba'); execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', String(at), '-i', file, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgba', raw], { stdio: 'pipe' });
      const px = fs.readFileSync(raw); let clear = 0, solid = 0, partial = 0; for (let i = 3; i < px.length; i += 4) { if (px[i] === 0) clear++; else if (px[i] > 250) solid++; else partial++; }
      return { clear, solid, partial, total: px.length / 4 };
    };
    for (const [id, shortSide, fps] of [['rp-editorial', 1080, 30], ['arc-gauge', 720, 30]]) {
      const r = await tab.evaluate(([a, b, c]) => window.run(a, b, c), [id, shortSide, fps]);
      const file = path.join(out, r.name); fs.writeFileSync(file, Buffer.from(r.b64, 'base64'));
      const info = probe(file);
      check(`${id}: file name states transparent mov`, r.name.endsWith('_transparent.mov') && r.method === 'prores', r.name);
      check(`${id}: ProRes 4444 with an alpha pixel format`, info.codec_name === 'prores' && info.codec_tag_string === 'ap4h' && info.profile === '4444' && info.pix_fmt === 'yuva444p12le', info);
      check(`${id}: every frame is in the file`, Number(info.nb_read_frames) === r.frames && info.r_frame_rate === `${fps}/1`, { frames: info.nb_read_frames, expected: r.frames, rate: info.r_frame_rate });
      execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-f', 'null', '-'], { stdio: 'pipe' }); check(`${id}: complete decode without errors`, true);
      const stats = alphaStats(file, 2);
      check(`${id}: decoded frame has clear and solid pixels`, stats.clear > stats.total * .2 && stats.solid > 500, stats);
      if (id === 'rp-editorial') {
        execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=0x2a2a2a:s=1920x1080', '-ss', '2', '-i', file, '-filter_complex', '[0][1]overlay=format=auto,scale=960:-1', '-frames:v', '1', path.join(out, 'editorial-over-grey.png')], { stdio: 'pipe' });
      }
      checks[checks.length - 1].detail = { ...stats, megabytes: +(fs.statSync(file).size / 1e6).toFixed(1), exportSeconds: +r.seconds.toFixed(1) };
    }
    check('no console or page errors', errors.length === 0, errors);
  } finally { await browser.close(); server.close(); fs.writeFileSync(path.join(__dirname, 'motion-transparent-export.json'), JSON.stringify({ when: new Date().toISOString(), checks }, null, 2)); }
  console.log(checks.map(c => `${c.pass ? 'PASS' : 'FAIL'}  ${c.name}  ${typeof c.detail === 'string' ? c.detail : JSON.stringify(c.detail)}`).join('\n'));
})().catch(e => { console.error(e); process.exit(1); });

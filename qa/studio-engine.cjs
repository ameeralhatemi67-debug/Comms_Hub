// Browser check of the studio's engine (Studio_Build_Plan.md Phase 3; MVP_draft.md 62). The real
// src/lib/studio modules and the real motion renderers are bundled by esbuild (qa/fixtures/
// studio-engine.ts) and run in headless Edge over a local http server, which also plays the site's
// file route (/api/media/<id>/content with byte ranges), serves the template and brand files from
// public/motion and the shipped fonts. Media are made by ffmpeg with known colours: 6 s at 30 fps, two
// seconds each of red, green and blue, with a 1 kHz tone; and a magenta picture. The signed-in
// application cannot be driven by an agent; this checks the engine itself.
// Usage: node qa/studio-engine.cjs   (writes qa/studio-engine.json)
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { dependency, launchOptions } = require('./runtime.cjs');
const { chromium } = dependency('playwright');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
const out = path.join(__dirname, 'artifacts', 'studio-engine');
const result = { script: 'qa/studio-engine.cjs', run: new Date().toISOString(), checks: [] };
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

const ff = (args) => {
  const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', ...args]);
  if (r.status !== 0) throw new Error(`ffmpeg: ${r.stderr}`);
};
// two seconds each of red, green, blue at 30 fps, 640x360, H.264, with a 1 kHz tone
ff(['-f', 'lavfi', '-i', 'color=c=red:s=640x360:r=30:d=2', '-f', 'lavfi', '-i', 'color=c=lime:s=640x360:r=30:d=2', '-f', 'lavfi', '-i', 'color=c=blue:s=640x360:r=30:d=2',
  '-f', 'lavfi', '-i', 'sine=frequency=1000:sample_rate=48000:duration=6',
  '-filter_complex', '[0:v][1:v][2:v]concat=n=3:v=1:a=0[v]', '-map', '[v]', '-map', '3:a', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-g', '15', '-c:a', 'aac', '-shortest', path.join(out, 'rgb.mp4')]);
ff(['-f', 'lavfi', '-i', 'color=c=magenta:s=400x400:d=1', '-frames:v', '1', path.join(out, 'pic.png')]);

const IDS = { '00000000-0000-4000-8000-0000000000a1': 'rgb.mp4', '00000000-0000-4000-8000-0000000000a2': 'rgb.mp4', '00000000-0000-4000-8000-0000000000b1': 'pic.png' };
const fontDir = (pkg) => path.join(root, 'node_modules', '@fontsource', pkg);
const fontCss = [['ibm-plex-sans-arabic', '600'], ['reem-kufi', '600'], ['aref-ruqaa', '700']]
  .map(([pkg, w]) => fs.readFileSync(path.join(fontDir(pkg), `${w}.css`), 'utf8').replace(/url\(\.\/files\//g, `url(/fonts/${pkg}/`))
  .join('\n');

(async () => {
  await esbuild.build({
    entryPoints: [path.join(__dirname, 'fixtures', 'studio-engine.ts')],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    outfile: path.join(out, 'bundle.js'),
    logLevel: 'silent',
  });
  const page = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><style>${fontCss}</style></head><body><script type="module" src="/bundle.js"></script></body></html>`;
  const requests = [];
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    const send = (file, type) => {
      const data = fs.readFileSync(file);
      const range = req.headers.range;
      if (range) {
        const m = /bytes=(\d+)-(\d*)/.exec(range);
        const from = Number(m[1]);
        const to = Math.min(data.length - 1, m[2] ? Number(m[2]) : data.length - 1);
        res.writeHead(206, { 'content-type': type, 'content-range': `bytes ${from}-${to}/${data.length}`, 'content-length': to - from + 1, 'accept-ranges': 'bytes' });
        return res.end(data.subarray(from, to + 1));
      }
      res.writeHead(200, { 'content-type': type, 'content-length': data.length, 'accept-ranges': 'bytes' });
      res.end(data);
    };
    if (url.pathname === '/') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(page);
    }
    if (url.pathname === '/favicon.ico') {
      res.writeHead(204);
      return res.end();
    }
    if (url.pathname === '/bundle.js') return send(path.join(out, 'bundle.js'), 'text/javascript');
    if (url.pathname === '/__requests') {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify(requests));
    }
    const api = /^\/api\/media\/([0-9a-f-]+)\/content$/.exec(url.pathname);
    if (api && IDS[api[1]]) {
      requests.push(`${url.pathname}?v=${url.searchParams.get('v')} range=${req.headers.range ?? 'none'}`);
      return send(path.join(out, IDS[api[1]]), IDS[api[1]].endsWith('.png') ? 'image/png' : 'video/mp4');
    }
    if (url.pathname.startsWith('/media/')) return send(path.join(out, path.basename(url.pathname)), url.pathname.endsWith('.png') ? 'image/png' : 'video/mp4');
    if (url.pathname.startsWith('/motion/')) return send(path.join(root, 'public', url.pathname), 'image/png');
    const font = /^\/fonts\/([a-z-]+)\/(.+\.woff2?)$/.exec(url.pathname);
    if (font) return send(path.join(fontDir(font[1]), 'files', font[2]), 'font/woff2');
    res.writeHead(404);
    res.end();
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch(launchOptions);
  const errors = [];
  try {
    const tab = await browser.newPage();
    tab.on('pageerror', (e) => errors.push(e.message));
    tab.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    tab.on('requestfailed', (q) => errors.push(`request failed: ${q.url()} ${q.failure()?.errorText}`));
    tab.on('response', (q) => q.status() >= 400 && errors.push(`HTTP ${q.status()}: ${q.url()}`));
    await tab.exposeFunction('__noop', () => 0);
    await tab.goto(base);
    await tab.waitForFunction(() => typeof window.studioEngine === 'function', null, { timeout: 30000 });
    // the page reads the server's request log through a getter
    await tab.evaluate(() => {
      Object.defineProperty(window, '__requests', { get() { const x = new XMLHttpRequest(); x.open('GET', '/__requests', false); x.send(); return JSON.parse(x.responseText); } });
    });
    const r = await tab.evaluate(() => window.studioEngine());
    result.checks.push(...r.checks);
    result.log = r.log;
  } catch (e) {
    result.checks.push({ name: 'the fixture ran to its end', pass: false, detail: String(e && e.stack || e) });
  } finally {
    result.checks.push({ name: 'no page errors', pass: errors.length === 0, detail: errors.join(' | ') });
    await browser.close();
    server.close();
  }
  const failed = result.checks.filter((c) => !c.pass);
  result.total = result.checks.length;
  result.passed = result.total - failed.length;
  result.failed = failed.length;
  fs.writeFileSync(path.join(__dirname, 'studio-engine.json'), JSON.stringify(result, null, 2));
  console.log(`${result.passed} of ${result.total} passed`);
  for (const f of failed) console.log('FAIL', f.name, '|', f.detail);
  process.exit(failed.length ? 1 : 0);
})();

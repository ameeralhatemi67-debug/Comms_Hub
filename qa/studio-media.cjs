// Test media and a static server for the studio's browser fixtures (qa/studio-engine.cjs,
// qa/studio-ui.cjs). Media are made by ffmpeg with known colours, so frames can be checked by pixels:
// rgb.mp4 is 6 s at 30 fps, two seconds each of red, green and blue, 640x360 H.264, with a 1 kHz tone at
// 48 kHz; pic.png is a 400x400 magenta square. The server plays the site's file route
// (/api/media/<id>/content with byte ranges) and serves public/motion and the shipped fonts.
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const IDS = {
  '00000000-0000-4000-8000-0000000000a1': 'rgb.mp4',
  '00000000-0000-4000-8000-0000000000a2': 'rgb.mp4',
  '00000000-0000-4000-8000-0000000000b1': 'pic.png',
};

function makeMedia(dir) {
  const ff = (args) => {
    const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', ...args]);
    if (r.status !== 0) throw new Error(`ffmpeg: ${r.stderr}`);
  };
  ff(['-f', 'lavfi', '-i', 'color=c=red:s=640x360:r=30:d=2', '-f', 'lavfi', '-i', 'color=c=lime:s=640x360:r=30:d=2', '-f', 'lavfi', '-i', 'color=c=blue:s=640x360:r=30:d=2',
    '-f', 'lavfi', '-i', 'sine=frequency=1000:sample_rate=48000:duration=6',
    '-filter_complex', '[0:v][1:v][2:v]concat=n=3:v=1:a=0[v]', '-map', '[v]', '-map', '3:a', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-g', '15', '-c:a', 'aac', '-shortest', path.join(dir, 'rgb.mp4')]);
  ff(['-f', 'lavfi', '-i', 'color=c=magenta:s=400x400:d=1', '-frames:v', '1', path.join(dir, 'pic.png')]);
}

const fontDir = (pkg) => path.join(root, 'node_modules', '@fontsource', pkg);
function fontCss() {
  return [['ibm-plex-sans-arabic', '400'], ['ibm-plex-sans-arabic', '500'], ['ibm-plex-sans-arabic', '600'], ['ibm-plex-sans-arabic', '700'], ['reem-kufi', '600'], ['aref-ruqaa', '700']]
    .map(([pkg, w]) => fs.readFileSync(path.join(fontDir(pkg), `${w}.css`), 'utf8').replace(/url\(\.\/files\//g, `url(/fonts/${pkg}/`))
    .join('\n');
}

const TYPES = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html; charset=utf-8', '.png': 'image/png', '.mp4': 'video/mp4', '.woff2': 'font/woff2', '.woff': 'font/woff', '.json': 'application/json' };

/** A server for `dir` (bundle, pages), the file route, public/motion and the fonts. `pages` maps paths to HTML. */
function serve(dir, pages, requests = []) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    const send = (file) => {
      if (!fs.existsSync(file)) {
        res.writeHead(404);
        return res.end();
      }
      const data = fs.readFileSync(file);
      const type = TYPES[path.extname(file)] ?? 'application/octet-stream';
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
    const html = typeof pages === 'function' ? pages(url.pathname) : pages[url.pathname];
    if (html !== undefined) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(html);
    }
    if (url.pathname === '/favicon.ico') {
      res.writeHead(204);
      return res.end();
    }
    if (url.pathname === '/__requests') {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify(requests));
    }
    const api = /^\/api\/media\/([0-9a-f-]+)\/content$/.exec(url.pathname);
    if (api) {
      requests.push(`${url.pathname}?v=${url.searchParams.get('v')} range=${req.headers.range ?? 'none'}`);
      if (!IDS[api[1]]) {
        res.writeHead(404);
        return res.end();
      }
      return send(path.join(dir, IDS[api[1]]));
    }
    if (url.pathname.startsWith('/media/')) return send(path.join(dir, path.basename(url.pathname)));
    if (url.pathname.startsWith('/motion/')) return send(path.join(root, 'public', url.pathname));
    const font = /^\/fonts\/([a-z-]+)\/(.+\.woff2?)$/.exec(url.pathname);
    if (font) return send(path.join(fontDir(font[1]), 'files', font[2]));
    // globals.css starts with @import "tailwindcss", which the site's build resolves; here it is empty
    if (url.pathname === '/css/tailwindcss') {
      res.writeHead(200, { 'content-type': 'text/css' });
      return res.end('');
    }
    const css = /^\/css\/([a-z-]+\.css)$/.exec(url.pathname);
    if (css) return send(path.join(root, 'src', 'app', css[1]));
    return send(path.join(dir, path.basename(url.pathname)));
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, base: `http://127.0.0.1:${server.address().port}`, requests })));
}

module.exports = { IDS, makeMedia, fontCss, serve, root };

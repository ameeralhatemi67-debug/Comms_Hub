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

/**
 * A server for `dir` (bundle, pages), the file route, public/motion and the fonts. `pages` maps paths to
 * HTML (or is a function of the path). It also plays the library's upload routes as the site and Drive
 * answer them (/api/media/upload-session, a resumable PUT session, /api/media/complete, and the new
 * version pair), keeping each uploaded file in `dir` and serving it through the file route.
 */
function serve(dir, pages, requests = []) {
  const sessions = new Map();
  const assets = new Map();
  const body = (req) => new Promise((r) => { const parts = []; req.on('data', (c) => parts.push(c)); req.on('end', () => r(Buffer.concat(parts))); });
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const json = (code, o) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
    if (req.method === 'POST' && url.pathname === '/api/media/upload-session') {
      const b = JSON.parse((await body(req)).toString());
      const token = Math.random().toString(36).slice(2);
      sessions.set(token, { ...b, parts: [], got: 0 });
      return json(200, { sessionUrl: `http://${req.headers.host}/drive/${token}` });
    }
    const ver = /^\/api\/media\/([0-9a-f-]+)\/version(\/complete)?$/.exec(url.pathname);
    if (req.method === 'POST' && ver) {
      const b = JSON.parse((await body(req)).toString());
      if (!ver[2]) {
        const token = Math.random().toString(36).slice(2);
        sessions.set(token, { ...b, asset: ver[1], parts: [], got: 0 });
        return json(200, { sessionUrl: `http://${req.headers.host}/drive/${token}` });
      }
      const a = assets.get(ver[1]);
      const sess = sessions.get(b.fileId.replace('drive-', ''));
      a.current_version += 1;
      a.versions.push({ version: a.current_version, file: sess.file, note: b.note });
      IDS[ver[1]] = path.basename(sess.file);
      return json(200, { ok: true, version: a.current_version });
    }
    const drive = /^\/drive\/([a-z0-9]+)$/.exec(url.pathname);
    if (req.method === 'PUT' && drive) {
      const sess = sessions.get(drive[1]);
      const data = await body(req);
      const m = /bytes (\d+)-(\d+)\/(\d+)/.exec(req.headers['content-range'] || '');
      if (!sess || !m) return json(400, {});
      sess.parts.push(data);
      sess.got = Number(m[2]) + 1;
      if (sess.got < Number(m[3])) {
        res.writeHead(308, { Range: `bytes=0-${m[2]}` });
        return res.end();
      }
      const file = path.join(dir, `uploaded-${drive[1]}-${(sess.name || 'file').replace(/[^\w.]+/g, '_')}`);
      fs.writeFileSync(file, Buffer.concat(sess.parts));
      sess.file = file;
      return json(200, { id: `drive-${drive[1]}` });
    }
    if (req.method === 'POST' && url.pathname === '/api/media/complete') {
      const b = JSON.parse((await body(req)).toString());
      const sess = sessions.get(b.fileId.replace('drive-', ''));
      const id = require('node:crypto').randomUUID();
      const kind = (sess.mimeType || '').startsWith('image/') ? 'image' : 'video';
      assets.set(id, { id, name: sess.name, kind, current_version: 1, mime_type: sess.mimeType, dims: b.dims ?? null, duration: b.duration ?? null, stage: 'draft', approved_version: null, folder_id: b.folderId, versions: [{ version: 1, file: sess.file }] });
      IDS[id] = path.basename(sess.file);
      return json(200, { id });
    }
    const asset = /^\/__asset\/([0-9a-f-]+)$/.exec(url.pathname);
    if (asset) {
      const a = assets.get(asset[1]);
      if (!a) return json(404, null);
      const { versions, ...row } = a;
      return json(200, row);
    }
    if (url.pathname === '/__uploads') return json(200, [...assets.values()]);
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

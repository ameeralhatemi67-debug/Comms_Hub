// Browser check of thumbnails (MVP_draft.md section 77, Director_Notes_Plan.md N-4): the real components and the real browser half
// on a fixture page (qa/fixtures/thumbs-flow.tsx), with the database's client replaced by a recorder and the site's routes by this
// script's small server, because the pages need a signed-in person and no bypass is allowed.
//   1. The library's cards ask for each version's thumbnail and never for a whole file; a picture shows, a video carries its play
//      mark, a file with no picture keeps the library's coloured tile; the large video has its thumbnail as the poster.
//   2. A mail attachment shows its picture, and one with none shows the tile with its extension.
//   3. The browser draws a thumbnail of a large picture and of a real recorded video: WebP, 320 px at most, under 48 KB, the
//      video's frame really drawn; a text file and a broken video give none, quickly.
//   4. A file chosen on this device shows its picture before anything is sent.
//   5. An upload saves the thumbnail of the file it registered, as version 1, after the file is registered; a PDF saves none.
//   6. Evening, and no page error.
// What this cannot check: the database's rules (supabase/tests/thumbs_rules.sql), the route against a real Drive, and Drive's own
// thumbnails. Usage: node qa/thumbs-flow.cjs   (writes qa/thumbs-flow.json, screenshots in qa/artifacts/thumbs-flow/)
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const esbuild = require('esbuild');
const { dependency, launchOptions } = require('./runtime.cjs');
const { chromium } = dependency('playwright');
const h = require('./android-helpers.cjs');

const { check, finish } = h.record('qa/thumbs-flow.cjs');
const out = path.join(__dirname, 'artifacts', 'thumbs-flow');
const fixtures = path.join(__dirname, 'fixtures');
const css = ['globals', 'identity', 'media', 'kit', 'work', 'mail', 'chat']
  .map((f) => fs.readFileSync(path.join(h.root, 'src', 'app', `${f}.css`), 'utf8'))
  .join('\n')
  .replace(/@import[^;]+;/g, '')
  .replace(/@theme\{[^}]*\}/g, '');
const page = (dark) =>
  `<!doctype html><html lang="ar" dir="rtl" data-identity="emerald"${dark ? ' data-theme="dark"' : ''}><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>المصغّرات</title>` +
  `<style>${css}</style><style>body{font-family:"Segoe UI",Tahoma,sans-serif;background:var(--bg,#fff)}</style></head><body><div id="root"></div><script type="module" src="/flow.js"></script></body></html>`;
// A real picture to answer with: the site's own icon.
const PICTURE = fs.readFileSync(path.join(h.root, 'src', 'app', 'apple-icon.png'));
const WITH_PICTURE = new Set(['/api/thumb/media/a-img?v=2', '/api/thumb/media/a-vid?v=1', '/api/thumb/mail/m-pic']);

(async () => {
  let fixture;
  const errs = [];
  const seen = [];
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch(launchOptions);
  try {
    await esbuild.build({
      entryPoints: [path.join(fixtures, 'thumbs-flow.tsx')],
      bundle: true,
      format: 'esm',
      platform: 'browser',
      target: 'es2020',
      jsx: 'automatic',
      outfile: path.join(out, 'flow.js'),
      define: { 'process.env.NODE_ENV': '"production"' },
      logLevel: 'silent',
      absWorkingDir: h.root,
      plugins: [
        {
          name: 'stand-ins',
          setup(b) {
            b.onResolve({ filter: /^@\/lib\/supabase\/client$/ }, () => ({ path: path.join(fixtures, 'fake-thumbs.tsx') }));
            b.onResolve({ filter: /^next\/(navigation|link)$/ }, () => ({ path: path.join(fixtures, 'fake-next.tsx') }));
          },
        },
      ],
    });
    const bundle = fs.readFileSync(path.join(out, 'flow.js'), 'utf8');
    fixture = http.createServer((req, res) => {
      const url = req.url;
      seen.push(`${req.method} ${url}`);
      const json = (b, status = 200) => {
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(b));
      };
      if (url === '/flow.js') {
        res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
        return res.end(bundle);
      }
      if (url.startsWith('/api/thumb/')) {
        if (WITH_PICTURE.has(url)) {
          res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'private, max-age=31536000, immutable' });
          return res.end(PICTURE);
        }
        // No picture: an empty answer, as the route gives, so the tile takes its place without an error in the console.
        res.writeHead(204, { 'Cache-Control': 'private, max-age=600' });
        return res.end();
      }
      if (/^\/api\/media\/[^/]+\/content/.test(url)) {
        res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
        return res.end(Buffer.alloc(16));
      }
      if (url === '/api/media/upload-session') return json({ sessionUrl: '/drive-session' });
      if (url === '/drive-session') {
        req.resume();
        return req.on('end', () => json({ id: 'drive-file-0001' }));
      }
      if (url === '/api/media/complete') return json({ id: 'a-new' });
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(page(new URL(url, 'http://x').searchParams.has('dark')));
    });
    await new Promise((r) => fixture.listen(0, '127.0.0.1', r));
    const base = `http://127.0.0.1:${fixture.address().port}/`;
    const outside = [];
    const open = async (q = '') => {
      const ctx = await browser.newContext({ viewport: { width: 1060, height: 900 }, deviceScaleFactor: 2 });
      await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => {
        outside.push(r.request().url());
        return r.fulfill({ status: 404, body: '' });
      });
      const t = await ctx.newPage();
      t.on('pageerror', (e) => errs.push(String(e)));
      t.on('console', (m) => m.type() === 'error' && !/favicon/.test(m.text()) && errs.push(m.text()));
      await t.goto(`${base}${q}`);
      await t.locator('#cards [data-asset]').first().waitFor();
      return t;
    };
    const loaded = (t, sel) => t.evaluate((s) => [...document.querySelectorAll(s)].map((i) => i.complete && i.naturalWidth > 0), sel);

    // ---------- 1. the library's cards ----------
    const t = await open();
    await t.waitForFunction(() => document.querySelectorAll('#cards .fb').length === 2 && [...document.querySelectorAll('#cards img')].every((i) => i.complete));
    const asked = seen.filter((s) => s.startsWith('GET /api/thumb/media/'));
    check('each card asks for its version\'s thumbnail', ['a-img?v=2', 'a-vid?v=1', 'a-doc?v=1', 'a-aud?v=1'].every((x) => asked.includes(`GET /api/thumb/media/${x}`)), asked);
    const whole = seen.filter((s) => /\/api\/media\/a-(img|doc|aud)\/content/.test(s));
    check('no card asks for a whole file', whole.length === 0, whole);
    check('the picture and the video show their thumbnails', JSON.stringify(await loaded(t, '#cards [data-asset="a-img"] img, #cards [data-asset="a-vid"] img')) === '[true,true]');
    check('the video carries its play mark, the picture none', (await t.locator('#cards [data-asset="a-vid"] .fthumb-play').count()) === 1 && (await t.locator('#cards [data-asset="a-img"] .fthumb-play').count()) === 0);
    check('a file with no picture keeps the library\'s coloured tile', (await t.locator('#cards [data-asset="a-doc"] .fb').count()) === 1 && (await t.locator('#cards [data-asset="a-aud"] .fb').count()) === 1);
    const fill = await t.locator('#cards [data-asset="a-img"] img').evaluate((i) => {
      const r = i.getBoundingClientRect();
      const p = i.closest('.mx-thumb').getBoundingClientRect();
      return [Math.round(r.width) === Math.round(p.width), Math.round(r.height) === Math.round(p.height), getComputedStyle(i).objectFit];
    });
    check('a thumbnail fills its card, cropped to it', JSON.stringify(fill) === '[true,true,"cover"]', fill);
    check('the large video has its thumbnail as the poster', (await t.locator('#large video').getAttribute('poster')) === '/api/thumb/media/a-vid?v=1');

    // ---------- 2. mail ----------
    check('a mail attachment shows its picture', JSON.stringify(await loaded(t, '[data-mail="m-pic"] img')) === '[true]');
    const tile = await t.locator('[data-mail="m-none"] .fthumb.tile').innerText().catch(() => '');
    check('one with none shows the tile with its extension', tile.trim() === 'PDF', tile);
    await t.screenshot({ path: path.join(out, '01-cards.png') });

    // ---------- 3. the browser draws thumbnails ----------
    const big = await t.evaluate(async () => {
      const w = window;
      const r = await w.__makeThumb(await w.__bigPng());
      if (!r) return null;
      const bytes = Uint8Array.from(atob(r.data), (c) => c.charCodeAt(0));
      const img = new Image();
      img.src = `data:${r.mime};base64,${r.data}`;
      await img.decode();
      return { mime: r.mime, size: bytes.length, head: String.fromCharCode(...bytes.slice(0, 4)) + String.fromCharCode(...bytes.slice(8, 12)), w: img.naturalWidth, h: img.naturalHeight };
    });
    check('a large picture becomes a WebP of 320 by 180, under 48 KB', big && big.mime === 'image/webp' && big.head === 'RIFFWEBP' && big.w === 320 && big.h === 180 && big.size <= 48 * 1024, big);
    const vid = await t.evaluate(async () => {
      const w = window;
      const r = await w.__makeThumb(await w.__shortVideo());
      if (!r) return null;
      const img = new Image();
      img.src = `data:${r.mime};base64,${r.data}`;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const x = c.getContext('2d');
      x.drawImage(img, 0, 0);
      const [red, green, blue] = x.getImageData(Math.floor(c.width / 2), Math.floor(c.height / 2), 1, 1).data;
      return { mime: r.mime, w: img.naturalWidth, h: img.naturalHeight, red, green, blue };
    });
    check('a recorded video gives its frame, really drawn (red where it was red)', vid && vid.w === 320 && vid.h === 180 && vid.red > 150 && vid.green < 90 && vid.blue < 90, vid);
    const none = await t.evaluate(async () => {
      const w = window;
      const t0 = performance.now();
      const text = await w.__makeThumb(new Blob(['plain words'], { type: 'text/plain' }));
      const broken = await w.__makeThumb(new Blob([new Uint8Array(5000).fill(7)], { type: 'video/mp4' }));
      return { text, broken, ms: Math.round(performance.now() - t0) };
    });
    check('a text file and a broken video give none, without waiting long', none.text === null && none.broken === null && none.ms < 4000, none);

    // ---------- 4. a file chosen on this device ----------
    await t.evaluate(async () => window.__setPicked(await window.__bigPng()));
    await t.locator('[data-picked-thumb="local"] img').waitFor();
    check('a file chosen on this device shows its picture before anything is sent', JSON.stringify(await loaded(t, '[data-picked-thumb="local"] img')) === '[true]' && !seen.some((s) => s.includes('/api/thumb/') && s.includes('local')));

    // ---------- 5. an upload saves its thumbnail ----------
    const up = await t.evaluate(async () => {
      const w = window;
      const order = [];
      const real = window.fetch.bind(window);
      window.fetch = (input, init) => {
        order.push(String(input));
        return real(input, init);
      };
      const before = w.__rpc.length;
      const png = new File([await w.__bigPng()], 'غلاف.png', { type: 'image/png' });
      const id = await w.__upload(png, 'folder-1', () => undefined);
      const saves = w.__rpc.slice(before).filter((c) => c.name === 'thumb_save');
      const pdf = new File([new Uint8Array(3000)], 'تقرير.pdf', { type: 'application/pdf' });
      const n = w.__rpc.length;
      await w.__upload(pdf, 'folder-1', () => undefined);
      window.fetch = real;
      const s = saves[0];
      const head = s ? String.fromCharCode(...Uint8Array.from(atob(s.args.p_data), (c) => c.charCodeAt(0)).slice(0, 4)) : '';
      return {
        id,
        saves: saves.length,
        args: s && { asset: s.args.p_asset, version: s.args.p_version, mail: s.args.p_mail_file, mime: s.args.p_mime },
        head,
        lastFetch: order.filter((u) => !u.startsWith('blob:')).slice(0, 3),
        pdfSaves: w.__rpc.slice(n).filter((c) => c.name === 'thumb_save').length,
      };
    });
    check('an upload saves one thumbnail, for the file it registered, as version 1', up.id === 'a-new' && up.saves === 1 && JSON.stringify(up.args) === JSON.stringify({ asset: 'a-new', version: 1, mail: null, mime: 'image/webp' }) && up.head === 'RIFF', up);
    check('after the file is registered', JSON.stringify(up.lastFetch) === JSON.stringify(['/api/media/upload-session', '/drive-session', '/api/media/complete']), up.lastFetch);
    check('a PDF uploads with no thumbnail from the browser (the server asks Drive for one later)', up.pdfSaves === 0, up);
    await t.screenshot({ path: path.join(out, '02-picked.png') });
    await t.context().close();

    // ---------- 6. evening ----------
    const ev = await open('?dark');
    await ev.waitForFunction(() => [...document.querySelectorAll('#cards img')].every((i) => i.complete));
    const ink = await ev.locator('[data-mail="m-none"] .fthumb.tile').evaluate((e) => [getComputedStyle(e).color, getComputedStyle(e).backgroundColor]);
    check('evening: the tile is readable on its own ground', ink[0] !== ink[1], ink.join(' / '));
    await ev.screenshot({ path: path.join(out, '03-evening.png') });
    await ev.context().close();
    check('nothing was loaded from outside the fixture', outside.length === 0, outside);
    check('no page error and nothing in the console', errs.length === 0, errs.slice(0, 3).join(' | '));
  } catch (e) {
    check('the flow ran to its end', false, String(e.message ?? e).slice(0, 500));
  } finally {
    await browser.close();
    fixture?.close();
    finish(path.join(h.root, 'qa', 'thumbs-flow.json'));
  }
})();

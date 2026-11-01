// Browser check of the site's icon (MVP_draft.md 66.1), signed out, in Edge: the head names the icons, each answers as an
// image and is not sent to the sign-in page, and the browser really loads one. With no address it runs the production
// build on a port of its own, so a dev server left on 3000 changes nothing; given an address it checks that site, and
// also that the report's PDF files are served to the browser.
// Usage: npm run build; then node qa/site-icon.cjs [https://comms-hub-three.vercel.app]   (writes qa/site-icon.json)
const path = require('node:path');
const { spawn } = require('node:child_process');
const { dependency, launchOptions } = require('./runtime.cjs');
const { chromium } = dependency('playwright');
const h = require('./android-helpers.cjs');

const { check, finish } = h.record('qa/site-icon.cjs');
const PORT = 3197;
const given = process.argv[2];
const site = given ? given.replace(/\/$/, '') : `http://127.0.0.1:${PORT}`;

(async () => {
  const server = given ? null : spawn(process.execPath, [path.join(h.root, 'node_modules', 'next', 'dist', 'bin', 'next'), 'start', '-p', String(PORT), '-H', '127.0.0.1'], { cwd: h.root, env: { ...process.env, NODE_ENV: 'production' }, stdio: 'ignore' });
  const browser = await chromium.launch(launchOptions);
  try {
    if (server && !(await h.until(() => h.portAnswers(PORT), 60000, 500))) throw new Error('next start did not answer');
    const tab = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
    const refused = [];
    tab.on('console', (m) => /Content Security Policy|Refused to/.test(m.text()) && refused.push(m.text()));
    await tab.goto(`${site}/`);
    await tab.waitForLoadState('networkidle');
    const links = await tab.evaluate(() => [...document.querySelectorAll('link[rel="icon"], link[rel="apple-touch-icon"], link[rel="shortcut icon"]')].map((l) => ({ rel: l.rel, href: l.getAttribute('href').split('?')[0], type: l.type, sizes: l.getAttribute('sizes') })));
    check('the head names the icons on the page people land on', links.some((l) => l.href === '/favicon.ico') && links.some((l) => l.href === '/icon.svg') && links.some((l) => l.rel === 'apple-touch-icon'), links);
    for (const [url, type] of [['/favicon.ico', /icon/], ['/icon.svg', /svg/], ['/apple-icon.png', /png/]]) {
      const r = await fetch(`${site}${url}`, { redirect: 'manual' });
      const bytes = Buffer.from(await r.arrayBuffer());
      check(`${url} answers signed out, as an image, not the sign-in page`, r.status === 200 && type.test(r.headers.get('content-type') ?? '') && bytes.length > 500, { status: r.status, type: r.headers.get('content-type'), size: bytes.length });
    }
    const ico = Buffer.from(await (await fetch(`${site}/favicon.ico`)).arrayBuffer());
    check('favicon.ico holds five sizes, 16 to 64', ico.readUInt16LE(4) === 5, ico.readUInt16LE(4));
    const drawn = await tab.evaluate(async () => {
      const img = new Image();
      img.src = '/icon.svg';
      await img.decode();
      return img.naturalWidth > 0;
    });
    check('the browser draws it', drawn);
    if (given) {
      for (const url of ['/report/plex-arabic-400.woff', '/report/plex-arabic-700.woff', '/report/plex-latin-400.woff', '/report/plex-latin-700.woff', '/report/reem-kufi-600.woff', '/brand/comms-hub-logo-120.png']) {
        const r = await fetch(`${site}${url}`, { redirect: 'manual' });
        check(`${url} is served for the report's PDF`, r.status === 200 && (await r.arrayBuffer()).byteLength > 1000, r.status);
      }
      check('nothing on the page was refused by the site\'s Content-Security-Policy', refused.length === 0, refused);
    }
  } catch (e) {
    check('the check ran to its end', false, String(e && e.stack ? e.stack : e));
  } finally {
    await browser.close();
    if (server) server.kill();
  }
  process.exitCode = finish(path.join(__dirname, 'site-icon.json')) ? 1 : 0;
})();

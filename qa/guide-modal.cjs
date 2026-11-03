// Browser check of the circled "!" that opens the Google guide (src/components/setup-guide.tsx; MVP_draft.md section 67.5), in
// Edge: the real component with its real steps and pictures, served as the site serves them. It is the second place that draws the
// guide (the first is the setup sheet, qa/platforms-flow.cjs), so it must show the same parts: the actions in order, English set
// apart, the pictures loaded and inside the dialog, the copy boxes' values as text, nothing sideways, on a phone and in the evening.
// Usage: node qa/guide-modal.cjs   (writes qa/guide-modal.json, screenshots in qa/artifacts/guide-modal/)
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const esbuild = require('esbuild');
const { dependency, launchOptions } = require('./runtime.cjs');
const { chromium } = dependency('playwright');
const h = require('./android-helpers.cjs');

const { check, finish } = h.record('qa/guide-modal.cjs');
const out = path.join(__dirname, 'artifacts', 'guide-modal');
const css = ['globals', 'identity', 'media', 'kit', 'work', 'chat', 'auth', 'permissions']
  .map((f) => fs.readFileSync(path.join(h.root, 'src', 'app', `${f}.css`), 'utf8'))
  .join('\n')
  .replace(/@import[^;]+;/g, '')
  .replace(/@theme\{[^}]*\}/g, '');
const page = (dark) =>
  `<!doctype html><html lang="ar" dir="rtl" data-identity="emerald"${dark ? ' data-theme="dark"' : ''}><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>الخطوات</title>` +
  `<style>${css}</style><style>body{font-family:"Segoe UI",Tahoma,sans-serif}main{max-width:1120px;margin:auto;padding:16px}</style></head><body><div id="root"></div><script type="module" src="/flow.js"></script></body></html>`;

(async () => {
  const errs = [];
  let server;
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch(launchOptions);
  try {
    await esbuild.build({
      entryPoints: [path.join(__dirname, 'fixtures', 'guide-modal.tsx')],
      bundle: true,
      format: 'esm',
      platform: 'browser',
      target: 'es2020',
      jsx: 'automatic',
      outfile: path.join(out, 'flow.js'),
      define: { 'process.env.NODE_ENV': '"production"' },
      logLevel: 'silent',
      absWorkingDir: h.root,
    });
    const bundle = fs.readFileSync(path.join(out, 'flow.js'), 'utf8');
    server = http.createServer((req, res) => {
      const url = new URL(req.url, 'http://x');
      if (url.pathname.startsWith('/guides/')) {
        const file = path.join(h.root, 'public', path.normalize(url.pathname));
        if (!file.startsWith(path.join(h.root, 'public', 'guides')) || !fs.existsSync(file)) {
          res.writeHead(404);
          return res.end();
        }
        res.writeHead(200, { 'Content-Type': 'image/png' });
        return res.end(fs.readFileSync(file));
      }
      if (url.pathname === '/flow.js') {
        res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
        return res.end(bundle);
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(page(url.searchParams.has('dark')));
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const base = `http://127.0.0.1:${server.address().port}/`;

    const open = async (viewport, query = '') => {
      const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2 });
      const t = await ctx.newPage();
      t.on('pageerror', (e) => errs.push(String(e)));
      t.on('console', (m) => m.type() === 'error' && !/favicon/.test(m.text()) && errs.push(m.text()));
      await t.goto(base + query);
      await t.waitForSelector('dialog[open] .su-steps');
      return t;
    };
    // The pictures load as they come into view (loading="lazy"), so the check scrolls to each one, as a reader does.
    const loadAll = async (t) => {
      const n = await t.locator('dialog[open] .gd-shot').count();
      for (let i = 0; i < n; i++) await t.locator('dialog[open] .gd-shot').nth(i).scrollIntoViewIfNeeded();
      await t.waitForFunction(() => [...document.querySelectorAll('dialog[open] .gd-shot img')].every((e) => e.complete && e.naturalWidth > 0));
      await t.locator('dialog[open] .su-body').first().scrollIntoViewIfNeeded();
    };
    const fits = (t) => t.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1 && (() => { const d = document.querySelector('dialog[open]'); return d.scrollWidth <= d.clientWidth + 1; })());

    const t = await open({ width: 1056, height: 900 });
    await loadAll(t);
    const info = await t.evaluate(() => {
      const d = document.querySelector('dialog[open]');
      const steps = [...d.querySelectorAll('.su-steps > li')];
      const imgs = [...d.querySelectorAll('.gd-shot img')];
      const stray = [];
      const w = document.createTreeWalker(d.querySelector('.su-body'), NodeFilter.SHOW_TEXT);
      for (let n = w.nextNode(); n; n = w.nextNode()) if (!n.parentElement.closest('bdi') && /[A-Za-z]/.test(n.textContent)) stray.push(n.textContent.trim().slice(0, 40));
      const badge = (li) => getComputedStyle(li, '::before').content;
      return {
        steps: steps.length,
        todo: steps.map((li) => li.querySelectorAll('.gd-todo li').length),
        imgs: imgs.length,
        loaded: imgs.every((e) => e.naturalWidth > 0 && e.naturalWidth === Number(e.getAttribute('width'))),
        inside: imgs.every((e) => e.getBoundingClientRect().right <= d.getBoundingClientRect().right + 1 && e.getBoundingClientRect().left >= d.getBoundingClientRect().left - 1),
        raw: /`|«[^»]*[A-Za-z][^»]*»/.test(d.querySelector('.su-body').innerText.replace(/«[^»]*[؀-ۿ][^»]*»/g, '')),
        stray,
        // The step's own number and the actions inside it use two counters, so neither continues the other.
        outer: badge(steps[0]),
        inner: badge(steps[0].querySelector('.gd-todo li')),
        links: [...d.querySelectorAll('.su-link')].every((a) => a.target === '_blank' && a.rel === 'noopener noreferrer'),
        copies: d.querySelectorAll('.su-copy').length,
      };
    });
    await t.screenshot({ path: path.join(out, '01-modal.png') });
    check('the circled "!" draws the thirteen steps of the guide, each with its list of actions', info.steps === 13 && info.todo.every((n) => n >= 1), JSON.stringify(info.todo));
    check('and the nine pictures, loaded at their own size and inside the dialog', info.imgs === 9 && info.loaded && info.inside, JSON.stringify({ imgs: info.imgs, loaded: info.loaded, inside: info.inside }));
    check('English is isolated everywhere, and no mark («» or backtick) is left in the words', info.stray.length === 0 && !info.raw, JSON.stringify({ stray: info.stray, raw: info.raw }));
    check('a step keeps its own number, and the actions inside it count on their own', info.outer === 'counter(su)' && info.inner === 'counter(gd)', JSON.stringify({ outer: info.outer, inner: info.inner }));
    check('the links open in a new tab, safely', info.links);
    check('nothing sideways in the dialog', await fits(t));
    await t.evaluate(() => document.querySelector('dialog[open] .gd-shot').scrollIntoView());
    await t.screenshot({ path: path.join(out, '02-modal-picture.png') });
    await t.keyboard.press('Escape');
    check('Escape closes it', (await t.locator('dialog[open]').count()) === 0);
    await t.context().close();

    const m = await open({ width: 390, height: 844 });
    await loadAll(m);
    check('phone: nothing sideways in the dialog, pictures included', await fits(m));
    await m.locator('dialog[open] .gd-shot').nth(2).scrollIntoViewIfNeeded();
    await m.screenshot({ path: path.join(out, '03-phone.png') });
    await m.context().close();

    const d = await open({ width: 1056, height: 900 }, '?dark=1');
    const ink = await d.evaluate(() => { const c = document.querySelector('dialog[open] .gd-ui'); const s = getComputedStyle(c); return [s.backgroundColor, s.color, getComputedStyle(document.querySelector('dialog[open]')).backgroundColor]; });
    await d.screenshot({ path: path.join(out, '04-evening.png') });
    check('evening: a label chip is told from the dialog behind it', ink[0] !== ink[2] && ink[1] !== ink[0], ink.join(' / '));
    await d.context().close();

    // The Instagram guide (MVP_draft.md section 67.7): eight steps, twenty-two pictures from Meta's pages, drawn the same way.
    const ig = await open({ width: 1056, height: 900 }, '?guide=meta');
    await loadAll(ig);
    const igInfo = await ig.evaluate(() => {
      const d = document.querySelector('dialog[open]');
      const steps = [...d.querySelectorAll('.su-steps > li')];
      const imgs = [...d.querySelectorAll('.gd-shot img')];
      const stray = [];
      const w = document.createTreeWalker(d.querySelector('.su-body'), NodeFilter.SHOW_TEXT);
      for (let n = w.nextNode(); n; n = w.nextNode()) if (!n.parentElement.closest('bdi') && /[A-Za-z]/.test(n.textContent)) stray.push(n.textContent.trim().slice(0, 40));
      return {
        steps: steps.length,
        todo: steps.map((li) => li.querySelectorAll('.gd-todo li').length),
        imgs: imgs.length,
        loaded: imgs.every((e) => e.naturalWidth > 0 && e.naturalWidth === Number(e.getAttribute('width')) && e.naturalHeight === Number(e.getAttribute('height'))),
        inside: imgs.every((e) => e.getBoundingClientRect().right <= d.getBoundingClientRect().right + 1 && e.getBoundingClientRect().left >= d.getBoundingClientRect().left - 1),
        marks: [...d.querySelectorAll('.gd-seen')].map((e) => e.innerText.trim()),
        order: [...d.querySelectorAll('.gd-order')].map((e) => e.innerText),
        stray,
      };
    });
    await ig.screenshot({ path: path.join(out, '05-instagram.png') });
    check('the Instagram guide draws nine steps, the first five with a list of actions and pictures', igInfo.steps === 9 && igInfo.todo.slice(0, 5).join() === '3,5,5,5,5' && igInfo.todo[5] === 3 && igInfo.todo[6] === 3 && igInfo.todo[8] === 5, JSON.stringify(igInfo.todo));
    check('its eleven pictures load at their own size and sit inside the dialog', igInfo.imgs === 22 && igInfo.loaded && igInfo.inside, JSON.stringify({ imgs: igInfo.imgs, loaded: igInfo.loaded, inside: igInfo.inside }));
    check('the actions a picture shows say which picture (just "in the picture" when a step has one), and the pictures of a step are numbered out of its own count', igInfo.marks.length === 24 && igInfo.marks[0] === 'في الصورة 1' && igInfo.order.length === 22 && igInfo.order.includes('الصورة 4 من 4') && igInfo.order.filter((x) => /من 2$/.test(x)).length === 10 && igInfo.stray.length === 0, JSON.stringify(igInfo));
    check('its pictures say what their rings mean, the red one included', (await ig.locator('dialog[open] .gd-legend .gd-ring.x').count()) === 3 && (await ig.locator('dialog[open] .gd-legend .gd-ring').count()) >= 7);
    check('nothing sideways in the Instagram dialog', await fits(ig));
    await ig.context().close();
    const igm = await open({ width: 390, height: 844 }, '?guide=meta');
    await loadAll(igm);
    check('phone: the Instagram guide fits, pictures included', await fits(igm));
    await igm.context().close();

    check('no page error and nothing in the console', errs.length === 0, errs.slice(0, 3).join(' | '));
  } catch (e) {
    check('the flow ran to its end', false, String(e.message ?? e).slice(0, 500));
  } finally {
    await browser.close();
    server?.close();
  }
  process.exit(finish(path.join(__dirname, 'guide-modal.json')) ? 1 : 0);
})();

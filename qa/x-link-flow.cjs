// Browser check of X's link route (MVP_draft.md section 81), in Edge: the real send dialog and the real hand-off
// (qa/fixtures/x-link-flow.tsx) over a work on an X account on the link route, with stand-ins for the work provider and the database
// (fake-x-link.tsx), because the pages need a signed-in person and no bypass is allowed.
//   1. «نشر الآن»: the link account is said not to be simulated, the others are; what is sent is as it always was.
//   2. The hand-off: the text and its length as X counts it, the file with its download, X's composer with the text in the address
//      and no other parameter, the link box refusing what is not this account's post and sending what is, X's lookup as advice only,
//      «لم يُنشر».
//   3. Phone width; nothing loaded from outside the fixture; no page error.
// What this cannot check: the database's rules (supabase/tests/x_link_route_rules.sql), X itself, and the signed-in pages.
// Usage: node qa/x-link-flow.cjs   (writes qa/x-link-flow.json, screenshots in qa/artifacts/x-link-flow/)
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const esbuild = require('esbuild');
const { dependency, launchOptions } = require('./runtime.cjs');
const { chromium } = dependency('playwright');
const h = require('./android-helpers.cjs');

const { check, finish } = h.record('qa/x-link-flow.cjs');
const out = path.join(__dirname, 'artifacts', 'x-link-flow');
const fixtures = path.join(__dirname, 'fixtures');
const css = ['globals', 'identity', 'kit', 'work']
  .map((f) => fs.readFileSync(path.join(h.root, 'src', 'app', `${f}.css`), 'utf8'))
  .join('\n')
  .replace(/@import[^;]+;/g, '')
  .replace(/@theme\{[^}]*\}/g, '');
const page = () =>
  `<!doctype html><html lang="ar" dir="rtl" data-identity="emerald"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>النشر</title>` +
  `<style>${css}</style><style>body{font-family:"Segoe UI",Tahoma,sans-serif}main{max-width:1120px;margin:auto;padding:16px}</style></head><body><div id="root"></div><script type="module" src="/flow.js"></script></body></html>`;
const fits = (t) => t.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const acts = (t) => t.evaluate(() => window.__acts);
const closed = (t) => t.evaluate(() => window.__closed);
const GOOD = 'https://x.com/t_x/status/1234567890123456789';

(async () => {
  let fixture;
  const errs = [];
  let lookup = { found: true, author: 't_x' };
  const asked = [];
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch(launchOptions);
  try {
    const fake = path.join(fixtures, 'fake-x-link.tsx');
    await esbuild.build({
      entryPoints: [path.join(fixtures, 'x-link-flow.tsx')],
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
            b.onResolve({ filter: /^@\/lib\/supabase\/client$/ }, () => ({ path: fake }));
            b.onResolve({ filter: /^\.\/data$/ }, (a) => (a.importer.includes(`${path.sep}work${path.sep}`) ? { path: fake } : undefined));
            b.onResolve({ filter: /^next\/(navigation|link)$/ }, () => ({ path: path.join(fixtures, 'fake-next.tsx') }));
          },
        },
      ],
    });
    const bundle = fs.readFileSync(path.join(out, 'flow.js'), 'utf8');
    fixture = http.createServer((req, res) => {
      const url = new URL(req.url, 'http://x');
      if (url.pathname === '/flow.js') {
        res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
        return res.end(bundle);
      }
      if (url.pathname === '/api/platforms/x-post' && req.method === 'POST') {
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', () => {
          asked.push(JSON.parse(body || '{}').url);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(lookup));
        });
        return;
      }
      if (url.pathname.startsWith('/api/thumb/')) {
        res.writeHead(204);
        return res.end();
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(page());
    });
    await new Promise((r) => fixture.listen(0, '127.0.0.1', r));
    const base = `http://127.0.0.1:${fixture.address().port}/`;
    const outside = [];
    const open = async (view, viewport = { width: 1056, height: 1000 }) => {
      const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2 });
      await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => {
        outside.push(r.request().url());
        return r.fulfill({ status: 200, contentType: 'text/plain', body: 'outside' });
      });
      await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base.replace(/\/$/, '') }).catch(() => undefined);
      const t = await ctx.newPage();
      t.on('pageerror', (e) => errs.push(String(e)));
      t.on('console', (m) => m.type() === 'error' && !/favicon/.test(m.text()) && errs.push(m.text()));
      await t.goto(`${base}?view=${view}`);
      await t.locator('dialog[open], .wk-modal').first().waitFor();
      return t;
    };

    // ---------- 1. «نشر الآن» ----------
    const n = await open('now');
    const dialog = await n.locator('dialog[open]').innerText();
    check('the send dialog says the link account is not simulated, and what happens instead', dialog.includes('حساب X بالرابط لا يُحاكى') && dialog.includes('جارٍ النشر') && dialog.includes('تنشر منها على X بنفسك'), dialog.slice(0, 200));
    check('the simulation notice stays for the others', dialog.includes('محاكاة: لا يصل شيء إلى المنصات'));
    const rowsText = await n.locator('.wk-chanrow').allInnerTexts();
    check('the link account says «بالرابط: تنشر أنت» and the simulated one «جاهز»', rowsText[0].includes('بالرابط: تنشر أنت') && rowsText[1].includes('جاهز') && rowsText[2].includes('جاهز'), rowsText);
    await n.screenshot({ path: path.join(out, '01-now.png') });
    await n.getByRole('button', { name: 'نشر الآن' }).click();
    await n.waitForFunction(() => window.__acts.length > 0);
    const sent = (await acts(n))[0];
    check('what is sent is as it always was, and the message says where to finish', sent.fn === 'work_publish' && sent.args.p_op === 'now' && !('p_options' in sent.args) && sent.ok.includes('إكمال النشر على X'), sent);
    await n.context().close();

    // ---------- 2. the hand-off ----------
    const t = await open('handoff');
    const box = t.locator('.wk-xh');
    check('one hand-off, for the waiting account only', (await box.count()) === 1 && (await box.getAttribute('data-xh')) === 'x-link');
    const lead = await box.locator('.wk-xh-lead').innerText();
    check('it says nothing is sent to X and whose account to post from', lead.includes('لا يُرسل الموقع شيئاً إلى X') && lead.includes('@t_x'), lead);
    const text = await box.locator('[data-xh-step="text"] pre').innerText();
    check('the text to copy is the work\'s text', text.includes('افتتاح معرض هداية'), text);
    check('its length is counted as X counts it', (await box.locator('[data-xh-step="text"] small').innerText()).includes('/ 280'));
    await box.getByRole('button', { name: 'نسخ النص' }).click();
    check('copying says so', (await box.getByRole('button', { name: 'نُسخ النص' }).count()) === 1);
    const clip = await t.evaluate(() => navigator.clipboard.readText()).catch(() => null);
    check('and puts the whole text on the clipboard', clip === null || clip.includes('افتتاح معرض هداية'), clip);
    const file = box.locator('[data-xh-step="files"] li').first();
    check('the file is listed with a download at the approved version, recorded as a download', (await file.innerText()).includes('poster.png') && (await file.locator('a[download]').getAttribute('href')) === '/api/media/11111111-1111-4111-8111-111111111111/content?v=1&download=1');
    const open1 = box.locator('[data-xh-open]');
    check('the open-X button waits until the person says they are signed in as the account', (await open1.getAttribute('aria-disabled')) === 'true' && (await open1.getAttribute('href')) === null);
    await box.locator('[data-xh="signed"] input').check();
    const href = await open1.getAttribute('href');
    const u = new URL(href);
    check('X\'s composer opens in a new tab with the text in the address and no other parameter', u.origin + u.pathname === 'https://x.com/intent/tweet' && [...u.searchParams.keys()].join() === 'text' && u.searchParams.get('text').includes('افتتاح معرض هداية') && (await open1.getAttribute('target')) === '_blank' && (await open1.getAttribute('rel')).includes('noopener'), href);
    check('it says the files are added by hand in X', (await box.locator('[data-xh-step="open"] > small').innerText()).includes('أضف الملفات'));
    await t.screenshot({ path: path.join(out, '02-handoff.png') });

    const input = box.getByLabel('رابط المنشور على X');
    const confirmBtn = box.locator('[data-xh-confirm]');
    check('the confirm button waits for a link', await confirmBtn.isDisabled());
    await input.fill('https://example.com/t_x/status/1234567890123456789');
    await confirmBtn.click();
    check('a link that is not a post is refused in words, and nothing is sent', (await box.locator('.wk-err').innerText()).includes('ليس رابط منشور') && (await acts(t)).length === 0 && asked.length === 0);
    await input.fill('https://x.com/someone/status/1234567890123456789');
    await confirmBtn.click();
    check('a post of another account is refused, naming both', (await box.locator('.wk-err').innerText()).includes('@someone') && (await box.locator('.wk-err').innerText()).includes('@t_x') && (await acts(t)).length === 0);
    lookup = { found: true, author: 'someone_else' };
    await input.fill(GOOD);
    await confirmBtn.click();
    await box.locator('.wk-xh-note.bad').waitFor();
    check('X\'s lookup finding another author stops it, in words', (await acts(t)).length === 0 && (await box.locator('.wk-xh-note').innerText()).includes('لحساب @someone_else'));
    lookup = { found: false, author: null };
    await confirmBtn.click();
    await t.waitForFunction(() => window.__acts.length === 1);
    const conf = (await acts(t))[0];
    check('a post X does not find is advice only: it is confirmed with the link as typed, for this work and account', conf.fn === 'work_link_confirm' && conf.args.p_work === 'CH-601' && conf.args.p_account === 'x-link' && conf.args.p_url === GOOD && conf.args.p_ok === true, conf);
    check('the lookup was asked about the link only, twice', asked.length === 2 && asked.every((a) => a === GOOD), asked);
    check('the window closes after it', (await closed(t)) === 1);
    await t.context().close();

    lookup = { found: null, author: null };
    const t2 = await open('handoff');
    const b2 = t2.locator('.wk-xh');
    await b2.getByLabel('رابط المنشور على X').fill(' https://twitter.com/T_X/status/1234567890123456789?s=20 ');
    await b2.locator('[data-xh-confirm]').click();
    await t2.waitForFunction(() => window.__acts.length === 1);
    check('X not answering does not stop it either, and the link is sent trimmed', (await acts(t2))[0].args.p_url === 'https://twitter.com/T_X/status/1234567890123456789?s=20');
    await t2.context().close();

    const t3 = await open('handoff');
    await t3.locator('.wk-xh [data-xh-skip]').click();
    await t3.waitForFunction(() => window.__acts.length === 1);
    const skip = (await acts(t3))[0];
    check('«لم يُنشر» says so, with no link', skip.fn === 'work_link_confirm' && skip.args.p_ok === false && skip.args.p_url === null && skip.args.p_account === 'x-link', skip);
    await t3.context().close();

    // ---------- 3. the phone ----------
    const ph = await open('handoff', { width: 390, height: 844 });
    check('phone: nothing sideways in the hand-off', await fits(ph));
    await ph.screenshot({ path: path.join(out, '03-phone.png') });
    await ph.context().close();

    check('nothing was loaded from outside the fixture', outside.length === 0, outside);
    check('no page error and nothing in the console', errs.length === 0, errs.slice(0, 3).join(' | '));
  } catch (e) {
    check('the flow ran to its end', false, String(e.message ?? e).slice(0, 500));
  } finally {
    await browser.close();
    fixture?.close();
    finish(path.join(h.root, 'qa', 'x-link-flow.json'));
  }
})();

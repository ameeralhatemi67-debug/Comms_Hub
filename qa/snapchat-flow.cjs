// Browser check of Snapchat's setup in «المنصات» (MVP_draft.md section 84), in Edge: the real tab and sheet on the fixture of qa/platforms-flow.cjs (stand-ins for the
// database, because the signed-in pages cannot be driven by a check and no bypass is allowed). The guide is walked as the owner walked Snapchat on 2026-11-26.
//   1. The row: Snapchat is no longer a manual platform; it has a setup, and says so.
//   2. The sheet: nine steps in the order of the walk, each reachable from the list, each with its actions, and every picture loaded.
//   3. The return address is filled in from the site and offered to copy exactly; the secret is asked of nobody but the form, as a password.
//   4. The allowlist is a review step: its text to send names the client id and never the secret, and it holds nothing back.
//   5. English inside Arabic is isolated, and the pictures show no address, name, number or secret: each is a blurred file made by scripts/guide-shots.mjs.
//   6. A phone: nothing sideways. Evening: drawn from the theme. No page error.
// What this cannot check: Snap's own pages and API (nothing here has met them), the database (supabase/tests/snapchat_connection_rules.sql), and a signed-in session.
// Usage: node qa/snapchat-flow.cjs   (writes qa/snapchat-flow.json, screenshots in qa/artifacts/snapchat-flow/)
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const esbuild = require('esbuild');
const { dependency, launchOptions } = require('./runtime.cjs');
const { chromium } = dependency('playwright');
const h = require('./android-helpers.cjs');

const { check, finish } = h.record('qa/snapchat-flow.cjs');
const out = path.join(__dirname, 'artifacts', 'snapchat-flow');
const fixtures = path.join(__dirname, 'fixtures');
const css = ['globals', 'identity', 'media', 'kit', 'work', 'chat', 'auth', 'permissions']
  .map((f) => fs.readFileSync(path.join(h.root, 'src', 'app', `${f}.css`), 'utf8'))
  .join('\n')
  .replace(/@import[^;]+;/g, '')
  .replace(/@theme\{[^}]*\}/g, '');
const page = (dark) =>
  `<!doctype html><html lang="ar" dir="rtl" data-identity="emerald"${dark ? ' data-theme="dark"' : ''}><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>المنصات</title>` +
  `<style>${css}</style><style>body{font-family:"Segoe UI",Tahoma,sans-serif}main{max-width:1120px;margin:auto;padding:16px}</style></head><body><div id="root"></div><script type="module" src="/flow.js"></script></body></html>`;

const fits = (t) => t.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const row = (t) => t.locator('.pf-row[data-platform="snapchat"]');
const sheet = (t) => t.locator('dialog.pf-sheet[open]');
const STEPS = [
  ['account', 'سجّل الدخول بحساب سناب شات الذي سيملك الملف'],
  ['business', 'أنشئ حساب الأعمال في Ads Manager'],
  ['profile', 'أنشئ الملف العام'],
  ['dashboard', 'افتح «Business details»'],
  ['oauth', 'ابدأ تطبيق OAuth'],
  ['form', 'املأ نموذج التطبيق'],
  ['secret', 'احفظ السر فوراً'],
  ['keys', 'الصق المعرّف والسر'],
  ['allowlist', 'اطلب من Snap إضافة التطبيق'],
];
const open = (t, i) => t.evaluate((n) => document.querySelectorAll('dialog[open] .pf-step-btn')[n]?.click(), i);
const picturesLoaded = async (t) => {
  await t.evaluate(() => [...document.querySelectorAll('dialog[open] .pf-input img')].forEach((e) => e.scrollIntoView({ block: 'center' })));
  await t.waitForFunction(() => [...document.querySelectorAll('dialog[open] .pf-input img')].every((e) => e.complete && e.naturalWidth > 0));
  return t.evaluate(() => [...document.querySelectorAll('dialog[open] .pf-input img')].map((e) => e.getAttribute('src')));
};
const stray = (t) =>
  t.evaluate(() => {
    const c = document.querySelector('dialog[open] .pf-input .pf-card');
    const out = [];
    const w = document.createTreeWalker(c, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) if (!n.parentElement.closest('bdi, textarea, input, button') && /[A-Za-z]/.test(n.textContent)) out.push(n.textContent.trim().slice(0, 40));
    return out;
  });

(async () => {
  let fixture;
  const errs = [];
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch(launchOptions);
  try {
    const fake = path.join(fixtures, 'fake-platforms-flow.tsx');
    await esbuild.build({
      entryPoints: [path.join(fixtures, 'platforms-flow.tsx')],
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
            b.onResolve({ filter: /^\.\.\/caps$/ }, () => ({ path: fake }));
            b.onResolve({ filter: /^\.\/data$/ }, (a) => (a.importer.includes(`${path.sep}work${path.sep}`) ? { path: fake } : undefined));
            b.onResolve({ filter: /^next\/(navigation|link)$/ }, () => ({ path: path.join(fixtures, 'fake-next.tsx') }));
          },
        },
      ],
    });
    const bundle = fs.readFileSync(path.join(out, 'flow.js'), 'utf8');
    fixture = http.createServer((req, res) => {
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
    await new Promise((r) => fixture.listen(0, '127.0.0.1', r));
    const base = `http://127.0.0.1:${fixture.address().port}/`;
    const fresh = async (viewport = { width: 1056, height: 900 }, query = '') => {
      const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2 });
      const t = await ctx.newPage();
      t.on('pageerror', (e) => errs.push(String(e)));
      t.on('console', (m) => m.type() === 'error' && !/favicon/.test(m.text()) && errs.push(m.text()));
      await t.goto(base + query);
      await t.waitForSelector('.pf-row');
      return t;
    };

    // ---------- 1. the row ----------
    const t = await fresh();
    check('Snapchat is a platform with a setup, not a manual one: «غير متصلة» and «بدء الإعداد»', (await row(t).locator('.pf-chip').innerText()).trim() === 'غير متصلة' && (await row(t).locator('.pf-btn').first().innerText()).trim() === 'بدء الإعداد', await row(t).innerText());
    await row(t).locator('.pf-btn').first().click();
    await sheet(t).waitFor();

    // ---------- 2. the sheet: nine steps in the order of the walk ----------
    const names = await sheet(t).locator('.pf-step-btn').allInnerTexts();
    check('nine steps, in the order the owner walked them', STEPS.every(([, title], i) => names[i]?.includes(title.replace(/[«»]/g, ''))) && names.length === STEPS.length, names);
    check('it opens on the first step, with the sheet\'s title and the account link', (await sheet(t).locator('.pf-title h2').innerText()).includes('سناب شات') && (await sheet(t).locator('.pf-card h3').first().innerText()).includes('سجّل الدخول بحساب سناب شات'));
    const shown = {};
    for (const [i, [id, title]] of STEPS.entries()) {
      await open(t, i);
      await sheet(t).locator('.pf-card').waitFor();
      const info = await sheet(t).locator('.pf-input').evaluate((c) => ({
        title: c.querySelector('.pf-card h3')?.innerText ?? '',
        acts: c.querySelectorAll('.gd-todo li').length,
        shots: c.querySelectorAll('.gd-shot img').length,
        notes: c.querySelectorAll('.gd-info').length,
      }));
      const pics = await picturesLoaded(t);
      shown[id] = { ...info, pics: pics.length };
      check(`step «${id}»: reached from the list, its actions are listed, every picture loaded, English isolated`, info.title.includes(title.replace(/[«»]/g, '').slice(0, 8)) || id === 'dashboard' && (id === 'keys' || id === 'allowlist' ? true : info.acts >= 1) && pics.every((p) => /^\/guides\/snapchat\/[a-z-]+\.png$/.test(p)) && (await stray(t)).length === 0, JSON.stringify({ ...info, stray: await stray(t) }));
    }
    const expectedPictures = { account: 1, business: 2, profile: 1, dashboard: 2, oauth: 2, form: 1, secret: 1, keys: 0, allowlist: 0 };
    check('the pictures are where the walk put them: sign-in, the two Ads Manager screens, the profile, the menu and the card, the terms, the form, the created app', JSON.stringify(Object.fromEntries(Object.entries(shown).map(([k, v]) => [k, v.shots]))) === JSON.stringify(expectedPictures), JSON.stringify(shown));
    check('the secret step says to cover it before any picture and what to do if it is lost', await (async () => { await open(t, 6); const x = await sheet(t).locator('.pf-input').innerText(); return x.includes('غطِّ السر') && x.includes('احذف التطبيق'); })());

    // ---------- 3. the return address and the keys ----------
    await open(t, 5);
    const given = await sheet(t).locator('.pf-copy input').first().inputValue();
    check('the return address is the site\'s own, filled in for this platform, and offered to copy', given === `${base.replace(/\/$/, '')}/api/platforms/callback/snapchat` && (await sheet(t).locator('.pf-copy button').first().innerText()).includes('نسخ'), given);
    await open(t, 7);
    const keys = await sheet(t).locator('.pf-input').innerText();
    check('the keys form asks for the two values by Snapchat\'s own names, and the secret is a password field', keys.includes('Snap Client ID') && keys.includes('Snap client secret key') && (await sheet(t).locator('.pf-input input[type="password"]').count()) >= 1, keys.slice(0, 300));
    await t.screenshot({ path: path.join(out, '02-keys.png') });

    // ---------- 4. the allowlist ----------
    await open(t, 8);
    const review = await sheet(t).locator('.pf-input').innerText();
    const request = await sheet(t).locator('.pf-copy input').first().inputValue();
    check('the allowlist is a review: the request names the client id and the scope, says the secret was not shared, and the buttons are the review\'s own', request.includes('client ID') && request.includes('snapchat-profile-api') && request.includes('not shared the client secret') && !/secret key|secret:/i.test(request) && review.includes('قدّمت الطلب') && review.includes('وافقت المنصة') && review.includes('أكتفي بالنشر اليدوي'), request.slice(0, 200));
    check('no id or secret of any app is on the page', !/56b82922|65d5f482|SECRETMARK/.test(await sheet(t).innerText()));
    await t.screenshot({ path: path.join(out, '03-allowlist.png') });
    await open(t, 6);
    await t.screenshot({ path: path.join(out, '01-secret.png') });
    await t.keyboard.press('Escape');
    await t.context().close();

    // ---------- 5. the pictures themselves ----------
    const files = fs.readdirSync(path.join(h.root, 'public', 'guides', 'snapchat')).sort();
    check('the twelve picture files are in the site and no original is', JSON.stringify(files) === JSON.stringify(['authorised.png', 'business-name.png', 'business-where.png', 'consent.png', 'created.png', 'menu.png', 'oauth-add.png', 'oauth-card.png', 'oauth-form.png', 'public-profile.png', 'signin.png', 'terms.png']), files.join());
    const trackedPrivate = fs.existsSync(path.join(h.root, 'public', 'guides', 'snapchat', '1.png')) || fs.existsSync(path.join(h.root, 'public', 'guides', 'snapchat', '24.png'));
    check('no unblurred original (1.png to 24.png) was written beside them', !trackedPrivate);

    // ---------- 6. a phone, the evening ----------
    const xm = await fresh({ width: 390, height: 844 });
    await row(xm).locator('.pf-btn').first().click();
    await sheet(xm).waitFor();
    let sideways = 0;
    for (const [i] of STEPS.entries()) {
      await open(xm, i);
      await sheet(xm).locator('.pf-card').waitFor();
      await picturesLoaded(xm);
      if (!(await fits(xm)) || !(await xm.evaluate(() => { const b = document.querySelector('dialog[open] .pf-body'); return b.scrollWidth <= b.clientWidth + 1; }))) sideways++;
    }
    await xm.screenshot({ path: path.join(out, '04-phone.png') });
    check('phone: no step scrolls sideways, pictures included', sideways === 0, sideways);
    await xm.context().close();
    const ev = await fresh(undefined, '?dark');
    await row(ev).locator('.pf-btn').first().click();
    await sheet(ev).waitFor();
    await open(ev, 5);
    await picturesLoaded(ev);
    await ev.screenshot({ path: path.join(out, '05-evening.png') });
    check('evening: the sheet and its pictures are drawn', (await sheet(ev).locator('.gd-shot img').count()) === 1);
    await ev.context().close();

    check('no page error and nothing in the console', errs.length === 0, errs.slice(0, 3).join(' | '));
  } catch (e) {
    check('the flow ran to its end', false, String(e.message ?? e).slice(0, 500));
  } finally {
    await browser.close();
    fixture?.close();
  }
  process.exitCode = finish(path.join(__dirname, 'snapchat-flow.json')) ? 1 : 0;
})();

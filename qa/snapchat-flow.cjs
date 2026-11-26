// Browser check of Snapchat's setup in «المنصات» (MVP_draft.md sections 84 and 84.1), in Edge: the real tab and sheet on the fixture of qa/platforms-flow.cjs (stand-ins for the
// database, because the signed-in pages cannot be driven by a check and no bypass is allowed). The guide is walked as the owner walked Snapchat on 2026-11-26, and since 2026-11-26
// it is drawn as one page like YouTube's, Instagram's and TikTok's (src/components/settings/guide-doc.tsx, WHOLE_GUIDES).
//   1. The row: Snapchat is no longer a manual platform; it has a setup, and says so.
//   2. The page: nine steps in three parts, in the order of the walk, each reachable from the list, each with its actions, every picture under the action it shows.
//   3. The return address is filled in from the site and offered to copy exactly under the action that pastes it; the keys sit under the actions that name them, the secret as a password.
//   4. The allowlist is a review step: its text to send is the first action's, names the client id and never the secret, says the person sends it and the site sends nothing, and holds nothing back.
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
// A guide shown as one page: the section being read is the first whose bottom is below the top of what scrolls.
const reading = (t) =>
  t.evaluate(() => {
    const main = document.querySelector('dialog[open] .gdoc-main');
    if (!main) return null;
    const box = getComputedStyle(main).overflowY === 'visible' ? document.querySelector('dialog[open] .gdoc') : main;
    const top = box.getBoundingClientRect().top;
    return [...main.querySelectorAll('.gdoc-sec')].find((e) => e.getBoundingClientRect().bottom > top + 60)?.dataset.step ?? null;
  });
const settle = (t) =>
  t.evaluate(
    () =>
      new Promise((done) => {
        const main = document.querySelector('dialog[open] .gdoc-main');
        const box = main && getComputedStyle(main).overflowY === 'visible' ? document.querySelector('dialog[open] .gdoc') : main;
        if (!box) return done();
        let last = -1;
        let same = 0;
        let n = 0;
        const tick = () => {
          same = box.scrollTop === last ? same + 1 : 0;
          last = box.scrollTop;
          if (same >= 3 || ++n > 80) done();
          else setTimeout(tick, 60);
        };
        setTimeout(tick, 120);
      }),
  );
// Pictures load lazily, as a person scrolls: bring a step's last picture into view, then wait for all of them.
const loadPics = async (t, id) => {
  await t.evaluate((i) => [...document.querySelectorAll(`dialog[open] .gdoc-sec[data-step="${i}"] img`)].filter((e) => !e.complete).at(-1)?.scrollIntoView({ block: 'center' }), id);
  await t.waitForFunction((i) => [...document.querySelectorAll(`dialog[open] .gdoc-sec[data-step="${i}"] img`)].every((e) => e.complete && e.naturalWidth > 0), id);
};
const stray = (t, id) =>
  t.evaluate((i) => {
    const bad = [];
    const w = document.createTreeWalker(document.querySelector(`dialog[open] .gdoc-sec[data-step="${i}"]`), NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) if (!n.parentElement.closest('bdi, [dir="ltr"], button, input, textarea') && /[A-Za-z]/.test(n.textContent)) bad.push(n.textContent.trim().slice(0, 50));
    return bad;
  }, id);
const goTo = async (t, id) => {
  await t.locator(`dialog[open] .gdoc-ti[data-to="${id}"]`).click();
  await settle(t);
};
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

    // ---------- 2. the page: nine steps in three parts ----------
    await t.waitForSelector('dialog[open] .gdoc');
    await t.waitForTimeout(400);
    const ids = await sheet(t).locator('.gdoc-sec[data-step]').evaluateAll((l) => l.map((e) => e.dataset.step).filter((x) => x !== 'top' && x !== 'finish'));
    check('nine steps on one page, under the ids the saved progress knows, in the order the owner walked them', JSON.stringify(ids) === JSON.stringify(STEPS.map(([id]) => id)), ids.join(','));
    const toc = await t.evaluate(() => ({ parts: [...document.querySelectorAll('dialog[open] .gdoc-phl')].map((e) => e.innerText.trim()), items: [...document.querySelectorAll('dialog[open] .gdoc-ph .gdoc-ti')].map((e) => e.dataset.to) }));
    check('the list names its three parts and holds the nine steps in order', JSON.stringify(toc.parts) === JSON.stringify(['الحساب والملف العام', 'تطبيق الربط', 'المفاتيح وموافقة سناب شات']) && JSON.stringify(toc.items) === JSON.stringify(ids), JSON.stringify(toc));
    const top = await t.evaluate(() => document.querySelector('dialog[open] .gdoc-sec[data-step="top"]').innerText);
    check('«قبل البدء» says who the guide is for, counts nine steps and ten pictures, and says the connection can be tried before Snap approves', top.includes('للمدير') && top.includes('9') && top.includes('10') && top.includes('قبل موافقة Snap') && top.includes('طلب الموافقة تُرسله أنت'), top.slice(0, 120));
    const titles = await sheet(t).locator('.gdoc-sec[data-step] h3').allInnerTexts();
    check('each step carries the title it had in the classic sheet', STEPS.every(([, title], i) => titles.some((x) => x.replace(/[«»]/g, '').includes(title.replace(/[«»]/g, '').slice(0, 14)))), JSON.stringify(titles));
    check('the first step opens first, with the account link', (await sheet(t).locator('.pf-title h2').innerText()).includes('سناب شات') && (await sheet(t).locator('.gdoc-sec[data-step="account"] .gdoc-link').count()) === 1);
    const shown = {};
    for (const [i, [id]] of STEPS.entries()) {
      await goTo(t, id);
      const at = await reading(t);
      await loadPics(t, id);
      const info = await t.evaluate((x) => {
        const sec = document.querySelector(`dialog[open] .gdoc-sec[data-step="${x}"]`);
        const imgs = [...sec.querySelectorAll('img')];
        const inPart = [...sec.querySelectorAll('.gdoc-shot')].every((f) => {
          const here = new Set([...f.closest('.gdoc-part').querySelectorAll('.gdoc-acts > li')].map((l) => l.value));
          return f.dataset.rings.split(' ').filter((r) => r && r !== 'x').every((r) => here.has(Number(r)));
        });
        return {
          acts: sec.querySelectorAll('.gdoc-acts > li').length,
          imgs: imgs.length,
          srcs: imgs.map((e) => e.getAttribute('src')),
          loaded: imgs.every((e) => e.naturalWidth === Number(e.getAttribute('width')) && e.naturalHeight === Number(e.getAttribute('height'))),
          small: imgs.every((e) => e.getBoundingClientRect().width <= Math.min(400, e.naturalWidth) + 1),
          inPart,
          raw: /`|«[^«»؀-ۿ]*»/.test(sec.innerText),
          ltr: [...sec.querySelectorAll('bdi')].every((e) => e.getAttribute('dir') === 'ltr'),
          wide: document.documentElement.scrollWidth <= window.innerWidth + 1,
        };
      }, id);
      const lost = await stray(t, id);
      shown[id] = info;
      check(`step ${i + 1} (${id}): reached from the list, its actions are listed, English is isolated, every picture loads at its own size, is drawn small and sits under the actions it shows`, at === id && info.acts >= 1 && !info.raw && info.ltr && lost.length === 0 && info.wide && info.loaded && info.small && info.inPart && info.srcs.every((p) => /^\/guides\/snapchat\/[a-z-]+\.png$/.test(p)), JSON.stringify({ at, ...info, lost }));
    }
    const expectedPictures = { account: 1, business: 2, profile: 1, dashboard: 2, oauth: 2, form: 1, secret: 1, keys: 0, allowlist: 0 };
    check('the pictures are where the walk put them: sign-in, the two Ads Manager screens, the profile, the menu and the card, the button and the terms, the form, the created app', JSON.stringify(Object.fromEntries(Object.entries(shown).map(([k, v]) => [k, v.imgs]))) === JSON.stringify(expectedPictures), JSON.stringify(Object.fromEntries(Object.entries(shown).map(([k, v]) => [k, v.imgs]))));
    const parts = (id) => t.evaluate((x) => [...document.querySelectorAll(`dialog[open] .gdoc-sec[data-step="${x}"] .gdoc-part`)].map((p) => ({ acts: [...p.querySelectorAll('.gdoc-acts > li')].map((l) => l.value), shots: [...p.querySelectorAll('.gdoc-shot img')].map((i) => i.getAttribute('src').split('/').pop()) })), id);
    check('the two Ads Manager screens sit under the actions that fill them, and the button and its terms under their own', JSON.stringify(await parts('business')) === JSON.stringify([{ acts: [1, 2], shots: ['business-name.png'] }, { acts: [3, 4, 5], shots: ['business-where.png'] }]) && JSON.stringify(await parts('oauth')) === JSON.stringify([{ acts: [1], shots: ['oauth-add.png'] }, { acts: [2], shots: ['terms.png'] }]), JSON.stringify([await parts('business'), await parts('oauth')]));
    await goTo(t, 'secret');
    const secretText = await sheet(t).locator('.gdoc-sec[data-step="secret"]').innerText();
    check('the secret step says to cover it before any picture and what to do if it is lost', secretText.includes('غطِّ السر') && secretText.includes('احذف التطبيق'));

    // ---------- 3. the return address and the keys ----------
    await goTo(t, 'form');
    const given = await t.evaluate(() => document.querySelector('dialog[open] .gdoc-sec[data-step="form"] .gdoc-acts > li[value="2"] .gdoc-copy-v')?.innerText ?? '');
    check('the return address is the site\'s own, filled in for this platform, whole, under the action that pastes it', given === `${base.replace(/\/$/, '')}/api/platforms/callback/snapchat`, given);
    check('the form step offers a button to copy it', (await sheet(t).locator('.gdoc-sec[data-step="form"] .gd-copy').count()) >= 1);
    await goTo(t, 'keys');
    const keys = await t.evaluate(() => {
      const sec = document.querySelector('dialog[open] .gdoc-sec[data-step="keys"]');
      const li = (n) => sec.querySelector(`.gdoc-acts > li[value="${n}"]`);
      return { todo: sec.querySelectorAll('.gdoc-acts > li').length, id: !!li(2)?.querySelector('input:not([type=password])'), secret: !!li(3)?.querySelector('input[type=password]'), button: sec.querySelector('.gdoc-bar .pf-btn')?.innerText ?? '', text: sec.innerText };
    });
    check('the keys step lists four actions, asks for the two values by Snapchat\'s own names under the actions that name them, the secret as a password, and ends on «فحص وحفظ»', keys.todo === 4 && keys.id && keys.secret && keys.text.includes('Snap Client ID') && keys.text.includes('Snap client secret key') && keys.button.includes('فحص وحفظ'), JSON.stringify({ ...keys, text: keys.text.slice(0, 160) }));
    await t.screenshot({ path: path.join(out, '02-keys.png') });

    // ---------- 4. the allowlist ----------
    await goTo(t, 'allowlist');
    const al = await t.evaluate(() => {
      const sec = document.querySelector('dialog[open] .gdoc-sec[data-step="allowlist"]');
      return {
        request: sec.querySelector('.gdoc-acts > li[value="1"] .gdoc-copy-v')?.innerText ?? '',
        text: sec.innerText,
        buttons: [...sec.querySelectorAll('.gdoc-bar .pf-btn')].map((b) => b.innerText.trim()),
      };
    });
    check('the allowlist is a review: its text to send is the first action\'s and names the client id and the scope, says the secret was not shared, and the buttons are the review\'s own', al.request.includes('client ID') && al.request.includes('snapchat-profile-api') && al.request.includes('not shared the client secret') && !/secret key|secret:/i.test(al.request) && JSON.stringify(al.buttons) === JSON.stringify(['قدّمت الطلب', 'وافقت المنصة', 'أكتفي بالنشر اليدوي']), JSON.stringify({ buttons: al.buttons, request: al.request.slice(0, 160) }));
    check('it says plainly that the person sends the text and the site sends nothing to Snap, and that the connection can be tried before approval', al.text.includes('الموقع لا يرسل شيئاً إلى Snap') && al.text.includes('أرسله أنت') && al.text.includes('لا تنتظر الموافقة لتجرّب الربط'), al.text.slice(0, 200));
    check('no id or secret of any app is on the page', !/56b82922|65d5f482|SECRETMARK/.test(await sheet(t).innerText()));
    await t.screenshot({ path: path.join(out, '03-allowlist.png') });
    await goTo(t, 'secret');
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
    await xm.waitForSelector('dialog[open] .gdoc');
    await xm.waitForTimeout(400);
    await xm.locator('dialog[open] .gdoc-toc-list > summary').click();
    let sideways = 0;
    for (const [id] of STEPS) {
      if (!(await xm.locator(`dialog[open] .gdoc-ti[data-to="${id}"]`).isVisible())) await xm.locator('dialog[open] .gdoc-toc-list > summary').click();
      await goTo(xm, id);
      await loadPics(xm, id);
      const phone = await xm.evaluate(() => ({ page: document.documentElement.scrollWidth <= window.innerWidth + 1, body: (() => { const b = document.querySelector('dialog[open] .gdoc'); return b.scrollWidth <= b.clientWidth + 1; })(), shots: [...document.querySelectorAll('dialog[open] .gdoc-shot')].every((f) => f.getBoundingClientRect().right <= window.innerWidth + 1 && f.getBoundingClientRect().left >= -1) }));
      if (!phone.page || !phone.body || !phone.shots) sideways++;
    }
    await xm.screenshot({ path: path.join(out, '04-phone.png') });
    check('phone: no step scrolls sideways, pictures included', sideways === 0, sideways);
    await xm.context().close();
    const ev = await fresh(undefined, '?dark');
    await row(ev).locator('.pf-btn').first().click();
    await sheet(ev).waitFor();
    await ev.waitForSelector('dialog[open] .gdoc');
    await ev.waitForTimeout(400);
    await goTo(ev, 'form');
    await loadPics(ev, 'form');
    await ev.screenshot({ path: path.join(out, '05-evening.png') });
    check('evening: the page and its pictures are drawn', (await sheet(ev).locator('.gdoc-sec[data-step="form"] .gdoc-shot img').count()) === 1);
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

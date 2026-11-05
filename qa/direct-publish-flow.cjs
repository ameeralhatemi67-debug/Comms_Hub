// Browser check of «إجراءات سريعة» and «نشر مباشر» (MVP_draft.md section 76, Director_Notes_Plan.md N-2), in Edge: Home's real menu,
// the real sheet, the real YouTube and Instagram panels in their direct mode and the calendar's real dialogs
// (qa/fixtures/direct-publish-flow.tsx), with stand-ins for the database, the capabilities and the site's /api/platforms/test routes in
// front of a fake YouTube, because the page needs a signed-in person and no bypass is allowed.
//   1. The menu: its items, «نشر مباشر» for the director only, Escape and a click elsewhere close it.
//   2. The sheet: YouTube and Instagram with their connected accounts, the registry's other platforms as «قريباً», no simulated account.
//   3. YouTube in direct mode: open at once, an empty title, the four choices, the subscribers' choice for public and scheduled, a
//      schedule up to 180 days, the long press, what is sent, and its own list.
//   4. Instagram in direct mode: open at once, its long press.
//   5. «تذكير خاص» opens the calendar's own dialog; phone width; no page error.
// What this cannot check: YouTube and Meta themselves, and the database's rules (supabase/tests/direct_publish_rules.sql).
// Usage: node qa/direct-publish-flow.cjs   (writes qa/direct-publish-flow.json, screenshots in qa/artifacts/direct-publish-flow/)
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const esbuild = require('esbuild');
const { dependency, launchOptions } = require('./runtime.cjs');
const { chromium } = dependency('playwright');
const h = require('./android-helpers.cjs');

const { check, finish } = h.record('qa/direct-publish-flow.cjs');
const out = path.join(__dirname, 'artifacts', 'direct-publish-flow');
const fixtures = path.join(__dirname, 'fixtures');
const css = ['globals', 'identity', 'media', 'kit', 'work', 'chat', 'auth', 'permissions']
  .map((f) => fs.readFileSync(path.join(h.root, 'src', 'app', `${f}.css`), 'utf8'))
  .join('\n')
  .replace(/@import[^;]+;/g, '')
  .replace(/@theme\{[^}]*\}/g, '');
const page = (dark) =>
  `<!doctype html><html lang="ar" dir="rtl" data-identity="emerald"${dark ? ' data-theme="dark"' : ''}><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>الرئيسية</title>` +
  `<style>${css}</style><style>body{font-family:"Segoe UI",Tahoma,sans-serif}main{max-width:1120px;margin:auto;padding:16px}</style></head><body><div id="root"></div><script type="module" src="/flow.js"></script></body></html>`;
const HOLD_DIRECT_PUBLIC = 'يُنشر المقطع للعموم على القناة الآن، خارج دورة العمل، ويُبلَّغ ناشرو الحساب.';
const HOLD_DIRECT_SCHEDULED = 'يجعل يوتيوب المقطع عاماً في موعده بنفسه، خارج دورة العمل، ويُبلَّغ ناشرو الحساب.';
const HOLD_DIRECT_INSTAGRAM = 'يُنشر على الحساب للعموم الآن، خارج دورة العمل، ويُبلَّغ ناشرو الحساب.';
const KB = 1024;
const riyadhIn = (minutes) => new Date(Date.now() + 3 * 3600e3 + minutes * 60e3).toISOString().slice(0, 16);

const sheet = (t) => t.locator('dialog.pf-sheet[open]');
const panel = (t) => sheet(t).locator('.yt-test');
const calls = (t) => t.evaluate(() => window.__db.calls);
const fits = (t) => t.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const file = (name, size, mimeType = 'video/mp4') => ({ name, mimeType, buffer: Buffer.alloc(size, 7) });

(async () => {
  let fixture;
  const errs = [];
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch(launchOptions);
  try {
    const fake = path.join(fixtures, 'fake-direct.tsx');
    await esbuild.build({
      entryPoints: [path.join(fixtures, 'direct-publish-flow.tsx')],
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
            b.onResolve({ filter: /^\.\.?\/caps$/ }, () => ({ path: fake }));
            b.onResolve({ filter: /^\.\/work\/data$/ }, () => ({ path: fake }));
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
      if (url.pathname.startsWith('/api/thumb/')) {
        res.writeHead(204);
        return res.end();
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(page(url.searchParams.has('dark')));
    });
    await new Promise((r) => fixture.listen(0, '127.0.0.1', r));
    const base = `http://127.0.0.1:${fixture.address().port}/`;
    const outside = [];
    const open = async (q = '', viewport = { width: 1056, height: 900 }) => {
      const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2 });
      await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => {
        outside.push(r.request().url());
        return r.fulfill({ status: 200, contentType: 'text/plain', body: 'outside' });
      });
      const t = await ctx.newPage();
      t.on('pageerror', (e) => errs.push(String(e)));
      t.on('console', (m) => m.type() === 'error' && !/favicon/.test(m.text()) && errs.push(m.text()));
      await t.goto(`${base}${q}`);
      await t.locator('[data-qa="open"]').waitFor();
      return t;
    };

    // ---------- 1. the menu ----------
    const t = await open();
    check('the button says what it is, and its menu is closed', (await t.locator('[data-qa="open"]').innerText()).includes('إجراءات سريعة') && (await t.locator('[data-qa="menu"]').count()) === 0);
    await t.locator('[data-qa="open"]').click();
    const items = await t.locator('[data-qa="menu"] [role="menuitem"] b').allInnerTexts();
    check('the director\'s menu: «نشر مباشر» first, then the four shortcuts', JSON.stringify(items) === JSON.stringify(['نشر مباشر', 'تذكير خاص', 'حدث في التقويم', 'رفع ملف إلى المكتبة', 'رسالة جديدة']), items);
    check('the button says the menu is open', (await t.locator('[data-qa="open"]').getAttribute('aria-expanded')) === 'true');
    check('the library and mail open their own pages', (await t.locator('[data-qa="upload"]').getAttribute('href')) === '/media' && (await t.locator('[data-qa="mail"]').getAttribute('href')) === '/mail');
    await t.screenshot({ path: path.join(out, '01-menu.png') });
    await t.keyboard.press('Escape');
    check('Escape closes the menu', (await t.locator('[data-qa="menu"]').count()) === 0);
    await t.locator('[data-qa="open"]').click();
    await t.locator('h1').click();
    check('a click elsewhere closes it', (await t.locator('[data-qa="menu"]').count()) === 0);

    // ---------- 2. the sheet ----------
    await t.locator('[data-qa="open"]').click();
    await t.locator('[data-qa="direct"]').click();
    await sheet(t).waitFor();
    check('«نشر مباشر» opens its sheet and the menu closes', (await sheet(t).locator('h2').innerText()).includes('نشر مباشر') && (await t.locator('[data-qa="menu"]').count()) === 0);
    check('the sheet says it publishes for real, outside the work cycle, for the director and the Admin', (await sheet(t).innerText()).includes('خارج دورة العمل') && (await sheet(t).innerText()).includes('لمدير الاتصال المؤسسي ومسؤول النظام فقط'));
    const yt = sheet(t).locator('[data-dp-platform="youtube"]');
    const ig = sheet(t).locator('[data-dp-platform="instagram"]');
    check('YouTube and Instagram, each with its connected account', (await yt.innerText()).includes('يوتيوب') && (await yt.innerText()).includes('حساب متصل') && (await ig.innerText()).includes('إنستغرام') && !(await yt.isDisabled()));
    const soon = await sheet(t).locator('[data-dp-soon]').evaluateAll((b) => b.map((x) => [x.getAttribute('data-dp-soon'), x.disabled, x.innerText.includes('قريباً')]));
    check('the registry\'s other platforms show «قريباً» and cannot be pressed; mail is not among them', JSON.stringify(soon) === JSON.stringify([['x', true, true], ['linkedin', true, true], ['facebook', true, true]]), soon);
    check('nothing is offered before a platform is chosen', (await panel(t).count()) === 0 && (await sheet(t).innerText()).includes('اختر المنصة'));
    await t.screenshot({ path: path.join(out, '02-sheet.png') });

    // ---------- 3. YouTube, direct ----------
    await yt.click();
    await panel(t).waitFor();
    check('one account: its panel opens at once, in direct mode', (await panel(t).getAttribute('data-mode')) === 'direct' && (await panel(t).getAttribute('aria-label')) === 'نشر مباشر' && (await panel(t).locator('.yt-form').count()) === 1);
    check('it says it publishes for real and tells the publishers', (await panel(t).locator('.yt-lead').innerText()).includes('ينشر المقطع على القناة فعلاً') && (await panel(t).locator('.yt-lead').innerText()).includes('يُبلَّغ ناشرو الحساب'));
    check('the title starts empty', (await panel(t).locator('.yt-f input:not([data-yt="when"])').inputValue()) === '');
    const choices = await panel(t).locator('[data-yt="choice"] button').allInnerTexts();
    check('the four choices, private first', JSON.stringify(choices.map((c) => c.trim())) === JSON.stringify(['خاص', 'غير مدرج', 'عام', 'مجدول']), choices);
    check('no subscribers\' choice for a private video', (await panel(t).locator('[data-yt="notify"]').count()) === 0);
    await panel(t).getByRole('button', { name: 'عام' }).click();
    const notify = panel(t).locator('[data-yt="notify"] input');
    check('public: subscribers are told unless turned off', (await notify.count()) === 1 && (await notify.isChecked()));
    await panel(t).locator('[data-yt="file"]').setInputFiles(file('direct.mp4', 300 * KB));
    await panel(t).locator('.yt-f input:not([data-yt="when"])').fill('إعلان الحملة');
    const send = panel(t).locator('[data-yt="send"]');
    check('a public direct post says so and asks for a long press, with the reason', (await send.innerText()).includes('نشر للعموم') && (await send.getAttribute('data-hold')) === HOLD_DIRECT_PUBLIC);
    await t.screenshot({ path: path.join(out, '03-youtube-direct.png') });
    let mark = (await calls(t)).length;
    await send.click();
    await panel(t).locator('[data-yt="done"]').waitFor();
    let post = (await calls(t)).slice(mark).find((x) => x.method === 'POST');
    check('sent as a direct post, public, telling subscribers', post.body.purpose === 'direct' && post.body.privacy === 'public' && post.body.notify === true && post.body.title === 'إعلان الحملة', post.body);
    check('its list is the direct posts\'', (await panel(t).locator('.yt-list h5').innerText()) === 'آخر المنشورات المباشرة');
    check('said in words', (await t.evaluate(() => window.__db.says)).includes('وصل المقطع إلى يوتيوب.'));

    await panel(t).getByRole('button', { name: 'إزالة الملف' }).click();
    await panel(t).locator('[data-yt="file"]').setInputFiles(file('quiet.mp4', 300 * KB));
    await notify.uncheck();
    mark = (await calls(t)).length;
    await send.click();
    await t.waitForFunction((n) => window.__db.calls.length > n + 1, mark);
    await panel(t).locator('[data-yt="done"]').waitFor();
    post = (await calls(t)).slice(mark).find((x) => x.method === 'POST');
    check('turned off: sent with no notice to subscribers', post.body.notify === false, post.body);

    await panel(t).getByRole('button', { name: 'غير مدرج' }).click();
    check('unlisted: no subscribers\' choice, and a plain «نشر»', (await panel(t).locator('[data-yt="notify"]').count()) === 0 && (await send.innerText()).trim().endsWith('نشر') && (await send.getAttribute('data-hold')) === null);
    await panel(t).getByRole('button', { name: 'مجدول' }).click();
    check('scheduled: subscribers are told when it becomes public', (await panel(t).locator('[data-yt="notify"]').innerText()).includes('حين يصبح المقطع عاماً'));
    const when = panel(t).locator('[data-yt="when"]');
    await when.fill(riyadhIn(100 * 24 * 60));
    check('a direct post may be scheduled 100 days ahead, which a test may not', (await panel(t).locator('.yt-sub.warn').count()) === 0 && !(await send.isDisabled()));
    await when.fill(riyadhIn(181 * 24 * 60));
    check('but not past 180 days', (await panel(t).locator('.yt-sub.warn').innerText()).includes('180 يوماً') && (await send.isDisabled()));
    await when.fill(riyadhIn(2 * 24 * 60));
    check('a scheduled direct post asks for its own long press', (await send.innerText()).includes('جدولة النشر') && (await send.getAttribute('data-hold')) === HOLD_DIRECT_SCHEDULED);

    // ---------- 4. Instagram, direct ----------
    await ig.click();
    await sheet(t).locator('.yt-test[data-gd="ig-test"]').waitFor();
    const igPanel = sheet(t).locator('.yt-test[data-gd="ig-test"]');
    check('Instagram opens in direct mode at once', (await igPanel.getAttribute('data-mode')) === 'direct' && (await igPanel.getAttribute('aria-label')) === 'نشر مباشر' && (await igPanel.locator('.yt-lead').innerText()).includes('ينشر على الحساب فعلاً'));
    const igSend = igPanel.locator('[data-ig="send"]');
    check('every Instagram post is public, so it asks for a long press', (await igSend.count()) === 1 && (await igSend.getAttribute('data-hold')) === HOLD_DIRECT_INSTAGRAM);
    check('the YouTube panel is gone with the choice', (await sheet(t).locator('.yt-test[data-gd="yt-test"]').count()) === 0);
    await t.screenshot({ path: path.join(out, '04-instagram-direct.png') });
    await sheet(t).getByRole('button', { name: 'إغلاق' }).first().click();
    check('the sheet closes', (await t.locator('dialog.pf-sheet[open]').count()) === 0);

    // ---------- 5. a reminder, the publisher, the phone ----------
    await t.locator('[data-qa="open"]').click();
    await t.locator('[data-qa="reminder"]').click();
    const modal = t.locator('dialog.wk-modal[open]');
    await modal.waitFor();
    check('«تذكير خاص» opens the calendar\'s own dialog, for today', (await modal.innerText()).includes('تذكير لي'));
    await t.keyboard.press('Escape');
    await t.context().close();

    const pb = await open('?role=publisher');
    await pb.locator('[data-qa="open"]').click();
    const pbItems = await pb.locator('[data-qa="menu"] [role="menuitem"] b').allInnerTexts();
    check('the account\'s publisher has no «نشر مباشر»', !pbItems.includes('نشر مباشر') && pbItems.includes('تذكير خاص'), pbItems);
    await pb.context().close();

    const ph = await open('', { width: 390, height: 844 });
    await ph.locator('[data-qa="open"]').click();
    check('phone: the menu fits on the screen', await fits(ph));
    await ph.locator('[data-qa="direct"]').click();
    await sheet(ph).locator('[data-dp-platform="youtube"]').click();
    await panel(ph).waitFor();
    check('phone: nothing sideways with the panel open', await fits(ph));
    await ph.screenshot({ path: path.join(out, '05-phone.png') });
    await ph.context().close();

    check('nothing was loaded from outside the fixture', outside.length === 0, outside);
    check('no page error and nothing in the console', errs.length === 0, errs.slice(0, 3).join(' | '));
  } catch (e) {
    check('the flow ran to its end', false, String(e.message ?? e).slice(0, 500));
  } finally {
    await browser.close();
    fixture?.close();
    finish(path.join(h.root, 'qa', 'direct-publish-flow.json'));
  }
})();

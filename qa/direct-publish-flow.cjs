// Browser check of «إجراءات سريعة» and «نشر مباشر» (MVP_draft.md section 76, Director_Notes_Plan.md N-2), in Edge: Home's real menu,
// the real sheet, the real YouTube and Instagram panels in their direct mode and the calendar's real dialogs
// (qa/fixtures/direct-publish-flow.tsx), with stand-ins for the database, the capabilities and the site's /api/platforms/test routes in
// front of a fake YouTube, because the page needs a signed-in person and no bypass is allowed.
//   1. The menu: its items, «نشر مباشر» for the director only, Escape and a click elsewhere close it.
//   2. The sheet: YouTube and Instagram with their connected accounts, the registry's other platforms as «قريباً», no simulated account.
//   3. YouTube in direct mode: open at once, an empty title, the four choices, the subscribers' choice for public and scheduled, a
//      schedule up to 180 days, the long press, what is sent, and its own list.
//   4. Instagram in direct mode: open at once, its long press; «الآن» or «مجدول» (MVP_draft.md 76.5): a Riyadh time in the window,
//      its own long press, the file sent now and the post waiting in the list, then cancelled before its time.
//   5. «تذكير خاص» opens the calendar's own dialog; phone width; no page error.
//   6. The account sheet's list of direct posts (76.6): where each stands, late and cancelled included, and the link of a published one.
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
const HOLD_DIRECT_IG_SCHEDULED = 'يُنشر على الحساب للعموم في موعده، خارج دورة العمل، ويُبلَّغ ناشرو الحساب. يمكن إلغاؤه قبل موعده.';
// A real picture, redrawn to JPEG by the panel: 738 x 560.
const WIDE = path.join(h.root, 'public', 'guides', 'meta', 'config-confirm.png');
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

    // «مجدول» on Instagram (MVP_draft.md 76.5).
    const timing = await igPanel.locator('[data-ig="timing"] button').allInnerTexts();
    check('Instagram: «الآن» or «مجدول», now chosen', JSON.stringify(timing.map((x) => x.trim())) === JSON.stringify(['الآن', 'مجدول']) && (await igPanel.locator('[data-timing="now"]').getAttribute('aria-pressed')) === 'true', timing);
    check('now: no time to choose', (await igPanel.locator('[data-ig="when"]').count()) === 0);
    await igPanel.locator('[data-ig="file"]').setInputFiles({ name: 'إعلان.png', mimeType: 'image/png', buffer: fs.readFileSync(WIDE) });
    await igPanel.locator('[data-ig="picked"]').waitFor();
    await igPanel.locator('[data-timing="scheduled"]').click();
    const igWhen = igPanel.locator('[data-ig="when"]');
    const whenNote = await igPanel.locator('[data-ig="when-note"]').innerText();
    check('«مجدول» asks for a Riyadh time and says how the post goes out, and when it goes out late', (await igWhen.count()) === 1 && whenNote.includes('جهاز الجسر') && whenNote.includes('«الرئيسية»') && whenNote.includes('متأخراً'), whenNote);
    check('with no time it cannot be sent', await igSend.isDisabled());
    await igWhen.fill(riyadhIn(31 * 24 * 60));
    check('not past 30 days', (await igPanel.locator('.yt-sub.warn').innerText()).includes('30 يوماً') && (await igSend.isDisabled()));
    await igWhen.fill(riyadhIn(5));
    check('not sooner than ten minutes', (await igPanel.locator('.yt-sub.warn').innerText()).includes('10 دقائق') && (await igSend.isDisabled()));
    const slot = riyadhIn(26 * 60);
    await igWhen.fill(slot);
    check('a scheduled Story asks for its own long press, with the reason', (await igSend.innerText()).includes('جدولة القصة') && (await igSend.getAttribute('data-hold')) === HOLD_DIRECT_IG_SCHEDULED && !(await igSend.isDisabled()));
    await t.screenshot({ path: path.join(out, '04b-instagram-scheduled.png') });
    mark = (await calls(t)).length;
    await igSend.click();
    await igPanel.locator('[data-ig="scheduled"]').waitFor();
    const igCalls = (await calls(t)).slice(mark);
    const igStart = igCalls.find((x) => x.url === '/api/platforms/test' && x.method === 'POST');
    check('sent as a direct Story at that Riyadh time', igStart?.body.purpose === 'direct' && igStart?.body.kind === 'story_image' && igStart?.body.scheduled_for === new Date(`${slot}:00+03:00`).toISOString(), igStart?.body);
    check('the file goes now, and the server is told it arrived', igCalls.some((x) => x.url.startsWith('/api/platforms/fake-drive/') && x.method === 'PUT' && x.bytes > 0) && igCalls.some((x) => x.method === 'POST' && x.body?.step === 'uploaded'));
    check('nothing asks Meta after it: the post waits', !igCalls.some((x) => x.body?.step === 'advance'));
    const scheduledNote = await igPanel.locator('[data-ig="scheduled"]').innerText();
    check('it says it is scheduled, and may be cancelled before its time', scheduledNote.includes('جُدول') && scheduledNote.includes('يمكن إلغاؤه'), scheduledNote);
    check('said in words', (await t.evaluate(() => window.__db.says)).includes('جُدول «القصة» على إنستغرام.'));
    const waiting = igPanel.locator('.yt-item[data-state="waiting"]');
    check('it waits in the list with its time', (await waiting.count()) === 1 && (await waiting.innerText()).includes('مجدول · يُنشر'));
    mark = (await calls(t)).length;
    await waiting.locator('[data-ig="unschedule"]').click();
    await igPanel.locator('.yt-item[data-state="failed"]').first().waitFor();
    check('cancelled before its time, by the post\'s own route', (await calls(t)).slice(mark).some((x) => x.method === 'DELETE') && (await igPanel.locator('.yt-item[data-state="failed"]').first().innerText()).includes('أُلغي قبل موعده'));
    await igPanel.locator('[data-timing="now"]').click();
    check('back to «الآن»: no time, and the long press of a post now', (await igWhen.count()) === 0 && (await igSend.getAttribute('data-hold')) === HOLD_DIRECT_INSTAGRAM);
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

    // ---------- 6. the account sheet's list of direct posts ----------
    const ls = await open('?view=list');
    const list = ls.locator('[data-gd="direct-posts"]');
    await list.waitFor();
    const listText = await list.innerText();
    check('the account\'s sheet lists its direct posts and says where they are managed', listText.includes('المنشورات المباشرة') && listText.includes('منه تُلغى جدولتها أو تُحذف'), listText.slice(0, 200));
    check('one waiting, with its time', (await list.locator('.yt-item[data-state="waiting"]').innerText()).includes('مجدول · يُنشر'));
    check('one published late, said in minutes', (await list.locator('.yt-item', { hasText: 'منشور تأخر' }).innerText()).includes('متأخراً 41 دقيقة عن موعده'));
    check('one cancelled before its time', (await list.locator('.yt-item', { hasText: 'قصة أُلغيت' }).innerText()).includes('أُلغي قبل موعده'));
    check('a YouTube post with its visibility', (await list.locator('.yt-item', { hasText: 'مقطع غير مدرج' }).innerText()).includes('غير مدرج'));
    const links = await list.locator('a.wk-btn').evaluateAll((a) => a.map((x) => x.getAttribute('href')));
    check('a published post opens on its platform; a waiting or cancelled one has no link', JSON.stringify(links.sort()) === JSON.stringify(['https://www.instagram.com/p/fixture-late/', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ']), links);
    check('it only reads: no button to cancel or delete there', (await list.locator('button').count()) === 0);
    await ls.screenshot({ path: path.join(out, '06-account-list.png') });
    await ls.context().close();

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

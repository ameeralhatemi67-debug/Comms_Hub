// Browser check of «تجربة النشر» in an Instagram account's sheet (MVP_draft.md section 72), in Edge: the real «حسابات المنصات»
// page, sheet and panel (qa/fixtures/instagram-test-flow.tsx), with stand-ins for the database, the Drive upload and the
// site's /api/platforms/test routes in front of a fake Meta, because the page needs a signed-in person and no bypass is allowed.
//   1. The link to the account; the panel says Instagram has no private post; folded until asked for; a Story by default.
//   2. A picture Story from this device: redrawn to JPEG, sent to Drive, registered, waited on, published; the quota line.
//   3. A picture post: caption counters, alt text, a shape Instagram refuses caught first, its own long press.
//   4. A Reel from the library: videos only, named by its id and never uploaded by the page, the feed choice sent.
//   5. A library picture for a Story; delete; no delete without the permission; Meta failing to fetch; a cancel.
//   6. Who sees the panel; an account that needs reconnecting; phone and evening.
// What this cannot check: Meta itself and the database's rules (supabase/tests/platform_tests_instagram_rules.sql).
// Usage: node qa/instagram-test-flow.cjs   (writes qa/instagram-test-flow.json, screenshots in qa/artifacts/instagram-test-flow/)
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const esbuild = require('esbuild');
const { dependency, launchOptions } = require('./runtime.cjs');
const { chromium } = dependency('playwright');
const h = require('./android-helpers.cjs');

const { check, finish } = h.record('qa/instagram-test-flow.cjs');
const out = path.join(__dirname, 'artifacts', 'instagram-test-flow');
const fixtures = path.join(__dirname, 'fixtures');
const css = ['globals', 'identity', 'media', 'kit', 'work', 'chat', 'auth', 'permissions']
  .map((f) => fs.readFileSync(path.join(h.root, 'src', 'app', `${f}.css`), 'utf8'))
  .join('\n')
  .replace(/@import[^;]+;/g, '')
  .replace(/@theme\{[^}]*\}/g, '');
const page = (dark) =>
  `<!doctype html><html lang="ar" dir="rtl" data-identity="emerald"${dark ? ' data-theme="dark"' : ''}><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>حسابات المنصات</title>` +
  `<style>${css}</style><style>body{font-family:"Segoe UI",Tahoma,sans-serif}main{max-width:1120px;margin:auto;padding:16px}</style></head><body><div id="root"></div><script type="module" src="/flow.js"></script></body></html>`;
const HOLD_STORY = 'يراها كل من يتابع الحساب 24 ساعة، ثم تختفي.';
const HOLD_POST = 'يراه كل من يزور الحساب فور نشره ويبقى حتى يُحذف. لا يوجد على إنستغرام نشر خاص.';
const HOLD_DELETE = 'يُحذف المنشور من الحساب على إنستغرام نهائياً، ولا يُسترجع.';
const WIDE = path.join(h.root, 'public', 'guides', 'meta', 'config-confirm.png'); // 738 x 560
const TALL = path.join(h.root, 'public', 'guides', 'meta', 'ig-menu.png'); // 378 x 560, taller than 4:5

const sheet = (t) => t.locator('dialog.pf-sheet[open]');
const panel = (t) => sheet(t).locator('.yt-test');
const calls = (t) => t.evaluate(() => window.__db.calls);
const tests = (t) => t.evaluate(() => window.__db.tests);
const fits = (t) => t.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const png = (p, name) => ({ name, mimeType: 'image/png', buffer: fs.readFileSync(p) });
const video = (name, size) => ({ name, mimeType: 'video/mp4', buffer: Buffer.alloc(size, 7) });

(async () => {
  let fixture;
  const errs = [];
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch(launchOptions);
  try {
    const fake = path.join(fixtures, 'fake-instagram-test.tsx');
    await esbuild.build({
      entryPoints: [path.join(fixtures, 'instagram-test-flow.tsx')],
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
      if (url.pathname === '/flow.js') {
        res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
        return res.end(bundle);
      }
      // The library's file route: the picture is served; the video is not readable here, so its length stays unknown.
      if (url.pathname === '/api/media/f-image/content') {
        res.writeHead(200, { 'Content-Type': 'image/png' });
        return res.end(fs.readFileSync(WIDE));
      }
      if (url.pathname.startsWith('/api/media/')) {
        res.writeHead(404);
        return res.end();
      }
      if (url.pathname.startsWith('/api/platforms/connect/')) {
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end(`sign-in ${url.pathname}`);
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(page(url.searchParams.has('dark')));
    });
    await new Promise((r) => fixture.listen(0, '127.0.0.1', r));
    const base = `http://127.0.0.1:${fixture.address().port}/`;
    const outside = [];
    const fresh = async (viewport = { width: 1056, height: 900 }) => {
      const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2 });
      // Nothing leaves the fixture: Instagram's pages are recorded, never loaded.
      await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => {
        outside.push(r.request().url());
        return r.fulfill({ status: 200, contentType: 'text/plain', body: 'outside' });
      });
      const t = await ctx.newPage();
      t.on('pageerror', (e) => errs.push(String(e)));
      t.on('console', (m) => m.type() === 'error' && !/favicon|404/.test(m.text()) && errs.push(m.text()));
      return t;
    };
    const open = async (q = '', viewport) => {
      const t = await fresh(viewport);
      await t.goto(`${base}${q}`);
      await sheet(t).waitFor();
      return t;
    };
    const start = async (t) => {
      await panel(t).locator('[data-ig="open"]').click();
      await panel(t).locator('.yt-form').waitFor();
    };
    const choose = (t, name) => panel(t).locator('.wk-seg').getByRole('button', { name, exact: true }).click();
    const pickFile = async (t, file) => {
      await panel(t).locator('[data-ig="file"]').setInputFiles(file);
      await panel(t).locator('[data-ig="picked"]').waitFor();
    };
    const done = (t) => panel(t).locator('[data-ig="done"]').waitFor({ timeout: 20000 });

    // ---------- 1. the panel ----------
    const t = await open();
    const profile = panel(t).locator('[data-ig="profile"]');
    check('a link to the account on Instagram, by its username, in a new tab', (await profile.getAttribute('href')) === 'https://www.instagram.com/hedayh_org/' && (await profile.getAttribute('target')) === '_blank');
    const lead = await panel(t).locator('.yt-lead').innerText();
    check('it says plainly that Instagram has no private post, and what disappears', lead.includes('لا يوجد على إنستغرام نشر خاص') && lead.includes('القصة تختفي بعد 24 ساعة'), lead);
    check('folded until asked for', (await panel(t).locator('.yt-form').count()) === 0);
    await start(t);
    const pressed = await panel(t).locator('.wk-seg [aria-pressed="true"]').allInnerTexts();
    check('a Story by default, the quiet choice', JSON.stringify(pressed.map((s) => s.trim())) === JSON.stringify(['قصة']), pressed);
    check('a Story says it lasts 24 hours and takes no caption', (await panel(t).locator('[data-ig="lead"]').innerText()).includes('24 ساعة') && (await panel(t).locator('.yt-f textarea').count()) === 0);
    check('nothing is sent without a file', await panel(t).locator('[data-ig="send"]').isDisabled());
    check('the file input itself is never shown', !(await panel(t).locator('[data-ig="file"]').isVisible()));
    await t.screenshot({ path: path.join(out, '01-form.png') });

    // ---------- 2. a picture Story from this device ----------
    await pickFile(t, png(TALL, 'لقطة.png'));
    const chip = await panel(t).locator('[data-ig="picked"]').innerText();
    check('a picture is redrawn to JPEG before it goes', chip.includes('لقطة.png') && chip.includes('JPEG') && chip.includes('من هذا الجهاز'), chip);
    const send = panel(t).locator('[data-ig="send"]');
    check('a Story asks for its own long press', (await send.innerText()).includes('نشر القصة التجريبية') && (await send.getAttribute('data-hold')) === HOLD_STORY);
    await send.click();
    await panel(t).locator('[data-ig="progress"]').waitFor();
    await done(t);
    let c = await calls(t);
    const startCall = c.find((x) => x.method === 'POST' && x.url === '/api/platforms/test');
    const upload = c.find((x) => x.url.startsWith('/drive-upload/'));
    check('the start names a picture Story as JPEG, its size, and no caption', startCall.body.kind === 'story_image' && startCall.body.source === 'device' && startCall.body.mime === 'image/jpeg' && startCall.body.caption === '' && startCall.body.size === upload?.bytes, startCall.body);
    check('the file went to the Drive upload the site opened, whole', upload && upload.bytes > 1000);
    const reg = c.find((x) => x.method === 'POST' && x.body?.step === 'uploaded');
    check('then the page registered Drive\'s id for it', reg && /^drivefileFIXTURE\d+x$/.test(reg.body.ref), reg?.body);
    check('and asked how Meta was getting on until it was published', c.filter((x) => x.body?.step === 'advance').length === 2);
    const doneText = await panel(t).locator('[data-ig="done"]').innerText();
    check('the result says the Story is up and disappears after 24 hours', doneText.includes('نُشرت القصة على الحساب') && doneText.includes('24 ساعة'), doneText);
    check('the day\'s quota is shown as Meta counts it', (await panel(t).locator('[data-ig="quota"]').innerText()).includes('3 من 50'));
    const item = panel(t).locator('.yt-item').first();
    check('the list shows the Story and when it disappears', (await item.innerText()).includes('قصة · تختفي'), await item.innerText());
    await t.screenshot({ path: path.join(out, '02-story-done.png') });

    // ---------- 3. a picture post ----------
    await panel(t).getByRole('button', { name: 'إزالة الملف' }).click().catch(() => undefined);
    await choose(t, 'منشور صورة');
    check('a post asks for a caption with counters, and alt text', (await panel(t).locator('[data-ig="count"]').innerText()).includes('/ 2200') && (await panel(t).getByText('النص البديل').count()) === 1);
    await pickFile(t, png(TALL, 'طويلة.png'));
    check('a picture too tall for a post is caught before sending', (await panel(t).locator('.yt-sub.warn').innerText()).includes('4:5') && (await panel(t).locator('[data-ig="send"]').isDisabled()));
    await panel(t).getByRole('button', { name: 'إزالة الملف' }).click();
    await pickFile(t, png(WIDE, 'عريضة.png'));
    await panel(t).locator('.yt-f textarea').fill('شرح التجربة #تجربة @صديق');
    await panel(t).locator('.yt-f input').fill('صورة لقائمة الصلاحيات');
    check('the counters follow the caption', (await panel(t).locator('[data-ig="count"]').innerText()).includes('1 / 30') && (await panel(t).locator('[data-ig="count"]').innerText()).includes('1 / 20'));
    const sendPost = panel(t).locator('[data-ig="send"]');
    check('a post says it is public and asks for its own long press', (await sendPost.innerText()).includes('للعموم') && (await sendPost.getAttribute('data-hold')) === HOLD_POST);
    let before = (await calls(t)).length;
    await sendPost.click();
    await done(t);
    c = (await calls(t)).slice(before);
    const postStart = c.find((x) => x.method === 'POST' && x.url === '/api/platforms/test');
    check('the start names a picture post with its caption and alt text', postStart.body.kind === 'image' && postStart.body.caption === 'شرح التجربة #تجربة @صديق' && postStart.body.alt === 'صورة لقائمة الصلاحيات', postStart.body);
    check('and the registration carries them too', c.find((x) => x.body?.step === 'uploaded')?.body.caption === 'شرح التجربة #تجربة @صديق');
    check('the result links the post', (await panel(t).locator('[data-ig="done"] a').getAttribute('href')) === 'https://www.instagram.com/p/FIXTURE2/');

    // ---------- 4. a Reel from the library ----------
    await choose(t, 'ريلز');
    await panel(t).locator('[data-ig="library"]').click();
    const picker = t.locator('dialog.wk-modal[open]');
    await picker.locator('.wk-pick-list button').first().waitFor();
    const listed = await picker.locator('.wk-pick-list button').allInnerTexts();
    check('for a Reel the library offers videos only', listed.length === 1 && listed[0].includes('مقطع الحملة.mp4'), listed);
    await picker.locator('.wk-pick-list button').first().click();
    await panel(t).locator('[data-ig="picked"]').waitFor();
    check('the library video is named with where it is', (await panel(t).locator('[data-ig="picked"]').innerText()).includes('من المكتبة'));
    await panel(t).locator('.yt-check input').check();
    before = (await calls(t)).length;
    await panel(t).locator('[data-ig="send"]').click();
    await done(t);
    c = (await calls(t)).slice(before);
    const reel = c.find((x) => x.method === 'POST' && x.url === '/api/platforms/test');
    check('a library Reel is named by its id with the feed choice, never uploaded by the page', reel.body.kind === 'reel' && reel.body.source === 'library' && reel.body.asset === 'f-video' && reel.body.share_to_feed === true && !('size' in reel.body) && !c.some((x) => x.url.startsWith('/drive-upload/')), reel.body);
    await t.screenshot({ path: path.join(out, '03-reel-done.png') });

    // ---------- 5. a library picture for a Story, then delete ----------
    await choose(t, 'قصة');
    await panel(t).locator('[data-ig="library"]').click();
    await picker.locator('.wk-pick-list button').first().waitFor();
    check('for a Story the library offers pictures and videos', (await picker.locator('.wk-pick-list button').count()) === 2);
    await picker.locator('.wk-pick-list button', { hasText: 'صورة الغلاف' }).click();
    await panel(t).locator('[data-ig="picked"]').waitFor();
    check('a library picture is redrawn to JPEG here too', (await panel(t).locator('[data-ig="picked"]').innerText()).includes('JPEG'));

    const published = panel(t).locator('.yt-item[data-state="published"]').first();
    const id = await published.getAttribute('data-test');
    const del = published.getByRole('button', { name: 'حذف' });
    check('a published test can be deleted, with a long press', (await del.getAttribute('data-hold')) === HOLD_DELETE);
    await del.click();
    await panel(t).locator(`.yt-item[data-test="${id}"][data-state="deleted"]`).waitFor();
    check('deleted through the site, and the list says so', (await calls(t)).some((x) => x.method === 'DELETE' && x.url === `/api/platforms/test/${id}`) && (await panel(t).locator(`.yt-item[data-test="${id}"]`).innerText()).includes('حُذف من إنستغرام'));
    check('nothing was loaded from outside the fixture', outside.length === 0, outside);
    await t.screenshot({ path: path.join(out, '04-deleted.png') });
    await t.context().close();

    // Without the delete permission.
    const sp = await open('?scopes=publish');
    await start(sp);
    await pickFile(sp, png(TALL, 'قصة.png'));
    await panel(sp).locator('[data-ig="send"]').click();
    await done(sp);
    check('without the permission there is no delete, only the app', (await panel(sp).locator('.yt-item').first().getByRole('button', { name: 'حذف' }).count()) === 0 && (await panel(sp).locator('.yt-item').first().innerText()).includes('احذفه من التطبيق'));
    check('and it says which permission, with a reconnect', (await panel(sp).locator('.yt-list').innerText()).includes('instagram_manage_contents'));
    await Promise.all([sp.waitForURL(/\/api\/platforms\/connect\/meta$/), panel(sp).locator('[data-ig="reconnect"]').click()]);
    check('reconnect goes through Meta\'s sign-in', (await sp.evaluate(() => document.body.innerText)).includes('sign-in /api/platforms/connect/meta'));
    await sp.context().close();

    // Meta cannot fetch the file.
    const fl = await open('?fail=1');
    await start(fl);
    await pickFile(fl, png(TALL, 'قصة.png'));
    await panel(fl).locator('[data-ig="send"]').click();
    await panel(fl).locator('[data-ig="error"]').waitFor({ timeout: 20000 });
    check('a failed fetch is said in words', (await panel(fl).locator('[data-ig="error"]').innerText()).includes('لم يستطع إنستغرام جلب الملف'));
    await fl.context().close();

    // A cancel while Meta prepares.
    const sl = await open('?slow=1');
    await start(sl);
    await choose(sl, 'ريلز');
    await pickFile(sl, video('مقطع.mp4', 400 * 1024));
    await panel(sl).locator('[data-ig="send"]').click();
    await panel(sl).getByText('إنستغرام يجلب الملف ويجهّزه').waitFor({ timeout: 20000 });
    await sl.screenshot({ path: path.join(out, '05-waiting.png') });
    check('the wait says what is happening and that the page must stay open', (await panel(sl).locator('[data-ig="progress"]').innerText()).includes('أبقِ الصفحة مفتوحة'));
    await panel(sl).locator('[data-ig="cancel"]').click();
    await panel(sl).locator('[data-ig="error"]').waitFor({ timeout: 20000 });
    check('a cancel closes the test', (await panel(sl).locator('[data-ig="error"]').innerText()).includes('أُلغي الرفع') && (await tests(sl))[0].error === 'CANCELLED');
    await sl.context().close();

    // ---------- 6. who sees it ----------
    const pb = await open('?role=publisher');
    check('the account\'s own publisher sees the panel', await panel(pb).isVisible());
    await pb.context().close();
    const ot = await open('?role=other');
    check('a publisher who is not on the account does not', (await panel(ot).count()) === 0);
    await ot.context().close();
    const off = await open('?off=1');
    check('an account that needs reconnecting is not tested', (await panel(off).innerText()).includes('الحساب غير متصل الآن') && (await panel(off).locator('[data-ig="open"]').count()) === 0);
    await off.context().close();

    const ph = await open('', { width: 375, height: 812 });
    await start(ph);
    await choose(ph, 'منشور صورة');
    await pickFile(ph, png(WIDE, 'a-rather-long-file-name-for-a-phone-screen.png'));
    await ph.screenshot({ path: path.join(out, '06-phone.png'), fullPage: true });
    check('phone: nothing sideways with the form open', await fits(ph));
    await ph.context().close();
    const dk = await open('?dark=1');
    await start(dk);
    await pickFile(dk, png(TALL, 'قصة.png'));
    await panel(dk).locator('[data-ig="send"]').click();
    await done(dk);
    await dk.screenshot({ path: path.join(out, '07-evening.png') });
    const ink = await dk.evaluate(() => {
      const s = getComputedStyle(document.querySelector('dialog[open] [data-ig="done"]'));
      return [s.backgroundColor, s.color];
    });
    check('evening: the result is readable on its own ground', ink[0] !== ink[1] && ink[1] !== 'rgb(0, 0, 0)', ink.join(' / '));
    await dk.context().close();

    check('no page error and nothing in the console', errs.length === 0, errs.slice(0, 3).join(' | '));
  } catch (e) {
    check('the flow ran to its end', false, String(e.message ?? e).slice(0, 500));
  } finally {
    await browser.close();
    fixture?.close();
  }
  process.exitCode = finish(path.join(__dirname, 'instagram-test-flow.json')) ? 1 : 0;
})();

// Browser check of «تجربة النشر» in a Facebook Page's sheet (MVP_draft.md section 73), in Edge: the real «حسابات المنصات» page,
// sheet and panel (qa/fixtures/facebook-test-flow.tsx), with stand-ins for the database, the Drive upload and the site's
// /api/platforms/test routes in front of a fake Meta, because the page needs a signed-in person and no bypass is allowed.
//   1. The link to the Page; the panel folded; the silent check by default, with no long press.
//   2. The silent check: one request, its result, and a list line with nothing to delete; and a check whose delete was refused.
//   3. A text post with a link (an http link caught first), a refusal in words.
//   4. A photo: pictures only, redrawn to JPEG, sent to the site as a form with its words.
//   5. A Reel from the library (never uploaded by the page) and from the device (sent to Drive), waited on; a cancel; delete.
//   6. Who sees the panel; a Page that needs reconnecting; phone and evening.
// What this cannot check: Meta itself and the database's rules (supabase/tests/platform_tests_facebook_rules.sql).
// Usage: node qa/facebook-test-flow.cjs   (writes qa/facebook-test-flow.json, screenshots in qa/artifacts/facebook-test-flow/)
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const esbuild = require('esbuild');
const { dependency, launchOptions } = require('./runtime.cjs');
const { chromium } = dependency('playwright');
const h = require('./android-helpers.cjs');

const { check, finish } = h.record('qa/facebook-test-flow.cjs');
const out = path.join(__dirname, 'artifacts', 'facebook-test-flow');
const fixtures = path.join(__dirname, 'fixtures');
const css = ['globals', 'identity', 'media', 'kit', 'work', 'chat', 'auth', 'permissions']
  .map((f) => fs.readFileSync(path.join(h.root, 'src', 'app', `${f}.css`), 'utf8'))
  .join('\n')
  .replace(/@import[^;]+;/g, '')
  .replace(/@theme\{[^}]*\}/g, '');
const page = (dark) =>
  `<!doctype html><html lang="ar" dir="rtl" data-identity="emerald"${dark ? ' data-theme="dark"' : ''}><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>حسابات المنصات</title>` +
  `<style>${css}</style><style>body{font-family:"Segoe UI",Tahoma,sans-serif}main{max-width:1120px;margin:auto;padding:16px}</style></head><body><div id="root"></div><script type="module" src="/flow.js"></script></body></html>`;
const HOLD_POST = 'يراه كل من يزور الصفحة فور نشره ويبقى حتى يُحذف.';
const HOLD_DELETE = 'يُحذف المنشور من الصفحة على فيسبوك نهائياً، ولا يُسترجع.';
const WIDE = path.join(h.root, 'public', 'guides', 'meta', 'config-confirm.png');

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
    const fake = path.join(fixtures, 'fake-facebook-test.tsx');
    await esbuild.build({
      entryPoints: [path.join(fixtures, 'facebook-test-flow.tsx')],
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
      // Nothing leaves the fixture: Facebook's pages are recorded, never loaded.
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
      await panel(t).locator('[data-fb="open"]').click();
      await panel(t).locator('.yt-form').waitFor();
    };
    const choose = (t, name) => panel(t).locator('.wk-seg').getByRole('button', { name, exact: true }).click();
    const pickFile = async (t, file) => {
      await panel(t).locator('[data-fb="file"]').setInputFiles(file);
      await panel(t).locator('[data-fb="picked"]').waitFor();
    };
    const done = (t) => panel(t).locator('[data-fb="done"]').waitFor({ timeout: 20000 });

    // ---------- 1. the panel ----------
    const t = await open();
    const link = panel(t).locator('[data-fb="page"]');
    check('a link to the Page on Facebook, by its id, in a new tab', (await link.getAttribute('href')) === 'https://www.facebook.com/102345678901234' && (await link.getAttribute('target')) === '_blank');
    check('it says the silent check shows nothing and the rest is public', (await panel(t).locator('.yt-lead').innerText()).includes('لا يظهر لأحد'));
    check('folded until asked for', (await panel(t).locator('.yt-form').count()) === 0);
    await start(t);
    const pressed = await panel(t).locator('.wk-seg [aria-pressed="true"]').allInnerTexts();
    check('the silent check by default', JSON.stringify(pressed.map((s) => s.trim())) === JSON.stringify(['فحص صامت']), pressed);
    const runSilent = panel(t).locator('[data-fb="send"]');
    check('it needs no file, no words and no long press', (await runSilent.innerText()).includes('تشغيل الفحص الصامت') && (await runSilent.getAttribute('data-hold')) === null && (await panel(t).locator('.yt-f').count()) === 0);
    check('it says what it does', (await panel(t).locator('[data-fb="lead"]').innerText()).includes('يحذفه فوراً'));
    await t.screenshot({ path: path.join(out, '01-form.png') });

    // ---------- 2. the silent check ----------
    await runSilent.click();
    await panel(t).locator('[data-fb="silent"]').waitFor();
    let c = await calls(t);
    const silent = c.find((x) => x.method === 'POST' && x.url === '/api/platforms/test');
    check('one request names the silent check and sends no words of the page', silent.body.kind === 'fb_silent' && silent.body.message === '' && !('source' in silent.body), silent.body);
    check('the result says it was made, read and deleted, and seen by nobody', (await panel(t).locator('[data-fb="silent"]').innerText()).includes('لم يظهر لأحد'));
    const sItem = panel(t).locator('.yt-item[data-kind="fb_silent"]').first();
    check('the list says so, with nothing to delete', (await sItem.innerText()).includes('أُنشئ وقُرئ وحُذف') && (await sItem.getByRole('button', { name: 'حذف' }).count()) === 0);
    await t.screenshot({ path: path.join(out, '02-silent.png') });

    // ---------- 3. a text post ----------
    await choose(t, 'منشور نصي');
    await panel(t).locator('.yt-f textarea').fill('تجربة نشر نصي');
    await panel(t).locator('.yt-f input').fill('http://example.com');
    check('a link that is not https is caught before sending', (await panel(t).locator('.yt-sub.warn').innerText()).includes('https') && (await panel(t).locator('[data-fb="send"]').isDisabled()));
    await panel(t).locator('.yt-f input').fill('https://example.com/a');
    const sendText = panel(t).locator('[data-fb="send"]');
    check('a public post asks for a long press', (await sendText.innerText()).includes('للعموم') && (await sendText.getAttribute('data-hold')) === HOLD_POST);
    await sendText.click();
    await done(t);
    c = await calls(t);
    const text = c.filter((x) => x.method === 'POST' && x.url === '/api/platforms/test').pop();
    check('the post carries its words and link, and no file', text.body.kind === 'fb_text' && text.body.message === 'تجربة نشر نصي' && text.body.link === 'https://example.com/a' && !('size' in text.body), text.body);
    check('the result links the post', (await panel(t).locator('[data-fb="done"] a').getAttribute('href')).startsWith('https://www.facebook.com/102345678901234/posts/'));
    const tItem = panel(t).locator('.yt-item[data-kind="fb_text"]').first();
    check('the list shows it published, with open and a held delete', (await tItem.innerText()).includes('نُشر · منشور نصي') && (await tItem.getByRole('button', { name: 'حذف' }).getAttribute('data-hold')) === HOLD_DELETE);

    // ---------- 4. a photo ----------
    await choose(t, 'منشور صورة');
    await panel(t).locator('[data-fb="library"]').click();
    const picker = t.locator('dialog.wk-modal[open]');
    await picker.locator('.wk-pick-list button').first().waitFor();
    const listed = await picker.locator('.wk-pick-list button').allInnerTexts();
    check('for a photo the library offers pictures only', listed.length === 1 && listed[0].includes('صورة الغلاف'), listed);
    await picker.locator('.wk-pick-list button').first().click();
    await panel(t).locator('[data-fb="picked"]').waitFor();
    check('a library picture is redrawn to JPEG here', (await panel(t).locator('[data-fb="picked"]').innerText()).includes('JPEG'));
    await panel(t).locator('.yt-f textarea').fill('شرح الصورة');
    await panel(t).locator('.yt-f input').fill('وصف للصورة');
    let before = (await calls(t)).length;
    await panel(t).locator('[data-fb="send"]').click();
    await done(t);
    c = (await calls(t)).slice(before);
    const photoStart = c.find((x) => x.method === 'POST');
    const photoPut = c.find((x) => x.method === 'PUT');
    check('the start names a device JPEG and its size', photoStart.body.kind === 'fb_photo' && photoStart.body.source === 'device' && photoStart.body.mime === 'image/jpeg', photoStart.body);
    check('the picture goes to the site as a form, the same size, with its words', photoPut && photoPut.form && photoPut.form.file === photoStart.body.size && photoPut.form.caption === 'شرح الصورة' && photoPut.form.alt === 'وصف للصورة', photoPut?.form);
    check('no Drive upload for a photo', !c.some((x) => x.url.startsWith('/drive-upload/')));

    // ---------- 5. Reels ----------
    await choose(t, 'ريلز');
    await panel(t).locator('[data-fb="library"]').click();
    await picker.locator('.wk-pick-list button').first().waitFor();
    check('for a Reel the library offers videos only', (await picker.locator('.wk-pick-list button').allInnerTexts()).every((x) => x.includes('.mp4')));
    await picker.locator('.wk-pick-list button').first().click();
    await panel(t).locator('[data-fb="picked"]').waitFor();
    await panel(t).locator('.yt-f textarea').fill('وصف الريلز');
    before = (await calls(t)).length;
    await panel(t).locator('[data-fb="send"]').click();
    await done(t);
    c = (await calls(t)).slice(before);
    const reel = c.find((x) => x.method === 'POST' && x.url === '/api/platforms/test');
    check('a library Reel is named by its id, never uploaded by the page', reel.body.kind === 'fb_reel' && reel.body.source === 'library' && reel.body.asset === 'f-video' && !('size' in reel.body) && !c.some((x) => x.url.startsWith('/drive-upload/')), reel.body);
    check('the page asked until it was published, carrying the words', c.filter((x) => x.body?.step === 'advance').every((x) => x.body.message === 'وصف الريلز') && c.filter((x) => x.body?.step === 'advance').length === 2);
    await panel(t).getByRole('button', { name: 'إزالة الملف' }).click().catch(() => undefined);
    await pickFile(t, video('مقطع.mp4', 300 * 1024));
    before = (await calls(t)).length;
    await panel(t).locator('[data-fb="send"]').click();
    await done(t);
    c = (await calls(t)).slice(before);
    check('a device Reel goes to Drive whole, then is registered', c.some((x) => x.url.startsWith('/drive-upload/') && x.bytes === 300 * 1024) && c.some((x) => x.body?.step === 'uploaded' && /^drivefileFBFIXTURE/.test(x.body.ref)));
    await t.screenshot({ path: path.join(out, '03-reel-done.png') });

    const pub = panel(t).locator('.yt-item[data-state="published"]').first();
    const id = await pub.getAttribute('data-test');
    await pub.getByRole('button', { name: 'حذف' }).click();
    await panel(t).locator(`.yt-item[data-test="${id}"][data-state="deleted"]`).waitFor();
    check('a test is deleted through the site, and the list says so', (await calls(t)).some((x) => x.method === 'DELETE' && x.url === `/api/platforms/test/${id}`) && (await panel(t).locator(`.yt-item[data-test="${id}"]`).innerText()).includes('حُذف من فيسبوك'));
    check('nothing was loaded from outside the fixture', outside.length === 0, outside);
    await t.screenshot({ path: path.join(out, '04-list.png') });
    await t.context().close();

    // A silent check whose delete Meta refused.
    const nd = await open('?nodelete=1');
    await start(nd);
    await panel(nd).locator('[data-fb="send"]').click();
    await panel(nd).locator('[data-fb="silent"]').waitFor();
    const ndText = await panel(nd).locator('[data-fb="silent"]').innerText();
    check('a refused delete is said, with where the scheduled post is', ndText.includes('رفض حذفه') && (await panel(nd).locator('[data-fb="silent"] a').getAttribute('href')) === 'https://business.facebook.com/latest/posts/scheduled_posts?asset_id=102345678901234', ndText);
    const left = panel(nd).locator('.yt-item[data-kind="fb_silent"]').first();
    check('the list says it is not deleted yet and when it would show, and offers delete', (await left.innerText()).includes('لم يُحذف بعد') && (await left.innerText()).includes('يظهر') && (await left.getByRole('button', { name: 'حذف' }).count()) === 1);
    await nd.screenshot({ path: path.join(out, '05-not-deleted.png') });
    await left.getByRole('button', { name: 'حذف' }).click();
    await panel(nd).locator('.yt-item[data-kind="fb_silent"][data-state="deleted"]').waitFor();
    check('and deleting it from the list works', (await tests(nd))[0].state === 'deleted');
    await nd.context().close();

    // A refusal from Meta.
    const rf = await open();
    await start(rf);
    await choose(rf, 'منشور نصي');
    await panel(rf).locator('.yt-f textarea').fill('ارفض');
    await panel(rf).locator('[data-fb="send"]').click();
    await panel(rf).locator('[data-fb="error"]').waitFor();
    check('a Page refusal is said in words, with what to look at', (await panel(rf).locator('[data-fb="error"]').innerText()).includes('إنشاء المحتوى'));
    await rf.context().close();

    // A cancel while Meta prepares a Reel.
    const sl = await open('?slow=1');
    await start(sl);
    await choose(sl, 'ريلز');
    await pickFile(sl, video('طويل.mp4', 200 * 1024));
    await panel(sl).locator('[data-fb="send"]').click();
    await panel(sl).getByText('فيسبوك يجلب المقطع ويجهّزه').waitFor({ timeout: 20000 });
    check('the wait says the page must stay open', (await panel(sl).locator('[data-fb="progress"]').innerText()).includes('أبقِ الصفحة مفتوحة'));
    await panel(sl).locator('[data-fb="cancel"]').click();
    await panel(sl).locator('[data-fb="error"]').waitFor({ timeout: 20000 });
    check('a cancel closes the test', (await panel(sl).locator('[data-fb="error"]').innerText()).includes('أُلغي الرفع') && (await tests(sl))[0].error === 'CANCELLED');
    await sl.context().close();

    // ---------- 6. who sees it ----------
    const pb = await open('?role=publisher');
    check('the Page\'s own publisher sees the panel', await panel(pb).isVisible());
    await pb.context().close();
    const ot = await open('?role=other');
    check('a publisher who is not on the Page does not', (await panel(ot).count()) === 0);
    await ot.context().close();
    const off = await open('?off=1');
    check('a Page that needs reconnecting is not tested', (await panel(off).innerText()).includes('الصفحة غير متصلة الآن') && (await panel(off).locator('[data-fb="open"]').count()) === 0);
    await off.context().close();

    const ph = await open('', { width: 375, height: 812 });
    await start(ph);
    await choose(ph, 'منشور نصي');
    await panel(ph).locator('.yt-f input').fill('https://example.com/a-rather-long-address/for-a-phone-screen/that-keeps-going');
    await ph.screenshot({ path: path.join(out, '06-phone.png'), fullPage: true });
    check('phone: nothing sideways with the form open', await fits(ph));
    await ph.context().close();
    const dk = await open('?dark=1');
    await start(dk);
    await panel(dk).locator('[data-fb="send"]').click();
    await panel(dk).locator('[data-fb="silent"]').waitFor();
    await dk.screenshot({ path: path.join(out, '07-evening.png') });
    const ink = await dk.evaluate(() => {
      const s = getComputedStyle(document.querySelector('dialog[open] [data-fb="silent"]'));
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
  process.exitCode = finish(path.join(__dirname, 'facebook-test-flow.json')) ? 1 : 0;
})();

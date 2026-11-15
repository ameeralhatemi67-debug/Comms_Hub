// Browser check of «تجربة النشر» and «نشر مباشر» on TikTok (MVP_draft.md section 79), in Edge: the real «حسابات المنصات» page, sheet
// and panel (qa/fixtures/tiktok-test-flow.tsx), with stand-ins for the database, the Drive upload and the site's /api/platforms/test
// routes in front of a fake TikTok, because the page needs a signed-in person and no bypass is allowed.
//   1. The panel folded; the creator's nickname read when it opens; a draft by default, with no long press.
//   2. A draft from the library (never uploaded by the page), waited on, said as in the inbox.
//   3. A post: no privacy chosen in advance and only the creator's; interactions off, the one the account turned off greyed; the
//      commercial disclosure and its rules; the consent sentence and its links; a preview; a long press; from the device to Drive.
//   4. No delete of what arrived, said; a refusal in words; the creator unreadable, with a retry; a cancel.
//   5. Who sees the panel; an account that needs reconnecting; «نشر مباشر»; phone and evening.
// What this cannot check: TikTok itself and the database's rules (supabase/tests/platform_tests_tiktok_rules.sql).
// Usage: node qa/tiktok-test-flow.cjs   (writes qa/tiktok-test-flow.json, screenshots in qa/artifacts/tiktok-test-flow/)
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const esbuild = require('esbuild');
const { dependency, launchOptions } = require('./runtime.cjs');
const { chromium } = dependency('playwright');
const h = require('./android-helpers.cjs');

const { check, finish } = h.record('qa/tiktok-test-flow.cjs');
const out = path.join(__dirname, 'artifacts', 'tiktok-test-flow');
const fixtures = path.join(__dirname, 'fixtures');
const css = ['globals', 'identity', 'media', 'kit', 'work', 'chat', 'auth', 'permissions']
  .map((f) => fs.readFileSync(path.join(h.root, 'src', 'app', `${f}.css`), 'utf8'))
  .join('\n')
  .replace(/@import[^;]+;/g, '')
  .replace(/@theme\{[^}]*\}/g, '');
const page = (dark) =>
  `<!doctype html><html lang="ar" dir="rtl" data-identity="emerald"${dark ? ' data-theme="dark"' : ''}><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>حسابات المنصات</title>` +
  `<style>${css}</style><style>body{font-family:"Segoe UI",Tahoma,sans-serif}main{max-width:1120px;margin:auto;padding:16px}</style></head><body><div id="root"></div><script type="module" src="/flow.js"></script></body></html>`;
const HOLD_POST = 'يُنشر المقطع على الحساب في TikTok فوراً، ولا يحذفه الموقع: يُحذف من تطبيق TikTok.';
const HOLD_DIRECT = 'يُنشر على الحساب في TikTok الآن، خارج دورة العمل، ويُبلَّغ ناشرو الحساب. لا يحذفه الموقع: يُحذف من تطبيق TikTok.';

const sheet = (t) => t.locator('dialog.pf-sheet[open]');
const panel = (t) => sheet(t).locator('.yt-test');
const calls = (t) => t.evaluate(() => window.__db.calls);
const tests = (t) => t.evaluate(() => window.__db.tests);
const fits = (t) => t.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const video = (name, size) => ({ name, mimeType: 'video/mp4', buffer: Buffer.alloc(size, 7) });

(async () => {
  let fixture;
  const errs = [];
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch(launchOptions);
  try {
    const fake = path.join(fixtures, 'fake-tiktok-test.tsx');
    await esbuild.build({
      entryPoints: [path.join(fixtures, 'tiktok-test-flow.tsx')],
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
      if (url.pathname.startsWith('/api/')) {
        res.writeHead(404);
        return res.end();
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(page(url.searchParams.has('dark')));
    });
    await new Promise((r) => fixture.listen(0, '127.0.0.1', r));
    const base = `http://127.0.0.1:${fixture.address().port}/`;
    const outside = [];
    const fresh = async (viewport = { width: 1056, height: 900 }) => {
      const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2 });
      // Nothing leaves the fixture: TikTok's pages are recorded, never loaded.
      await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => {
        outside.push(r.request().url());
        return r.fulfill({ status: 200, contentType: 'text/plain', body: 'outside' });
      });
      const t = await ctx.newPage();
      t.on('pageerror', (e) => errs.push(String(e)));
      t.on('console', (m) => m.type() === 'error' && !/favicon|404|Failed to load resource/.test(m.text()) && errs.push(m.text()));
      return t;
    };
    const open = async (q = '', viewport) => {
      const t = await fresh(viewport);
      await t.goto(`${base}${q}`);
      await sheet(t).waitFor();
      return t;
    };
    const start = async (t) => {
      await panel(t).locator('[data-tt="open"]').click();
      await panel(t).locator('.yt-form').waitFor();
    };
    const choose = (t, c) => panel(t).locator(`[data-tt-choice="${c}"]`).click();
    const pickFile = async (t, file) => {
      await panel(t).locator('[data-tt="file"]').setInputFiles(file);
      await panel(t).locator('[data-tt="picked"]').waitFor();
    };
    const done = (t) => panel(t).locator('[data-tt="done"]').waitFor({ timeout: 20000 });

    // ---------- 1. the panel ----------
    const t = await open();
    check('it says TikTok cannot delete through applications', (await panel(t).locator('.yt-lead').innerText()).includes('يُحذف من تطبيق TikTok نفسه'));
    check('folded until asked for, and nothing asked of TikTok before', (await panel(t).locator('.yt-form').count()) === 0 && !(await calls(t)).some((x) => x.url === '/api/platforms/test/creator'));
    await start(t);
    await panel(t).locator('[data-tt="creator"]').waitFor();
    check('opening reads the creator\'s settings once, and names the account', (await calls(t)).filter((x) => x.url === '/api/platforms/test/creator').length === 1 && (await panel(t).locator('[data-tt="creator"]').innerText()).includes('حساب القسم على TikTok'));
    const pressed = await panel(t).locator('.wk-seg [aria-pressed="true"]').allInnerTexts();
    check('a draft by default', JSON.stringify(pressed.map((s) => s.trim())) === JSON.stringify(['مسودة في صندوق TikTok']), pressed);
    const sendDraft = panel(t).locator('[data-tt="send"]');
    check('a draft needs no words and no long press, and waits for a file', (await sendDraft.getAttribute('data-hold')) === null && (await panel(t).locator('[data-tt="caption"]').count()) === 0 && (await sendDraft.isDisabled()));
    check('it says nothing shows until the owner posts it', (await panel(t).locator('[data-tt="lead"]').innerText()).includes('لا يظهر لأحد'));
    await t.screenshot({ path: path.join(out, '01-form.png') });

    // ---------- 2. a draft from the library ----------
    await panel(t).locator('[data-tt="library"]').click();
    const picker = t.locator('dialog.wk-modal[open]');
    await picker.locator('.wk-pick-list button').first().waitFor();
    await picker.locator('.wk-pick-list button').first().click();
    await panel(t).locator('[data-tt="picked"]').waitFor();
    check('the chosen video is shown before it goes', (await panel(t).locator('[data-tt="preview"]').getAttribute('src')) === '/api/media/f-video/content');
    let before = (await calls(t)).length;
    await sendDraft.click();
    await done(t);
    let c = (await calls(t)).slice(before);
    const draft = c.find((x) => x.method === 'POST' && x.url === '/api/platforms/test');
    check('a library draft is named by its id, with no privacy, never uploaded by the page', draft.body.kind === 'tt_draft' && draft.body.source === 'library' && draft.body.asset === 'f-video' && !('privacy' in draft.body) && !c.some((x) => x.url.startsWith('/drive-upload/')), draft.body);
    check('the page asked until it arrived', c.filter((x) => x.body?.step === 'advance').length === 2);
    check('the result says it is in the inbox and how to finish it', (await panel(t).locator('[data-tt="done"]').innerText()).includes('إشعار الصندوق'));
    const dItem = panel(t).locator('.yt-item[data-kind="tt_draft"]').first();
    check('the list says so, with no delete', (await dItem.innerText()).includes('وصلت مسودة إلى صندوق الحساب') && (await dItem.getByRole('button').count()) === 0);

    // ---------- 3. a post ----------
    await choose(t, 'post');
    const privacy = panel(t).locator('[data-tt="privacy"]');
    const opts = await privacy.locator('option').evaluateAll((os) => os.map((o) => [o.value, o.disabled, o.textContent]));
    check('no privacy is chosen in advance, and only the creator\'s are offered', (await privacy.inputValue()) === '' && JSON.stringify(opts.map((o) => o[0])) === JSON.stringify(['', 'friends', 'followers', 'private']) && opts[0][1] === true, opts);
    const allow = await panel(t).locator('[data-tt-allow] input').evaluateAll((is) => is.map((i) => [i.checked, i.disabled]));
    check('comments, Duet and Stitch start off, and the Duet the account turned off is greyed', JSON.stringify(allow) === JSON.stringify([[false, false], [false, true], [false, false]]), allow);
    check('the Duet the account turned off says so', (await panel(t).locator('[data-tt-allow="duet"]').innerText()).includes('مغلق في إعدادات الحساب'));
    check('the commercial disclosure starts off', (await panel(t).locator('[data-tt="commercial"]').isChecked()) === false);
    await panel(t).getByRole('button', { name: 'إزالة الملف' }).click();
    await pickFile(t, video('مقطع.mp4', 300 * 1024));
    const sendPost = panel(t).locator('[data-tt="send"]');
    check('a post waits for a privacy to be chosen', (await sendPost.isDisabled()) && (await panel(t).locator('.yt-sub.warn').innerText()).includes('اختر من يرى'));
    await privacy.selectOption('private');
    await panel(t).locator('[data-tt="commercial"]').check();
    check('the disclosure on needs one of its two', (await sendPost.isDisabled()) && (await panel(t).locator('.yt-sub.warn').innerText()).includes('علامتك التجارية'));
    await panel(t).locator('[data-tt="branded"]').check();
    const afterBranded = [await privacy.inputValue(), await privacy.locator('option[value="private"]').evaluate((o) => o.disabled)];
    check('branded content cannot be «أنا فقط»: the choice is undone and the option closed', afterBranded[0] === '' && afterBranded[1] === true, afterBranded);
    check('it says the label TikTok will put on it', (await panel(t).locator('.tt-allow').last().innerText()).includes('شراكة مدفوعة'));
    const consent = panel(t).locator('[data-tt="consent"]');
    const links = await consent.locator('a').evaluateAll((as) => as.map((a) => [a.getAttribute('href'), a.target]));
    check('the consent names the branded content policy and the music confirmation, each linked', links.length === 2 && links.every((l) => l[1] === '_blank') && links.some((l) => l[0].includes('bc-policy')) && links.some((l) => l[0].includes('music-usage')), links);
    check('and says a post may take minutes to show', (await consent.innerText()).includes('بضع دقائق'));
    await panel(t).locator('[data-tt="branded"]').uncheck();
    await panel(t).locator('[data-tt="own-brand"]').check();
    check('your own brand alone is labelled «محتوى ترويجي», and the consent drops the policy', (await panel(t).locator('.tt-allow').last().innerText()).includes('محتوى ترويجي') && (await consent.locator('a').count()) === 1);
    await privacy.selectOption('private');
    await panel(t).locator('[data-tt-allow="comments"] input').check();
    await panel(t).locator('[data-tt="caption"]').fill('تجربة منشور #وسم');
    check('a post asks for a long press', (await sendPost.getAttribute('data-hold')) === HOLD_POST && !(await sendPost.isDisabled()));
    await t.screenshot({ path: path.join(out, '02-post-form.png'), fullPage: true });
    before = (await calls(t)).length;
    await sendPost.click();
    await done(t);
    c = (await calls(t)).slice(before);
    const post = c.find((x) => x.method === 'POST' && x.url === '/api/platforms/test');
    check('the start carries exactly the person\'s choices', post.body.kind === 'tt_post' && post.body.privacy === 'private' && post.body.comments === true && post.body.duet === false && post.body.stitch === false && post.body.commercial === true && post.body.own_brand === true && post.body.branded === false && post.body.caption === 'تجربة منشور #وسم', post.body);
    const uploaded = c.find((x) => x.body?.step === 'uploaded');
    check('a device file goes to Drive whole, then is registered with the same choices', c.some((x) => x.url.startsWith('/drive-upload/') && x.bytes === 300 * 1024) && /^drivefileTTFIXTURE/.test(uploaded?.body.ref) && uploaded.body.comments === true && uploaded.body.own_brand === true);
    check('the result says it was posted and may take minutes', (await panel(t).locator('[data-tt="done"]').innerText()).includes('بضع دقائق'));
    const pItem = panel(t).locator('.yt-item[data-kind="tt_post"]').first();
    check('the list says it was posted for «أنا فقط», with no delete, and says where to delete', (await pItem.innerText()).includes('أنا فقط') && (await pItem.getByRole('button').count()) === 0 && (await panel(t).locator('[data-tt="list"]').innerText()).includes('يُحذف من تطبيق TikTok'));
    check('it says what an unaudited app may post', (await panel(t).locator('.wk-hint').innerText()).includes('«أنا فقط»'));
    check('nothing was loaded from outside the fixture', outside.length === 0, outside);
    await t.screenshot({ path: path.join(out, '03-done.png') });
    await t.context().close();

    // ---------- 4. refusals ----------
    const rf = await open();
    await start(rf);
    await choose(rf, 'post');
    await pickFile(rf, video('مقطع.mp4', 1000));
    await panel(rf).locator('[data-tt="privacy"]').selectOption('private');
    await panel(rf).locator('[data-tt="caption"]').fill('ارفض');
    await panel(rf).locator('[data-tt="send"]').click();
    await panel(rf).locator('[data-tt="error"]').waitFor();
    check('TikTok\'s refusal of an unaudited post to a public account is said, with what to do', (await panel(rf).locator('[data-tt="error"]').innerText()).includes('اجعل الحساب خاصاً'));
    await rf.context().close();

    const cf = await open('?creator=fail');
    await start(cf);
    await panel(cf).locator('[data-tt="creator-error"]').waitFor();
    check('when TikTok will not say the creator\'s settings, nothing can be sent, and a retry is offered', (await panel(cf).locator('[data-tt="send"]').isDisabled()) && (await panel(cf).locator('[data-tt="creator-error"]').getByRole('button', { name: 'إعادة المحاولة' }).count()) === 1);
    await cf.context().close();

    const sl = await open('?slow=1');
    await start(sl);
    await pickFile(sl, video('طويل.mp4', 200 * 1024));
    await panel(sl).locator('[data-tt="send"]').click();
    await panel(sl).getByText('TikTok يجلب المقطع ويفحصه').waitFor({ timeout: 20000 });
    check('the wait says the page must stay open', (await panel(sl).locator('[data-tt="progress"]').innerText()).includes('أبقِ الصفحة مفتوحة'));
    await panel(sl).locator('[data-tt="cancel"]').click();
    await panel(sl).locator('[data-tt="error"]').waitFor({ timeout: 20000 });
    check('a cancel closes the test', (await panel(sl).locator('[data-tt="error"]').innerText()).includes('أُلغي الرفع') && (await tests(sl))[0].error === 'CANCELLED');
    await sl.context().close();

    // ---------- 5. who sees it, «نشر مباشر», phone, evening ----------
    const pb = await open('?role=publisher');
    check('the account\'s own publisher sees the panel', await panel(pb).isVisible());
    await pb.context().close();
    const ot = await open('?role=other');
    check('a publisher who is not on the account does not', (await panel(ot).count()) === 0);
    await ot.context().close();
    const off = await open('?off=1');
    check('an account that needs reconnecting is not tested', (await panel(off).innerText()).includes('الحساب غير متصل الآن') && (await panel(off).locator('[data-tt="open"]').count()) === 0);
    await off.context().close();

    const dr = await open('?direct=1');
    await panel(dr).locator('[data-tt="creator"]').waitFor();
    check('«نشر مباشر» opens at once, under its own name, with no close', (await panel(dr).locator('h4').innerText()) === 'نشر مباشر' && (await panel(dr).getByRole('button', { name: 'إغلاق' }).count()) === 0);
    await choose(dr, 'post');
    await pickFile(dr, video('مباشر.mp4', 1000));
    await panel(dr).locator('[data-tt="privacy"]').selectOption('followers');
    check('a direct post asks for its own long press', (await panel(dr).locator('[data-tt="send"]').getAttribute('data-hold')) === HOLD_DIRECT);
    await panel(dr).locator('[data-tt="send"]').click();
    await done(dr);
    const dpost = (await calls(dr)).find((x) => x.method === 'POST' && x.url === '/api/platforms/test');
    check('it is sent as a direct post', dpost.body.purpose === 'direct' && dpost.body.privacy === 'followers' && (await calls(dr)).find((x) => x.url === '/api/platforms/test/creator').body.purpose === 'direct', dpost.body);
    check('its list is the direct posts\', in their words', (await panel(dr).locator('[data-tt="list"] h5').innerText()) === 'آخر المنشورات المباشرة' && (await panel(dr).locator('.yt-item').first().innerText()).includes('المتابعون'));
    await dr.screenshot({ path: path.join(out, '04-direct.png'), fullPage: true });
    await dr.context().close();

    const ph = await open('', { width: 375, height: 812 });
    await start(ph);
    await choose(ph, 'post');
    await pickFile(ph, video('مقطع-باسم-طويل-جداً-لشاشة-الهاتف.mp4', 1000));
    await panel(ph).locator('[data-tt="commercial"]').check();
    await ph.screenshot({ path: path.join(out, '05-phone.png'), fullPage: true });
    check('phone: nothing sideways with the post form open', await fits(ph));
    await ph.context().close();
    const dk = await open('?dark=1');
    await start(dk);
    await choose(dk, 'post');
    await dk.screenshot({ path: path.join(out, '06-evening.png'), fullPage: true });
    const ink = await dk.evaluate(() => {
      const s = getComputedStyle(document.querySelector('dialog[open] .tt-allow'));
      const l = getComputedStyle(document.querySelector('dialog[open] .tt-check'));
      return [s.borderTopColor, l.color, getComputedStyle(document.querySelector('dialog[open]')).backgroundColor];
    });
    check('evening: the choices are readable on their ground', ink[1] !== ink[2], ink.join(' / '));
    await dk.context().close();

    check('no page error and nothing in the console', errs.length === 0, errs.slice(0, 3).join(' | '));
  } catch (e) {
    check('the flow ran to its end', false, String(e.message ?? e).slice(0, 500));
  } finally {
    await browser.close();
    fixture?.close();
  }
  process.exitCode = finish(path.join(__dirname, 'tiktok-test-flow.json')) ? 1 : 0;
})();

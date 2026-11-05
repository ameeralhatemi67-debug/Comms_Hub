// Browser check of «تجربة النشر» in a YouTube account's sheet (MVP_draft.md section 71), in Edge: the real «حسابات المنصات»
// page, sheet and panel (qa/fixtures/youtube-test-flow.tsx), with stand-ins for the database and for the site's
// /api/platforms/test routes in front of a fake YouTube, because the page needs a signed-in person and no bypass is allowed.
//   1. The links to the channel and to Studio; the panel folded until asked for.
//   2. A community post: said plainly that YouTube does not allow it, copied, and YouTube's posts page opened; nothing sent.
//   3. A video from this device: checked before sending, sent in the agreed pieces, the result and its link, the list.
//   4. A video from the library: videos only, named by its id, read by the server; asked public, kept private by YouTube.
//   5. Delete; a lost piece resumed; a cancel half way; a channel connected before the delete permission; a refusal.
//   6. Who sees the panel; a channel that needs reconnecting; phone and evening.
// What this cannot check: YouTube itself and the database's rules (supabase/tests/platform_tests_rules.sql).
// Usage: node qa/youtube-test-flow.cjs   (writes qa/youtube-test-flow.json, screenshots in qa/artifacts/youtube-test-flow/)
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const esbuild = require('esbuild');
const { dependency, launchOptions } = require('./runtime.cjs');
const { chromium } = dependency('playwright');
const h = require('./android-helpers.cjs');

const { check, finish } = h.record('qa/youtube-test-flow.cjs');
const out = path.join(__dirname, 'artifacts', 'youtube-test-flow');
const fixtures = path.join(__dirname, 'fixtures');
const css = ['globals', 'identity', 'media', 'kit', 'work', 'chat', 'auth', 'permissions']
  .map((f) => fs.readFileSync(path.join(h.root, 'src', 'app', `${f}.css`), 'utf8'))
  .join('\n')
  .replace(/@import[^;]+;/g, '')
  .replace(/@theme\{[^}]*\}/g, '');
const page = (dark) =>
  `<!doctype html><html lang="ar" dir="rtl" data-identity="emerald"${dark ? ' data-theme="dark"' : ''}><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>حسابات المنصات</title>` +
  `<style>${css}</style><style>body{font-family:"Segoe UI",Tahoma,sans-serif}main{max-width:1120px;margin:auto;padding:16px}</style></head><body><div id="root"></div><script type="module" src="/flow.js"></script></body></html>`;
const HOLD_PUBLIC = 'المقطع العام يراه كل من يزور القناة فور رفعه.';
const HOLD_DELETE = 'يُحذف المقطع من القناة على يوتيوب نهائياً، ولا يُسترجع.';
const HOLD_SCHEDULED = 'يجعل يوتيوب المقطع عاماً في موعده بنفسه، فيراه كل من يزور القناة ما لم يُحذف قبله.';
/** A Riyadh 'YYYY-MM-DDTHH:MM' some minutes from now, as a datetime-local field takes it. */
const riyadhIn = (minutes) => new Date(Date.now() + 3 * 3600e3 + minutes * 60e3).toISOString().slice(0, 16);
const KB = 1024;

const sheet = (t) => t.locator('dialog.pf-sheet[open]');
const panel = (t) => sheet(t).locator('.yt-test');
const calls = (t) => t.evaluate(() => window.__db.calls);
const tests = (t) => t.evaluate(() => window.__db.tests);
const fits = (t) => t.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const file = (name, size, mimeType = 'video/mp4') => ({ name, mimeType, buffer: Buffer.alloc(size, 7) });

(async () => {
  let fixture;
  const errs = [];
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch(launchOptions);
  try {
    const fake = path.join(fixtures, 'fake-youtube-test.tsx');
    await esbuild.build({
      entryPoints: [path.join(fixtures, 'youtube-test-flow.tsx')],
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
      // The platform's sign-in, reduced to a page that says where the reconnect went.
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
      const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, permissions: ['clipboard-read', 'clipboard-write'] });
      // Nothing leaves the fixture: YouTube's pages are recorded, never loaded.
      await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => {
        outside.push(r.request().url());
        return r.fulfill({ status: 200, contentType: 'text/plain', body: 'outside' });
      });
      const t = await ctx.newPage();
      t.on('pageerror', (e) => errs.push(String(e)));
      t.on('console', (m) => m.type() === 'error' && !/favicon/.test(m.text()) && errs.push(m.text()));
      return t;
    };
    const open = async (q = '', viewport) => {
      const t = await fresh(viewport);
      await t.goto(`${base}${q}`);
      await sheet(t).waitFor();
      return t;
    };
    const start = async (t) => {
      await panel(t).locator('[data-yt="open"]').click();
      await panel(t).locator('.yt-form').waitFor();
    };
    const sendDevice = async (t, name = 'clip.mp4', size = 700 * KB) => {
      await panel(t).locator('[data-yt="file"]').setInputFiles(file(name, size));
      await panel(t).locator('[data-yt="send"]').click();
    };

    // ---------- 1. the links, and the panel folded ----------
    const t = await open();
    await t.screenshot({ path: path.join(out, '01-sheet.png') });
    const links = await panel(t).locator('.yt-links a').evaluateAll((l) => l.map((a) => [a.dataset.yt, a.getAttribute('href'), a.target, a.rel]));
    check('a link to the channel on YouTube, by its handle, in a new tab', JSON.stringify(links[0]) === JSON.stringify(['channel', 'https://www.youtube.com/@hedayh', '_blank', 'noopener noreferrer']), links);
    check('and one to its YouTube Studio', links[1]?.[1] === 'https://studio.youtube.com/channel/UCfixturechannel000000/videos', links);
    check('the panel says what a test is', (await panel(t).locator('.yt-lead').innerText()).includes('مقطعاً حقيقياً') && (await panel(t).locator('.yt-lead').innerText()).includes('لا يُنبَّه المشتركون'));
    check('folded until asked for', (await panel(t).locator('.yt-form').count()) === 0 && (await panel(t).locator('[data-yt="open"]').isVisible()));
    await start(t);
    const pressed = await panel(t).locator('.wk-seg [aria-pressed="true"]').allInnerTexts();
    check('a video, private, by default', JSON.stringify(pressed.map((s) => s.trim())) === JSON.stringify(['فيديو', 'خاص']), pressed);
    check('the title starts filled', (await panel(t).locator('.yt-f input').inputValue()) === 'تجربة نشر');
    check('nothing is sent without a video', await panel(t).locator('[data-yt="send"]').isDisabled());
    check('the file input itself is never shown, only the two buttons', !(await panel(t).locator('[data-yt="file"]').isVisible()));
    await t.screenshot({ path: path.join(out, '02-form.png') });

    // ---------- 2. a community post ----------
    await panel(t).getByRole('button', { name: 'منشور مجتمع' }).click();
    const note = await panel(t).locator('[data-yt="post-note"]').innerText();
    check('a community post is said plainly to be impossible for any outside application', note.includes('لا تتيح واجهة يوتيوب البرمجية') && note.includes('لأي تطبيق خارجي'), note);
    const postLink = panel(t).locator('[data-yt="post-open"]');
    check('it opens the channel\'s posts on YouTube, in a new tab', (await postLink.getAttribute('href')) === 'https://www.youtube.com/@hedayh/posts' && (await postLink.getAttribute('target')) === '_blank');
    check('not before there is text', (await postLink.getAttribute('aria-disabled')) === 'true');
    const text = 'منشور تجربة: شكراً لكل المتطوعين.';
    await panel(t).locator('.yt-f textarea').fill(text);
    const [popup] = await Promise.all([t.waitForEvent('popup'), postLink.click()]);
    await panel(t).locator('.pf-note.ok').waitFor();
    check('the text is copied', (await t.evaluate(() => navigator.clipboard.readText())) === text);
    check('and YouTube\'s posts page opened', popup.url() === 'https://www.youtube.com/@hedayh/posts', popup.url());
    await popup.close();
    check('nothing was sent to the site for a post', !(await calls(t)).some((c) => c.url.startsWith('/api/platforms/test')));
    await t.screenshot({ path: path.join(out, '03-post.png') });
    await panel(t).getByRole('button', { name: 'فيديو' }).click();

    // ---------- 3. a video from this device ----------
    await panel(t).locator('[data-yt="file"]').setInputFiles(file('clip.mp4', 700 * KB));
    const chipText = await panel(t).locator('[data-yt="picked"]').innerText();
    check('the chosen file is named with its size', chipText.includes('clip.mp4') && chipText.includes('من هذا الجهاز') && chipText.includes('0.7 ميغابايت'), chipText);
    await panel(t).locator('.yt-f input').fill('تجربة <خطأ>');
    check('a title YouTube refuses is caught before sending', (await panel(t).locator('.yt-sub.warn').innerText()).includes('<') && (await panel(t).locator('[data-yt="send"]').isDisabled()));
    await panel(t).locator('.yt-f input').fill('تجربة من الجهاز');
    await panel(t).locator('.yt-f textarea').fill('وصف قصير للتجربة.');
    check('the private button carries no hold', (await panel(t).locator('[data-yt="send"]').getAttribute('data-hold')) === null);
    await panel(t).locator('[data-yt="send"]').click();
    await panel(t).locator('[data-yt="done"]').waitFor();
    let c = await calls(t);
    const post = c.find((x) => x.method === 'POST' && x.url === '/api/platforms/test');
    check('the start names the account, the file\'s size and type, and the words', post && post.body.account === 'a-yt' && post.body.source === 'device' && post.body.size === 700 * KB && post.body.mime === 'video/mp4' && post.body.privacy === 'private' && post.body.title === 'تجربة من الجهاز' && post.body.description === 'وصف قصير للتجربة.' && !('asset' in post.body), post?.body);
    const pieces = c.filter((x) => x.method === 'PUT');
    check('the file goes in the agreed pieces, each from where the last ended', JSON.stringify(pieces.map((x) => [x.url.split('?')[1], x.bytes])) === JSON.stringify([['from=0', 256 * KB], ['from=262144', 256 * KB], ['from=524288', 188 * KB]]), pieces.map((x) => [x.url, x.bytes]));
    const done = await panel(t).locator('[data-yt="done"]').innerText();
    check('the result says it arrived, private, and that YouTube may need minutes', done.includes('وصل المقطع إلى القناة') && done.includes('(خاص)') && done.includes('دقائق'), done);
    check('with a link to watch it', (await panel(t).locator('[data-yt="done"] a').getAttribute('href')) === 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    const item = panel(t).locator('.yt-item').first();
    check('the list shows the test, published and private, by whom', (await item.innerText()).includes('تجربة من الجهاز') && (await item.innerText()).includes('منشور · خاص') && (await item.innerText()).includes('مدير الفحص'), await item.innerText());
    check('its delete asks for a hold, with the reason', (await item.getByRole('button', { name: 'حذف' }).getAttribute('data-hold')) === HOLD_DELETE);
    await t.screenshot({ path: path.join(out, '04-done.png') });

    // ---------- 4. a video from the library, public ----------
    await panel(t).getByRole('button', { name: 'إزالة الملف' }).click();
    await panel(t).getByRole('button', { name: 'عام' }).click();
    check('public says who sees it', (await panel(t).locator('.yt-sub').first().innerText()).includes('يراه كل من يزور القناة'));
    await panel(t).locator('[data-yt="library"]').click();
    const picker = t.locator('dialog.wk-modal[open]');
    await picker.locator('.wk-pick-list button').first().waitFor();
    const listed = await picker.locator('.wk-pick-list button').allInnerTexts();
    check('the library offers videos only', listed.length === 1 && listed[0].includes('مقطع الحملة.mp4'), listed);
    check('and says the server reads the file where it is', (await picker.innerText()).includes('يقرأ الخادم الملف من المكتبة مباشرة'));
    await picker.locator('.wk-pick-list button').first().click();
    check('the library file is named with its version', (await panel(t).locator('[data-yt="picked"]').innerText()).includes('من المكتبة · الإصدار 3'));
    const send = panel(t).locator('[data-yt="send"]');
    check('a public test says so and asks for a hold', (await send.innerText()).includes('نشر التجربة للعموم') && (await send.getAttribute('data-hold')) === HOLD_PUBLIC);
    await panel(t).locator('.yt-f input').fill('تجربة من المكتبة');
    const before = (await calls(t)).length;
    await send.click();
    await panel(t).locator('[data-yt="done"]').waitFor();
    c = (await calls(t)).slice(before);
    const lib = c.find((x) => x.method === 'POST');
    check('a library file is named by its id, never sent by the page', lib.body.source === 'library' && lib.body.asset === 'f-video' && !('size' in lib.body) && c.filter((x) => x.method === 'PUT').every((x) => x.bytes === 0), lib.body);
    check('three pieces, read by the server', c.filter((x) => x.method === 'PUT').length === 3);
    const kept = await panel(t).locator('[data-yt="done"]').innerText();
    check('asked public and kept private by YouTube: said, with where to change it', kept.includes('طلبت «عام» فأبقاه يوتيوب «خاص»') && kept.includes('YouTube Studio'), kept);

    // ---------- 5. delete ----------
    const first = panel(t).locator('.yt-item[data-state="published"]').last();
    const id = await first.getAttribute('data-test');
    await first.getByRole('button', { name: 'حذف' }).click();
    await panel(t).locator(`.yt-item[data-test="${id}"][data-state="deleted"]`).waitFor();
    check('a test is deleted from YouTube through the site, by its id', (await calls(t)).some((x) => x.method === 'DELETE' && x.url === `/api/platforms/test/${id}`));
    check('and the list says so', (await panel(t).locator(`.yt-item[data-test="${id}"]`).innerText()).includes('حُذف من يوتيوب'));
    check('said once', (await t.evaluate(() => window.__db.says)).some((s) => s.includes('حُذف «تجربة من الجهاز» من يوتيوب')));
    await t.screenshot({ path: path.join(out, '05-deleted.png') });
    check('nothing was loaded from outside the fixture except the posts page opened on purpose', outside.every((u) => u === 'https://www.youtube.com/@hedayh/posts'), outside);
    await t.context().close();

    // ---------- 5b. YouTube's four choices: unlisted, and scheduled (owner directive of 2026-11-05) ----------
    const ch = await open();
    await start(ch);
    const choices = await panel(ch).locator('[data-yt="choice"] button').allInnerTexts();
    check('four choices, in YouTube Studio\'s order', JSON.stringify(choices.map((x) => x.trim())) === JSON.stringify(['خاص', 'غير مدرج', 'عام', 'مجدول']), choices);
    await panel(ch).getByRole('button', { name: 'غير مدرج' }).click();
    check('unlisted says only who has the link sees it', (await panel(ch).locator('[data-yt="choice-sub"]').innerText()).includes('من معه الرابط فقط'));
    await panel(ch).locator('[data-yt="file"]').setInputFiles(file('unlisted.mp4', 300 * KB));
    await panel(ch).locator('.yt-f input').fill('تجربة غير مدرجة');
    const unl = panel(ch).locator('[data-yt="send"]');
    check('an unlisted test asks for no hold', (await unl.getAttribute('data-hold')) === null && (await unl.innerText()).includes('نشر التجربة'));
    let mark = (await calls(ch)).length;
    await unl.click();
    await panel(ch).locator('[data-yt="done"]').waitFor();
    const uPost = (await calls(ch)).slice(mark).find((x) => x.method === 'POST');
    check('it is sent unlisted, with no time', uPost.body.privacy === 'unlisted' && !('scheduled_for' in uPost.body), uPost.body);
    const uDone = await panel(ch).locator('[data-yt="done"]').innerText();
    check('the result says unlisted, and nothing was kept narrower', uDone.includes('(غير مدرج)') && !uDone.includes('طلبت'), uDone);
    check('the list shows it unlisted', (await panel(ch).locator('.yt-item').first().innerText()).includes('منشور · غير مدرج'));

    await panel(ch).getByRole('button', { name: 'إزالة الملف' }).click();
    check('no time field before «مجدول»', (await panel(ch).locator('[data-yt="when"]').count()) === 0);
    await panel(ch).getByRole('button', { name: 'مجدول' }).click();
    check('scheduled says YouTube makes it public at its time by itself', (await panel(ch).locator('[data-yt="choice-sub"]').innerText()).includes('يجعله يوتيوب عاماً بنفسه'));
    const whenField = panel(ch).locator('[data-yt="when"]');
    check('a date and time in Riyadh time', (await whenField.isVisible()) && (await panel(ch).locator('label:has([data-yt="when"])').innerText()).includes('بتوقيت الرياض'));
    await panel(ch).locator('[data-yt="file"]').setInputFiles(file('later.mp4', 300 * KB));
    await panel(ch).locator('.yt-f input:not([data-yt="when"])').fill('تجربة مجدولة');
    const sch = panel(ch).locator('[data-yt="send"]');
    check('nothing is scheduled without a time', (await sch.isDisabled()) && (await panel(ch).locator('.yt-sub.warn').innerText()).includes('اختر موعد النشر'));
    await whenField.fill(riyadhIn(5));
    check('a time sooner than ten minutes is refused before sending', (await sch.isDisabled()) && (await panel(ch).locator('.yt-sub.warn').innerText()).includes('10 دقائق'));
    await whenField.fill(riyadhIn(31 * 24 * 60));
    check('and one beyond thirty days', (await sch.isDisabled()) && (await panel(ch).locator('.yt-sub.warn').innerText()).includes('30 يوماً'));
    const slot = riyadhIn(2 * 24 * 60);
    await whenField.fill(slot);
    check('a scheduled test says so and asks for a hold, with the reason', !(await sch.isDisabled()) && (await sch.innerText()).includes('جدولة التجربة') && (await sch.getAttribute('data-hold')) === HOLD_SCHEDULED);
    await ch.screenshot({ path: path.join(out, '05b-scheduled-form.png') });
    mark = (await calls(ch)).length;
    await sch.click();
    await panel(ch).locator('[data-yt="done"]').waitFor();
    const sPost = (await calls(ch)).slice(mark).find((x) => x.method === 'POST');
    const asked = new Date(`${slot}:00+03:00`).toISOString();
    check('it is sent private, with the Riyadh time as an instant', sPost.body.privacy === 'private' && sPost.body.scheduled_for === asked, sPost.body);
    const sDone = await panel(ch).locator('[data-yt="done"]').innerText();
    check('the result says private until YouTube makes it public at its time', sDone.includes('وصل المقطع إلى القناة خاصاً') && sDone.includes('ويجعله يوتيوب عاماً') && sDone.includes('بتوقيت الرياض') && !sDone.includes('طلبت'), sDone);
    check('the list says when it becomes public', (await panel(ch).locator('.yt-item').first().innerText()).includes('مجدول · يصبح عاماً'), await panel(ch).locator('.yt-item').first().innerText());
    check('a scheduled test can be deleted before its time', (await panel(ch).locator('.yt-item').first().getByRole('button', { name: 'حذف' }).count()) === 1);
    await ch.screenshot({ path: path.join(out, '05c-scheduled-done.png') });

    // YouTube kept it private with no time: said, with where to set it.
    await panel(ch).getByRole('button', { name: 'إزالة الملف' }).click();
    await panel(ch).locator('[data-yt="file"]').setInputFiles(file('notime.mp4', 300 * KB));
    await panel(ch).locator('.yt-f input:not([data-yt="when"])').fill('بلا موعد');
    await sch.click();
    await panel(ch).locator('[data-yt="done"]').waitFor({ state: 'detached' }).catch(() => undefined);
    await panel(ch).locator('[data-yt="done"]').waitFor();
    await ch.waitForFunction(() => document.querySelector('[data-yt="done"]')?.textContent?.includes('بلا موعد'));
    const nDone = await panel(ch).locator('[data-yt="done"]').innerText();
    check('asked scheduled and YouTube kept no time: said, with where to set it', nDone.includes('طلبت «مجدول» فأبقاه يوتيوب «خاص» بلا موعد') && nDone.includes('YouTube Studio'), nDone);
    check('and the list says so', (await panel(ch).locator('.yt-item').first().innerText()).includes('أبقاه يوتيوب خاصاً بلا موعد'));
    await ch.context().close();

    // A piece lost on the way: the page asks where the upload stands and goes on.
    const fl = await open('?flaky=1');
    await start(fl);
    await sendDevice(fl);
    await panel(fl).locator('[data-yt="done"]').waitFor();
    const fc = (await calls(fl)).filter((x) => x.method === 'PUT').map((x) => x.url.split('?')[1]);
    check('a lost piece: asked, then sent again from the same byte, and the upload completes', JSON.stringify(fc) === JSON.stringify(['from=0', 'from=262144', 'from=262144&ask=1', 'from=262144', 'from=524288']), fc);
    await fl.context().close();

    // A cancel half way.
    const sl = await open('?slow=1');
    await start(sl);
    await sendDevice(sl, 'long.mp4', 1200 * KB);
    await panel(sl).locator('.yt-progress').waitFor();
    await sl.screenshot({ path: path.join(out, '06-sending.png') });
    check('the progress is shown with a way to cancel', (await panel(sl).locator('.yt-progress').innerText()).includes('جارٍ الرفع') && (await panel(sl).locator('[data-yt="cancel"]').isVisible()));
    await panel(sl).locator('[data-yt="cancel"]').click();
    await panel(sl).locator('[data-yt="error"]').waitFor();
    const sc = await calls(sl);
    check('a cancel stops the pieces and closes the test', (await panel(sl).locator('[data-yt="error"]').innerText()).includes('أُلغي الرفع') && sc.some((x) => x.method === 'DELETE') && sc.filter((x) => x.method === 'PUT').length < 5 && (await tests(sl))[0].error === 'CANCELLED', sc.map((x) => `${x.method} ${x.url}`));
    await sl.context().close();

    // A channel connected before the delete permission.
    const sp = await open('?scopes=upload');
    await start(sp);
    await sendDevice(sp);
    await panel(sp).locator('[data-yt="done"]').waitFor();
    const spItem = panel(sp).locator('.yt-item').first();
    check('without the permission there is no delete, only YouTube Studio', (await spItem.getByRole('button', { name: 'حذف' }).count()) === 0 && (await spItem.getByRole('link', { name: 'في Studio' }).getAttribute('href')) === 'https://studio.youtube.com/video/dQw4w9WgXcQ/edit');
    check('and it says why, with a reconnect', (await panel(sp).locator('.yt-list').innerText()).includes('يحتاج إذناً إضافياً من Google'));
    await sp.screenshot({ path: path.join(out, '07-no-delete.png') });
    await Promise.all([sp.waitForURL(/\/api\/platforms\/connect\/google$/), panel(sp).locator('[data-yt="reconnect"]').click()]);
    check('reconnect goes through Google\'s sign-in', (await sp.evaluate(() => document.body.innerText)).includes('sign-in /api/platforms/connect/google'));
    await sp.context().close();

    // A refusal from Google is said, with what to do.
    const rf = await open();
    await start(rf);
    await panel(rf).locator('.yt-f input').fill('أعد الربط');
    await sendDevice(rf);
    await panel(rf).locator('[data-yt="error"]').waitFor();
    check('a refusal is said in words, with a reconnect where that is the cure', (await panel(rf).locator('[data-yt="error"]').innerText()).includes('أعد ربط القناة') && (await panel(rf).locator('[data-yt="error"] button').innerText()).includes('إعادة الربط'));
    await rf.context().close();

    // ---------- 6. who sees it ----------
    const pb = await open('?role=publisher');
    check('the account\'s own publisher sees the panel', await panel(pb).isVisible());
    await pb.context().close();
    const ot = await open('?role=other');
    check('a publisher who is not on the account does not', (await panel(ot).count()) === 0 && (await sheet(ot).getByRole('button', { name: 'فحص الاتصال' }).isVisible()));
    await ot.context().close();
    const off = await open('?off=1');
    check('a channel that needs reconnecting is not tested', (await panel(off).innerText()).includes('القناة غير متصلة الآن') && (await panel(off).locator('[data-yt="open"]').count()) === 0);
    await off.context().close();

    // Phone and evening.
    const ph = await open('', { width: 375, height: 812 });
    await start(ph);
    await panel(ph).locator('[data-yt="file"]').setInputFiles(file('a-rather-long-file-name-for-a-phone-screen.mp4', 300 * KB));
    await panel(ph).scrollIntoViewIfNeeded();
    await ph.screenshot({ path: path.join(out, '08-phone.png'), fullPage: true });
    check('phone: nothing sideways with the form open', await fits(ph));
    const tap = await panel(ph).locator('[data-yt="send"]').boundingBox();
    check('phone: the send button is a comfortable size', tap && tap.height >= 40, tap);
    await ph.context().close();
    const dk = await open('?dark=1');
    await start(dk);
    await sendDevice(dk);
    await panel(dk).locator('[data-yt="done"]').waitFor();
    await dk.screenshot({ path: path.join(out, '09-evening.png') });
    const ink = await dk.evaluate(() => {
      const n = document.querySelector('dialog[open] [data-yt="done"]');
      const s = getComputedStyle(n);
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
  process.exitCode = finish(path.join(__dirname, 'youtube-test-flow.json')) ? 1 : 0;
})();

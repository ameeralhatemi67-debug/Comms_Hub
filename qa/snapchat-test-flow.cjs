// Browser check of «تجربة النشر» on Snapchat (Snapchat_Test_Plan.md), in Edge: the real «حسابات المنصات» page, sheet and panel
// (qa/fixtures/snapchat-test-flow.tsx), with stand-ins for the database, the Drive upload and the site's /api/platforms/test routes in
// front of a small fake Snap, because the page needs a signed-in person and no bypass is allowed.
//   1. The panel: the allowlist note, folded until asked, the four choices with the check by default; the check posts nothing, needs no
//      file and no long press, and shows its numbers (and what Snap would not give); nothing is recorded as a test.
//   2. The silent check from the library: it says a scheduled Spotlight shown to nobody is NOT proven, before and after; deleted and
//      not-deleted outcomes, and deleting a leftover.
//   3. A Spotlight from the device: long press, description and its counter, the Drive upload, the status, the numbers read, the delete.
//   4. A Story: its warning, a long press, no delete offered, and the sentence that it ends by itself.
//   5. The file's limits refused before anything is sent: type, size, shorter than 5 seconds, longer than 5 minutes, a description too long.
//   6. Refusals in words (Snap not allowing the app, an expired token with «إعادة الربط», a refused post with Snap's own line); a cancel
//      while the file goes to Drive; who sees the panel; an account that needs reconnecting.
//   7. English isolated, no emoji, no token or address on the page, only the site's routes and Drive called; a phone; the evening theme.
// What this cannot check: Snap itself (nothing here has met it), the database's rules (supabase/tests/platform_tests_snapchat_rules.sql),
// and the routes (tests/snapchat-test.test.mjs).
// Usage: node qa/snapchat-test-flow.cjs   (writes qa/snapchat-test-flow.json, screenshots in qa/artifacts/snapchat-test-flow/)
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { execFileSync } = require('node:child_process');
const esbuild = require('esbuild');
const { dependency, launchOptions } = require('./runtime.cjs');
const { chromium } = dependency('playwright');
const h = require('./android-helpers.cjs');

const { check, note, finish } = h.record('qa/snapchat-test-flow.cjs');
const out = path.join(__dirname, 'artifacts', 'snapchat-test-flow');
const fixtures = path.join(__dirname, 'fixtures');
const css = ['globals', 'identity', 'media', 'kit', 'work', 'chat', 'auth', 'permissions']
  .map((f) => fs.readFileSync(path.join(h.root, 'src', 'app', `${f}.css`), 'utf8'))
  .join('\n')
  .replace(/@import[^;]+;/g, '')
  .replace(/@theme\{[^}]*\}/g, '');
const page = (dark) =>
  `<!doctype html><html lang="ar" dir="rtl" data-identity="emerald"${dark ? ' data-theme="dark"' : ''}><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>حسابات المنصات</title>` +
  `<style>${css}</style><style>body{font-family:"Segoe UI",Tahoma,sans-serif}main{max-width:1120px;margin:auto;padding:16px}</style></head><body><div id="root"></div><script type="module" src="/flow.js"></script></body></html>`;
const HOLD_SPOT = 'يراه كل من يزور الملف العام على Snapchat وفي Spotlight فور نشره. يمكن حذفه من القائمة بعد ذلك.';
const HOLD_STORY = 'يراها متابعو الحساب 24 ساعة، ولا يمكن حذفها: تنتهي وحدها.';
const HOLD_DELETE = 'يُحذف السبوتلايت من الملف العام على Snapchat نهائياً، ولا يُسترجع.';

const sheet = (t) => t.locator('dialog.pf-sheet[open]');
const panel = (t) => sheet(t).locator('.yt-test');
const calls = (t) => t.evaluate(() => window.__db.calls);
const tests = (t) => t.evaluate(() => window.__db.tests);
const fits = (t) => t.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const flat = (s) => s.replace(/[,٬،]/g, '');
const posts = (cs) => cs.filter((x) => x.method === 'POST' && x.url === '/api/platforms/test');

// Real short clips (the panel reads a video's length in the browser), made with FFmpeg when the machine has it.
function ffmpegPath() {
  for (const c of [process.env.FFMPEG, path.join(h.root, 'desktop', 'vendor', 'ffmpeg', 'ffmpeg.exe'), 'ffmpeg']) {
    if (!c) continue;
    try {
      execFileSync(c, ['-hide_banner', '-version'], { stdio: 'ignore' });
      return c;
    } catch {
      // try the next
    }
  }
  return null;
}
function makeClip(ff, file, seconds) {
  for (const enc of ['libx264', 'h264_mf']) {
    try {
      execFileSync(ff, ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=128x128:r=2', '-t', String(seconds), '-an', '-c:v', enc, '-pix_fmt', 'yuv420p', '-movflags', '+faststart', file], { stdio: 'ignore' });
      return fs.existsSync(file) && fs.statSync(file).size > 0;
    } catch {
      // try the next encoder
    }
  }
  return false;
}

(async () => {
  let fixture;
  const errs = [];
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });

  const ff = ffmpegPath();
  const clipDir = path.join(out, 'clips');
  fs.mkdirSync(clipDir, { recursive: true });
  const made = ff ? { ok: makeClip(ff, path.join(clipDir, 'ok.mp4'), 10), short: makeClip(ff, path.join(clipDir, 'short.mp4'), 3), long: makeClip(ff, path.join(clipDir, 'long.mp4'), 301) } : null;
  const clips = made && made.ok && made.short && made.long ? { ok: fs.readFileSync(path.join(clipDir, 'ok.mp4')), short: path.join(clipDir, 'short.mp4'), long: path.join(clipDir, 'long.mp4') } : null;
  if (!clips) note('FFmpeg was not found or could not make the three clips: the checks that need a real video length (chip length, shorter than 5 seconds, longer than 5 minutes) were skipped.');
  const okBytes = clips ? clips.ok : Buffer.alloc(300 * 1024, 7);
  const served = clips ? { 'f-ok': path.join(clipDir, 'ok.mp4'), 'f-mov': path.join(clipDir, 'ok.mp4'), 'f-big': path.join(clipDir, 'ok.mp4'), 'f-short': clips.short, 'f-long': clips.long } : {};
  const device = (name = 'مقطع-الاختبار.mp4', mimeType = 'video/mp4', buffer = okBytes) => ({ name, mimeType, buffer });

  const browser = await chromium.launch(launchOptions);
  try {
    const fake = path.join(fixtures, 'fake-snapchat-test.tsx');
    await esbuild.build({
      entryPoints: [path.join(fixtures, 'snapchat-test-flow.tsx')],
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
      // The library's own file route, answering with the clip that stands for the file (byte ranges, as the real one does).
      const m = /^\/api\/media\/([^/]+)\/content$/.exec(url.pathname);
      if (m && served[m[1]]) {
        const buf = fs.readFileSync(served[m[1]]);
        const r = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range ?? '');
        if (r) {
          const a = Number(r[1]);
          const z = r[2] ? Math.min(Number(r[2]), buf.length - 1) : buf.length - 1;
          res.writeHead(206, { 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes', 'Content-Range': `bytes ${a}-${z}/${buf.length}`, 'Content-Length': z - a + 1 });
          return res.end(buf.subarray(a, z + 1));
        }
        res.writeHead(200, { 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes', 'Content-Length': buf.length });
        return res.end(buf);
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
      // Nothing leaves the fixture: Snap's pages are recorded, never loaded.
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
      await panel(t).locator('[data-sn="open"]').click();
      await panel(t).locator('.yt-form').waitFor();
    };
    const choose = (t, c) => panel(t).locator(`[data-sn-choice="${c}"]`).click();
    const dropFile = async (t) => {
      if (await panel(t).locator('[data-sn="picked"]').count()) await panel(t).getByRole('button', { name: 'إزالة الملف' }).click();
    };
    const pickLibrary = async (t, name) => {
      await dropFile(t);
      await panel(t).locator('[data-sn="library"]').click();
      const picker = t.locator('dialog.wk-modal[open]');
      await picker.locator('.wk-pick-list button').first().waitFor();
      await picker.locator('.wk-pick-list button', { hasText: name }).click();
      await panel(t).locator('[data-sn="picked"]').waitFor();
    };
    const pickDevice = async (t, file = device()) => {
      await dropFile(t);
      await panel(t).locator('[data-sn="file"]').setInputFiles(file);
      await panel(t).locator('[data-sn="picked"]').waitFor();
    };
    const result = (t, which = '[data-sn="done"], [data-sn="silent"], [data-sn="check"], [data-sn="error"]') => panel(t).locator(which).first().waitFor({ timeout: 20000 });
    // The text nodes of the panel that hold English not set apart in a <bdi>.
    const bare = (t) =>
      t.evaluate(() => {
        const root = document.querySelector('dialog[open] .yt-test');
        const found = [];
        const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        for (let n = walk.nextNode(); n; n = walk.nextNode()) {
          if (/[A-Za-z]{2,}/.test(n.nodeValue) && !n.parentElement.closest('bdi, textarea, input, option, script, style, .yt-pth')) found.push(n.nodeValue.trim().slice(0, 80));
        }
        return found;
      });

    // ---------- 1. the panel and the check ----------
    const t = await open();
    check('the panel is titled for Snapchat', (await panel(t).locator('h4').innerText()) === 'تجربة النشر على Snapchat');
    const lead = await panel(t).locator('.yt-lead').innerText();
    check('it says Snap\'s API is open only to apps Snap allowed, so a check may say Snap refused', lead.includes('أذنت لها') && lead.includes('وحدها') && lead.includes('رفضت'), lead);
    check('folded until asked for, and nothing asked of the site before', (await panel(t).locator('.yt-form').count()) === 0 && (await calls(t)).filter((x) => x.url === '/api/platforms/test').length === 0);
    await start(t);
    const labels = (await panel(t).locator('.wk-seg button').allInnerTexts()).map((s) => s.trim());
    check('four choices in the order the plan gives', JSON.stringify(labels) === JSON.stringify(['فحص الحساب بلا نشر', 'فحص صامت', 'سبوتلايت', 'قصة']), labels);
    const pressed = (await panel(t).locator('.wk-seg [aria-pressed="true"]').allInnerTexts()).map((s) => s.trim());
    check('the check without posting is the default', JSON.stringify(pressed) === JSON.stringify(['فحص الحساب بلا نشر']), pressed);
    const send = panel(t).locator('[data-sn="send"]');
    check('the check needs no file, no description and no long press, and is ready to send', (await panel(t).locator('[data-sn="file"]').count()) === 0 && (await panel(t).locator('[data-sn="description"]').count()) === 0 && (await send.getAttribute('data-hold')) === null && !(await send.isDisabled()));
    check('it says it posts nothing', (await panel(t).locator('[data-sn="choice-lead"]').innerText()).includes('لا ينشر شيئاً'));
    await t.screenshot({ path: path.join(out, '01-form.png') });
    await send.click();
    await result(t, '[data-sn="check"], [data-sn="error"]');
    let c = await calls(t);
    const ck = posts(c)[0];
    check('the check sends the account and the check kind and nothing else', JSON.stringify(ck.body) === JSON.stringify({ account: 'a-sn', kind: 'snap_check' }), ck.body);
    const ckText = flat(await panel(t).locator('[data-sn="check"]').innerText());
    check('it shows the profile: name, handle and subscribers', ckText.includes('هداية') && ckText.includes('@hedayah.team') && ckText.includes('المشتركون: 4210'), ckText);
    check('it shows the Spotlights read, by status, and the Stories', ckText.includes('المقروء: 5 · ظاهر: 3 · ينتظر: 1 · مرفوض: 1') && ckText.includes('المقروء: 2'), ckText);
    check('it shows the account\'s lifetime numbers', ckText.includes('المشاهدات 52000 · المشاهدون 31000 · المشاركات 410 · لقطات الشاشة 87'), ckText);
    check('it says the numbers arrive about a day late and reach back 90 days', ckText.includes('بعد نحو يوم') && ckText.includes('90 يوماً'));
    check('it says what the server noted', ckText.includes('قرأ الفحص آخر خمسة سبوتلايت'));
    check('a check leaves no test row, no list and no file call', (await tests(t)).length === 0 && (await panel(t).locator('[data-sn="list"]').count()) === 0 && !c.some((x) => x.url.startsWith('/drive-upload/')));
    await t.screenshot({ path: path.join(out, '02-check.png'), fullPage: true });

    // ---------- 2. the silent check ----------
    await choose(t, 'silent');
    const unproven = await panel(t).locator('[data-sn="unproven"]').innerText();
    check('the silent check says plainly that hiding a scheduled Spotlight is not proven', unproven.includes('لم يثبت') && unproven.includes('لم يُجرَّب'), unproven);
    const cl = await panel(t).locator('[data-sn="choice-lead"]').innerText();
    check('and says it schedules 14 days ahead, reads it back and deletes it at once', cl.includes('14') && cl.includes('يقرؤه') && cl.includes('يحذفه فوراً'), cl);
    check('the silent check needs no long press, and waits for a file', (await send.getAttribute('data-hold')) === null && (await send.isDisabled()) && (await send.innerText()).includes('تشغيل الفحص الصامت'));
    check('a silent check takes no description', (await panel(t).locator('[data-sn="description"]').count()) === 0);
    await pickLibrary(t, 'مقطع مناسب');
    if (clips) check('the chosen library video shows its length, read in the browser', (await panel(t).locator('[data-sn="picked"]').innerText()).includes('0:10'));
    check('and its size from the library', (await panel(t).locator('[data-sn="picked"]').innerText()).includes('6.0 ميغابايت'));
    await t.screenshot({ path: path.join(out, '03-silent-form.png'), fullPage: true });
    let before = (await calls(t)).length;
    await send.click();
    await result(t, '[data-sn="silent"], [data-sn="error"]');
    c = (await calls(t)).slice(before);
    const sb = posts(c)[0].body;
    check('one request names the silent kind and the library file, with no words and no size', sb.kind === 'snap_silent' && sb.source === 'library' && sb.asset === 'f-ok' && !('description' in sb) && !('size' in sb) && !('mime' in sb), sb);
    check('a library file is never uploaded by the page', !c.some((x) => x.url.startsWith('/drive-upload/')));
    const sr = await panel(t).locator('[data-sn="silent"]').innerText();
    check('the result says it was made, read and deleted before its time', sr.includes('أُنشئ سبوتلايت مجدول') && sr.includes('وقُرئ من Snap') && sr.includes('حُذف قبل موعده'), sr);
    check('the result does not claim nobody saw it, and says that was not tried', !sr.includes('لم يظهر لأحد') && sr.includes('لم يُجرَّب'), sr);
    const sItem = panel(t).locator('.yt-item[data-kind="snap_silent"]').first();
    check('the list says so, with nothing to delete', (await sItem.innerText()).includes('وحُذف قبل موعده') && (await sItem.getByRole('button').count()) === 0);
    await t.screenshot({ path: path.join(out, '04-silent-done.png'), fullPage: true });

    // ---------- 3. a Spotlight from the device ----------
    await choose(t, 'spotlight');
    const spotLead = await panel(t).locator('[data-sn="choice-lead"]').innerText();
    check('a Spotlight says it is public and can be deleted after', spotLead.includes('علنياً') && spotLead.includes('يمكن حذفه'), spotLead);
    check('a Spotlight takes a description, and asks for a long press with its own reason', (await panel(t).locator('[data-sn="description"]').count()) === 1 && (await send.getAttribute('data-hold')) === HOLD_SPOT);
    await pickDevice(t, device('سبوتلايت.mp4'));
    if (clips) check('a device video shows its length too', (await panel(t).locator('[data-sn="picked"]').innerText()).includes('0:10') && (await panel(t).locator('[data-sn="picked"]').innerText()).includes('من هذا الجهاز'));
    await panel(t).locator('[data-sn="description"]').fill('تجربة سبوتلايت');
    check('the description counts its characters, in words that read the same either way', (await panel(t).locator('[data-sn="count"]').innerText()).trim() === `${[...'تجربة سبوتلايت'].length} من 100`);
    await panel(t).locator('[data-sn="description"]').fill('ا'.repeat(101));
    check('a description over 100 characters is refused before sending', (await send.isDisabled()) && (await panel(t).locator('[data-sn="problem"]').innerText()).includes('أطول من 100 حرف'));
    await panel(t).locator('[data-sn="description"]').fill('تجربة سبوتلايت');
    check('and sending is ready again once it fits', !(await send.isDisabled()));
    await t.screenshot({ path: path.join(out, '05-spotlight-form.png'), fullPage: true });
    before = (await calls(t)).length;
    await send.click();
    await result(t);
    c = (await calls(t)).slice(before);
    const spb = posts(c)[0].body;
    check('the start carries the kind, the words, and the device file\'s size and type', spb.kind === 'snap_spotlight' && spb.description === 'تجربة سبوتلايت' && spb.source === 'device' && spb.size === okBytes.length && spb.mime === 'video/mp4', spb);
    check('the file goes to Drive whole, then is registered by its Drive id', c.some((x) => x.url.startsWith('/drive-upload/') && x.bytes === okBytes.length) && c.some((x) => x.body?.step === 'uploaded' && /^drivefileSNFIXTURE/.test(x.body.ref)));
    check('the page asks nothing more: the post is the answer of the registration', !c.some((x) => x.body?.step === 'advance'));
    const dn = await panel(t).locator('[data-sn="done"]').innerText();
    check('the result says it was posted, with Snap\'s status, and where it can be deleted and read', dn.includes('نُشر السبوتلايت') && dn.includes('أُرسل إلى Snap وينتظر') && dn.includes('يمكن حذفه'), dn);
    const spRow = panel(t).locator('.yt-item[data-kind="snap_spotlight"]').first();
    check('the list shows it published under its description, with «قراءة الأرقام» and a held «حذف»', (await spRow.innerText()).includes('تجربة سبوتلايت') && (await spRow.innerText()).includes('نُشر على Snap') && (await spRow.locator('[data-sn="stats"]').count()) === 1 && (await spRow.locator('[data-sn="delete"]').getAttribute('data-hold')) === HOLD_DELETE);
    const spId = await spRow.getAttribute('data-test');
    await spRow.locator('[data-sn="stats"]').click();
    await spRow.locator('[data-sn="numbers"]').waitFor();
    c = await calls(t);
    check('reading the numbers asks the stats step of that test', c.some((x) => x.method === 'POST' && x.url === `/api/platforms/test/${spId}` && x.body?.step === 'stats'));
    const nums = flat(await spRow.locator('[data-sn="numbers"]').innerText());
    check('the numbers are shown in the row', nums.includes('المشاهدات 128') && nums.includes('المشاهدون 97') && nums.includes('المشاركات 6') && nums.includes('لقطات الشاشة 2'), nums);
    check('and the note that Snap\'s numbers arrive about a day late stands under them', (await spRow.locator('[data-sn="numbers-note"]').innerText()).includes('بعد نحو يوم'));
    await t.screenshot({ path: path.join(out, '06-spotlight-list.png'), fullPage: true });
    await spRow.locator('[data-sn="delete"]').click();
    await panel(t).locator(`.yt-item[data-test="${spId}"][data-state="deleted"]`).waitFor();
    check('a Spotlight is deleted through the site, and the list says so, with nothing left to press', (await calls(t)).some((x) => x.method === 'DELETE' && x.url === `/api/platforms/test/${spId}`) && (await panel(t).locator(`.yt-item[data-test="${spId}"]`).innerText()).includes('حُذف من Snap') && (await panel(t).locator(`.yt-item[data-test="${spId}"]`).getByRole('button').count()) === 0);

    // ---------- 4. a Story ----------
    await choose(t, 'story');
    const warn = await panel(t).locator('[data-sn="story-warn"]').innerText();
    check('a Story warns it cannot be deleted and ends by itself after 24 hours', warn.includes('لا يمكن حذف القصة') && warn.includes('24 ساعة') && warn.includes('تنتهي وحدها'), warn);
    check('a Story takes no description, and asks for a long press with its own reason', (await panel(t).locator('[data-sn="description"]').count()) === 0 && (await send.getAttribute('data-hold')) === HOLD_STORY);
    await pickLibrary(t, 'مقطع مناسب');
    before = (await calls(t)).length;
    await send.click();
    await result(t);
    c = (await calls(t)).slice(before);
    const stb = posts(c)[0].body;
    check('the Story is sent by its library id, with no words', stb.kind === 'snap_story' && stb.source === 'library' && stb.asset === 'f-ok' && !('description' in stb), stb);
    const sd = await panel(t).locator('[data-sn="done"]').innerText();
    check('the result says it ends by itself and cannot be deleted', sd.includes('نُشرت القصة') && sd.includes('تنتهي وحدها') && sd.includes('لا تتيح Snap حذف القصة'), sd);
    const stRow = panel(t).locator('.yt-item[data-kind="snap_story"]').first();
    const stText = await stRow.innerText();
    check('the Story\'s row says it ends by itself, and offers neither delete nor numbers', stText.includes('تنتهي وحدها') && (await stRow.getByRole('button').count()) === 0, stText);
    check('and the list says once that Snap lets no application delete a Story', (await panel(t).locator('[data-sn="story-note"]').count()) === 1);
    await t.screenshot({ path: path.join(out, '07-story-done.png'), fullPage: true });
    check('everything the page called is the site\'s routes or Drive\'s upload', (await calls(t)).every((x) => x.url === '/api/platforms/check' || x.url.startsWith('/api/platforms/test') || x.url.startsWith('/drive-upload/')));
    check('nothing was loaded from outside the fixture', outside.length === 0, outside);
    const html = await panel(t).innerHTML();
    check('the page holds no token, key, secret or Snap address', !/access_token|refresh_token|MAIL_SERVER_KEY|client_secret|businessapi|accounts\.snapchat/i.test(html));
    check('no emoji anywhere in the panel', !/\p{Extended_Pictographic}/u.test(await panel(t).innerText()));
    const loose = await bare(t);
    check('English in the panel (Snap, Snapchat, MP4, Spotlight) is set apart in its own isolate', loose.length === 0, loose);
    // A control for that check: a bare English word planted in the panel is found, and one in a <bdi> is not.
    await t.evaluate(() => {
      const p = document.querySelector('dialog[open] .yt-test');
      p.insertAdjacentHTML('beforeend', '<p id="plant">كلمة Snap مكشوفة <bdi>Snap</bdi></p>');
    });
    check('the English check is not vacuous: it finds a bare word and passes a bdi', JSON.stringify(await bare(t)) === JSON.stringify(['كلمة Snap مكشوفة']), await bare(t));
    await t.evaluate(() => document.getElementById('plant').remove());
    await t.context().close();

    // ---------- 5. the file's limits, refused before anything is sent ----------
    const lm = await open();
    await start(lm);
    await choose(lm, 'spotlight');
    const sendLm = panel(lm).locator('[data-sn="send"]');
    const refuse = async (what, words) => {
      const problem = panel(lm).locator('[data-sn="problem"]');
      await problem.waitFor();
      check(`${what}: refused before sending, in words`, (await sendLm.isDisabled()) && (await problem.innerText()).includes(words), await problem.innerText());
    };
    await pickDevice(lm, device('مقطع.mov', 'video/quicktime'));
    await refuse('a file that is not MP4', 'تقبل Snap هنا الفيديو MP4');
    await pickLibrary(lm, 'بصيغة أخرى');
    await refuse('a library video that is not MP4', 'تقبل Snap هنا الفيديو MP4');
    await pickLibrary(lm, 'مقطع كبير');
    await refuse('a video over 30 MiB', 'حتى 30 ميغابايت');
    if (clips) {
      await pickLibrary(lm, 'مقطع قصير');
      await refuse('a video shorter than 5 seconds', 'أقصر من 5 ثوانٍ');
      await pickLibrary(lm, 'مقطع طويل');
      await refuse('a video longer than 5 minutes', 'أطول من 5 دقائق');
    }
    check('none of them sent a request', posts(await calls(lm)).length === 0);
    await pickLibrary(lm, 'مقطع مناسب');
    check('a video that fits makes sending ready again', !(await sendLm.isDisabled()) && (await panel(lm).locator('[data-sn="problem"]').count()) === 0);
    await lm.screenshot({ path: path.join(out, '08-limits.png'), fullPage: true });
    await lm.context().close();

    // ---------- 6. refusals, a cancel, who sees it ----------
    const pt = await open('?partial=1');
    await start(pt);
    await panel(pt).locator('[data-sn="send"]').click();
    await result(pt, '[data-sn="check"], [data-sn="error"]');
    const ptText = await panel(pt).locator('[data-sn="check"]').innerText();
    check('a part Snap would not give is said so, three times, never drawn as zero', (ptText.match(/لم تعطِ Snap هذا الجزء/g) ?? []).length === 3 && ptText.includes('غير متاح'), ptText);
    await pt.context().close();

    const rf = await open('?refuse=1');
    await start(rf);
    await panel(rf).locator('[data-sn="send"]').click();
    await result(rf, '[data-sn="error"], [data-sn="check"]');
    const rfText = await panel(rf).locator('[data-sn="error"]').innerText();
    check('Snap not allowing the app is said in words, with where to look', rfText.includes('رفضت Snap قراءة الملف العام') && rfText.includes('آخر خطوة في إعداد سناب شات'), rfText);
    check('and it does not offer a reconnect, which would not help', (await panel(rf).locator('[data-sn="error"]').getByRole('button').count()) === 0);
    check('the English of that refusal is isolated', (await bare(rf)).length === 0, await bare(rf));
    await rf.screenshot({ path: path.join(out, '09-refused.png'), fullPage: true });
    await rf.context().close();

    const ex = await open('?expired=1');
    await start(ex);
    await panel(ex).locator('[data-sn="send"]').click();
    await result(ex, '[data-sn="error"], [data-sn="check"]');
    const reconnect = panel(ex).locator('[data-sn="error"]').getByRole('button', { name: 'إعادة الربط' });
    check('an expired token is said, and offers «إعادة الربط»', (await panel(ex).locator('[data-sn="error"]').innerText()).includes('انتهى الرمز') && (await reconnect.count()) === 1);
    const asked = ex.waitForRequest((r) => r.url().includes('/api/platforms/connect/snapchat'), { timeout: 10000 }).then(() => true, () => false);
    await reconnect.click();
    check('and pressing it starts Snapchat\'s own sign-in at the site\'s connect route', await asked);
    await ex.context().close();

    const pr = await open();
    await start(pr);
    await choose(pr, 'spotlight');
    await pickDevice(pr, device('مرفوض.mp4'));
    await panel(pr).locator('[data-sn="description"]').fill('ارفض');
    await panel(pr).locator('[data-sn="send"]').click();
    await panel(pr).locator('[data-sn="error"]').waitFor({ timeout: 20000 });
    const prText = await panel(pr).locator('[data-sn="error"]').innerText();
    check('a refused post is said in words, with Snap\'s own line beside them', prText.includes('رفضت Snap النشر') && prText.includes('(snap http 403)'), prText);
    await panel(pr).locator('.yt-item[data-state="failed"]').first().waitFor();
    check('the list keeps the refusal on the failed test', (await panel(pr).locator('.yt-item[data-state="failed"]').first().innerText()).includes('لم يكتمل: رفضت Snap النشر'));
    check('and a failed test offers nothing to press', (await panel(pr).locator('.yt-item[data-state="failed"]').first().getByRole('button').count()) === 0);
    await pr.context().close();

    const nd = await open('?nodelete=1');
    await start(nd);
    await choose(nd, 'silent');
    await pickLibrary(nd, 'مقطع مناسب');
    await panel(nd).locator('[data-sn="send"]').click();
    await result(nd, '[data-sn="silent"], [data-sn="error"]');
    const ndText = await panel(nd).locator('[data-sn="silent"]').innerText();
    check('a silent check Snap would not delete says so and where to delete it', ndText.includes('رفضت حذفه') && ndText.includes('قبل موعده') && ndText.includes('إن بقي نُشر'), ndText);
    const left = panel(nd).locator('.yt-item[data-kind="snap_silent"]').first();
    const leftText = await left.innerText();
    check('the list says it is not deleted yet and when it would be posted, and offers a held delete', leftText.includes('لم يُحذف بعد') && leftText.includes('نُشر') && (await left.locator('[data-sn="delete"]').getAttribute('data-hold')) === HOLD_DELETE, leftText);
    check('a left-over silent check has no numbers to read', (await left.locator('[data-sn="stats"]').count()) === 0);
    await nd.screenshot({ path: path.join(out, '10-not-deleted.png'), fullPage: true });
    await left.locator('[data-sn="delete"]').click();
    await panel(nd).locator('.yt-item[data-kind="snap_silent"][data-state="deleted"]').waitFor();
    check('and deleting it from the list works', (await tests(nd))[0].state === 'deleted');
    await nd.context().close();

    const ns = await open('?nostats=1');
    await start(ns);
    await choose(ns, 'spotlight');
    await pickLibrary(ns, 'مقطع مناسب');
    await panel(ns).locator('[data-sn="send"]').click();
    await result(ns);
    await panel(ns).locator('[data-sn="stats"]').first().click();
    await panel(ns).locator('[data-sn="row-note"]').waitFor();
    check('numbers Snap has not given yet are said in words, in the row', (await panel(ns).locator('[data-sn="row-note"]').innerText()).includes('لم تعطِ Snap أرقاماً لهذا المنشور بعد') && (await panel(ns).locator('[data-sn="numbers"]').count()) === 0);
    await ns.context().close();

    const sl = await open('?slowdrive=1');
    await start(sl);
    await choose(sl, 'spotlight');
    await pickDevice(sl, device('بطيء.mp4'));
    await panel(sl).locator('[data-sn="send"]').click();
    await panel(sl).locator('[data-sn="cancel"]').waitFor({ timeout: 20000 });
    check('while the file goes to Drive the page shows its progress and offers a cancel', (await panel(sl).locator('[data-sn="progress"]').innerText()).includes('يُرفع الملف'));
    await panel(sl).locator('[data-sn="cancel"]').click();
    await panel(sl).locator('[data-sn="error"]').waitFor({ timeout: 20000 });
    check('a cancel closes the test', (await panel(sl).locator('[data-sn="error"]').innerText()).includes('أُلغي الرفع') && (await tests(sl))[0].error === 'CANCELLED' && (await calls(sl)).some((x) => x.method === 'DELETE'));
    await sl.context().close();

    const pb = await open('?role=publisher');
    check('the account\'s own publisher sees the panel', await panel(pb).isVisible());
    await pb.context().close();
    const ot = await open('?role=other');
    check('a publisher who is not on the account does not', (await panel(ot).count()) === 0);
    await ot.context().close();
    const off = await open('?off=1');
    check('an account that needs reconnecting is not tested', (await panel(off).innerText()).includes('الحساب غير متصل الآن') && (await panel(off).locator('[data-sn="open"]').count()) === 0);
    await off.context().close();

    // ---------- 7. phone, evening ----------
    const ph = await open('', { width: 375, height: 812 });
    await start(ph);
    await choose(ph, 'spotlight');
    await pickDevice(ph, device('مقطع-باسم-طويل-جداً-لشاشة-الهاتف-يتجاوز-عرضها.mp4'));
    await panel(ph).locator('[data-sn="description"]').fill('وصف طويل يمتد على أكثر من سطر في شاشة الهاتف الضيقة ليرى المصمم كيف يلتف');
    await ph.screenshot({ path: path.join(out, '11-phone.png'), fullPage: true });
    check('phone: nothing sideways with the Spotlight form open', await fits(ph));
    await choose(ph, 'check');
    await panel(ph).locator('[data-sn="send"]').click();
    await result(ph, '[data-sn="check"], [data-sn="error"]');
    await ph.screenshot({ path: path.join(out, '12-phone-check.png'), fullPage: true });
    check('phone: nothing sideways with the check\'s numbers shown', await fits(ph));
    await ph.context().close();

    const dk = await open('?dark=1');
    await start(dk);
    await choose(dk, 'story');
    await pickLibrary(dk, 'مقطع مناسب');
    await panel(dk).locator('[data-sn="send"]').click();
    await result(dk);
    await dk.screenshot({ path: path.join(out, '13-evening.png'), fullPage: true });
    const ink = await dk.evaluate(() => {
      const s = getComputedStyle(document.querySelector('dialog[open] [data-sn="done"]'));
      const w = getComputedStyle(document.querySelector('dialog[open] [data-sn="story-warn"]'));
      return [s.backgroundColor, s.color, w.color, getComputedStyle(document.querySelector('dialog[open]')).backgroundColor];
    });
    check('evening: the result is readable on its own ground, and the warning on the sheet\'s', ink[0] !== ink[1] && ink[1] !== 'rgb(0, 0, 0)' && ink[2] !== ink[3], ink.join(' / '));
    await dk.context().close();

    check('no page error and nothing in the console', errs.length === 0, errs.slice(0, 3).join(' | '));
  } catch (e) {
    check('the flow ran to its end', false, String(e.message ?? e).slice(0, 500));
  } finally {
    await browser.close();
    fixture?.close();
  }
  process.exitCode = finish(path.join(__dirname, 'snapchat-test-flow.json')) ? 1 : 0;
})();

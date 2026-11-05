// Browser check of YouTube's four choices in the work cycle (MVP_draft.md section 78, Director_Notes_Plan.md N-3 step 5), in Edge: the
// real «نشر الآن» and «جدولة» dialogs (qa/fixtures/publish-choices-flow.tsx) over a video work on two YouTube channels and an Instagram
// account, with stand-ins for the work provider and the database (fake-publish.tsx), because the pages need a signed-in person and
// no bypass is allowed.
//   1. «نشر الآن»: each YouTube channel has «عام», «غير مدرج» and «خاص», starting from its default; Instagram has none; a change is
//      kept; what is sent names every YouTube channel and nothing else.
//   2. A work with no YouTube channel sends no choice.
//   3. «جدولة»: each YouTube channel says it is «مجدول» and becomes public at the time; nothing else changes.
//   4. Phone width; no page error.
// What this cannot check: the database's rules (supabase/tests/work_youtube_choices_rules.sql) and the pages' static views
// (qa/work-pages.cjs).
// Usage: node qa/publish-choices-flow.cjs   (writes qa/publish-choices-flow.json, screenshots in qa/artifacts/publish-choices-flow/)
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const esbuild = require('esbuild');
const { dependency, launchOptions } = require('./runtime.cjs');
const { chromium } = dependency('playwright');
const h = require('./android-helpers.cjs');

const { check, finish } = h.record('qa/publish-choices-flow.cjs');
const out = path.join(__dirname, 'artifacts', 'publish-choices-flow');
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
const row = (t, id) => t.locator(`[data-yt-now="${id}"]`);
const pressed = (t, id) => row(t, id).locator('button[aria-pressed="true"]').getAttribute('data-choice');

(async () => {
  let fixture;
  const errs = [];
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch(launchOptions);
  try {
    const fake = path.join(fixtures, 'fake-publish.tsx');
    await esbuild.build({
      entryPoints: [path.join(fixtures, 'publish-choices-flow.tsx')],
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
    const open = async (view, viewport = { width: 1056, height: 900 }) => {
      const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2 });
      await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => {
        outside.push(r.request().url());
        return r.fulfill({ status: 200, contentType: 'text/plain', body: 'outside' });
      });
      const t = await ctx.newPage();
      t.on('pageerror', (e) => errs.push(String(e)));
      t.on('console', (m) => m.type() === 'error' && !/favicon/.test(m.text()) && errs.push(m.text()));
      await t.goto(`${base}?view=${view}`);
      await t.locator('dialog[open], .wk-modal').first().waitFor();
      return t;
    };

    // ---------- 1. «نشر الآن» ----------
    const t = await open('now');
    const words = await row(t, 'yt-main').locator('button').allInnerTexts();
    check('each YouTube channel offers «عام», «غير مدرج» and «خاص», «عام» first', JSON.stringify(words.map((x) => x.trim())) === JSON.stringify(['عام', 'غير مدرج', 'خاص']), words);
    check('a channel with no default starts «عام»', (await pressed(t, 'yt-main')) === 'public');
    check('a channel «غير مدرج» by default starts there, and says so', (await pressed(t, 'yt-review')) === 'unlisted' && (await row(t, 'yt-review').innerText()).includes('الاختيار المبدئي لهذه القناة'));
    check('Instagram has no such choice', (await t.locator('[data-yt-now="ig-main"]').count()) === 0);
    check('the dialog says «مجدول» is the fourth choice, from «جدولة»', (await t.locator('.wk-why').innerText()).includes('«مجدول» هو الاختيار الرابع'));
    await row(t, 'yt-main').locator('[data-choice="private"]').click();
    check('a change is kept, and its meaning shown', (await pressed(t, 'yt-main')) === 'private' && (await row(t, 'yt-main').innerText()).includes('لا يراه إلا من يدير القناة'));
    check('the other channel keeps its own', (await pressed(t, 'yt-review')) === 'unlisted');
    await t.screenshot({ path: path.join(out, '01-now.png') });
    const send = t.getByRole('button', { name: 'نشر الآن' });
    check('«نشر الآن» still asks for its long press', (await send.getAttribute('data-hold')) === 'النشر يصل إلى المنصات ولا يُتراجع عنه.');
    await send.click();
    await t.waitForFunction(() => window.__acts.length > 0);
    const sent = (await acts(t))[0];
    check('sent: every YouTube channel with its choice, and nothing for Instagram',
      sent.fn === 'work_publish' && sent.args.p_op === 'now' && JSON.stringify(sent.args.p_options) === JSON.stringify({ 'yt-main': 'private', 'yt-review': 'unlisted' }), sent);
    await t.context().close();

    // ---------- 2. no YouTube channel ----------
    const ig = await open('ig');
    check('no YouTube channel: no choice shown', (await ig.locator('[data-yt-now]').count()) === 0 && (await ig.locator('.wk-why').count()) === 0);
    await ig.getByRole('button', { name: 'نشر الآن' }).click();
    await ig.waitForFunction(() => window.__acts.length > 0);
    const igSent = (await acts(ig))[0];
    check('and none sent: the call is as it was', igSent.fn === 'work_publish' && !('p_options' in igSent.args) && igSent.args.p_op === 'now', igSent);
    await ig.context().close();

    // ---------- 3. «جدولة» ----------
    const sc = await open('sched');
    const lines = await sc.locator('[data-yt-sched]').evaluateAll((e) => e.map((x) => [x.getAttribute('data-yt-sched'), x.textContent]));
    check('«جدولة»: each YouTube channel says it is «مجدول» and becomes public at the time',
      lines.length === 2 && lines.every(([, s]) => s.includes('مجدول') && s.includes('يجعله يوتيوب عاماً') && s.includes('اختر «نشر الآن»')), lines);
    check('no choice to make there', (await sc.locator('[data-yt-now]').count()) === 0);
    await sc.locator('input[type="datetime-local"]').fill(new Date(Date.now() + 3 * 3600e3 + 2 * 864e5).toISOString().slice(0, 16));
    await sc.getByRole('button', { name: 'تأكيد الجدولة' }).click();
    await sc.waitForFunction(() => window.__acts.length > 0);
    const sched = (await acts(sc))[0];
    check('scheduling sends what it always did', sched.fn === 'work_schedule' && JSON.stringify(Object.keys(sched.args).sort()) === JSON.stringify(['p_mode', 'p_when', 'p_work']), sched);
    await sc.screenshot({ path: path.join(out, '02-schedule.png') });
    await sc.context().close();

    // ---------- 4. the phone ----------
    const ph = await open('now', { width: 390, height: 844 });
    check('phone: nothing sideways with the choices open', await fits(ph));
    await ph.screenshot({ path: path.join(out, '03-phone.png') });
    await ph.context().close();

    check('nothing was loaded from outside the fixture', outside.length === 0, outside);
    check('no page error and nothing in the console', errs.length === 0, errs.slice(0, 3).join(' | '));
  } catch (e) {
    check('the flow ran to its end', false, String(e.message ?? e).slice(0, 500));
  } finally {
    await browser.close();
    fixture?.close();
    finish(path.join(h.root, 'qa', 'publish-choices-flow.json'));
  }
})();

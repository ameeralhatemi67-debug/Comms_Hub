// Browser check of «تجربة النشر بالرابط» (MVP_draft.md section 83), in Edge: the real panel over an X account on the link route
// (qa/fixtures/x-link-test-flow.tsx), with stand-ins for the work provider and the database (fake-x-link-test.tsx), because the signed-in
// pages cannot be driven by a check and no bypass is allowed. It reads what the page asked the database and the site's own route to do.
//   1. Closed, the panel says what it is and that nothing is sent to X or deleted from it; opened, it starts on the test that publishes nothing.
//   2. «فحص بلا نشر»: the account's page on X to open, a link refused when it is not a post or is another account's (and nothing recorded),
//      X's lookup as advice (a post of another author stops it; a post not found, or no answer, does not), the recording and the list.
//   3. «نشر تجريبي»: the text and its length as X counts it, X's composer with the text and no other parameter, the warning that the post is
//      public and not deleted by the site, an empty or over-long text, the recording and the reminder to delete the post.
//   4. The database's refusals in words, a migration not yet run (the link is fine, nothing recorded), the list kept to five, a stopped account.
//   5. Phone width, the evening, and that the page asked nothing of any address outside the fixture.
// What this cannot check: the database's rules (supabase/tests/x_link_test_rules.sql), X itself, and the signed-in page.
// Usage: node qa/x-link-test-flow.cjs   (writes qa/x-link-test-flow.json, screenshots in qa/artifacts/x-link-test-flow/)
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const esbuild = require('esbuild');
const { dependency, launchOptions } = require('./runtime.cjs');
const { chromium } = dependency('playwright');
const h = require('./android-helpers.cjs');

const { check, finish } = h.record('qa/x-link-test-flow.cjs');
const out = path.join(__dirname, 'artifacts', 'x-link-test-flow');
const fixtures = path.join(__dirname, 'fixtures');
const css = ['globals', 'identity', 'kit', 'work']
  .map((f) => fs.readFileSync(path.join(h.root, 'src', 'app', `${f}.css`), 'utf8'))
  .join('\n')
  .replace(/@import[^;]+;/g, '')
  .replace(/@theme\{[^}]*\}/g, '');
const page = (dark) =>
  `<!doctype html><html lang="ar" dir="rtl" data-identity="emerald"${dark ? ' data-theme="dark"' : ''}><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>حسابات المنصات</title>` +
  `<style>${css}</style><style>body{font-family:"Segoe UI",Tahoma,sans-serif}main{max-width:760px;margin:auto;padding:16px}</style></head><body><div id="root"></div><script type="module" src="/flow.js"></script></body></html>`;

const fits = (t) => t.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const calls = (t, fn) => t.evaluate((f) => window.__calls.filter((c) => c.fn === f), fn);
const panel = (t) => t.locator('[data-xl="panel"]');
const url = (t) => panel(t).locator('[data-xl="url"]');
const record = (t) => panel(t).locator('[data-xl="record"]');
const done = (t) => panel(t).locator('[data-xl="done"]');
const li = (n) => `https://x.com/T_X/status/${n}`;

(async () => {
  let fixture;
  const errs = [];
  const asked = [];
  let lookup = { found: true, author: 'T_X' };
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch(launchOptions);
  try {
    const fake = path.join(fixtures, 'fake-x-link-test.tsx');
    await esbuild.build({
      entryPoints: [path.join(fixtures, 'x-link-test-flow.tsx')],
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
      const u = new URL(req.url, 'http://x');
      if (u.pathname === '/flow.js') {
        res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
        return res.end(bundle);
      }
      if (u.pathname === '/api/platforms/x-post' && req.method === 'POST') {
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', () => {
          asked.push(JSON.parse(body || '{}').url);
          if (lookup === 'down') {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            return res.end('{}');
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(lookup));
        });
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(page(u.searchParams.has('dark')));
    });
    await new Promise((r) => fixture.listen(0, '127.0.0.1', r));
    const base = `http://127.0.0.1:${fixture.address().port}/`;
    const requested = [];
    const fresh = async (viewport = { width: 900, height: 900 }, query = '') => {
      const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2 });
      const t = await ctx.newPage();
      t.on('pageerror', (e) => errs.push(String(e)));
      t.on('console', (m) => m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text()) && errs.push(m.text()));
      t.on('request', (r) => requested.push(r.url()));
      await t.goto(base + query);
      await panel(t).waitFor();
      return t;
    };

    // ---------- 1. closed, then opened ----------
    const t = await fresh();
    check('the panel says what it is: nothing is sent to X and nothing is deleted from it', (await panel(t).innerText()).includes('لا يرسل الموقع شيئاً إلى X ولا يحذف منها شيئاً') && (await panel(t).locator('h4').innerText()) === 'تجربة النشر بالرابط');
    check('closed, it offers one button and has asked the database for nothing but the list', (await panel(t).locator('[data-xl="open"]').innerText()).includes('بدء تجربة') && (await calls(t, 'x_link_test_record')).length === 0);
    await panel(t).locator('[data-xl="open"]').click();
    await panel(t).locator('[data-xl="form"]').waitFor();
    check('opened, it starts on the test that publishes nothing', (await panel(t).locator('[data-xl-mode="existing"]').getAttribute('aria-pressed')) === 'true' && (await panel(t).locator('[data-xl-mode="new"]').getAttribute('aria-pressed')) === 'false' && (await panel(t).locator('[data-xl="text"]').count()) === 0 && (await panel(t).locator('[data-xl="lead"]').innerText()).includes('لا يُنشر شيء'));
    const profile = panel(t).locator('[data-xl="profile"]');
    check('the account\'s page on X opens in a new tab, from the handle on file', (await profile.getAttribute('href')) === 'https://x.com/T_X' && (await profile.getAttribute('target')) === '_blank' && ((await profile.getAttribute('rel')) ?? '').includes('noopener'));
    check('nothing can be recorded before a link is given', await record(t).isDisabled());
    await t.screenshot({ path: path.join(out, '01-open.png') });

    // ---------- 2. «فحص بلا نشر» ----------
    await url(t).fill('https://example.com/T_X/status/123456789012');
    await record(t).click();
    check('a link that is not a post of X is refused in words, and nothing is recorded', (await panel(t).locator('[data-xl="problem"]').innerText()).includes('هذا ليس رابط منشور على X') && (await calls(t, 'x_link_test_record')).length === 0 && asked.length === 0);
    await url(t).fill('https://x.com/someone/status/123456789012');
    await record(t).click();
    const other = await panel(t).locator('[data-xl="problem"]').innerText();
    check('another account\'s post is refused, naming both, and X is not even asked', other.includes('@someone') && other.includes('@T_X') && (await calls(t, 'x_link_test_record')).length === 0 && asked.length === 0, other);
    lookup = { found: true, author: 'someone_else' };
    await url(t).fill(li('123456789012'));
    await record(t).click();
    await panel(t).locator('[data-xl="error"]').waitFor();
    check('X saying the post is another author\'s stops it, and nothing is recorded', (await panel(t).locator('[data-xl="error"]').innerText()).includes('@someone_else') && (await calls(t, 'x_link_test_record')).length === 0);

    lookup = { found: true, author: 'T_X' };
    await url(t).fill(`  ${li('223456789012')}  `);
    await record(t).click();
    await done(t).waitFor();
    const first = await calls(t, 'x_link_test_record');
    check('a post of this account is recorded as «فحص بلا نشر», with the link as given and the account\'s id', first.length === 1 && first[0].args.p_mode === 'existing' && first[0].args.p_url === li('223456789012') && first[0].args.p_account === '00000000-0000-4000-8000-0000000000a1', JSON.stringify(first));
    check('and it says so, with X\'s answer beside it, and the box is cleared', (await done(t).getAttribute('data-kept')) === 'yes' && (await done(t).innerText()).includes('سُجّلت التجربة') && (await panel(t).locator('[data-xl="lookup"]').innerText()).includes('وجد X المنشور وهو من هذا الحساب') && (await url(t).inputValue()) === '');
    check('the list shows it: the kind, who, and the post opening on X', (await panel(t).locator('.yt-item').count()) === 1 && (await panel(t).locator('.yt-item').innerText()).includes('فحص بلا نشر') && (await panel(t).locator('.yt-item').innerText()).includes('ناشر الفحص') && (await panel(t).locator('.yt-item a').getAttribute('href')) === li('223456789012'));
    await t.screenshot({ path: path.join(out, '02-recorded.png') });

    lookup = { found: false, author: null };
    await url(t).fill(li('323456789012'));
    await record(t).click();
    await t.waitForFunction(() => window.__calls.filter((c) => c.fn === 'x_link_test_record').length === 2);
    await done(t).waitFor();
    check('a post X cannot find is said, and still recorded: the handle is what decides', (await panel(t).locator('[data-xl="lookup"]').innerText()).includes('لم يجد X هذا المنشور') && (await done(t).getAttribute('data-kept')) === 'yes');
    lookup = 'down';
    await url(t).fill('https://twitter.com/t_x/status/423456789012?s=20');
    await record(t).click();
    await t.waitForFunction(() => window.__calls.filter((c) => c.fn === 'x_link_test_record').length === 3);
    check('when X does not answer, it says it was not checked and records all the same, the link as X shows it, in the letters it was written', (await panel(t).locator('[data-xl="lookup"]').innerText()).includes('لم يتحقق الموقع') && (await panel(t).locator('.yt-item a').first().getAttribute('href')) === 'https://x.com/t_x/status/423456789012', await panel(t).locator('.yt-item a').first().getAttribute('href'));
    check('X\'s lookup was asked once for each link that passed the page\'s own check, and for no other', asked.length === 4 && asked.every((a) => a.includes('/status/')), JSON.stringify(asked));

    // ---------- 3. «نشر تجريبي» ----------
    lookup = { found: true, author: 'T_X' };
    await panel(t).locator('[data-xl-mode="new"]').click();
    const text = panel(t).locator('[data-xl="text"]');
    const startText = await text.inputValue();
    check('the test post starts from a plain text, with its length as X counts it', startText.includes('تجربة نشر داخلية') && !/https?:/.test(startText) && (await panel(t).locator('[data-xl="count"]').innerText()).includes(`${[...startText].length} / 280`), `${startText} | ${await panel(t).locator('[data-xl="count"]').innerText()}`);
    const compose = panel(t).locator('[data-xl="compose"]');
    const cu = new URL(await compose.getAttribute('href'));
    check('X\'s composer opens in a new tab with the text and no other parameter', cu.origin + cu.pathname === 'https://x.com/intent/tweet' && [...cu.searchParams.keys()].join() === 'text' && cu.searchParams.get('text') === startText && (await compose.getAttribute('target')) === '_blank');
    await text.fill('نص آخر للتجربة');
    check('editing the text changes what the composer is given', new URL(await compose.getAttribute('href')).searchParams.get('text') === 'نص آخر للتجربة');
    const warn = await panel(t).innerText();
    check('it warns that the post is real and public, that the site does not delete it, and offers the test that posts nothing', warn.includes('منشور حقيقي وعام') && warn.includes('احذفه أنت من X بعد التجربة') && warn.includes('فحص بلا نشر'));
    await text.fill('ا'.repeat(300));
    check('a text longer than X allows is marked, not cut', (await panel(t).locator('[data-xl="count"]').getAttribute('class')).includes('wk-xh-over') && (await panel(t).locator('[data-xl="count"]').innerText()).includes('أطول من الحد'));
    await text.fill('   ');
    check('an empty text cannot be sent to X or recorded', (await compose.getAttribute('aria-disabled')) === 'true' && (await compose.getAttribute('href')) === null && (await record(t).isDisabled()) === true);
    await text.fill('نص آخر للتجربة');
    await url(t).fill(li('523456789012'));
    await record(t).click();
    await t.waitForFunction(() => window.__calls.filter((c) => c.fn === 'x_link_test_record').length === 4);
    await done(t).waitFor();
    const fourth = (await calls(t, 'x_link_test_record'))[3];
    check('recorded as «نشر تجريبي»', fourth.args.p_mode === 'new' && fourth.args.p_url === li('523456789012'));
    check('and it reminds that the test post is still on X', (await panel(t).locator('[data-xl="delete-note"]').innerText()).includes('احذفه من هناك'));
    await t.screenshot({ path: path.join(out, '03-new.png') });

    // ---------- 4. refusals, a migration not run, the list, a stopped account ----------
    const refuse = async (code, message, expect) => {
      await t.evaluate((r) => (window.__refuse = r), { code, message });
      await url(t).fill(li('623456789012'));
      await record(t).click();
      await panel(t).locator('[data-xl="error"]').waitFor();
      const said = await panel(t).locator('[data-xl="error"]').innerText();
      check(`the database's «${message}» is said in words`, expect.test(said), said);
    };
    await refuse('P0001', 'TEST_LIMIT', /20 تجربة في اليوم/);
    await refuse('P0001', 'FORBIDDEN', /لمن يدير الحسابات ولناشري الحساب/);
    await refuse('P0001', 'POST_LINK_OTHER_ACCOUNT', /لحساب آخر/);
    await refuse('P0001', 'ACCOUNT_OFF', /الحساب موقوف/);
    await refuse('XX000', 'something unforeseen', /تعذّر تسجيل التجربة/);
    check('a refusal records nothing and leaves the link to be corrected', (await calls(t, 'x_link_test_record')).length === 9 && (await url(t).inputValue()) === li('623456789012'));
    for (const [i, n] of ['723456789012', '823456789012'].entries()) {
      await url(t).fill(li(n));
      await record(t).click();
      await t.waitForFunction((k) => window.__rows.length === k, 5 + i);
    }
    await url(t).fill(li('923456789012'));
    await t.evaluate(() => (window.__refuse = { code: 'PGRST202', message: 'Could not find the function public.x_link_test_record(p_account, p_mode, p_url) in the schema cache' }));
    await record(t).click();
    await done(t).waitFor();
    check('before the migration is run: the link is said to be fine, and that nothing was recorded', (await done(t).getAttribute('data-kept')) === 'no' && (await done(t).innerText()).includes('الرابط سليم') && (await done(t).innerText()).includes('تحتاج تحديثاً'));
    check('the list is kept to the last five', (await panel(t).locator('.yt-item').count()) === 5);
    await t.context().close();

    const stopped = await fresh(undefined, '?stopped=1');
    check('a stopped account is not tested: the panel says so and offers no form', (await panel(stopped).innerText()).includes('الحساب موقوف') && (await panel(stopped).locator('[data-xl="open"]').count()) === 0);
    await stopped.context().close();

    // ---------- 5. phone, evening, what was asked ----------
    const phone = await fresh({ width: 390, height: 844 });
    await panel(phone).locator('[data-xl="open"]').click();
    await panel(phone).locator('[data-xl="form"]').waitFor();
    const px = await fits(phone);
    await panel(phone).locator('[data-xl-mode="new"]').click();
    await phone.screenshot({ path: path.join(out, '04-phone.png'), fullPage: true });
    check('phone: neither test makes the page scroll sideways', px && (await fits(phone)) && (await phone.evaluate(() => { const p = document.querySelector('[data-xl="panel"]'); return [...p.querySelectorAll('*')].every((e) => e.getBoundingClientRect().right <= window.innerWidth + 1); })));
    await phone.context().close();
    const night = await fresh(undefined, '?dark');
    await panel(night).locator('[data-xl="open"]').click();
    await panel(night).locator('[data-xl="form"]').waitFor();
    await night.screenshot({ path: path.join(out, '05-evening.png') });
    check('evening: the panel is drawn from the theme', await night.evaluate(() => getComputedStyle(document.querySelector('[data-xl="form"]')).backgroundColor !== 'rgba(0, 0, 0, 0)'));
    await night.context().close();
    const none = await fresh(undefined, '?x=1');
    await none.evaluate(() => (window.__refuse = { code: 'NO_TABLE', message: '' }));
    await none.reload();
    await panel(none).waitFor();
    check('before the migration is run the list is quietly empty and the panel still opens', (await panel(none).locator('.yt-list').count()) === 0 && (await panel(none).locator('[data-xl="open"]').count()) === 1);
    await none.context().close();

    const outside = requested.filter((r) => !r.startsWith(base));
    check('the page asked nothing of any address outside the fixture: nothing goes to X', outside.length === 0, outside.join(' '));
    check('no page error and nothing in the console', errs.length === 0, errs.slice(0, 3).join(' | '));
  } catch (e) {
    check('the flow ran to its end', false, String(e.message ?? e).slice(0, 500));
  } finally {
    await browser.close();
    fixture?.close();
  }
  process.exitCode = finish(path.join(__dirname, 'x-link-test-flow.json')) ? 1 : 0;
})();

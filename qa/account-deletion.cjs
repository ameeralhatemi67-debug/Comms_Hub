// Browser check of «طلب حذف حسابي» and the pages Google Play reads (Android_Build_Plan.md A8; MVP_draft.md 64.6), in Edge.
// Part 1, the site's production build at http://127.0.0.1:3000, signed out: /account-deletion.html and /privacy.html
//   answer at once (no sign-in, no redirect), carry both languages, link to each other, and fit a phone's width.
// Part 2, the real components on a fixture page at http://127.0.0.1:3001 (qa/fixtures/account-deletion.tsx), with
//   stand-ins for the database client and «الحسابات»' provider, because both need a signed-in person: asking with a
//   note (and the phones of those told are kicked), the open request and withdrawing it, a refusal in Arabic, a
//   database without the table, and the director's list with «إزالة الحساب». The rules themselves are run against the
//   database in supabase/tests/account_deletion_rules.sql.
// Usage: npm run build; then node qa/account-deletion.cjs   (writes qa/account-deletion.json)
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const esbuild = require('esbuild');
const { dependency, launchOptions } = require('./runtime.cjs');
const { chromium } = dependency('playwright');
const h = require('./android-helpers.cjs');

const { check, result, finish } = h.record('qa/account-deletion.cjs');
const out = path.join(__dirname, 'artifacts', 'account-deletion');
const fixtures = path.join(__dirname, 'fixtures');
const css = fs.readFileSync(path.join(h.root, 'src', 'app', 'globals.css'), 'utf8').replace(/@import[^;]+;/g, '').replace(/@theme\{[^}]*\}/g, '');
const page = () =>
  `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>حذف الحساب</title><style>${css}</style></head>` +
  '<body><div id="root"></div><script type="module" src="/deletion.js"></script></body></html>';
const fits = (tab) => tab.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

(async () => {
  let stopSite;
  let fixture;
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch(launchOptions);
  try {
    // Part 1: the public pages, signed out
    stopSite = await h.startSite();
    for (const [p, words] of [['/account-deletion.html', ['Delete your account', 'حذف الحساب', 'commshubhadayah@gmail.com', 'What is deleted', 'ما يبقى ولماذا']], ['/privacy.html', ['Privacy Policy', 'سياسة الخصوصية', 'Last updated: 28 October 2026', 'drive.file', 'Firebase Cloud Messaging']]]) {
      const r = await fetch(`http://127.0.0.1:3000${p}`, { redirect: 'manual' });
      const body = await r.text();
      check(`${p} answers signed out: 200, HTML, no redirect`, r.status === 200 && /text\/html/.test(r.headers.get('content-type') ?? ''), { status: r.status, type: r.headers.get('content-type') });
      check(`${p} says what it should, in both languages`, words.every((x) => body.includes(x)), words.filter((x) => !body.includes(x)));
    }
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    const tab = await ctx.newPage();
    const errors = [];
    tab.on('pageerror', (e) => errors.push(String(e)));
    tab.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await tab.goto('http://127.0.0.1:3000/account-deletion.html');
    check('the deletion page fits a phone\'s width, its Arabic half right to left', (await fits(tab)) && (await tab.evaluate(() => getComputedStyle(document.querySelector('.ar')).direction)) === 'rtl');
    await tab.screenshot({ path: path.join(out, '01-deletion-page.png'), fullPage: true });
    await tab.click('a[href="/privacy.html"] >> nth=0');
    await tab.waitForURL('**/privacy.html');
    check('it links to the privacy policy, which fits too and links back', (await fits(tab)) && (await tab.locator('a[href="/account-deletion.html"]').count()) === 2);
    await tab.screenshot({ path: path.join(out, '02-privacy.png'), fullPage: true });
    check('no error on either page (the site\'s Content-Security-Policy included)', errors.length === 0, errors);
    await ctx.close();
    await stopSite();
    stopSite = null;

    // Part 2: the components
    await esbuild.build({
      entryPoints: [path.join(fixtures, 'account-deletion.tsx')],
      bundle: true,
      format: 'esm',
      platform: 'browser',
      target: 'es2020',
      jsx: 'automatic',
      outfile: path.join(out, 'deletion.js'),
      define: { 'process.env.NODE_ENV': '"production"' },
      logLevel: 'silent',
      absWorkingDir: h.root,
      plugins: [
        {
          name: 'stand-ins',
          setup(b) {
            b.onResolve({ filter: /^@\/lib\/supabase\/client$/ }, () => ({ path: path.join(fixtures, 'fake-deletion-supabase.ts') }));
            b.onResolve({ filter: /^@\/lib\/push\/kick$/ }, () => ({ path: path.join(fixtures, 'fake-kick.ts') }));
            b.onResolve({ filter: /^\.\/data$/ }, (a) => (a.importer.includes(`${path.sep}accounts${path.sep}`) ? { path: path.join(fixtures, 'fake-accounts-data.ts') } : undefined));
            b.onResolve({ filter: /^next\/(navigation|link)$/ }, () => ({ path: path.join(fixtures, 'fake-next.tsx') }));
          },
        },
      ],
    });
    const bundle = fs.readFileSync(path.join(out, 'deletion.js'), 'utf8');
    fixture = http.createServer((req, res) => {
      if (req.url === '/deletion.js') {
        res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
        return res.end(bundle);
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(page());
    });
    await new Promise((r) => fixture.listen(3001, '127.0.0.1', r));
    const c2 = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    const t = await c2.newPage();
    const errs = [];
    t.on('pageerror', (e) => errs.push(String(e)));
    await t.goto('http://127.0.0.1:3001/');
    await t.waitForSelector('.ac-delete-ask');
    const first = await t.evaluate(() => {
      const panel = document.querySelector('.ac-delete-panel');
      const ask = document.querySelector('.ac-delete-ask');
      return {
        title: panel?.querySelector('h2')?.textContent ?? '',
        lists: [...panel.querySelectorAll('.ac-delete-what ul')].map((u) => u.querySelectorAll('li').length),
        hold: ask?.getAttribute('data-hold') ?? '',
        label: ask?.textContent.trim(),
        link: panel?.querySelector('a[href="/account-deletion.html"]')?.textContent ?? '',
      };
    });
    check('«حذف الحساب»: what is deleted (six) and what stays (five), «طلب حذف حسابي» behind a long press, and the public page linked', first.title === 'حذف الحساب' && first.lists.join(',') === '6,5' && first.hold.startsWith('يصل الطلب إلى من يملك إزالة حسابك') && first.label === 'طلب حذف حسابي' && first.link === 'حذف الحساب', first);
    check('the panel and the list fit a phone\'s width', await fits(t));
    await t.screenshot({ path: path.join(out, '03-panel.png'), fullPage: true });

    await t.fill('.ac-delete-note', 'أغادر المؤسسة.');
    await t.click('.ac-delete-ask');
    await t.waitForSelector('.ac-delete-withdraw');
    const asked = await t.evaluate(() => ({ rpc: window.__rpc.slice(), kicks: window.__kicks, text: document.querySelector('.ac-delete-panel').innerText }));
    check('asking sends the note to account_deletion_request and kicks the phones of those told', JSON.stringify(asked.rpc[0]) === JSON.stringify({ name: 'account_deletion_request', args: { p_note: 'أغادر المؤسسة.' } }) && asked.kicks === 1, asked);
    check('then the open request is shown, with its note and «سحب الطلب»', asked.text.includes('طلبت حذف حسابك في') && asked.text.includes('ملاحظتك: أغادر المؤسسة.') && asked.text.includes('وصل طلبك إلى من يملك إزالة حسابك.'), asked.text);
    await t.screenshot({ path: path.join(out, '04-open.png'), fullPage: true });
    await t.click('.ac-delete-withdraw');
    await t.waitForSelector('.ac-delete-ask');
    const back = await t.evaluate(() => ({ last: window.__rpc[window.__rpc.length - 1]?.name, text: document.querySelector('.ac-delete-panel').innerText }));
    check('«سحب الطلب» withdraws it and the panel offers to ask again', back.last === 'account_deletion_withdraw' && back.text.includes('سُحب طلب الحذف، ويبقى حسابك كما هو.'), back);

    await t.evaluate(() => localStorage.setItem('qa.del.fail', 'TOO_MANY'));
    await t.click('.ac-delete-ask');
    await h.until(() => t.evaluate(() => document.querySelector('.ac-delete-panel').innerText.includes('ثلاث مرات اليوم')), 5000, 200);
    check('a refusal of the database is said in Arabic', await t.evaluate(() => document.querySelector('.ac-delete-panel').innerText.includes('طلبت الحذف ثلاث مرات اليوم. أعد المحاولة غداً.')));
    await t.evaluate(() => localStorage.setItem('qa.del.fail', 'missing'));
    await t.reload();
    await t.waitForSelector('.ac-delete-ask');
    const missing = await h.until(() => t.evaluate(() => (document.querySelector('.ac-delete-ask').disabled ? document.querySelector('.ac-delete-panel').innerText : null)), 5000, 200);
    check('before the migration is applied: the button waits, and the panel points to the public page', !!missing && missing.includes('تعذّر قراءة طلبات الحذف الآن'), missing);
    await t.evaluate(() => localStorage.clear());

    const list = await t.evaluate(() => [...document.querySelectorAll('.pm-deletion')].map((r) => ({ text: r.innerText, button: r.querySelector('button')?.textContent.trim(), disabled: r.querySelector('button')?.disabled })));
    check('the director\'s list: each request with its name, address, time and note, and «إزالة الحساب»', list.length === 2 && list[0].text.includes('كاتب الفحص') && list[0].text.includes('writer@example.test') && list[0].text.includes('أغادر المؤسسة نهاية الشهر.') && list.every((r) => r.button === 'إزالة الحساب' && !r.disabled), list);
    await t.click('.pm-deletion >> nth=1 >> button');
    check('«إزالة الحساب» opens the removal for that person', JSON.stringify(await t.evaluate(() => window.__removing)) === '["member@example.test"]');
    await t.screenshot({ path: path.join(out, '05-list.png'), fullPage: true });
    check('no page error', errs.length === 0, errs);
    await c2.close();
  } catch (e) {
    check('the check ran to its end', false, String(e && e.stack ? e.stack : e));
  } finally {
    await browser.close();
    if (stopSite) await stopSite();
    if (fixture) fixture.close();
  }
  process.exitCode = finish(path.join(__dirname, 'account-deletion.json')) ? 1 : 0;
})();

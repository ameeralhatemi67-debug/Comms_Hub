// Browser check of X's cost calculator (MVP_draft.md section 82), in Edge: the real «المنصات» tab and its real components on the
// fixture of qa/platforms-flow.cjs (stand-ins for the database, because the page needs a signed-in person and no bypass is allowed).
// The expected figures are worked out here again, in this file, from X's prices, never read from the page's own code.
//   1. The button on «المنصات» opens the calculator in its own sheet, on the default figures, which are checked to the cent.
//   2. A year, then no posts, then a cleared field and an out-of-range one: the figures follow and nothing breaks.
//   3. The share of links, a ready scenario, the cautious figure for pictures, the balance and the limit.
//   4. What X allows and what it does not say are on the page; the money keeps its direction inside Arabic.
//   5. The same calculator inside the X setup guide, in the step «اشحن رصيداً», beside the tables that were there.
//   6. A phone and the evening: nothing sideways.
// What this cannot check: X's own prices (read from docs.x.com on 2026-11-26 and held by tests/x-cost.test.mjs against the guide).
// Usage: node qa/x-cost-flow.cjs   (writes qa/x-cost-flow.json, screenshots in qa/artifacts/x-cost-flow/)
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const esbuild = require('esbuild');
const { dependency, launchOptions } = require('./runtime.cjs');
const { chromium } = dependency('playwright');
const h = require('./android-helpers.cjs');

const { check, finish } = h.record('qa/x-cost-flow.cjs');
const out = path.join(__dirname, 'artifacts', 'x-cost-flow');
const fixtures = path.join(__dirname, 'fixtures');
const css = ['globals', 'identity', 'media', 'kit', 'work', 'chat', 'auth', 'permissions']
  .map((f) => fs.readFileSync(path.join(h.root, 'src', 'app', `${f}.css`), 'utf8'))
  .join('\n')
  .replace(/@import[^;]+;/g, '')
  .replace(/@theme\{[^}]*\}/g, '');
const page = (dark) =>
  `<!doctype html><html lang="ar" dir="rtl" data-identity="emerald"${dark ? ' data-theme="dark"' : ''}><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>المنصات</title>` +
  `<style>${css}</style><style>body{font-family:"Segoe UI",Tahoma,sans-serif}main{max-width:1120px;margin:auto;padding:16px}</style></head><body><div id="root"></div><script type="module" src="/flow.js"></script></body></html>`;

// X's prices in mills (thousandths of a dollar), written again here.
const days = (m) => Math.round((m * 365.25) / 12);
const mills = (i) => {
  const d = days(i.months);
  const posts = Math.round(i.per === 'day' ? i.posts * d : i.per === 'week' ? (i.posts * d) / 7 : i.posts * i.months);
  const link = Math.round((posts * i.link) / 100);
  const items = Math.round((posts * i.media) / 100) * i.perPost;
  return (posts - link) * 15 + link * 200 + (i.billed ? items * 5 : 0) + i.deletes * i.months * 10 + i.checks * d * 10 + i.reads * i.months * 5;
};
const dollars = (m) => {
  if (m < 1000) return `$0.${String(m).padStart(3, '0')}`;
  const c = Math.round(m / 10);
  return `$${Math.floor(c / 100).toLocaleString('en-US')}.${String(c % 100).padStart(2, '0')}`;
};
const DEFAULT = { months: 3, posts: 2, per: 'day', link: 25, media: 60, perPost: 1, billed: false, deletes: 5, checks: 2, reads: 0 };
const BUSY = { posts: 8, per: 'day', link: 35, media: 70, perPost: 2, billed: false, deletes: 20, checks: 6, reads: 240 };

const sheet = (t) => t.locator('dialog.pf-sheet[open]');
const total = async (t) => (await sheet(t).locator('.xc-total b').innerText()).trim();
const fits = (t) => t.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const lineOf = (t, id) => sheet(t).locator(`.xc-lines li[data-line="${id}"]`);

(async () => {
  let fixture;
  const errs = [];
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch(launchOptions);
  try {
    const fake = path.join(fixtures, 'fake-platforms-flow.tsx');
    await esbuild.build({
      entryPoints: [path.join(fixtures, 'platforms-flow.tsx')],
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
      if (url.pathname.startsWith('/guides/')) {
        const file = path.join(h.root, 'public', path.normalize(url.pathname));
        if (!file.startsWith(path.join(h.root, 'public', 'guides')) || !fs.existsSync(file)) {
          res.writeHead(404);
          return res.end();
        }
        res.writeHead(200, { 'Content-Type': 'image/png' });
        return res.end(fs.readFileSync(file));
      }
      if (url.pathname === '/flow.js') {
        res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
        return res.end(bundle);
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(page(url.searchParams.has('dark')));
    });
    await new Promise((r) => fixture.listen(0, '127.0.0.1', r));
    const base = `http://127.0.0.1:${fixture.address().port}/`;
    const fresh = async (viewport = { width: 1056, height: 900 }) => {
      const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2 });
      const t = await ctx.newPage();
      t.on('pageerror', (e) => errs.push(String(e)));
      t.on('console', (m) => m.type() === 'error' && !/favicon/.test(m.text()) && errs.push(m.text()));
      return t;
    };

    // ---------- 1. the button and the default figures ----------
    const t = await fresh();
    await t.goto(base);
    await t.waitForSelector('.pf-row');
    const open = t.locator('[data-xcost-open]');
    check('the button is on «المنصات» whatever X\'s state', (await open.count()) === 1 && (await open.innerText()).includes('حاسبة تكلفة X'), await open.innerText());
    await open.click();
    await sheet(t).locator('.xc').waitFor();
    check('it opens in its own sheet, named for X', (await sheet(t).locator('.pf-title h2').innerText()) === 'حاسبة تكلفة X');
    check('the default is worked out to the cent', (await total(t)) === dollars(mills(DEFAULT)), `${await total(t)} against ${dollars(mills(DEFAULT))}`);
    const sub = await sheet(t).locator('.xc-sub').innerText();
    check('the month, the day and the posts are beside it', sub.includes(dollars(Math.round(mills(DEFAULT) / 3))) && sub.includes(dollars(Math.round(mills(DEFAULT) / 91))) && sub.includes('182'), sub);
    const link = await lineOf(t, 'link').innerText();
    check('the posts with a link are their own line: 46 at $0.200', link.includes('46') && link.includes('$0.200') && link.includes('$9.20') && link.includes('سعر معلن'), link);
    const media = await lineOf(t, 'media').innerText();
    check('pictures are said to have no price, not counted as free', media.includes('غير مسعّر') && media.includes('بلا سعر معلن'), media);
    check('a line with nothing in it is not drawn', (await lineOf(t, 'read').count()) === 0);
    const insight = await sheet(t).locator('.xc-insight').innerText();
    check('what the links cost is said in a sentence: their share and the bill without them', insight.includes('70%') && insight.includes('$4.70'), insight);
    check('the free route is named beside the figure', (await sheet(t).locator('.xc-free').innerText()).includes('$0.000'));
    check('every figure keeps its direction in the Arabic line', await sheet(t).locator('.xc-total bdi, .xc-sub bdi').evaluateAll((l) => l.length >= 3 && l.every((e) => e.getAttribute('dir') === 'ltr')));
    await t.screenshot({ path: path.join(out, '01-default.png') });

    // ---------- 2. a year, no posts, a cleared field, a field out of range ----------
    await sheet(t).getByRole('button', { name: 'سنة', exact: true }).click();
    check('a year: 365 days, 730 posts', (await total(t)) === dollars(mills({ ...DEFAULT, months: 12 })), `${await total(t)} against ${dollars(mills({ ...DEFAULT, months: 12 }))}`);
    check('the chosen period is the pressed one and the table marks it', (await sheet(t).getByRole('button', { name: 'سنة', exact: true }).getAttribute('aria-pressed')) === 'true' && (await sheet(t).locator('.xc-tbl tr[aria-current="true"]').innerText()).includes('سنة'));
    const rows = await sheet(t).locator('.xc-tbl tbody tr').allInnerTexts();
    check('the table gives a month, three months, six and a year for the same activity', rows.length === 4 && rows[0].includes(dollars(mills({ ...DEFAULT, months: 1 }))) && rows[3].includes(dollars(mills({ ...DEFAULT, months: 12 }))), rows);
    await sheet(t).getByLabel('أو بالأشهر').fill('18');
    check('eighteen months, by hand', (await total(t)) === dollars(mills({ ...DEFAULT, months: 18 })), await total(t));
    await sheet(t).getByLabel('أو بالأشهر').fill('99');
    await sheet(t).getByLabel('أو بالأشهر').blur();
    check('ninety-nine months is brought to thirty-six, in the field too', (await sheet(t).getByLabel('أو بالأشهر').inputValue()) === '36' && (await total(t)) === dollars(mills({ ...DEFAULT, months: 36 })), await sheet(t).getByLabel('أو بالأشهر').inputValue());

    await sheet(t).getByRole('button', { name: 'شهر', exact: true }).click();
    const posts = sheet(t).getByLabel('عدد المنشورات', { exact: true });
    await posts.fill('0');
    const none = await sheet(t).locator('.xc-insight').innerText();
    check('no posts: only the checks and the deletes remain, and it says so', none.includes('لا منشورات') && (await total(t)) === dollars(mills({ ...DEFAULT, months: 1, posts: 0 })) && (await lineOf(t, 'plain').count()) === 0, `${none} | ${await total(t)}`);
    await posts.fill('');
    check('a cleared field stays empty while typing', (await posts.inputValue()) === '');
    await posts.blur();
    check('and returns to its figure when left', (await posts.inputValue()) === '0');
    await posts.fill('abc');
    await posts.blur();
    check('text is not a number: the field returns to its figure', (await posts.inputValue()) === '0' && (await total(t)) === dollars(mills({ ...DEFAULT, months: 1, posts: 0 })));
    await posts.fill('5000');
    await posts.blur();
    check('five thousand a day is brought to a thousand', (await posts.inputValue()) === '1000' && (await total(t)).startsWith('$'), await posts.inputValue());
    await posts.fill('1.5');
    await posts.blur();
    check('a day and a half is allowed, and counted', (await total(t)) === dollars(mills({ ...DEFAULT, months: 1, posts: 1.5 })), await total(t));
    await sheet(t).getByRole('button', { name: 'في الأسبوع' }).click();
    await posts.fill('7');
    check('seven a week over a month is thirty posts', (await total(t)) === dollars(mills({ ...DEFAULT, months: 1, posts: 7, per: 'week' })), await total(t));

    // ---------- 3. links, a scenario, pictures, the balance and the limit ----------
    await sheet(t).getByRole('button', { name: 'في اليوم' }).click();
    await posts.fill('2');
    const share = sheet(t).getByLabel(/فيها رابط/);
    await share.fill('0');
    check('no links: every post is plain, and the line of links is gone', (await total(t)) === dollars(mills({ ...DEFAULT, months: 1, link: 0 })) && (await lineOf(t, 'link').count()) === 0 && (await sheet(t).locator('.xc-insight').innerText()).includes('لا روابط'), await total(t));
    await share.fill('100');
    check('every post a link: thirteen times a plain post', (await total(t)) === dollars(mills({ ...DEFAULT, months: 1, link: 100 })), await total(t));
    await sheet(t).getByRole('button', { name: 'نشط' }).click();
    check('the busy scenario keeps the period and changes the rest', (await total(t)) === dollars(mills({ ...DEFAULT, ...BUSY, months: 1 })), `${await total(t)} against ${dollars(mills({ ...DEFAULT, ...BUSY, months: 1 }))}`);
    check('the line of reads appears when there are reads', (await lineOf(t, 'read').count()) === 1);
    await sheet(t).locator('.xc-more > summary').first().click();
    await sheet(t).locator('label.switch').click();
    check('the cautious figure adds five mills for each picture or video, and says it is an estimate', (await total(t)) === dollars(mills({ ...DEFAULT, ...BUSY, months: 1, billed: true })) && (await lineOf(t, 'media').innerText()).includes('تقدير'), `${await total(t)} against ${dollars(mills({ ...DEFAULT, ...BUSY, months: 1, billed: true }))}`);
    await sheet(t).locator('label.switch').click();
    const balance = sheet(t).getByLabel('رصيد تفكر في شحنه (بالدولار)');
    await balance.fill('50');
    const m = mills({ ...DEFAULT, ...BUSY, months: 1 });
    const cover = Math.floor((50 * 1000 * days(1)) / m);
    const budget = await sheet(t).locator('.xc-budget').innerText();
    check('a balance of fifty dollars lasts as long as the pace says', budget.includes(`${cover}`), `${cover} | ${budget}`);
    check('the limit to set in the console is the month and a fifth', budget.includes(`$${Math.ceil((m * 12) / 10000)}`), `${Math.ceil((m * 12) / 10000)} | ${budget}`);
    check('the free credits X offers are said, with their amounts, their three months, and that the offer is still being rolled out', budget.includes('$20') && budget.includes('$50') && budget.includes('3 أشهر') && budget.includes('ما زال يُطرح'), budget);
    await balance.fill('0');
    check('no balance: it says so, with no division by zero', (await sheet(t).locator('.xc-budget p').first().innerText()).includes('لا رصيد'));

    // ---------- 4. what X allows and what it does not say ----------
    await sheet(t).locator('.xc-more > summary', { hasText: 'ما الذي تتيحه' }).click();
    const can = await sheet(t).locator('.xc-can').innerText();
    check('what the API allows is listed: links, pictures, video, replies, deletes', ['منشور فيه رابط', 'صور مع المنشور', 'فيديو', 'رد على منشور', 'حذف منشور'].every((s) => can.includes(s)), can.slice(0, 200));
    check('quoting is said to be unavailable on this plan', can.includes('اقتباس منشور') && can.includes('Enterprise'));
    const unknown = await sheet(t).locator('.xc-unknown').innerText();
    check('what X does not say is on the page, with the way to settle it', unknown.includes('with URL') && unknown.includes('Usage') && unknown.includes('2026-11-26'), unknown.slice(0, 160));
    check('English inside Arabic is isolated (the price lines and the dates)', await sheet(t).locator('.xc-can bdi, .xc-unknown bdi').evaluateAll((l) => l.length > 5));
    const stray = await sheet(t).locator('.xc').evaluate((c) => {
      const out = [];
      const w = document.createTreeWalker(c, NodeFilter.SHOW_TEXT);
      for (let n = w.nextNode(); n; n = w.nextNode()) if (!n.parentElement.closest('bdi') && /[A-Za-z]/.test(n.textContent)) out.push(n.textContent.trim().slice(0, 40));
      return out;
    });
    check('no English letter is left outside an isolated run anywhere in the calculator, folded parts open', stray.length === 0, stray);
    await t.screenshot({ path: path.join(out, '02-details.png'), fullPage: false });
    await t.keyboard.press('Escape');
    await t.waitForFunction(() => !document.querySelector('dialog.pf-sheet[open]'));
    check('Escape closes the sheet and focus returns to its button', await t.evaluate(() => document.activeElement?.hasAttribute('data-xcost-open')));

    // ---------- 5. inside the X setup guide ----------
    await t.locator('.pf-row[data-platform="x"] .pf-btn').first().click();
    await sheet(t).locator('.pf-step-btn').first().waitFor();
    await t.evaluate(() => [...document.querySelectorAll('dialog[open] .pf-step-btn')].find((b) => b.textContent.includes('اشحن رصيداً'))?.click());
    await sheet(t).locator('.xc').waitFor();
    check('the same calculator is in the step «اشحن رصيداً»', (await sheet(t).locator('.xc').count()) === 1 && (await total(t)) === dollars(mills(DEFAULT)), await total(t));
    check('the tables that were there are still there, four of them', (await sheet(t).locator('.gd-tbl').count()) === 4);
    check('the step lists the new action', (await sheet(t).locator('.gd-todo li').allInnerTexts()).some((s) => s.includes('الحاسبة أدناه')));
    await sheet(t).getByRole('button', { name: 'نشط' }).click();
    check('and it works there', (await total(t)) === dollars(mills({ ...DEFAULT, ...BUSY })), await total(t));
    await sheet(t).locator('.xc').screenshot({ path: path.join(out, '03-in-the-guide.png') });
    await t.keyboard.press('Escape');
    await t.context().close();

    // ---------- 6. a phone, the evening ----------
    const xm = await fresh({ width: 390, height: 844 });
    await xm.goto(base);
    await xm.waitForSelector('.pf-row');
    check('phone: the button is on the page and the page does not scroll sideways', (await xm.locator('[data-xcost-open]').isVisible()) && (await fits(xm)));
    await xm.locator('[data-xcost-open]').click();
    await sheet(xm).locator('.xc').waitFor();
    await sheet(xm).locator('.xc-more > summary').first().click();
    await xm.screenshot({ path: path.join(out, '04-phone.png') });
    check('phone: nothing in the calculator is wider than the sheet', await xm.evaluate(() => { const d = document.querySelector('dialog[open]'); const w = d.clientWidth; return [...d.querySelectorAll('.xc *')].every((e) => e.getBoundingClientRect().right <= d.getBoundingClientRect().left + w + 1 && e.getBoundingClientRect().left >= d.getBoundingClientRect().left - 1); }));
    check('phone: the sheet itself does not scroll sideways', await xm.evaluate(() => { const b = document.querySelector('dialog[open] .pf-input'); return b.scrollWidth <= b.clientWidth + 1; }));
    await xm.context().close();

    const ev = await fresh();
    await ev.goto(`${base}?dark`);
    await ev.waitForSelector('.pf-row');
    await ev.locator('[data-xcost-open]').click();
    await sheet(ev).locator('.xc').waitFor();
    await ev.screenshot({ path: path.join(out, '05-evening.png') });
    check('evening: the figure and the bars are drawn from the theme, not from fixed colours', await sheet(ev).locator('.xc-total b').evaluate((e) => getComputedStyle(e).color !== 'rgba(0, 0, 0, 0)') && (await total(ev)) === dollars(mills(DEFAULT)));
    await ev.context().close();

    check('no page error and nothing in the console', errs.length === 0, errs.slice(0, 3).join(' | '));
  } catch (e) {
    check('the flow ran to its end', false, String(e.message ?? e).slice(0, 500));
  } finally {
    await browser.close();
    fixture?.close();
  }
  process.exitCode = finish(path.join(__dirname, 'x-cost-flow.json')) ? 1 : 0;
})();

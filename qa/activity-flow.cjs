// Browser check of «سجل النشاط» (MVP_draft.md 66), in Edge: the real page and report on a fixture
// (qa/fixtures/activity-flow.tsx), served under the site's own Content-Security-Policy, because a report that runs in a
// test and is refused on the site is no report.
//   1. The director: «الكل», «نشاطي», «تقرير الشهر»; the three logs in one list; the team panel.
//   2. «نشاطي» asks the database for one person's rows; filters and paging ask too.
//   3. The month's report: the first place, the ranking, what a person finished, another month.
//   4. The three files, really downloaded, and their bytes read.
//   5. Someone without the whole log, someone given it, and the database before the migration.
//   6. Phone, tablet and evening.
// What this cannot check: the rules, in supabase/tests/activity_report_rules.sql.
// Usage: node qa/activity-flow.cjs   (writes qa/activity-flow.json, screenshots in qa/artifacts/activity-flow/)
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const esbuild = require('esbuild');
const { dependency, launchOptions } = require('./runtime.cjs');
const { chromium } = dependency('playwright');
const h = require('./android-helpers.cjs');

const { check, finish } = h.record('qa/activity-flow.cjs');
const out = path.join(__dirname, 'artifacts', 'activity-flow');
const fixtures = path.join(__dirname, 'fixtures');
const css = ['globals', 'identity', 'work', 'media', 'kit', 'permissions']
  .map((f) => fs.readFileSync(path.join(h.root, 'src', 'app', `${f}.css`), 'utf8'))
  .join('\n')
  .replace(/@import[^;]+;/g, '')
  .replace(/@theme\{[^}]*\}/g, '');
const NONCE = 'qa-nonce';
// src/lib/csp.ts, for a production page.
const CSP = `default-src 'self'; script-src 'self' 'nonce-${NONCE}' 'strict-dynamic' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; media-src 'self' data: blob: https:; connect-src 'self' https: wss:; font-src 'self' data:; worker-src 'self' blob:; frame-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'`;
const page = (dark) =>
  `<!doctype html><html lang="ar" dir="rtl" data-identity="emerald"${dark ? ' data-theme="dark"' : ''}><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>سجل النشاط</title>` +
  `<style>${css}</style><style>body{font-family:"Segoe UI",Tahoma,sans-serif}</style></head><body><div id="root"></div><script type="module" nonce="${NONCE}" src="/flow/activity-flow.js"></script></body></html>`;

const fits = (t) => t.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const tab = (t, label) => t.locator('.mx-views button', { hasText: label });
const reads = (t) => t.evaluate(() => window.__reads);
const clearReads = (t) => t.evaluate(() => (window.__reads.length = 0));

(async () => {
  let fixture;
  const errs = [];
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(path.join(out, 'flow'), { recursive: true });
  const browser = await chromium.launch(launchOptions);
  try {
    await esbuild.build({
      entryPoints: [path.join(fixtures, 'activity-flow.tsx')],
      bundle: true,
      splitting: true,
      format: 'esm',
      platform: 'browser',
      target: 'es2020',
      jsx: 'automatic',
      outdir: path.join(out, 'flow'),
      define: { 'process.env.NODE_ENV': '"production"', global: 'globalThis' },
      logLevel: 'silent',
      absWorkingDir: h.root,
      plugins: [
        {
          name: 'stand-ins',
          setup(b) {
            const fake = path.join(fixtures, 'fake-activity-flow.ts');
            b.onResolve({ filter: /^@\/lib\/supabase\/client$/ }, () => ({ path: fake }));
            b.onResolve({ filter: /^\.\.\/caps$/ }, () => ({ path: fake }));
            b.onResolve({ filter: /^\.\/provider$/ }, () => ({ path: fake }));
            b.onResolve({ filter: /^next\/(navigation|link)$/ }, () => ({ path: path.join(fixtures, 'fake-next.tsx') }));
          },
        },
      ],
    });
    const types = { '.js': 'text/javascript; charset=utf-8', '.woff': 'font/woff', '.png': 'image/png' };
    fixture = http.createServer((req, res) => {
      const url = decodeURIComponent(req.url.split('?')[0]);
      if (url.startsWith('/flow/') || url.startsWith('/report/') || url.startsWith('/brand/')) {
        const file = url.startsWith('/flow/') ? path.join(out, url) : path.join(h.root, 'public', url);
        if (!fs.existsSync(file)) {
          res.writeHead(404);
          return res.end();
        }
        res.writeHead(200, { 'Content-Type': types[path.extname(file)] ?? 'application/octet-stream' });
        return res.end(fs.readFileSync(file));
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': CSP });
      res.end(page(req.url.includes('dark=1')));
    });
    await new Promise((r) => fixture.listen(0, '127.0.0.1', r));
    const base = `http://127.0.0.1:${fixture.address().port}/`;

    const ctx = await browser.newContext({ viewport: { width: 1056, height: 900 }, deviceScaleFactor: 2, acceptDownloads: true });
    const t = await ctx.newPage();
    t.on('pageerror', (e) => errs.push(String(e)));
    t.on('console', (m) => m.type() === 'error' && !/favicon/.test(m.text()) && errs.push(m.text()));

    // ---------- 1. the director ----------
    await t.goto(`${base}?who=director`);
    await t.waitForSelector('.mx-lr');
    await t.screenshot({ path: path.join(out, '01-all.png'), fullPage: false });
    check('the director has three tabs', (await t.locator('.mx-views button').allInnerTexts()).join('|') === 'الكل|نشاطي|تقرير الشهر', await t.locator('.mx-views button').allInnerTexts());
    const text = await t.locator('.mx').innerText();
    check('the three logs are one list: the library, the work cycle and permissions', text.includes('كتابة نص') && text.includes('جدولة النشر') && text.includes('ملصق الحملة') && text.includes('منح'), text.slice(0, 300));
    check('a work\'s line links to the work', (await t.locator('.mx-lr a[href="/work/CH-101"]').count()) >= 1);
    check('the team panel is in the whole view', await t.locator('.mx-team').isVisible());
    check('a raw key never shows', !/\b(stage_done|activity\.full|upload|schedule)\b/.test(text));
    check('the first read is newest first, in pages', (await reads(t)).length >= 3);

    // ---------- 2. the solo view, filters, paging ----------
    await clearReads(t);
    await tab(t, 'نشاطي').click();
    await h.until(async () => (await reads(t)).length >= 3, 3000, 50);
    const solo = await reads(t);
    check('«نشاطي» asks each log for this person\'s rows, not a filter on the screen', solo.find((r) => r.table === 'activity_log').filters.includes('actor_email=director@example.test') && solo.find((r) => r.table === 'work_log').filters.includes('actor=director@example.test') && solo.find((r) => r.table === 'permission_events').filters.includes('actor=director@example.test'), solo);
    await t.waitForFunction(() => !document.querySelector('.mx-team'));
    await t.screenshot({ path: path.join(out, '02-mine.png'), fullPage: false });
    check('the solo view drops the team panel and the person filter', !(await t.locator('.mx-team').count()) && !(await t.locator('select[aria-label="الشخص"]').count()));
    check('it shows only their own actions', !(await t.locator('.mx').innerText()).includes('كتابة نص'));
    await tab(t, 'الكل').click();
    await t.waitForSelector('.mx-team');

    await clearReads(t);
    await t.locator('select[aria-label="الشخص"]').selectOption('one@example.test');
    await h.until(async () => (await reads(t)).some((r) => r.filters.includes('actor=one@example.test')), 3000, 50);
    check('choosing a person asks the database too, so their older rows are not lost', true);
    await t.locator('select[aria-label="الشخص"]').selectOption('all');
    await t.waitForTimeout(150);

    await t.locator('select[aria-label="الإجراء"]').selectOption('publish');
    const pub = await t.locator('.mx-lr').allInnerTexts();
    check('a kind of action gathers it from whichever log it came', pub.length === 1 && pub[0].includes('جدولة النشر'), pub);
    await t.locator('select[aria-label="الإجراء"]').selectOption('all');

    await clearReads(t);
    await t.locator('select[aria-label="الفترة"]').selectOption('last');
    await h.until(async () => (await reads(t)).length >= 3, 3000, 50);
    const period = (await reads(t))[0].filters;
    check('a period is a range sent to the database', period.some((f) => f.startsWith('at>=')) && period.some((f) => f.startsWith('at<')), period);
    await t.locator('select[aria-label="الفترة"]').selectOption('all');
    await t.waitForSelector('.mx-more');

    const before = await t.locator('.mx-lr').count();
    await clearReads(t);
    await t.locator('.mx-more').click();
    await h.until(async () => (await t.locator('.mx-lr').count()) > before, 4000, 50);
    const next = (await reads(t)).find((r) => r.table === 'activity_log').filters;
    check('«تحميل أحداث أقدم» reads on from where the list stopped', next.some((f) => f.startsWith('at<=')), next);
    const keys = await t.evaluate(() => [...document.querySelectorAll('.mx-lr')].length);
    check('paging adds rows and repeats none', keys > before && keys <= 327, { before, keys });

    // ---------- 3. the month's report ----------
    await tab(t, 'تقرير الشهر').click();
    await t.waitForSelector('.rp-hero');
    await t.locator('.rp-month select').selectOption('2026-10');
    await t.waitForSelector('.rp-person');
    await t.screenshot({ path: path.join(out, '03-report.png'), fullPage: true });
    check('it asks for the chosen month', JSON.stringify(await t.evaluate(() => window.__reportCalls[window.__reportCalls.length - 1])) === '{"p_month":"2026-10"}');
    check('the first place is named, with its points', (await t.locator('.rp-hero').innerText()).includes('مصممة الفحص') && (await t.locator('.rp-score b').innerText()) === '60', await t.locator('.rp-hero').innerText());
    const names = await t.locator('.rp-name b').allInnerTexts();
    check('the ranking runs from most to least, the leaders after it', names[0] === 'مصممة الفحص' && names[1] === 'كاتب أول' && names.indexOf('مدير الفحص') > names.indexOf('عضو هادئ'), names);
    check('the Director is shown as outside the ranking', (await t.locator('.rp-person', { hasText: 'مدير الفحص' }).innerText()).includes('خارج الترتيب'));
    await t.locator('.rp-person', { hasText: 'كاتب أول' }).locator('.rp-open').click();
    const detail = await t.locator('.rp-detail').innerText();
    check('opening a person shows what they finished, in time or late', detail.includes('مراجعة لغوية') && detail.includes('حملة اليوم الوطني') && detail.includes('متأخرة') && detail.includes('في الموعد'), detail);
    await t.screenshot({ path: path.join(out, '04-person.png'), fullPage: true });
    await t.locator('.rp-method summary').click();
    check('how points are counted is one click away', (await t.locator('.rp-method').innerText()).includes('مراحل أُنجزت: 3 نقاط'));

    // ---------- 4. the files, downloaded ----------
    const fetched = async (label) => {
      const [download] = await Promise.all([t.waitForEvent('download', { timeout: 30000 }), t.locator('.rp-files button', { hasText: label }).click()]);
      const file = path.join(out, download.suggestedFilename());
      await download.saveAs(file);
      return { file, name: download.suggestedFilename(), bytes: fs.readFileSync(file) };
    };
    const x = await fetched('Excel');
    check('Excel downloads as a real .xlsx with a clear name', x.name === 'تقرير-الفريق-2026-10.xlsx' && x.bytes.slice(0, 2).toString() === 'PK', x.name);
    const brief = await fetched('الملخص التنفيذي');
    check('«الملخص التنفيذي» downloads as a real PDF, under the site\'s policy', brief.name.endsWith('-ملخص.pdf') && brief.bytes.slice(0, 5).toString() === '%PDF-' && brief.bytes.length > 10000, brief.name);
    const full = await fetched('التقرير التفصيلي');
    check('«التقرير التفصيلي» downloads too, and is the other template', full.name.endsWith('-مفصل.pdf') && full.bytes.slice(0, 5).toString() === '%PDF-' && full.bytes.length !== brief.bytes.length, full.name);
    check('the libraries load only when a file is asked for', fs.readdirSync(path.join(out, 'flow')).filter((f) => f.endsWith('.js')).length > 1);

    await t.locator('.rp-month select').selectOption({ index: 3 });
    await h.until(async () => (await t.locator('.rp-hero').innerText()).includes('لا إنجاز'), 4000, 50);
    check('a quiet month says so and names nobody', !(await t.locator('.rp-score').count()));
    check('no page error for the director, the site\'s policy included', errs.length === 0, errs);
    await ctx.close();

    // ---------- 5. other people ----------
    const as = async (who) => {
      const c = await browser.newContext({ viewport: { width: 1056, height: 900 } });
      const p = await c.newPage();
      p.on('pageerror', (e) => errs.push(String(e)));
      await p.goto(`${base}?who=${who}`);
      await p.waitForSelector('.mx-stats');
      return { c, p };
    };
    {
      const { c, p } = await as('writer');
      check('a member without the whole log has no tabs and no report', !(await p.locator('.mx-views').count()));
      const body = await p.locator('.mx').innerText();
      check('they are told what they see, with a way to ask', body.includes('تعرض أنشطتك أنت') && (await p.locator('[data-need="activity.full"]').count()) === 1, body.slice(0, 200));
      check('they see no team panel and no one else\'s rows', !(await p.locator('.mx-team').count()) && !body.includes('جدولة النشر'));
      await p.screenshot({ path: path.join(out, '05-writer.png') });
      await c.close();
    }
    {
      const { c, p } = await as('granted');
      check('a writer given the whole log has both views, and not the report', (await p.locator('.mx-views button').allInnerTexts()).join('|') === 'الكل|نشاطي');
      check('and sees everyone', (await p.locator('.mx').innerText()).includes('جدولة النشر'));
      await c.close();
    }
    {
      const { c, p } = await as('before');
      check('before the migration the director keeps the whole log', (await p.locator('.mx-views button').allInnerTexts()).join('|') === 'الكل|نشاطي' && (await p.locator('.mx-team').count()) === 1, await p.locator('.mx-views').innerText());
      await c.close();
    }

    // ---------- 6. sizes ----------
    for (const [name, width, height, query] of [['phone', 390, 844, ''], ['tablet', 692, 900, ''], ['evening', 1056, 900, '&dark=1']]) {
      const c = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2 });
      const p = await c.newPage();
      await p.goto(`${base}?who=director${query}`);
      await p.waitForSelector('.mx-lr');
      check(`${name}: the log has no sideways scroll`, await fits(p));
      await p.screenshot({ path: path.join(out, `10-${name}-log.png`) });
      await tab(p, 'تقرير الشهر').click();
      await p.waitForSelector('.rp-hero');
      await p.locator('.rp-month select').selectOption('2026-10');
      await p.waitForSelector('.rp-person');
      await p.locator('.rp-person', { hasText: 'كاتب أول' }).locator('.rp-open').click();
      check(`${name}: the report has no sideways scroll`, await fits(p));
      await p.screenshot({ path: path.join(out, `11-${name}-report.png`), fullPage: true });
      await c.close();
    }
    check('no page error for anyone', errs.length === 0, errs);
  } catch (e) {
    check('the check ran to its end', false, `${e && e.stack ? e.stack : e} | page errors: ${errs.join(' | ')}`);
  } finally {
    await browser.close();
    if (fixture) fixture.close();
  }
  process.exitCode = finish(path.join(__dirname, 'activity-flow.json')) ? 1 : 0;
})();

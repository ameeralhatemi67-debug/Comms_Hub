// Browser check of «ألوان التقويم» (MVP_draft.md section 74), in Edge: the real «التقويم», «المشاريع», project page and
// Home, and the real sheet, on a fixture (qa/fixtures/calendar-colors.tsx) with stand-ins for the database and the work
// provider, because the pages need a signed-in person and no bypass is allowed.
//   1. Nothing chosen: today's calendar, class for class, and today's key.
//   2. The sheet: the button on the bar, «لوّن حسب» with five choices and the default first, folded rows, twelve colours.
//   3. A colour for a kind, saved at once; «إرجاع الافتراضي» for one value.
//   4. «حالة العمل»: every chip by its work's status, the key following, what is not a work in its kind's colour.
//   5. Warnings over any colour: late, at risk, near and urgent drawn outside the chip; a failed publish keeps its red.
//   6. «إرجاع الافتراضي للكل»; «المشروع» and the bands; «المنصة» and the accounts; «المسؤول»; all four views.
//   7. A choice kept before (the database's row), a refusal that goes back to what was kept, the project pages, Home.
//   8. Escape and focus, evening, phone.
// What this cannot check: the database's rules (supabase/tests/calendar_prefs_rules.sql) and a real sign-in.
// Usage: node qa/calendar-colors.cjs   (writes qa/calendar-colors.json, screenshots in qa/artifacts/calendar-colors/)
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const esbuild = require('esbuild');
const { dependency, launchOptions } = require('./runtime.cjs');
const { chromium } = dependency('playwright');
const h = require('./android-helpers.cjs');

const { check, finish } = h.record('qa/calendar-colors.cjs');
const out = path.join(__dirname, 'artifacts', 'calendar-colors');
const fixtures = path.join(__dirname, 'fixtures');
const css = ['globals', 'identity', 'media', 'kit', 'work', 'chat', 'auth', 'permissions']
  .map((f) => fs.readFileSync(path.join(h.root, 'src', 'app', `${f}.css`), 'utf8'))
  .join('\n')
  .replace(/@import[^;]+;/g, '')
  .replace(/@theme\{[^}]*\}/g, '');
const page = (dark) =>
  `<!doctype html><html lang="ar" dir="rtl" data-identity="emerald"${dark ? ' data-theme="dark"' : ''}><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>التقويم</title>` +
  `<style>${css}</style><style>body{font-family:"Segoe UI",Tahoma,sans-serif}main{max-width:1320px;margin:auto;padding:16px}</style></head><body><div id="root"></div><script type="module" src="/flow.js"></script></body></html>`;

// The palette as the page draws it (src/lib/work/calendar-colors.ts), and the warnings' colours of the new identity.
const rgb = (hex) => `rgb(${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(hex.slice(5, 7), 16)})`;
const LIGHT = { 1: ['#d3efed', '#134e4a'], 2: ['#d9ebf9', '#0c4a6e'], 4: ['#e5e1fa', '#312e81'], 6: ['#f9e1ee', '#831843'], 7: ['#fbe2df', '#7f1d1d'], 10: ['#e9f0d0', '#3a4710', '#6f831c'], 11: ['#e6eaee', '#1f2937'] };
const DARK_1 = ['#113a39', '#99e3df'];
const DANGER = rgb('#a23a2e');
const WARN = rgb('#84580f');
const P1 = '0b6f7c1e-1d2a-4c3b-9e8f-1234567890ab';
const IG = '11111111-1111-4111-8111-111111111111';
const XA = '22222222-2222-4222-8222-222222222222';
const KINDS = ['مجدول', 'معتمد · لم يُجدول', 'مقترح · لم يُعتمد بعد', 'موعد مطلوب', 'معلّق حتى القرار', 'نُشر', 'تسليم', 'مرحلة', 'مهمة', 'حدث', 'تذكير'];
const STATUSES = ['مسودة', 'قيد الإنتاج', 'قيد المراجعة', 'بحاجة إلى تعديل', 'مرفوض', 'جاهز للنشر', 'مجدول', 'جارٍ النشر', 'منشور', 'نشر جزئي', 'فشل النشر'];

const sheet = (t) => t.locator('dialog.pf-sheet[open]');
const calls = (t) => t.evaluate(() => window.__db.calls.filter((c) => c.fn === 'calendar_prefs_save').map((c) => c.args));
const lastSave = async (t) => (await calls(t)).at(-1);
const fits = (t) => t.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
/** Every chip on the calendar: its words, classes and what it is drawn with. */
const chips = (t, scope = '.wk-calwrap') =>
  t.$$eval(`${scope} .wk-cchip`, (els) =>
    els.map((e) => {
      const s = getComputedStyle(e);
      return { t: e.getAttribute('title') || e.textContent.trim(), c: e.className.split(' '), bg: s.backgroundColor, fg: s.color, ol: `${s.outlineStyle} ${s.outlineColor}`, bs: s.boxShadow };
    }),
  );
const rows = (t) => t.$$eval('.wk-crow', (els) => els.map((e) => ({ t: e.querySelector('.ct b')?.textContent ?? '', c: e.className.split(' '), stripe: getComputedStyle(e).borderInlineStartColor, accs: [...e.querySelectorAll('.wk-cr')].map((a) => a.className) })));
const chipOf = (list, start) => list.find((x) => x.t.startsWith(start));
const pal = (x) => x?.c.find((c) => /^pal-\d+$/.test(c)) ?? null;

(async () => {
  let fixture;
  const errs = [];
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch(launchOptions);
  try {
    const fake = path.join(fixtures, 'fake-calendar-colors.tsx');
    const stubs = path.join(fixtures, 'fake-calendar-stubs.tsx');
    const inWork = (a) => a.importer.includes(`${path.sep}components${path.sep}work${path.sep}`);
    const atHome = (a) => a.importer.endsWith(`${path.sep}components${path.sep}home.tsx`);
    await esbuild.build({
      entryPoints: [path.join(fixtures, 'calendar-colors.tsx')],
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
            b.onResolve({ filter: /^\.\/data$/ }, (a) => (inWork(a) ? { path: fake } : undefined));
            b.onResolve({ filter: /^\.\/work\/data$/ }, (a) => (atHome(a) ? { path: fake } : undefined));
            b.onResolve({ filter: /^\.\/(day-dialogs|item|publish|list|plan)$/ }, (a) => (inWork(a) ? { path: stubs } : undefined));
            b.onResolve({ filter: /^\.\.?\/can-create$/ }, () => ({ path: stubs }));
            b.onResolve({ filter: /^\.\/(home-perms|writing\/api)$/ }, (a) => (atHome(a) ? { path: stubs } : undefined));
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
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(page(url.searchParams.has('dark')));
    });
    await new Promise((r) => fixture.listen(0, '127.0.0.1', r));
    const base = `http://127.0.0.1:${fixture.address().port}/`;
    const outside = [];
    const open = async (q = '', viewport = { width: 1320, height: 940 }) => {
      const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2 });
      await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => {
        outside.push(r.request().url());
        return r.fulfill({ status: 200, contentType: 'text/plain', body: 'outside' });
      });
      const t = await ctx.newPage();
      t.on('pageerror', (e) => errs.push(String(e)));
      t.on('console', (m) => m.type() === 'error' && !/favicon/.test(m.text()) && errs.push(m.text()));
      await t.goto(`${base}${q}`);
      await t.locator('.wk').first().waitFor();
      await t.waitForFunction(() => window.__db.reads > 0);
      return t;
    };
    // Buttons fade their colours (identity.css), so a colour is read once nothing is moving.
    const settle = (t) => t.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'), null, { timeout: 5000 }).catch(() => undefined);
    const openSheet = async (t) => {
      await t.locator('[data-gd="calcolors"]').click();
      await sheet(t).locator('[data-cc="sheet"]').waitFor();
      await settle(t);
    };
    const ensureSheet = async (t) => {
      if (!(await sheet(t).count())) await openSheet(t);
    };
    const closeSheet = async (t) => {
      if (!(await sheet(t).count())) return;
      await sheet(t).locator('.pf-head .pf-btn').click();
      await sheet(t).waitFor({ state: 'detached' });
    };
    const mode = async (t, label) => {
      await ensureSheet(t);
      await sheet(t).locator('[data-cc="modes"]').getByRole('button', { name: label, exact: true }).click();
      await t.waitForTimeout(60);
      await settle(t);
    };
    const row = (t, key) => sheet(t).locator(`[data-cc-row="${key}"]`);
    const pick = async (t, key, name) => {
      await ensureSheet(t);
      const r = row(t, key);
      if ((await r.locator('.cc-pick').getAttribute('aria-expanded')) !== 'true') await r.locator('.cc-pick').click();
      await r.getByRole('radio', { name, exact: true }).click();
      await t.waitForTimeout(60);
      await settle(t);
    };
    // The sheet is modal: the calendar behind it is not clickable until it closes.
    const view = async (t, label) => {
      await closeSheet(t);
      await t.locator('[data-gd="calviews"]').getByRole('button', { name: label, exact: true }).click();
      await t.waitForTimeout(60);
      await settle(t);
    };
    const WINTER = 'مجدول · إعلان الشتاء';

    // ---------- 1. nothing chosen ----------
    const t = await open();
    await t.screenshot({ path: path.join(out, '01-default.png'), fullPage: true });
    const c0 = await chips(t);
    check('the week draws its entries', c0.length >= 10, c0.length);
    check('nothing chosen: no chip carries a chosen colour', c0.every((x) => !x.c.includes('pal')), c0.filter((x) => x.c.includes('pal')).map((x) => x.t));
    check('and every chip has its kind\'s own class, as before', c0.every((x) => x.c.some((c) => /^k-/.test(c))));
    const key0 = await t.locator('[data-cc="key"] .wk-cchip').allInnerTexts();
    check('the key is today\'s: the eleven kinds, then the two warnings', JSON.stringify(key0.map((s) => s.trim())) === JSON.stringify([...KINDS, 'التفويض لا يغطي الموعد', 'قريب من منشور آخر']), key0);
    check('the choice is read once from the database', (await t.evaluate(() => window.__db.reads)) === 1);

    // ---------- 2. the sheet ----------
    const btn = t.locator('.wk-calf [data-gd="calcolors"]');
    check('«الألوان» is on the calendar\'s bar', (await btn.innerText()).trim() === 'الألوان');
    await openSheet(t);
    check('it opens the sheet «ألوان التقويم»', (await sheet(t).getAttribute('aria-label')) === 'ألوان التقويم' && (await sheet(t).locator('h2').innerText()) === 'ألوان التقويم');
    check('the sheet says the colours are the person\'s own and follow them', (await sheet(t).locator('.pf-title small').innerText()).includes('تتبعك على كل جهاز'));
    const modes = await sheet(t).locator('[data-cc="modes"] button').evaluateAll((b) => b.map((x) => [x.textContent.trim(), x.getAttribute('aria-pressed')]));
    check('«لوّن حسب» has five choices, «نوع الموعد» first and chosen', JSON.stringify(modes) === JSON.stringify([['نوع الموعد', 'true'], ['حالة العمل', 'false'], ['المشروع', 'false'], ['المنصة', 'false'], ['المسؤول', 'false']]), modes);
    const kindRows = await sheet(t).locator('[data-cc-row] .cc-pick .wk-cchip').allInnerTexts();
    check('one row per kind, in the key\'s order', JSON.stringify(kindRows.map((s) => s.trim())) === JSON.stringify(KINDS), kindRows);
    check('every row folded until opened', (await sheet(t).locator('.cc-open').count()) === 0);
    check('a kind starts in its usual colour', (await row(t, 'kind:pub').locator('small').innerText()) === 'اللون المعتاد');
    check('there is no free colour picker', (await t.locator('input[type="color"]').count()) === 0);
    await row(t, 'kind:pub').locator('.cc-pick').click();
    const sws = await row(t, 'kind:pub').getByRole('radio').evaluateAll((b) => b.map((x) => [x.getAttribute('aria-label'), x.getAttribute('aria-checked'), getComputedStyle(x).backgroundColor]));
    check('opened: twelve colours, each named', sws.length === 12 && new Set(sws.map((s) => s[0])).size === 12, sws.map((s) => s[0]));
    check('none chosen while the kind keeps its usual colour', sws.every((s) => s[1] === 'false'));
    check('each swatch drawn in its own colour', new Set(sws.map((s) => s[2])).size === 12 && sws[4][2] === rgb('#5a52d0'), sws.map((s) => s[2]));
    await t.screenshot({ path: path.join(out, '02-sheet.png') });

    // ---------- 3. a colour for a kind ----------
    await pick(t, 'kind:pub', 'نيلي');
    const s1 = await lastSave(t);
    check('a pick is saved at once, the whole choice', JSON.stringify(s1) === JSON.stringify({ p_mode: 'kind', p_colors: { 'kind:pub': 4 } }), s1);
    check('the row says it is the person\'s choice', (await row(t, 'kind:pub').locator('.cc-mine').innerText()) === 'اختيارك' && (await row(t, 'kind:pub').getByRole('radio', { name: 'نيلي' }).getAttribute('aria-checked')) === 'true');
    const c1 = await chips(t);
    const sched = c1.filter((x) => x.c.includes('k-pub'));
    check('every «مجدول» on the calendar takes it', sched.length >= 3 && sched.every((x) => pal(x) === 'pal-4'), sched.map((x) => x.c.join('.')));
    check('drawn in the colour and its text', sched.every((x) => x.bg === rgb(LIGHT[4][0]) && x.fg === rgb(LIGHT[4][1])), sched.map((x) => `${x.bg} ${x.fg}`));
    check('the other kinds stay as they were', c1.filter((x) => !x.c.includes('k-pub')).every((x) => !x.c.includes('pal')));
    check('the key shows it', (await t.locator('[data-cc-key="kind:pub"]').getAttribute('class')).includes('pal-4'));
    await row(t, 'kind:pub').locator('[data-cc="reset-one"]').click();
    await t.waitForTimeout(60);
    check('«إرجاع الافتراضي» for one value keeps nothing', JSON.stringify((await lastSave(t)).p_colors) === '{}');
    check('and the chips are today\'s again', (await chips(t)).every((x) => !x.c.includes('pal')));

    // ---------- 4. «حالة العمل» ----------
    await mode(t, 'حالة العمل');
    check('choosing «حالة العمل» is saved', (await lastSave(t)).p_mode === 'status');
    check('the sheet lists the eleven statuses', JSON.stringify((await sheet(t).locator('[data-cc-row] .cc-pick .wk-cchip').allInnerTexts()).map((s) => s.trim())) === JSON.stringify(STATUSES));
    check('and says what keeps its kind\'s colour', (await sheet(t).locator('[data-cc="hint"]').innerText()).includes('ما ليس عملاً'));
    const c2 = await chips(t);
    const winter = c2.filter((x) => x.t.startsWith(WINTER));
    check('a scheduled work takes «مجدول»\'s colour on every account', winter.length === 2 && winter.every((x) => pal(x) === 'pal-1') && winter.every((x) => x.bg === rgb(LIGHT[1][0])), winter.map((x) => x.c.join('.')));
    const stage = chipOf(c2, 'مرحلة · النص');
    check('a stage takes its work\'s status, «قيد الإنتاج»', pal(stage) === 'pal-2', stage?.c);
    const rem = chipOf(c2, 'تذكير');
    check('a reminder is not a work and keeps its kind\'s colour', rem && !rem.c.includes('pal') && rem.c.includes('k-rem'), rem?.c);
    const keyS = await t.locator('[data-cc="key"]').innerText();
    check('the key follows the mode', keyS.includes('لوّن حسب حالة العمل') && (await t.locator('[data-cc="key"]').getAttribute('data-mode')) === 'status');
    const keyItems = await t.locator('[data-cc-key]').evaluateAll((e) => e.map((x) => x.textContent.trim()));
    check('and lists the statuses on the calendar now, in order', JSON.stringify(keyItems) === JSON.stringify(['قيد الإنتاج', 'قيد المراجعة', 'جاهز للنشر', 'مجدول', 'نشر جزئي']), keyItems);
    await pick(t, 'status:IN_REVIEW', 'أحمر');
    const press = chipOf(await chips(t), 'مقترح · لم يُعتمد بعد · بيان صحفي');
    check('a status\'s colour is chosen like a kind\'s', pal(press) === 'pal-7' && press.bg === rgb(LIGHT[7][0]), press?.c);
    check('and saved with the mode', JSON.stringify(await lastSave(t)) === JSON.stringify({ p_mode: 'status', p_colors: { 'status:IN_REVIEW': 7 } }));

    // ---------- 5. warnings over any colour ----------
    const c5 = await chips(t);
    const onX = c5.find((x) => x.t.startsWith(WINTER) && x.c.includes('risk'));
    check('at risk, coloured: an amber ring outside the chip', onX && pal(onX) && onX.bs.includes(`${WARN} 0px 0px 0px 3px`), onX?.bs);
    check('near, coloured: an amber line under it', onX?.c.includes('near') && onX.bs.includes(`${WARN} 0px 3px 0px 0px`), onX?.bs);
    check('urgent, coloured: a red edge at its start', onX?.c.includes('urg') && onX.bs.includes(`${DANGER} 4px 0px 0px 0px`), onX?.bs);
    const late = chipOf(c5, 'مرحلة · النص');
    check('late, coloured: a red outline outside it', late?.c.includes('late') && late.ol === `solid ${DANGER}`, late?.ol);
    check('a late chip keeps its colour\'s readable text', late?.fg === rgb(LIGHT[2][1]), late?.fg);
    const failedX = c5.find((x) => x.t.includes('منشور الصباح') && x.c.includes('bad'));
    check('a failed publish keeps its red and takes no colour', failedX && !failedX.c.includes('pal'), failedX?.c);
    const lateTask = chipOf(c5, 'مهمة · مراجعة الصور');
    check('a late task without a colour keeps today\'s red', lateTask && !lateTask.c.includes('pal') && lateTask.fg === DANGER, lateTask);
    await closeSheet(t);
    await t.locator('.wk-calwrap').screenshot({ path: path.join(out, '03-status-warnings.png') });

    // ---------- 6. reset all, then the other modes and views ----------
    await pick(t, 'status:DRAFT', 'وردي');
    await sheet(t).locator('[data-cc="reset-all"]').click();
    await t.waitForTimeout(60);
    check('«إرجاع الافتراضي للكل» empties this mode', JSON.stringify(await lastSave(t)) === JSON.stringify({ p_mode: 'status', p_colors: {} }));
    check('and is gone when nothing is changed', (await sheet(t).locator('[data-cc="reset-all"]').count()) === 0);
    await mode(t, 'المشروع');
    check('the projects are the values', JSON.stringify((await sheet(t).locator('[data-cc-row] .cc-pick .wk-cchip').allInnerTexts()).map((s) => s.trim())) === JSON.stringify(['حملة الشتاء', 'المعرض']));
    await pick(t, `project:${P1}`, 'زيتوني');
    const band = await t.locator('.cw-bands:not(.spans) .wk-band', { hasText: 'حملة الشتاء' }).evaluate((e) => [e.className, getComputedStyle(e).backgroundColor]);
    check('the project\'s band takes its colour instead of its tone', band[0].includes('pal-10') && !/\bt\d\b/.test(band[0]) && band[1] === rgb(LIGHT[10][0]), band);
    const fair = await t.locator('.cw-bands:not(.spans) .wk-band', { hasText: 'المعرض' }).getAttribute('class');
    check('a project with no colour keeps its tone', /\bt\d\b/.test(fair) && !fair.includes('pal'), fair);
    const c6 = await chips(t);
    check('its works take it on the calendar', pal(chipOf(c6, 'مرحلة · النص')) === 'pal-10' && pal(c6.find((x) => x.t.startsWith(WINTER))) === 'pal-10');
    check('so do its own events', pal(chipOf(c6, 'حدث · اجتماع الفريق')) === 'pal-10');
    check('what is in no project keeps its kind\'s colour', !chipOf(c6, 'تذكير').c.includes('pal') && !c6.find((x) => x.t.includes('بيان صحفي')).c.includes('pal'));
    await view(t, 'شهر');
    const strip = await t.locator('.cm-str i[title="حملة الشتاء"]').first().evaluate((e) => [e.className, getComputedStyle(e).backgroundColor]);
    check('month: the day\'s strip of the project in its colour', strip[0].includes('pal-10') && strip[1] === rgb(LIGHT[10][2]), strip);
    check('month: its chips too', (await chips(t)).some((x) => pal(x) === 'pal-10'));
    await mode(t, 'المنصة');
    await view(t, 'أسبوع');
    const c7 = await chips(t);
    const ig = c7.filter((x) => x.t.startsWith(WINTER) && !x.c.includes('risk'));
    const xa = c7.filter((x) => x.t.startsWith(WINTER) && x.c.includes('risk'));
    check('«المنصة»: each account starts from its platform\'s colour', pal(ig[0]) === 'pal-6' && pal(xa[0]) === 'pal-11', [ig[0]?.c, xa[0]?.c]);
    check('a delivery is on no account and keeps its kind\'s colour', !chipOf(c7, 'تسليم').c.includes('pal'));
    await pick(t, `platform:${IG}`, 'سماوي');
    await view(t, 'قائمة');
    const r7 = await rows(t);
    const winterRow = r7.find((x) => x.t === 'إعلان الشتاء');
    check('list view: the row\'s stripe takes the first account\'s colour', winterRow?.c.includes('pal-2') && winterRow.stripe === rgb('#2a78b5'), winterRow);
    check('and each account named in the row in its own colour', winterRow?.accs.some((a) => a.includes('pal-2')) && winterRow.accs.some((a) => a.includes('risk')), winterRow?.accs);
    const yRow = r7.find((x) => x.t === 'منشور الصباح');
    check('a result on an account wins over its colour', yRow?.accs.some((a) => a.includes('bad')) && yRow.accs.some((a) => a.includes('ok')) && yRow.accs.every((a) => !a.includes('pal')), yRow?.accs);
    await mode(t, 'المسؤول');
    await view(t, 'يوم');
    const r8 = await rows(t);
    check('day view: rows carry the person\'s colour', r8.length >= 2 && r8.filter((x) => x.c.includes('pal')).length >= 1, r8.map((x) => [x.t, x.c.join('.')]));
    check('an event and a reminder have nobody responsible: their kind\'s colour', r8.filter((x) => x.c.includes('k-rem') || x.c.includes('k-event')).every((x) => !x.c.includes('pal')), r8.map((x) => x.c.join('.')));
    // Two people may start in the same colour (the default comes from the address), so one is given another.
    await pick(t, 'person:wri@example.test', 'برتقالي');
    await view(t, 'أسبوع');
    const c8 = await chips(t);
    const s0 = chipOf(c8, 'مرحلة · النص');
    const s1b = chipOf(c8, 'مرحلة · المونتاج');
    check('«المسؤول»: a stage is its holder\'s', pal(s0) === 'pal-8' && pal(s1b) && pal(s1b) !== 'pal-8', [s0?.c, s1b?.c]);
    check('and the person\'s works take it too', c8.filter((x) => x.t.startsWith(WINTER)).every((x) => pal(x) === 'pal-8'));
    check('the key lists the people on the calendar', (await t.locator('[data-cc-key]').allInnerTexts()).map((s) => s.trim()).includes('كاتبة الفحص'));
    const saves = await calls(t);
    check('every change was one save of the whole choice, in order', saves.length >= 10 && saves.at(-1).p_mode === 'person' && saves.at(-1).p_colors[`project:${P1}`] === 10 && saves.at(-1).p_colors[`platform:${IG}`] === 2, saves.at(-1));
    await t.screenshot({ path: path.join(out, '04-person.png') });

    // ---------- 8a. Escape and focus ----------
    await openSheet(t);
    await t.keyboard.press('Escape');
    await t.waitForTimeout(80);
    check('Escape closes the sheet', (await sheet(t).count()) === 0);
    check('and the focus is back on «الألوان»', await t.evaluate(() => document.activeElement?.getAttribute('data-gd') === 'calcolors'));
    await t.context().close();

    // ---------- 7. a choice kept before, a refusal, the project pages, Home ----------
    const kept = await open('?seed=status');
    const k1 = chipOf(await chips(kept), 'مقترح · لم يُعتمد بعد · بيان صحفي');
    check('a choice kept in the database is the calendar on the next visit', pal(k1) === 'pal-4', k1?.c);
    check('with the key in that mode', (await kept.locator('[data-cc="key"]').getAttribute('data-mode')) === 'status');
    await openSheet(kept);
    check('and the sheet opens on it', (await sheet(kept).locator('[data-cc="modes"] [aria-pressed="true"]').innerText()) === 'حالة العمل' && (await row(kept, 'status:IN_REVIEW').locator('.cc-mine').count()) === 1);
    await kept.context().close();

    const bad = await open('?seed=status&fail=1');
    await openSheet(bad);
    await pick(bad, 'status:SCHEDULED', 'ذهبي');
    await bad.waitForTimeout(120);
    await settle(bad);
    const says = await bad.evaluate(() => window.__db.says);
    check('a refusal is said in words', says.some((s) => s.includes('تعذّر حفظ الألوان')), says);
    check('and the calendar goes back to what was kept', (await chips(bad)).filter((x) => x.t.startsWith(WINTER)).every((x) => pal(x) === 'pal-1') && pal(chipOf(await chips(bad), 'مقترح · لم يُعتمد بعد · بيان صحفي')) === 'pal-4');
    await bad.context().close();

    const pl = await open('?page=projects&seed=project');
    const cards = await pl.locator('.wk-projcard').evaluateAll((e) => e.map((x) => [x.querySelector('b')?.textContent, x.className, getComputedStyle(x).borderTopColor]));
    const wc = cards.find((c) => c[0] === 'حملة الشتاء');
    const fc = cards.find((c) => c[0] === 'المعرض');
    check('«المشاريع»: a project\'s card takes its colour', wc && wc[1].includes('pal-10') && wc[2] === rgb(LIGHT[10][2]), wc);
    check('and one with none keeps its tone', fc && /\bt\d\b/.test(fc[1]) && !fc[1].includes('pal'), fc);
    await pl.screenshot({ path: path.join(out, '05-projects.png') });
    await pl.context().close();
    const pp = await open('?page=project&seed=project');
    const head = await pp.locator('.wk-ihead .wk-band').evaluate((e) => [e.className, getComputedStyle(e).backgroundColor]);
    check('the project page\'s band takes it too', head[0].includes('pal-10') && head[1] === rgb(LIGHT[10][0]), head);
    const toCal = await pp.getByRole('link', { name: 'في التقويم' }).getAttribute('href');
    check('and its «في التقويم» opens the calendar on that project, where the same colours apply', toCal.includes(`project=${P1}`), toCal);
    await pp.context().close();

    const home = await open('?page=home&seed=status');
    await home.locator('[data-gd="upcoming"] .wk-hrow').first().waitFor();
    const up = await home.locator('[data-gd="upcoming"] .wk-hrow').evaluateAll((e) => e.map((x) => [x.querySelector('b')?.textContent, x.querySelector('.wk-cchip')?.className]));
    const hw = up.find((x) => x[0] === 'فيديو الافتتاح');
    const ht = up.find((x) => x[0] === 'تهنئة');
    check('Home\'s next days use the same colours', hw && hw[1].includes('k-due pal pal-2') && ht && ht[1].includes('k-ok pal pal-0'), up);
    check('and what has no value keeps its kind\'s colour there too', up.filter((x) => /k-rem|k-event/.test(x[1])).every((x) => !x[1].includes('pal')), up);
    await home.locator('[data-gd="upcoming"]').screenshot({ path: path.join(out, '06-home.png') });
    await home.context().close();

    // ---------- 8b. evening and phone ----------
    const dk = await open('?seed=status&dark=1');
    await settle(dk);
    const cd = await chips(dk);
    const dw = cd.find((x) => x.t.startsWith(WINTER));
    check('evening: a colour takes its dark pair', dw?.bg === rgb(DARK_1[0]) && dw.fg === rgb(DARK_1[1]), dw);
    const lum = (s) => {
      const [r, g, b] = s.match(/\d+/g).slice(0, 3).map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const ratio = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
    const low = cd.filter((x) => x.c.includes('pal')).map((x) => ratio(x.fg, x.bg)).sort((a, b) => a - b)[0];
    check('evening: every coloured chip on screen is readable', low >= 4.5, low);
    const dl = chipOf(cd, 'مرحلة · النص');
    check('evening: late keeps its red outline', dl?.ol === `solid ${rgb('#f19a8d')}`, dl?.ol);
    await dk.screenshot({ path: path.join(out, '07-evening.png'), fullPage: true });
    await openSheet(dk);
    await row(dk, 'status:IN_REVIEW').locator('.cc-pick').click();
    await dk.screenshot({ path: path.join(out, '08-evening-sheet.png') });
    await dk.context().close();

    const ph = await open('?seed=status', { width: 375, height: 812 });
    check('phone: the calendar opens on the list', (await ph.locator('[data-gd="calviews"] [aria-pressed="true"]').innerText()) === 'قائمة');
    check('phone: its rows carry the colours', (await rows(ph)).some((x) => x.c.includes('pal')));
    await openSheet(ph);
    await row(ph, 'status:SCHEDULED').locator('.cc-pick').click();
    check('phone: nothing sideways with the sheet open', await fits(ph));
    const sw = await row(ph, 'status:SCHEDULED').getByRole('radio').first().boundingBox();
    check('phone: a colour is a comfortable size to tap', sw && sw.height >= 36 && sw.width >= 36, sw);
    const modeBox = await sheet(ph).locator('[data-cc="modes"] button').first().boundingBox();
    check('phone: the five choices fit', modeBox && modeBox.x >= 0, modeBox);
    await ph.screenshot({ path: path.join(out, '09-phone.png') });
    await ph.context().close();

    check('nothing left the fixture', outside.length === 0, outside.slice(0, 3));
    check('no page error and nothing in the console', errs.length === 0, errs.slice(0, 3).join(' | '));
  } catch (e) {
    check('the flow ran to its end', false, String(e.message ?? e).slice(0, 500));
  } finally {
    await browser.close();
    fixture?.close();
  }
  process.exitCode = finish(path.join(__dirname, 'calendar-colors.json')) ? 1 : 0;
})();

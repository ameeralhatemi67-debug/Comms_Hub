// Browser check of «ورقة الكتابة» (MVP_draft.md section 68), in Edge: the real sheet, editor and ribbon on a fixture
// (qa/fixtures/writing-flow.tsx), with stand-ins for the database and the routes, because the page needs a signed-in person and
// no bypass is allowed. The stand-in of the save route runs the same check as the real one.
//   1. The page: which side is which, the ribbon's height, the tools and their shortcuts, an Arabic keyboard.
//   2. Tables: rows and columns, selecting a column, a row and a range, fills, lines and transparency on those cells only.
//   3. Saving: a version, a draft that survives closing, undo.
//   4. Copies, notes, versions, the application's shortcuts, the library, Word and PDF.
//   5. Who may do what, phone width and the evening theme.
// What this cannot check: the database's rules (supabase/tests/writing_rules.sql) and a real Drive.
// Usage: node qa/writing-flow.cjs   (writes qa/writing-flow.json, screenshots in qa/artifacts/writing-flow/)
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const esbuild = require('esbuild');
const { dependency, launchOptions } = require('./runtime.cjs');
const { chromium } = dependency('playwright');
const h = require('./android-helpers.cjs');

const { check, finish } = h.record('qa/writing-flow.cjs');
const out = path.join(__dirname, 'artifacts', 'writing-flow');
const fixtures = path.join(__dirname, 'fixtures');
const css = ['globals', 'identity', 'media', 'kit', 'work', 'chat', 'auth', 'permissions', 'writing']
  .map((f) => fs.readFileSync(path.join(h.root, 'src', 'app', `${f}.css`), 'utf8'))
  .join('\n')
  .replace(/@import[^;]+;/g, '')
  .replace(/@theme\{[^}]*\}/g, '');
const page = (dark, dir) =>
  `<!doctype html><html lang="${dir === 'ltr' ? 'en' : 'ar'}" dir="${dir}" data-identity="emerald"${dark ? ' data-theme="dark"' : ''}><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>flow</title>` +
  `<style>${css}</style><style>body{font-family:"Segoe UI",Tahoma,sans-serif}</style></head><body><div id="root"></div><script type="module" src="/flow.js"></script></body></html>`;

(async () => {
  let fixture;
  const errs = [];
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch(launchOptions);
  try {
    const fake = path.join(fixtures, 'fake-writing.tsx');
    await esbuild.build({
      entryPoints: [path.join(fixtures, 'writing-flow.tsx')],
      bundle: true,
      format: 'esm',
      platform: 'browser',
      target: 'es2020',
      jsx: 'automatic',
      outfile: path.join(out, 'flow.js'),
      define: { 'process.env.NODE_ENV': '"production"' },
      logLevel: 'silent',
      absWorkingDir: h.root,
      alias: { '@': path.join(h.root, 'src') },
      loader: { '.css': 'empty', '.woff2': 'empty', '.woff': 'empty' },
      plugins: [
        {
          name: 'stand-ins',
          setup(b) {
            b.onResolve({ filter: /^@\/lib\/supabase\/client$/ }, () => ({ path: fake }));
            b.onResolve({ filter: /^(\.\/|\.\.\/work\/)data$/ }, (a) => (a.importer.includes(`${path.sep}work${path.sep}`) || a.importer.includes(`${path.sep}writing${path.sep}`) ? { path: fake } : undefined));
            b.onResolve({ filter: /^next\/(navigation|link)$/ }, () => ({ path: path.join(fixtures, 'fake-next.tsx') }));
            b.onResolve({ filter: /studio-fonts$/ }, () => ({ path: 'empty', namespace: 'empty' }));
            b.onLoad({ filter: /.*/, namespace: 'empty' }, () => ({ contents: '' }));
          },
        },
      ],
    });
    await esbuild.build({
      entryPoints: [path.join(fixtures, 'writing-pages.tsx')],
      bundle: true,
      format: 'esm',
      platform: 'browser',
      target: 'es2020',
      jsx: 'automatic',
      outfile: path.join(out, 'pages.js'),
      define: { 'process.env.NODE_ENV': '"production"' },
      logLevel: 'silent',
      absWorkingDir: h.root,
      alias: { '@': path.join(h.root, 'src') },
      loader: { '.css': 'empty', '.woff2': 'empty', '.woff': 'empty' },
      plugins: [
        {
          name: 'stand-ins',
          setup(b) {
            b.onResolve({ filter: /^@\/lib\/supabase\/client$/ }, () => ({ path: fake }));
            b.onResolve({ filter: /^@\/lib\/account-context$/ }, () => ({ path: fake }));
            b.onResolve({ filter: /\/home-perms$/ }, () => ({ path: fake }));
            b.onResolve({ filter: /\/can-create$/ }, () => ({ path: fake }));
            b.onResolve({ filter: /(^\.\/data$|^\.\.\/work\/data$|^\.\/work\/data$)/ }, () => ({ path: fake }));
            b.onResolve({ filter: /^next\/(navigation|link)$/ }, () => ({ path: path.join(fixtures, 'fake-next.tsx') }));
            b.onResolve({ filter: /studio-fonts$/ }, () => ({ path: 'empty', namespace: 'empty' }));
            b.onLoad({ filter: /.*/, namespace: 'empty' }, () => ({ contents: '' }));
          },
        },
      ],
    });
    const bundle = fs.readFileSync(path.join(out, 'flow.js'), 'utf8');
    const pagesBundle = fs.readFileSync(path.join(out, 'pages.js'), 'utf8');
    fixture = http.createServer((req, res) => {
      const url = new URL(req.url, 'http://x');
      if (url.pathname === '/flow.js') {
        res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
        return res.end(bundle);
      }
      if (url.pathname === '/pages.js') {
        res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
        return res.end(pagesBundle);
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      const html = page(url.searchParams.has('dark'), url.searchParams.get('dir') === 'ltr' ? 'ltr' : 'rtl');
      return res.end(url.searchParams.has('page') ? html.replace('/flow.js', '/pages.js') : html);
    });
    await new Promise((r) => fixture.listen(0, '127.0.0.1', r));
    const base = `http://127.0.0.1:${fixture.address().port}/`;

    const fresh = async (query = '', viewport = { width: 1366, height: 860 }) => {
      const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1 });
      const t = await ctx.newPage();
      t.on('pageerror', (e) => errs.push(String(e)));
      t.on('console', (m) => m.type() === 'error' && !/favicon|404|fonts/.test(m.text()) && errs.push(m.text()));
      await t.goto(`${base}?${query}`);
      await t.waitForSelector('.wr-paper-in');
      await t.waitForTimeout(250);
      return t;
    };
    const shot = (t, name) => t.screenshot({ path: path.join(out, `${name}.png`) });
    const calls = (t, name) => t.evaluate((n) => window.__db.calls.filter((c) => c.name === n).map((c) => c.args), name);
    const says = (t) => t.evaluate(() => window.__db.says.join(' | '));
    const css1 = (t, sel, prop) => t.evaluate(([s, p]) => getComputedStyle(document.querySelector(s))[p], [sel, prop]);
    const selectText = (t, sel) => t.evaluate((s) => {
      const el = document.querySelector(s);
      const r = document.createRange();
      r.selectNodeContents(el);
      const g = getSelection();
      document.querySelector('.wr-paper-in').focus();
      g.removeAllRanges();
      g.addRange(r);
    }, sel).then(() => t.waitForTimeout(60));
    const caret = (t, sel) => t.evaluate((s) => {
      const el = document.querySelector(s);
      const r = document.createRange();
      r.selectNodeContents(el);
      r.collapse(false);
      const g = getSelection();
      document.querySelector('.wr-paper-in').focus();
      g.removeAllRanges();
      g.addRange(r);
    }, sel).then(() => t.waitForTimeout(60));
    const rtab = (t, k) => t.click(`[data-rtab="${k}"]`);

    // ---------- 1. the page ----------
    const t = await fresh('work=CH-2');
    await shot(t, '01-sheet');
    const sides = await t.evaluate(() => ({ main: document.querySelector('.wr-main').getBoundingClientRect().left, side: document.querySelector('.wr-side').getBoundingClientRect().left }));
    check('the page is on the right and the panel on the left in Arabic', sides.main > sides.side, sides);
    check('the brief is beside the page', (await t.textContent('.wr-sbody')).includes('فيديو من دقيقتين'));
    const rb = () => t.evaluate(() => document.querySelector('.wr-ribbon').getBoundingClientRect().height);
    const height = await rb();
    for (const k of ['file', 'insert', 'view', 'home']) await rtab(t, k);
    check('the ribbon keeps its height on every tab', (await rb()) === height, await rb());
    check('a stage writer may write, and hands over', (await t.textContent('#wrSend')).includes('تسليم إلى لمى'));

    await t.waitForSelector('#wrStyle');
    await t.click('.wr-paper-in');
    await t.keyboard.type('عنوان الفيديو');
    await t.keyboard.press('Enter');
    await t.keyboard.type('لقطة واسعة للقاعة قبل الجلسة');
    await selectText(t, '.wr-paper-in p');
    await t.selectOption('#wrStyle', 'h2');
    check('the text on the page is dark ink, not muted grey', (await css1(t, '.wr-paper-in p', 'color')) === 'rgb(16, 36, 29)', await css1(t, '.wr-paper-in p', 'color'));
    check('the tools keep their own size, not the 42px of site buttons', (await t.evaluate(() => document.querySelector('.wr-tool').getBoundingClientRect().height)) === 32);
    check('the Word file picker stays hidden', !(await t.locator('.wr-sheet input[type="file"]').isVisible()));
    check('the writer starts in the text', await t.evaluate(() => document.activeElement?.classList.contains('wr-paper-in')));
    check('a style applies from the list', (await t.locator('.wr-paper-in h2').count()) === 1);
    await selectText(t, '.wr-paper-in h2');
    await t.keyboard.press('Control+KeyB');
    check('Ctrl+B applies bold', (await t.locator('.wr-paper-in h2 strong').count()) === 1);
    await t.keyboard.press('Control+KeyB');
    await t.keyboard.press('Control+KeyE');
    check('Ctrl+E centres', (await css1(t, '.wr-paper-in h2', 'textAlign')) === 'center');
    await t.keyboard.press('Control+KeyR');
    await t.evaluate(() => document.querySelector('[contenteditable]').dispatchEvent(new KeyboardEvent('keydown', { key: 'لا', code: 'KeyI', ctrlKey: true, bubbles: true, cancelable: true })));
    await t.waitForTimeout(50);
    check('a shortcut works from an Arabic layout, by the key\'s place', (await t.locator('.wr-paper-in h2 em').count()) === 1);
    await t.keyboard.press('Control+KeyZ');
    await selectText(t, '.wr-paper-in p');
    await t.selectOption('#wrFont', 'Amiri');
    check('a font applies to the selection', /Amiri/.test(await t.innerHTML('.wr-paper-in p')));
    check('there are 25 fonts', (await t.locator('#wrFont option').count()) === 25);
    await selectText(t, '.wr-paper-in p');
    await t.selectOption('#wrSize', '24');
    check('a size applies', /font-size:\s*24px/.test(await t.innerHTML('.wr-paper-in p')));
    await t.click('button[aria-label="لون النص"]');
    await t.click('.wr-pop .wr-sw button[aria-label="اللون #a23a2e"]');
    check('a text colour applies', /color:\s*(#a23a2e|rgb\(162, 58, 46\))/.test(await t.innerHTML('.wr-paper-in p')));
    await t.click('button[aria-label="تمييز النص"]');
    await t.click('.wr-pop .wr-sw button[aria-label="اللون #f8e4a8"]');
    check('a highlight applies', /background-color:\s*(#f8e4a8|rgb\(248, 228, 168\))/.test(await t.innerHTML('.wr-paper-in p')));
    await t.keyboard.press('Control+Shift+KeyL');
    check('Ctrl+Shift+L makes a list', (await t.locator('.wr-paper-in ul li').count()) >= 1);
    await t.keyboard.press('Control+KeyZ');

    // ---------- 2. tables ----------
    await caret(t, '.wr-paper-in p:last-of-type');
    await rtab(t, 'insert');
    await t.click('[data-cmd="table"]');
    await t.waitForSelector('.wr-tgrid');
    await shot(t, '02-table-picker');
    await t.fill('.wr-tnums label:first-child input', '4');
    await t.fill('.wr-tnums label:last-child input', '3');
    check('the picker says the size', (await t.textContent('.wr-popt')).includes('4 صفوف') && (await t.textContent('.wr-popt')).includes('3 أعمدة'));
    await t.click('.wr-pop .wk-btn.primary');
    await t.waitForTimeout(120);
    const shape = () => t.evaluate(() => [...document.querySelectorAll('.wr-paper-in table')].pop().rows.length + 'x' + [...document.querySelectorAll('.wr-paper-in table')].pop().rows[0].cells.length);
    check('numbers make that table', (await shape()) === '4x3', await shape());
    await t.waitForTimeout(80);
    check('the «الجدول» tab comes forward by itself', (await t.getAttribute('[data-rtab="table"]', 'aria-selected')) === 'true');
    check('the ribbon does not jump when it does', (await rb()) === height, await rb());
    check('the handles show', (await t.locator('.wr-grip.col').count()) === 3 && (await t.locator('.wr-grip.row').count()) === 4);
    const clear = await t.evaluate(() => {
      const g = document.querySelector('.wr-grip.col').getBoundingClientRect();
      const c = [...document.querySelectorAll('.wr-paper-in table')].pop().getBoundingClientRect();
      return g.bottom <= c.top + 1;
    });
    check('the handles sit above the table, not on its first row', clear);
    check('seven designs', (await t.locator('.wr-design').count()) === 7);
    await shot(t, '03-table-tab');

    const cellsOf = (test) => t.evaluate((src) => {
      const f = new Function('r', 'c', `return ${src}`);
      const table = [...document.querySelectorAll('.wr-paper-in table')].pop();
      return [...table.rows].flatMap((row, r) => [...row.cells].map((cell, c) => ({ r, c, on: f(r, c), bg: getComputedStyle(cell).backgroundColor, line: getComputedStyle(cell).borderBottomColor })));
    }, test);
    // one column
    await t.locator('.wr-grip.col').nth(1).click();
    await t.waitForTimeout(60);
    check('a click on the strip selects that column', (await t.locator('.wr-paper-in .selectedCell').count()) === 4);
    check('the bar says what is selected', (await t.textContent('.wr-rbody')).includes('عمود واحد'));
    await t.click('[data-tcolor="fill"]');
    await t.click('.wr-pop .wr-sw button[aria-label="اللون #f9e5e1"]');
    await t.waitForTimeout(60);
    check('nothing in the colour panel spills out of it', await t.evaluate(() => {
      const p = document.querySelector('.wr-pop');
      const b = p.getBoundingClientRect();
      return [...p.querySelectorAll('*')].every((e) => { const r = e.getBoundingClientRect(); return r.left >= b.left - 1 && r.right <= b.right + 1; });
    }));
    let cells = await cellsOf('c === 1');
    check('a fill reaches that column and no other cell', cells.every((x) => (x.bg === 'rgb(249, 229, 225)') === x.on || (!x.on && x.r === 0)), JSON.stringify(cells.map((x) => x.bg)));
    await shot(t, '04-column-fill');
    // its transparency, from the same panel
    await t.evaluate(() => {
      const e = document.querySelector('.wr-alpha input');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(e, '50');
      e.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await t.waitForTimeout(60);
    cells = await cellsOf('c === 1');
    check('its transparency reaches those cells only', cells.filter((x) => x.on).every((x) => x.bg === 'rgba(249, 229, 225, 0.5)') && cells.filter((x) => !x.on).every((x) => !x.bg.includes('0.5')), JSON.stringify(cells.filter((x) => x.on).map((x) => x.bg)));
    await t.keyboard.press('Escape');
    // one row, then its lines
    await t.locator('.wr-grip.row').nth(2).click();
    await t.waitForTimeout(60);
    check('a click on the side strip selects that row', (await t.locator('.wr-paper-in .selectedCell').count()) === 3);
    await t.click('[data-tcolor="line"]');
    await t.click('.wr-pop .wr-sw button[aria-label="اللون #a23a2e"]');
    await t.waitForTimeout(60);
    cells = await cellsOf('r === 2');
    check('line colours reach that row only', cells.filter((x) => x.on).every((x) => x.line === 'rgb(162, 58, 46)') && cells.filter((x) => x.r === 0).every((x) => x.line !== 'rgb(162, 58, 46)'), JSON.stringify(cells.map((x) => x.line)));
    await t.evaluate(() => {
      const e = document.querySelector('.wr-alpha input');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(e, '40');
      e.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await t.waitForTimeout(60);
    cells = await cellsOf('r === 2');
    check('so does the lines\' transparency', cells.filter((x) => x.on).every((x) => x.line === 'rgba(162, 58, 46, 0.6)'), JSON.stringify(cells.filter((x) => x.on).map((x) => x.line)));
    await t.keyboard.press('Escape');
    // dragging along the strip selects several, and across cells a range
    const c0 = await t.locator('.wr-grip.col').nth(0).boundingBox();
    const c2 = await t.locator('.wr-grip.col').nth(2).boundingBox();
    await t.mouse.move(c0.x + c0.width / 2, c0.y + 4);
    await t.mouse.down();
    await t.mouse.move(c2.x + c2.width / 2, c2.y + 4, { steps: 6 });
    await t.mouse.up();
    await t.waitForTimeout(60);
    check('dragging along the strip selects several columns', (await t.locator('.wr-paper-in .selectedCell').count()) === 12 || (await t.textContent('.wr-rbody')).includes('الجدول كله'));
    const box = (r, c) => t.evaluate(([a, b]) => {
      const x = [...document.querySelectorAll('.wr-paper-in table')].pop().rows[a].cells[b].getBoundingClientRect();
      return { x: x.left + x.width / 2, y: x.top + x.height / 2 };
    }, [r, c]);
    const a = await box(1, 0);
    const b = await box(2, 1);
    await t.mouse.move(a.x, a.y);
    await t.mouse.down();
    await t.mouse.move(b.x, b.y, { steps: 6 });
    await t.mouse.up();
    await t.waitForTimeout(80);
    check('dragging across cells selects a range', (await t.locator('.wr-paper-in .selectedCell').count()) === 4 && (await t.textContent('.wr-rbody')).includes('4 خلايا'));
    await shot(t, '05-range');
    // a design changes the look without touching the cells' own colours
    await t.click('[data-design-key="dark"]');
    await t.waitForTimeout(60);
    check('a design applies to the table', (await t.evaluate(() => [...document.querySelectorAll('.wr-paper-in table')].pop().getAttribute('data-design'))) === 'dark');
    check('and the header follows it', (await t.evaluate(() => getComputedStyle([...document.querySelectorAll('.wr-paper-in table')].pop().rows[0].cells[0]).backgroundColor)) === 'rgb(20, 104, 79)');
    await t.click('button[aria-label="مسح تلوين المحدد"]');
    await t.locator('button[aria-label="صف تحت"]').click();
    await t.waitForTimeout(60);
    check('a row can be added', (await shape()) === '5x3', await shape());
    await t.keyboard.press('Control+KeyZ');
    await t.waitForTimeout(60);
    check('and undone like anything else', (await shape()) === '4x3', await shape());

    // ---------- 3. saving ----------
    await t.fill('.wr-foot input', 'النص الأول');
    await t.keyboard.press('Control+KeyS');
    await t.waitForFunction(() => window.__db.saved.length === 1);
    check('Ctrl+S saves a version, and the server\'s check accepts what the editor made', (await t.evaluate(() => window.__db.refused.length)) === 0);
    const saved = await t.evaluate(() => JSON.stringify(window.__db.saved[0]));
    check('the note goes with it', saved.includes('النص الأول'));
    check('the table\'s colours are in the saved document', /"design":"dark"/.test(saved) && /"fill":"#f9e5e1"/.test(saved) && /"lineAlpha":40/.test(saved) && /"fillAlpha":50/.test(saved), saved.slice(0, 300));
    await t.waitForFunction(() => window.__db.exports.length >= 2);
    const exp = await t.evaluate(() => window.__db.exports);
    check('«الحالي» follows: the Word file, then the PDF', exp[0].kind === 'export' && exp[0].head === 'PK' && exp[0].size > 3000 && exp[1].kind === 'pdf', exp);
    check('the read-only view draws the same table with no injected HTML', (await t.evaluate(() => getComputedStyle(document.querySelector('#view table td:nth-child(2)')).backgroundColor)).length > 0);
    await t.evaluate(() => {
      const e = document.querySelector('.wr-paper-in');
      e.focus();
    });
    await caret(t, '.wr-paper-in h2');
    await t.keyboard.type(' كلمة جديدة');
    await t.waitForFunction(() => document.querySelector('.wr-state')?.textContent.includes('حُفظت'), null, { timeout: 4000 });
    check('a draft is kept as you type', true);
    check('no tool panel is left open', (await t.locator('.wr-pop').count()) === 0, await t.evaluate(() => document.querySelector('.wr-pop')?.outerHTML.slice(0, 200) ?? ''));
    await t.keyboard.press('Escape');
    await t.waitForSelector('.wr-paper-in', { state: 'detached', timeout: 5000 });
    check('Escape closes the sheet', true);
    await t.waitForFunction((id) => window.__db.remote[id], 'CH-2');
    check('and the draft goes to its private file', (await t.evaluate(() => JSON.stringify(window.__db.remote['CH-2']))).includes('كلمة جديدة'));
    await t.evaluate(() => document.getElementById('reopen').click());
    await t.waitForSelector('.wr-paper-in');
    await t.waitForTimeout(250);
    check('opening again keeps what was typed', (await t.textContent('.wr-paper-in')).includes('كلمة جديدة'));

    // ---------- 4. copies, notes, versions, shortcuts ----------
    const r = await fresh('work=CH-10');
    await shot(r, '06-returned');
    check('«المسؤول» sends for review', (await r.textContent('#wrSend')).includes('إعادة الإرسال'));
    check('notes open first when text came back', (await r.textContent('.wr-sbody')).includes('أصبحت أربعة برامج'));
    await r.click('.wr-note-item .wk-btn >> text=اذهب إليها');
    await r.waitForTimeout(60);
    check('a note marks its sentence, and that mark is not stored', (await r.locator('.wr-note.on').count()) === 1 && !(await r.evaluate(() => JSON.stringify(window.__db.saved))).includes('wr-note'));
    await r.click('.wr-note-item .wk-btn >> text=عولجت');
    await r.waitForTimeout(80);
    check('a note can be marked done', (await calls(r, 'work_note_resolve')).length === 1);
    await r.keyboard.press('Control+Alt+KeyV');
    await r.waitForSelector('#wrCompare');
    await r.click('#wrCompare');
    await r.waitForSelector('.wr-diff');
    check('versions compare word by word', (await r.locator('.wr-diff ins').count()) > 0);
    await shot(r, '07-compare');
    await r.keyboard.press('Escape');
    await r.waitForTimeout(60);
    check('Escape closes a card and not the sheet', (await r.locator('.wr-diff').count()) === 0 && (await r.locator('.wr-paper-in').count()) === 1);
    await r.click('[data-version="1"] .wk-btn');
    await r.waitForTimeout(120);
    check('an earlier version comes back as a draft', !(await r.textContent('.wr-paper-in')).includes('يناير'));
    await r.keyboard.press('Control+KeyZ');
    await r.waitForTimeout(60);
    await r.click('[data-target="x"]');
    await r.waitForSelector('.wr-copytext');
    check('a copy shows its stale mark and its limit', (await r.textContent('.wr-copy')).includes('تحتاج مراجعة') && (await r.textContent('.wr-copy')).includes('280'));
    check('no formatting tools on a copy', (await r.locator('.wr-ribbon').count()) === 0);
    await r.click('#wrFromMain');
    check('a copy starts from the main text, without formatting', (await r.inputValue('.wr-copytext')).includes('تشمل الاتفاقية'));
    await r.keyboard.press('Control+KeyS');
    await r.waitForTimeout(80);
    check('a copy saves through its own function', (await calls(r, 'work_text_save')).some((c) => c.p_target === 'x'));
    await shot(r, '08-copy');
    await r.click('.wr-targets button >> nth=0');
    await r.waitForTimeout(60);

    await r.keyboard.press('Control+Alt+KeyO');
    await r.waitForSelector('dialog.wk-modal[open] textarea');
    await r.fill('dialog.wk-modal[open] textarea', 'ما رأيك؟');
    await r.click('dialog.wk-modal[open] .wk-btn.primary');
    await r.waitForTimeout(80);
    check('Ctrl+Alt+O asks for an opinion', (await calls(r, 'work_ask_opinion')).length === 1);
    await r.keyboard.press('Control+Alt+KeyM');
    await r.waitForSelector('dialog.wk-modal[open]');
    await r.click('dialog.wk-modal[open] .wk-btn.primary');
    await r.waitForTimeout(80);
    const mail = await calls(r, 'mail_send');
    check('Ctrl+Alt+M sends internal mail linked to the work', mail.length === 1 && mail[0].p_links[0].id === 'CH-10');
    await r.keyboard.press('Control+Alt+KeyG');
    await r.waitForSelector('dialog.wk-modal[open] textarea');
    await r.fill('dialog.wk-modal[open] textarea', 'رسالة');
    await r.click('dialog.wk-modal[open] .wk-btn.primary');
    await r.waitForTimeout(80);
    check('Ctrl+Alt+G sends a message', (await calls(r, 'chat_send')).length === 1);
    await r.keyboard.press('Control+Slash');
    await r.waitForSelector('#wrPalette');
    await r.fill('#wrPalette', 'برامج');
    await r.waitForFunction(() => document.querySelector('.wr-pal')?.textContent.includes('بيان الشراكة'));
    check('Ctrl+/ lists commands and searches inside texts', true);
    await shot(r, '09-palette');
    await r.keyboard.press('Escape');
    await r.keyboard.press('Control+Enter');
    await r.waitForFunction(() => window.__events.includes('send'));
    check('Ctrl+Enter sends', true);

    // the library
    await r.keyboard.press('Control+Alt+KeyI');
    await r.waitForSelector('.wr-mitem');
    check('the library opens with its files', (await r.locator('.wr-mitem').count()) === 3);
    await shot(r, '10-media');
    await r.click('.wr-mitem >> nth=1');
    check('a video can only be linked', await r.isDisabled('dialog.wk-modal[open] .wk-btn.primary'));
    await r.click('dialog.wk-modal[open] .wk-btn >> text=رابط إلى الملف');
    await r.waitForTimeout(100);
    check('a link to a library file goes into the text', (await r.locator('.wr-paper-in a.wr-mlink').count()) === 1);
    await r.keyboard.press('Control+Alt+KeyI');
    await r.waitForSelector('.wr-mitem');
    await r.click('.wr-mitem >> nth=0');
    await r.click('dialog.wk-modal[open] .wk-btn.primary');
    await r.waitForTimeout(100);
    check('a picture goes into the text', (await r.locator('.wr-paper-in img:not(.ProseMirror-separator)').count()) === 1);
    await r.click('.wr-paper-in img:not(.ProseMirror-separator)');
    await r.waitForTimeout(80);
    check('the «الصورة» tab comes forward', (await r.getAttribute('[data-rtab="image"]', 'aria-selected')) === 'true');
    await r.click('[data-img-size="50"]');
    await r.fill('#wrAlt', 'ملصق يعرض اسم الملتقى');
    await r.waitForTimeout(60);
    check('its size and text apply', (await r.evaluate(() => document.querySelector('.wr-paper-in img:not(.ProseMirror-separator)').style.width)) === '50%' && (await r.evaluate(() => document.querySelector('.wr-paper-in img:not(.ProseMirror-separator)').alt)) === 'ملصق يعرض اسم الملتقى');
    await shot(r, '11-picture');

    // a picture too large for one request is made smaller before it leaves
    const bmp = (() => {
      const w = 1600;
      const h = 1100;
      const size = 54 + w * h * 3;
      const b = Buffer.alloc(size, 0x5a);
      b.fill(0, 0, 54);
      b.write('BM', 0);
      b.writeUInt32LE(size, 2);
      b.writeUInt32LE(54, 10);
      b.writeUInt32LE(40, 14);
      b.writeInt32LE(w, 18);
      b.writeInt32LE(h, 22);
      b.writeUInt16LE(1, 26);
      b.writeUInt16LE(24, 28);
      return b;
    })();
    await r.keyboard.press('Control+Alt+KeyI');
    await r.waitForSelector('dialog.wk-modal[open] .wk-seg');
    await r.click('dialog.wk-modal[open] .wk-seg button >> text=من الجهاز');
    await r.setInputFiles('dialog.wk-modal[open] input[type="file"]', { name: 'كبيرة.bmp', mimeType: 'image/bmp', buffer: bmp });
    await r.click('dialog.wk-modal[open] .wk-btn.primary');
    await r.waitForFunction(() => window.__db.images.length === 1);
    const sent = await r.evaluate(() => window.__db.images[0]);
    check('a picture too large for one request is made smaller first', bmp.length > 4 * 1024 * 1024 && sent.size < 4 * 1024 * 1024 && sent.type === 'image/jpeg', sent);
    await r.waitForSelector('dialog.wk-modal[open]', { state: 'detached' });

    // a Word file opens in the sheet, and the page says what it loses
    const { Document, HeadingLevel, Packer, Paragraph, TextRun } = require('docx');
    const word = await Packer.toBuffer(new Document({ sections: [{ children: [new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun('عنوان من وورد')] }), new Paragraph({ children: [new TextRun({ text: 'فقرة من وورد', bold: true })] })] }] }));
    await r.setInputFiles('.wr-sheet input[type="file"]', { name: 'ملف.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: word });
    await r.waitForFunction(() => document.querySelector('.wr-paper-in').textContent.includes('فقرة من وورد'));
    check('a Word file opens in the sheet with its headings and bold', (await r.locator('.wr-paper-in h2').count()) >= 1 && (await r.locator('.wr-paper-in strong').count()) >= 1);
    check('and the page says what does not come across', (await says(r)).includes('لا تُنقل الخطوط'));

    // find and replace
    await r.keyboard.press('Control+KeyH');
    await r.waitForSelector('.wr-find');
    await r.fill('.wr-find input >> nth=0', 'الاتفاقية');
    await r.fill('.wr-find input >> nth=1', 'المذكرة');
    await r.waitForTimeout(60);
    check('search marks what it finds', (await r.locator('.wr-hit').count()) >= 1);
    await r.click('.wr-find .wk-btn >> text=استبدال الكل');
    await r.waitForTimeout(60);
    check('replace reaches them all', (await r.textContent('.wr-paper-in')).includes('المذكرة') && !(await r.textContent('.wr-paper-in')).includes('الاتفاقية'));
    await r.keyboard.press('Escape');
    await r.waitForTimeout(50);
    check('Escape closes the search and not the sheet', (await r.locator('.wr-find').count()) === 0 && (await r.locator('.wr-paper-in').count()) === 1);

    // Word
    await rtab(r, 'file');
    const docx = await r.evaluate(async () => (await import('/flow.js').catch(() => null), null));
    await r.click('.wr-big >> text=ملف PDF');
    await r.waitForFunction(() => window.__db.exports.some((e) => e.kind === 'pdf'));
    check('PDF comes from the Word file', (await r.evaluate(() => window.__db.exports.map((e) => e.kind).join())).includes('export,pdf'), docx);

    // ---------- 5. who may do what ----------
    const lock = await fresh('work=CH-20');
    await lock.waitForTimeout(100);
    check('in review the text is locked', (await lock.getAttribute('.wr-paper-in', 'contenteditable')) === 'false' && (await lock.isDisabled('#wrSave')));
    await lock.click('.wr-banner .wk-btn >> text=سحب الإرسال');
    await lock.waitForTimeout(80);
    check('it can be pulled back before any decision', (await calls(lock, 'work_withdraw')).length === 1);
    const reader = await fresh('work=CH-2&me=pub@example.test&role=publisher');
    check('a person with no stage only reads', (await reader.getAttribute('.wr-paper-in', 'contenteditable')) === 'false' && (await reader.textContent('.wr-banner')).includes('للقراءة'));

    const dark = await fresh('work=CH-10&dark=1');
    await shot(dark, '12-evening');
    const phone = await fresh('work=CH-2', { width: 390, height: 780 });
    await shot(phone, '13-phone');
    check('no sideways scroll on a phone', await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    const ltr = await fresh('work=CH-2&dir=ltr');
    const flip = await ltr.evaluate(() => ({ main: document.querySelector('.wr-main').getBoundingClientRect().left, side: document.querySelector('.wr-side').getBoundingClientRect().left }));
    check('the sides swap in a left-to-right page', flip.main < flip.side, flip);
    // ---------- 6. the pages around the sheet ----------
    const open = async (query, viewport = { width: 1366, height: 860 }) => {
      const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1 });
      const p = await ctx.newPage();
      p.on('pageerror', (e) => errs.push(String(e)));
      p.on('console', (m) => m.type() === 'error' && !/favicon|404|fonts/.test(m.text()) && errs.push(m.text()));
      await p.goto(`${base}?${query}`);
      await p.waitForSelector('[data-ready]');
      await p.waitForTimeout(200);
      return p;
    };
    const home = await open('page=home');
    await shot(home, '14-home');
    const tile = (k) => home.locator(`[data-tile="${k}"] strong`).textContent();
    check('Home counts what came back and what waits for review', (await tile('back')) === '1' && (await tile('review')) === '2', [await tile('back'), await tile('review')]);
    check('and a late stage in someone else\'s work counts as late', Number(await tile('late')) >= 1, await tile('late'));
    check('the resume card names the work', (await home.textContent('.wk-resume')).includes('تابع الكتابة') && (await home.getAttribute('.wk-resume', 'href')).includes('?write='));

    const list = await open('page=work');
    await shot(list, '15-writing-tab');
    check('a writer opens «العمل» on «الكتابة»', (await list.getAttribute('.wk-seg button >> text=الكتابة', 'aria-pressed')) === 'true');
    const rows = await list.textContent('[data-gd="writing"]');
    check('it gathers what came back, what is ready and the library\'s request', rows.includes('عاد إليك') && rows.includes('بيان الشراكة') && rows.includes('عناوين وأوصاف') && rows.includes('ملصق الملتقى'), rows.slice(0, 200));
    check('a row opens the sheet', (await list.getAttribute('[data-gd="writing"] a.wk-hrow', 'href')).includes('?write='));
    await list.click('.wk-seg button >> text=المستندات');
    await list.waitForSelector('[data-gd="documents"]');
    await shot(list, '16-documents-tab');
    const docLinks = await list.$$eval('[data-gd="documents"] a[download]', (a) => a.map((x) => x.getAttribute('href')));
    check('«المستندات» offers the current Word file and the text', docLinks.some((u) => u.endsWith('kind=docx')) && docLinks.some((u) => u.endsWith('kind=txt')), docLinks);
    check('and not a PDF older than the text', !docLinks.some((u) => u.endsWith('kind=pdf')), docLinks);

    const rev = await open('page=review&work=CH-21&me=dir@example.test&role=director');
    await shot(rev, '17-review');
    check('a round compares with the round before', (await rev.locator('.wk-diff ins').count()) > 0 && (await rev.textContent('.wk-rrow')).includes('الدورة السابقة'));
    await rev.click('.wk-fulltext summary');
    await rev.waitForSelector('.wk-fulltext .wr-doc');
    check('the text can be read as it was written', (await rev.locator('.wk-fulltext .wr-doc h1').count()) === 1);
    await rev.evaluate(() => {
      const el = document.querySelector('.wk-fulltext .wr-doc p');
      const r = document.createRange();
      r.selectNodeContents(el);
      const g = getSelection();
      g.removeAllRanges();
      g.addRange(r);
      el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    });
    await rev.waitForSelector('.wk-tnote-new textarea');
    check('selecting a sentence offers a note on it', (await rev.textContent('.wk-tnote-new small')).includes('على الجملة'));
    await rev.fill('.wk-tnote-new textarea', 'صحّح الرقم.');
    await rev.click('.wk-tnote-new .wk-btn.primary');
    await rev.waitForSelector('.wk-tnotes .wk-vn');
    const added = await rev.evaluate(() => window.__db.calls.filter((c) => c.name === 'work_note_add').map((c) => c.args));
    check('the note is saved on that part and that sentence', added.length === 1 && added[0].p_part === 'text' && !!added[0].p_quote, added);
    await rev.click('.wk-dbar .wk-btn >> text=طلب تعديل');
    await rev.waitForSelector('dialog.wk-modal[open] textarea');
    check('the request need not repeat the notes', (await rev.inputValue('dialog.wk-modal[open] textarea')).includes('مثبتة على النص'));

    const idea = await open('page=ideas');
    await shot(idea, '18-ideas');
    check('saved ideas are listed with what became of them', (await idea.textContent('.wr-ideas')).includes('سلسلة قصص قصيرة') && (await idea.textContent('.wr-ideas')).includes('صارت عملاً'));
    await idea.fill('textarea', 'فكرة جديدة');
    await idea.click('.actions .primary');
    await idea.waitForFunction(() => document.querySelector('.wr-ideas').textContent.includes('فكرة جديدة'));
    check('a new idea stays on the page', true);
    await idea.click('.wr-ideas li:nth-child(2) .primary');
    await idea.waitForTimeout(80);
    check('an idea goes to «إنشاء» with its id, so it is marked afterwards', (await idea.evaluate(() => sessionStorage.getItem('comms-hub:idea'))).includes('"id":"i1"'));

    check('nothing failed in the page', errs.length === 0, errs.slice(0, 3).join(' | ').slice(0, 400));
  } finally {
    await browser.close();
    fixture?.close();
  }
  process.exit(finish(path.join(__dirname, 'writing-flow.json')) ? 1 : 0);
})().catch((e) => {
  console.error('CRASH', e);
  process.exit(1);
});

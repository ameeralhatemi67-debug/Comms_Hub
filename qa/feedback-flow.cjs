// Browser check of a tester's note and its marks (MVP_draft.md section 69), in Edge: the real note window, marking layer,
// inbox and «ملاحظاتي» on a fixture (qa/fixtures/feedback-flow.tsx), with the database stood in, because the page needs a
// signed-in person and no bypass is allowed. It replaces the static qa/feedback-fixture.cjs, which drew a copy of the markup.
//   1. The note: what it opens on, what it says is sent.
//   2. Marking: a click, a drag, the limit, undo, that the page behind is never pressed, what is named.
//   3. What is sent: nothing typed on the page, an outline with no words.
//   4. A note left unsent waits; «إلغاء» forgets it.
//   5. From inside a window: the button there, the key, the window kept open, its title sent.
//   6. Private spots: a private part of a window and the mail pages keep only the word for what a mark sits on.
//   7. The inbox: order, outline, details, filters, merge, separate, the brief.
//   8. «ملاحظاتي», phone width with a real tap, and the evening theme.
// What this cannot check: the database's rules (supabase/tests/feedback_marks_rules.sql) and the signed-in site.
// Usage: node qa/feedback-flow.cjs   (writes qa/feedback-flow.json, screenshots in qa/artifacts/feedback-flow/)
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const esbuild = require('esbuild');
const { dependency, launchOptions } = require('./runtime.cjs');
const { chromium } = dependency('playwright');
const h = require('./android-helpers.cjs');

const { check, finish } = h.record('qa/feedback-flow.cjs');
const out = path.join(__dirname, 'artifacts', 'feedback-flow');
const fixtures = path.join(__dirname, 'fixtures');
const css = ['globals', 'identity', 'media', 'kit', 'work', 'permissions']
  .map((f) => fs.readFileSync(path.join(h.root, 'src', 'app', `${f}.css`), 'utf8'))
  .join('\n')
  .replace(/@import[^;]+;/g, '')
  .replace(/@theme\{[^}]*\}/g, '');
const html = (dark) =>
  `<!doctype html><html lang="ar" dir="rtl" data-identity="emerald" data-theme="${dark ? 'dark' : 'light'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="hub-build" content="abc1234"><title>flow</title>` +
  `<style>${css}</style><style>body{font-family:"Segoe UI",Tahoma,sans-serif}</style></head><body><div id="root"></div><script type="module" src="/flow.js"></script></body></html>`;

const SECRET = 'نص سري كتبه الشخص';
const noWords = (v) => !/[A-Za-z؀-ۿ]/.test(JSON.stringify(v).replace(/"[whr]"/g, ''));
const calls = (p, fn) => p.evaluate((name) => window.__calls.filter((c) => c.fn === name), fn);
const centre = (p, sel) => p.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, l: r.left, t: r.top, r: r.right, b: r.bottom }; }, sel);
const overflow = (p) => p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
const openDialogs = (p) => p.evaluate(() => [...document.querySelectorAll('dialog[open]')].map((d) => d.getAttribute('aria-label')));

async function drag(p, a, b) {
  await p.mouse.move(a.x, a.y);
  await p.mouse.down();
  await p.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 3 });
  await p.mouse.move(b.x, b.y, { steps: 3 });
  await p.mouse.up();
}

(async () => {
  let fixture;
  const errs = [];
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch(launchOptions);
  try {
    const fake = path.join(fixtures, 'fake-feedback.ts');
    await esbuild.build({
      entryPoints: [path.join(fixtures, 'feedback-flow.tsx')],
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
            b.onResolve({ filter: /^@\/lib\/(supabase\/client|account-context|store)$/ }, () => ({ path: fake }));
            b.onResolve({ filter: /^\.\/caps$/ }, () => ({ path: fake }));
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
      return res.end(html(url.searchParams.has('dark')));
    });
    await new Promise((r) => fixture.listen(0, '127.0.0.1', r));
    const base = `http://127.0.0.1:${fixture.address().port}/`;
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errs.push(String(e)));
    p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));

    // 1. The note
    await p.goto(`${base}work/CH-1`);
    await p.waitForSelector('.fb-open');
    await p.click('.fb-open');
    await p.waitForSelector('.fb-form');
    check('the note opens on «مشكلة», graded «مزعجة»', await p.evaluate(() => {
      const on = [...document.querySelectorAll('.fb-kinds label.on')].map((l) => l.textContent);
      return on.join('|') === 'مشكلة|مزعجة';
    }));
    const said = await p.textContent('.fb-form > p');
    check('it says what is sent, and that no picture is', /دورك/.test(said) && /لا تُرسل صورة للشاشة/.test(said) && !/ولا يُرسل غير ذلك/.test(said), said);
    await p.click('.fb-kinds label:has-text("فكرة")');
    check('an idea has no severity to choose', (await p.locator('.fb-severity').count()) === 0);
    await p.click('.fb-kinds label:has-text("مشكلة")');
    await p.screenshot({ path: path.join(out, 'note.png') });

    // 2. Marking
    await p.click('button.fb-point');
    await p.waitForSelector('dialog.fb-layer[open]');
    check('the layer replaces the note and covers the screen', await p.evaluate(() => {
      const r = document.querySelector('dialog.fb-layer').getBoundingClientRect();
      return r.left === 0 && r.top === 0 && r.width === innerWidth && r.height === innerHeight && document.querySelectorAll('dialog[open]').length === 1;
    }));
    const a = await centre(p, '.target-a');
    await p.mouse.click(a.x, a.y);
    check('a click sets a pointer', (await p.locator('.fb-mark.point').count()) === 1);
    check('the page behind is not pressed', !(await openDialogs(p)).includes('نافذة الاختبار'), JSON.stringify(await openDialogs(p)));
    const b = await centre(p, '.target-b');
    await drag(p, { x: b.l - 4, y: b.t - 4 }, { x: b.r + 4, y: b.b + 4 });
    check('a drag draws a box', (await p.locator('.fb-mark.box').count()) === 1);
    const c = await centre(p, '.target-c');
    await p.mouse.click(c.x, c.y);
    check('three marks are numbered in order', (await p.locator('.fb-mark b').allTextContents()).join() === '1,2,3');
    await p.mouse.click(c.x + 60, c.y);
    check('a fourth is refused and the bar says so', (await p.locator('.fb-mark').count()) === 3 && /بلغت 3/.test(await p.textContent('.fb-bar span')));
    await p.click('.fb-bar button:has-text("تراجع")');
    check('undo takes the last one away', (await p.locator('.fb-mark').count()) === 2);
    await p.mouse.click(c.x, c.y);
    await p.click('.fb-bar-move');
    const bar = await centre(p, '.fb-bar');
    check('the bar can move out of the way', bar.t < 40, bar);
    await p.screenshot({ path: path.join(out, 'layer.png') });
    await p.click('.fb-bar-done');
    await p.waitForSelector('.fb-marked .fb-outline');
    const lines = await p.locator('.fb-form .fb-marklist li').allTextContents();
    check('a control is named by its words', /زر «افتح نافذة»/.test(lines[0]), lines[0]);
    check('or by its label', /زر «زر له اسم»/.test(lines[1]), lines[1]);
    check('a field by its label, never its value', /حقل «اسم الحقل»/.test(lines[2]) && !lines[2].includes('سري'), lines[2]);
    check('the outline is drawn with the marks on it', (await p.locator('.fb-form .fb-outline .fb-o').count()) > 5 && (await p.locator('.fb-form .fb-o-mark').count()) === 3);
    await p.screenshot({ path: path.join(out, 'note-marked.png') });

    // 3. What is sent
    await p.fill('.fb-text', 'الزر لا يستجيب');
    await p.click('.fb-severity label:has-text("توقف عملي")');
    await p.evaluate(() => window.__report(new Error('boom in the page')));
    await p.click('.fb-send');
    await p.waitForSelector('.fb-done');
    const [sent] = (await calls(p, 'feedback_submit')).slice(-1);
    const all = JSON.stringify(sent.args);
    check('the note carries its severity and three marks', sent.args.p_severity === 'blocking' && sent.args.p_marks.length === 3 && sent.args.p_marks[1].t === 'b' && sent.args.p_marks[0].t === 'p');
    check('nothing typed on the page leaves it', !all.includes(SECRET) && !all.includes('سري'));
    check('the outline holds no words', noWords(sent.args.p_outline) && sent.args.p_outline.r.length > 5, JSON.stringify(sent.args.p_outline).slice(0, 200));
    check('the context has the version, the screen, the device and the visit\'s error', sent.args.p_context.build === 'abc1234' && sent.args.p_context.w === 1280 && sent.args.p_context.app === 'web' && sent.args.p_context.errors.join() === 'boom in the page' && sent.args.p_context.theme === 'light', sent.args.p_context);
    check('a person viewing as themself sends no «عرض بصفة»', sent.args.p_context.viewAs === undefined);
    check('the page has no query or address beyond its path', sent.args.p_page === '/work/CH-1', sent.args.p_page);
    check('a note with an outline is small', Buffer.byteLength(JSON.stringify([sent.args.p_marks, sent.args.p_outline, sent.args.p_context])) < 4000, Buffer.byteLength(all));
    check('it points to «ملاحظاتي»', /ملاحظاتي/.test(await p.textContent('.fb-done')));
    await p.click('.fb-done button');

    // 4. A note left unsent
    await p.click('.fb-open');
    check('a sent note leaves nothing behind', (await p.inputValue('.fb-text')) === '' && (await p.locator('.fb-form .fb-marked').count()) === 0);
    await p.fill('.fb-text', 'نص لم يُرسل');
    await p.click('button.fb-point');
    await p.mouse.click(a.x, a.y);
    await p.click('.fb-bar-done');
    await p.keyboard.press('Escape');
    await p.waitForFunction(() => !document.querySelector('.fb-form'));
    await p.click('.fb-open');
    check('closed by accident, the note waits with its marks', (await p.inputValue('.fb-text')) === 'نص لم يُرسل' && (await p.locator('.fb-form .fb-marked').count()) === 1);
    await p.click('.fb-form .actions >> nth=-1 >> button:has-text("إلغاء")');
    await p.click('.fb-open');
    check('«إلغاء» forgets it', (await p.inputValue('.fb-text')) === '' && (await p.locator('.fb-form .fb-marked').count()) === 0);
    await p.click('button.fb-point');
    await p.keyboard.press('Escape');
    await p.waitForSelector('.fb-form');
    check('Escape leaves the layer and returns to the note', (await p.locator('dialog.fb-layer').count()) === 0);
    await p.keyboard.press('Escape');
    await p.waitForFunction(() => !document.querySelector('.fb-form'));

    // 5. From inside a window
    await p.click('.target-a');
    await p.waitForSelector('.fb-float');
    check('every open window has the button', await p.evaluate(() => Boolean(document.querySelector('dialog[open] .fb-float'))));
    await p.click('.fb-float');
    await p.waitForSelector('.fb-form');
    check('the note opens above the window, which stays open', (await openDialogs(p)).join('|') === 'نافذة الاختبار|أرسل ملاحظة', JSON.stringify(await openDialogs(p)));
    await p.click('button.fb-point');
    await p.waitForSelector('dialog.fb-layer[open]');
    const inside = await centre(p, '.inside');
    await p.mouse.click(inside.x, inside.y);
    check('the layer works above an open window', (await p.locator('.fb-mark.point').count()) === 1 && (await openDialogs(p)).join('|') === 'نافذة الاختبار|حدد المكان على الصفحة', JSON.stringify(await openDialogs(p)));
    await p.click('.fb-bar-done');
    await p.waitForSelector('.fb-marked');
    check('and names it, though the window is inert behind the layer', /زر «زر داخل النافذة»/.test(await p.textContent('.fb-form .fb-marklist')), await p.textContent('.fb-form .fb-marklist'));
    await p.fill('.fb-text', 'داخل النافذة');
    await p.click('.fb-send');
    await p.waitForSelector('.fb-done');
    const [fromWindow] = (await calls(p, 'feedback_submit')).slice(-1);
    check('the window\'s title goes with the note', fromWindow.args.p_context.dialog === 'نافذة الاختبار', fromWindow.args.p_context.dialog);
    await p.click('.fb-done button');
    check('and the window is still open afterwards', (await openDialogs(p)).join() === 'نافذة الاختبار', JSON.stringify(await openDialogs(p)));
    await p.keyboard.press('Alt+Shift+KeyN');
    await p.waitForSelector('.fb-form');
    check('the key opens the note from inside a window too', (await openDialogs(p)).includes('أرسل ملاحظة'));
    await p.click('.fb-form .actions button:has-text("إلغاء")');
    await p.keyboard.press('Escape');
    await p.waitForFunction(() => !document.querySelector('dialog[open]'));
    check('with no window open there is no floating button', (await p.locator('.fb-float').count()) === 0);

    // 6. Private spots
    await p.click('.target-b');
    await p.waitForSelector('.secret');
    await p.click('.fb-float');
    await p.click('button.fb-point');
    await p.waitForSelector('dialog.fb-layer[open]');
    const secret = await centre(p, '.secret');
    await p.mouse.click(secret.x, secret.y);
    await p.click('.fb-bar-done');
    await p.fill('.fb-text', 'في ورقة خاصة');
    await p.click('.fb-send');
    await p.waitForSelector('.fb-done');
    const [priv] = (await calls(p, 'feedback_submit')).slice(-1);
    check('a private part keeps only the word for what a mark sits on', priv.args.p_marks[0].el === 'زر', priv.args.p_marks[0].el);
    check('and its window\'s title stays behind', !priv.args.p_context.dialog && !JSON.stringify(priv.args).includes('مسودة'), JSON.stringify(priv.args.p_context));

    await p.goto(`${base}mail/chat?viewAs=designer`);
    await p.waitForSelector('.fb-open');
    await p.click('.fb-open');
    check('on a mail page the note shows its path', /\/mail\/chat/.test(await p.textContent('.fb-form > p')));
    await p.click('button.fb-point');
    await p.waitForSelector('dialog.fb-layer[open]');
    const onMail = await centre(p, '.target-a');
    await p.mouse.click(onMail.x, onMail.y);
    await p.click('.fb-bar-done');
    await p.fill('.fb-text', 'في البريد');
    await p.click('.fb-send');
    await p.waitForSelector('.fb-done');
    const [mail] = (await calls(p, 'feedback_submit')).slice(-1);
    check('on the mail pages a mark keeps only its word', mail.args.p_marks[0].el === 'زر', mail.args.p_marks[0].el);
    check('an administrator viewing as a role says so', mail.args.p_context.viewAs === 'designer', mail.args.p_context.viewAs);

    // 7. The inbox
    const stamp = (m) => `2026-11-02T${String(m).padStart(2, '0')}:00:00Z`;
    const row = (over) => ({ kind: 'problem', author: 'a@t.test', author_name: 'سارة', page: '/work', body: 'نص', place: null, count: 1, state: 'new', created_at: stamp(9), last_at: stamp(9), handled_by: null, handled_at: null, severity: null, marks: null, outline: null, context: null, duplicate_of: null, ...over });
    const seed = [
      row({ id: 'idea', kind: 'idea', body: 'فكرة للترتيب', page: '/calendar', last_at: stamp(14) }),
      row({ id: 'late', severity: 'cosmetic', body: 'لون غريب', last_at: stamp(13) }),
      row({ id: 'stop', severity: 'blocking', body: 'زر الجدولة لا يستجيب', count: 2, marks: sent.args.p_marks, outline: sent.args.p_outline, context: { ...sent.args.p_context, role: 'writer', viewAs: 'designer' } }),
      row({ id: 'kid', severity: 'annoying', body: 'نفس المشكلة من زميل', author_name: 'خالد', duplicate_of: 'stop' }),
      row({ id: 'err', kind: 'error', body: 'Cannot read properties', place: 'Item (item.tsx)', count: 7, last_at: stamp(15) }),
      row({ id: 'old', severity: 'annoying', body: 'عولجت من قبل', state: 'done', page: '/calendar' }),
    ];
    await ctx.addInitScript((rows) => {
      window.__rows = rows;
      window.__mine = rows.slice(0, 3).map((r) => ({ id: r.id, kind: r.kind, severity: r.severity, page: r.page, body: r.body, state: r.state, created_at: r.created_at, handled_at: null }));
    }, seed);
    await p.goto(`${base}?view=inbox`);
    await p.waitForSelector('.fb-item');
    const order = await p.locator('.fb-item > .fb-body').allTextContents();
    check('new first, then what stops work, merged notes under theirs', order[0] === 'زر الجدولة لا يستجيب' && order[order.length - 1] === 'عولجت من قبل' && !order.includes('نفس المشكلة من زميل'), order.join(' | '));
    const stop = p.locator('.fb-item').first();
    check('the note shows its severity and its count', /مشكلة · توقف عملي · تكرر 2 مرة/.test(await stop.locator('b').first().textContent()));
    check('the outline carries its marks', (await stop.locator('.fb-o-mark').count()) === 3 && (await stop.locator('.fb-o').count()) > 5);
    await stop.locator('summary:has-text("التفاصيل")').click();
    const details = await stop.locator('.fb-details').textContent();
    check('the details read in Arabic with no role key', /كاتب المحتوى/.test(details) && /عرض بصفة/.test(details) && /المصمم/.test(details) && /abc1234/.test(details) && /boom in the page/.test(details) && !/writer|designer/.test(details), details);
    await stop.locator('summary:has-text("ملاحظات مدموجة")').click();
    check('a merged note keeps its text and author', /نفس المشكلة من زميل/.test(await stop.locator('.fb-merged').textContent()) && /خالد/.test(await stop.locator('.fb-merged').textContent()));
    await p.screenshot({ path: path.join(out, 'inbox.png'), fullPage: true });
    await p.selectOption('.fb-filters label:nth-child(3) select', 'blocking');
    check('the severity filter', (await p.locator('.fb-item').count()) === 1);
    await p.selectOption('.fb-filters label:nth-child(3) select', '');
    await p.selectOption('.fb-filters label:nth-child(4) select', '/calendar');
    check('the page filter', (await p.locator('.fb-item').count()) === 2);
    await p.selectOption('.fb-filters label:nth-child(4) select', '');
    await stop.locator('.fb-copy').click();
    await p.waitForFunction(() => document.querySelector('.fb-copy')?.textContent === 'نُسخت');
    const brief = await p.evaluate(() => navigator.clipboard.readText());
    check('the brief reaches the clipboard with the page\'s files', /توقف عملي/.test(brief) && /src\/components\/work\/list\.tsx/.test(brief) && /كاتب المحتوى/.test(brief) && /زر «افتح نافذة»/.test(brief) && !/writer/.test(brief), brief.slice(0, 300));
    await stop.locator('.actions button:has-text("عولج")').click();
    await p.waitForFunction(() => window.__calls.some((c) => c.fn === 'feedback_mark'));
    check('«عولج» marks the note', JSON.stringify((await calls(p, 'feedback_mark'))[0].args) === JSON.stringify({ p_id: 'stop', p_state: 'done' }));
    const late = p.locator('.fb-item').filter({ has: p.locator('> .fb-body', { hasText: 'لون غريب' }) });
    await late.locator('.fb-merge select').selectOption('stop');
    await p.waitForFunction(() => window.__calls.some((c) => c.fn === 'feedback_merge'));
    check('merging sends both notes', JSON.stringify((await calls(p, 'feedback_merge'))[0].args) === JSON.stringify({ p_id: 'late', p_into: 'stop' }));
    await stop.locator('summary:has-text("ملاحظات مدموجة")').click();
    await p.locator('.fb-merged button:has-text("افصلها")').click();
    await p.waitForFunction(() => window.__calls.filter((c) => c.fn === 'feedback_merge').length === 2);
    check('separating sends no target', JSON.stringify((await calls(p, 'feedback_merge'))[1].args) === JSON.stringify({ p_id: 'kid', p_into: null }));
    check('an error offers no merge', (await p.locator('.fb-item.error .fb-merge').count()) === 0);
    check('no sideways overflow in the inbox', !(await overflow(p)));

    // 8. «ملاحظاتي», the phone, the evening theme
    await p.goto(`${base}?view=mine`);
    await p.waitForSelector('.fb-mine');
    check('«ملاحظاتي» lists a person\'s notes with their state', (await p.locator('.fb-mine .fb-item').count()) === 3 && /جديد/.test(await p.textContent('.fb-mine')));

    await p.goto(`${base}work/CH-1`);
    await p.waitForSelector('.fb-open');
    await p.evaluate(() => { window.__refuse = 'FEEDBACK_LIMIT'; });
    await p.click('.fb-open');
    await p.fill('.fb-text', 'نص');
    await p.click('.fb-send');
    await p.waitForSelector('.ml-err');
    const refused = await p.textContent('.ml-err');
    check('the daily limit reads in Arabic and the note is kept', /50/.test(refused) && !/FEEDBACK_LIMIT/.test(refused) && (await p.inputValue('.fb-text')) === 'نص', refused);

    const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    await phone.addInitScript((rows) => {
      window.__rows = rows;
    }, seed);
    const q = await phone.newPage();
    q.on('pageerror', (e) => errs.push(String(e)));
    await q.goto(`${base}work/CH-1`);
    await q.waitForSelector('.fb-open');
    await q.tap('.fb-open');
    await q.waitForSelector('.fb-form');
    const fits = await q.evaluate(() => { const d = document.querySelector('dialog[open]').getBoundingClientRect(); return d.left >= -1 && d.right <= innerWidth + 1; });
    check('390: the note fits the screen', fits && !(await overflow(q)));
    await q.tap('button.fb-point');
    await q.waitForSelector('dialog.fb-layer[open]');
    const t = await centre(q, '.target-a');
    await q.touchscreen.tap(t.x, t.y);
    check('390: a tap sets a pointer and names what is under it', (await q.locator('.fb-mark.point').count()) === 1);
    const phoneBar = await centre(q, '.fb-bar');
    check('390: the bar fits the screen', phoneBar.l >= 0 && phoneBar.r <= 390, phoneBar);
    await q.screenshot({ path: path.join(out, 'layer-390.png') });
    await q.tap('.fb-bar-done');
    await q.waitForSelector('.fb-marked');
    check('390: the name is right', /زر «افتح نافذة»/.test(await q.textContent('.fb-form .fb-marklist')));
    check('390: no sideways overflow with the outline', !(await overflow(q)));
    await q.screenshot({ path: path.join(out, 'note-390.png') });
    await q.goto(`${base}?view=inbox`);
    await q.waitForSelector('.fb-item');
    check('390: the inbox has no sideways overflow', !(await overflow(q)) && (await q.evaluate(() => [...document.querySelectorAll('.fb-item')].every((i) => i.getBoundingClientRect().right <= innerWidth + 1))));
    await q.screenshot({ path: path.join(out, 'inbox-390.png'), fullPage: true });
    await phone.close();

    await p.goto(`${base}?view=inbox&dark`);
    await p.waitForSelector('.fb-outline');
    await p.screenshot({ path: path.join(out, 'inbox-dark.png'), fullPage: true });
    const contrast = await p.evaluate(() => {
      const box = getComputedStyle(document.querySelector('.fb-o-mark rect')).stroke;
      const frame = getComputedStyle(document.querySelector('.fb-o-frame')).fill;
      return { box, frame };
    });
    check('dark: the mark stands apart from the screen behind it', contrast.box !== contrast.frame, contrast);
    check('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  } catch (e) {
    check('the flow ran to the end', false, String(e.message ?? e).slice(0, 600));
  } finally {
    await browser.close();
    fixture?.close();
    process.exitCode = finish(path.join(__dirname, 'feedback-flow.json')) ? 1 : 0;
  }
})();

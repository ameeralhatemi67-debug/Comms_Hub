// Browser check of the experimental mail and messaging window (MVP_draft.md section 74), in Edge: the real window, the
// messaging tab's conversation, the mail reader and the account switch, on a fixture (qa/fixtures/chat-window-flow.tsx)
// with the database stood in (qa/fixtures/fake-chat-window.ts), because the site needs a signed-in person and no bypass
// is allowed.
//   1. Off by default; on from «الحساب»; the launcher moves only up and down the left edge.
//   2. Sizes: side, middle, full up to the sidebar and following it; the buttons of each size; the edge.
//   3. The message box: @ picks the destination, @ later mentions, / and + are the quick actions.
//   4. «العام» and a work's conversation start with their first message, «العام» asks once.
//   5. Mail: the reader, a reply from the box, a new mail by @, the ten seconds to take it back.
//   6. The mail page: the window steps aside; Escape and Alt+M; phone width; evening theme; no page errors.
// What this cannot check: the database's rules (supabase/tests/chat_window_rules.sql, qa/chat-window-rules.json) and the
// signed-in site.
// Usage: node qa/chat-window-flow.cjs   (writes qa/chat-window-flow.json, screenshots in qa/artifacts/chat-window-flow/)
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const esbuild = require('esbuild');
const { dependency, launchOptions } = require('./runtime.cjs');
const { chromium } = dependency('playwright');
const h = require('./android-helpers.cjs');

const { check, finish } = h.record('qa/chat-window-flow.cjs');
const out = path.join(__dirname, 'artifacts', 'chat-window-flow');
const fixtures = path.join(__dirname, 'fixtures');
const css = ['globals', 'identity', 'media', 'mail', 'chat', 'kit', 'work', 'permissions', 'chat-window']
  .map((f) => fs.readFileSync(path.join(h.root, 'src', 'app', `${f}.css`), 'utf8'))
  .join('\n')
  .replace(/@import[^;]+;/g, '')
  .replace(/@theme\{[^}]*\}/g, '');
const html = (dark) =>
  `<!doctype html><html lang="ar" dir="rtl" data-identity="emerald" data-theme="${dark ? 'dark' : 'light'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>flow</title>` +
  `<style>${css}</style><style>body{font-family:"Segoe UI",Tahoma,sans-serif}*,*::before,*::after{animation:none!important;transition:none!important}</style></head><body><div id="root"></div><script type="module" src="/flow.js"></script></body></html>`;

const calls = (p, fn) => p.evaluate((name) => window.__calls.filter((c) => c.fn === name), fn);
const box = (p, sel) => p.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom), w: Math.round(r.width), h: Math.round(r.height) }; }, sel);
const labels = (p) => p.$$eval('.cw-ctl button', (bs) => bs.map((b) => b.getAttribute('aria-label')));
const overflow = (p) => p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
const text = (p, sel) => p.evaluate((s) => document.querySelector(s)?.textContent ?? '', sel);
const until = (fn, ms = 6000) => h.until(fn, ms);

(async () => {
  let fixture;
  const errs = [];
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch(launchOptions);
  try {
    const fake = path.join(fixtures, 'fake-chat-window.ts');
    await esbuild.build({
      entryPoints: [path.join(fixtures, 'chat-window-flow.tsx')],
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
            b.onResolve({ filter: /^@\/lib\/(supabase\/client|account-context|store|push\/kick|mail\/upload)$/ }, () => ({ path: fake }));
            b.onResolve({ filter: /^\.\.?\/caps$/ }, () => ({ path: fake }));
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
      if (url.pathname.startsWith('/api/')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ configured: true, skipped: true }));
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(html(url.searchParams.has('dark')));
    });
    await new Promise((r) => fixture.listen(0, '127.0.0.1', r));
    const base = `http://127.0.0.1:${fixture.address().port}`;
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errs.push(String(e)));
    p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));

    // 1. Off by default, then on from «الحساب».
    await p.goto(`${base}/account?off&fresh`);
    await p.waitForSelector('.cw-switch:not([disabled])');
    check('off by default: no launcher, the switch reads off', !(await p.$('.cw-launch')) && (await p.getAttribute('.cw-switch', 'aria-checked')) === 'false');
    check('the account panel says it is an experiment', /تجريبي/.test(await text(p, '.cw-setting')));
    await p.click('.cw-switch');
    await p.waitForSelector('.cw-launch');
    const sw = await calls(p, 'profile_update');
    check('turning it on saves it on the account', sw.length === 1 && sw[0].args.p.chat_window === true, sw);

    const home = await box(p, '.cw-launch');
    check('the launcher sits at the bottom of the left edge', home.l === 16 && Math.abs(900 - home.b - 16) <= 1, home);
    await p.mouse.move(home.l + 28, home.t + 28);
    await p.mouse.down();
    await p.mouse.move(home.l + 300, home.t - 120, { steps: 6 });
    await p.mouse.move(home.l + 500, home.t - 300, { steps: 6 });
    await p.mouse.up();
    const moved = await box(p, '.cw-launch');
    check('a drag moves it up the edge and never sideways', moved.l === 16 && moved.t < home.t - 250, { home, moved });
    const toast = await box(p, '.toast');
    check('the page toast stays clear of the launcher', toast.l >= moved.r, { toast, moved });
    await p.mouse.move(moved.l + 28, moved.t + 28);
    await p.mouse.down();
    await p.mouse.move(moved.l + 28, home.t + 10, { steps: 8 });
    await p.mouse.up();
    await p.mouse.move(700, 300);
    await until(async () => (await box(p, '.cw-launch')).t === home.t, 2000);
    const back = await box(p, '.cw-launch');
    check('dropped near its place, it goes home', back.t === home.t && back.l === 16, { back, home });

    // 2. Sizes
    await p.click('.cw-launch');
    await p.waitForSelector('.cw-win');
    let win = await box(p, '.cw-win');
    check('it opens beside the page, at the side size, under the top bar', win.l === 0 && win.w === 380 && win.t === 72, win);
    check('the launcher steps aside while the window is open', !(await p.$('.cw-launch')));
    check('side size: minimise, middle, full, mail page', JSON.stringify(await labels(p)) === JSON.stringify(['تصغير إلى الزر', 'نافذة وسطى', 'نافذة كاملة', 'فتح صفحة البريد']), await labels(p));
    check('one column at the side size', (await p.getAttribute('.cw-win', 'data-tier')) === 'side' && !!(await p.$('.cw-win .cw-list')));
    await p.screenshot({ path: path.join(out, 'side.png') });

    await p.click('[aria-label="نافذة وسطى"]');
    await until(async () => (await box(p, '.cw-win')).w === 720);
    check('middle: 720 and two columns', (await box(p, '.cw-win')).w === 720 && (await p.getAttribute('.cw-win', 'data-tier')) === 'middle' && !!(await p.$('.cw-grid.c-middle')));
    check('middle size: minimise, side, full, mail page', JSON.stringify(await labels(p)) === JSON.stringify(['تصغير إلى الزر', 'نافذة جانبية', 'نافذة كاملة', 'فتح صفحة البريد']), await labels(p));
    await p.screenshot({ path: path.join(out, 'middle.png') });

    await p.click('[aria-label="نافذة كاملة"]');
    await until(async () => (await box(p, '.cw-win')).w === 1216);
    win = await box(p, '.cw-win');
    const side = await box(p, '.sidebar');
    check('full: up to the sidebar, never over it', win.r === side.l && win.w === 1440 - side.w, { win, side });
    check('full size: minimise, side, mail page', JSON.stringify(await labels(p)) === JSON.stringify(['تصغير إلى الزر', 'نافذة جانبية', 'فتح صفحة البريد']), await labels(p));
    await p.evaluate(() => window.__collapse(true));
    await until(async () => (await box(p, '.cw-win')).w === 1440 - (await box(p, '.sidebar')).w);
    const narrowSide = await box(p, '.sidebar');
    check('the full size follows the sidebar as it closes', (await box(p, '.cw-win')).w === 1440 - narrowSide.w && narrowSide.w < 120, narrowSide);
    await p.evaluate(() => window.__collapse(false));
    await until(async () => (await box(p, '.cw-win')).w === 1216);
    await p.screenshot({ path: path.join(out, 'full.png') });

    const grip = await box(p, '.cw-grip');
    await p.mouse.move(grip.l + 7, 400);
    await p.mouse.down();
    await p.mouse.move(800, 400, { steps: 5 });
    check('while dragging, the edge says the size and width', /بكسل/.test(await text(p, '.cw-read')));
    await p.mouse.move(540, 400, { steps: 8 });
    await p.mouse.up();
    win = await box(p, '.cw-win');
    check('a drag of the edge sets any width, one column under 600', Math.abs(win.w - 540) <= 2 && (await p.getAttribute('.cw-win', 'data-tier')) === 'side', win);
    await p.mouse.move(win.r, 400);
    await p.mouse.down();
    await p.mouse.move(732, 400, { steps: 8 });
    await p.mouse.up();
    check('near a stop, the edge lands on it', (await box(p, '.cw-win')).w === 720);
    await p.focus('.cw-grip');
    await p.keyboard.press('Home');
    check('Home on the edge returns to the side size', (await box(p, '.cw-win')).w === 380);

    // 3. The message box at the side size: «العام» with nothing open.
    check('with nothing open, the box sends to «العام»', /العام/.test(await text(p, '.cw-to b')));
    await p.click('.cw-ta');
    await p.keyboard.type('@سا');
    await p.waitForSelector('.cw-pop .cw-opt');
    const groupsSeen = await p.$$eval('.cw-pop h4', (hs) => hs.map((x) => x.textContent));
    check('@ first opens «إلى من تُرسل؟» with people and mail', groupsSeen.includes('الأشخاص') && groupsSeen.includes('بريد'), groupsSeen);
    await p.keyboard.press('Enter');
    check('Enter picks: the label names the person', /سارة/.test(await text(p, '.cw-to b')) && (await p.inputValue('.cw-ta')) === '');
    await p.keyboard.type('النسخة 3 وصلت، أراجعها الآن.');
    await p.keyboard.press('Enter');
    await until(async () => (await calls(p, 'chat_send')).length === 1);
    let sends = await calls(p, 'chat_send');
    check('the message goes to the person', sends[0]?.args.p_room === 'r-sara' && /النسخة 3/.test(sends[0]?.args.p_body), sends);
    check('afterwards the box returns to «العام» and says where it went', /العام/.test(await text(p, '.cw-to b')) && /سارة/.test(await text(p, '.cw-note')));

    await p.click('.cw-ta');
    await p.keyboard.type('تذكير: اجتماع التنسيق بعد نصف ساعة.');
    await p.keyboard.press('Enter');
    await p.waitForSelector('.cw-confirm');
    check('the first message to «العام» asks once', /العام/.test(await text(p, '.cw-confirm')) && (await calls(p, 'chat_global_room')).length === 0);
    await p.click('.cw-confirm .primary');
    await until(async () => (await calls(p, 'chat_send')).length === 2);
    sends = await calls(p, 'chat_send');
    check('«العام» starts with its first message', (await calls(p, 'chat_global_room')).length === 1 && sends[1].args.p_room === 'r-all', sends[1]);
    await p.click('.cw-ta');
    await p.keyboard.type('ورسالة ثانية.');
    await p.keyboard.press('Enter');
    await until(async () => (await calls(p, 'chat_send')).length === 3);
    check('the second message to «العام» does not ask again', !(await p.$('.cw-confirm')));

    // + menu: four and «المزيد» at the side size.
    await p.click('.cw-plus');
    const sideActs = await p.$$eval('.cw-menu .cw-act b', (bs) => bs.map((b) => b.textContent));
    check('+ at the side size: four actions and «المزيد»', sideActs.length === 4 && !!(await p.$('.cw-more')), sideActs);
    await p.click('.cw-more');
    check('«المزيد» shows the rest', (await p.$$('.cw-menu .cw-act')).length === 10);
    await p.keyboard.press('Escape');
    check('Escape closes the menu and leaves the window open', !(await p.$('.cw-menu')) && !!(await p.$('.cw-win')));

    // A group: @ later in the text mentions one of its members.
    await p.click('.cw-row:has-text("فريق التصميم")');
    await p.waitForSelector('.cw-win .cx-main');
    await p.click('.cw-ta');
    await p.keyboard.type('شكراً @ف');
    await p.waitForSelector('.cw-pop .cw-opt');
    check('@ later in the text offers the room\'s members', /إشارة/.test(await text(p, '.cw-pop .cw-pt')) && /فهد/.test(await text(p, '.cw-pop')));
    await p.keyboard.press('Enter');
    check('the mention is written into the text', /@فهد الدوسري/.test(await p.inputValue('.cw-ta')));
    await p.keyboard.press('Enter');
    await until(async () => (await calls(p, 'chat_send')).length === 4);
    check('it is sent in the open group', (await calls(p, 'chat_send'))[3].args.p_room === 'r-design');

    // 4. A work's conversation starts with its first message.
    await p.evaluate(() => window.__nav('/work/CH-241'));
    await p.click('.cx-back').catch(() => undefined);
    await p.waitForSelector('.cw-ctx');
    check('on a work page, its conversation is offered first', /ابدأ محادثة هذا العمل/.test(await text(p, '.cw-ctx')));
    await p.click('.cw-ctx');
    await p.waitForSelector('.cw-pending');
    check('it explains who is in it before it starts', /أصحاب مراحله/.test(await text(p, '.cw-start')) && /فيلم اليوم الوطني/.test(await text(p, '.cw-to b')));
    await p.click('.cw-ta');
    await p.keyboard.type('أول رسالة في محادثة العمل.');
    await p.keyboard.press('Enter');
    await until(async () => (await calls(p, 'chat_send')).length === 5);
    check('the first message starts the work\'s room', (await calls(p, 'chat_work_room'))[0]?.args.p_work === 'CH-241' && (await calls(p, 'chat_send'))[4].args.p_room === 'r-CH-241');
    await p.waitForSelector('.cw-win .cx-main:not(.cw-pending)');
    check('then the window shows that conversation', /فيلم اليوم الوطني/.test(await text(p, '.cw-win .cx-top')));

    // 5. Mail
    await p.click('.cw-seg button:has-text("البريد")');
    await p.waitForSelector('.cw-mrow');
    check('mail: the list, newest unread first', /موعد اعتماد نص الفيلم/.test(await text(p, '.cw-mrow')));
    check('a new mail is the box\'s default, folded to its fields', /بريد جديد/.test(await text(p, '.cw-to b')));
    await p.click('.cw-mrow:has-text("موعد اعتماد")');
    await p.waitForSelector('.cw-reader .ml-subj h3');
    check('the reader is the mail page\'s own, without its second reply box', /موعد اعتماد/.test(await text(p, '.cw-reader h3')) && !(await p.isVisible('.cw-reader .ml-qr').catch(() => false)));
    check('opening it marks it read', (await calls(p, 'mail_state')).some((c) => c.args.p_patch.read === true));
    check('the box replies in the thread', /رد على/.test(await text(p, '.cw-to b')));
    await p.click('.cw-ta');
    await p.keyboard.type('موافق، الساعة 11:30.');
    await p.keyboard.press('Control+Enter');
    await p.waitForSelector('.cw-undo');
    check('a reply waits ten seconds to be taken back', /تراجع/.test(await text(p, '.cw-undo')));
    await until(async () => (await calls(p, 'mail_send')).length === 1, 14000);
    const reply = (await calls(p, 'mail_send'))[0];
    check('then it is sent in the thread, with the signature', reply?.args.p_thread === 't-int' && /موافق/.test(reply?.args.p_body) && /ريم السالم/.test(reply?.args.p_body), reply);

    await p.click('[aria-label="تصغير إلى الزر"]');
    await p.click('.cw-launch');
    await p.click('.cw-seg button:has-text("المراسلة")');
    await p.click('.cx-back').catch(() => undefined);
    await p.click('.cw-ta');
    await p.keyboard.type('@بريد');
    await p.waitForSelector('.cw-opt:has-text("بريد جديد")');
    await p.click('.cw-opt:has-text("بريد جديد")');
    await p.waitForSelector('.cw-mailf');
    check('«بريد جديد» from @ grows the box to To and Subject', !!(await p.$('.cw-mailf input[aria-label="الموضوع"]')));
    await p.keyboard.type('خا');
    await p.waitForSelector('.cw-pop .cw-opt');
    await p.keyboard.press('Enter');
    await p.fill('.cw-mailf input[aria-label="الموضوع"]', 'جدول الأسبوع');
    await p.click('.cw-ta');
    await p.keyboard.type('مرفق الجدول بعد التعديل.');
    await p.keyboard.press('Control+Enter');
    await until(async () => (await calls(p, 'mail_send')).length === 2, 14000);
    const fresh = (await calls(p, 'mail_send'))[1];
    check('a new mail goes to the chosen person with its subject', fresh?.args.p_thread === null && JSON.stringify(fresh?.args.p_to) === '["p:khalid@t.test"]' && fresh?.args.p_subject === 'جدول الأسبوع', fresh);

    // 6. Escape, Alt+M, the mail page.
    await p.keyboard.press('Escape');
    check('Escape minimises to the launcher', !(await p.$('.cw-win')) && !!(await p.$('.cw-launch')));
    await p.keyboard.press('Alt+KeyM');
    check('Alt+M opens it again', !!(await p.$('.cw-win')));
    await p.click('[aria-label="فتح صفحة البريد"]');
    await until(async () => (await text(p, '.fx-path')).startsWith('/mail'));
    check('«فتح صفحة البريد» goes there and the window steps aside', !(await p.$('.cw-win')) && !(await p.$('.cw-launch')), await text(p, '.fx-path'));
    await p.evaluate(() => window.__nav('/'));
    await p.waitForSelector('.cw-launch');
    check('leaving the mail page brings the launcher back', true);

    // Turning it off from the account.
    await p.evaluate(() => window.__nav('/account'));
    await p.click('.cw-switch');
    await until(async () => !(await p.$('.cw-launch')));
    check('turning it off removes the launcher at once', (await calls(p, 'profile_update')).at(-1).args.p.chat_window === false);

    // Phone width and evening theme.
    const phone = await browser.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
    const q = await phone.newPage();
    q.on('pageerror', (e) => errs.push(`375: ${String(e)}`));
    await q.goto(`${base}/?fresh&dark`);
    await q.waitForSelector('.cw-launch');
    const qb = await box(q, '.cw-launch');
    const nav = await box(q, '.mobile-nav');
    check('375: the launcher sits above the bottom bar', qb.b <= nav.t - 8, { qb, nav });
    await q.tap('.cw-launch');
    await q.waitForSelector('.cw-win');
    const qw = await box(q, '.cw-win');
    check('375: the window fills the screen above the bottom bar, with no edge to drag', qw.w === 375 && qw.t === 0 && Math.abs(qw.b - nav.t) <= 1 && !(await q.$('.cw-grip')), qw);
    check('375: only minimise and the mail page in its header', JSON.stringify(await labels(q)) === JSON.stringify(['تصغير إلى الزر', 'فتح صفحة البريد']), await labels(q));
    check('375: nothing scrolls sideways', !(await overflow(q)));
    await q.screenshot({ path: path.join(out, 'phone-dark.png') });
    await phone.close();

    check('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  } catch (e) {
    const where = await (async () => { try { const pg = browser.contexts()[0]?.pages()[0]; return pg ? await pg.evaluate(() => ({ box: document.querySelector('.cw-box')?.textContent?.slice(0, 300), said: window.__said })) : null; } catch { return null; } })();
    check('the flow ran to the end', false, `${String(e.message ?? e).slice(0, 400)} | ${JSON.stringify(where)} | ${errs.slice(0, 2).join(' | ')}`);
  } finally {
    await browser.close();
    fixture?.close();
    process.exitCode = finish(path.join(__dirname, 'chat-window-flow.json')) ? 1 : 0;
  }
})();

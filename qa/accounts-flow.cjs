// Browser check of the flows of «الحسابات» (Permissions_Plan.md 5, as changed on 2026-11-01; MVP_draft.md section 65), in Edge.
// qa/permissions-pages.cjs renders each screen; this one clicks through them, on the real page and its real
// components (qa/fixtures/accounts-flow.tsx), with stand-ins for the provider and the database client, because the page
// needs a signed-in person and no bypass is allowed. It reads what the components asked the database to do.
//   1. A role changed on a person's row, with what it gives and takes, and from the card.
//   2. One switch on the card: on, off, back to the role, a page, a temporary grant, a refusal that puts it back.
//   3. «الأدوار»: two people of one role, one given something alone; «ما يختلف»; the role's own switch; the way back.
//   4. «إضافة عضو»: the defaults alone, then the advanced options.
//   5. Phone, tablet and evening: nothing sideways, the card alone on a phone.
// What this cannot check: the rules. Those run against the database in supabase/tests/.
// Usage: node qa/accounts-flow.cjs   (writes qa/accounts-flow.json, screenshots in qa/artifacts/accounts-flow/)
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const esbuild = require('esbuild');
const { dependency, launchOptions } = require('./runtime.cjs');
const { chromium } = dependency('playwright');
const h = require('./android-helpers.cjs');

const { check, finish } = h.record('qa/accounts-flow.cjs');
const out = path.join(__dirname, 'artifacts', 'accounts-flow');
const fixtures = path.join(__dirname, 'fixtures');
const css = ['globals', 'identity', 'work', 'chat', 'auth', 'permissions']
  .map((f) => fs.readFileSync(path.join(h.root, 'src', 'app', `${f}.css`), 'utf8'))
  .join('\n')
  .replace(/@import[^;]+;/g, '')
  .replace(/@theme\{[^}]*\}/g, '');
const page = (dark) =>
  `<!doctype html><html lang="ar" dir="rtl" data-identity="emerald"${dark ? ' data-theme="dark"' : ''}><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>الحسابات</title>` +
  `<style>${css}</style><style>body{font-family:"Segoe UI",Tahoma,sans-serif}</style></head><body><div id="root"></div><script type="module" src="/flow.js"></script></body></html>`;

const asked = (t, ...names) => t.evaluate((n) => window.__rpc.filter((c) => n.includes(c.name)), names);
const last = (t) => t.evaluate(() => window.__rpc[window.__rpc.length - 1] ?? null);
const fits = (t) => t.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const row = (t, name) => t.locator('.pm-row', { hasText: name });
const openTab = (t, label) => t.locator('.pm-tabs button', { hasText: label }).click();
const flip = (t, scope, label) => scope.getByRole('switch', { name: new RegExp(label) }).click();

(async () => {
  let fixture;
  const errs = [];
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch(launchOptions);
  try {
    await esbuild.build({
      entryPoints: [path.join(fixtures, 'accounts-flow.tsx')],
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
            const kit = path.join(fixtures, 'fake-accounts-kit.ts');
            b.onResolve({ filter: /^@\/lib\/(supabase\/client|store|account-context)$/ }, () => ({ path: kit }));
            b.onResolve({ filter: /^@\/lib\/push\/kick$/ }, () => ({ path: path.join(fixtures, 'fake-kick.ts') }));
            b.onResolve({ filter: /^\.\/data$/ }, (a) => (a.importer.includes(`${path.sep}accounts${path.sep}`) ? { path: path.join(fixtures, 'fake-accounts-flow.tsx') } : undefined));
            b.onResolve({ filter: /^next\/(navigation|link)$/ }, () => ({ path: path.join(fixtures, 'fake-next.tsx') }));
          },
        },
      ],
    });
    const bundle = fs.readFileSync(path.join(out, 'flow.js'), 'utf8');
    const invites = [];
    fixture = http.createServer((req, res) => {
      if (req.url === '/flow.js') {
        res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
        return res.end(bundle);
      }
      if (req.url === '/api/entry/invite') {
        let body = '';
        req.on('data', (d) => (body += d));
        req.on('end', () => {
          invites.push(JSON.parse(body));
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end('{"sent":true}');
        });
        return undefined;
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(page(req.url.includes('dark=1')));
    });
    await new Promise((r) => fixture.listen(0, '127.0.0.1', r));
    const base = `http://127.0.0.1:${fixture.address().port}/`;

    // The site's sidebar takes 224 pixels; the fixture has none, so a 1056 wide window is a 1280 wide desktop.
    const ctx = await browser.newContext({ viewport: { width: 1056, height: 900 }, deviceScaleFactor: 2 });
    const t = await ctx.newPage();
    t.on('pageerror', (e) => errs.push(String(e)));
    t.on('console', (m) => m.type() === 'error' && !/favicon/.test(m.text()) && errs.push(m.text()));

    // ---------- 1. a role, changed on the row ----------
    await t.goto(base);
    await t.waitForSelector('.pm-row');
    await t.screenshot({ path: path.join(out, '01-members.png'), fullPage: true });
    check('«الأعضاء»: six people, in the columns the head names, and no sideways scroll', (await t.locator('.pm-row').count()) === 6 && (await fits(t)));
    check('a role that cannot be changed is shown with its reason, and is no control', (await t.locator('.pm-rolepick').count()) === 4 && (await row(t, 'مسؤول الفحص').locator('.pm-rolefixed').getAttribute('title')).includes('مؤسس') && (await row(t, 'مدير الفحص').locator('.pm-rolefixed').getAttribute('title')).includes('لا يعدّل أحد'));
    const options = await row(t, 'كاتب أول').locator('.pm-rolepick option').evaluateAll((l) => l.map((o) => o.value));
    check('the row offers the roles the director may give, never director or Admin', options.includes('assistant') && !options.includes('director') && !options.includes('admin'), options);
    await row(t, 'كاتب أول').locator('.pm-rolepick').selectOption('publisher');
    await t.waitForSelector('dialog .pm-rolefromto');
    const dialog = await t.locator('dialog[open]').innerText();
    check('it asks first, saying what it gives and what it takes', dialog.includes('تغيير دور كاتب أول') && dialog.includes('النشر والجدولة') && dialog.includes('صفحة «إنشاء»') && dialog.includes('يبقى كما هو'), dialog);
    check('a change that takes something away is a long press', ((await t.locator('dialog[open] button.primary').getAttribute('data-hold')) ?? '').startsWith('ينقص هذا التغيير'));
    check('nothing is saved until it is confirmed', (await asked(t, 'assign_role')).length === 0 && (await row(t, 'كاتب أول').locator('.pm-rolepick').inputValue()) === 'writer');
    await t.screenshot({ path: path.join(out, '02-role-change.png') });
    await t.locator('dialog[open] button', { hasText: 'إلغاء' }).click();
    await row(t, 'كاتب أول').locator('.pm-rolepick').selectOption('producer');
    await t.waitForSelector('dialog .pm-rolefromto');
    check('between roles that hold the same it says so, and needs no long press', (await t.locator('dialog[open]').innerText()).includes('لا فرق في الصلاحيات بين الدورين') && !(await t.locator('dialog[open] button.primary').getAttribute('data-hold')));
    await t.locator('dialog[open] button.primary').click();
    await t.waitForSelector('dialog[open]', { state: 'detached' });
    check('confirming asks assign_role for that person alone, and keeps the pages', JSON.stringify(await asked(t, 'assign_role')) === JSON.stringify([{ name: 'assign_role', args: { p_email: 'one@example.test', p_role: 'producer', p_pages: null } }]));
    check('the row shows the new role at once', (await row(t, 'كاتب أول').locator('.pm-rolepick').inputValue()) === 'producer');
    await row(t, 'كاتب أول').locator('.pm-rolepick').selectOption('writer');
    await t.locator('dialog[open] button.primary').click();
    await t.waitForSelector('dialog[open]', { state: 'detached' });

    // ---------- 2. one switch on the card ----------
    await row(t, 'كاتبة ثانية').locator('.pm-who').click();
    await t.waitForSelector('.pm-card');
    const card = t.locator('.pm-card');
    await t.screenshot({ path: path.join(out, '03-card.png'), fullPage: true });
    check('the card opens beside the list, which stays', (await t.locator('.pm-row').count()) === 6 && (await fits(t)));
    check('the card says the person works by their role as it is', (await card.innerText()).includes('يعمل بصلاحيات دوره كما هي'));
    const label = 'بريد خارجي دون انتظار الاعتماد';
    await flip(t, card, label);
    await h.until(() => row(t, 'كاتبة ثانية').locator('.pm-mark.added').count(), 3000, 50);
    check('off to on: one call, for this person', JSON.stringify((await last(t)).args) === JSON.stringify({ p_email: 'two@example.test', p_cap: 'mail.outside.send', p_effect: 'allow', p_reason: null }), await last(t));
    check('the source and the row both show it', (await card.innerText()).includes('أُضيفت') && (await row(t, 'كاتبة ثانية').innerText()).includes('1 مضافة'));
    check('the switch reads on for a screen reader', (await card.getByRole('switch', { name: new RegExp(label) }).getAttribute('aria-checked')) === 'true');
    await t.waitForTimeout(250);
    await flip(t, card, label);
    await h.until(async () => !(await row(t, 'كاتبة ثانية').locator('.pm-mark.added').count()), 3000, 50);
    check('on to off, for what the role does not give: cleared, not denied, so the person is back on their role', (await last(t)).args.p_effect === null && (await card.innerText()).includes('يعمل بصلاحيات دوره كما هي'), await last(t));
    await t.waitForTimeout(250);
    await flip(t, card, 'البريد');
    await h.until(async () => (await last(t)).args.p_cap === 'page.mail', 3000, 50);
    check('a page is the same switch', (await last(t)).args.p_effect === 'deny');
    await t.waitForTimeout(250);
    await t.evaluate(() => (window.__refuse = 'NOT_HELD'));
    await flip(t, card, 'رسائل «مهم»');
    await h.until(() => t.evaluate(() => window.__says.some((s) => s.includes('لا تمنح ما لا تملكه أنت'))), 3000, 50);
    check('a refusal is said in Arabic and the switch goes back', (await card.getByRole('switch', { name: /رسائل «مهم»/ }).getAttribute('aria-checked')) === 'false' && !(await card.getByRole('switch', { name: /رسائل «مهم»/ }).isDisabled()));
    await card.locator('.pm-iconbtn').first().click();
    await t.waitForSelector('dialog .pm-modes');
    check('the clock beside a switch opens the time-limited grant for that permission', (await t.locator('dialog[open]').innerText()).includes('منح كاتبة ثانية'));
    await t.locator('dialog[open] button', { hasText: 'إلغاء' }).click();
    await card.locator('button.pm-x').click();

    await row(t, 'كاتب أول').locator('.pm-open').click();
    await t.waitForSelector('.pm-card');
    const before = await card.innerText();
    check('a temporary grant shows its end, «تمديد», and the way back to the role', before.includes('مؤقتة حتى') && before.includes('تمديد') && before.includes('إعادته إلى دوره'));
    check('«إعادته إلى دوره» is a long press', ((await card.locator('button', { hasText: 'إعادته إلى دوره' }).getAttribute('data-hold')) ?? '').length > 0);
    await flip(t, card, 'رسائل «مهم»');
    await h.until(async () => (await last(t)).name === 'revoke_capability', 3000, 50);
    check('switching a temporary grant off ends it', (await last(t)).args.p_id === 't1');
    await t.waitForTimeout(250);
    await t.locator('.pm-permsearch input').fill('واتساب');
    check('searching keeps only what matches, and opens its group', (await card.locator('.pm-perm').count()) === 1 && (await card.getByRole('switch', { name: /واتساب/ }).isVisible()));
    await t.locator('.pm-permsearch input').fill('');

    // ---------- 3. two people of one role ----------
    await card.locator('button', { hasText: 'قارنه بزملائه في الدور' }).click();
    await t.waitForSelector('.pm-matrix');
    check('«قارنه بزملائه» opens that role, with both of them in columns', (await t.locator('.pm-rail button.on').innerText()).includes('كاتب المحتوى') && (await t.locator('.pm-colhead').count()) === 2);
    await t.screenshot({ path: path.join(out, '04-role-before.png'), fullPage: true });
    const head = () => t.locator('.pm-matrix thead').innerText();
    check('both start the same as the role but for the page closed above', (await head()).includes('مثل الدور') || (await head()).includes('يختلف في'), await head());
    const cap = 'إنشاء قناة إعلانات في المراسلة';
    const one = t.getByRole('switch', { name: new RegExp(`${cap}، كاتب أول`) });
    const two = t.getByRole('switch', { name: new RegExp(`${cap}، كاتبة ثانية`) });
    check('each person has a switch of their own for the same permission', (await one.count()) === 1 && (await two.count()) === 1);
    await one.click();
    await h.until(async () => (await one.getAttribute('aria-checked')) === 'true' && (await t.locator('td.apart').count()) > 0, 3000, 50);
    const flipped = await last(t);
    check('giving it to one writer asks for that person alone', flipped.name === 'set_member_override' && flipped.args.p_email === 'one@example.test' && flipped.args.p_cap === 'room.create' && flipped.args.p_effect === 'allow', flipped);
    check('the other writer of the same role stays as they were', (await two.getAttribute('aria-checked')) === 'false');
    check('the cell is marked, in words as well as colour', (await one.locator('xpath=ancestor::td').innerText()).includes('له وحده'));
    await t.waitForTimeout(250);
    await t.locator('.seg button', { hasText: 'ما يختلف' }).click();
    const rows = await t.locator('.pm-matrix tbody th[scope=row]').allInnerTexts();
    check('«ما يختلف» keeps only the rows where someone stands apart', rows.includes(cap) && !rows.includes('إرسال رسالة إلى واتساب زميل'), rows);
    await t.screenshot({ path: path.join(out, '05-role-differs.png'), fullPage: true });
    await t.locator('.seg button', { hasText: 'الكل' }).click();

    const whole = t.locator('button[data-col="role"]', { hasNot: t.locator('xx') }).first();
    await whole.click();
    await t.waitForSelector('dialog[open]');
    check('the role\'s own switch says how many it touches before it is saved', (await t.locator('dialog[open]').innerText()).includes('شخصان'), await t.locator('dialog[open]').innerText());
    await t.locator('dialog[open] button.primary').click();
    await t.waitForSelector('dialog[open]', { state: 'detached' });
    check('and it asks set_role_default, not a person', (await last(t)).name === 'set_role_default' && (await last(t)).args.p_role === 'writer', await last(t));
    // «إنشاء» for a whole role (MVP_draft.md section 70).
    await t.locator('.pm-rail button', { hasText: 'المصمم' }).click();
    const createRole = t.getByRole('switch', { name: 'صفحة «إنشاء»، المصمم: موقوفة' });
    check('«إنشاء» has a real switch for a whole role, off for the designer', (await createRole.count()) === 1 && !(await createRole.isDisabled()));
    await createRole.click();
    await t.waitForSelector('dialog[open]');
    await t.locator('dialog[open] button.primary').click();
    await t.waitForSelector('dialog[open]', { state: 'detached' });
    const opened = await last(t);
    check('turning it on asks set_role_default for that role', opened.name === 'set_role_default' && opened.args.p_role === 'designer' && opened.args.p_cap === 'page.create' && opened.args.p_allowed === true, opened);
    await t.locator('.pm-rail button', { hasText: /^عضو/ }).click();
    check('it is off for the member too', (await t.getByRole('switch', { name: 'صفحة «إنشاء»، عضو: موقوفة' }).count()) === 1);
    await t.locator('.pm-rail button', { hasText: 'مسؤول النشر' }).click();
    check('and the publisher has no such row', (await t.getByRole('switch', { name: /صفحة «إنشاء»/ }).count()) === 0);
    await t.locator('.pm-rail button', { hasText: 'مدير الاتصال المؤسسي' }).first().click();
    check('a role at the director\'s own rank is shown, locked, with no columns of people', (await t.locator('.pm-colhead').count()) === 0 && (await t.locator('button[data-col="role"]').first().isDisabled()) && (await t.locator('.pm-howto').first().innerText()).includes('في رتبتك أو فوقها'));
    await t.locator('.pm-rail button', { hasText: 'كاتب المحتوى' }).click();
    await t.locator('.pm-fixedbox > summary').click();
    check('the fixed rules are there, each with its reason', (await t.locator('.pm-fixedbox').innerText()).includes('لا يعتمد أحد ما أرسله أو رفعه'));
    await t.locator('.pm-colhead', { hasText: 'كاتبة ثانية' }).click();
    await t.waitForSelector('.pm-card');
    check('a person\'s name in the table opens their card', (await card.innerText()).includes('two@example.test'));

    // ---------- 4. adding a member ----------
    await t.locator('button.pm-add').click();
    await t.waitForSelector('dialog form');
    const form = t.locator('dialog[open]');
    await t.waitForTimeout(250);
    await t.screenshot({ path: path.join(out, '06-add.png') });
    check('the cursor is already in the name', await form.locator('label', { hasText: 'الاسم' }).locator('input').evaluate((i) => i === document.activeElement));
    const visible = await form.locator('input:visible, select:visible').count();
    check('«إضافة عضو» opens with three fields, the rest folded away', visible === 3 && !(await form.locator('.page-grid').isVisible()), visible);
    const sum = () => form.locator('.pm-defaults').innerText();
    check('it says what the defaults are', (await sum()).includes('وصلاحيات دوره') && (await sum()).includes('وتصله دعوة بالبريد الآن'), await sum());
    await form.locator('label', { hasText: 'الاسم' }).locator('input').fill('موظفة جديدة');
    await form.locator('label', { hasText: 'البريد الإلكتروني' }).locator('input').fill('New@Example.test');
    await form.locator('select').first().selectOption('designer');
    check('choosing a role says what the role is for', (await form.innerText()).includes('يصمم ويرفع إصدارات الوسائط'));
    await form.locator('button.primary').click();
    await t.waitForSelector('dialog[open]', { state: 'detached' });
    const added = (await asked(t, 'add_account')).pop();
    check('three fields are enough: it adds with the role\'s pages, those the director holds', added.args.p_role === 'designer' && added.args.p_pages.length === 9 && !added.args.p_pages.includes('create') && !added.args.p_pages.includes('settings') && !added.args.p_pages.includes('ideas'), added);
    check('the invitation goes out once, to the address in small letters', JSON.stringify(invites) === JSON.stringify([{ email: 'new@example.test', kind: 'invite' }]), invites);
    check('and the new person\'s card opens', (await card.innerText()).includes('new@example.test'));

    await t.locator('button.pm-add').click();
    await t.waitForSelector('dialog form');
    await form.locator('label', { hasText: 'الاسم' }).locator('input').fill('موظف بخيارات');
    await form.locator('label', { hasText: 'البريد الإلكتروني' }).locator('input').fill('opts@example.test');
    await form.locator('.pm-advanced > summary').click();
    await t.waitForTimeout(250);
    await t.screenshot({ path: path.join(out, '07-add-advanced.png') });
    check('«خيارات متقدمة» opens the pages, extra permissions and the invitation', (await form.locator('.page-grid').isVisible()) && (await form.locator('.pm-extras').isVisible()));
    check('«إنشاء» is not a page tick: the role decides, and it is offered as a permission', (await form.locator('.page-grid label', { hasText: 'إنشاء' }).count()) === 0 && (await form.locator('.pm-extras label', { hasText: 'صفحة «إنشاء»' }).count()) === 1);
    await form.locator('.page-grid label', { hasText: 'التحليلات' }).locator('input').uncheck();
    check('a page the director does not hold cannot be ticked', await form.locator('.page-grid label', { hasText: 'الأفكار' }).locator('input').isDisabled());
    await form.locator('.pm-extras label', { hasText: 'رسائل «مهم»' }).locator('input').check();
    await form.locator('.pm-advbody > label', { hasText: 'أرسل دعوة' }).locator('input').uncheck();
    check('the summary follows every choice', (await sum()).includes('8 صفحات') && (await sum()).includes('و1 إضافية') && (await sum()).includes('ولن تُرسل دعوة الآن'), await sum());
    await form.locator('button.primary').click();
    await t.waitForSelector('dialog[open]', { state: 'detached' });
    const second = (await asked(t, 'add_account')).pop();
    const extra = (await asked(t, 'grant_capability')).pop();
    check('the options are used: one page fewer, the extra permission for good, no invitation', second.args.p_pages.length === 8 && !second.args.p_pages.includes('analytics') && extra.args.p_email === 'opts@example.test' && extra.args.p_cap === 'urgency.2' && extra.args.p_mode === 'standing' && invites.length === 1, { second, extra, invites });

    await openTab(t, 'السجل');
    const about = await t.locator('.pm-logtab .pm-howto').innerText();
    check('«السجل» says what it holds, and where the rest is', about.includes('الحسابات والصلاحيات وحدها') && about.includes('سجل النشاط'));
    await t.locator('.pm-logtab .pm-howto a').click();
    check('and links to «سجل النشاط»', JSON.stringify(await t.evaluate(() => window.__went)) === '["/activity"]');
    check('no page error on a desktop', errs.length === 0, errs);
    await ctx.close();

    // ---------- 5. other sizes, and the evening ----------
    for (const [name, width, height, query] of [['phone', 390, 844, ''], ['tablet', 692, 900, ''], ['evening', 1056, 900, 'dark=1']]) {
      const c = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2 });
      const p = await c.newPage();
      const bad = [];
      p.on('pageerror', (e) => bad.push(String(e)));
      await p.goto(`${base}?${query}`);
      await p.waitForSelector('.pm-row');
      check(`${name}: «الأعضاء» has no sideways scroll`, await fits(p));
      await p.screenshot({ path: path.join(out, `10-${name}-members.png`), fullPage: true });
      await row(p, 'كاتب أول').locator('.pm-who').click();
      await p.waitForSelector('.pm-card');
      check(`${name}: the card has no sideways scroll`, await fits(p));
      if (name === 'phone') {
        check('phone: the card takes the page, and closing it brings the list back', !(await p.locator('.pm-list').isVisible()));
        await p.locator('.pm-card button.pm-x').click();
        check('phone: the list is back', await p.locator('.pm-list').isVisible());
        await row(p, 'كاتب أول').locator('.pm-who').click();
      }
      await p.screenshot({ path: path.join(out, `11-${name}-card.png`), fullPage: true });
      await openTab(p, 'الأدوار');
      await p.waitForSelector('.pm-matrix');
      check(`${name}: «الأدوار» has no sideways scroll on the page itself`, await fits(p));
      if (name === 'phone') {
        await p.locator('.pm-rail button', { hasText: 'عضو' }).click();
        await p.waitForTimeout(500);
        const seen = await p.locator('.pm-rail button.on').evaluate((b) => {
          const r = b.getBoundingClientRect();
          return r.left >= 0 && r.right <= window.innerWidth;
        });
        check('phone: the chosen role is in sight in the row of roles', seen);
        await p.locator('.pm-rail button', { hasText: 'كاتب المحتوى' }).click();
      }
      await p.screenshot({ path: path.join(out, `12-${name}-roles.png`), fullPage: true });
      check(`${name}: no page error`, bad.length === 0, bad);
      await c.close();
    }
  } catch (e) {
    check('the check ran to its end', false, `${e && e.stack ? e.stack : e} | page errors: ${errs.join(' | ')}`);
  } finally {
    await browser.close();
    if (fixture) fixture.close();
  }
  process.exitCode = finish(path.join(__dirname, 'accounts-flow.json')) ? 1 : 0;
})();

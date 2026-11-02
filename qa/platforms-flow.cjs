// Browser check of «المنصات» and «حسابات المنصات» (MVP_draft.md section 67), in Edge: the real tab and page and their real
// components (qa/fixtures/platforms-flow.tsx), with stand-ins for the database and the site's routes, because the pages
// need a signed-in person and no bypass is allowed. It reads what the components asked the database and the routes to do.
//   1. «المنصات»: every state on its own line, what needs the reader first, the menu.
//   2. The sheet: the steps and their links, saved at each step, closing and coming back, a secret never in the progress.
//   3. Arabic and English: the steps change sides by themselves.
//   4. Reviews, adding a platform with steps and without, a viewer, a refused save.
//   5. «حسابات المنصات»: what needs attention, the filter, an account's sheet, the publisher.
//   6. «إضافة حساب»: no password anywhere, the sign-in and its return, one at a time where a platform works so.
//   7. Phone and evening: nothing sideways, the current step alone above its input.
//   8. The YouTube guide: thirteen steps, English set apart and read in order, the pictures load and enlarge, progress unchanged.
// What this cannot check: the rules (supabase/tests/platform_setup_rules.sql) and a real platform's own pages.
// Usage: node qa/platforms-flow.cjs   (writes qa/platforms-flow.json, screenshots in qa/artifacts/platforms-flow/)
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const esbuild = require('esbuild');
const { dependency, launchOptions } = require('./runtime.cjs');
const { chromium } = dependency('playwright');
const h = require('./android-helpers.cjs');

const { check, finish } = h.record('qa/platforms-flow.cjs');
const out = path.join(__dirname, 'artifacts', 'platforms-flow');
const fixtures = path.join(__dirname, 'fixtures');
const css = ['globals', 'identity', 'media', 'kit', 'work', 'chat', 'auth', 'permissions']
  .map((f) => fs.readFileSync(path.join(h.root, 'src', 'app', `${f}.css`), 'utf8'))
  .join('\n')
  .replace(/@import[^;]+;/g, '')
  .replace(/@theme\{[^}]*\}/g, '');
const page = (dark, dir) =>
  `<!doctype html><html lang="${dir === 'ltr' ? 'en' : 'ar'}" dir="${dir}" data-identity="emerald"${dark ? ' data-theme="dark"' : ''}><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>المنصات</title>` +
  `<style>${css}</style><style>body{font-family:"Segoe UI",Tahoma,sans-serif}main{max-width:1120px;margin:auto;padding:16px}</style></head><body><div id="root"></div><script type="module" src="/flow.js"></script></body></html>`;

const SECRET = 'a-secret-that-must-stay-out-of-progress';
const calls = (t, ...names) => t.evaluate((n) => window.__db.calls.filter((c) => !n.length || n.includes(c.name)), names);
const fits = (t) => t.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const row = (t, key) => t.locator(`.pf-row[data-platform="${key}"]`);
const chip = async (t, key) => (await row(t, key).locator('.pf-chip').innerText()).trim();
const sheet = (t) => t.locator('dialog.pf-sheet[open]');
const sides = (t) =>
  t.evaluate(() => {
    const a = document.querySelector('dialog[open] .pf-side').getBoundingClientRect();
    const b = document.querySelector('dialog[open] .pf-input').getBoundingClientRect();
    return { side: Math.round(a.left), input: Math.round(b.left), sideRight: Math.round(a.right), inputRight: Math.round(b.right) };
  });

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
      // The guides' pictures are files of the site (public/guides), served as the site serves them.
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
      // The platform's sign-in, reduced to its return.
      if (url.pathname.startsWith('/api/platforms/connect/')) {
        const provider = url.pathname.split('/').pop();
        res.writeHead(302, { Location: `/?page=accounts&connect=${provider}&offer=00000000-0000-4000-8000-000000000001` });
        return res.end();
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(page(url.searchParams.has('dark'), url.searchParams.get('dir') === 'ltr' ? 'ltr' : 'rtl'));
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

    // ---------- 1. the list ----------
    const t = await fresh();
    await t.goto(base);
    await t.waitForSelector('.pf-row');
    await t.screenshot({ path: path.join(out, '01-platforms.png'), fullPage: true });
    const states = await t.locator('.pf-row').evaluateAll((l) => Object.fromEntries(l.map((e) => [e.dataset.platform, e.dataset.state])));
    check('every platform has one state, worked out from what is stored', JSON.stringify(states) === JSON.stringify({ x: 'issue', youtube: 'steps', tiktok: 'steps', linkedin: 'none', instagram: 'ok', snapchat: 'manual', mail: 'mail' }), JSON.stringify(states));
    check('the words of the chips', (await chip(t, 'x')) === 'يوجد خلل' && (await chip(t, 'linkedin')) === 'غير متصلة' && (await chip(t, 'instagram')) === 'متصلة' && (await chip(t, 'snapchat')) === 'نشر يدوي' && (await chip(t, 'tiktok')) === 'خطوات ناقصة · 6 من 9', await chip(t, 'tiktok'));
    check('a stored secret proves the steps it proves: YouTube shows what is left of the shared Google app', (await chip(t, 'youtube')) === 'خطوات ناقصة · 11 من 13' && (await row(t, 'youtube').innerText()).includes('التالي: سجّل عنوان العودة ليوتيوب'), await chip(t, 'youtube'));
    const groups = await t.locator('.pf-group h3').allInnerTexts();
    check('what needs the reader comes first', groups[0].includes('تحتاج منك خطوة') && groups[0].includes('4') && groups[1].includes('لا شيء مطلوب منك الآن'), groups);
    check('each row has the one button its state asks for', (await row(t, 'x').locator('.pf-btn').innerText()) === 'إصلاح' && (await row(t, 'tiktok').locator('.pf-btn').innerText()) === 'متابعة الإعداد' && (await row(t, 'linkedin').locator('.pf-btn').innerText()) === 'بدء الإعداد');
    check('publishing is said plainly to be a simulation', (await t.locator('.pf-sim').innerText()).includes('محاكاة'));
    check('no sideways scroll', await fits(t));

    await t.locator('.st-add').click();
    await t.waitForSelector('.pf-menu');
    await t.screenshot({ path: path.join(out, '02-menu.png') });
    const menu = await t.locator('.pf-menu-item').allInnerTexts();
    check('«إضافة منصة» opens every option: with steps, without, and any other', menu.some((x) => x.includes('فيسبوك') && x.includes('7 خطوات')) && menu.some((x) => x.includes('لينكدإن') && x.includes('5 خطوات')) && menu.some((x) => x.includes('قناة واتساب') && x.includes('نشر يدوي')) && menu.some((x) => x.includes('منصة أخرى')), menu.length);
    check('what is on its way is not offered again', !menu.some((x) => x.includes('إنستغرام') || x.includes('يوتيوب')));
    await t.keyboard.press('Escape');
    check('Escape closes the menu', (await t.locator('.pf-menu').count()) === 0);

    // ---------- 2. the sheet ----------
    await row(t, 'tiktok').locator('.pf-btn').click();
    await sheet(t).waitFor();
    await t.waitForTimeout(300);
    await t.screenshot({ path: path.join(out, '03-sheet-keys.png') });
    let text = await sheet(t).innerText();
    check('it opens where the person stopped, with the bar and the saved word', text.includes('الخطوة 7 من 9') && text.includes('انسخ المفتاح والسر') && text.includes('يُحفظ تقدمك'), text.slice(0, 120));
    check('the bar shows how far', (await t.locator('.pf-bar').getAttribute('aria-valuenow')) === '67');
    check('the app id kept from before is there; the secret is not', (await sheet(t).getByLabel('مفتاح العميل (Client key)').inputValue()) === 'client-key-saved' && (await sheet(t).getByLabel('سر العميل (Client secret)').inputValue()) === '');
    const cur = await t.locator('.pf-step.cur .pf-link').getAttribute('href');
    check('the step links to the platform, in a new tab', cur === 'https://developers.tiktok.com/apps/' && (await t.locator('.pf-step.cur .pf-link').getAttribute('target')) === '_blank' && (await t.locator('.pf-step.cur .pf-link').getAttribute('rel')) === 'noopener noreferrer');
    const s = await sides(t);
    check('in Arabic the steps are on the right and the input on the left', s.side > s.input, JSON.stringify(s));

    // A refused pair stops there, and nothing is saved.
    await sheet(t).getByLabel('سر العميل (Client secret)').fill('refused-secret');
    await sheet(t).getByRole('button', { name: 'فحص وحفظ' }).click();
    await sheet(t).locator('.pf-note.bad').waitFor();
    check('a pair the platform refuses stays on the step, and says why', (await sheet(t).locator('.pf-note.bad').innerText()).includes('رفضت المنصة') && (await sheet(t).innerText()).includes('الخطوة 7 من 9'));
    await sheet(t).getByLabel('سر العميل (Client secret)').fill(SECRET);
    await sheet(t).getByRole('button', { name: 'فحص وحفظ' }).click();
    await t.waitForFunction(() => document.querySelector('dialog[open]')?.innerText.includes('الخطوة 8 من 9'));
    const after = await calls(t);
    check('the secret went to the route that checks it', after.some((c) => c.name === '/api/platforms/app' && c.args.secret === SECRET && c.args.provider === 'tiktok'));
    const saves = await calls(t, 'platform_setup_save');
    check('and never into the saved progress', saves.length > 0 && !JSON.stringify(saves).includes(SECRET) && JSON.stringify(saves.at(-1).args.p_fields) === '{"app_id":"client-key-saved"}', JSON.stringify(saves.at(-1)?.args));
    check('accepted keys switch the platform on, so accounts can be added', (await calls(t, 'platform_set_enabled')).some((c) => c.args.p_key === 'tiktok' && c.args.p_on === true));

    // Back and forth, and closing.
    await sheet(t).getByRole('button', { name: 'إغلاق', exact: true }).click();
    await t.locator('dialog.pf-sheet').waitFor({ state: 'detached' });
    await t.waitForFunction(() => document.querySelector('.pf-row[data-platform="tiktok"] .pf-chip')?.innerText.includes('7 من 9'));
    check('closing says progress is kept, and the row moved on', (await t.locator('.ml-hint').innerText()).includes('حُفظ تقدمك: 7 من 9'), await chip(t, 'tiktok'));
    await row(t, 'tiktok').locator('.pf-btn').first().click();
    await sheet(t).waitFor();
    check('coming back opens the same step', (await sheet(t).innerText()).includes('الخطوة 8 من 9') && (await sheet(t).innerText()).includes('قدّم التطبيق للمراجعة'));
    await sheet(t).locator('.pf-step-btn', { hasText: 'سجّل عنوان العودة' }).click();
    check('any step can be opened', (await sheet(t).locator('.pf-input').innerText()).includes('عنوان العودة'));
    const copy = await sheet(t).locator('.pf-copy input').inputValue();
    check('an address to copy is filled in from the site, whole', /^http:\/\/127\.0\.0\.1:\d+\/api\/platforms\/callback\/tiktok$/.test(copy), copy);
    await t.keyboard.press('Escape');
    await t.locator('dialog.pf-sheet').waitFor({ state: 'detached' });
    check('Escape closes the sheet', true);

    // ---------- 3. a platform from nothing, to its review ----------
    await row(t, 'linkedin').locator('.pf-btn').first().click();
    await sheet(t).waitFor();
    check('a platform never started opens at its first step, with its link', (await sheet(t).innerText()).includes('الخطوة 1 من 5') && (await t.locator('.pf-step.cur .pf-link').getAttribute('href')) === 'https://www.linkedin.com/developers/apps/new');
    await sheet(t).getByRole('button', { name: 'أنشأت التطبيق' }).click();
    await sheet(t).getByRole('button', { name: 'طلبتهما' }).click();
    await sheet(t).getByRole('button', { name: 'سجّلت العنوان' }).click();
    await t.waitForFunction(() => document.querySelector('dialog[open]')?.innerText.includes('الخطوة 4 من 5'));
    await sheet(t).getByLabel('معرّف العميل (Client ID)').fill('li-client-id');
    await sheet(t).getByLabel('سر العميل (Primary Client Secret)').fill(SECRET);
    await sheet(t).getByRole('button', { name: 'فحص وحفظ' }).click();
    await t.waitForFunction(() => document.querySelector('dialog[open]')?.innerText.includes('الخطوة 5 من 5'));
    text = await sheet(t).locator('.pf-input').innerText();
    check('the company Page says plainly what it needs, and that the site does not connect it yet', (await sheet(t).locator('.pf-step.cur').innerText()).includes('Community Management API') && (await sheet(t).locator('.pf-step.cur').innerText()).includes('الموقع لا يربط الصفحة بعد') && text.includes('أكتفي بالنشر باسم شخص'));
    await sheet(t).getByRole('button', { name: 'قدّمت الطلب' }).click();
    await t.waitForFunction(() => !document.querySelector('dialog[open] .pf-step.cur'));
    await sheet(t).getByRole('button', { name: 'إغلاق', exact: true }).click();
    await t.locator('dialog.pf-sheet').waitFor({ state: 'detached' });
    await t.waitForFunction(() => document.querySelector('.pf-row[data-platform="linkedin"]')?.dataset.state === 'wait');
    check('what a person reports about a review becomes the state', (await chip(t, 'linkedin')) === 'بانتظار موافقة المنصة' && (await calls(t, 'platform_set_readiness')).at(-1).args.p_state === 'submitted');

    // ---------- 4. adding, the Meta key, a failure, a viewer ----------
    await t.locator('.st-add').click();
    await t.locator('[data-add="facebook"]').click();
    await sheet(t).waitFor();
    check('a platform with steps is added and opens its setup', (await calls(t, 'platform_save')).at(-1).args.p_key === 'facebook' && (await sheet(t).innerText()).includes('إعداد فيسبوك') && (await sheet(t).innerText()).includes('Manage everything on your Page'));
    await sheet(t).locator('.pf-step-btn', { hasText: 'انسخ المعرّف والسر' }).click();
    const save = sheet(t).getByRole('button', { name: 'استبدال بعد الفحص' });
    await sheet(t).getByLabel('معرّف الإعداد (Configuration ID)').fill('');
    await sheet(t).getByLabel('سر التطبيق (App Secret)').fill(SECRET);
    check('Meta asks for the Configuration ID: the button waits for it', await save.isDisabled());
    await sheet(t).getByLabel('معرّف الإعداد (Configuration ID)').fill('987654321');
    check('and takes it', await save.isEnabled());
    await save.click();
    await t.waitForFunction(() => window.__db.calls.some((c) => c.name === '/api/platforms/app' && c.args.provider === 'meta'));
    check('the Configuration ID goes with the pair', (await calls(t, '/api/platforms/app')).at(-1).args.config_id === '987654321');
    await t.keyboard.press('Escape');
    await t.locator('dialog.pf-sheet').waitFor({ state: 'detached' });

    await t.locator('.st-add').click();
    await t.locator('[data-add="whatsapp_channel"]').click();
    await t.waitForFunction(() => document.querySelector('.pf-row[data-platform="whatsapp_channel"]'));
    check('a platform with no sign-in is simply added, switched on, with no sheet', (await chip(t, 'whatsapp_channel')) === 'نشر يدوي' && (await t.locator('dialog.pf-sheet').count()) === 0);
    await row(t, 'instagram').getByRole('button', { name: 'التفاصيل' }).click();
    await sheet(t).waitFor();
    await sheet(t).locator('.st-advanced > summary').click();
    await t.waitForTimeout(150);
    await t.screenshot({ path: path.join(out, '04-details.png') });
    text = await sheet(t).locator('.pf-input').innerText();
    check('a connected platform opens its summary, with the rest folded under «خيارات متقدمة»', text.includes('إنستغرام جاهزة') && text.includes('في الخزنة') && text.includes('حدود المنشور') && text.includes('تعديل') && text.includes('سجل المنصة'));
    await sheet(t).locator('.st-info > summary').click();
    check('the facts say when they were read from the platform', (await sheet(t).locator('.st-info').innerText()).includes('روجعت من وثائق المنصة الرسمية في 2026-11-01'));
    await t.keyboard.press('Escape');
    await t.locator('dialog.pf-sheet').waitFor({ state: 'detached' });

    await t.evaluate(() => (window.__refuse = 'platform_setup_save'));
    await row(t, 'youtube').locator('.pf-btn').first().click();
    await sheet(t).waitFor();
    await sheet(t).getByRole('button', { name: 'سجّلت العنوان' }).click();
    await sheet(t).locator('.pf-saved.bad').waitFor();
    check('a save that fails says so at once', (await sheet(t).locator('.pf-saved.bad').innerText()).includes('تعذّر حفظ التقدم'));
    await t.keyboard.press('Escape');
    await t.locator('dialog.pf-sheet').waitFor({ state: 'detached' });

    const ltr = await fresh();
    await ltr.goto(`${base}?dir=ltr`);
    await ltr.waitForSelector('.pf-row');
    await row(ltr, 'youtube').locator('.pf-btn').first().click();
    await sheet(ltr).waitFor();
    await ltr.waitForTimeout(300);
    await ltr.screenshot({ path: path.join(out, '05-sheet-english.png') });
    const e = await sides(ltr);
    check('in English the same sheet has the steps on the left and the input on the right, with nothing else changed', e.side < e.input, JSON.stringify(e));
    await ltr.context().close();

    const view = await fresh();
    await view.goto(`${base}?caps=viewer`);
    await view.waitForSelector('.pf-row');
    check('a viewer sees everything, and the controls are locked with a reason', (await view.locator('.st-add').getAttribute('data-need')) === 'platforms.manage' && (await row(view, 'x').locator('.pf-btn').first().getAttribute('data-need')) === 'platforms.manage');
    await view.context().close();

    const before = await fresh();
    await before.goto(`${base}?nosetup=1`);
    await before.waitForSelector('.pf-row');
    check('before the migration the page still works', (await before.locator('.pf-row').count()) >= 6);
    await before.context().close();

    // ---------- 5. «حسابات المنصات» ----------
    const a = await fresh({ width: 1056, height: 1000 });
    await a.goto(`${base}?page=accounts`);
    await a.waitForSelector('.ac-row');
    await a.screenshot({ path: path.join(out, '06-accounts.png'), fullPage: true });
    const attn = await a.locator('.ac-attn').innerText();
    check('what needs attention comes first, with why and what depends on it', attn.includes('يحتاج انتباهك') && attn.includes('رفضت المنصة الرمز') && attn.includes('مجدول') && attn.includes('التوظيف'), attn.slice(0, 200));
    check('accounts are grouped by platform, each one line', (await a.locator('.ac-group').count()) === 5 && (await a.locator('.ac-row').count()) === 7, await a.locator('.ac-row').count());
    const line = await a.locator('.ac-row[data-account="a-ig1"]').innerText();
    check('a line says the state, who publishes, when, and what uses it', ['الحساب الرسمي', '@org_official', 'متصل حتى', 'ناشر الفحص', 'نشر تلقائي', 'عمل واحد'].every((x) => line.includes(x)), line);
    const sim = await a.locator('.ac-row[data-account="a-yt"]').innerText();
    check('an account connected to nothing is marked, and never says connected', sim.includes('ربط محاكى') && !sim.includes('متصل'), sim);
    const manual = await a.locator('.ac-row[data-account="a-snap"]').innerText();
    check('an account with no sign-in says it is manual', manual.includes('نشر يدوي') && !manual.includes('متصل'), manual);
    check('the guide marks keep their shape', await a.locator('.ac-group-head .su-hint').first().evaluate((e) => Math.abs(e.offsetWidth - e.offsetHeight) <= 1));
    check('the old wall of buttons is gone from the list', (await a.locator('.ac-row button').count()) === 0);
    await a.locator('.ac-filters button', { hasText: 'إنستغرام' }).click();
    check('the filter leaves one platform', (await a.locator('.ac-group').count()) === 1 && (await a.locator('.ac-row').count()) === 3);
    await a.locator('.ac-filters button', { hasText: 'الكل' }).click();
    await a.locator('.ac-row[data-account="a-ig1"]').click();
    await sheet(a).waitFor();
    await a.waitForTimeout(300);
    await a.screenshot({ path: path.join(out, '07-account-sheet.png') });
    text = await sheet(a).innerText();
    check('an account opens in a sheet: what it is, and its connection', text.includes('ربط حقيقي · سليم') && text.includes('فحص الاتصال') && text.includes('إعادة الربط عبر المنصة') && text.includes('تعديل'));
    await sheet(a).locator('.pf-more > summary').click();
    text = await sheet(a).locator('.pf-more').innerText();
    check('cutting off, stopping and deleting are folded, and an account in use says why it stays', text.includes('فصل') && text.includes('إيقاف') && text.includes('حذف') && text.includes('يستخدمه عمل قائم'));
    check('disconnecting still needs the long press', Boolean(await sheet(a).locator('[data-hold]').getAttribute('data-hold')));
    await a.keyboard.press('Escape');
    await a.locator('dialog.pf-sheet').waitFor({ state: 'detached' });

    // ---------- 6. «إضافة حساب» ----------
    await a.locator('.wk-head .wk-btn.gold').click();
    await sheet(a).waitFor();
    await a.waitForTimeout(300);
    await a.screenshot({ path: path.join(out, '08-add-platform.png') });
    text = await sheet(a).innerText();
    check('adding starts from the platforms that can take an account', text.includes('الخطوة 1 من 3') && text.includes('إنستغرام') && text.includes('تسجيل دخول عبر Meta') && text.includes('سناب شات'));
    check('a platform not set up says so and leads to its setup', (await sheet(a).locator('.ac-pick.off', { hasText: 'لينكدإن' }).getByRole('link', { name: 'إكمال الإعداد' }).getAttribute('href')) === '/settings?tab=platforms');
    const ad = await sides(a);
    check('the steps are on the right here too', ad.side > ad.input, JSON.stringify(ad));
    await sheet(a).locator('button.ac-pick[data-platform="instagram"]').click();
    await a.waitForTimeout(100);
    await a.screenshot({ path: path.join(out, '09-add-signin.png') });
    text = await sheet(a).innerText();
    check('there is no password field: one sign-in at the platform', (await sheet(a).locator('input[type="password"]').count()) === 0 && text.includes('لا يطلب الموقع كلمة مرورك أبداً') && text.includes('ربط عبر Meta'));
    check('Meta says one login gives several accounts, from one portfolio', text.includes('دخول واحد يعطي كل الحسابات'));
    await sheet(a).getByRole('button', { name: 'ربط عبر Meta' }).click();
    await a.waitForSelector('dialog.pf-sheet[open] .wk-pick label');
    await a.waitForTimeout(300);
    await a.screenshot({ path: path.join(out, '10-choose.png') });
    text = await sheet(a).innerText();
    check('back from the sign-in, the last step lists what it can connect', text.includes('الخطوة 3 من 3') && text.includes('@org_news') && text.includes('@org_campaigns'));
    check('a handle equal to the name is not printed twice', text.split('@org_news').length === 2, text);
    check('a platform the site does not have yet is named and cannot be picked: no raw key', !text.includes('facebook') && !text.includes('الصفحة الرسمية') && text.includes('لم تظهر هنا فيسبوك'));
    check('who publishes starts from the publishers, folded', text.includes('ناشر الفحص') && (await sheet(a).locator('.pf-more').getAttribute('open')) === null);
    await sheet(a).getByLabel(/@org_news/).check();
    await sheet(a).getByLabel(/@org_campaigns/).check();
    await sheet(a).getByRole('button', { name: 'ربط 2' }).click();
    await a.locator('dialog.pf-sheet').waitFor({ state: 'detached' });
    const link = (await calls(a, '/api/platforms/link')).at(-1).args;
    check('several accounts from one sign-in', link.picks.length === 2 && link.publishers.includes('pub@example.test'), JSON.stringify(link.picks));
    await a.waitForFunction(() => document.querySelectorAll('.ac-group[data-gd="plat-instagram"] .ac-row').length === 5);
    check('they join the list', true);

    await a.locator('.ac-group[data-gd="plat-youtube"] .ac-more').click();
    await sheet(a).waitFor();
    text = await sheet(a).innerText();
    check('«حساب آخر» starts at the sign-in of that platform', text.includes('الخطوة 2 من 3') && text.includes('ربط عبر Google'));
    check('and YouTube says each channel is a sign-in of its own', text.includes('لكل قناة دخول مستقل'));
    await a.keyboard.press('Escape');
    await a.locator('dialog.pf-sheet').waitFor({ state: 'detached' });

    await a.locator('.wk-head .wk-btn.gold').click();
    await sheet(a).waitFor();
    await sheet(a).locator('button.ac-pick[data-platform="snapchat"]').click();
    text = await sheet(a).innerText();
    check('a platform with no sign-in takes a name, in two steps', text.includes('الخطوة 2 من 2') && text.includes('سمِّ الحساب'));
    await sheet(a).getByLabel(/الاسم في المركز/).fill('الفعاليات');
    await sheet(a).getByLabel('اسم الحساب على المنصة').fill('org_events');
    await sheet(a).getByRole('button', { name: 'إضافة' }).click();
    await a.locator('dialog.pf-sheet').waitFor({ state: 'detached' });
    check('and is added', (await calls(a, 'account_save')).at(-1).args.p.platform === 'snapchat');

    await a.locator('.wk-head .wk-btn.gold').click();
    await sheet(a).waitFor();
    await sheet(a).locator('.pf-more > summary').click();
    await sheet(a).getByRole('button', { name: 'إضافة حساب تجريبي' }).click();
    await a.locator('dialog.wk-modal').waitFor();
    check('an account connected to nothing is still possible, folded and named for what it is', (await a.locator('dialog.wk-modal').innerText()).includes('حساب تجريبي'));
    await a.context().close();

    // The publisher: the bug of the old page.
    const p = await fresh();
    await p.goto(`${base}?page=accounts&role=publisher`);
    await p.waitForSelector('.ac-row');
    check('the publisher adds nothing, and is told what is theirs', (await p.locator('.wk-head .wk-btn.gold').count()) === 0 && (await p.locator('.wk-hint').innerText()).includes('لك إعادة ربط الحسابات'));
    await p.locator('.ac-row[data-account="a-x"]').click();
    await sheet(p).waitFor();
    text = await sheet(p).innerText();
    check('and can reconnect a really-connected account', text.includes('إعادة الربط عبر المنصة') && !text.includes('تعديل') && (await sheet(p).locator('.pf-more').count()) === 0);
    await sheet(p).getByRole('button', { name: 'إعادة الربط عبر المنصة' }).click();
    await p.waitForSelector('dialog.pf-sheet[open] .wk-pick label');
    await p.context().close();

    const none = await fresh();
    await none.goto(`${base}?page=accounts&nopub=1`);
    await none.waitForSelector('.ac-row');
    await none.locator('.ac-row').first().waitFor();
    await none.evaluate(() => sessionStorage.clear());
    await none.goto(`${base}?page=accounts&nopub=1&connect=meta&offer=00000000-0000-4000-8000-000000000001`);
    await none.waitForSelector('dialog.pf-sheet[open] .wk-pick label');
    check('with nobody in the publisher role, the person connecting is the default, so the button is not stuck', (await sheet(none).locator('.pf-facts').innerText()).includes('مدير الفحص'));
    await none.context().close();

    // ---------- 7. phone and evening ----------
    const m = await fresh({ width: 390, height: 844 });
    await m.goto(base);
    await m.waitForSelector('.pf-row');
    await m.screenshot({ path: path.join(out, '11-phone.png'), fullPage: true });
    check('phone: nothing sideways on the list', await fits(m));
    await row(m, 'tiktok').locator('.pf-btn').first().click();
    await sheet(m).waitFor();
    await m.waitForTimeout(300);
    await m.screenshot({ path: path.join(out, '12-phone-sheet.png') });
    const stacked = await m.evaluate(() => {
      const a = document.querySelector('dialog[open] .pf-side').getBoundingClientRect();
      const b = document.querySelector('dialog[open] .pf-input').getBoundingClientRect();
      return { above: a.bottom <= b.top + 1, wide: b.right - b.left, steps: [...document.querySelectorAll('dialog[open] .pf-step')].filter((e) => e.offsetParent).length };
    });
    check('phone: the current step alone, above its input', stacked.above && stacked.steps === 1 && stacked.wide > 340, JSON.stringify(stacked));
    await m.goto(`${base}?page=accounts`);
    await m.waitForSelector('.ac-row');
    await m.screenshot({ path: path.join(out, '13-phone-accounts.png'), fullPage: true });
    check('phone: nothing sideways on the accounts', await fits(m));
    check('phone: a line keeps its state and folds the rest under it', await m.locator('.ac-row .ac-meta').first().isVisible());
    await m.context().close();

    const d = await fresh();
    await d.goto(`${base}?dark=1`);
    await d.waitForSelector('.pf-row');
    await row(d, 'tiktok').locator('.pf-btn').first().click();
    await sheet(d).waitFor();
    await d.waitForTimeout(300);
    await d.screenshot({ path: path.join(out, '14-evening.png') });
    const ink = await d.evaluate(() => [getComputedStyle(document.querySelector('dialog[open]')).backgroundColor, getComputedStyle(document.querySelector('dialog[open] h2')).color]);
    check('evening: the sheet follows the theme', ink[0] !== 'rgb(255, 255, 255)' && ink[0] !== ink[1], ink.join(' / '));
    await d.context().close();
    // ---------- 8. the YouTube guide: words, pictures and progress (MVP_draft.md section 67.5) ----------
    const y = await fresh();
    await y.goto(base);
    await y.waitForSelector('.pf-row');
    await row(y, 'youtube').locator('.pf-btn').first().click();
    await sheet(y).waitFor();
    await y.waitForTimeout(300);
    text = await sheet(y).innerText();
    check('YouTube opens where the stored secret leaves it: the address to register, step 10 of 13', text.includes('الخطوة 10 من 13') && (await sheet(y).locator('.pf-step.cur').getAttribute('data-step')) === 'redirect', text.slice(0, 80));
    const yIds = await sheet(y).locator('.pf-step').evaluateAll((l) => l.map((e) => e.dataset.step));
    check('thirteen steps, one action each, under the ids the saved progress knows', JSON.stringify(yIds) === JSON.stringify(['project', 'youtube', 'drive', 'consent', 'branding', 'audience', 'contact', 'testusers', 'client', 'redirect', 'redirect_drive', 'keys', 'publish']), yIds.join(','));
    const stray = () =>
      y.evaluate(() => {
        const bad = [];
        for (const root of document.querySelectorAll('dialog[open] .pf-side, dialog[open] .pf-input')) {
          const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
          for (let n = w.nextNode(); n; n = w.nextNode()) if (!n.parentElement.closest('bdi') && /[A-Za-z]/.test(n.textContent)) bad.push(n.textContent.trim().slice(0, 50));
        }
        return bad;
      });
    const reversed = () =>
      y.evaluate(() => {
        const bad = [];
        for (const el of document.querySelectorAll('dialog[open] .gd-todo li, dialog[open] .pf-step-text p, dialog[open] figcaption')) {
          const b = [...el.querySelectorAll('bdi')];
          for (let i = 0; i + 1 < b.length; i++) {
            const r1 = b[i].getBoundingClientRect();
            const r2 = b[i + 1].getBoundingClientRect();
            if (Math.abs(r1.top - r2.top) < 4 && !(r1.left > r2.left)) bad.push(el.textContent.trim().slice(0, 50));
          }
        }
        return bad;
      });
    const walked = [];
    for (let i = 0; i < yIds.length; i++) {
      await sheet(y).locator('.pf-step-btn').nth(i).click();
      await y.waitForTimeout(60);
      await y.waitForFunction(() => [...document.querySelectorAll('dialog[open] .gd-shot img')].every((e) => e.complete));
      const info = await y.evaluate(() => {
        const inp = document.querySelector('dialog[open] .pf-input');
        const imgs = [...inp.querySelectorAll('.gd-shot img')];
        return {
          h3: inp.querySelector('h3')?.innerText ?? '',
          todo: inp.querySelectorAll('.gd-todo li').length,
          imgs: imgs.length,
          loaded: imgs.every((e) => e.naturalWidth > 0 && e.naturalWidth === Number(e.getAttribute('width')) && e.naturalHeight === Number(e.getAttribute('height'))),
          raw: /[«»`]/.test(document.querySelector('dialog[open] .pf-body').innerText),
          ltr: [...document.querySelectorAll('dialog[open] .pf-body bdi')].every((e) => e.getAttribute('dir') === 'ltr'),
          side: document.querySelector('dialog[open] .pf-step.cur')?.dataset.step,
          wide: document.documentElement.scrollWidth <= window.innerWidth + 1,
        };
      });
      walked.push({ id: yIds[i], ...info });
      await y.screenshot({ path: path.join(out, `20-youtube-${String(i + 1).padStart(2, '0')}-${yIds[i]}.png`) });
      const lost = await stray();
      const flipped = await reversed();
      check(`youtube step ${i + 1} (${yIds[i]}): its actions are listed, English is isolated, and the order reads right to left`, info.todo >= 1 && info.side === yIds[i] && !info.raw && info.ltr && lost.length === 0 && flipped.length === 0 && info.wide, JSON.stringify({ ...info, lost, flipped }));
      check(`youtube step ${i + 1} (${yIds[i]}): every picture loads at its own size`, info.loaded, JSON.stringify(info));
    }
    check('the pictures are where the steps put them: 1 in the menu step, 1 each in the Branding and contact steps, 2 for test users, 2 for the client, 1 for each address', JSON.stringify(walked.map((s) => s.imgs)) === JSON.stringify([0, 0, 0, 1, 1, 0, 1, 2, 2, 1, 1, 0, 0]), JSON.stringify(walked.map((s) => s.imgs)));
    check('the step that was too crowded is now three small ones, each with its own title', ['افتح شاشة الموافقة', 'اكتب اسم التطبيق وبريد الدعم', 'اختر نوع المستخدمين', 'اكتب بريد التواصل وأنهِ الإعداد'].every((x) => walked.some((s) => s.h3.includes(x))), walked.map((s) => s.h3).join(' | '));

    // The picture: rounded by the page, enlarged on a click, and blurred where it was private (the files hold no text to read).
    await sheet(y).locator('.pf-step-btn').nth(4).click();
    const fig = sheet(y).locator('.gd-shot').first();
    const radius = await fig.locator('.gd-zoom').evaluate((e) => [getComputedStyle(e).borderRadius, getComputedStyle(e).overflow]);
    check('the corners are rounded and the picture is clipped to them', radius[0] === '12px' && radius[1] === 'hidden', radius.join(' '));
    const zoomBefore = await fig.locator('img').evaluate((e) => [e.clientWidth, e.naturalWidth]);
    await fig.locator('button.gd-zoom').click();
    const zoomed = await fig.evaluate((f) => ({ big: f.classList.contains('big'), w: f.querySelector('img').clientWidth, scroll: f.querySelector('.gd-zoom').scrollWidth > f.querySelector('.gd-zoom').clientWidth, pressed: f.querySelector('button').getAttribute('aria-pressed') }));
    await y.screenshot({ path: path.join(out, '21-youtube-zoom.png') });
    check('a click enlarges it to its own size, and scrolls sideways inside the frame instead of the page', zoomBefore[0] < zoomBefore[1] && zoomed.big && zoomed.w === zoomBefore[1] && zoomed.scroll && zoomed.pressed === 'true' && (await fits(y)), JSON.stringify({ zoomBefore, zoomed }));
    await fig.locator('button.gd-zoom').click();
    check('and a second click puts it back', !(await fig.evaluate((f) => f.classList.contains('big'))));
    await sheet(y).locator('.pf-step-btn').nth(0).click();
    check('a step with no picture has none to click', (await sheet(y).locator('.gd-shot').count()) === 0);
    await sheet(y).locator('.pf-step-btn').nth(3).click();
    check('a narrow picture is shown whole and is not a button', (await sheet(y).locator('.gd-shot button').count()) === 0 && (await sheet(y).locator('.gd-shot img').getAttribute('alt')).includes('Google Auth Platform'));

    // The addresses and the keys.
    await sheet(y).locator('.pf-step-btn').nth(9).click();
    check('the YouTube address is filled in from the site, whole, under the list of actions', /^http:\/\/127\.0\.0\.1:\d+\/api\/platforms\/callback\/google$/.test(await sheet(y).locator('.pf-copy input').inputValue()) && (await sheet(y).locator('.pf-input').evaluate((e) => e.querySelector('.gd-todo').compareDocumentPosition(e.querySelector('.pf-copy')) & Node.DOCUMENT_POSITION_FOLLOWING)) > 0);
    await sheet(y).locator('.pf-step-btn').nth(10).click();
    check('the Drive address is the second one', /\/api\/drive\/callback$/.test(await sheet(y).locator('.pf-copy input').inputValue()));
    await sheet(y).locator('.pf-step-btn').nth(11).click();
    text = await sheet(y).locator('.pf-input').innerText();
    check('the keys step lists where to find the two values above the two fields, and holds the secret once', text.includes('Client secret') && text.includes('مرة واحدة عند إنشائه') && (await sheet(y).locator('.pf-input input[type="password"]').count()) === 1 && !text.includes(SECRET));

    // The progress is the same as before: the three steps a person confirms, then the platform is connected.
    await sheet(y).locator('.pf-step-btn').nth(9).click();
    await sheet(y).getByRole('button', { name: 'سجّلت العنوان' }).click();
    await y.waitForFunction(() => document.querySelector('dialog[open]')?.innerText.includes('الخطوة 13 من 13'));
    await sheet(y).getByRole('button', { name: 'نشرته' }).click();
    await y.waitForFunction(() => document.querySelector('dialog[open]')?.innerText.includes('اكتملت الخطوات'));
    const ySaves = await calls(y, 'platform_setup_save');
    const saved = ySaves.at(-1).args;
    check('every saved step is one the database accepts, and only the three a person confirms are in the progress', saved.p_done.every((d) => /^[a-z0-9_]{1,30}$/.test(d)) && JSON.stringify([...saved.p_done].sort()) === JSON.stringify(['publish', 'redirect', 'youtube']) , JSON.stringify(saved.p_done));
    check('the sheet ends as before, with its finishing page', (await sheet(y).innerText()).includes('يوتيوب جاهزة') && (await sheet(y).innerText()).includes('حساب'));
    await y.screenshot({ path: path.join(out, '22-youtube-done.png') });
    await sheet(y).getByRole('button', { name: 'إغلاق', exact: true }).click();
    await y.locator('dialog.pf-sheet').waitFor({ state: 'detached' });
    await y.waitForFunction(() => document.querySelector('.pf-row[data-platform="youtube"]')?.dataset.state === 'ok');
    check('and the row says connected: nothing the old steps proved is asked again', (await chip(y, 'youtube')) === 'متصلة', await chip(y, 'youtube'));
    await y.context().close();

    // The phone: the page never scrolls sideways, and a wide picture does inside its frame.
    const ym = await fresh({ width: 390, height: 844 });
    await ym.goto(base);
    await ym.waitForSelector('.pf-row');
    await row(ym, 'youtube').locator('.pf-btn').first().click();
    await sheet(ym).waitFor();
    await ym.evaluate(() => document.querySelector('dialog[open] .pf-step.cur'));
    const phoneStep = async (id) => {
      await ym.evaluate((i) => {
        document.querySelector(`dialog[open] .pf-step[data-step="${i}"] .pf-step-btn`)?.click();
      }, id);
      await ym.waitForTimeout(80);
    };
    for (const id of ['branding', 'testusers', 'client', 'redirect_drive']) {
      await phoneStep(id);
      await ym.waitForFunction(() => [...document.querySelectorAll('dialog[open] .gd-shot img')].every((e) => e.complete));
      const phone = await ym.evaluate(() => ({ page: document.documentElement.scrollWidth <= window.innerWidth + 1, body: (() => { const b = document.querySelector('dialog[open] .pf-body'); return b.scrollWidth <= b.clientWidth + 1; })(), shots: [...document.querySelectorAll('dialog[open] .gd-shot')].every((f) => f.getBoundingClientRect().right <= window.innerWidth + 1) }));
      check(`phone, ${id}: nothing sideways on the page, the sheet or the pictures`, phone.page && phone.body && phone.shots, JSON.stringify(phone));
    }
    await phoneStep('branding');
    await ym.locator('dialog[open] .pf-input').evaluate((e) => e.scrollIntoView());
    await ym.screenshot({ path: path.join(out, '23-youtube-phone.png') });
    await ym.context().close();

    // Evening, and English (the page's direction changes the sides, never the pictures).
    const yd = await fresh();
    await yd.goto(`${base}?dark=1`);
    await yd.waitForSelector('.pf-row');
    await row(yd, 'youtube').locator('.pf-btn').first().click();
    await sheet(yd).waitFor();
    await sheet(yd).locator('.pf-step-btn').nth(4).click();
    await yd.waitForFunction(() => [...document.querySelectorAll('dialog[open] .gd-shot img')].every((e) => e.complete));
    await yd.screenshot({ path: path.join(out, '24-youtube-evening.png') });
    const chipInk = await yd.evaluate(() => { const c = document.querySelector('dialog[open] .gd-todo .gd-ui'); const s = getComputedStyle(c); return [s.backgroundColor, s.color]; });
    check('evening: a label chip is told from the page behind it', chipInk[0] !== chipInk[1] && chipInk[1] !== 'rgb(0, 0, 0)', chipInk.join(' / '));
    await yd.context().close();
    const yl = await fresh();
    await yl.goto(`${base}?dir=ltr`);
    await yl.waitForSelector('.pf-row');
    await row(yl, 'youtube').locator('.pf-btn').first().click();
    await sheet(yl).waitFor();
    await sheet(yl).locator('.pf-step-btn').nth(8).click();
    await yl.waitForFunction(() => [...document.querySelectorAll('dialog[open] .gd-shot img')].every((e) => e.complete));
    await yl.screenshot({ path: path.join(out, '25-youtube-ltr.png') });
    check('English direction: the pictures keep their own direction and the page does not scroll sideways', (await fits(yl)) && (await yl.evaluate(() => [...document.querySelectorAll('dialog[open] .gd-zoom')].every((e) => getComputedStyle(e).direction === 'ltr'))));
    await yl.context().close();

    await t.context().close();

    check('no page error and nothing in the console', errs.length === 0, errs.slice(0, 3).join(' | '));
  } catch (e) {
    check('the flow ran to its end', false, String(e.message ?? e).slice(0, 500));
  } finally {
    await browser.close();
    fixture?.close();
  }
  process.exitCode = finish(path.join(__dirname, 'platforms-flow.json')) ? 1 : 0;
})();

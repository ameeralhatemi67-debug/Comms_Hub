// Browser verification for the sign-in gate and the light-by-default theme.
//
//   npm run build && npm start
//   node qa/auth-gate.cjs
//
// Signed-out checks only. Signing in needs a real person's password and an email
// confirmation, so the signed-in screens (Settings toggle, role switch, accounts
// page) are not covered here; see progress.md for what was and was not verified.
// Results go to qa/auth-gate.json. Nothing is written to the database.

const fs = require('node:fs');
const path = require('node:path');
const { dependency, baseURL, launchOptions } = require('./runtime.cjs');

const checks = [];
const errors = [];
const check = (name, pass, detail) => {
  checks.push({ name, pass: !!pass, detail });
  if (!pass) errors.push(`${name}: ${detail}`);
};

(async () => {
  const { chromium } = dependency('playwright');
  const browser = await chromium.launch(launchOptions);
  const origin = new URL(baseURL).origin;
  const pageErrors = [];
  const foreign = [];

  const open = async ({ theme, identity, scheme = 'light', width = 1280 } = {}) => {
    const ctx = await browser.newContext({ viewport: { width, height: 820 }, colorScheme: scheme });
    await ctx.addInitScript(([t, i]) => {
      if (t) localStorage.setItem('comms-hub-theme', t);
      if (i) localStorage.setItem('comms-hub-identity', i);
    }, [theme, identity]);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => pageErrors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') pageErrors.push(m.text()); });
    page.on('request', (r) => {
      const url = r.url();
      if (!url.startsWith(origin) && !url.startsWith('data:') && !url.startsWith('blob:')) foreign.push(url);
    });
    return { ctx, page };
  };
  const info = (page) => page.evaluate(() => {
    const r = document.documentElement;
    const card = document.querySelector('.auth-card');
    return {
      theme: r.getAttribute('data-theme'),
      identity: r.getAttribute('data-identity'),
      scheme: getComputedStyle(r).colorScheme,
      card: card ? getComputedStyle(card).backgroundColor : null,
      shell: !!document.querySelector('.app-shell, .sidebar, .mobile-nav'),
      heading: document.querySelector('h1')?.textContent ?? '',
      text: document.body.innerText,
      overflow: document.documentElement.scrollWidth > innerWidth + 1,
    };
  });

  // 1. Every route shows the gate and none of the product, signed out.
  {
    const { ctx, page } = await open({ identity: 'emerald' });
    for (const route of ['/', '/work', '/work/CH-241', '/create', '/approvals', '/settings', '/account', '/admin', '/accounts']) {
      await page.goto(baseURL + route, { waitUntil: 'networkidle' });
      const i = await info(page);
      check(`signed out ${route} shows the sign-in screen`, i.heading === 'تسجيل الدخول' && !i.shell, JSON.stringify({ heading: i.heading, shell: i.shell }));
      check(`signed out ${route} leaks no product text`, !/اليوم الوطني|CH-24|مدير الاتصال المؤسسي/.test(i.text), 'no work titles, ids or role names');
    }
    await ctx.close();
  }

  // 2. Light is the default even on a device that prefers dark.
  {
    const { ctx, page } = await open({ identity: 'emerald', scheme: 'dark' });
    await page.goto(baseURL + '/', { waitUntil: 'networkidle' });
    const prefers = await page.evaluate(() => matchMedia('(prefers-color-scheme: dark)').matches);
    const i = await info(page);
    check('the test device prefers dark', prefers, String(prefers));
    check('light is the default on a dark device', i.theme === 'light' && i.scheme === 'light' && i.card === 'rgb(251, 252, 249)', JSON.stringify(i));
    await ctx.close();
  }

  // 3. Dark applies only when chosen.
  {
    const { ctx, page } = await open({ identity: 'emerald', theme: 'dark', scheme: 'light' });
    await page.goto(baseURL + '/', { waitUntil: 'networkidle' });
    const i = await info(page);
    check('dark applies when chosen, on a light device', i.theme === 'dark' && i.scheme === 'dark' && i.card === 'rgb(14, 31, 24)', JSON.stringify(i));
    await ctx.close();
  }

  // 4. Direction A keeps light and never shows evening colours.
  {
    const { ctx, page } = await open({ theme: 'dark' });
    await page.goto(baseURL + '/', { waitUntil: 'networkidle' });
    const i = await info(page);
    check('Direction A has no evening mode even if dark was stored', i.card === 'rgb(255, 255, 255)', JSON.stringify(i));
    await ctx.close();
  }

  // 5. The three ways in, and the reset flow, are reachable from the keyboard order.
  {
    const { ctx, page } = await open({ identity: 'emerald' });
    await page.goto(baseURL + '/', { waitUntil: 'networkidle' });
    for (const [label, heading] of [['أول دخول', 'أول دخول'], ['طلب وصول', 'طلب وصول'], ['تسجيل الدخول', 'تسجيل الدخول']]) {
      await page.getByRole('button', { name: label, exact: true }).click();
      check(`tab ${label}`, (await page.locator('h1').innerText()) === heading, await page.locator('h1').innerText());
    }
    await page.getByRole('button', { name: 'نسيت كلمة المرور' }).click();
    check('forgot password view', (await page.locator('h1').innerText()) === 'نسيت كلمة المرور', 'ok');
    await ctx.close();
  }

  // 6. A phone does not scroll sideways, in either design and theme.
  for (const [identity, theme] of [[undefined, undefined], ['emerald', undefined], ['emerald', 'dark']]) {
    const { ctx, page } = await open({ identity, theme, width: 390 });
    await page.goto(baseURL + '/', { waitUntil: 'networkidle' });
    check(`390 px no sideways scroll (${identity ?? 'A'}${theme ? ', dark' : ''})`, !(await info(page)).overflow, 'ok');
    await ctx.close();
  }

  check('no page or console errors', pageErrors.length === 0, pageErrors.slice(0, 5).join(' | ') || 'none');
  check('no request leaves the local server on load', foreign.length === 0, foreign.slice(0, 5).join(' | ') || 'none');

  await browser.close();
  const passed = checks.filter((c) => c.pass).length;
  const report = { date: new Date().toISOString(), baseURL, passed, failed: checks.length - passed, errors, checks };
  fs.writeFileSync(path.join(__dirname, 'auth-gate.json'), JSON.stringify(report, null, 2));
  console.log(`${passed} passed, ${checks.length - passed} failed`);
  for (const e of errors) console.log('FAIL', e);
  process.exit(errors.length ? 1 : 0);
})();

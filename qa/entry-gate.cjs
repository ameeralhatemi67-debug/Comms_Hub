// Browser verification for the entry flow, signed out (Readiness_Audit.md section 2):
// the expired-link state, the first-time screen no longer asking whether an address is
// approved, the request and invite routes refusing what they must, and the phone layout.
//
//   npm run build && npm start
//   node qa/entry-gate.cjs
//
// Signing in needs a real person's password, so the administrator's side (entry state on
// the card, invite, reset) is covered by supabase/tests/entry_rules.sql and not here.
// Nothing is written to the database: no request is submitted, no sign-up is made.
// Results go to qa/entry-gate.json.
const fs = require('node:fs');
const path = require('node:path');
const { dependency, baseURL, launchOptions } = require('./runtime.cjs');

const checks = [];
const check = (name, pass, detail) => checks.push({ name, pass: !!pass, detail });

(async () => {
  const { chromium } = dependency('playwright');
  const browser = await chromium.launch(launchOptions);
  const origin = new URL(baseURL).origin;
  const open = async (width = 1280) => {
    const ctx = await browser.newContext({ viewport: { width, height: 820 } });
    const page = await ctx.newPage();
    const seen = [];
    page.on('request', (r) => seen.push(r.url()));
    return { ctx, page, seen };
  };

  // 1. A used or expired mailed link: the reason is said, a new link can be asked for.
  {
    const { ctx, page } = await open();
    const hash = '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired';
    await page.goto(baseURL + '/' + hash, { waitUntil: 'networkidle' });
    const h1 = await page.locator('h1').innerText();
    check('an expired link shows its own screen', h1 === 'انتهت صلاحية الرابط', h1);
    const buttons = await page.locator('.auth-form button').allInnerTexts();
    check('it offers a new reset link and a new confirmation link', buttons.includes('أرسل رابط تعيين كلمة مرور جديد') && buttons.includes('أرسل رابط التأكيد من جديد'), JSON.stringify(buttons));
    check('the address is cleaned of the error', !(await page.evaluate(() => location.hash)), await page.evaluate(() => location.href));
    check('the sign-in tabs are hidden on that screen', (await page.locator('.auth-tabs').count()) === 0, 'tabs');
    await page.getByRole('button', { name: 'العودة إلى تسجيل الدخول' }).click();
    check('and it returns to sign-in', (await page.locator('h1').innerText()) === 'تسجيل الدخول', 'back');
    await ctx.close();
  }

  // 2. The same on a phone, no sideways scroll.
  {
    const { ctx, page } = await open(390);
    await page.goto(baseURL + '/#error=access_denied&error_code=otp_expired', { waitUntil: 'networkidle' });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    check('390 px expired screen has no sideways scroll', !overflow, String(overflow));
    await ctx.close();
  }

  // 3. A plain visit is the normal sign-in, and a hash with no error changes nothing.
  {
    const { ctx, page, seen } = await open();
    await page.goto(baseURL + '/', { waitUntil: 'networkidle' });
    check('a plain visit shows sign-in', (await page.locator('h1').innerText()) === 'تسجيل الدخول', 'h1');
    await page.getByRole('button', { name: 'أول دخول', exact: true }).click();
    check('the first-time screen no longer needs an approval lookup', !seen.some((u) => u.includes('email_status')), 'no email_status call on load');
    const text = await page.locator('.auth-form').innerText();
    check('and it still explains itself', text.includes('رابط تأكيد'), text.slice(0, 80));
    await ctx.close();
  }

  // 4. The routes, without a session and without side effects.
  {
    // Node's fetch will not send an Origin header, so the browser's own request client is used.
    const ctx = await browser.newContext();
    const post = (p, body, headers = {}) => ctx.request.post(origin + p, { data: body, headers, failOnStatusCode: false });
    const a = await post('/api/entry/invite', { email: 'x@example.com' }, { Origin: origin });
    check('invite without a session is refused', a.status() === 401, String(a.status()));
    const b = await post('/api/entry/invite', { email: 'x@example.com' }, { Origin: 'https://evil.example' });
    check('invite from another origin is refused', b.status() === 403, String(b.status()));
    const c = await post('/api/entry/request', { email: 'not-an-address', name: 'X' }, { Origin: origin });
    check('request with a bad address is refused', c.status() === 400, String(c.status()));
    const d = await post('/api/entry/request', { email: 'x@example.com', name: '' }, { Origin: origin });
    check('request with no name is refused', d.status() === 400, String(d.status()));
    const e = await post('/api/entry/request', { email: 'x@example.com', name: 'X' }, { Origin: 'https://evil.example' });
    check('request from another origin is refused', e.status() === 403, String(e.status()));
    await ctx.close();
  }

  await browser.close();
  const failed = checks.filter((c) => !c.pass);
  const out = { script: 'qa/entry-gate.cjs', ran: new Date().toISOString().slice(0, 10), base: baseURL, total: checks.length, passed: checks.length - failed.length, failed: failed.length, checks };
  fs.writeFileSync(path.join(__dirname, 'entry-gate.json'), JSON.stringify(out, null, 2));
  console.log(`${out.passed} of ${out.total} passed`);
  for (const f of failed) console.log('FAIL', f.name, f.detail);
  process.exit(failed.length ? 1 : 0);
})();

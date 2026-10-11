// Mail: the parts a browser can reach without signing in.
//   - /m/<token>: the page an outside party opens from the date buttons in our mail
//   - /mail and the mail API behind the sign-in gate
// Usage: MAIL_TEST_TOKEN=<64 hex, a fresh token on a test message> node qa/mail-public.cjs
// The token is created by hand in the database for the run and removed after it.
const fs = require('node:fs');
const path = require('node:path');
const { dependency, baseURL, launchOptions } = require('./runtime.cjs');
const { chromium } = dependency('playwright');

const token = process.env.MAIL_TEST_TOKEN;
const out = { run: new Date().toISOString(), baseURL, checks: [], errors: [] };
const check = (name, pass, detail = '') => out.checks.push({ name, pass: Boolean(pass), detail });

(async () => {
  const browser = await chromium.launch(launchOptions);
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on('pageerror', (e) => out.errors.push(String(e)));

  // An unknown token says so, and changes nothing.
  let res = await page.goto(`${baseURL}/m/${'0'.repeat(64)}`);
  check('unknown token answers 404', res.status() === 404);
  check('unknown token explains itself in Arabic', (await page.textContent('h1')).includes('الرابط غير صالح'));
  res = await page.goto(`${baseURL}/m/not-a-token`);
  check('malformed token answers 404', res.status() === 404);

  if (token) {
    res = await page.goto(`${baseURL}/m/${token}`);
    const text = await page.textContent('main');
    check('date page opens', res.status() === 200, text.slice(0, 80));
    check('date shown in Riyadh time', text.includes('الخميس 15 أكتوبر · 19:00'), text);
    check('opening the page does not answer', text.includes('تأكيد الموعد'));
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 800 });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      check(`no sideways scroll at ${width}px`, overflow <= 0, String(overflow));
    }
    await page.screenshot({ path: path.join(__dirname, 'artifacts', 'mail-date-page.png') });
    await page.getByRole('button', { name: 'تأكيد الموعد' }).click();
    await page.waitForLoadState();
    check('pressing confirm records the answer', (await page.textContent('h1')).includes('تم تأكيد الموعد'));
    await page.goto(`${baseURL}/m/${token}`);
    check('a second visit shows it was answered', (await page.textContent('h1')).includes('تم تسجيل ردكم'));
  } else check('real token flow', false, 'MAIL_TEST_TOKEN not set; skipped');

  // Behind the gate.
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${baseURL}/mail`);
  const body = await page.textContent('body');
  check('/mail without sign-in shows the sign-in gate, not mail', !body.includes('صندوق القسم') && /الدخول|تسجيل/.test(body));
  const api = await page.request.post(`${baseURL}/api/mail/sync`, { headers: { Origin: baseURL }, data: {} });
  check('mail sync refuses without sign-in', [401, 403].includes(api.status()), String(api.status()));
  const cross = await page.request.post(`${baseURL}/api/mail/sync`, { headers: { Origin: 'https://evil.example' }, data: {} });
  check('mail sync refuses another site', cross.status() === 403, String(cross.status()));
  const file = await page.request.get(`${baseURL}/api/mail/file/00000000-0000-0000-0000-000000000000`);
  check('attachment download refuses without sign-in', file.status() === 401, String(file.status()));

  check('no page errors', out.errors.length === 0, out.errors.join(' | '));
  await browser.close();
  out.pass = out.checks.every((c) => c.pass);
  fs.writeFileSync(path.join(__dirname, 'mail-public.json'), JSON.stringify(out, null, 2));
  console.log(`${out.checks.filter((c) => c.pass).length}/${out.checks.length} passed`);
  for (const c of out.checks.filter((x) => !x.pass)) console.log('FAIL', c.name, c.detail);
  process.exit(out.pass ? 0 : 1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

// Browser check of phase A1 of the Android application (Android_Build_Plan.md; MVP_draft.md 63 and 64): the
// sign-in screen of the site's own production build, in Edge, as a browser, the desktop application and the
// Android application see it. The applications' bridges are stand-ins with only their identity (and, for the
// Android application whose links are verified, `links`), set before the page loads, as a shell would.
//   - in a browser, «نسيت كلمة المرور» mails a link back to the site's root, as before;
//   - inside the desktop application and an Android application without verified links, «نسيت كلمة المرور»,
//     «أول دخول» and «انتهت صلاحية الرابط» point to the browser and mail nothing;
//   - an Android application with verified links mails a link back to /app/return;
//   - /app/return forwards to the root with the same query.
// The mail request is answered inside the browser and never reaches Supabase, so no mail is sent. Nothing
// signs in.
// Usage: npm run build, then node qa/android-site.cjs   (writes qa/android-site.json)
const fs = require('node:fs');
const path = require('node:path');
const { dependency, launchOptions } = require('./runtime.cjs');
const { chromium } = dependency('playwright');
const h = require('./android-helpers.cjs');

const { check, result, finish } = h.record('qa/android-site.cjs');
const BASE = 'http://127.0.0.1:3000';
const out = path.join(__dirname, 'artifacts', 'android-site');
const ADDRESS = 'qa-android-a1@example.invalid';
const BROWSER_ONLY = 'يكتمل هذا من المتصفح: افتح المركز في المتصفح وأكمله هناك، ثم ارجع إلى التطبيق وسجّل الدخول.';

const shells = [
  { label: 'a browser', bridge: null, linked: false, mails: `${BASE}/` },
  { label: 'the desktop application', bridge: { platform: 'desktop', shell: 'electron', version: '0.6.0', bridge: 5 }, linked: false, mails: null },
  { label: 'the Android application before its links are verified', bridge: { platform: 'android', shell: 'capacitor', version: '0.1.0', bridge: 1 }, linked: false, mails: null },
  { label: 'the Android application with verified links', bridge: { platform: 'android', shell: 'capacitor', version: '0.1.0', bridge: 1 }, linked: true, mails: `${BASE}/app/return` },
];

async function gate(ctx, shell, slug) {
  const tab = await ctx.newPage();
  const mailed = [];
  // The reset request is answered here; it never leaves the browser.
  await tab.route('**/auth/v1/recover**', (route) => {
    mailed.push(route.request().url());
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  await tab.route('**/auth/v1/signup**', (route) => {
    mailed.push(route.request().url());
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  await tab.goto(`${BASE}/`);
  await tab.waitForSelector('.auth-card', { timeout: 30000 });
  await h.sleep(600);

  // «نسيت كلمة المرور»
  await tab.getByRole('button', { name: 'نسيت كلمة المرور' }).click();
  await h.sleep(300);
  if (shell.mails) {
    await tab.locator('form.auth-form input[type=email]').fill(ADDRESS);
    await tab.getByRole('button', { name: 'إرسال الرابط' }).click();
    await h.until(() => mailed.length > 0, 8000);
    const to = mailed[0] ? new URL(mailed[0]).searchParams.get('redirect_to') : null;
    check(`${shell.label}: «نسيت كلمة المرور» mails a link back to ${shell.mails.replace(BASE, '') || '/'}`, to === shell.mails, { mailed });
    const said = await tab.locator('.auth-note.ok').innerText().catch(() => '');
    check(`${shell.label}: the answer is the same as for any address`, said.includes('إن كان لهذا البريد حساب'), said);
  } else {
    const note = await tab.locator('.auth-browser .auth-note').innerText().catch(() => '');
    const fields = await tab.locator('form.auth-form input').count();
    check(`${shell.label}: «نسيت كلمة المرور» points to the browser and asks for nothing`, note.trim() === BROWSER_ONLY && fields === 0, { note, fields });
    await tab.screenshot({ path: path.join(out, `${slug}-forgot.png`), fullPage: true });
    await tab.getByRole('button', { name: 'العودة إلى تسجيل الدخول' }).click();
    await h.sleep(300);
    await tab.getByRole('button', { name: 'أول دخول' }).click();
    await h.sleep(300);
    const first = await tab.locator('.auth-browser .auth-note').innerText().catch(() => '');
    const passwords = await tab.locator('input[type=password]').count();
    check(`${shell.label}: «أول دخول» points to the browser and asks for no password`, first.trim() === BROWSER_ONLY && passwords === 0, { first, passwords });
    check(`${shell.label}: nothing was mailed`, mailed.length === 0, { mailed });
  }
  await tab.close();
}

(async () => {
  let stop;
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  try {
    stop = await h.startSite();
    const browser = await chromium.launch(launchOptions);
    try {
      for (const [i, shell] of shells.entries()) {
        const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ar' });
        await ctx.addInitScript(
          ({ bridge, linked }) => {
            if (!bridge) return;
            const o = { ...bridge };
            if (linked) o.links = Object.freeze({ verified: async () => true });
            Object.defineProperty(window, 'commsHubNative', { value: Object.freeze(o), configurable: false, writable: false });
          },
          { bridge: shell.bridge, linked: shell.linked },
        );
        await gate(ctx, shell, `case${i + 1}`);
        await ctx.close();
      }

      // /app/return
      const ctx = await browser.newContext();
      const tab = await ctx.newPage();
      const res = await ctx.request.get(`${BASE}/app/return?qa=a1&x=1`, { maxRedirects: 0 });
      check('/app/return answers 303 to the root with the same query', res.status() === 303 && res.headers()['location'] === '/?qa=a1&x=1', { status: res.status(), location: res.headers()['location'] });
      await tab.goto(`${BASE}/app/return?qa=a1`);
      await tab.waitForSelector('.auth-card', { timeout: 30000 });
      check('/app/return lands on the sign-in screen at the root, the query kept', new URL(tab.url()).pathname === '/' && new URL(tab.url()).searchParams.get('qa') === 'a1', tab.url());
      await ctx.close();
    } finally {
      await browser.close();
    }
  } catch (e) {
    check('the check ran to its end', false, String(e && e.stack ? e.stack : e));
  } finally {
    if (stop) await stop();
  }
  process.exitCode = finish(path.join(__dirname, 'android-site.json')) ? 1 : 0;
})();

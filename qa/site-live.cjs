// A look at the live site after a deployment, signed out, in Edge: the sign-in page really runs under the
// Content-Security-Policy, the public pages answer, a page behind sign-in stays behind it, and a phone width holds.
// It signs in to nothing and changes nothing.
// Usage: node qa/site-live.cjs [address]   (writes qa/site-live.json; the screenshot goes to qa/artifacts/)
const path = require('node:path');
const fs = require('node:fs');
const { dependency, launchOptions } = require('./runtime.cjs');
const { chromium } = dependency('playwright');
const h = require('./android-helpers.cjs');

const { check, finish } = h.record('qa/site-live.cjs');
const site = (process.argv[2] ?? 'https://comms-hub-three.vercel.app').replace(/\/$/, '');

(async () => {
  const browser = await chromium.launch(launchOptions);
  try {
    const r = await fetch(`${site}/`, { redirect: 'manual' });
    const csp = r.headers.get('content-security-policy') ?? '';
    // 'wasm-unsafe-eval' stays allowed on purpose (src/lib/csp.ts); only the full 'unsafe-eval' would be a fault.
    check('the page carries the Content-Security-Policy, with a nonce and no unsafe-eval', /script-src[^;]*'nonce-/.test(csp) && !csp.includes("'unsafe-eval'"), csp.slice(0, 120));
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const tab = await ctx.newPage();
    const bad = [];
    tab.on('pageerror', (e) => bad.push(String(e)));
    tab.on('console', (m) => (m.type() === 'error' || /Content Security Policy/.test(m.text())) && !/favicon/.test(m.text()) && bad.push(m.text()));
    await tab.goto(`${site}/`);
    await tab.waitForLoadState('networkidle');
    const form = await tab.evaluate(() => ({ email: !!document.querySelector('input[type=email]'), password: !!document.querySelector('input[type=password]'), dir: document.documentElement.dir, title: document.title, hydrated: !!document.querySelector('form') }));
    check('the sign-in page draws, right to left, with its form', form.email && form.password && form.dir === 'rtl', form);
    await tab.locator('input[type=email]').first().fill('someone@example.test');
    check('the form takes typing, so the page\'s scripts ran under the policy', (await tab.locator('input[type=email]').first().inputValue()) === 'someone@example.test');
    check('no page error and nothing refused by the policy', bad.length === 0, bad.slice(0, 4));
    fs.mkdirSync(path.join(__dirname, 'artifacts'), { recursive: true });
    await tab.screenshot({ path: path.join(__dirname, 'artifacts', 'site-live.png') });
    for (const url of ['/privacy.html', '/account-deletion.html', '/health']) {
      const res = await fetch(`${site}${url}`, { redirect: 'manual' });
      check(`${url} answers`, res.status === 200, res.status);
    }
    const activity = await ctx.newPage();
    await activity.goto(`${site}/activity`);
    await activity.waitForLoadState('networkidle');
    check('«سجل النشاط» stays behind sign-in', !!(await activity.locator('input[type=password]').count()) && !(await activity.locator('.mx-lr').count()));
    await ctx.close();
    const phone = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
    await phone.goto(`${site}/`);
    await phone.waitForLoadState('networkidle');
    check('a phone width has no sideways scroll', await phone.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  } catch (e) {
    check('the check ran to its end', false, String(e && e.stack ? e.stack : e));
  } finally {
    await browser.close();
  }
  process.exitCode = finish(path.join(__dirname, 'site-live.json')) ? 1 : 0;
})();

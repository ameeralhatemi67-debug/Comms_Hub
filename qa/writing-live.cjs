// Looks at the live site after a deployment of «ورقة الكتابة» (MVP_draft.md section 68), signed out, as nothing signed in can be
// driven from here. Every route of the writing documents must refuse a stranger, the styles and the public pages must be out,
// and the sign-in page must load cleanly under the site's policy.
// Usage: QA_BASE_URL=https://comms-hub-three.vercel.app node qa/writing-live.cjs   (writes qa/writing-live.json)
const path = require('node:path');
const { dependency, launchOptions } = require('./runtime.cjs');
const { chromium } = dependency('playwright');
const h = require('./android-helpers.cjs');

const { check, finish } = h.record('qa/writing-live.cjs');
const base = process.env.QA_BASE_URL;
if (!base) {
  console.error('QA_BASE_URL is required, so a check cannot pass on the wrong site.');
  process.exit(1);
}
const at = (p) => new URL(p, base).href;
// An origin the site accepts, so a refusal is about the session and not about where the request came from.
const post = (p, body, type = 'application/json') => fetch(at(p), { method: 'POST', redirect: 'manual', headers: { 'Content-Type': type, Origin: base }, body });

(async () => {
  const health = await fetch(at('/health'));
  check('the site answers', health.status === 200, health.status);

  const refused = (r) => [401, 403].includes(r.status) || (r.status >= 300 && r.status < 400);
  for (const [name, r] of [
    ['a version is not read', await fetch(at('/api/writing/CH-1/doc?n=1'), { redirect: 'manual' })],
    ['a draft is not read', await fetch(at('/api/writing/CH-1/draft'), { redirect: 'manual' })],
    ['a current file is not read', await fetch(at('/api/writing/CH-1/file?kind=txt'), { redirect: 'manual' })],
    ['a picture is not read', await fetch(at('/api/writing/CH-1/image/11111111-2222-4333-8444-555555555555'), { redirect: 'manual' })],
    ['a version is not saved', await post('/api/writing/CH-1/save', JSON.stringify({ doc: { type: 'doc', content: [] }, note: '' }))],
    ['a draft is not written', await fetch(at('/api/writing/CH-1/draft'), { method: 'PUT', redirect: 'manual', headers: { 'Content-Type': 'application/json', Origin: base }, body: '{"doc":{"type":"doc","content":[]}}' })],
    ['a Word file is not uploaded', await post('/api/writing/CH-1/export?n=1', 'PK', 'application/octet-stream')],
    ['a PDF is not made', await post('/api/writing/CH-1/pdf?n=1', '')],
  ]) {
    check(`signed out: ${name}`, refused(r), r.status);
  }

  const privacy = await (await fetch(at('/privacy.html'))).text();
  check('the privacy page says texts are kept in Drive', privacy.includes('ورقة الكتابة') && privacy.includes('texts they write'));
  const deletion = await (await fetch(at('/account-deletion.html'))).text();
  check('the deletion page lists ideas and drafts', deletion.includes('أفكارك التي لم تصر أعمالاً') && deletion.includes('آخر مسودة لك'));

  const browser = await chromium.launch(launchOptions);
  try {
    const page = await (await browser.newContext({ viewport: { width: 1366, height: 860 } })).newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(String(e)));
    page.on('console', (m) => m.type() === 'error' && !/favicon|401|403/.test(m.text()) && errs.push(m.text()));
    const res = await page.goto(at('/work?tab=write'));
    await page.waitForTimeout(1500);
    const text = await page.evaluate(() => document.body.innerText);
    check('«العمل» stays behind the sign-in', text.includes('تسجيل الدخول') && !text.includes('عاد إليك'), res.status());
    check('every page carries the policy', (res.headers()['content-security-policy'] ?? '').includes("script-src 'self' 'nonce-"));
    const css = await page.evaluate(async () => {
      const out = [];
      for (const l of document.querySelectorAll('link[rel="stylesheet"]')) out.push(await (await fetch(l.href)).text());
      return out.join('\n');
    });
    check('the sheet\'s styles are out', css.includes('.wr-paper-in') && css.includes('.wr-grip') && css.includes('.wk-resume'));
    check('the site\'s minimum button height no longer reaches the tools', /\.wr-ribbon button[^{]*\{[^}]*min-height:0/.test(css));
    check('nothing failed in the page', errs.length === 0, errs.slice(0, 2).join(' | ').slice(0, 300));
  } finally {
    await browser.close();
  }
  process.exit(finish(path.join(__dirname, 'writing-live.json')) ? 1 : 0);
})().catch((e) => {
  console.error('CRASH', e);
  process.exit(1);
});

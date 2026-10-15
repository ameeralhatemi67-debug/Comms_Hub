// Signed-out check of the storage routes (Settings Step S2): the new check route refuses
// a visitor and a request from another site, and the routes that serve files through the
// role map still refuse a visitor the way they did. The signed-in screens (the storage tab,
// the storage line of a library file) are drawn from fixtures by qa/permissions-pages.cjs.
//
//   npm run build && npx next start --hostname 127.0.0.1 --port 3100
//   QA_BASE_URL=http://localhost:3100 node qa/storage-gate.cjs
//
// Nothing is written to the database or to Drive. Results go to qa/storage-gate.json.
const fs = require('node:fs');
const path = require('node:path');
const { dependency, baseURL, launchOptions } = require('./runtime.cjs');

const checks = [];
const check = (name, pass, detail) => checks.push({ name, pass: !!pass, detail: String(detail) });

(async () => {
  const { chromium } = dependency('playwright');
  const browser = await chromium.launch(launchOptions);
  const origin = new URL(baseURL).origin;
  const ctx = await browser.newContext();
  const post = (p, headers = {}) => ctx.request.post(origin + p, { data: {}, headers, failOnStatusCode: false });
  const get = (p) => ctx.request.get(origin + p, { failOnStatusCode: false });

  const a = await post('/api/storage/verify', { Origin: origin });
  check('the check route refuses a visitor', a.status() === 401, a.status());
  const b = await post('/api/storage/verify', { Origin: 'https://evil.example' });
  check('and a request from another site', b.status() === 403, b.status());

  const random = '00000000-0000-4000-8000-000000000001';
  for (const [name, p] of [
    ['a library file', `/api/media/${random}/content`],
    ['a mail attachment', `/api/mail/file/${random}`],
    ['a messaging file', `/api/chat/file/${random}`],
  ]) {
    const r = await get(p);
    check(`${name} is refused to a visitor, not a server error`, r.status() === 401 || r.status() === 403 || r.status() === 404, r.status());
  }
  const link = await get('/r/not-a-real-token');
  check('a review link with no such token is a plain refusal, not a server error', link.status() < 500, link.status());

  const upload = await post('/api/media/upload-session', { Origin: origin });
  check('starting an upload as a visitor is refused', upload.status() === 401, upload.status());
  const moved = await post('/api/media/move', { Origin: origin });
  check('moving files as a visitor is refused', moved.status() === 401, moved.status());

  // Settings Step S3: the move engine and the second provider's routes.
  for (const action of ['plan', 'start', 'run', 'cancel', 'retire']) {
    const m = await ctx.request.post(origin + '/api/storage/move', { data: { action, id: random }, headers: { Origin: origin }, failOnStatusCode: false });
    check(`the move route refuses a visitor (${action})`, m.status() === 401, m.status());
  }
  const mf = await ctx.request.post(origin + '/api/storage/move', { data: { action: 'run', id: random }, headers: { Origin: 'https://evil.example' }, failOnStatusCode: false });
  check('and a move request from another site', mf.status() === 403, mf.status());
  for (const action of ['save', 'check', 'remove']) {
    const r = await ctx.request.post(origin + '/api/storage/provider', { data: { action, id: random }, headers: { Origin: origin }, failOnStatusCode: false });
    check(`the provider route refuses a visitor (${action})`, r.status() === 401, r.status());
  }
  const pf = await ctx.request.post(origin + '/api/storage/provider', { data: { action: 'save' }, headers: { Origin: 'https://evil.example' }, failOnStatusCode: false });
  check('and a provider request from another site', pf.status() === 403, pf.status());
  const g1 = await get('/api/storage/move');
  check('the move route has no GET', g1.status() === 405 || g1.status() === 404, g1.status());

  // Settings Step S4: the backup routes.
  for (const route of ['export', 'run', 'verify']) {
    const b = await ctx.request.post(origin + '/api/backups/' + route, { data: { kind: 'database', run: random }, headers: { Origin: origin }, failOnStatusCode: false });
    check(`the backup route refuses a visitor (${route})`, b.status() === 401, b.status());
    const bf = await ctx.request.post(origin + '/api/backups/' + route, { data: {}, headers: { Origin: 'https://evil.example' }, failOnStatusCode: false });
    check(`and a request from another site (${route})`, bf.status() === 403, bf.status());
  }

  const page = await ctx.newPage();
  await page.goto(baseURL + '/settings?tab=storage', { waitUntil: 'networkidle' });
  const h1 = await page.locator('h1').innerText();
  check('the storage tab is not shown to a visitor', h1 === 'تسجيل الدخول', h1);
  const text = await page.locator('body').innerText();
  check('and no storage text leaks into the sign-in screen', !/مزودو التخزين|Google Drive|تحقق من عينة/.test(text), text.slice(0, 60));

  await browser.close();
  const failed = checks.filter((c) => !c.pass);
  const out = { script: 'qa/storage-gate.cjs', ran: new Date().toISOString().slice(0, 10), base: baseURL, total: checks.length, passed: checks.length - failed.length, failed: failed.length, checks };
  fs.writeFileSync(path.join(__dirname, 'storage-gate.json'), JSON.stringify(out, null, 2));
  console.log(`${out.passed} of ${out.total} passed`);
  for (const f of failed) console.log('FAIL', f.name, f.detail);
  process.exit(failed.length ? 1 : 0);
})();

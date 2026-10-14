// Signed-out check of the platform registry (Settings Step S5), against the real project with
// its public key only, as any visitor of the site has: the registry is not readable without a
// sign-in, none of its functions can be called, and the settings page shows only the sign-in
// screen. Nothing is written. The signed-in screens are drawn from fixtures by
// qa/permissions-pages.cjs and qa/work-pages.cjs.
//
//   npm run build && npx next start --hostname 127.0.0.1 --port 3100
//   QA_BASE_URL=http://localhost:3100 node qa/platform-gate.cjs
//
// Results go to qa/platform-gate.json.
const fs = require('node:fs');
const path = require('node:path');
const { dependency, baseURL, launchOptions } = require('./runtime.cjs');

const env = Object.fromEntries(
  fs
    .readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8')
    .split(/\r?\n/)
    .map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^["']|["']$/g, '')]),
);
const checks = [];
const check = (name, pass, detail) => checks.push({ name, pass: !!pass, detail: String(detail) });

(async () => {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

  const table = await fetch(`${url}/rest/v1/platforms?select=key`, { headers });
  const rows = await table.json().catch(() => null);
  check('the registry is not readable without a sign-in', table.status === 401 || (Array.isArray(rows) && rows.length === 0), `${table.status} ${JSON.stringify(rows).slice(0, 60)}`);
  const events = await fetch(`${url}/rest/v1/platform_events?select=id`, { headers });
  const erows = await events.json().catch(() => null);
  check('nor its log', events.status === 401 || (Array.isArray(erows) && erows.length === 0), `${events.status}`);
  for (const [fn, body] of [
    ['platform_save', { p_key: 'zz', p: { label_ar: 'ز' } }],
    ['platform_set_enabled', { p_key: 'x', p_on: false }],
    ['platform_set_readiness', { p_key: 'x', p_state: 'live', p_note: null }],
    ['platform_delete', { p_key: 'zz' }],
    ['platform_impact', { p_key: 'x' }],
    ['platform_log', { p_key: 'x', p_limit: 5 }],
  ]) {
    const r = await fetch(`${url}/rest/v1/rpc/${fn}`, { method: 'POST', headers, body: JSON.stringify(body) });
    check(`${fn} cannot be called without a sign-in`, r.status === 401 || r.status === 403 || r.status === 404, r.status);
  }
  const after = await fetch(`${url}/rest/v1/rpc/work_youtube_ok`, { method: 'POST', headers, body: JSON.stringify({ p_type: 'post', p_channels: [], p_assets: [] }) });
  check('the internal video-only rule is not callable either', [401, 403, 404].includes(after.status), after.status);

  const { chromium } = dependency('playwright');
  const browser = await chromium.launch(launchOptions);
  const page = await (await browser.newContext()).newPage();
  await page.goto(baseURL + '/settings?tab=platforms', { waitUntil: 'networkidle' });
  const h1 = await page.locator('h1').innerText();
  check('the platforms tab is not shown to a visitor', h1 === 'تسجيل الدخول', h1);
  const text = await page.locator('body').innerText();
  check('and no registry text leaks into the sign-in screen', !/التجهيز|إضافة منصة|إنستغرام|يوتيوب/.test(text), text.slice(0, 60));
  await browser.close();

  const failed = checks.filter((c) => !c.pass);
  const out = { script: 'qa/platform-gate.cjs', ran: new Date().toISOString().slice(0, 10), base: baseURL, total: checks.length, passed: checks.length - failed.length, failed: failed.length, checks };
  fs.writeFileSync(path.join(__dirname, 'platform-gate.json'), JSON.stringify(out, null, 2));
  console.log(`${out.passed} of ${out.total} passed`);
  for (const f of failed) console.log('FAIL', f.name, f.detail);
  process.exit(failed.length ? 1 : 0);
})();

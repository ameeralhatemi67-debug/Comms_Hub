// Live check of the WhatsApp routes (Permissions_Plan.md 8, Step P5a) against the built site.
//
//   npm run build
//   node qa/whatsapp-routes.cjs        (writes qa/whatsapp-routes.json, screenshots in qa/artifacts/whatsapp/)
//
// It starts `next start` on port 3199 with WHATSAPP_SERVER_KEY and WHATSAPP_LINK_SECRET set to
// random values made in memory for this run; they are never written anywhere and their hash
// is not in the database, so the database must refuse them. Signed-out only: the agent cannot
// sign in (no bypass exists), so the member's and the administrator's screens are in the
// owner walkthrough. Nothing is written to the database: the one database call that runs
// (wa_claim with an unknown key) is refused before it touches anything.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { dependency, launchOptions } = require('./runtime.cjs');
const { chromium } = dependency('playwright');

const root = path.resolve(__dirname, '..');
const out = path.join(__dirname, 'artifacts', 'whatsapp');
fs.mkdirSync(out, { recursive: true });
const PORT = 3199;
const base = `http://127.0.0.1:${PORT}`;
const KEY = crypto.randomBytes(32).toString('hex');
const SECRET = crypto.randomBytes(32).toString('hex');
const result = { run: new Date().toISOString(), checks: [], errors: [] };
const check = (name, pass, detail = '') => result.checks.push({ name, pass: Boolean(pass), detail: String(detail).slice(0, 300) });

// The same signing as src/lib/whatsapp/server.ts (signLink).
const sign = (p) => {
  const body = Buffer.from(JSON.stringify(p)).toString('base64url');
  return `${body}.${crypto.createHmac('sha256', SECRET).update(body).digest().toString('base64url')}`;
};
const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

async function waitUp() {
  for (let i = 0; i < 120; i++) {
    try {
      const r = await fetch(`${base}/health`);
      if (r.status < 500) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

(async () => {
  const server = spawn(process.execPath, [path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next'), 'start', '--hostname', '127.0.0.1', '--port', String(PORT)], {
    cwd: root,
    env: { ...process.env, WHATSAPP_SERVER_KEY: KEY, WHATSAPP_LINK_SECRET: SECRET, MAIL_SITE_URL: base },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  server.stdout.on('data', (d) => (log += d));
  server.stderr.on('data', (d) => (log += d));
  const browser = await chromium.launch(launchOptions);
  try {
    check('the built site starts', await waitUp(), log.slice(-300));
    const post = (p, body, headers = {}) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body), redirect: 'manual' });

    // The dispatch route: only the key opens it, and the database checks the key again.
    let r = await post('/api/whatsapp/dispatch', { claim: 5 });
    check('dispatch: no key, refused (401)', r.status === 401, r.status);
    r = await post('/api/whatsapp/dispatch', { claim: 5 }, { Authorization: `Bearer ${crypto.randomBytes(32).toString('hex')}` });
    check('dispatch: a wrong key, refused (401)', r.status === 401, r.status);
    r = await post('/api/whatsapp/dispatch', { claim: 0 }, { Authorization: `Bearer ${KEY}` });
    const j0 = await r.json().catch(() => null);
    check('dispatch: the right key, nothing claimed, answers with no items', r.status === 200 && Array.isArray(j0?.items) && j0.items.length === 0, `${r.status} ${JSON.stringify(j0)}`);
    r = await post('/api/whatsapp/dispatch', { claim: 5 }, { Authorization: `Bearer ${KEY}` });
    const j1 = await r.json().catch(() => null);
    check('dispatch: the database refuses a key whose hash it does not hold, so nothing is claimed', r.status === 502 && !j1?.items, `${r.status} ${JSON.stringify(j1)}`);
    r = await post('/api/whatsapp/dispatch', { reports: [{ id: 'not-a-uuid', ok: true }], claim: 0, to: '+99900000001' }, { Authorization: `Bearer ${KEY}` });
    const j2 = await r.json().catch(() => null);
    check('dispatch: a destination in the request is ignored; malformed reports are skipped', r.status === 200 && JSON.stringify(j2) === '{"items":[]}', JSON.stringify(j2));
    r = await fetch(base + '/api/whatsapp/dispatch', { method: 'GET' });
    check('dispatch: GET is not a door', r.status === 405, r.status);

    // The code route: signed-in members only; from the site only.
    r = await post('/api/whatsapp/code', { phone: '+99900000001' });
    check('code: from outside the site, refused (403)', r.status === 403, r.status);
    // The server names itself localhost, so that is its origin.
    r = await post('/api/whatsapp/code', { phone: '+99900000001' }, { Origin: `http://localhost:${PORT}` });
    const jc = await r.json().catch(() => null);
    check('code: signed out, refused (401) with the Arabic reason', r.status === 401 && jc?.error === 'سجّل الدخول أولاً.', `${r.status} ${JSON.stringify(jc)}`);

    // The link route.
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const good = sign({ o: U(1), r: 'wri@x.sa', m: U(2), g: U(3), e: exp });
    r = await fetch(`${base}/w/${good}`, { redirect: 'manual' });
    const loc = r.headers.get('location') ?? '';
    check('link: a valid token opens that room at that message (303)', r.status === 303 && loc === `/mail/chat?room=${U(3)}&msg=${U(2)}`, `${r.status} ${loc}`);
    check('link: no referrer is passed on', r.headers.get('referrer-policy') === 'no-referrer');
    r = await fetch(`${base}/w/${sign({ o: U(1), r: 'wri@x.sa', m: U(2), g: U(3), e: Math.floor(Date.now() / 1000) - 10 })}`, { redirect: 'manual' });
    check('link: an expired token is refused (404)', r.status === 404, r.status);
    const [b, s] = good.split('.');
    const forged = Buffer.from(JSON.stringify({ o: U(1), r: 'wri@x.sa', m: U(2), g: U(9), e: exp })).toString('base64url');
    r = await fetch(`${base}/w/${forged}.${s}`, { redirect: 'manual' });
    check('link: another room under the old signature is refused (404)', r.status === 404, r.status);
    r = await fetch(`${base}/w/${b}.AAAA`, { redirect: 'manual' });
    check('link: a wrong signature is refused (404)', r.status === 404, r.status);

    // The refusal page, in a real browser, at desktop and phone width.
    for (const [w, h] of [[1280, 800], [390, 844]]) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h } });
      const p = await ctx.newPage();
      const errs = [];
      p.on('pageerror', (e) => errs.push(e.message));
      await p.goto(`${base}/w/not-a-token`);
      const text = await p.evaluate(() => document.body.innerText);
      check(`link page ${w}: says the link is not valid, in Arabic, and offers «المراسلة»`, text.includes('الرابط غير صالح أو انتهت صلاحيته') && text.includes('فتح المراسلة'), text.slice(0, 120));
      check(`link page ${w}: right to left`, (await p.evaluate(() => document.documentElement.dir)) === 'rtl');
      check(`link page ${w}: no sideways scroll`, (await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 1);
      check(`link page ${w}: no page errors`, !errs.length, errs.join(' | '));
      check(`link page ${w}: no emoji`, !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(text));
      await p.screenshot({ path: path.join(out, `link-refused.${w}.png`), fullPage: true });
      await ctx.close();
    }
    check('the server logged no route error', !/Error|error:/.test(log.replace(/favicon/g, '')), log.match(/.*(Error|error:).*/)?.[0] ?? '');
  } catch (e) {
    result.errors.push(String(e && e.stack));
  } finally {
    await browser.close();
    server.kill();
  }
  const failed = result.checks.filter((c) => !c.pass);
  result.summary = { total: result.checks.length, passed: result.checks.length - failed.length, failed: failed.length };
  fs.writeFileSync(path.join(__dirname, 'whatsapp-routes.json'), JSON.stringify(result, null, 2));
  console.log(`${result.summary.passed} of ${result.summary.total} passed`);
  for (const f of failed) console.log('FAIL', f.name, f.detail);
  for (const e of result.errors) console.log('ERROR', e);
  process.exit(failed.length || result.errors.length ? 1 : 0);
})();

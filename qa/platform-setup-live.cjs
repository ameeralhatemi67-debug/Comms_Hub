// A look at «المنصات» and «حسابات المنصات» on the live site after a deployment (MVP_draft.md section 67), signed out, with
// comms-hub's public key only: the styles and the patched framework are what the page really runs, and the database pieces
// of the migration answer nobody signed out. It signs in to nothing. Everything it tries is refused, so nothing is written.
// Usage: node qa/platform-setup-live.cjs [address]   (writes qa/platform-setup-live.json)
const fs = require('node:fs');
const path = require('node:path');
const { dependency, launchOptions } = require('./runtime.cjs');
const { chromium } = dependency('playwright');
const h = require('./android-helpers.cjs');

const { check, finish } = h.record('qa/platform-setup-live.cjs');
const site = (process.argv[2] ?? 'https://comms-hub-three.vercel.app').replace(/\/$/, '');
const env = Object.fromEntries(
  fs
    .readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8')
    .split(/\r?\n/)
    .map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^["']|["']$/g, '')]),
);

(async () => {
  const browser = await chromium.launch(launchOptions);
  try {
    const tab = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
    await tab.goto(`${site}/`);
    await tab.waitForLoadState('networkidle');
    const seen = await tab.evaluate(() => ({ version: window.next?.version ?? '', sheets: [...document.querySelectorAll('link[rel=stylesheet]')].map((l) => l.href) }));
    check('the page really runs next 16.4.3', seen.version === '16.4.3', seen.version);
    const css = (await Promise.all(seen.sheets.map((u) => fetch(u).then((r) => r.text())))).join('\n');
    check('the styles of both pages are out', css.includes('.pf-body') && css.includes('.ac-row'), `${css.length} bytes`);
    check('and the old ones are gone', !/\.(st-plat|wk-acccard)(?![-\w])/.test(css));

    await tab.goto(`${site}/channels`);
    await tab.waitForLoadState('networkidle');
    const page = await tab.evaluate(() => ({ password: !!document.querySelector('input[type=password]'), rows: document.querySelectorAll('.ac-row').length }));
    check('«حسابات المنصات» stays behind the sign-in', page.password && page.rows === 0, page);
    await tab.goto(`${site}/settings?tab=platforms`);
    await tab.waitForLoadState('networkidle');
    const set = await tab.evaluate(() => ({ password: !!document.querySelector('input[type=password]'), rows: document.querySelectorAll('.pf-row').length }));
    check('so does «المنصات»', set.password && set.rows === 0, set);

    const image = await fetch(`${site}/_next/image?url=%2Ficon.svg&w=64&q=75`);
    check('the image route does not serve an SVG', !(image.headers.get('content-type') ?? '').includes('svg'), `${image.status} ${image.headers.get('content-type')}`);

    const url = env.NEXT_PUBLIC_SUPABASE_URL;
    const key = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
    const rpc = async (name, body) => {
      const r = await fetch(`${url}/rest/v1/rpc/${name}`, { method: 'POST', headers, body: JSON.stringify(body) });
      return { status: r.status, code: (await r.json().catch(() => ({}))).code };
    };
    for (const [name, body] of [
      ['platform_ready', {}],
      ['platform_conn_manage', {}],
      ['platform_setup_save', { p_key: 'x', p_done: [], p_step: null, p_fields: {} }],
    ]) {
      const got = await rpc(name, body);
      check(`signed out, ${name} is refused, and it exists`, got.status === 401 && got.code === '42501', got);
    }
    const table = await fetch(`${url}/rest/v1/platform_setup?select=key`, { headers });
    check('signed out, nobody reads a setup', table.status === 401, table.status);
  } finally {
    await browser.close();
  }
  process.exit(finish(path.join(h.root, 'qa', 'platform-setup-live.json')) ? 1 : 0);
})();

// Browser and application check of the pages' Content-Security-Policy (src/lib/csp.ts, src/proxy.ts;
// Desktop_App_Plan.md 3 and 9, required before phase D4 lets a page read files on the laptop). It serves the
// site's own production build (`next start`, after `npm run build`) at 127.0.0.1:3000 with no environment
// file, so every page is the signed-out gate; nothing signs in. In Edge and inside the development package:
//   - every page carries the policy, with a fresh nonce each time; every script Next.js wrote carries it,
//     and the one other inline script is the theme's, allowed by its hash;
//   - the page loads with no violation at all, and the theme script ran;
//   - an inline event handler slipped into the page does not run, and the browser reports it;
//   - an API route does not get the pages' policy;
//   - inside the application, the bridge is there and its own addresses (commshub-file:) are allowed.
// Usage: node qa/desktop-csp.cjs   (writes qa/desktop-csp.json)   Needs: npm run build, npm run pack:dev.
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { dependency, launchOptions } = require('./runtime.cjs');
const { chromium } = dependency('playwright');
const h = require('./desktop-helpers.cjs');

const { check, result, finish } = h.record('qa/desktop-csp.cjs');
const BASE = 'http://127.0.0.1:3000';

function scriptsOf(html) {
  return [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)].map((m) => ({ nonce: /\bnonce="([^"]*)"/.exec(m[1])?.[1] ?? null, src: /\bsrc="([^"]*)"/.exec(m[1])?.[1] ?? null, inline: m[2] }));
}

async function pageChecks(label, tab, restoreTheme, onLoaded = () => undefined) {
  const events = () => tab.evaluate(() => window.__violations || []);
  const res = await tab.goto(`${BASE}/`);
  const policy = res.headers()['content-security-policy'] || '';
  const nonce = /'nonce-([^']+)'/.exec(policy)?.[1] ?? null;
  await tab.waitForLoadState('load');
  await h.sleep(1500);
  const html = await res.text();
  const scripts = scriptsOf(html);
  const unmarked = scripts.filter((s) => s.nonce !== nonce && s.inline !== restoreTheme);
  check(`${label}: the page carries the policy, scripts only with the nonce or the theme script's hash, no inline script or eval`, !!nonce && /'strict-dynamic'/.test(policy) && /'sha256-[^']+'/.test(policy) && !/script-src[^;]*'unsafe-inline'/.test(policy) && !/script-src[^;]*'unsafe-eval'/.test(policy), policy);
  check(`${label}: every script Next.js wrote carries this request's nonce; the only other one is the theme's`, scripts.length > 0 && unmarked.length === 0 && scripts.some((s) => s.inline === restoreTheme), { scripts: scripts.length, unmarked: unmarked.map((s) => s.src || s.inline.slice(0, 60)) });
  const again = await tab.goto(`${BASE}/`);
  const nonce2 = /'nonce-([^']+)'/.exec(again.headers()['content-security-policy'] || '')?.[1] ?? null;
  check(`${label}: a fresh nonce on every request`, !!nonce2 && nonce2 !== nonce, { nonce, nonce2 });
  await tab.waitForLoadState('load');
  await h.sleep(1500);
  const state = await tab.evaluate(() => ({ theme: document.documentElement.getAttribute('data-theme'), text: document.body.innerText.trim().slice(0, 80), buttons: document.querySelectorAll('button, a').length }));
  const loadViolations = await events();
  check(`${label}: the page loads with no violation, renders, and the theme script ran`, loadViolations.length === 0 && state.theme === 'light' && state.text.length > 0, { violations: loadViolations, state });
  onLoaded();
  await tab.evaluate(() => {
    window.__pwned = 0;
    document.body.insertAdjacentHTML('beforeend', '<img id="slipped" src="data:," onerror="window.__pwned = 1">');
  });
  await h.sleep(800);
  const pwned = await tab.evaluate(() => window.__pwned);
  const blocked = (await events()).slice(loadViolations.length);
  check(`${label}: an inline event handler slipped into the page does not run, and the browser reports it`, pwned === 0 && blocked.some((v) => /^script-src/.test(v.directive)), { pwned, blocked });
  return { policy, scripts: scripts.length };
}

const watch = () => {
  window.__violations = [];
  document.addEventListener('securitypolicyviolation', (e) => window.__violations.push({ directive: e.violatedDirective, blocked: e.blockedURI, sample: e.sample }));
};

(async () => {
  let server;
  try {
    if (!fs.existsSync(path.join(h.root, '.next', 'BUILD_ID'))) throw new Error('npm run build first');
    if (await h.portAnswers(3000)) throw new Error('something already answers on 127.0.0.1:3000');
    const env = { ...process.env, NODE_ENV: 'production' };
    for (const k of Object.keys(env)) if (k.startsWith('NEXT_PUBLIC_SUPABASE') || k.startsWith('SUPABASE')) delete env[k];
    server = spawn(process.execPath, [path.join(h.root, 'node_modules', 'next', 'dist', 'bin', 'next'), 'start', '-p', '3000', '-H', '127.0.0.1'], { cwd: h.root, env, stdio: 'ignore' });
    const up = await h.until(() => h.portAnswers(3000), 60000, 500);
    if (!up) throw new Error('next start did not answer');
    const { RESTORE_THEME } = await import('../src/lib/csp.ts');
    result.restoreThemeLength = RESTORE_THEME.length;

    // Edge.
    const browser = await chromium.launch(launchOptions);
    try {
      const ctx = await browser.newContext();
      await ctx.addInitScript(watch);
      const tab = await ctx.newPage();
      const errors = [];
      tab.on('console', (m) => m.type() === 'error' && /Content Security Policy|Refused to/.test(m.text()) && errors.push(m.text()));
      let atLoad = [];
      result.edge = await pageChecks('Edge', tab, RESTORE_THEME, () => (atLoad = errors.slice()));
      const api = await ctx.request.get(`${BASE}/api/media/00000000-0000-4000-8000-000000000000/content?v=1`);
      const apiPolicy = api.headers()['content-security-policy'] || '';
      check('an API route does not get the pages\' policy (the file routes set their own)', !/'nonce-/.test(apiPolicy), { status: api.status(), apiPolicy });
      result.edgeConsole = errors;
      // the handler slipped in on purpose is reported there too; only the loading counts
      check('Edge: no policy message in the console while the pages load', atLoad.length === 0, atLoad);
    } finally {
      await browser.close();
    }

    // Inside the application (127.0.0.1:3000 is on a development build's list).
    const { app, win } = await h.launchDev('csp');
    await h.instrument(app);
    await win.addInitScript(watch);
    await h.until(() => win.url().startsWith(BASE), 20000);
    result.app = await pageChecks('in the application', win, RESTORE_THEME);
    await win.goto(`${BASE}/`);
    await win.waitForLoadState('load');
    const inApp = await win.evaluate(async () => {
      const token = 'A'.repeat(43);
      let status;
      try {
        status = (await fetch(`commshub-file://local/${token}`)).status;
      } catch (e) {
        status = `blocked: ${e.message}`;
      }
      return { bridge: typeof window.commsHubNative, version: window.commsHubNative?.bridge, status, violations: window.__violations.slice() };
    });
    check('in the application: the bridge is there, and its own address is allowed by the policy (answered 404 for an unknown token, not blocked)', inApp.bridge === 'object' && inApp.status === 404 && inApp.violations.length === 0, inApp);
  } catch (e) {
    check('the check ran to its end', false, String((e && e.stack) || e));
  } finally {
    await h.closeAll();
    server?.kill();
  }
  const failed = finish(path.join(__dirname, 'desktop-csp.json'));
  process.exit(failed ? 1 : 0);
})();

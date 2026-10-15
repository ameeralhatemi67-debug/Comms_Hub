// Browser check of Action_Plan.md step B1: the sidebar after «الإدارة» left the menu and «الحساب»
// moved to the name badge. The menu entries are read from src/components/shell.tsx, the styles are
// the real stylesheets, and the footer markup is the one the shell renders; the signed-in application
// cannot be driven by an agent, so the page around them is a fixture.
// Usage: node qa/menu-consolidation.cjs   (writes qa/menu-consolidation.json)
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { dependency, launchOptions } = require('./runtime.cjs');
const { chromium } = dependency('playwright');

const root = path.resolve(__dirname, '..');
const out = path.join(__dirname, 'artifacts', 'menu-consolidation');
const result = { script: 'qa/menu-consolidation.cjs', run: new Date().toISOString(), checks: [] };
const check = (name, pass, detail = '') => result.checks.push({ name, pass: Boolean(pass), detail: String(detail) });
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
for (const f of ['globals.css', 'identity.css', 'auth.css']) fs.copyFileSync(path.join(root, 'src/app', f), path.join(out, f));

const shell = fs.readFileSync(path.join(root, 'src/components/shell.tsx'), 'utf8');
const block = shell.slice(shell.indexOf('const nav = ['), shell.indexOf('] as const;'));
const nav = [...block.matchAll(/\['(\/[^']*)', '([^']+)'/g)].map((m) => ({ href: m[1], label: m[2] }));

const page = (identity, collapsed, onAccount) => `<!doctype html><html lang="ar" dir="rtl"${identity ? ' data-identity="emerald"' : ''}><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="globals.css"><link rel="stylesheet" href="identity.css"><link rel="stylesheet" href="auth.css"></head>
<body><div class="app-shell ${collapsed ? 'collapsed' : ''}"><aside class="sidebar"><a class="brand" href="/"><span class="brandmark"></span><span><b>مركز الاتصال</b><small>COMMUNICATION HUB</small></span></a>
<nav>${nav.map((n) => `<a class="nav-item" title="${n.label}" href="${n.href}"><svg viewBox="0 0 20 20"><rect width="18" height="18"/></svg><span>${n.label}</span></a>`).join('')}</nav>
<div class="sidebar-foot"><a href="/account" class="account-link ${onAccount ? 'active' : ''}" title="حسابك" aria-label="حسابك، Ameer"><span class="avatar">A</span><span class="who"><b>Ameer Alhatime</b><small>Admin</small></span></a>
<button class="sign-out" aria-label="تسجيل الخروج"><svg viewBox="0 0 20 20"><rect width="18" height="18"/></svg></button></div></aside>
<div class="workspace"><main id="main"><h1>صفحة</h1></main></div></div></body></html>`;
const pages = {
  'full.html': page(true, false, false),
  'full-active.html': page(true, false, true),
  'collapsed.html': page(true, true, false),
  'plain.html': page(false, false, false),
};

(async () => {
  const server = http.createServer((req, res) => {
    const name = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '');
    if (pages[name]) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(pages[name]);
    }
    const f = path.join(out, name);
    if (!f.startsWith(out) || !fs.existsSync(f)) {
      res.writeHead(404);
      return res.end();
    }
    res.writeHead(200, { 'Content-Type': 'text/css' });
    fs.createReadStream(f).pipe(res);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch(launchOptions);

  const labels = nav.map((n) => n.label);
  check('the menu has 17 entries', nav.length === 17, nav.length);
  for (const gone of ['الإدارة', 'الحساب', 'التحليلات']) check(`the menu does not list «${gone}»`, !labels.includes(gone));
  check('«حسابات المنصات» is in the menu', labels.includes('حسابات المنصات'));
  check('«الحسابات المرتبطة» is not', !labels.includes('الحسابات المرتبطة'));

  const probe = async (file, width, tag) => {
    const ctx = await browser.newContext({ viewport: { width, height: 900 } });
    const p = await ctx.newPage();
    await p.goto(base + file);
    const r = await p.evaluate(() => {
      const box = (s) => {
        const e = document.querySelector(s);
        if (!e) return null;
        const b = e.getBoundingClientRect();
        const cs = getComputedStyle(e);
        return { w: b.width, h: b.height, x: b.x, shown: cs.display !== 'none' && b.width > 0, bg: cs.backgroundColor };
      };
      const sb = document.querySelector('.sidebar').getBoundingClientRect();
      return {
        link: box('.account-link'),
        avatar: box('.avatar'),
        who: box('.who'),
        out: box('.sign-out'),
        sb: { x: sb.x, w: sb.width },
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      };
    });
    await p.screenshot({ path: path.join(out, `${tag}.png`) });
    await ctx.close();
    return r;
  };

  let r = await probe('full.html', 1400, 'full-1400');
  check('1400: the badge is shown with the name', r.link?.shown && r.who?.shown, JSON.stringify(r.link));
  check('1400: the badge sits inside the sidebar', r.link.x >= r.sb.x - 1 && r.link.x + r.link.w <= r.sb.x + r.sb.w + 1);
  check('1400: sign-out is still a separate control', r.out?.shown);
  check('1400: no horizontal overflow', !r.overflow);

  r = await probe('full-active.html', 1400, 'full-active-1400');
  check('1400: the active badge has a background', r.link?.bg && r.link.bg !== 'rgba(0, 0, 0, 0)', r.link?.bg);

  r = await probe('collapsed.html', 1400, 'collapsed-1400');
  check('collapsed: the avatar stays, the words go', r.avatar?.shown && !r.who?.shown, JSON.stringify({ avatar: r.avatar, who: r.who }));
  check('collapsed: the badge fits the narrow sidebar', r.link.x + r.link.w <= r.sb.x + r.sb.w + 1 && r.link.x >= r.sb.x - 1, `${r.link.w} in ${r.sb.w}`);

  r = await probe('full.html', 1000, 'tablet-1000');
  check('1000: the avatar stays, the words go', r.avatar?.shown && !r.who?.shown);
  check('1000: sign-out is hidden (it is on the account page and in the menu)', !r.out?.shown);
  check('1000: the badge fits the narrow sidebar', r.link.x + r.link.w <= r.sb.x + r.sb.w + 1);

  r = await probe('plain.html', 1400, 'plain-1400');
  check('plain design: the badge is shown', r.link?.shown);
  check('plain design: no horizontal overflow', !r.overflow);

  await browser.close();
  server.close();
  const failed = result.checks.filter((c) => !c.pass);
  result.passed = result.checks.length - failed.length;
  result.total = result.checks.length;
  fs.writeFileSync(path.join(__dirname, 'menu-consolidation.json'), JSON.stringify(result, null, 2));
  console.log(`${result.passed} of ${result.total}`);
  for (const f of failed) console.log('FAIL', f.name, f.detail);
  process.exit(failed.length ? 1 : 0);
})();

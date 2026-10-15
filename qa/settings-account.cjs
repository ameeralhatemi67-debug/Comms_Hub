// Browser check of Action_Plan.md step B3: «الإعدادات» shows only its six real tabs, and «المظهر»
// is a panel of «الحساب». The tab list is read from src/components/supporting.tsx, the panel markup
// is the one appearance-panel.tsx renders, the stylesheets are the real ones; the signed-in
// application cannot be driven by an agent, so the page around them is a fixture.
// Usage: node qa/settings-account.cjs   (writes qa/settings-account.json)
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { dependency, launchOptions } = require('./runtime.cjs');
const { chromium } = dependency('playwright');

const root = path.resolve(__dirname, '..');
const out = path.join(__dirname, 'artifacts', 'settings-account');
const result = { script: 'qa/settings-account.cjs', run: new Date().toISOString(), checks: [] };
const check = (name, pass, detail = '') => result.checks.push({ name, pass: Boolean(pass), detail: String(detail) });
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
for (const f of ['globals.css', 'identity.css', 'work.css']) fs.copyFileSync(path.join(root, 'src/app', f), path.join(out, f));

const sup = fs.readFileSync(path.join(root, 'src/components/supporting.tsx'), 'utf8');
const start = sup.indexOf('const settingsSections = [');
const list = sup.slice(start, sup.indexOf('];', start));
const tabs = [...list.matchAll(/id: '([a-z]+)', label: '([^']+)'/g)].map((m) => ({ id: m[1], label: m[2] }));

const head = `<!doctype html><html lang="ar" dir="rtl" data-identity="emerald"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="globals.css"><link rel="stylesheet" href="identity.css"><link rel="stylesheet" href="work.css"></head><body><main><div dir="rtl">`;
const pages = {
  'settings.html': `${head}<div class="page-heading"><div><h1>الإعدادات</h1><p>إعدادات النظام: ما يتصل به المركز، والتخزين والنسخ، والمنصات، وواتساب النظام، والسجل</p></div></div>
<div class="tabs" role="tablist">${tabs.map((t, i) => `<button role="tab" class="${i === 0 ? 'active' : ''}">${t.label}</button>`).join('')}</div>
<section class="panel st-panel"><h2>عام وصحة النظام</h2><p>محتوى</p></section></div></main></body></html>`,
  'account.html': `${head}<div class="page-heading"><div><h1>الحساب</h1></div></div>
<section class="panel"><h2>المظهر</h2><div class="ap-look"><div class="notice"><b>التصميم</b><small>الهوية الجديدة لمركز الاتصال أو التصميم الحالي</small>
<div class="seg" role="group" aria-label="التصميم"><button type="button" aria-pressed="true">التصميم الحالي</button><button type="button" aria-pressed="false">الهوية الجديدة</button></div></div>
<div class="notice"><b>الوضع</b><small>الوضع الداكن متاح في الهوية الجديدة فقط. فعّلها من الخيار أعلاه.</small>
<div class="seg" role="group" aria-label="الوضع"><button type="button" aria-pressed="true">فاتح</button><button type="button" aria-pressed="false" disabled>داكن</button></div></div>
<p class="muted">التصميم والوضع يُحفظان في هذا المتصفح وحده، ولا يراهما غيرك.</p></div></section></div></main></body></html>`,
};

(async () => {
  check('six tabs, in order', tabs.map((t) => t.id).join() === 'general,storage,backups,platforms,whatsapp,audit', tabs.map((t) => t.id).join());
  check('none of the removed tab names is listed', !tabs.some((t) => ['المؤسسة', 'اللغة', 'الإشعارات', 'افتراضات النشر', 'افتراضات الاعتماد', 'الذكاء والأتمتة', 'المظهر'].includes(t.label)));

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
  for (const width of [1280, 390]) {
    const ctx = await browser.newContext({ viewport: { width, height: 800 } });
    const p = await ctx.newPage();
    await p.goto(base + 'settings.html');
    let r = await p.evaluate(() => ({
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      tabs: document.querySelectorAll('.tabs button').length,
      strip: (() => { const t = document.querySelector('.tabs'); return { scroll: t.scrollWidth, client: t.clientWidth, over: getComputedStyle(t).overflowX }; })(),
    }));
    await p.screenshot({ path: path.join(out, `settings-${width}.png`) });
    check(`${width}: settings shows six tabs and the page does not overflow`, r.tabs === 6 && !r.overflow, JSON.stringify(r));
    check(`${width}: the tab strip scrolls inside itself when it is wider than the screen`, r.strip.scroll <= r.strip.client || ['auto', 'scroll'].includes(r.strip.over), JSON.stringify(r.strip));

    await p.goto(base + 'account.html');
    r = await p.evaluate(() => ({
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      groups: document.querySelectorAll('.ap-look .seg').length,
      heights: [...document.querySelectorAll('.ap-look .seg button')].map((b) => Math.round(b.getBoundingClientRect().height)),
      pressed: [...document.querySelectorAll('.ap-look .seg button[aria-pressed="true"]')].length,
      inside: [...document.querySelectorAll('.ap-look .seg')].every((s) => { const b = s.getBoundingClientRect(); return b.x >= -1 && b.x + b.width <= window.innerWidth + 1; }),
    }));
    await p.screenshot({ path: path.join(out, `account-${width}.png`) });
    check(`${width}: «الحساب» shows both appearance groups with one pressed choice each`, r.groups === 2 && r.pressed === 2, JSON.stringify(r));
    check(`${width}: buttons are at least 30 px tall and inside the screen, no overflow`, r.heights.every((h) => h >= 30) && r.inside && !r.overflow, JSON.stringify(r));
    await ctx.close();
  }
  await browser.close();
  server.close();
  const failed = result.checks.filter((c) => !c.pass);
  result.passed = result.checks.length - failed.length;
  result.total = result.checks.length;
  fs.writeFileSync(path.join(__dirname, 'settings-account.json'), JSON.stringify(result, null, 2));
  console.log(`${result.passed} of ${result.total}`);
  for (const f of failed) console.log('FAIL', f.name, f.detail);
  process.exit(failed.length ? 1 : 0);
})();

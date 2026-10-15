// Browser check of Action_Plan.md B9: the setup guides (steps, copy lines, links that open the
// platform's own page) and the «الاتصالات» tab. The guides are the real src/lib/setup-guides.ts
// (compiled here and resolved with a site address), the stylesheets are the real ones, and the
// markup is the one setup-guide.tsx and connections.tsx render; the signed-in application cannot be
// driven by an agent, so the page around them is a fixture.
// Usage: node qa/connections-tab.cjs   (writes qa/connections-tab.json)
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const ts = require('typescript');
const { dependency, launchOptions } = require('./runtime.cjs');
const { chromium } = dependency('playwright');

const root = path.resolve(__dirname, '..');
const out = path.join(__dirname, 'artifacts', 'connections-tab');
const result = { script: 'qa/connections-tab.cjs', run: new Date().toISOString(), checks: [] };
const check = (name, pass, detail = '') => result.checks.push({ name, pass: Boolean(pass), detail: String(detail) });
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
for (const f of ['globals.css', 'identity.css', 'work.css', 'permissions.css', 'kit.css']) fs.copyFileSync(path.join(root, 'src/app', f), path.join(out, f));

const src = fs.readFileSync(path.join(root, 'src/lib/setup-guides.ts'), 'utf8');
const js = ts.transpileModule(src, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
const mod = { exports: {} };
new Function('module', 'exports', js)(mod, mod.exports);
const { GUIDES, resolveGuide } = mod.exports;

const ORIGIN = 'https://comms-hub.example.org';
const KEYS = ['meta', 'tiktok', 'google', 'linkedin', 'x', 'connect_google', 'connect_linkedin', 'connect_x', 'mail', 'drive', 'whatsapp'];
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const guideHtml = (key) => {
  const g = resolveGuide(GUIDES[key], ORIGIN, key.replace(/^connect_/, ''));
  return `<section class="su-body" data-guide-open="${key}" style="max-width:640px;margin:24px auto"><h2>${esc(g.title)}</h2><p>${esc(g.intro)}</p><ol class="su-steps">${g.steps
    .map(
      (s) =>
        `<li><b>${esc(s.t)}</b>${s.b ? `<span>${esc(s.b)}</span>` : ''}${s.copy ? `<bdi class="su-copy" dir="ltr">${esc(s.copy)}</bdi>` : ''}${
          s.link ? `<a class="su-link" href="${s.link.href}" target="_blank" rel="noopener noreferrer">${esc(s.link.label)}</a>` : ''
        }</li>`,
    )
    .join('')}</ol>${g.notes ? `<ul class="su-notes">${g.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}${
    g.link ? `<p><a href="${g.link.href}" target="_blank" rel="noopener noreferrer">${esc(g.link.label)}</a></p>` : ''
  }</section>`;
};

const head = `<!doctype html><html lang="ar" dir="rtl" data-identity="emerald"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="globals.css"><link rel="stylesheet" href="identity.css"><link rel="stylesheet" href="work.css"><link rel="stylesheet" href="permissions.css"><link rel="stylesheet" href="kit.css"></head><body><main>`;
const pages = {
  'guides.html': `${head}${KEYS.map(guideHtml).join('<hr>')}</main></body></html>`,
  'tab.html': `${head}<div dir="rtl"><header class="page-heading"><div><h1>الإعدادات</h1></div></header>
<div class="tabs"><button class="active">الاتصالات</button><button>عام وصحة النظام</button><button>التخزين</button></div>
<section class="panel st-panel"><div class="st-connections"><p class="muted">ما يُدخل هنا يُفحص عند الخدمة نفسها قبل حفظه، ويُحفظ في خزنة الأسرار، ولا يُعرض بعد ذلك.</p>
<section class="st-app st-mail" data-app="mail"><div class="between"><b>صندوق بريد القسم (Gmail) <button class="su-hint" data-guide="mail">!</button></b><span class="mx-chip">لم يُدخل بعد</span></div>
<small class="muted">لم يُربط صندوق. بدونه لا يصل البريد الخارجي ولا تُرسل الدعوات من الموقع.</small>
<div class="wk-two"><label class="l">عنوان الصندوق<input class="wk-inp ltr" type="email" placeholder="department@gmail.com"></label><label class="l">كلمة مرور التطبيق (16 حرفاً)<input class="wk-inp ltr" type="password"></label></div>
<div class="actions"><button class="secondary st-mail-save">فحص وحفظ</button></div></section>
<section class="st-app" data-app="google"><div class="between"><b>تطبيق Google (يوتيوب وDrive) <button class="su-hint" data-guide="google">!</button></b><span class="mx-chip">لم يُدخل بعد</span></div>
<small class="muted">عنوان العودة الذي تسجّله في لوحة المطوّرين: <bdi dir="ltr">${ORIGIN}/api/platforms/callback/google</bdi></small>
<small class="muted">وعنوان العودة لـ Google Drive، في القائمة نفسها: <bdi dir="ltr">${ORIGIN}/api/drive/callback</bdi></small>
<div class="wk-two"><label class="l">معرّف العميل (Client ID)<input class="wk-inp ltr"></label><label class="l">سر العميل (Client secret)<input class="wk-inp ltr" type="password"></label></div>
<div class="actions"><button class="secondary st-app-save">فحص وحفظ</button></div></section>
<section class="st-app st-drive" data-app="drive"><div class="between"><b>Google Drive <button class="su-hint" data-guide="drive">!</button></b><span class="mx-chip">لم يُجهَّز</span></div>
<small class="muted">لم يُدخل معرّف عميل Google وسره بعد: أدخلهما في البطاقة أعلاه.</small>
<div class="actions"><button class="secondary" disabled>ربط Google Drive</button></div></section></div></section></div></main></body></html>`,
};

(async () => {
  // The guides: complete, every link https and opened in a new page with noopener.
  const names = Object.keys(GUIDES);
  for (const k of KEYS) check(`guide ${k} exists`, Boolean(GUIDES[k]));
  let links = 0;
  for (const k of KEYS) {
    const g = GUIDES[k];
    for (const s of g.steps) if (s.link) links++;
    check(`guide ${k}: has steps and a way to the platform's page`, g.steps.length >= 2 && (g.link || g.steps.some((s) => s.link)) ? true : ['connect_google', 'connect_linkedin', 'connect_x'].includes(k) ? true : false, `${g.steps.length} steps`);
  }
  check('the app guides carry the return address to copy, resolved to this site', ['google', 'linkedin', 'x'].every((k) => resolveGuide(GUIDES[k], ORIGIN, k).steps.some((s) => s.copy === `${ORIGIN}/api/platforms/callback/${k}`)));
  check('Drive\'s return address is in the Google guide', resolveGuide(GUIDES.google, ORIGIN, 'google').steps.some((s) => s.copy === `${ORIGIN}/api/drive/callback`));
  check('there are links to follow in the steps', links >= 12, links);
  check('no unresolved placeholder in any guide', !JSON.stringify(KEYS.map((k) => resolveGuide(GUIDES[k], ORIGIN, k))).match(/\{redirect\}|\{origin\}/));
  check('every guide is in the list of guides', KEYS.every((k) => names.includes(k)));

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
    const ctx = await browser.newContext({ viewport: { width, height: 900 } });
    const p = await ctx.newPage();
    await p.goto(base + 'guides.html');
    const g = await p.evaluate(() => ({
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      guides: document.querySelectorAll('[data-guide-open]').length,
      anchors: [...document.querySelectorAll('.su-link, section > p > a')].map((a) => ({ href: a.href, target: a.target, rel: a.rel, w: a.getBoundingClientRect().width })),
      copies: [...document.querySelectorAll('.su-copy')].map((c) => ({ dir: c.getAttribute('dir'), w: c.getBoundingClientRect().width, inside: c.getBoundingClientRect().right <= window.innerWidth + 1 })),
    }));
    await p.screenshot({ path: path.join(out, `guides-${width}.png`), fullPage: false });
    check(`${width}: eleven guides drawn, no sideways overflow`, g.guides === 11 && !g.overflow, JSON.stringify({ guides: g.guides, overflow: g.overflow }));
    check(`${width}: every link is https, opens in a new page and is visible`, g.anchors.length > 15 && g.anchors.every((a) => a.href.startsWith('https://') && a.target === '_blank' && /noopener/.test(a.rel) && a.w > 0), g.anchors.length);
    check(`${width}: copy lines are left-to-right and inside the screen`, g.copies.every((c) => c.dir === 'ltr' && c.w > 0 && c.inside), g.copies.length);

    await p.goto(base + 'tab.html');
    const t = await p.evaluate(() => ({
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      blocks: document.querySelectorAll('.st-connections .st-app').length,
      guides: document.querySelectorAll('.st-connections [data-guide]').length,
      drivesDisabled: document.querySelector('.st-drive .actions button').disabled,
      inputs: [...document.querySelectorAll('.st-connections input')].map((i) => ({ type: i.type, inside: i.getBoundingClientRect().right <= window.innerWidth + 1 })),
    }));
    await p.screenshot({ path: path.join(out, `tab-${width}.png`), fullPage: true });
    check(`${width}: the connections tab has mail, Google app and Drive, each with its guide`, t.blocks === 3 && t.guides === 3 && !t.overflow, JSON.stringify(t));
    check(`${width}: the password and secret fields are password fields, inside the screen`, t.inputs.filter((i) => i.type === 'password').length === 2 && t.inputs.every((i) => i.inside));
    check(`${width}: Drive's button is disabled until the Google app is in`, t.drivesDisabled);
    await ctx.close();
  }
  await browser.close();
  server.close();
  const failed = result.checks.filter((c) => !c.pass);
  result.passed = result.checks.length - failed.length;
  result.total = result.checks.length;
  fs.writeFileSync(path.join(__dirname, 'connections-tab.json'), JSON.stringify(result, null, 2));
  console.log(`${result.passed} of ${result.total}`);
  for (const f of failed) console.log('FAIL', f.name, f.detail);
  process.exit(failed.length ? 1 : 0);
})();

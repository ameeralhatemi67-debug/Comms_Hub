// Browser check of the help engine's Step 8 behaviour (Readiness_Audit.md section 4): the tour
// says what the page means for the person's role and adds the role's own steps; a page that is
// empty or only partly drawn ends its tour with a closing card instead of silently being short,
// and a page with nothing drawn at all gets one card after it had time; a person who saw the guide
// before is shown only what was added, once; and on a touch screen the guide speaks of touching,
// has the page guide as a button, and its buttons are finger-sized.
// The engine is the real src/lib/kit/guide.ts and the real help registry, compiled and run in
// headless Edge over small fixture pages (the signed-in application cannot be driven by an agent).
// Usage: node qa/help-tours.cjs   (writes qa/help-tours.json)
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const ts = require('typescript');
const { dependency, launchOptions } = require('./runtime.cjs');
const { chromium, devices } = dependency('playwright');

const root = path.resolve(__dirname, '..');
const out = path.join(__dirname, 'artifacts', 'help-tours');
const result = { script: 'qa/help-tours.cjs', run: new Date().toISOString(), checks: [] };
const check = (name, pass, detail = '') => result.checks.push({ name, pass: Boolean(pass), detail: String(detail) });

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
for (const m of ['lib/kit/guide.ts', 'lib/kit/hold.ts', 'lib/kit/hold-reasons.ts', 'lib/kit/need.ts', 'lib/kit/layer.ts', 'lib/kit/place.ts', 'lib/help/registry.ts', 'lib/help/pages.ts', 'lib/help/types.ts', 'lib/permissions.ts']) {
  const src = fs.readFileSync(path.join(root, 'src', m), 'utf8');
  const js = ts.transpileModule(src, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText.replace(/from '(\.[^']+)\.ts'/g, "from '$1.js'");
  const dest = path.join(out, m.replace(/\.ts$/, '.js'));
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, js);
}
for (const f of ['globals.css', 'identity.css', 'kit.css']) fs.copyFileSync(path.join(root, 'src/app', f), path.join(out, f));

const html = (cfg, body) => `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="globals.css"><link rel="stylesheet" href="identity.css"><link rel="stylesheet" href="kit.css"><style>.app-shell{padding:140px 16px 400px}</style></head>
<body><header><button class="help-q" aria-label="مساعدة">?</button></header>
<main><div class="app-shell">${body}</div><div id="guide-view" hidden></div></main>
<script>window.__cfg=${JSON.stringify(cfg)};window.__marks=[];</script>
<script type="module">
import { installGuide } from './lib/kit/guide.js';
const c = window.__cfg;
const seen = { ...c.seen };
window.__G = installGuide({
  root: () => document.querySelector('.app-shell'),
  page: () => c.page,
  role: () => c.role,
  progress: { ready: () => true, seen: (k) => !!seen[k], mark: (k) => { seen[k] = true; window.__marks.push(k); }, unmarkPage: () => {}, auto: () => true },
  go: () => {}, say: () => {},
});
window.__G.refresh();
window.__ready = true;
</script></body></html>`;

const pages = {};
let n = 0;
const make = (cfg, body) => {
  const id = `s${++n}.html`;
  pages[id] = html(cfg, body);
  return id;
};

const APPROVALS = '<div class="wk-head"><h1>الموافقات والنشر</h1></div><div data-gd="atabs"><button>بانتظارك</button></div><div class="wk-qcards"><article>بطاقة</article></div>';
const PUB = '<div class="wk-head"><h1>الموافقات والنشر</h1></div><div data-gd="atabs"><button>بانتظارك</button></div><div class="wk-qcards"><article>بطاقة</article></div><section data-gd="pub-1">نشر</section>';
const scenes = {
  lead: make({ page: 'approvals', role: 'lead', seen: {} }, APPROVALS),
  publisher: make({ page: 'approvals', role: 'publisher', seen: {} }, PUB),
  member: make({ page: 'approvals', role: 'member', seen: {} }, APPROVALS),
  partial: make({ page: 'approvals', role: 'maker', seen: {} }, '<div class="wk-head"><h1>الموافقات والنشر</h1></div>'),
  nothing: make({ page: 'approvals', role: 'maker', seen: {} }, '<p>جارٍ التحميل</p>'),
  news: make({ page: 'settings', role: 'lead', seen: { settings: true } }, '<div class="page-heading"><h1>الإعدادات</h1></div><section class="st-moves">نقل</section><button class="su-hint">!</button>'),
  newsSeen: make({ page: 'settings', role: 'lead', seen: { settings: true, 'settings:v2': true } }, '<div class="page-heading"><h1>الإعدادات</h1></div><section class="st-moves">نقل</section>'),
  first: make({ page: 'settings', role: 'lead', seen: {} }, '<div class="page-heading"><h1>الإعدادات</h1></div><div class="tabs"><button>عام</button></div><section class="st-health">صحة</section>'),
  touch: make({ page: 'approvals', role: 'lead', seen: { approvals: true } }, APPROVALS),
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
    res.writeHead(200, { 'Content-Type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : 'text/plain' });
    fs.createReadStream(f).pipe(res);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch(launchOptions);
  const errors = [];
  const open = async (id, ctxOptions = {}) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, ...ctxOptions });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`${id}: ${e.message}`));
    await page.goto(base + id);
    await page.waitForFunction(() => window.__ready === true);
    return { ctx, page };
  };
  const pop = async (page, ms = 4000) => {
    try {
      await page.waitForSelector('.gd-pop', { timeout: ms });
      return await page.locator('.gd-pop').innerText();
    } catch {
      return null;
    }
  };
  const nextStep = async (page) => {
    await page.locator('.gd-pop [data-gda="tnext"]').click();
    await page.waitForTimeout(120);
  };

  try {
    // 1. A lead sees their own line and the lead's extra step: four steps, not three.
    let { ctx, page } = await open(scenes.lead);
    let t = await pop(page);
    check('lead: the first card says what the page means for the lead group', t && /بصفتك «مدير الاتصال المؤسسي ومساعده والمسؤول عن النظام»/.test(t) && /تعتمد|اعتماد|ترى/.test(t), t?.replace(/\s+/g, ' ').slice(0, 200));
    check('lead: four steps (three common and one for the lead)', t && /1 من 4/.test(t), t?.match(/\d من \d/)?.[0]);
    for (let i = 0; i < 3; i++) await nextStep(page);
    t = await pop(page);
    check('lead: the last step is the lead\'s own: what waits for approval', t && /ما ينتظر اعتمادك/.test(t), t?.replace(/\s+/g, ' ').slice(0, 120));
    await page.locator('.gd-pop [data-gda="tnext"]').click();
    await page.waitForTimeout(150);
    const marks = await page.evaluate(() => window.__marks);
    check('lead: finishing marks the page seen', marks.includes('approvals'), marks.join(','));
    await ctx.close();

    // 2. A publisher gets the publishing step instead.
    ({ ctx, page } = await open(scenes.publisher));
    t = await pop(page);
    check('publisher: four steps, with their own line', t && /1 من 4/.test(t) && /بصفتك «مسؤول النشر وإدارة الحسابات»/.test(t), t?.match(/\d من \d/)?.[0]);
    for (let i = 0; i < 3; i++) await nextStep(page);
    t = await pop(page);
    check('publisher: the last step is publishing and scheduling', t && /النشر والجدولة/.test(t), t?.replace(/\s+/g, ' ').slice(0, 120));
    await ctx.close();

    // 3. A member has no role steps: the common three.
    ({ ctx, page } = await open(scenes.member));
    t = await pop(page);
    check('member: three steps, no role step', t && /1 من 3/.test(t) && /بصفتك «العضو»/.test(t), t?.match(/\d من \d/)?.[0]);
    await ctx.close();

    // 4. Partly drawn page: the heading, then a closing card that says why the rest is missing.
    ({ ctx, page } = await open(scenes.partial));
    t = await pop(page);
    check('partial: the tour is the heading and a closing card', t && /1 من 2/.test(t), t?.match(/\d من \d/)?.[0]);
    await nextStep(page);
    t = await pop(page);
    check('partial: the closing card says some parts appear with content or permission, and points at the page guide', t && /ما لا يظهر بعد/.test(t) && /تظهر حين يوجد محتوى/.test(t) && /دليل الصفحة/.test(t), t?.replace(/\s+/g, ' ').slice(0, 220));
    await ctx.close();

    // 5. Nothing drawn at all: after it waited, one card about what the page is for.
    ({ ctx, page } = await open(scenes.nothing));
    t = await pop(page, 12000);
    check('nothing drawn: a single card says what the page is for, instead of no guide at all', t && /ما تفعله في «الموافقات والنشر»/.test(t) && /1 من 1/.test(t), t?.replace(/\s+/g, ' ').slice(0, 200));
    await page.locator('.gd-pop [data-gda="tnext"]').click();
    await page.waitForTimeout(150);
    check('nothing drawn: dismissing it marks the page seen', (await page.evaluate(() => window.__marks)).includes('approvals'));
    await ctx.close();

    // 6. What is new, once.
    ({ ctx, page } = await open(scenes.news));
    t = await pop(page);
    check('news: someone who saw the guide before gets «جديد في» with only the added steps', t && /جديد في «الإعدادات»/.test(t) && /1 من 2/.test(t) && /أضفنا إلى هذه الصفحة/.test(t), t?.replace(/\s+/g, ' ').slice(0, 200));
    check('news: no role line on a news card', t && !/بصفتك/.test(t));
    await nextStep(page);
    await page.locator('.gd-pop [data-gda="tnext"]').click();
    await page.waitForTimeout(150);
    const nm = await page.evaluate(() => window.__marks);
    check('news: seeing it marks the versioned key, so it is not shown again', nm.includes('settings:v2'), nm.join(','));
    await ctx.close();

    ({ ctx, page } = await open(scenes.newsSeen));
    t = await pop(page, 2500);
    check('news already seen: nothing is shown', t === null, t ?? '');
    await ctx.close();

    // 7. A first visit to a versioned page marks both, so a new person never gets «what is new».
    ({ ctx, page } = await open(scenes.first));
    t = await pop(page);
    check('first visit: the ordinary tour', t && /إرشاد «الإعدادات»/.test(t) && !/جديد في/.test(t), t?.replace(/\s+/g, ' ').slice(0, 100));
    for (let i = 0; i < 5; i++) {
      if (!(await page.locator('.gd-pop [data-gda="tnext"]').count())) break;
      await page.locator('.gd-pop [data-gda="tnext"]').click();
      await page.waitForTimeout(150);
    }
    const fm = await page.evaluate(() => window.__marks);
    check('first visit: finishing marks the page and its current version', fm.includes('settings') && fm.includes('settings:v2'), fm.join(','));
    await ctx.close();

    // 8. Touch: words, the page guide as a button, finger-sized buttons, windows inside the screen.
    const phone = { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } };
    ({ ctx, page } = await open(scenes.touch, phone));
    await page.locator('.help-q').tap();
    await page.waitForSelector('.gd-bar', { timeout: 3000 });
    const bar = await page.locator('.gd-bar').innerText();
    check('touch: guide mode speaks of touching, not clicking', /المس/.test(bar) && !/انقر/.test(bar), bar.replace(/\s+/g, ' '));
    check('touch: the page guide is a button in the bar', await page.locator('.gd-bar [data-gda="doc"]').count() === 1);
    const barBtn = await page.locator('.gd-bar [data-gda="exit"]').boundingBox();
    check('touch: the bar\'s buttons are finger-sized (44 px high)', barBtn && barBtn.height >= 43, barBtn?.height);
    // The first window of guide mode explains the mode; it is closed with its 44 px button, then an element is touched.
    const xb = await page.locator('.gd-pop [data-gda="xclose"]').boundingBox();
    check('touch: the close button of the window is finger-sized', xb && xb.width >= 43 && xb.height >= 43, JSON.stringify(xb));
    await page.locator('.gd-pop [data-gda="xclose"]').tap();
    await page.waitForTimeout(150);
    await page.locator('.wk-qcards article').tap();
    t = await pop(page);
    const box = await page.locator('.gd-pop').boundingBox();
    check('touch: the explanation opens and stays inside the 390 px screen', t && box && box.x >= 0 && box.x + box.width <= 390 + 1, JSON.stringify(box));
    const gb = await page.locator('.gd-pop .gb').first().boundingBox();
    check('touch: the explanation\'s buttons are finger-sized', gb && gb.height >= 43, gb?.height);
    await page.locator('.gd-pop [data-gda="doc"]').tap();
    await page.waitForTimeout(200);
    const view = await page.locator('#guide-view').innerText();
    check('touch: the page guide opens from its button', /الموافقات والنشر/.test(view) && /ماذا يرى كل دور/.test(view), view.replace(/\s+/g, ' ').slice(0, 80));
    await page.screenshot({ path: path.join(out, 'touch-guide.png') });
    await ctx.close();
  } finally {
    await browser.close();
    server.close();
  }
  check('no script errors on any page', errors.length === 0, errors.join(' | '));
  const failed = result.checks.filter((c) => !c.pass);
  result.total = result.checks.length;
  result.passed = result.total - failed.length;
  result.failed = failed.length;
  fs.writeFileSync(path.join(__dirname, 'help-tours.json'), JSON.stringify(result, null, 2));
  console.log(`${result.passed} of ${result.total} passed`);
  for (const f of failed) console.log('FAIL', f.name, '|', f.detail);
  process.exit(failed.length ? 1 : 0);
})();

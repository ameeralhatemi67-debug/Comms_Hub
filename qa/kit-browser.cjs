// Browser check of the interaction kit (Reference_Build_Plan.md, Step 2): hold to confirm
// and the help system, in a real browser, without signing in.
// The site's pages are behind sign-in and no bypass is allowed, so this compiles the
// kit's own modules (src/lib/kit, src/lib/help: the code the site runs) into a test page
// laid out like the library, with a modal dialog, and drives it.
// Usage: node qa/kit-browser.cjs   (writes qa/kit-browser.json)
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const ts = require('typescript');
const { dependency, launchOptions } = require('./runtime.cjs');
const { chromium } = dependency('playwright');

const root = path.resolve(__dirname, '..');
const out = path.join(__dirname, 'artifacts', 'kit');
const result = { run: new Date().toISOString(), checks: [], errors: [] };
const check = (name, pass, detail = '') => result.checks.push({ name, pass: Boolean(pass), detail: String(detail) });

// ---------- compile the kit's modules to plain ES modules ----------
const modules = ['lib/kit/guide.ts', 'lib/kit/hold.ts', 'lib/kit/hold-reasons.ts', 'lib/kit/layer.ts', 'lib/kit/place.ts', 'lib/help/registry.ts', 'lib/help/pages.ts', 'lib/help/types.ts'];
for (const m of modules) {
  const src = fs.readFileSync(path.join(root, 'src', m), 'utf8');
  const js = ts.transpileModule(src, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, verbatimModuleSyntax: false } })
    .outputText.replace(/(from\s+['"][^'"]+)\.ts(['"])/g, '$1.js$2');
  const dest = path.join(out, m.replace(/\.ts$/, '.js'));
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, js);
}
fs.copyFileSync(path.join(root, 'src/app/kit.css'), path.join(out, 'kit.css'));

const card = (n) => `<div class="mx-fcard"><button class="mx-thumb" id="card${n}" aria-label="فتح الملف ${n}">ملف ${n}</button></div>`;
fs.writeFileSync(path.join(out, 'index.html'), `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="icon" href="data:,">
<link rel="stylesheet" href="kit.css">
<style>
:root{--surface:#fff;--ink:#203e35;--muted:#64766b;--line:#dfe6e0;--green:#17634b;--green-text:#17634b;--on-brand:#fff;--soft:#eaf2ea;--focus:#b48e45;--accent:#a78444;--warning-bg:#fbf4df;--warning-fg:#806027;--toast-bg:#213d31;--shadow-menu:0 8px 30px #1233;--shadow-dialog:0 20px 60px #1325;--shadow-toast:0 8px 30px #1233;--font-sans:"Segoe UI",Tahoma,sans-serif}
body{margin:0;font-family:var(--font-sans);background:#f4f6f2;color:var(--ink)}
.app-shell{display:flex;min-height:100vh}.sidebar{width:200px;background:#fff;border-inline-end:1px solid var(--line);padding:16px}
.workspace{flex:1;min-width:0}.topbar{display:flex;gap:8px;justify-content:flex-end;padding:10px 20px;background:#fff;border-bottom:1px solid var(--line)}
main{padding:20px;display:grid;gap:14px}.mx-body{display:grid;grid-template-columns:220px 1fr;gap:14px}
.mx-tree,.mx-drop,.mx-attn,.mx-toolbar,.mx-types,.mx-who{background:#fff;border:1px solid var(--line);border-radius:10px;padding:12px}
.mx-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.mx-fcard{background:#fff;border:1px solid var(--line);border-radius:10px;padding:10px}
.mx-selbar{display:flex;gap:10px;padding:10px;background:#213d31;color:#fff;border-radius:10px}
button{font:inherit;min-height:36px;padding:4px 12px;border:1px solid var(--line);border-radius:7px;background:#fff;cursor:pointer;display:inline-flex;align-items:center;gap:6px}
dialog{border:1px solid var(--line);border-radius:12px;padding:20px;width:min(580px,calc(100% - 30px));margin:auto}
@media (max-width:700px){.mx-body{grid-template-columns:1fr}.sidebar{display:none}}
</style></head><body>
<div class="app-shell">
  <aside class="sidebar"><b>مركز الاتصال</b></aside>
  <div class="workspace">
    <header class="topbar"><button class="undo-button" aria-label="لا شيء للتراجع عنه" disabled>تراجع</button><button class="help-q" aria-label="المساعدة">؟</button><button class="notification-button" aria-label="الإشعارات">إشعارات</button></header>
    <main id="main">
      <div id="guide-view" hidden></div>
      <header class="page-heading"><h1>مكتبة الوسائط</h1></header>
      <div class="mx-attn"><span>يحتاج انتباهك</span> <button id="attn">2 بانتظار مراجعتك</button></div>
      <div class="mx-body">
        <aside class="mx-tree" aria-label="المجلدات"><button id="folder">كل الملفات</button><button>الحملة</button></aside>
        <div>
          <div class="mx-who"><span>صلاحيتك: إدارة</span> <button id="access">الوصول والقفل</button></div>
          <div class="mx-drop"><b>اسحب الملفات هنا للرفع</b></div>
          <div class="mx-toolbar"><input type="search" aria-label="بحث" placeholder="ابحث"></div>
          <div class="mx-types"><button>كل المراحل</button></div>
          <div class="mx-grid">${card(1)}${card(2)}${card(3)}</div>
          <div class="mx-selbar"><b>2 محدد</b><button id="move">نقل</button><button id="trash" data-hold="الحذف ينقل الملفات المحددة إلى سلة Drive.">حذف</button><button id="open">اعتماد ملف</button></div>
        </div>
      </div>
    </main>
  </div>
</div>
<dialog id="dlg" aria-label="اعتماد"><p>سيُعتمد الملف بإصداره الحالي فقط.</p><button id="cancel">إلغاء</button> <button id="approve" class="primary" data-hold="الاعتماد يقفل هذا الإصدار في كل عمل يدخل فيه.">اعتماد وقفل</button></dialog>
<script type="module">
import { installGuide } from './lib/kit/guide.js';
import { installHold } from './lib/kit/hold.js';
window.acted = { trash: 0, approve: 0, card1: 0, move: 0 };
for (const id of ['trash', 'approve', 'card1', 'move']) document.getElementById(id).addEventListener('click', () => window.acted[id]++);
document.getElementById('open').addEventListener('click', () => document.getElementById('dlg').showModal());
document.getElementById('cancel').addEventListener('click', () => document.getElementById('dlg').close());
const KEY = 'kit-check.progress';
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
const seen = load();
const save = () => localStorage.setItem(KEY, JSON.stringify(seen));
window.said = [];
const g = installGuide({
  root: () => document.querySelector('.app-shell'),
  page: () => 'library',
  role: () => 'lead',
  progress: {
    ready: () => true,
    seen: (k) => !!seen[k],
    mark: (k) => { seen[k] = true; save(); },
    unmarkPage: (p) => { for (const k of Object.keys(seen)) if (k === p || k.startsWith(p + ':')) delete seen[k]; save(); },
    auto: () => true,
  },
  go: (href) => window.said.push('go ' + href),
  say: (t) => window.said.push(t),
});
installHold({ guideOn: g.isOn, passing: g.passing });
window.guide = g;
g.refresh();
</script></body></html>`);

// ---------- serve and drive ----------
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
const server = http.createServer((req, res) => {
  const file = path.join(out, decodeURIComponent(req.url.split('?')[0]).replace(/^\/$/, '/index.html'));
  if (!file.startsWith(out) || !fs.existsSync(file)) return void (res.writeHead(404), res.end());
  res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch(launchOptions);
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  page.on('pageerror', (e) => result.errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && result.errors.push(m.text()));
  const wait = (ms) => page.waitForTimeout(ms);
  const popText = () => page.evaluate(() => document.querySelector('.gd-pop')?.textContent ?? '');
  const acted = () => page.evaluate(() => ({ ...window.acted }));
  const rect = (sel) => page.evaluate((s) => { const r = document.querySelector(s)?.getBoundingClientRect(); return r ? { l: r.left, t: r.top, r: r.right, b: r.bottom } : null; }, sel);
  const overlap = (a, b) => a && b && Math.max(0, Math.min(a.r, b.r) - Math.max(a.l, b.l)) * Math.max(0, Math.min(a.b, b.b) - Math.max(a.t, b.t));

  // 1. The first-visit guide: once, three steps, then never again for this person.
  await page.goto(url);
  await page.waitForSelector('.gd-pop', { timeout: 4000 }).catch(() => {});
  let t = await popText();
  check('first-visit guide starts by itself', t.includes('إرشاد «مكتبة الوسائط» · 1 من 3'), t.slice(0, 60));
  check('the step points at its part (spotlight)', await page.$('.gd-spot'));
  await page.screenshot({ path: path.join(out, 'shot-first-visit.png') });
  await page.click('.gd-pop [data-gda="tnext"]'); await wait(450);
  check('step 2 is the folders', (await popText()).includes('2 من 3') && (await popText()).includes('المجلدات'));
  await page.click('.gd-pop [data-gda="tnext"]'); await wait(450);
  check('step 3 is the upload area', (await popText()).includes('3 من 3'));
  await page.click('.gd-pop [data-gda="tnext"]'); await wait(200);
  check('the guide closes after the last step', !(await page.$('.gd-pop')));
  await page.reload(); await wait(1400);
  check('it does not return after a reload', !(await page.$('.gd-pop')));

  // 2. A section tip the first time someone clicks into a part, once.
  await page.click('#folder'); await wait(500);
  t = await popText();
  check('section tip on the first click into the folders', t.includes('نصيحة') && t.includes('شجرة المجلدات'), t.slice(0, 60));
  await page.click('.gd-pop [data-gda="cclose"]'); await wait(100);
  await page.click('#folder'); await wait(500);
  check('the tip does not come back', !(await page.$('.gd-pop')));

  // 3. The help button: hover, guide mode, explain then act.
  await page.hover('.help-q'); await wait(100);
  t = await page.evaluate(() => document.querySelector('.gd-tip')?.textContent ?? '');
  check('hovering the help button says what the page is for', t.includes('مكتبة الوسائط') && t.includes('Google Drive'), t.slice(0, 50));
  await page.click('.help-q'); await wait(450);
  check('one click turns guide mode on', await page.evaluate(() => document.querySelector('.app-shell').classList.contains('guide-on') && !!document.querySelector('.gd-bar')));
  const before = await acted();
  await page.click('#card1'); await wait(150);
  t = await popText();
  check('in guide mode the first click explains, by the part it sits in', t.includes('الملفات') && t.includes('فتح الملف 1'), t.slice(0, 80));
  check('and does not act', (await acted()).card1 === before.card1);
  const cardBox = await rect('#card1');
  check('the explanation does not cover the element', overlap(await rect('.gd-pop'), cardBox) === 0);
  await page.click('#card1'); await wait(150);
  check('the second click on the same element acts', (await acted()).card1 === before.card1 + 1);
  await page.keyboard.press('Escape'); await wait(100);
  await page.click('#trash'); await wait(150);
  t = await popText();
  check('a hold button explains its long press in guide mode', t.includes('كيف أجرّبه') && (await acted()).trash === 0);
  await page.keyboard.press('Escape'); await wait(100);
  check('Escape closes the explanation', !(await page.$('.gd-pop')));
  await page.keyboard.press('Escape'); await wait(100);
  check('Escape again leaves guide mode', await page.evaluate(() => !document.querySelector('.app-shell').classList.contains('guide-on') && !document.querySelector('.gd-bar')));

  // 4. The page guide: a double click, in place of the page.
  await page.dblclick('.help-q'); await wait(400);
  const view = await page.evaluate(() => {
    const v = document.getElementById('guide-view');
    return { open: !v.hidden, text: v.textContent, headingHidden: getComputedStyle(document.querySelector('.page-heading')).display === 'none' };
  });
  check('a double click opens the page guide in place of the page', view.open && view.headingHidden && view.text.includes('«مكتبة الوسائط»'));
  check('the guide has purpose, roles, parts, rules, links and questions', ['الغرض', 'ماذا يرى كل دور', 'أجزاء الصفحة', 'القواعد', 'الارتباط بالصفحات الأخرى', 'أسئلة شائعة'].every((s) => view.text.includes(s)));
  await page.screenshot({ path: path.join(out, 'shot-page-guide.png') });
  check('the reader\'s role is marked', await page.evaluate(() => document.querySelector('.hv-role.me')?.textContent.includes('أنت')));
  check('parts not on screen say so', await page.evaluate(() => document.querySelector('.hv-part.gone') !== null && document.querySelectorAll('.hv-part:not(.gone)').length >= 6));
  await page.click('.hv-part:not(.gone) [data-gda="show"]'); await wait(600);
  t = await popText();
  check('«أرني» goes back to the page and points at the part', t.includes('في هذه الصفحة') && (await page.evaluate(() => document.getElementById('guide-view').hidden)));
  await page.click('.gd-pop [data-gda="cclose"]');
  await page.dblclick('.help-q'); await wait(300);
  await page.click('.hv-head [data-gda="replay"]'); await wait(800);
  check('«إعادة الإرشاد لهذه الصفحة» starts the guide again from step 1', (await popText()).includes('1 من 3'));
  await page.click('.gd-pop [data-gda="tskip"]'); await wait(100);

  // 5. Hold to confirm.
  await page.click('#trash'); await wait(150);
  t = await page.evaluate(() => document.querySelector('.gd-tip')?.textContent ?? '');
  check('a quick click does not act and says why', (await acted()).trash === 0 && t.includes('اضغط مطولاً للتأكيد') && t.includes('سلة Drive'));
  const tb = await rect('#trash');
  await page.mouse.move((tb.l + tb.r) / 2, (tb.t + tb.b) / 2);
  await page.mouse.down(); await wait(450);
  check('the button fills while pressed', await page.evaluate(() => document.getElementById('trash').classList.contains('holding')));
  await wait(700); await page.mouse.up(); await wait(150);
  check('a press of about a second acts, once', (await acted()).trash === 1);
  await page.mouse.down(); await wait(300); await page.mouse.up(); await wait(150);
  check('letting go early does not act', (await acted()).trash === 1);
  await page.focus('#trash');
  await page.keyboard.down('Enter'); await wait(1100); await page.keyboard.up('Enter'); await wait(150);
  check('Enter held from the keyboard acts', (await acted()).trash === 2);
  await page.keyboard.press('Enter'); await wait(150);
  check('a quick Enter does not', (await acted()).trash === 2);
  check('other buttons are untouched by the hold', await page.click('#move').then(() => true) && (await acted()).move === 1);

  // 6. Inside a modal dialog: the long press works, and the explanation stays beside it, reachable.
  await page.click('#open'); await wait(200);
  const ab = await rect('#approve');
  await page.mouse.move((ab.l + ab.r) / 2, (ab.t + ab.b) / 2);
  await page.mouse.down(); await wait(1100); await page.mouse.up(); await wait(150);
  check('a long press works inside a modal dialog', (await acted()).approve === 1);
  await page.click('#cancel'); await wait(150);
  // Guide mode first, then the dialog is opened by a second click, as a person would.
  await page.click('.help-q'); await wait(450);
  await page.click('#open'); await wait(150);
  check('in guide mode the first click on «اعتماد ملف» explains it', (await popText()).includes('اعتماد ملف') && !(await page.evaluate(() => document.getElementById('dlg').open)));
  await page.click('#open'); await wait(250);
  check('the second click opens the dialog', await page.evaluate(() => document.getElementById('dlg').open));
  await page.click('#cancel'); await wait(250);
  const dlg = await rect('dialog[open]');
  const pop = await rect('.gd-pop');
  check('a click inside the dialog explains instead of closing it', !!dlg && (await popText()).includes('إلغاء'));
  check('the explanation lives inside the dialog, so it can be clicked', await page.evaluate(() => !!document.querySelector('dialog[open] .gdl .gd-pop')));
  check('and does not cover the dialog', overlap(pop, dlg) === 0, JSON.stringify({ pop, dlg }));
  await page.screenshot({ path: path.join(out, 'shot-dialog-explain.png') });
  await page.click('.gd-pop [data-gda="try"]'); await wait(200);
  check('«جرّبه» from the explanation acts inside the dialog', await page.evaluate(() => !document.getElementById('dlg').open));
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); await wait(100);

  // 7. Phone width: windows stay on screen, no sideways scroll.
  await page.evaluate(() => localStorage.clear());
  await page.setViewportSize({ width: 390, height: 800 });
  await page.reload(); await page.waitForSelector('.gd-pop', { timeout: 4000 }).catch(() => {});
  const p390 = await rect('.gd-pop');
  check('at 390 px the guide window fits the screen', p390 && p390.l >= 0 && p390.r <= 390, JSON.stringify(p390));
  check('no sideways scroll at 390 px', await page.evaluate(() => document.documentElement.scrollWidth <= 390));

  check('no page errors', result.errors.length === 0, result.errors.join(' | '));
  await browser.close();
  server.close();
  const passed = result.checks.filter((c) => c.pass).length;
  result.summary = `${passed} of ${result.checks.length}`;
  fs.writeFileSync(path.join(__dirname, 'kit-browser.json'), JSON.stringify(result, null, 2));
  console.log(result.summary);
  for (const c of result.checks) if (!c.pass) console.log('FAIL', c.name, c.detail);
  process.exit(passed === result.checks.length ? 0 : 1);
})().catch((e) => {
  for (const c of result.checks) console.log(c.pass ? 'ok  ' : 'FAIL', c.name, c.pass ? '' : c.detail);
  console.error(String(e).slice(0, 200));
  server.close();
  process.exit(2);
});

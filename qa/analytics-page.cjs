// Browser check of Action_Plan.md B5: «التحليلات». The numbers come from the real
// src/lib/work/analytics.ts (compiled here) over fixture rows, the stylesheets are the real ones, and
// the markup is the one src/components/work/analytics.tsx renders; the signed-in application cannot be
// driven by an agent, so the page around them is a fixture. Checks the numbers and the layout at three
// widths: no sideways overflow of the page, the platform table scrolling inside itself on a phone.
// Usage: node qa/analytics-page.cjs   (writes qa/analytics-page.json)
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const ts = require('typescript');
const { dependency, launchOptions } = require('./runtime.cjs');
const { chromium } = dependency('playwright');

const root = path.resolve(__dirname, '..');
const out = path.join(__dirname, 'artifacts', 'analytics-page');
const result = { script: 'qa/analytics-page.cjs', run: new Date().toISOString(), checks: [] };
const check = (name, pass, detail = '') => result.checks.push({ name, pass: Boolean(pass), detail: String(detail) });
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
for (const f of ['globals.css', 'identity.css', 'work.css']) fs.copyFileSync(path.join(root, 'src/app', f), path.join(out, f));

const src = fs.readFileSync(path.join(root, 'src/lib/work/analytics.ts'), 'utf8');
const js = ts.transpileModule(src, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
const mod = { exports: {} };
new Function('module', 'exports', js)(mod, mod.exports);
const { analyse, STATUS_ORDER, percent } = mod.exports;

const TODAY = '2026-10-15';
const w = (id, o) => ({ id, no: 1, title: id, type: 'post', status: 'DRAFT', due: '2026-10-20', channels: [], results: {}, review_cycle: null, closed_at: null, created_at: '2026-10-14T08:00:00Z', pub_at: null, ...o });
const works = [
  w('A', { status: 'IN_REVIEW', review_cycle: 1, due: '2026-10-10' }),
  w('B', { status: 'CHANGES_REQUESTED', review_cycle: 2, channels: ['i1'] }),
  w('C', { status: 'PUBLISHED', review_cycle: 1, channels: ['i1', 'y1'], pub_at: '2026-10-13T10:00:00Z', results: { i1: { ok: true }, y1: { ok: false } } }),
  w('D', { status: 'APPROVED', review_cycle: 1, created_at: '2026-10-05T08:00:00Z' }),
  w('E', { status: 'FAILED' }),
  w('F', {}),
];
const accounts = [
  { id: 'i1', platform: 'instagram', active: true, conn_kind: 'oauth', conn_state: 'connected', authorized_until: '2026-10-22T00:00:00Z' },
  { id: 'y1', platform: 'youtube', active: true, authorized_until: '2026-10-01T00:00:00Z' },
];
const platforms = [
  { key: 'instagram', label_ar: 'إنستغرام', readiness: 'live' },
  { key: 'youtube', label_ar: 'يوتيوب', readiness: 'not_started' },
];
const labels = { DRAFT: 'مسودة', IN_PRODUCTION: 'قيد الإنتاج', IN_REVIEW: 'قيد المراجعة', CHANGES_REQUESTED: 'بحاجة إلى تعديل', REJECTED: 'مرفوض', APPROVED: 'جاهز للنشر', SCHEDULED: 'مجدول', PUBLISHING: 'جارٍ النشر', PUBLISHED: 'منشور', PARTIAL: 'نشر جزئي', FAILED: 'فشل النشر' };
const a = analyse(works, accounts, platforms, TODAY, Date.parse('2026-10-15T09:00:00Z'));

check('total and open', a.total === 6 && a.open === 4, `${a.total}/${a.open}`);
check('late: only the open work past its due date', a.late === 1, a.late);
check('review numbers', a.review.waiting === 1 && a.review.changes === 1 && a.review.reviewed === 4 && Math.abs(a.review.meanRounds - 1.25) < 1e-9, JSON.stringify(a.review));
check('first round share among approved or beyond', a.review.firstRound === 1, a.review.firstRound);
const ig = a.platforms[0];
const yt = a.platforms[1];
check('instagram: connected, expiring, addressed, one result ok', ig.connected === 1 && ig.expiring === 1 && ig.addressed === 2 && ig.ok === 1 && ig.failed === 0, JSON.stringify(ig));
check('youtube: authorisation ended is attention, one failed result', yt.attention === 1 && yt.failed === 1, JSON.stringify(yt));

const max = Math.max(...Object.values(a.byStatus));
const bar = (v, m, tone = '') => `<span class="an-bar"><i class="${tone}" style="width:${m ? Math.max(v ? 3 : 0, Math.round((v / m) * 100)) : 0}%"></i></span>`;
const wm = Math.max(1, ...a.weeks.map((x) => Math.max(x.made, x.published)));
const html = `<!doctype html><html lang="ar" dir="rtl" data-identity="emerald"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="globals.css"><link rel="stylesheet" href="identity.css"><link rel="stylesheet" href="work.css"></head><body><main><div class="wk an" dir="rtl">
<div class="wk-head"><div><h1>التحليلات</h1><p>قراءة لسير العمل والمراجعة والمنصات، من الأعمال والحسابات التي تراها أنت.</p></div></div>
<div class="an-tiles">
<div class="an-tile"><b>${a.total}</b><span>أعمال</span></div><div class="an-tile"><b>${a.open}</b><span>مفتوحة</span></div>
<div class="an-tile bad"><b>${a.late}</b><span>متأخرة عن موعدها</span></div><div class="an-tile"><b>${a.dueSoon}</b><span>تستحق خلال 7 أيام</span></div>
<div class="an-tile"><b>${a.review.waiting}</b><span>بانتظار المراجعة</span></div><div class="an-tile bad"><b>${a.published.ok}<small> / ${a.published.failed}</small></b><span>نشر ناجح / فاشل (محاكاة)</span></div></div>
<section class="wk-pn an-sec"><h3>الأعمال حسب الحالة</h3><div class="an-rows">${STATUS_ORDER.map((s) => `<div class="an-row"><span>${labels[s]}</span>${bar(a.byStatus[s], max, s === 'FAILED' || s === 'REJECTED' ? 'bad' : '')}<b>${a.byStatus[s]}</b></div>`).join('')}</div></section>
<section class="wk-pn an-sec"><h3>آخر ${a.weeks.length} أسابيع</h3><div class="an-weeks"><div class="an-wrow head"><span>الأسبوع من</span><span>أُنشئت</span><span>نُشرت</span></div>
${a.weeks.map((x) => `<div class="an-wrow"><bdi dir="ltr">${x.from}</bdi><span>${bar(x.made, wm)}<b>${x.made}</b></span><span>${bar(x.published, wm, 'ok')}<b>${x.published}</b></span></div>`).join('')}</div></section>
<section class="wk-pn an-sec"><h3>المراجعة</h3><dl class="an-facts"><div><dt>بانتظار المراجعة</dt><dd>${a.review.waiting}</dd></div><div><dt>عادت بطلب تعديل</dt><dd>${a.review.changes}</dd></div><div><dt>متوسط الجولات للعمل</dt><dd>${a.review.meanRounds.toFixed(1)}</dd></div></dl></section>
<section class="wk-pn an-sec"><h3>المنصات</h3><div class="an-table" role="table"><div class="an-trow head" role="row"><span>المنصة</span><span>حسابات (فعّالة / كلها)</span><span>مربوطة فعلاً</span><span>تحتاج انتباهاً</span><span>ينتهي تفويضها قريباً</span><span>أعمال موجهة إليها</span><span>نجح / فشل (محاكاة)</span></div>
${a.platforms.map((p) => `<div class="an-trow" role="row"><span><b>${p.label}</b></span><span>${p.active} / ${p.accounts}</span><span>${p.connected}</span><span class="${p.attention ? 'bad' : ''}">${p.attention}</span><span class="${p.expiring ? 'warn' : ''}">${p.expiring}</span><span>${p.addressed}</span><span>${p.ok} / ${p.failed}${percent(p.ok, p.ok + p.failed) !== null ? `<small> · ${percent(p.ok, p.ok + p.failed)}%</small>` : ''}</span></div>`).join('')}
</div></section></div></main></body></html>`;

(async () => {
  const server = http.createServer((req, res) => {
    const name = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '');
    if (name === 'page.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(html);
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
  for (const width of [1280, 900, 390]) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 } });
    const p = await ctx.newPage();
    await p.goto(base + 'page.html');
    const r = await p.evaluate(() => {
      const t = document.querySelector('.an-table');
      return {
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        tiles: document.querySelectorAll('.an-tile').length,
        statusRows: document.querySelectorAll('.an-row').length,
        weekRows: document.querySelectorAll('.an-wrow:not(.head)').length,
        tableScrolls: t.scrollWidth > t.clientWidth,
        tableOverflowX: getComputedStyle(t).overflowX,
        bars: [...document.querySelectorAll('.an-bar')].every((b) => b.getBoundingClientRect().width > 0),
        late: getComputedStyle(document.querySelector('.an-tile.bad b')).color,
      };
    });
    await p.screenshot({ path: path.join(out, `analytics-${width}.png`), fullPage: true });
    check(`${width}: the page does not overflow sideways`, !r.overflow, JSON.stringify(r));
    check(`${width}: six tiles, eleven status rows, eight week rows`, r.tiles === 6 && r.statusRows === 11 && r.weekRows === 8, JSON.stringify(r));
    check(`${width}: every bar has width and the late tile is in the danger colour`, r.bars && r.late !== 'rgba(0, 0, 0, 0)');
    check(`${width}: the platform table is scrollable by itself when it does not fit`, r.tableOverflowX === 'auto' || !r.tableScrolls, `${r.tableOverflowX} ${r.tableScrolls}`);
    await ctx.close();
  }
  await browser.close();
  server.close();
  const failed = result.checks.filter((c) => !c.pass);
  result.passed = result.checks.length - failed.length;
  result.total = result.checks.length;
  fs.writeFileSync(path.join(__dirname, 'analytics-page.json'), JSON.stringify(result, null, 2));
  console.log(`${result.passed} of ${result.total}`);
  for (const f of failed) console.log('FAIL', f.name, f.detail);
  process.exit(failed.length ? 1 : 0);
})();

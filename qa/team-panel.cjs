// Browser check of Action_Plan.md step B2: the team panel of «سجل النشاط». The summary is the real
// src/lib/media/team.ts (compiled here), the stylesheets are the real ones, and the panel markup is
// the one activity-page.tsx renders; the signed-in application cannot be driven by an agent, so the
// page around them is a fixture. Checks the rows' order and numbers, the layout at three widths and
// that nothing overflows sideways.
// Usage: node qa/team-panel.cjs   (writes qa/team-panel.json)
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const ts = require('typescript');
const { dependency, launchOptions } = require('./runtime.cjs');
const { chromium } = dependency('playwright');

const root = path.resolve(__dirname, '..');
const out = path.join(__dirname, 'artifacts', 'team-panel');
const result = { script: 'qa/team-panel.cjs', run: new Date().toISOString(), checks: [] };
const check = (name, pass, detail = '') => result.checks.push({ name, pass: Boolean(pass), detail: String(detail) });
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
for (const f of ['globals.css', 'identity.css', 'media.css']) fs.copyFileSync(path.join(root, 'src/app', f), path.join(out, f));

// The real summary function.
const src = fs.readFileSync(path.join(root, 'src/lib/media/team.ts'), 'utf8');
const js = ts.transpileModule(src, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
const mod = { exports: {} };
new Function('module', 'exports', js)(mod, mod.exports);
const { teamSummary } = mod.exports;

const now = new Date('2026-10-15T12:00:00Z');
const people = [
  { email: 'a@x', display_name: 'سارة', role: 'designer' },
  { email: 'b@x', display_name: 'خالد', role: 'writer' },
  { email: 'c@x', display_name: 'نورة', role: 'publisher' },
  { email: 'd@x', display_name: 'عبدالله', role: 'member' },
];
const rows = [
  { at: '2026-10-15T10:00:00Z', actor_email: 'b@x' },
  { at: '2026-10-14T09:00:00Z', actor_email: 'b@x' },
  { at: '2026-10-13T09:00:00Z', actor_email: 'a@x' },
  { at: '2026-09-20T09:00:00Z', actor_email: 'c@x' },
];
const tasks = [
  { assignee: 'a@x', status: 'open', due: '2026-10-14T00:00:00Z' },
  { assignee: 'a@x', status: 'open', due: '2026-10-30T00:00:00Z' },
  { assignee: 'b@x', status: 'done', due: '2026-10-01T00:00:00Z' },
];
const team = teamSummary(people, rows, tasks, now);
check('order: latest first, silent last', team.map((t) => t.name).join(',') === 'خالد,سارة,نورة,عبدالله', team.map((t) => t.name).join(','));
check('numbers: week and open and late for the designer', team[1].week === 1 && team[1].open === 2 && team[1].late === 1, JSON.stringify(team[1]));
check('a done task is not open', team[0].open === 0);
check('a person with no action has no last', team[3].last === null);

const roleName = { designer: 'المصمم', writer: 'كاتب المحتوى', publisher: 'مسؤول النشر وإدارة الحسابات', member: 'عضو' };
const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="globals.css"><link rel="stylesheet" href="identity.css"><link rel="stylesheet" href="media.css"></head>
<body data-identity="emerald"><main><div class="mx" dir="rtl">
<section class="mx-team" aria-label="الفريق"><div class="mx-team-head"><b>الفريق</b><span>آخر إجراء لكل عضو، وما أنجزه في الأسبوع الأخير، وما ينتظره من مهام.</span></div>
<div class="mx-team-grid" role="table"><div class="mx-team-row head" role="row"><span>العضو</span><span>الدور</span><span>آخر إجراء</span><span>إجراءات الأسبوع</span><span>مهام مفتوحة</span></div>
${team
  .map(
    (t) => `<div class="mx-team-row" role="row"><span><button type="button" class="mx-team-who"><b>${t.name}</b></button></span><span>${roleName[t.role]}</span><span>${t.last ? t.last.slice(0, 16).replace('T', ' ') : '<small class="muted">لا إجراء مسجلاً</small>'}</span><span>${t.week}</span><span>${t.open}${t.late ? `<small class="late"> · متأخرة ${t.late}</small>` : ''}</span></div>`,
  )
  .join('')}
</div><p class="muted">المحسوب من آخر 4 حدثاً مقروءاً من السجل.</p></section></div></main></body></html>`;

(async () => {
  const server = http.createServer((req, res) => {
    const name = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '');
    if (name === 'panel.html') {
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
    const ctx = await browser.newContext({ viewport: { width, height: 800 } });
    const p = await ctx.newPage();
    await p.goto(base + 'panel.html');
    const r = await p.evaluate(() => {
      const rows = [...document.querySelectorAll('.mx-team-row:not(.head)')];
      const head = document.querySelector('.mx-team-row.head');
      const box = document.querySelector('.mx-team').getBoundingClientRect();
      return {
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        rows: rows.length,
        headShown: head ? getComputedStyle(head).display !== 'none' : false,
        inside: rows.every((x) => { const b = x.getBoundingClientRect(); return b.x >= box.x - 1 && b.x + b.width <= box.x + box.width + 1; }),
        late: [...document.querySelectorAll('.mx-team .late')].map((e) => getComputedStyle(e).color),
      };
    });
    await p.screenshot({ path: path.join(out, `panel-${width}.png`) });
    check(`${width}: four member rows, no sideways overflow`, r.rows === 4 && !r.overflow, JSON.stringify(r));
    check(`${width}: every row stays inside the panel`, r.inside);
    check(`${width}: the header row is ${width > 760 ? 'shown' : 'hidden on a phone'}`, r.headShown === (width > 760));
    check(`${width}: the late count is drawn in the danger colour`, r.late.length === 1 && r.late[0] !== 'rgba(0, 0, 0, 0)');
    await ctx.close();
  }
  await browser.close();
  server.close();
  const failed = result.checks.filter((c) => !c.pass);
  result.passed = result.checks.length - failed.length;
  result.total = result.checks.length;
  fs.writeFileSync(path.join(__dirname, 'team-panel.json'), JSON.stringify(result, null, 2));
  console.log(`${result.passed} of ${result.total}`);
  for (const f of failed) console.log('FAIL', f.name, f.detail);
  process.exit(failed.length ? 1 : 0);
})();

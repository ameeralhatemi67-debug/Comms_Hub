// Browser check of the tester feedback channel (Action_Plan.md section 5): the note dialog and the
// «ملاحظات وأخطاء» inbox, drawn with the real stylesheets and the markup src/components/feedback.tsx
// renders. The signed-in application cannot be driven by an agent, so the page around them is a
// fixture; the behaviour (what is sent, scrubbed, limited) is in tests/feedback.test.mjs and
// supabase/tests/feedback_errors_rules.sql.
// Usage: node qa/feedback-fixture.cjs   (writes qa/feedback-fixture.json)
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { dependency, launchOptions } = require('./runtime.cjs');
const { chromium } = dependency('playwright');

const root = path.resolve(__dirname, '..');
const out = path.join(__dirname, 'artifacts', 'feedback-fixture');
const result = { script: 'qa/feedback-fixture.cjs', run: new Date().toISOString(), checks: [] };
const check = (name, pass, detail = '') => result.checks.push({ name, pass: Boolean(pass), detail: String(detail) });
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
for (const f of ['globals.css', 'identity.css', 'work.css', 'permissions.css', 'kit.css']) fs.copyFileSync(path.join(root, 'src/app', f), path.join(out, f));

const head = `<!doctype html><html lang="ar" dir="rtl" data-identity="emerald"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="globals.css"><link rel="stylesheet" href="identity.css"><link rel="stylesheet" href="work.css"><link rel="stylesheet" href="permissions.css"><link rel="stylesheet" href="kit.css"></head><body><main style="padding:16px">`;
const item = (kind, kindAr, state, stateAr, body, who, count) => `<li class="fb-item ${kind} ${state}"><div class="between"><b>${kindAr}${count > 1 ? ` · تكرر ${count} مرة` : ''}</b><span class="mx-chip ${state === 'new' ? 'warn' : state === 'done' ? 'success' : ''}">${stateAr}</span></div>
<p class="fb-body">${body}</p><small class="muted">${who} · <bdi dir="ltr">/work</bdi> · <bdi dir="ltr">26/10/15 10:20</bdi></small>
<div class="actions"><button class="secondary">اطّلعت</button><button class="secondary">عولج</button></div></li>`;
const pages = {
  'note.html': `${head}<div class="top-actions" style="display:flex;gap:8px;margin-bottom:16px"><button class="fb-open" aria-label="أرسل ملاحظة">+</button></div>
<dialog open aria-label="أرسل ملاحظة" style="position:static;margin:auto"><div class="between"><h2>أرسل ملاحظة</h2><button aria-label="إغلاق">×</button></div>
<div class="fb-form"><p class="muted">يقرؤها مسؤولو النظام. تُرسل معها الصفحة التي أنت فيها (<bdi dir="ltr">/work</bdi>) واسمك، ولا يُرسل غير ذلك.</p>
<div class="fb-kinds" role="radiogroup" aria-label="نوع الملاحظة"><label class="on"><input type="radio" name="k" checked>فكرة</label><label><input type="radio" name="k">مشكلة</label><label><input type="radio" name="k">سؤال</label></div>
<label class="l">ملاحظتك<textarea class="fb-text" rows="5" maxlength="2000" placeholder="ما الذي جرى أو ما الذي تقترحه؟"></textarea></label><small class="muted">0 من 2000</small>
<div class="actions"><button class="primary fb-send">إرسال</button><button class="secondary">إلغاء</button></div></div></dialog></main></body></html>`,
  'inbox.html': `${head}<div class="tabs"><button>الاتصالات</button><button class="active">ملاحظات وأخطاء</button><button>السجل</button></div>
<section class="panel st-panel"><div class="st-feedback"><p class="muted">ملاحظات الأعضاء من زر الملاحظة في الشريط العلوي، والأخطاء التي التقطتها الصفحات نفسها (يُجمع المتشابه منها في سطر واحد بعدّاد). 2 جديد.</p>
<div class="fb-filters"><label>النوع<select><option>الكل</option></select></label><label>الحالة<select><option>الكل</option></select></label></div>
<ul class="fb-list">${item('error', 'خطأ في الصفحة', 'new', 'جديد', "Cannot read properties of undefined (reading 'title')", 'أحمد', 7)}${item('problem', 'مشكلة', 'new', 'جديد', 'زر الجدولة لا يستجيب عندما أختار موعداً قبل الساعة التاسعة صباحاً، وأحتاج إلى تكرار المحاولة ثلاث مرات.', 'سارة', 1)}${item('idea', 'فكرة', 'seen', 'اطُّلع عليه', 'أقترح أن يظهر عدّاد الحروف في كل نسخة منصة.', 'خالد', 1)}${item('question', 'سؤال', 'done', 'عولج', 'أين أجد سجل ما نُشر الأسبوع الماضي؟', 'منى', 1)}</ul></div></section></main></body></html>`,
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
  for (const width of [1280, 390]) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 } });
    const p = await ctx.newPage();
    await p.goto(base + 'note.html');
    const n = await p.evaluate(() => {
      const d = document.querySelector('dialog').getBoundingClientRect();
      const t = document.querySelector('.fb-text').getBoundingClientRect();
      const btn = [...document.querySelectorAll('.fb-form .actions button')].map((b) => b.getBoundingClientRect().height);
      return {
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        dialogInside: d.left >= -1 && d.right <= window.innerWidth + 1,
        textInside: t.left >= d.left - 1 && t.right <= d.right + 1,
        kinds: document.querySelectorAll('.fb-kinds label').length,
        minButton: Math.min(...btn),
        textRows: document.querySelector('.fb-text').rows,
      };
    });
    await p.screenshot({ path: path.join(out, `note-${width}.png`) });
    check(`${width}: the note dialog fits the screen with no sideways overflow`, !n.overflow && n.dialogInside, JSON.stringify(n));
    check(`${width}: the text box is inside the dialog`, n.textInside);
    check(`${width}: three kinds and buttons at least 42px high`, n.kinds === 3 && n.minButton >= 42, n.minButton);

    await p.goto(base + 'inbox.html');
    const b = await p.evaluate(() => ({
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      items: document.querySelectorAll('.fb-item').length,
      newMarked: document.querySelectorAll('.fb-item.new').length,
      inside: [...document.querySelectorAll('.fb-item')].every((i) => i.getBoundingClientRect().right <= window.innerWidth + 1 && i.getBoundingClientRect().left >= -1),
      counter: document.querySelector('.fb-item b').textContent,
    }));
    await p.screenshot({ path: path.join(out, `inbox-${width}.png`), fullPage: true });
    check(`${width}: the inbox lists notes and errors, new ones marked, no sideways overflow`, !b.overflow && b.items === 4 && b.newMarked === 2 && b.inside, JSON.stringify(b));
    check(`${width}: a repeated error shows its counter`, /تكرر 7 مرة/.test(b.counter), b.counter);
    await ctx.close();
  }
  await browser.close();
  server.close();
  const failed = result.checks.filter((c) => !c.pass);
  result.total = result.checks.length;
  result.passed = result.total - failed.length;
  fs.writeFileSync(path.join(__dirname, 'feedback-fixture.json'), JSON.stringify(result, null, 2));
  console.log(`${result.passed} of ${result.total}`);
  for (const f of failed) console.log('FAIL', f.name, f.detail);
  process.exit(failed.length ? 1 : 0);
})();

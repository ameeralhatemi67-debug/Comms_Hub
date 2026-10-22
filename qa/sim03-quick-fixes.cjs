// Browser check of the layout fixes taken from role simulation sim-20261015-03 (recorded in progress.md,
// 2026-10-22). The real stylesheets run in headless Edge over fixtures of the markup the components
// render; the signed-in application cannot be driven by an agent, so this checks the rules themselves.
// Each fix is also measured with the rule as it was before, to show the check can see the bug.
//  1. RESP-001: the Admin top bar on a phone. The «عرض بصفة» select kept 192 px inside a row that could
//     not wrap, so the page was about 392 px wide on 320 to 390 px phones.
//  2. «حسابات المنصات»: a platform heading was one row that could not wrap; «ربط عبر …» left the screen.
//  3. The create bar («إنشاء») was sticky 12 px from the foot, under the phone's bottom bar.
//  4. A library card: the video length sat on the stage chip («بحاجة إلى تعديل» read «احة إلى تعديل»).
// Usage: node qa/sim03-quick-fixes.cjs   (writes qa/sim03-quick-fixes.json)
const fs = require('node:fs');
const path = require('node:path');
const { dependency, launchOptions } = require('./runtime.cjs');
const { chromium } = dependency('playwright');

const root = path.resolve(__dirname, '..');
const out = path.join(__dirname, 'artifacts', 'sim03-quick-fixes');
const result = { script: 'qa/sim03-quick-fixes.cjs', run: new Date().toISOString(), checks: [] };
const check = (name, pass, detail = '') => result.checks.push({ name, pass: Boolean(pass), detail: String(detail) });
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
const sheets = ['globals.css', 'identity.css', 'media.css', 'kit.css', 'work.css'];
for (const f of sheets) fs.copyFileSync(path.join(root, 'src/app', f), path.join(out, f));

const svg = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor"/></svg>';
const roleNames = ['مدير الاتصال المؤسسي', 'مساعد مدير الاتصال المؤسسي', 'كاتب المحتوى', 'المصمم', 'المنتج الإعلامي', 'مسؤول النشر وإدارة الحسابات', 'عضو', 'Admin'];
const page = (body, extra = '') => `<!doctype html><html lang="ar" dir="rtl" data-identity="emerald" data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
${sheets.map((s) => `<link rel="stylesheet" href="${s}">`).join('')}${extra ? `<style>${extra}</style>` : ''}</head><body>${body}</body></html>`;
// The shell as src/components/shell.tsx renders it, with the Admin's role switch or a fixed role.
const shell = (admin, main) => `<div class="app-shell"><a class="skip" href="#main">انتقل إلى المحتوى</a><aside class="sidebar"><nav></nav></aside>
<div class="workspace"><header class="topbar"><a class="mobile-brand" href="#"><span class="brandmark">${svg}</span></a>
<button class="global-search">${svg}<span>ابحث في مركز الاتصال…</span></button>
<div class="top-actions"><span class="prototype">نموذج محلي · 0.1</span>
${admin ? `<label class="role-select">عرض بصفة<select aria-label="عرض بصفة">${roleNames.map((n) => `<option>${n}</option>`).join('')}</select></label>` : '<span class="role-fixed">عضو</span>'}
<button type="button" class="undo-button">${svg}</button><button type="button" class="fb-open">${svg}</button><button type="button" class="help-q">${svg}</button><button class="notification-button">${svg}</button>
</div></header><main id="main">${main}</main><footer class="app-footer">نموذج تجربة المستخدم</footer></div>
<nav class="mobile-nav">${['الرئيسية', 'العمل', 'إنشاء', 'الطلبات', 'المزيد'].map((t) => `<a href="#">${svg}${t}</a>`).join('')}</nav></div>`;

// 1. The top bar.
const OLD_TOP = '@media(max-width:699px){.top-actions{flex-wrap:nowrap;min-width:auto}.role-select{min-width:auto}.role-select select{width:192px}}';
fs.writeFileSync(path.join(out, 'top-admin.html'), page(shell(true, '<div class="wk"><h1>الرئيسية</h1></div>')));
fs.writeFileSync(path.join(out, 'top-admin-old.html'), page(shell(true, '<div class="wk"><h1>الرئيسية</h1></div>'), OLD_TOP));
fs.writeFileSync(path.join(out, 'top-member.html'), page(shell(false, '<div class="wk"><h1>الرئيسية</h1></div>')));

// 2. A platform section of «حسابات المنصات» (src/components/work/channels.tsx).
const psec = `<div class="wk"><section class="wk-psec"><h3>${svg}لينكدإن <span class="n">1</span>
<small class="wk-plat-meta">النشر محاكاة · المسار المخطط: تلقائي · التجهيز: جاهز للربط</small>
<button type="button" class="su-hint">كيف تربط حسابك</button>
<button type="button" class="wk-btn sm" id="connect">${svg}ربط عبر LinkedIn</button></h3></section></div>`;
fs.writeFileSync(path.join(out, 'channels.html'), page(shell(false, psec)));
fs.writeFileSync(path.join(out, 'channels-old.html'), page(shell(false, psec), '.wk .wk-psec>h3{flex-wrap:nowrap}'));

// 3. The create form's bar (src/components/work/create.tsx), at the end of a long form.
const filler = Array.from({ length: 30 }, (_, i) => `<section class="wk-fs"><h3>قسم ${i + 1}</h3><p>نص الحقل</p></section>`).join('');
const form = `<div class="wk"><form>${filler}<div class="wk-cbar" id="cbar"><span class="l">يُحفظ باسمك، ويصل إشعار إلى المسؤول وأصحاب المراحل.</span>
<button type="button" class="wk-btn quiet">إلغاء</button><button type="button" class="wk-btn" id="draft">حفظ مسودة</button><button type="button" class="wk-btn gold" id="start">${svg}إنشاء وبدء الإنتاج</button></div></form></div>`;
fs.writeFileSync(path.join(out, 'create.html'), page(shell(false, form)));
fs.writeFileSync(path.join(out, 'create-old.html'), page(shell(false, form), '@media (max-width:699px){.wk .wk-cbar{bottom:12px}}'));

// 4. A library card (src/components/media/library.tsx and parts.tsx), at the grid's narrowest column.
const card = `<div class="mx-grid" style="width:222px"><article class="mx-card"><button class="mx-thumb"><div class="fb" style="background:#355"></div>
<span class="badge" id="badge"><span class="mx-chip warn">بحاجة إلى تعديل</span></span><span class="dur" id="dur">0:05</span><span class="ver" id="ver">v1</span></button></article></div>`;
fs.writeFileSync(path.join(out, 'card.html'), page(`<main style="padding:16px">${card}</main>`));
fs.writeFileSync(path.join(out, 'card-old.html'), page(`<main style="padding:16px">${card}</main>`, '.mx-thumb .dur{top:auto;bottom:8px}'));

const overlap = (a, b) => Math.max(0, Math.min(a.r, b.r) - Math.max(a.l, b.l)) * Math.max(0, Math.min(a.b, b.b) - Math.max(a.t, b.t));

(async () => {
  const browser = await chromium.launch(launchOptions);
  const open = async (file, width, height = 844) => {
    const p = await browser.newPage({ viewport: { width, height } });
    await p.goto('file://' + path.join(out, file));
    await p.waitForTimeout(150);
    return p;
  };
  const boxes = (p, sels) =>
    p.evaluate((sels) => {
      const r = { scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth };
      for (const s of sels) {
        const e = document.querySelector(s);
        const b = e?.getBoundingClientRect();
        r[s] = b ? { l: b.left, t: b.top, r: b.right, b: b.bottom } : null;
      }
      return r;
    }, sels);
  try {
    // 1. Top bar.
    for (const w of [320, 360, 375, 390]) {
      const p = await open('top-admin.html', w);
      const m = await boxes(p, ['.topbar', '.role-select select']);
      if (w === 320) await p.screenshot({ path: path.join(out, 'top-admin-320.png') });
      await p.close();
      check(`Admin top bar fits a ${w} px phone`, m.scrollW <= m.clientW && m['.topbar'].r <= w + 0.5 && m['.topbar'].l >= -0.5, `page ${m.scrollW} px in ${m.clientW} px, bar ${Math.round(m['.topbar'].l)}..${Math.round(m['.topbar'].r)}`);
    }
    {
      const p = await open('top-admin-old.html', 320);
      const m = await boxes(p, ['.topbar']);
      await p.close();
      check('the fixture reproduces RESP-001 with the old rule: the Admin page is wider than 320 px', m.scrollW > 320, `page ${m.scrollW} px`);
      const q = await open('top-member.html', 320);
      const n = await boxes(q, ['.topbar']);
      await q.close();
      check('a member (no role switch) fitted before and fits now', n.scrollW <= 320, `page ${n.scrollW} px`);
    }
    // 2. Channels heading.
    for (const w of [390, 393, 412, 430]) {
      const p = await open('channels.html', w);
      const m = await boxes(p, ['#connect']);
      if (w === 390) await p.screenshot({ path: path.join(out, 'channels-390.png') });
      await p.close();
      check(`«ربط عبر LinkedIn» stays on a ${w} px screen`, m['#connect'].l >= -0.5 && m['#connect'].r <= w + 0.5 && m.scrollW <= m.clientW, `button ${Math.round(m['#connect'].l)}..${Math.round(m['#connect'].r)}, page ${m.scrollW} px`);
    }
    {
      const p = await open('channels-old.html', 390);
      const m = await boxes(p, ['#connect']);
      await p.close();
      check('the fixture reproduces the channels overflow with the old rule', m['#connect'].l < 0 || m.scrollW > 390, `button ${Math.round(m['#connect'].l)}..${Math.round(m['#connect'].r)}, page ${m.scrollW} px`);
    }
    // 3. Create bar against the bottom bar, scrolled to the middle of the form.
    const cbar = async (file) => {
      const p = await open(file, 390, 844);
      await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight / 2));
      await p.waitForTimeout(100);
      const m = await boxes(p, ['#cbar', '#start', '#draft', '.mobile-nav']);
      if (file === 'create.html') await p.screenshot({ path: path.join(out, 'create-390.png') });
      await p.close();
      return m;
    };
    {
      const m = await cbar('create.html');
      check('the create buttons sit above the phone bottom bar while scrolling', m['#start'].b <= m['.mobile-nav'].t + 0.5 && m['#draft'].b <= m['.mobile-nav'].t + 0.5, `buttons end ${Math.round(Math.max(m['#start'].b, m['#draft'].b))}, bar starts ${Math.round(m['.mobile-nav'].t)}`);
      check('the create bar is still stuck on screen (not left at the end of the form)', m['#cbar'].b <= 844 && m['#cbar'].t > 400, `bar ${Math.round(m['#cbar'].t)}..${Math.round(m['#cbar'].b)}`);
      const o = await cbar('create-old.html');
      check('the fixture reproduces the covered buttons with the old rule', overlap(o['#start'], o['.mobile-nav']) > 0 || overlap(o['#draft'], o['.mobile-nav']) > 0, `buttons end ${Math.round(Math.max(o['#start'].b, o['#draft'].b))}, bar starts ${Math.round(o['.mobile-nav'].t)}`);
    }
    // 4. Library card.
    {
      const p = await open('card.html', 1280, 600);
      const m = await boxes(p, ['#badge', '#dur', '#ver']);
      await p.locator('.mx-card').screenshot({ path: path.join(out, 'card.png') });
      await p.close();
      check('the video length no longer covers the stage chip', overlap(m['#badge'], m['#dur']) === 0, `chip ${JSON.stringify(m['#badge'])} length ${JSON.stringify(m['#dur'])}`);
      check('the video length does not cover the version pill', overlap(m['#ver'], m['#dur']) === 0, `version ${JSON.stringify(m['#ver'])}`);
      const q = await open('card-old.html', 1280, 600);
      const n = await boxes(q, ['#badge', '#dur']);
      await q.close();
      check('the fixture reproduces the covered chip with the old rule', overlap(n['#badge'], n['#dur']) > 0, `overlap ${Math.round(overlap(n['#badge'], n['#dur']))} px²`);
    }
  } finally {
    await browser.close();
  }
  result.pass = result.checks.every((c) => c.pass);
  result.passed = result.checks.filter((c) => c.pass).length;
  result.total = result.checks.length;
  fs.writeFileSync(path.join(__dirname, 'sim03-quick-fixes.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(`${result.passed}/${result.total} ${result.pass ? 'PASS' : 'FAIL'}`);
  for (const c of result.checks) if (!c.pass) console.log('FAIL', c.name, c.detail);
  process.exit(result.pass ? 0 : 1);
})();

// Browser check of the messaging message menu («المراسلة», the arrow beside a message).
// Bug found 2026-10-19: `.cx-main>*:not(.cx-wall){position:relative}` also matched the menu, which is drawn as a
// direct child of the conversation pane, so it lost `position:fixed`, stayed in the flow, took the full width of
// the pane, squeezed the message list to a few lines and pushed the composer up. The rule now leaves menus alone.
// The real stylesheets (globals, identity, media, chat) run in headless Edge over a fixture of the pane; the
// signed-in application cannot be driven by an agent, so the menu's own placement code (Pop) is checked by
// src arithmetic in tests/chat-menu.test.mjs.
// Usage: node qa/chat-menu.cjs   (writes qa/chat-menu.json)
const fs = require('node:fs');
const path = require('node:path');
const { dependency, launchOptions } = require('./runtime.cjs');
const { chromium } = dependency('playwright');

const root = path.resolve(__dirname, '..');
const out = path.join(__dirname, 'artifacts', 'chat-menu');
const result = { script: 'qa/chat-menu.cjs', run: new Date().toISOString(), checks: [] };
const check = (name, pass, detail = '') => result.checks.push({ name, pass: Boolean(pass), detail: String(detail) });
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
for (const f of ['globals.css', 'identity.css', 'media.css', 'mail.css', 'chat.css']) fs.copyFileSync(path.join(root, 'src/app', f), path.join(out, f));

const msgs = Array.from({ length: 6 }, (_, i) => `<div class="cx-m${i % 2 ? ' mine' : ''}"><div class="bub"><span class="tx">رسالة ${i + 1}</span><div class="ft">08:5${i}</div></div></div>`).join('');
const items = [['رد'], ['إعادة توجيه'], ['نسخ النص'], ['تمييز بنجمة'], ['تثبيت في المحادثة'], ['تحويل إلى مهمة'], ['تحويل إلى بريد رسمي'], ['إرسال إلى واتساب'], ['تعديل'], ['حذف للجميع']].map(([t]) => `<button type="button" role="menuitem">${t}</button>`).join('');
const html = (menu, extra = '') => `<!doctype html><html lang="ar" dir="rtl" data-identity="emerald" data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="globals.css"><link rel="stylesheet" href="identity.css"><link rel="stylesheet" href="media.css"><link rel="stylesheet" href="mail.css"><link rel="stylesheet" href="chat.css">${extra}</head>
<body><main style="padding:16px"><div class="ml"><div class="cx-wrap"><div class="cx"><aside class="cx-side"><div class="cx-side-h">قائمة</div></aside>
<section class="cx-main"><div class="cx-wall"></div><header class="cx-top"><b>دعيج الرشدان</b></header><div class="cx-msgs">${msgs}</div><div class="cx-cmp"><div class="cx-bar"><span><b>رد على دعيج:</b> hello</span></div><textarea></textarea></div>
${menu ? `<div class="mx-menu cx-menu" role="menu" style="left:240px;top:60px"><div class="cx-react-row"><button>تم</button><button>أطلعت</button></div><hr>${items}</div>` : ''}
</section></div></div></div></main></body></html>`;
fs.writeFileSync(path.join(out, 'closed.html'), html(false));
fs.writeFileSync(path.join(out, 'open.html'), html(true));
// The same fixture with the rule as it was before the fix, to show the check can see the bug.
fs.writeFileSync(path.join(out, 'old-rule.html'), html(true, '<style>.cx-main>*:not(.cx-wall){position:relative;z-index:1}</style>'));

(async () => {
  const browser = await chromium.launch(launchOptions);
  const measure = async (file) => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 827 } });
    await page.goto('file://' + path.join(out, file));
    await page.waitForTimeout(200);
    const r = await page.evaluate(() => {
      const box = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height }; };
      const menu = document.querySelector('.mx-menu');
      return { pos: menu ? getComputedStyle(menu).position : null, menu: box('.mx-menu'), msgs: box('.cx-msgs'), cmp: box('.cx-cmp'), main: box('.cx-main') };
    });
    if (file === 'open.html') await page.screenshot({ path: path.join(out, 'open.png') });
    await page.close();
    return r;
  };
  try {
    const closed = await measure('closed.html');
    const open = await measure('open.html');
    const old = await measure('old-rule.html');
    check('the fixture reproduces the bug with the old rule: the menu is in the flow and shrinks the message list', old.pos !== 'fixed' && old.msgs.h < closed.msgs.h - 50, `position=${old.pos}, list ${Math.round(old.msgs.h)} px against ${Math.round(closed.msgs.h)} px`);
    check('the menu is fixed to the screen', open.pos === 'fixed', open.pos);
    check('the menu is not as wide as the conversation: it keeps its own width', open.menu.w < 400 && open.menu.w >= 250, `${Math.round(open.menu.w)} px`);
    check('the message list keeps its height while the menu is open', Math.abs(open.msgs.h - closed.msgs.h) < 1, `${Math.round(open.msgs.h)} px against ${Math.round(closed.msgs.h)} px`);
    check('the composer (and its reply bar) stays where it was', Math.abs(open.cmp.t - closed.cmp.t) < 1 && Math.abs(open.cmp.h - closed.cmp.h) < 1, `top ${Math.round(open.cmp.t)} against ${Math.round(closed.cmp.t)}`);
    check('the menu is drawn above the conversation', open.menu && open.menu.t === 60, `top ${open.menu?.t}`);
  } finally {
    await browser.close();
  }
  const failed = result.checks.filter((c) => !c.pass);
  result.total = result.checks.length;
  result.passed = result.total - failed.length;
  result.failed = failed.length;
  fs.writeFileSync(path.join(__dirname, 'chat-menu.json'), JSON.stringify(result, null, 2));
  console.log(`${result.passed} of ${result.total} passed`);
  for (const f of failed) console.log('FAIL', f.name, '|', f.detail);
  process.exit(failed.length ? 1 : 0);
})();

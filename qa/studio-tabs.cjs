// Browser check of the tab bar of «استوديو الحركة» (Studio_Build_Plan.md Phase 1, MVP_draft.md 62).
// The real MotionTabBar (src/components/studio/motion-tabs.tsx) is rendered to markup with React on
// the server side of this script, placed in the page heading exactly as Title draws it, and laid out
// by the real stylesheets in headless Edge at a laptop and a phone width. Who sees the bar is decided
// by studioTabVisible and checked in tests/studio-access.test.mjs; this checks how it looks and that
// the heading of someone without the studio is the heading of before. The signed-in application
// cannot be driven by an agent.
// Usage: node qa/studio-tabs.cjs   (writes qa/studio-tabs.json)
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const ts = require('typescript');
const { dependency, launchOptions } = require('./runtime.cjs');
const { chromium } = dependency('playwright');

const root = path.resolve(__dirname, '..');
const out = path.join(__dirname, 'artifacts', 'studio-tabs');
const result = { script: 'qa/studio-tabs.cjs', run: new Date().toISOString(), checks: [] };
const check = (name, pass, detail = '') => result.checks.push({ name, pass: Boolean(pass), detail: String(detail) });
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

// The component file, compiled as it is; only its imports of the app's context and CSS are left out,
// and next/link becomes a plain anchor (what Link renders on the server).
const src = fs.readFileSync(path.join(root, 'src/components/studio/motion-tabs.tsx'), 'utf8')
  .split(/\r?\n/)
  .filter((l) => !/^import .*(@\/|\.\.\/caps|\.css')/.test(l) && !l.startsWith("'use client'"))
  .join('\n')
  .replace("import Link from 'next/link';", "const Link = ({ href, children, ...rest }) => React.createElement('a', { href, ...rest }, children);\nimport React from 'react';");
const js = ts.transpileModule(src, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX } }).outputText;
fs.writeFileSync(path.join(out, 'motion-tabs.mjs'), js);
for (const f of ['src/app/globals.css', 'src/app/identity.css', 'src/components/motion-studio.css', 'src/components/studio/motion-tabs.css'])
  fs.copyFileSync(path.join(root, f), path.join(out, path.basename(f)));

const heading = (actions) => `<header class="page-heading"><div><span class="eyebrow">مركز الاتصال المؤسسي</span><h1>استوديو الحركة</h1>
<p>ثلاثة أنواع من القوالب المتحركة: الأرقام، وتصاميم ريبين، وإطارات الفيديو.</p></div><div class="actions">${actions}</div></header>`;
const media = '<a href="/media" class="button">مكتبة الوسائط</a>';
const html = (body) => `<!doctype html><html lang="ar" dir="rtl" data-identity="emerald" data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="globals.css"><link rel="stylesheet" href="identity.css"><link rel="stylesheet" href="motion-studio.css"><link rel="stylesheet" href="motion-tabs.css"></head>
<body><main><div class="ms">${body}</div></main></body></html>`;

(async () => {
  const { renderToStaticMarkup } = require(path.join(root, 'node_modules/react-dom/server.js'));
  const React = require(path.join(root, 'node_modules/react'));
  const mod = await import('file://' + path.join(out, 'motion-tabs.mjs').replace(/\\/g, '/'));
  const templatesBar = renderToStaticMarkup(React.createElement(mod.MotionTabBar, { active: 'templates' }));
  const studioBar = renderToStaticMarkup(React.createElement(mod.MotionTabBar, { active: 'studio' }));
  fs.writeFileSync(path.join(out, 'holder.html'), html(heading(templatesBar + media)));
  fs.writeFileSync(path.join(out, 'studio.html'), html(heading(studioBar)));
  fs.writeFileSync(path.join(out, 'other.html'), html(heading(media)));

  const server = http.createServer((req, res) => {
    const file = path.join(out, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, ''));
    if (!file.startsWith(out) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': file.endsWith('.css') ? 'text/css' : 'text/html; charset=utf-8' });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch(launchOptions);
  const errors = [];
  const measure = async (file, width) => {
    const page = await browser.newPage({ viewport: { width, height: 800 } });
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(base + file);
    const r = await page.evaluate(() => {
      const box = (e) => { if (!e) return null; const b = e.getBoundingClientRect(); return { l: Math.round(b.left), r: Math.round(b.right), t: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height) }; };
      const links = [...document.querySelectorAll('.mt-tabs a')].map((a) => ({ text: a.textContent.trim(), href: a.getAttribute('href'), current: a.getAttribute('aria-current'), bg: getComputedStyle(a).backgroundColor, h: Math.round(a.getBoundingClientRect().height), icon: !!a.querySelector('svg') }));
      return { nav: box(document.querySelector('.mt-tabs')), label: document.querySelector('.mt-tabs')?.getAttribute('aria-label'), links, heading: box(document.querySelector('.page-heading')), actions: box(document.querySelector('.page-heading .actions')), media: box(document.querySelector('.page-heading .button')), scrollW: document.documentElement.scrollWidth, green: getComputedStyle(document.documentElement).getPropertyValue('--green').trim() };
    });
    await page.screenshot({ path: path.join(out, `${file.replace('.html', '')}-${width}.png`) });
    await page.close();
    return r;
  };
  try {
    for (const width of [1440, 390]) {
      const holder = await measure('holder.html', width);
      const studio = await measure('studio.html', width);
      const other = await measure('other.html', width);
      check(`${width}: the bar has two tabs, «قوالب الحركة» to /motion and «الاستوديو» to /motion/studio, each with an icon`,
        holder.links.length === 2 && holder.links[0].text === 'قوالب الحركة' && holder.links[0].href === '/motion' && holder.links[1].text === 'الاستوديو' && holder.links[1].href === '/motion/studio' && holder.links.every((l) => l.icon),
        JSON.stringify(holder.links.map((l) => [l.text, l.href])));
      check(`${width}: on the template tab «قوالب الحركة» is the current page, on the studio tab «الاستوديو»`,
        holder.links[0].current === 'page' && !holder.links[1].current && studio.links[1].current === 'page' && !studio.links[0].current, '');
      check(`${width}: the current tab is filled with the brand green, the other is not`,
        holder.links[0].bg !== holder.links[1].bg && holder.links[0].bg !== 'rgba(0, 0, 0, 0)', `${holder.links[0].bg} / ${holder.links[1].bg}`);
      check(`${width}: the bar has a name for screen readers`, holder.label === 'أقسام استوديو الحركة', holder.label);
      check(`${width}: nothing runs past the screen`, holder.scrollW <= width && studio.scrollW <= width, `${holder.scrollW} / ${studio.scrollW}`);
      check(`${width}: the bar sits inside the page heading`, holder.nav.l >= holder.heading.l - 1 && holder.nav.r <= holder.heading.r + 1, JSON.stringify(holder.nav));
      check(`${width}: without the studio there is no bar and the media button is where it was`,
        other.links.length === 0 && other.nav === null && other.media && other.media.h === holder.media.h, JSON.stringify(other.media));
      if (width === 390) {
        check('390: on a phone the bar takes the full row and each tab is at least 44 px tall', Math.abs(holder.nav.w - holder.actions.w) <= 2 && holder.links.every((l) => l.h >= 44), `${holder.nav.w} of ${holder.actions.w}; ${holder.links.map((l) => l.h)}`);
      } else {
        check('1440: on a laptop the bar and the media button share one row', Math.abs(holder.nav.t + holder.nav.h / 2 - (holder.media.t + holder.media.h / 2)) <= 4, `${holder.nav.t}/${holder.media.t}`);
      }
    }
    check('no page errors', errors.length === 0, errors.join(' | '));
  } finally {
    await browser.close();
    server.close();
  }
  const failed = result.checks.filter((c) => !c.pass);
  result.total = result.checks.length;
  result.passed = result.total - failed.length;
  result.failed = failed.length;
  fs.writeFileSync(path.join(__dirname, 'studio-tabs.json'), JSON.stringify(result, null, 2));
  console.log(`${result.passed} of ${result.total} passed`);
  for (const f of failed) console.log('FAIL', f.name, '|', f.detail);
  process.exit(failed.length ? 1 : 0);
})();

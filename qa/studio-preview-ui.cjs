// The editor with a plan (Desktop_Power_Ideas.md P-03, phase D10; MVP_draft.md 63.7): the real studio, bundled as
// qa/studio-ui.cjs bundles it (qa/fixtures/studio-ui.tsx, the router and the Supabase client stood in), run inside the
// development package with a measurement kept by the application, then in Edge with none.
//   Inside the application: the preview plays at «تلقائية» unless chosen otherwise, the menu offers it first with its
//   words, a play starts where the last play of the shape ended (the badge «تلقائية: 1/2», the canvas at half), the
//   person's own choice wins and is remembered.
//   In Edge: «كاملة» stays the default and «تلقائية» can be chosen.
// The measurement is the pilot laptop's RTX figures of tests/scale.test.mjs, saved through the application's own bridge
// (profile.save), which keys it to this application, Chromium, chip and driver itself.
// Usage: node qa/studio-preview-ui.cjs   (writes qa/studio-preview-ui.json)   Needs: npm run pack:dev, 127.0.0.1:3000 free.
const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');
const { dependency, launchOptions } = require('./runtime.cjs');
const { chromium } = dependency('playwright');
const h = require('./desktop-helpers.cjs');
const { makeMedia, fontCss, serve, root } = require('./studio-media.cjs');
const d10 = require('./studio-d10.cjs');

const { check, note, result, finish } = h.record('qa/studio-preview-ui.cjs');
const out = path.join(__dirname, 'artifacts', 'studio-preview-ui');
const RTX = {
  v: 1, encode: { h264_1080: { hw: 87.7, sw: 43 }, h264_2160: { hw: 22.8, sw: 13.5 } }, decode: { h264_2160: { hw: 101.7, sw: 95.7 } },
  lanes: [79.7, 184.8, 186.5], compose: { plain: 1.2, text: 3, effects: 7 }, exportFps: 70,
  support: { hevcEncode: false, av1Encode: true, tenBitEncode: false, hevcDecode: true, av1Decode: true }, runs: 3, spread: 5, seconds: 30, renderer: 'RTX',
};

const page = `<!doctype html><html lang="ar" dir="rtl" data-identity="emerald" data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="/css/globals.css"><link rel="stylesheet" href="/css/identity.css"><link rel="stylesheet" href="/bundle.css">
<style>${fontCss()} body{font-family:var(--font-sans,"IBM Plex Sans Arabic")} main{padding:16px}</style></head>
<body><div id="root"></div><script type="module" src="/bundle.js"></script></body></html>`;

async function build() {
  await esbuild.build({
    entryPoints: [path.join(__dirname, 'fixtures', 'studio-ui.tsx')],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    jsx: 'automatic',
    outfile: path.join(out, 'bundle.js'),
    alias: {
      'next/navigation': path.join(__dirname, 'fixtures', 'fake-next.tsx'),
      'next/link': path.join(__dirname, 'fixtures', 'fake-next.tsx'),
      '@/lib/supabase/client': path.join(__dirname, 'fixtures', 'fake-supabase.ts'),
    },
    define: { 'process.env.NODE_ENV': '"production"' },
    loader: { '.png': 'file', '.woff2': 'file', '.woff': 'file' },
    logLevel: 'silent',
    absWorkingDir: root,
  });
}

/** A new 16:9 video project with the library's video on it, opened in the editor. */
async function openProject(tab, base) {
  await tab.goto(base + '/motion/studio');
  await tab.evaluate(() => window.__db.reset());
  await tab.reload();
  await tab.getByRole('button', { name: 'مشروع فيديو جديد' }).click({ timeout: 20000 });
  await tab.getByLabel('اسم المشروع').fill('معاينة تلقائية');
  await tab.getByRole('radio', { name: /عرضي 16:9/ }).click();
  await tab.getByRole('button', { name: 'إنشاء وفتح' }).click();
  await tab.locator('.st-editor').waitFor({ timeout: 20000 });
  await tab.locator('.st-lib button', { hasText: 'ألوان الحملة' }).click();
  await tab.locator('.st-clip[data-kind="video"]').waitFor();
  await tab.waitForFunction(() => !document.querySelector('.st-clip-load'), null, { timeout: 20000 });
  await tab.waitForTimeout(600);
}

const label = (tab) => tab.locator('.st-res > button span').textContent();
async function menu(tab) {
  await tab.locator('.st-res > button').click();
  const row = tab.locator('.st-res-pop [role="radiogroup"]').first();
  const r = {
    first: await row.getByRole('radio').first().textContent(),
    checked: await row.locator('[aria-checked="true"]').textContent(),
    hint: await tab.locator('.st-res-pop .st-hint').first().textContent(),
  };
  await tab.locator('body').press('Escape');
  return r;
}
/**
 * Waits until the project is saved (its autosave runs after 15 s), so a reload is never asked «leave with unsaved
 * changes?»; a prompt that still comes is accepted where the page is listened to.
 */
async function saved(tab) {
  await tab.locator('.st-save.st-save-saved').waitFor({ timeout: 40000 });
}

/** Plays for `ms` and reads the badge and the canvas's width while playing, then pauses. */
async function playing(tab, ms) {
  await tab.locator('.st-play').click();
  await tab.waitForTimeout(ms);
  const r = { badge: await tab.locator('.st-res-badge').textContent().catch(() => null), width: await tab.evaluate(() => document.querySelector('.st-canvas').width) };
  await tab.locator('.st-play').click();
  await tab.waitForTimeout(300);
  return r;
}

(async () => {
  let server = null;
  // the lock of 127.0.0.1:3000, named after this worktree's branch and freed however the process ends
  const port = d10.portLock();
  try {
    fs.rmSync(out, { recursive: true, force: true });
    fs.mkdirSync(out, { recursive: true });
    makeMedia(out);
    await build();
    if (!port.take()) throw new Error(`${port.file} exists: another check holds 127.0.0.1:3000`);
    if (await h.portAnswers(3000)) throw new Error('something already answers on 127.0.0.1:3000');
    const pages = (p) => (p === '/' || p.startsWith('/motion/studio') ? page : undefined);
    const s = await serve(out, pages);
    server = s.server;
    // the development package opens 127.0.0.1:3000 only: the same server, on that port
    await new Promise((r) => server.close(r));
    await h.listen(server, 3000);
    const base = 'http://127.0.0.1:3000';

    // --- inside the application, with a measurement --------------------------------------------------
    const { app, win } = await h.launchDev('preview-ui', { settings: { keepInTray: false, gpu: 'strong' }, args: [...d10.VISIBLE_ARGS] });
    // a «leave with unsaved changes?» prompt is answered, never left to the driver
    win.on('dialog', (d) => void d.accept().catch(() => undefined));
    try {
      await h.until(() => win.url().startsWith(base), 30000);
      await win.waitForLoadState('load');
      await d10.toFront(app, win);
      const saved = await win.evaluate(async (n) => {
        const b = window.commsHubNative;
        const e = await b.profile.save(n);
        const p = await b.profile.read();
        return { key: e.key, current: p.current, entries: p.entries.length };
      }, RTX);
      check('the application keeps the measurement under its own key (this application, Chromium, chip and driver)', saved.entries === 1 && saved.key.app === saved.current.app && saved.key.chrome === saved.current.chrome && saved.key.chip.deviceId === saved.current.chip.deviceId, saved);
      await openProject(win, base);
      const first = await label(win);
      const m = await menu(win);
      check('with a measurement the preview plays at «تلقائية» and pauses at «كاملة» unless chosen otherwise', first === 'تلقائية / كاملة' && m.checked === 'تلقائية', { label: first, menu: m });
      check('«تلقائية» is the first choice of «أثناء التشغيل», with its words', m.first === 'تلقائية' && m.hint === 'تلقائية: تنزل دقة المعاينة أثناء التشغيل حين تفوتها إطارات، وتعود حين يستقر التشغيل.', m);
      const fullW = await win.evaluate(() => document.querySelector('.st-canvas').width);
      // a throttled window misses frames and «تلقائية» steps down for it: refused before any play
      await d10.assertDrawing(win, 'the editor');
      const calm = await playing(win, 1500);
      check('a light project plays at full under «تلقائية» from the plan\'s start (no badge)', calm.badge === null && calm.width === fullW, { ...calm, fullW });
      // the level a play of this shape ended on, kept on this device, is the start of the next one
      await win.evaluate(() => localStorage.setItem('studio.pref.auto-resolution', JSON.stringify({ '16:9': 0.5 })));
      await saved(win);
      await win.reload();
      await win.locator('.st-editor').waitFor({ timeout: 20000 });
      await win.waitForFunction(() => !document.querySelector('.st-clip-load'), null, { timeout: 20000 });
      await win.waitForTimeout(600);
      const half = await playing(win, 1200);
      check('a play starts where the last play of the shape ended: «تلقائية: 1/2» and the canvas at half', half.badge === 'تلقائية: 1/2' && Math.abs(half.width - fullW / 2) <= 2, { ...half, fullW });
      const back = await win.evaluate(() => document.querySelector('.st-canvas').width);
      check('paused, the preview is at «كاملة» again', back === fullW, { back, fullW });
      // the person's own choice wins and is remembered
      await win.locator('.st-res > button').click();
      await win.locator('.st-res-pop [role="radiogroup"]').first().getByRole('radio', { name: 'كاملة' }).click();
      await win.locator('body').press('Escape');
      await saved(win);
      await win.reload();
      await win.locator('.st-editor').waitFor({ timeout: 20000 });
      check('a resolution the person chose wins over the plan and is remembered', (await label(win)) === 'كاملة', await label(win));
      const sys = await win.evaluate(() => ({ dpr: window.devicePixelRatio, renderer: (() => { const g = document.createElement('canvas').getContext('webgl'); const e = g?.getExtension('WEBGL_debug_renderer_info'); return g && e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : null; })() }));
      note(`Inside the application: ${JSON.stringify(sys)}, the stage canvas ${fullW} pixels wide at «كاملة».`);
    } finally {
      await h.closeAll();
    }

    // --- in Edge, with none ------------------------------------------------------------------------
    const browser = await chromium.launch(launchOptions);
    try {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
      const tab = await ctx.newPage();
      await openProject(tab, base);
      const l = await label(tab);
      const m = await menu(tab);
      check('in a browser «كاملة» stays the default, and «تلقائية» is offered first', l === 'كاملة' && m.checked === 'كاملة' && m.first === 'تلقائية', { label: l, menu: m });
      await tab.locator('.st-res > button').click();
      await tab.locator('.st-res-pop [role="radiogroup"]').first().getByRole('radio', { name: 'تلقائية' }).click();
      await tab.locator('body').press('Escape');
      check('in a browser «تلقائية» can be chosen', (await label(tab)) === 'تلقائية / كاملة', await label(tab));
    } finally {
      await browser.close();
    }
  } catch (e) {
    check('the check ran to the end', false, e.stack || String(e));
  } finally {
    await h.closeAll();
    if (server) server.close();
    port.free();
    process.exitCode = finish(path.join(__dirname, 'studio-preview-ui.json')) ? 1 : 0;
  }
})();

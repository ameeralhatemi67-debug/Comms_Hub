// «توحيد مستوى الصوت» with the loudness worked out ahead (Desktop_Power_Ideas.md P-15; MVP_draft.md 62.9), in Edge:
//   - the module (qa/fixtures/studio-loudness-ahead.ts) on a two-minute project with sound: the figure worked out
//     ahead equals the export's own measurement within 0.1 LU, an export with «توحيد مستوى الصوت» then uses it, and
//     the time from pressing export to the first encoded frame is recorded as it was (measured first) and now;
//     a change of volume is measured again, a picture moved is not;
//   - the real export panel (qa/fixtures/studio-ui.tsx, as qa/studio-ui.cjs runs it): the figure appears by itself
//     while the panel is open, and an export with «توحيد مستوى الصوت» starts without «جارٍ قياس مستوى الصوت».
// Timings are of this laptop as it is; the load is recorded beside them.
// Usage: node qa/studio-loudness-ahead.cjs   (writes qa/studio-loudness-ahead.json)
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const esbuild = require('esbuild');
const { dependency, launchOptions } = require('./runtime.cjs');
const { chromium } = dependency('playwright');
const { makeMedia, fontCss, serve, root, IDS } = require('./studio-media.cjs');
const h = require('./desktop-helpers.cjs');

const { check, note, result, finish } = h.record('qa/studio-loudness-ahead.cjs');
const out = path.join(__dirname, 'artifacts', 'studio-loudness-ahead');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
makeMedia(out);
// two minutes of 640x360 with speech-like sound: a tone that rises and falls, and noise
const ff = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=30:duration=120', '-f', 'lavfi', '-i', "aevalsrc='0.3*sin(2*PI*(300+200*sin(2*PI*t/7))*t)*(0.6+0.4*sin(2*PI*t/3))':s=48000:d=120", '-f', 'lavfi', '-i', 'anoisesrc=d=120:c=pink:a=0.03:r=48000',
  '-filter_complex', '[1:a][2:a]amix=inputs=2:normalize=0[a]', '-map', '0:v', '-map', '[a]', '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-g', '60', '-c:a', 'aac', '-b:a', '128k', path.join(out, 'long.mp4')], { encoding: 'utf8' });
if (ff.status !== 0) throw new Error(ff.stderr);
IDS['00000000-0000-4000-8000-0000000000d1'] = 'long.mp4';
const load = () => Number(h.ps('(Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average')) || null;

async function build() {
  await esbuild.build({ entryPoints: [path.join(__dirname, 'fixtures', 'studio-loudness-ahead.ts')], bundle: true, format: 'esm', platform: 'browser', target: 'es2022', outfile: path.join(out, 'ahead.js'), logLevel: 'silent', absWorkingDir: root });
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

const studioPage = `<!doctype html><html lang="ar" dir="rtl" data-identity="emerald" data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="/css/globals.css"><link rel="stylesheet" href="/css/identity.css"><link rel="stylesheet" href="/bundle.css">
<style>${fontCss()} body{font-family:var(--font-sans,"IBM Plex Sans Arabic")} main{padding:16px}</style></head>
<body><div id="root"></div><script type="module" src="/bundle.js"></script></body></html>`;
const aheadPage = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"></head><body><script type="module" src="/ahead.js"></script></body></html>`;

async function panelFlow(browser, base, errors) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  const tab = await ctx.newPage();
  tab.on('pageerror', (e) => errors.push(e.message));
  tab.on('console', (m) => m.type() === 'error' && !/^Failed to load resource/.test(m.text()) && errors.push(m.text()));
  await tab.goto(base + '/motion/studio');
  await tab.evaluate(() => window.__db.reset());
  await tab.reload();
  await tab.getByRole('button', { name: 'مشروع فيديو جديد' }).click();
  await tab.getByLabel('اسم المشروع').fill('مقطع الصوت');
  await tab.getByRole('button', { name: 'إنشاء وفتح' }).click();
  await tab.locator('.st-editor').waitFor({ timeout: 15000 });
  await tab.locator('.st-lib button', { hasText: 'ألوان الحملة' }).click();
  await tab.locator('.st-clip[data-kind="video"]').waitFor();
  await tab.waitForFunction(() => !document.querySelector('.st-clip-load'), null, { timeout: 15000 });
  await tab.locator('.st-ws-tab[data-panel="export"]').click();
  const hint = tab.locator('.st-level .st-hint', { hasText: 'قيس مستوى الصوت مسبقاً' });
  const t0 = Date.now();
  await hint.waitFor({ timeout: 30000 });
  const said = await hint.textContent();
  check('panel: while the export panel is open, the sound\'s level is worked out by itself and said', /LUFS/.test(said), { said, ms: Date.now() - t0 });
  // with «توحيد مستوى الصوت», the export goes straight to its frames
  await tab.locator('.st-export').getByRole('radio', { name: '720p' }).click();
  await tab.locator('.st-level label.st-switch-row', { hasText: 'توحيد مستوى الصوت' }).click();
  const labels = [];
  await tab.exposeFunction('__label', (t) => labels.push(t));
  await tab.evaluate(() => {
    new MutationObserver(() => {
      const s = document.querySelector('.st-export .st-progress span');
      if (s) window.__label(s.textContent);
    }).observe(document.body, { subtree: true, childList: true, characterData: true });
  });
  const download = tab.waitForEvent('download', { timeout: 120000 });
  await tab.getByRole('button', { name: 'تصدير وتنزيل' }).click();
  const file = await download;
  await file.saveAs(path.join(out, 'panel.mp4'));
  await tab.locator('.st-export .st-done').waitFor({ timeout: 30000 });
  const measured = labels.filter((l) => /قياس مستوى الصوت/.test(l));
  const level = await tab.locator('.st-level .st-hint[role="status"]').textContent().catch(() => '');
  check('panel: an export with «توحيد مستوى الصوت» starts without measuring again, and says the level before and after', measured.length === 0 && labels.some((l) => /جارٍ التصدير/.test(l)) && /كان الصوت .* وصار في الملف نحو/.test(level), { measured, labels: [...new Set(labels)].slice(0, 6), level });
  // the file is at the target
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', path.join(out, 'panel.mp4'), '-af', 'ebur128', '-f', 'null', '-'], { encoding: 'utf8' });
  const m = [...r.stderr.matchAll(/I:\s+(-?[\d.]+) LUFS/g)].pop();
  const lufs = m ? Number(m[1]) : null;
  check('panel: the file is at -14 LUFS within 1 LU (ffmpeg)', lufs !== null && Math.abs(lufs - -14) <= 1, { lufs });
  await tab.screenshot({ path: path.join(out, 'panel-1440.png') });
  await ctx.close();
}

(async () => {
  let server;
  let browser;
  const errors = [];
  try {
    await build();
    ({ server } = await serve(out, (p) => (p.startsWith('/motion/studio') ? studioPage : p === '/ahead' ? aheadPage : undefined)));
    const base = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch(launchOptions);
    result.engine = browser.version();
    const tab = await browser.newPage();
    tab.on('pageerror', (e) => errors.push(e.message));
    await tab.goto(base + '/ahead');
    await tab.waitForFunction(() => !!window.ahead, null, { timeout: 30000 });
    const loadBefore = load();
    const r = await tab.evaluate(() => window.ahead.run());
    r.load = [loadBefore, load()];
    result.module = r;
    check('the two-minute source is ready', r.ready === true);
    check('worked out ahead, the loudness equals the export\'s own measurement within 0.1 LU, and the peak too', r.ahead && Math.abs(r.ahead.integrated - r.fresh.integrated) <= 0.1 && Math.abs(r.ahead.peakDb - r.fresh.peakDb) <= 0.1 && Math.abs(r.before.integrated - r.fresh.integrated) <= 0.1, { ahead: r.ahead, fresh: r.fresh, before: r.before.integrated });
    check('an export with «توحيد مستوى الصوت» after it uses the stored figure and reaches its first frame sooner', r.after.cached === true && r.before.cached === false && r.after.ms < r.before.ms, { before: r.before.ms, after: r.after.ms, aheadMs: r.aheadMs, load: r.load });
    check('a change of volume is measured again (about 6 dB quieter); a picture moved keeps the stored figure', r.quieterStored === false && r.quieter.cached === false && Math.abs(r.fresh.integrated - r.quieter.integrated - 6.02) <= 0.2 && r.movedSameKey && r.movedStored, { quieter: r.quieter, fresh: r.fresh.integrated, moved: [r.movedSameKey, r.movedStored] });
    await panelFlow(browser, base, errors);
  } catch (e) {
    check('the check ran to its end', false, String((e && e.stack) || e));
  } finally {
    check('no page errors', errors.length === 0, errors.join(' | '));
    if (browser) await browser.close();
    if (server) server.close();
  }
  note('Times are of this laptop as it was during the run, with the load recorded beside them; they are not a speed figure.');
  const failed = finish(path.join(__dirname, 'studio-loudness-ahead.json'));
  process.exit(failed ? 1 : 0);
})();

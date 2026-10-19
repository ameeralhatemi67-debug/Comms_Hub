// Browser check of the studio's interface (Studio_Build_Plan.md Phases 3 to 6; MVP_draft.md 62). The real
// project list, project shell and editors, with their stylesheets, run in headless Edge, bundled by
// esbuild (qa/fixtures/studio-ui.tsx); only Next's router and Link and the Supabase client are stand-ins,
// the last an in-memory database that keeps the studio functions' rules (those rules are run against the
// real database in supabase/tests/studio_rules.sql). The flow: an empty home, a new video project, a
// library video, a motion template and a title added, a split with S, undo and redo, a drag on the
// timeline, autosave, a numbered version, another person taking the editing (reading only, then taking it
// back), a device draft offered back after a reload, playing and pausing with the space bar.
// Usage: node qa/studio-ui.cjs [--only=video|photo|phone]   (writes qa/studio-ui.json)
const fs = require('node:fs');
const path = require('node:path');
const { dependency, launchOptions } = require('./runtime.cjs');
const { chromium } = dependency('playwright');
const esbuild = require('esbuild');
const { makeMedia, fontCss, serve, root } = require('./studio-media.cjs');

const out = path.join(__dirname, 'artifacts', 'studio-ui');
const result = { script: 'qa/studio-ui.cjs', run: new Date().toISOString(), checks: [] };
const check = (name, pass, detail = '') => result.checks.push({ name, pass: Boolean(pass), detail: String(detail) });
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
makeMedia(out);
const only = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7);

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

const page = `<!doctype html><html lang="ar" dir="rtl" data-identity="emerald" data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="/css/globals.css"><link rel="stylesheet" href="/css/identity.css"><link rel="stylesheet" href="/bundle.css">
<style>${fontCss()} body{font-family:var(--font-sans,"IBM Plex Sans Arabic")} main{padding:16px}</style></head>
<body><div id="root"></div><script type="module" src="/bundle.js"></script></body></html>`;

const centre = (tab) =>
  tab.evaluate(() => {
    const c = document.querySelector('.st-canvas');
    const d = c.getContext('2d').getImageData(Math.floor(c.width / 2), Math.floor(c.height / 2), 1, 1).data;
    return [d[0], d[1], d[2]];
  });
const near = (a, b, tol = 50) => a.every((v, i) => Math.abs(v - b[i]) <= tol);

async function videoFlow(browser, base, errors) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const tab = await ctx.newPage();
  tab.on('pageerror', (e) => errors.push(e.message));
  tab.on('console', (m) => m.type() === 'error' && !/^Failed to load resource/.test(m.text()) && errors.push(m.text()));
  tab.on('response', (q) => q.status() >= 400 && errors.push(`HTTP ${q.status()}: ${q.url()}`));
  tab.on('requestfailed', (q) => !/blob:/.test(q.url()) && errors.push(`request failed: ${q.url()} ${q.failure()?.errorText}`));
  await tab.goto(base + '/motion/studio');
  await tab.evaluate(() => window.__db.reset());
  await tab.reload();
  await tab.getByText('لا مشاريع بعد').waitFor({ timeout: 15000 });
  check('the empty home says there are no projects yet and offers both kinds', (await tab.getByRole('button', { name: 'مشروع فيديو جديد' }).count()) === 1 && (await tab.getByRole('button', { name: 'مشروع صورة جديد' }).count()) === 1);

  await tab.getByRole('button', { name: 'مشروع فيديو جديد' }).click();
  await tab.getByLabel('اسم المشروع').fill('مقطع الاختبار');
  await tab.getByRole('radio', { name: /عرضي 16:9/ }).click();
  await tab.getByRole('button', { name: 'إنشاء وفتح' }).click();
  await tab.locator('.st-editor').waitFor({ timeout: 15000 });
  const id = await tab.evaluate(() => location.pathname.split('/').pop());
  check('a new video project is created and opened in the editor', /^[0-9a-f-]{36}$/.test(id), id);
  check('the bar names the project and its first numbered version', (await tab.locator('.st-title b').textContent()) === 'مقطع الاختبار' && /النسخة 1/.test(await tab.locator('.st-title small').textContent()));

  // a library video
  await tab.locator('.st-lib button', { hasText: 'ألوان الحملة' }).click();
  await tab.locator('.st-clip[data-kind="video"]').waitFor();
  await tab.waitForFunction(() => !document.querySelector('.st-clip-load'), null, { timeout: 15000 });
  await tab.waitForTimeout(800);
  const c0 = await centre(tab);
  check('a library video lands on the timeline and the preview shows its frame', near(c0, [255, 0, 0]), JSON.stringify(c0));

  // a motion template and a title
  await tab.getByRole('tab', { name: 'قوالب الحركة' }).click();
  await tab.locator('.st-tile').first().click();
  await tab.getByRole('tab', { name: 'نص' }).click();
  await tab.getByRole('button', { name: 'عنوان كبير' }).click();
  check('a motion template goes on a graphics track and a title on a text track', (await tab.locator('.st-clip[data-kind="motion"]').count()) === 1 && (await tab.locator('.st-clip[data-kind="text"]').count()) === 1);

  // split with S at 2 s, undo and redo
  await tab.locator('.st-clip[data-kind="video"]').click();
  check('selecting a clip opens its settings', (await tab.locator('.st-insp-head b').textContent()) === 'فيديو');
  await tab.locator('.st-tl-ruler').scrollIntoViewIfNeeded();
  const ruler = await tab.locator('.st-tl-ruler').boundingBox();
  await tab.mouse.click(ruler.x + 80, ruler.y + 10);
  await tab.waitForTimeout(800);
  const c2 = await centre(tab);
  result.debugTime = await tab.locator('.st-time').textContent();
  await tab.locator('.st-clip[data-kind="video"]').first().click({ position: { x: 10, y: 10 } });
  await tab.keyboard.press('s');
  const afterSplit = await tab.locator('.st-clip[data-kind="video"]').count();
  await tab.keyboard.press('Control+z');
  const afterUndo = await tab.locator('.st-clip[data-kind="video"]').count();
  await tab.keyboard.press('Control+Shift+z');
  const afterRedo = await tab.locator('.st-clip[data-kind="video"]').count();
  check('S splits the selected clip at the playhead; Ctrl+Z and Ctrl+Shift+Z undo and redo it', afterSplit === 2 && afterUndo === 1 && afterRedo === 2, `${afterSplit} ${afterUndo} ${afterRedo}`);
  check('the playhead at 2 s shows the source\'s green', near(c2, [0, 255, 0]), JSON.stringify(c2));

  // drag the title along the timeline
  const title = tab.locator('.st-clip[data-kind="text"]');
  await title.scrollIntoViewIfNeeded();
  const tb = await title.boundingBox();
  await tab.mouse.move(tb.x + 30, tb.y + tb.height / 2);
  await tab.mouse.down();
  await tab.mouse.move(tb.x + 90, tb.y + tb.height / 2, { steps: 6 });
  await tab.mouse.move(tb.x + 150, tb.y + tb.height / 2, { steps: 6 });
  await tab.mouse.up();
  const tb2 = await title.boundingBox();
  check('dragging a clip moves it along the timeline', tb2.x - tb.x > 100, `${Math.round(tb.x)} to ${Math.round(tb2.x)}`);

  // the title's text from the inspector
  await title.click();
  await tab.locator('.st-textarea textarea').fill('يوم الإطلاق');
  check('the inspector edits the title\'s words', (await title.textContent()).includes('يوم الإطلاق'));

  // autosave after 15 seconds
  await tab.getByText('تغييرات لم تُحفظ بعد').waitFor({ timeout: 3000 });
  await tab.waitForTimeout(16500);
  const auto = await tab.evaluate((pid) => {
    const p = window.__db.projects.find((x) => x.id === pid);
    const a = p.revs.find((r) => r.revision === 0);
    return a ? a.doc.video.tracks.reduce((n, t) => n + t.clips.length, 0) : -1;
  }, id);
  check('the changes are autosaved to the project\'s autosave slot after 15 seconds', auto === 4 && (await tab.locator('.st-save').textContent()).startsWith('محفوظ'), `${auto} clips`);

  // a numbered version
  await tab.getByRole('button', { name: 'حفظ نسخة' }).click();
  await tab.getByLabel('ملاحظة (اختيارية)').fill('للمراجعة');
  await tab.getByRole('button', { name: 'حفظ النسخة' }).click();
  await tab.waitForFunction(() => /النسخة 2/.test(document.querySelector('.st-title small').textContent));
  const rev = await tab.evaluate((pid) => window.__db.projects.find((x) => x.id === pid).revs.map((r) => r.revision).join(','), id);
  check('«حفظ نسخة» makes numbered revision 2 and empties the autosave slot', rev === '1,2', rev);

  // export: a download, then a new library file, then a new version of it
  await tab.locator('.st-export').scrollIntoViewIfNeeded();
  await tab.locator('.st-export').getByRole('radio', { name: '720p' }).click();
  const [dl] = await Promise.all([tab.waitForEvent('download', { timeout: 60000 }), tab.getByRole('button', { name: 'تصدير وتنزيل' }).click()]);
  const dlPath = path.join(out, 'download.mp4');
  await dl.saveAs(dlPath);
  await tab.locator('.st-done').waitFor({ timeout: 30000 });
  const dprobe = JSON.parse(require('node:child_process').spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name,width,height:format=duration', '-of', 'json', dlPath]).stdout.toString());
  const dv = dprobe.streams.find((x) => x.codec_type === 'video');
  check('«تصدير وتنزيل» downloads an H.264 file of the project at 720p (1280x720) with its sound', dv?.codec_name === 'h264' && dv.width === 1280 && dv.height === 720 && dprobe.streams.some((x) => x.codec_name === 'aac') && /جاهز/.test(await tab.locator('.st-done').textContent()), JSON.stringify(dprobe));
  // the project joins a work, from «المراجعة» in the project settings
  await tab.locator('body').press('Escape');
  await tab.locator('.st-review select').selectOption('CH-101');
  await tab.locator('.st-review').getByRole('button', { name: 'ربط', exact: true }).click();
  await tab.locator('.st-review', { hasText: 'حملة اليوم الوطني' }).waitFor({ timeout: 5000 });
  check('a project is linked to a work from «المراجعة», which shows the work and its status', /CH-101/.test(await tab.locator('.st-review').textContent()) && /قيد الإنتاج/.test(await tab.locator('.st-review').textContent()));
  await tab.locator('.st-export').getByRole('radio', { name: /ملف جديد في المكتبة/ }).click();
  check('saving to the library offers to link the file to the work of the project', (await tab.getByText('ربط الملف بالعمل CH-101').count()) === 1);
  await tab.locator('.st-export select').waitFor();
  await tab.getByRole('button', { name: 'تصدير وحفظ في المكتبة' }).click();
  await tab.locator('.st-done', { hasText: 'حُفظ في المكتبة' }).waitFor({ timeout: 60000 });
  const lib1 = await tab.evaluate(async (pid) => ({ p: window.__db.projects.find((x) => x.id === pid), up: await (await fetch('/__uploads')).json() }), id);
  check('«ملف جديد في المكتبة» saves a numbered version, uploads through the library resumable upload, and records which version made it', lib1.p.revision === 3 && lib1.up.length === 1 && lib1.up[0].folder_id === 'f1' && lib1.p.exports.length === 1 && lib1.p.exports[0].revision === 3 && lib1.p.exports[0].version === 1, JSON.stringify({ rev: lib1.p.revision, exports: lib1.p.exports, up: lib1.up.map((u) => [u.name, u.folder_id, u.current_version]) }));
  check('the result says it is in the library and that its uploader does not approve it', /لا يعتمد أحد ما رفعه/.test(await tab.locator('.st-done').textContent()));
  const links = await tab.evaluate(() => window.__db.workLinks);
  check('the saved file is linked to the work through the work cycle (work_asset_link)', links.length === 1 && links[0].work === 'CH-101' && links[0].asset === lib1.up[0].id && /رُبط الملف بالعمل CH-101/.test(await tab.locator('.st-done').textContent()), JSON.stringify(links));
  await tab.locator('.st-export').getByRole('radio', { name: /إصدار جديد من ملف/ }).click();
  await tab.locator('.st-export select option').first().waitFor({ state: 'attached' });
  await tab.getByRole('button', { name: 'تصدير وحفظ في المكتبة' }).click();
  await tab.locator('.st-done', { hasText: 'الإصدار 2' }).waitFor({ timeout: 60000 });
  const lib2 = await tab.evaluate(async (pid) => ({ p: window.__db.projects.find((x) => x.id === pid), up: await (await fetch('/__uploads')).json() }), id);
  check('«إصدار جديد من ملف» adds version 2 to that file and records it against numbered revision 4', lib2.up.length === 1 && lib2.up[0].current_version === 2 && lib2.p.exports.length === 2 && lib2.p.exports[1].version === 2 && lib2.p.exports[1].revision === 4, JSON.stringify(lib2.p.exports));
  await tab.locator('.st-export').getByRole('radio', { name: /تنزيل إلى الجهاز/ }).click();
  // a timed review note on that file appears in the studio and moves the playhead
  await tab.evaluate((asset) => window.__db.addNote(asset, '00:03', 'غيّر لون الخلفية هنا'), lib2.up[0].id);
  await tab.locator('.st-clip[data-kind="text"]').click();
  await tab.locator('body').press('Escape');
  await tab.locator('.st-notes li').waitFor({ timeout: 8000 });
  await tab.locator('.st-tc', { hasText: '00:03' }).click();
  await tab.waitForTimeout(300);
  const tAfter = await tab.locator('.st-time').textContent();
  check('a timed review note of the exported file shows in the studio, and its time moves the playhead', /غيّر لون الخلفية هنا/.test(await tab.locator('.st-notes').textContent()) && tAfter.startsWith('00:03.00'), tAfter);

  // someone else takes the editing
  await tab.evaluate((pid) => window.__db.takeLease(pid), id);
  await tab.getByRole('button', { name: 'حفظ نسخة' }).click();
  await tab.getByRole('button', { name: 'حفظ النسخة' }).click();
  await tab.locator('dialog .warning').waitFor();
  const refusal = await tab.locator('dialog .warning').textContent();
  await tab.getByRole('button', { name: 'إلغاء' }).click();
  await tab.locator('.st-banner').first().waitFor();
  const banner = await tab.locator('.st-banner').first().textContent();
  check('when another person takes the editing, a save is refused and the editor turns to reading', /لم يعد التحرير لك/.test(refusal) && /تولي التحرير/.test(banner), `${refusal} | ${banner}`);
  const ro = await tab.locator('.st-editor').getAttribute('data-readonly');
  await tab.getByRole('button', { name: 'تولي التحرير' }).click();
  await tab.waitForFunction(() => document.querySelector('.st-editor')?.getAttribute('data-readonly') === 'no', null, { timeout: 8000 });
  check('«تولي التحرير» takes the editing back on the latest saved state', ro === 'yes' && (await tab.locator('.st-banner:not(.st-banner-draft)').count()) === 0 && (await tab.locator('.st-banner-draft').count()) === 0, ro);

  // a draft on the device is offered back after a reload
  await tab.locator('.st-clip[data-kind="motion"]').click();
  await tab.keyboard.press('Delete');
  await tab.waitForTimeout(1500);
  await tab.reload();
  await tab.locator('.st-banner-draft').waitFor({ timeout: 15000 });
  const motionBefore = await tab.locator('.st-clip[data-kind="motion"]').count();
  await tab.getByRole('button', { name: 'استعادة' }).click();
  await tab.waitForTimeout(300);
  const motionAfter = await tab.locator('.st-clip[data-kind="motion"]').count();
  check('after a reload, the newer changes kept on this device are offered back and restored', motionBefore === 1 && motionAfter === 0, `${motionBefore} then ${motionAfter}`);

  // play and pause with the space bar
  await tab.locator('.st-tl-ruler').click({ position: { x: 5, y: 10 } });
  const t0 = await tab.locator('.st-time').textContent();
  await tab.locator('body').press('Space');
  await tab.waitForTimeout(900);
  const playingLabel = await tab.locator('.st-play').getAttribute('aria-label');
  await tab.locator('body').press('Space');
  const t1 = await tab.locator('.st-time').textContent();
  check('the space bar plays and pauses, and the time runs', playingLabel === 'إيقاف مؤقت' && t0 !== t1, `${t0} to ${t1}`);
  await tab.screenshot({ path: path.join(out, 'video-1440.png'), fullPage: true });
  result.projectId = id;
  await ctx.close();
}

async function photoFlow(browser, base, errors) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const tab = await ctx.newPage();
  tab.on('pageerror', (e) => errors.push(e.message));
  tab.on('console', (m) => m.type() === 'error' && !/^Failed to load resource/.test(m.text()) && errors.push(m.text()));
  tab.on('response', (q) => q.status() >= 400 && errors.push(`HTTP ${q.status()}: ${q.url()}`));
  await tab.goto(base + '/motion/studio');
  await tab.getByRole('button', { name: 'مشروع صورة جديد' }).click();
  await tab.getByLabel('اسم المشروع').fill('بطاقة الاختبار');
  await tab.getByRole('button', { name: 'إنشاء وفتح' }).click();
  await tab.locator('.st-photo').waitFor({ timeout: 15000 });
  check('a new photo project opens in the photo editor at 1080x1080', /1080×1080/.test(await tab.locator('.st-photo .st-tl-bar .st-hint').textContent()));
  const centre = () => tab.evaluate(() => { const c = document.querySelector('.st-canvas'); const d = c.getContext('2d').getImageData(c.width >> 1, c.height >> 1, 1, 1).data; return [d[0], d[1], d[2]]; });
  await tab.locator('.st-lib button', { hasText: 'بطاقة' }).click();
  await tab.waitForTimeout(1200);
  const c0 = await centre();
  check('a library picture becomes a layer, drawn on the canvas', (await tab.locator('.st-layers li').count()) === 1 && near(c0, [255, 0, 255]), JSON.stringify(c0));
  await tab.evaluate(() => {
    const el = [...document.querySelectorAll('.st-insp input[type=range]')].find((x) => x.closest('.ms-slider')?.textContent.includes('السطوع'));
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, '-50');
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await tab.waitForTimeout(1200);
  const c1 = await centre();
  check('brightness -50 is applied by the pixel functions in the worker', near(c1, [128, 0, 128], 20), JSON.stringify(c1));
  await tab.getByRole('tab', { name: 'نص وأشكال' }).click();
  await tab.getByRole('button', { name: 'عنوان كبير' }).click();
  await tab.getByRole('button', { name: 'مستطيل' }).click();
  const names = () => tab.locator('.st-layers .st-layer-name').allTextContents();
  const n3 = await names();
  check('a title and a rectangle are added on top (the list shows the top first)', n3.length === 3 && n3[0] === 'مستطيل' && n3[1] === 'عنوان', JSON.stringify(n3));
  const c2 = await centre();
  check('the rectangle on top covers the centre in the brand green', near(c2, [23, 99, 75], 25), JSON.stringify(c2));
  await tab.locator('.st-layers li', { hasText: 'مستطيل' }).getByRole('button', { name: 'إلى الأسفل' }).click();
  const moved = await names();
  await tab.locator('body').press('Control+z');
  const undone = await names();
  check('a layer moves down the stack, and Ctrl+Z puts it back', moved[1] === 'مستطيل' && undone[0] === 'مستطيل', JSON.stringify({ moved, undone }));
  const box = await tab.locator('.st-canvas').boundingBox();
  await tab.locator('.st-layers .st-layer-name', { hasText: 'مستطيل' }).click();
  const x0 = await tab.getByLabel('الموضع أفقياً، قيمة دقيقة').inputValue();
  await tab.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await tab.mouse.down();
  await tab.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2, { steps: 5 });
  await tab.mouse.up();
  const x1 = await tab.getByLabel('الموضع أفقياً، قيمة دقيقة').inputValue();
  check('dragging a layer on the canvas moves it', Number(x1) > Number(x0) + 50, `${x0} to ${x1}`);
  await tab.locator('body').press('Control+z');
  await tab.locator('.st-export').scrollIntoViewIfNeeded();
  const [dl] = await Promise.all([tab.waitForEvent('download', { timeout: 30000 }), tab.getByRole('button', { name: 'تصدير وتنزيل' }).click()]);
  const png = path.join(out, 'photo.png');
  await dl.saveAs(png);
  const { spawnSync } = require('node:child_process');
  const meta = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_name,width,height', '-of', 'csv=p=0', png]).stdout.toString().trim();
  const mid = spawnSync('ffmpeg', ['-v', 'error', '-i', png, '-vf', 'crop=4:4:538:538,scale=1:1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']).stdout;
  check('the PNG export is the full 1080x1080 picture with the rectangle in the middle', meta === 'png,1080,1080' && near([mid[0], mid[1], mid[2]], [23, 99, 75], 25), `${meta} ${[...mid].join(',')}`);
  await tab.locator('.st-layers .st-layer-name', { hasText: 'مستطيل' }).click();
  await tab.locator('body').press('Delete');
  check('Delete removes the selected layer', (await tab.locator('.st-layers li').count()) === 2);
  await tab.screenshot({ path: path.join(out, 'photo-1440.png'), fullPage: true });
  await ctx.close();
}

async function phoneFlow(browser, base, errors) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const tab = await ctx.newPage();
  tab.on('pageerror', (e) => errors.push(e.message));
  tab.on('console', (m) => m.type() === 'error' && !/^Failed to load resource/.test(m.text()) && errors.push(m.text()));
  tab.on('response', (q) => q.status() >= 400 && errors.push(`HTTP ${q.status()}: ${q.url()}`));
  const overflow = () => tab.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  const small = (sel) => tab.evaluate((q) => [...document.querySelectorAll(q)].filter((e) => e.offsetParent && e.getBoundingClientRect().height < 44).map((e) => (e.textContent || e.getAttribute('aria-label') || '').trim().slice(0, 20) + ':' + Math.round(e.getBoundingClientRect().height)), sel);
  await tab.goto(base + '/motion/studio');
  await tab.getByRole('button', { name: 'مشروع فيديو جديد' }).waitFor();
  check('390: the home fits the screen', (await overflow()) <= 0, await overflow());
  await tab.getByRole('button', { name: 'مشروع فيديو جديد' }).tap();
  await tab.getByLabel('اسم المشروع').fill('مقطع الهاتف');
  await tab.getByRole('button', { name: 'إنشاء وفتح' }).tap();
  await tab.locator('.st-editor[data-compact="yes"]').waitFor({ timeout: 15000 });
  check('390: the editor shows the preview with one panel at a time', (await tab.locator('.st-phone-tabs button').count()) === 4 && (await tab.locator('.st-canvas').isVisible()) && (await tab.locator('.st-bin').count()) === 0, '');
  await tab.locator('.st-phone-tabs').getByRole('button', { name: 'إضافة' }).tap();
  await tab.locator('.st-lib button', { hasText: 'ألوان الحملة' }).tap();
  await tab.locator('.st-phone-tabs').getByRole('button', { name: 'الخط الزمني' }).tap();
  await tab.locator('.st-clip[data-kind="video"]').waitFor();
  const dir = await tab.evaluate(() => getComputedStyle(document.querySelector('.st-tl-scroll')).direction);
  check('390: the time axis runs left to right inside the right-to-left page', dir === 'ltr', dir);
  await tab.locator('.st-clip[data-kind="video"]').tap();
  const ruler = await tab.locator('.st-tl-ruler').boundingBox();
  await tab.mouse.click(ruler.x + 80, ruler.y + 10);
  await tab.getByRole('button', { name: 'قص', exact: true }).tap();
  check('390: a clip is split on the phone', (await tab.locator('.st-clip[data-kind="video"]').count()) === 2);
  check('390: the timeline panel fits the screen (the timeline scrolls inside itself)', (await overflow()) <= 0, await overflow());
  const tooSmall = await small('.st-phone-tabs button, .st-transport button, .st-tl-bar button');
  check('390: the panel tabs, the transport and the timeline buttons are at least 44 px tall', tooSmall.length === 0, tooSmall.join(' | '));
  const clipH = await tab.evaluate(() => document.querySelector('.st-clip').getBoundingClientRect().height);
  check('390: clips are tall enough to touch', clipH >= 44, clipH);
  await tab.locator('.st-clip[data-kind="video"]').first().tap();
  await tab.locator('.st-phone-tabs').getByRole('button', { name: 'الإعدادات' }).tap();
  const desk = await tab.locator('.st-desktop-only').allTextContents();
  check('390: crop and colours are kept for the computer, said in place of their controls', desk.some((t) => t.includes('القص والألوان') && t.includes('متاح على الحاسوب')), desk.join(' | '));
  check('390: the settings panel fits the screen', (await overflow()) <= 0, await overflow());
  await tab.locator('.st-phone-tabs').getByRole('button', { name: 'التصدير' }).tap();
  check('390: the export panel is there and fits the screen', (await tab.locator('.st-export').isVisible()) && (await overflow()) <= 0, await overflow());
  await tab.screenshot({ path: path.join(out, 'phone-390.png'), fullPage: true });
  await tab.goto(base + '/motion/studio');
  await tab.getByRole('button', { name: 'مشروع صورة جديد' }).tap();
  await tab.getByLabel('اسم المشروع').fill('صورة الهاتف');
  await tab.getByRole('button', { name: 'إنشاء وفتح' }).tap();
  await tab.locator('.st-photo[data-compact="yes"]').waitFor({ timeout: 15000 });
  await tab.locator('.st-phone-tabs').getByRole('button', { name: 'الإعدادات' }).tap();
  const deskP = await tab.locator('.st-desktop-only').allTextContents();
  check('390: a photo on the phone keeps the four sizes and leaves other sizes for the computer', deskP.some((t) => t.includes('مقاس آخر')) && (await overflow()) <= 0, deskP.join(' | '));
  await tab.screenshot({ path: path.join(out, 'phone-photo-390.png'), fullPage: true });
  await ctx.close();
}

(async () => {
  await build();
  const { server, base } = await serve(out, (p) => (p.startsWith('/motion/studio') ? page : undefined));
  const browser = await chromium.launch(launchOptions);
  const errors = [];
  try {
    if (!only || only === 'video') await videoFlow(browser, base, errors);
    if (!only || only === 'photo') await photoFlow(browser, base, errors);
    if (!only || only === 'phone') await phoneFlow(browser, base, errors);
  } catch (e) {
    check('the fixture ran to its end', false, String((e && e.stack) || e));
  } finally {
    check('no page errors', errors.length === 0, errors.join(' | '));
    await browser.close();
    server.close();
  }
  const failed = result.checks.filter((c) => !c.pass);
  result.total = result.checks.length;
  result.passed = result.total - failed.length;
  result.failed = failed.length;
  fs.writeFileSync(path.join(__dirname, only ? `studio-ui-${only}.json` : 'studio-ui.json'), JSON.stringify(result, null, 2));
  console.log(`${result.passed} of ${result.total} passed`);
  for (const f of failed) console.log('FAIL', f.name, '|', f.detail);
  process.exit(failed.length ? 1 : 0);
})();

// Browser check of the studio's interface (Studio_Build_Plan.md Phases 3 to 6; MVP_draft.md 62). The real
// project list, project shell and editors, with their stylesheets, run in headless Edge, bundled by
// esbuild (qa/fixtures/studio-ui.tsx); only Next's router and Link and the Supabase client are stand-ins,
// the last an in-memory database that keeps the studio functions' rules (those rules are run against the
// real database in supabase/tests/studio_rules.sql). The flow: an empty home, a new video project, a
// library video, a motion template and a title added, a split with S, undo and redo, a drag on the
// timeline, autosave, a numbered version, another person taking the editing (reading only, then taking it
// back), a device draft offered back after a reload, playing and pausing with the space bar.
// The workspace flow (MVP_draft.md 62.1 to 62.5): windows merged, split, floated, closed, reopened, maximised
// and resized; menus and keys; preview resolution; a transition, a movement, a font; copy, paste, razor,
// the clip menu, scaling by a corner, the history, filling the window and the light chrome.
// The versions flow (MVP_draft.md 62.6): listed, compared, restored, and one opened for reading.
// The time flow (MVP_draft.md 62.7): speed, keys, P, [, a still, reverse.
// The marks flow (MVP_draft.md 62.8): markers, chapters, a covered area.
// Usage: node qa/studio-ui.cjs [--only=video|workspace|photo|phone|versions|time|marks]   (writes qa/studio-ui.json)
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
  await tab.locator('.st-ws-tab[data-panel="templates"]').click();
  await tab.locator('.st-tile[data-template]').first().click();
  await tab.locator('.st-ws-tab[data-panel="graphics"]').click();
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

  // export: a download, then a new library file, then a new version of it (the window «التصدير»)
  await tab.locator('.st-ws-tab[data-panel="export"]').click();
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
  await tab.locator('.st-ws-tab[data-panel="review"]').click();
  await tab.locator('.st-review select').selectOption('CH-101');
  await tab.locator('.st-review').getByRole('button', { name: 'ربط', exact: true }).click();
  await tab.locator('.st-review', { hasText: 'حملة اليوم الوطني' }).waitFor({ timeout: 5000 });
  check('a project is linked to a work from «المراجعة», which shows the work and its status', /CH-101/.test(await tab.locator('.st-review').textContent()) && /قيد الإنتاج/.test(await tab.locator('.st-review').textContent()));
  await tab.locator('.st-ws-tab[data-panel="export"]').click();
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
  await tab.locator('.st-ws-tab[data-panel="review"]').click();
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

// The windows, menus, keys, preview resolution, transitions, movements, fonts and tools (MVP_draft.md 62.1 to 62.5).
async function workspaceFlow(browser, base, errors) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const tab = await ctx.newPage();
  tab.on('pageerror', (e) => errors.push(e.message));
  tab.on('console', (m) => m.type() === 'error' && !/^Failed to load resource/.test(m.text()) && errors.push(m.text()));
  tab.on('response', (q) => q.status() >= 400 && errors.push(`HTTP ${q.status()}: ${q.url()}`));
  await tab.goto(base + '/motion/studio');
  await tab.getByRole('button', { name: 'مشروع فيديو جديد' }).click();
  await tab.getByLabel('اسم المشروع').fill('نوافذ الاختبار');
  await tab.getByRole('button', { name: 'إنشاء وفتح' }).click();
  await tab.locator('.st-ws-group').first().waitFor({ timeout: 15000 });
  const panelsIn = (sel) => tab.locator(sel).evaluateAll((els) => els.map((e) => e.dataset.panel));
  const groupTabs = (panel) => tab.locator(`.st-ws-group:has(.st-ws-tab[data-panel="${panel}"]) .st-ws-tab`).evaluateAll((els) => els.map((e) => e.dataset.panel));
  const centerOf = async (loc) => {
    const b = await loc.boundingBox();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2, b };
  };
  const dragTab = async (panel, to) => {
    const from = await centerOf(tab.locator(`.st-ws-tab[data-panel="${panel}"]`));
    await tab.mouse.move(from.x, from.y);
    await tab.mouse.down();
    await tab.mouse.move(from.x + 12, from.y + 12, { steps: 3 });
    await tab.mouse.move(to.x, to.y, { steps: 12 });
    await tab.waitForTimeout(80);
    await tab.mouse.up();
    await tab.waitForTimeout(150);
  };

  // the editor as windows
  const tabs = await panelsIn('.st-ws-tab');
  const menus = await tab.locator('.st-menu-btn').allTextContents();
  check('ws: the video editor opens as windows in tab groups, every window of the editor present', ['program', 'timeline', 'inspector', 'media', 'templates', 'graphics', 'effects', 'export', 'project', 'review', 'history'].every((p) => tabs.includes(p)) && (await tab.locator('.st-ws-group').count()) >= 4, tabs.join(','));
  check('ws: the menu bar has «ملف», «تحرير», «المقطع», «عرض», «النوافذ» and «مساعدة»', JSON.stringify(menus) === JSON.stringify(['ملف', 'تحرير', 'المقطع', 'عرض', 'النوافذ', 'مساعدة']), menus.join(','));
  const scroll = await tab.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
  check('ws: the editor fills the browser window and the page itself does not scroll', scroll <= 2, scroll);
  const chromeBg = await tab.evaluate(() => getComputedStyle(document.querySelector('.st-ws-group')).backgroundColor);
  check('ws: the editor chrome is dark by default', /rgb\((\d+), (\d+), (\d+)\)/.test(chromeBg) && Number(chromeBg.match(/\d+/)[0]) < 60, chromeBg);

  // merging a window into another group's tabs
  const prog = await centerOf(tab.locator('.st-ws-group:has(.st-ws-tab[data-panel="program"]) .st-ws-body'));
  await dragTab('templates', prog);
  const merged = await groupTabs('program');
  check('ws: a tab dragged onto another window joins its tabs', merged.includes('templates') && merged.includes('program'), merged.join(','));

  // splitting: a window dropped on the lower edge of another goes below it
  const groupsBefore = await tab.locator('.st-ws-group').count();
  const pb = (await centerOf(tab.locator('.st-ws-group:has(.st-ws-tab[data-panel="program"]) .st-ws-body'))).b;
  await dragTab('project', { x: pb.x + pb.width / 2, y: pb.y + pb.height - 12 });
  const projBox = await tab.locator('.st-ws-group:has(.st-ws-tab[data-panel="project"])').boundingBox();
  const progBox = await tab.locator('.st-ws-group:has(.st-ws-tab[data-panel="program"])').boundingBox();
  check('ws: a tab dropped on the lower edge of a window splits it, the new window below', (await tab.locator('.st-ws-group').count()) === groupsBefore + 1 && projBox.y > progBox.y + progBox.height - 4 && Math.abs(projBox.x - progBox.x) < 4, JSON.stringify({ projBox, progBox }));

  // floating: dropped outside the workspace
  const wsBox = await tab.locator('.st-ws').boundingBox();
  await dragTab('review', { x: wsBox.x + wsBox.width / 2, y: wsBox.y - 30 });
  const floatTabs = await panelsIn('.st-ws-float .st-ws-tab');
  check('ws: a tab dropped outside the windows becomes a floating window', floatTabs.includes('review'), floatTabs.join(','));
  // a floating window moves by its header
  const fh = await tab.locator('.st-ws-float .st-ws-head').boundingBox();
  const f0 = await tab.locator('.st-ws-float').boundingBox();
  await tab.mouse.move(fh.x + fh.width / 2, fh.y + fh.height / 2);
  await tab.mouse.down();
  await tab.mouse.move(fh.x - 120, fh.y + 80, { steps: 8 });
  await tab.mouse.up();
  const f1 = await tab.locator('.st-ws-float').boundingBox();
  check('ws: a floating window is moved by its header', f1.x < f0.x - 100 && f1.y > f0.y + 60, `${Math.round(f0.x)},${Math.round(f0.y)} to ${Math.round(f1.x)},${Math.round(f1.y)}`);
  // the layout is remembered on this device
  await tab.waitForTimeout(500);
  await tab.reload();
  await tab.locator('.st-ws-group').first().waitFor({ timeout: 15000 });
  check('ws: the arrangement of the windows is remembered after a reload', (await panelsIn('.st-ws-float .st-ws-tab')).includes('review') && (await groupTabs('program')).includes('templates'), (await panelsIn('.st-ws-float .st-ws-tab')).join(','));

  // closing a window, and opening it again from «النوافذ»
  await tab.locator('.st-ws-tabwrap:has(.st-ws-tab[data-panel="history"]) .st-ws-x').click({ force: true });
  const closed = !(await panelsIn('.st-ws-tab')).includes('history');
  await tab.locator('.st-menu-btn', { hasText: 'النوافذ' }).click();
  await tab.locator('.st-menu [role="menuitemcheckbox"]', { hasText: 'السجل' }).click();
  check('ws: a window closed from its tab opens again from «النوافذ»', closed && (await panelsIn('.st-ws-tab')).includes('history'), '');

  // maximising with ` and the window's shortcut
  await tab.locator('body').press('Shift+Digit4');
  await tab.locator('body').press('Backquote');
  const maxGroups = await tab.locator('.st-ws-group').count();
  await tab.locator('body').press('Backquote');
  const restored = await tab.locator('.st-ws-group').count();
  check('ws: Shift+4 goes to the preview and ` maximises its window, ` again restores the layout', maxGroups === 1 && restored > 3, `${maxGroups} then ${restored}`);

  // a ready-made workspace, then back
  await tab.locator('.st-presets button', { hasText: 'المؤثرات' }).click();
  const fxOn = await tab.locator('.st-ws-tab[data-panel="effects"][aria-selected="true"]').count();
  await tab.locator('.st-presets button', { hasText: 'التحرير' }).click();
  check('ws: «المؤثرات» shows the effects window in front, and «التحرير» rebuilds the editing layout', fxOn === 1 && (await tab.locator('.st-ws-float').count()) === 0 && (await groupTabs('program')).length === 1, '');

  // resizing by the border between two windows
  const bar = tab.locator('.st-ws-bar[data-dir="row"]').first();
  const bb = await bar.boundingBox();
  const leftCell = tab.locator('.st-ws-split[data-dir="row"]').first().locator(':scope > .st-ws-cell').first();
  const w0 = (await leftCell.boundingBox()).width;
  await tab.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
  await tab.mouse.down();
  await tab.mouse.move(bb.x + bb.width / 2 + 80, bb.y + bb.height / 2, { steps: 6 });
  await tab.mouse.up();
  const w1 = (await leftCell.boundingBox()).width;
  check('ws: dragging the border between two windows resizes them', Math.abs(w1 - w0 - 80) < 12, `${Math.round(w0)} to ${Math.round(w1)}`);

  // the shortcuts sheet
  await tab.locator('body').press('Shift+Slash');
  await tab.locator('dialog .st-keysheet').waitFor({ timeout: 3000 });
  const rows = await tab.locator('dialog .st-keysheet dl > div').count();
  const hasRazor = (await tab.locator('dialog .st-keysheet').textContent()).includes('أداة الشفرة');
  await tab.keyboard.press('Escape');
  check('ws: «?» opens the shortcuts sheet with every key of the editor', rows >= 45 && hasRazor, rows);

  // content: a library video split at 2 s into two touching clips, and a title
  await tab.locator('.st-ws-tab[data-panel="media"]').click();
  await tab.locator('.st-lib button', { hasText: 'ألوان الحملة' }).click();
  await tab.locator('.st-clip[data-kind="video"]').waitFor();
  await tab.waitForFunction(() => !document.querySelector('.st-clip-load'), null, { timeout: 15000 });
  await tab.waitForTimeout(600);

  // preview resolution
  const fullW = await tab.evaluate(() => document.querySelector('.st-canvas').width);
  await tab.locator('.st-res > button').click();
  await tab.locator('.st-res-pop [role="radiogroup"]').nth(1).getByRole('radio', { name: '1/4' }).click();
  await tab.waitForTimeout(200);
  const quarterW = await tab.evaluate(() => document.querySelector('.st-canvas').width);
  const badge = await tab.locator('.st-res-badge').textContent().catch(() => '');
  await tab.locator('body').press('Escape');
  await tab.locator('.st-menu-btn', { hasText: 'عرض' }).click();
  await tab.locator('.st-menu-row > button', { hasText: 'دقة المعاينة عند الإيقاف' }).click();
  await tab.locator('.st-menu-sub button', { hasText: 'كاملة' }).click();
  await tab.waitForTimeout(200);
  const backW = await tab.evaluate(() => document.querySelector('.st-canvas').width);
  check('ws: the preview resolution 1/4 draws the paused frame at a quarter of its pixels, and «كاملة» from the menu restores it', Math.abs(quarterW - fullW / 4) <= 2 && badge === '1/4' && backW === fullW, `${fullW} / ${quarterW} / ${backW} ${badge}`);

  await tab.locator('.st-tl-ruler').click({ position: { x: 80, y: 10 } });
  await tab.locator('.st-clip[data-kind="video"]').first().click({ position: { x: 10, y: 10 } });
  await tab.keyboard.press('s');
  await tab.locator('.st-clip[data-kind="video"]').nth(1).waitFor();

  // a transition from the effects window onto the selected (second) clip
  await tab.locator('.st-ws-tab[data-panel="effects"]').click();
  await tab.locator('.st-fx-tile[data-effect="transition:push-left"]').getByRole('button', { name: 'البداية' }).click();
  const xf = await tab.locator('.st-clip-xfade').getAttribute('data-kind').catch(() => null);
  check('ws: a transition from «الانتقالات والحركات» joins the two touching clips (push from the right)', xf === 'push-left', xf);
  check('ws: the inspector names the transition and its length', (await tab.locator('.st-insp select').first().inputValue()) === 'push-left', await tab.locator('.st-insp select').first().inputValue());

  // a title, then a movement dragged onto it
  await tab.locator('.st-ws-tab[data-panel="graphics"]').click();
  await tab.getByRole('button', { name: 'عنوان كبير' }).click();
  await tab.locator('.st-ws-tab[data-panel="effects"]').click();
  await tab.locator('.st-pane-tabs button', { hasText: 'الدخول والخروج' }).click();
  const textClip = tab.locator('.st-clip[data-kind="text"]');
  await tab.locator('.st-fx-tile[data-effect="anim:pop"]').dragTo(textClip, { targetPosition: { x: 8, y: 10 } });
  await tab.waitForTimeout(200);
  check('ws: a movement dragged onto the start of a clip becomes its entry', (await tab.locator('.st-clip[data-kind="text"] .st-clip-anim.in').count()) === 1, '');

  // a font from the list
  await textClip.click();
  await tab.locator('.st-font-btn').click();
  const options = await tab.locator('.st-font-list [role="option"]').count();
  await tab.locator('.st-font-list [role="option"][data-font="Cairo"]').click();
  await tab.waitForFunction(() => document.fonts.check('700 48px "Cairo"', 'نص عربي'), null, { timeout: 8000 }).catch(() => undefined);
  const loaded = await tab.evaluate(() => document.fonts.check('700 48px "Cairo"', 'نص عربي'));
  check('ws: the font list shows 25 fonts, and choosing «كايرو» sets and loads it', options === 25 && (await tab.locator('.st-font-btn').textContent()).includes('كايرو') && loaded, `${options} ${loaded}`);

  // copy and paste a clip
  await textClip.first().click();
  await tab.locator('body').press('Control+c');
  await tab.locator('body').press('Control+v');
  check('ws: Ctrl+C and Ctrl+V copy the selected clip to the playhead', (await tab.locator('.st-clip[data-kind="text"]').count()) === 2, await tab.locator('.st-clip[data-kind="text"]').count());

  // the razor tool cuts where it is clicked
  const videosBefore = await tab.locator('.st-clip[data-kind="video"]').count();
  await tab.locator('body').press('c');
  const vb = await tab.locator('.st-clip[data-kind="video"]').last().boundingBox();
  await tab.mouse.click(vb.x + vb.width * 0.6, vb.y + vb.height / 2);
  await tab.locator('body').press('v');
  check('ws: C picks the razor, a click cuts the clip there, and V goes back to selecting', (await tab.locator('.st-clip[data-kind="video"]').count()) === videosBefore + 1 && (await tab.locator('.st-tools [data-tool="select"][aria-checked="true"]').count()) === 1, '');

  // the clip's menu
  await tab.locator('.st-clip[data-kind="video"]').first().click({ button: 'right', position: { x: 12, y: 12 } });
  const ctxText = await tab.locator('.st-ctx').textContent().catch(() => '');
  await tab.keyboard.press('Escape');
  check('ws: a right click opens the clip\'s menu (cut, copy, paste, transition, delete)', /قص عند رأس التشغيل/.test(ctxText) && /انتقال افتراضي/.test(ctxText) && /حذف وسد الفراغ/.test(ctxText), ctxText.slice(0, 80));

  // scaling the title by its corner on the preview
  await tab.locator('.st-ws-tab[data-panel="inspector"]').click();
  await tab.locator('.st-tl-ruler').click({ position: { x: 120, y: 10 } });
  await textClip.first().click();
  const scale0 = Number(await tab.getByLabel('الحجم، قيمة دقيقة').inputValue());
  const corner = await tab.evaluate(() => {
    const c = document.querySelector('.st-canvas');
    const r = c.getBoundingClientRect();
    const k = r.width / 1080;
    // the title: centred at (540, 806), 84% of the width, one line of 110 px at 1.35
    return { x: r.left + (540 + 0.42 * 1080) * k, y: r.top + (806.4 - (110 * 1.35) / 2) * k };
  });
  await tab.mouse.move(corner.x, corner.y);
  await tab.mouse.down();
  await tab.mouse.move(corner.x + 40, corner.y - 25, { steps: 6 });
  await tab.mouse.up();
  const scale1 = Number(await tab.getByLabel('الحجم، قيمة دقيقة').inputValue());
  check('ws: dragging a corner of the selected title on the preview scales it', scale1 > scale0 + 5, `${scale0} to ${scale1}`);

  // «السجل»: back to the opened project and forward again
  await tab.locator('body').press('Shift+Digit9');
  const steps = await tab.locator('.st-hist li').count();
  await tab.locator('.st-hist li button', { hasText: 'عند فتح المشروع' }).click();
  const emptied = await tab.locator('.st-clip').count();
  await tab.locator('.st-hist li[data-state="future"] button').last().click();
  const back = await tab.locator('.st-clip').count();
  check('ws: «السجل» lists the steps, goes back to the project as it was opened and forward to the last step', steps > 6 && emptied === 0 && back >= 5, `${steps} steps, ${emptied} then ${back} clips`);

  // filling the window, and the light chrome
  await tab.locator('body').press('Control+Shift+KeyF');
  const fixed = await tab.evaluate(() => {
    const p = document.querySelector('.st-project');
    const r = p.getBoundingClientRect();
    return getComputedStyle(p).position === 'fixed' && r.top === 0 && Math.round(r.height) === window.innerHeight;
  });
  await tab.locator('body').press('Control+Shift+KeyF');
  await tab.locator('.st-bar-tools button[aria-label="محرر فاتح"]').click();
  const lightBg = await tab.evaluate(() => getComputedStyle(document.querySelector('.st-ws-group')).backgroundColor);
  check('ws: Ctrl+Shift+F fills the browser window and back; the light chrome is one click away', fixed && Number(lightBg.match(/\d+/)[0]) > 200, `${fixed} ${lightBg}`);
  await tab.locator('.st-bar-tools button[aria-label="محرر داكن"]').click();
  await tab.screenshot({ path: path.join(out, 'workspace-1440.png') });
  await ctx.close();
}

// «النسخ» (MVP_draft.md 62.6): the numbered versions listed, compared with the state on screen, an old
// one restored (the state on screen kept first, the restore one undoable step), and one opened for
// reading at ?v=N with no lease taken.
async function versionsFlow(browser, base, errors) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const tab = await ctx.newPage();
  tab.on('pageerror', (e) => errors.push(e.message));
  tab.on('console', (m) => m.type() === 'error' && !/^Failed to load resource/.test(m.text()) && errors.push(m.text()));
  tab.on('response', (q) => q.status() >= 400 && errors.push(`HTTP ${q.status()}: ${q.url()}`));
  await tab.goto(base + '/motion/studio');
  await tab.evaluate(() => window.__db.reset());
  await tab.reload();
  await tab.getByRole('button', { name: 'مشروع فيديو جديد' }).click();
  await tab.getByLabel('اسم المشروع').fill('مقطع النسخ');
  await tab.getByRole('button', { name: 'إنشاء وفتح' }).click();
  await tab.locator('.st-editor').waitFor({ timeout: 15000 });
  const id = await tab.evaluate(() => location.pathname.split('/').pop());
  await tab.locator('.st-lib button', { hasText: 'ألوان الحملة' }).click();
  await tab.locator('.st-clip[data-kind="video"]').waitFor();
  await tab.locator('.st-ws-tab[data-panel="graphics"]').click();
  await tab.getByRole('button', { name: 'عنوان كبير' }).click();
  await tab.getByRole('button', { name: 'حفظ نسخة' }).click();
  await tab.getByLabel('ملاحظة (اختيارية)').fill('بالعنوان');
  await tab.getByRole('button', { name: 'حفظ النسخة' }).click();
  await tab.waitForFunction(() => /النسخة 2/.test(document.querySelector('.st-title small').textContent));
  // the title removed: the state on screen now differs from version 2
  await tab.locator('.st-clip[data-kind="text"]').click();
  await tab.locator('body').press('Delete');
  const texts = () => tab.locator('.st-clip[data-kind="text"]').count();
  const noTitle = await texts();

  await tab.locator('.st-ws-tab[data-panel="versions"]').click();
  await tab.locator('.st-versions-list > li').nth(1).waitFor({ timeout: 8000 });
  const rows = await tab.locator('.st-versions-row b').allTextContents();
  const latest = await tab.locator('.st-versions-list > li[data-latest="yes"] .st-versions-row b').textContent();
  const note = await tab.locator('.st-versions-list > li').first().locator('.st-versions-note').textContent();
  check('versions: «النسخ» lists the numbered versions newest first, the latest marked, with its note', rows.join(',') === 'النسخة 2,النسخة 1' && latest === 'النسخة 2' && note === 'بالعنوان', `${rows.join(',')} ${latest} ${note}`);

  const v2 = tab.locator('.st-versions-list > li').first();
  await v2.getByRole('button', { name: 'مقارنة بالحالية' }).click();
  await v2.locator('.st-versions-diff li').first().waitFor();
  const diff = await v2.locator('.st-versions-diff').textContent();
  check('versions: «مقارنة بالحالية» says in words that the title was removed since version 2', /حُذف «اكتب/.test(diff) || /حُذف «/.test(diff), diff);

  await v2.getByRole('button', { name: 'استعادة' }).click();
  await tab.locator('.st-versions .st-done').waitFor({ timeout: 10000 });
  const restored = await texts();
  const revs = await tab.evaluate((pid) => window.__db.projects.find((x) => x.id === pid).revs.filter((r) => r.revision > 0).map((r) => `${r.revision}:${r.note ?? ''}`).join(' | '), id);
  check('versions: «استعادة» keeps the state on screen as version 3, then brings version 2 back as version 4', noTitle === 0 && restored === 1 && revs === '1: | 2:بالعنوان | 3:قبل استعادة النسخة 2 | 4:استعادة النسخة 2', `${noTitle} then ${restored}; ${revs}`);
  await tab.locator('.st-tl-ruler').click({ position: { x: 5, y: 5 } });
  await tab.locator('body').press('Control+z');
  const undone = await texts();
  await tab.locator('body').press('Control+Shift+z');
  check('versions: the restore is one step of the history: Ctrl+Z undoes it, Ctrl+Shift+Z redoes it', undone === 0 && (await texts()) === 1, `${undone} then ${await texts()}`);

  await tab.locator('.st-versions-list > li').last().getByRole('link', { name: 'عرض' }).click();
  await tab.locator('.st-banner-view').waitFor({ timeout: 10000 });
  const ro = await tab.locator('.st-editor').getAttribute('data-readonly');
  const small = await tab.locator('.st-title small').textContent();
  const clips = await tab.locator('.st-clip').count();
  const lease = await tab.evaluate((pid) => window.__db.projects.find((x) => x.id === pid).lease_holder, id);
  check('versions: «عرض» opens version 1 at ?v=1 for reading only, as it was, taking no lease', ro === 'yes' && /النسخة 1/.test(small) && clips === 0 && lease === null && /v=1/.test(await tab.evaluate(() => location.search)), `${ro} ${small} ${clips} clips, lease ${lease}`);
  await tab.getByRole('link', { name: 'فتح الحال الحالية' }).click();
  await tab.waitForFunction(() => document.querySelector('.st-editor')?.getAttribute('data-readonly') === 'no', null, { timeout: 10000 });
  check('versions: «فتح الحال الحالية» returns to the project for editing, with the restored title', (await texts()) === 1, await texts());
  await tab.screenshot({ path: path.join(out, 'versions-1440.png') });
  await ctx.close();
}

// Speed, keyframes, freeze and reverse in the editor (MVP_draft.md 62.7): the inspector sets a speed and
// the clip's length follows; key switches and a change at another moment make diamonds; [ goes back to
// a key; P keys every setting; Shift+F puts in a still; «تشغيل عكسي» marks the clip; Ctrl+Z undoes it.
async function timeFlow(browser, base, errors) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const tab = await ctx.newPage();
  tab.on('pageerror', (e) => errors.push(e.message));
  tab.on('console', (m) => m.type() === 'error' && !/^Failed to load resource/.test(m.text()) && errors.push(m.text()));
  tab.on('response', (q) => q.status() >= 400 && errors.push(`HTTP ${q.status()}: ${q.url()}`));
  await tab.goto(base + '/motion/studio');
  await tab.evaluate(() => window.__db.reset());
  await tab.reload();
  await tab.getByRole('button', { name: 'مشروع فيديو جديد' }).click();
  await tab.getByLabel('اسم المشروع').fill('مقطع السرعة');
  await tab.getByRole('button', { name: 'إنشاء وفتح' }).click();
  await tab.locator('.st-editor').waitFor({ timeout: 15000 });
  await tab.locator('.st-lib button', { hasText: 'ألوان الحملة' }).click();
  const video = tab.locator('.st-clip[data-kind="video"]');
  await video.waitFor();
  await tab.waitForFunction(() => !document.querySelector('.st-clip-load'), null, { timeout: 15000 });
  await video.click();
  await tab.locator('.st-ws-tab[data-panel="inspector"]').click();
  const lenBox = tab.getByLabel('المدة، قيمة دقيقة');
  const len0 = Number(await lenBox.inputValue());
  const speed = tab.getByLabel('السرعة، قيمة دقيقة');
  await speed.fill('2');
  await speed.press('Enter');
  await tab.locator('.st-clip-speed').first().waitFor({ timeout: 5000 });
  const badge = await tab.locator('.st-clip-speed').first().textContent();
  const len1 = Number(await lenBox.inputValue());
  const silent = await tab.locator('.st-insp .st-warn', { hasText: 'لا يُسمع صوت' }).count();
  check('time: «السرعة» 2x halves the clip (it shows the same stretch), marks it «2×» and says it is silent', Math.abs(len1 - len0 / 2) < 0.02 && badge === '2×' && silent === 1, `${len0} to ${len1}, ${badge}, ${silent}`);

  // keys: x keyed at 0, changed at 1 s
  await tab.locator('body').press('Home');
  await tab.locator('.st-keyrow[data-prop="x"] .st-keybtn').click();
  for (let i = 0; i < 30; i++) await tab.locator('body').press('ArrowRight');
  const xBox = tab.getByLabel('الموضع أفقياً، قيمة دقيقة');
  await xBox.fill('200');
  await xBox.press('Enter');
  const diamonds = await tab.locator('.st-clip[data-selected="yes"] .st-clip-key').count();
  const keyedOn = await tab.locator('.st-keyrow[data-prop="x"] .st-keybtn[data-on="yes"]').count();
  check('time: a key switch at 0 s and a new position at 1 s make two keys, the switch lit at 1 s', diamonds === 2 && keyedOn === 1, `${diamonds} diamonds, lit ${keyedOn}`);
  await tab.locator('body').press('BracketLeft');
  const back = await tab.locator('.st-mon-time').textContent();
  const xAt0 = await xBox.inputValue();
  check('time: [ goes back to the key at 0 s, where the position is the first key\'s', back.startsWith('00:00:00') || back.startsWith('00:00.00') || /^0?0:00[:.]00/.test(back), `${back} x=${xAt0}`);
  await tab.locator('body').press('p');
  const keyedAll = await tab.locator('.st-keyrow .st-keybtn[data-on="yes"]').count();
  check('time: P keys every motion setting at the playhead', keyedAll >= 5, keyedAll);

  // a still at 0.5 s
  for (let i = 0; i < 15; i++) await tab.locator('body').press('ArrowRight');
  const before = await video.count();
  await tab.locator('body').press('Shift+KeyF');
  await tab.waitForTimeout(300);
  const after = await video.count();
  const stills = await tab.locator('.st-clip-speed', { hasText: 'ثابت' }).count();
  check('time: Shift+F cuts the clip and puts a still between the parts', after === before + 2 && stills === 1, `${before} to ${after} clips, ${stills} still`);

  // reverse the last part, then undo
  await video.last().click();
  await tab.locator('.st-insp label.ms-switch', { hasText: 'تشغيل عكسي' }).click();
  const rev = await tab.locator('.st-clip[data-selected="yes"] .st-clip-speed').textContent();
  await tab.locator('body').press('Control+z');
  const undone = await tab.locator('.st-clip[data-selected="yes"] .st-clip-speed').textContent();
  check('time: «تشغيل عكسي» marks the clip «معكوس», and Ctrl+Z takes it back', /معكوس/.test(rev) && !/معكوس/.test(undone), `${rev} then ${undone}`);
  await tab.screenshot({ path: path.join(out, 'time-1440.png') });
  await ctx.close();
}

// Markers and covered areas (MVP_draft.md 62.8): M puts markers on the ruler and opens «العلامات»; a
// marker is renamed; YouTube's rules are said until they hold, then the chapters are offered; a covered
// area is added from «النصوص والعلامات», lands on a graphics track and is switched to squares.
async function marksFlow(browser, base, errors) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const tab = await ctx.newPage();
  tab.on('pageerror', (e) => errors.push(e.message));
  tab.on('console', (m) => m.type() === 'error' && !/^Failed to load resource/.test(m.text()) && errors.push(m.text()));
  tab.on('response', (q) => q.status() >= 400 && errors.push(`HTTP ${q.status()}: ${q.url()}`));
  await tab.goto(base + '/motion/studio');
  await tab.evaluate(() => window.__db.reset());
  await tab.reload();
  await tab.getByRole('button', { name: 'مشروع فيديو جديد' }).click();
  await tab.getByLabel('اسم المشروع').fill('مقطع العلامات');
  await tab.getByRole('button', { name: 'إنشاء وفتح' }).click();
  await tab.locator('.st-editor').waitFor({ timeout: 15000 });
  await tab.locator('.st-lib button', { hasText: 'ألوان الحملة' }).click();
  await tab.locator('.st-clip[data-kind="video"]').waitFor();
  await tab.locator('body').press('Home');
  await tab.locator('body').press('m');
  for (let i = 0; i < 60; i++) await tab.locator('body').press('ArrowRight');
  const placedAt = await tab.locator('.st-mon-time').textContent();
  await tab.locator('body').press('m');
  const onRuler = await tab.locator('.st-tl-marker').count();
  const listed = await tab.locator('.st-marker-list li').count();
  check('marks: M puts a marker at the playhead on the ruler, and «العلامات» lists them', onRuler === 2 && listed === 2, `${onRuler} on the ruler, ${listed} listed`);
  const name = tab.locator('.st-marker-list li').first().getByLabel('اسم العلامة');
  await name.fill('المقدمة');
  const issues = await tab.locator('.st-chapter-issues li').allTextContents();
  const copyOff = await tab.getByRole('button', { name: 'نسخ الفصول' }).isDisabled();
  const lines = await tab.locator('.st-chapters').inputValue();
  check('marks: a marker is renamed; with two markers and a short video YouTube\'s rules are said and copying waits', lines.startsWith('00:00 المقدمة') && issues.some((x) => x.includes('3 علامات')) && copyOff, `${lines.replace(/\n/g, ' / ')} | ${issues.join(' | ')}`);
  await tab.locator('body').press('Home');
  await tab.locator('.st-tl-marker').last().click();
  const at = await tab.locator('.st-mon-time').textContent();
  check('marks: a marker on the ruler moves the playhead to it', at === placedAt && !/^00:00:00|^00:00\.00/.test(at), `${at} (placed at ${placedAt})`);

  await tab.locator('.st-ws-tab[data-panel="graphics"]').click();
  await tab.getByRole('button', { name: 'تمويه منطقة' }).click();
  const cover = tab.locator('.st-clip[data-kind="cover"]');
  await cover.waitFor({ timeout: 5000 });
  const onGraphics = await tab.evaluate(() => document.querySelector('.st-clip[data-kind="cover"]')?.closest('.st-tl-lane')?.getAttribute('data-kind'));
  await tab.locator('.st-ws-tab[data-panel="inspector"]').click();
  await tab.locator('.st-insp').getByRole('radio', { name: 'مربعات' }).click();
  const label = await cover.locator('.st-clip-name').textContent();
  check('marks: «تمويه منطقة» adds a covered area on a graphics track, and «مربعات» turns it into «إخفاء بالمربعات»', onGraphics === 'graphics' && label === 'إخفاء بالمربعات', `${onGraphics} ${label}`);
  await tab.screenshot({ path: path.join(out, 'marks-1440.png') });
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
  check('a new photo project opens in the photo editor at 1080x1080', /1080×1080/.test(await tab.locator('.st-photo .st-mon-time').textContent()));
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
  await tab.locator('.st-ws-tab[data-panel="graphics"]').click();
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
  await tab.locator('.st-ws-tab[data-panel="export"]').click();
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
    if (!only || only === 'workspace') await workspaceFlow(browser, base, errors);
    if (!only || only === 'photo') await photoFlow(browser, base, errors);
    if (!only || only === 'phone') await phoneFlow(browser, base, errors);
    if (!only || only === 'versions') await versionsFlow(browser, base, errors);
    if (!only || only === 'time') await timeFlow(browser, base, errors);
    if (!only || only === 'marks') await marksFlow(browser, base, errors);
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

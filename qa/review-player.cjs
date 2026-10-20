// The review screen's player in a real browser (MVP_draft.md 62.13), over the real component, the real long
// press and the site's styles (qa/fixtures/review-ui.tsx), in headless Edge. It checks the keys (Space and K,
// J and L, a frame each way, Shift+G on a 9:16 video only), a note written with N at the current frame with an
// area dragged on the paused picture, saved through media_note_add with its exact time and version, its mark
// and its area drawn; the filter of this version and every version; an answer and «تم»; the comparison with
// version 1 side by side and under a wipe, on one clock; A held approving the file shown, a short press
// explaining instead, and nothing where the button is off; the keys acting on the player last used; an
// address with ?t= and &v= opening the moment.
// Usage: node qa/review-player.cjs   (writes qa/review-player.json)
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { dependency, launchOptions } = require('./runtime.cjs');
const { chromium } = dependency('playwright');
const esbuild = require('esbuild');
const { IDS, makeMedia, fontCss, serve, root } = require('./studio-media.cjs');

const out = path.join(__dirname, 'artifacts', 'review-player');
const result = { script: 'qa/review-player.cjs', run: new Date().toISOString(), checks: [] };
const check = (name, pass, detail = '') => result.checks.push({ name, pass: Boolean(pass), detail: String(detail) });
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
makeMedia(out);
const tall = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=gray:s=360x640:r=30:d=4', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-g', '15', path.join(out, 'tall.mp4')]);
if (tall.status !== 0) throw new Error(String(tall.stderr));
const WIDE = '00000000-0000-4000-8000-0000000000a1';
const TALL = '00000000-0000-4000-8000-0000000000c1';
IDS[TALL] = 'tall.mp4';

async function build() {
  await esbuild.build({
    entryPoints: [path.join(__dirname, 'fixtures', 'review-ui.tsx')],
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
<link rel="stylesheet" href="/css/globals.css"><link rel="stylesheet" href="/css/identity.css"><link rel="stylesheet" href="/css/work.css"><link rel="stylesheet" href="/css/kit.css">
<style>${fontCss()} body{font-family:var(--font-sans,"IBM Plex Sans Arabic")} main{padding:16px;display:grid;gap:18px;max-width:1100px}</style></head>
<body><div id="root"></div><script type="module" src="/bundle.js"></script></body></html>`;

const W = '[data-file="wide"] .wk-rp-stage:not(.wk-rp-prev) video';
const T = '[data-file="tall"] .wk-rp-stage:not(.wk-rp-prev) video';
const P = '[data-file="wide"] .wk-rp-prev video';

(async () => {
  await build();
  const { server, base } = await serve(out, (p) => (p.startsWith('/review') ? page : undefined));
  const browser = await chromium.launch(launchOptions);
  const errors = [];
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const tab = await ctx.newPage();
    tab.on('pageerror', (e) => errors.push(e.message));
    tab.on('console', (m) => m.type() === 'error' && !/^Failed to load resource/.test(m.text()) && errors.push(m.text()));
    const time = (sel) => tab.evaluate((s) => document.querySelector(s).currentTime, sel);
    const ready = (sel) => tab.waitForFunction((s) => document.querySelector(s)?.readyState >= 2, sel, { timeout: 15000 });
    const settle = (sel) => tab.waitForFunction((s) => !document.querySelector(s).seeking, sel, { timeout: 5000 });
    await tab.goto(base + '/review');
    await tab.evaluate(() => window.__db.reset());
    await tab.reload();
    await ready(W);
    await ready(T);

    // the player's keys
    await tab.locator('body').press('Space');
    await tab.waitForFunction((s) => !document.querySelector(s).paused, W, { timeout: 5000 });
    await tab.waitForTimeout(700);
    await tab.locator('body').press('k');
    await tab.waitForFunction((s) => document.querySelector(s).paused, W, { timeout: 5000 });
    const played = await time(W);
    check('Space plays the player last used and K pauses it', played > 0.3, played.toFixed(2));
    await tab.evaluate((s) => (document.querySelector(s).currentTime = 2), W);
    await settle(W);
    await tab.locator('body').press('l');
    await settle(W);
    const afterL = await time(W);
    await tab.locator('body').press('j');
    await settle(W);
    const afterJ = await time(W);
    check('L moves a second on and J a second back', Math.abs(afterL - 3) < 0.05 && Math.abs(afterJ - 2) < 0.05, `${afterL.toFixed(3)} ${afterJ.toFixed(3)}`);
    await tab.locator('body').press('ArrowRight');
    await settle(W);
    const f1 = await time(W);
    await tab.locator('body').press('ArrowLeft');
    await settle(W);
    const f0 = await time(W);
    const shownTime = await tab.locator('[data-file="wide"] .wk-rp-time').textContent();
    check('the arrows move one frame (1/30 s of this 30 fps file) each way, and the time is shown', Math.abs(f1 - 2 - 1 / 30) < 0.006 && Math.abs(f0 - 2) < 0.006 && shownTime.startsWith('00:02.0 /'), `${f1.toFixed(4)} ${f0.toFixed(4)} ${shownTime}`);

    // N: a note at this frame with an area of the picture
    await tab.locator('body').press('n');
    const input = tab.locator('[data-file="wide"] .wk-rp-compose input');
    await input.waitFor();
    const stamp = await tab.locator('[data-file="wide"] .wk-rp-compose .wk-tcb').textContent();
    const ov = await tab.locator('[data-file="wide"] .wk-rp-over').boundingBox();
    await tab.mouse.move(ov.x + ov.width * 0.2, ov.y + ov.height * 0.2);
    await tab.mouse.down();
    await tab.mouse.move(ov.x + ov.width * 0.5, ov.y + ov.height * 0.6, { steps: 6 });
    await tab.mouse.up();
    await input.fill('الشعار يغطي الوجه');
    await tab.locator('[data-file="wide"] .wk-rp-compose').getByRole('button', { name: 'حفظ' }).click();
    await tab.waitForFunction(() => window.__db.notes.length === 1, null, { timeout: 5000 });
    const n1 = await tab.evaluate(() => window.__db.notes[0]);
    const near = (a, b) => Math.abs(a - b) < 0.02;
    check('N writes a note at the current frame on the version shown, with the area dragged on the paused picture (media_note_add)', stamp === '00:02.0' && n1.at_ms === 2000 && n1.version === 2 && n1.area && near(n1.area.x, 0.2) && near(n1.area.y, 0.2) && near(n1.area.w, 0.3) && near(n1.area.h, 0.4), `${stamp} ${JSON.stringify(n1)}`);
    await tab.locator('[data-file="wide"] .wk-rp-mark').first().waitFor({ timeout: 5000 });
    const drawn = await tab.evaluate((a) => {
      const c = document.querySelector('[data-file="wide"] .wk-rp-over');
      const ctx = c.getContext('2d');
      let best = 0;
      const y = Math.round((a.y + a.h / 2) * c.height);
      for (let dx = -4; dx <= 4; dx++) best = Math.max(best, ctx.getImageData(Math.round(a.x * c.width) + dx, y, 1, 1).data[3]);
      const outside = ctx.getImageData(Math.round(0.9 * c.width), Math.round(0.9 * c.height), 1, 1).data[3];
      return { best, outside };
    }, n1.area);
    const chip = await tab.locator('[data-file="wide"] .wk-rp-list > li').first().textContent();
    check('the note is a mark under the player, and its area is drawn over the picture', drawn.best > 150 && drawn.outside === 0 && /منطقة/.test(chip), JSON.stringify(drawn));

    // this version and every version
    await tab.evaluate((a) => {
      window.__db.note(a, 'اللون في النسخة الأولى', 4000, 1);
      return window.__reload();
    }, WIDE);
    await tab.waitForTimeout(200);
    const thisCount = await tab.locator('[data-file="wide"] .wk-rp-list > li').count();
    await tab.locator('[data-file="wide"] .wk-rp-notes').getByRole('button', { name: /كل الإصدارات/ }).click();
    const allCount = await tab.locator('[data-file="wide"] .wk-rp-list > li').count();
    const older = tab.locator('[data-file="wide"] .wk-rp-list > li', { hasText: 'اللون في النسخة الأولى' });
    const olderText = await older.textContent();
    await older.getByRole('button', { name: /انتقل إلى/ }).click();
    await settle(W);
    const at4 = await time(W);
    check('«هذا الإصدار» shows the notes on version 2 only, «كل الإصدارات» adds version 1\'s, and a note\'s time moves the player there', thisCount === 1 && allCount === 2 && /الإصدار 1/.test(olderText) && Math.abs(at4 - 4) < 0.05, `${thisCount} ${allCount} ${at4.toFixed(2)}`);

    // an answer and «تم»
    const li = tab.locator('[data-file="wide"] .wk-rp-list > li', { hasText: 'الشعار يغطي الوجه' });
    await li.getByRole('button', { name: 'رد', exact: true }).click();
    await li.getByLabel('الرد').fill('نقلته إلى الزاوية');
    await li.getByRole('button', { name: 'إرسال' }).click();
    await tab.waitForFunction(() => window.__db.notes.some((x) => x.parent_id), null, { timeout: 5000 });
    await li.locator('.wk-rp-answer').waitFor({ timeout: 5000 });
    await li.getByRole('button', { name: 'تم', exact: true }).click();
    await tab.waitForFunction(() => document.querySelector('[data-file="wide"] .wk-rp-list > li[data-open="no"]'), null, { timeout: 5000 });
    const notes = await tab.evaluate(() => window.__db.notes);
    const ans = notes.find((x) => x.parent_id);
    const closed = notes.find((x) => x.body === 'الشعار يغطي الوجه');
    const markOpen = await tab.locator('[data-file="wide"] .wk-rp-mark[data-open="no"]').count();
    check('an answer keeps its note\'s version, and «تم» closes the note in the list and on its mark', ans.parent_id === closed.id && ans.version === 2 && !!closed.done_at && markOpen === 1, JSON.stringify({ ans: [ans.body, ans.version], done: closed.done_at, markOpen }));

    // comparing with version 1
    await tab.locator('[data-file="wide"]').getByRole('button', { name: 'جنباً إلى جنب' }).click();
    await ready(P);
    const asked = await tab.evaluate(async () => (await (await fetch('/__requests')).json()).filter((r) => r.includes('?v=1')).length);
    await tab.evaluate((s) => (document.querySelector(s).currentTime = 0.5), W);
    await settle(W);
    await tab.locator('body').press('Space');
    await tab.waitForTimeout(900);
    const both = await tab.evaluate(([a, b]) => [document.querySelector(a).currentTime, document.querySelector(b).currentTime, document.querySelector(b).paused], [W, P]);
    await tab.locator('body').press('Space');
    await tab.waitForTimeout(400);
    const still = await tab.evaluate(([a, b]) => [document.querySelector(a).currentTime, document.querySelector(b).currentTime, document.querySelector(a).paused, document.querySelector(b).paused], [W, P]);
    check('«جنباً إلى جنب» plays version 1 beside version 2 on one clock, playing and pausing together', asked >= 1 && !both[2] && Math.abs(both[0] - both[1]) < 0.3 && still[2] && still[3] && Math.abs(still[0] - still[1]) < 0.08, JSON.stringify({ asked, both, still }));
    await tab.locator('[data-file="wide"]').getByRole('button', { name: 'بالفاصل' }).click();
    const clip50 = await tab.locator('[data-file="wide"] .wk-rp-prev').evaluate((e) => e.style.clipPath);
    await tab.locator('[data-file="wide"] .wk-rp-wipe input').fill('30');
    const clip30 = await tab.locator('[data-file="wide"] .wk-rp-prev').evaluate((e) => e.style.clipPath);
    check('«بالفاصل» lays version 1 over version 2 cut at the divider, which moves', /inset\(0(px)? 50% 0(px)? 0(px)?\)/.test(clip50) && /inset\(0(px)? 70% 0(px)? 0(px)?\)/.test(clip30), `${clip50} | ${clip30}`);
    await tab.screenshot({ path: path.join(out, 'compare-1280.png'), fullPage: true });
    await tab.locator('[data-file="wide"]').getByRole('button', { name: 'دون مقارنة' }).click();

    // A held approves the file shown; a short press explains; the ring fills while held
    await tab.keyboard.down('a');
    await tab.waitForTimeout(300);
    const ring = await tab.locator('[data-file="wide"] [data-approve-part]').evaluate((b) => b.classList.contains('holding'));
    await tab.waitForTimeout(900);
    await tab.keyboard.up('a');
    const once = await tab.evaluate(() => window.__approved.slice());
    await tab.keyboard.down('a');
    await tab.waitForTimeout(250);
    await tab.keyboard.up('a');
    await tab.locator('.gd-tip').waitFor({ timeout: 3000 });
    const tip = await tab.locator('.gd-tip').textContent();
    const twice = await tab.evaluate(() => window.__approved.slice());
    check('A held as long as a long press fills the button\'s ring and presses «اعتماد هذا الجزء» once; a short press explains instead', ring && once.join() === 'wide' && twice.join() === 'wide' && /اضغط مطولاً للتأكيد/.test(tip) && /هذا الإصدار بعينه/.test(tip), `${ring} ${once} ${twice} | ${tip}`);

    // the keys act on the player last used; Shift+G on a 9:16 video only
    const wideOff = await tab.locator('[data-file="wide"]').getByRole('button', { name: 'المناطق الآمنة' }).isDisabled();
    await tab.locator('[data-file="tall"] .wk-rp-time').click();
    const act = await tab.evaluate(() => [...document.querySelectorAll('.wk-rp')].map((x) => x.getAttribute('data-active')).join(','));
    const w0 = await time(W);
    await tab.locator('body').press('l');
    await settle(T);
    const t1 = await time(T);
    const w1 = await time(W);
    await tab.locator('body').press('Shift+G');
    const safeOn = await tab.locator('[data-file="tall"]').getByRole('button', { name: 'المناطق الآمنة' }).getAttribute('aria-pressed');
    const tint = await tab.evaluate(() => {
      const c = document.querySelector('[data-file="tall"] .wk-rp-over');
      return c.getContext('2d').getImageData(Math.round(c.width / 2), Math.round(c.height * 0.05), 1, 1).data[3];
    });
    check('the keys follow the player last used: L moves the 9:16 video, not the other; Shift+G shows its Reels safe zones, which a wide video does not offer', act === 'no,yes' && Math.abs(t1 - 1) < 0.05 && Math.abs(w1 - w0) < 0.001 && safeOn === 'true' && tint > 0 && wideOff, JSON.stringify({ act, t1, w0, w1, safeOn, tint, wideOff }));
    await tab.keyboard.down('a');
    await tab.waitForTimeout(1100);
    await tab.keyboard.up('a');
    const off = await tab.evaluate(() => window.__approved.slice());
    const offSay = await tab.locator('[data-file="tall"] [role="status"]').textContent();
    check('A does nothing where the file\'s button is off (as for a file the reviewer uploaded), and says so', off.join() === 'wide' && /غير متاح/.test(offSay), `${off} | ${offSay}`);
    await tab.screenshot({ path: path.join(out, 'player-1280.png'), fullPage: true });

    // an address with a moment and a version
    await tab.goto(base + `/review?a=${WIDE}&t=3.2&v=1`);
    await ready(W);
    await tab.waitForFunction((s) => Math.abs(document.querySelector(s).currentTime - 3.2) < 0.05, W, { timeout: 5000 });
    const hint = await tab.locator('[data-file="wide"] .wk-rp-hint').textContent();
    const prevSrc = await tab.locator(P).getAttribute('src');
    check('an address with ?t=3.2&v=1 opens the player at 3.2 s, says which version it meant, and shows version 1 beside it', /الإصدار 1 عند 00:03.2/.test(hint) && /v=1$/.test(prevSrc), `${hint} | ${prevSrc}`);
    await ctx.close();
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
  fs.writeFileSync(path.join(__dirname, 'review-player.json'), JSON.stringify(result, null, 2));
  console.log(`${result.passed} of ${result.total} passed`);
  for (const f of failed) console.log('FAIL', f.name, '|', f.detail);
  process.exit(failed.length ? 1 : 0);
})();

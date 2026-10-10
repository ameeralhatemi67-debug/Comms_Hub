// Browser verification for the design toggle (Roadmap Checkpoint 0.3): a double-click
// on the sidebar logo switches between Direction A and «الهوية الجديدة لمركز الاتصال».
//
//   npm run build && npm start
//   node qa/identity-toggle.cjs
//
// Checks the toggle, its persistence, the pre-paint restore, local fonts, that no
// request leaves the machine, page errors and overflow in the second design, and
// WCAG contrast for every text colour pair the second design defines. Screenshots
// go to qa/artifacts/identity/ (ignored by git); results to qa/identity-toggle.json.

const fs = require('node:fs');
const path = require('node:path');
const { dependency, baseURL, launchOptions } = require('./runtime.cjs');

const out = path.join(__dirname, 'artifacts', 'identity');
const routes = ['/', '/work', '/work/CH-241', '/create', '/approvals', '/calendar', '/media', '/media/poster',
  '/mail', '/ideas', '/analytics', '/monitoring', '/settings', '/account', '/admin', '/motion'];
const KEY = 'comms-hub-identity';
const checks = [];
const errors = [];
const check = (name, pass, detail) => {
  checks.push({ name, pass: !!pass, detail });
  if (!pass) errors.push(`${name}: ${detail}`);
};
const identity = (page) => page.evaluate(() => document.documentElement.getAttribute('data-identity'));
const stored = (page, key) => page.evaluate((k) => localStorage.getItem(k), key);

// Text colour pairs of the second design: [label, foreground, background(s)].
// Tokens are read from the page; gradients are checked against every stop.
const depth = ['#12604a', '#0b3a2d', '#06241b'];
const leafText = ['#f6e3a6', '#dcb257', '#c99a3c'];
const pairs = [
  ['body text on surface', '--ink', ['--surface']], ['body text on ground', '--ink', ['--bg']], ['body text on surface-2', '--ink', ['--surface-2']],
  ['muted on surface', '--muted', ['--surface']], ['muted on ground', '--muted', ['--bg']], ['muted on surface-2', '--muted', ['--surface-2']],
  ['secondary ink on surface', '--ink-2', ['--surface']],
  ['link and active tab on surface', '--green-text', ['--surface']], ['link on ground', '--green-text', ['--bg']],
  ['primary button', '--on-brand', ['--green']], ['primary button hover', '--on-brand', ['--green-hover']],
  ['selected item text', '--ink', ['--selected-bg']], ['active tab text on soft', '--green-text', ['--soft']], ['link on surface-2', '--green-text', ['--surface-2']],
  ['count badge', '--on-gold', ['--gold-hi']], ['decision tier chip', '--st-warn-fg', ['--st-warn-bg']],
  ['sidebar item', '--side-fg', depth], ['sidebar strong text', '--side-fg-strong', depth], ['sidebar small text', '--side-muted', depth],
  ['brand logo gold on brandmark (graphic, 3:1)', '--gold-hi', depth, 3],
  ['campaign text', '--on-brand', depth], ['campaign secondary', '--campaign-muted', depth], ['gold button text', '--on-gold', leafText],
  ['sidebar avatar', '--on-gold', leafText],
  ['prototype badge', '--badge-fg', ['--badge-bg']], ['avatar', '--avatar-fg', ['--avatar-bg']],
  ['notes', '--note-fg', ['--note-bg']], ['empty state', '--empty-fg', ['--surface']],
  ['danger text', '--danger', ['--surface']], ['success text', '--success', ['--surface']], ['warning', '--warning-fg', ['--warning-bg']],
  ['chip neutral', '--chip-fg', ['--chip-bg']], ['chip review', '--st-review-fg', ['--st-review-bg']],
  ['chip success', '--st-success-fg', ['--st-success-bg']], ['chip warn', '--st-warn-fg', ['--st-warn-bg']],
  ['chip danger', '--st-danger-fg', ['--st-danger-bg']], ['chip scheduled', '--st-schedule-fg', ['--st-schedule-bg']],
  ['chip production', '--st-production-fg', ['--st-production-bg']], ['chip publishing', '--st-publishing-fg', ['--st-publishing-bg']],
  ['chip success (small)', '--chip-success-fg', ['--chip-success-bg']], ['chip danger (small)', '--chip-danger-fg', ['--chip-danger-bg']],
  ['calendar entry', '--st-schedule-fg', ['--calendar-entry']],
  ['toast text', '--on-brand', ['--toast-bg']], ['toast action', '--gold-hi', ['--toast-bg']],
  ['media art headline', '--art-fg', ['--art-bg']], ['media art text', '--art-text', ['--art-bg']], ['media art kicker', '--art-kicker', ['--art-bg']],
  ['media art brand line', '--art-brand', ['--art-bg']], ['media art footer', '--art-base', ['--art-bg']],
  ['video art headline', '--art-fg', ['--art-video-bg']], ['raw art headline', '--art-fg', ['--art-raw-bg']],
];

async function contrastTable(page) {
  return page.evaluate((pairs) => {
    const probe = document.createElement('i');
    document.body.appendChild(probe);
    const css = getComputedStyle(document.documentElement);
    const rgba = (value) => {
      probe.style.color = '';
      probe.style.color = value.startsWith('--') ? css.getPropertyValue(value).trim() : value;
      const m = getComputedStyle(probe).color.match(/[\d.]+/g).map(Number);
      return { r: m[0], g: m[1], b: m[2], a: m[3] === undefined ? 1 : m[3], raw: value.startsWith('--') ? css.getPropertyValue(value).trim() : value };
    };
    const over = (top, base) => ({ r: top.r * top.a + base.r * (1 - top.a), g: top.g * top.a + base.g * (1 - top.a), b: top.b * top.a + base.b * (1 - top.a), a: 1 });
    const lum = (c) => [c.r, c.g, c.b].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; })
      .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
    const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
    const surface = rgba('--surface');
    const rows = pairs.map(([label, fg, bgs, min = 4.5]) => {
      const worst = Math.min(...bgs.map((bg) => {
        let b = rgba(bg); if (b.a < 1) b = over(b, surface);
        let f = rgba(fg); if (f.a < 1) f = over(f, b);
        return ratio(f, b);
      }));
      return { label, fg, fgValue: rgba(fg).raw, bg: bgs.join(' / '), ratio: Math.round(worst * 100) / 100, min, pass: worst >= min };
    });
    probe.remove();
    return rows;
  }, pairs);
}

(async () => {
  const { chromium } = dependency('playwright');
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch(launchOptions);
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const pageErrors = [];
  const external = [];
  const origin = new URL(baseURL).origin;
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') pageErrors.push(m.text()); });
  page.on('request', (r) => { if (!r.url().startsWith(origin) && !r.url().startsWith('data:')) external.push(r.url()); });

  // 1. Default is Direction A.
  await page.goto(baseURL + '/work', { waitUntil: 'networkidle' });
  check('default design is Direction A', (await identity(page)) === null, `data-identity=${await identity(page)}`);
  const fontA = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
  check('Direction A keeps Segoe UI', fontA.startsWith('"Segoe UI"'), fontA);

  // 2. Double-click on the logo switches to the second design and says so.
  await page.locator('.sidebar .brand').dblclick();
  await page.waitForTimeout(300);
  check('double-click switches to the second design', (await identity(page)) === 'emerald', `data-identity=${await identity(page)}`);
  check('choice is remembered in this browser', (await stored(page, KEY)) === 'emerald', `stored=${await stored(page, KEY)}`);
  const toast = (await page.locator('.toast').textContent().catch(() => '')) || '';
  check('switch is announced in a status message', toast.includes('الهوية الجديدة لمركز الاتصال'), toast);
  const selection = await page.evaluate(() => String(getSelection()));
  check('double-click does not select the brand text', selection === '', JSON.stringify(selection));

  // 3. Fonts are the app's own and are in use.
  await page.evaluate(() => document.fonts.ready);
  const fonts = await page.evaluate(() => ({
    body: getComputedStyle(document.body).fontFamily,
    h1: getComputedStyle(document.querySelector('main h1')).fontFamily,
    plex: document.fonts.check('16px "IBM Plex Sans Arabic"', 'مركز'),
    kufi: document.fonts.check('600 16px "Reem Kufi"', 'مركز'),
    loaded: [...document.fonts].filter((f) => f.status === 'loaded').map((f) => `${f.family} ${f.weight}`),
  }));
  check('body uses IBM Plex Sans Arabic', fonts.body.startsWith('"IBM Plex Sans Arabic"'), fonts.body);
  check('headings use Reem Kufi', fonts.h1.startsWith('"Reem Kufi"'), fonts.h1);
  check('both faces loaded from the app', fonts.plex && fonts.kufi && fonts.loaded.length > 0, fonts.loaded.join(', '));
  await page.screenshot({ path: path.join(out, 'toggle-1440-work.png'), fullPage: true });

  // 4. Reload keeps the second design, applied before hydration without errors.
  const before = pageErrors.length;
  await page.reload({ waitUntil: 'networkidle' });
  check('reload keeps the second design', (await identity(page)) === 'emerald', `data-identity=${await identity(page)}`);
  check('no hydration or console errors after reload', pageErrors.length === before, pageErrors.slice(before).join(' | '));
  const firstPaint = await page.evaluate(() => {
    const s = [...document.head.querySelectorAll('script')].find((x) => x.textContent.includes('data-identity'));
    return !!s && document.head.firstElementChild !== null;
  });
  check('restore script runs from <head> before the body', firstPaint, 'inline script present in head');

  // 5. Every page in the second design: errors, overflow, screenshots.
  for (const width of [1440, 1280, 900, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of routes) {
      await page.goto(baseURL + route, { waitUntil: 'networkidle' });
      await page.locator('main').waitFor();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
      check(`no horizontal overflow ${width} ${route}`, !overflow, overflow ? 'page scrolls sideways' : 'ok');
      if (width === 1440 || width === 390) {
        const name = route === '/' ? 'home' : route.slice(1).replace(/\//g, '_');
        await page.screenshot({ path: path.join(out, `emerald-${width}-${name}.png`), fullPage: true, animations: 'disabled' });
      }
    }
  }
  check('no page errors in the second design', pageErrors.length === 0, pageErrors.join(' | '));
  await page.setViewportSize({ width: 1440, height: 900 });

  // 6. Overlays in the second design.
  await page.goto(baseURL + '/', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'الإشعارات', exact: true }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(out, 'emerald-1440-notifications.png'), animations: 'disabled' });
  await page.keyboard.press('Escape');

  // 7. Collapsed sidebar: the brandmark alone still toggles; one click still goes home.
  await page.goto(baseURL + '/work', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'طي أو توسيع القائمة', exact: true }).click();
  await page.locator('.sidebar .brandmark').dblclick();
  await page.waitForTimeout(300);
  check('double-click on the collapsed logo switches back to Direction A', (await identity(page)) === null, `data-identity=${await identity(page)}`);
  check('switching back clears the remembered choice', (await stored(page, KEY)) === null, `stored=${await stored(page, KEY)}`);
  check('switching back is announced', ((await page.locator('.toast').textContent().catch(() => '')) || '').includes('التصميم الحالي'), 'toast');
  await page.goto(baseURL + '/work', { waitUntil: 'networkidle' });
  await page.locator('.sidebar .brand').click();
  await page.waitForURL(baseURL + '/');
  check('a single click on the logo still opens Home and does not switch', (await identity(page)) === null, page.url());
  await page.reload({ waitUntil: 'networkidle' });
  check('reload after switching back shows Direction A', (await identity(page)) === null, `data-identity=${await identity(page)}`);

  // 8. Reduced motion: no transitions in the second design.
  const rm = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const rmPage = await rm.newPage();
  await rmPage.addInitScript(([k]) => localStorage.setItem(k, 'emerald'), [KEY]);
  await rmPage.goto(baseURL + '/', { waitUntil: 'networkidle' });
  const transition = await rmPage.evaluate(() => getComputedStyle(document.querySelector('.nav-item')).transitionDuration);
  check('reduced motion turns transitions off', transition === '0s', transition);
  await rm.close();

  // 9. Nothing left the machine (fonts are not fetched from Google).
  check('no request leaves the local server', external.length === 0, external.slice(0, 5).join(' | ') || 'none');

  // 9b. All eight role homes in both designs (evidence for Roadmap task 0.3.2.2).
  const roleIds = ['director', 'assistant', 'writer', 'designer', 'producer', 'publisher', 'member', 'admin'];
  for (const design of ['direction-a', 'emerald']) {
    await page.evaluate(([k, d]) => (d === 'emerald' ? localStorage.setItem(k, d) : localStorage.removeItem(k)), [KEY, design]);
    await page.goto(baseURL + '/', { waitUntil: 'networkidle' });
    check(`design ${design} active for role homes`, (await identity(page)) === (design === 'emerald' ? 'emerald' : null), `data-identity=${await identity(page)}`);
    for (const role of roleIds) {
      await page.selectOption('select[aria-label="عرض بصفة"]', role);
      await page.waitForTimeout(200);
      await page.screenshot({ path: path.join(out, `home-${design}-${role}.png`), animations: 'disabled' });
    }
  }

  // 10. Contrast of every text pair in the second design, light and evening modes.
  await page.evaluate((k) => localStorage.setItem(k, 'emerald'), KEY);
  await page.reload({ waitUntil: 'networkidle' });
  const contrast = await contrastTable(page);
  for (const row of contrast) check(`contrast light ${row.label} ${row.ratio}:1`, row.pass, `${row.fg} (${row.fgValue}) on ${row.bg}`);
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.reload({ waitUntil: 'networkidle' });
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  check('evening mode follows the device in the second design', bg === 'rgb(7, 19, 14)', bg);
  const contrastDark = await contrastTable(page);
  for (const row of contrastDark) check(`contrast evening ${row.label} ${row.ratio}:1`, row.pass, `${row.fg} (${row.fgValue}) on ${row.bg}`);
  await page.evaluate((k) => localStorage.removeItem(k), KEY);
  await page.reload({ waitUntil: 'networkidle' });
  const bgA = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  check('Direction A has no evening mode', bgA === 'rgb(244, 246, 242)', bgA);
  await page.emulateMedia({ colorScheme: 'light' });

  await browser.close();
  const passed = checks.filter((c) => c.pass).length;
  const report = { date: new Date().toISOString(), baseURL, passed, failed: checks.length - passed, errors, contrast, contrastDark, checks };
  fs.writeFileSync(path.join(__dirname, 'identity-toggle.json'), JSON.stringify(report, null, 2));
  console.log(`${passed} passed, ${checks.length - passed} failed`);
  for (const e of errors) console.log('FAIL', e);
  if (errors.length) process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });

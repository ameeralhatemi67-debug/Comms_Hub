// Browser verification for the screens of the second design (Roadmap Checkpoint 0.3):
// Home decisions and campaign pulse, the approval stamp and binding note, notification
// tiers, the calendar week with drag-to-request, motion from the work item, the
// component page, the phone sheet and logo, and evening mode. Also checks that none of
// these structures appear in Direction A.
//
//   npm run build && npm start
//   node qa/identity-screens.cjs
//
// Results go to qa/identity-screens.json; screenshots to qa/artifacts/identity-screens/.

const fs = require('node:fs');
const path = require('node:path');
const { dependency, baseURL, launchOptions } = require('./runtime.cjs');

const out = path.join(__dirname, 'artifacts', 'identity-screens');
const KEY = 'comms-hub-identity';
const checks = [];
const errors = [];
const check = (task, name, pass, detail) => {
  checks.push({ task, name, pass: !!pass, detail });
  if (!pass) errors.push(`${task} ${name}: ${detail}`);
};
const asRole = async (page, role) => {
  await page.selectOption('select[aria-label="عرض بصفة"]', role);
  await page.waitForTimeout(150);
};

(async () => {
  const { chromium } = dependency('playwright');
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch(launchOptions);
  const pageErrors = [];
  const external = [];
  const origin = new URL(baseURL).origin;
  const open = async ({ evening, ...opts } = {}, second = true) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 }, ...opts });
    if (second) await ctx.addInitScript((k) => localStorage.setItem(k, 'emerald'), KEY);
    // Evening mode is chosen, not inferred from the device (src/lib/identity.ts).
    if (evening) await ctx.addInitScript(() => localStorage.setItem('comms-hub-theme', 'dark'));
    const page = await ctx.newPage();
    page.on('pageerror', (e) => pageErrors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') pageErrors.push(m.text()); });
    page.on('request', (r) => { if (!r.url().startsWith(origin) && !r.url().startsWith('data:')) external.push(r.url()); });
    return { ctx, page };
  };
  const shot = (page, name, full = true) => page.screenshot({ path: path.join(out, `${name}.png`), fullPage: full, animations: 'disabled' });

  // --- Direction A carries none of the second design's structures --------------
  {
    const { ctx, page } = await open({}, false);
    await page.goto(baseURL + '/', { waitUntil: 'networkidle' });
    const a = await page.evaluate(() => ({
      decisions: !!document.querySelector('.decisions'),
      pulse: !!document.querySelector('.pulse'),
      accentFont: getComputedStyle(document.querySelector('.accent-word')).fontFamily,
      h1Font: getComputedStyle(document.querySelector('main h1')).fontFamily,
    }));
    check('A', 'Direction A Home has no decisions panel or pulse', !a.decisions && !a.pulse, JSON.stringify(a));
    check('A', 'Direction A writes the accent word in the heading face', a.accentFont === a.h1Font, JSON.stringify(a));
    await page.goto(baseURL + '/calendar', { waitUntil: 'networkidle' });
    check('A', 'Direction A calendar opens on the month', (await page.locator('.calendar-grid').count()) === 1 && (await page.locator('.week-grid').count()) === 0, 'month grid');
    await page.getByRole('button', { name: 'الإشعارات', exact: true }).click();
    check('A', 'Direction A notifications keep their tabs', (await page.locator('dialog .seg.tiers').count()) === 0, 'tabs');
    await ctx.close();
  }

  // --- 0.3.3.1 Home: decisions now, campaign pulse, accent word ------------------
  {
    const { ctx, page } = await open();
    const T = '0.3.3.1';
    await page.goto(baseURL + '/', { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    const before = await page.locator('.decisions .decision-row').count();
    const badge = await page.locator('.decisions .count-badge').textContent();
    check(T, '«قراراتك الآن» lists the decisions with a count', before === 2 && badge.trim() === '2', `${before} rows, badge ${badge}`);
    const stations = await page.locator('.pulse .stations li').allTextContents();
    const now = await page.locator('.pulse .stations li.now').count();
    check(T, 'campaign pulse shows five stations and one current', stations.length === 5 && now === 1, stations.join(' | '));
    check(T, 'Home warns about the scheduled item at risk', (await page.locator('.alert-strip').textContent()).includes('تحتاج انتباهك'), 'alert');
    const accent = await page.evaluate(() => getComputedStyle(document.querySelector('.accent-word')).fontFamily);
    check(T, 'the accent word uses Aref Ruqaa', accent.startsWith('"Aref Ruqaa"'), accent);
    await shot(page, 'home-1440');
    await page.locator('.decisions .decision-row').first().getByRole('button', { name: /اعتماد الإصدار/ }).click();
    const after = await page.locator('.decisions .decision-row').count();
    check(T, 'approving from Home removes the decision', after === before - 1, `${before} -> ${after}`);
    await ctx.close();
  }

  // --- 0.3.3.2 Approvals: binding note and stamp ----------------------------------
  for (const motion of ['no-preference', 'reduce']) {
    const { ctx, page } = await open({ reducedMotion: motion });
    const T = '0.3.3.2';
    await page.goto(baseURL + '/approvals', { waitUntil: 'networkidle' });
    const note = await page.locator('.binding-note').textContent();
    check(T, `binding note names the exact version (${motion})`, note.includes('الإصدار 4 تحديداً'), note);
    await page.getByRole('button', { name: 'اعتماد الإصدار 4', exact: true }).click();
    const stamp = page.locator('.approval-stamp');
    await stamp.waitFor({ timeout: 2000 });
    const text = await stamp.textContent();
    const anim = await stamp.locator('.seal').evaluate((e) => getComputedStyle(e).animationName);
    check(T, `the approval stamp appears (${motion})`, text.includes('اعتُمد الإصدار 4'), text);
    check(T, `the stamp ${motion === 'reduce' ? 'does not' : 'does'} animate`, motion === 'reduce' ? anim === 'none' : anim === 'stampin', anim);
    if (motion === 'no-preference') await shot(page, 'approval-stamp', false);
    await page.waitForTimeout(2600);
    check(T, `the stamp clears by itself (${motion})`, (await stamp.count()) === 0, 'gone');
    await ctx.close();
  }

  // --- 0.3.3.3 Notification tiers ---------------------------------------------------
  {
    const { ctx, page } = await open();
    const T = '0.3.3.3';
    await page.goto(baseURL + '/', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'الإشعارات', exact: true }).click();
    const tiers = await page.locator('dialog .seg.tiers button').allTextContents();
    check(T, 'three tiers plus all', tiers.length === 4 && ['قرارك', 'انتباه', 'للعلم'].every((t) => tiers.some((x) => x.includes(t))), tiers.join(' | '));
    const firstChip = await page.locator('dialog .notice .chip').first().textContent();
    check(T, 'decisions come first', firstChip.trim() === 'قرارك', firstChip);
    await page.locator('dialog .seg.tiers button[data-tier="info"]').click();
    const chips = await page.locator('dialog .notice .chip').allTextContents();
    check(T, 'a tier shows only its notices', chips.length > 0 && chips.every((c) => c.trim() === 'للعلم'), chips.join(' | '));
    await shot(page, 'notification-tiers', false);
    await ctx.close();
  }

  // --- 0.3.4.1 Calendar week, drag to request, publisher confirms -------------------
  {
    const { ctx, page } = await open();
    const T = '0.3.4.1';
    await page.goto(baseURL + '/calendar', { waitUntil: 'networkidle' });
    const heads = await page.locator('.week-head').count();
    const lanes = await page.locator('.week-lane-label').allTextContents();
    check(T, 'the second design opens on the week with channel lanes', heads === 7 && lanes.join(',') === 'Instagram,X,LinkedIn,التسليم الداخلي', `${heads} days; ${lanes.join(',')}`);
    const source = page.locator('.week-cell[data-lane="Instagram"][data-day="2026-09-23"] .ev', { hasText: 'إعداد منشور Instagram' });
    const target = page.locator('.week-cell[data-lane="Instagram"][data-day="2026-09-24"]');
    await source.dragTo(target);
    const pending = await page.locator('.week-cell[data-day="2026-09-24"] .ev.pending').count();
    check(T, 'dragging records a requested time, not a new schedule', pending >= 1 && (await page.locator('.week-cell[data-day="2026-09-23"] .ev:not(.pending)', { hasText: 'إعداد منشور Instagram' }).count()) >= 1, `${pending} pending`);
    const waiting = await page.locator('.move-request').textContent();
    check(T, 'the director sees the request waiting for the publishing officer', waiting.includes('بانتظار تأكيد مسؤول النشر') && waiting.includes('2026-09-24 18:00'), waiting);
    await shot(page, 'calendar-week-request');
    // The request is kept in the shared store: it survives leaving the calendar.
    await page.getByRole('link', { name: 'الرئيسية' }).first().click();
    await page.waitForURL(baseURL + '/');
    await page.getByRole('link', { name: 'التقويم' }).first().click();
    await page.waitForURL('**/calendar');
    const kept = await page.locator('.week-cell[data-day="2026-09-24"] .ev.pending').count();
    check(T, 'the request survives navigating away and back', kept >= 1 && (await page.locator('.move-request').count()) === 1, `${kept} pending after return`);
    await asRole(page, 'publisher');
    await page.getByRole('button', { name: 'الإشعارات', exact: true }).click();
    const told = await page.locator('dialog .notice p').allTextContents();
    check(T, 'the publishing officer is notified of the request', told.some((t) => t.includes('طُلب نقل')), told.join(' | '));
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'تأكيد النقل', exact: true }).click();
    const moved = await page.locator('.week-cell[data-lane="Instagram"][data-day="2026-09-24"] .ev:not(.pending)', { hasText: 'إعداد منشور Instagram' }).count();
    check(T, 'the publishing officer confirms and the item moves', moved === 1 && (await page.locator('.move-request').count()) === 0, `${moved} moved`);
    // Keyboard path: the event dialog requests a time without dragging.
    await asRole(page, 'director');
    await page.locator('.week-cell[data-lane="X"] .ev', { hasText: 'إعداد منشور Instagram' }).first().click();
    await page.locator('dialog[open] input[type="datetime-local"]').fill('2026-09-25T10:00');
    await page.getByRole('button', { name: 'طلب النقل', exact: true }).click();
    check(T, 'a move can be requested from the dialog by keyboard', (await page.locator('.move-request').textContent()).includes('2026-09-25 10:00'), 'dialog request');
    await ctx.close();
  }

  // --- 0.3.4.2 Motion Studio from the work item --------------------------------------
  {
    const { ctx, page } = await open();
    const T = '0.3.4.2';
    await page.goto(baseURL + '/work/CH-242', { waitUntil: 'networkidle' });
    const links = await page.locator('.motion-suggest a').allTextContents();
    check(T, 'a poster work suggests three templates', links.length === 3, links.join(' | '));
    await page.locator('.motion-suggest a', { hasText: 'الشريط التحريري' }).click();
    await page.waitForURL('**/motion?**');
    await page.getByLabel('العنوان', { exact: true }).first().waitFor({ timeout: 15000 });
    const title = await page.getByLabel('العنوان', { exact: true }).first().inputValue();
    const sub = await page.locator('main .page-heading p').textContent();
    check(T, 'the studio opens on the template with the work title', title === 'تصميم الملصق' && sub.includes('CH-242'), `${title} | ${sub}`);
    await shot(page, 'motion-from-work', false);
    await ctx.close();
  }

  // --- 0.3.2.3 Component page, both designs ------------------------------------------
  for (const second of [false, true]) {
    const { ctx, page } = await open({}, second);
    const T = '0.3.2.3';
    await page.goto(baseURL + '/components', { waitUntil: 'networkidle' });
    const parts = await page.$$eval('[data-component]', (els) => els.map((e) => e.getAttribute('data-component')));
    const want = ['button-primary', 'button-default', 'button-light', 'button-danger', 'chips', 'fields', 'tabs', 'segmented', 'switch', 'overlays', 'empty-loading'];
    check(T, `component page shows every component (${second ? 'second design' : 'Direction A'})`, want.every((w) => parts.includes(w)), parts.join(','));
    const states = await page.locator('[data-component="button-primary"] button').count();
    check(T, `buttons show normal, hover, focus, disabled and loading (${second ? 'second' : 'A'})`, states === 5, `${states}`);
    await page.locator('[data-component="switch"]').click();
    check(T, 'the switch toggles', (await page.locator('[data-component="switch"] input').isChecked()) === false, 'off');
    await shot(page, `components-${second ? 'emerald' : 'direction-a'}`);
    await ctx.close();
  }

  // --- 0.3.4.3 Phone: logo in the top bar, approval sheet with 44 px targets ----------
  {
    const { ctx, page } = await open({ viewport: { width: 390, height: 844 } });
    const T = '0.3.4.3';
    await page.goto(baseURL + '/approvals', { waitUntil: 'networkidle' });
    // The sheet sits above the bottom bar from first load, without scrolling.
    const sheet = await page.locator('.decision-actions').evaluate((e) => ({
      position: getComputedStyle(e).position,
      heights: [...e.querySelectorAll('button')].map((b) => b.getBoundingClientRect().height),
      lowest: Math.max(...[...e.querySelectorAll('button')].map((b) => b.getBoundingClientRect().bottom)),
      nav: document.querySelector('.mobile-nav').getBoundingClientRect().top,
    }));
    check(T, 'the decision sheet sits above the bottom bar on first load', sheet.position === 'fixed' && sheet.lowest <= sheet.nav, JSON.stringify(sheet));
    // The end of the page stays reachable above the sheet.
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(200);
    const reach = await page.evaluate(() => ({
      link: document.querySelector('main .text-link').getBoundingClientRect().bottom,
      sheet: document.querySelector('.decision-actions').getBoundingClientRect().top,
    }));
    check(T, 'the sheet never hides the end of the page', reach.link <= reach.sheet, JSON.stringify(reach));
    await page.evaluate(() => window.scrollTo(0, 0));
    check(T, 'every decision button is at least 44 px tall', sheet.heights.length >= 3 && sheet.heights.every((h) => h >= 44), JSON.stringify(sheet.heights));
    await shot(page, 'phone-approval-sheet', false);
    const brand = page.locator('.mobile-brand');
    check(T, 'the logo is in the phone top bar', await brand.isVisible(), 'visible');
    await brand.dblclick();
    await page.waitForTimeout(200);
    check(T, 'double-tapping the phone logo switches the design off', (await page.evaluate(() => document.documentElement.getAttribute('data-identity'))) === null, 'off');
    await brand.dblclick();
    await page.waitForTimeout(200);
    check(T, 'and on again', (await page.evaluate(() => document.documentElement.getAttribute('data-identity'))) === 'emerald', 'on');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    check(T, 'no sideways scrolling on the phone', !overflow, 'ok');
    await ctx.close();
  }

  // --- Evening mode screenshots and overflow on the new screens ------------------------
  {
    const { ctx, page } = await open({ evening: true });
    for (const route of ['/', '/work', '/approvals', '/calendar', '/components', '/motion']) {
      await page.goto(baseURL + route, { waitUntil: 'networkidle' });
      await page.waitForTimeout(route === '/motion' ? 1500 : 200);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
      check('0.3.2.1', `evening ${route} renders without sideways scrolling`, !overflow, 'ok');
      await shot(page, `evening${route === '/' ? '-home' : route.replace(/\//g, '-')}`);
    }
    const studio = await page.evaluate(() => {
      const el = document.querySelector('.ms');
      return el ? getComputedStyle(el).color : 'missing';
    });
    check('0.3.4.2', 'the Motion Studio keeps dark text on its light panels in evening mode', studio === 'rgb(16, 36, 29)', studio);
    await ctx.close();
  }

  check('all', 'no page or console errors', pageErrors.length === 0, pageErrors.slice(0, 5).join(' | '));
  check('all', 'no request leaves the local server', external.length === 0, external.slice(0, 5).join(' | ') || 'none');
  await browser.close();
  const passed = checks.filter((c) => c.pass).length;
  fs.writeFileSync(path.join(__dirname, 'identity-screens.json'), JSON.stringify({ date: new Date().toISOString(), baseURL, passed, failed: checks.length - passed, errors, checks }, null, 2));
  console.log(`${passed} passed, ${checks.length - passed} failed`);
  for (const e of errors) console.log('FAIL', e);
  if (errors.length) process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });

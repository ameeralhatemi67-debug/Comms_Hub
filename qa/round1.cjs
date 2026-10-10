// Browser verification for the Round 1 corrections of Phase 0.2.3 (findings of R01).
// One section per task; each check names the finding it covers.
//
//   npm run build && npm start
//   node qa/round1.cjs
//
// Results go to qa/round1.json; screenshots to qa/artifacts/round1/ (ignored by git).

const fs = require('node:fs');
const path = require('node:path');
const { dependency, baseURL, launchOptions } = require('./runtime.cjs');

const out = path.join(__dirname, 'artifacts', 'round1');
const checks = [];
const errors = [];
const check = (task, name, pass, detail) => {
  checks.push({ task, name, pass: !!pass, detail });
  if (!pass) errors.push(`${task} ${name}: ${detail}`);
};

async function asRole(page, role) {
  await page.selectOption('select[aria-label="عرض بصفة"]', role);
  await page.waitForTimeout(150);
}

const sections = [];
const section = (task, fn) => sections.push([task, fn]);

// --- 0.2.3.5 Overdue count and filter (F-R01-02) ----------------------------
section('0.2.3.5', async (page, shot) => {
  const T = '0.2.3.5';
  await page.goto(baseURL + '/', { waitUntil: 'networkidle' });
  const eyebrow = await page.locator('main .eyebrow').first().textContent();
  check(T, 'scenario date stated on Home', eyebrow.includes('اليوم في النموذج: الاثنين 21 سبتمبر 2026'), eyebrow);

  for (const role of ['director', 'assistant']) {
    await page.goto(baseURL + '/', { waitUntil: 'networkidle' });
    await asRole(page, role);
    for (const [key, filter, label] of [['overdue', 'overdue', 'متأخر'], ['soon', 'soon', 'قريب الموعد']]) {
      const tile = page.locator(`.stats [data-tile="${key}"]`);
      const shown = Number((await tile.locator('strong').textContent()).trim());
      const tileLabel = (await tile.locator('span').first().textContent()).trim();
      check(T, `${role} home shows the ${key} count`, tileLabel === label && Number.isFinite(shown) && shown > 0, `${tileLabel} = ${shown}`);
      await tile.click();
      await page.waitForURL(`**/work?due=${filter}`);
      await asRole(page, role);
      await page.locator('main h1').waitFor();
      const rows = await page.locator('main .work-row').count();
      const selected = await page.locator('select[aria-label="موعد التسليم"]').inputValue();
      check(T, `${role} ${key} count equals its filtered list`, rows === shown && selected === filter, `tile ${shown}, list ${rows}, filter ${selected}`);
      if (key === 'overdue') {
        const notes = await page.locator('main .work-row .due-note.late').allTextContents();
        check(T, `${role} every overdue row says how late it is`, notes.length === rows && notes.every((n) => n.startsWith('متأخر')), notes.join(' | '));
        if (role === 'director') await shot('overdue-list-1440');
      }
      await page.goto(baseURL + '/', { waitUntil: 'networkidle' });
      await asRole(page, role);
    }
  }

  await page.goto(baseURL + '/work', { waitUntil: 'networkidle' });
  // Leadership opens on the team view (task 0.2.3.6); the plain list is «الكل».
  await page.getByRole('button', { name: 'الكل', exact: true }).click();
  const all = await page.locator('main .work-row').count();
  await page.selectOption('select[aria-label="موعد التسليم"]', 'overdue');
  const late = await page.locator('main .work-row').count();
  check(T, 'Work has an «متأخر» filter that narrows the list', late > 0 && late < all, `all ${all}, overdue ${late}`);
  const workEyebrow = await page.locator('main .eyebrow').first().textContent();
  check(T, 'scenario date stated on Work', workEyebrow.includes('21 سبتمبر 2026'), workEyebrow);
});

// --- 0.2.3.6 Team workload and stage view (F-R01-01, F-R01-17) ----------------
section('0.2.3.6', async (page, shot) => {
  const T = '0.2.3.6';
  for (const role of ['director', 'assistant']) {
    await page.setViewportSize({ width: 1440, height: 950 });
    await page.goto(baseURL + '/work', { waitUntil: 'networkidle' });
    await asRole(page, role);
    await page.getByRole('button', { name: 'الفريق', exact: true }).click();
    const purpose = await page.locator('main .page-heading p').textContent();
    check(T, `${role} Work states its purpose in one line`, purpose.includes('من يعمل على ماذا'), purpose);
    const cards = page.locator('main .team-card');
    const names = await cards.locator('h2').allTextContents();
    check(T, `${role} team view lists people, not roles`, ['خالد', 'لمى', 'سارة', 'فهد', 'أحمد', 'ماجد'].every((n) => names.includes(n)), names.join(', '));
    const items = await page.locator('main .team-item').count();
    const total = await page.evaluate(() => document.querySelectorAll('main .team-item').length);
    check(T, `${role} team view shows every work item once`, items === 11 && total === 11, `${items} items`);
    const lama = cards.filter({ has: page.locator('h2', { hasText: 'لمى' }) });
    const lamaText = await lama.textContent();
    check(T, `${role} team view shows stage and lateness per item`, lamaText.includes('الإنتاج · كتابة النص') && lamaText.includes('متأخر 3 أيام') && lamaText.includes('1 متأخر'), lamaText);
    const khalid = await cards.filter({ has: page.locator('h2', { hasText: 'خالد' }) }).textContent();
    check(T, `${role} team view shows what awaits review`, khalid.includes('بانتظار المراجعة'), khalid);
    if (role === 'director') await shot('team-view-1440');

    await page.goto(baseURL + '/', { waitUntil: 'networkidle' });
    await asRole(page, role);
    const rows = await page.locator('.team-load-row').allTextContents();
    check(T, `${role} home shows load per person`, rows.length >= 6 && rows.some((r) => r.includes('لمى') && r.includes('متأخر')), rows.join(' | '));
    if (role === 'director') await shot('home-team-load-1440');
  }
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto(baseURL + '/work', { waitUntil: 'networkidle' });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  check(T, 'team view fits a phone without sideways scrolling', !overflow, overflow ? 'overflow' : 'ok');
  await shot('team-view-390');

  // Specialists see their own work only under «مهامي».
  await page.setViewportSize({ width: 1440, height: 950 });
  await page.goto(baseURL + '/work', { waitUntil: 'networkidle' });
  await asRole(page, 'writer');
  await page.getByRole('button', { name: 'مهامي', exact: true }).click();
  const mine = await page.locator('main .work-row .owner').allTextContents();
  check(T, 'writer «مهامي» shows Khalid only, not the other writer', mine.length > 0 && mine.every((n) => n === 'خالد'), mine.join(', '));
});

// --- 0.2.3.7 Stale channel variants (F-R01-05) --------------------------------
section('0.2.3.7', async (page, shot) => {
  const T = '0.2.3.7';
  // Flags on the content shown, not on the snapshots in the release history below it.
  const flagged = async () =>
    page.$$eval('main .variant-copy.stale b', (els) => els.filter((e) => !e.closest('.release-history')).map((e) => e.textContent));
  await page.goto(baseURL + '/work/CH-243', { waitUntil: 'networkidle' });
  await asRole(page, 'writer');
  check(T, 'seeded X variant is flagged on the work page', JSON.stringify(await flagged()) === '["X"]', JSON.stringify(await flagged()));
  await shot('flag-on-work-page');

  await page.getByRole('link', { name: 'تحرير', exact: true }).click();
  await page.locator('main textarea').first().waitFor();
  const masterWarning = await page.locator('main .warning[role=status]').first().textContent();
  check(T, 'composer warns on the master tab', masterWarning.includes('X'), masterWarning);
  await page.getByRole('button', { name: 'X · تحتاج مراجعة', exact: true }).click();
  await page.getByRole('button', { name: 'تأكيد الصياغة', exact: true }).click();
  const tabAfter = await page.locator('main .tabs button').allTextContents();
  check(T, 'confirming clears the flag in the composer', tabAfter.includes('X') && !tabAfter.some((t) => t.includes('تحتاج مراجعة')), tabAfter.join(', '));
  await page.getByRole('button', { name: 'حفظ إصدار جديد', exact: true }).click();
  await page.waitForURL('**/work/CH-243');
  check(T, 'confirmed variant is no longer flagged', (await flagged()).length === 0, JSON.stringify(await flagged()));

  // Edit the master text: the variant written before it is flagged again.
  await page.getByRole('link', { name: 'تحرير', exact: true }).click();
  await page.locator('main textarea').first().fill('نص أساسي معدّل للتحقق من الصياغات');
  const tabs = await page.locator('main .tabs button').allTextContents();
  check(T, 'editing the master text flags the variant at once', tabs.includes('X · تحتاج مراجعة'), tabs.join(', '));
  await shot('composer-flag');
  await page.getByRole('button', { name: 'حفظ إصدار جديد', exact: true }).click();
  await page.waitForURL('**/work/CH-243');
  await page.getByRole('button', { name: /إرسال الإصدار \d+ للمراجعة/ }).click();

  await page.getByRole('link', { name: 'الموافقات والنشر' }).first().click();
  await page.waitForURL('**/approvals');
  await asRole(page, 'director');
  await page.locator('.queue-item', { hasText: 'كتابة محتوى X' }).click();
  check(T, 'reviewer sees the flag on the release', JSON.stringify(await flagged()) === '["X"]', JSON.stringify(await flagged()));
  await shot('flag-for-reviewer');
});

// --- 0.2.3.8 Highlighted version difference (F-R01-06) -------------------------
section('0.2.3.8', async (page, shot) => {
  const T = '0.2.3.8';
  await page.goto(baseURL + '/approvals', { waitUntil: 'networkidle' });
  await asRole(page, 'director');
  await page.locator('.queue-item', { hasText: 'منشور شكر المتطوعين' }).click();
  const diff = page.locator('main .review-layout > .panel > .version-diff');
  check(T, 'review screen compares revision 2 with revision 1', (await diff.locator('h3').textContent()).includes('منذ الإصدار 1'), await diff.locator('h3').textContent());
  const added = await diff.locator('.diff-text ins').allTextContents();
  const removed = await diff.locator('.diff-text del').allTextContents();
  check(T, 'added words are highlighted', added.join(' ').includes('المتطوعين'), added.join(' | '));
  check(T, 'removed words are struck through', removed.join(' ').includes('شارك'), removed.join(' | '));
  const fields = await diff.locator('.diff-fields').textContent();
  check(T, 'changed fields are listed', fields.includes('الوسيط') && fields.includes('v4') && fields.includes('v5'), fields);
  await shot('review-diff-1440');

  // The writer's history shows the same difference on revision 2 and none on revision 1.
  await page.goto(baseURL + '/work/CH-250', { waitUntil: 'networkidle' });
  await asRole(page, 'writer');
  await page.getByRole('button', { name: 'الموافقة', exact: true }).click();
  const records = page.locator('main .release-history details');
  const count = await records.count();
  for (let i = 0; i < count; i++) await records.nth(i).locator('summary').click();
  const withDiff = await records.evaluateAll((els) => els.map((e) => [e.querySelector('summary').textContent, !!e.querySelector('.version-diff')]));
  check(T, "writer's history shows the difference on later revisions only",
    withDiff.some(([s, d]) => s.includes('الإصدار 2') && d) && withDiff.filter(([s]) => s.includes('الإصدار 1')).every(([, d]) => !d),
    JSON.stringify(withDiff));
  await shot('history-diff-1440');

  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto(baseURL + '/approvals', { waitUntil: 'networkidle' });
  await page.locator('.queue-item', { hasText: 'منشور شكر المتطوعين' }).click();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  check(T, 'difference fits a phone', !overflow, overflow ? 'overflow' : 'ok');
  await shot('review-diff-390');
});

// --- 0.2.3.9 Early reconnect warning (F-R01-07) --------------------------------
section('0.2.3.9', async (page, shot) => {
  const T = '0.2.3.9';
  await page.goto(baseURL + '/', { waitUntil: 'networkidle' });
  await asRole(page, 'publisher');
  const risky = page.locator('.panel', { has: page.locator('h2', { hasText: 'مواعيد معرضة للخطر' }) });
  const riskText = await risky.textContent();
  check(T, 'publisher home lists the scheduled item at risk', riskText.includes('إعداد منشور Instagram') && riskText.includes('X') && riskText.includes('LinkedIn'), riskText);
  await shot('publisher-home-at-risk');

  await page.getByRole('link', { name: 'الموافقات والنشر' }).first().click();
  await page.waitForURL('**/approvals');
  await page.locator('.queue-item', { hasText: 'تصميم الملصق' }).click();
  await page.getByRole('button', { name: 'جدولة', exact: true }).click();
  const dialog = page.locator('dialog[open]');
  await dialog.locator('input[type="datetime-local"]').fill('2026-09-23T18:00');
  const warn = await dialog.locator('.reauth-warning').textContent();
  check(T, 'scheduling onto the expired LinkedIn account warns at once', warn.includes('LinkedIn') && warn.includes('منتهٍ'), warn);
  check(T, 'scheduling after X runs out warns before the publication time', warn.includes('X') && warn.includes('قبل موعد النشر'), warn);
  await shot('schedule-warning', false);
  await dialog.locator('input[type="datetime-local"]').fill('2026-09-23T09:00');
  const morning = await dialog.locator('.reauth-warning').textContent();
  check(T, 'the warning follows the chosen time (X is fine in the morning)', !morning.includes('قبل موعد النشر') && morning.includes('LinkedIn'), morning);
  await dialog.locator('input[type="datetime-local"]').fill('2026-09-23T18:00');
  await dialog.getByRole('button', { name: 'تأكيد', exact: true }).click();
  const toast = await page.locator('.toast').textContent();
  check(T, 'scheduling still succeeds and says what is at risk', toast.includes('تمت الجدولة') && toast.includes('تنبيه'), toast);
  await page.getByRole('link', { name: 'الرئيسية' }).first().click();
  const after = await page.locator('.panel', { has: page.locator('h2', { hasText: 'مواعيد معرضة للخطر' }) }).textContent();
  check(T, 'the newly scheduled item joins the at-risk list', after.includes('تصميم الملصق'), after);
});

(async () => {
  const { chromium } = dependency('playwright');
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch(launchOptions);
  const pageErrors = [];
  for (const [task, fn] of sections) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
    page.on('pageerror', (e) => pageErrors.push(`${task}: ${e}`));
    page.on('console', (m) => { if (m.type() === 'error') pageErrors.push(`${task}: ${m.text()}`); });
    const shot = (name, full = true) => page.screenshot({ path: path.join(out, `${task}-${name}.png`), fullPage: full, animations: 'disabled' });
    try {
      await fn(page, shot);
    } catch (e) {
      check(task, 'section ran to the end', false, String(e).split('\n')[0]);
    }
    await page.close();
  }
  check('all', 'no page or console errors', pageErrors.length === 0, pageErrors.join(' | '));
  await browser.close();
  const passed = checks.filter((c) => c.pass).length;
  fs.writeFileSync(path.join(__dirname, 'round1.json'), JSON.stringify({ date: new Date().toISOString(), baseURL, passed, failed: checks.length - passed, errors, checks }, null, 2));
  console.log(`${passed} passed, ${checks.length - passed} failed`);
  for (const e of errors) console.log('FAIL', e);
  if (errors.length) process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });

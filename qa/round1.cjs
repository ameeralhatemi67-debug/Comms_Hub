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
  const all = await page.locator('main .work-row').count();
  await page.selectOption('select[aria-label="موعد التسليم"]', 'overdue');
  const late = await page.locator('main .work-row').count();
  check(T, 'Work has an «متأخر» filter that narrows the list', late > 0 && late < all, `all ${all}, overdue ${late}`);
  const workEyebrow = await page.locator('main .eyebrow').first().textContent();
  check(T, 'scenario date stated on Work', workEyebrow.includes('21 سبتمبر 2026'), workEyebrow);
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

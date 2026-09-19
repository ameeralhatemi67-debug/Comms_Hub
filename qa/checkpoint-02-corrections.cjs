// Browser verification for the Checkpoint 0.2 pre-validation corrections.
// Checks the four defects that could only be confirmed in a rendered page:
// calendar weekday alignment, role home differentiation, notice scoping, and
// the Admin / Settings / Account shells.
//
//   npm run build && npm start        (or: npm run dev)
//   node qa/checkpoint-02-corrections.cjs

const fs = require('node:fs');
const path = require('node:path');
const { dependency, baseURL, launchOptions } = require('./runtime.cjs');

const roles = [
  ['director', 'مدير الاتصال المؤسسي'],
  ['assistant', 'مساعد مدير الاتصال المؤسسي'],
  ['writer', 'كاتب المحتوى'],
  ['designer', 'المصمم'],
  ['producer', 'المنتج الإعلامي'],
  ['publisher', 'مسؤول النشر وإدارة الحسابات'],
  ['member', 'عضو'],
  ['admin', 'Admin'],
];

const checks = [];
const errors = [];

function check(name, pass, detail) {
  checks.push({ name, pass, detail });
  if (!pass) errors.push(`${name}: ${detail}`);
}

async function selectRole(page, label) {
  await page.selectOption('select[aria-label="عرض بصفة"]', { label });
  await page.waitForTimeout(150);
}

(async () => {
  const { chromium } = dependency('playwright');
  const browser = await chromium.launch(launchOptions);
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') pageErrors.push(m.text());
  });

  // --- Calendar grid alignment -------------------------------------------
  await page.goto(`${baseURL}/calendar`, { waitUntil: 'networkidle' });
  const heads = await page.$$eval('.calendar-head', (els) => els.map((e) => e.textContent.trim()));
  check('calendar weekday headers present', heads.length === 7, `found ${heads.length}: ${heads.join(', ')}`);
  check('calendar first header is Sunday', heads[0] === 'الأحد', `first header is ${heads[0]}`);

  const monthLabel = await page.textContent('.month-picker b');
  check('calendar month label is Arabic', monthLabel.includes('سبتمبر'), `label is ${monthLabel}`);

  // 1 September 2026 is a Tuesday, so day 1 must be the third cell of the week.
  const layout = await page.$$eval('.calendar-grid > *', (els) =>
    els.map((e) => ({
      cls: e.className,
      text: (e.querySelector('b') || e).textContent.trim(),
    })),
  );
  const pads = layout.filter((c) => c.cls.includes('calendar-pad')).length;
  const firstDayIndex = layout.findIndex((c) => c.cls.includes('calendar-day') && !c.cls.includes('calendar-pad'));
  const expected = new Date(Date.UTC(2026, 8, 1)).getUTCDay();
  check('leading pad cells equal the starting weekday', pads === expected, `pads=${pads}, expected=${expected}`);
  check(
    'day 1 sits in the correct weekday column',
    (firstDayIndex - 7) % 7 === expected,
    `day 1 at grid index ${firstDayIndex} (7 headers + ${pads} pads)`,
  );

  // Navigating a month re-aligns rather than always starting at column one.
  await page.click('button[aria-label="الشهر التالي"]');
  await page.waitForTimeout(150);
  const octLabel = await page.textContent('.month-picker b');
  const octPads = await page.$$eval('.calendar-pad', (els) => els.length);
  const octExpected = new Date(Date.UTC(2026, 9, 1)).getUTCDay();
  check('next month re-aligns', octPads === octExpected, `${octLabel}: pads=${octPads}, expected=${octExpected}`);

  // --- Role home differentiation and notice scoping -----------------------
  const tileSets = {};
  const noticeSets = {};

  for (const [id, label] of roles) {
    await page.goto(`${baseURL}/`, { waitUntil: 'networkidle' });
    await selectRole(page, label);
    const tiles = await page.$$eval('.stats .stat span:first-child', (els) => els.map((e) => e.textContent.trim()));
    tileSets[id] = tiles.join(' | ');
    check(`${id} home shows at least four tiles`, tiles.length >= 4, `${tiles.length} tiles: ${tiles.join(', ')}`);

    await page.click('button[aria-label="الإشعارات"]');
    await page.waitForSelector('dialog[open]');
    const notices = await page.$$eval('dialog .notice p', (els) => els.map((e) => e.textContent.trim()));
    noticeSets[id] = notices;
    await page.keyboard.press('Escape');
    await page.waitForTimeout(120);
  }

  const distinct = new Set(Object.values(tileSets));
  check('all eight roles show distinct home tiles', distinct.size === 8, `${distinct.size} distinct tile sets`);

  check(
    'admin is not shown the content review queue',
    !noticeSets.admin.some((t) => t.includes('يحتاج مراجعتك')),
    `admin notices: ${noticeSets.admin.join(' / ')}`,
  );
  check(
    'publisher is not shown the director review queue',
    !noticeSets.publisher.some((t) => t.includes('يحتاج مراجعتك')),
    `publisher notices: ${noticeSets.publisher.join(' / ')}`,
  );
  check(
    'director is shown the review queue',
    noticeSets.director.some((t) => t.includes('يحتاج مراجعتك')),
    `director notices: ${noticeSets.director.join(' / ')}`,
  );
  check(
    'notice sets differ between roles',
    JSON.stringify(noticeSets.director) !== JSON.stringify(noticeSets.publisher),
    'director and publisher notice lists are identical',
  );

  // --- Publisher connected account health ---------------------------------
  await page.goto(`${baseURL}/`, { waitUntil: 'networkidle' });
  await selectRole(page, 'مسؤول النشر وإدارة الحسابات');
  const accountPanel = await page.textContent('body');
  check(
    'publisher home shows connected account health',
    accountPanel.includes('صحة الحسابات المتصلة') && accountPanel.includes('يحتاج إعادة ربط'),
    'connected account health panel missing on publisher home',
  );

  // --- Admin shells --------------------------------------------------------
  // State lives in the client store, so the role is chosen after navigating.
  await page.goto(`${baseURL}/admin`, { waitUntil: 'networkidle' });
  await selectRole(page, 'Admin');
  const adminTabs = await page.$$eval('.tabs button', (els) => els.map((e) => e.textContent.trim()));
  const wanted = [
    'المستخدمون',
    'الأدوار والصلاحيات',
    'التكاملات',
    'حالة النظام',
    'التخزين',
    'الأمن',
    'الأتمتة',
    'سياسة الإشعارات',
  ];
  check(
    'admin exposes all eight sections',
    wanted.every((w) => adminTabs.includes(w)),
    `found: ${adminTabs.join(', ')}`,
  );

  for (const label of wanted) {
    await page.click(`.tabs button:text-is("${label}")`);
    await page.waitForTimeout(120);
    const panelCount = await page.$$eval('.panel', (els) => els.length);
    check(`admin section renders: ${label}`, panelCount > 0, 'no panel rendered');
  }

  // --- Settings sections and Account role name ----------------------------
  await page.goto(`${baseURL}/settings`, { waitUntil: 'networkidle' });
  const settingsTabs = await page.$$eval('.tabs button', (els) => els.map((e) => e.textContent.trim()));
  check('settings exposes eight sections', settingsTabs.length === 8, `found ${settingsTabs.length}`);

  await page.goto(`${baseURL}/account`, { waitUntil: 'networkidle' });
  await selectRole(page, 'مدير الاتصال المؤسسي');
  const accountText = await page.textContent('body');
  check(
    'account shows the Arabic role name, not the raw key',
    accountText.includes('مدير الاتصال المؤسسي') && !/الدور الحالي:\s*director/.test(accountText),
    'raw role key still visible on the account page',
  );

  // --- Home no longer carries the hard-coded schedule entry ----------------
  await page.goto(`${baseURL}/`, { waitUntil: 'networkidle' });
  const homeText = await page.textContent('body');
  check(
    'home schedule panel is derived from state',
    homeText.includes('إعداد منشور Instagram') && !homeText.includes('23 سبتمبر · تغطية الحدث'),
    'hard-coded schedule entry still present',
  );
  check(
    'home shows the campaign figures from the specification',
    ['72%', 'أعضاء الفريق', 'عناصر المحتوى', 'بانتظار الاعتماد'].every((t) => homeText.includes(t)),
    'campaign figures missing',
  );

  check('no page or console errors captured', pageErrors.length === 0, pageErrors.join(' | '));

  await browser.close();

  const report = {
    ranAt: new Date().toISOString(),
    baseURL,
    passed: checks.filter((c) => c.pass).length,
    failed: checks.filter((c) => !c.pass).length,
    tileSets,
    checks,
  };
  fs.writeFileSync(path.join(__dirname, 'checkpoint-02-corrections.json'), JSON.stringify(report, null, 2) + '\n');

  console.log(`${report.passed} passed, ${report.failed} failed`);
  for (const e of errors) console.log(`FAIL ${e}`);
  process.exit(report.failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

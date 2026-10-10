// Pixel comparison for Roadmap task 0.3.1.1 (move hard-coded colours into tokens).
// The clean-up must not change what Direction A renders, so every page is
// captured before and after and compared pixel by pixel.
//
//   npm run build && npm start
//   node qa/colour-tokens.cjs capture before     (on the commit before the change)
//   node qa/colour-tokens.cjs capture after      (on the changed build)
//   node qa/colour-tokens.cjs compare before after
//
// Screenshots go to qa/artifacts/colour-tokens/<label>/ (ignored by git); the
// comparison result is written to qa/colour-tokens.json.

const fs = require('node:fs');
const path = require('node:path');
const { dependency, baseURL, launchOptions } = require('./runtime.cjs');

const root = path.join(__dirname, 'artifacts', 'colour-tokens');
const routes = ['/', '/work', '/work/CH-241', '/create', '/approvals', '/calendar', '/media', '/media/poster',
  '/mail', '/ideas', '/analytics', '/monitoring', '/settings', '/account', '/admin'];
const roles = ['director', 'publisher'];
const widths = [1440, 390];

const slug = (s) => s.replace(/^\//, '').replace(/\//g, '_') || 'home';

async function capture(label) {
  const { chromium } = dependency('playwright');
  const out = path.join(root, label);
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch(launchOptions);
  const errors = [];
  let count = 0;
  for (const width of widths) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(baseURL + '/', { waitUntil: 'networkidle' });
    for (const role of roles) {
      await page.selectOption('select[aria-label="عرض بصفة"]', role);
      for (const route of routes) {
        // A full load resets the in-memory role, so it is chosen again on each page.
        await page.goto(baseURL + route, { waitUntil: 'networkidle' });
        await page.selectOption('select[aria-label="عرض بصفة"]', role);
        await page.locator('main').waitFor();
        await page.waitForTimeout(250);
        await page.screenshot({ path: path.join(out, `${width}-${role}-${slug(route)}.png`), fullPage: true, animations: 'disabled' });
        count++;
      }
    }
    // Overlays: notifications dialog and, on the phone, the navigation menu.
    await page.goto(baseURL + '/', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'الإشعارات', exact: true }).click();
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(out, `${width}-overlay-notifications.png`), animations: 'disabled' });
    count++;
    await page.keyboard.press('Escape');
    if (width < 700) {
      await page.getByRole('button', { name: 'المزيد', exact: true }).click();
      await page.waitForTimeout(800);
      await page.screenshot({ path: path.join(out, `${width}-overlay-menu.png`), animations: 'disabled' });
      count++;
    }
    await page.close();
  }
  await browser.close();
  console.log(JSON.stringify({ label, screenshots: count, errors }));
  if (errors.length) process.exit(1);
}

function compare(a, b) {
  const { PNG } = dependency('pngjs');
  const dirA = path.join(root, a);
  const dirB = path.join(root, b);
  const files = fs.readdirSync(dirA).filter((f) => f.endsWith('.png')).sort();
  const results = files.map((file) => {
    if (!fs.existsSync(path.join(dirB, file))) return { file, pass: false, detail: 'missing in ' + b };
    const x = PNG.sync.read(fs.readFileSync(path.join(dirA, file)));
    const y = PNG.sync.read(fs.readFileSync(path.join(dirB, file)));
    if (x.width !== y.width || x.height !== y.height) {
      return { file, pass: false, detail: `size ${x.width}x${x.height} vs ${y.width}x${y.height}` };
    }
    let diff = 0;
    for (let i = 0; i < x.data.length; i += 4) {
      if (x.data[i] !== y.data[i] || x.data[i + 1] !== y.data[i + 1] || x.data[i + 2] !== y.data[i + 2] || x.data[i + 3] !== y.data[i + 3]) diff++;
    }
    return { file, pass: diff === 0, differentPixels: diff, size: `${x.width}x${x.height}` };
  });
  const failed = results.filter((r) => !r.pass);
  const report = { task: '0.3.1.1', compared: `${a} vs ${b}`, date: new Date().toISOString(), screenshots: results.length, identical: results.length - failed.length, failed, results };
  fs.writeFileSync(path.join(__dirname, 'colour-tokens.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ screenshots: results.length, identical: report.identical, failed: failed.map((f) => `${f.file}: ${f.detail || f.differentPixels + ' px'}`) }));
  if (failed.length) process.exit(1);
}

const [cmd, a, b] = process.argv.slice(2);
if (cmd === 'capture' && a) capture(a).catch((e) => { console.error(e); process.exit(1); });
else if (cmd === 'compare' && a && b) compare(a, b);
else { console.error('usage: capture <label> | compare <a> <b>'); process.exit(2); }

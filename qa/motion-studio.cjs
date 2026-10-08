// Run against a local dev/production server: node qa/motion-studio.cjs
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { dependency, baseURL, launchOptions } = require('./runtime.cjs');
const { chromium } = dependency('playwright');
const checks = [], errors = [];
const check = (name, pass, detail = '') => { checks.push({ name, pass, detail }); if (!pass) throw new Error(`${name}: ${detail}`); };
const artifacts = path.join(__dirname, 'artifacts', 'motion');
fs.mkdirSync(artifacts, { recursive: true });
(async () => {
  const browser = await chromium.launch(launchOptions);
  const page = await browser.newPage({ viewport: { width: 1440, height: 1050 }, reducedMotion: 'reduce' });
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  try {
    await page.goto(`${baseURL}/motion`, { waitUntil: 'networkidle' });
    await page.locator('.motion-card').first().waitFor();
    check('native shell navigation', await page.locator('.sidebar a[href="/motion"]').count() === 1);
    check('RTL shell', await page.locator('html').getAttribute('dir') === 'rtl');
    check('paused on initial load', await page.getByRole('button', { name: 'تشغيل المعاينة', exact: true }).count() === 1);
    let total = 0;
    for (const [label, count, category] of [['الأرقام', 8, 'numbers'], ['تصاميم ريبين', 6, 'repine'], ['إطارات الفيديو', 8, 'frames']]) {
      await page.getByRole('button', { name: `${label} (${count})`, exact: true }).click();
      check(`${category}: template count`, await page.locator('.motion-card').count() === count);
      check(`${category}: two additions`, await page.locator('.motion-card .chip').count() === 2);
      const ids = await page.locator('[data-template]').evaluateAll(els => els.map(el => el.dataset.template));
      for (const id of ids) {
        await page.locator(`[data-template="${id}"]`).click();
        if (category === 'repine') check(`${id}: no inactive glow control`, await page.getByRole('checkbox', { name: 'التوهج', exact: true }).count() === 0);
        if (id === 'fr-broadcast') {
          check('broadcast subtitle label matches header position', await page.getByLabel('النص العلوي الفرعي', { exact: true }).count() === 1);
          await page.getByLabel('النص العلوي الفرعي', { exact: true }).fill('تغطية أنشطة المؤسسة');
        }
        const pixels = await page.locator('.motion-stage canvas').evaluate(canvas => {
          const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
          let ink = 0, clear = 0;
          for (let i = 3; i < data.length; i += 4) { if (data[i] > 20) ink++; if (data[i] === 0) clear++; }
          return { ink, clear };
        });
        check(`${id}: visible artwork and alpha`, pixels.ink > 500 && pixels.clear > 500, pixels);
        // Exercise entry and exit where source renderers used to produce negative radii.
        for (const fraction of [.015, .2, .98]) {
          await page.getByLabel('موضع المعاينة', { exact: true }).evaluate((el, value) => {
            const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
            setter.call(el, Number(el.max) * value); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
          }, fraction);
        }
        const isNew = await page.locator(`[data-template="${id}"] .chip`).count();
        if (isNew) {
          await page.locator(`[data-template="${id}"]`).click();
          // Force React redraw after reselection while retaining the settled timestamp.
          await page.getByLabel('موضع المعاينة', { exact: true }).fill('3.2');
          await page.locator('.motion-preview-column').screenshot({ path: path.join(artifacts, `design-${id}.png`) });
        }
        if (category === 'frames') {
          for (const ratio of ['4:5', '1:1', '16:9', '9:16']) {
            await page.getByLabel('أبعاد الإطار', { exact: true }).selectOption(ratio);
            const dimensions = await page.locator('.motion-stage canvas').evaluate(c => [c.width, c.height]);
            const [w, h] = ratio.split(':').map(Number);
            check(`${id}: ratio ${ratio}`, Math.abs(dimensions[0] / dimensions[1] - w / h) < .005);
          }
        }
        total++;
      }
    }
    check('22 total templates exercised', total === 22);
    await page.getByRole('button', { name: 'الأرقام (8)', exact: true }).click();
    await page.locator('[data-template="arc-gauge"]').click();
    await page.getByLabel('وصف الرقم', { exact: true }).fill('اختبار أثر الحملة');
    await page.getByLabel('القيمة', { exact: true }).fill('64');
    await page.locator('[data-template="milestone-count"]').click();
    await page.locator('[data-template="arc-gauge"]').click();
    check('per-template edits retained', await page.getByLabel('وصف الرقم', { exact: true }).inputValue() === 'اختبار أثر الحملة');
    await page.getByRole('button', { name: 'تشغيل المعاينة', exact: true }).click();
    await page.waitForTimeout(450);
    await page.getByRole('button', { name: 'إيقاف المعاينة', exact: true }).click();
    const played = Number(await page.getByLabel('موضع المعاينة', { exact: true }).inputValue());
    check('play advances then pauses', played > 0 && played < 2, played);
    await page.getByLabel('موضع المعاينة', { exact: true }).fill('3.2');
    check('scrub updates time readout', (await page.locator('.motion-transport output').textContent()).includes('3.2'));
    await page.getByLabel('إعادة ضبط القالب', { exact: true }).click();
    check('reset restores original value', await page.getByLabel('القيمة', { exact: true }).inputValue() === '82');
    await page.getByLabel('دقة الضلع القصير', { exact: true }).selectOption('360');
    await page.locator('.motion-timing summary').click();
    const entry = page.getByLabel('مدة الدخول بالثواني', { exact: true });
    await entry.fill('');
    check('timing input allows clearing during editing', await entry.inputValue() === '');
    await entry.pressSequentially('0.8');
    await entry.blur();
    check('timing input accepts typed decimal', await entry.inputValue() === '0.8');
    await entry.fill('9'); await entry.blur();
    check('timing input bounds on blur', await entry.inputValue() === '5');
    for (const [label, value] of [['مدة الدخول بالثواني', '.5'], ['مدة الثبات بالثواني', '.5'], ['مدة الخروج بالثواني', '.3']]) await page.getByLabel(label, { exact: true }).fill(value);
    for (const format of ['png', 'zip', 'mov', 'mp4']) {
      await page.getByLabel('صيغة الملف', { exact: true }).selectOption(format);
      const promise = page.waitForEvent('download', { timeout: 120000 });
      await page.getByRole('button', { name: 'تنزيل التصميم', exact: true }).click();
      const download = await promise;
      const file = path.join(artifacts, download.suggestedFilename()); await download.saveAs(file);
      const data = fs.readFileSync(file);
      const magic = format === 'png' ? data.subarray(1, 4).toString() === 'PNG' : format === 'zip' ? data.subarray(0, 2).toString() === 'PK' : data.subarray(4, 8).toString() === 'ftyp';
      check(`${format}: real local export`, magic && data.length > 200, { bytes: data.length, name: download.suggestedFilename() });
      if (['mov', 'mp4'].includes(format)) {
        const decoded = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name,width,height,nb_read_frames,pix_fmt,duration', '-of', 'json', file], { encoding: 'utf8' })).streams[0];
        check(`${format}: 32 frames decode at expected dimensions`, decoded.nb_read_frames === '32' && decoded.width === 640 && decoded.height === 360, decoded);
        if (format === 'mov') check('MOV preserves alpha pixel format', decoded.pix_fmt === 'rgba');
        execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-f', 'null', '-'], { stdio: 'pipe' });
        check(`${format}: complete decode without errors`, true);
      }
      await page.getByRole('button', { name: 'تنزيل التصميم', exact: true }).waitFor();
    }
    await page.getByLabel('صيغة الملف', { exact: true }).selectOption('mov');
    await page.getByLabel('مدة الثبات بالثواني', { exact: true }).fill('12');
    await page.getByRole('button', { name: 'تنزيل التصميم', exact: true }).click();
    await page.getByRole('button', { name: 'إلغاء التصدير', exact: true }).click();
    await page.getByText('أُلغي التصدير. يمكنك المحاولة من جديد.', { exact: true }).waitFor();
    check('export cancels cleanly', true);
    await page.getByLabel('إعادة ضبط القالب', { exact: true }).click();
    for (const width of [1440, 1280, 900, 390]) {
      await page.setViewportSize({ width, height: 1050 });
      await page.evaluate(() => scrollTo(0, 0));
      await page.screenshot({ path: path.join(artifacts, `studio-${width}.png`), fullPage: true });
      check(`no overflow at ${width}`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      check(`template chooser before editor at ${width}`, (await page.getByLabel('اختيار قالب', { exact: true }).boundingBox()).y < 550);
    }
    await page.getByLabel('اختيار قالب', { exact: true }).selectOption('milestone-count');
    check('mobile quick chooser changes design', await page.locator('.motion-preview-heading h2').textContent() === 'محطات الإنجاز');
    await page.locator('[data-template="arc-gauge"]').click();
    check('gallery choice returns keyboard focus to editor', await page.locator('.motion-preview-heading h2').evaluate(el => el === document.activeElement));
    await page.getByLabel('اختيار قالب', { exact: true }).focus();
    await page.keyboard.press('Tab');
    check('chooser has keyboard route to gallery', await page.getByRole('link', { name: 'استعراض القوالب' }).evaluate(el => el === document.activeElement));
    await page.setViewportSize({ width: 1440, height: 1050 });
    await page.getByRole('button', { name: 'إطارات الفيديو (8)', exact: true }).click();
    await page.locator('[data-template="fr-portal"]').click();
    await page.screenshot({ path: path.join(artifacts, 'frames-desktop.png'), fullPage: true });
    check('no page or console errors', errors.length === 0, errors);
  } finally {
    fs.writeFileSync(path.join(__dirname, 'motion-studio.json'), JSON.stringify({ date: '2026-10-08', baseURL, checks, errors }, null, 2));
    await browser.close();
  }
  console.log(`${checks.filter(c => c.pass).length}/${checks.length} checks passed.`);
})().catch(error => { console.error(error); process.exitCode = 1; });

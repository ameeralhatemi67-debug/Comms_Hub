// Run against a local server: node qa/motion-studio.cjs   (QA_BASE_URL overrides http://127.0.0.1:3000)
// Exercises the redesigned Motion Studio in a real browser: catalog, frame ratios, settings, transport, window preview,
// real downloads (decoded with ffprobe / ffmpeg), cancel, responsive layout and console errors.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { dependency, baseURL, launchOptions } = require('./runtime.cjs');
const { chromium } = dependency('playwright');
const checks = [], errors = [], timings = {};
const check = (name, pass, detail = '') => { checks.push({ name, pass, detail }); if (!pass) throw new Error(`${name}: ${JSON.stringify(detail)}`); };
const artifacts = path.join(__dirname, 'artifacts', 'motion');
fs.mkdirSync(artifacts, { recursive: true });
const counts = { numbers: 8, repine: 8, frames: 10 };
const labels = { numbers: 'الأرقام', repine: 'تصاميم ريبين', frames: 'إطارات الفيديو' };

(async () => {
  const browser = await chromium.launch(launchOptions);
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) errors.push(m.text()); });
  const stage = () => page.locator('.ms-canvas-box canvas');
  const pick = async id => { await page.locator(`[data-template="${id}"]`).click(); await page.waitForTimeout(120); };
  const tab = async name => { await page.getByRole('tab', { name, exact: true }).click(); };
  const inkOf = () => stage().evaluate(canvas => {
    const d = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data; const seen = new Set(); let lit = 0;
    for (let i = 0; i < d.length; i += 4 * 97) { seen.add((d[i] >> 4) + ',' + (d[i + 1] >> 4) + ',' + (d[i + 2] >> 4)); if (d[i] + d[i + 1] + d[i + 2] > 140) lit++; }
    return { colors: seen.size, lit, w: canvas.width, h: canvas.height };
  });
  const scrubTo = async seconds => page.getByLabel('موضع المعاينة', { exact: true }).evaluate((el, v) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; setter.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
  }, String(seconds));

  try {
    await page.goto(`${baseURL}/motion`, { waitUntil: 'networkidle' });
    await page.locator('.ms-tile').first().waitFor();
    check('native shell navigation', await page.locator('.sidebar a[href="/motion"]').count() === 1);
    check('RTL shell', await page.locator('html').getAttribute('dir') === 'rtl');

    /* ---- catalog and every design ---- */
    let total = 0;
    for (const [category, count] of Object.entries(counts)) {
      await page.getByRole('button', { name: `${labels[category]} (${count})`, exact: true }).click();
      await page.waitForTimeout(150);
      check(`${category}: template count ${count}`, await page.locator('.ms-tile').count() === count);
      const ids = await page.locator('[data-template]').evaluateAll(els => els.map(el => el.dataset.template));
      for (const id of ids) {
        await pick(id);
        for (const at of [.4, 3.2]) {
          await scrubTo(at);
          const ink = await inkOf();
          check(`${id}: draws real artwork at ${at}s`, ink.colors > (at < 1 ? 8 : 25), ink);
        }
        total++;
      }
      check(`${category}: badges on new or updated designs`, await page.locator('.ms-tile em').count() >= 2);
    }
    check('26 designs exercised', total === 26, total);
    const catalogNames = await page.locator('.ms-tile-name b').allTextContents();
    check('no empty template names', catalogNames.every(Boolean));

    /* ---- the four rebuilt basics and four additions exist under their Arabic names ---- */
    await page.getByRole('button', { name: 'تصاميم ريبين (8)', exact: true }).click();
    for (const [id, name] of [['rp-editorial', 'الشريط التحريري'], ['rp-orbit', 'مدار الهوية'], ['rp-scroll', 'المخطوطة'], ['rp-crescent', 'الهلال المضيء']])
      check(`${id} named ${name}`, (await page.locator(`[data-template="${id}"] .ms-tile-name b`).textContent()) === name);
    await page.getByRole('button', { name: 'إطارات الفيديو (10)', exact: true }).click();
    for (const [id, name] of [['fr-portal', 'بوابة الأثر'], ['fr-broadcast', 'إطار التغطية'], ['fr-doors', 'أبواب المشربية'], ['fr-spectrum', 'طيف التلاوة']])
      check(`${id} named ${name}`, (await page.locator(`[data-template="${id}"] .ms-tile-name b`).textContent()) === name);

    /* ---- frame ratios: preview and the stated output size must agree ---- */
    for (const id of ['fr-mihrab', 'fr-portal', 'fr-broadcast', 'fr-doors', 'fr-spectrum', 'fr-lattice']) {
      await pick(id);
      for (const [ratio, w, h] of [['4:5', 1080, 1350], ['1:1', 1080, 1080], ['16:9', 1920, 1080], ['9:16', 1080, 1920]]) {
        await page.getByRole('radio', { name: new RegExp(`^${ratio}`) }).click();
        await page.waitForTimeout(80);
        const [cw, ch] = await stage().evaluate(c => [c.width, c.height]);
        check(`${id}: preview ${ratio} keeps its shape`, Math.abs(cw / ch - w / h) < .006, [cw, ch]);
        const size = await page.locator('.ms-size').textContent();
        check(`${id}: stated size at ${ratio}`, size.includes(String(w)) && size.includes(String(h)), size);
        const box = await page.locator('.ms-canvas-box').boundingBox();
        check(`${id}: displayed shape at ${ratio}`, Math.abs(box.width / box.height - w / h) < .02, box);
      }
    }

    /* ---- the window preview modes and safe zones ---- */
    await pick('fr-mihrab'); await scrubTo(6);
    const modes = {};
    for (const mode of ['عينة', 'أخضر', 'شفاف']) {
      await page.getByRole('radio', { name: mode, exact: true }).click(); await page.waitForTimeout(100);
      modes[mode] = await stage().evaluate(c => { const x = c.getContext('2d'), p = x.getImageData(Math.round(c.width / 2), Math.round(c.height * .62), 1, 1).data; return [p[0], p[1], p[2], p[3]]; });
    }
    check('green window preview shows the key color', modes['أخضر'][1] > 200 && modes['أخضر'][0] < 40, modes['أخضر']);
    check('transparent window preview has real alpha', modes['شفاف'][3] === 0, modes['شفاف']);
    check('sample window preview is opaque footage', modes['عينة'][3] === 255, modes['عينة']);
    const chooser = page.waitForEvent('filechooser', { timeout: 4000 });
    await page.getByRole('radio', { name: 'مقطعي', exact: true }).click();
    check('"my video" opens a file chooser', Boolean(await chooser));
    await page.getByRole('radio', { name: 'عينة', exact: true }).click();
    await page.getByRole('switch', { name: 'مناطق واجهة ريلز' }).click({ force: true });
    check('reels safe zones toggle on', await page.getByRole('switch', { name: 'مناطق واجهة ريلز' }).isChecked());
    await page.getByRole('switch', { name: 'مناطق واجهة ريلز' }).click({ force: true });
    await page.getByRole('radio', { name: /^1:1/ }).click();
    check('safe zones only offered for 9:16', await page.getByRole('switch', { name: 'مناطق واجهة ريلز' }).count() === 0);
    await page.getByRole('radio', { name: /^9:16/ }).click();

    /* ---- settings: every timing and motion slider is back ---- */
    await tab('التوقيت');
    for (const label of ['مدة الدخول', 'مدة العرض (بطول مقطعك)', 'مدة الخروج', 'سرعة التشغيل']) check(`timing slider: ${label}`, await page.getByRole('slider', { name: label, exact: true }).count() === 1);
    await tab('الحركة');
    for (const label of ['حركة الدخول', 'حركة الخروج', 'حركة العرض (الهدوء الحي)']) check(`motion slider: ${label}`, await page.getByRole('slider', { name: label, exact: true }).count() === 1);
    await tab('التوقيت');
    const totalBefore = await page.locator('.ms-total bdi').textContent();
    const hold = page.getByLabel('مدة العرض (بطول مقطعك)، قيمة دقيقة', { exact: true });
    await hold.fill('30'); await hold.blur();
    const totalAfter = await page.locator('.ms-total bdi').textContent();
    check('timing change updates total length', Number(totalAfter) > Number(totalBefore) + 10, [totalBefore, totalAfter]);
    check('phase strip reflects the change', (await page.locator('.ms-phases .ph1').textContent()).includes('30.0'));
    await hold.fill(''); check('number box tolerates clearing while editing', await hold.inputValue() === '');
    await hold.pressSequentially('8'); await hold.blur(); check('number box accepts typed value', await hold.inputValue() === '8');
    await hold.fill('9999'); await hold.blur(); check('number box clamps to its bound', await hold.inputValue() === '900');
    await hold.fill('12'); await hold.blur();
    const speed = page.getByRole('slider', { name: 'سرعة التشغيل', exact: true });
    await speed.focus(); await page.keyboard.press('ArrowLeft');
    check('slider reachable and adjustable from the keyboard', (await speed.getAttribute('aria-valuetext')) !== '1.00×', await speed.getAttribute('aria-valuetext'));

    /* ---- content tab: text, contact reveal, per-design memory, reset ---- */
    await tab('المحتوى');
    await page.getByLabel('الاسم أو عنوان التغطية', { exact: true }).fill('اختبار الاسم');
    check('phone field hidden until contact is enabled', await page.getByLabel('رقم التواصل', { exact: true }).count() === 0);
    await page.getByRole('switch', { name: 'إظهار عبارة ورقم التواصل' }).click({ force: true });
    await page.getByLabel('رقم التواصل', { exact: true }).fill('0501234567');
    check('phone field appears and accepts input', await page.getByLabel('رقم التواصل', { exact: true }).inputValue() === '0501234567');
    await pick('fr-girih'); await pick('fr-mihrab');
    check('edits are remembered per design', await page.getByLabel('الاسم أو عنوان التغطية', { exact: true }).inputValue() === 'اختبار الاسم');
    await page.getByRole('button', { name: 'إعادة ضبط هذا التصميم' }).click();
    check('reset restores the original text', await page.getByLabel('الاسم أو عنوان التغطية', { exact: true }).inputValue() === 'رسالة اليوم');
    await tab('الألوان');
    check('four colour pickers for a four-colour frame', await page.locator('.ms-colors input[type=color]').count() === 4);
    await tab('العناصر');
    check('element switches present', await page.getByRole('switch').count() >= 4);

    /* ---- transport ---- */
    await tab('المحتوى');
    await page.getByRole('button', { name: 'إعادة التشغيل من البداية' }).click();
    await page.waitForTimeout(700);
    const t1 = await page.getByLabel('موضع المعاينة', { exact: true }).inputValue();
    check('replay plays forward', Number(t1) > .2, t1);
    await page.getByRole('button', { name: 'إيقاف المعاينة مؤقتاً' }).first().click();
    await page.waitForTimeout(250);
    const t2 = await page.getByLabel('موضع المعاينة', { exact: true }).inputValue(); await page.waitForTimeout(300);
    check('pause holds the frame', t2 === await page.getByLabel('موضع المعاينة', { exact: true }).inputValue());
    await scrubTo(4);
    check('scrub reads out time', (await page.locator('.ms-clock').textContent()).includes('4.0'));
    await page.getByRole('button', { name: 'تكرار المعاينة' }).click();
    check('loop toggle', (await page.getByRole('button', { name: 'تكرار المعاينة' }).getAttribute('aria-pressed')) === 'false');
    await page.getByRole('button', { name: 'تكرار المعاينة' }).click();

    /* ---- numbers: value slider + number box + backdrop modes ---- */
    await page.getByRole('button', { name: 'الأرقام (8)', exact: true }).click();
    await pick('arc-gauge');
    await page.getByLabel('القيمة، قيمة دقيقة', { exact: true }).fill('64'); await page.getByLabel('القيمة، قيمة دقيقة', { exact: true }).blur();
    check('value box applies', await page.getByLabel('القيمة، قيمة دقيقة', { exact: true }).inputValue() === '64');
    for (const mode of ['شفاف', 'داكن', 'فاتح', 'مشهد']) { await page.getByRole('radio', { name: mode, exact: true }).click(); await page.waitForTimeout(60); }
    await page.getByRole('radio', { name: 'شفاف', exact: true }).click(); await scrubTo(3.4);
    check('transparent backdrop leaves real alpha', await stage().evaluate(c => c.getContext('2d').getImageData(4, 4, 1, 1).data[3] === 0));
    await page.getByRole('radio', { name: 'مشهد', exact: true }).click();

    /* ---- exports: real files, decoded ---- */
    await page.getByRole('button', { name: 'إطارات الفيديو (10)', exact: true }).click();
    await pick('fr-spectrum');
    await tab('التوقيت');
    for (const [label, v] of [['مدة الدخول', '.6'], ['مدة الخروج', '0']]) { const s = page.getByRole('slider', { name: label, exact: true }); await s.evaluate((el, val) => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(el, val); el.dispatchEvent(new Event('input', { bubbles: true })); }, v); }
    const exHold = page.getByLabel('مدة العرض (بطول مقطعك)، قيمة دقيقة', { exact: true }); await exHold.fill('1'); await exHold.blur();
    await page.getByRole('radio', { name: '720p', exact: true }).click(); await page.getByRole('radio', { name: '24', exact: true }).click();
    const expect = { w: 720, h: 1280 };
    const exportFormat = async (value, titleRe) => {
      await page.locator('label.ms-format').filter({ hasText: titleRe }).click(); check(`format ${value} selected`, await page.locator('label.ms-format.on').filter({ hasText: titleRe }).count() === 1);
      const started = Date.now(), promise = page.waitForEvent('download', { timeout: 180000 });
      await page.getByRole('button', { name: 'تنزيل التصميم', exact: true }).last().click();
      const download = await promise; const file = path.join(artifacts, download.suggestedFilename()); await download.saveAs(file);
      timings[value] = (Date.now() - started) / 1000;
      await page.locator('.ms-result').waitFor();
      return { file, data: fs.readFileSync(file), name: download.suggestedFilename() };
    };
    const mp4 = await exportFormat('mp4', /فيديو بخلفية خضراء/);
    check('mp4: real download with the stated name', mp4.name === 'fr-spectrum_720x1280_24fps_greenscreen.mp4' && mp4.data.subarray(4, 8).toString() === 'ftyp', mp4.name);
    const probe = file => JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name,width,height,nb_read_frames,pix_fmt', '-of', 'json', file]).toString()).streams[0];
    const mp4Info = probe(mp4.file);
    check('mp4: decodes at 720x1280 with 38 frames', mp4Info.width === expect.w && mp4Info.height === expect.h && mp4Info.nb_read_frames === '38' && mp4Info.codec_name === 'h264', mp4Info);
    execFileSync('ffmpeg', ['-v', 'error', '-i', mp4.file, '-f', 'null', '-'], { stdio: 'pipe' }); check('mp4: complete decode without errors', true);
    check('result card keeps a working link', await page.locator('.ms-result a[download]').getAttribute('href').then(h => h.startsWith('blob:')));
    const mov = await exportFormat('mov', /فيديو شفاف/);
    const movInfo = probe(mov.file);
    check('mov: ProRes 4444 transparent video', movInfo.codec_name === 'prores' && movInfo.pix_fmt === 'yuva444p12le' && movInfo.width === expect.w && movInfo.nb_read_frames === '38', movInfo);
    execFileSync('ffmpeg', ['-v', 'error', '-i', mov.file, '-f', 'null', '-'], { stdio: 'pipe' }); check('mov: complete decode without errors', true);
    /* the transparent file must really carry alpha: export a numbers design (no background) and decode a frame */
    await page.getByRole('button', { name: 'الأرقام (8)', exact: true }).click(); await pick('arc-gauge');
    const alphaMov = await exportFormat('mov-alpha', /فيديو شفاف/);
    const alphaInfo = probe(alphaMov.file);
    check('mov (numbers): ProRes 4444 with alpha pixel format', alphaInfo.codec_name === 'prores' && alphaInfo.pix_fmt === 'yuva444p12le', alphaInfo);
    const rawFile = path.join(artifacts, 'alpha-frame.rgba');
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', '2', '-i', alphaMov.file, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgba', rawFile], { stdio: 'pipe' });
    const rgba = fs.readFileSync(rawFile); let clear = 0, solid = 0; for (let i = 3; i < rgba.length; i += 4) { if (rgba[i] === 0) clear++; else if (rgba[i] > 200) solid++; }
    check('mov (numbers): decoded frame has clear and solid pixels', clear > rgba.length / 4 * .3 && solid > 200, { clear, solid, total: rgba.length / 4 });
    const zip = await exportFormat('zip', /تسلسل صور شفافة/);
    check('zip: archive of PNG frames', zip.data.subarray(0, 2).toString() === 'PK' && zip.name.endsWith('png-sequence.zip'), zip.name);
    const unzipDir = path.join(artifacts, 'zip-frames'); fs.rmSync(unzipDir, { recursive: true, force: true }); fs.mkdirSync(unzipDir, { recursive: true });
    let off = 0, pngs = 0, firstPng = null; const dv = new DataView(zip.data.buffer, zip.data.byteOffset, zip.data.byteLength);
    while (off + 30 < zip.data.length && dv.getUint32(off, true) === 0x04034b50) { const n = dv.getUint16(off + 26, true), size = dv.getUint32(off + 18, true), body = zip.data.subarray(off + 30 + n, off + 30 + n + size); if (!firstPng) firstPng = Buffer.from(body); pngs++; off += 30 + n + size; }
    check('zip: 38 PNG frames', pngs === 38, pngs);
    fs.writeFileSync(path.join(unzipDir, 'first.png'), firstPng);
    const png = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,pix_fmt', '-of', 'json', path.join(unzipDir, 'first.png')]).toString()).streams[0];
    check('zip: first PNG decodes at 720x1280 with alpha', png.width === 720 && png.height === 1280 && /a/.test(png.pix_fmt), png);
    const still = await exportFormat('png', /صورة واحدة/);
    check('png still: valid image', still.data.subarray(1, 4).toString() === 'PNG' && still.name.endsWith('_still.png'), still.name);
    check('exports are fast enough to use (mp4 under 60 s for a 1.6 s clip)', timings.mp4 < 60, timings);

    /* ---- cancel ---- */
    await page.locator('label.ms-format').filter({ hasText: /تسلسل صور شفافة/ }).click();
    await page.getByRole('radio', { name: '1080p', exact: true }).click();
    await tab('التوقيت');
    const longHold = page.getByLabel('مدة العرض (بطول مقطعك)، قيمة دقيقة', { exact: true }); await longHold.fill('40'); await longHold.blur();
    await page.getByRole('button', { name: 'تنزيل التصميم', exact: true }).last().click();
    await page.getByRole('button', { name: 'إلغاء', exact: true }).click();
    await page.getByText('أُلغي التصدير. لم يُحفظ أي ملف.', { exact: true }).waitFor();
    check('export cancels cleanly and says so', true);
    check('controls are available again after cancel', await page.getByRole('button', { name: 'تنزيل التصميم', exact: true }).last().isEnabled());

    /* ---- accessibility floor ---- */
    const unnamed = await page.evaluate(() => [...document.querySelectorAll('.ms input,.ms select,.ms button,.ms [role=button]')].filter(el => {
      if (el.hidden || el.closest('[hidden]')) return false;
      const name = el.getAttribute('aria-label') || el.labels?.[0]?.textContent || el.textContent || el.getAttribute('title'); return !String(name || '').trim();
    }).map(el => el.outerHTML.slice(0, 90)));
    check('every control has an accessible name', unnamed.length === 0, unnamed);
    check('stage is keyboard reachable', await page.locator('.ms-canvas-box').getAttribute('tabindex') === '0');

    /* ---- responsive ---- */
    await page.getByRole('button', { name: 'تصاميم ريبين (8)', exact: true }).click(); await pick('rp-orbit');
    for (const width of [1440, 1100, 900, 390]) {
      await page.setViewportSize({ width, height: 1000 }); await page.waitForTimeout(250);
      await page.evaluate(() => scrollTo(0, 0));
      await page.screenshot({ path: path.join(artifacts, `studio-${width}.png`), fullPage: true });
      check(`no horizontal overflow at ${width}`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      const inside = await page.evaluate(() => { const w = document.querySelector('.ms-workbench').getBoundingClientRect(), s = document.querySelector('.ms-canvas-box').getBoundingClientRect(); return s.left >= w.left - 1 && s.right <= w.right + 1; });
      check(`stage stays inside its card at ${width}`, inside);
    }
    await page.setViewportSize({ width: 390, height: 900 });
    await page.getByRole('button', { name: 'إطارات الفيديو (10)', exact: true }).click(); await pick('fr-broadcast');
    const ratioBox = await page.locator('.ms-ratios .ms-seg-row').boundingBox();
    check('ratio chooser fits a phone', ratioBox.x >= 0 && ratioBox.x + ratioBox.width <= 391, ratioBox);
    await page.setViewportSize({ width: 1440, height: 1000 });

    /* ---- evidence screenshots, then errors ---- */
    for (const id of ['rp-editorial', 'rp-orbit', 'rp-scroll', 'rp-crescent']) { await page.getByRole('button', { name: 'تصاميم ريبين (8)', exact: true }).click(); await pick(id); await scrubTo(4.5); await page.locator('.ms-preview').screenshot({ path: path.join(artifacts, `design-${id}.png`) }); }
    for (const id of ['fr-portal', 'fr-broadcast', 'fr-doors', 'fr-spectrum']) { await page.getByRole('button', { name: 'إطارات الفيديو (10)', exact: true }).click(); await pick(id); await scrubTo(7); await page.locator('.ms-preview').screenshot({ path: path.join(artifacts, `design-${id}.png`) }); }
    for (const id of ['arc-gauge', 'milestone-count']) { await page.getByRole('button', { name: 'الأرقام (8)', exact: true }).click(); await pick(id); await scrubTo(3.4); await page.locator('.ms-preview').screenshot({ path: path.join(artifacts, `design-${id}.png`) }); }
    /* ---- reduced motion: starts paused, idle motion off ---- */
    const calm = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
    const calmPage = await calm.newPage(); await calmPage.goto(`${baseURL}/motion`, { waitUntil: 'networkidle' });
    await calmPage.locator('.ms-tile').first().waitFor(); await calmPage.waitForTimeout(500);
    check('reduced motion: preview starts paused', await calmPage.getByRole('button', { name: 'تشغيل المعاينة' }).count() >= 1 && await calmPage.getByLabel('موضع المعاينة', { exact: true }).inputValue() === '0');
    await calm.close();

    /* ---- insecure / old browser: no WebCodecs, MP4 falls back to recording ---- */
    const plain = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
    await plain.addInitScript(() => { Object.defineProperty(window, 'VideoEncoder', { value: undefined, configurable: true }); });
    const plainPage = await plain.newPage(); await plainPage.goto(`${baseURL}/motion`, { waitUntil: 'networkidle' });
    await plainPage.getByRole('button', { name: 'إطارات الفيديو (10)', exact: true }).click();
    await plainPage.locator('[data-template="fr-broadcast"]').click();
    await plainPage.getByRole('tab', { name: 'التوقيت', exact: true }).click();
    const setRange = (label, v) => plainPage.getByRole('slider', { name: label, exact: true }).evaluate((el, val) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, val); el.dispatchEvent(new Event('input', { bubbles: true })); }, v);
    await setRange('مدة الدخول', '.6'); await setRange('مدة الخروج', '0');
    const tiny = plainPage.getByLabel('مدة العرض (بطول مقطعك)، قيمة دقيقة', { exact: true }); await tiny.fill('1'); await tiny.blur();
    await plainPage.getByRole('radio', { name: '720p', exact: true }).click();
    check('fallback notice shown when the browser lacks WebCodecs', await plainPage.locator('.ms-warn').filter({ hasText: 'بالوقت الحقيقي' }).count() === 1);
    const fallback = plainPage.waitForEvent('download', { timeout: 60000 });
    await plainPage.getByRole('button', { name: 'تنزيل التصميم', exact: true }).last().click();
    const fallbackFile = await fallback; const fallbackPath = path.join(artifacts, 'fallback-' + fallbackFile.suggestedFilename()); await fallbackFile.saveAs(fallbackPath);
    const fallbackInfo = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,codec_name', '-of', 'json', fallbackPath]).toString()).streams[0];
    check('real-time fallback still produces a decodable video', fallbackInfo.width > 0 && fallbackInfo.height > 0, { name: fallbackFile.suggestedFilename(), ...fallbackInfo });
    await plain.close();
    check('no page or console errors', errors.length === 0, errors);
  } finally {
    fs.writeFileSync(path.join(__dirname, 'motion-studio.json'), JSON.stringify({ date: new Date().toISOString().slice(0, 10), baseURL, exportSeconds: timings, checks, errors }, null, 2));
    await browser.close();
  }
  console.log(`${checks.filter(c => c.pass).length}/${checks.length} checks passed.`, JSON.stringify(timings));
})().catch(error => { console.error(error); process.exitCode = 1; });

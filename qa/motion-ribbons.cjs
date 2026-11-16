// Browser check of the new Repine designs, «الذهب السائل», «البطاقة العاجية» and «الهوية الليلية» (MVP_draft.md section 80), in Edge: the real
// «قوالب الحركة» page on a fixture (qa/fixtures/motion-ribbons.tsx), with the site's own fonts and brand marks.
//   1. The rail: ten Repine designs, the two new ones under their Arabic names, each drawing real artwork through its build.
//   2. «التصميم»: its groups; every option changes the picture the way it says (metal, custom colour, the light, the
//      pattern, the font, the band's length, the side, the size, the height, the effects; the liquid's entry, the
//      and fields that depend on a choice appear only with it. Liquid Gold is still while shown and leaves by retracting into
//      its disc (owner's notes of 2026-11-16). The two identity designs carry the whole logo and an editable side text.
//   3. Text: a new title and an empty subtitle change the picture.
//   4. Downloads, both designs: MP4 on green, transparent MOV (ProRes 4444), a PNG sequence in ZIP and a single PNG, decoded
//      by ffprobe and ffmpeg; the single PNG carries the chosen options (silver, on the left).
//   5. No console or page errors; the settings panel and the stage at phone width.
// What this cannot check: the studio's inspector with a signed-in person (the same OptionControl is used there).
// Usage: node qa/motion-ribbons.cjs   (writes qa/motion-ribbons.json, files and screenshots in qa/artifacts/motion-ribbons/)
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { execFileSync } = require('node:child_process');
const esbuild = require('esbuild');
const { dependency, launchOptions } = require('./runtime.cjs');
const { chromium } = dependency('playwright');

const root = path.join(__dirname, '..');
const out = path.join(__dirname, 'artifacts', 'motion-ribbons');
const build = path.join(out, 'build');
const fixtures = path.join(__dirname, 'fixtures');
const checks = [], errors = [];
const check = (name, pass, detail = '') => { checks.push({ name, pass, detail }); if (!pass) throw new Error(`${name}: ${JSON.stringify(detail)}`); };
const css = ['globals', 'identity'].map(f => fs.readFileSync(path.join(root, 'src', 'app', `${f}.css`), 'utf8')).join('\n').replace(/@import[^;]+;/g, '').replace(/@theme\{[^}]*\}/g, '');
const page = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>استوديو الحركة</title>`
  + `<style>${css}</style><link rel="stylesheet" href="/flow.css"><style>body{font-family:"IBM Plex Sans Arabic","Segoe UI",Tahoma,sans-serif}</style></head><body><div id="root"></div><script type="module" src="/flow.js"></script></body></html>`;
/** The names in a ZIP, read from its central directory. */
function zipNames(buf) {
  let end = buf.length - 22; while (end >= 0 && buf.readUInt32LE(end) !== 0x06054b50) end--;
  const count = buf.readUInt16LE(end + 10), names = []; let at = buf.readUInt32LE(end + 16);
  for (let i = 0; i < count; i++) { const n = buf.readUInt16LE(at + 28), x = buf.readUInt16LE(at + 30), k = buf.readUInt16LE(at + 32); names.push(buf.toString('utf8', at + 46, at + 46 + n)); at += 46 + n + x + k; }
  return names;
}
const types = { '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.woff2': 'font/woff2', '.woff': 'font/woff', '.png': 'image/png' };

(async () => {
  fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(build, { recursive: true });
  await esbuild.build({
    entryPoints: { flow: path.join(fixtures, 'motion-ribbons.tsx') }, bundle: true, format: 'esm', platform: 'browser', target: 'es2020', jsx: 'automatic',
    outdir: build, define: { 'process.env.NODE_ENV': '"production"' }, logLevel: 'silent', absWorkingDir: root,
    loader: { '.woff2': 'file', '.woff': 'file' }, alias: { '@': path.join(root, 'src') },
    plugins: [{ name: 'stand-ins', setup(b) {
      b.onResolve({ filter: /^\.\/studio\/motion-tabs$/ }, () => ({ path: path.join(fixtures, 'fake-motion-tabs.tsx') }));
      b.onResolve({ filter: /^next\/(navigation|link)$/ }, () => ({ path: path.join(fixtures, 'fake-next.tsx') }));
    } }],
  });
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x').pathname;
    const file = url === '/' ? null : url.startsWith('/motion/') ? path.join(root, 'public', url) : path.join(build, path.basename(url));
    if (!file) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(page); }
    if (!fs.existsSync(file)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' }); res.end(fs.readFileSync(file));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch(launchOptions);
  const timings = {};
  let t = null;
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
    await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
    t = await context.newPage();
    t.on('pageerror', e => errors.push(String(e)));
    t.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errors.push(m.text()); });
    await t.goto(base);
    await t.locator('.ms-tile').first().waitFor({ timeout: 30000 });

    const stage = () => t.locator('.ms-canvas-box canvas');
    const tab = name => t.getByRole('tab', { name, exact: true }).click();
    const pick = async id => { await t.locator(`[data-template="${id}"]`).click(); await t.waitForTimeout(150); };
    const scrubTo = s => t.getByLabel('موضع المعاينة', { exact: true }).evaluate((el, v) => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
    }, String(s));
    /** The stage over the transparent backdrop: where the design has ink, its centre, extent, warmth, and a sample of
        every second pixel (brightness and coverage) for comparing two pictures. */
    const read = () => stage().evaluate(cv => {
      const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data, w = cv.width, h = cv.height;
      let n = 0, sx = 0, sy = 0, r = 0, b = 0, x0 = w, x1 = 0, y0 = h; const seen = new Set(), cells = [];
      for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) {
        const i = (y * w + x) * 4;
        cells.push(((d[i] + d[i + 1] + d[i + 2]) / 3 + d[i + 3]) >> 1);
        if (d[i + 3] < 40) continue;
        n++; sx += x; sy += y; r += d[i]; b += d[i + 2]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y;
        seen.add((d[i] >> 4) + ',' + (d[i + 1] >> 4) + ',' + (d[i + 2] >> 4));
      }
      return { n, cx: sx / Math.max(1, n) / w, cy: sy / Math.max(1, n) / h, rb: (r - b) / Math.max(1, n), colors: seen.size, left: x0 / w, right: x1 / w, top: y0 / h, cells };
    });
    /** How different two pictures are: the mean change of a sample, over the mean of the first picture's ink. */
    const diff = (a, b2) => { let s = 0, m = 0; for (let i = 0; i < a.cells.length; i++) { s += Math.abs(a.cells[i] - b2.cells[i]); m += a.cells[i]; } return s / Math.max(1, m); };
    const option = name => t.getByRole('radio', { name, exact: true });
    /** The share of samples that changed visibly: the canvas may round a pattern's first drawing one or two levels apart. */
    const moved = (a, b2, tol = 6) => { let n = 0; for (let i = 0; i < a.cells.length; i++) if (Math.abs(a.cells[i] - b2.cells[i]) > tol) n++; return n / a.cells.length; };
    const setSlider = async (name, v) => { await t.getByRole('slider', { name, exact: true }).evaluate((el, val) => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(el, val); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }, String(v)); };

    /* ---- the rail ---- */
    await t.getByRole('button', { name: 'تصاميم ريبين (11)', exact: true }).click();
    await t.waitForTimeout(200);
    check('Repine: eleven designs on the rail, the ivory plaque gone', await t.locator('.ms-tile').count() === 11 && await t.locator('[data-template="rp-ivory"]').count() === 0);
    for (const [id, name] of [['rp-liquid', 'الذهب السائل'], ['rp-identity', 'البطاقة العاجية'], ['rp-night', 'الهوية الليلية']]) {
      check(`${id} named ${name}`, (await t.locator(`[data-template="${id}"] .ms-tile-name b`).textContent()) === name);
      check(`${id} marked new`, (await t.locator(`[data-template="${id}"] em`).textContent()) === 'جديد');
    }
    await t.getByRole('radio', { name: 'شفاف', exact: true }).click();

    for (const id of ['rp-liquid', 'rp-identity', 'rp-night']) {
      await pick(id);
      for (const [at, min] of [[.2, 1], [1.2, 30], [2.2, 60], [4.2, 80]]) {
        await scrubTo(at); const ink = await read();
        check(`${id}: draws real artwork at ${at}s`, ink.n > 50 && ink.colors > min, { n: ink.n, colors: ink.colors });
      }
      /* every frame of the build, the showcase and the exit, a thirtieth of a second apart, draws without an error */
      const total = Number(await t.getByLabel('موضع المعاينة', { exact: true }).getAttribute('max'));
      const before = errors.length; let frames = 0;
      for (let s = 0; s <= total + .001; s += 1 / 30) { await scrubTo(s.toFixed(3)); frames++; }
      check(`${id}: all ${frames} frames draw without an error`, errors.length === before, errors.slice(before, before + 3));
      await t.waitForTimeout(400);
      await t.locator(`[data-template="${id}"] .ms-thumb.ready`).waitFor({ timeout: 10000 });
      check(`${id}: its thumbnail is drawn`, await t.locator(`[data-template="${id}"] .ms-thumb canvas`).evaluate(cv => { const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let k = 0; for (let i = 3; i < d.length; i += 16) if (d[i] > 0) k++; return k > 200; }));
    }

    /* ---- «التصميم» and every option, on the liquid design ---- */
    await pick('rp-liquid');
    await scrubTo(4.6);
    const tabs = await t.getByRole('tab').allTextContents();
    check('the liquid design has the tabs content, colours, design, timing, motion', JSON.stringify(tabs) === JSON.stringify(['المحتوى', 'الألوان', 'التصميم', 'التوقيت', 'الحركة']), tabs);
    await tab('التصميم');
    check('«التصميم» groups', JSON.stringify(await t.locator('.ms-panel legend').allTextContents()) === JSON.stringify(['اللمعة', 'النقش والخط', 'الموضع والحجم', 'المؤثرات']), await t.locator('.ms-panel legend').allTextContents());
    await t.screenshot({ path: path.join(out, 'design-tab.png'), fullPage: false });
    const gold = await read();

    await tab('الألوان');
    check('metal choices with swatches', await t.locator('.ms-pick-metal').count() === 5);
    check('the custom metal colour is hidden until «مخصص»', await t.getByText('لون المعدن المخصص').count() === 0);
    await option('فضي').click(); await scrubTo(4.6);
    const silver = await read();
    check('«فضي» turns the metal silver', silver.rb < gold.rb - 8, { gold: gold.rb, silver: silver.rb });
    await option('مخصص').click();
    check('«مخصص» shows its colour', await t.getByText('لون المعدن المخصص').count() === 1);
    await t.locator('.ms-color').filter({ hasText: 'لون المعدن المخصص' }).locator('input[type=color]').fill('#e0302a');
    await scrubTo(4.6); const red = await read();
    check('a custom metal colour is drawn', red.rb > silver.rb + 12, { silver: silver.rb, red: red.rb });
    await t.getByRole('button', { name: 'استعادة الألوان الأصلية' }).click(); await scrubTo(4.6);
    check('restoring the colours restores the metal', Math.abs((await read()).rb - gold.rb) < 2);
    await t.locator('.ms-color').filter({ hasText: 'لون اللوح الزجاجي' }).locator('input[type=color]').fill('#5a1040');
    await scrubTo(4.6); { const panel = await read(); check('the panel colour changes the panel', diff(gold, panel) > .005, diff(gold, panel)); }
    await t.getByRole('button', { name: 'استعادة الألوان الأصلية' }).click();

    await tab('التصميم');
    /* A switch is flipped by its own click, so a hidden input never misses the pointer; its state is read back. */
    const flip = async label => { const sw = t.getByRole('switch', { name: label, exact: true }), was = await sw.isChecked(); await sw.evaluate(el => el.click()); check(`«${label}» flips`, await sw.isChecked() === !was); };
    const toggled = async (label, what, least = .002) => {
      await scrubTo(4.6); const a = await read();
      await flip(label); await scrubTo(4.6); const b2 = await read();
      await flip(label);
      check(`${what}`, diff(a, b2) > least, diff(a, b2));
    };
    check('«سرعة اللمعة» shows while the light is on', await t.getByRole('slider', { name: 'سرعة اللمعة' }).count() === 1);
    await toggled('لمعة هادئة على زهرة هداية', 'the quiet light on the emblem switches off and on', .00005);
    await flip('لمعة هادئة على زهرة هداية');
    check('«سرعة اللمعة» hides with the light off', await t.getByRole('slider', { name: 'سرعة اللمعة' }).count() === 0);
    /* shown, the design is still: with the light off, two moments of the showcase are the same picture */
    { await scrubTo(4); const a = await read(); await scrubTo(6.6); const b2 = await read(); check('Liquid Gold is still while it is shown (no ripple, no drops, no drift)', moved(a, b2) === 0, { moved: moved(a, b2), diff: diff(a, b2) }); }
    await flip('لمعة هادئة على زهرة هداية');
    check('eight patterns with drawn swatches', await t.locator('.ms-pick canvas').count() === 8);
    await setSlider('وضوح النقش', 100);
    for (const [a, b2] of [['بلا', 'نجمة ثمانية'], ['نجمة ثمانية', 'تموجات']]) {
      await option(a).click(); await scrubTo(4.6); const x = await read();
      await option(b2).click(); await scrubTo(4.6); const y = await read();
      check(`pattern «${a}» and «${b2}» differ`, diff(x, y) > .002, diff(x, y));
    }
    await option('بلا').click();
    check('«وضوح النقش» hides with no pattern', await t.getByRole('slider', { name: 'وضوح النقش' }).count() === 0);
    await option('زخرفة هداية').click(); await setSlider('وضوح النقش', 22);
    { await scrubTo(4.6); const a = await read(); await option('رقعة').click(); await scrubTo(4.6); const b2 = await read(); await option('بلكس').click(); check('the title font changes the title', diff(a, b2) > .002, diff(a, b2)); }
    { await scrubTo(4.6); const a = await read(); await option('ثابت').click(); await scrubTo(4.6); const b2 = await read(); await option('على قدر النص').click(); check('«ثابت» draws the band across the width', b2.left < a.left - .1, { auto: a.left, full: b2.left }); }
    await option('يسار').click(); await scrubTo(4.6); const left = await read();
    await option('وسط').click(); await scrubTo(4.6); const centre = await read();
    await option('يمين').click(); await scrubTo(4.6); const right = await read();
    check('«يسار» moves the design to the left', left.cx < .45 && right.cx > .55, { left: left.cx, right: right.cx });
    check('«وسط» centres it', Math.abs(centre.cx - .5) < .08, centre.cx);
    await setSlider('الحجم', 60); await scrubTo(4.6); const small = await read(); await setSlider('الحجم', 100);
    check('«الحجم» at 60% draws it smaller', small.right - small.left < (right.right - right.left) * .75, { small: small.right - small.left, full: right.right - right.left });
    await setSlider('الارتفاع عن الحافة السفلية', 40); await scrubTo(4.6); const lifted = await read(); await setSlider('الارتفاع عن الحافة السفلية', 0);
    check('the height lifts it', lifted.cy < right.cy - .25, { lifted: lifted.cy, base: right.cy });
    await toggled('ظل تحت التصميم', 'the drop shadow switches');
    await toggled('توهج خفيف حول الزهرة', 'the glow switches', .0005);
    check('there is no drops switch any more', await t.getByRole('switch', { name: 'قطرات تتساقط' }).count() === 0);
    { const at = async (v, s) => { await setSlider('سيولة الدخول', v); await scrubTo(s); return read(); };
      const inWavy = await at(100, 1.7), inCalm = await at(0, 1.7), shownWavy = await at(100, 4.6), shownCalm = await at(0, 4.6); await setSlider('سيولة الدخول', 60);
      check('«سيولة الدخول» shapes the entry', diff(inWavy, inCalm) > .001, diff(inWavy, inCalm));
      check('«سيولة الدخول» leaves the shown band unchanged', moved(shownWavy, shownCalm) === 0, { moved: moved(shownWavy, shownCalm), diff: diff(shownWavy, shownCalm) }); }
    /* the exit is its own movement: the band retracts into the disc and nothing falls from above, unlike the entry */
    { await scrubTo(.2); const drop = await read(); await scrubTo(4.6); const shown = await read();
      const total = Number(await t.getByLabel('موضع المعاينة', { exact: true }).getAttribute('max'));
      await scrubTo(total - .7); const leaving = await read(); await scrubTo(total - .2); const closing = await read();
      check('the entry starts with a drop above the disc', drop.top < shown.top - .1, { drop: drop.top, shown: shown.top });
      check('the exit retracts the band toward the disc', leaving.left > shown.left + .2 && leaving.top >= shown.top - .01, { shown: [shown.left, shown.top], leaving: [leaving.left, leaving.top] });
      check('the exit ends with the disc alone, fading, nothing above it', closing.n < leaving.n && closing.top >= shown.top - .01, { leaving: leaving.n, closing: closing.n, top: closing.top }); }

    /* ---- text ---- */
    await tab('المحتوى');
    await scrubTo(4.6); const before = await read();
    await t.getByLabel('العنوان', { exact: true }).fill('ملتقى الدعوة السنوي');
    await t.waitForTimeout(800); await scrubTo(4.6); const longer = await read();
    check('a new title is drawn', longer.left < before.left - .05, { before: before.left, after: longer.left });
    await t.getByLabel('النص الفرعي', { exact: true }).fill(''); await t.waitForTimeout(800); await scrubTo(4.6);
    check('an empty subtitle takes its drop away', diff(longer, await read()) > .005);
    await t.getByLabel('وسم فوق الشريط', { exact: true }).fill('مباشر'); await t.waitForTimeout(800); await scrubTo(4.6);
    await t.screenshot({ path: path.join(out, 'liquid-edited.png') });
    await t.getByRole('button', { name: 'إعادة ضبط هذا التصميم' }).click();
    check('reset restores the title', await t.getByLabel('العنوان', { exact: true }).inputValue() === 'أثر يمتد');

    /* ---- the two identity designs: the whole logo, a title and two side texts, «هداية 2026» editable ---- */
    for (const [id, colours] of [['rp-identity', 5], ['rp-night', 5]]) {
      await pick(id); await scrubTo(4.2);
      await tab('المحتوى');
      check(`${id}: a title, a subtitle and a side text`, await t.getByLabel('العنوان', { exact: true }).count() === 1 && await t.getByLabel('النص الفرعي', { exact: true }).count() === 1 && await t.getByLabel('النص الجانبي', { exact: true }).count() === 1);
      check(`${id}: the side text starts as «هداية 2026»`, await t.getByLabel('النص الجانبي', { exact: true }).inputValue() === 'هداية 2026');
      const before = await read();
      await t.getByLabel('النص الجانبي', { exact: true }).fill('هداية 2027'); await t.waitForTimeout(800); await scrubTo(4.2);
      { const after = await read(); check(`${id}: «هداية 2027» is drawn in its place`, moved(before, after) > 0, { moved: moved(before, after) }); }
      await t.getByLabel('النص الجانبي', { exact: true }).fill(''); await t.waitForTimeout(800); await scrubTo(4.2);
      { const after = await read(); check(`${id}: an empty side text takes it away`, moved(before, after) > moved(before, before) && diff(before, after) > .0001, { moved: moved(before, after) }); }
      await t.getByRole('button', { name: 'إعادة ضبط هذا التصميم' }).click(); await scrubTo(4.2);
      await tab('التصميم'); await flip('لمعة هادئة على زهرة هداية');
      { await scrubTo(4); await read();
        await scrubTo(4); const a = await read(); await scrubTo(6.4); const b2 = await read(); const w2 = Math.ceil((await stage().evaluate(cv => cv.width)) / 2); let bx = [1e9, -1, 1e9, -1]; a.cells.forEach((v, i) => { if (Math.abs(v - b2.cells[i]) > 6) { const x = i % w2, y = Math.floor(i / w2); bx = [Math.min(bx[0], x), Math.max(bx[1], x), Math.min(bx[2], y), Math.max(bx[3], y)]; } });
        check(`${id}: still while it is shown, with the light off (text edges may round apart)`, moved(a, b2) < .002, { moved: moved(a, b2), box: bx, w2 }); }
      await flip('لمعة هادئة على زهرة هداية');
      await tab('الألوان');
      check(`${id}: its colours and the metal`, await t.locator('.ms-colors input[type=color]').count() === colours && await t.locator('.ms-pick-metal').count() === 5);
      await scrubTo(4.2); await t.getByRole('radio', { name: 'مشهد', exact: true }).click(); await t.waitForTimeout(100);
      await t.locator('.ms-workbench').screenshot({ path: path.join(out, `${id}-workbench.png`) });
      await t.getByRole('radio', { name: 'شفاف', exact: true }).click();
    }

    /* ---- downloads ---- */
    const probe = file => JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name,codec_tag_string,width,height,nb_read_frames,pix_fmt', '-of', 'json', file]).toString()).streams[0];
    const alphaStats = (file, at) => {
      const raw = path.join(out, 'frame.rgba'); execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', String(at), '-i', file, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgba', raw], { stdio: 'pipe' });
      const px = fs.readFileSync(raw); let clear = 0, solid = 0; for (let i = 3; i < px.length; i += 4) { if (px[i] === 0) clear++; else if (px[i] > 250) solid++; }
      return { clear, solid, total: px.length / 4 };
    };
    const download = async (title, tag) => {
      await t.locator('label.ms-format').filter({ hasText: title }).click();
      const started = Date.now(), promise = t.waitForEvent('download', { timeout: 240000 });
      await t.getByRole('button', { name: 'تنزيل التصميم', exact: true }).last().click();
      const dl = await promise, file = path.join(out, dl.suggestedFilename()); await dl.saveAs(file);
      timings[tag] = (Date.now() - started) / 1000;
      await t.locator('.ms-result').waitFor();
      return { file, name: dl.suggestedFilename(), data: fs.readFileSync(file) };
    };
    for (const id of ['rp-liquid', 'rp-identity', 'rp-night']) {
      await pick(id); await tab('التوقيت');
      const hold = t.getByRole('slider', { name: 'مدة العرض', exact: true });
      await hold.evaluate(el => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(el, '1'); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); });
      await t.getByRole('radio', { name: '720p', exact: true }).click(); await t.getByRole('radio', { name: '24', exact: true }).click();
      const total = Number(await t.locator('.ms-total bdi').textContent()), frames = Math.max(2, Math.round(total * 24));
      const mp4 = await download(/فيديو بخلفية خضراء/, `${id}-mp4`);
      const mi = probe(mp4.file);
      check(`${id}: MP4 on green decodes at 1280x720 with ${frames} frames`, mp4.name === `${id}_1280x720_24fps_greenscreen.mp4` && mi.codec_name === 'h264' && mi.width === 1280 && mi.height === 720 && Number(mi.nb_read_frames) === frames, { name: mp4.name, ...mi, frames });
      execFileSync('ffmpeg', ['-v', 'error', '-i', mp4.file, '-f', 'null', '-'], { stdio: 'pipe' }); check(`${id}: MP4 decodes completely`, true);
      const mov = await download(/فيديو شفاف/, `${id}-mov`);
      const vi = probe(mov.file), st = alphaStats(mov.file, total * .7);
      check(`${id}: transparent MOV is ProRes 4444 with alpha`, vi.codec_name === 'prores' && vi.codec_tag_string === 'ap4h' && vi.pix_fmt === 'yuva444p12le' && Number(vi.nb_read_frames) === frames, { ...vi, frames });
      check(`${id}: a decoded MOV frame is mostly clear with a solid design`, st.clear > st.total * .6 && st.solid > 8000, st);
      const zip = await download(/تسلسل صور شفافة/, `${id}-zip`);
      check(`${id}: PNG sequence in ZIP`, zip.data.subarray(0, 4).toString('hex') === '504b0304' && zip.data.length > 50000, { name: zip.name, bytes: zip.data.length });
      const list = zipNames(zip.data).filter(n => n.endsWith('.png'));
      check(`${id}: the ZIP holds one PNG per frame`, list.length === frames, { files: list.length, frames });
    }
    /* the single PNG carries the options: silver, on the left */
    await pick('rp-liquid'); await tab('الألوان'); await option('فضي').click(); await tab('التصميم'); await option('يسار').click(); await scrubTo(4.6);
    const png = await download(/صورة واحدة/, 'png');
    fs.writeFileSync(path.join(out, 'decoded.rgba'), Buffer.alloc(0));
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', png.file, '-f', 'rawvideo', '-pix_fmt', 'rgba', path.join(out, 'decoded.rgba')], { stdio: 'pipe' });
    const info = probe(png.file), px = fs.readFileSync(path.join(out, 'decoded.rgba'));
    let n = 0, sx = 0, rb = 0; for (let i = 0; i < px.length; i += 4 * 5) if (px[i + 3] > 200) { n++; sx += (i / 4) % info.width; rb += px[i] - px[i + 2]; }
    check('PNG: 1280x720 with transparency', info.width === 1280 && info.height === 720 && /rgba|ya/.test(info.pix_fmt), info);
    check('PNG: the design is on the left and silver, as chosen', sx / n / info.width < .45 && rb / n < 20, { cx: sx / n / info.width, rb: rb / n });

    /* ---- phone width ---- */
    await t.setViewportSize({ width: 390, height: 860 }); await t.waitForTimeout(300);
    check('phone: nothing wider than the screen', await t.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    await t.locator('.ms-settings').screenshot({ path: path.join(out, 'phone-settings.png') });
    check('no console or page errors', errors.length === 0, errors);
  } catch (e) {
    if (t) await t.screenshot({ path: path.join(out, 'failure.png'), fullPage: true }).catch(() => undefined);
    if (errors.length) console.error('PAGE ERRORS', errors.slice(0, 5));
    throw e;
  } finally {
    await browser.close(); server.close();
    fs.rmSync(build, { recursive: true, force: true });
    for (const f of ['frame.rgba', 'decoded.rgba']) fs.rmSync(path.join(out, f), { force: true });
    fs.writeFileSync(path.join(__dirname, 'motion-ribbons.json'), JSON.stringify({ when: new Date().toISOString(), browser: launchOptions.channel || 'chromium', exportSeconds: timings, checks }, null, 2) + '\n');
  }
  console.log(checks.map(c => `${c.pass ? 'PASS' : 'FAIL'}  ${c.name}  ${typeof c.detail === 'string' ? c.detail : JSON.stringify(c.detail)}`).join('\n'));
  console.log(`${checks.filter(c => c.pass).length} of ${checks.length} checks passed`);
})().catch(e => { console.error(e); console.log(checks.map(c => `${c.pass ? 'PASS' : 'FAIL'}  ${c.name}`).join('\n')); process.exit(1); });

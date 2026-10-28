// The two pictures Google Play's listing requires (Android_Build_Plan.md A8; Play_Console_Drafts.md section 4), drawn
// from the brand logo (public/brand/comms-hub-logo.svg) and the site's own fonts (Reem Kufi and IBM Plex Sans Arabic,
// SIL Open Font License, from @fontsource): the 512 by 512 icon, a full square because Play rounds its corners itself,
// and the 1024 by 500 feature graphic. Written to mobile/play/, then each checked for its size and for being opaque.
// Usage: node qa/play-graphics.cjs   (writes qa/play-graphics.json)
const fs = require('node:fs');
const path = require('node:path');
const { dependency, launchOptions } = require('./runtime.cjs');
const { chromium } = dependency('playwright');
const h = require('./android-helpers.cjs');

const { check, result, finish } = h.record('qa/play-graphics.cjs');
const out = path.join(h.root, 'mobile', 'play');
const font = (pkg, file) => `data:font/woff2;base64,${fs.readFileSync(path.join(h.root, 'node_modules', '@fontsource', pkg, 'files', file)).toString('base64')}`;
const faces = `
@font-face{font-family:Kufi;src:url(${font('reem-kufi', 'reem-kufi-arabic-600-normal.woff2')}) format('woff2');font-weight:600}
@font-face{font-family:Plex;src:url(${font('ibm-plex-sans-arabic', 'ibm-plex-sans-arabic-arabic-500-normal.woff2')}) format('woff2');font-weight:500}`;
// The rosette of the logo: four capsules turned 0, 45, 90 and 135 degrees, in the logo's gold.
const rosette = (scale) => `
  <g transform="translate(0 0) scale(${scale})" fill="none" stroke="url(#leaf)" stroke-width="3.2">
    <rect x="-60" y="-18" width="120" height="36" rx="18"/>
    <rect x="-60" y="-18" width="120" height="36" rx="18" transform="rotate(45)"/>
    <rect x="-60" y="-18" width="120" height="36" rx="18" transform="rotate(90)"/>
    <rect x="-60" y="-18" width="120" height="36" rx="18" transform="rotate(135)"/>
  </g>`;
const defs = `
  <defs>
    <linearGradient id="depth" x1="0" y1="0" x2="1" y2="1" gradientTransform="rotate(25 .5 .5)">
      <stop offset="0" stop-color="#12604a"/><stop offset=".55" stop-color="#0b3a2d"/><stop offset="1" stop-color="#06241b"/>
    </linearGradient>
    <linearGradient id="leaf" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f6e3a6"/><stop offset=".5" stop-color="#e8c46c"/><stop offset="1" stop-color="#d9ad4f"/>
    </linearGradient>
  </defs>`;
const page = (w, hgt, body) => `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><style>${faces}
html,body{margin:0;width:${w}px;height:${hgt}px;overflow:hidden;background:#06241b}svg{display:block}</style></head><body>${body}</body></html>`;

const icon = page(512, 512, `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">${defs}
  <rect width="512" height="512" fill="url(#depth)"/>
  <g transform="translate(256 256)">${rosette(2.25)}</g></svg>`);

const feature = page(1024, 500, `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="500" viewBox="0 0 1024 500">${defs}
  <rect width="1024" height="500" fill="url(#depth)"/>
  <g transform="translate(190 250)">${rosette(1.5)}</g>
  <text x="950" y="236" direction="rtl" text-anchor="start" font-family="Kufi" font-weight="600" font-size="64" fill="#fbfcf9">مركز الاتصال المؤسسي</text>
  <text x="950" y="300" direction="rtl" text-anchor="start" font-family="Plex" font-weight="500" font-size="25" fill="#e8c46c">الأعمال والاعتماد والمكتبة والبريد والمراسلة في مكان واحد</text>
</svg>`);

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch(launchOptions);
  try {
    for (const [name, html, w, hgt] of [['icon-512.png', icon, 512, 512], ['feature-graphic-1024x500.png', feature, 1024, 500]]) {
      const tab = await browser.newPage({ viewport: { width: w, height: hgt }, deviceScaleFactor: 1 });
      await tab.setContent(html);
      await tab.evaluate(() => document.fonts.ready);
      const fonts = await tab.evaluate(() => [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family));
      const file = path.join(out, name);
      await tab.screenshot({ path: file, omitBackground: false });
      const png = fs.readFileSync(file);
      // PNG header: width and height at bytes 16 and 20; colour type 2 (RGB, opaque) or 6 (RGBA) at byte 25.
      const size = [png.readUInt32BE(16), png.readUInt32BE(20)];
      check(`${name}: ${w} by ${hgt}`, size[0] === w && size[1] === hgt, size);
      check(`${name}: under 1 MB, as Play asks`, png.length < 1024 * 1024, png.length);
      // Every corner painted: a full square, no transparent or white rounded corner left for Play to show.
      const corners = await tab.evaluate(async ({ w, hgt }) => {
        const c = document.createElement('canvas');
        c.width = w;
        c.height = hgt;
        const img = new Image();
        img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(new XMLSerializer().serializeToString(document.querySelector('svg')))));
        await img.decode();
        const x = c.getContext('2d');
        x.drawImage(img, 0, 0);
        return [[0, 0], [w - 1, 0], [0, hgt - 1], [w - 1, hgt - 1]].map(([a, b]) => Array.from(x.getImageData(a, b, 1, 1).data));
      }, { w, hgt });
      check(`${name}: the four corners are the brand's green, opaque`, corners.every(([r, g, b, a]) => a === 255 && g > r && g > b && r < 60), corners);
      if (name.startsWith('feature')) check(`${name}: drawn with the site's two Arabic fonts`, fonts.includes('Kufi') && fonts.includes('Plex'), fonts);
      result[name] = { bytes: png.length };
      await tab.close();
    }
  } finally {
    await browser.close();
  }
  process.exit(finish(path.join(__dirname, 'play-graphics.json')) ? 1 : 0);
})().catch((e) => {
  check('the run finished', false, String(e?.stack ?? e));
  process.exit(finish(path.join(__dirname, 'play-graphics.json')) ? 1 : 2);
});

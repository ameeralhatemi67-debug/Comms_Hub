// Draws the browser tab's icons from the logo (public/brand/comms-hub-logo.svg), in Edge. The same tile and rosette, with
// the gold line made thicker as the size falls: at 16 pixels the logo's own line is a quarter of a pixel and the
// rosette turns to mud. Writes src/app/icon.svg, src/app/apple-icon.png and, through Pillow, src/app/favicon.ico.
// Re-run it only when the logo changes.
// Usage: node qa/site-icons-build.cjs
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { dependency, launchOptions } = require('./runtime.cjs');
const { chromium } = dependency('playwright');

const root = path.resolve(__dirname, '..');
const app = path.join(root, 'src', 'app');

const defs = `<defs>
    <linearGradient id="depth" x1="0" y1="0" x2="1" y2="1" gradientTransform="rotate(25 .5 .5)">
      <stop offset="0" stop-color="#12604a"/>
      <stop offset=".55" stop-color="#0b3a2d"/>
      <stop offset="1" stop-color="#06241b"/>
    </linearGradient>
    <linearGradient id="leaf" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f6e3a6"/>
      <stop offset=".5" stop-color="#e8c46c"/>
      <stop offset="1" stop-color="#d9ad4f"/>
    </linearGradient>
  </defs>`;
const TILE = 'M96 0H488a24 24 0 0 1 24 24V416a96 96 0 0 1-96 96H24a24 24 0 0 1-24-24V96A96 96 0 0 1 96 0Z';
const rosette = (scale, line) => `<g transform="translate(256 256) scale(${scale})" fill="none" stroke="url(#leaf)" stroke-width="${line}">
    <rect x="-60" y="-18" width="120" height="36" rx="18"/>
    <rect x="-60" y="-18" width="120" height="36" rx="18" transform="rotate(45)"/>
    <rect x="-60" y="-18" width="120" height="36" rx="18" transform="rotate(90)"/>
    <rect x="-60" y="-18" width="120" height="36" rx="18" transform="rotate(135)"/>
  </g>`;
/** A rounded tile, or a full square for an icon the phone rounds itself. */
const svg = (size, scale, line, square = false) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
  ${defs}
  ${square ? '<rect width="512" height="512" fill="url(#depth)"/>' : `<path d="${TILE}" fill="url(#depth)"/>`}
  ${rosette(scale, line)}
</svg>
`;

// The size a browser asks for, and how heavy the line has to be there.
const SIZES = [
  [16, 3.55, 7.8],
  [24, 3.3, 8.5],
  [32, 3.2, 7],
  [48, 3, 5.5],
  [64, 2.9, 4.8],
];

(async () => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'site-icons-'));
  const browser = await chromium.launch(launchOptions);
  const shot = async (markup, size, file) => {
    const context = await browser.newContext({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    await page.setContent(`<!doctype html><html><body style="margin:0;background:transparent">${markup}</body></html>`);
    await page.screenshot({ path: file, omitBackground: true });
    await context.close();
  };
  const made = [];
  for (const [size, scale, line] of SIZES) {
    const file = path.join(work, `icon-${size}.png`);
    await shot(svg(size, scale, line), size, file);
    made.push(file);
  }
  await shot(svg(180, 2.5, 4.4, true), 180, path.join(app, 'apple-icon.png'));
  await browser.close();
  // The vector the browsers that take one use: heavy enough for a tab, clean at any size.
  fs.writeFileSync(path.join(app, 'icon.svg'), svg(32, 3.2, 7).replace(' width="32" height="32"', ''));
  const script = `from PIL import Image\nimport sys\nfiles = sys.argv[2:]\nimages = [Image.open(f).convert('RGBA') for f in files]\nimages[-1].save(sys.argv[1], format='ICO', sizes=[i.size for i in images], append_images=images[:-1])\n`;
  execFileSync('python', ['-c', script, path.join(app, 'favicon.ico'), ...made], { stdio: 'inherit' });
  fs.rmSync(work, { recursive: true, force: true });
  console.log('src/app/favicon.ico, icon.svg and apple-icon.png written');
})();

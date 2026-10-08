// Extract drawing functions and image masks, excluding the standalone app and global patches.
const fs = require('node:fs');
const path = require('node:path');
const source = process.argv[2] || 'D:/Agents/main/projects/ideas/motion_design/numbers-library/src';
const read = name => fs.readFileSync(path.join(source, name), 'utf8');
fs.mkdirSync('src/lib/motion', { recursive: true });
fs.mkdirSync('public/motion', { recursive: true });
let assets = '';
for (const [file, variable] of [['logo_assets.js', 'LOGO_SRC'], ['verse_assets.js', 'VERSE_SRC']]) {
  let content = read(file);
  content = content.replace(/"?(\w+)"?:\s*"data:image\/png;base64,([^"]+)"/g, (_, key, data) => {
    const name = `${variable.toLowerCase()}-${key}.png`;
    fs.writeFileSync(`public/motion/${name}`, Buffer.from(data, 'base64'));
    return `"${key}": "/motion/${name}"`;
  });
  assets += content + '\n';
}
const template = read('index.template.html');
let core = template.slice(template.indexOf('const W ='), template.indexOf('const cards ='));
let repine = read('repine.js');
repine = repine.slice(repine.indexOf('const AR_FONT'), repine.indexOf('const slider ='));
repine = repine.replace(/for \(const k in LOGO_SRC\) \{[\s\S]*?\n\}/, '');
let frames = read('frames.js');
frames = frames.slice(frames.indexOf('const RATIOS'), frames.indexOf('const FR ='));
frames = frames.replace(/for \(const k in VERSE_SRC\)[^\n]+/, '');
let combined = assets + core + repine + frames;
combined = combined.replace(/\b(ctx|c|x|y)\.arc\(/g, 'safeArc($1, ');
combined = combined.replace(/setFont\(ctx, size, weight\);\n  if \('letterSpacing' in ctx\)/g,
  "setFont(ctx, size, weight);\n  if (/[\\u0600-\\u06ff]/.test(str)) track = 0;\n  ctx.direction = /[\\u0600-\\u06ff]/.test(str) ? 'rtl' : 'ltr';\n  if ('letterSpacing' in ctx)");
combined = combined.replace('const FONT =', 'const FONT =').replace(/"Cairo","Tajawal",/g, '');
combined += `
function safeArc(ctx, x, y, radius, start, end, counterclockwise) {
  ctx.arc(x, y, Math.max(0, radius), start, end, counterclockwise);
}
export async function loadAssets() {
  await Promise.all(Object.entries({...LOGO_SRC, ...VERSE_SRC}).map(([key, src]) => new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => { LOGO[key] = image; resolve(); };
    image.onerror = () => reject(new Error('تعذر تحميل عناصر التصميم. أعد المحاولة.'));
    image.src = src;
  })));
}
export { GRAPHICS, REPINE, FRAMES, renderFrame, timingOf, drawLogo };
`;
fs.writeFileSync('src/lib/motion/renderers.js', '// Adapted from motion_design; drawing code only. UI and lifecycle belong to React.\n' + combined);
const exp = read('export.js');
fs.writeFileSync('src/lib/motion/containers.js', exp.slice(exp.indexOf('const crcTable'), exp.indexOf('/* ---------- shared helpers')) + '\nexport { makeZip, muxVideo };\n');
console.log('Extracted 16 renderers, image masks, and local ZIP/MOV/MP4 container writers.');

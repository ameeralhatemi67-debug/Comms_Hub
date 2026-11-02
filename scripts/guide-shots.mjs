// Makes the pictures of the Google setup guide (src/lib/setup-guides.ts, «google»; MVP_draft.md section 67.5) from
// screenshots of Google's own console. The originals hold real addresses and identifiers, so they are never kept in
// the repository: this script is given the folder that holds them (1.png to 7.png, in the order of the owner's
// message of 2026-11-02), blurs everything private, draws the numbered rings that say where to click, crops each
// picture to the part that matters and writes it to public/guides/google/.
//   node scripts/guide-shots.mjs <folder with the originals>
// Corners are rounded by the page (the figure clips them), so the files stay square and re-usable.
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import sharp from 'sharp';

const src = process.argv[2];
if (!src) {
  console.error('usage: node scripts/guide-shots.mjs <folder with the original screenshots>');
  process.exit(1);
}
const out = resolve(import.meta.dirname, '..', 'public', 'guides', 'google');
mkdirSync(out, { recursive: true });

const AMBER = '#ffb300';
const RED = '#ff5a4d';

/** Everything below is in the original's own pixels. `blur` boxes are [x, y, w, h]; `mend` boxes are painted over with the page colour. */
const SHOTS = [
  {
    name: 'menu',
    from: '1.png',
    crop: [0, 0, 340, 467],
    alt: 'القائمة الجانبية في Google Auth Platform: Overview وBranding وAudience وClients وData access وVerification centre وSettings',
  },
  {
    name: 'branding',
    from: '6.png',
    blur: [[380, 384, 190, 28]],
    marks: [
      { box: [364, 264, 650, 56], n: '1' },
      { box: [364, 366, 650, 60], n: '2' },
      { box: [364, 668, 650, 52], n: 'x', color: RED },
    ],
    crop: [340, 140, 755, 582],
    alt: 'صفحة Branding في Google Auth Platform: حقل App name وحقل User support email، وتحتهما App logo',
  },
  {
    name: 'contact',
    from: '7.png',
    blur: [[396, 600, 182, 28]],
    marks: [{ box: [364, 584, 650, 58] }, { box: [364, 679, 80, 48] }],
    crop: [340, 542, 733, 198],
    alt: 'أسفل صفحة Branding: Developer contact information وحقل Email addresses وزرا Save وDiscard changes',
  },
  {
    name: 'test-users',
    from: '2.png',
    blur: [
      [386, 744, 265, 27],
      [386, 780, 265, 28],
      [386, 816, 265, 28],
    ],
    marks: [{ box: [364, 566, 150, 50], n: '2' }],
    crop: [340, 495, 650, 371],
    alt: 'صفحة Audience في Google Auth Platform: قسم Test users وزر Add users وتحته قائمة البريد',
  },
  {
    name: 'add-users',
    from: '2.png',
    marks: [
      { box: [1005, 233, 410, 56], n: '3' },
      { box: [1005, 323, 84, 52], n: '4' },
    ],
    crop: [985, 215, 435, 175],
    alt: 'لوحة Add users: حقل كتابة البريد وزر Save',
  },
  {
    name: 'clients',
    from: '3.png',
    marks: [{ box: [494, 52, 174, 48], n: '1' }],
    crop: [337, 30, 975, 295],
    alt: 'صفحة Clients في Google Auth Platform: زر Create client وجدول OAuth 2.0 Client IDs',
  },
  {
    name: 'app-type',
    from: '4.png',
    marks: [{ box: [42, 211, 616, 40], n: '2' }],
    crop: [0, 170, 688, 297],
    alt: 'قائمة Application type في Create OAuth client ID: Web application أولها، ثم Android وChrome extension وiOS',
  },
  {
    name: 'redirect',
    from: '5.png',
    mend: [
      [376, 443, 14, 14],
      [376, 479, 20, 16],
    ],
    marks: [
      { box: [364, 359, 592, 58], n: '3' },
      { box: [366, 434, 122, 44], n: '2' },
    ],
    crop: [340, 255, 660, 245],
    alt: 'قسم Authorised redirect URIs في Create OAuth client ID: حقل URIs 1 وزر Add URI',
  },
  {
    name: 'redirect-create',
    from: '5.png',
    mend: [
      [376, 443, 14, 14],
      [376, 479, 20, 16],
    ],
    marks: [
      { box: [364, 433, 126, 46], n: '1' },
      { box: [364, 627, 96, 52], n: '3' },
    ],
    crop: [340, 420, 660, 272],
    alt: 'أسفل Create OAuth client ID: زر Add URI ثم زرا Create وCancel',
  },
];

/** A numbered ring, drawn as paths so no font is needed on the machine that makes the pictures. */
function mark({ box: [x, y, w, h], n, color = AMBER }) {
  const badge = n !== undefined;
  const r = 13;
  const cx = x + 4;
  const cy = y + 4;
  const ink = '#1d1d1d';
  const glyph = !badge
    ? ''
    : n === 'x'
      ? `<path d="M${cx - 5} ${cy - 5}L${cx + 5} ${cy + 5}M${cx + 5} ${cy - 5}L${cx - 5} ${cy + 5}" stroke="#fff" stroke-width="3" stroke-linecap="round"/>`
      : DIGITS[n](cx, cy, ink);
  return (
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="9" fill="${color}" fill-opacity="0.07" stroke="${color}" stroke-width="3"/>` +
    (badge ? `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}" stroke="#0e0e0e" stroke-opacity="0.35" stroke-width="1"/>` : '') +
    glyph
  );
}

const line = (d, ink) => `<path d="${d}" fill="none" stroke="${ink}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`;
const DIGITS = {
  1: (x, y, ink) => line(`M${x - 3} ${y - 4}L${x + 1} ${y - 8}L${x + 1} ${y + 8}`, ink),
  3: (x, y, ink) => line(`M${x - 5} ${y - 6}C${x - 5} ${y - 13} ${x + 5} ${y - 13} ${x + 5} ${y - 6}C${x + 5} ${y - 2} ${x + 1} ${y - 1} ${x - 2} ${y - 1}C${x + 1} ${y - 1} ${x + 6} ${y + 1} ${x + 6} ${y + 6}C${x + 6} ${y + 13} ${x - 6} ${y + 13} ${x - 6} ${y + 6}`, ink),
  4: (x, y, ink) => line(`M${x + 3} ${y + 8}L${x + 3} ${y - 8}L${x - 6} ${y + 3}L${x + 6} ${y + 3}`, ink),
  2: (x, y, ink) => line(`M${x - 5} ${y - 4}C${x - 5} ${y - 11} ${x + 5} ${y - 11} ${x + 5} ${y - 4}C${x + 5} ${y} ${x - 5} ${y + 3} ${x - 5} ${y + 8}L${x + 5} ${y + 8}`, ink),
};

/** The page colour, sampled from a flat spot of the same picture. */
async function colourAt(buf, info, x, y) {
  const px = await sharp(buf, { raw: info }).extract({ left: x, top: y, width: 1, height: 1 }).raw().toBuffer();
  return { r: px[0], g: px[1], b: px[2] };
}

for (const s of SHOTS) {
  const input = join(src, s.from);
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const layers = [];
  for (const [x, y, w, h] of s.blur ?? []) {
    // Pixelate first, then blur: a smudge that cannot be read, and cannot be sharpened back.
    const small = await sharp(data, { raw: info }).extract({ left: x, top: y, width: w, height: h }).resize({ width: Math.max(2, Math.round(w / 9)), kernel: 'nearest' }).raw().toBuffer({ resolveWithObject: true });
    const patch = await sharp(small.data, { raw: small.info }).resize({ width: w, height: h, fit: 'fill', kernel: 'cubic' }).blur(5).png().toBuffer();
    layers.push({ input: patch, left: x, top: y });
  }
  for (const [x, y, w, h] of s.mend ?? []) {
    const c = await colourAt(data, info, 700, 490);
    layers.push({ input: await sharp({ create: { width: w, height: h, channels: 3, background: c } }).png().toBuffer(), left: x, top: y });
  }
  if (s.marks?.length) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${info.width}" height="${info.height}">${s.marks.map(mark).join('')}</svg>`;
    layers.push({ input: Buffer.from(svg), left: 0, top: 0 });
  }
  const [left, top, width, height] = s.crop ?? [0, 0, info.width, info.height];
  const file = join(out, `${s.name}.png`);
  // Composite first and crop afterwards: sharp crops before it composites when both are in one pipeline.
  const whole = await sharp(data, { raw: info }).composite(layers).raw().toBuffer({ resolveWithObject: true });
  const written = await sharp(whole.data, { raw: whole.info })
    .extract({ left, top, width, height })
    .png({ palette: true, quality: 92, effort: 10, dither: 0.4, compressionLevel: 9 })
    .toFile(file);
  console.log(`${s.name}.png  ${width} x ${height}  ${written.size} bytes`);
}

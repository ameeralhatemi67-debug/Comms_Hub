// Makes the pictures of the setup guides (src/lib/setup-guides.ts; MVP_draft.md sections 67.5 and 67.7) from screenshots of
// the platform's own pages. The originals hold real addresses, names and identifiers, so they are never kept in the
// repository: this script is given the folder that holds them, blurs everything private, draws the numbered rings that
// say where to click, crops each picture to the part that matters and writes it to public/guides/<set>/.
//   node scripts/guide-shots.mjs <folder with the originals> [google | meta]
// «google» (default): 1.png to 7.png, in the order of the owner's message of 2026-11-02. «meta» (the Instagram guide):
// meta-1.png to meta-19.png, in the order of the owner's messages of 2026-11-03: the accounts page, its menu, the portfolio's
// home, the add window, Instagram's own window and the added window (1 to 6); then the apps page, the new app's name,
// the use cases (featured, then content management) and the app's dashboard (7 to 11); then the use case's page, the
// confirmation of the configuration and the configuration with its return address (12 to 14); then the sections under it
// that are left alone and the return address once saved (15 to 17); then the app's Basic settings and the
// configuration's ID (18 and 19).
// A picture wider than the sheet can show is given a `width` and is scaled to it after the crop.
// Corners are rounded by the page (the figure clips them), so the files stay square and re-usable.
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import sharp from 'sharp';

const src = process.argv[2];
if (!src) {
  console.error('usage: node scripts/guide-shots.mjs <folder with the original screenshots>');
  process.exit(1);
}
const set = process.argv[3] ?? 'google';
if (!['google', 'meta'].includes(set)) {
  console.error('the set is google or meta');
  process.exit(1);
}
const out = resolve(import.meta.dirname, '..', 'public', 'guides', set);
mkdirSync(out, { recursive: true });

const AMBER = '#ffb300';
const RED = '#ff5a4d';

/** Everything below is in the original's own pixels. `blur` boxes are [x, y, w, h]; `mend` boxes are painted over with the page colour. `set` is the folder (default google). */
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
    blur: [
      [443, 237, 208, 28],
      [443, 276, 242, 28],
    ],
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
  {
    set: 'meta',
    name: 'ig-home',
    from: 'meta-3.png',
    blur: [[883, 507, 45, 26]],
    marks: [{ box: [338, 541, 959, 45], n: '2' }],
    crop: [330, 470, 975, 128],
    alt: 'الصفحة الرئيسية لحافظة الأعمال في Meta: «No ad accounts» وتحتها زر Go to Business settings',
  },
  {
    set: 'meta',
    name: 'ig-menu',
    from: 'meta-2.png',
    marks: [{ box: [28, 388, 338, 46], n: '3' }],
    crop: [0, 70, 378, 560],
    alt: 'قائمة Business settings: تحت Accounts تجد Pages وAd accounts وApps وInstagram accounts وWhatsApp accounts',
  },
  {
    set: 'meta',
    name: 'ig-add',
    from: 'meta-1.png',
    marks: [{ box: [1660, 36, 98, 45], n: '1' }],
    crop: [880, 10, 902, 100],
    alt: 'أعلى صفحة Instagram accounts: حقل البحث وزر Filters وزر Add',
  },
  {
    set: 'meta',
    name: 'ig-warning',
    from: 'meta-4.png',
    marks: [{ box: [546, 413, 228, 45], n: '2' }],
    crop: [44, 48, 751, 430],
    alt: 'نافذة Add an Instagram account: تنبيه أن الحسابات المهنية وحدها تُضاف، وزر Add Instagram account',
  },
  {
    set: 'meta',
    name: 'ig-professional',
    from: 'meta-5.png',
    marks: [{ box: [219, 590, 408, 228], n: '4' }, { box: [567, 841, 80, 41] }],
    crop: [198, 178, 469, 724],
    alt: 'نافذة إنستغرام «Which best describes you?»: خياران Creator وBusiness وزر Next',
  },
  {
    set: 'meta',
    name: 'ig-added',
    from: 'meta-6.png',
    blur: [
      [48, 435, 60, 61],
      [120, 444, 44, 24],
      [94, 514, 46, 46],
      [144, 517, 102, 25],
      [103, 584, 98, 24],
    ],
    marks: [{ box: [663, 698, 83, 44], n: '5' }, { box: [698, 602, 50, 28], n: 'x', color: RED }],
    crop: [16, 385, 748, 380],
    alt: 'أسفل نافذة «was added to the business portfolio»: Summary of changes، ومفتاح إدارة المستخدمين، وزر Done',
  },
  {
    set: 'meta',
    name: 'app-list',
    from: 'meta-7.png',
    marks: [{ box: [1728, 20, 131, 50], n: '2' }],
    crop: [1230, 10, 640, 70],
    alt: 'أعلى صفحة Apps في Meta for Developers: حقل البحث وزر Create App',
  },
  {
    set: 'meta',
    name: 'app-name',
    from: 'meta-8.png',
    blur: [[52, 394, 200, 32]],
    marks: [
      { box: [46, 254, 1213, 45], n: '3' },
      { box: [46, 389, 1213, 45], n: '4' },
      { box: [1181, 453, 79, 45], n: '5' },
    ],
    crop: [20, 180, 1260, 340],
    width: 975,
    alt: 'شاشة App details في Create an app: حقل App name وحقل App contact email وزر Next',
  },
  {
    set: 'meta',
    name: 'use-featured',
    from: 'meta-9.png',
    marks: [{ box: [34, 244, 262, 32], n: '1' }],
    crop: [20, 30, 1240, 740],
    width: 975,
    alt: 'شاشة Add use cases على قائمة Featured: ست حالات استخدام ليس بينها إنستغرام، وعلى اليسار Content management',
  },
  {
    set: 'meta',
    name: 'use-instagram',
    from: 'meta-10.png',
    marks: [
      { box: [334, 204, 908, 96], n: '2' },
      { box: [1163, 618, 79, 46], n: '3' },
    ],
    crop: [20, 10, 1240, 670],
    width: 975,
    alt: 'شاشة Add use cases على Content management: «Manage messaging & content on Instagram» معلَّمة، وزر Next',
  },
  {
    set: 'meta',
    name: 'dashboard',
    from: 'meta-11.png',
    marks: [{ box: [486, 168, 1306, 48], n: '1' }],
    crop: [465, 100, 1346, 290],
    width: 975,
    alt: 'لوحة التطبيق Dashboard: «App customization and requirements» وأولها Customize the Manage messaging & content on Instagram use case',
  },
  {
    set: 'meta',
    name: 'config-menu',
    from: 'meta-12.png',
    marks: [{ box: [30, 132, 345, 50], n: '2' }],
    crop: [14, 20, 376, 300],
    alt: 'قائمة حالة الاستخدام Instagram API: Permissions and features وAPI setup with Unified login وAPI setup with Facebook login',
  },
  {
    set: 'meta',
    name: 'config-page',
    from: 'meta-12.png',
    marks: [{ box: [456, 709, 244, 45], n: '3' }],
    crop: [435, 295, 1190, 470],
    width: 975,
    alt: 'قسم «1. Configure your app»: «No compatible configurations found» وجدول الإعداد وزر Create new configuration',
  },
  {
    set: 'meta',
    name: 'config-confirm',
    from: 'meta-13.png',
    marks: [{ box: [44, 566, 300, 34] }, { box: [531, 725, 214, 45], n: '4' }],
    crop: [14, 230, 738, 560],
    alt: 'نافذة Confirm login configuration details: قائمة الصلاحيات وفيها instagram_content_publish وزر Create from template',
  },
  {
    set: 'meta',
    name: 'config-done',
    from: 'meta-14.png',
    blur: [[186, 128, 162, 24]],
    marks: [{ box: [30, 90, 1146, 75], n: '5' }],
    crop: [10, 80, 1182, 105],
    width: 975,
    alt: 'الإعداد Instagram API (unified login) وعليه «Instagram Login Compatible» و«Selected» ومعرّف الإعداد Configuration ID',
  },
  {
    set: 'meta',
    name: 'redirect-url',
    from: 'meta-14.png',
    marks: [
      { box: [30, 353, 1058, 45], n: '2' },
      { box: [1097, 353, 79, 45], n: '3' },
    ],
    crop: [10, 255, 1182, 170],
    width: 975,
    alt: 'قسم Redirect URL: حقل Register a new redirect URL وزر Save',
  },
  {
    set: 'meta',
    name: 'skip-webhooks',
    from: 'meta-15.png',
    marks: [
      { box: [32, 95, 142, 45], n: 'x', color: RED },
      { box: [32, 287, 1145, 44], n: 'x', color: RED },
      { box: [32, 371, 1145, 44], n: 'x', color: RED },
    ],
    crop: [10, 10, 1186, 580],
    width: 975,
    alt: 'قسما «2. Generate access tokens» و«3. Configure webhooks»: زر Add account وحقلا Callback URL وVerify token',
  },
  {
    set: 'meta',
    name: 'skip-review',
    from: 'meta-16.png',
    marks: [{ box: [34, 209, 176, 45], n: 'x', color: RED }],
    crop: [13, 8, 1190, 270],
    width: 975,
    alt: 'قسم «4. Complete App Review»: عبارة أن لك تخطّيه إن كنت تبني لحسابات تملكها فقط وزر Go to app review',
  },
  {
    set: 'meta',
    name: 'redirect-saved',
    from: 'meta-17.png',
    crop: [10, 250, 1182, 310],
    width: 975,
    alt: 'قسم Redirect URL بعد الحفظ: العنوان في القائمة المنسدلة ورسالة «Redirect URL saved»',
  },
  {
    set: 'meta',
    name: 'basic-menu',
    from: 'meta-18.png',
    marks: [{ box: [9, 488, 357, 42], n: '1' }],
    crop: [0, 430, 376, 140],
    alt: 'قائمة التطبيق: App settings مفتوحة وتحتها Basic وAdvanced',
  },
  {
    set: 'meta',
    name: 'basic-keys',
    from: 'meta-18.png',
    blur: [[497, 98, 250, 24]],
    marks: [
      { box: [485, 88, 634, 45], n: '2' },
      { box: [1687, 93, 85, 45], n: '3' },
    ],
    crop: [475, 55, 1310, 100],
    width: 975,
    alt: 'صفحة App settings ثم Basic: حقل App ID وحقل App secret المخفي وزر Show',
  },
  {
    set: 'meta',
    name: 'config-id',
    from: 'meta-19.png',
    blur: [[596, 209, 158, 22]],
    marks: [{ box: [760, 203, 32, 32], n: '4' }],
    crop: [443, 172, 650, 75],
    alt: 'الإعداد Instagram API (unified login): سطر Configuration ID وبجانبه أيقونة النسخ',
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
  5: (x, y, ink) => line(`M${x + 4} ${y - 8}L${x - 4} ${y - 8}L${x - 5} ${y - 1}C${x - 1} ${y - 4} ${x + 6} ${y - 2} ${x + 6} ${y + 4}C${x + 6} ${y + 11} ${x - 3} ${y + 12} ${x - 6} ${y + 7}`, ink),
  2: (x, y, ink) => line(`M${x - 5} ${y - 4}C${x - 5} ${y - 11} ${x + 5} ${y - 11} ${x + 5} ${y - 4}C${x + 5} ${y} ${x - 5} ${y + 3} ${x - 5} ${y + 8}L${x + 5} ${y + 8}`, ink),
};

/** The page colour, sampled from a flat spot of the same picture. */
async function colourAt(buf, info, x, y) {
  const px = await sharp(buf, { raw: info }).extract({ left: x, top: y, width: 1, height: 1 }).raw().toBuffer();
  return { r: px[0], g: px[1], b: px[2] };
}

for (const s of SHOTS.filter((x) => (x.set ?? 'google') === set)) {
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
  const cropped = sharp(whole.data, { raw: whole.info }).extract({ left, top, width, height });
  const scaled = s.width ? cropped.resize({ width: s.width, kernel: 'lanczos3' }) : cropped;
  const written = await scaled
    .png({ palette: true, quality: 92, effort: 10, dither: 0.4, compressionLevel: 9 })
    .toFile(file);
  console.log(`${s.name}.png  ${written.width} x ${written.height}  ${written.size} bytes`);
}

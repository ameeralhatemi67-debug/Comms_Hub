// Readiness audit, order step 5: the post preview's rules. Pure; the data half (the limits in the
// registry and platform_save) is supabase/tests/platform_limits_rules.sql.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  BUILTIN_LIMITS,
  TEMPLATE_LIMITS,
  checkCopy,
  copyStats,
  countedChars,
  foldOf,
  headline,
  layoutOf,
  limitsOf,
  limitsToAccepts,
  splitTitle,
} from '../src/lib/platforms/limits.ts';
import { checkFor, copyFor, mediaCounts } from '../src/lib/platforms/copies.ts';
import { BUILTIN_PLATFORMS } from '../src/lib/work/rules.ts';
import { PLATFORM_TEMPLATES, platformError } from '../src/lib/platforms/info.ts';

const sql = readFileSync(new URL('../supabase/migrations/20261015100000_platform_limits.sql', import.meta.url), 'utf8');

test('the limits the migration seeds equal the ones the site falls back on', () => {
  const rows = [...sql.matchAll(/update public\.platforms set accepts = accepts \|\| '(\{.*?\})'::jsonb where key = '(\w+)';/g)];
  assert.equal(rows.length, 4);
  for (const m of rows) {
    const seeded = JSON.parse(m[1]);
    const expected = limitsToAccepts(BUILTIN_LIMITS[m[2]]);
    assert.deepEqual(seeded, expected, m[2]);
  }
  for (const p of BUILTIN_PLATFORMS.filter((x) => x.kind === 'social')) {
    assert.equal(limitsOf(p.accepts).max_chars, BUILTIN_LIMITS[p.key]?.max_chars, p.key);
  }
});

test('every number states its source, and the ones read from official pages carry the day', () => {
  for (const [k, l] of Object.entries({ ...BUILTIN_LIMITS, ...TEMPLATE_LIMITS })) {
    assert.ok(l.note && l.note.length > 10 && l.note.length <= 300, `${k} note`);
    const numbers = Object.keys(limitsToAccepts(l)).filter((x) => x.startsWith('max_') || x.endsWith('_max') || x.endsWith('_bytes') || x === 'url_chars');
    if (numbers.length) assert.match(l.checked ?? '', /^\d{4}-\d{2}-\d{2}$/, `${k} checked`);
  }
  // Facebook's documents state no text limit, so none is invented.
  assert.equal(limitsOf(limitsToAccepts(TEMPLATE_LIMITS.facebook)).max_chars, undefined);
});

test('the templates carry the limits and the video-only rule the registry will store', () => {
  const tiktok = PLATFORM_TEMPLATES.find((t) => t.key === 'tiktok');
  assert.equal(tiktok.video_only, true);
  assert.equal(tiktok.limits.max_chars, 2200);
  for (const t of PLATFORM_TEMPLATES) assert.ok(t.limits, t.key);
});

test('limitsOf ignores anything that is not a sane whole number', () => {
  const l = limitsOf({ max_chars: '280', max_hashtags: -1, max_images: 2.5, max_videos: 1, max_media: 5_000_000, video_only: 'yes', limits_checked: 'yesterday' });
  assert.deepEqual(l, { max_videos: 1 });
  assert.deepEqual(limitsOf(null), {});
});

test('counting: code points, hashtags, links and utf-8 bytes', () => {
  const s = copyStats('مرحباً #اليوم_الوطني #saudi https://x.test/a @name');
  assert.equal(s.hashtags, 2);
  assert.equal(s.links, 1);
  assert.equal(s.mentions, 1);
  assert.equal(copyStats('ab').bytes, 2);
  assert.equal(copyStats('عب').bytes, 4);
  assert.equal(copyStats('').lines, 0);
  assert.equal(countedChars('see https://example.test/very/long/path/that/goes/on', { url_chars: 23 }), 'see '.length + 23);
});

test('X: 280 characters, a link counts 23, four images or one video', () => {
  const x = limitsOf(limitsToAccepts(BUILTIN_LIMITS.x));
  assert.equal(checkCopy(x, { text: 'ا'.repeat(280), images: 0, videos: 0 }).ok, true);
  const over = checkCopy(x, { text: 'ا'.repeat(281), images: 0, videos: 0 });
  assert.equal(over.ok, false);
  assert.equal(over.issues[0].code, 'TOO_LONG');
  assert.match(headline(over), /281/);
  assert.equal(checkCopy(x, { text: 'a https://example.test/' + 'p'.repeat(300), images: 0, videos: 0 }).ok, true);
  assert.equal(checkCopy(x, { text: 'a', images: 5, videos: 0 }).issues.some((i) => i.code === 'TOO_MANY_IMAGES'), true);
  assert.equal(checkCopy(x, { text: 'a', images: 1, videos: 1 }).issues.some((i) => i.code === 'MIXED_MEDIA'), true);
});

test('near a limit warns, over it stops, and the counters say how far', () => {
  const x = limitsOf({ max_chars: 100 });
  const near = checkCopy(x, { text: 'a'.repeat(95), images: 0, videos: 0 });
  assert.equal(near.ok, true);
  assert.equal(near.issues[0].code, 'NEAR_LIMIT');
  assert.equal(near.counters[0].level, 'near');
  assert.equal(checkCopy(x, { text: 'a'.repeat(101), images: 0, videos: 0 }).counters[0].level, 'over');
});

test('Instagram: ten items in all, thirty hashtags, a fold near 125 characters', () => {
  const l = limitsOf(limitsToAccepts(BUILTIN_LIMITS.instagram));
  assert.equal(checkCopy(l, { text: 't', images: 6, videos: 5 }).issues.some((i) => i.code === 'TOO_MANY_MEDIA'), true);
  const tags = Array.from({ length: 31 }, (_, i) => `#وسم${i}`).join(' ');
  assert.equal(checkCopy(l, { text: tags, images: 1, videos: 0 }).issues.some((i) => i.code === 'TOO_MANY_HASHTAGS'), true);
  const long = 'كلمة '.repeat(60);
  const f = foldOf(long, l.fold_chars);
  assert.ok([...f.shown].length <= 125 && f.hidden.length > 0);
  assert.equal(f.shown + f.hidden, long);
  assert.equal(layoutOf('instagram'), 'square');
  assert.equal(layoutOf('something_new'), 'feed');
});

test('YouTube: the first line is the title (100) and the rest the description (5000 bytes)', () => {
  const l = limitsOf(limitsToAccepts(BUILTIN_LIMITS.youtube));
  assert.deepEqual(splitTitle('  عنوان\n\nوصف طويل'), { title: 'عنوان', description: 'وصف طويل' });
  assert.equal(checkCopy(l, { text: 'عنوان\nوصف', images: 0, videos: 1 }).ok, true);
  const longTitle = checkCopy(l, { text: 'ع'.repeat(101) + '\nوصف', images: 0, videos: 1 });
  assert.equal(longTitle.issues.some((i) => i.code === 'TITLE_TOO_LONG'), true);
  // Arabic letters are two bytes each: 2501 of them overflow 5000 bytes though they are under 5000 characters.
  const desc = checkCopy(l, { text: 'عنوان\n' + 'ع'.repeat(2501), images: 0, videos: 1 });
  assert.equal(desc.issues.some((i) => i.code === 'DESCRIPTION_TOO_LONG'), true);
  assert.equal(checkCopy(l, { text: 'عنوان\n' + 'ع'.repeat(2500), images: 0, videos: 1 }).ok, true);
});

test('video-only: stops without a file, only warns for a work of the video type', () => {
  const l = { video_only: true };
  assert.equal(checkCopy(l, { text: 'a', images: 1, videos: 0 }).issues[0].code, 'VIDEO_REQUIRED');
  const t = checkCopy(l, { text: 'a', images: 0, videos: 0, typeVideo: true });
  assert.equal(t.ok, true);
  assert.equal(t.issues[0].code, 'VIDEO_FILE_MISSING');
});

test('an empty copy stops, text-free media only warns', () => {
  assert.equal(checkCopy({}, { text: '  ', images: 0, videos: 0 }).issues[0].code, 'EMPTY');
  const c = checkCopy({}, { text: '', images: 1, videos: 0 });
  assert.equal(c.ok, true);
  assert.equal(c.issues[0].code, 'NO_TEXT');
});

test('a platform copy is the latest non-blank copy, otherwise the main text, with the files by kind', () => {
  const src = {
    type: 'post',
    texts: [{ n: 1, body: 'قديم' }, { n: 2, body: 'النص الأساسي' }],
    variants: [{ platform: 'x', n: 1, body: 'أول' }, { platform: 'x', n: 2, body: 'ثانٍ' }, { platform: 'linkedin', n: 1, body: '   ' }],
    assets: [{ file: { kind: 'image' } }, { file: { kind: 'video' } }, { file: null }, { file: { kind: 'document' } }],
  };
  assert.deepEqual(mediaCounts(src.assets), { images: 1, videos: 1, hidden: 1 });
  const x = copyFor(src, 'x');
  assert.equal(x.text, 'ثانٍ');
  assert.equal(x.own, true);
  const li = copyFor(src, 'linkedin');
  assert.equal(li.text, 'النص الأساسي');
  assert.equal(li.own, false);
  const r = checkFor({ max_chars: 3 }, li);
  assert.equal(r.ok, false);
});

test('the registry words for the new codes exist', () => {
  assert.match(platformError('LIMIT_INVALID'), /عدد صحيح/);
  assert.match(platformError('LIMIT_NOTE_INVALID'), /300/);
});

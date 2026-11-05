// Thumbnails of stored files (MVP_draft.md section 77, Director_Notes_Plan.md N-4): the shared rules, Drive's own thumbnail as
// the server reads it, the database's limits held equal to the code's, the route's rules, and the places that show a file.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DRIVE_SIZES,
  FRAME_MAX_SECONDS,
  NONE_RETRY_MS,
  THUMB_EDGE,
  THUMB_MAX_BYTES,
  THUMB_MIN_BYTES,
  THUMB_TYPES,
  driveThumbAt,
  drawable,
  extOf,
  fitSize,
  frameTime,
  kindOfMime,
  sniffImage,
  thumbFits,
  thumbUrl,
} from '../src/lib/media/thumbs.ts';
import { createDrive } from '../src/lib/drive/google.ts';
import { BACKUP_EXCLUDED } from '../src/lib/integrations/rules.ts';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const SQL = read('supabase/migrations/20261105140000_file_thumbs.sql');
const ROUTE = read('src/app/api/thumb/[kind]/[id]/route.ts');
const MAKER = read('src/lib/media/thumb-maker.ts');

const webp = (n = 200) => new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, ...new Array(n).fill(0)]);
const jpeg = (n = 200) => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new Array(n).fill(0)]);
const png = (n = 200) => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new Array(n).fill(0)]);

test('the size a picture is drawn at: its longest side 320, never larger than it is', () => {
  assert.deepEqual(fitSize(1920, 1080), { w: THUMB_EDGE, h: 180 });
  assert.deepEqual(fitSize(1080, 1920), { w: 180, h: THUMB_EDGE });
  assert.deepEqual(fitSize(200, 100), { w: 200, h: 100 }, 'a small picture is not enlarged');
  assert.deepEqual(fitSize(4000, 1), { w: 320, h: 1 }, 'never zero');
  assert.equal(fitSize(0, 100), null);
  assert.equal(fitSize(NaN, 100), null);
  assert.deepEqual(fitSize(1920, 1080, 160), { w: 160, h: 90 });
});

test('a video\'s picture is a tenth of the way in, never later than three seconds', () => {
  assert.equal(frameTime(10), 1);
  assert.equal(frameTime(600), FRAME_MAX_SECONDS);
  assert.equal(frameTime(0.5), 0.05);
  assert.equal(frameTime(Infinity), 0, 'a stream with no length: its first frame');
  assert.equal(frameTime(NaN), 0);
  assert.ok(drawable('image/jpeg') && drawable('image/png') && drawable('video/mp4') && drawable('video/quicktime'));
  assert.ok(!drawable('application/pdf') && !drawable('audio/mpeg') && !drawable('image/svg+xml'), 'an SVG is never drawn: it may hold anything');
});

test('a picture is what its first bytes say, the same test the database makes', () => {
  assert.equal(sniffImage(webp()), 'image/webp');
  assert.equal(sniffImage(jpeg()), 'image/jpeg');
  assert.equal(sniffImage(png()), 'image/png');
  assert.equal(sniffImage(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>')), null);
  assert.equal(sniffImage(new Uint8Array([0x47, 0x49, 0x46, 0x38])), null, 'GIF is not kept');
  assert.ok(thumbFits(webp(), 'image/webp'));
  assert.ok(!thumbFits(webp(), 'image/jpeg'), 'the type must match the bytes');
  assert.ok(!thumbFits(webp(10), 'image/webp'), 'too small to be a picture');
  assert.ok(!thumbFits(webp(THUMB_MAX_BYTES), 'image/webp'), 'over 48 KB');
  assert.ok(thumbFits(webp(THUMB_MAX_BYTES - 12), 'image/webp'), 'exactly 48 KB');
});

test('the database holds the same limits and types, and checks the same first bytes', () => {
  assert.ok(SQL.includes(`octet_length(data) between ${THUMB_MIN_BYTES} and ${THUMB_MAX_BYTES}`), 'size in the table');
  assert.ok(SQL.includes(`octet_length(p_data) between ${THUMB_MIN_BYTES} and ${THUMB_MAX_BYTES}`), 'size when saved');
  assert.ok(SQL.includes(`mime in (${THUMB_TYPES.map((t) => `'${t}'`).join(',')})`), 'the three types');
  assert.ok(SQL.includes("'\\x52494646'::bytea") && SQL.includes("'\\x57454250'::bytea"), 'WebP by RIFF and WEBP');
  assert.ok(SQL.includes("'\\xffd8ff'::bytea"), 'JPEG');
  assert.ok(SQL.includes("'\\x89504e470d0a1a0a'::bytea"), 'PNG');
  // Every server step needs the key; the browser's saves only the uploader's.
  const keep = SQL.slice(SQL.indexOf('create function public.thumb_keep(')).split('\n$$;')[0];
  assert.match(keep, /mail_key_ok\(p_key\)/);
  assert.match(keep, /thumb_may_see\(p_asset, p_mail_file\)/);
  assert.match(keep, /if found and t\.state = 'ready' then return 'already'/, 'the server never replaces a picture');
  const save = SQL.slice(SQL.indexOf('create function public.thumb_save(')).split('\n$$;')[0];
  assert.match(save, /v\.uploaded_by = me/);
  assert.match(save, /f\.uploaded_by = me/);
  assert.match(SQL, /revoke all on public\.file_thumbs from public, anon, authenticated/);
  assert.match(SQL, /on delete cascade,\n  version/, 'a library thumbnail goes with its file');
  assert.match(SQL, /mail_file_id uuid references public\.mail_files\(id\) on delete cascade/, 'and a mail file\'s');
});

test('Drive\'s own thumbnail: only Google\'s picture hosts, at the size asked for', () => {
  assert.equal(driveThumbAt('https://lh3.googleusercontent.com/drive-storage/AJQWtBN=s220', 320), 'https://lh3.googleusercontent.com/drive-storage/AJQWtBN=s320');
  assert.equal(driveThumbAt('https://lh3.googleusercontent.com/abc', 320), 'https://lh3.googleusercontent.com/abc', 'a link with no size stays as it is');
  assert.equal(driveThumbAt('https://drive.google.com/thumbnail?id=x=s220', 200), 'https://drive.google.com/thumbnail?id=x=s200');
  assert.equal(driveThumbAt('http://lh3.googleusercontent.com/a=s220', 320), null, 'never plain http');
  assert.equal(driveThumbAt('https://googleusercontent.com.evil.example/a=s220', 320), null);
  assert.equal(driveThumbAt('https://evil.example/lh3.googleusercontent.com=s220', 320), null);
  assert.equal(driveThumbAt('not a link', 320), null);
  assert.equal(driveThumbAt(42, 320), null);
  assert.deepEqual([...DRIVE_SIZES], [THUMB_EDGE, 200]);
});

const env = { clientId: 'id', clientSecret: 'secret', refreshToken: 'refresh' };
const json = (b, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });
function fakeDrive(answer) {
  const calls = [];
  const fetch = async (url, init = {}) => {
    calls.push({ url: String(url), auth: new Headers(init.headers).get('authorization') });
    if (String(url).includes('oauth2.googleapis.com')) return json({ access_token: 'tok', expires_in: 3600 });
    return answer(String(url));
  };
  return { drive: createDrive({ env, fetch }), calls };
}
const bytesOf = (b, type) => new Response(b, { status: 200, headers: { 'content-type': type } });

test('the server reads Drive\'s thumbnail with the token, and keeps only a picture that fits', async () => {
  const link = 'https://lh3.googleusercontent.com/drive-storage/xyz=s220';
  const a = fakeDrive((u) => (u.includes('/drive/v3/files/') ? json({ hasThumbnail: true, thumbnailLink: link }) : bytesOf(jpeg(), 'image/jpeg')));
  const got = await a.drive.thumbnail('file-1');
  assert.equal(got.mime, 'image/jpeg');
  assert.equal(got.bytes.length, 204);
  const meta = a.calls.find((c) => c.url.includes('/drive/v3/files/file-1'));
  assert.ok(meta.url.includes(encodeURIComponent('hasThumbnail,thumbnailLink')));
  const pic = a.calls.find((c) => c.url.startsWith('https://lh3.'));
  assert.equal(pic.url, 'https://lh3.googleusercontent.com/drive-storage/xyz=s320', 'asked at 320 first');
  assert.equal(pic.auth, 'Bearer tok', 'a private file\'s link needs the token');

  // Too large at 320: the smaller size.
  const b = fakeDrive((u) => (u.includes('/drive/v3/files/') ? json({ thumbnailLink: link }) : u.endsWith('=s320') ? bytesOf(jpeg(THUMB_MAX_BYTES), 'image/jpeg') : bytesOf(png(), 'image/png')));
  assert.equal((await b.drive.thumbnail('f')).mime, 'image/png');
  assert.deepEqual(b.calls.filter((c) => c.url.startsWith('https://lh3.')).map((c) => c.url.slice(-5)), ['=s320', '=s200']);

  // No picture, a picture that is not one, a host that is not Google's: nothing.
  assert.equal(await fakeDrive(() => json({ hasThumbnail: false })).drive.thumbnail('f'), null);
  assert.equal(await fakeDrive((u) => (u.includes('/drive/v3/') ? json({ thumbnailLink: link }) : bytesOf(new TextEncoder().encode('<html>no</html>'.repeat(10)), 'text/html'))).drive.thumbnail('f'), null);
  const evil = fakeDrive((u) => (u.includes('/drive/v3/') ? json({ thumbnailLink: 'https://evil.example/x=s220' }) : bytesOf(jpeg(), 'image/jpeg')));
  assert.equal(await evil.drive.thumbnail('f'), null);
  assert.ok(!evil.calls.some((c) => c.url.startsWith('https://evil.')), 'never fetched');
  // A file Drive no longer holds says so, for the route to keep `none`.
  await assert.rejects(fakeDrive(() => json({}, 404)).drive.thumbnail('gone'), (e) => e.status === 404);
});

test('addresses, tiles and kinds', () => {
  assert.equal(thumbUrl({ asset: 'a1', version: 3 }), '/api/thumb/media/a1?v=3');
  assert.equal(thumbUrl({ mailFile: 'm1' }), '/api/thumb/mail/m1');
  assert.equal(thumbUrl({ asset: 'a/../b', version: 1 }), '/api/thumb/media/a%2F..%2Fb?v=1');
  assert.equal(extOf('تقرير.final.PDF'), 'PDF');
  assert.equal(extOf('بلا امتداد'), '');
  assert.equal(extOf('archive.tar.gzipped'), '', 'longer than five letters is not shown');
  assert.equal(extOf(null), '');
  assert.equal(kindOfMime('image/heic'), 'image');
  assert.equal(kindOfMime('video/quicktime'), 'video');
  assert.equal(kindOfMime('audio/ogg'), 'audio');
  assert.equal(kindOfMime('application/pdf'), 'document');
  assert.equal(kindOfMime('application/vnd.openxmlformats-officedocument.wordprocessingml.document'), 'document');
  assert.equal(kindOfMime('application/zip'), 'other');
  assert.equal(kindOfMime(undefined), 'other');
  assert.equal(NONE_RETRY_MS, 864e5);
});

test('the route: the database decides who sees, the file is never served, and nothing is logged', () => {
  assert.match(ROUTE, /await guard\(request\)/, 'signed in, with no page grant asked');
  assert.ok(!/page: '/.test(ROUTE));
  assert.match(ROUTE, /'X-Content-Type-Options': 'nosniff'/);
  assert.match(ROUTE, /sandbox; default-src 'none'/);
  assert.match(ROUTE, /max-age=31536000, immutable/, 'a version\'s picture never changes');
  assert.match(ROUTE, /rpc\('thumb_keep', \{\s*p_key: key/);
  assert.ok(!/openStored|\.open\(|alt=media/.test(ROUTE), 'never the file itself');
  assert.ok(!/console\./.test(ROUTE + MAKER));
  assert.ok(!/thumbnailLink/.test(ROUTE), 'Drive\'s link never leaves the Drive client');
});

test('uploads draw the picture while the file travels, and save it once the file is registered', () => {
  const lib = read('src/lib/media/upload.ts');
  const mail = read('src/lib/mail/upload.ts');
  for (const [src, done] of [
    [lib.slice(lib.indexOf('export async function uploadNewAsset')), "keepThumb({ asset: id, version: 1 }, thumb)"],
    [lib.slice(lib.indexOf('export async function uploadNewVersion')), 'keepThumb({ asset: assetId, version }, thumb)'],
    [mail, 'keepThumb({ mailFile: j.id }, thumb)'],
  ]) {
    assert.ok(src.indexOf('makeThumb(file)') < src.indexOf('sendToDrive('), 'drawn before the bytes go');
    assert.ok(src.indexOf(done) > src.indexOf('if (!done.ok)'), 'saved after the file is registered');
  }
  assert.match(MAKER, /rpc\('thumb_save'/);
  assert.match(MAKER, /catch \{\n\s*return false;/, 'a thumbnail never fails an upload');
});

test('a file is never a name alone: the places that list files show its picture', () => {
  for (const f of [
    'src/components/media/parts.tsx',
    'src/components/media/asset-page.tsx',
    'src/components/work/parts.tsx',
    'src/components/work/create.tsx',
    'src/components/work/item.tsx',
    'src/components/work/review.tsx',
    'src/components/work/post-preview.tsx',
    'src/components/mail/thread.tsx',
    'src/components/mail/composer.tsx',
    'src/components/chat/chat-tab.tsx',
    'src/components/studio/bin.tsx',
    'src/components/work/picked-thumb.tsx',
  ])
    assert.match(read(f), /<FileThumb\b/, f);
  for (const f of ['src/components/work/youtube-test.tsx', 'src/components/work/instagram-test.tsx', 'src/components/work/facebook-test.tsx'])
    assert.match(read(f), /<PickedThumb\b/, f);
  // A library card loads its thumbnail, never the whole original.
  const thumb = read('src/components/media/parts.tsx');
  const card = thumb.slice(thumb.indexOf('export function Thumb'), thumb.indexOf('export function StageChip'));
  assert.ok(!/<video src=\{src\} muted/.test(card), 'no video element on a card');
  assert.match(card, /poster=\{thumbUrl\(of\)\}/, 'the large video has its picture as a poster');
  assert.match(read('src/components/work/review-player.tsx'), /poster=\{kind === 'video' \? thumbUrl/);
});

test('a thumbnail is said to be left out of a backup, like every derivative', () => {
  assert.ok(BACKUP_EXCLUDED.some((x) => x.what.includes('الصور المصغّرة للملفات')));
  assert.ok(!read('supabase/migrations/20261015150000_backups.sql').includes('file_thumbs'));
});

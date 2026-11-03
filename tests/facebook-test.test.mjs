// «تجربة النشر» on a Facebook Page (MVP_draft.md section 73): Meta's calls against a fake Graph API, the rules the page and the
// routes share, the same limits in the migration, the silent check's order, and what the page must never hold. The database
// half is supabase/tests/platform_tests_facebook_rules.sql; the panel is clicked through by qa/facebook-test-flow.cjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FB_UPLOAD_PREFIX, fbDelete, fbFeedPost, fbPhoto, fbPostInfo, fbReason, fbReelFinish, fbReelStart, fbReelStatus, fbReelUpload, fbVideoInfo } from '../src/lib/platforms/facebook.ts';
import {
  FB_MESSAGE_MAX,
  FB_PHOTO_MAX,
  FB_SILENT_DAYS,
  FB_VIDEO_MAX,
  TEST_ERROR_AR,
  fbPageUrl,
  fbProblem,
  fbScheduledUrl,
  fbTitle,
} from '../src/lib/platforms/test-rules.ts';
import { CONN_ERROR_AR } from '../src/lib/platforms/info.ts';
import { HOLD } from '../src/lib/kit/hold-reasons.ts';
import { GRAPH_VERSION } from '../src/lib/platforms/oauth.ts';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const SQL = read('supabase/migrations/20261103200000_platform_tests_facebook.sql');
const PAGE = read('src/components/work/facebook-test.tsx');
const SERVER = read('src/lib/platforms/test-facebook.ts');
const FB = read('src/lib/platforms/facebook.ts');
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;
const UP = `${FB_UPLOAD_PREFIX}v26.0/1234567890123456`;

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
function fake(handler) {
  const seen = [];
  const f = async (url, init = {}) => {
    seen.push({ url: String(url), method: init.method ?? 'GET', headers: new Headers(init.headers), body: init.body });
    return handler(String(url), init);
  };
  f.seen = seen;
  return f;
}
const err = (status, code, sub) => json({ error: { message: 'x', code, ...(sub ? { error_subcode: sub } : {}) } }, status);
const params = (body) => Object.fromEntries(new URLSearchParams(body));

test('a feed post, and the silent check\'s scheduled one, with the token only in a header', async () => {
  const f = fake(() => json({ id: '102345678901234_987654321098765' }));
  assert.deepEqual(await fbFeedPost(f, { token: 'tok', page: '102345678901234', message: 'نص', link: 'https://example.com' }), { id: '102345678901234_987654321098765' });
  assert.equal(f.seen[0].url, `${GRAPH}/102345678901234/feed`);
  assert.equal(f.seen[0].headers.get('authorization'), 'OAuth tok');
  assert.deepEqual(params(f.seen[0].body), { message: 'نص', link: 'https://example.com' });
  assert.ok(!f.seen[0].url.includes('tok') && !String(f.seen[0].body).includes('tok'));

  const s = fake(() => json({ id: '102345678901234_1' }));
  await fbFeedPost(s, { token: 't', page: '102345678901234', message: 'فحص', scheduledAt: 1795000000 });
  assert.deepEqual(params(s.seen[0].body), { message: 'فحص', published: 'false', scheduled_publish_time: '1795000000' });

  const at = async (res) => (await fbFeedPost(fake(() => res), { token: 't', page: '1', message: 'x' })).error;
  assert.equal(await at(err(401, 190)), 'TOKEN_REFUSED');
  assert.equal(await at(err(403, 200)), 'PAGE_REFUSED');
  assert.equal(await at(err(403, 10)), 'SCOPE_MISSING');
  assert.equal(await at(err(400, 368)), 'SPAM_SUSPECTED');
  assert.equal(await at(err(400, 4)), 'RATE_LIMIT');
  assert.equal(await at(err(400, 1609005)), 'LINK_REFUSED');
  assert.equal(await at(json({}, 503)), 'PLATFORM_DOWN');
  assert.equal(await at(json({ id: 'not an id' })), 'PLATFORM_ERROR');
  assert.equal((await fbFeedPost(fake(() => Promise.reject(new Error('down'))), { token: 't', page: '1', message: 'x' })).error, 'UNREACHABLE');
  assert.equal(fbReason(400, { error: { code: 100 } }), 'MEDIA_REFUSED');
});

test('a post read back: its Page, whether it is published, when it would be, and its address', async () => {
  const f = fake(() => json({ id: '1_2', from: { id: '102345678901234' }, is_published: false, scheduled_publish_time: 1795000000, permalink_url: 'https://www.facebook.com/102345678901234/posts/2' }));
  assert.deepEqual(await fbPostInfo(f, { token: 't', id: '1_2' }), { id: '1_2', page: '102345678901234', published: false, scheduledAt: 1795000000, link: 'https://www.facebook.com/102345678901234/posts/2' });
  assert.equal(f.seen[0].url, `${GRAPH}/1_2?fields=id,from,is_published,scheduled_publish_time,permalink_url`);
  const odd = await fbPostInfo(fake(() => json({ id: '1_2', permalink_url: 'https://evil.example/p' })), { token: 't', id: '1_2' });
  assert.equal(odd.link, null, 'a link that is not Facebook\'s is not kept');
  assert.equal(odd.published, null);
});

test('a photo is sent as a file with its words, and both ids come back', async () => {
  const f = fake(() => json({ id: '555555555555555', post_id: '102345678901234_666666666666666' }));
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
  const r = await fbPhoto(f, { token: 'tok', page: '102345678901234', jpeg, caption: 'شرح', alt: 'وصف' });
  assert.deepEqual(r, { photo: '555555555555555', post: '102345678901234_666666666666666' });
  assert.equal(f.seen[0].url, `${GRAPH}/102345678901234/photos`);
  const body = f.seen[0].body;
  assert.ok(body instanceof FormData);
  assert.equal(body.get('caption'), 'شرح');
  assert.equal(body.get('alt_text_custom'), 'وصف');
  assert.equal(body.get('published'), 'true');
  assert.equal(body.get('source').size, jpeg.byteLength);
  assert.equal(body.get('source').type, 'image/jpeg');
  assert.ok(!body.has('access_token'));
  assert.deepEqual(await fbPhoto(fake(() => err(400, 100)), { token: 't', page: '1', jpeg, caption: '', alt: '' }), { error: 'PHOTO_REFUSED' });
});

test('a Reel: started, fetched by Meta from the site, its status, finished, and read back', async () => {
  const start = fake(() => json({ video_id: '1234567890123456', upload_url: UP }));
  assert.deepEqual(await fbReelStart(start, { token: 't', page: '102345678901234' }), { video: '1234567890123456', upload: UP });
  assert.deepEqual(params(start.seen[0].body), { upload_phase: 'start' });
  assert.deepEqual(await fbReelStart(fake(() => json({ video_id: '1234567890123456', upload_url: 'https://evil.example/up' })), { token: 't', page: '1' }), { error: 'PLATFORM_ERROR' });

  const up = fake(() => json({ success: true }));
  assert.deepEqual(await fbReelUpload(up, { token: 'tok', upload: UP, fileUrl: 'https://site.example/api/platforms/test/file/abc' }), { ok: true });
  assert.equal(up.seen[0].url, UP);
  assert.equal(up.seen[0].headers.get('file_url'), 'https://site.example/api/platforms/test/file/abc');
  assert.equal(up.seen[0].headers.get('authorization'), 'OAuth tok');
  const never = fake(() => assert.fail('an upload goes nowhere but Meta'));
  assert.deepEqual(await fbReelUpload(never, { token: 't', upload: 'https://evil.example/u', fileUrl: 'x' }), { error: 'PLATFORM_ERROR' });

  const st = async (status) => fbReelStatus(fake(() => json({ status })), { token: 't', video: '1' });
  assert.deepEqual(await st({ video_status: 'processing', uploading_phase: { status: 'in_progress' } }), { state: 'uploading' });
  assert.deepEqual(await st({ video_status: 'processing', uploading_phase: { status: 'complete' }, publishing_phase: { status: 'not_started' } }), { state: 'uploaded' });
  assert.deepEqual(await st({ uploading_phase: { status: 'complete' }, publishing_phase: { status: 'in_progress' } }), { state: 'publishing' });
  assert.deepEqual(await st({ video_status: 'ready', uploading_phase: { status: 'complete' }, publishing_phase: { status: 'complete' } }), { state: 'published' });
  assert.deepEqual(await st({ uploading_phase: { status: 'error' } }), { error: 'MEDIA_FETCH_FAILED' });
  assert.deepEqual(await st({ video_status: 'error', uploading_phase: { status: 'complete' } }), { error: 'PROCESSING_FAILED' });

  const fin = fake(() => json({ success: true }));
  assert.deepEqual(await fbReelFinish(fin, { token: 't', page: '102345678901234', video: '1234567890123456', description: 'وصف' }), { ok: true });
  assert.deepEqual(params(fin.seen[0].body), { upload_phase: 'finish', video_id: '1234567890123456', video_state: 'PUBLISHED', description: 'وصف' });
  assert.deepEqual(await fbReelFinish(fake(() => err(400, 4)), { token: 't', page: '1', video: '1', description: '' }), { error: 'REEL_LIMIT' });

  const info = await fbVideoInfo(fake(() => json({ from: { id: '102345678901234' }, permalink_url: '/reel/1234567890123456' })), { token: 't', video: '1' });
  assert.deepEqual(info, { page: '102345678901234', link: 'https://www.facebook.com/reel/1234567890123456' });
});

test('a delete, a post already gone, and a refusal', async () => {
  const f = fake(() => json({ success: true }));
  assert.deepEqual(await fbDelete(f, { token: 't', id: '1_2' }), { gone: false });
  assert.equal(f.seen[0].method, 'DELETE');
  assert.equal(f.seen[0].url, `${GRAPH}/1_2`);
  assert.deepEqual(await fbDelete(fake(() => err(400, 100, 33)), { token: 't', id: '1_2' }), { gone: true });
  assert.deepEqual(await fbDelete(fake(() => err(403, 200)), { token: 't', id: '1_2' }), { error: 'PAGE_REFUSED' });
});

test('what is checked before a Page test is sent', () => {
  assert.equal(fbProblem({ kind: 'fb_silent', message: '', link: '' }), null);
  assert.match(fbProblem({ kind: 'fb_text', message: '  ', link: '' }), /نص/);
  assert.equal(fbProblem({ kind: 'fb_text', message: '', link: 'https://example.com' }), null, 'a link alone is a post');
  assert.match(fbProblem({ kind: 'fb_text', message: 'x', link: 'http://example.com' }), /https/);
  assert.match(fbProblem({ kind: 'fb_text', message: 'x', link: 'https://a b' }), /https/);
  assert.match(fbProblem({ kind: 'fb_text', message: 'ع'.repeat(FB_MESSAGE_MAX + 1), link: '' }), /أطول/);
  assert.match(fbProblem({ kind: 'fb_photo', message: '', link: 'https://example.com', size: 10, mime: 'image/jpeg' }), /للمنشور النصي/);
  assert.equal(fbProblem({ kind: 'fb_photo', message: '', link: '', size: FB_PHOTO_MAX, mime: 'image/jpeg' }), null);
  assert.match(fbProblem({ kind: 'fb_photo', message: '', link: '', size: FB_PHOTO_MAX + 1, mime: 'image/jpeg' }), /4/);
  assert.match(fbProblem({ kind: 'fb_photo', message: '', link: '', size: 10, mime: 'image/png' }), /JPEG/);
  assert.equal(fbProblem({ kind: 'fb_reel', message: '', link: '', size: 10, mime: 'video/mp4', seconds: 30 }), null);
  assert.match(fbProblem({ kind: 'fb_reel', message: '', link: '', size: 10, mime: 'video/mp4', seconds: 91 }), /90/);
  assert.match(fbProblem({ kind: 'fb_reel', message: '', link: '', size: 10, mime: 'video/mp4', seconds: 2 }), /3/);
  assert.match(fbProblem({ kind: 'fb_reel', message: '', link: '', size: FB_VIDEO_MAX + 1, mime: 'video/mp4' }), /100/);
  assert.match(fbProblem({ kind: 'fb_reel', message: '', link: '', size: 10, mime: 'video/webm' }), /MP4/);
});

test('the list\'s title and the links', () => {
  assert.equal(fbTitle('fb_silent', 'anything'), 'فحص صامت');
  assert.equal(fbTitle('fb_text', '\n أول <سطر>\nثانٍ'), 'أول سطر');
  assert.equal(fbTitle('fb_photo', ''), 'تجربة منشور صورة');
  assert.equal(fbPageUrl('102345678901234'), 'https://www.facebook.com/102345678901234');
  assert.equal(fbPageUrl('not-an-id'), null);
  assert.equal(fbScheduledUrl('102345678901234'), 'https://business.facebook.com/latest/posts/scheduled_posts?asset_id=102345678901234');
});

test('the migration holds the same limits, and the silent check stays inside Meta\'s window', () => {
  assert.ok(SQL.includes(`size <= ${FB_PHOTO_MAX}`) && SQL.includes(`v_size > ${FB_PHOTO_MAX}`), 'photo size');
  assert.ok(SQL.includes(`size <= ${FB_VIDEO_MAX}`) && SQL.includes(`v_size > ${FB_VIDEO_MAX}`), 'Reel size');
  assert.ok(SQL.includes("interval '10 minutes'") && SQL.includes("interval '30 days'"));
  assert.ok(FB_SILENT_DAYS >= 1 && FB_SILENT_DAYS < 30, 'four weeks sits inside both of Meta\'s windows');
  assert.match(SQL, /grant select \(link, scheduled_for\) on public\.platform_tests to authenticated/);
  assert.match(SQL, /a\.platform in \('youtube','instagram','facebook'\)/);
});

test('the silent check: scheduled, read back, then deleted, and a refused delete is said, not hidden', () => {
  const body = SERVER.slice(SERVER.indexOf('async function silentCheck'));
  const order = ['fbFeedPost(', 'fbPostInfo(', 'info.published === false', 'record(db, t, p.id', 'const del = await fbDelete(', 'platform_test_deleted'].map((s) => body.indexOf(s));
  assert.ok(order.every((i) => i > 0) && order.every((i, k) => k === 0 || i > order[k - 1]), order);
  assert.match(body, /scheduledAt: when/);
  assert.match(body, /deleted: false, error: 'SILENT_NOT_DELETED'/);
  // A photo is exactly the started file, a JPEG by its own bytes, within the host's limit.
  assert.match(SERVER, /jpeg\.byteLength !== t\.size \|\| sniffImage\(jpeg\) !== 'image\/jpeg'/);
  assert.match(SERVER, /content-length.*FB_PHOTO_BODY_MAX/);
});

test('every refusal has words', () => {
  const raised = [...SQL.matchAll(/raise exception '([A-Z_]+)'/g)].map((m) => m[1]);
  const produced = [...FB.matchAll(/(?:error: |return )'([A-Z][A-Z_]{4,})'/g)].map((m) => m[1]);
  const server = [...SERVER.matchAll(/(?:refuse|stop|giveUp)\([^)]*'([A-Z_]+)'/g), ...SERVER.matchAll(/error: '([A-Z_]+)'/g)].map((m) => m[1]);
  for (const code of new Set([...raised, ...produced, ...server])) assert.ok(TEST_ERROR_AR[code] ?? CONN_ERROR_AR[code], code);
});

test('the page never holds a token or an address, and the server never logs', () => {
  assert.ok(!/access_token|Bearer|OAuth |link_hash|temp_ref|\/api\/platforms\/test\/file/.test(PAGE));
  assert.ok(!/from '@\/lib\/platforms\/(facebook|test-facebook|test-instagram|test-server|oauth|connect)'/.test(PAGE));
  for (const src of [SERVER, FB]) assert.ok(!/console\./.test(src));
  assert.match(PAGE, /data-hold=\{HOLD\.fbTestPost\}/);
  assert.match(PAGE, /data-hold=\{HOLD\.fbTestDelete\}/);
  // The silent check's own button asks for no long press: nothing becomes public.
  const silent = PAGE.slice(PAGE.indexOf("{choice === 'silent' ? ("), PAGE.indexOf('تشغيل الفحص الصامت'));
  assert.ok(silent.length > 50 && !silent.includes('data-hold'), 'no hold on the silent check');
  assert.ok(HOLD.fbTestPost && HOLD.fbTestDelete);
});

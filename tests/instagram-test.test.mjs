// «تجربة النشر» on Instagram (MVP_draft.md section 72): Meta's calls against a fake Graph API, the rules the page and the
// routes share, the same limits in the migration, the temporary address, and what the page must never hold. The database
// half is supabase/tests/platform_tests_instagram_rules.sql; the panel is clicked through by qa/instagram-test-flow.cjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { igContainerStatus, igCreateContainer, igDelete, igMedia, igPublish, igPublishingLimit, igReason } from '../src/lib/platforms/instagram.ts';
import {
  IG_ALT_MAX,
  IG_CAPTION_MAX,
  IG_LINK_MINUTES,
  IG_MANAGE_SCOPE,
  IG_PICTURE_MAX,
  IG_VIDEO_MAX,
  TEST_ERROR_AR,
  igProblem,
  igProfileUrl,
  igTitle,
  kindOf,
  storyEnds,
} from '../src/lib/platforms/test-rules.ts';
import { CONN_ERROR_AR } from '../src/lib/platforms/info.ts';
import { HOLD } from '../src/lib/kit/hold-reasons.ts';
import { GRAPH_VERSION } from '../src/lib/platforms/oauth.ts';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const SQL = read('supabase/migrations/20261103180000_platform_tests_instagram.sql');
const PAGE = read('src/components/work/instagram-test.tsx');
const SERVER = read('src/lib/platforms/test-instagram.ts');
const IG = read('src/lib/platforms/instagram.ts');
const FILE_ROUTE = read('src/app/api/platforms/test/file/[token]/route.ts');
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;

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

test('a container for each kind carries exactly what Meta takes for it, and the token only in a header', async () => {
  const cases = [
    ['image', { image_url: 'U', caption: 'شرح', alt_text: 'وصف' }],
    ['story_image', { image_url: 'U', media_type: 'STORIES' }],
    ['story_video', { video_url: 'U', media_type: 'STORIES' }],
    ['reel', { video_url: 'U', media_type: 'REELS', caption: 'شرح', share_to_feed: 'false' }],
  ];
  for (const [kind, want] of cases) {
    const f = fake(() => json({ id: '17890000000000001' }));
    const r = await igCreateContainer(f, { token: 'tok', user: '17841400000000000', post: { kind, url: 'U', caption: 'شرح', alt: 'وصف', shareToFeed: false } });
    assert.deepEqual(r, { id: '17890000000000001' }, kind);
    assert.equal(f.seen[0].url, `${GRAPH}/17841400000000000/media`);
    assert.equal(f.seen[0].method, 'POST');
    assert.equal(f.seen[0].headers.get('authorization'), 'OAuth tok');
    assert.deepEqual(params(f.seen[0].body), want, kind);
    assert.ok(!f.seen[0].url.includes('tok') && !String(f.seen[0].body).includes('tok'), 'never in the address or the body');
  }
  const feed = fake(() => json({ id: '17890000000000002' }));
  await igCreateContainer(feed, { token: 't', user: '1784140000', post: { kind: 'reel', url: 'U', caption: '', alt: '', shareToFeed: true } });
  assert.equal(params(feed.seen[0].body).share_to_feed, 'true');
  assert.ok(!('caption' in params(feed.seen[0].body)), 'an empty caption is not sent');
});

test('Meta\'s refusals become the site\'s codes, from the publishing error table', async () => {
  const post = { kind: 'image', url: 'U', caption: '', alt: '', shareToFeed: false };
  const at = async (res) => (await igCreateContainer(fake(() => res), { token: 't', user: '1784140000', post })).error;
  assert.equal(await at(err(400, 9004, 2207052)), 'MEDIA_FETCH_FAILED');
  assert.equal(await at(err(400, -2, 2207003)), 'MEDIA_FETCH_FAILED');
  assert.equal(await at(err(400, 36000, 2207004)), 'MEDIA_REFUSED');
  assert.equal(await at(err(400, 36003, 2207009)), 'RATIO_REFUSED');
  assert.equal(await at(err(400, 36004, 2207010)), 'CAPTION_REFUSED');
  assert.equal(await at(err(400, 9, 2207042)), 'QUOTA_REACHED');
  assert.equal(await at(err(400, 25, 2207050)), 'ACCOUNT_RESTRICTED');
  assert.equal(await at(err(400, 4, 2207051)), 'SPAM_SUSPECTED');
  assert.equal(await at(err(401, 190)), 'TOKEN_REFUSED');
  assert.equal(await at(err(403, 10)), 'SCOPE_MISSING');
  assert.equal(await at(err(403, 200)), 'SCOPE_MISSING');
  assert.equal(await at(err(400, 4)), 'RATE_LIMIT');
  assert.equal(await at(json({}, 503)), 'PLATFORM_DOWN');
  assert.equal(await at(json({ id: 'not-a-number' })), 'PLATFORM_ERROR');
  assert.equal((await igCreateContainer(fake(() => Promise.reject(new Error('down'))), { token: 't', user: '1784140000', post })).error, 'UNREACHABLE');
  assert.equal(igReason(400, { error: { code: 100 } }), 'MEDIA_REFUSED');
});

test('the container\'s status: waiting, ready, or stopped with the reason and never Meta\'s words', async () => {
  const at = async (body, status = 200) => igContainerStatus(fake(() => json(body, status)), { token: 't', id: '17890000000000001' });
  assert.deepEqual(await at({ status_code: 'IN_PROGRESS' }), { state: 'wait' });
  assert.deepEqual(await at({ status_code: 'FINISHED' }), { state: 'ready' });
  assert.deepEqual(await at({ status_code: 'PUBLISHED' }), { state: 'published' });
  assert.deepEqual(await at({ status_code: 'EXPIRED' }), { error: 'CONTAINER_EXPIRED' });
  assert.deepEqual(await at({ status_code: 'ERROR', status: 'Error: Media download has failed. 2207052' }), { error: 'MEDIA_FETCH_FAILED' });
  assert.deepEqual(await at({ status_code: 'ERROR', status: 'something else' }), { error: 'PROCESSING_FAILED' });
  assert.deepEqual(await at({}, 401), { error: 'TOKEN_REFUSED' });
  const f = fake(() => json({ status_code: 'IN_PROGRESS' }));
  await igContainerStatus(f, { token: 't', id: '17890000000000001' });
  assert.equal(f.seen[0].url, `${GRAPH}/17890000000000001?fields=status_code,status`);
});

test('publishing, the post\'s link and owner, the delete, and the quota', async () => {
  const pub = fake(() => json({ id: '17920000000000001' }));
  assert.deepEqual(await igPublish(pub, { token: 't', user: '1784140000', container: '17890000000000001' }), { id: '17920000000000001' });
  assert.equal(pub.seen[0].url, `${GRAPH}/1784140000/media_publish`);
  assert.deepEqual(params(pub.seen[0].body), { creation_id: '17890000000000001' });

  const m = await igMedia(fake(() => json({ id: '1792', permalink: 'https://www.instagram.com/p/AbC/', owner: { id: '1784140000' }, media_product_type: 'FEED' })), { token: 't', id: '1792' });
  assert.deepEqual(m, { id: '1792', permalink: 'https://www.instagram.com/p/AbC/', owner: '1784140000', productType: 'FEED' });
  const odd = await igMedia(fake(() => json({ id: '1792', permalink: 'https://evil.example/p/1' })), { token: 't', id: '1792' });
  assert.equal(odd.permalink, null, 'a link that is not Instagram\'s is not kept');

  const del = fake(() => json({ success: true, deleted_id: '1792' }));
  assert.deepEqual(await igDelete(del, { token: 't', id: '1792' }), { gone: false });
  assert.equal(del.seen[0].method, 'DELETE');
  assert.equal(del.seen[0].url, `${GRAPH}/1792`);
  assert.deepEqual(await igDelete(fake(() => err(400, 100, 33)), { token: 't', id: '1792' }), { gone: true });
  assert.deepEqual(await igDelete(fake(() => err(403, 10)), { token: 't', id: '1792' }), { error: 'SCOPE_MISSING' });

  const q = fake(() => json({ data: [{ quota_usage: 3, config: { quota_total: 50, quota_duration: 86400 } }] }));
  assert.deepEqual(await igPublishingLimit(q, { token: 't', user: '1784140000' }), { used: 3, total: 50 });
  assert.equal(q.seen[0].url, `${GRAPH}/1784140000/content_publishing_limit?fields=quota_usage,config`);
  assert.equal(await igPublishingLimit(fake(() => json({}, 500)), { token: 't', user: '1' }), null);
});

test('the kind follows the choice and the file', () => {
  assert.equal(kindOf('story', 'image/jpeg'), 'story_image');
  assert.equal(kindOf('story', 'video/mp4'), 'story_video');
  assert.equal(kindOf('story', 'video/quicktime'), 'story_video');
  assert.equal(kindOf('story', 'video/webm'), null);
  assert.equal(kindOf('image', 'image/jpeg'), 'image');
  assert.equal(kindOf('image', 'video/mp4'), null);
  assert.equal(kindOf('reel', 'video/mp4'), 'reel');
  assert.equal(kindOf('reel', 'image/jpeg'), null);
});

test('what is checked before a test is sent', () => {
  const pic = { kind: 'image', size: 1000, mime: 'image/jpeg', caption: 'شرح', alt: '', ratio: 1 };
  assert.equal(igProblem(pic), null);
  assert.match(igProblem({ ...pic, mime: 'image/png' }), /JPEG/);
  assert.match(igProblem({ ...pic, size: IG_PICTURE_MAX + 1 }), /8/);
  assert.equal(igProblem({ ...pic, size: IG_PICTURE_MAX }), null);
  assert.match(igProblem({ ...pic, ratio: 0.5 }), /4:5/);
  assert.equal(igProblem({ ...pic, ratio: 0.8 }), null);
  assert.equal(igProblem({ ...pic, ratio: 1.91 }), null);
  assert.match(igProblem({ ...pic, ratio: 2 }), /1.91/);
  assert.equal(igProblem({ ...pic, kind: 'story_image', ratio: 0.3 }), null, 'a Story takes any shape');
  assert.match(igProblem({ ...pic, caption: 'ع'.repeat(IG_CAPTION_MAX + 1) }), /2200/);
  assert.match(igProblem({ ...pic, caption: Array.from({ length: 31 }, (_, i) => `#t${i}`).join(' ') }), /30/);
  assert.match(igProblem({ ...pic, caption: Array.from({ length: 21 }, (_, i) => `@u${i}`).join(' ') }), /20/);
  assert.match(igProblem({ ...pic, alt: 'x'.repeat(IG_ALT_MAX + 1) }), /1000/);
  assert.equal(igProblem({ ...pic, kind: 'story_image', caption: 'ع'.repeat(5000) }), null, 'a Story has no caption to check');
  const vid = { kind: 'reel', size: 5e6, mime: 'video/mp4', caption: '', alt: '', seconds: 30 };
  assert.equal(igProblem(vid), null);
  assert.match(igProblem({ ...vid, mime: 'video/webm' }), /MP4/);
  assert.match(igProblem({ ...vid, size: IG_VIDEO_MAX + 1 }), /100/);
  assert.match(igProblem({ ...vid, seconds: 2 }), /3/);
  assert.match(igProblem({ ...vid, seconds: 16 * 60 }), /15/);
  assert.match(igProblem({ ...vid, kind: 'story_video', seconds: 61 }), /60/);
  assert.equal(igProblem({ ...vid, seconds: null }), null, 'an unknown length is left to Meta');
});

test('the list\'s title, the links, and a Story\'s end', () => {
  assert.equal(igTitle('image', '\n  أول سطر <مهم>\nثانٍ'), 'أول سطر مهم');
  assert.equal(igTitle('story_image', ''), 'تجربة قصة');
  assert.equal([...igTitle('reel', 'ع'.repeat(300))].length, 100);
  assert.equal(igProfileUrl('@hedayh'), 'https://www.instagram.com/hedayh/');
  assert.equal(igProfileUrl('org.news_1'), 'https://www.instagram.com/org.news_1/');
  assert.equal(igProfileUrl('not a name'), null);
  assert.equal(igProfileUrl(null), null);
  assert.equal(storyEnds('2026-11-03T10:00:00.000Z'), '2026-11-04T10:00:00.000Z');
  assert.equal(storyEnds(null), null);
});

test('the migration holds the same limits, and hides the link and the temporary copy from pages', () => {
  assert.ok(SQL.includes(`size <= ${IG_PICTURE_MAX}`) && SQL.includes(`v_size > ${IG_PICTURE_MAX}`), 'picture size');
  assert.ok(SQL.includes(`size <= ${IG_VIDEO_MAX}`) && SQL.includes(`v_size > ${IG_VIDEO_MAX}`), 'video size');
  assert.ok(SQL.includes("mime in ('video/mp4','video/quicktime')") && SQL.includes("mime = 'image/jpeg'"));
  assert.ok(SQL.includes("interval '1 hour'") && IG_LINK_MINUTES <= 60, 'the link lasts at most an hour');
  const grant = /grant select \(([^)]*)\) on public\.platform_tests to authenticated/.exec(SQL);
  assert.ok(grant && !/link_hash|link_until|temp_ref/.test(grant[1]), 'pages never read the link or the temporary copy');
  for (const fn of ['platform_test_temp', 'platform_test_link', 'platform_test_container', 'platform_test_fetch', 'platform_test_done']) {
    const body = SQL.slice(SQL.indexOf(`create function public.${fn}(`)).split('\n$$;')[0];
    assert.match(body, /mail_key_ok\(p_key\)/, `${fn} needs the server key`);
  }
  assert.match(SQL, /grant execute on function public\.platform_test_fetch\(text, text\) to anon, authenticated;/);
  assert.ok(!/grant execute on function[^;]*platform_test_(temp|link|container)[^;]*anon/.test(SQL), 'only the fetch is open without a session');
});

test('every refusal has words', () => {
  const raised = [...SQL.matchAll(/raise exception '([A-Z_]+)'/g), ...SQL.matchAll(/error = '([A-Z_]+)'/g)].map((m) => m[1]);
  const produced = [...IG.matchAll(/'([A-Z][A-Z_]{4,})'/g)].map((m) => m[1]).filter((c) => !['STORIES', 'REELS', 'DELETE', 'POST', 'IN_PROGRESS', 'FINISHED', 'PUBLISHED', 'EXPIRED', 'ERROR'].includes(c));
  const server = [...SERVER.matchAll(/(?:refuse|stop|giveUp)\([^)]*'([A-Z_]+)'/g)].map((m) => m[1]);
  for (const code of new Set([...raised, ...produced, ...server])) assert.ok(TEST_ERROR_AR[code] ?? CONN_ERROR_AR[code], code);
});

test('the page never holds a token or the temporary address, and the server never logs', () => {
  assert.ok(!/access_token|Bearer|OAuth |link_hash|temp_ref|\/api\/platforms\/test\/file/.test(PAGE));
  assert.ok(!/from '@\/lib\/platforms\/(instagram|test-instagram|test-server|oauth|connect)'/.test(PAGE));
  for (const src of [SERVER, IG, FILE_ROUTE]) assert.ok(!/console\./.test(src));
  assert.match(PAGE, /data-hold=\{HOLD\.igTestStory\}/);
  assert.match(PAGE, /data-hold=\{HOLD\.igTestPost\}/);
  assert.match(PAGE, /data-hold=\{HOLD\.igTestDelete\}/);
  assert.ok(HOLD.igTestStory && HOLD.igTestPost && HOLD.igTestDelete);
  assert.equal(IG_MANAGE_SCOPE, 'instagram_manage_contents');
});

test('the temporary address: random, hashed, checked by shape, and answered the same for anything wrong', () => {
  assert.match(SERVER, /randomBytes\(32\)\.toString\('hex'\)/);
  assert.match(SERVER, /createHash\('sha256'\)/);
  assert.match(SERVER, /if \(!key \|\| !\/\^\[0-9a-f\]\{64\}\$\/\.test\(token\)\) return none\(\);/);
  assert.match(SERVER, /'Cache-Control': 'no-store'/);
  assert.match(SERVER, /'X-Robots-Tag': 'noindex, nofollow'/);
  assert.match(FILE_ROUTE, /export async function GET/);
  assert.match(FILE_ROUTE, /export async function HEAD/);
  assert.ok(!/export async function (POST|PUT|DELETE)/.test(FILE_ROUTE), 'the address only reads');
  // The phone and desktop applications never claim it as a page: it is under /api/.
  assert.match(SERVER, /\/api\/platforms\/test\/file\/\$\{link\.token\}/);
  // A device file is accepted only as the file this test's session made.
  assert.match(SERVER, /info\.name === tempName\(t\.id, t\.mime\)/);
  assert.match(SERVER, /info\.appProperties\?\.uploadedBy === me/);
});

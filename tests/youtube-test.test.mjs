// «تجربة النشر» (MVP_draft.md section 71): YouTube's upload and delete against a fake YouTube, the rules the page and
// the routes share, and the same limits in the migration. The database half (who may, the hidden address, deleting only
// what a test uploaded) is supabase/tests/platform_tests_rules.sql; the panel is clicked through by qa/youtube-test-flow.cjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GOOGLE_SCOPES, googleAccess, packTokens, unpackTokens } from '../src/lib/platforms/oauth2.ts';
import { nextByte, youtubeDelete, youtubeOpenUpload, youtubeSendPiece, ytReason, ytUploadStatus } from '../src/lib/platforms/youtube.ts';
import {
  DESCRIPTION_MAX_BYTES,
  DEVICE_PIECE,
  LIBRARY_PIECE,
  TEST_ERROR_AR,
  TEST_MAX_BYTES,
  TESTS_PER_DAY,
  TITLE_MAX,
  UPLOAD_PREFIX,
  YT_CHOICES,
  YT_CHOICE_AR,
  YT_CHOICE_SUB,
  YT_MANAGE_SCOPE,
  YT_SCHEDULE_MAX_DAYS,
  YT_SCHEDULE_MIN_MINUTES,
  channelUrl,
  choiceOf,
  isUploadUrl,
  pieceAt,
  pieceFits,
  postsUrl,
  scheduleProblem,
  studioUrl,
  testProblem,
  videoStudioUrl,
  videoUrl,
  ytStatus,
} from '../src/lib/platforms/test-rules.ts';
import { CONN_ERROR_AR } from '../src/lib/platforms/info.ts';
import { HOLD } from '../src/lib/kit/hold-reasons.ts';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const SQL = read('supabase/migrations/20261103120000_platform_tests.sql');
const CHOICES_SQL = read('supabase/migrations/20261105120000_platform_tests_youtube_choices.sql');
const PAGE = read('src/components/work/youtube-test.tsx');
const START = read('src/app/api/platforms/test/route.ts');
const STEP = read('src/app/api/platforms/test/[id]/route.ts');
const SERVER = read('src/lib/platforms/test-server.ts');
const YT = read('src/lib/platforms/youtube.ts');

const UP = 'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&upload_id=abc';
const json = (body, status = 200, headers = {}) => new Response(body === null ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
function fake(handler) {
  const seen = [];
  const f = async (url, init = {}) => {
    seen.push({ url: String(url), method: init.method ?? 'GET', headers: new Headers(init.headers), body: init.body });
    return handler(String(url), init);
  };
  f.seen = seen;
  return f;
}
const err = (status, reason) => json({ error: { code: status, errors: [{ reason }] } }, status);

test('the sign-in asks for the scope that deleting needs, beside uploading and reading', () => {
  assert.ok(GOOGLE_SCOPES.includes('https://www.googleapis.com/auth/youtube.upload'));
  assert.ok(GOOGLE_SCOPES.includes('https://www.googleapis.com/auth/youtube.readonly'));
  assert.ok(GOOGLE_SCOPES.includes(YT_MANAGE_SCOPE));
  assert.equal(YT_MANAGE_SCOPE, 'https://www.googleapis.com/auth/youtube.force-ssl');
});

test('a working token: the stored one while it lasts, a refreshed one after, and a refusal said as a reconnect', async () => {
  const now = Date.parse('2026-11-03T10:00:00Z');
  const fresh = packTokens({ access: 'acc-old', refresh: 'ref', subject: '', accessExpiresAt: new Date(now + 3600e3).toISOString(), refreshExpiresAt: '' });
  const none = fake(() => assert.fail('no call is needed'));
  assert.deepEqual(await googleAccess(none, { clientId: 'c', secret: 's', packed: fresh, now }), { access: 'acc-old', newSecret: null });

  const ended = packTokens({ access: 'acc-old', refresh: 'ref', subject: '', accessExpiresAt: new Date(now + 30e3).toISOString(), refreshExpiresAt: '' });
  const f = fake(() => json({ access_token: 'acc-new', expires_in: 3599 }));
  const got = await googleAccess(f, { clientId: 'c', secret: 's', packed: ended, now });
  assert.equal(got.access, 'acc-new');
  assert.equal(unpackTokens(got.newSecret).access, 'acc-new');
  assert.equal(unpackTokens(got.newSecret).refresh, 'ref');
  assert.match(f.seen[0].body, /grant_type=refresh_token/);

  assert.deepEqual(await googleAccess(fake(() => json({ error: 'invalid_grant' }, 400)), { clientId: 'c', secret: 's', packed: ended, now }), { error: 'TOKEN_EXPIRED' });
  assert.deepEqual(await googleAccess(none, { clientId: 'c', secret: 's', packed: 'not json', now }), { error: 'NOT_CONNECTED' });
});

test('an upload is opened with the details, unannounced to subscribers, and its address kept only when it is YouTube\'s', async () => {
  const f = fake(() => json({}, 200, { Location: UP }));
  const r = await youtubeOpenUpload(f, { access: 'tok', video: { title: '  تجربة  ', description: 'وصف', privacy: 'private', size: 1234, mime: 'video/mp4' } });
  assert.deepEqual(r, { url: UP });
  const s = f.seen[0];
  const u = new URL(s.url);
  assert.equal(u.origin + u.pathname, 'https://www.googleapis.com/upload/youtube/v3/videos');
  assert.equal(u.searchParams.get('uploadType'), 'resumable');
  assert.equal(u.searchParams.get('part'), 'snippet,status');
  assert.equal(u.searchParams.get('notifySubscribers'), 'false');
  assert.equal(s.method, 'POST');
  assert.equal(s.headers.get('authorization'), 'Bearer tok');
  assert.equal(s.headers.get('x-upload-content-length'), '1234');
  assert.equal(s.headers.get('x-upload-content-type'), 'video/mp4');
  const body = JSON.parse(s.body);
  assert.equal(body.snippet.title, 'تجربة');
  assert.equal(body.snippet.description, 'وصف');
  assert.equal(body.status.privacyStatus, 'private');

  const elsewhere = fake(() => json({}, 200, { Location: 'https://evil.example/upload?x=1' }));
  assert.deepEqual(await youtubeOpenUpload(elsewhere, { access: 't', video: { title: 'a', description: '', privacy: 'public', size: 1, mime: 'video/mp4' } }), { error: 'PLATFORM_ERROR' });
  const v = { title: 'a', description: '', privacy: 'public', size: 1, mime: 'video/mp4' };
  assert.deepEqual(await youtubeOpenUpload(fake(() => json({}, 401)), { access: 't', video: v }), { error: 'TOKEN_REFUSED' });
  assert.deepEqual(await youtubeOpenUpload(fake(() => err(403, 'insufficientPermissions')), { access: 't', video: v }), { error: 'SCOPE_MISSING' });
  assert.deepEqual(await youtubeOpenUpload(fake(() => err(403, 'uploadLimitExceeded')), { access: 't', video: v }), { error: 'UPLOAD_LIMIT' });
  assert.deepEqual(await youtubeOpenUpload(fake(() => err(401, 'youtubeSignupRequired')), { access: 't', video: v }), { error: 'TOKEN_REFUSED' });
  assert.deepEqual(await youtubeOpenUpload(fake(() => err(400, 'invalidTitle')), { access: 't', video: v }), { error: 'VIDEO_REFUSED' });
  assert.deepEqual(await youtubeOpenUpload(fake(() => Promise.reject(new Error('down'))), { access: 't', video: v }), { error: 'UNREACHABLE' });
});

test('YouTube\'s four choices: unlisted is a privacy, and «مجدول» is private with a time that YouTube keeps', async () => {
  assert.deepEqual([...YT_CHOICES], ['private', 'unlisted', 'public', 'scheduled'], 'YouTube Studio\'s order');
  assert.deepEqual(YT_CHOICES.map((c) => YT_CHOICE_AR[c]), ['خاص', 'غير مدرج', 'عام', 'مجدول']);
  for (const c of YT_CHOICES) assert.ok(YT_CHOICE_SUB[c], c);
  const at = '2026-11-20T06:00:00.000Z';
  assert.deepEqual(ytStatus('unlisted', at), { privacy: 'unlisted', publishAt: null }, 'only «مجدول» carries a time');
  assert.deepEqual(ytStatus('scheduled', at), { privacy: 'private', publishAt: at });
  assert.deepEqual(ytUploadStatus({ privacy: 'unlisted' }), { privacyStatus: 'unlisted' });
  assert.deepEqual(ytUploadStatus({ privacy: 'public', publishAt: at }), { privacyStatus: 'private', publishAt: at }, 'a time is sent with private only');
  assert.equal(choiceOf({ privacy: 'private', scheduled_for: at }), 'scheduled');
  assert.equal(choiceOf({ privacy: 'private', scheduled_for: null }), 'private');
  assert.equal(choiceOf({ privacy: 'unlisted' }), 'unlisted');

  const f = fake(() => json({}, 200, { Location: UP }));
  await youtubeOpenUpload(f, { access: 'tok', video: { title: 'a', description: '', privacy: 'unlisted', size: 1, mime: 'video/mp4' } });
  await youtubeOpenUpload(f, { access: 'tok', video: { title: 'a', description: '', privacy: 'private', publishAt: at, size: 1, mime: 'video/mp4' } });
  assert.deepEqual(JSON.parse(f.seen[0].body).status, { privacyStatus: 'unlisted' });
  assert.deepEqual(JSON.parse(f.seen[1].body).status, { privacyStatus: 'private', publishAt: at });
  for (const s of f.seen) assert.equal(new URL(s.url).searchParams.get('notifySubscribers'), 'false', 'a test never notifies, whatever its choice');

  // YouTube's answer to the last piece names the time it will publish at, which is kept as an instant.
  const last = fake(() => json({ id: 'dQw4w9WgXcQ', snippet: { channelId: 'UCabc' }, status: { privacyStatus: 'private', publishAt: '2026-11-20T06:00:00Z' } }, 201));
  const r = await youtubeSendPiece(last, { url: UP, access: 't', bytes: new Uint8Array(10), from: 0, total: 10 });
  assert.deepEqual(r, { video: { id: 'dQw4w9WgXcQ', channelId: 'UCabc', privacy: 'private', publishAt: at } });
  const odd = fake(() => json({ id: 'dQw4w9WgXcQ', snippet: { channelId: 'UCabc' }, status: { privacyStatus: 'private', publishAt: 'soon' } }, 201));
  assert.equal((await youtubeSendPiece(odd, { url: UP, access: 't', bytes: new Uint8Array(10), from: 0, total: 10 })).video.publishAt, null);
});

test('a scheduled test\'s window: the site\'s own, the same in the database', () => {
  const now = Date.parse('2026-11-05T09:00:00Z');
  assert.match(scheduleProblem(null, now), /اختر/);
  assert.match(scheduleProblem('not a time', now), /اختر/);
  assert.match(scheduleProblem(new Date(now + 9 * 60e3).toISOString(), now), /10 دقائق/);
  assert.equal(scheduleProblem(new Date(now + YT_SCHEDULE_MIN_MINUTES * 60e3).toISOString(), now), null);
  assert.equal(scheduleProblem(new Date(now + YT_SCHEDULE_MAX_DAYS * 864e5).toISOString(), now), null);
  assert.match(scheduleProblem(new Date(now + YT_SCHEDULE_MAX_DAYS * 864e5 + 60e3).toISOString(), now), /30 يوماً/);
  assert.match(scheduleProblem(new Date(now - 60e3).toISOString(), now), /10 دقائق/);
  // The migration refuses the same window by name, and a time with any privacy but private.
  assert.ok(CHOICES_SQL.includes(`v_when < now() + interval '${YT_SCHEDULE_MIN_MINUTES} minutes' or v_when > now() + interval '${YT_SCHEDULE_MAX_DAYS} days') then
    raise exception 'SCHEDULE_INVALID'`), 'the window');
  assert.ok(CHOICES_SQL.includes(`(v_when is not null and v_privacy <> 'private')`), 'a time with private only');
  assert.ok(CHOICES_SQL.includes(`privacy in ('private','public','unlisted')`), 'the three privacies');
  assert.ok(TEST_ERROR_AR.SCHEDULE_INVALID.includes(String(YT_SCHEDULE_MIN_MINUTES)) && TEST_ERROR_AR.SCHEDULE_INVALID.includes(String(YT_SCHEDULE_MAX_DAYS)));
  const done = CHOICES_SQL.slice(CHOICES_SQL.indexOf('create function public.platform_test_done(')).split('\n$$;')[0];
  assert.match(done, /mail_key_ok\(p_key\)/, 'recording the result still needs the server key');
  assert.match(CHOICES_SQL, /grant select \(shown_publish_at\) on public\.platform_tests to authenticated/);
  assert.ok(!/grant select \([^)]*upload_url/.test(CHOICES_SQL), 'never the upload address');
});

test('pieces go to the upload with their range, and YouTube\'s answer is the next byte or the video', async () => {
  const f = fake(() => json(null, 308, { Range: 'bytes=0-3145727' }));
  const bytes = new Uint8Array(DEVICE_PIECE);
  assert.deepEqual(await youtubeSendPiece(f, { url: UP, access: 'tok', bytes, from: 0, total: 5_000_000 }), { next: 3145728 });
  assert.equal(f.seen[0].url, UP);
  assert.equal(f.seen[0].method, 'PUT');
  assert.equal(f.seen[0].headers.get('content-range'), 'bytes 0-3145727/5000000');
  assert.equal(f.seen[0].headers.get('authorization'), 'Bearer tok');

  const last = fake(() => json({ id: 'dQw4w9WgXcQ', snippet: { channelId: 'UCabc' }, status: { privacyStatus: 'private' } }, 201));
  assert.deepEqual(await youtubeSendPiece(last, { url: UP, access: 't', bytes: new Uint8Array(10), from: 3145728, total: 3145738 }), {
    video: { id: 'dQw4w9WgXcQ', channelId: 'UCabc', privacy: 'private', publishAt: null },
  });
  assert.equal(last.seen[0].headers.get('content-range'), 'bytes 3145728-3145737/3145738');

  const asking = fake(() => json(null, 308));
  assert.deepEqual(await youtubeSendPiece(asking, { url: UP, access: 't', bytes: new Uint8Array(0), from: 0, total: 99 }), { next: 0 });
  assert.equal(asking.seen[0].headers.get('content-range'), 'bytes */99');
  assert.equal(asking.seen[0].body, null);

  const never = fake(() => assert.fail('a piece goes nowhere but YouTube'));
  assert.deepEqual(await youtubeSendPiece(never, { url: 'https://evil.example/u', access: 't', bytes, from: 0, total: 1 }), { error: 'UPLOAD_EXPIRED' });
  assert.deepEqual(await youtubeSendPiece(fake(() => json({}, 404)), { url: UP, access: 't', bytes, from: 0, total: 1 }), { error: 'UPLOAD_EXPIRED' });
  assert.deepEqual(await youtubeSendPiece(fake(() => json({}, 503)), { url: UP, access: 't', bytes, from: 0, total: 1 }), { error: 'PLATFORM_DOWN' });
  assert.deepEqual(await youtubeSendPiece(fake(() => json({}, 201)), { url: UP, access: 't', bytes, from: 0, total: 1 }), { error: 'PLATFORM_ERROR' });
  assert.equal(nextByte('bytes=0-262143'), 262144);
  assert.equal(nextByte(null), 0);
});

test('a delete removes the video by its id, counts a video already gone as deleted, and says when Google has not allowed it', async () => {
  const f = fake(() => new Response(null, { status: 204 }));
  assert.deepEqual(await youtubeDelete(f, { access: 'tok', id: 'dQw4w9WgXcQ' }), { gone: false });
  assert.equal(f.seen[0].method, 'DELETE');
  assert.equal(f.seen[0].url, 'https://www.googleapis.com/youtube/v3/videos?id=dQw4w9WgXcQ');
  assert.deepEqual(await youtubeDelete(fake(() => err(404, 'videoNotFound')), { access: 't', id: 'x' }), { gone: true });
  assert.deepEqual(await youtubeDelete(fake(() => err(403, 'insufficientPermissions')), { access: 't', id: 'x' }), { error: 'SCOPE_MISSING' });
  assert.deepEqual(await youtubeDelete(fake(() => json({ error: { details: [{ reason: 'ACCESS_TOKEN_SCOPE_INSUFFICIENT' }] } }, 403)), { access: 't', id: 'x' }), { error: 'SCOPE_MISSING' });
  assert.deepEqual(await youtubeDelete(fake(() => err(403, 'forbidden')), { access: 't', id: 'x' }), { error: 'FORBIDDEN_BY_PLATFORM' });
  assert.equal(ytReason(429, {}), 'UPLOAD_LIMIT');
});

test('what is checked before a test is sent', () => {
  const ok = { title: 'تجربة', description: '', size: 1000, mime: 'video/mp4' };
  assert.equal(testProblem(ok), null);
  assert.match(testProblem({ ...ok, title: '   ' }), /عنوان/);
  assert.match(testProblem({ ...ok, title: 'ع'.repeat(TITLE_MAX + 1) }), /أطول/);
  assert.equal(testProblem({ ...ok, title: 'ع'.repeat(TITLE_MAX) }), null);
  assert.match(testProblem({ ...ok, title: 'a<b' }), /</);
  assert.match(testProblem({ ...ok, description: 'x>y' }), /</);
  // Arabic letters are two bytes each: 2501 of them pass a character count of 5000 and break YouTube's byte limit.
  assert.match(testProblem({ ...ok, description: 'ع'.repeat(2501) }), /الوصف/);
  assert.equal(testProblem({ ...ok, description: 'ع'.repeat(DESCRIPTION_MAX_BYTES / 2) }), null);
  assert.match(testProblem({ ...ok, mime: 'image/png' }), /فيديو/);
  assert.match(testProblem({ ...ok, mime: '' }), /فيديو/);
  assert.match(testProblem({ ...ok, size: 0 }), /فارغ/);
  assert.match(testProblem({ ...ok, size: TEST_MAX_BYTES + 1 }), /غيغابايت/);
  assert.equal(testProblem({ ...ok, size: TEST_MAX_BYTES }), null);
});

test('pieces are what YouTube accepts and what the host carries', () => {
  assert.ok(pieceFits(DEVICE_PIECE) && pieceFits(LIBRARY_PIECE));
  assert.ok(DEVICE_PIECE < 4_500_000, 'a piece from the device passes through the host, whose body limit is 4.5 MB');
  assert.equal(pieceAt(0, 10, DEVICE_PIECE), 10);
  assert.equal(pieceAt(DEVICE_PIECE, DEVICE_PIECE + 7, DEVICE_PIECE), 7);
  assert.equal(pieceAt(0, DEVICE_PIECE * 2, DEVICE_PIECE), DEVICE_PIECE);
  assert.ok(isUploadUrl(UP));
  assert.ok(!isUploadUrl('https://www.googleapis.com/upload/drive/v3/files?upload_id=1'));
  assert.ok(!isUploadUrl('https://www.googleapis.com.evil.example/upload/youtube/v3/videos?x'));
});

test('the links to the channel, Studio, its posts and a video', () => {
  assert.equal(channelUrl({ handle: '@hedayh', external_id: 'UCx' }), 'https://www.youtube.com/@hedayh');
  assert.equal(channelUrl({ handle: 'Not a handle', external_id: 'UCx-y_1' }), 'https://www.youtube.com/channel/UCx-y_1');
  assert.equal(channelUrl({ handle: null, external_id: null }), null);
  assert.equal(postsUrl({ handle: '@hedayh' }), 'https://www.youtube.com/@hedayh/posts');
  assert.equal(studioUrl('UCx'), 'https://studio.youtube.com/channel/UCx/videos');
  assert.equal(studioUrl(null), null);
  assert.equal(channelUrl({ handle: null, external_id: 'a/../b' }), 'https://www.youtube.com/channel/a%2F..%2Fb');
  assert.equal(videoUrl('dQw4w9WgXcQ'), 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  assert.equal(videoStudioUrl('dQw4w9WgXcQ'), 'https://studio.youtube.com/video/dQw4w9WgXcQ/edit');
});

test('the migration holds the same limits, and hides the upload address from pages', () => {
  assert.ok(SQL.includes(`between 1 and ${TEST_MAX_BYTES}`), 'size limit');
  assert.ok(SQL.includes(`between 1 and ${TITLE_MAX}`), 'title limit');
  assert.ok(SQL.includes(`>= ${TESTS_PER_DAY} then`), 'tests a day');
  assert.equal(SQL.split(`'${UPLOAD_PREFIX}%'`).length - 1, 2, 'the address is checked in the table and when kept');
  const grant = /grant select \(([^)]*)\) on public\.platform_tests to authenticated/.exec(SQL);
  assert.ok(grant, 'pages read named columns');
  assert.ok(!grant[1].includes('upload_url'), 'never the upload address');
  assert.match(SQL, /revoke all on public\.platform_tests from public, anon, authenticated/);
  for (const fn of ['platform_test_get', 'platform_test_session', 'platform_test_done', 'platform_test_failed', 'platform_test_deleted']) {
    const body = SQL.slice(SQL.indexOf(`create function public.${fn}(`)).split('\n$$;')[0];
    assert.match(body, /mail_key_ok\(p_key\)/, `${fn} needs the server key`);
  }
});

test('every refusal has words', () => {
  const raised = [...(SQL + CHOICES_SQL).matchAll(/raise exception '([A-Z_]+)'/g)].map((m) => m[1]);
  const errors = [...(SQL + CHOICES_SQL).matchAll(/error = '([A-Z_]+)'/g)].map((m) => m[1]);
  for (const code of new Set([...raised, ...errors])) assert.ok(TEST_ERROR_AR[code], code);
  const produced = [...YT.matchAll(/(?:error: |return )'([A-Z][A-Z_]+)'/g)].map((m) => m[1]);
  const server = [...(SERVER + START + STEP).matchAll(/refuse\('([A-Z_]+)'|giveUp\(db, id, '([A-Z_]+)'\)|p_error: '([A-Z_]+)'/g)].map((m) => m[1] ?? m[2] ?? m[3]);
  for (const code of new Set([...produced, ...server])) assert.ok(TEST_ERROR_AR[code] ?? CONN_ERROR_AR[code], code);
});

test('the page never holds a token or an upload address, and the server never logs', () => {
  assert.ok(!/googleapis\.com\/upload|upload_url|access_token|Bearer/.test(PAGE));
  assert.ok(!/from '@\/lib\/platforms\/(youtube|test-server|oauth2|connect)'/.test(PAGE));
  for (const src of [START, STEP, SERVER, YT]) assert.ok(!/console\./.test(src));
  assert.match(PAGE, /HOLD\.platformTestDelete/);
  assert.match(PAGE, /HOLD\.platformTestPublic/);
  assert.match(PAGE, /data-hold=\{HOLD\.platformTestScheduled\}/);
  assert.ok(HOLD.platformTestDelete && HOLD.platformTestPublic && HOLD.platformTestScheduled);
  // A community post is never sent: the page copies it and opens YouTube.
  const post = PAGE.slice(PAGE.indexOf("{kind === 'post' ? ("), PAGE.indexOf('data-yt="device"'));
  assert.ok(post.length > 500 && post.includes('data-yt="post-open"'), 'the post block was found');
  assert.ok(!/\bapi\(|fetch\(/.test(post));
});

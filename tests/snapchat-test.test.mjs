// «تجربة النشر» on a Snapchat Public Profile (MVP_draft.md section 85, Snapchat_Test_Plan.md): Snap's calls and the test's whole flow against a fake Snap and a fake
// database, the encryption of the file, the rules the page and the server share, the limits held equal to the database's, and the safety rules held by the sources.
// Snap's API is allowlist only: nothing here has met a real Snap answer, only the shapes its documentation gives (read 2026-11-26).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDecipheriv } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  SN_LOCALE,
  snCreateMedia,
  snDetail,
  snEncrypt,
  snError,
  snFinalize,
  snKeys,
  snPostSpotlight,
  snPostStory,
  snProfile,
  snSpotlight,
  snSpotlightDelete,
  snSpotlights,
  snStats,
  snStatsOf,
  snStories,
  snUploadPart,
} from '../src/lib/platforms/snapchat.ts';
import { rfc3339, snapSend } from '../src/lib/platforms/snapchat-flow.ts';
import { connErrorAr } from '../src/lib/platforms/info.ts';
import {
  SN_DESCRIPTION_MAX,
  SN_KIND,
  SN_KIND_AR,
  SN_SECONDS,
  SN_SILENT_DAYS,
  SN_SILENT_TITLE,
  SN_STATS_NOTE,
  SN_STORY_HOURS,
  SN_STORY_TITLE,
  SN_VIDEO_MAX,
  SN_VIDEO_TYPE,
  TEST_ERROR_AR,
  isSnKind,
  snProblem,
  snTitle,
} from '../src/lib/platforms/test-rules.ts';

const read = (f) => readFileSync(f, 'utf8');
const MIGRATION = read('supabase/migrations/20261126180000_platform_tests_snapchat.sql');
const SERVER = read('src/lib/platforms/test-snapchat.ts');
const FLOW = read('src/lib/platforms/snapchat-flow.ts');
const API = read('src/lib/platforms/snapchat.ts');
const PANEL = read('src/components/work/snapchat-test.tsx');

const P = '11111111-2222-4333-8444-555555555555';
const M = 'abed133c-0b1b-3676-8808-3dd6cc164909';
const ADD = `/us/v1/public_profiles/${P}/media/${M}/multipart-upload`;
const S = 'W7_EDlXWTBiXAEEniNoMPwAAYZmJ2cHZmeGd6AYKzgDcrAYKzgDaiAAAAAA';
const OK = { request_id: 'ecfe244d-0b1b-4787-9919-4ee7dd275a0a', request_status: 'SUCCESS' };
const KEY = 'a-server-key-that-never-leaves-the-server';
const TOKEN = 'snap-access-token';
const TEST_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

/**
 * A fake Snap: `routes` maps "METHOD path-regex" to a function from the request to [status, body]. Every request is remembered, with a form read
 * into plain values (the file part as bytes).
 */
function fakeSnap(routes = {}) {
  const calls = [];
  const f = async (url, init = {}) => {
    const u = new URL(url);
    const method = init.method ?? 'GET';
    let body = null;
    if (typeof init.body === 'string') body = JSON.parse(init.body);
    else if (init.body instanceof FormData) {
      body = {};
      for (const [k, v] of init.body.entries()) body[k] = v instanceof Blob ? new Uint8Array(await v.arrayBuffer()) : v;
    }
    const call = { method, host: u.host, path: u.pathname, query: u.search, auth: init.headers?.Authorization, type: init.headers?.['Content-Type'], body };
    calls.push(call);
    // Later routes win, so an override placed after the defaults is the one that answers.
    for (const [k, fn] of Object.entries(routes).reverse()) {
      const [m, re] = k.split(' ');
      if (m === method && new RegExp(re).test(u.pathname)) {
        const [status, answer] = fn(call);
        return new Response(JSON.stringify(answer), { status, headers: { 'Content-Type': 'application/json' } });
      }
    }
    return new Response('{}', { status: 404, headers: { 'Content-Type': 'application/json' } });
  };
  return { f, calls };
}
/** The routes of a Snap that accepts everything, each overridable. */
const happy = (over = {}) => ({
  [`POST /v1/public_profiles/${P}/media$`]: () => [200, { ...OK, media_id: M, add_path: ADD, finalize_path: ADD }],
  [`POST ${ADD}$`]: () => [200, OK],
  [`POST /v1/public_profiles/${P}/stories$`]: () => [200, OK],
  [`POST /v1/public_profiles/${P}/spotlights$`]: () => [200, { ...OK, spotlight_id: S }],
  [`GET /v1/public_profiles/${P}/spotlights/${S}$`]: () => [200, { ...OK, spotlights: [{ sub_request_status: 'SUCCESS', spotlight: { id: S, profile_id: P, status: 'SUBMITTED' } }] }],
  [`DELETE /v1/public_profiles/${P}/spotlights/${S}$`]: () => [200, OK],
  ...over,
});

test('a test\'s media key is worked out from the server key and the test, never stored, and the file is encrypted as openssl\'s aes-256-cbc writes it', () => {
  const a = snKeys(KEY, TEST_ID);
  assert.equal(a.key.length, 32);
  assert.equal(a.iv.length, 16);
  assert.deepEqual(snKeys(KEY, TEST_ID), a, 'the same test gets the same key, so no key is kept');
  assert.notDeepEqual(snKeys(KEY, 'bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeeeeeee').key, a.key, 'another test, another key');
  assert.notDeepEqual(snKeys('another-server-key', TEST_ID).key, a.key, 'without the server key the key cannot be worked out');
  assert.notDeepEqual(a.iv, a.key.subarray(0, 16), 'the iv is not the key\'s start');
  for (const n of [0, 1, 15, 16, 17, 1000, 65536]) {
    const plain = Buffer.alloc(n, 7);
    const enc = snEncrypt(plain, a.key, a.iv);
    assert.equal(enc.length, (Math.floor(n / 16) + 1) * 16, `${n} bytes: PKCS7 always pads`);
    const d = createDecipheriv('aes-256-cbc', a.key, a.iv);
    assert.deepEqual(Buffer.concat([d.update(enc), d.final()]), plain, `${n} bytes come back whole`);
  }
});

test('the media is created with the key and iv in base64, and the upload paths are Snap\'s own and nothing else', async () => {
  const { f, calls } = fakeSnap(happy());
  const k = snKeys(KEY, TEST_ID);
  const m = await snCreateMedia(f, { token: TOKEN, profile: P, type: 'VIDEO', name: 'comms-hub-test', key: k.key, iv: k.iv });
  assert.deepEqual(m, { media: M, add: ADD, finalize: ADD });
  assert.equal(calls[0].host, 'businessapi.snapchat.com');
  assert.equal(calls[0].auth, `Bearer ${TOKEN}`, 'the token travels in the header');
  assert.deepEqual(calls[0].body, { type: 'VIDEO', name: 'comms-hub-test', key: k.key.toString('base64'), iv: k.iv.toString('base64') });
  assert.equal(Buffer.from(calls[0].body.key, 'base64').length, 32);
  assert.equal(Buffer.from(calls[0].body.iv, 'base64').length, 16);
  // An answer that names another address, a path with dots, or no media id is not followed.
  for (const answer of [
    { ...OK, media_id: M, add_path: 'https://evil.example/x/multipart-upload', finalize_path: ADD },
    { ...OK, media_id: M, add_path: '/us/../admin/multipart-upload', finalize_path: ADD },
    { ...OK, media_id: M, add_path: ADD, finalize_path: '//evil.example/multipart-upload' },
    { ...OK, media_id: 'not-a-uuid', add_path: ADD, finalize_path: ADD },
    { ...OK, add_path: ADD, finalize_path: ADD },
  ]) {
    const r = await snCreateMedia(fakeSnap({ [`POST /media$`]: () => [200, answer] }).f, { token: TOKEN, profile: P, type: 'VIDEO', name: 'n', key: k.key, iv: k.iv });
    assert.equal(r.error, 'PLATFORM_ERROR', JSON.stringify(answer).slice(0, 60));
  }
  // A profile id that is not a UUID is never put in an address.
  const bad = fakeSnap(happy());
  assert.deepEqual(await snCreateMedia(bad.f, { token: TOKEN, profile: '../../x', type: 'VIDEO', name: 'n', key: k.key, iv: k.iv }), { error: 'NOT_CONNECTED' });
  assert.equal(bad.calls.length, 0);
});

test('a part goes as a multipart form with its number, the file is finalized, and a path outside the upload is refused before any request', async () => {
  const { f, calls } = fakeSnap(happy());
  const bytes = new Uint8Array([1, 2, 3, 4, 5]);
  assert.deepEqual(await snUploadPart(f, { token: TOKEN, path: ADD, part: 1, bytes }), { ok: true });
  assert.equal(calls[0].path, ADD);
  assert.equal(calls[0].body.action, 'ADD');
  assert.equal(calls[0].body.part_number, '1');
  assert.deepEqual(calls[0].body.file, bytes);
  assert.deepEqual(await snFinalize(f, { token: TOKEN, path: ADD }), { ok: true });
  assert.equal(calls[1].body.action, 'FINALIZE');
  for (const path of ['/v1/public_profiles/x/stories', 'https://businessapi.snapchat.com' + ADD, '/us/../multipart-upload']) {
    assert.equal((await snUploadPart(f, { token: TOKEN, path, part: 1, bytes })).error, 'SN_UPLOAD_FAILED', path);
  }
  assert.equal((await snUploadPart(f, { token: TOKEN, path: ADD, part: 36, bytes })).error, 'SN_UPLOAD_FAILED', 'Snap takes parts 1 to 35');
  assert.equal(calls.length, 2, 'the refused ones sent nothing');
  // Snap answering 200 with an error is a refusal of the file, not a success.
  const r = await snUploadPart(fakeSnap({ 'POST /multipart-upload$': () => [200, { request_status: 'ERROR', error_code: 'INVALID_MEDIA' }] }).f, { token: TOKEN, path: ADD, part: 1, bytes });
  assert.equal(r.error, 'SN_MEDIA_REFUSED');
  assert.equal(r.detail, 'snap INVALID_MEDIA');
});

test('a Story is posted with its media only, a Spotlight with its words and, when asked, its go-live time; neither is sent to a profile that is not a UUID', async () => {
  const { f, calls } = fakeSnap(happy());
  assert.deepEqual(await snPostStory(f, { token: TOKEN, profile: P, media: M }), { ok: true });
  assert.deepEqual(calls[0].body, { media_id: M }, 'the default 24 hours: no ttl, no link, no caption');
  assert.equal(calls[0].type, 'application/json');
  assert.deepEqual(await snPostSpotlight(f, { token: TOKEN, profile: P, media: M, description: 'تجربة', goLive: '2026-12-10T10:00:00Z' }), { spotlight: S });
  assert.deepEqual(calls[1].body, { media_id: M, locale: SN_LOCALE, description: 'تجربة', go_live_timestamp: '2026-12-10T10:00:00Z' });
  await snPostSpotlight(f, { token: TOKEN, profile: P, media: M, description: '' });
  assert.deepEqual(calls[2].body, { media_id: M, locale: SN_LOCALE }, 'no empty description, no schedule');
  assert.equal(SN_LOCALE, 'en_US', 'the one locale Snap\'s own example uses');
  const odd = await snPostSpotlight(fakeSnap({ 'POST /spotlights$': () => [200, { ...OK, spotlight_id: 'has spaces' }] }).f, { token: TOKEN, profile: P, media: M, description: '' });
  assert.equal(odd.error, 'PLATFORM_ERROR', 'a strange id is never kept');
  assert.equal((await snPostStory(f, { token: TOKEN, profile: 'x', media: M })).error, 'NOT_CONNECTED');
});

test('a Spotlight is read back in either envelope, a missing one is gone, and the list gives statuses and counts', async () => {
  const one = (spotlight) => fakeSnap({ 'GET /spotlights/': () => [200, { ...OK, spotlights: [{ sub_request_status: 'SUCCESS', spotlight }] }] }).f;
  assert.deepEqual(await snSpotlight(one({ id: S, status: 'LIVE', title: 'x' }), { token: TOKEN, profile: P, id: S }), { id: S, status: 'LIVE' });
  assert.deepEqual(await snSpotlight(fakeSnap({ 'GET /spotlights/': () => [200, { ...OK, spotlight: { id: S, status: 'weird status' } }] }).f, { token: TOKEN, profile: P, id: S }), { id: S, status: null }, 'a status that is not shaped like one is left out');
  assert.deepEqual(await snSpotlight(fakeSnap({ 'GET /spotlights/': () => [404, {}] }).f, { token: TOKEN, profile: P, id: S }), { gone: true });
  const list = fakeSnap({
    'GET /spotlights$': () => [
      200,
      { ...OK, spotlights: [{ spotlight: { id: S, status: 'LIVE' } }, { spotlight: { id: 'Zm9vYmFyYmF6', status: 'SUBMITTED' } }, { spotlight: { id: 'bad id' } }], paging: {} },
    ],
    'GET /stories$': () => [200, { ...OK, stories: [{}, {}, {}] }],
  });
  assert.deepEqual(await snSpotlights(list.f, { token: TOKEN, profile: P }), [{ id: S, status: 'LIVE' }, { id: 'Zm9vYmFyYmF6', status: 'SUBMITTED' }]);
  assert.equal(list.calls[0].query, '?limit=10');
  assert.deepEqual(await snStories(list.f, { token: TOKEN, profile: P }), { count: 3 });
  assert.equal((await snSpotlight(list.f, { token: TOKEN, profile: P, id: '../x' })).error, 'TEST_INVALID', 'an id with dots is never put in an address');
});

test('a delete is permanent and says when the post was already gone', async () => {
  const { f, calls } = fakeSnap(happy());
  assert.deepEqual(await snSpotlightDelete(f, { token: TOKEN, profile: P, id: S }), { gone: false });
  assert.equal(calls[0].method, 'DELETE');
  assert.deepEqual(await snSpotlightDelete(fakeSnap({ 'DELETE /spotlights/': () => [404, {}] }).f, { token: TOKEN, profile: P, id: S }), { gone: true });
  assert.equal((await snSpotlightDelete(fakeSnap({ 'DELETE /spotlights/': () => [403, { error_code: 'AUTHORIZATION_PERMISSION_DENIED' }] }).f, { token: TOKEN, profile: P, id: S })).error, 'ACCESS_NOT_GRANTED');
});

test('the profile is read with its subscriber count, and the numbers are Snap\'s own names summed day by day and nothing guessed', async () => {
  const me = fakeSnap({ 'GET /my_profile$': () => [200, { ...OK, public_profiles: [{ public_profile: { id: P, display_name: 'القسم', snap_user_name: 'dept', subscriber_count: '1520' } }] }] });
  assert.deepEqual(await snProfile(me.f, { token: TOKEN }), { id: P, name: 'القسم', username: 'dept', subscribers: 1520 });
  assert.deepEqual(await snProfile(fakeSnap({ 'GET /my_profile$': () => [200, { ...OK, public_profile: { id: P, display_name: 'ب' } }] }).f, { token: TOKEN }), { id: P, name: 'ب', username: null, subscribers: null }, 'no count, no number');
  assert.equal((await snProfile(fakeSnap({ 'GET /my_profile$': () => [404, {}] }).f, { token: TOKEN })).error, 'NO_PROFILE');
  const day = (name, values) => ({ field: { field_name: name, report_dimension: 'DEFAULT' }, stats: values.map((v) => ({ value: String(v) })) });
  const body = {
    ...OK,
    granularity: 'DAY',
    assets: [
      {
        asset_type: 'PROFILE',
        asset_id: P,
        timeseries: [
          { start_time: '2026-11-10T00:00:00Z', fields: [day('VIEWS', [20]), day('VIEWERS', [12]), day('SUBSCRIBERS', [300]), day('STORY_VIEWS', [5])] },
          { start_time: '2026-11-11T00:00:00Z', fields: [day('VIEWS', [30]), day('VIEWERS', [8]), day('SHARES', [2]), day('SCREENSHOTS', [1])] },
        ],
      },
    ],
  };
  assert.deepEqual(snStatsOf(body), { subscribers: 300, views: 50, viewers: 20, shares: 2, screenshots: 1 });
  assert.deepEqual(snStatsOf({ assets: [{ timeseries: [{ fields: [day('SPOTLIGHT_VIEWS', [9]), day('SPOTLIGHT_SHARES', [1])] }] }] }), { subscribers: null, views: 9, viewers: null, shares: 1, screenshots: null }, 'a Spotlight\'s own names stand in for the general ones');
  assert.equal(snStatsOf({ assets: [{ timeseries: [{ fields: [day('LENS_VIEWS', [3])] }] }] }), null, 'names this page does not show are not made into numbers');
  assert.equal(snStatsOf({ assets: [] }), null);
  const s = fakeSnap({ 'GET /stats$': () => [200, body], 'GET /spotlights/[^/]+/stats$': () => [200, { assets: [{ timeseries: [{ fields: [day('VIEWS', [4])] }] }] }] });
  assert.equal((await snStats(s.f, { token: TOKEN, profile: P })).views, 50);
  assert.equal(s.calls[0].path, `/v1/public_profiles/${P}/stats`);
  assert.equal((await snStats(s.f, { token: TOKEN, profile: P, spotlight: S })).views, 4);
  assert.equal(s.calls[1].path, `/v1/public_profiles/${P}/spotlights/${S}/stats`);
  const none = await snStats(fakeSnap({ 'GET /stats$': () => [200, { ...OK, assets: [] }] }).f, { token: TOKEN, profile: P });
  assert.equal(none.error, 'SN_STATS_UNAVAILABLE', 'Snap\'s numbers come about a day late: an empty answer is said so, not shown as zeros');
});

test('Snap\'s refusals become the site\'s codes, each with words, and only its code, request id and status ever follow them', () => {
  const rid = 'ecfe244d-0b1b-4787-9919-4ee7dd275a0a';
  const cases = [
    [403, 'AUTHORIZATION_PERMISSION_DENIED', 'ACCESS_NOT_GRANTED'],
    [401, '', 'TOKEN_REFUSED'],
    [429, '', 'RATE_LIMIT'],
    [500, '', 'PLATFORM_DOWN'],
    [400, 'VALIDATION_ERROR_INVALID_LINK', 'SN_POST_REFUSED'],
    [200, 'MEDIA_EXPIRED', 'SN_MEDIA_EXPIRED'],
    [418, '', 'PLATFORM_ERROR'],
  ];
  for (const [status, code, ours] of cases) {
    const a = { status, body: { request_id: rid, request_status: 'ERROR', error_code: code, debug_message: 'secret detail', display_message: 'words' } };
    assert.equal(snError(a), ours, `${status} ${code}`);
    assert.ok(TEST_ERROR_AR[ours] || connErrorAr(ours), `${ours} has words`);
    const detail = snDetail(a);
    assert.ok(detail === undefined || /^[A-Za-z0-9_.:~ -]{2,160}$/.test(detail), `${detail} is a short code line`);
    assert.ok(!/secret detail|words/.test(detail ?? ''), 'no message or body follows it');
    if (code) assert.ok(detail.includes(code) && detail.includes(rid), 'Snap\'s own code and request id are kept for whoever traces it');
  }
  assert.equal(snError(null), 'UNREACHABLE');
  assert.equal(snDetail(null), 'snap unreachable');
  assert.equal(snDetail({ status: 403, body: { error_code: 'bad code with spaces', request_id: 'x' } }), 'snap http 403', 'anything not shaped like a code is left out');
  for (const code of ['SN_NO_DELETE', 'SN_MEDIA_REFUSED', 'SN_MEDIA_EXPIRED', 'SN_UPLOAD_FAILED', 'SN_POST_REFUSED', 'SN_SILENT_MISMATCH', 'SN_SILENT_NOT_DELETED', 'SN_STATS_UNAVAILABLE', 'SN_TOO_BIG'])
    assert.ok(TEST_ERROR_AR[code] && !/[a-z]{6,}\(/.test(TEST_ERROR_AR[code]), `${code} has words`);
});

// ---------------------------------------------------------------------------
// The whole flow, against a fake Snap and a fake database
// ---------------------------------------------------------------------------
const VIDEO = Buffer.from('a short test video, as bytes: '.repeat(40));
const WHEN = '2026-12-10T10:00:30.000Z';
/** A fake database: remembers each function called, and answers as the real one does for a test of this account unless told otherwise. */
function fakeDb(answers = {}) {
  const calls = [];
  const rpc = async (name, args) => {
    calls.push({ name, args });
    const a = answers[name];
    if (a !== undefined) return typeof a === 'function' ? a(args) : a;
    return { data: name === 'platform_test_done' ? 'published' : null, error: null };
  };
  return { rpc, calls };
}
const deps = (snap, db, over = {}) => ({ f: snap.f, key: KEY, token: TOKEN, read: async () => VIDEO, rpc: db.rpc, now: () => Date.parse('2026-11-26T12:00:00Z'), ...over });
const test_ = (kind, over = {}) => ({ id: TEST_ID, kind, profile: P, title: 'وصف التجربة', scheduledFor: kind === 'snap_silent' ? WHEN : null, ...over });
const names = (calls) => calls.map((c) => `${c.method ?? c.name} ${c.path ?? ''}`.trim());

test('a Spotlight: the encrypted file is the one the media was created for, then it is posted, read back and recorded with its id and the profile', async () => {
  const snap = fakeSnap(happy({ [`GET /v1/public_profiles/${P}/spotlights/${S}$`]: () => [200, { ...OK, spotlights: [{ spotlight: { id: S, status: 'LIVE' } }] }] }));
  const db = fakeDb();
  const r = await snapSend(deps(snap, db), test_('snap_spotlight'));
  assert.deepEqual(r, { done: true, kind: 'snap_spotlight', post: S, status: 'LIVE' });
  assert.deepEqual(names(snap.calls), [
    `POST /v1/public_profiles/${P}/media`,
    `POST ${ADD}`,
    `POST ${ADD}`,
    `POST /v1/public_profiles/${P}/spotlights`,
    `GET /v1/public_profiles/${P}/spotlights/${S}`,
  ]);
  // What Snap received decrypts, with the key it was told, to the file.
  const create = snap.calls[0].body;
  const d = createDecipheriv('aes-256-cbc', Buffer.from(create.key, 'base64'), Buffer.from(create.iv, 'base64'));
  assert.deepEqual(Buffer.concat([d.update(snap.calls[1].body.file), d.final()]), VIDEO, 'one part, decrypting to the whole file');
  assert.equal(snap.calls[3].body.go_live_timestamp, undefined, 'a Spotlight now has no schedule');
  assert.equal(snap.calls[3].body.description, 'وصف التجربة');
  assert.deepEqual(db.calls.map((c) => c.name), ['platform_test_container', 'platform_test_done']);
  assert.equal(db.calls[0].args.p_container, M);
  assert.deepEqual(db.calls[1].args, { p_key: KEY, p_test: TEST_ID, p_video: S, p_channel: P, p_privacy: null, p_url: null });
  assert.ok(!JSON.stringify(r).includes(TOKEN) && !JSON.stringify(r).includes(create.key), 'the answer holds no token and no key');
});

test('a Story is recorded without an id, ends in 24 hours by itself, and nothing is read or deleted', async () => {
  const snap = fakeSnap(happy());
  const db = fakeDb();
  const r = await snapSend(deps(snap, db), test_('snap_story'));
  assert.deepEqual(r, { done: true, kind: 'snap_story', endsAt: new Date(Date.parse('2026-11-26T12:00:00Z') + SN_STORY_HOURS * 36e5).toISOString() });
  assert.equal(SN_STORY_HOURS, 24);
  assert.deepEqual(names(snap.calls).map((x) => x.split(' ')[0]), ['POST', 'POST', 'POST', 'POST']);
  assert.ok(snap.calls.at(-1).path.endsWith('/stories') && snap.calls.every((c) => c.method !== 'DELETE' && c.method !== 'GET'));
  assert.equal(db.calls.at(-1).name, 'platform_test_done');
  assert.equal(db.calls.at(-1).args.p_video, null, 'Snap gives a Story no id');
});

test('the silent check: a Spotlight scheduled for the stated time, read back, recorded, deleted, and the test marked deleted, in that order', async () => {
  const snap = fakeSnap(happy());
  const db = fakeDb();
  const r = await snapSend(deps(snap, db), test_('snap_silent'));
  assert.deepEqual(r, { done: true, kind: 'snap_silent', silent: true, deleted: true, post: S, status: 'SUBMITTED', at: '2026-12-10T10:00:30Z' });
  assert.equal(snap.calls[3].body.go_live_timestamp, '2026-12-10T10:00:30Z', 'RFC 3339, to the second');
  assert.deepEqual(names(snap.calls).slice(3), [`POST /v1/public_profiles/${P}/spotlights`, `GET /v1/public_profiles/${P}/spotlights/${S}`, `DELETE /v1/public_profiles/${P}/spotlights/${S}`]);
  assert.deepEqual(db.calls.map((c) => c.name), ['platform_test_container', 'platform_test_done', 'platform_test_deleted'], 'recorded as published before it is deleted');
  assert.equal(rfc3339(Date.parse('2026-12-10T10:00:30.123Z')), '2026-12-10T10:00:30Z');
});

test('the silent check\'s delete refused: it stays published, the answer says so, and the test is not marked deleted', async () => {
  const snap = fakeSnap(happy({ [`DELETE /spotlights/`]: () => [403, { error_code: 'AUTHORIZATION_PERMISSION_DENIED' }] }));
  const db = fakeDb();
  const r = await snapSend(deps(snap, db), test_('snap_silent'));
  assert.deepEqual(r, { done: true, kind: 'snap_silent', silent: true, deleted: false, error: 'SN_SILENT_NOT_DELETED', post: S, status: 'SUBMITTED', at: '2026-12-10T10:00:30Z' });
  assert.deepEqual(db.calls.map((c) => c.name), ['platform_test_container', 'platform_test_done']);
});

test('the silent check that reads back something else, or cannot read, does not count, takes the post away if it can, and records nothing', async () => {
  const other = fakeSnap(happy({ [`GET /spotlights/${S}$`]: () => [200, { ...OK, spotlights: [{ spotlight: { id: 'QUFBQUFBQUE', status: 'LIVE' } }] }] }));
  const db1 = fakeDb();
  assert.deepEqual(await snapSend(deps(other, db1), test_('snap_silent')), { fail: 'SN_SILENT_MISMATCH', detail: undefined });
  assert.ok(other.calls.some((c) => c.method === 'DELETE'), 'it is taken away');
  assert.ok(!db1.calls.some((c) => c.name === 'platform_test_done'), 'and never recorded');
  const gone = fakeSnap(happy({ [`GET /spotlights/${S}$`]: () => [404, {}] }));
  assert.equal((await snapSend(deps(gone, fakeDb()), test_('snap_silent'))).fail, 'SN_SILENT_MISMATCH');
  const refused = fakeSnap(happy({ [`GET /spotlights/${S}$`]: () => [403, { error_code: 'AUTHORIZATION_PERMISSION_DENIED', request_id: 'ecfe244d-0b1b-4787-9919-4ee7dd275a0a' }] }));
  const r = await snapSend(deps(refused, fakeDb()), test_('snap_silent'));
  assert.equal(r.fail, 'ACCESS_NOT_GRANTED');
  assert.match(r.detail, /^snap AUTHORIZATION_PERMISSION_DENIED req /);
  assert.ok(refused.calls.some((c) => c.method === 'DELETE'));
  // A silent test without its time is not sent.
  const noTime = fakeSnap(happy());
  assert.equal((await snapSend(deps(noTime, fakeDb()), test_('snap_silent', { scheduledFor: null }))).fail, 'TEST_INVALID');
  assert.ok(!noTime.calls.some((c) => c.path.endsWith('/spotlights')), 'no Spotlight was posted');
});

test('a file that cannot be read, a media Snap refuses, an upload it refuses and an app it has not allowed each stop the test with the right code and post nothing', async () => {
  const none = fakeSnap(happy());
  assert.deepEqual(await snapSend(deps(none, fakeDb(), { read: async () => null }), test_('snap_spotlight')), { fail: 'FILE_UNREADABLE' });
  assert.equal(none.calls.length, 0, 'nothing is asked of Snap without a file');
  const notAllowed = fakeSnap(happy({ [`POST /v1/public_profiles/${P}/media$`]: () => [403, { error_code: 'AUTHORIZATION_PERMISSION_DENIED' }] }));
  const r = await snapSend(deps(notAllowed, fakeDb()), test_('snap_spotlight'));
  assert.equal(r.fail, 'ACCESS_NOT_GRANTED');
  assert.equal(notAllowed.calls.length, 1);
  const badFile = fakeSnap(happy({ [`POST ${ADD}$`]: (c) => (c.body.action === 'FINALIZE' ? [400, { error_code: 'INVALID_MEDIA' }] : [200, OK]) }));
  const f = await snapSend(deps(badFile, fakeDb()), test_('snap_story'));
  assert.equal(f.fail, 'SN_MEDIA_REFUSED');
  assert.ok(!badFile.calls.some((c) => c.path.endsWith('/stories')), 'a refused file is never posted');
  const expired = fakeSnap(happy({ [`POST /v1/public_profiles/${P}/stories$`]: () => [400, { error_code: 'MEDIA_EXPIRED' }] }));
  assert.equal((await snapSend(deps(expired, fakeDb()), test_('snap_story'))).fail, 'SN_MEDIA_EXPIRED');
  const dbRefusal = fakeDb({ platform_test_container: { data: null, error: { message: 'FORBIDDEN' } } });
  assert.equal((await snapSend(deps(fakeSnap(happy()), dbRefusal), test_('snap_story'))).fail, 'PLATFORM_ERROR', 'a test the database would not keep is not uploaded further');
});

test('the database refusing the record (another profile, a closed test) is its refusal, and a Spotlight already posted is the only thing left behind', async () => {
  const snap = fakeSnap(happy());
  const wrong = fakeDb({ platform_test_done: { data: 'failed', error: null } });
  assert.deepEqual(await snapSend(deps(snap, wrong), test_('snap_spotlight')), { refuse: 'CHANNEL_MISMATCH' });
  const denied = fakeDb({ platform_test_done: { data: null, error: { message: 'FORBIDDEN' } } });
  assert.deepEqual(await snapSend(deps(fakeSnap(happy()), denied), test_('snap_spotlight')), { refuse: 'FORBIDDEN' });
  const undeleted = fakeDb({ platform_test_deleted: { data: null, error: { message: 'TEST_INVALID' } } });
  assert.deepEqual(await snapSend(deps(fakeSnap(happy()), undeleted), test_('snap_silent')), { refuse: 'TEST_INVALID' });
});

// ---------------------------------------------------------------------------
// The rules the page and the server share, held equal to the database's
// ---------------------------------------------------------------------------
test('the rules: one mp4 video of at most 30 MiB, a Spotlight\'s description at most 100 characters, the kinds and their words', () => {
  const v = { kind: 'snap_spotlight', size: 1000, mime: 'video/mp4', description: '' };
  assert.equal(snProblem(v), null);
  assert.equal(snProblem({ ...v, kind: 'snap_story' }), null);
  assert.equal(snProblem({ ...v, kind: 'snap_silent' }), null);
  assert.equal(snProblem({ ...v, kind: 'snap_check' }), 'بيانات التجربة ناقصة أو غير صالحة.', 'the check has no file and no rule here');
  assert.match(snProblem({ ...v, mime: 'video/quicktime' }), /MP4/);
  assert.match(snProblem({ ...v, mime: 'image/jpeg' }), /MP4/);
  assert.match(snProblem({ ...v, size: 0 }), /فارغ/);
  assert.equal(snProblem({ ...v, size: SN_VIDEO_MAX }), null);
  assert.equal(snProblem({ ...v, size: SN_VIDEO_MAX + 1 }), TEST_ERROR_AR.SN_TOO_BIG);
  assert.match(snProblem({ ...v, seconds: 4 }), /5 ثوانٍ/);
  assert.match(snProblem({ ...v, seconds: 301 }), /5 دقائق/);
  assert.equal(snProblem({ ...v, seconds: 5 }), null);
  assert.equal(snProblem({ ...v, seconds: 300 }), null);
  assert.equal(snProblem({ ...v, description: 'ا'.repeat(SN_DESCRIPTION_MAX) }), null);
  assert.match(snProblem({ ...v, description: 'ا'.repeat(SN_DESCRIPTION_MAX + 1) }), /100/);
  assert.match(snProblem({ ...v, description: 'a<b' }), /</);
  assert.equal(snProblem({ ...v, kind: 'snap_story', description: 'x'.repeat(500) }), null, 'only a Spotlight carries a description');
  assert.equal(snTitle('snap_silent', 'ignored'), SN_SILENT_TITLE);
  assert.equal(snTitle('snap_story', 'ignored'), SN_STORY_TITLE);
  assert.equal(snTitle('snap_spotlight', '\n <سطر> أول\nثانٍ'), 'سطر أول');
  assert.equal(snTitle('snap_spotlight', ''), 'تجربة سبوتلايت من مركز الاتصال');
  assert.ok([...snTitle('snap_spotlight', 'ب'.repeat(300))].length <= 100, 'the table\'s title limit');
  assert.deepEqual(SN_KIND, { silent: 'snap_silent', spotlight: 'snap_spotlight', story: 'snap_story' });
  assert.ok(Object.values(SN_KIND).every((k) => isSnKind(k) && SN_KIND_AR[k]) && !isSnKind('snap_check') && !isSnKind('tt_post'));
  assert.equal(SN_VIDEO_TYPE, 'video/mp4');
  assert.deepEqual(SN_SECONDS, [5, 300]);
  assert.ok(SN_SILENT_DAYS > 0 && SN_SILENT_DAYS < 30, 'ahead of now and within the 30 days Snap allows');
  assert.match(SN_STATS_NOTE, /يوم/);
  assert.match(SN_STATS_NOTE, /90/);
});

test('the limits are the database\'s: the same size, the same kinds, the same schedule window, and a Story with no id', () => {
  assert.equal(SN_VIDEO_MAX, 31457280);
  assert.ok(MIGRATION.includes('31457280'), 'the migration holds the same size limit');
  for (const k of Object.values(SN_KIND)) assert.ok(MIGRATION.includes(`'${k}'`), `${k} is in the migration`);
  assert.ok(MIGRATION.includes("'video/mp4'"));
  assert.match(MIGRATION, /snapchat/);
  assert.match(MIGRATION, /snap_story/, 'a published Story may have no id');
  // The server's own schedule (14 days) is inside the database's window (1 hour to 29 days).
  assert.match(MIGRATION, /1 hour/);
  assert.match(MIGRATION, /29 days/);
  assert.ok(SN_SILENT_DAYS * 24 > 1 && SN_SILENT_DAYS < 29);
});

test('the sources hold the safety rules: no log, no token or key in an answer, the file never reaches the page, no address followed from Snap\'s answers', () => {
  for (const [name, src] of [['snapchat.ts', API], ['snapchat-flow.ts', FLOW], ['test-snapchat.ts', SERVER]]) {
    assert.ok(!/console\.(log|error|warn|info|debug)/.test(src), `${name} logs nothing`);
  }
  assert.ok(!/localStorage|sessionStorage/.test(PANEL));
  // The key is worked out, never stored or returned.
  assert.ok(!/\.from\('platform_tests'\)\s*\.(insert|update)/.test(SERVER), 'the server writes only through the database\'s functions');
  assert.ok(!/json\(\{[^}]*(token|key|iv)\b/.test(SERVER + FLOW), 'no answer carries a token or a key');
  // The only address a request goes to is Snap\'s fixed one plus a path that matched the upload pattern.
  assert.match(API, /const API = 'https:\/\/businessapi\.snapchat\.com'/);
  assert.match(API, /UPLOAD_PATH = \/\^\\\/\[a-z0-9\/_-\]\{1,200\}\\\/multipart-upload\$\//);
  assert.ok(!/fetch\(\s*(add|finalize|r\.body)/.test(API), 'a path Snap names is not used as an address');
  // The page never holds Snap's upload parts, the media key, a token or Snap\'s address.
  assert.ok(!/businessapi\.snapchat\.com|multipart-upload|aes-256|snKeys|snEncrypt|Authorization/.test(PANEL), 'the page does none of Snap\'s work');
  assert.ok(!/MAIL_SERVER_KEY/.test(PANEL));
  // Every Snap write is a database function and the server key proves it.
  for (const fn of ['platform_test_start', 'platform_test_container', 'platform_test_done', 'platform_test_deleted']) assert.ok((SERVER + FLOW).includes(fn), fn);
  assert.ok(/serverKeyOrNull\(\)/.test(SERVER));
});

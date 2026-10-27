// Push notices, the server half (Android_Build_Plan.md A5, MVP_draft.md 64.3). The database half is
// supabase/tests/push_rules.sql; the sender against a local FCM stub is qa/push-flush.cjs. Keys used
// here are made in this run and never written anywhere; no real device or Firebase project is used.
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { createVerify, generateKeyPairSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  appChannel,
  buildMessage,
  CHANNELS,
  CLAIM_KEYS,
  DATA_KEYS,
  GO_RE,
  HIDDEN_NOTICE,
  messageLine,
  NEW_MESSAGE,
  noticeLine,
  BODY_MAX,
} from '../src/lib/push/payload.ts';
import { classify, compactServiceAccount, FCM_SCOPE, fetchAccessToken, GOOGLE, parseServiceAccount, sendUrl, signJwt, tokenCache } from '../src/lib/push/fcm.ts';
import { flushPush } from '../src/lib/push/flush.ts';
import { pushTarget } from '../src/lib/push/target.ts';
import { deviceErrorText, deviceLine, prefsOf } from '../src/lib/push/devices.ts';
import { HOLD } from '../src/lib/kit/hold-reasons.ts';

const read = (f) => readFileSync(f, 'utf8');
const sql = read('supabase/migrations/20261027120000_push.sql');
const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const TOKEN = `tok_${'a'.repeat(40)}`;
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const PEM = privateKey.export({ type: 'pkcs8', format: 'pem' });
const SA_JSON = JSON.stringify({
  type: 'service_account',
  project_id: 'comms-hub-test',
  private_key_id: 'ab'.repeat(20),
  private_key: PEM,
  client_email: 'push@comms-hub-test.iam.gserviceaccount.com',
  client_id: '1234567890',
  token_uri: 'https://evil.example/token',
});
const item = (over = {}) => ({
  id: U(1),
  token: TOKEN,
  kind: 'notice',
  tier: 'decide',
  notice: U(9),
  title: 'يحتاج قرارك',
  body: 'اعتمد المنشور «حملة الخريف».',
  go: `/n/notice/${U(9)}`,
  tag: `notice:${U(9)}:decide`,
  ...over,
});
const chat = (over = {}) => item({ kind: 'chat', tier: 'attention', notice: null, title: 'المراسلة', body: 'رسالة جديدة من Dir', go: `/n/chat/${U(5)}`, tag: `chat:${U(5)}:attention`, ...over });

// ---------------------------------------------------------------------------------------------
// The payload rules
// ---------------------------------------------------------------------------------------------
test('a notice: a data-only message with its text, the tier as title, the destination and the notice id', () => {
  const m = buildMessage(item());
  assert.deepEqual(m, {
    token: TOKEN,
    data: { v: '1', kind: 'notice', id: U(9), tier: 'decide', go: `/n/notice/${U(9)}`, tag: `notice:${U(9)}:decide`, title: 'يحتاج قرارك', body: 'اعتمد المنشور «حملة الخريف».' },
    android: { priority: 'HIGH', ttl: '86400s' },
  });
  assert.equal('notification' in m, false, 'no notification block: Firebase never shows it or starts the application itself');
  assert.equal('notification' in m.android, false);
  assert.deepEqual(Object.keys(m.data).sort(), [...DATA_KEYS]);
  for (const v of Object.values(m.data)) assert.equal(typeof v, 'string', 'FCM data values are strings');
  assert.ok(Buffer.byteLength(JSON.stringify(buildMessage(item({ body: 'ن'.repeat(500) })))) < 4096, 'under the 4096-byte FCM limit even at the longest body');
});

test('attention is normal priority; the application\'s three channels, chosen by kind and tier', () => {
  const m = buildMessage(item({ tier: 'attention', tag: `notice:${U(9)}:attention` }));
  assert.equal(m.data.title, 'يحتاج انتباهك');
  assert.equal(m.android.priority, 'NORMAL');
  assert.deepEqual(CHANNELS, {
    decide: { id: 'decide', name: 'يحتاج قرارك', sound: true, importance: 'high' },
    attention: { id: 'attention', name: 'للانتباه', sound: false, importance: 'low' },
    messages: { id: 'messages', name: 'الرسائل', sound: true, importance: 'default' },
  });
  assert.equal(appChannel('notice', 'decide'), 'decide');
  assert.equal(appChannel('notice', 'attention'), 'attention');
  assert.equal(appChannel('chat', 'decide'), 'messages');
  assert.equal(appChannel('mail', 'decide'), 'messages');
  assert.equal(appChannel('chat', 'attention'), 'messages');
});

test('messaging and mail never carry their text: only «رسالة جديدة من …» or «رسالة جديدة»', () => {
  assert.equal(buildMessage(chat()).data.body, 'رسالة جديدة من Dir');
  assert.equal(buildMessage(chat()).data.title, 'المراسلة');
  assert.equal(buildMessage(chat({ body: 'سرّي: موعد الحملة غداً' })).data.body, NEW_MESSAGE, 'a body that is not the fixed line is replaced');
  assert.equal(buildMessage(chat({ body: 'رسالة جديدة من someone@x.test' })).data.body, NEW_MESSAGE, 'an address is not a name');
  assert.equal(buildMessage(chat({ body: 'رسالة جديدة من https://x.test/a?b=1' })).data.body, NEW_MESSAGE);
  assert.equal(buildMessage(chat({ body: 'رسالة جديدة' })).data.body, NEW_MESSAGE);
  const mail = buildMessage(chat({ kind: 'mail', tier: 'decide', go: `/n/mail/${U(6)}`, tag: `mail:${U(6)}:decide` }));
  assert.equal(mail.data.title, 'البريد');
  assert.equal(mail.data.id, '', 'only a notice names a notice');
  assert.equal(messageLine(`رسالة جديدة من ${'ن'.repeat(81)}`), NEW_MESSAGE, 'a name longer than 80 is not a name');
});

test('a hidden notice and a notice with a link show the fixed line; a long one is clipped', () => {
  assert.equal(buildMessage(item({ body: HIDDEN_NOTICE })).data.body, HIDDEN_NOTICE);
  assert.equal(noticeLine('افتح https://hub.example/x?token=1'), HIDDEN_NOTICE);
  assert.equal(noticeLine('  سطر\nثانٍ  '), 'سطر ثانٍ');
  const long = noticeLine('ن'.repeat(500));
  assert.equal(long.length, BODY_MAX);
  assert.ok(long.endsWith('…'));
});

test('a destination is a path inside the site with no query string, or the item is refused', () => {
  for (const go of [`/n/notice/${U(9)}?x=1`, `/n/notice/${U(9)}#a`, `https://hub.example/n/notice/${U(9)}`, `//evil.example/n/notice/${U(9)}`, '/mail/chat?room=1', `/n/notice/${U(8)}`, `/n/chat/${U(9)}`])
    assert.equal(buildMessage(item({ go })), null, go);
  assert.ok(GO_RE.test(`/n/mail/${U(1)}`));
  assert.equal(GO_RE.test(`/n/mail/${U(1)}?a`), false);
});

test('a bad token, tier, kind, id or tag refuses the item', () => {
  for (const over of [{ token: 'short' }, { token: `${TOKEN} x` }, { tier: 'info' }, { kind: 'whatsapp' }, { id: 'x' }, { tag: `notice:${U(9)}:attention` }, { notice: U(8) }])
    assert.equal(buildMessage(item(over)), null, JSON.stringify(over));
});

test('the claim keys are the ones push_claim builds, no more', () => {
  const claim = sql.slice(sql.indexOf('create function public.push_claim'), sql.indexOf('create function public.push_report'));
  const built = claim.slice(claim.indexOf('jsonb_build_object('));
  const keys = [...built.matchAll(/^\s+'([a-z]+)', /gm)].map((m) => m[1]).sort();
  assert.deepEqual(keys, [...CLAIM_KEYS].sort());
});

// ---------------------------------------------------------------------------------------------
// The service account and the JWT
// ---------------------------------------------------------------------------------------------
test('the service account: only a Firebase service-account file with an RSA key; only four fields are kept', () => {
  const sa = parseServiceAccount(SA_JSON);
  assert.equal(sa.project_id, 'comms-hub-test');
  const kept = JSON.parse(compactServiceAccount(sa));
  assert.deepEqual(Object.keys(kept).sort(), ['client_email', 'private_key', 'private_key_id', 'project_id', 'type']);
  assert.equal(kept.token_uri, undefined, 'a token address from the file is never kept or used');
  const ec = generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey.export({ type: 'pkcs8', format: 'pem' });
  for (const bad of ['', 'not json', JSON.stringify({ type: 'authorized_user' }), JSON.stringify({ ...JSON.parse(SA_JSON), project_id: 'X' }), JSON.stringify({ ...JSON.parse(SA_JSON), private_key: ec }), JSON.stringify({ ...JSON.parse(SA_JSON), private_key: 'x PRIVATE KEY----- y' })])
    assert.equal(parseServiceAccount(bad), null, bad.slice(0, 40));
});

test('the JWT is RS256, signed by the service account, for the messaging scope, an hour at most', () => {
  const sa = parseServiceAccount(SA_JSON);
  const jwt = signJwt(sa, 1_800_000_000);
  const [h, c, s] = jwt.split('.');
  assert.deepEqual(JSON.parse(Buffer.from(h, 'base64url')), { alg: 'RS256', typ: 'JWT', kid: 'ab'.repeat(20) });
  assert.deepEqual(JSON.parse(Buffer.from(c, 'base64url')), { iss: sa.client_email, scope: FCM_SCOPE, aud: GOOGLE.token, iat: 1_800_000_000, exp: 1_800_003_600 });
  assert.ok(createVerify('RSA-SHA256').update(`${h}.${c}`).verify(publicKey, Buffer.from(s, 'base64url')), 'the signature verifies with the public key');
  assert.equal(GOOGLE.token, 'https://oauth2.googleapis.com/token');
  assert.equal(sendUrl('comms-hub-test'), 'https://fcm.googleapis.com/v1/projects/comms-hub-test/messages:send');
});

test('the access token is asked for once and kept 55 minutes; the vault is read only then', async () => {
  let asked = 0;
  let loaded = 0;
  const f = async (url, init) => {
    asked++;
    assert.equal(url, GOOGLE.token);
    const p = new URLSearchParams(init.body);
    assert.equal(p.get('grant_type'), 'urn:ietf:params:oauth:grant-type:jwt-bearer');
    assert.equal(p.get('assertion').split('.').length, 3);
    return new Response(JSON.stringify({ access_token: 'ya29.test', expires_in: 3599 }), { status: 200 });
  };
  const cache = tokenCache();
  const load = async () => (loaded++, SA_JSON);
  const t0 = 1_800_000_000_000;
  assert.deepEqual(await cache.get(load, { fetch: f, nowMs: t0 }), { ok: true, token: 'ya29.test', until: t0 + 55 * 60_000, projectId: 'comms-hub-test' });
  await cache.get(load, { fetch: f, nowMs: t0 + 54 * 60_000 });
  assert.equal(asked, 1);
  assert.equal(loaded, 1);
  await cache.get(load, { fetch: f, nowMs: t0 + 56 * 60_000 });
  assert.equal(asked, 2);
  cache.forget();
  await cache.get(load, { fetch: f, nowMs: t0 + 57 * 60_000 });
  assert.equal(asked, 3);
  assert.deepEqual(await tokenCache().get(async () => null), { ok: false, error: 'NOT_CONFIGURED' });
  const refused = await fetchAccessToken(parseServiceAccount(SA_JSON), { fetch: async () => new Response('{"error":"invalid_grant"}', { status: 400 }) });
  assert.deepEqual(refused, { ok: false, error: 'TOKEN_REFUSED' });
  assert.deepEqual(await fetchAccessToken(parseServiceAccount(SA_JSON), { fetch: async () => { throw new Error('offline'); } }), { ok: false, error: 'TOKEN_UNREACHABLE' });
});

test('a provider refusal becomes one code (FCM v1 errors)', () => {
  const fcm = (status, errorCode, extra = {}) => ({ error: { status, details: [{ '@type': 'type.googleapis.com/google.firebase.fcm.v1.FcmError', errorCode }], ...extra } });
  assert.equal(classify(404, fcm('NOT_FOUND', 'UNREGISTERED')), 'TOKEN_GONE');
  assert.equal(classify(403, fcm('PERMISSION_DENIED', 'SENDER_ID_MISMATCH')), 'TOKEN_GONE');
  assert.equal(classify(400, { error: { status: 'INVALID_ARGUMENT', details: [{ '@type': 'type.googleapis.com/google.rpc.BadRequest', fieldViolations: [{ field: 'message.token' }] }] } }), 'TOKEN_GONE');
  assert.equal(classify(400, fcm('INVALID_ARGUMENT', 'INVALID_ARGUMENT')), 'REFUSED', 'a bad message does not cost a token');
  assert.equal(classify(401, null), 'AUTH');
  assert.equal(classify(429, fcm('RESOURCE_EXHAUSTED', 'QUOTA_EXCEEDED')), 'RETRY');
  assert.equal(classify(503, null), 'RETRY');
  assert.equal(classify(500, null), 'RETRY');
  assert.equal(classify(418, null), 'FAILED');
});

// ---------------------------------------------------------------------------------------------
// One flush, against fakes of the database and of Google
// ---------------------------------------------------------------------------------------------
function fakeDb(claims, begin = { go: true }) {
  const calls = [];
  const rpc = async (fn, args) => {
    calls.push({ fn, args });
    if (fn === 'push_flush_begin') return begin === 'refused' ? { data: null, error: { message: 'FORBIDDEN' } } : { data: begin, error: null };
    if (fn === 'push_claim') return { data: claims.shift() ?? [], error: null };
    return { data: fn === 'push_report' ? args.p.length : null, error: null };
  };
  return { rpc, calls };
}
const google = (answers = {}) => {
  const sent = [];
  const f = async (url, init) => {
    if (url === GOOGLE.token) return new Response(JSON.stringify({ access_token: 'ya29.flush', expires_in: 3600 }), { status: 200 });
    const body = JSON.parse(init.body);
    sent.push({ url, auth: init.headers.Authorization, message: body.message });
    const a = answers[body.message.token];
    if (a) return new Response(JSON.stringify(a.body ?? {}), { status: a.status });
    return new Response(JSON.stringify({ name: 'projects/comms-hub-test/messages/1' }), { status: 200 });
  };
  return { f, sent };
};

test('nothing waits: the flush answers at once, claims nothing and never reads the credential', async () => {
  const db = fakeDb([], { go: false, why: 'empty' });
  let read = 0;
  const r = await flushPush({ rpc: db.rpc, key: 'k', credential: async () => (read++, SA_JSON), cache: tokenCache() });
  assert.equal(r.state, 'empty');
  assert.deepEqual(db.calls.map((c) => c.fn), ['push_flush_begin']);
  assert.equal(read, 0);
  assert.equal((await flushPush({ rpc: fakeDb([], { go: false, why: 'busy' }).rpc, key: 'k', credential: async () => SA_JSON })).state, 'busy');
  assert.equal((await flushPush({ rpc: fakeDb([], 'refused').rpc, key: 'k', credential: async () => SA_JSON })).state, 'refused');
});

test('no credential yet, or one Google refuses: nothing is claimed, so the rows wait', async () => {
  const db = fakeDb([[item()]]);
  const r = await flushPush({ rpc: db.rpc, key: 'k', credential: async () => null, cache: tokenCache() });
  assert.equal(r.state, 'not-configured');
  assert.deepEqual(db.calls.map((c) => c.fn), ['push_flush_begin', 'push_flush_end']);
  const db2 = fakeDb([[item()]]);
  const health = [];
  const r2 = await flushPush({
    rpc: db2.rpc, key: 'k', credential: async () => SA_JSON, cache: tokenCache(),
    fetch: async () => new Response('{}', { status: 400 }),
    health: async (ok, e) => void health.push([ok, e]),
  });
  assert.equal(r2.state, 'credential');
  assert.deepEqual(db2.calls.map((c) => c.fn), ['push_flush_begin', 'push_flush_end']);
  assert.deepEqual(health, [[false, 'TOKEN_REFUSED']]);
});

test('a flush sends each claimed item once, reports each by code, and gives the turn back', async () => {
  const gone = `tok_${'g'.repeat(40)}`;
  const busy = `tok_${'b'.repeat(40)}`;
  const items = [item(), chat({ id: U(2), token: gone }), chat({ id: U(3), token: busy, body: 'سرّي جداً' }), item({ id: U(4), go: `/n/notice/${U(9)}?x=1` })];
  const db = fakeDb([items, []]);
  const g = google({ [gone]: { status: 404, body: { error: { status: 'NOT_FOUND', details: [{ errorCode: 'UNREGISTERED' }] } } }, [busy]: { status: 503 } });
  const health = [];
  const r = await flushPush({ rpc: db.rpc, key: 'k-server', credential: async () => SA_JSON, cache: tokenCache(), fetch: g.f, health: async (ok, e) => void health.push([ok, e]) });
  assert.deepEqual(r, { state: 'done', sent: 1, failed: 1, retry: 1, gone: 1, rounds: 1 });
  assert.equal(g.sent.length, 3, 'the item with a query string never left');
  assert.ok(g.sent.every((s) => s.url === sendUrl('comms-hub-test') && s.auth === 'Bearer ya29.flush'));
  assert.ok(g.sent.every((s) => !JSON.stringify(s.message).includes('سرّي')), 'no message text reached Google');
  const report = db.calls.find((c) => c.fn === 'push_report').args;
  assert.equal(report.p_key, 'k-server');
  assert.deepEqual(report.p, [
    { id: U(1), ok: true },
    { id: U(2), ok: false, error: 'TOKEN_GONE' },
    { id: U(3), ok: false, error: 'RETRY' },
    { id: U(4), ok: false, error: 'BAD_PAYLOAD' },
  ]);
  assert.deepEqual(db.calls.map((c) => c.fn), ['push_flush_begin', 'push_claim', 'push_report', 'push_flush_end'], 'a row sent back to wait ends the flush');
  assert.ok(db.calls.every((c) => c.args.p_key === 'k-server'));
  assert.deepEqual(health, [[true, null]]);
});

test('Google refusing the access token sends the rows back to wait and asks for a new token', async () => {
  let tokens = 0;
  const f = async (url) => {
    if (url === GOOGLE.token) return (tokens++, new Response(JSON.stringify({ access_token: `ya29.${tokens}`, expires_in: 3600 }), { status: 200 }));
    return new Response('{}', { status: 401 });
  };
  const cache = tokenCache();
  const db = fakeDb([[item()]]);
  const r = await flushPush({ rpc: db.rpc, key: 'k', credential: async () => SA_JSON, cache, fetch: f });
  assert.equal(r.retry, 1);
  assert.deepEqual(db.calls.find((c) => c.fn === 'push_report').args.p, [{ id: U(1), ok: false, error: 'RETRY' }]);
  await cache.get(async () => SA_JSON, { fetch: f });
  assert.equal(tokens, 2, 'the refused token was forgotten');
});

test('more than one batch: claimed again while rows wait, five rounds at most', async () => {
  const batches = Array.from({ length: 7 }, (_, i) => [item({ id: U(100 + i) })]);
  const db = fakeDb(batches);
  const g = google();
  const r = await flushPush({ rpc: db.rpc, key: 'k', credential: async () => SA_JSON, cache: tokenCache(), fetch: g.f });
  assert.equal(r.rounds, 5);
  assert.equal(r.sent, 5);
  assert.equal(db.calls.filter((c) => c.fn === 'push_claim').length, 5);
});

// ---------------------------------------------------------------------------------------------
// Where a tap leads; «أجهزتي»
// ---------------------------------------------------------------------------------------------
test('a tapped notice opens its page: a notice by id, a conversation, a thread; anything else is refused', () => {
  assert.deepEqual(pushTarget('notice', U(1)), { kind: 'notice', id: U(1) });
  assert.deepEqual(pushTarget('chat', U(2)), { kind: 'chat', id: U(2), to: `/mail/chat?room=${U(2)}` });
  assert.deepEqual(pushTarget('mail', U(3).toUpperCase()), { kind: 'mail', id: U(3), to: `/mail?thread=${U(3)}` });
  for (const [k, id] of [['notice', 'x'], ['work', U(1)], ['chat', `${U(1)}/../a`], ['mail', '']]) assert.equal(pushTarget(k, id), null, `${k} ${id}`);
  const route = read('src/app/n/[kind]/[id]/route.ts');
  assert.match(route, /from\('notifications'\)\.select\('go'\)\.eq\('id', t\.id\)/, 'a notice is read through the person\'s own session');
  assert.match(route, /noticeHref/);
  assert.doesNotMatch(route, /export async function POST|\.update\(|\.rpc\(/, 'opening changes nothing');
});

test('«أجهزتي»: the words for a device, a refusal and the settings', () => {
  const now = Date.parse('2026-10-27T12:00:00Z');
  assert.equal(deviceLine({ platform: 'android', version: '1.0.2', seen_at: '2026-10-27T09:00:00Z' }, now), 'Android · الإصدار 1.0.2 · آخر فتح اليوم');
  assert.equal(deviceLine({ platform: 'android', version: '1.0.2', seen_at: '2026-10-26T09:00:00Z' }, now), 'Android · الإصدار 1.0.2 · آخر فتح أمس');
  assert.equal(deviceErrorText('DEVICE_NOT_FOUND'), 'لم يعد هذا الجهاز في قائمتك. حدّث الصفحة.');
  assert.equal(deviceErrorText('something else'), 'تعذّر الحفظ. أعد المحاولة.');
  assert.deepEqual(prefsOf([]), { attention: true, hide_text: false, mixed: false });
  assert.deepEqual(prefsOf([{ attention: true, hide_text: false }, { attention: false, hide_text: false }]), { attention: false, hide_text: false, mixed: true });
  const ui = read('src/components/native/devices.tsx');
  assert.match(ui, /from\('my_devices'\)/, 'the list is the view without the token');
  assert.doesNotMatch(ui, /fcm_token|from\('devices'\)/);
  assert.match(ui, /data-hold=\{HOLD\.deviceRemove\}/);
  assert.match(HOLD.deviceRemove, /تتوقف تنبيهات هذا الجهاز فوراً/);
  const account = read('src/components/supporting.tsx');
  assert.match(account, /signOut\(\{ scope: 'local' \}\)/, '«تسجيل الخروج» is this device only');
  assert.match(account, /signOut\(\{ scope: 'others' \}\)/, '«الخروج من الأجهزة الأخرى»');
  assert.match(account, /signOut\(\{ scope: 'global' \}\)/, '«الخروج من كل الأجهزة» stays');
  assert.match(account, /<MyDevicesPanels \/>/);
});

// ---------------------------------------------------------------------------------------------
// The starters and the rules of the migration
// ---------------------------------------------------------------------------------------------
test('S-1: one debounced flush after a burst of writes, one more try when the turn is busy', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  const answers = ['busy', 'done'];
  const seen = [];
  globalThis.window = {};
  globalThis.fetch = async (url, init) => (seen.push([url, init.method, init.body]), new Response(JSON.stringify({ state: answers.shift() ?? 'empty' }), { status: 200 }));
  try {
    const { kickPush, KICK_DELAY_MS, BUSY_RETRY_MS } = await import('../src/lib/push/kick.ts');
    kickPush();
    kickPush();
    kickPush();
    mock.timers.tick(KICK_DELAY_MS);
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));
    assert.deepEqual(seen, [['/api/push/flush', 'POST', undefined]], 'three writes, one request, no body');
    mock.timers.tick(BUSY_RETRY_MS);
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));
    assert.equal(seen.length, 2, 'the busy turn is tried once more');
    mock.timers.tick(BUSY_RETRY_MS * 3);
    await new Promise((r) => setImmediate(r));
    assert.equal(seen.length, 2, 'and then it stops');
  } finally {
    mock.timers.reset();
    delete globalThis.window;
  }
  for (const f of ['src/components/work/data.tsx', 'src/components/chat/provider.tsx', 'src/components/mail/provider.tsx', 'src/components/accounts/data.tsx', 'src/components/perm-requests.tsx'])
    assert.match(read(f), /kickPush\(\)/, f);
});

test('the flush route: the bridge key or a signed-in page from this site, the server key for the database, POST only', () => {
  const route = read('src/app/api/push/flush/route.ts');
  assert.match(route, /sameKey\(given, env\.key\)/);
  assert.match(route, /guard\(request, \{ mutating: true \}\)/);
  assert.doesNotMatch(route, /export async function GET/);
  const server = read('src/lib/push/server.ts');
  assert.match(server, /serverKeyOrNull\(\)/);
  assert.match(server, /vaultSecret\(FCM_TYPE, 'push send'\)/);
  const cred = read('src/app/api/push/credential/route.ts');
  assert.match(cred, /storeChecked\(db, slot\.data, FCM_TYPE/);
  assert.match(cred, /fetchAccessToken\(again\)/, 'Google is asked before the credential is kept');
  assert.doesNotMatch(cred + route + server, /console\.(log|error|warn)/, 'nothing is logged');
});

test('the migration: definer functions with an empty search path, nothing scheduled, ids only, the right grants', () => {
  const fns = [...sql.matchAll(/create function public\.([a-z_]+)\(/g)].map((m) => m[1]);
  assert.deepEqual(fns.sort(), ['device_prefs', 'device_register', 'device_remove', 'device_rename', 'device_seen', 'push_claim', 'push_fcm_slot', 'push_flush_begin', 'push_flush_end', 'push_on_notice', 'push_report', 'push_route_chat', 'push_route_mail'].sort());
  const heads = [...sql.matchAll(/create function public\.[a-z_]+\([^)]*\) returns [^\n]+\n([^\n]+)/g)].map((m) => m[1]);
  assert.ok(heads.length === fns.length && heads.every((h) => /security definer set search_path = ''/.test(h)), 'every function is security definer with an empty search path');
  assert.doesNotMatch(sql, /pg_net|net\.http|cron\.|pg_cron|http_post/i, 'no database-started call, nothing scheduled');
  assert.doesNotMatch(sql, /service_role/);
  const outbox = sql.slice(sql.indexOf('create table public.push_outbox'), sql.indexOf('create index push_outbox_queue_idx'));
  assert.doesNotMatch(outbox, /\b(body|text|title|token|go)\b text/, 'the outbox holds ids, never text');
  assert.match(sql, /revoke all on public\.devices from public, anon, authenticated;/);
  assert.match(sql, /grant select \(id, email, platform, version, name, channel, push_ready, tiers, hide_text, created_at, seen_at, token_at, removed_at\)\s+on public\.devices to authenticated;/);
  assert.match(sql, /revoke all on function public\.push_on_notice\(\), public\.push_route_chat\(uuid\), public\.push_route_mail\(uuid\)\s+from public, anon, authenticated;/);
  assert.match(sql, /grant execute on function public\.push_flush_begin\(text\), public\.push_flush_end\(text\), public\.push_claim\(text, int\),\s+public\.push_report\(text, jsonb\) to anon, authenticated;/);
  assert.match(sql, /perform public\.wa_route\(mid\);\\n  perform public\.push_route_chat\(mid\);/, 'the chat hook comes after the WhatsApp route');
  assert.match(sql, /perform public\.push_route_mail\(mid\);\\n' \|\| hook/, 'the mail hook comes just before mail_send answers');
});

test('no emoji in anything push adds', () => {
  for (const f of ['src/lib/push/payload.ts', 'src/lib/push/fcm.ts', 'src/lib/push/flush.ts', 'src/lib/push/devices.ts', 'src/lib/push/kick.ts', 'src/lib/push/target.ts', 'src/lib/push/server.ts', 'src/components/native/devices.tsx', 'src/components/settings/push.tsx', 'supabase/migrations/20261027120000_push.sql', 'supabase/tests/push_rules.sql'])
    assert.doesNotMatch(read(f), /\p{Extended_Pictographic}/u, f);
});
